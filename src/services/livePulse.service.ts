import type { Server } from 'socket.io';
import { fetchCommentary } from './cricapi.service';
import { getStoredLiveMatchesPayload } from './liveMatchesStore.service';
import { emitNewCommentary, emitMatchEvent } from '../sockets';
import { config } from '../config/env';

export function startLivePulse(io: Server): NodeJS.Timeout {
  let tick = 0;
  return setInterval(async () => {
    tick += 1;
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
      if (tick % 2 === 0) {
        const pulseCommentary = matches.slice(0, 4);
        for (let i = 0; i < pulseCommentary.length; i++) {
          const m = pulseCommentary[i];
          const commentary = await fetchCommentary(m.id);
          const last = commentary[commentary.length - 1];
          if (last) {
            emitNewCommentary(io, m.id, { text: last.text, over: last.over });
            emitMatchEvent(io, m.id, { type: 'tick', source: 'pulse', over: last.over });
          }
          if (i < pulseCommentary.length - 1) await new Promise((r) => setTimeout(r, 400));
        }
      }
    } catch (e) {
      console.warn('[livePulse]', e);
    }
  }, Math.max(10_000, config.LIVE_POLL_INTERVAL_MS));
}
