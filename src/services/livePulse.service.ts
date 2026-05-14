import type { Server } from 'socket.io';
import { getStoredLiveMatchesPayload } from './liveMatchesStore.service';
import { config } from '../config/env';

/**
 * Pushes score snapshots from the stored live list (Mongo) to subscribed rooms.
 * Does not call CricAPI or commentary refresh — avoids repeated upstream traffic.
 */
export function startLivePulse(io: Server): NodeJS.Timeout {
  return setInterval(async () => {
    try {
      const { matches } = await getStoredLiveMatchesPayload();
      for (const m of matches) {
        io.of('/matches').to(`match:${m.id}`).emit('live_score_update', {
          matchId: m.id,
          status: m.status,
          score: m.score ?? [],
          ts: Date.now(),
        });
      }
    } catch (e) {
      console.warn('[livePulse]', e);
    }
  }, Math.max(10_000, config.LIVE_POLL_INTERVAL_MS));
}
