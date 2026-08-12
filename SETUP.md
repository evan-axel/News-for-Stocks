# Setup — step by step

Follow these in order. Each step ends with a ✅ check so you know it worked before moving on.

**Total time:** about 45 minutes. **Cost:** ~$25/mo (data) + ~$5/mo (hosting) + a few cents per alert.

You will create accounts at **three** places: Anthropic, Twilio, and Financial Modeling Prep.

---

# Part 1 — Get it running on your computer

### Step 1.1 — Install Node.js

Go to [nodejs.org](https://nodejs.org) and download the **LTS** version. Run the installer.

Then open a terminal (Mac: **Terminal**. Windows: **PowerShell**) and check it worked:

```bash
node -v
```

✅ You should see a version number like `v22.x.x`. It must be 20 or higher.

### Step 1.2 — Download the code

```bash
git clone https://github.com/evan-axel/News-for-Stocks.git
cd News-for-Stocks
git checkout claude/whatsapp-investment-alerts-jt5alc
npm install
```

✅ The last command ends with something like `added 324 packages`.

### Step 1.3 — Create your settings file

```bash
cp .env.example .env
```

This makes a file called `.env`. **This file holds your passwords and keys — never share it or commit it to GitHub.** It's already set up to be ignored by git.

Open it in any text editor (Mac: `open -e .env`. Windows: `notepad .env`). You'll paste keys into it in Part 2.

✅ You can see the file with lines like `ANTHROPIC_API_KEY=`.

---

# Part 2 — Create your three accounts

Do these one at a time. After each one you'll paste a value into `.env`.

## Account 1 of 3 — Anthropic (writes the messages)

This is what makes the bot sound like a person instead of a robot, and it powers the chat.

1. Go to [console.anthropic.com](https://console.anthropic.com) and sign up.
2. Add a payment method under **Billing** (it's pay-as-you-go — expect a few dollars a month at normal volume).
3. Go to **API keys** → **Create key**. Copy it.
4. In `.env`, paste it:

```bash
ANTHROPIC_API_KEY=sk-ant-paste-yours-here
```

✅ Your key starts with `sk-ant-`.

## Account 2 of 3 — Twilio (sends the WhatsApp messages)

1. Go to [twilio.com/try-twilio](https://www.twilio.com/try-twilio) and sign up. Verify your email and phone.
2. In the Twilio Console, go to **Messaging → Try it out → Send a WhatsApp message**.
3. You'll see a **sandbox** with a phone number and a join code that looks like `join olive-tiger`.
4. **On your phone**, open WhatsApp and send that exact join code as a message to the number shown.

   ✅ WhatsApp replies confirming you're connected. You now have a working test bot — no business verification needed.

5. Back in the Twilio Console, go to the home page and copy your **Account SID** and **Auth Token**.
6. In `.env`:

```bash
TWILIO_ACCOUNT_SID=AC-paste-yours-here
TWILIO_AUTH_TOKEN=paste-yours-here
TWILIO_WHATSAPP_FROM=whatsapp:+14155238886
ALERT_RECIPIENT=whatsapp:+15551234567
```

- `TWILIO_WHATSAPP_FROM` is the sandbox number — usually `+14155238886`. Use whatever the Console shows.
- `ALERT_RECIPIENT` is **your own phone number**, with your country code, and the `whatsapp:` prefix. A US number looks like `whatsapp:+15551234567`.

✅ Both values are pasted, and your phone got a confirmation from WhatsApp.

## Account 3 of 3 — Financial Modeling Prep (the numbers)

This provides market cap, historical financials, executives, insider trades, and transcripts.

1. Go to [site.financialmodelingprep.com/developer/docs/pricing](https://site.financialmodelingprep.com/developer/docs/pricing).
2. Sign up. The **Starter** plan (~$25/mo) covers everything this system uses.
3. Copy your API key from the dashboard.
4. In `.env`:

```bash
FMP_API_KEY=paste-yours-here
```

**Want to skip paying for now?** Leave it blank. The system falls back to free SEC data and still gives you full historical financials — you just won't get live market cap, executives, insider trades, or transcripts.

### One more line — required, takes 5 seconds

The SEC blocks anonymous requests. Put your real email in:

```bash
SEC_USER_AGENT=News-for-Stocks/0.1 (your-real-email@example.com)
```

✅ All keys pasted into `.env`. Save the file.

---

# Part 3 — Turn it on

### Step 3.1 — Load the starter keywords

```bash
npm run seed
```

This loads 15 keywords (strategic review, CEO change, going concern, buyback, and so on) and downloads the SEC's list of every public company.

✅ You see `seed complete`.

### Step 3.2 — Do a test run without sending anything

First, set safety mode. In `.env`, make sure this line says `true`:

```bash
DRY_RUN=true
```

Then:

```bash
npm run scan:once
```

This checks every news source once and prints a table.

✅ **Look at the table.** Most rows should show a number in the "items" column. Some sources may show errors — that's normal, publisher URLs change. If **every single row** errors, your internet or firewall is blocking it.

You'll also see any alerts it *would* have sent printed in the log instead of going to your phone.

### Step 3.3 — Send for real

In `.env`, change:

```bash
DRY_RUN=false
```

Then start it:

```bash
npm run dev
```

✅ You see `HTTP server listening`. Leave this terminal window open — it's running now.

---

# Part 4 — Connect the two-way chat

Right now the bot can text *you*. This step lets you text *it*.

Twilio needs a public web address to deliver your messages to. On your own computer you don't have one, so we make a temporary one.

### Step 4.1 — Get a public address

1. Sign up free at [ngrok.com](https://ngrok.com) and follow their install instructions.
2. **Open a second terminal window** (leave the first one running) and run:

```bash
ngrok http 8080
```

3. You'll see a line like `Forwarding https://abc123.ngrok-free.app -> http://localhost:8080`. Copy that `https://...` address.

### Step 4.2 — Tell the app its own address

In `.env`:

```bash
PUBLIC_BASE_URL=https://abc123.ngrok-free.app
```

**Then restart the app**: go to the first terminal, press `Ctrl+C`, and run `npm run dev` again.

### Step 4.3 — Tell Twilio where to deliver

1. In the Twilio Console, go back to **Messaging → Try it out → Send a WhatsApp message**, then the **Sandbox settings** tab.
2. In the box labelled **"When a message comes in"**, paste your address with `/webhooks/twilio` on the end:

```
https://abc123.ngrok-free.app/webhooks/twilio
```

3. Make sure the method next to it is **POST**. Save.

⚠️ This address must match `PUBLIC_BASE_URL` exactly. If they differ, messages are rejected with a 403 error.

### Step 4.4 — Test it

On your phone, text the bot:

```
/help
```

✅ You get a reply listing what you can ask. **You now have a working two-way bot.**

Try a few more:

```
/status
what's going on with AAPL
latest transcript for AAPL
```

---

# Part 5 — Keep it running 24/7

Right now it only works while your laptop is on and ngrok is running. To make it permanent, put it on a server. [Railway](https://railway.app) is the easiest — about $5/month.

1. Sign up at [railway.app](https://railway.app) with your GitHub account.
2. **New Project → Deploy from GitHub repo** → pick `News-for-Stocks`.
3. Under **Settings**, set:
   - **Build command:** `npm install && npm run build`
   - **Start command:** `npm start`
4. Under **Variables**, add every line from your `.env` file, one at a time.
5. Under **Settings → Volumes**, add a volume mounted at `/data`. Then set the variable:
   ```
   DATABASE_PATH=/data/app.sqlite
   ```
   Without this, your alert history and settings reset on every restart.
6. Under **Settings → Networking**, click **Generate Domain**. Copy the URL it gives you.
7. Set the variable `PUBLIC_BASE_URL` to that URL.
8. Go back to the Twilio sandbox settings and change the webhook to your new permanent URL + `/webhooks/twilio`.

✅ Text the bot `/status`. If it replies, you're live. You can close your laptop and stop ngrok.

---

# Part 6 — Make it yours

Everything below can be done by **just texting the bot** — no code, no dashboard.

**Narrow it to what you actually care about:**

```
only small caps under $2B
just biotech and medtech
don't alert me about anything on the OTC
```

**Add or remove triggers:**

```
also alert me on "going private"
stop watching reverse splits
what are you watching
```

**Ask for anything, anytime:**

```
show me Apple's margins over 5 years
how much cash does ACME have versus debt
recent 8-Ks for ACME
any news on lithium refining
what did you send me today
```

**Earnings calls:**

```
which calls do you have for ACME
latest transcript for ACME
what did ACME say about pricing on the Q2 call
compare what they said about margins in Q2 vs Q3
```

Transcripts are saved after the first fetch, so asking more questions about the same call is instant and free. If you haven't paid for a data provider, the bot falls back to the earnings press release from the company's SEC filing — it'll tell you when it does, because a press release has no Q&A section.

**Commands:** `/help` `/status` `/pause` `/resume` `/reset`

---

# If something goes wrong

| What you see | What it means | Fix |
|---|---|---|
| Bot never texts you first | No keyword has matched yet, or you're outside the 24-hour window | Text it anything. See the box below. |
| Bot doesn't reply when you text it | Twilio can't reach your app | Check the webhook URL exactly matches `PUBLIC_BASE_URL` and ends in `/webhooks/twilio`, method POST |
| `403` in the logs | Webhook URL mismatch | Same as above — they must be character-for-character identical |
| Every source shows an error | Network or firewall blocking | Try from a different network |
| A few sources show errors | A publisher changed their feed URL | Normal. Harmless. Fix in `apps/worker/src/sources/feed-source.ts` if you like |
| `no keywords configured` | Seed never ran | `npm run seed` |
| Financials say "not available" | No FMP key | Add `FMP_API_KEY`, or accept SEC-only data |
| Too many alerts | Filters too loose | Text it: `only small caps under $2B` |

### ⚠️ The one rule that will confuse you

WhatsApp does not let a bot message you out of the blue if **you** haven't messaged **it** in the last 24 hours. That's WhatsApp's rule, not this app's.

If you go quiet for a day, alerts don't get lost — they're saved and **all delivered the moment you text back**. But you won't get buzzed in the meantime.

**Simplest fix:** text the bot something once a day (even just `/status`). That keeps the window open permanently.

---

# One security task

The original repo had a file called `.env` committed with a live **Orama API key** inside it. I removed the file from tracking, but **it's still visible in the repository's history.**

👉 Go to Orama and delete/rotate that key. It takes a minute and there's no downside — nothing in this system uses it.
