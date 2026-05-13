import type { Server } from 'socket.io';
import { fetchCurrentMatches, fetchCommentary } from '../services/cricapi.service';
import { emitNewCommentary, emitMatchEvent } from '../sockets';
import { config } from '../config/env';

export function startLivePulse(io: Server): NodeJS.Timeout {
  let tick = 0;
  return setInterval(async () => {
    tick += 1;
    try {
      const matches = await fetchCurrentMatches();
      for (const m of matches.slice(0, 4)) {
        io.of('/matches').to(`match:${m.id}`).emit('live_score_update', {
          matchId: m.id,
          status: m.status,
          score: m.score ?? [],
          ts: Date.now(),
        });
        if (tick % 2 === 0) {
          const commentary = await fetchCommentary(m.id);
          const last = commentary[commentary.length - 1];
          if (last) {
            emitNewCommentary(io, m.id, { text: last.text, over: last.over });
            emitMatchEvent(io, m.id, { type: 'tick', source: 'pulse', over: last.over });
          }
        }
      }
    } catch (e) {
      console.warn('[livePulse]', e);
    }
  }, Math.max(10_000, config.LIVE_POLL_INTERVAL_MS));
}
