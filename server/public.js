// Server-rendered public status page + RSS/Atom feed. Zero client JS — loads
// fast, caches well, works behind any reverse proxy / custom domain.
const { getSettings } = require('./db');
const { uptimeHistory, overallUptime } = require('./uptime');

const STATUS_META = {
  operational: { label: 'Operational', color: '#34d399' },
  degraded: { label: 'Degraded performance', color: '#fbbf24' },
  partial_outage: { label: 'Partial outage', color: '#fb923c' },
  major_outage: { label: 'Major outage', color: '#f87171' },
  maintenance: { label: 'Under maintenance', color: '#60a5fa' }
};
const INCIDENT_LABEL = {
  investigating: 'Investigating', identified: 'Identified',
  monitoring: 'Monitoring', resolved: 'Resolved'
};

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function maintenanceState(m, now = Date.now()) {
  if (now < m.starts_at) return 'scheduled';
  if (now <= m.ends_at) return 'in_progress';
  return 'complete';
}

function overallStatus(components) {
  const order = ['major_outage', 'partial_outage', 'degraded', 'maintenance'];
  for (const s of order) if (components.some((c) => c.status === s)) return s;
  return 'operational';
}

function fmtDate(ms) {
  return new Date(ms).toUTCString().replace(':00 GMT', ' UTC');
}

function renderBars(history) {
  return history.map((d) => {
    const color = d.pct == null ? '#27272a' : d.pct >= 99.5 ? '#34d399' : d.pct >= 95 ? '#fbbf24' : '#f87171';
    const title = d.pct == null ? `${d.date}: no data` : `${d.date}: ${d.pct}% uptime`;
    return `<div class="bar" style="background:${color}" title="${title}"></div>`;
  }).join('');
}

function renderPublicPage(db) {
  const s = getSettings(db);
  const now = Date.now();
  const components = db.prepare('SELECT * FROM components ORDER BY sort_order, id').all();
  const overall = overallStatus(components);
  const om = STATUS_META[overall];
  const banner = overall === 'operational' ? 'All systems operational' : om.label;

  const activeIncidents = db.prepare("SELECT * FROM incidents WHERE status != 'resolved' ORDER BY created_at DESC").all();
  const pastIncidents = db.prepare("SELECT * FROM incidents WHERE status = 'resolved' ORDER BY created_at DESC LIMIT 20").all();
  const updatesFor = db.prepare('SELECT * FROM incident_updates WHERE incident_id = ? ORDER BY created_at DESC');
  const maint = db.prepare('SELECT * FROM maintenance WHERE ends_at > ? ORDER BY starts_at ASC').all(now - 7 * 86_400_000);

  const componentHtml = components.map((c) => {
    const meta = STATUS_META[c.status] || STATUS_META.operational;
    const history = uptimeHistory(db, c, 90);
    const overall90 = overallUptime(history);
    return `
      <div class="component">
        <div class="component-head">
          <div>
            <span class="name">${esc(c.name)}</span>
            ${c.description ? `<span class="desc">${esc(c.description)}</span>` : ''}
          </div>
          <span class="pill" style="color:${meta.color}">● ${meta.label}</span>
        </div>
        <div class="bars">${renderBars(history)}</div>
        <div class="bars-legend"><span>90 days ago</span><span>${overall90 == null ? '' : overall90 + '% uptime'}</span><span>Today</span></div>
      </div>`;
  }).join('');

  const incidentBlock = (i) => {
    const updates = updatesFor.all(i.id);
    return `
      <div class="incident impact-${i.impact}">
        <div class="incident-head">
          <span class="incident-title">${esc(i.title)}</span>
          <span class="impact">${i.impact}</span>
        </div>
        ${updates.map((u) => `
          <div class="update">
            <span class="update-status">${INCIDENT_LABEL[u.status] || u.status}</span>
            <span class="update-body">${esc(u.body)}</span>
            <span class="update-time">${fmtDate(u.created_at)}</span>
          </div>`).join('')}
      </div>`;
  };

  const maintHtml = maint.map((m) => {
    const state = maintenanceState(m, now);
    const label = state === 'scheduled' ? 'Scheduled' : state === 'in_progress' ? 'In progress' : 'Complete';
    return `
      <div class="maint maint-${state}">
        <div class="incident-head">
          <span class="incident-title">${esc(m.title)}</span>
          <span class="maint-state">${label}</span>
        </div>
        ${m.body ? `<div class="update-body">${esc(m.body)}</div>` : ''}
        <div class="update-time">${fmtDate(m.starts_at)} → ${fmtDate(m.ends_at)}</div>
      </div>`;
  }).join('');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(s.site_name)}</title>
