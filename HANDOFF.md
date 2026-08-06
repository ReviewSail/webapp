# ReviewSail — Project Handoff

## 1. Project Overview

**ReviewSail** is an automated guest feedback and review-acceleration engine for hospitality businesses (hotels, vacation rentals, etc.). It captures private guest feedback before it reaches public review sites like Google Maps, and routes happy guests to leave public reviews.

---

## 2. Tech Stack

| Layer | Technology |
|---|---|
| Language | TypeScript |
| UI Library | React 18 |
| Build Tool | Vite 5 |
| Styling | Tailwind CSS 3 + shadcn/ui variables |
| Icons | Lucide React |
| CSS Utility | clsx + tailwind-merge (`cn()`) |
| Routing | React Router v6 (all routes in `src/App.tsx`) |
| Remote data | TanStack Query v5 (every Supabase read; defaults in `src/lib/queryClient.ts`) |
| Package manager | pnpm via Corepack (`corepack pnpm …` — `npm install` breaks the layout) |
| Charts | Recharts |
| Date/Time | date-fns |
| CSV | papaparse |
| Auth | Supabase Auth (`@supabase/auth-ui-react`) |
| Database | Supabase (PostgreSQL) |
| Edge Functions | Supabase Edge Functions (Deno) |
| Email Provider | Resend (v1 API) |
| SMS Provider | Twilio (optional) |
| AI | OpenAI (GPT-4o-mini) |

---

## 3. Project Structure (Key Files)

```
src/
├── App.tsx                    # Entry point, routes, providers
├── main.tsx                   # React root
├── index.css                  # Tailwind + CSS variables
├── lib/
│   ├── utils.ts               # cn() helper
│   ├── roles.ts               # UserRole type and helpers
│   ├── queryClient.ts         # TanStack Query defaults (staleTime/gcTime)
│   └── pagedFetch.ts          # fetchAllPages() — .range() paging for list reads
├── test/
│   └── queryWrapper.tsx       # QueryClientProvider wrapper for component tests
├── integrations/supabase/
│   └── client.ts              # Supabase client singleton
├── context/
│   ├── AuthContext.tsx         # Auth state (session, user, role)
│   └── ReviewSailContext.tsx   # Per-table useQuery reads + all CRUD operations
├── types/
│   └── reviewSail.ts          # DigestSetting type
├── pages/
│   ├── Login.tsx              # Auth UI (Supabase Auth)
│   ├── Dashboard.tsx          # Main dashboard with tabs
│   ├── Analytics.tsx          # KPI line chart, recent activity
│   ├── SyncGuests.tsx         # Manual add + CSV upload
│   ├── Guests.tsx             # Guest list with status/actions
│   ├── Settings.tsx           # Locations, templates, digest, billing, account
│   ├── Feedback.tsx           # Public feedback form (request_id)
│   ├── FeedbackGate.tsx       # Star rating gate + private feedback flow
│   ├── AlreadyReviewed.tsx    # Self-suppression page
│   ├── ResetPassword.tsx      # Password recovery
│   ├── Unsubscribe.tsx        # Opt-out page
│   └── ReviewReply.tsx        # AI-generated Google review replies
├── components/
│   ├── Layout.tsx             # Sidebar + header + outlet
│   ├── Sidebar.tsx            # Navigation
│   └── dashboard/
│       ├── StatsGrid.tsx
│       ├── RecentRequestsTable.tsx
│       ├── PrivateFeedbackSection.tsx
│       ├── PrivateFeedbackInbox.tsx
│       ├── GuestDetailPanel.tsx
│       ├── TrialBanner.tsx
│       ├── OnboardingWizard.tsx
│       └── TeamRecognitionCard.tsx
supabase/functions/
├── process-reviews/index.ts         # Hourly cron: send invites & reminders & mid-stay
├── create-checkout-session/index.ts # Stripe checkout (or mock)
├── stripe-webhook/index.ts          # Stripe webhook handler
├── delete-account/index.ts          # Full account deletion
├── invite-team-member/index.ts      # Send team invite email
├── generate-review-reply/index.ts   # AI reply draft (OpenAI)
├── scan-feedback-recognition/index.ts # AI recognition extraction (OpenAI)
├── weekly-summary/index.ts          # Email digest generation
└── setup-db/index.ts                # One-time db schema setup
```

---

## 4. Database Schema (Public Tables)

