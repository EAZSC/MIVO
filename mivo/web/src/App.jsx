import { useState, useEffect, useRef } from 'react';
const API = import.meta.env.VITE_API_URL || '';
let access = null;
const store = {
  get: () => { try { return localStorage.getItem('rt'); } catch { return null; } },
  set: (v) => { try { v ? localStorage.setItem('rt', v) : localStorage.removeItem('rt'); } catch {} },
};
async function raw(path, method, body, token) {
  let r;
  try {
    r = await fetch(API + path, { method, headers: { 'Content-Type': 'application/json', ...(token && { Authorization: 'Bearer ' + token }) }, body: body && JSON.stringify(body) });
  } catch { throw Object.assign(new Error('Tarmoq xatosi: serverga ulanib bo\'lmadi'), { status: 0 }); }
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(j.error?.message || 'Xato ' + r.status), { status: r.status });
  return j;
}
async function refresh() {
  const rt = store.get(); if (!rt) throw new Error('login');
  try { const t = await raw('/v1/auth/refresh', 'POST', { refreshToken: rt }); access = t.accessToken; store.set(t.refreshToken); }
  catch (e) { if (e.status === 401) store.set(null); throw e; }
}
async function api(path, method = 'GET', body) {
  try { return await raw(path, method, body, access); }
  catch (e) { if (e.status === 401 && store.get()) { await refresh(); return raw(path, method, body, access); } throw e; }
}
const Shell = ({ children }) => <main className="wrap"><section className="glass card"><img className="logo" src="/logo.png" alt="MIVO" />{children}</section></main>;

function useBusy() {
  const [busy, setBusy] = useState(false); const [msg, setMsg] = useState('');
  const run = (fn) => async () => { setBusy(true); setMsg(''); try { await fn(); } catch (e) { setMsg(e.message); } setBusy(false); };
  return { busy, msg, setMsg, run };
}

function Login({ onDone }) {
  const [phone, setPhone] = useState('+998'); const [code, setCode] = useState(''); const [step, setStep] = useState('phone'); const [dev, setDev] = useState('');
  const { busy, msg, run } = useBusy();
  const send = run(async () => { const r = await raw('/v1/auth/request-code', 'POST', { phone }); setDev(r.devCode || ''); setStep('code'); });
  const verify = run(async () => {
    const t = await raw('/v1/auth/verify-code', 'POST', { phone, code, deviceName: 'Web' });
    access = t.accessToken; store.set(t.refreshToken); onDone(await api('/v1/me'));
  });
  return (<Shell>
    {step === 'phone'
      ? <input className="glass field" value={phone} onChange={e => setPhone(e.target.value)} inputMode="tel" aria-label="Telefon" />
      : <input className="glass field" value={code} onChange={e => setCode(e.target.value)} inputMode="numeric" placeholder="SMS kod" aria-label="Kod" />}
    {dev && <p className="mut">Sinov rejimi, kod: <b>{dev}</b></p>}
    <button className="btn primary" disabled={busy} onClick={step === 'phone' ? send : verify}>{busy ? '…' : step === 'phone' ? 'Kod yuborish' : 'Kirish'}</button>
    {msg && <p className="err" role="alert">{msg}</p>}
  </Shell>);
}

function Setup({ onDone }) {
  const [u, setU] = useState(''); const [n, setN] = useState(''); const { busy, msg, run } = useBusy();
  const save = run(async () => onDone(await api('/v1/me', 'PUT', { username: u, displayName: n })));
  return (<Shell>
    <p className="mut">Profilingizni to'ldiring</p>
    <input className="glass field" placeholder="username (a-z, 0-9, _)" value={u} onChange={e => setU(e.target.value)} autoCapitalize="none" />
    <input className="glass field" placeholder="Ism" value={n} onChange={e => setN(e.target.value)} />
    <button className="btn primary" disabled={busy} onClick={save}>Saqlash</button>
    {msg && <p className="err" role="alert">{msg}</p>}
  </Shell>);
}

