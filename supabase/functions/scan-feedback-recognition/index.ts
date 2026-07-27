import { serve } from "https://deno.land/std@0.190.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Role-based trigger phrases mapping
const ROLE_PHRASES: Record<string, string[]> = {
  host: ['host', 'our host', 'your host', 'the host', 'hosts'],
  cohost: ['co-host', 'co host', 'cohost', 'co-hosts'],
  cleaner: ['cleaner', 'the cleaner', 'whoever cleaned', 'cleaning', 'cleaned', 'maid', 'housecleaning'],
  property_manager: ['property manager', 'the manager', 'our manager', 'management', 'property management'],
  maintenance: ['maintenance', 'handyman', 'repair', 'fixing'],
  front_desk: ['front desk', 'reception', 'the receptionist', 'desk staff'],
  housekeeping: ['housekeeping', 'housekeeper', 'room service'],
  concierge: ['concierge', 'bellhop', 'doorman'],
  other: []
}

function extractSentenceContaining(text: string, phrase: string): string {
  const sentences = text.split(/(?<=[.!?])\s+/)
  const lowerPhrase = phrase.toLowerCase()
  for (const s of sentences) {
    if (s.toLowerCase().includes(lowerPhrase)) {
      return s.trim()
    }
  }
  return text.substring(0, 200) // fallback
}

async function classifySentiment(sentence: string, openAiKey: string): Promise<boolean> {
  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openAiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [{
          role: 'system',
          content: 'Does this sentence express clear, unambiguous positive sentiment about the named person or role? Answer only yes or no.'
        }, {
          role: 'user',
          content: sentence
        }],
        max_tokens: 3,
        temperature: 0
      })
    })
    if (!response.ok) {
      console.error("[scan-feedback-recognition] OpenAI error:", await response.text())
      return false
    }
    const data = await response.json()
    const answer = data.choices?.[0]?.message?.content?.trim().toLowerCase()
    return answer === 'yes'
  } catch (err) {
    console.error("[scan-feedback-recognition] AI call failed:", err)
    return false
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    const { feedback_id } = await req.json()
    if (!feedback_id) {
      return new Response(JSON.stringify({ error: "Missing feedback_id" }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Fetch the private feedback
    const { data: fb, error: fbError } = await supabase
      .from('private_feedback')
      .select('id, feedback_text, guest_name, guest_email, location_id, created_at')
      .eq('id', feedback_id)
      .maybeSingle()

    if (fbError || !fb) {
      console.error("[scan-feedback-recognition] Feedback not found:", fbError)
      return new Response(JSON.stringify({ error: "Feedback not found" }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const feedbackText = fb.feedback_text
    if (!feedbackText || feedbackText.trim().length === 0) {
      return new Response(JSON.stringify({ success: true, message: "No text to scan" }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Determine account from location
    let accountId: string | null = null
    if (fb.location_id) {
      const { data: loc } = await supabase
        .from('locations')
        .select('account_id')
        .eq('id', fb.location_id)
        .maybeSingle()
      if (loc) accountId = loc.account_id
    }
    if (!accountId) {
      return new Response(JSON.stringify({ error: "Cannot determine account" }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Fetch team members for account
    const { data: teamMembers, error: tmError } = await supabase
      .from('team_members')
      .select('*')
      .eq('account_id', accountId)

    if (tmError) {
      console.error("[scan-feedback-recognition] Error fetching team members:", tmError)
    }

    const candidates: Array<{
      type: 'name' | 'role',
      team_member_id?: string,
      matched_role?: string,
      matched_sentence: string,
      matched_phrase: string
    }> = []

    // 1. Name matching
    if (teamMembers && teamMembers.length > 0) {
      for (const member of teamMembers) {
        if (!member.name) continue
        if (feedbackText.toLowerCase().includes(member.name.toLowerCase())) {
          const sentence = extractSentenceContaining(feedbackText, member.name)
          candidates.push({
            type: 'name',
            team_member_id: member.id,
            matched_sentence: sentence,
            matched_phrase: member.name
          })
        }
      }
    }

    // 2. Role-based phrase matching
    const teamListEmpty = !teamMembers || teamMembers.length === 0
    const feedbackLower = feedbackText.toLowerCase()
    
    for (const [role, phrases] of Object.entries(ROLE_PHRASES)) {
      for (const phrase of phrases) {
        if (feedbackLower.includes(phrase)) {
          if (teamListEmpty) {
            candidates.push({
              type: 'role',
              matched_role: 'Unassigned role mention',
              matched_sentence: extractSentenceContaining(feedbackText, phrase),
              matched_phrase: phrase
            })
            break
          } else {
            const matchingMember = teamMembers.find((m: any) => m.role === role)
            if (matchingMember) {
              candidates.push({
                type: 'role',
                team_member_id: matchingMember.id,
                matched_role: role,
                matched_sentence: extractSentenceContaining(feedbackText, phrase),
                matched_phrase: phrase
              })
            }
            break
          }
        }
      }
    }

    // Deduplicate candidates
    const seenSentences = new Set<string>()
    const uniqueCandidates = candidates.filter(c => {
      const key = c.matched_sentence
      if (seenSentences.has(key)) return false
      seenSentences.add(key)
      return true
    })

    if (uniqueCandidates.length === 0) {
      console.log("[scan-feedback-recognition] No team mentions found in feedback")
      return new Response(JSON.stringify({ success: true, message: "No mentions found" }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const openAiKey = Deno.env.get('OPENAI_API_KEY')
    if (!openAiKey) {
      console.warn("[scan-feedback-recognition] OPENAI_API_KEY not set, skipping sentiment classification")
      return new Response(JSON.stringify({ success: true, message: "No AI key configured" }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Classify each candidate
    let insertedCount = 0
    for (const cand of uniqueCandidates) {
      const isPositive = await classifySentiment(cand.matched_sentence, openAiKey)
      if (!isPositive) {
        console.log("[scan-feedback-recognition] Rejecting non-positive sentence (length: " + cand.matched_sentence.length + ")")
        continue
      }

      const insertData: any = {
        account_id: accountId,
        matched_sentence: cand.matched_sentence,
        source: 'private_feedback',
        guest_name: fb.guest_name || null,
        created_at: new Date().toISOString()
      }
      if (cand.type === 'name' && cand.team_member_id) {
        insertData.team_member_id = cand.team_member_id
        insertData.matched_role = null
      } else {
        insertData.team_member_id = null
        insertData.matched_role = cand.matched_role
      }

      const { error: insertError } = await supabase
        .from('recognition_records')
        .insert(insertData)

      if (insertError) {
        console.error("[scan-feedback-recognition] Insert error:", insertError)
      } else {
        insertedCount++
      }
    }

    console.log(`[scan-feedback-recognition] Successfully processed ${insertedCount} recognitions`)

    return new Response(JSON.stringify({ success: true, inserted: insertedCount }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })

  } catch (error: any) {
    console.error("[scan-feedback-recognition] Unexpected error:", error)
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    })
  }
})