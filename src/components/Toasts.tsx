'use client';

import { dismissToast, useToasts } from '../store/store';
import Icon from './Icon';

const kinds = {
  xp: { icon: 'star', accent: 'var(--blue)', bg: 'rgba(106,166,218,.14)', color: 'var(--blue-deep)' },
  badge: { icon: 'award', accent: 'var(--lime-2)', bg: 'var(--lime)', color: 'var(--lime-ink)' },
  due: { icon: 'clock', accent: '#8a9152', bg: 'rgba(0,0,0,.05)', color: 'rgba(0,0,0,.55)' },
  error: { icon: 'alert', accent: 'var(--clay)', bg: 'rgba(194,98,47,.1)', color: 'var(--clay)' },
  info: { icon: 'spark', accent: 'var(--blue)', bg: 'rgba(106,166,218,.14)', color: 'var(--blue-deep)' },
} as const;

export default function Toasts() {
  const list = useToasts();
  return (
    <div className="toasts" aria-live="polite">
      {list.map((t) => {
        const k = kinds[t.kind];
        return (
          <div key={t.id} className="toast" style={{ borderLeftColor: k.accent }}>
            <span className="ico" style={{ background: k.bg, color: k.color }}><Icon name={k.icon} size={18} stroke={2.3} /></span>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 600 }}>{t.title}</div>
              <div style={{ fontSize: 13, color: 'var(--ink-2)' }}>{t.body}</div>
            </div>
            <button onClick={() => dismissToast(t.id)} aria-label="Dismiss" style={{ border: 0, background: 'none', cursor: 'pointer', color: 'var(--ink-4)', display: 'flex', padding: 0 }}>
              <Icon name="x" size={15} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
