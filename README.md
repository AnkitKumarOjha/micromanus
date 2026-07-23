# MicroManus

A deep-research AI agent web app: sign in with Google/GitHub, unlock with a coupon or a
$5 test-mode card payment, bring your own LLM key (Claude / OpenAI / Kimi), and chat with an
agent that runs a real **think → search → read → conclude** loop over the live web, keeps
per-thread context, and produces downloadable PDF reports. A stats page shows token usage
(input / output / cache) and USD cost per chat and per run on your own key.

- **Framework:** Next.js 14 (App Router, TypeScript) → deploy on Vercel
- **Auth + DB + Storage:** Supabase (Postgres, OAuth, Storage)
- **Payments:** DodoPayments (test mode)
- **Web search:** Brave Search API · **Page reading:** server-side fetch + Cheerio extraction
- **LLM SDKs:** `@anthropic-ai/sdk` (Anthropic), `openai` (OpenAI + Kimi/Moonshot + custom)
- **PDF:** `@react-pdf/renderer` (pure JS, serverless-safe)

> **Design decision (from the brief):** "Credits" and "cost/stats" are **two different things**.
> **Credits** meter platform access — **1 credit = 1 user message that triggers an agent run**
> (new threads and viewing history are free). At 0 credits, agent runs are blocked and the paywall
> re-appears with a top-up option. The **stats dashboard** is informational analytics on the
> user's *own* API-key spend (tokens + $ per model), completely decoupled from the credit balance.

---

## 1. Prerequisites

- Node 18.18+ (Node 20/22 recommended), npm
- Accounts: **Supabase**, **DodoPayments** (test mode), **Brave Search**, **Google Cloud** +
  **GitHub** (OAuth apps), **Vercel**

```bash
npm install
cp .env.example .env.local   # then fill in the values below
```

Generate the encryption key:

```bash
openssl rand -base64 32       # paste into ENCRYPTION_KEY
```

---

## 2. Supabase setup

1. Create a project at [supabase.com](https://supabase.com). Note **Project URL** and the
   **anon** and **service_role** keys (Project Settings → API):
   - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
2. **Run the migrations** (SQL Editor → paste and run, in order):
   - `supabase/migrations/0001_init.sql` — tables, RLS, the new-user trigger, and the
     `model_pricing` seed.
   - `supabase/migrations/0002_storage.sql` — creates the private `reports` storage bucket.
3. **Enable OAuth providers** (Authentication → Providers):
   - **Google** and **GitHub** — toggle on, paste each provider's Client ID/Secret (from step 3
     of the OAuth sections below).
4. **URL configuration** (Authentication → URL Configuration):
   - **Site URL:** your app URL (`http://localhost:3000` for dev, `https://<app>.vercel.app` for
     prod).
   - **Redirect URLs (allow list):** add both
     `http://localhost:3000/auth/callback` and `https://<app>.vercel.app/auth/callback`.

### Google OAuth app

