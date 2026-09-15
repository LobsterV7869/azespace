'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Activity, AlertTriangle, Ban, BarChart3, Bell, Check, ChevronRight, Clock3,
  Command, Gauge, Globe2, Hash, LayoutDashboard, Menu, MessageSquare, Music2,
  PanelLeftClose, Radio, RotateCcw, Search, Settings, Shield, SlidersHorizontal,
  Sparkles, Users, X, Zap,
} from 'lucide-react';

const nav = [
  ['Overview', LayoutDashboard], ['Servers', Globe2], ['Commands', Command],
  ['Moderation', Shield], ['Logs', Activity], ['Modules', SlidersHorizontal], ['Settings', Settings],
];
const guilds = [
  { name: 'Night Harbor', members: 12842, online: 4210, region: 'Europe', owner: 'Mira Vale', joined: 'Jan 12, 2025' },
  { name: 'Pixel Forge', members: 8421, online: 2188, region: 'US East', owner: 'kairo.exe', joined: 'Mar 04, 2025' },
  { name: 'Archive Zero', members: 3267, online: 701, region: 'US West', owner: 'Mina Chen', joined: 'Apr 28, 2025' },
  { name: 'Drift Club', members: 1198, online: 302, region: 'Singapore', owner: 'sora', joined: 'Jun 19, 2025' },
];
const commandSeed = [
  ['ban', 'moderation', 842, true], ['kick', 'moderation', 321, true], ['warn', 'moderation', 1204, true],
  ['timeout', 'moderation', 673, true], ['purge', 'moderation', 196, true], ['userinfo', 'utility', 487, true],
  ['serverinfo', 'utility', 244, true], ['rank', 'utility', 531, false], ['giveaway', 'fun', 42, true],
  ['ticket', 'utility', 311, true], ['play', 'music', 1290, false], ['help', 'utility', 96, true],
];
const caseSeed = [
  ['timeout', 'riven#2048', 'Repeated links', 'Night Harbor', 'Mira Vale', '8m ago'],
  ['warn', 'orbitals', 'Caps flooding', 'Pixel Forge', 'kairo.exe', '42m ago'],
  ['kick', 'synthwave', 'Unapproved invite', 'Night Harbor', 'Mira Vale', '2h ago'],
  ['ban', 'voidwalker', 'Alt account evasion', 'Archive Zero', 'Mina Chen', '5h ago'],
];
const eventSeed = [
  ['command', '/timeout used by Mira Vale', 'Night Harbor', '2m ago'],
  ['moderation', 'Case #1042 created for riven#2048', 'Night Harbor', '8m ago'],
  ['join', 'Aegis connected to Drift Club', 'Drift Club', '14m ago'],
  ['config', 'Leveling module disabled', 'Pixel Forge', '28m ago'],
  ['error', 'Music provider returned a timeout', 'Archive Zero', '1h ago'],
];
const moduleSeed = ['AutoMod', 'Welcome', 'Leveling', 'Tickets', 'Music', 'Reaction roles', 'Audit logging', 'Starboard'];
const chart = [42, 58, 48, 76, 63, 84, 71, 92, 81, 110, 96, 128, 115, 142];

function readStore(key, fallback) {
  if (typeof window === 'undefined') return fallback;
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
}
function saveStore(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}
function relativeTime() { return 'just now'; }

