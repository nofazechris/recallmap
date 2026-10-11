'use client';

import { useMemo, useState } from 'react';
import { Link, useNavigate } from '../lib/router';
import Icon from '../components/Icon';
import { MoriMark } from '../components/Mori';
import Ring from '../components/Ring';
import { actions, toast, useApp } from '../store/store';
import { recommendedTopic, reviewsToday, timeAgo, topicDue, totalDue } from '../store/selectors';
import type { Notif, NotifType } from '../store/types';
import './Notifications.css';

type Filter = 'all' | 'unread' | 'reviews' | 'achievements' | 'community' | 'xp';

const filters: { id: Filter; label: string; test: (n: Notif) => boolean }[] = [
  { id: 'all', label: 'All', test: () => true },
  { id: 'unread', label: 'Unread', test: (n) => n.unread },
  { id: 'reviews', label: 'Reviews', test: (n) => n.type === 'due' },
  { id: 'achievements', label: 'Achievements', test: (n) => n.type === 'badge' || n.type === 'verified' },
  { id: 'community', label: 'Community', test: (n) => n.type === 'social' },
  { id: 'xp', label: 'Progress', test: (n) => n.type === 'xp' },
];

const style: Record<NotifType, { icon: string; bg: string; color: string; label: string; cta: string }> = {
  badge: { icon: 'award', bg: 'var(--grad-lime)', color: 'var(--lime-ink)', label: 'Badge', cta: 'See badge' },
  due: { icon: 'clock', bg: 'rgba(194,98,47,.12)', color: 'var(--clay)', label: 'Review', cta: 'Study now' },
  social: { icon: 'users', bg: 'rgba(106,166,218,.16)', color: 'var(--blue-deep)', label: 'Community', cta: 'Open community' },
  verified: { icon: 'shield', bg: 'rgba(106,166,218,.16)', color: 'var(--blue-deep)', label: 'Proof', cta: 'View proof' },
  xp: { icon: 'star', bg: 'rgba(106,166,218,.16)', color: 'var(--blue-deep)', label: 'Progress', cta: 'Open' },
};

