const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const express = require('express');
const cookieParser = require('cookie-parser');
const {
  openDb, genToken, getSettings, setSettings,
  COMPONENT_STATUSES, INCIDENT_STATUSES, IMPACTS
} = require('./db');
const { uptimeHistory, overallUptime } = require('./uptime');
const { notifySubscribers, sendEmail } = require('./notify');
const { renderPublicPage, renderFeed, maintenanceState, overallStatus } = require('./public');

const SESSION_COOKIE = 'us_session';

function createApp({ dbPath, adminPassword, autologinToken = null } = {}) {
  const db = openDb(dbPath);
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', true);
  app.use(cookieParser());
  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));
  app.locals.db = db;

  const findComponent = db.prepare('SELECT * FROM components WHERE id = ?');
  const findIncident = db.prepare('SELECT * FROM incidents WHERE id = ?');

  function requireAuth(req, res, next) {
    const token = req.cookies[SESSION_COOKIE];
    if (token && db.prepare('SELECT id FROM sessions WHERE token = ?').get(token)) return next();
    res.status(401).json({ error: 'unauthorized' });
  }

  function createSession(res) {
    const token = crypto.randomBytes(32).toString('hex');
    db.prepare('INSERT INTO sessions (token, created_at) VALUES (?, ?)').run(token, Date.now());
    res.cookie(SESSION_COOKIE, token, { httpOnly: true, sameSite: 'lax' });
  }

  function setComponentStatus(component, status) {
    const now = Date.now();
    db.prepare('UPDATE components SET status = ? WHERE id = ?').run(status, component.id);
    db.prepare('INSERT INTO status_events (component_id, status, changed_at) VALUES (?, ?, ?)')
      .run(component.id, status, now);
  }

  function serializeIncident(i) {
    return {
      ...i,
      updates: db.prepare('SELECT * FROM incident_updates WHERE incident_id = ? ORDER BY created_at DESC').all(i.id)
    };
  }

  // ── public: status page, feed, JSON API, subscribe ──────────────────────
  app.get('/', (req, res) => {
    res.set('Content-Type', 'text/html; charset=utf-8');
    res.set('Cache-Control', 'no-cache, max-age=30');
    res.send(renderPublicPage(db));
  });

  app.get('/feed.xml', (req, res) => {
    res.set('Content-Type', 'application/rss+xml; charset=utf-8');
    res.send(renderFeed(db));
  });

  app.get('/api/status.json', (req, res) => {
    const components = db.prepare('SELECT * FROM components ORDER BY sort_order, id').all();
    const active = db.prepare("SELECT * FROM incidents WHERE status != 'resolved' ORDER BY created_at DESC").all();
    res.json({
      status: overallStatus(components),
      components: components.map((c) => ({ id: c.id, name: c.name, status: c.status })),
      active_incidents: active.map((i) => ({ id: i.id, title: i.title, status: i.status, impact: i.impact })),
      generated_at: new Date().toISOString()
    });
  });

  app.post('/subscribe', (req, res) => {
    const email = String((req.body || {}).email || '').trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      return res.status(400).send('Invalid email');
    }
    const existing = db.prepare('SELECT * FROM subscribers WHERE email = ?').get(email);
    const s = getSettings(db);
    const smtpOn = Boolean(s.smtp_host && s.smtp_from);
    let sub = existing;
    if (!existing) {
      // Without SMTP there is no confirmation loop — auto-confirm.
      const info = db.prepare('INSERT INTO subscribers (email, token, confirmed, created_at) VALUES (?, ?, ?, ?)')
        .run(email, genToken(), smtpOn ? 0 : 1, Date.now());
      sub = db.prepare('SELECT * FROM subscribers WHERE id = ?').get(info.lastInsertRowid);
    }
    if (smtpOn && !sub.confirmed) {
      const base = (s.base_url || '').replace(/\/$/, '') || `${req.protocol}://${req.get('host')}`;
      sendEmail(s, email, `Confirm your subscription — ${s.site_name}`,
        `Confirm to receive incident notifications:\n${base}/confirm/${sub.token}\n\nNot you? Ignore this email.`
      ).catch((e) => console.warn('[subscribe]', e.message));
    }
    if (req.accepts('html') && !req.is('json')) {
      res.send(`<!doctype html><html><body style="font-family:system-ui;background:#09090b;color:#e4e4e7;display:grid;place-items:center;height:100vh;margin:0">
        <div style="text-align:center"><h2>✅ ${smtpOn && !sub.confirmed ? 'Check your inbox to confirm' : 'Subscribed'}</h2>
        <p style="color:#a1a1aa"><a href="/" style="color:#34d399">← back to status page</a></p></div></body></html>`);
    } else {
      res.json({ ok: true, confirmed: Boolean(sub.confirmed) });
    }
  });

  app.get('/confirm/:token', (req, res) => {
    const sub = db.prepare('SELECT * FROM subscribers WHERE token = ?').get(req.params.token);
    if (!sub) return res.status(404).send('Unknown token');
    db.prepare('UPDATE subscribers SET confirmed = 1 WHERE id = ?').run(sub.id);
    res.redirect('/');
  });

  app.get('/unsubscribe/:token', (req, res) => {
    db.prepare('DELETE FROM subscribers WHERE token = ?').run(req.params.token);
    res.send(`<!doctype html><html><body style="font-family:system-ui;background:#09090b;color:#e4e4e7;display:grid;place-items:center;height:100vh;margin:0">
      <div style="text-align:center"><h2>Unsubscribed</h2><p style="color:#a1a1aa">You won't receive further notifications.</p></div></body></html>`);
  });

  // ── public: uptime-monitor webhook flips component status ────────────────
  // POST /hooks/component/:token  { "status": "major_outage" }  (Pingcron-style)
  // Also accepts { "event": "down" } / { "event": "up" } from Pingcron webhooks.
  app.post('/hooks/component/:token', (req, res) => {
    const c = db.prepare('SELECT * FROM components WHERE webhook_token = ?').get(req.params.token);
    if (!c) return res.status(404).json({ error: 'unknown token' });
    const b = req.body || {};
    let status = b.status;
    if (!status && b.event) status = b.event === 'down' || b.event === 'fail' ? 'major_outage' : 'operational';
    if (!COMPONENT_STATUSES.includes(status)) return res.status(400).json({ error: 'invalid status' });
    if (c.status !== status) setComponentStatus(c, status);
    res.json({ ok: true, component: c.name, status });
  });

  // ── auth ─────────────────────────────────────────────────────────────────
  app.get('/api/health', (req, res) => res.json({ ok: true, app: 'upkeep-status' }));

  app.post('/api/login', (req, res) => {
    if ((req.body || {}).password !== adminPassword) return res.status(401).json({ error: 'wrong password' });
    createSession(res);
    res.json({ ok: true });
  });

  app.post('/api/logout', (req, res) => {
    const token = req.cookies[SESSION_COOKIE];
    if (token) db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
    res.clearCookie(SESSION_COOKIE);
    res.json({ ok: true });
  });

  app.get('/auth/auto', (req, res) => {
    if (autologinToken && req.query.token === autologinToken) createSession(res);
    res.redirect('/admin/');
  });

  app.get('/api/me', requireAuth, (req, res) => res.json({ ok: true }));

  // ── components ───────────────────────────────────────────────────────────
  app.get('/api/components', requireAuth, (req, res) => {
    const rows = db.prepare('SELECT * FROM components ORDER BY sort_order, id').all();
    res.json(rows.map((c) => {
      const history = uptimeHistory(db, c, 90);
      return { ...c, uptime_90d: overallUptime(history), history };
    }));
  });

  app.post('/api/components', requireAuth, (req, res) => {
    const b = req.body || {};
    const name = String(b.name || '').trim();
    if (!name) return res.status(400).json({ error: 'name is required' });
    const now = Date.now();
    const maxOrder = db.prepare('SELECT COALESCE(MAX(sort_order), 0) AS m FROM components').get().m;
    const info = db.prepare(
      'INSERT INTO components (name, description, status, sort_order, webhook_token, created_at) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(name, String(b.description || ''), 'operational', maxOrder + 1, genToken(), now);
    db.prepare('INSERT INTO status_events (component_id, status, changed_at) VALUES (?, ?, ?)')
      .run(info.lastInsertRowid, 'operational', now);
    res.status(201).json(findComponent.get(info.lastInsertRowid));
  });

  app.put('/api/components/:id', requireAuth, (req, res) => {
    const c = findComponent.get(req.params.id);
    if (!c) return res.status(404).json({ error: 'not found' });
    const b = req.body || {};
    db.prepare('UPDATE components SET name = ?, description = ?, sort_order = ? WHERE id = ?')
      .run(String(b.name || c.name), String(b.description ?? c.description),
           Number.isFinite(Number(b.sort_order)) ? Number(b.sort_order) : c.sort_order, c.id);
    if (b.status && COMPONENT_STATUSES.includes(b.status) && b.status !== c.status) {
      setComponentStatus(c, b.status);
    }
    res.json(findComponent.get(c.id));
  });

  app.delete('/api/components/:id', requireAuth, (req, res) => {
    db.prepare('DELETE FROM status_events WHERE component_id = ?').run(req.params.id);
    db.prepare('DELETE FROM uptime_daily WHERE component_id = ?').run(req.params.id);
    db.prepare('DELETE FROM components WHERE id = ?').run(req.params.id);
    res.json({ ok: true });
  });

  // ── incidents ────────────────────────────────────────────────────────────
  app.get('/api/incidents', requireAuth, (req, res) => {
    const rows = db.prepare('SELECT * FROM incidents ORDER BY created_at DESC LIMIT 200').all();
    res.json(rows.map(serializeIncident));
  });

  app.post('/api/incidents', requireAuth, async (req, res) => {
    const b = req.body || {};
    const title = String(b.title || '').trim();
    const body = String(b.body || '').trim();
    if (!title || !body) return res.status(400).json({ error: 'title and body are required' });
    const impact = IMPACTS.includes(b.impact) ? b.impact : 'minor';
    const status = INCIDENT_STATUSES.includes(b.status) ? b.status : 'investigating';
    const now = Date.now();
    const info = db.prepare('INSERT INTO incidents (title, status, impact, created_at) VALUES (?, ?, ?, ?)')
      .run(title, status, impact, now);
    db.prepare('INSERT INTO incident_updates (incident_id, body, status, created_at) VALUES (?, ?, ?, ?)')
      .run(info.lastInsertRowid, body, status, now);
    const s = getSettings(db);
    notifySubscribers(db, `[${s.site_name}] Incident: ${title}`, `${status.toUpperCase()}: ${body}`)
      .catch((e) => console.warn('[notify]', e.message));
    res.status(201).json(serializeIncident(findIncident.get(info.lastInsertRowid)));
  });

  // Post an update (optionally moving status; resolving sets resolved_at + notifies)
  app.post('/api/incidents/:id/updates', requireAuth, async (req, res) => {
    const i = findIncident.get(req.params.id);
    if (!i) return res.status(404).json({ error: 'not found' });
    const b = req.body || {};
    const body = String(b.body || '').trim();
    if (!body) return res.status(400).json({ error: 'body is required' });
    const status = INCIDENT_STATUSES.includes(b.status) ? b.status : i.status;
    const now = Date.now();
    db.prepare('INSERT INTO incident_updates (incident_id, body, status, created_at) VALUES (?, ?, ?, ?)')
      .run(i.id, body, status, now);
    db.prepare('UPDATE incidents SET status = ?, resolved_at = ? WHERE id = ?')
      .run(status, status === 'resolved' ? now : null, i.id);
    if (status === 'resolved' && i.status !== 'resolved') {
      const s = getSettings(db);
      notifySubscribers(db, `[${s.site_name}] Resolved: ${i.title}`, `RESOLVED: ${body}`)
        .catch((e) => console.warn('[notify]', e.message));
    }
    res.status(201).json(serializeIncident(findIncident.get(i.id)));
  });

  app.delete('/api/incidents/:id', requireAuth, (req, res) => {
    db.prepare('DELETE FROM incident_updates WHERE incident_id = ?').run(req.params.id);
    db.prepare('DELETE FROM incidents WHERE id = ?').run(req.params.id);
    res.json({ ok: true });
  });

  // ── maintenance ──────────────────────────────────────────────────────────
  app.get('/api/maintenance', requireAuth, (req, res) => {
    const rows = db.prepare('SELECT * FROM maintenance ORDER BY starts_at DESC LIMIT 100').all();
    res.json(rows.map((m) => ({ ...m, state: maintenanceState(m) })));
  });

  app.post('/api/maintenance', requireAuth, (req, res) => {
    const b = req.body || {};
    const title = String(b.title || '').trim();
    const starts_at = Number(b.starts_at);
    const ends_at = Number(b.ends_at);
    if (!title || !Number.isFinite(starts_at) || !Number.isFinite(ends_at) || ends_at <= starts_at) {
      return res.status(400).json({ error: 'title, starts_at and ends_at (> starts_at) are required' });
    }
    const info = db.prepare(
      'INSERT INTO maintenance (title, body, starts_at, ends_at, components_json, created_at) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(title, String(b.body || ''), starts_at, ends_at,
          JSON.stringify(Array.isArray(b.component_ids) ? b.component_ids : []), Date.now());
    const m = db.prepare('SELECT * FROM maintenance WHERE id = ?').get(info.lastInsertRowid);
    res.status(201).json({ ...m, state: maintenanceState(m) });
  });

  app.delete('/api/maintenance/:id', requireAuth, (req, res) => {
    db.prepare('DELETE FROM maintenance WHERE id = ?').run(req.params.id);
    res.json({ ok: true });
  });

  // ── subscribers ──────────────────────────────────────────────────────────
  app.get('/api/subscribers', requireAuth, (req, res) => {
    res.json(db.prepare('SELECT id, email, confirmed, created_at FROM subscribers ORDER BY created_at DESC').all());
  });

  app.delete('/api/subscribers/:id', requireAuth, (req, res) => {
    db.prepare('DELETE FROM subscribers WHERE id = ?').run(req.params.id);
    res.json({ ok: true });
  });

  // ── settings ─────────────────────────────────────────────────────────────
  app.get('/api/settings', requireAuth, (req, res) => {
    const s = getSettings(db);
    res.json({ ...s, smtp_pass: s.smtp_pass ? '********' : '' });
  });

  app.put('/api/settings', requireAuth, (req, res) => {
    const body = { ...(req.body || {}) };
    if (body.smtp_pass === '********') delete body.smtp_pass;
    setSettings(db, body);
    const s = getSettings(db);
    res.json({ ...s, smtp_pass: s.smtp_pass ? '********' : '' });
  });

  app.post('/api/settings/test-email', requireAuth, async (req, res) => {
    const to = String((req.body || {}).to || '').trim();
    if (!to) return res.status(400).json({ error: 'recipient required' });
    try {
      const r = await sendEmail(getSettings(db), to, 'Upkeep Status SMTP test', 'Your SMTP settings work.');
      if (r.skipped) return res.status(400).json({ error: 'SMTP is not configured' });
      res.json({ ok: true });
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });

  // ── admin SPA under /admin ───────────────────────────────────────────────
  const dist = path.join(__dirname, '..', 'dist');
  if (fs.existsSync(dist)) {
    app.use('/admin', express.static(dist));
    app.get('/admin/*', (req, res) => res.sendFile(path.join(dist, 'index.html')));
  }

  return app;
}

module.exports = { createApp };
