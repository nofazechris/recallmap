import { redirect } from 'next/navigation';
import { auth } from '../../auth';
import Auth from '../../views/Auth';
import type { Metadata } from 'next';
export const metadata: Metadata = { robots: { index: false, follow: false } };

export const dynamic = 'force-dynamic';

export default async function Page() {
  if ((await auth())?.user?.id) redirect('/app');
  return <Auth />;
}
