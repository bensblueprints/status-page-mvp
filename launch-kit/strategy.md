# Launch Strategy — Upkeep Status

## Pricing math
- Atlassian Statuspage: **$29–$999/mo** → $348+/yr for the cheapest paid tier
- Instatus: $20–80/mo; Better Stack status pages bundled from ~$24/mo
- **Upkeep Status: $29 one-time** → pays for itself vs Statuspage in **1 month**, vs Instatus in ~6 weeks.

## Target communities (rules-aware angles)
- **r/selfhosted** — perfect fit. Angle: "Self-hosted Statuspage alternative — server-rendered, SQLite, one container." Lead with the repo + docker-compose; mention the paid installer only if asked.
- **r/devops / r/sre** — angle: the webhook integration. "Your uptime monitor should flip your status page, not a human at 3am." Show the Pingcron → Upkeep wiring.
- **r/webdev** — angle: the zero-JS public page ("your status page must survive your outage — here's why mine is server-rendered").
- **Indie Hackers / r/SaaS** — cost story for people running 3+ side projects: one $5 VPS hosts all their status pages.

## Show HN draft
**Title:** Show HN: Upkeep Status – self-hosted status page that survives your outage

Status pages have one hard requirement: they must load when everything else is down. So the public page in Upkeep Status is server-rendered HTML with zero client JavaScript — one Express handler reading SQLite, cache-friendly, reverse-proxy friendly.

The rest is what you'd expect from Statuspage.io: components with 90-day uptime bars (computed from the status-event stream, cached daily), incident timelines (investigating → identified → monitoring → resolved), scheduled maintenance that auto-transitions by clock rather than cron, email subscribers with double opt-in, RSS, and a JSON status API.

The part I like most: every component has a webhook token, so your uptime monitor flips status automatically — no human in the loop for the "we know, we're on it" moment.

MIT licensed. I sell a packaged installer for people who want the 1-click version. Feedback welcome, especially on the uptime-percentage math for partial days.

## SEO keywords (10)
1. statuspage alternative
2. self hosted status page
3. open source incident page
4. atlassian statuspage alternative
5. instatus alternative
6. status page one time purchase
7. uptime status page self hosted
8. incident communication tool
9. status page custom domain free
10. statuspage io pricing alternative

## AppSumo / PitchGround pitch
Upkeep Status turns the most rented page on the internet — the status page — into something you own. Buyers get a self-hosted Statuspage.io replacement: component grid with real 90-day uptime history, incident timelines, scheduled maintenance, email subscribers, RSS and a JSON API, deployable with a single Docker command and a free custom domain. The public page is server-rendered so it stays up during the very outages it reports. Zero recurring cost for you, zero for them: it's the cleanest anti-subscription story in the dev-tools LTD space.

## Suggested price
**$29 one-time.** Anchor: "Statuspage's cheapest paid plan is $29/month. Upkeep pays for itself in 30 days — every month after that is free."
