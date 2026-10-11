'use client';

import type { CSSProperties, ReactNode } from 'react';
import Flame from './Flame';

const P = (d: string) => <path d={d} />;

const paths: Record<string, ReactNode> = {
  home: P('M3 10l9-7 9 7v9a2 2 0 0 1-2 2h-4v-6H9v6H5a2 2 0 0 1-2-2z'),
  book: <>{P('M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 0-2.5-2.5H4V2z')}{P('M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 1 2.5-2.5H20V2z')}</>,
  learning: <>{P('M4 19.5A2.5 2.5 0 0 1 6.5 17H20')}{P('M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z')}</>,
  map: <>{P('M9 2 3 5v17l6-3 6 3 6-3V2l-6 3-6-3z')}{P('M9 2v17M15 5v17')}</>,
  users: <>{P('M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2')}<circle cx="9" cy="7" r="4" />{P('M23 21v-2a4 4 0 0 0-3-3.87')}{P('M16 3.13a4 4 0 0 1 0 7.75')}</>,
  award: <><circle cx="12" cy="8" r="6" />{P('M8.2 13.5L7 22l5-3 5 3-1.2-8.5')}</>,
  settings: <><circle cx="12" cy="12" r="3" />{P('M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z')}</>,
  bell: <>{P('M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9')}{P('M13.7 21a2 2 0 0 1-3.4 0')}</>,
  plus: <>{P('M12 5v14')}{P('M5 12h14')}</>,
  minus: P('M5 12h14'),
  upload: <>{P('M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4')}{P('M7 10l5-5 5 5')}{P('M12 5v12')}</>,
  check: P('M20 6L9 17l-5-5'),
  arrow: <>{P('M5 12h14')}{P('M13 6l6 6-6 6')}</>,
  back: <>{P('M19 12H5')}{P('M11 18l-6-6 6-6')}</>,
  spark: <>{P('M12 3l1.9 4.6L18.5 9.5 13.9 11.4 12 16l-1.9-4.6L5.5 9.5l4.6-1.9z')}{P('M19 15l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z')}</>,
  clock: <><circle cx="12" cy="12" r="9" />{P('M12 7v5l3 2')}</>,
  refresh: <>{P('M3 12a9 9 0 1 0 9-9')}{P('M3 3v6h6')}</>,
  shield: <>{P('M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z')}{P('M9 12l2 2 4-4')}</>,
  star: P('M12 2l2.4 7.4H22l-6 4.4 2.3 7.2L12 16.6 5.7 21l2.3-7.2-6-4.4h7.6z'),
  target: <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1" /></>,
  calendar: <><rect x="3" y="4" width="18" height="18" rx="2" />{P('M16 2v4M8 2v4M3 10h18')}</>,
  flag: P('M4 22V4M4 4h14l-2 5 2 5H4'),
  lock: <><rect x="3" y="11" width="18" height="11" rx="2" />{P('M7 11V7a5 5 0 0 1 10 0v4')}</>,
  x: <>{P('M18 6L6 18')}{P('M6 6l12 12')}</>,
  trash: <>{P('M3 6h18')}{P('M8 6V4h8v2M19 6l-1 14H6L5 6')}</>,
  external: <>{P('M7 17L17 7')}{P('M8 7h9v9')}</>,
  share: <><circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" />{P('M8.6 13.5l6.8 4M15.4 6.5l-6.8 4')}</>,
  chevron: P('M9 6l6 6-6 6'),
  user: <><circle cx="12" cy="8" r="4" />{P('M5 21v-1a7 7 0 0 1 14 0v1')}</>,
  menu: <>{P('M3 6h18')}{P('M3 12h18')}{P('M3 18h18')}</>,
  alert: <>{P('M12 9v4M12 17h.01')}<circle cx="12" cy="12" r="9" /></>,
  logout: <>{P('M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4')}{P('M16 17l5-5-5-5')}{P('M21 12H9')}</>,
  file: <>{P('M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z')}{P('M14 2v6h6')}</>,
  layers: <>{P('M12 2l10 5-10 5L2 7z')}{P('M2 17l10 5 10-5')}{P('M2 12l10 5 10-5')}</>,
  zap: P('M13 2L3 14h9l-1 8 10-12h-9z'),
  link: <>{P('M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71')}{P('M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71')}</>,
  grid: <><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></>,
  edit: <>{P('M12 20h9')}{P('M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z')}</>,
};

interface Props { name: string; size?: number; stroke?: number; style?: CSSProperties; className?: string }

export default function Icon({ name, size = 20, stroke = 2.4, style, className }: Props) {
  if (name === 'flame') return <Flame size={size} style={style} className={className} />;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" style={style} className={className} aria-hidden="true">
      {paths[name] ?? paths.spark}
    </svg>
  );
}
