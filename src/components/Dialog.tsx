'use client';

import { useEffect, useRef, type ReactNode } from 'react';

export default function Dialog({ title, sub, onClose, children }: { title: string; sub?: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  // Parents pass a fresh `onClose` on every render. Keeping it in a ref means the effect below runs ONCE, when the
  // dialog opens — so typing in a field never steals focus back to the first input.
  const close = useRef(onClose);
  close.current = onClose;

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close.current();
    window.addEventListener('keydown', onKey);
    const root = ref.current;
    if (root && !root.contains(document.activeElement)) root.querySelector<HTMLElement>('input, textarea, select, button')?.focus();
    return () => { window.removeEventListener('keydown', onKey); opener?.focus?.(); };
  }, []);

  return (
    <div className="backdrop" onMouseDown={(e) => e.target === e.currentTarget && close.current()}>
      <div className="dialog" role="dialog" aria-modal="true" aria-label={title} ref={ref}>
        <h2>{title}</h2>
        {sub && <p className="muted" style={{ fontSize: 14, marginBottom: 18 }}>{sub}</p>}
        {children}
      </div>
    </div>
  );
}
