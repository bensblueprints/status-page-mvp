# Product Hunt — Upkeep Status

**Name:** Upkeep Status

**Tagline (60 chars):** A $29-once status page — stop renting one from Atlassian

**Description (260 chars):**
Self-hosted public status page: components with 90-day uptime bars, incident timelines, scheduled maintenance, email subscribers, RSS + JSON API. Auto-flips from your uptime monitor via webhooks. One Node process + SQLite on your VPS. $29 once, not $29/mo.

**Full description:**
Upkeep Status is everything you actually use in Statuspage.io, self-hosted and paid for exactly once.

The public page is server-rendered with zero JavaScript — it loads instantly even when your infrastructure is on fire (which is precisely when people look at it). Components show live status and 90-day uptime bars computed from real status history. Incidents follow the classic investigating → identified → monitoring → resolved flow with a public timestamped timeline. Maintenance windows are announced in advance and transition automatically.

Each component gets a webhook, so your uptime monitor flips status without a human — Pingcron payloads work natively. Visitors can subscribe by email (double opt-in when SMTP is configured) and get notified on incidents and resolutions. There's an RSS feed and a JSON status API for machines.

Deploy with one Docker command, put any custom domain in front of it for free, and your entire status history lives in one SQLite file you can back up with `cp`.

**Maker first comment:**
Hey PH 👋 I got tired of paying Atlassian $29/month to host what is functionally a static page with a green dot on it. Multiply that across side projects and it's absurd — the status page cost more per year than the VPS running the actual product. So I built Upkeep Status: server-rendered public page (loads even during your outage, no JS), incident timelines, maintenance windows, subscriber emails, RSS/JSON, and webhooks so your monitor flips component status automatically. MIT source; $29 gets you the packaged installer. Happy to talk about the uptime-bar math — computing honest daily percentages from event streams was the fun part.

**Gallery shots (5):**
1. Public status page: green "All systems operational" banner, component grid with 90-day uptime bars.
2. Same page during an incident: red banner, active incident timeline with investigating → identified updates.
3. Admin incidents view: posting an update and moving status to resolved.
4. Component admin with per-component webhook URL and copy button, wired to a Pingcron check.
5. Subscriber list + settings showing SMTP config and custom-domain BASE_URL.