### `accounts`
- `id` UUID PK (uuid_generate_v4)
- `name` TEXT NOT NULL
- `created_at` TIMESTAMPTZ DEFAULT NOW()
- `resend_api_key`, `resend_from_email`, `twilio_account_sid`, `twilio_auth_token`, `twilio_from_number` TEXT nullable
- `stripe_customer_id` TEXT nullable
- `subscription_status` TEXT DEFAULT 'inactive'

### `locations`
- `id` UUID PK
- `account_id` UUID FK → accounts
- `name`, `google_place_url`, `timezone`
- `enable_email`, `enable_sms`, `midstay_enabled` BOOLEAN
- `onboarding_complete` BOOLEAN
- `preferred_send_hour` INTEGER
- `midstay_day` INTEGER DEFAULT 2, CHECK 2–7 (day of the stay the mid-stay check-in goes out on; day 1 is the arrival day)
- `recovery_email` TEXT

### `users` (public)
- `id` UUID PK (references auth.users)
- `account_id` UUID FK → accounts
- `role` TEXT DEFAULT 'admin' (admin | staff)
- `email`, `full_name` TEXT
- `created_at` TIMESTAMPTZ

### `customers`
- `id` UUID PK
- `account_id` UUID FK
- `first_name`, `last_name`, `email`, `phone`

### `orders`
- `id` UUID PK
- `location_id` UUID FK
- `customer_id` UUID FK
- `checkout_date` TIMESTAMPTZ
- `checkin_date` TIMESTAMPTZ nullable
- `status` TEXT DEFAULT 'completed'
- `midstay_sent` BOOLEAN DEFAULT false
- `midstay_sent_at` TIMESTAMPTZ nullable

### `review_requests`
- `id` UUID PK
- `order_id` UUID FK
- `status` TEXT (pending|sent|clicked|opted_out|expired|already_reviewed|private_feedback)
- `sent_at` TIMESTAMPTZ nullable

### `feedback`
- `id` UUID PK
- `request_id` UUID FK
- `rating` INTEGER (1–5)
- `comment`, `manager_response` TEXT
- `created_at` TIMESTAMPTZ

### `private_feedback`
- `id` UUID PK
- `request_id`, `location_id` UUID nullable
- `star_rating` INTEGER nullable
- `feedback_text`, `guest_name`, `guest_email`, `manager_response` TEXT
- `is_read` BOOLEAN DEFAULT false
- `created_at` TIMESTAMPTZ

### `message_events`
- `id` UUID PK
- `request_id` UUID FK
- `event_type` TEXT (sent|clicked|reminder_sent|midstay_checkin|already_reviewed)
- `created_at` TIMESTAMPTZ

### `opt_outs`
- `id` UUID PK
- `email`, `phone` TEXT nullable
- `opt_out_date` TIMESTAMPTZ DEFAULT NOW()

### `message_templates`
- `id` UUID PK
- `location_id` UUID FK
- `type` TEXT (email|sms)
- `template_text` TEXT
- `created_at` TIMESTAMPTZ

### `team_members`
- `id` UUID PK
- `account_id` UUID FK
- `name`, `role` TEXT
- `created_at` TIMESTAMPTZ

### `recognition_records`
- `id` UUID PK
- `account_id` UUID FK
- `team_member_id` UUID nullable FK → team_members
- `matched_role`, `matched_sentence`, `guest_name`, `source` TEXT
- `created_at` TIMESTAMPTZ

### `digest_settings`
- `id` UUID PK
- `user_id` UUID FK → auth.users
- `account_id` UUID FK → accounts
- `frequency` TEXT (weekly|monthly)
- `enabled` BOOLEAN
- `created_at`, `updated_at` TIMESTAMPTZ

---

## 5. RLS & Security

- All tables have RLS enabled.
- `anon` roles have **minimum grants**: only insert/update on `feedback`, `private_feedback`, `opt_outs`, and `message_events`.
- `authenticated` roles have full CRUD on business tables, scoped to their account via `get_current_account_id()`.
- `service_role` has full CRUD for edge functions.
- Anon can read `review_requests` (for status check) and update only specific statuses (`clicked`, `already_reviewed`).
- Admins can manage `accounts`, `locations`, `users`, `team_members`; staff cannot access Settings.
- `revoke_anon.sql` migrations have removed excessive anon grants.

---

## 6. Key Edge Functions

