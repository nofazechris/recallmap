'use client';

import { useEffect, useMemo, useState } from 'react';
import { Link } from '../lib/router';
import ConceptMap from '../components/ConceptMap';
import Icon from '../components/Icon';
import Mori from '../components/Mori';
import NewTopic from '../components/NewTopic';
import Ring from '../components/Ring';
import { useFetch } from '../lib/useFetch';
import { useApp } from '../store/store';
import { timeAgo } from '../store/selectors';
import type { ChallengeLite, CircleLite, FeedLite } from '../lib/community';
import { badgeDefs, badgeProgress, conceptStats, findTopic, recallLabel, recommendedTopic, reviewsToday, stateLabel, topicDue, topicRecall, totalDue, avgRecall, weekBars } from '../store/selectors';
import './Dashboard.css';


/** Interactive map hero: pick a topic, click a concept, jump straight into studying it. */
function DashMap() {
  const s = useApp();
  const rec = recommendedTopic(s);
  const [topicId, setTopicId] = useState(rec?.id ?? '');
  const topic = findTopic(s, topicId) ?? rec;
  const concepts = useMemo(() => (topic ? conceptStats(topic) : []), [topic]);
  const [sel, setSel] = useState('__hub');

  useEffect(() => {
    const due = concepts.find((c) => c.state === 'due');
    setSel(due ? due.name : '__hub');
  }, [topic?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!topic) return null;
  const cur = concepts.find((c) => c.name === sel);
  const hub = !cur;
  const recall = topicRecall(topic);
  const shown = hub ? recall : cur.recall;
  const studyTo = `/study/${topic.id}${!hub ? `?concept=${encodeURIComponent(cur.name)}` : ''}`;

  return (
    <section className="card dmap">
      <div className="dmap-head">
        <div>
          <div className="caps">Your learning map</div>
          <h2>{hub ? topic.name : cur.name}<span className="grad-text"> {hub ? '' : `· ${topic.name}`}</span></h2>
        </div>
        <Link to={`/app/map?topic=${topic.id}`} className="more">Open full map →</Link>
      </div>

      <div className="dmap-topics" role="tablist" aria-label="Topics">
        {s.topics.map((t) => (
          <button key={t.id} role="tab" aria-selected={t.id === topic.id} className={`chip${t.id === topic.id ? ' on' : ''}`} onClick={() => setTopicId(t.id)}>
            {t.name}{topicDue(t) > 0 && <i className="dd">{topicDue(t)}</i>}
          </button>
        ))}
      </div>

      <div className="dmap-body">
        <div className="dmap-canvas">
          <div className="gl" aria-hidden="true" />
          {concepts.length ? (
            <ConceptMap hubLabel={topic.name.split(' ')[0]} hubSub={`${recall}%`} concepts={concepts} links={topic.edges} selected={sel} onSelect={setSel} animate={false} />
          ) : (
            <div className="empty"><Icon name="map" size={28} /><b>No concepts yet</b><span>Add material and this map will grow.</span>
              <Link to={`/app/topics/${topic.id}/upload`} className="btn btn-primary btn-sm">Add material</Link></div>
          )}
        </div>

        <aside className="dmap-side">
          {hub ? <span className="pill pill-blue">Topic overview</span> : <span className={`pill st-${cur.state}`}>{stateLabel[cur.state]}</span>}
          <p className="sd">{hub ? (topic.goal ? `Goal: ${topic.goal}.` : 'Select a concept to see how well you remember it.') : (cur.desc || 'Part of your learning map.')}</p>
          <div className="rr">
            <Ring value={shown} size={60} stroke={3.6} id="dmap">{shown}%</Ring>
            <div>recall strength<br /><b>{recallLabel(shown)}</b></div>
          </div>
          <div className="duo">
            <div><b className="tnum">{hub ? topic.cards.length : cur.cards}</b><span>flashcards</span></div>
            <div><b className="tnum" style={{ color: 'var(--blue-deep)' }}>{hub ? topicDue(topic) : cur.due}</b><span>due today</span></div>
          </div>
          {!hub && cur.cards === 0
            ? <Link to={`/app/topics/${topic.id}/upload`} className="btn btn-primary btn-block">Add material<Icon name="upload" size={17} stroke={2.5} /></Link>
            : topic.cards.length
              ? <Link to={studyTo} className="btn btn-primary btn-block">{hub ? 'Study this topic' : `Study ${cur.name}`}<Icon name="arrow" size={17} stroke={2.5} /></Link>
              : <Link to={`/app/topics/${topic.id}/upload`} className="btn btn-primary btn-block">Add material<Icon name="upload" size={17} stroke={2.5} /></Link>}
        </aside>
      </div>
    </section>
  );
}

export default function Dashboard() {
  const s = useApp();
  const first = s.user.name.split(' ')[0];
  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  const topic = recommendedTopic(s);
  const done = reviewsToday(s);
  const pct = Math.min(100, Math.round((done / s.user.dailyGoal) * 100));
  const concepts = topic ? conceptStats(topic) : [];
  const nextUp = concepts.find((c) => c.due > 0);
  const bars = weekBars(s);
  const max = Math.max(1, ...bars.map((b) => b.value));
  const defs = badgeDefs(s);
  const earned = defs.filter((b) => s.earned[b.id]);
  const recent = [...earned].sort((a, z) => s.earned[z.id].date.localeCompare(s.earned[a.id].date)).slice(0, 2);
  const nextBadge = defs.filter((b) => !s.earned[b.id]).map((b) => ({ b, p: badgeProgress(s, b.id) })).sort((a, z) => z.p.pct - a.p.pct)[0];
  const unread = s.notifications.filter((n) => n.unread).length;
  const circles = useFetch<{ circles: CircleLite[] }>('/api/study-circles');
  const feed = useFetch<{ items: FeedLite[] }>('/api/feed');
  const challenges = useFetch<{ challenges: ChallengeLite[] }>('/api/challenges');
  const myCircle = circles.data?.circles.find((c) => c.joined);
  const myChallenge = challenges.data?.challenges.find((c) => c.joined && !c.completed);
  const hasTopics = s.topics.length > 0;

  return (
    <div className="page dash">
      <div className="dash-head">
        <div style={{ minWidth: 0 }}>
          <div className="eyebrow">{today}</div>
          <h1 className="h1">
            {hasTopics ? <>Welcome back, {first}. Ready to <span className="grad-text">strengthen a memory?</span></> : <>Welcome, {first}. Let’s plant your <span className="grad-text">first memory.</span></>}
          </h1>
        </div>
        <Link to="/app/notifications" className="btn btn-icon" aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`}>
          <Icon name="bell" size={20} stroke={2.3} />
          {unread > 0 && <span className="bell-dot" />}
        </Link>
        <Mori size={62} float label="Mori the moth" />
      </div>

      {!hasTopics && (
        <div className="card dash-empty">
          <Mori size={84} float label="Mori" />
          <div>
            <h2>Create your first topic</h2>
            <p>Name what you’re learning, add a PDF or some notes, and Mori will build your first study kit.</p>
            <NewTopic className="btn btn-primary" />
          </div>
        </div>
      )}

      {hasTopics && <DashMap />}

      <div className="grid-auto" style={{ marginTop: 20 }}>
        <section className="card dcard">
          <div className="caps">Today’s learning</div>
          <div className="today">
            <Ring value={pct} size={64} id="today">{pct}%</Ring>
            <div>
              <b>Daily commitment</b>
              <span>{done} of {s.user.dailyGoal} recalls done</span>
            </div>
          </div>
          <div className="mini2">
            <div><b className="tnum" style={{ color: 'var(--blue-deep)' }}>{totalDue(s)}</b><span>due for review</span></div>
            <div><b className="tnum flame"><Icon name="flame" size={38} />{s.user.streak}</b><span>day streak</span></div>
          </div>
          {s.goals.length > 0 && (
            <div className="goal-list">
              {s.goals.slice(0, 3).map((g) => (
                <div key={g.id}><span>{g.targetValue} {g.goalType} {g.period === 'weekly' ? 'this week' : 'today'}</span><div className="bar bar-sm"><i style={{ width: `${Math.min(100, Math.round((g.progress / g.targetValue) * 100))}%` }} /></div><em className="tnum">{Math.min(g.progress, g.targetValue)}/{g.targetValue}{g.done ? ' ✓' : ''}</em></div>
              ))}
            </div>
          )}
        </section>

        <section className="card dcard">
          <div className="caps">Continue learning</div>
          {topic ? (
            <>
              <div className="cont-top">
                <Link to={`/app/topics/${topic.id}`} className="cont-name">{topic.name}</Link>
                <span className="pill pill-blue tnum">{topicRecall(topic)}% recall</span>
              </div>
              <div className="next">
                {topic.cards.length === 0
                  ? 'No cards yet — add material to generate a study kit.'
                  : nextUp ? `Next up: ${nextUp.name} · ${topicDue(topic)} ${topicDue(topic) === 1 ? 'card' : 'cards'} due`
                    : topicDue(topic) ? `${topicDue(topic)} cards due` : 'All caught up — a quick practice keeps it fresh.'}
              </div>
              <div className="bar" style={{ marginBottom: 'auto' }}><i style={{ width: `${topicRecall(topic)}%` }} /></div>
              {topic.cards.length > 0
                ? <Link to={`/study/${topic.id}`} className="btn btn-primary" style={{ marginTop: 22 }}>{topicDue(topic) ? 'Resume session' : 'Practice anyway'}<Icon name="arrow" size={17} stroke={2.5} /></Link>
                : <Link to={`/app/topics/${topic.id}/upload`} className="btn btn-primary" style={{ marginTop: 22 }}>Add material<Icon name="upload" size={17} stroke={2.5} /></Link>}
            </>
          ) : <p className="muted" style={{ marginTop: 14 }}>Your recommended topic appears here once you’ve created one.</p>}
        </section>
      </div>

      <div className="grid-auto" style={{ marginTop: 20 }}>
        <section className="card dcard">
          <div className="caps">This week</div>
          <div className="stats4">
            <div><b className="tnum">{s.stats.sessionsWeek}</b><span>study sessions</span></div>
            <div><b className="tnum" style={{ color: 'var(--blue-deep)' }}>{avgRecall(s)}%</b><span>avg recall</span></div>
            <div><b className="tnum">+{s.stats.xpWeek}</b><span>XP earned</span></div>
            <div><b className="tnum">{s.topics.length}</b><span>topics active</span></div>
          </div>
          <div className="week" role="img" aria-label="Reviews per day, last seven days">
            {bars.map((b, i) => (
              <div key={i}>
                <i style={{ height: `${Math.max(8, (b.value / max) * 100)}%` }} className={b.value ? (b.today ? 'today' : 'on') : ''} title={`${b.value} reviews`} />
                <span>{b.label}</span>
              </div>
            ))}
          </div>
        </section>
        <section className="card dcard">
          <div className="row-h"><div className="caps">Recent achievements</div><Link to="/app/achievements" className="more">All →</Link></div>
          <div className="ach-list">
            {recent.map((b) => (
              <div key={b.id} className="ach">
                <span className={`ico ${b.tone}`}><Icon name={b.icon} size={22} stroke={2.4} /></span>
                <div><b>{b.name}</b><small>{b.desc}</small></div>
                <span className={`pill ${s.earned[b.id].verified ? 'pill-blue' : 'pill-dim'}`} style={{ marginLeft: 'auto' }}>
                  {s.earned[b.id].verified ? 'Verified' : new Date(s.earned[b.id].date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </span>
              </div>
            ))}
            {recent.length === 0 && <p className="muted" style={{ fontSize: 14 }}>Finish a study session to earn your first badge.</p>}
            {nextBadge && (
              <div className="ach locked">
                <span className="ico dashed"><Icon name="lock" size={20} stroke={2.2} /></span>
                <div><b>{nextBadge.b.name}</b><small>{nextBadge.p.meta}</small></div>
                <span className="tnum" style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 600 }}>{nextBadge.p.pct}%</span>
              </div>
            )}
          </div>
        </section>

        <section className="card dcard">
          <div className="row-h"><div className="caps">Your circles</div><Link to="/app/community" className="more">Community →</Link></div>
          <div className="feed">
            {myCircle && <div><span style={{ background: 'var(--blue)' }} /><div><strong>{myCircle.name}</strong> — {myCircle.progress}% toward this week’s goal. <em>{myCircle.members} {myCircle.members === 1 ? 'member' : 'members'}</em></div></div>}
            {myChallenge && <div><span style={{ background: 'var(--mist)' }} /><div><strong>{myChallenge.title}</strong> — {myChallenge.progress} of {myChallenge.target} {myChallenge.metric === 'reviews' ? 'reviews' : 'study days'}. <em>{myChallenge.progress ? 'You’re on track.' : 'Study today to begin.'}</em></div></div>}
            {feed.data?.items.filter((i) => !i.mine).slice(0, 2).map((i) => (
              <div key={i.id}><span style={{ background: 'var(--lime)' }} /><div><strong>{i.who.name}</strong> {i.text}. <em>{timeAgo(i.at)}</em></div></div>
            ))}
            {!myCircle && !myChallenge && !feed.data?.items.some((i) => !i.mine) && (
              <p className="muted" style={{ fontSize: 14 }}>Join or start a study circle to see shared goals and friends’ milestones here.</p>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

