import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { jwtVerify } from 'jose';

const ROLE_DASHBOARD: Record<string, string> = {
  SUPER_ADMIN: '/admin',
  EO_ADMIN: '/eo',
  EO_STAFF: '/eo',
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

const WHITELIST = [
  '/_next',
  '/favicon.ico',
  '/api/auth',
  '/api/events',
  '/public',
  '/events',
];

const isWhitelisted = (pathname: string) => {
  return WHITELIST.some((path) => pathname.startsWith(path)) || pathname.startsWith('/events');
};

const getToken = (req: NextRequest) => {
  return req.cookies.get('token')?.value || req.headers.get('authorization')?.replace('Bearer ', '');
};

const getJwtSecret = () => {
  return process.env.JWT_SECRET || 'cd3d919b489f39a76917EME9M9cSy9FvfHvcx2gMPkp1H5Dj4YaKufPRsAyon8Tf';
};

const getUserFromCookie = (req: NextRequest) => {
  try {
    const userCookie = req.cookies.get('user')?.value;
    if (!userCookie) return null;
    return JSON.parse(decodeURIComponent(userCookie));
  } catch {
    return null;
  }
};

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (isWhitelisted(pathname)) {
    return NextResponse.next();
  }

  if (PUBLIC_ROUTES.includes(pathname)) {
    return NextResponse.next();
  }

  const token = getToken(req);

  if (!token) {
    const loginUrl = new URL('/login', req.url);
    loginUrl.searchParams.set('redirect', pathname);
    return NextResponse.redirect(loginUrl);
  }

  try {
    const { payload } = await jwtVerify(token, new TextEncoder().encode(getJwtSecret()));
    const role = payload.role as string;
    const user = getUserFromCookie(req);

    if (user?.status === 'PENDING_APPROVAL' && pathname !== '/auth/pending-approval') {
      return NextResponse.redirect(new URL('/auth/pending-approval', req.url));
    }

    if (user?.status === 'SUSPENDED' && pathname !== '/auth/suspended') {
      return NextResponse.redirect(new URL('/auth/suspended', req.url));
    }

    if (user?.status === 'BANNED' && pathname !== '/auth/suspended') {
      return NextResponse.redirect(new URL('/auth/suspended', req.url));
    }

    if (role === 'SUPER_ADMIN') {
      if (pathname.startsWith('/admin')) {
        return NextResponse.next();
      }
      return NextResponse.next();
    }

    if (role && ROLE_DASHBOARD[role]) {
      const targetDashboard = ROLE_DASHBOARD[role];
      // Only redirect if user is on /login or /register (should go to dashboard after auth)
      // Or if user explicitly visits /dashboard (redirect to role-specific dashboard)
      if (pathname === '/dashboard' || pathname.startsWith(targetDashboard)) {
        return NextResponse.next();
      }
      // If trying to access login/register while logged in, redirect to dashboard
      if (pathname === '/login' || pathname === '/register') {
        return NextResponse.redirect(new URL(targetDashboard, req.url));
      }
      // Allow all other routes (events, checkout, etc.)
      return NextResponse.next();
    }

    return NextResponse.next();
  } catch {
    const loginUrl = new URL('/login', req.url);
    loginUrl.searchParams.set('redirect', pathname);
    return NextResponse.redirect(loginUrl);
  }
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};