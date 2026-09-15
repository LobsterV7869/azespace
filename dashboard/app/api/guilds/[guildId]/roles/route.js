import { NextResponse } from 'next/server';
import { getGuildRoles } from '@/lib/discord';
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
    const roles = await getGuildRoles(guildId);
    // Filter out @everyone if required or let them select roles
    return NextResponse.json(roles);
  } catch (error) {
    console.error('Failed to fetch guild roles:', error);
    return NextResponse.json({ error: 'Failed to fetch roles' }, { status: 500 });
  }
}
