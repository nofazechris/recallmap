'use client';

import type { CSSProperties } from 'react';

interface Props {
  size?: number;
  /** Gentle bob up/down. */
  float?: boolean;
  /** Static, no wing flutter. */
  still?: boolean;
  /** Lighter wings for use on the blue brand panel. */
  tone?: 'default' | 'light';
  /** Show the antenna tips + wing dots (the full hero version). */
  detailed?: boolean;
  style?: CSSProperties;
  label?: string;
}

/** Mori — the RecallMap moth. Pure SVG so it scales crisply and animates in CSS. */
export default function Mori({ size = 64, float, still, tone = 'default', detailed = true, style, label = 'Mori the moth' }: Props) {
  const wing = tone === 'light' ? '#8bbbe2' : '#6AA6DA';
  const wing2 = tone === 'light' ? '#a9cdec' : '#8bbbe2';
  const ant = tone === 'light' ? '#06243b' : '#000';
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 120 120"
      role="img"
      aria-label={label}
      className={float ? 'mori-float' : undefined}
      style={style}
    >
      <g className={still ? undefined : 'mori-wing'}>
        <ellipse cx="36" cy="50" rx="25" ry="18" transform="rotate(-18 36 50)" fill={wing} />
        <ellipse cx="84" cy="50" rx="25" ry="18" transform="rotate(18 84 50)" fill={wing} />
        <ellipse cx="42" cy="74" rx="15" ry="12" transform="rotate(22 42 74)" fill={wing2} />
        <ellipse cx="78" cy="74" rx="15" ry="12" transform="rotate(-22 78 74)" fill={wing2} />
        {detailed && (
          <>
            <circle cx="30" cy="48" r="2.4" fill="#2d618f" />
            <circle cx="90" cy="48" r="2.4" fill="#2d618f" />
          </>
        )}
      </g>
      <ellipse cx="60" cy="64" rx="11" ry="27" fill="#E1E5AC" />
      <circle cx="60" cy="33" r="11" fill="#E1E5AC" />
      <circle cx="56" cy="32" r="2.2" fill="#000" />
      <circle cx="64" cy="32" r="2.2" fill="#000" />
      <path d="M55 24 Q48 10 40 12" fill="none" stroke={ant} strokeWidth="2" strokeLinecap="round" />
      <path d="M65 24 Q72 10 80 12" fill="none" stroke={ant} strokeWidth="2" strokeLinecap="round" />
      {detailed && (
        <>
          <circle cx="40" cy="12" r="2.6" fill="#E1E5AC" stroke={ant} strokeWidth="1.5" />
          <circle cx="80" cy="12" r="2.6" fill="#E1E5AC" stroke={ant} strokeWidth="1.5" />
        </>
      )}
    </svg>
  );
}

export function MoriMark({ size = 28, light }: { size?: number; light?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 120 120" aria-hidden="true">
      <ellipse cx="38" cy="52" rx="24" ry="17" transform="rotate(-18 38 52)" fill={light ? '#FBFBF8' : '#6AA6DA'} />
      <ellipse cx="82" cy="52" rx="24" ry="17" transform="rotate(18 82 52)" fill={light ? '#FBFBF8' : '#6AA6DA'} />
      <ellipse cx="60" cy="64" rx="11" ry="27" fill="#E1E5AC" />
      <circle cx="60" cy="34" r="10" fill="#E1E5AC" />
      <circle cx="56" cy="33" r="2" fill="#000" />
      <circle cx="64" cy="33" r="2" fill="#000" />
    </svg>
  );
}