<link rel="alternate" type="application/rss+xml" title="${esc(s.site_name)} incidents" href="/feed.xml">
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; margin: 0; }
  body { background:#09090b; color:#e4e4e7; font-family:ui-sans-serif,system-ui,-apple-system,'Segoe UI',Roboto,sans-serif; line-height:1.5; }
  .wrap { max-width: 760px; margin: 0 auto; padding: 40px 20px 80px; }
  h1 { font-size: 20px; font-weight: 600; }
  .banner { margin-top: 20px; padding: 18px 20px; border-radius: 14px; font-weight: 600; font-size: 17px;
            background: ${overall === 'operational' ? 'rgba(52,211,153,.12)' : 'rgba(248,113,113,.12)'};
            color: ${om.color}; border: 1px solid ${om.color}44; }
  h2 { font-size: 13px; text-transform: uppercase; letter-spacing: .08em; color:#a1a1aa; margin: 36px 0 12px; }
  .component { background:#18181b; border:1px solid #27272a; border-radius:12px; padding:16px; margin-bottom:12px; }
  .component-head { display:flex; justify-content:space-between; align-items:baseline; gap:12px; flex-wrap:wrap; }
  .name { font-weight:600; }
  .desc { color:#71717a; font-size:13px; margin-left:8px; }
  .pill { font-size:13px; white-space:nowrap; }
  .bars { display:flex; gap:2px; margin-top:12px; }
  .bar { flex:1; height:28px; border-radius:2px; min-width:2px; }
  .bars-legend { display:flex; justify-content:space-between; color:#52525b; font-size:11px; margin-top:6px; }
  .incident, .maint { background:#18181b; border:1px solid #27272a; border-left:3px solid #f87171; border-radius:10px; padding:14px 16px; margin-bottom:10px; }
  .incident.impact-minor { border-left-color:#fbbf24; }
  .incident.impact-major { border-left-color:#fb923c; }
  .incident.impact-critical { border-left-color:#f87171; }
  .maint { border-left-color:#60a5fa; }
  .incident-head { display:flex; justify-content:space-between; gap:10px; }
  .incident-title { font-weight:600; }
  .impact, .maint-state { font-size:12px; color:#a1a1aa; text-transform:uppercase; letter-spacing:.05em; }
  .update { margin-top:10px; font-size:14px; }
  .update-status { color:#93c5fd; font-weight:600; margin-right:8px; }
  .update-time { display:block; color:#52525b; font-size:12px; margin-top:2px; }
  .subscribe { margin-top:40px; background:#18181b; border:1px solid #27272a; border-radius:12px; padding:18px; }
  .subscribe form { display:flex; gap:8px; margin-top:10px; flex-wrap:wrap; }
  .subscribe input { flex:1; min-width:200px; background:#09090b; border:1px solid #3f3f46; color:#e4e4e7; border-radius:8px; padding:9px 12px; font-size:14px; }
  .subscribe button { background:#34d399; color:#09090b; border:0; border-radius:8px; padding:9px 16px; font-weight:600; cursor:pointer; }
  footer { margin-top:40px; color:#52525b; font-size:12px; display:flex; gap:14px; }
  footer a { color:#71717a; }
  .empty { color:#52525b; font-size:14px; }
</style>
</head>
<body>
<div class="wrap">
  <h1>${esc(s.site_name)}</h1>
  <div class="banner">${banner}</div>

  ${activeIncidents.length ? `<h2>Active incidents</h2>${activeIncidents.map(incidentBlock).join('')}` : ''}
  ${maintHtml ? `<h2>Maintenance</h2>${maintHtml}` : ''}

  <h2>Components</h2>
  ${componentHtml || '<p class="empty">No components configured yet.</p>'}

  <h2>Past incidents</h2>
  ${pastIncidents.length ? pastIncidents.map(incidentBlock).join('') : '<p class="empty">No incidents reported.</p>'}

  <div class="subscribe">
    <strong>Get notified</strong>
    <div style="color:#a1a1aa;font-size:13px">Subscribe to incident notifications by email.</div>
    <form method="POST" action="/subscribe">
      <input type="email" name="email" placeholder="you@example.com" required>
      <button>Subscribe</button>
    </form>
  </div>

  <footer>
    <a href="/feed.xml">RSS</a>
    <a href="/api/status.json">JSON API</a>
    <span>Powered by Upkeep Status — own your status page</span>
  </footer>
</div>
</body>
</html>`;
}

function renderFeed(db) {
  const s = getSettings(db);
  const base = (s.base_url || '').replace(/\/$/, '') || 'http://localhost:5342';
  const incidents = db.prepare('SELECT * FROM incidents ORDER BY created_at DESC LIMIT 50').all();
  const updatesFor = db.prepare('SELECT * FROM incident_updates WHERE incident_id = ? ORDER BY created_at ASC');
  const items = incidents.map((i) => {
    const updates = updatesFor.all(i.id)
      .map((u) => `[${INCIDENT_LABEL[u.status] || u.status}] ${u.body}`).join('\n');
    return `
    <item>
      <title>${esc(i.title)} (${i.status})</title>
      <link>${base}/#incident-${i.id}</link>
      <guid isPermaLink="false">incident-${i.id}</guid>
      <pubDate>${new Date(i.created_at).toUTCString()}</pubDate>
      <description>${esc(updates || i.title)}</description>
    </item>`;
  }).join('');
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>${esc(s.site_name)} — incidents</title>
    <link>${base}/</link>
    <description>Incident history for ${esc(s.site_name)}</description>
    ${items}
  </channel>
</rss>`;
}

module.exports = { renderPublicPage, renderFeed, maintenanceState, overallStatus, STATUS_META };
