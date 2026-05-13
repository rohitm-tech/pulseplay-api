import axios from 'axios';
import { config } from '../config/env';
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

const MOCK_IPL: CricMatchSummary[] = [
  {
    id: 'mock-ipl-1',
    name: 'RCB vs CSK',
    status: 'Live',
    venue: 'M. Chinnaswamy Stadium',
    date: new Date().toISOString(),
    teams: ['Royal Challengers Bengaluru', 'Chennai Super Kings'],
    teamInfo: {
      rcb: { name: 'Royal Challengers Bengaluru', shortname: 'RCB' },
      csk: { name: 'Chennai Super Kings', shortname: 'CSK' },
    },
  },
  {
    id: 'mock-ipl-2',
    name: 'MI vs KKR',
    status: 'Scheduled',
    venue: 'Wankhede Stadium',
    date: new Date().toISOString(),
    teams: ['Mumbai Indians', 'Kolkata Knight Riders'],
  },
];

export async function fetchCurrentMatches(): Promise<CricMatchSummary[]> {
  const cacheKey = 'cricapi:currentMatches';
  const cached = await redisCache.get<CricMatchSummary[]>(cacheKey);
  if (cached) return cached;

  if (!config.CRIC_API_KEY) {
    return MOCK_IPL;
  }

  try {
    const { data } = await axios.get(`${config.CRIC_API_BASE}/currentMatches`, {
      params: { apikey: config.CRIC_API_KEY, offset: 0 },
      timeout: 12_000,
    });
    const list = (data?.data ?? []) as Record<string, unknown>[];
    const mapped: CricMatchSummary[] = list.map((m) => ({
      id: String(m.id ?? m.unique_id ?? ''),
      name: String(m.name ?? 'Match'),
      status: String(m.status ?? ''),
      venue: m.venue as string | undefined,
      date: m.date as string | undefined,
      teams: m.teams as string[] | undefined,
      teamInfo: m.teamInfo as CricMatchSummary['teamInfo'],
      score: m.score as unknown[] | undefined,
    }));
    await redisCache.set(cacheKey, mapped, 30);
    return mapped.length ? mapped : MOCK_IPL;
  } catch (e) {
    console.warn('[cricapi] currentMatches failed, using mock', e);
    return MOCK_IPL;
  }
}

export async function fetchMatchById(id: string): Promise<CricMatchSummary | null> {
  if (id.startsWith('mock-')) {
    return MOCK_IPL.find((m) => m.id === id) ?? MOCK_IPL[0];
  }
  if (!config.CRIC_API_KEY) {
    return MOCK_IPL.find((m) => m.id === id) ?? MOCK_IPL[0];
  }
  try {
    const { data } = await axios.get(`${config.CRIC_API_BASE}/match_info`, {
      params: { apikey: config.CRIC_API_KEY, id },
      timeout: 12_000,
    });
    const m = data?.data;
    if (!m) return null;
    return {
      id: String(m.id ?? id),
      name: String(m.name ?? 'Match'),
      status: String(m.status ?? ''),
      venue: m.venue,
      date: m.date,
      teams: m.teams,
      teamInfo: m.teamInfo,
      score: m.score,
    };
  } catch {
    return MOCK_IPL.find((m) => m.id === id) ?? null;
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
  const cacheKey = `cricapi:commentary:${id}`;
  const cached = await redisCache.get<CommentaryBall[]>(cacheKey);
  if (cached) return cached;

  if (!config.CRIC_API_KEY || id.startsWith('mock-')) {
    return buildMockCommentary(id);
  }

  try {
    const { data } = await axios.get(`${config.CRIC_API_BASE}/match_commentary`, {
      params: { apikey: config.CRIC_API_KEY, id },
      timeout: 12_000,
    });
    const raw = (data?.data ?? data?.commentary ?? []) as Record<string, unknown>[];
    if (!Array.isArray(raw) || raw.length === 0) {
      return buildMockCommentary(id);
    }
    const balls: CommentaryBall[] = raw.slice(-30).map((c, i) => ({
      id: `${id}-c-${i}`,
      over: String(c.over ?? ''),
      ball: String(c.ball ?? ''),
      text: String(c.text ?? c.comm ?? c.commentary ?? ''),
      timestamp: new Date().toISOString(),
    }));
    await redisCache.set(cacheKey, balls, 15);
    return balls;
  } catch {
    return buildMockCommentary(id);
  }
}

function buildMockCommentary(matchId: string): CommentaryBall[] {
  const samples = [
    'Kohli smashes Starc for a massive SIX!',
    'FOUR! Crashed through covers.',
    'WICKET! Bowled him — middle stump pegged back.',
    'FIFTY for the batter — what a knock under pressure.',
    'DRS taken — umpire\'s call on impact.',
    'Powerplay ends — field spreads.',
    'CENTURY! The crowd goes wild.',
    'Review retained — not out.',
    'WIN! The chasing side gets home with a ball to spare.',
  ];
  return samples.map((text, i) => ({
    id: `${matchId}-ball-${i}`,
    over: `${Math.floor(i / 6)}.${(i % 6) + 1}`,
    ball: String(i + 1),
    text,
    timestamp: new Date(Date.now() - (samples.length - i) * 60_000).toISOString(),
  }));
}
