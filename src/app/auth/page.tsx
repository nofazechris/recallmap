import { redirect } from 'next/navigation';
import { auth } from '../../auth';
import Auth from '../../views/Auth';

export const dynamic = 'force-dynamic';

export default async function Page() {
  if ((await auth())?.user?.id) redirect('/app');
  return <Auth />;
}
