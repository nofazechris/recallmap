'use client';

import { useEffect } from 'react';

/** Last-resort boundary for errors in the root layout itself (no app styles available, so it is self-contained). */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    fetch('/api/client-error', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ message: error.message, digest: error.digest, path: window.location.pathname }),
    }).catch(() => undefined);
  }, [error]);

  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: 'system-ui, sans-serif', background: '#fbfbf8', color: '#000' }}>
        <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', textAlign: 'center', padding: 24 }}>
          <div>
            <h1 style={{ fontWeight: 500, fontSize: 32, margin: '0 0 8px' }}>Something went wrong.</h1>
            <p style={{ color: 'rgba(0,0,0,.6)', margin: '0 0 20px' }}>We’ve been told. Please try again.</p>
            <button onClick={reset} style={{ padding: '12px 22px', borderRadius: 999, border: 0, background: '#6aa6da', fontWeight: 600, cursor: 'pointer' }}>Try again</button>
          </div>
        </div>
      </body>
    </html>
  );
}
