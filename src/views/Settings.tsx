'use client';

import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from '../lib/router';
import { Avatar, avatarTones } from '../components/Avatar';
import Dialog from '../components/Dialog';
import Icon from '../components/Icon';
import Toggle from '../components/Toggle';
import { api, ApiError, messageOf } from '../lib/api';
import { level, topicRecall } from '../store/selectors';
import { actions, fail, refresh, toast, useApp } from '../store/store';
import type { Prefs } from '../store/types';
import './Settings.css';

const sections = [
  ['account', 'Account', 'user'], ['learning', 'Learning', 'book'], ['privacy', 'Privacy', 'lock'],
  ['notifications', 'Notifications', 'bell'], ['connected', 'Connected', 'link'], ['data', 'Data & account', 'file'],
] as const;
const paces = [10, 20, 30, 50];
const detectedTz = (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { return 'UTC'; } })();
const zones: string[] = (() => { try { return (Intl as unknown as { supportedValuesOf: (k: string) => string[] }).supportedValuesOf('timeZone'); } catch { return ['UTC']; } })();
const goalLabel = { reviews: 'reviews', sessions: 'sessions', quizzes: 'quizzes' } as const;

function PrefRow({ on, onChange, t, sub, last }: { on: boolean; onChange: (v: boolean) => void; t: string; sub: string; last?: boolean }) {
  return (
    <div className={`row${last ? ' last' : ''}`} onClick={() => onChange(!on)}>
      <div><b>{t}</b><small>{sub}</small></div>
      <Toggle on={on} onChange={onChange} label={t} />
    </div>
  );
}

