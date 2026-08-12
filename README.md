# News for Stocks

A WhatsApp bot that texts you when a keyword you care about shows up in financial news, newswires, or SEC filings — with the company's numbers attached — and that you can text back to pull data on any ticker.

Everything happens in WhatsApp. Alerts push out; you text back to pull. The web page is optional configuration only.

```
You (WhatsApp)
   ▲  │
   │  └──── "latest transcript for ACME" ──▶ agent ──▶ tools ──▶ financial data, transcripts,
   │                                                             filings, news, your alert history
   │
   └──────── 🔔 "Acme just said it's exploring strategic alternatives…"
                        ▲
        ┌───────────────┴───────────────┐
        │  every 5 min: poll → match →  │
        │  filter → enrich → write      │
        └───────────────────────────────┘
             ▲            ▲          ▲
        newswires    news sites   SEC EDGAR
```

---

## How the alerting works

Two independent axes decide whether something reaches your phone:

| Axis | Question | Configured as |
|---|---|---|
| **Keywords** | Did something interesting happen? | `strategic review`, `going concern`, `CEO change`, … each with synonyms and noise-suppressing negations |
| **Filters** | Do I care about *this company*? | industry, sector, market-cap band, exchange, country, or specific tickers |

An alert fires only when a keyword matches **and** the resolved company passes the filters. So "only alert me on strategic reviews at sub-$2B biotechs" is two filters plus one keyword — and you can set all of it by texting the bot.

Both axes degrade sensibly: no filters means every company passes; a company we can't confidently identify passes only when no include-filters are set (guessing the wrong ticker is worse than no ticker).

### Where the alerts come from

- **Press-release wires** — GlobeNewswire, Business Wire, PR Newswire, ACCESSWIRE, Newsfile
- **News sites** — Yahoo Finance, CNBC, MarketWatch, Seeking Alpha, plus a Google News search per keyword (this is what gives broad coverage without a paid news API)
- **SEC EDGAR** — a full-text search per keyword across 8-K, 10-Q, 10-K, S-1, DEF 14A and more, plus the live 8-K firehose. This is the highest-signal source: it catches a phrase buried in an exhibit that never makes it into a press release.

X/Twitter is deliberately not included — the API is ~$200/mo for usable read access and the same corporate events surface on the wires and in filings first.

---

## Setup

> **New here? Follow [SETUP.md](./SETUP.md) instead.** It's a click-by-click walkthrough — which accounts to create, what to paste where, and a check after every step. The section below is the condensed version.

You need three accounts. Budget about 30 minutes.

### 1. Install

```bash
git clone <your repo>
cd News-for-Stocks
npm install
cp .env.example .env
```

### 2. Anthropic API key

