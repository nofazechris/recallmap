import type { ReactNode } from 'react';
import ToAuth from '../../components/ToAuth';
import { loadSnapshot } from '../../server/session';
import { StoreProvider, type ServerSnapshot } from '../../store/store';

export const dynamic = 'force-dynamic';

export default async function Layout({ children }: { children: ReactNode }) {
  const snap = await loadSnapshot();
  if (!snap) return <ToAuth />;
  return <StoreProvider initial={snap as unknown as ServerSnapshot}>{children}</StoreProvider>;
}
