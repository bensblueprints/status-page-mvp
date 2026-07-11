// 90-day uptime history per component, computed from status_events and
// cached in uptime_daily (past days are immutable; today is always recomputed).
const DAY_MS = 86_400_000;
const UP_STATUSES = new Set(['operational', 'maintenance']); // maintenance ≠ downtime

function dayKey(ms) {
  return new Date(ms).toISOString().slice(0, 10);
}

// Fraction of [from, to) the component spent "up", given its ordered events.
function upFraction(events, createdAt, from, to) {
  const start = Math.max(from, createdAt);
  if (start >= to) return null; // component didn't exist that day
  // status at `start`: last event before it (components start operational)
  let status = 'operational';
  for (const e of events) {
    if (e.changed_at <= start) status = e.status;
    else break;
  }
  let upMs = 0;
  let cursor = start;
  for (const e of events) {
    if (e.changed_at <= start) continue;
    if (e.changed_at >= to) break;
    if (UP_STATUSES.has(status)) upMs += e.changed_at - cursor;
    cursor = e.changed_at;
    status = e.status;
  }
  if (UP_STATUSES.has(status)) upMs += to - cursor;
  return upMs / (to - start);
}

function uptimeHistory(db, component, days = 90) {
  const now = Date.now();
  const todayStart = new Date(new Date(now).toISOString().slice(0, 10)).getTime();
  const events = db
    .prepare('SELECT status, changed_at FROM status_events WHERE component_id = ? ORDER BY changed_at ASC')
    .all(component.id);
  const cached = new Map(
    db.prepare('SELECT date, pct FROM uptime_daily WHERE component_id = ?').all(component.id)
      .map((r) => [r.date, r.pct])
  );
  const upsert = db.prepare(
    'INSERT INTO uptime_daily (component_id, date, pct) VALUES (?, ?, ?) ON CONFLICT(component_id, date) DO UPDATE SET pct = excluded.pct'
  );

  const out = [];
  for (let i = days - 1; i >= 0; i--) {
    const from = todayStart - i * DAY_MS;
    const to = i === 0 ? now : from + DAY_MS;
    const key = dayKey(from);
    let pct;
    if (i > 0 && cached.has(key)) {
      pct = cached.get(key);
    } else {
      const frac = upFraction(events, component.created_at, from, to);
      pct = frac == null ? null : Math.round(frac * 10000) / 100;
      if (pct != null) upsert.run(component.id, key, pct);
    }
    out.push({ date: key, pct });
  }
  return out;
}

function overallUptime(history) {
  const vals = history.map((d) => d.pct).filter((p) => p != null);
  if (!vals.length) return null;
  return Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 100) / 100;
}

module.exports = { uptimeHistory, overallUptime, upFraction };