export default function AegisDashboard() {
  const [section, setSection] = useState('Overview');
  const [mobileOpen, setMobileOpen] = useState(false);
  const [commands, setCommands] = useState(commandSeed);
  const [modules, setModules] = useState(Object.fromEntries(moduleSeed.map((name) => [name, name !== 'Music'])));
  const [autoMod, setAutoMod] = useState({ 'Block invites': true, 'Slow spam': true, 'Mass mention cap': true, 'Strip unknown links': false });
  const [cases, setCases] = useState(caseSeed);
  const [events, setEvents] = useState(eventSeed);
  const [guild, setGuild] = useState(guilds[0]);
  const [commandFilter, setCommandFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [logFilter, setLogFilter] = useState('all');
  const [toast, setToast] = useState('');
  const [settings, setSettings] = useState({ display: 'Aegis', status: 'Monitoring 4 servers', prefix: '!', language: 'English', welcome: 'Welcome {user} to {guild}.', logChannel: '#mod-logs' });

  useEffect(() => {
    setCommands(readStore('aegis-commands', commandSeed));
    setModules(readStore('aegis-modules', Object.fromEntries(moduleSeed.map((name) => [name, name !== 'Music']))));
    setCases(readStore('aegis-cases', caseSeed));
    setSettings(readStore('aegis-settings', settings));
  }, []);
  useEffect(() => { saveStore('aegis-commands', commands); }, [commands]);
  useEffect(() => { saveStore('aegis-modules', modules); }, [modules]);
  useEffect(() => { saveStore('aegis-cases', cases); }, [cases]);
  useEffect(() => { saveStore('aegis-settings', settings); }, [settings]);
  useEffect(() => {
    if (section !== 'Logs') return undefined;
    const timer = setInterval(() => setEvents((current) => [[
      ['command', '/help used by Mira Vale', 'Night Harbor', relativeTime()],
      ['join', 'New member joined the server', 'Drift Club', relativeTime()],
      ['config', 'Aegis settings viewed', 'Pixel Forge', relativeTime()],
    ][Math.floor(Math.random() * 3)], ...current].slice(0, 80)), 12000);
    return () => clearInterval(timer);
  }, [section]);

  const notify = (message) => { setToast(message); setTimeout(() => setToast(''), 2200); };
  const log = (type, text, server = guild.name) => setEvents((old) => [[type, text, server, relativeTime()], ...old].slice(0, 80));
  const toggleCommand = (name) => {
    setCommands((old) => old.map(([n, c, u, enabled]) => n === name ? [n, c, u, !enabled] : [n, c, u, enabled]));
    log('config', `/${name} was toggled`, guild.name); notify(`/${name} updated`);
  };
  const reset = () => { setCommands(commandSeed); setModules(Object.fromEntries(moduleSeed.map((name) => [name, name !== 'Music']))); setCases(caseSeed); setEvents(eventSeed); notify('Sample data reset'); };

  return (
    <main className="aegis-shell">
      <aside className={`sidebar ${mobileOpen ? 'is-open' : ''}`}>
        <div className="brand"><div className="brand-mark"><Zap size={17} /></div><span>AEGIS</span><button className="mobile-close" onClick={() => setMobileOpen(false)}><X size={18} /></button></div>
        <div className="bot-card"><span className="status-dot" /><div><strong>Aegis</strong><small>Online · 14d 06h 22m</small></div><Radio size={15} /></div>
        <nav>{nav.map(([name, Icon]) => <button key={name} className={section === name ? 'active' : ''} onClick={() => { setSection(name); setMobileOpen(false); }}><Icon size={17} />{name}{name === 'Logs' && <span className="nav-count">5</span>}</button>)}</nav>
        <div className="sidebar-footer"><div className="avatar">MV</div><div><strong>Mira Vale</strong><small>Administrator</small></div><PanelLeftClose size={16} /></div>
      </aside>
      <section className="workspace">
        <header className="topbar"><button className="mobile-menu" onClick={() => setMobileOpen(true)}><Menu size={20} /></button><div><span className="eyebrow">BOT OPERATIONS</span><h1>{section}</h1></div><div className="top-actions"><span className="live-pill"><span className="status-dot" />Online</span><button className="icon-button"><Bell size={18} /></button><div className="avatar">MV</div></div></header>
        <div className="content">{section === 'Overview' && <Overview events={events} />}
          {section === 'Servers' && <Servers selected={guild} setSelected={setGuild} notify={notify} log={log} />}
          {section === 'Commands' && <Commands commands={commands} filter={commandFilter} setFilter={setCommandFilter} search={search} setSearch={setSearch} toggle={toggleCommand} />}
          {section === 'Moderation' && <Moderation autoMod={autoMod} setAutoMod={setAutoMod} cases={cases} setCases={setCases} notify={notify} log={log} />}
          {section === 'Logs' && <Logs events={events} filter={logFilter} setFilter={setLogFilter} />}
          {section === 'Modules' && <Modules modules={modules} setModules={setModules} notify={notify} log={log} />}
          {section === 'Settings' && <SettingsPage settings={settings} setSettings={setSettings} notify={notify} reset={reset} />}
        </div>
      </section>
      {toast && <div className="toast"><Check size={16} />{toast}</div>}
    </main>
  );
}

function PageIntro({ kicker, title, children }) { return <div className="page-intro"><div><span className="eyebrow">{kicker}</span><h2>{title}</h2><p>{children}</p></div></div>; }
function Card({ children, className = '' }) { return <div className={`card ${className}`}>{children}</div>; }
function Stat({ label, value, change, icon: Icon }) { return <Card className="stat"><div className="stat-icon"><Icon size={17} /></div><span>{label}</span><strong>{value}</strong><small className="positive">{change}</small></Card>; }
function Overview({ events }) {
  return <><PageIntro kicker="COMMAND CENTER" title="Good evening, Mira." >A quiet view of your bot fleet and the activity that matters.</PageIntro><div className="stats-grid"><Stat label="Servers" value="4" change="+1 this month" icon={Globe2} /><Stat label="Members" value="25,728" change="+4.8% this week" icon={Users} /><Stat label="Commands today" value="3,842" change="+12.4% vs yesterday" icon={Command} /><Stat label="Gateway ping" value="42 ms" change="Excellent" icon={Gauge} /></div><div className="grid-2"><Card><div className="card-head"><div><span className="eyebrow">LAST 14 DAYS</span><h3>Command volume</h3></div><span className="metric">18,490 <small>total</small></span></div><MiniChart /></Card><Card><div className="card-head"><div><span className="eyebrow">INFRASTRUCTURE</span><h3>Shard health</h3></div><span className="healthy"><span className="status-dot" />All healthy</span></div><div className="shards">{[['01', '1,204', '38 ms'], ['02', '982', '44 ms'], ['03', '1,008', '43 ms']].map(([id, guilds, ping]) => <div className="shard" key={id}><span className="shard-id">{id}</span><span><strong>{guilds}</strong><small>guilds</small></span><span><strong>{ping}</strong><small>ping</small></span><span className="live-label"><span className="status-dot" />Live</span></div>)}</div></Card></div><Card><div className="card-head"><div><span className="eyebrow">RECENT ACTIVITY</span><h3>What is happening now</h3></div><button className="text-button">View all <ChevronRight size={14} /></button></div><EventRows events={events.slice(0, 4)} /></Card></>;
}
function MiniChart() { const points = chart.map((v, i) => `${i * 7.7},${128 - v * .78}`).join(' '); return <div className="chart"><svg viewBox="0 0 100 140" preserveAspectRatio="none"><defs><linearGradient id="area" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#c8ccd4" stopOpacity=".2" /><stop offset="1" stopColor="#c8ccd4" stopOpacity="0" /></linearGradient></defs><path d={`M0,140 L${points} L100,140 Z`} fill="url(#area)" /><polyline points={points} fill="none" stroke="#c8ccd4" strokeWidth="1.5" vectorEffect="non-scaling-stroke" /></svg><div className="chart-labels"><span>14 days ago</span><span>Today</span></div></div>; }
function EventRows({ events }) { return <div className="event-list">{events.map(([type, text, server, time], i) => <div className="event-row" key={`${text}-${i}`}><div className={`event-icon ${type}`}><Activity size={15} /></div><div><strong>{text}</strong><small>{server}</small></div><time>{time}</time></div>)}</div>; }
function Servers({ selected, setSelected, notify, log }) { return <><PageIntro kicker="FLEET" title="Your servers">Four connected guilds, ready for control.</PageIntro><div className="server-grid">{guilds.map((g) => <button className={`server-card ${selected.name === g.name ? 'selected' : ''}`} key={g.name} onClick={() => setSelected(g)}><div className="guild-avatar">{g.name.split(' ').map((x) => x[0]).join('')}</div><div><h3>{g.name}</h3><span>{g.region}</span></div><ChevronRight size={17} /></button>)}</div><Card className="server-detail"><div className="detail-heading"><div className="guild-avatar large">{selected.name.split(' ').map((x) => x[0]).join('')}</div><div><span className="eyebrow">SELECTED SERVER</span><h2>{selected.name}</h2><p>Connected {selected.joined}</p></div><button className="danger-button" onClick={() => { notify(`${selected.name} leave action queued`); log('leave', `Leave action requested for ${selected.name}`); }}>Leave guild</button></div><div className="detail-stats"><div><span>Members</span><strong>{selected.members.toLocaleString()}</strong></div><div><span>Online now</span><strong>{selected.online.toLocaleString()}</strong></div><div><span>Owner</span><strong>{selected.owner}</strong></div><div><span>Region</span><strong>{selected.region}</strong></div></div><div className="channel-list"><span className="eyebrow">CHANNELS</span>{['general', 'announcements', 'mod-logs', 'bot-commands'].map((c) => <div key={c}><Hash size={15} />{c}<small>active</small></div>)}</div></Card></>; }
function Toggle({ checked, onChange }) { return <button className={`toggle ${checked ? 'on' : ''}`} onClick={() => onChange(!checked)}><span /></button>; }
function Commands({ commands, filter, setFilter, search, setSearch, toggle }) { const visible = useMemo(() => commands.filter(([n, c]) => (filter === 'all' || c === filter) && n.includes(search.toLowerCase())), [commands, filter, search]); return <><PageIntro kicker="COMMANDS" title="Command library">Control what Aegis can do across your servers.</PageIntro><div className="toolbar"><div className="search"><Search size={16} /><input placeholder="Search commands" value={search} onChange={(e) => setSearch(e.target.value)} /></div><div className="tabs">{['all', 'moderation', 'utility', 'fun', 'music'].map((x) => <button className={filter === x ? 'active' : ''} onClick={() => setFilter(x)} key={x}>{x}</button>)}</div></div><Card className="table-card"><div className="table-head"><span>Command</span><span>Category</span><span>Uses today</span><span>Status</span></div>{visible.map(([name, cat, uses, enabled]) => <div className="table-row" key={name}><div><Command size={15} /><strong>/{name}</strong></div><span className={`tag ${cat}`}>{cat}</span><span className="mono">{uses.toLocaleString()}</span><Toggle checked={enabled} onChange={() => toggle(name)} /></div>)}</Card></>; }
function Moderation({ autoMod, setAutoMod, cases, setCases, notify, log }) { const addCase = () => { const item = ['warn', 'new-member', 'Manual review required', 'Night Harbor', 'Mira Vale', 'just now']; setCases([item, ...cases]); log('moderation', 'New warning case created'); notify('Case #1043 created'); }; return <><PageIntro kicker="SAFETY" title="Moderation">Set boundaries before problems become patterns.</PageIntro><Card><div className="card-head"><div><span className="eyebrow">AUTOMOD</span><h3>Guardrails</h3></div><Shield size={19} /></div><div className="setting-list">{Object.entries(autoMod).map(([name, value]) => <div className="setting-row" key={name}><div><strong>{name}</strong><small>Automatically enforce this policy</small></div><Toggle checked={value} onChange={(v) => { setAutoMod({ ...autoMod, [name]: v }); notify(`${name} ${v ? 'enabled' : 'disabled'}`); }} /></div>)}</div></Card><Card><div className="card-head"><div><span className="eyebrow">CASE HISTORY</span><h3>Recent cases</h3></div><button className="primary-button" onClick={addCase}>New case</button></div><div className="case-list">{cases.map(([action, user, reason, server, mod, time], i) => <div className="case-row" key={`${user}-${i}`}><span className={`case-type ${action}`}>{action}</span><div><strong>{user}</strong><small>{reason} · {server}</small></div><span className="muted">{mod}</span><time>{time}</time></div>)}</div></Card></>; }
function Logs({ events, filter, setFilter }) { const shown = events.filter(([type]) => filter === 'all' || type === filter); return <><PageIntro kicker="AUDIT TRAIL" title="Logs">A live, searchable record of what Aegis sees and does.</PageIntro><div className="toolbar"><div className="tabs">{['all', 'command', 'moderation', 'join', 'leave', 'error', 'config'].map((x) => <button className={filter === x ? 'active' : ''} onClick={() => setFilter(x)} key={x}>{x}</button>)}</div><span className="live-label"><span className="status-dot" />Streaming live</span></div><Card><EventRows events={shown} /></Card></>; }
function Modules({ modules, setModules, notify, log }) { return <><PageIntro kicker="EXTENSIONS" title="Modules">Small systems that make your communities feel considered.</PageIntro><div className="module-grid">{Object.entries(modules).map(([name, enabled]) => <Card key={name}><div className="module-icon">{name === 'Music' ? <Music2 size={18} /> : name === 'Welcome' ? <Bell size={18} /> : <Sparkles size={18} />}</div><div className="module-card-head"><div><h3>{name}</h3><p>{name === 'AutoMod' ? 'Keep the noise down.' : `Configure ${name.toLowerCase()} behavior.`}</p></div><Toggle checked={enabled} onChange={(v) => { setModules({ ...modules, [name]: v }); notify(`${name} ${v ? 'enabled' : 'disabled'}`); log('config', `${name} module toggled`); }} /></div></Card>)}</div></>; }
function SettingsPage({ settings, setSettings, notify, reset }) { const update = (key, value) => setSettings({ ...settings, [key]: value }); return <><PageIntro kicker="PREFERENCES" title="Settings">Tune the dashboard and the way Aegis speaks.</PageIntro><Card className="settings-form"><div className="form-grid">{[['display', 'Display name'], ['status', 'Status text'], ['prefix', 'Fallback prefix'], ['language', 'Language']].map(([key, label]) => <label key={key}>{label}<input value={settings[key]} onChange={(e) => update(key, e.target.value)} /></label>)}</div><label>Welcome message<textarea value={settings.welcome} onChange={(e) => update('welcome', e.target.value)} /></label><label>Log channel<input value={settings.logChannel} onChange={(e) => update('logChannel', e.target.value)} /></label><div className="form-actions"><button className="primary-button" onClick={() => notify('Settings saved')}>Save changes</button><button className="secondary-button" onClick={reset}><RotateCcw size={15} /> Reset sample data</button></div></Card></>; }
