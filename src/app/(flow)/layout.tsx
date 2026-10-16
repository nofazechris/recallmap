import type { ReactNode } from 'react';
import { RequireAuth } from '../../components/AppShell';
import ToAuth from '../../components/ToAuth';
import { loadSnapshot } from '../../server/session';
import { StoreProvider, type ServerSnapshot } from '../../store/store';
import type { Metadata } from 'next';
export const metadata: Metadata = { robots: { index: false, follow: false } };

export const dynamic = 'force-dynamic';

export default async function FlowLayout({ children }: { children: ReactNode }) {
  const snap = await loadSnapshot();
  if (!snap) return <ToAuth />;
  return <StoreProvider initial={snap as unknown as ServerSnapshot}><RequireAuth>{children}</RequireAuth></StoreProvider>;
}
