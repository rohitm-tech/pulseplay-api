import { z } from 'zod';
import { fetchCommentary, fetchMatchById, syntheticCommentaryFromMatchCard } from './cricapi.service';
import { getStoredLiveMatchesPayload } from './liveMatchesStore.service';
import { geminiService } from './geminiService';
import { ApiError } from '../utils/apiError';
import { parseCommentaryLine } from './commentaryProcessor.service';

export interface AiInsight {
  id: string;
  title: string;
  body: string;
  tone: 'hype' | 'analytical';
  createdAt: string;
}

/** Gemini-powered match digest: narrative summary, bullet highlights, and tone cards. */
export interface MatchAiPack {
  summary: string;
  highlights: string[];
  insights: AiInsight[];
}

const insightItemSchema = z.object({
  id: z.string().min(1).optional(),
  title: z.string().min(1),
  body: z.string().min(1),
  tone: z.enum(['hype', 'analytical']),
});

const insightsArraySchema = z.array(insightItemSchema).min(1).max(8);

const summaryHighlightsSchema = z.object({
  summary: z.string().min(1),
  highlights: z.array(z.string().min(1)).min(1).max(12),
});

function normalizeInsights(matchId: string, raw: z.infer<typeof insightsArraySchema>): AiInsight[] {
  const now = new Date().toISOString();
  return raw.map((row, i) => ({
    id: row.id || `${matchId}-insight-${i}`,
    title: row.title,
    body: row.body,
    tone: row.tone,
    createdAt: now,
  }));
}

function buildContextBlock(matchId: string, match: Awaited<ReturnType<typeof fetchMatchById>>, commentaryLines: string[]) {
  return JSON.stringify(
    {
      matchId,
      match: match ?? { id: matchId, note: 'No match card in context — match_info failed and no stored live snapshot row for this id.' },
      recentCommentaryLines: commentaryLines,
    },
    null,
    2
  );
}

async function resolveMatchForDigest(matchId: string): Promise<Awaited<ReturnType<typeof fetchMatchById>>> {
  try {
    const m = await fetchMatchById(matchId);
    if (m?.id) return m;
  } catch (e) {
    console.warn('[aiInsights] fetchMatchById failed; trying stored live snapshot', e);
  }
  try {
    const { matches } = await getStoredLiveMatchesPayload();
    return matches.find((x) => String(x.id) === String(matchId)) ?? null;
  } catch (e) {
    console.warn('[aiInsights] stored live snapshot read failed', e);
    return null;
  }
}

async function resolveCommentaryForDigest(
  matchId: string,
  match: Awaited<ReturnType<typeof fetchMatchById>>
): Promise<Awaited<ReturnType<typeof fetchCommentary>>> {
  try {
    const balls = await fetchCommentary(matchId);
    if (balls.length) return balls;
  } catch (e) {
    console.warn('[aiInsights] fetchCommentary failed', e);
  }
  if (match && Array.isArray(match.score) && match.score.length > 0) {
    return syntheticCommentaryFromMatchCard(matchId, match);
  }
  return [];
}

/** Heuristic digest when Gemini is off or fails — keeps the second screen usable. */
export function buildOfflineMatchAiPack(
  matchId: string,
  match: Awaited<ReturnType<typeof fetchMatchById>>,
  commentary: Awaited<ReturnType<typeof fetchCommentary>>
): MatchAiPack {
  const now = new Date().toISOString();
  const tail = commentary.slice(-14);
  const name = match?.name ?? `Match ${matchId}`;
  const status = match?.status ? `Current status: ${match.status}.` : '';
  const venue = match?.venue ? `Venue: ${match.venue}.` : '';
  const last = tail[tail.length - 1];
  const summary = [
    `You are following ${name}.`,
    status,
    venue,
    last
      ? `Latest ball (${last.over}): ${last.text.slice(0, 220)}${last.text.length > 220 ? '…' : ''}`
      : 'Commentary is still sparse — check back after a few more deliveries.',
    'Tip: set GEMINI_API_KEY in backend/.env for a full Gemini digest.',
  ]
    .filter(Boolean)
    .join(' ');

  const highlights =
    tail.length > 0
      ? tail.map((c) => `${c.over}: ${c.text}`.slice(0, 118))
      : ['Waiting for ball-by-ball lines from CricAPI (or mock feed).'];

  const insights: AiInsight[] = [];
  const seen = new Set<string>();
  for (const c of tail.slice().reverse()) {
    const ev = parseCommentaryLine(c.text);
    if (ev.type === 'UNKNOWN') continue;
    if (seen.has(ev.type)) continue;
    seen.add(ev.type);
    const title =
      ev.type === 'SIX'
        ? 'Maximum'
        : ev.type === 'FOUR'
          ? 'Boundary'
          : ev.type === 'WICKET'
            ? 'Wicket'
            : ev.type === 'FIFTY' || ev.type === 'CENTURY'
              ? 'Milestone'
              : ev.type;
    const body =
      ev.type === 'WICKET'
        ? `${ev.player ? `${ev.player} dismissed` : 'A wicket falls'} — ${c.text.slice(0, 200)}`
        : `${c.text.slice(0, 240)}${c.text.length > 240 ? '…' : ''}`;
    insights.push({
      id: `${matchId}-${ev.type.toLowerCase()}-${insights.length}`,
      title,
      body,
      tone: ev.type === 'WICKET' || ev.type === 'DRS' || ev.type === 'REVIEW' ? 'analytical' : 'hype',
      createdAt: now,
    });
    if (insights.length >= 4) break;
  }
  while (insights.length < 3) {
    insights.push({
      id: `${matchId}-pad-${insights.length}`,
      title: insights.length === 0 ? 'Feed pulse' : insights.length === 1 ? 'Tempo' : 'Crowd energy',
      body:
        insights.length === 0
          ? 'We are stitching insight cards from the live commentary stream as balls arrive.'
          : insights.length === 1
            ? 'Watch for clusters of boundaries or dot-ball pressure — both swing momentum in T20.'
            : 'Turn on Gemini for richer tactical reads grounded in the same feed.',
      tone: insights.length % 2 === 0 ? 'hype' : 'analytical',
      createdAt: now,
    });
  }

  return { summary, highlights, insights };
}

