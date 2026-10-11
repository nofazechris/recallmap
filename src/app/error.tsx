'use client';

import { useEffect } from 'react';
import { MoriMark } from '../components/Mori';

/** Shown when a page crashes while rendering in the browser. The error is reported (message + page only) and the user can retry. */
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    fetch('/api/client-error', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ message: error.message, digest: error.digest, path: window.location.pathname }),
    }).catch(() => undefined);
  }, [error]);

  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', textAlign: 'center', padding: 24 }}>
      <div>
        <MoriMark size={72} />
        <h1 className="h1" style={{ margin: '18px 0 8px' }}>Something went wrong.</h1>
        <p className="muted" style={{ marginBottom: 22 }}>It’s on our side, and we’ve been told. Your work is saved — try again.</p>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
          <button className="btn btn-primary" onClick={reset}>Try again</button>
          <a href="/app" className="btn btn-outline">Back to the app</a>
        </div>
      </div>
    </div>
  );
}
