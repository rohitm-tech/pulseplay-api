import { LiveMatchesSnapshot, LIVE_MATCHES_SNAPSHOT_ID, type LiveMatchesDocLean } from '../modules/matches/liveMatchesSnapshot.model';
import { MatchCricCache } from '../modules/matches/matchCricCache.model';
import { pullCurrentMatchesFromCricApi, type CricMatchSummary } from './cricapi.service';

export interface LiveMatchesPayload {
  matches: CricMatchSummary[];
  updatedAt: string | null;
}

function parseMatchStartMs(date?: string): number | null {
  const raw = date?.trim();
  if (!raw) return null;
  const t = new Date(raw).getTime();
  return Number.isNaN(t) ? null : t;
}

/** Newest scheduled/start time first; undated matches last; stable tie-break on id. */
export function sortMatchesLatestFirst<T extends { date?: string; id?: string }>(matches: T[]): T[] {
  return [...matches].sort((a, b) => {
    const ta = parseMatchStartMs(a.date);
    const tb = parseMatchStartMs(b.date);
    if (ta != null && tb != null && ta !== tb) return tb - ta;
    if (ta != null && tb == null) return -1;
    if (ta == null && tb != null) return 1;
    return String(b.id ?? '').localeCompare(String(a.id ?? ''));
  });
}

export async function getStoredLiveMatchesPayload(): Promise<LiveMatchesPayload> {
  const doc = await LiveMatchesSnapshot.findById(LIVE_MATCHES_SNAPSHOT_ID).lean<LiveMatchesDocLean | null>();
  if (!doc) {
    return { matches: [], updatedAt: null };
  }
  return {
    matches: sortMatchesLatestFirst((doc.matches ?? []) as CricMatchSummary[]),
    updatedAt: doc.updatedAt ? new Date(doc.updatedAt).toISOString() : null,
  };
}

let refreshInflight: Promise<void> | null = null;

async function syncMatchCachesFromLiveSnapshot(matches: CricMatchSummary[], snapshotTime: Date): Promise<void> {
  if (!matches.length) return;
  const ops = matches
    .filter((m) => String(m.id ?? '').trim().length > 0)
    .map((m) => ({
      updateOne: {
        filter: { _id: m.id },
        update: { $set: { summary: m, summarySourceAt: snapshotTime } },
        upsert: true,
      },
    }));
  await MatchCricCache.bulkWrite(ops, { ordered: false });
}

/** Calls CricAPI and replaces the stored snapshot (POST /matches/live/refresh only). */
export async function refreshLiveMatchesFromCricApi(): Promise<LiveMatchesPayload> {
  if (refreshInflight) {
    await refreshInflight;
    return getStoredLiveMatchesPayload();
  }

  refreshInflight = (async () => {
    const matches = await pullCurrentMatchesFromCricApi();
    const updatedAt = new Date();
    await LiveMatchesSnapshot.findOneAndUpdate(
      { _id: LIVE_MATCHES_SNAPSHOT_ID },
      { $set: { matches, updatedAt } },
      { upsert: true }
    );
    await syncMatchCachesFromLiveSnapshot(matches, updatedAt);
  })();

  try {
    await refreshInflight;
    return getStoredLiveMatchesPayload();
  } finally {
    refreshInflight = null;
  }
}
