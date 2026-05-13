import axios from 'axios';
import { config } from '../config/env';
import { ApiError } from '../utils/apiError';
import { redisCache } from './redis.service';

export interface CricMatchSummary {
  id: string;
  name: string;
  status: string;
  venue?: string;
  date?: string;
  teams?: string[];
  teamInfo?: Record<string, { name: string; shortname?: string }>;
  score?: unknown[];
}

function requireCricKey(): void {
  if (!config.CRIC_API_KEY?.trim()) {
    throw new ApiError(
      503,
      'CRIC_API_KEY is not configured. Add it to backend/.env — data is loaded only from CricAPI (no mock matches).'
    );
  }
}

function assertCricResponse(data: unknown): Record<string, unknown> {
  if (!data || typeof data !== 'object') return {};
  const d = data as Record<string, unknown>;
  const st = String(d.status ?? '').toLowerCase();
  if (st === 'failure') {
    throw new ApiError(502, String(d.reason ?? d.message ?? 'CricAPI returned failure'), d);
  }
  return d;
}

function mapMatchRow(m: Record<string, unknown>): CricMatchSummary {
  const id = String(m.id ?? m.unique_id ?? '');
  const t1 = m.team1 ?? m['team-1'];
  const t2 = m.team2 ?? m['team-2'];
  const teams = [t1, t2].filter((x) => x != null && String(x).length > 0).map((x) => String(x));
  const name =
    m.name != null && String(m.name).trim()
      ? String(m.name)
      : teams.length >= 2
        ? `${teams[0]} vs ${teams[1]}`
        : 'Match';

  return {
    id,
    name,
    status: String(m.status ?? (m.matchStarted ? 'Live' : 'Scheduled')),
    venue: m.venue != null ? String(m.venue) : undefined,
    date: m.date != null ? String(m.date) : m.dateTimeGMT != null ? String(m.dateTimeGMT) : undefined,
    teams: teams.length ? teams : undefined,
    teamInfo: m.teamInfo as CricMatchSummary['teamInfo'],
    score: m.score != null ? (m.score as unknown[]) : undefined,
  };
}

function extractCommentaryRows(payload: unknown): Record<string, unknown>[] {
  if (!payload || typeof payload !== 'object') return [];
  const root = payload as Record<string, unknown>;
  const inner = root.data;

  if (Array.isArray(inner)) {
    return inner as Record<string, unknown>[];
  }
  if (inner && typeof inner === 'object') {
    const o = inner as Record<string, unknown>;
    for (const k of ['commentary', 'ballByBall', 'ballbyball', 'balls', 'bbl']) {
      if (Array.isArray(o[k])) return o[k] as Record<string, unknown>[];
    }
  }
  if (Array.isArray(root.commentary)) {
    return root.commentary as Record<string, unknown>[];
  }
  return [];
}

function rowToCommentaryText(c: Record<string, unknown>): string {
  const direct = [c.text, c.comm, c.commentary, c.detail, c.description, c.title]
    .find((v) => typeof v === 'string' && String(v).trim().length > 0);
  if (typeof direct === 'string') return direct.trim();

  const overPart = c.overs ?? c.over ?? c.ball ?? '';
  const bits: string[] = [];
  if (c.batsman) bits.push(String(c.batsman));
  if (c.bowler) bits.push(`bowled by ${String(c.bowler)}`);
  if (c.runs != null && String(c.runs) !== '') bits.push(`${String(c.runs)} run(s)`);
  if (c.event) bits.push(String(c.event));
  const joined = bits.join(' · ');
  if (joined) {
    return overPart ? `${String(overPart)}: ${joined}` : joined;
  }
  try {
    return JSON.stringify(c);
  } catch {
    return 'Ball update';
  }
}

function rowToOverLabel(c: Record<string, unknown>): string {
  const o = c.over ?? c.overs ?? c.o ?? '';
  if (typeof o === 'string' || typeof o === 'number') return String(o);
  return '';
}

function rowToBallLabel(c: Record<string, unknown>): string {
  const b = c.ball ?? c.ballNbr ?? c.n ?? '';
  if (typeof b === 'string' || typeof b === 'number') return String(b);
  return '';
}

export async function fetchCurrentMatches(): Promise<CricMatchSummary[]> {
  requireCricKey();

  const cacheKey = 'cricapi:v2:currentMatches';
  const cached = await redisCache.get<CricMatchSummary[]>(cacheKey);
  if (cached) return cached;

  try {
    const { data } = await axios.get(`${config.CRIC_API_BASE}/currentMatches`, {
      params: { apikey: config.CRIC_API_KEY, offset: 0 },
      timeout: 12_000,
    });
    const root = assertCricResponse(data);
    const list = (root.data ?? []) as Record<string, unknown>[];
    if (!Array.isArray(list)) {
      throw new ApiError(502, 'Unexpected CricAPI response for currentMatches', root);
    }
    const mapped = list.map((m) => mapMatchRow(m)).filter((row) => row.id.length > 0);
    await redisCache.set(cacheKey, mapped, 30);
    return mapped;
  } catch (e) {
    if (e instanceof ApiError) throw e;
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[cricapi] currentMatches failed', e);
    throw new ApiError(502, `CricAPI currentMatches request failed: ${msg}`);
  }
}

export async function fetchMatchById(id: string): Promise<CricMatchSummary | null> {
  requireCricKey();

  try {
    const { data } = await axios.get(`${config.CRIC_API_BASE}/match_info`, {
      params: { apikey: config.CRIC_API_KEY, id },
      timeout: 12_000,
    });
    const root = assertCricResponse(data);
    const m = root.data as Record<string, unknown> | undefined;
    if (!m || typeof m !== 'object') return null;
    const row = mapMatchRow(m);
    return row.id ? row : null;
  } catch (e) {
    if (e instanceof ApiError) throw e;
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[cricapi] match_info failed', e);
    throw new ApiError(502, `CricAPI match_info request failed: ${msg}`);
  }
}

export interface CommentaryBall {
  id: string;
  over: string;
  ball: string;
  text: string;
  timestamp: string;
}

export async function fetchCommentary(id: string): Promise<CommentaryBall[]> {
  requireCricKey();

  const cacheKey = `cricapi:v2:commentary:${id}`;
  const cached = await redisCache.get<CommentaryBall[]>(cacheKey);
  if (cached) return cached;

  try {
    const { data } = await axios.get(`${config.CRIC_API_BASE}/match_commentary`, {
      params: { apikey: config.CRIC_API_KEY, id },
      timeout: 12_000,
    });
    const envelope = assertCricResponse(data);
    const raw = extractCommentaryRows(envelope);
    if (!raw.length) {
      await redisCache.set(cacheKey, [], 15);
      return [];
    }
    const normalized = raw.map((item) =>
      typeof item === 'string' ? { text: item } : (item as Record<string, unknown>)
    );
    const balls: CommentaryBall[] = normalized.slice(-60).map((c, i) => ({
      id: `${id}-c-${i}-${rowToOverLabel(c)}-${rowToBallLabel(c)}`,
      over: rowToOverLabel(c) || String(Math.floor(i / 6)),
      ball: rowToBallLabel(c) || String((i % 6) + 1),
      text: rowToCommentaryText(c),
      timestamp: new Date().toISOString(),
    }));
    await redisCache.set(cacheKey, balls, 15);
    return balls;
  } catch (e) {
    if (e instanceof ApiError) throw e;
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[cricapi] match_commentary failed', e);
    throw new ApiError(502, `CricAPI match_commentary request failed: ${msg}`);
  }
}
