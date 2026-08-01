import { serve } from "https://deno.land/std@0.190.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: authHeader } }
    })

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Parse request body
    const { reviewText, topic, tone, hotelName, templateGuidance } = await req.json()

    if (!reviewText || !topic || !tone) {
      return new Response(JSON.stringify({ error: 'Missing required fields: reviewText, topic, tone' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const aiApiKey = Deno.env.get('OPENAI_API_KEY')
    if (!aiApiKey) {
      return new Response(JSON.stringify({ error: 'AI API key not configured. Please set OPENAI_API_KEY in Supabase secrets.' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const TONE_INSTRUCTIONS: Record<string, string> = {
      warm: 'Write the reply in a warm and personal tone, making the guest feel valued.',
      professional: 'Write the reply in a professional and formal tone, maintaining business etiquette.',
      concise: 'Write the reply concisely, using short sentences and keeping to the point.',
    }
    const toneInstruction = TONE_INSTRUCTIONS[tone] || 'Write the reply in a warm and professional tone.'

    const templateBlurb = templateGuidance
      ? `Use this as a structural guide: "${templateGuidance}"`
      : ''

    const systemPrompt = `You are a helpful assistant that drafts review replies for hotels. 
The hotel name is: "${hotelName || 'Our Hotel'}".

The review topic is: "${topic}".
The chosen tone: "${toneInstruction}".

${templateBlurb}

Important safety rules:
- Keep the reply short, between 50 and 120 words.
- Do not invent facts not mentioned in the review.
- Do not mention refunds, discounts, or compensation.
- Do not include any private guest information.
- For negative reviews, apologize appropriately and suggest offline follow-up when relevant (e.g., "We'd love to discuss this further—please contact us directly.").
- Do not sound promotional or salesy.
- The reply should be in plain text, no markdown.`

    const userMessage = `Here is the review text:\n\n"${reviewText}"\n\nPlease generate a reply following the rules above.`

    // Call OpenAI API
    const openAiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${aiApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage }
        ],
        max_tokens: 300,
        temperature: 0.7,
      })
    })

    if (!openAiResponse.ok) {
      const errorText = await openAiResponse.text()
      console.error('[generate-review-reply] OpenAI API error:', errorText)
      return new Response(JSON.stringify({ error: 'Failed to generate draft. Please try again.' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const aiData = await openAiResponse.json()
    const draft = aiData.choices?.[0]?.message?.content?.trim() || ''

    return new Response(JSON.stringify({ draft }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })

  } catch (error: any) {
    console.error('[generate-review-reply] Unexpected error:', error)
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    })
  }
})