| Function | Trigger | Purpose |
|---|---|---|
| `process-reviews` | Cron (hourly) or manual | Sends pending invites, 3-day reminders, and mid-stay check-ins based on preferred send hour, opt-out list, and expiry logic. |
| `create-checkout-session` | User clicks "Upgrade" | Creates Stripe checkout session (or returns mock success URL) |
| `stripe-webhook` | Stripe webhook | Updates account subscription status on checkout completion or cancellation |
| `delete-account` | User confirms delete | Deletes account + all cascade data + auth user |
| `invite-team-member` | Admin invites staff | Sends invite email with `invite_account_id` in URL |
| `generate-review-reply` | User clicks "Generate" | Calls OpenAI to draft a Google review reply based on review text, topic, tone, hotel name, and template guidance |
| `scan-feedback-recognition` | DB trigger on `private_feedback` insert | Scans feedback text for positive mentions of team members/roles; records `recognition_records` |
| `weekly-summary` | Cron (weekly, monthly) | Emails admin users with aggregated metrics per property over the period |
| `setup-db` | Manual | Runs one-time schema migrations (columns, tables, cron jobs) |

---

## 7. Public-Facing Flows

### FeedbackGate (`/feedback-gate?request_id=xxx`)
- Shows star rating selector (1–5).
- If rating >= 4 (happy): redirects to Google Maps URL or shows thank-you.
- If rating <= 3 (unhappy): shows private feedback form.
- After submission, shows thank-you + optional recovery section:
  1. Direct email link (`mailto:{recoveryEmail}`).
  2. Inline message form that inserts into `private_feedback` with `star_rating = null`.
- If `request_id=demo`, shows preview mode with hardcoded data.

### Feedback (`/feedback?request_id=xxx`)
- Direct public feedback page (legacy; mostly superceded by FeedbackGate).
- Submits to `feedback` table.

### Already Reviewed (`/already-reviewed?request_id=xxx`)
- Sets `review_requests.status = 'already_reviewed'` and logs message event.

### Unsubscribe (`/unsubscribe?email=xxx`, also `/opt-out`)
- Inserts into `opt_outs` table.

### Reset Password (`/reset-password`)
- Uses Supabase recovery token from URL hash (`type=recovery` + `access_token`).
- Allows password update via `supabase.auth.updateUser`.

---

## 8. Known Bugs & Pending Issues

### 1. CSV Column Mapping Fragility
**File:** `src/pages/SyncGuests.tsx` (Papa parse callback)
- The key cleaning logic (`cleanKey`) normalizes column names but the mapping from those keys to fields (`firstName`, `lastName`, `email`, `phone`, `checkoutDate`, `checkinDate`) is incomplete/inconsistent. The code was cut off mid-write and needs careful review.
- **Impact:** CSV import may silently fail or produce rows with missing data.
- **Fix needed:** Ensure all required columns are mapped correctly; add validation and user-friendly error messages for each row.

### 2. Private Feedback "PrivateFeedback" Branding Mismatch
- In `PrivateFeedbackInbox.tsx`, the `starRating` field from `private_feedback` is displayed but the context merges `feedback` and `private_feedback` tables. Some records may have `rating` = 0 when `star_rating` is null.
- **Impact:** Unhappy guests who submitted via recovery form (no star rating) show "0 stars" on the feedback inbox.
- **Fix needed:** Distinguish between feedback with no rating (show "Recovery Message") vs actual star rating.

### 3. Edge Function Permission Gaps
- `process-reviews` uses `service_role` key for all ops, but anon access to `review_requests` for status update is currently allowed via RLS. However, some customers have reported `permission denied for table private_feedback` when anonymous guests try to submit the recovery form.
- **Impact:** Guests may see an error after submission.
- **Workaround:** Ensure `private_feedback` has explicit `GRANT INSERT ON TABLE private_feedback TO anon;` (already in migrations). Double-check the RLS policy for `private_feedback` allows anon inserts with no `WITH CHECK` restriction.

### 4. Digest Email "reviews@maprated.com" Default
- The `weekly-summary` function hardcodes `resendFromEmail` as `reviews@maprated.com`. This domain may not be verified in Resend.
- **Impact:** Digest emails may not be sent or may land in spam.
- **Fix:** Use the account-level `resend_from_email` from the `accounts` table instead of hardcoded default, or set a verified domain.

