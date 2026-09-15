import { NextResponse } from 'next/server';
import { getGuildInvites, getGuildMembers } from '@/lib/discord';
import { verifySession } from '@/lib/auth';
import { hasManageServer } from '@/lib/permissions';
import db from '@/lib/db';

export async function GET(request, { params }) {
  const { guildId } = await params;
  const sessionToken = request.cookies.get('session')?.value;
  const user = sessionToken ? await verifySession(sessionToken) : null;
  if (!user || !(await hasManageServer(user, guildId))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const searchParams = request.nextUrl.searchParams;
  const limit = Number(searchParams.get('limit') || 1000);
  const after = searchParams.get('after') || '';
  const query = searchParams.get('query') || '';

  try {
    const [members, invites] = await Promise.all([
      getGuildMembers(guildId, { limit, after, query }),
      getGuildInvites(guildId).catch(() => []),
    ]);
    const row = db.prepare('SELECT config FROM guild_configs WHERE guild_id = ?').get(guildId);
    const config = row ? JSON.parse(row.config) : null;
    return NextResponse.json({
      members,
      invites,
      infractions: config?.members?.infractions || [],
    });
  } catch (error) {
    console.error('Failed to fetch members data:', error);
    return NextResponse.json({ error: 'Failed to fetch members data' }, { status: 502 });
  }
}