export default function Settings() {
  const s = useApp();
  const loc = useLocation();
  const initial = () => ({ name: s.user.name, username: s.user.username, bio: s.user.bio, tone: s.user.avatarTone, goal: String(s.user.dailyGoal), tz: s.user.timezone, prefs: { ...s.prefs } });
  const [d, setD] = useState(initial);
  const [errs, setErrs] = useState<{ name?: string; username?: string; goal?: string }>({});
  const [active, setActive] = useState<string>(loc.hash.replace('#', '') || 'account');
  const [confirm, setConfirm] = useState(false);
  const [typed, setTyped] = useState('');
  const [saving, setSaving] = useState(false);
  const lock = useRef(false);

  const typeOn = d.prefs.typeAnswers !== false;
  const dirty = d.name !== s.user.name || d.username !== s.user.username || d.bio !== s.user.bio || d.tone !== s.user.avatarTone
    || d.goal !== String(s.user.dailyGoal) || d.tz !== s.user.timezone || (Object.keys(d.prefs) as (keyof Prefs)[]).some((k) => d.prefs[k] !== s.prefs[k]);

  // Scroll-spy: highlight the last section whose top has passed ~30% of the viewport.
  useEffect(() => {
    const on = () => {
      if (lock.current) return;
      const line = window.innerHeight * 0.3;
      let cur = sections[0][0] as string;
      for (const [id] of sections) {
        const el = document.getElementById(id);
        if (el && el.getBoundingClientRect().top <= line) cur = id;
      }
      // Bottom of the page: the final section can never reach the line, so pick it.
      if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4) cur = sections[sections.length - 1][0];
      setActive(cur);
    };
    window.addEventListener('scroll', on, { passive: true });
    return () => window.removeEventListener('scroll', on);
  }, []);

  useEffect(() => {
    const id = loc.hash.replace('#', '');
    if (id) { setActive(id); document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
  }, [loc.hash]);

  const go = (id: string) => {
    setActive(id); lock.current = true; setTimeout(() => { lock.current = false; }, 700);
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    history.replaceState(null, '', `#${id}`);
  };
  const setPref = (k: keyof Prefs) => (v: boolean) => setD((x) => ({ ...x, prefs: { ...x.prefs, [k]: v } }));

  const save = async () => {
    const er: typeof errs = {};
    const uname = d.username.replace(/^@/, '').trim().toLowerCase();
    const goal = Number(d.goal);
    if (!d.name.trim()) er.name = 'Display name is required.';
    if (!/^[a-z0-9_]{3,20}$/.test(uname)) er.username = '3–20 letters, numbers or underscores.';
    if (!Number.isInteger(goal) || goal < 1 || goal > 200) er.goal = 'Pick a whole number from 1 to 200.';
    setErrs(er);
    if (Object.keys(er).length) { toast({ kind: 'error', title: 'Check the highlighted fields', body: 'Some settings need attention.' }); return; }
    setSaving(true);
    try {
      await actions.updateUser({ name: d.name.trim(), username: uname, bio: d.bio.trim(), avatarTone: d.tone, dailyGoal: goal, timezone: d.tz });
      await actions.updatePrefs(d.prefs);
      setD((x) => ({ ...x, username: uname, name: x.name.trim(), bio: x.bio.trim() }));
      toast({ kind: 'info', title: 'Settings saved', body: 'Your changes are live across the app.' });
    } catch (e) {
      if (e instanceof ApiError && e.code === 'username_taken') setErrs({ username: 'That username is taken.' });
      else fail(e);
    }
    setSaving(false);
  };
  const cancel = () => { setD(initial()); setErrs({}); };

  const exportData = async () => {
    try {
      const data = await api<unknown>('GET', '/api/me/export');
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `recallmap-export-${new Date().toISOString().slice(0, 10)}.json`; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast({ kind: 'info', title: 'Export ready', body: 'Your data was saved as a JSON file.' });
    } catch (e) { fail(e); }
  };

  /* what a visitor would see, computed from the unsaved draft */
  const topPublic = [...s.topics].filter((t) => t.cards.length).sort((a, b) => topicRecall(b) - topicRecall(a)).slice(0, 3);
  const pub = d.prefs.publicProfile;
  const matrix = [
    { t: 'Your profile page', sub: 'Name, bio, level and badges', open: pub },
    { t: 'Topic names & mastery', sub: 'Never the materials themselves', open: pub && d.prefs.showTopics },
    { t: 'Milestones in the feed', sub: 'Badges you earn, as they happen', open: d.prefs.shareFeed },
    { t: 'Notes, answers & sessions', sub: 'Always private', open: false, locked: true },
  ];
  const goalNum = Number(d.goal);

  return (
    <div className="page set">
      <div className="set-head">
        <div className="eyebrow" style={{ marginBottom: 10 }}>Preferences</div>
        <h1 className="h1">Settings</h1>
        <p className="muted">Saved to your account. Changes apply across the app when you save.</p>
      </div>

      <div className="layout">
        <nav className="snav" aria-label="Settings sections">
          {sections.map(([id, l, ic]) => (
            <button key={id} className={active === id ? 'on' : ''} onClick={() => go(id)} aria-current={active === id ? 'true' : undefined}><Icon name={ic} size={17} stroke={2.2} />{l}</button>
          ))}
        </nav>

        <div className="stack">
          {/* ───── account + live preview ───── */}
          <section id="account" className="card sc">
            <h2>Profile</h2><p>This is how you appear in the community and on your portfolio.</p>
            <div className="acct">
              <div className="acct-form">
                <div className="av-row">
                  <Avatar name={d.name || '?'} tone={d.tone} size={60} serif />
                  <div className="swatches" role="radiogroup" aria-label="Avatar colour">
                    {avatarTones.map((tn, i) => (
                      <button key={i} role="radio" aria-checked={d.tone === i} className={d.tone === i ? 'on' : ''} style={{ background: tn.bg }} onClick={() => setD((x) => ({ ...x, tone: i }))} aria-label={`Colour ${i + 1}`} />
                    ))}
                  </div>
                </div>
                <div className="two">
                  <div className="field"><label htmlFor="s-name">Display name</label>
                    <input id="s-name" className={`input${errs.name ? ' err' : ''}`} value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} maxLength={50} />
                    {errs.name && <div className="field-err">{errs.name}</div>}</div>
                  <div className="field"><label htmlFor="s-user">Username</label>
                    <input id="s-user" className={`input${errs.username ? ' err' : ''}`} value={d.username.startsWith('@') ? d.username : `@${d.username}`} onChange={(e) => setD({ ...d, username: e.target.value.replace(/^@/, '') })} maxLength={21} />
                    {errs.username && <div className="field-err">{errs.username}</div>}</div>
                </div>
                <div className="field"><label htmlFor="s-bio">Bio <span className="count tnum">{d.bio.length}/200</span></label>
                  <textarea id="s-bio" className="input" rows={2} value={d.bio} onChange={(e) => setD({ ...d, bio: e.target.value })} maxLength={200} /></div>
                <div className="field"><label htmlFor="s-tz">Time zone</label>
                  <select id="s-tz" className="input" value={d.tz} onChange={(e) => setD({ ...d, tz: e.target.value })}>
                    {zones.includes(d.tz) ? null : <option value={d.tz}>{d.tz}</option>}
                    {zones.map((z) => <option key={z} value={z}>{z.replace(/_/g, ' ')}</option>)}
                  </select>
                  <small className="hint">Your streak and “today” follow this. Detected on this device: {detectedTz}.</small></div>
                <div className="field"><label htmlFor="s-email">Email</label>
                  <input id="s-email" className="input" value={s.user.email} readOnly style={{ background: '#f4f6f4', color: 'var(--ink-3)' }} /></div>
              </div>

              <aside className="pcard" aria-label="Public profile preview">
                <span className="tagline">Preview</span>
                <div className="pc-top">
                  <Avatar name={d.name || '?'} tone={d.tone} size={52} serif />
                  <div><b>{d.name || 'Your name'}</b><small>@{d.username.replace(/^@/, '') || 'username'}</small></div>
                </div>
                <p className={d.bio ? '' : 'ph'}>{d.bio || 'Your bio appears here.'}</p>
                <div className="pc-lv"><span className="pill pill-blue tnum">Level {level(s.user.xp)}</span><span className="pill pill-dim tnum">{s.user.xp.toLocaleString()} XP</span></div>
                {pub ? (
                  d.prefs.showTopics && topPublic.length
                    ? <div className="pc-topics">{topPublic.map((t) => <span key={t.id} className="pill pill-mist">{t.name}</span>)}</div>
                    : <small className="pc-note"><Icon name="lock" size={13} />Topics are hidden</small>
                ) : <small className="pc-note"><Icon name="lock" size={13} />Private profile — only you can see this</small>}
              </aside>
            </div>
          </section>

          {/* ───── learning ───── */}
          <section id="learning" className="card sc">
            <h2>Learning</h2><p>Tune your daily goal and how sessions feel.</p>
            <div className="field">
              <label>Daily recall goal</label>
              <div className="paces" role="radiogroup" aria-label="Daily recall goal">
                {paces.map((n) => (
                  <button key={n} role="radio" aria-checked={goalNum === n} className={`pace${goalNum === n ? ' on' : ''}`} onClick={() => setD({ ...d, goal: String(n) })}><b className="tnum">{n}</b><span>cards</span></button>
                ))}
                <div className="custom">
                  <input id="s-goal" className={`input${errs.goal ? ' err' : ''}`} inputMode="numeric" aria-label="Custom daily goal" placeholder="Custom"
                    value={paces.includes(goalNum) ? '' : d.goal} onChange={(e) => setD({ ...d, goal: e.target.value.replace(/\D/g, '').slice(0, 3) })} />
                </div>
              </div>
              {errs.goal ? <div className="field-err">{errs.goal}</div> : goalNum > 0 && <small className="hint tnum">About {Math.max(1, Math.round((goalNum * 20) / 60))} {Math.max(1, Math.round((goalNum * 20) / 60)) === 1 ? 'minute' : 'minutes'} a day.</small>}
            </div>
            <GoalsManager />
            <PrefRow on={typeOn} onChange={setPref('typeAnswers')} t="Type your answer before the card turns" sub="Active recall: commit to an answer first, then check it. You still choose how it went." />
            <PrefRow on={d.prefs.reduceMotion} onChange={setPref('reduceMotion')} t="Reduce motion" sub="Calms animations like the flame, the map and card flips." last />
          </section>

          {/* ───── privacy ───── */}
          <section id="privacy" className="card sc">
            <h2>Privacy</h2><p>You choose what becomes public. Notes, answers and session details stay private by default.</p>
            <PrefRow on={d.prefs.publicProfile} onChange={setPref('publicProfile')} t="Public profile" sub="Let others view your portfolio at a shareable URL." />
            <PrefRow on={d.prefs.showTopics} onChange={setPref('showTopics')} t="Show public topics" sub="Display topic names and mastery — never the materials." />
            <PrefRow on={d.prefs.shareFeed} onChange={setPref('shareFeed')} t="Share milestones to feed" sub="Post badges and milestones to the community activity feed." last />

            <div className="matrix" aria-label="Who can see what">
              <div className="mh"><span>Who can see what</span><span>Only you</span><span>Others</span></div>
              {matrix.map((m) => (
                <div key={m.t} className="mr">
                  <div><b>{m.t}</b><small>{m.sub}</small></div>
                  <span className={`cell${m.open ? '' : ' on'}`}>{m.open ? '' : <Icon name={m.locked ? 'lock' : 'check'} size={15} stroke={2.8} />}</span>
                  <span className={`cell pub${m.open ? ' on' : ''}`}>{m.open ? <Icon name="check" size={15} stroke={2.8} /> : ''}</span>
                </div>
              ))}
            </div>
          </section>

          {/* ───── notifications ───── */}
          <section id="notifications" className="card sc">
            <h2>Notifications</h2><p>Decide what’s worth a nudge.</p>
            <PrefRow on={d.prefs.remindDaily} onChange={setPref('remindDaily')} t="Daily review reminder" sub="A gentle nudge when cards are due." />
            <PrefRow on={d.prefs.notifyBadges} onChange={setPref('notifyBadges')} t="Badges & XP" sub="Celebrate unlocks as they happen." />
            <PrefRow on={d.prefs.notifyCommunity} onChange={setPref('notifyCommunity')} t="Community activity" sub="Circle invites and challenge updates." last />
          </section>

          {/* ───── connected ───── */}
          <section id="connected" className="card sc">
            <h2>Connected</h2><p>Proof anchored on Arc, and the sign-in on this account.</p>
            <div className="conn">
              <div><span className="ci"><Icon name="shield" size={20} /></span><div><b>Arc credentials</b><small>{s.credentials.filter((c) => c.status === 'verified').length} verified · {s.credentials.filter((c) => c.status !== 'verified').length} pending or failed</small></div><Link to="/app/profile" className="btn btn-soft btn-sm">View</Link></div>
              <div><span className="ci g">@</span><div><b>Email &amp; password</b><small>{s.user.email}</small></div></div>
            </div>
          </section>

          {/* ───── data & account ───── */}
          <section id="data" className="card sc">
            <h2>Data &amp; account</h2><p>Take a copy of everything you’ve stored, or sign out.</p>
            <div className="data-grid">
              <div className="dcell">
                <span className="ci"><Icon name="file" size={20} /></span>
                <div><b>Export my data</b><small>Topics, cards, answers, quiz attempts, XP and settings as a JSON file. Passwords are never included.</small></div>
                <button className="btn btn-outline btn-sm" onClick={() => void exportData()}>Download</button>
              </div>
              <div className="dcell">
                <span className="ci"><Icon name="logout" size={20} /></span>
                <div><b>Sign out</b><small>You can sign back in anytime; your data stays safe.</small></div>
                <button className="btn btn-outline btn-sm" onClick={() => void actions.signOut()}>Sign out</button>
              </div>
            </div>
            <div className="danger">
              <div><b>Delete account</b><small>Permanently erase your account, topics, uploaded files and progress. This cannot be undone.</small></div>
              <button className="btn btn-clay btn-sm" onClick={() => setConfirm(true)}>Delete account</button>
            </div>
          </section>
        </div>
      </div>

      <div className={`savebar${dirty ? ' show' : ''}`} role="region" aria-label="Unsaved changes" aria-hidden={!dirty}>
        <span>You have unsaved changes</span>
        <button className="btn btn-outline btn-sm" onClick={cancel} tabIndex={dirty ? 0 : -1}>Cancel</button>
        <button className="btn btn-primary btn-sm" onClick={() => void save()} disabled={saving} tabIndex={dirty ? 0 : -1}>{saving ? 'Saving…' : 'Save changes'}</button>
      </div>

      {confirm && (
        <Dialog title="Delete your account?" sub="This permanently erases your account, uploaded files and progress. Type DELETE to confirm." onClose={() => { setConfirm(false); setTyped(''); }}>
          <input className="input" value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="DELETE" aria-label="Type DELETE to confirm" />
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 18 }}>
            <button className="btn btn-outline btn-sm" onClick={() => { setConfirm(false); setTyped(''); }}>Keep my account</button>
            <button className="btn btn-clay btn-sm" disabled={typed !== 'DELETE'} onClick={() => void actions.deleteAccount().catch(fail)}>Delete everything</button>
          </div>
        </Dialog>
      )}
    </div>
  );
}

