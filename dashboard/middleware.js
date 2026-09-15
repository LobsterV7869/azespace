import { NextResponse } from 'next/server';
import { verifySession } from './lib/auth';
import { hasManageServer } from './lib/permissions';

export async function middleware(request) {
  const { pathname } = request.nextUrl;

  if (pathname.startsWith('/dashboard/')) {
    const guildId = pathname.split('/')[2];
    if (!guildId) return NextResponse.next();

    const sessionToken = request.cookies.get('session')?.value;
    if (!sessionToken) {
      return NextResponse.redirect(new URL('/login', request.url));
    }

    const user = await verifySession(sessionToken);
    if (!user) {
      return NextResponse.redirect(new URL('/login', request.url));
    }

    try {
      // Keep dashboard page access consistent with guild-scoped API authorization.
      if (!(await hasManageServer(user, guildId))) {
        return NextResponse.redirect(new URL('/dashboard?error=unauthorized_guild', request.url));
      }
    } catch (error) {
      console.error('Middleware error:', error);
      return NextResponse.redirect(new URL('/dashboard?error=verification_failed', request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/dashboard/:path*'],
};
