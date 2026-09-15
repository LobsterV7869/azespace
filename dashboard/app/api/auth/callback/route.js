import { NextResponse } from 'next/server';
import { createSession } from '@/lib/auth';
import { getUserGuilds } from '@/lib/discord';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');

  if (!code) {
    return NextResponse.redirect(new URL('/login?error=missing_code', request.url));
  }

  try {
    // Exchange code for token
    const tokenResponse = await fetch('https://discord.com/api/oauth2/token', {
      method: 'POST',
      body: new URLSearchParams({
        client_id: process.env.DISCORD_CLIENT_ID,
        client_secret: process.env.DISCORD_CLIENT_SECRET,
        grant_type: 'authorization_code',
        code,
        redirect_uri: process.env.DISCORD_REDIRECT_URI,
      }),
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    });

    const tokenData = await tokenResponse.json();

    if (tokenData.error) {
      console.error('OAuth error:', tokenData);
      return NextResponse.redirect(new URL('/login?error=oauth_failed', request.url));
    }

    // Fetch user info
    const userResponse = await fetch('https://discord.com/api/users/@me', {
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
      },
    });

    const userData = await userResponse.json();
    if (!userResponse.ok || !userData.id) {
      throw new Error('Failed to fetch Discord user');
    }

    // Capture permissions once during login; request authorization reads this signed snapshot.
    const guilds = await getUserGuilds(tokenData.access_token);
    console.log('Raw guilds from Discord:', JSON.stringify(guilds, null, 2));

    // Create session
    const session = await createSession({
      id: userData.id,
      username: userData.username,
      avatar: userData.avatar,
      accessToken: tokenData.access_token,
      guilds: guilds.map(({ id, name, icon, permissions }) => ({
        id,
        name,
        icon,
        permissions: permissions || '0',
      })),
    });

    const response = NextResponse.redirect(new URL('/dashboard', request.url));
    response.headers.set('Set-Cookie', session);

    return response;
  } catch (error) {
    console.error('Auth error:', error);
    return NextResponse.redirect(new URL('/login?error=server_error', request.url));
  }
}