function Chats({ me, onLogout }) {
  const [chats, setChats] = useState([]); const [active, setActive] = useState(null);
  const [msgs, setMsgs] = useState([]); const [text, setText] = useState(''); const [q, setQ] = useState(''); const [found, setFound] = useState([]);
  const [err, setErr] = useState(''); const [online, setOnline] = useState(false);
  const activeRef = useRef(null); const endRef = useRef(null);
  const load = () => api('/v1/chats').then(setChats).catch(e => setErr(e.message));
  useEffect(() => { activeRef.current = active?.id; }, [active]);
  useEffect(() => { load(); }, []);
  useEffect(() => { endRef.current?.scrollIntoView({ block: 'end' }); }, [msgs]);
  useEffect(() => {
    let ws, stop = false, timer;
    const connect = async () => {
      await api('/v1/me').catch(() => {});
      if (stop) return;
      ws = new WebSocket(API.replace(/^http/, 'ws') + '/ws?token=' + encodeURIComponent(access || ''));
      ws.onopen = () => setOnline(true);
      ws.onmessage = (e) => {
        const ev = JSON.parse(e.data);
        if (ev.type === 'message') {
          const m = ev.message;
          if (m.conversationId === activeRef.current) setMsgs(p => p.some(x => x.id === m.id) ? p : [...p, m]);
          load();
        }
      };
      ws.onclose = () => { setOnline(false); if (!stop) timer = setTimeout(connect, 3000); };
    };
    connect();
    return () => { stop = true; clearTimeout(timer); ws?.close(); };
  }, []);
  useEffect(() => {
    if (q.length < 2) { setFound([]); return; }
    const t = setTimeout(() => api('/v1/users/search?q=' + encodeURIComponent(q)).then(setFound).catch(() => {}), 250);
    return () => clearTimeout(t);
  }, [q]);
  const open = async (c) => { setActive(c); setMsgs([]); setErr(''); try { setMsgs(await api(`/v1/chats/${c.id}/messages`)); } catch (e) { setErr(e.message); } };
  const start = async (u) => {
    try { const { id } = await api('/v1/chats', 'POST', { userId: u.id }); setQ(''); setFound([]); await load();
      open({ id, user_id: u.id, username: u.username, display_name: u.display_name }); } catch (e) { setErr(e.message); }
  };
  const send = async (e) => {
    e.preventDefault(); const body = text.trim(); if (!body || !active) return; setText('');
    try { const m = await api(`/v1/chats/${active.id}/messages`, 'POST', { body }); setMsgs(p => p.some(x => x.id === m.id) ? p : [...p, m]); }
    catch (er) { setErr(er.message); setText(body); }
  };
  return (<div className={'app' + (active ? ' chat-open' : '')}>
    <aside className="glass side">
      <header><b>@{me.username}</b><span className={'dot' + (online ? ' on' : '')} title={online ? 'Ulangan' : 'Uzilgan'} />
        <button className="btn mini" onClick={onLogout}>Chiqish</button></header>
      <input className="glass field" placeholder="Username qidirish" value={q} onChange={e => setQ(e.target.value)} autoCapitalize="none" />
      <div className="list">
        {found.map(u => <button key={u.id} className="row" onClick={() => start(u)}><b>{u.display_name}</b><span className="mut">@{u.username}</span></button>)}
        {!q && chats.map(c => <button key={c.id} className={'row' + (active?.id === c.id ? ' sel' : '')} onClick={() => open(c)}>
          <b>{c.display_name}</b><span className="mut">{c.last_body || 'Yangi suhbat'}</span></button>)}
        {!q && !chats.length && <p className="mut pad">Suhbat yo'q. Username bo'yicha qidiring.</p>}
      </div>
    </aside>
    <section className="glass pane">
      {active ? (<>
        <header><button className="btn mini back" onClick={() => setActive(null)}>‹</button><b>{active.display_name}</b></header>
        <div className="msgs">{msgs.map(m => <div key={m.id} className={'bub' + (m.senderId === me.id ? ' me' : '')}>{m.body}</div>)}<div ref={endRef} /></div>
        <form className="send" onSubmit={send}>
          <input className="glass field" value={text} onChange={e => setText(e.target.value)} placeholder="Xabar…" maxLength={4000} />
          <button className="btn primary" disabled={!text.trim()}>➤</button></form>
      </>) : <p className="mut pad">Suhbatni tanlang</p>}
      {err && <p className="err pad" role="alert">{err}</p>}
    </section>
  </div>);
}

export default function App() {
  const [me, setMe] = useState(undefined);
  useEffect(() => { (async () => {
    try { if (!store.get()) return setMe(null); await refresh(); setMe(await api('/v1/me')); } catch { setMe(null); }
  })(); }, []);
  const logout = async () => { try { await raw('/v1/auth/logout', 'POST', { refreshToken: store.get() }); } catch {} store.set(null); access = null; setMe(null); };
  if (me === undefined) return <Shell><p className="mut">Yuklanmoqda…</p></Shell>;
  if (!me) return <Login onDone={setMe} />;
  if (!me.username) return <Setup onDone={setMe} />;
  return <Chats me={me} onLogout={logout} />;
}
