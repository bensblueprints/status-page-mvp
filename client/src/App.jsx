import React, { useEffect, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  Activity, Lock, Layers, Siren, Wrench, Mail, Settings as SettingsIcon,
  Plus, Trash2, LogOut, ExternalLink, Copy
} from 'lucide-react';
import { api, timeAgo } from './api.js';

const COMPONENT_STATUSES = ['operational', 'degraded', 'partial_outage', 'major_outage', 'maintenance'];
const STATUS_COLOR = {
  operational: 'text-emerald-400', degraded: 'text-amber-400',
  partial_outage: 'text-orange-400', major_outage: 'text-red-400', maintenance: 'text-sky-400'
};
const INCIDENT_STATUSES = ['investigating', 'identified', 'monitoring', 'resolved'];
const IMPACTS = ['minor', 'major', 'critical'];

const inputCls = 'w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-emerald-500';
const btnCls = 'bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-zinc-950 font-medium rounded-lg px-4 py-2 text-sm transition-colors';
const btn2Cls = 'bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-lg px-3 py-2 text-sm transition-colors';

function Login({ onLogin }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setError('');
    try { await api.login(password); onLogin(); }
    catch { setError('Wrong password'); }
    finally { setBusy(false); }
  };
  return (
    <div className="min-h-screen grid place-items-center px-4">
      <motion.form initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} onSubmit={submit}
        className="w-full max-w-sm bg-zinc-900 border border-zinc-800 rounded-2xl p-8 space-y-5">
        <div className="flex items-center gap-2 justify-center text-lg font-semibold">
          <Activity className="w-6 h-6 text-emerald-400" /> Upkeep Status
        </div>
        <p className="text-sm text-zinc-500 text-center">The status page you own. Pay once, no Statuspage subscription.</p>
        <label className="block">
          <span className="text-xs text-zinc-400 uppercase tracking-wide">Admin password</span>
          <div className="mt-1.5 relative">
            <Lock className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
            <input type="password" autoFocus value={password} onChange={(e) => setPassword(e.target.value)}
              className={`${inputCls} pl-9`} placeholder="••••••••" />
          </div>
        </label>
        {error && <p className="text-sm text-red-400">{error}</p>}
        <button disabled={busy} className={`${btnCls} w-full`}>{busy ? 'Signing in…' : 'Sign in'}</button>
      </motion.form>
    </div>
  );
}

function UptimeBars({ history }) {
  return (
    <div className="flex gap-px h-6 mt-2">
      {history.map((d, idx) => (
        <div key={idx} title={d.pct == null ? `${d.date}: no data` : `${d.date}: ${d.pct}%`}
          className="flex-1 rounded-sm min-w-px"
          style={{ background: d.pct == null ? '#27272a' : d.pct >= 99.5 ? '#34d399' : d.pct >= 95 ? '#fbbf24' : '#f87171' }} />
      ))}
    </div>
  );
}