/** Weekly / daily goals beyond the daily recall target. Progress is counted from your real study records. */
function GoalsManager() {
  const s = useApp();
  const [type, setType] = useState<'reviews' | 'sessions' | 'quizzes'>('reviews');
  const [target, setTarget] = useState('50');
  const [period, setPeriod] = useState<'daily' | 'weekly'>('weekly');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    const n = Number(target);
    if (!Number.isInteger(n) || n < 1 || n > 1000) { setErr('Pick a whole number from 1 to 1000.'); return; }
    setBusy(true); setErr('');
    try {
      await api('POST', '/api/me/goals', { goalType: type, targetValue: n, period });
      await refresh();
      toast({ kind: 'info', title: 'Goal added', body: period === 'weekly' ? 'Hit it this week for bonus XP.' : 'Progress resets every day.' });
    } catch (x) { setErr(messageOf(x)); }
    setBusy(false);
  };
  const remove = async (id: string) => { try { await api('DELETE', '/api/me/goals', { id }); await refresh(); } catch (x) { fail(x); } };

  return (
    <div className="field goals">
      <label>Goals</label>
      {s.goals.length === 0 && <small className="hint">No extra goals yet. Add one below — for example 50 reviews every week.</small>}
      {s.goals.map((g) => (
        <div key={g.id} className="goal-row">
          <div>
            <b>{g.targetValue} {goalLabel[g.goalType]} · {g.period}</b>
            <div className="bar bar-sm"><i style={{ width: `${Math.min(100, Math.round((g.progress / g.targetValue) * 100))}%` }} /></div>
          </div>
          <span className="tnum">{Math.min(g.progress, g.targetValue)}/{g.targetValue}{g.done ? ' ✓' : ''}</span>
          <button className="btn btn-outline btn-sm" onClick={() => void remove(g.id)} aria-label="Remove goal">Remove</button>
        </div>
      ))}
      <form className="goal-form" onSubmit={(e) => void add(e)}>
        <input className="input" inputMode="numeric" aria-label="Target" value={target} onChange={(e) => { setTarget(e.target.value.replace(/\D/g, '').slice(0, 4)); setErr(''); }} />
        <select className="input" aria-label="What to count" value={type} onChange={(e) => setType(e.target.value as typeof type)}>
          <option value="reviews">card reviews</option><option value="sessions">study sessions</option><option value="quizzes">quizzes</option>
        </select>
        <select className="input" aria-label="Period" value={period} onChange={(e) => setPeriod(e.target.value as typeof period)}>
          <option value="weekly">each week</option><option value="daily">each day</option>
        </select>
        <button className="btn btn-soft btn-sm" type="submit" disabled={busy}>Add goal</button>
      </form>
      {err && <div className="field-err">{err}</div>}
    </div>
  );
}
