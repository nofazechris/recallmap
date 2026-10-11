'use client';

import { useId, type CSSProperties } from 'react';
import './Flame.css';

interface Props {
  /** Rendered height in px (width follows the 4:5 aspect). */
  size?: number;
  /** Skip the unfold + flicker (also honoured automatically with reduced motion). */
  still?: boolean;
  style?: CSSProperties;
  className?: string;
  label?: string;
}

/**
 * A layered fire. Two leaf-shaped side petals peel away from a red-orange body, with a
 * golden middle, a pale-yellow inner tongue and a white-hot core. On mount each layer
 * unfolds from the base like a leaf; afterwards every layer flickers on its own rhythm.
 */
export default function Flame({ size = 24, still, style, className, label }: Props) {
  const uid = useId().replace(/:/g, '');
  const g = (n: string) => `${n}-${uid}`;
  const embers = size >= 36 && !still;

  return (
    <svg
      width={Math.round(size * 0.8)}
      height={size}
      viewBox="0 0 64 80"
      className={`rmf${still ? ' still' : ''}${className ? ` ${className}` : ''}`}
      style={style}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      overflow="visible"
    >
      <defs>
        <radialGradient id={g('glow')} cx="50%" cy="68%" r="55%">
          <stop offset="0" stopColor="#ff9a2a" stopOpacity="0.65" />
          <stop offset="0.55" stopColor="#ff5a14" stopOpacity="0.22" />
          <stop offset="1" stopColor="#ff3d00" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={g('outer')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffb02e" />
          <stop offset="0.38" stopColor="#ff6a00" />
          <stop offset="1" stopColor="#d9290a" />
        </linearGradient>
        <linearGradient id={g('petal')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ff7a1a" />
          <stop offset="1" stopColor="#b81a05" />
        </linearGradient>
        <linearGradient id={g('mid')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffe45a" />
          <stop offset="0.5" stopColor="#ffb122" />
          <stop offset="1" stopColor="#ff7d00" />
        </linearGradient>
        <linearGradient id={g('inner')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff6b8" />
          <stop offset="1" stopColor="#ffd83d" />
        </linearGradient>
        <linearGradient id={g('core')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="1" stopColor="#fff0b0" />
        </linearGradient>
        <radialGradient id={g('base')} cx="50%" cy="50%" r="50%">
          <stop offset="0" stopColor="#8fd0ff" stopOpacity="0.95" />
          <stop offset="1" stopColor="#3b82f6" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* heat haze behind everything */}
      <ellipse className="f-glow" cx="32" cy="50" rx="34" ry="38" fill={`url(#${g('glow')})`} />

      {/* side petals — they peel away first, like leaves opening */}
      <path className="f-petal l" d="M14 54 C5 45 7 30 18 19 C17 30 22 36 22 46 C22 55 18 60 14 54 Z" fill={`url(#${g('petal')})`} />
      <path className="f-petal r" d="M50 55 C59 46 57 32 46 21 C47 32 42 38 42 48 C42 57 46 61 50 55 Z" fill={`url(#${g('petal')})`} />

      {/* main body */}
      <path className="f-outer" d="M33 2 C35 15 51 25 52 45 C53 62 44 75 32 75 C20 75 11 63 12 47 C13 36 19 31 22 22 C24 28 27 30 29 28 C32 22 31 12 33 2 Z" fill={`url(#${g('outer')})`} />
      <path className="f-mid" d="M32 19 C33 28 44 34 45 49 C46 63 40 73 32 73 C24 73 18 63 19 50 C20 42 25 38 28 32 C30 35 31 28 32 19 Z" fill={`url(#${g('mid')})`} />
      <path className="f-inner" d="M32 37 C33 44 39 48 39 58 C39 66 36 72 32 72 C28 72 25 66 25 59 C25 51 30 48 32 37 Z" fill={`url(#${g('inner')})`} />
      <path className="f-core" d="M32 53 C34 58 37 60 37 65 C37 69 35 72 32 72 C29 72 27 69 27 65 C27 60 30 58 32 53 Z" fill={`url(#${g('core')})`} />

      {/* the blue-white glow at the very base of a real flame */}
      <ellipse className="f-base" cx="32" cy="72" rx="10" ry="4" fill={`url(#${g('base')})`} />

      {embers && (
        <g className="f-embers">
          <circle cx="24" cy="12" r="1.3" /><circle cx="41" cy="9" r="1.1" /><circle cx="33" cy="4" r="1.5" />
        </g>
      )}
    </svg>
  );
}
