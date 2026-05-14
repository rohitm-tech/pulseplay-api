import { config } from '../config/env';
import { MatchCricCache } from '../modules/matches/matchCricCache.model';
import {
  fetchCommentary,
  fetchMatchById,
  type CommentaryBall,
  type CricMatchSummary,
} from './cricapi.service';
import { getStoredLiveMatchesPayload } from './liveMatchesStore.service';

const summaryInflight = new Map<string, Promise<CricMatchSummary | null>>();
const commentaryInflight = new Map<string, Promise<CommentaryBall[]>>();

/**
 * Match card for all users: prefer the stored live list (same payload as GET /matches/live), then DB TTL,
 * then a single shared `match_info` pull (deduped while in flight).
 */
export async function getSharedMatchSummary(matchId: string): Promise<CricMatchSummary | null> {
  const id = String(matchId).trim();
  if (!id) return null;

  const { matches, updatedAt } = await getStoredLiveMatchesPayload();
  const fromSnap = matches.find((m) => String(m.id) === id);
  const snapTime = updatedAt ? new Date(updatedAt) : null;

  if (fromSnap && snapTime) {
    const existing = await MatchCricCache.findById(id).select('summarySourceAt').lean<{ summarySourceAt?: Date } | null>();
    const prev = existing?.summarySourceAt ? new Date(existing.summarySourceAt).getTime() : 0;
    if (!existing || snapTime.getTime() > prev) {
      await MatchCricCache.findOneAndUpdate(
        { _id: id },
        { $set: { summary: fromSnap, summarySourceAt: snapTime } },
        { upsert: true }
      );
    }
    return fromSnap;
  }

  const now = Date.now();
  const cache = await MatchCricCache.findById(id).lean<{
    summary?: CricMatchSummary;
    summarySourceAt?: Date;
  } | null>();
  if (cache?.summary && cache.summarySourceAt) {
    const age = now - new Date(cache.summarySourceAt).getTime();
    if (age >= 0 && age < config.CRIC_CACHE_MATCH_SUMMARY_TTL_MS) {
      return cache.summary;
    }
  }

  const inflight = summaryInflight.get(id);
  if (inflight) return inflight;

  const p = (async () => {
    try {
      const m = await fetchMatchById(id);
      if (m?.id) {
        await MatchCricCache.findOneAndUpdate(
          { _id: id },
          { $set: { summary: m, summarySourceAt: new Date() } },
          { upsert: true }
        );
        return m;
      }
      return null;
    } finally {
      summaryInflight.delete(id);
    }
  })();

  summaryInflight.set(id, p);
  return p;
}

/**
 * Commentary shared across users: Mongo cache with TTL + in-flight dedupe (one CricAPI commentary pull at a time per match).
 */
export async function getSharedCommentary(matchId: string): Promise<CommentaryBall[]> {
  const id = String(matchId).trim();
  if (!id) return [];

  const now = Date.now();
  const cache = await MatchCricCache.findById(id).lean<{
    commentary?: CommentaryBall[];
    commentarySourceAt?: Date;
  } | null>();
  if (cache?.commentary && Array.isArray(cache.commentary) && cache.commentarySourceAt) {
    const age = now - new Date(cache.commentarySourceAt).getTime();
    if (age >= 0 && age < config.CRIC_CACHE_COMMENTARY_TTL_MS) {
      return cache.commentary;
    }
  }

  const inflight = commentaryInflight.get(id);
  if (inflight) return inflight;

  const p = (async () => {
    try {
      const balls = await fetchCommentary(id);
      await MatchCricCache.findOneAndUpdate(
        { _id: id },
        { $set: { commentary: balls, commentarySourceAt: new Date() } },
        { upsert: true }
      );
      return balls;
    } finally {
      commentaryInflight.delete(id);
    }
  })();

  commentaryInflight.set(id, p);
  return p;
}
