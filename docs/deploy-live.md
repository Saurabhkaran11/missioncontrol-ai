# Getting a live app URL

Two options:
- **A** is fastest (about 2 minutes) for a hackathon demo.
- **B** gives a permanent URL.

Nothing deploys automatically. Each step below is something you run or click.

---

## Option A — Public URL from your Mac in 2 minutes (Cloudflare Quick Tunnel)

This shares your running local app through a temporary `https://….trycloudflare.com` URL. It works only while your Mac and the dev server stay on.

1. Start the app:
   ```bash
   cd ~/Desktop/missioncontrol-ai && npm run dev -- --port 3200
   ```
2. In a second terminal, start the tunnel (`cloudflared` is already installed):
   ```bash
   cloudflared tunnel --url http://localhost:3200
   ```
3. Copy the `https://<random>.trycloudflare.com` URL it prints.
4. Set `NEXT_PUBLIC_APP_URL=<that URL>` in `.env.local`, then restart step 1. This lets the CSRF origin check accept requests that come through the tunnel.
5. Open the URL and click **Open the live demo**.

Caveats:
- Anyone with the link can open the demo.
- With `LIVE_EXTERNAL_ACTIONS_ENABLED=true`, visitors who approve and send a record will write to your n8n sheet. Set it to `false` before sharing if you don't want that.

---

## Option B — Permanent URL on Render (Docker + Postgres)

Render runs the provided `Dockerfile` as a **web service** plus a **background worker**, with a managed Postgres database.

1. **Create a database.**
   - Sign up at https://dashboard.render.com, then go to **New → Postgres** (any plan).
   - Copy its **Internal Database URL**.
2. **Create the web service.**
   - Go to **New → Web Service**, connect GitHub, and pick `Saurabhkaran11/missioncontrol-ai`.
   - **Runtime:** Docker. Under **Advanced → Docker build target**, enter `runtime`.
   - **Health check path:** `/api/health`.
   - **Environment variables:**
     ```
     NODE_ENV=production
     DATABASE_URL=<Internal Database URL>
     NEXT_PUBLIC_APP_URL=https://<your-service>.onrender.com
     DEMO_MODE=true                      # keep the "Open the live demo" button
     EMBEDDED_WORKER=false
     SESSION_SECRET=<openssl rand -hex 32>
     INTEGRATION_ENCRYPTION_KEY=<openssl rand -base64 32>
     LIVE_EXTERNAL_ACTIONS_ENABLED=false # set true only if you want visitors' approvals to hit n8n
     # optional sponsors (same values as your .env.local):
     ORCHESTRATOR_PROVIDER=rocketride
     ROCKETRIDE_API_KEY=…
     ROCKETRIDE_BASE_URL=https://api.rocketride.ai
     ROCKETRIDE_PIPELINE_FILE=rocketride/missioncontrol-task.pipe
     AVATAR_PROVIDER=masky
     MASKY_API_KEY=…
     MASKY_AVATAR_IDS=…
     N8N_BASE_URL=…  N8N_LEADS_WEBHOOK_URL=…  N8N_WEBHOOK_SECRET=…
     ```
   - Migrations run automatically on startup.
3. **Create the worker.**
   - Go to **New → Background Worker** with the same repo.
   - **Runtime:** Docker. **Docker build target:** `worker`.
   - **Environment variables:** same as the web service.
4. **Deploy.**
   - Render gives you `https://<your-service>.onrender.com`.
   - Check `https://<url>/api/ready`. It should return `{"status":"ready","database":"postgres",…}`.
   - Open the URL and click **Open the live demo**.

Notes:
- Local password-less sign-in is disabled in production; visitors use the demo button. Real sign-in (Supabase) isn't wired yet; see `docs/operations.md`.
- Free Render instances sleep when idle. The first request after a pause takes about 30–60 s.
- Never commit `.env.local`. Paste secrets only into Render's environment settings.

Other hosts work the same way: any host that runs a Docker web service, a worker and Postgres (Railway, Fly.io).
