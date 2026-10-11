'use client';

import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from '../lib/router';
import Icon from '../components/Icon';
import Logo from '../components/Logo';
import { api, messageOf } from '../lib/api';
import './Auth.css';

/** Landing page of the emailed confirmation link: confirms the address as soon as it opens. */
export default function VerifyEmail() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const [state, setState] = useState<'working' | 'ok' | 'bad'>('working');
  const [msg, setMsg] = useState('');
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    if (!token) { setState('bad'); setMsg('This link is missing its token.'); return; }
    api('POST', '/api/auth/verify', { token }).then(() => setState('ok')).catch((e) => { setState('bad'); setMsg(messageOf(e)); });
  }, [token]);

  return (
    <div className="auth" style={{ gridTemplateColumns: 'minmax(0, 1fr)' }}>
      <section className="auth-form" style={{ minHeight: '100vh' }}>
        <div className="box">
          <div style={{ marginBottom: 28 }}><Logo to="/" size={28} /></div>
          {state === 'working' && <><h1>Confirming your email…</h1><p className="sub">One moment.</p></>}
          {state === 'ok' && (
            <div className="sent" role="status">
              <span className="ic"><Icon name="check" size={22} stroke={2.8} /></span>
              <b>Email confirmed</b>
              <p>Thanks — community features and credentials are now unlocked.</p>
              <Link to="/app" className="btn btn-primary">Open RecallMap</Link>
            </div>
          )}
          {state === 'bad' && (
            <>
              <h1>Couldn’t confirm</h1>
              <p className="sub">{msg}</p>
              <Link to="/app" className="btn btn-primary">Go to the app</Link>
            </>
          )}
        </div>
      </section>
    </div>
  );
}
