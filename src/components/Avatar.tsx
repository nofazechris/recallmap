'use client';

export const avatarTones = [
  { bg: 'linear-gradient(145deg,#eef0c8,#E1E5AC)', fg: '#000' },
  { bg: 'linear-gradient(145deg,#8abbe6,#6AA6DA)', fg: '#000' },
  { bg: 'linear-gradient(145deg,#e9eef2,#DBE3E9)', fg: '#000' },
  { bg: 'linear-gradient(145deg,#ddd9f8,#cfc9f3)', fg: '#2a2160' },
  { bg: 'linear-gradient(145deg,#f9e5d4,#f6d9c4)', fg: '#6b3a17' },
];

export function Avatar({ name, tone = 0, size = 40, serif }: { name: string; tone?: number; size?: number; serif?: boolean }) {
  const t = avatarTones[tone % avatarTones.length];
  return (
    <span
      aria-hidden="true"
      style={{
        width: size, height: size, flex: 'none', borderRadius: 999, background: t.bg, color: t.fg,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        fontWeight: serif ? 400 : 600, fontSize: size * (serif ? 0.46 : 0.4),
        fontFamily: serif ? 'var(--font-serif)' : undefined,
        boxShadow: 'inset 0 0 0 1px rgba(0,0,0,.06)',
      }}
    >
      {(name.trim()[0] || '?').toUpperCase()}
    </span>
  );
}
