'use client';

import { useState, type ReactNode } from 'react';
import { api } from '../lib/api';
import { Link, NavLink, Navigate, useLocation } from '../lib/router';
import { fail, studyHref, useApp } from '../store/store';
import { level } from '../store/selectors';
import Icon from './Icon';
import Logo from './Logo';
import NewTopic from './NewTopic';
import { Avatar } from './Avatar';

/** Auth + onboarding gate for everything under /app. */
export function RequireSession({ children }: { children: ReactNode }) {
  const s = useApp();
  const loc = useLocation();
  if (!s.session) return <Navigate to={`/auth?next=${encodeURIComponent(loc.pathname)}`} replace />;
  if (!s.user.onboarded) return <Navigate to="/onboarding" replace />;
  return <AppShell>{children}</AppShell>;
}

/** Same gate for full-screen flows (study, quiz, upload) that live outside the shell. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const s = useApp();
  const loc = useLocation();
  if (!s.session) return <Navigate to={`/auth?next=${encodeURIComponent(loc.pathname)}`} replace />;
  if (!s.user.onboarded) return <Navigate to="/onboarding" replace />;
  return <>{children}</>;
}

/** Shown until the email address is confirmed (only when the server can actually send email). */
function VerifyBanner({ email }: { email: string }) {
  const [state, setState] = useState<'idle' | 'sending' | 'sent'>('idle');
  const send = async () => {
    setState('sending');
    try { await api('POST', '/api/auth/verify/send'); setState('sent'); } catch (e) { setState('idle'); fail(e); }
  };
  return (
    <div className="verify-banner" role="status">
      <Icon name="alert" size={16} stroke={2.4} />
      <span>Confirm your email (<b>{email}</b>) to unlock community features, public profiles and credentials.</span>
      <button className="btn btn-soft btn-sm" onClick={() => void send()} disabled={state !== 'idle'}>{state === 'sent' ? 'Link sent — check your inbox' : state === 'sending' ? 'Sending…' : 'Resend link'}</button>
    </div>
  );
}

function AppShell({ children }: { children: ReactNode }) {
  const s = useApp();
  const loc = useLocation();
  const unread = s.notifications.filter((n) => n.unread).length;
  const study = studyHref(s);
  const learningActive = loc.pathname.startsWith('/app/map') || loc.pathname.startsWith('/app/topics');
  const fullBleed = loc.pathname.startsWith('/app/map');

  return (
    <div className="shell">
      <aside className="sidebar" aria-label="Primary">
        <div style={{ padding: '4px 10px 18px' }}><Logo to="/app" size={28} /></div>
        <NavLink to="/app" end className={({ isActive }) => `navitem${isActive ? ' on' : ''}`}><Icon name="home" size={19} />Home</NavLink>
        <NavLink to="/app/map" className={() => `navitem${learningActive ? ' on' : ''}`}><Icon name="learning" size={19} />My Learning</NavLink>
        <Link to={study} className="navitem"><Icon name="book" size={19} />Study</Link>
        <NavLink to="/app/community" className={({ isActive }) => `navitem${isActive ? ' on' : ''}`}><Icon name="users" size={19} />Community</NavLink>
        <NavLink to="/app/achievements" className={({ isActive }) => `navitem${isActive ? ' on' : ''}`}><Icon name="award" size={19} />Achievements</NavLink>
        <NavLink to="/app/notifications" className={({ isActive }) => `navitem${isActive ? ' on' : ''}`}>
          <Icon name="bell" size={19} />Notifications
          {unread > 0 && <span className="count">{unread}</span>}
        </NavLink>
        <div style={{ margin: '14px 4px 0' }}><NewTopic className="btn btn-soft btn-sm btn-block" /></div>
        <div className="sidebar-foot">
          <NavLink to="/app/settings" className={({ isActive }) => `navitem${isActive ? ' on' : ''}`}><Icon name="settings" size={19} />Settings</NavLink>
          <NavLink to="/app/profile" className={({ isActive }) => `navitem profile${isActive ? ' on' : ''}`} style={{ paddingLeft: 6 }}>
            <Avatar name={s.user.name} tone={s.user.avatarTone} size={34} />
            <span style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.2, minWidth: 0 }}>
              <span style={{ color: '#000', fontWeight: 600, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.user.name}</span>
              <span style={{ fontSize: 12, color: 'var(--ink-3)' }} className="tnum">Level {level(s.user.xp)} · {s.user.xp.toLocaleString()} XP</span>
            </span>
          </NavLink>
        </div>
      </aside>

      <div className="shell-main">
        <header className="mobilebar">
          <Logo to="/app" size={26} />
          <Link to="/app/notifications" className="mb-bell" aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`}>
            <Icon name="bell" size={20} />
            {unread > 0 && <span className="dot" />}
          </Link>
        </header>
        {s.verificationRequired && !s.user.emailVerified && <VerifyBanner email={s.user.email} />}
        <main className={fullBleed ? 'main main-bleed' : 'main'}>{children}</main>
      </div>

      <nav className="bottomnav" aria-label="Primary">
        <NavLink to="/app" end className={({ isActive }) => (isActive ? 'on' : '')}><Icon name="home" size={21} stroke={2.2} />Home</NavLink>
        <NavLink to="/app/map" className={() => (learningActive ? 'on' : '')}><Icon name="map" size={21} stroke={2.2} />Map</NavLink>
        <Link to={study}><Icon name="book" size={21} stroke={2.2} />Study</Link>
        <NavLink to="/app/community" className={({ isActive }) => (isActive ? 'on' : '')}><Icon name="users" size={21} stroke={2.2} />Community</NavLink>
        <NavLink to="/app/profile" className={({ isActive }) => (isActive ? 'on' : '')}><Icon name="user" size={21} stroke={2.2} />Profile</NavLink>
      </nav>
    </div>
  );
}