1. [Google Cloud Console](https://console.cloud.google.com) → APIs & Services → Credentials →
   **Create Credentials → OAuth client ID → Web application**.
2. **Authorized redirect URI** — this is **Supabase's** callback, not the app's:
   `https://<project-ref>.supabase.co/auth/v1/callback`
3. Copy the Client ID + Secret into Supabase → Providers → Google.

### GitHub OAuth app

1. GitHub → Settings → Developer settings → **OAuth Apps → New OAuth App**.
2. **Authorization callback URL:** `https://<project-ref>.supabase.co/auth/v1/callback`
3. Copy the Client ID + generate a Client Secret; paste both into Supabase → Providers → GitHub.

> The app calls `signInWithOAuth({ redirectTo: <SITE_URL>/auth/callback })`. The provider
> redirects to **Supabase**, which then redirects to our `/auth/callback` route that exchanges the
> code for a session. That's why the provider apps use the Supabase callback URL while the Supabase
> allow-list uses our `/auth/callback` URL.

---

## 3. DodoPayments setup (test mode)

1. Create an account and switch to **Test mode**.
2. Create a **one-time-payment product** priced at **$5 USD**. Copy its `product_id` →
   `DODO_PRODUCT_ID_5_CREDITS`.
3. Settings → API → copy the API key → `DODO_PAYMENTS_API_KEY`. Keep `DODO_PAYMENTS_ENVIRONMENT=test_mode`.
4. Settings → Webhooks → **Add endpoint**: `https://<app>.vercel.app/api/webhooks/dodo`
   (for local testing use a tunnel, e.g. `ngrok`, pointing at `/api/webhooks/dodo`). Subscribe to
   **`payment.succeeded`**. Copy the signing secret → `DODO_PAYMENTS_WEBHOOK_SECRET`.

**Test card:** `4242 4242 4242 4242`, any future expiry, any CVC, any ZIP.

> The webhook is the **source of truth** for granting credits (the browser return URL only drives
> the UI). Crediting is idempotent per `dodo_payment_id`.

---

## 4. Brave Search

Get a free key at [api.search.brave.com](https://api.search.brave.com) → `BRAVE_SEARCH_API_KEY`.
(Check current free-tier query limits on their pricing page.)

---

## 5. Environment variables

Fill `.env.local` (local) and the Vercel project's Environment Variables (prod) with the same keys
— see `.env.example`:

| Var | Where from |
|---|---|
| `NEXT_PUBLIC_SITE_URL` | `http://localhost:3000` locally; `https://<app>.vercel.app` in prod |
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` | Supabase → API |
| `DODO_PAYMENTS_API_KEY` / `DODO_PAYMENTS_WEBHOOK_SECRET` / `DODO_PRODUCT_ID_5_CREDITS` | DodoPayments |
| `DODO_PAYMENTS_ENVIRONMENT` | `test_mode` |
| `BRAVE_SEARCH_API_KEY` | Brave |
| `ENCRYPTION_KEY` | `openssl rand -base64 32` |
| `PAYWALL_COUPON_CODE` | `SID_DRDROID` |

Never commit `.env.local`.

---

## 6. Run locally

```bash
npm run dev          # http://localhost:3000
npm run typecheck    # tsc --noEmit
npm run build        # production build
```

Sign in → you land on `/paywall`. Redeem coupon **`SID_DRDROID`** (or pay with the test card) to
get 5 credits → add an LLM key in **Settings → API keys** → start a chat.

---

## 7. Deploy to Vercel

1. Push this repo to GitHub and **Import** it in Vercel.
2. Add **every** variable from section 5 in Vercel → Settings → Environment Variables. Set
   `NEXT_PUBLIC_SITE_URL` to the deployed `https://<app>.vercel.app`.
3. Deploy. Then update:
   - Supabase → URL Configuration: add the prod Site URL + `/auth/callback` redirect URL.
   - DodoPayments webhook endpoint → the prod `/api/webhooks/dodo` URL.
4. Open the live URL and run through section 8.

> `maxDuration` for the agent-run route is set to **60s** (Vercel Hobby ceiling). On Pro, raise it
> in `src/app/api/chats/[chatId]/run/route.ts` for longer deep-research runs.

---

## 8. Definition-of-done checklist (self-verify on the live URL)

- [ ] Sign up works via **Google only** and via **GitHub only** (no email/password path).
- [ ] Paywall shows immediately after first signup, before any app screen is reachable.
- [ ] Coupon **`SID_DRDROID`** grants exactly **5 credits** (one-time per account).
- [ ] A **$5 DodoPayments test-mode** payment also grants exactly 5 credits end-to-end.
- [ ] Chat: threads, new-chat creation, context retained within a thread across turns.
- [ ] Agent visibly runs a **think → tool → observe → think** loop (watch the step trace on a
      multi-step prompt like the wildfire example).
- [ ] Agent produces a **PDF report** artifact that downloads and opens.
- [ ] **No LLM key is preloaded** — chat is unusable until the user adds their own key.
- [ ] At least 3–4 current models each for **Claude, OpenAI, and Kimi** are selectable.
- [ ] Prompt caching wired up (Anthropic `cache_control` on the system prompt; OpenAI/Kimi cached
      tokens read from usage and reflected in cost).
- [ ] Stats page shows correct per-chat / per-run cost split into input/output/cache, matching
      `model_pricing`.
- [ ] Credits decrement per agent run; paywall re-appears at 0 balance with a top-up path.
- [ ] Reachable at a public HTTPS URL, survives refresh, works after logout/login.

---

## 9. Architecture notes

- **Provider abstraction** (`src/lib/providers/`): one `callModel` signature; adapters for
  Anthropic (native `messages` + tool use + `cache_control`) and an OpenAI-compatible adapter that
  serves OpenAI, Kimi/Moonshot (base URL override), and any custom endpoint. Usage is normalized to
  input / output / cache-read / cache-write tokens.
- **Agent loop** (`src/lib/agent/loop.ts`): real bounded ReAct loop (max 12 iterations) executing
  tools server-side — `web_search` (Brave), `fetch_page` (readable text extraction), and
  `generate_pdf_report` (renders → Supabase Storage → artifact row). Streams step events to the UI
  over SSE.
- **Billing** is decoupled: `credits` (platform metering, 1/run) vs `usage_logs` + `model_pricing`
  (own-key cost analytics).
- **Security:** LLM keys are AES-256-GCM encrypted at rest and never returned to the client after
  save; RLS gates every user-owned table; privileged operations (credit, webhook, usage log,
  artifacts) run through the service-role client only in server code; PDF downloads are gated by
  chat ownership.

## 10. Layout

```
supabase/migrations/     0001_init.sql (schema+RLS+trigger+pricing seed), 0002_storage.sql
src/lib/                 env, crypto, credits, pricing, models, dodo, stream, supabase/*
src/lib/providers/       types, anthropic, openai (+moonshot/custom), index
src/lib/agent/           systemPrompt, tools, loop
src/lib/tools/           webSearch (Brave), fetchPage (cheerio), pdf (react-pdf)
src/app/                 landing, login, auth/callback, paywall(+success), chat(+[chatId]),
                         settings/keys, stats(+[chatId]), api/*
src/components/          ui/*, app/*, paywall/*, settings/*, chat/*, stats/*
```
