import { LiveMatchesSnapshot, LIVE_MATCHES_SNAPSHOT_ID, type LiveMatchesDocLean } from '../modules/matches/liveMatchesSnapshot.model';
import { pullCurrentMatchesFromCricApi, type CricMatchSummary } from './cricapi.service';

export interface LiveMatchesPayload {
  matches: CricMatchSummary[];
  updatedAt: string | null;
}

export async function getStoredLiveMatchesPayload(): Promise<LiveMatchesPayload> {
  const doc = await LiveMatchesSnapshot.findById(LIVE_MATCHES_SNAPSHOT_ID).lean<LiveMatchesDocLean | null>();
  if (!doc) {
    return { matches: [], updatedAt: null };
  }
  return {
    matches: (doc.matches ?? []) as CricMatchSummary[],
    updatedAt: doc.updatedAt ? new Date(doc.updatedAt).toISOString() : null,
  };
}

let refreshInflight: Promise<void> | null = null;

/** Calls CricAPI and replaces the stored snapshot (POST /matches/live/refresh only). */
export async function refreshLiveMatchesFromCricApi(): Promise<LiveMatchesPayload> {
  if (refreshInflight) {
    await refreshInflight;
    return getStoredLiveMatchesPayload();
  }

  refreshInflight = (async () => {
    const matches = await pullCurrentMatchesFromCricApi();
    await LiveMatchesSnapshot.findOneAndUpdate(
      { _id: LIVE_MATCHES_SNAPSHOT_ID },
      { $set: { matches, updatedAt: new Date() } },
      { upsert: true }
    );
  })();

  try {
    await refreshInflight;
    return getStoredLiveMatchesPayload();
  } finally {
    refreshInflight = null;
  }
}
