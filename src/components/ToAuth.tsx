'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';

/** Signed-out visitors to a protected page are sent to sign in, and come back afterwards. */
export default function ToAuth() {
  const router = useRouter();
  const path = usePathname();
  useEffect(() => { router.replace(`/auth?next=${encodeURIComponent(path)}`); }, [router, path]);
  return null;
}
