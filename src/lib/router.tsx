'use client';

/**
 * A thin compatibility layer so the screens built against react-router keep
 * working on the Next.js App Router. Same names, same call shapes.
 */
import NextLink from 'next/link';
import { usePathname, useRouter, useParams as useNextParams, useSearchParams as useNextSearchParams } from 'next/navigation';
import { useCallback, useEffect, useSyncExternalStore, type AnchorHTMLAttributes, type ReactNode } from 'react';

type LinkProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> & { to: string; replace?: boolean; children?: ReactNode };

export function Link({ to, replace, ...rest }: LinkProps) {
  return <NextLink href={to} replace={replace} {...rest} />;
}

type NavLinkProps = Omit<LinkProps, 'className'> & { end?: boolean; className?: string | ((s: { isActive: boolean }) => string) };

export function NavLink({ to, end, className, ...rest }: NavLinkProps) {
  const path = usePathname();
  const base = to.split(/[?#]/)[0];
  const isActive = end ? path === base : path === base || path.startsWith(`${base}/`);
  return <Link to={to} className={typeof className === 'function' ? className({ isActive }) : className} {...rest} />;
}

export function Navigate({ to, replace }: { to: string; replace?: boolean }) {
  const router = useRouter();
  useEffect(() => { (replace ? router.replace : router.push)(to); }, [to, replace, router]);
  return null;
}

export function useNavigate() {
  const router = useRouter();
  return useCallback((to: string | number, opts?: { replace?: boolean }) => {
    if (typeof to === 'number') { if (to < 0) router.back(); else router.forward(); return; }
    if (opts?.replace) router.replace(to); else router.push(to);
  }, [router]);
}

const subscribeHash = (cb: () => void) => { window.addEventListener('hashchange', cb); return () => window.removeEventListener('hashchange', cb); };

export function useLocation() {
  const pathname = usePathname();
  const sp = useNextSearchParams();
  const hash = useSyncExternalStore(subscribeHash, () => window.location.hash, () => '');
  const q = sp.toString();
  return { pathname, search: q ? `?${q}` : '', hash };
}

export function useParams<T extends Record<string, string | undefined> = Record<string, string | undefined>>() {
  return useNextParams() as unknown as T;
}

type ParamInit = string | URLSearchParams | Record<string, string>;
export function useSearchParams(): [URLSearchParams, (next: ParamInit, opts?: { replace?: boolean }) => void] {
  const sp = useNextSearchParams();
  const router = useRouter();
  const path = usePathname();
  const set = useCallback((next: ParamInit, opts?: { replace?: boolean }) => {
    const q = (next instanceof URLSearchParams ? next : new URLSearchParams(next)).toString();
    const url = q ? `${path}?${q}` : path;
    if (opts?.replace) router.replace(url, { scroll: false }); else router.push(url, { scroll: false });
  }, [path, router]);
  return [new URLSearchParams(sp.toString()), set];
}