function Components() {
  const [items, setItems] = useState([]);
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const load = useCallback(() => api.components().then(setItems).catch(() => {}), []);
  useEffect(() => { load(); }, [load]);

  const add = async (e) => {
    e.preventDefault();
    await api.createComponent({ name, description: desc });
    setName(''); setDesc(''); load();
  };

  return (
    <div className="space-y-4">
      <form onSubmit={add} className="flex flex-wrap gap-2">
        <input className={`${inputCls} flex-1 min-w-40`} placeholder="Component name (e.g. API)" required value={name} onChange={(e) => setName(e.target.value)} />
        <input className={`${inputCls} flex-1 min-w-40`} placeholder="Description (optional)" value={desc} onChange={(e) => setDesc(e.target.value)} />
        <button className={`${btnCls} flex items-center gap-1`}><Plus className="w-4 h-4" /> Add</button>
      </form>
      <div className="space-y-3">
        {items.map((c) => (
          <div key={c.id} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
            <div className="flex items-center gap-3 flex-wrap">
              <span className="font-medium">{c.name}</span>
              {c.description && <span className="text-xs text-zinc-500">{c.description}</span>}
              <span className="text-xs text-zinc-500">{c.uptime_90d == null ? '' : `${c.uptime_90d}% / 90d`}</span>
              <div className="ml-auto flex items-center gap-2">
                <select value={c.status} onChange={async (e) => { await api.updateComponent(c.id, { status: e.target.value }); load(); }}
                  className={`${inputCls} w-auto ${STATUS_COLOR[c.status]}`}>
                  {COMPONENT_STATUSES.map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
                </select>
                <button title="Copy webhook URL" className={btn2Cls}
                  onClick={() => navigator.clipboard.writeText(`${window.location.origin}/hooks/component/${c.webhook_token}`)}>
                  <Copy className="w-4 h-4" />
                </button>
                <button onClick={async () => { if (confirm(`Delete ${c.name}?`)) { await api.deleteComponent(c.id); load(); } }}
                  className="text-zinc-500 hover:text-red-400 p-1"><Trash2 className="w-4 h-4" /></button>
              </div>
            </div>
            <UptimeBars history={c.history} />
            <p className="text-xs text-zinc-600 mt-2 font-mono break-all">
              POST /hooks/component/{c.webhook_token} {'{"status":"major_outage"}'} — or wire a Pingcron webhook straight in
            </p>
          </div>
        ))}
        {items.length === 0 && <div className="text-zinc-500 text-sm">No components yet — add your first above.</div>}
      </div>
    </div>
  );
}

function Incidents() {
  const [items, setItems] = useState([]);
  const [form, setForm] = useState({ title: '', body: '', impact: 'minor' });
  const [updates, setUpdates] = useState({});
  const load = useCallback(() => api.incidents().then(setItems).catch(() => {}), []);
  useEffect(() => { load(); }, [load]);

  const create = async (e) => {
    e.preventDefault();
    await api.createIncident(form);
    setForm({ title: '', body: '', impact: 'minor' });
    load();
  };

  const postUpdate = async (id) => {
    const u = updates[id];
    if (!u || !u.body) return;
    await api.postUpdate(id, u);
    setUpdates({ ...updates, [id]: { body: '', status: u.status } });
    load();
  };

  return (
    <div className="space-y-4">
      <form onSubmit={create} className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-3">
        <h3 className="font-semibold flex items-center gap-2"><Siren className="w-4 h-4 text-red-400" /> New incident</h3>
        <input className={inputCls} placeholder="Title (e.g. Elevated API error rates)" required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
        <textarea className={`${inputCls} h-20`} placeholder="First update — what's happening?" required value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} />
        <div className="flex gap-2 items-center">
          <select className={`${inputCls} w-auto`} value={form.impact} onChange={(e) => setForm({ ...form, impact: e.target.value })}>
            {IMPACTS.map((i) => <option key={i} value={i}>{i}</option>)}
          </select>
          <button className={`${btnCls} ml-auto`}>Post incident</button>
        </div>
      </form>

      {items.map((i) => (
        <div key={i.id} className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium">{i.title}</span>
            <span className={`text-xs px-2 py-0.5 rounded-full border ${i.status === 'resolved'
              ? 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10' : 'text-amber-400 border-amber-500/30 bg-amber-500/10'}`}>
              {i.status}
            </span>
            <span className="text-xs text-zinc-500">{i.impact} · {timeAgo(i.created_at)}</span>
            <button onClick={async () => { if (confirm('Delete incident?')) { await api.deleteIncident(i.id); load(); } }}
              className="ml-auto text-zinc-500 hover:text-red-400 p-1"><Trash2 className="w-4 h-4" /></button>
          </div>
          <div className="space-y-2">
            {i.updates.map((u) => (
              <div key={u.id} className="text-sm border-l-2 border-zinc-700 pl-3">
                <span className="text-sky-400 font-medium mr-2">{u.status}</span>
                <span>{u.body}</span>
                <span className="text-xs text-zinc-600 ml-2">{timeAgo(u.created_at)}</span>
              </div>
            ))}
          </div>
          {i.status !== 'resolved' && (
            <div className="flex gap-2">
              <input className={`${inputCls} flex-1`} placeholder="Post an update…"
                value={(updates[i.id] || {}).body || ''}
                onChange={(e) => setUpdates({ ...updates, [i.id]: { ...(updates[i.id] || { status: i.status }), body: e.target.value } })} />
              <select className={`${inputCls} w-auto`}
                value={(updates[i.id] || {}).status || i.status}
                onChange={(e) => setUpdates({ ...updates, [i.id]: { ...(updates[i.id] || {}), status: e.target.value } })}>
                {INCIDENT_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
              <button onClick={() => postUpdate(i.id)} className={btnCls}>Update</button>
            </div>
          )}
        </div>
      ))}
      {items.length === 0 && <div className="text-zinc-500 text-sm">No incidents — long may it last.</div>}
    </div>
  );
}

function Maintenance() {
  const [items, setItems] = useState([]);
  const [form, setForm] = useState({ title: '', body: '', starts_at: '', ends_at: '' });
  const load = useCallback(() => api.maintenance().then(setItems).catch(() => {}), []);
  useEffect(() => { load(); }, [load]);

  const create = async (e) => {
    e.preventDefault();
    await api.createMaintenance({
      title: form.title, body: form.body,
      starts_at: new Date(form.starts_at).getTime(),
      ends_at: new Date(form.ends_at).getTime()
    });
    setForm({ title: '', body: '', starts_at: '', ends_at: '' });
    load();
  };

  const stateColor = { scheduled: 'text-sky-400', in_progress: 'text-amber-400', complete: 'text-zinc-500' };

  return (
    <div className="space-y-4">
      <form onSubmit={create} className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-3">
        <h3 className="font-semibold flex items-center gap-2"><Wrench className="w-4 h-4 text-sky-400" /> Schedule maintenance</h3>
        <input className={inputCls} placeholder="Title (e.g. Database upgrade)" required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
        <textarea className={`${inputCls} h-16`} placeholder="Details (optional)" value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} />
        <div className="grid grid-cols-2 gap-3">
          <label className="text-xs text-zinc-400">Starts
            <input type="datetime-local" className={`${inputCls} mt-1`} required value={form.starts_at} onChange={(e) => setForm({ ...form, starts_at: e.target.value })} />
          </label>
          <label className="text-xs text-zinc-400">Ends
            <input type="datetime-local" className={`${inputCls} mt-1`} required value={form.ends_at} onChange={(e) => setForm({ ...form, ends_at: e.target.value })} />
          </label>
        </div>
        <div className="flex justify-end"><button className={btnCls}>Schedule</button></div>
      </form>
      <div className="space-y-2">
        {items.map((m) => (
          <div key={m.id} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex items-center gap-3 flex-wrap">
            <span className="font-medium">{m.title}</span>
            <span className={`text-xs uppercase tracking-wide ${stateColor[m.state]}`}>{m.state.replace('_', ' ')}</span>
            <span className="text-xs text-zinc-500">
              {new Date(m.starts_at).toLocaleString()} → {new Date(m.ends_at).toLocaleString()}
            </span>
            <button onClick={async () => { await api.deleteMaintenance(m.id); load(); }}
              className="ml-auto text-zinc-500 hover:text-red-400 p-1"><Trash2 className="w-4 h-4" /></button>
          </div>
        ))}
        {items.length === 0 && <div className="text-zinc-500 text-sm">Nothing scheduled. Windows auto-transition scheduled → in progress → complete.</div>}
      </div>
    </div>
  );
}

