import { NextResponse } from 'next/server';
import { getGuildChannels } from '@/lib/discord';
import { verifySession } from '@/lib/auth';
import { hasManageServer } from '@/lib/permissions';

export async function GET(request, { params }) {
  const { guildId } = await params;

  // Verify browser session
  const sessionToken = request.cookies.get('session')?.value;
  const user = sessionToken ? await verifySession(sessionToken) : null;
  if (!user || !(await hasManageServer(user, guildId))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const channels = await getGuildChannels(guildId);
    // Filter to text channels
    const textChannels = channels.filter((c) => c.type === 0 || c.type === 4 || c.type === 5); // 0 = GuildText, 4 = GuildCategory, 5 = GuildAnnouncement
    return NextResponse.json(textChannels);
  } catch (error) {
    console.error('Failed to fetch guild channels:', error);
    return NextResponse.json({ error: 'Failed to fetch channels' }, { status: 500 });
  }
}