### 5. Mid-Stay Check-in Window Logic — RESOLVED (migration `0022_midstay_day.sql`)
- The "inverted logic" recorded here was a misreading: `checkinDate < twentyFiveHoursAgo || checkinDate > twentyThreeHoursAgo` *skips* rows outside the 23–25h band, which was the intent.
- The real defect was that a 24-hour offset from `checkin_date` is meaningless. Both writers store a date only (`yyyy-MM-dd`), which Postgres reads as midnight UTC, so "24h after check-in" resolved to 01:00 UTC the next day — 6pm in Los Angeles, 9am in Berlin, 3am in Auckland. Unlike Phase 1, Phase 3 had no local-time gating at all, so some properties were texting guests overnight.
- **Fixed by:** a per-location `midstay_day` (day of stay, day 1 = arrival) sent at the location's existing `preferred_send_hour` in its own timezone, matching how Hospitable/Guesty express in-stay automations. The candidate query is now bounded on `checkin_date` and limited, and `orders_midstay_pending_idx` backs it.

### 6. FeedbackGate Demo Mode Inconsistent
- When `request_id=demo`, the flow works but does not simulate the recovery email submission (the `recoveryEmail` is hardcoded to 'recovery@grandhotel.com' but is not validated against a real location).
- **Impact:** Demo cannot fully test recovery flow.
- **Fix:** Add better demo data generation or use a sandbox account.

### 7. Settings Page — Digest Tab Update
- The digest settings update in `Settings.tsx` calls `updateDigestSetting(frequency, enabled)` which updates the database but does not refresh the local state immediately. The user may see stale values after toggling.
- **Impact:** Minor UX issue; digest toggle may not visually reflect change until page refresh.
- **Fix:** Call `refreshData()` after `updateDigestSetting` or update local state in the callback.

### 8. ReviewReplies — Template Guidance Hardcoded
- The `templateGuidance` in `ReviewReply.tsx` constructs a string from `TEMPLATES[topic]` which includes both email and SMS guidance. This is passed to the edge function but the function's system prompt always uses it as a string. The edge function does not distinguish between email and SMS contexts.
- **Impact:** Generated drafts may conflate tone or length expectations.
- **Fix:** Allow the user to select output format (email vs SMS) and pass only relevant guidance.

### 9. Error Handling in Edge Functions
- Several edge functions (e.g., `process-reviews`, `weekly-summary`) have broad try/catch blocks that return a 500 with `error.message`. This leaks internal implementation details to the client (if the client calls the function directly). For functions called by cron or webhook, this is acceptable, but for user-triggered functions (`create-checkout-session`, `delete-account`, `invite-team-member`), the error should be sanitized.
- **Impact:** Potential information leakage.
- **Fix:** Return generic error messages to the client; log full error server-side.

---

## 9. Configuration Requirements

### Environment Variables (Supabase Secrets)
| Secret | Purpose |
|---|---|
| `RESEND_API_KEY` | Sending emails |
| `RESEND_FROM_EMAIL` | Default sender email |
| `TWILIO_ACCOUNT_SID` | Twilio auth |
| `TWILIO_AUTH_TOKEN` | Twilio auth |
| `TWILIO_FROM_NUMBER` | Twilio sender number |
| `STRIPE_SECRET_KEY` | Stripe payment |
| `OPENAI_API_KEY` | AI completions (review replies + recognition) |
| `SUPABASE_URL` | Auto-set by Supabase |
| `SUPABASE_ANON_KEY` | Auto-set |
| `SUPABASE_SERVICE_ROLE_KEY` | Auto-set |
| `SUPABASE_DB_URL` | Auto-set (only for `setup-db`) |

### Resend Verified Domain
- The `resend_from_email` address must be from a verified domain in Resend.
- Current default: `reviews@maprated.com` — **not verified**, needs to be updated.

### Stripe Webhook Endpoint
- Endpoint URL: `https://vqjzscdlfhgzzqhmkchw.supabase.co/functions/v1/stripe-webhook`
- Events: `checkout.session.completed`, `customer.subscription.deleted`

### Cron Jobs (via pg_cron)
- `invoke-process-reviews` — hourly at minute 0
- `invoke-weekly-summary` — weekly on Monday at 8:00 UTC

---

## 10. Deployment Notes

- **Install:** `corepack pnpm install` — required after any pull that changes
  `package.json`. `npm install` crashes on the pnpm-shaped `node_modules`.
- **Build:** `corepack pnpm build` (TypeScript + Vite)
- **Preview:** `corepack pnpm preview`
- **Dev:** `corepack pnpm dev` (Vite dev server)
- **Edge functions do NOT deploy automatically.** This section used to say they
  did; they don't, and a repo whose `supabase/functions/` differs from what is
  live is the normal state here. Deploy explicitly and verify against prod:

  ```bash
  supabase functions deploy <name> --project-ref vqjzscdlfhgzzqhmkchw
  ```

