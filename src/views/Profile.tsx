'use client';

import { useEffect, useState } from 'react';
import { Link } from '../lib/router';
import { Avatar } from '../components/Avatar';
import Icon from '../components/Icon';
import Ring from '../components/Ring';
import { api } from '../lib/api';
import { useFetch } from '../lib/useFetch';
import { actions, fail, refresh, toast, useApp } from '../store/store';
import { badgeDefs, conceptState, level, topicDue, topicRecall, weekBars } from '../store/selectors';
import './Profile.css';

type Tab = 'overview' | 'badges' | 'topics' | 'proof';
const tabs: { id: Tab; label: string }[] = [{ id: 'overview', label: 'Overview' }, { id: 'badges', label: 'Badges' }, { id: 'topics', label: 'Topics' }, { id: 'proof', label: 'Proof' }];
const stateLbl = { mastered: 'Mastered', strong: 'Strong', learning: 'Learning', due: 'Due', unexplored: 'New' } as const;
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
/** Credentials are only offered for mastery badges. */
const ELIGIBLE = ['recall-ready', 'topic-master'];
const EXPLORER = process.env.NEXT_PUBLIC_ARC_EXPLORER_URL;

interface PublicProfile {
  userId: string; username: string; name: string; bio: string; tone: number; level: number; xp: number; isMe: boolean; following: boolean;
  counts: { followers: number; following: number };
  badges: { code: string; name: string; icon: string; at: string }[];
  showcase: string[];
  credentials: { id: string; code: string; name: string; topic: string | null; txHash: string | null; verifiedAt: string | null }[];
  topics: { id: string; title: string; category: string }[] | null;
}

