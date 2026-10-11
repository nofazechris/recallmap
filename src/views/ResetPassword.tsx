'use client';

import { useState } from 'react';
import { Link, useSearchParams } from '../lib/router';
import Icon from '../components/Icon';
import Logo from '../components/Logo';
import { api, messageOf } from '../lib/api';
import './Auth.css';

/** Landing page of the emailed reset link: choose a new password. */
export default function ResetPassword() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [done, setDone] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pw.length < 8) { setErr('Use at least 8 characters.'); return; }
    setBusy(true); setErr('');
    try { await api('POST', '/api/auth/reset', { token, password: pw }); setDone(true); } catch (x) { setErr(messageOf(x)); }
    setBusy(false);
  };

  return (
    <div className="auth" style={{ gridTemplateColumns: 'minmax(0, 1fr)' }}>
      <section className="auth-form" style={{ minHeight: '100vh' }}>
        <div className="box">
          <div style={{ marginBottom: 28 }}><Logo to="/" size={28} /></div>
          {done ? (
            <div className="sent" role="status">
              <span className="ic"><Icon name="check" size={22} stroke={2.8} /></span>
              <b>Password updated</b>
              <p>You can now sign in with your new password.</p>
              <Link to="/auth" className="btn btn-primary">Sign in</Link>
            </div>
          ) : !token ? (
            <>
              <h1>Link not valid</h1>
              <p className="sub">This reset link is missing its token. Request a new one from the sign-in page.</p>
              <Link to="/auth" className="btn btn-primary">Back to sign in</Link>
            </>
          ) : (
            <form onSubmit={(e) => void submit(e)} noValidate>
              <h1>Choose a new password</h1>
              <p className="sub">Use at least 8 characters.</p>
              <div className="field">
                <label htmlFor="r-pw">New password</label>
                <input id="r-pw" className={`input${err ? ' err' : ''}`} type="password" autoComplete="new-password" autoFocus value={pw} onChange={(e) => { setPw(e.target.value); setErr(''); }} />
                {err && <div className="field-err" role="alert">{err}</div>}
              </div>
              <button type="submit" className="btn btn-primary btn-lg btn-block go" disabled={busy}>{busy ? 'Saving…' : 'Update password'}</button>
            </form>
          )}
        </div>
      </section>
    </div>
  );
}
