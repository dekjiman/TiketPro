import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { jwtVerify } from 'jose';

const ROLE_DASHBOARD: Record<string, string> = {
  SUPER_ADMIN: '/admin',
  EO_ADMIN: '/eo',
  EO_STAFF: '/eo/checkin',
  AFFILIATE: '/affiliate',
  RESELLER: '/reseller',
  CUSTOMER: '/dashboard',
};

const PUBLIC_ROUTES = [
  '/',
  '/login',
  '/register',
  '/verify-email',
  '/forgot-password',
  '/reset-password',
  '/auth/google/callback',
  '/auth/pending-approval',
  '/auth/suspended',
  '/events',
];

const PROTECTED_PREFIXES = ['/dashboard', '/profile', '/admin', '/eo', '/affiliate', '/reseller'];

const WHITELIST = [
  '/_next',
  '/favicon.ico',
  '/api',
  '/api/auth',
  '/api/events',
  '/public',
  '/events',
];

const isWhitelisted = (pathname: string) => {
  return WHITELIST.some((path) => pathname.startsWith(path)) || pathname.startsWith('/events');
};

const getToken = (req: NextRequest) => {
  return req.cookies.get('access_token')?.value || req.headers.get('authorization')?.replace('Bearer ', '');
};

const getUserRoleFromCookie = (req: NextRequest): string | null => {
  const raw = req.cookies.get('user')?.value;
  if (!raw) return null;
  try {
    const parsed = JSON.parse(decodeURIComponent(raw)) as { role?: string };
    return parsed.role || null;
  } catch {
    return null;
  }
};

const getJwtSecret = () => {
  return process.env.JWT_SECRET;
};

const isAuthorizedPath = (role: string, pathname: string) => {
  if (pathname.startsWith('/admin')) return role === 'SUPER_ADMIN';
  if (pathname.startsWith('/eo')) return role === 'EO_ADMIN' || role === 'EO_STAFF' || role === 'SUPER_ADMIN';
  if (pathname.startsWith('/affiliate')) return role === 'AFFILIATE';
  if (pathname.startsWith('/reseller')) return role === 'RESELLER';
  if (pathname.startsWith('/dashboard')) return !!role;
  if (pathname.startsWith('/profile')) return !!role;
  return true;
};

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const userRole = getUserRoleFromCookie(req);
  const token = getToken(req);

  if (isWhitelisted(pathname)) {
    return NextResponse.next();
  }

  if ((pathname === '/login' || pathname === '/register') && token && userRole && ROLE_DASHBOARD[userRole]) {
    return NextResponse.redirect(new URL(ROLE_DASHBOARD[userRole], req.url));
  }

  if (PUBLIC_ROUTES.includes(pathname)) {
    return NextResponse.next();
  }

  if (!token && !userRole) {
    const loginUrl = new URL('/login', req.url);
    loginUrl.searchParams.set('redirect', pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (!token && userRole) {
    // Never trust the client-managed "user" cookie for protected routes.
    if (PROTECTED_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
      const loginUrl = new URL('/login', req.url);
      loginUrl.searchParams.set('redirect', pathname);
      return NextResponse.redirect(loginUrl);
    }
    return NextResponse.next();
  }

  try {
    const secret = getJwtSecret();
    if (!secret) {
      if (userRole) {
        if (!isAuthorizedPath(userRole, pathname)) {
          return NextResponse.redirect(new URL(ROLE_DASHBOARD[userRole] || '/dashboard', req.url));
        }
        return NextResponse.next();
      }
      return NextResponse.next();
    }

    const { payload } = await jwtVerify(token, new TextEncoder().encode(secret));
    const role = payload.role as string;
    if (!role || !ROLE_DASHBOARD[role]) throw new Error('Invalid token role');

    if (pathname === '/login' || pathname === '/register') {
      return NextResponse.redirect(new URL(ROLE_DASHBOARD[role], req.url));
    }

    if (!isAuthorizedPath(role, pathname)) {
      return NextResponse.redirect(new URL(ROLE_DASHBOARD[role], req.url));
    }

    return NextResponse.next();
  } catch {
    if (userRole && ROLE_DASHBOARD[userRole]) {
      if (!isAuthorizedPath(userRole, pathname)) {
        return NextResponse.redirect(new URL(ROLE_DASHBOARD[userRole], req.url));
      }
      return NextResponse.next();
    }
    if (pathname === '/login' || pathname === '/register') {
      return NextResponse.next();
    }
    const loginUrl = new URL('/login', req.url);
    if (pathname !== '/login') {
      loginUrl.searchParams.set('redirect', pathname);
    }
    return NextResponse.redirect(loginUrl);
  }
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