/** /app/profile — your own portfolio. /u/:username — someone else's public page. */
export default function Profile({ username }: { username?: string }) {
  const s = useApp();
  const [tab, setTab] = useState<Tab>('overview');
  const handle = username ?? s.user.username;
  const isMe = !username || username.toLowerCase() === s.user.username.toLowerCase();
  const prof = useFetch<{ profile: PublicProfile }>(`/api/profiles/${encodeURIComponent(handle)}`);
  const p = prof.data?.profile;

  if (!isMe && prof.error) {
    return (
      <div className="page prof">
        <Link to="/app/community" className="backlink">← Back to community</Link>
        <div className="empty-card"><Icon name="lock" size={22} /><b>This profile is private or doesn’t exist</b><p>People choose whether their profile is public.</p></div>
      </div>
    );
  }

  const defs = badgeDefs(s);
  const earned = defs.filter((b) => s.earned[b.id]);
  const myTopics = [...s.topics].filter((t) => t.cards.length).sort((a, b) => topicRecall(b) - topicRecall(a));
  const pinned = s.user.showcase.filter((id) => s.earned[id]);
  const mineShowcase = (pinned.length ? pinned : earned.slice(0, 3).map((b) => b.id)).map((id) => defs.find((b) => b.id === id)).filter((b): b is NonNullable<typeof b> => !!b);
  const week = weekBars(s);
  const maxWeek = Math.max(1, ...week.map((w) => w.value));
  const hidden = isMe && !s.prefs.showTopics;
  const verified = isMe ? s.credentials.filter((c) => c.status === 'verified') : (p?.credentials ?? []);

  const name = isMe ? s.user.name : p?.name ?? '';
  const bio = isMe ? s.user.bio : p?.bio ?? '';
  const tone = isMe ? s.user.avatarTone : p?.tone ?? 0;
  const stats: [number, string][] = isMe
    ? [[s.user.streak, 'day streak'], [s.topics.length, 'topics'], [earned.length, 'badges'], [verified.length, 'verified on Arc']]
    : [[p?.level ?? 1, 'level'], [p?.badges.length ?? 0, 'badges'], [p?.counts.followers ?? 0, 'followers'], [verified.length, 'verified on Arc']];

  const share = async () => {
    const url = `${location.origin}/u/${handle}`;
    try { await navigator.clipboard.writeText(url); toast({ kind: 'info', title: 'Link copied', body: url }); }
    catch { toast({ kind: 'info', title: 'Profile link', body: url }); }
  };
  const pin = async (id: string) => {
    try { if (!(await actions.toggleShowcase(id))) toast({ kind: 'info', title: 'Showcase is full', body: 'Unpin a badge first — you can show three.' }); } catch (e) { fail(e); }
  };
  const follow = async () => {
    if (!p) return;
    try { await api(p.following ? 'DELETE' : 'POST', `/api/profiles/${p.userId}/follow`); await prof.reload(); } catch (e) { fail(e); }
  };

  return (
    <div className="page prof">
      {!isMe && <Link to="/app/community" className="backlink">← Back to community</Link>}

      <section className="hero">
        <div className="cover" aria-hidden="true"><i /><i /><i /></div>
        <div className="id">
          <div className="av"><Avatar name={name || '?'} tone={tone} size={104} serif /></div>
          <div className="who">
            <h1 className="h1">{name || ' '}</h1>
            <div className="handle">@{handle}</div>
            <p className={`bio${bio ? '' : ' ph'}`}>{bio || (isMe ? 'Add a bio in Settings.' : 'No bio yet.')}</p>
            <div className="chips">
              <span className="pill pill-blue tnum">Level {isMe ? level(s.user.xp) : p?.level ?? 1}</span>
              {isMe && s.user.streak > 0 && <span className="pill streak tnum"><Icon name="flame" size={22} />{s.user.streak}-day streak</span>}
              {isMe && myTopics.slice(0, 2).map((t) => <span key={t.id} className="pill pill-mist">{t.name}</span>)}
              {!isMe && p?.topics?.slice(0, 2).map((t) => <span key={t.id} className="pill pill-mist">{t.title}</span>)}
            </div>
          </div>
          <div className="acts">
            {isMe
              ? <Link to="/app/settings" className="btn btn-primary btn-sm"><Icon name="edit" size={15} stroke={2.4} />Edit profile</Link>
              : <button className={`btn btn-sm ${p?.following ? 'btn-soft' : 'btn-primary'}`} onClick={follow} disabled={!p}>{p?.following ? 'Following' : 'Follow'}</button>}
            {(isMe ? s.prefs.publicProfile : true) && <button className="btn btn-outline btn-icon-sm" onClick={share} aria-label="Copy profile link"><Icon name="share" size={18} stroke={2.2} /></button>}
          </div>
        </div>
        <dl className="stats">
          {stats.map(([n, l]) => <div key={l}><dt>{l}</dt><dd className="tnum">{n}</dd></div>)}
        </dl>
      </section>

      {isMe && !s.prefs.publicProfile && (
        <div className="privnote"><Icon name="lock" size={16} />Your profile is private — only you can see this page. Change it in <Link to="/app/settings#privacy">Privacy settings</Link>.</div>
      )}

      <div className="tabs" role="tablist">
        {tabs.map((t) => <button key={t.id} role="tab" aria-selected={tab === t.id} className={tab === t.id ? 'on' : ''} onClick={() => setTab(t.id)}>{t.label}</button>)}
      </div>

      {tab === 'overview' && (
        <div className="ov rise">
          <section className="card pc showcase">
            <div className="ph"><div className="caps">Showcase</div>{isMe && <button className="lnk" onClick={() => setTab('badges')}>{pinned.length ? 'Edit' : 'Pin badges'}</button>}</div>
            {(isMe ? mineShowcase : p?.badges.filter((b) => p.showcase.includes(b.code)).concat(p.showcase.length ? [] : p.badges.slice(0, 3)) ?? []).length > 0 ? (
              <div className="shelf">
                {(isMe
                  ? mineShowcase.map((b) => ({ id: b.id, name: b.name, icon: b.icon, tone: b.tone as string }))
                  : (p!.badges.filter((b) => p!.showcase.includes(b.code)).length ? p!.badges.filter((b) => p!.showcase.includes(b.code)) : p!.badges.slice(0, 3)).map((b) => ({ id: b.code, name: b.name, icon: b.icon, tone: 'blue' }))
                ).map((b) => (
                  <div key={b.id} className="sb"><span className={b.tone}><Icon name={b.icon} size={32} stroke={2.2} /></span><b>{b.name}</b></div>
                ))}
              </div>
            ) : <p className="muted" style={{ fontSize: 14 }}>No badges yet.</p>}
            {isMe && pinned.length === 0 && mineShowcase.length > 0 && <small className="hint">Showing your first badges. Pin up to three in the Badges tab.</small>}
          </section>

          {isMe && (
            <section className="card pc week">
              <div className="caps">This week</div>
              <div className="bars" role="img" aria-label="Reviews per day, last seven days">
                {week.map((w, i) => (
                  <div key={i}><i style={{ height: `${Math.max(8, (w.value / maxWeek) * 100)}%` }} className={w.value ? (w.today ? 'today' : 'on') : ''} title={`${w.value} reviews`} /><span>{w.label}</span></div>
                ))}
              </div>
            </section>
          )}

          <section className="card pc tops">
            <div className="ph"><div className="caps">{isMe ? 'Top topics' : 'Public topics'}</div>{isMe && <button className="lnk" onClick={() => setTab('topics')}>All →</button>}</div>
            {hidden ? <p className="muted" style={{ fontSize: 14 }}>Topics are hidden from your public profile.</p> : isMe ? (
              <div className="trows">
                {myTopics.slice(0, 3).map((t) => (
                  <div key={t.id} className="trow"><Link to={`/app/topics/${t.id}`} className="tn">{t.name}</Link><div className="bar bar-sm"><i style={{ width: `${topicRecall(t)}%` }} /></div><em className="tnum">{topicRecall(t)}%</em></div>
                ))}
                {myTopics.length === 0 && <p className="muted" style={{ fontSize: 14 }}>Study a topic to see it here.</p>}
              </div>
            ) : (
              <div className="trows">
                {p?.topics?.length ? p.topics.map((t) => <div key={t.id} className="trow"><b className="tn">{t.title}</b><em>{t.category}</em></div>) : <p className="muted" style={{ fontSize: 14 }}>No public topics.</p>}
              </div>
            )}
          </section>

          <section className="card pc teaser">
            <div className="caps">Verified credentials</div>
            {verified.length > 0 ? (
              <>
                <div className="tz"><span className="ico"><Icon name="shield" size={22} /></span>
                  <div><b>{'name' in verified[0] ? verified[0].name : badgeName(defs, verified[0].code)}</b><small>Proof confirmed on Arc</small></div></div>
                <button className="btn btn-soft btn-sm" onClick={() => setTab('proof')}>View proof<Icon name="arrow" size={15} stroke={2.5} /></button>
              </>
            ) : <p className="muted" style={{ fontSize: 14 }}>{isMe ? 'Earn Recall Ready, then issue a credential anyone can verify.' : 'No verified credentials yet.'}</p>}
          </section>
        </div>
      )}

      {tab === 'badges' && (
        <div className="rise">
          {isMe ? (
            <>
              <p className="muted tabnote">Pin up to three earned badges to your showcase. <b className="tnum">{pinned.length}/3</b> pinned.</p>
              <div className="bdg">
                {defs.map((b) => {
                  const got = s.earned[b.id]; const isPinned = pinned.includes(b.id); const pr = s.badges.find((x) => x.code === b.id)?.progress ?? { pct: 0, meta: '' };
                  return (
                    <div key={b.id} className={`bd${got ? '' : ' locked'}`}>
                      <span className={`ic ${got ? b.tone : 'off'}`}><Icon name={b.icon} size={28} stroke={2.2} style={got ? undefined : { opacity: 0.5 }} /></span>
                      <b>{b.name}</b>
                      {got ? <small>Earned {new Date(got.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</small> : <small>{pr.meta}</small>}
                      {got
                        ? <button className={`pin${isPinned ? ' on' : ''}`} onClick={() => void pin(b.id)} aria-pressed={isPinned}><Icon name="star" size={13} stroke={2.4} />{isPinned ? 'Pinned' : 'Pin'}</button>
                        : <div className="bar bar-sm"><i style={{ width: `${pr.pct}%` }} /></div>}
                    </div>
                  );
                })}
              </div>
              <Link to="/app/achievements" className="btn btn-outline btn-sm" style={{ marginTop: 18 }}>See how to earn them<Icon name="arrow" size={15} stroke={2.5} /></Link>
            </>
          ) : (
            <div className="bdg">
              {p?.badges.map((b) => (
                <div key={b.code} className="bd"><span className="ic blue"><Icon name={b.icon} size={28} stroke={2.2} /></span><b>{b.name}</b><small>Earned {new Date(b.at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</small></div>
              ))}
              {p && p.badges.length === 0 && <div className="empty-card emp-wide"><b>No badges yet</b></div>}
            </div>
          )}
        </div>
      )}

      {tab === 'topics' && (
        <div className="rise">
          {hidden ? <div className="empty-card"><Icon name="lock" size={22} /><b>Topics are hidden</b><p>Show them on your public profile in <Link to="/app/settings#privacy">Privacy settings</Link>.</p></div> : isMe ? (
            <div className="tgrid">
              {s.topics.map((t) => {
                const st = conceptState(t.cards.length, topicDue(t), topicRecall(t));
                return (
                  <Link key={t.id} to={`/app/topics/${t.id}`} className="tcard">
                    <Ring value={topicRecall(t)} size={58} stroke={3.6} id={`pt-${t.id}`}>{t.cards.length ? `${topicRecall(t)}%` : '—'}</Ring>
                    <div><b>{t.name}</b><small>{t.category}{t.cards.length ? ` · ${plural(t.cards.length, 'card')}` : ''}</small></div>
                    <span className={`pill st-${st}`}>{stateLbl[st]}{topicDue(t) ? ` · ${topicDue(t)} due` : ''}</span>
                  </Link>
                );
              })}
              {s.topics.length === 0 && <div className="empty-card emp-wide"><b>No topics yet</b></div>}
            </div>
          ) : (
            <div className="tgrid">
              {p?.topics?.map((t) => <div key={t.id} className="tcard"><div><b>{t.title}</b><small>{t.category}</small></div></div>)}
              {(!p?.topics || p.topics.length === 0) && <div className="empty-card emp-wide"><b>No public topics</b></div>}
            </div>
          )}
        </div>
      )}

      {tab === 'proof' && <Proof isMe={isMe} publicCreds={p?.credentials ?? []} />}
    </div>
  );
}

const badgeName = (defs: ReturnType<typeof badgeDefs>, code: string) => defs.find((b) => b.id === code)?.name ?? code;

/* ───────────── proof: issue + verify credentials on Arc ───────────── */

function Proof({ isMe, publicCreds }: { isMe: boolean; publicCreds: PublicProfile['credentials'] }) {
  const s = useApp();
  const defs = badgeDefs(s);
  const [busy, setBusy] = useState<string | null>(null);
  const [withTopic, setWithTopic] = useState(false);
  const live = s.credentials.some((c) => c.status === 'pending' || c.status === 'submitted');

  // While a credential is on its way to the chain, keep checking until it settles.
  useEffect(() => {
    if (!live) return;
    const t = setInterval(() => void refresh(), 5000);
    return () => clearInterval(t);
  }, [live]);

  const issue = async (code: string, topicId: string) => {
    setBusy(`${code}:${topicId}`);
    try {
      await api('POST', '/api/credentials/issue', { achievementCode: code, topicId, includeTopicName: withTopic });
      toast({ kind: 'info', title: 'Credential requested', body: 'It becomes verified once the transaction is confirmed on Arc.' });
      await refresh();
    } catch (e) { fail(e); }
    setBusy(null);
  };
  const retry = async (id: string) => {
    setBusy(id);
    try { await api('POST', `/api/credentials/${id}/retry`); await refresh(); } catch (e) { fail(e); }
    setBusy(null);
  };

  if (!isMe) {
    return (
      <div className="proof rise">
        {publicCreds.length === 0 ? <div className="empty-card emp-wide"><Icon name="shield" size={22} /><b>No verified credentials yet</b></div> : publicCreds.map((c) => (
          <section key={c.id} className="card pc">
            <div className="ch"><Icon name="shield" size={20} /><div className="caps">Verified credential</div></div>
            <div className="cred"><div className="top"><div className="who"><span className="ico"><Icon name="award" size={20} /></span><div><b>{c.name}</b><small>{c.topic ?? ''}</small></div></div>
              <span className="pill pill-lime"><Icon name="check" size={12} stroke={3} />Verified</span></div></div>
            <div className="cta"><Link to={`/verify/${c.id}`} className="btn btn-primary btn-sm"><Icon name="shield" size={15} stroke={2.4} />Check it yourself</Link></div>
          </section>
        ))}
      </div>
    );
  }

  const eligible = ELIGIBLE.filter((code) => s.earned[code]);
  const topicsFor = (code: string) => s.topics.filter((t) => (code === 'recall-ready' ? (s.mastery[t.id]?.ready ?? 0) >= 2 : (s.mastery[t.id]?.master ?? 0) >= 2));

  return (
    <div className="proof rise">
      <section className="card pc">
        <div className="ch"><Icon name="shield" size={20} /><div className="caps">Your credentials</div></div>
        {s.credentials.length === 0 && <p className="how" style={{ marginTop: 0 }}>You haven’t issued a credential yet. Earn a mastery badge, then publish its proof to Arc — only a privacy-preserving hash goes on-chain.</p>}
        {s.credentials.map((c) => (
          <div key={c.id} style={{ marginBottom: 16 }}>
            <div className="cred">
              <div className="top">
                <div className="who"><span className="ico"><Icon name="award" size={20} /></span><div><b>{badgeName(defs, c.code)}</b><small>{c.topic ?? 'Topic hidden'}</small></div></div>
                {c.status === 'verified'
                  ? <span className="pill pill-lime"><Icon name="check" size={12} stroke={3} />Verified</span>
                  : c.status === 'failed'
                    ? <span className="pill" style={{ background: 'rgba(255,255,255,.14)', color: '#fbfbf8' }}>Failed</span>
                    : <span className="pill" style={{ background: 'rgba(255,255,255,.14)', color: '#fbfbf8' }}><Icon name="refresh" size={11} stroke={2.6} className="spin" />Confirming on Arc…</span>}
              </div>
              <dl>
                <div><dt>Issued</dt><dd>{c.issuedAt ? fmtDate(c.issuedAt) : 'Pending'}</dd></div>
                <div><dt>Issuer</dt><dd>RecallMap</dd></div>
                <div><dt>Transaction</dt><dd className="mono">{c.txHash ? `${c.txHash.slice(0, 8)}…${c.txHash.slice(-6)}` : '—'}</dd></div>
              </dl>
            </div>
            <div className="cta" style={{ marginTop: 10 }}>
              {c.status === 'verified' && <Link to={`/verify/${c.id}`} className="btn btn-primary btn-sm"><Icon name="shield" size={15} stroke={2.4} />Open public verification</Link>}
              {c.status === 'failed' && <button className="btn btn-primary btn-sm" disabled={busy === c.id} onClick={() => void retry(c.id)}>Retry issuing</button>}
              {c.txHash && EXPLORER && <a className="btn btn-outline btn-sm" href={`${EXPLORER}/tx/${c.txHash}`} target="_blank" rel="noreferrer">View on explorer<Icon name="external" size={14} stroke={2.4} /></a>}
            </div>
          </div>
        ))}
      </section>

      <aside className="card pc steps">
        <div className="caps">Issue a credential</div>
        {eligible.length === 0 && <p className="how">Credentials are available for <b>Recall Ready</b> and <b>Topic Master</b>. Score well on two spaced quizzes in a topic to earn one.</p>}
        {eligible.map((code) => topicsFor(code).map((t) => {
          const has = s.credentials.some((c) => c.code === code && c.topic === (withTopic ? t.name : null)) || s.credentials.some((c) => c.code === code && c.status !== 'failed' && c.topic === t.name);
          return (
            <div key={`${code}${t.id}`} style={{ margin: '12px 0' }}>
              <b style={{ fontSize: 14 }}>{badgeName(defs, code)} · {t.name}</b>
              <div><button className="btn btn-soft btn-sm" style={{ marginTop: 8 }} disabled={busy === `${code}:${t.id}` || has} onClick={() => void issue(code, t.id)}>{has ? 'Already issued' : 'Issue credential'}</button></div>
            </div>
          );
        }))}
        <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, marginTop: 14 }}>
          <input type="checkbox" checked={withTopic} onChange={(e) => setWithTopic(e.target.checked)} />Include the topic name in the credential
        </label>
        <ol style={{ marginTop: 18 }}>
          <li><span>1</span><div><b>Earn it</b><p>Meet the badge’s criteria across real quizzes.</p></div></li>
          <li><span>2</span><div><b>Anchor a hash</b><p>Only a fingerprint goes on Arc — never your notes or answers.</p></div></li>
          <li><span>3</span><div><b>Anyone can check</b><p>The public page recomputes the hash and reads the contract.</p></div></li>
        </ol>
      </aside>
    </div>
  );
}