- Pushes do not trigger Vercel builds either — the Vercel GitHub App is not
  installed on the org, so deploys go through `vercel deploy` from the CLI.
  `.vercelignore` excludes `node_modules`, so Vercel installs from
  `pnpm-lock.yaml`; a new dependency is only picked up if the lockfile is
  committed alongside `package.json`.

---

## 10a. Data Layer & Egress

Every Supabase read goes through TanStack Query. The rules are in
`AI_RULES.md`; this is what the code looks like and why.

**Reads.** `ReviewSailContext` runs one `useQuery` per table, each keyed
`['reviewsail', <table>, userId]`, each selecting a named column list from the
`COLUMNS` map, each paged through `fetchAllPages()`. They are combined into the
same context shape the app has always consumed, so pages did not change.

**Writes.** A mutation invalidates only the tables it touched
(`invalidate('orders')`). Where the write already returns the new row —
`updateDigestSetting`, both feedback writes — the cache is patched directly and
no read is issued. This replaced a single `refreshData()` that re-read eight
tables in full and was called by all thirteen mutations.

**What this changes for you in development:**

| | Behaviour |
|---|---|
| Freshness | Data is cached 5 minutes. Change a row in the SQL editor and the UI catches up on the next page visit past that window, or immediately on reload. |
| Window focus | No longer refetches. Alt-tabbing back will not refresh the dashboard; reload if you need it now. |
| Role changes | `AuthContext` reads your role once per signed-in user, not on every token refresh. Change your own role in the DB and you must reload. |
| Large seeds | Past 2,000 rows in one table, `fetchAllPages` stops and logs a `[egress]` warning. Loud, not silent — but Analytics will be short. |
| Tests | Existing suites mock `useReviewSail` and are unaffected. A test that renders the real tree needs `src/test/queryWrapper.tsx`, or it throws "No QueryClient set". |

**The known limit.** Analytics joins orders to customers in the browser and
offers an all-time range, and Guests searches the full customer list
client-side. That is why the paged reads have a ceiling rather than a real
pager: a literal first-page-only read would make the numbers quietly wrong
instead of visibly broken. The fix is server-side rollups (an RPC or a
materialised view) — see §11.

**Context.** As of 2026-08-06 this project's entire `public` schema is under
1 MB — the largest table held 18 rows — so none of the above is currently
saving meaningful bytes. It is prevention: every one of these reads scales
with the guest list, and the shape that was replaced (whole tables, re-read
after every write) gets expensive at the first real customer, not gradually.

If you are chasing an egress bill, measure before you optimise. `calls` from
`pg_stat_statements` tells you which query is actually hot, and
`pg_column_size()` tells you what its rows weigh. Neither is inferable from
reading the code.

---

## 11. Next Steps / Future Improvements

1. **Refactor CSV importer** to use a wizard with column preview and mapping.
2. **Add multi-language support** for the feedback gate (guest-facing pages).
3. **Add SMS templates** distinct from email templates (currently only email template used for SMS).
4. ~~**Improve mid-stay window logic** with configurable delay (not hardcoded 24h).~~ Done — `locations.midstay_day` + local send hour. Remaining follow-ups: move the hardcoded mid-stay copy into `message_templates`, set `reply_to` on the mid-stay email (it says "just reply" but nothing listens), and make the dashboard's "Mid-Stay Pending" badge read the configured day instead of its own 24h math.
5. ~~**Add team member management UI**~~ — done. Settings → Team. Backed by a real
   `invitations` table with tokens and expiry (migration `0027`), an admin check on
   `invite-team-member`, and the `accept_invitation()` RPC. The old
   `?invite_account_id=` URL-parameter join was removed.
6. ~~**Add subscription management UI**~~ — done. Settings → Billing, with cancel /
   payment method / invoices handled by the Stripe Customer Portal via
   `create-portal-session`. **One-time setup still required:** enable the portal at
   https://dashboard.stripe.com/settings/billing/portal.
7. **Add automated testing** for edge functions (Deno test suite).
8. **Migrate from pg_cron** to Supabase's native scheduled functions if available.
9. **Add rate limiting** on public endpoints (feedback, opt-out) to prevent abuse.
10. **Consolidate `feedback` and `private_feedback`** into a single table with proper RLS.
11. **Move the dashboard rollups into Postgres.** Analytics, Guests and the
    Dashboard all aggregate over full tables in the browser, which is what
    forces `fetchAllPages` to carry a 2,000-row ceiling instead of a real
    pager. An RPC returning per-period counts (and a server-side guest search)
    would let every list read stop at page one and would lift the ceiling. This
    is the remaining structural item from the egress work — see §10a.