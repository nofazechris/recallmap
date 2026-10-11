import type { ReactNode } from 'react';
import { RequireSession } from '../../../components/AppShell';
import ToAuth from '../../../components/ToAuth';
import { loadSnapshot } from '../../../server/session';
import { StoreProvider, type ServerSnapshot } from '../../../store/store';

export const dynamic = 'force-dynamic';

export default async function ShellLayout({ children }: { children: ReactNode }) {
  const snap = await loadSnapshot();
  if (!snap) return <ToAuth />;
  return <StoreProvider initial={snap as unknown as ServerSnapshot}><RequireSession>{children}</RequireSession></StoreProvider>;
}