From [console.anthropic.com](https://console.anthropic.com) → API keys.

```bash
ANTHROPIC_API_KEY=sk-ant-...
```

This writes the alert texts and powers the chat. Without it the system still runs and still alerts, just with plain unwritten messages.

### 3. Twilio WhatsApp

1. Sign up at [twilio.com](https://www.twilio.com/try-twilio).
2. Console → **Messaging → Try it out → Send a WhatsApp message**. This opens the **sandbox**.
3. Send the join code it shows you (e.g. `join olive-tiger`) from your phone to the sandbox number. You're now connected — no business verification needed.
4. Copy your Account SID and Auth Token from the Console home.

```bash
TWILIO_ACCOUNT_SID=AC...
TWILIO_AUTH_TOKEN=...
TWILIO_WHATSAPP_FROM=whatsapp:+14155238886   # the sandbox number
ALERT_RECIPIENT=whatsapp:+1XXXXXXXXXX        # your phone, E.164
```

5. Point the sandbox at your worker: **Sandbox settings → "When a message comes in"** →
   `https://<your-public-url>/webhooks/twilio`, method **POST**.

   For local development, expose port 8080 with [ngrok](https://ngrok.com):
   ```bash
   ngrok http 8080
   ```
   Then set `PUBLIC_BASE_URL` to the ngrok HTTPS URL. **It must match the webhook URL exactly** — Twilio signs the request against that string, and a mismatch produces a 403.

#### ⚠️ The 24-hour window — read this one

WhatsApp only permits freeform messages within **24 hours of your last inbound message**. Outside that window a proactive alert is rejected. This is a WhatsApp platform rule, not a Twilio or code limitation.

This system handles it explicitly:

- Inside the window → the alert sends normally.
- Outside it → the alert is **queued in the outbox** and, if you've configured a template, a short approved template message nudges you.
- The moment you reply, the window reopens and **everything queued is delivered in order**.

So nothing is ever silently dropped. But if you go quiet for a few days you'll get a burst when you next text back. To get the nudge, create an approved template in Twilio (Content Template Builder), with one variable for the pending count, and set:

```bash
TWILIO_ALERT_TEMPLATE_SID=HX...
```

Without a template, alerts still queue — you just won't be pinged until you text in. In practice, texting the bot anything once a day keeps the window permanently open.

### 4. Financial data

Pick one. The system falls back through the chain in `FINANCIALS_PROVIDERS`, and **SEC XBRL is always there as a free backstop** — it needs no key and serves full historical financials straight from filings.

| Provider | Historical financials | Market cap / price | Execs & insiders | Transcripts | Cost |
|---|---|---|---|---|---|
| **SEC XBRL** (built in) | ✅ full history | ❌ | ❌ | ❌ | free |
| **Financial Modeling Prep** | ✅ 30+ yrs | ✅ | ✅ | ✅ | ~$25/mo |
| **Fiscal.ai** | ✅ + segments/KPIs | ✅ | partial | ✅ | contact them |

Recommended start: **FMP** (`FMP_API_KEY`), which covers every field in one integration. Add Fiscal.ai later if you want segment-level revenue and KPI data — it's the better dataset, and their API is a separate product line from the $39/mo terminal, so check pricing.

TIKR was considered and ruled out: [they have no API, and scraping closes your account](https://support.tikr.com/hc/en-us/articles/38745028283931-Does-TIKR-offer-an-API).

Also set a real contact string for SEC — they 403 generic user agents:

```bash
SEC_USER_AGENT=News-for-Stocks/0.1 (you@example.com)
```

### 5. MCP servers (optional, recommended for transcripts)

Instead of REST adapters, you can hand the chat agent an MCP server and it gains those tools with no mapping code — Anthropic connects to it server-side.

```bash
MCP_SERVERS=[{"name":"fmp-transcripts","url":"https://mcp.mcpbundles.com/bundle/fmp-transcripts"}]
```

Add a `"token"` field if the server needs auth. Multiple servers are fine; names must be unique.

### 6. Seed and run

```bash
npm run seed        # loads 15 default keywords + downloads the SEC ticker index
npm run scan:once   # one scan, prints a per-source health table
npm run dev         # starts the worker
```

`scan:once` is the important one. It prints every source with its item count and any error — **check it after first deploy**. Publisher feed URLs drift, and any source showing repeated failures or a persistent zero needs its URL refreshed in `apps/worker/src/sources/feed-source.ts`. A dead feed never breaks a scan; it just stops contributing.

Optional control panel:

```bash
cp apps/web/.env.local.example apps/web/.env.local
npm run dev:web     # http://localhost:3000
```

---

## Talking to it

Text the bot anything. Some examples:

```
what's going on with ACME
show me Apple's margins over the last 5 years
how much cash does ACME have versus debt
latest transcript for ACME
what did ACME's CEO say about pricing
recent 8-Ks for ACME
any news on lithium refining
what did you send me today
also alert me on "going private"
only small caps under $2B
just biotech and medtech
stop watching reverse splits
```

Commands: `/help` `/status` `/pause` `/resume` `/reset`

The agent has tools for company snapshots, historical financials, transcripts (fetch and search within), SEC filings, news search, your alert history, and changing what's watched. It's instructed never to state a number that didn't come back from a tool — if data is unavailable it says so rather than estimating.

---

## Deploying

One always-on Node process. It needs a writable disk for SQLite and a public HTTPS URL for the webhook.

**Railway / Render / Fly.io** (~$5/mo):

```
Build:  npm install && npm run build
Start:  npm start
```

Set every variable from `.env.example` in the host's dashboard, mount a volume for `DATABASE_PATH`, and set `PUBLIC_BASE_URL` to the deployed URL.

Don't run this on serverless cron: the free tiers fire once a day, and the scan loop plus the 24-hour-window bookkeeping both assume a long-lived process.

---

## Tuning the noise

The default keyword pack ships with negations because expansion sets alone fire constantly on boilerplate — "forward-looking statements" appears in nearly every release, and a keyword that cries wolf gets muted.

- `MAX_ALERTS_PER_HOUR` (default 12) is a hard cap; overflow is recorded as suppressed, not lost.
- `MAX_ITEM_AGE_HOURS` (default 24) ignores anything older on first sight.
- `DRY_RUN=true` runs the full pipeline and logs the messages instead of sending them. Use it while tuning.
- Suppressed alerts stay in the database and show in the dashboard with the reason, so you can see what a filter is costing you.

---

## Layout

```
apps/worker/src/
  sources/      feed fetching, RSS/Atom parsing, SEC EDGAR, rate limiting
  matching/     keyword expansion + matching, ticker resolution, company filters
  enrich/       provider interface → FMP, Fiscal.ai, SEC XBRL; growth/margin/FCF derivation
  llm/          alert composer, chat agent + tool surface, context rendering
  whatsapp/     Twilio send/receive, 24h window handling, message chunking
  pipeline/     scan loop, inbound message handling
  db/           SQLite schema, migrations, repository
apps/web/       optional Next.js control panel
```

```bash
npm test          # 86 unit tests
npm run typecheck
```

---

## Known gaps — read before trusting it

I want to be straight about what was and wasn't verified.

1. **No external endpoint was live-tested.** The build environment blocked outbound network access to every host except Anthropic. The SEC, FMP, Twilio, and feed integrations are written against documented contracts and covered by unit tests with realistic fixtures, but the first real run is the first real test. `npm run scan:once` is the tool for that.

2. **Fiscal.ai's REST paths are inferred, not confirmed.** `docs.fiscal.ai` was unreachable. Only `/v2/company/segments-and-kpis` is known-good from public material. Every path and field name sits in two clearly-marked constants at the top of `enrich/fiscalai.ts` so reconciling them against their docs is a few minutes' work. Their MCP server, if you use it, sidesteps this entirely.

3. **Feed URLs drift.** The catalog is a starting point, not a guarantee. Check the source-health table after deploying.

4. **`.env` was committed to this repo's history with a live `ORAMA_API_KEY`.** I removed it from tracking and added a `.gitignore`, but **it is still in the git history — rotate that key.** The Orama integration itself is gone; the key was left over from the earlier prototype.

5. **The 24-hour window will surprise you** the first time you go quiet for a day. See above.

---

This is a research and awareness tool. It surfaces things worth a look and reports what the numbers say. It does not give investment advice, and the bot is instructed never to recommend buying or selling.
