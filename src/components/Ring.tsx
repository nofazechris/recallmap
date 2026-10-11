'use client';

import type { ReactNode } from 'react';

/** Circular progress ring (0–100) with a gradient stroke. */
export default function Ring({ value, size = 64, stroke = 3.4, children, track = '#DBE3E9', id = 'g' }: {
  value: number; size?: number; stroke?: number; children?: ReactNode; track?: string; id?: string;
}) {
  const v = Math.max(0, Math.min(100, value));
  const gid = `ring-${id}`;
  return (
    <div style={{ position: 'relative', width: size, height: size, flex: 'none' }}>
      <svg width={size} height={size} viewBox="0 0 36 36" style={{ transform: 'rotate(-90deg)' }}>
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#8abbe6" />
            <stop offset="1" stopColor="#5793ce" />
          </linearGradient>
        </defs>
        <circle cx="18" cy="18" r="15.9" fill="none" stroke={track} strokeWidth={stroke} />
        <circle cx="18" cy="18" r="15.9" fill="none" stroke={`url(#${gid})`} strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray="100" strokeDashoffset={100 - v} pathLength={100} style={{ transition: 'stroke-dashoffset .8s ease' }} />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: size * 0.22, fontWeight: 700 }} className="tnum">
        {children}
      </div>
    </div>
  );
}
