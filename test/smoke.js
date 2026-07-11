// Upkeep Status smoke test — boots the real server and exercises components →
// webhook status flip → incident lifecycle → maintenance auto-transition →
// subscribers → public page / JSON / RSS against a temp DB.
// Kills ONLY the spawned server child (never broad-kills node processes).
const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const assert = require('node:assert');

const ROOT = path.join(__dirname, '..');
const TEST_PORT = 5442;
const ADMIN_PASSWORD = 'smoke-test-password';
const DB_PATH = path.join(__dirname, 'smoke.db');
const BASE = `http://127.0.0.1:${TEST_PORT}`;

for (const f of [DB_PATH, DB_PATH + '-wal', DB_PATH + '-shm']) {
  if (fs.existsSync(f)) fs.unlinkSync(f);
}

let serverProc = null;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitFor(fn, label, tries = 40, delay = 250) {
  for (let i = 0; i < tries; i++) {
    try {
      const v = await fn();
      if (v) return v;
    } catch { /* retry */ }
    await sleep(delay);
  }
  throw new Error(`Timed out waiting for: ${label}`);
}

let cookie = '';
async function api(pathname, options = {}) {
  const res = await fetch(BASE + pathname, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}), ...options.headers },
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const setCookie = res.headers.get('set-cookie');
  if (setCookie) cookie = setCookie.split(';')[0];
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

