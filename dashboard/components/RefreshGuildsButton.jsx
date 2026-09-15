'use client';

import { useState } from 'react';

export default function RefreshGuildsButton() {
  const [refreshing, setRefreshing] = useState(false);
  const [failed, setFailed] = useState(false);

  async function refreshGuilds() {
    setRefreshing(true);
    setFailed(false);
    try {
      const response = await fetch('/api/auth/refresh-guilds', { method: 'POST' });
      if (!response.ok) throw new Error('Refresh failed');
      window.location.reload();
    } catch {
      setFailed(true);
      setRefreshing(false);
    }
  }

  return (
    <div className="mt-6">
      <button
        type="button"
        onClick={refreshGuilds}
        disabled={refreshing}
        className="px-4 py-2 rounded-md bg-[#5865F2] hover:bg-[#4752C4] disabled:opacity-50 text-white font-semibold"
      >
        {refreshing ? 'Refreshing...' : 'Refresh server permissions'}
      </button>
      {failed && <p className="text-red-400 text-sm mt-3">Unable to refresh permissions. Please try again.</p>}
    </div>
  );
}
