'use client';

import { Link } from '../lib/router';
import { MoriMark } from './Mori';

export default function Logo({ to = '/', size = 28, light, text = true }: { to?: string; size?: number; light?: boolean; text?: boolean }) {
  return (
    <Link to={to} style={{ display: 'inline-flex', alignItems: 'center', gap: 10, color: light ? '#FBFBF8' : '#000' }} aria-label="RecallMap home">
      <MoriMark size={size} light={light} />
      {text && <span style={{ fontWeight: 600, fontSize: size * 0.7, letterSpacing: '-0.02em' }}>RecallMap</span>}
    </Link>
  );
}