function Subscribers() {
  const [items, setItems] = useState([]);
  const load = useCallback(() => api.subscribers().then(setItems).catch(() => {}), []);
  useEffect(() => { load(); }, [load]);
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl divide-y divide-zinc-800/80">
      {items.map((s) => (
        <div key={s.id} className="p-3 px-4 flex items-center gap-3 text-sm">
          <Mail className="w-4 h-4 text-zinc-500" />
          <span>{s.email}</span>
          <span className={`text-xs ${s.confirmed ? 'text-emerald-400' : 'text-amber-400'}`}>
            {s.confirmed ? 'confirmed' : 'pending'}
          </span>
          <span className="text-xs text-zinc-600">{timeAgo(s.created_at)}</span>
          <button onClick={async () => { await api.deleteSubscriber(s.id); load(); }}
            className="ml-auto text-zinc-500 hover:text-red-400 p-1"><Trash2 className="w-4 h-4" /></button>
        </div>
      ))}
      {items.length === 0 && <div className="p-6 text-zinc-500 text-sm">No subscribers yet. The public page has a subscribe form.</div>}
    </div>
  );
}

function Settings() {
  const [s, setS] = useState(null);
  const [saved, setSaved] = useState(false);
  useEffect(() => { api.settings().then(setS).catch(() => {}); }, []);
  if (!s) return <div className="text-zinc-500 text-sm">Loading…</div>;
  const save = async (e) => {
    e.preventDefault();
    setS(await api.saveSettings(s));
    setSaved(true); setTimeout(() => setSaved(false), 2000);
  };
  const F = ({ k, label, type = 'text', ph = '' }) => (
    <label className="block">
      <span className="text-xs text-zinc-400">{label}</span>
      <input type={type} className={`${inputCls} mt-1`} placeholder={ph} value={s[k] ?? ''} onChange={(e) => setS({ ...s, [k]: e.target.value })} />
    </label>
  );
  return (
    <form onSubmit={save} className="max-w-2xl space-y-4">
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-3">
        <h3 className="font-semibold">Site</h3>
        <F k="site_name" label="Site name (shown on the public page)" />
        <F k="base_url" label="Public base URL (custom domains: point any domain at this server)" ph="https://status.yourco.com" />
      </div>
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-3">
        <h3 className="font-semibold">SMTP (subscriber notifications)</h3>
        <div className="grid md:grid-cols-2 gap-3">
          <F k="smtp_host" label="Host" /><F k="smtp_port" label="Port" />
          <F k="smtp_user" label="User" /><F k="smtp_pass" label="Password" type="password" />
          <F k="smtp_from" label="From address" />
        </div>
      </div>
      <div className="flex items-center gap-3">
        <button className={btnCls}>Save settings</button>
        {saved && <span className="text-sm text-emerald-400">Saved ✓</span>}
      </div>
    </form>
  );
}