function buildOfflineWicketExplanation(trimmed: string): string {
  const ev = parseCommentaryLine(trimmed);
  if (ev.type !== 'WICKET') {
    return `Quick read: this passage looks like a live ball update rather than a clear dismissal line. "${trimmed.slice(0, 200)}${trimmed.length > 200 ? '…' : ''}" — enable Gemini for a deeper analyst-style recap.`;
  }
  const batter = ev.player ? `${ev.player}` : 'The batter';
  const bowler = ev.bowler ? ` ${ev.bowler} is in the story too.` : '';
  return `${batter} is out.${bowler} Plain version: ${trimmed.slice(0, 280)}${trimmed.length > 280 ? '…' : ''}`;
}

/**
 * Summary + highlights + insight cards from live CricAPI match + commentary (Gemini, `@google/genai` — same pattern as HackAIBengaluru).
 */
export async function getMatchAiAnalysis(matchId: string): Promise<MatchAiPack> {
  const match = await resolveMatchForDigest(matchId);
  const commentary = await resolveCommentaryForDigest(matchId, match);

  if (!geminiService.isConfigured()) {
    return buildOfflineMatchAiPack(matchId, match, commentary);
  }

  const recent = commentary.slice(-40).map((c) => `[${c.over}.${c.ball}] ${c.text}`);
  const context = buildContextBlock(matchId, match, recent);

  const systemTone =
    'You are PulsePlay, a sharp cricket co-pilot for T20 / IPL fans. Only use facts present in the JSON context; never invent players, overs, or scores that are not there. ' +
    'IMPORTANT: If `match` includes name, status, teams, venue, date, or score[] — or if recentCommentaryLines is non-empty (including scorecard snapshot lines) — you MUST write the digest from that material. ' +
    'Scorecard snapshot lines are valid data. Do not say match information is "unavailable" or "cannot be provided" when any of those fields are present.';

  const summaryPrompt = `${systemTone}

Task: Write a tight match snapshot for someone glancing at a second screen.

Rules:
- summary: 2–4 sentences, plain text, no markdown, no hashtags.
- highlights: 4–8 short bullet phrases (each under 120 characters) for the most interesting recent moments, tactical notes, or scoreboard pressure — grounded in the data.

Context JSON:
${context}`;

  const insightsPrompt = `${systemTone}

Task: Produce 3 to 5 insight cards for fans watching on a second screen.

Rules:
- Be specific to teams / score / recent balls when the data allows; if only scorecard totals and status exist, still produce concrete cards (e.g. chase completed, margins, innings tallies).
- Mix tones: at least one "hype" and one "analytical".
- Each body under 320 characters, punchy, no markdown, no hashtags.
- ids: short kebab or slug unique strings.

Context JSON:
${context}`;

  try {
    const [shRaw, insRaw] = await Promise.all([
      geminiService.generateJSON<unknown>(summaryPrompt, {
        summary: 'string',
        highlights: ['string'],
      }),
      geminiService.generateJSON<unknown>(insightsPrompt, [
        {
          id: 'string',
          title: 'string',
          body: 'string',
          tone: 'hype | analytical',
        },
      ]),
    ]);

    const sh = summaryHighlightsSchema.safeParse(shRaw);
    const ins = insightsArraySchema.safeParse(insRaw);

    if (!sh.success || !ins.success) {
      if (!sh.success) console.warn('[aiInsights] summary/highlights validation failed', sh.error.flatten());
      if (!ins.success) console.warn('[aiInsights] insights validation failed', ins.error.flatten());
      return buildOfflineMatchAiPack(matchId, match, commentary);
    }

    return {
      summary: sh.data.summary,
      highlights: sh.data.highlights,
      insights: normalizeInsights(matchId, ins.data),
    };
  } catch (e) {
    console.warn('[aiInsights] Gemini match analysis failed, using offline pack', e);
    return buildOfflineMatchAiPack(matchId, match, commentary);
  }
}

/**
 * Plain-language wicket explanation from a commentary snippet.
 */
export async function explainWicket(commentarySnippet: string): Promise<string> {
  const trimmed = commentarySnippet.trim().slice(0, 2000);
  if (!trimmed) {
    throw new ApiError(400, 'No commentary text was provided.');
  }

  if (!geminiService.isConfigured()) {
    return buildOfflineWicketExplanation(trimmed);
  }

  try {
    const text = await geminiService.generateText(
      `In 2–4 short sentences, explain this cricket dismissal or wicket event for a casual T20 fan. Mention what likely went wrong for the batter or fielding highlight if obvious. No markdown.\n\nCommentary:\n${trimmed}`,
      {
        temperature: 0.55,
        maxTokens: 512,
        systemInstruction:
          'You are a concise cricket analyst. Stay factual to the snippet; do not invent players not mentioned.',
      }
    );
    return text.trim();
  } catch (e) {
    console.warn('[aiInsights] Gemini explainWicket failed, offline fallback', e);
    return buildOfflineWicketExplanation(trimmed);
  }
}
