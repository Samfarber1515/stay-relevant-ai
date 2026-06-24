# Stay Relevant — personalized AI newsletter

Onboarding profile in → a generated first issue out. Built to fix the "stuck on
*Generating your first issue…*" hang: generation runs as a **background job** on a
long-lived server, and the browser **polls** for the result, so nothing times out.

## Why it doesn't hang

The original app called the model **inside the HTTP request**. A personalized issue
takes ~60s to write, which exceeds most serverless function limits — so the request
was killed and the UI spun forever.

Here:

1. `POST /api/subscribe` saves the profile, starts generation in the background, and
   returns a `jobId` **immediately** (HTTP 202).
2. The browser polls `GET /api/issue/:jobId` every 3s until status is `ready` or `error`.
3. If generation errors or runs long, the UI shows a real message — it never spins silently.

Run it as a normal Node process (Render, Railway, Fly.io, a VPS) — **not** a 10s/60s
serverless function — and the long generation has all the time it needs.

## Run locally

```bash
npm install
cp .env.example .env      # add your ANTHROPIC_API_KEY
npm run dev               # http://localhost:3000
```

## Files

- `server.js` — Express server: static hosting + the async job API.
- `lib/generate.js` — Claude call (`claude-opus-4-8`) that writes the personalized issue.
- `public/index.html` + `public/app.js` — the onboarding form and the poll-don't-block client.

Subscribers are appended to `data/subscribers.jsonl` (gitignored). Job status is
in-memory — fine for one instance; move it to Redis/a DB to scale horizontally.

## Next steps

- [ ] Email the generated issue (Resend/Postmark) instead of only showing it on screen
- [ ] Persist profiles + issues to a real database
- [ ] Schedule recurring issues per the chosen cadence
