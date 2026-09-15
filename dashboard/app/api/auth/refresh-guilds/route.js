import { NextResponse } from 'next/server';
import { createSession, verifySession } from '@/lib/auth';
import { getUserGuilds } from '@/lib/discord';

export async function POST(request) {
  const sessionToken = request.cookies.get('session')?.value;
  const user = sessionToken ? await verifySession(sessionToken) : null;

  if (!user?.id || !user.accessToken) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const guilds = await getUserGuilds(user.accessToken);
    console.log('Raw guilds from Discord:', JSON.stringify(guilds, null, 2));
    const session = await createSession({
      id: user.id,
      username: user.username,
      avatar: user.avatar,
      accessToken: user.accessToken,
      guilds: guilds.map(({ id, name, icon, permissions }) => ({
        id,
        name,
        icon,
        permissions: permissions || '0',
      })),
    });

    const response = NextResponse.json({ ok: true, guildCount: guilds.length });
    response.headers.set('Set-Cookie', session);
    return response;
  } catch (error) {
    console.error('Failed to refresh user guilds:', error);
    return NextResponse.json({ error: 'Failed to refresh guilds' }, { status: 502 });
  }
}