async function main() {
  console.log('1. Booting Upkeep Status on port', TEST_PORT, 'with temp DB');
  serverProc = spawn(process.execPath, ['server/index.js'], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(TEST_PORT), ADMIN_PASSWORD, DB_PATH, SMTP_HOST: '', SITE_NAME: 'Smoke Status' },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  serverProc.stdout.on('data', (d) => process.stdout.write(`   [server] ${d}`));
  serverProc.stderr.on('data', (d) => process.stderr.write(`   [server] ${d}`));

  await waitFor(async () => (await api('/api/health')).data.ok, 'server health');

  console.log('   Auth: wrong password → 401, unauthenticated admin API → 401, login → 200');
  assert.strictEqual((await api('/api/login', { method: 'POST', body: { password: 'nope' } })).status, 401);
  cookie = '';
  assert.strictEqual((await api('/api/components')).status, 401, 'admin API must require auth');
  assert.strictEqual((await api('/api/login', { method: 'POST', body: { password: ADMIN_PASSWORD } })).status, 200);

  console.log('2. Create components; public page + JSON show operational');
  const apiComp = await api('/api/components', { method: 'POST', body: { name: 'API', description: 'Public REST API' } });
  const webComp = await api('/api/components', { method: 'POST', body: { name: 'Web App' } });
  assert.strictEqual(apiComp.status, 201);
  assert.strictEqual(webComp.status, 201);
  assert.ok(apiComp.data.webhook_token.length >= 20, 'component must have a webhook token');

  let statusJson = (await api('/api/status.json')).data;
  assert.strictEqual(statusJson.status, 'operational', 'overall must be operational');
  assert.strictEqual(statusJson.components.length, 2);

  let pageHtml = await (await fetch(`${BASE}/`)).text();
  assert.ok(pageHtml.includes('All systems operational'), 'public page must show all-operational banner');
  assert.ok(pageHtml.includes('API') && pageHtml.includes('Web App'), 'public page must list components');
  assert.ok(pageHtml.includes('Smoke Status'), 'public page must use SITE_NAME');
  assert.ok(pageHtml.includes('class="bar"'), 'public page must render 90-day uptime bars');

  console.log('3. Uptime-monitor webhook flips component status (Pingcron-style)');
  const badHook = await fetch(`${BASE}/hooks/component/wrong-token`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'major_outage' })
  });
  assert.strictEqual(badHook.status, 404, 'unknown webhook token must 404');

  const hook = await fetch(`${BASE}/hooks/component/${apiComp.data.webhook_token}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ event: 'down' })
  });
  assert.strictEqual(hook.status, 200, 'webhook must 200');

  statusJson = (await api('/api/status.json')).data;
  assert.strictEqual(statusJson.status, 'major_outage', 'overall status must degrade');
  assert.strictEqual(statusJson.components.find((c) => c.name === 'API').status, 'major_outage');

  pageHtml = await (await fetch(`${BASE}/`)).text();
  assert.ok(pageHtml.includes('Major outage'), 'public page must reflect the outage');

  console.log('4. Incident lifecycle: create → update → resolve, timeline preserved');
  const incident = await api('/api/incidents', {
    method: 'POST',
    body: { title: 'API returning 500s', body: 'We are investigating elevated error rates.', impact: 'major' }
  });
  assert.strictEqual(incident.status, 201);
  assert.strictEqual(incident.data.status, 'investigating');
  assert.strictEqual(incident.data.updates.length, 1, 'incident must start with its first update');

  const upd = await api(`/api/incidents/${incident.data.id}/updates`, {
    method: 'POST', body: { body: 'Root cause identified: bad deploy.', status: 'identified' }
  });
  assert.strictEqual(upd.data.status, 'identified');
  assert.strictEqual(upd.data.updates.length, 2);

  const resolved = await api(`/api/incidents/${incident.data.id}/updates`, {
    method: 'POST', body: { body: 'Rolled back. All clear.', status: 'resolved' }
  });
  assert.strictEqual(resolved.data.status, 'resolved');
  assert.ok(resolved.data.resolved_at > 0, 'resolve must set resolved_at');

  pageHtml = await (await fetch(`${BASE}/`)).text();
  assert.ok(pageHtml.includes('API returning 500s'), 'public page must show the incident');
  assert.ok(pageHtml.includes('Rolled back. All clear.'), 'public page must show incident updates');

  console.log('5. RSS feed contains the incident');
  const feedRes = await fetch(`${BASE}/feed.xml`);
  assert.strictEqual(feedRes.status, 200);
  assert.ok((feedRes.headers.get('content-type') || '').includes('rss'), 'feed content-type must be rss');
  const feed = await feedRes.text();
  assert.ok(feed.includes('<rss'), 'feed must be RSS XML');
  assert.ok(feed.includes('API returning 500s'), 'feed must contain the incident title');

  console.log('6. Maintenance windows auto-transition scheduled → in_progress');
  const now = Date.now();
  const inProgress = await api('/api/maintenance', {
    method: 'POST',
    body: { title: 'DB upgrade', body: 'Failover expected', starts_at: now - 60_000, ends_at: now + 3_600_000 }
  });
  assert.strictEqual(inProgress.data.state, 'in_progress', 'window spanning now must be in_progress');
  const scheduled = await api('/api/maintenance', {
    method: 'POST',
    body: { title: 'Network move', starts_at: now + 86_400_000, ends_at: now + 90_000_000 }
  });
  assert.strictEqual(scheduled.data.state, 'scheduled', 'future window must be scheduled');
  pageHtml = await (await fetch(`${BASE}/`)).text();
  assert.ok(pageHtml.includes('DB upgrade') && pageHtml.includes('In progress'), 'public page must show in-progress maintenance');

  console.log('7. Subscribe (no SMTP → auto-confirm) + unsubscribe');
  const sub = await fetch(`${BASE}/subscribe`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'ops@example.com' })
  });
  assert.strictEqual(sub.status, 200);
  const subs = await api('/api/subscribers');
  assert.strictEqual(subs.data.length, 1);
  assert.strictEqual(subs.data[0].confirmed, 1, 'without SMTP subscriber must auto-confirm');
  const badEmail = await fetch(`${BASE}/subscribe`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'not-an-email' })
  });
  assert.strictEqual(badEmail.status, 400, 'invalid email must 400');

  console.log('8. Recovery webhook + SQLite rows verified');
  await fetch(`${BASE}/hooks/component/${apiComp.data.webhook_token}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'operational' })
  });
  statusJson = (await api('/api/status.json')).data;
  assert.strictEqual(statusJson.status, 'operational', 'overall must recover');

  const Database = require('better-sqlite3');
  const db = new Database(DB_PATH, { readonly: true });
  const events = db.prepare('SELECT status FROM status_events WHERE component_id = ? ORDER BY changed_at').all(apiComp.data.id);
  assert.deepStrictEqual(events.map((e) => e.status), ['operational', 'major_outage', 'operational'],
    'status_events must record the full flip history');
  const updateCount = db.prepare('SELECT COUNT(*) AS n FROM incident_updates WHERE incident_id = ?').get(incident.data.id).n;
  assert.strictEqual(updateCount, 3, 'incident must have 3 updates in SQLite');
  const uptimeRows = db.prepare('SELECT COUNT(*) AS n FROM uptime_daily WHERE component_id = ?').get(apiComp.data.id).n;
  assert.ok(uptimeRows >= 1, 'uptime_daily cache must be populated');
  db.close();

  console.log('\n✅ All Upkeep Status smoke tests passed');
}

async function cleanup(code) {
  if (serverProc && !serverProc.killed) serverProc.kill();
  await sleep(300);
  for (const f of [DB_PATH, DB_PATH + '-wal', DB_PATH + '-shm']) {
    try { if (fs.existsSync(f)) fs.unlinkSync(f); } catch { /* windows file lock — harmless */ }
  }
  process.exit(code);
}

main()
  .then(() => cleanup(0))
  .catch(async (err) => {
    console.error('\n❌ Smoke test failed:', err.message);
    await cleanup(1);
  });
