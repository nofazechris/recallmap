'use client';

import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from '../lib/router';
import Logo from '../components/Logo';
import { MoriMark } from '../components/Mori';
import { api, messageOf } from '../lib/api';
import { toast } from '../store/store';
import './Auth.css';

/** Where an invite link lands: shows which circle you're being invited to, then joins on your say-so. */
export default function JoinCircle() {
  const { code = '' } = useParams();
  const nav = useNavigate();
  const [info, setInfo] = useState<{ name: string; goal: string; members: number } | null>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<{ name: string; goal: string; members: number }>('GET', `/api/invites/${encodeURIComponent(code)}`).then(setInfo).catch((e) => setErr(messageOf(e)));
  }, [code]);

  const join = async () => {
    setBusy(true); setErr('');
    try {
      const r = await api<{ name: string }>('POST', `/api/invites/${encodeURIComponent(code)}/accept`);
      toast({ kind: 'info', title: `Joined ${r.name}`, body: 'You’ll see its goal and progress in Community.' });
      nav('/app/community');
    } catch (e) { setErr(messageOf(e)); setBusy(false); }
  };

  return (
    <div className="auth" style={{ gridTemplateColumns: 'minmax(0, 1fr)' }}>
      <section className="auth-form" style={{ minHeight: '100vh' }}>
        <div className="box" style={{ textAlign: 'center' }}>
          <div style={{ marginBottom: 24 }}><Logo to="/" size={28} /></div>
          <MoriMark size={64} />
          {info ? (
            <>
              <h1>Join “{info.name}”?</h1>
              <p className="sub">{info.goal ? `Goal: ${info.goal}. ` : ''}{info.members} {info.members === 1 ? 'learner is' : 'learners are'} already in. Members can see each other’s names and challenge progress — never notes or answers.</p>
              {err && <div className="field-err form-err" role="alert">{err}</div>}
              <button className="btn btn-primary btn-lg btn-block" onClick={() => void join()} disabled={busy}>{busy ? 'Joining…' : 'Join circle'}</button>
              <p className="back"><Link to="/app/community">No thanks</Link></p>
            </>
          ) : err ? (
            <>
              <h1>Invite not valid</h1>
              <p className="sub">{err}</p>
              <Link to="/app/community" className="btn btn-primary">Go to Community</Link>
            </>
          ) : <p className="sub">Checking your invite…</p>}
        </div>
      </section>
    </div>
  );
}
