# Upkeep Status 🟢

## Demo

VIDEO-PLACEHOLDER

![MIT](https://img.shields.io/badge/license-MIT-green) ![Node](https://img.shields.io/badge/node-%3E%3D20-brightgreen)

**The public status page you own forever.** Components, incident timelines, scheduled maintenance, email subscribers, RSS + JSON API — self-hosted on a $5 VPS. Pay **$29 once** instead of $29/month for Statuspage.io.

> Your status page shouldn't cost more than the incident it's reporting.

![screenshot](docs/screenshot.png)

## Features

- 🧩 **Components** with five states (operational / degraded / partial outage / major outage / maintenance) — toggle manually in the admin, or **auto-flip from your uptime monitor** via a per-component webhook (Pingcron `{"event":"down"}` payloads work out of the box).
- 🚨 **Incidents** with the classic update flow: investigating → identified → monitoring → resolved. Every update lands on the public timeline with timestamps.
- 🗓 **Scheduled maintenance** windows shown in advance, auto-transitioning scheduled → in progress → complete (no cron required — state is derived).
- 📊 **90-day uptime bars** per component, computed from the real status-change history and cached daily.
- ✉️ **Email subscribers**: subscribe form on the public page, double-opt-in when SMTP is configured, notified on new incidents and resolutions, one-click unsubscribe.
- 📡 **RSS feed** (`/feed.xml`) + **JSON status API** (`/api/status.json`) for programmatic checks.
- ⚡ **Server-rendered public page** — zero JavaScript, loads instantly, caches well, custom-domain/reverse-proxy friendly.
- 🌚 Dark-mode React admin at `/admin` (Tailwind + Lucide + Framer Motion).

## Quick start

```bash
npm i
npm run build     # build the admin SPA
npm start         # → public page: http://localhost:5342  ·  admin: /admin (password: admin)
```

Copy `.env.example` to `.env` to set `PORT`, `ADMIN_PASSWORD`, `SITE_NAME`, `BASE_URL`, and SMTP.

### Docker

```bash
docker compose up -d   # persists SQLite in a named volume
```

### Desktop mode

Run it as a desktop app for drafting/internal boards, or deploy to a $5 VPS when you need it public:

```bash
npm run desktop
```

### Custom domain

Point any domain at the server (Caddy/Nginx/Traefik reverse proxy), set `BASE_URL`, done. No per-domain fees.

## Wiring your uptime monitor

Every component gets a webhook URL (copy it in the admin):

```bash
curl -X POST https://status.you.com/hooks/component/<token> \
  -H 'Content-Type: application/json' -d '{"status":"major_outage"}'
```

Pingcron alert webhooks (`{"event":"down"}` / `{"event":"up"}`) are understood natively — point a Pingcron check's alert webhook at the component and status flips automatically.

## Upkeep Status vs Statuspage.io

| | **Upkeep Status** | Atlassian Statuspage |
|---|---|---|
| Price | **$29 once** | $29–$999 /mo |
| 1 year | **$29** | $348+ |
| Components + uptime bars | ✅ | ✅ |
| Incident timelines | ✅ | ✅ |
| Scheduled maintenance | ✅ | ✅ |
| Email subscribers | ✅ | ✅ (metered) |
| RSS + JSON API | ✅ | ✅ |
| Custom domain | ✅ free | Paid tier |
| Your data | **Your SQLite file** | Their cloud |
| Self-hosted | ✅ | ❌ |

## ☕ Skip the setup — get the 1-click installer

Want the packaged version with everything pre-wired? Grab it on Whop:
**[https://whop.com/benjisaiempire/upkeepstatus](https://whop.com/benjisaiempire/upkeepstatus)**

## Tech stack

Node 20+ · Express · better-sqlite3 · nodemailer · server-rendered public page · React 18 + Vite + Tailwind 4 admin · Electron (desktop mode)

## Tests

```bash
npm test   # boots the real server: webhook flips, incident lifecycle, RSS, subscribers
```

## License

MIT © 2026 Ben (bensblueprints)

## macOS build

See [MAC-BUILD.md](MAC-BUILD.md). Quickest path: GitHub **Actions** tab -> run the **Mac Build** (`mac-build.yml`) workflow to get a downloadable `.dmg` (unsigned - right-click -> Open on first launch).