export default function App() {
  const [authed, setAuthed] = useState(null);
  const [view, setView] = useState('components');

  useEffect(() => {
    api.me().then(() => setAuthed(true)).catch(() => setAuthed(false));
  }, []);

  if (authed === null) return null;
  if (!authed) return <Login onLogin={() => setAuthed(true)} />;

  const tabs = [
    { id: 'components', label: 'Components', icon: Layers },
    { id: 'incidents', label: 'Incidents', icon: Siren },
    { id: 'maintenance', label: 'Maintenance', icon: Wrench },
    { id: 'subscribers', label: 'Subscribers', icon: Mail },
    { id: 'settings', label: 'Settings', icon: SettingsIcon }
  ];

  return (
    <div className="min-h-screen">
      <header className="border-b border-zinc-800 bg-zinc-950/80 backdrop-blur sticky top-0 z-40">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center gap-6">
          <div className="flex items-center gap-2 font-semibold"><Activity className="w-5 h-5 text-emerald-400" /> Upkeep</div>
          <nav className="flex gap-1 overflow-x-auto">
            {tabs.map((t) => (
              <button key={t.id} onClick={() => setView(t.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm whitespace-nowrap transition-colors ${
                  view === t.id ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-400 hover:text-zinc-200'}`}>
                <t.icon className="w-4 h-4" /> {t.label}
              </button>
            ))}
          </nav>
          <a href="/" target="_blank" rel="noreferrer" className="ml-auto flex items-center gap-1 text-sm text-zinc-400 hover:text-zinc-200">
            <ExternalLink className="w-4 h-4" /> Public page
          </a>
          <button onClick={async () => { await api.logout(); setAuthed(false); }}
            className="text-zinc-500 hover:text-zinc-300 p-2"><LogOut className="w-4 h-4" /></button>
        </div>
      </header>
      <main className="max-w-5xl mx-auto px-4 py-6">
        {view === 'components' && <Components />}
        {view === 'incidents' && <Incidents />}
        {view === 'maintenance' && <Maintenance />}
        {view === 'subscribers' && <Subscribers />}
        {view === 'settings' && <Settings />}
      </main>
    </div>
  );
}
