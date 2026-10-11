'use client';

import { useEffect, type ReactNode } from 'react';
import { useLocation } from '../lib/router';
import Toasts from './Toasts';

/** Scroll to top on navigation, unless the URL targets an in-page anchor. */
function ScrollManager() {
  const { pathname, search, hash } = useLocation();
  useEffect(() => {
    if (!hash) window.scrollTo(0, 0);
  }, [pathname, search, hash]);
  return null;
}

export default function Providers({ children }: { children: ReactNode }) {
  return (
    <>
      <ScrollManager />
      {children}
      <Toasts />
    </>
  );
}
