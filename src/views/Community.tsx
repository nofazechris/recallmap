'use client';

import { useState } from 'react';
import { Link } from '../lib/router';
import Dialog from '../components/Dialog';
import Icon from '../components/Icon';
import { MoriMark } from '../components/Mori';
import Ring from '../components/Ring';
import { api, messageOf } from '../lib/api';
import type { ChallengeLite, CircleLite, FeedLite, PersonLite } from '../lib/community';
import { useFetch } from '../lib/useFetch';
import { fail, toast, useApp } from '../store/store';
import { recommendedTopic, reviewsToday, timeAgo } from '../store/selectors';
import './Community.css';

type Tab = 'circles' | 'challenges';
const tones = ['var(--blue)', 'var(--lime)', 'var(--mist)', '#cfc9f3', '#f6d9c4', '#8abbe6'];
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const daysLeft = (iso: string) => Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 864e5));

interface CircleDetail { id: string; name: string; goal: string; description: string; joined: boolean; owner: boolean; visibility: string; inviteCode: string | null; members: { name: string; tone: number; role: string; me: boolean; username: string | null; since: string }[] }

export default function Community() {
  const s = useApp();
  const circlesQ = useFetch<{ circles: CircleLite[] }>('/api/study-circles');
  const challengesQ = useFetch<{ challenges: ChallengeLite[] }>('/api/challenges');
  const feedQ = useFetch<{ items: FeedLite[]; people: PersonLite[]; counts: { followers: number; following: number } }>('/api/feed');

  const [tab, setTab] = useState<Tab>('circles');
  const [group, setGroup] = useState<'yours' | 'discover'>('yours');
  const [open, setOpen] = useState<CircleDetail | null>(null);
  const [create, setCreate] = useState<null | 'circle' | 'challenge'>(null);
  const [name, setName] = useState('');
  const [goal, setGoal] = useState('');
  const [target, setTarget] = useState('7');
  const [metric, setMetric] = useState<'study_days' | 'reviews'>('study_days');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const circles = circlesQ.data?.circles ?? [];
  const challenges = challengesQ.data?.challenges ?? [];
  const yours = circles.filter((c) => c.joined);
  const discover = circles.filter((c) => !c.joined);
  const list = group === 'yours' ? yours : discover;
  const rec = recommendedTopic(s);
  const activeJoined = challenges.filter((c) => c.joined && !c.completed).length;

  const reloadAll = () => Promise.all([circlesQ.reload(), challengesQ.reload(), feedQ.reload()]);
  const run = async (fn: () => Promise<unknown>, ok?: { title: string; body: string }) => {
    try { await fn(); if (ok) toast({ kind: 'info', ...ok }); await reloadAll(); } catch (e) { fail(e); }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim().length < 2) { setErr(create === 'circle' ? 'Name your circle.' : 'Name your challenge.'); return; }
    setBusy(true);
    try {
      if (create === 'circle') {
        await api('POST', '/api/study-circles', { name: name.trim(), goal: goal.trim() || undefined });
        toast({ kind: 'info', title: 'Circle created', body: `${name.trim()} is live. Its 7-day focus challenge has started.` });
        setGroup('yours'); setTab('circles');
      } else {
        const n = Number(target);
        if (!Number.isInteger(n) || n < 1) { setErr('Enter a whole-number target.'); setBusy(false); return; }
        await api('POST', '/api/challenges', { title: name.trim(), description: goal.trim() || undefined, metric, target: n, days: 7 });
        toast({ kind: 'info', title: 'Challenge started', body: 'It runs for seven days — study to move it forward.' });
        setTab('challenges');
      }
      setCreate(null); setName(''); setGoal(''); setErr('');
      await reloadAll();
    } catch (e2) { setErr(messageOf(e2)); }
    setBusy(false);
  };

  const openCircle = async (c: CircleLite) => {
    try { setOpen((await api<{ circle: CircleDetail }>('GET', `/api/study-circles/${c.id}`)).circle); } catch (e) { fail(e); }
  };
  const makeInvite = async () => {
    if (!open) return;
    try { const r = await api<{ code: string }>('POST', `/api/study-circles/${open.id}/invite`); setOpen({ ...open, inviteCode: r.code }); } catch (e) { fail(e); }
  };
  const toggleCircle = (c: CircleLite, join: boolean) =>
    run(() => api(join ? 'POST' : 'DELETE', `/api/study-circles/${c.id}/membership`), join ? { title: `Joined ${c.name}`, body: 'You’ll see its goal and progress here.' } : undefined);
  const toggleChallenge = (c: ChallengeLite, join: boolean) =>
    run(() => api(join ? 'POST' : 'DELETE', `/api/challenges/${c.id}/join`), join ? { title: 'Challenge joined', body: 'Progress updates as you study.' } : undefined);
  const follow = (p: PersonLite) => run(() => api('POST', `/api/profiles/${p.userId}/follow`), { title: `Following ${p.name}`, body: 'Their shared milestones will show up here.' });

  const feed = feedQ.data?.items ?? [];
  const people = feedQ.data?.people ?? [];

  return (
    <div className="page comm">
      <div className="page-head">
        <div style={{ minWidth: 0 }}>
          <div className="eyebrow" style={{ marginBottom: 10 }}>Community</div>
          <h1 className="h1">Better learning happens <span className="grad-text">together.</span></h1>
          <p className="muted" style={{ fontSize: 16, maxWidth: '40em', marginTop: 8 }}>Study circles, shared challenges and milestones — accountability, not a popularity contest.</p>
        </div>
        <button className="btn btn-dark" onClick={() => { setErr(''); setCreate(tab === 'challenges' ? 'challenge' : 'circle'); }}><Icon name="plus" size={17} stroke={2.5} />{tab === 'challenges' ? 'Start a challenge' : 'Create a circle'}</button>
      </div>

      <div className="cstats">
        <div><b className="tnum">{yours.length}</b><span>{yours.length === 1 ? 'circle joined' : 'circles joined'}</span></div>
        <div><b className="tnum"><Icon name="flame" size={26} />{activeJoined}</b><span>active {activeJoined === 1 ? 'challenge' : 'challenges'}</span></div>
        <div><b className="tnum">{reviewsToday(s)}/{s.user.dailyGoal}</b><span>recalls today</span></div>
        <div><b className="tnum">{feedQ.data?.counts.following ?? 0}</b><span>following</span></div>
      </div>

      <div className="cols">
        <div className="main">
          <div className="tabs" role="tablist">
            <button role="tab" aria-selected={tab === 'circles'} className={tab === 'circles' ? 'on' : ''} onClick={() => setTab('circles')}>Circles</button>
            <button role="tab" aria-selected={tab === 'challenges'} className={tab === 'challenges' ? 'on' : ''} onClick={() => setTab('challenges')}>Challenges</button>
          </div>

          {tab === 'circles' && (
            <div className="rise">
              <div className="seg" role="tablist" aria-label="Circles" style={{ marginBottom: 16 }}>
                <button role="tab" aria-selected={group === 'yours'} className={group === 'yours' ? 'on' : ''} onClick={() => setGroup('yours')}>Yours<em className="tnum">{yours.length}</em></button>
                <button role="tab" aria-selected={group === 'discover'} className={group === 'discover' ? 'on' : ''} onClick={() => setGroup('discover')}>Discover<em className="tnum">{discover.length}</em></button>
              </div>

              {circlesQ.error && <div className="empty-card"><b>Couldn’t load circles</b><p>{circlesQ.error}</p><button className="btn btn-outline btn-sm" onClick={() => void circlesQ.reload()}>Try again</button></div>}
              {!circlesQ.error && !circlesQ.loading && list.length === 0 && (
                <div className="empty-card">
                  <MoriMark size={48} />
                  <b>{group === 'yours' ? 'You haven’t joined a circle yet' : 'No other circles to discover yet'}</b>
                  <p>{group === 'yours' ? 'A small group with a shared goal makes it easier to show up. Start one — others can find and join it.' : 'Be the first: start a circle and let others find it.'}</p>
                  <button className="btn btn-primary btn-sm" onClick={() => { setErr(''); setCreate('circle'); }}>Create a circle</button>
                </div>
              )}
              {list.length > 0 && (
                <div className="cgrid">
                  {list.map((c) => (
                    <article key={c.id} className="card ccard">
                      <div className="ct">
                        <Ring value={c.progress} size={56} stroke={3.8} id={`c-${c.id}`}>{c.progress}%</Ring>
                        <div><b>{c.name}</b><small className="tnum">{plural(c.members, 'learner')}</small></div>
                      </div>
                      <p className="goal">Goal: {c.goal}</p>
                      <div className="avs" aria-hidden="true">
                        {c.tones.map((t, i) => <i key={i} style={{ background: tones[t % tones.length] }} />)}
                        {c.members > c.tones.length && <i className="more tnum">+{c.members - c.tones.length}</i>}
                      </div>
                      <div className="cb">
                        <button className="btn btn-outline btn-sm" onClick={() => void openCircle(c)}>Open</button>
                        {c.joined
                          ? (c.owner ? <span className="pill pill-lime">Owner</span> : <button className="btn btn-sm joined" onClick={() => void toggleCircle(c, false)} aria-label={`Leave ${c.name}`}><Icon name="check" size={14} stroke={3} />Joined</button>)
                          : <button className="btn btn-primary btn-sm" onClick={() => void toggleCircle(c, true)}>Join</button>}
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </div>
          )}

          {tab === 'challenges' && (
            <div className="chals rise">
              {challengesQ.error && <div className="empty-card"><b>Couldn’t load challenges</b><p>{challengesQ.error}</p></div>}
              {!challengesQ.error && !challengesQ.loading && challenges.length === 0 && (
                <div className="empty-card">
                  <MoriMark size={48} />
                  <b>No active challenges</b>
                  <p>Start one — for example, study on seven days in a row — and invite your circle.</p>
                  <button className="btn btn-primary btn-sm" onClick={() => { setErr(''); setCreate('challenge'); }}>Start a challenge</button>
                </div>
              )}
              {challenges.map((c) => {
                const pct = Math.min(100, Math.round((c.progress / c.target) * 100));
                return (
                  <article key={c.id} className={`card chal${c.completed ? ' done' : ''}`}>
                    <div className="ch-h">
                      <span className="ico"><Icon name={c.metric === 'reviews' ? 'target' : 'flame'} size={22} /></span>
                      <div><b>{c.title}</b><small>{c.description || (c.metric === 'reviews' ? `Complete ${c.target} reviews.` : `Study on ${c.target} days.`)}{c.circleName ? ` · ${c.circleName}` : ''}</small></div>
                      <span className={`pill ${c.completed ? 'pill-lime' : 'pill-blue'} tnum`}>{c.completed ? 'Complete' : c.joined ? `${c.progress}/${c.target}` : `${plural(c.participants, 'learner')}`}</span>
                    </div>
                    {c.joined && <div className="bar"><i style={{ width: `${pct}%` }} /></div>}
                    <div className="foot">
                      <small>{c.completed ? 'Nicely done.' : `${plural(daysLeft(c.endsAt), 'day')} left · ${plural(c.participants, 'learner')}`}</small>
                      {c.joined
                        ? (!c.completed && <Link to={rec ? `/study/${rec.id}` : '/app'} className="btn btn-primary btn-sm">Study now<Icon name="arrow" size={15} stroke={2.5} /></Link>)
                        : <button className="btn btn-primary btn-sm" onClick={() => void toggleChallenge(c, true)}>Join</button>}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>

        {/* ───── feed ───── */}
        <aside className="side">
          <div className="fh"><div className="caps">Activity</div></div>
          <div className="card feed" aria-live="polite">
            {feed.map((f) => (
              <div key={f.id} className={`it${f.mine ? ' mine' : ''}`}>
                <span className="av" style={{ background: tones[f.who.tone % tones.length] }}>{f.who.name[0]}</span>
                <div>
                  <p>{f.mine ? <strong>You</strong> : <Link to={`/u/${f.who.username}`} className="nm"><strong>{f.who.name}</strong></Link>} {f.text}.</p>
                  <div className="meta">{f.mine && <span className="pill pill-dim">{s.prefs.shareFeed ? 'Shared' : 'Only you can see this'}</span>}<small>{timeAgo(f.at)}</small></div>
                </div>
              </div>
            ))}
            {feed.length === 0 && <p className="muted" style={{ padding: '22px 0', fontSize: 14 }}>Your milestones and those of people you follow appear here.</p>}
          </div>

          {people.length > 0 && (
            <div className="card feed" style={{ marginTop: 14 }}>
              <div className="caps" style={{ padding: '14px 0 4px' }}>People to follow</div>
              {people.map((p) => (
                <div key={p.userId} className="it">
                  <Link to={`/u/${p.username}`} className="av" style={{ background: tones[p.tone % tones.length] }}>{p.name[0]}</Link>
                  <div style={{ flex: 1, minWidth: 0 }}><p><Link to={`/u/${p.username}`} className="nm"><strong>{p.name}</strong></Link></p><small className="muted">@{p.username}</small></div>
                  <button className="btn btn-soft btn-sm" onClick={() => void follow(p)}>Follow</button>
                </div>
              ))}
            </div>
          )}
          <div className="card mori-note"><MoriMark size={40} /><span>Only milestones you choose to share show up for others. Your notes and answers stay private. <Link to="/app/settings#privacy">Privacy settings</Link></span></div>
        </aside>
      </div>

      {/* ───── circle detail ───── */}
      {open && (
        <Dialog title={open.name} sub={open.goal ? `Goal: ${open.goal}` : open.description || undefined} onClose={() => setOpen(null)}>
          <div className="cd">
            <div className="caps" style={{ margin: '4px 0 10px' }}>Members · {open.members.length}</div>
            <ul className="mem">
              {open.members.map((m) => (
                <li key={m.name + m.since} className={m.me ? 'you' : ''}>
                  <i style={{ background: tones[m.tone % tones.length] }}>{m.name[0]}</i>
                  {m.username && !m.me ? <Link to={`/u/${m.username}`}><b>{m.name}</b></Link> : <b>{m.me ? 'You' : m.name}</b>}
                  <span>{m.role === 'owner' ? 'owner' : `joined ${timeAgo(m.since).toLowerCase()}`}</span>
                </li>
              ))}
            </ul>
            {open.owner && (
              <div className="invite-box">
                <div className="caps">Invite link</div>
                {open.inviteCode ? (
                  <>
                    <input className="input" readOnly value={`${typeof window !== 'undefined' ? window.location.origin : ''}/join/${open.inviteCode}`} onFocus={(e) => e.currentTarget.select()} aria-label="Invite link" />
                    <div className="row">
                      <button className="btn btn-soft btn-sm" onClick={() => { void navigator.clipboard?.writeText(`${window.location.origin}/join/${open.inviteCode}`).then(() => toast({ kind: 'info', title: 'Link copied', body: 'Anyone with it can join this circle.' })); }}>Copy link</button>
                      <button className="btn btn-outline btn-sm" onClick={() => void makeInvite()}>Replace link</button>
                    </div>
                    <small className="muted">Replacing the link stops the old one from working.</small>
                  </>
                ) : (
                  <button className="btn btn-soft btn-sm" onClick={() => void makeInvite()}>Create invite link</button>
                )}
              </div>
            )}
          </div>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 18, flexWrap: 'wrap' }}>
            <button className="btn btn-outline btn-sm" onClick={() => setOpen(null)}>Close</button>
            {open.joined && !open.owner && <button className="btn btn-outline btn-sm" onClick={() => { void run(() => api('DELETE', `/api/study-circles/${open.id}/membership`)); setOpen(null); }}>Leave circle</button>}
            {!open.joined && <button className="btn btn-primary btn-sm" onClick={() => { void run(() => api('POST', `/api/study-circles/${open.id}/membership`), { title: `Joined ${open.name}`, body: 'You’ll see its goal and progress here.' }); setOpen(null); }}>Join circle</button>}
          </div>
        </Dialog>
      )}

      {create && (
        <Dialog title={create === 'circle' ? 'Create a circle' : 'Start a challenge'} sub={create === 'circle' ? 'A small group with a shared goal. Public circles can be found by other learners.' : 'Runs for seven days. Anyone can join.'} onClose={() => setCreate(null)}>
          <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }} noValidate>
            <div className="field"><label htmlFor="c-name">{create === 'circle' ? 'Circle name' : 'Challenge name'}</label>
              <input id="c-name" className={`input${err ? ' err' : ''}`} value={name} onChange={(e) => { setName(e.target.value); setErr(''); }} placeholder={create === 'circle' ? 'e.g. Midterm Sprint' : 'e.g. Seven days of recall'} maxLength={create === 'circle' ? 60 : 80} autoFocus />
              {err && <div className="field-err">{err}</div>}</div>
            <div className="field"><label htmlFor="c-goal">{create === 'circle' ? 'Shared goal' : 'Description (optional)'}</label>
              <input id="c-goal" className="input" value={goal} onChange={(e) => setGoal(e.target.value)} placeholder={create === 'circle' ? 'e.g. Study together every weekday' : 'What is this challenge about?'} maxLength={160} /></div>
            {create === 'challenge' && (
              <div style={{ display: 'flex', gap: 12 }}>
                <div className="field" style={{ flex: 1 }}><label htmlFor="c-metric">Counts</label>
                  <select id="c-metric" className="input" value={metric} onChange={(e) => setMetric(e.target.value as 'study_days' | 'reviews')}><option value="study_days">Study days</option><option value="reviews">Reviews</option></select></div>
                <div className="field" style={{ width: 110 }}><label htmlFor="c-target">Target</label>
                  <input id="c-target" className="input" inputMode="numeric" value={target} onChange={(e) => setTarget(e.target.value.replace(/\D/g, ''))} /></div>
              </div>
            )}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 6 }}>
              <button type="button" className="btn btn-outline btn-sm" onClick={() => setCreate(null)}>Cancel</button>
              <button type="submit" className="btn btn-primary btn-sm" disabled={busy}>{busy ? 'Creating…' : create === 'circle' ? 'Create circle' : 'Start challenge'}</button>
            </div>
          </form>
        </Dialog>
      )}
    </div>
  );
}