/** Group label by whole calendar days, not hours. */
const bucket = (iso: string) => {
  const a = new Date(); a.setHours(0, 0, 0, 0);
  const b = new Date(iso); b.setHours(0, 0, 0, 0);
  const d = Math.round((a.getTime() - b.getTime()) / 864e5);
  return d <= 0 ? 'Today' : d === 1 ? 'Yesterday' : d < 7 ? 'Earlier this week' : 'Older';
};
const order = ['Today', 'Yesterday', 'Earlier this week', 'Older'];
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export default function Notifications() {
  const s = useApp();
  const nav = useNavigate();
  const [f, setF] = useState<Filter>('all');
  const unread = s.notifications.filter((n) => n.unread).length;
  const read = s.notifications.length - unread;

  const list = s.notifications.filter(filters.find((x) => x.id === f)!.test);
  const groups = useMemo(() => order.map((label) => ({ label, items: list.filter((n) => bucket(n.at) === label) })).filter((g) => g.items.length), [list]);

  const due = totalDue(s);
  const dueTopics = s.topics.filter((t) => topicDue(t) > 0).length;
  const rec = recommendedTopic(s);
  const done = reviewsToday(s);
  const pct = Math.min(100, Math.round((done / s.user.dailyGoal) * 100));
  const open = (n: Notif) => { actions.markRead(n.id); nav(n.href); };

  const prefs: [string, boolean][] = [['Daily review reminder', s.prefs.remindDaily], ['Badges & XP', s.prefs.notifyBadges], ['Community activity', s.prefs.notifyCommunity]];

  return (
    <div className="page notif">
      <div className="nh">
        <div>
          <div className="eyebrow" style={{ marginBottom: 10 }}>Inbox</div>
          <h1 className="h1">Notifications</h1>
          <div className="muted tnum" style={{ fontSize: 14 }}>{unread ? `${plural(unread, 'unread notification')}` : 'All caught up'} · {plural(s.notifications.length, 'total', 'total')}</div>
        </div>
        <div className="nacts">
          <button className="btn btn-soft btn-sm" onClick={actions.markAllRead} disabled={!unread}><Icon name="check" size={15} stroke={2.6} />Mark all read</button>
          <button className="btn btn-outline btn-sm" onClick={() => { actions.clearRead(); toast({ kind: 'info', title: 'Cleared', body: 'Read notifications were removed.' }); }} disabled={!read}>Clear read</button>
        </div>
      </div>

      <div className="ncols">
        <div className="nmain">
          <div className="fchips" role="tablist" aria-label="Filter notifications">
            {filters.map((x) => {
              const n = s.notifications.filter(x.test).length;
              return <button key={x.id} role="tab" aria-selected={f === x.id} className={`chip${f === x.id ? ' on' : ''}`} onClick={() => setF(x.id)}>{x.label}<em className="tnum">{n}</em></button>;
            })}
          </div>

          {groups.map((g) => (
            <section key={g.label} className="group">
              <div className="caps">{g.label}</div>
              <ul className="list">
                {g.items.map((n) => {
                  const st = style[n.type];
                  return (
                    <li key={n.id} className={`nt${n.unread ? ' unread' : ''}`}>
                      <button className="nt-main" onClick={() => open(n)} aria-label={`Open: ${n.html.replace(/<[^>]+>/g, '')}`}>
                        <span className="ico" style={{ background: st.bg, color: st.color }}><Icon name={st.icon} size={20} stroke={2.3} /></span>
                        <span className="tx">
                          <span className="t" dangerouslySetInnerHTML={{ __html: n.html }} />
                          <span className="m"><i className="kind" style={{ color: st.color }}>{st.label}</i><small>{timeAgo(n.at)}</small></span>
                        </span>
                        {n.unread && <i className="dot" aria-label="Unread" />}
                      </button>
                      <div className="nt-acts">
                        <button className="cta" onClick={() => open(n)}>{st.cta}<Icon name="arrow" size={13} stroke={2.6} /></button>
                        <button className="ic" onClick={() => (n.unread ? actions.markRead(n.id) : actions.markUnread(n.id))} aria-label={n.unread ? 'Mark as read' : 'Mark as unread'} title={n.unread ? 'Mark as read' : 'Mark as unread'}>
                          <Icon name={n.unread ? 'check' : 'bell'} size={15} stroke={2.4} />
                        </button>
                        <button className="ic" onClick={() => actions.dismissNotif(n.id)} aria-label="Dismiss" title="Dismiss"><Icon name="x" size={15} stroke={2.4} /></button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}

          {groups.length === 0 && (
            <div className="empty-card">
              <MoriMark size={56} />
              <b>{f === 'all' ? 'Nothing yet' : 'Nothing in this filter'}</b>
              <p>{f === 'all' ? 'Study a topic and updates will land here.' : 'Try another filter, or head back to everything.'}</p>
              {f !== 'all' ? <button className="btn btn-outline btn-sm" onClick={() => setF('all')}>Show all</button> : rec && <Link to={`/study/${rec.id}`} className="btn btn-primary btn-sm">Start studying</Link>}
            </div>
          )}
        </div>

        {/* ───── side ───── */}
        <aside className="nside">
          <section className="digest">
            <div className="caps">Today</div>
            <div className="dg">
              <Ring value={pct} size={62} stroke={3.8} id="nd">{pct}%</Ring>
              <div><b className="tnum">{due > 0 ? `${plural(due, 'card')} due` : 'All caught up'}</b>
                <span className="tnum">{due > 0 ? `across ${plural(dueTopics, 'topic')} · ` : ''}{done}/{s.user.dailyGoal} recalls today</span></div>
            </div>
            {rec && rec.cards.length > 0 && <Link to={`/study/${rec.id}`} className="btn btn-primary btn-sm btn-block">{due > 0 ? 'Start today’s review' : 'Practice anyway'}<Icon name="arrow" size={15} stroke={2.5} /></Link>}
          </section>

          <section className="card prefsum">
            <div className="ph"><div className="caps">Your alerts</div><Link to="/app/settings#notifications" className="lnk">Edit</Link></div>
            <ul>
              {prefs.map(([l, on]) => <li key={l}><span>{l}</span><em className={on ? 'on' : ''}>{on ? 'On' : 'Off'}</em></li>)}
            </ul>
          </section>

          <details className="card tp">
            <summary><span>Preview a toast</span><Icon name="plus" size={16} /></summary>
            <p>Toasts are the pop-ups you see as things happen. Try each style:</p>
            <div className="tb">
              <button className="t1" onClick={() => toast({ kind: 'xp', title: '+15 XP earned', body: 'Quiz passed with 80%.' })}>+15 XP</button>
              <button className="t2" onClick={() => toast({ kind: 'badge', title: 'Badge unlocked', body: 'Week of Focus — 7 day streak.' })}>Badge</button>
              <button className="t3" onClick={() => toast({ kind: 'due', title: 'Time to review', body: `${due} cards are due.` })}>Reminder</button>
              <button className="t4" onClick={() => toast({ kind: 'error', title: 'Couldn’t process file', body: 'The PDF was unreadable — try another.' })}>Error</button>
            </div>
          </details>
        </aside>
      </div>
    </div>
  );
}
