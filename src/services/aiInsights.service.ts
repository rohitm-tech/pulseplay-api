import { z } from 'zod';
import { fetchCommentary, fetchMatchById } from './cricapi.service';
import { geminiService } from './geminiService';
import { ApiError } from '../utils/apiError';

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
      match: match ?? { id: matchId, note: 'No match_info payload from CricAPI for this id.' },
      recentCommentaryLines: commentaryLines,
    },
    null,
    2
  );
}

/**
 * Summary + highlights + insight cards from live CricAPI match + commentary (Gemini, `@google/genai` — same pattern as HackAIBengaluru).
 */
export async function getMatchAiAnalysis(matchId: string): Promise<MatchAiPack> {
  if (!geminiService.isConfigured()) {
    throw new ApiError(
      503,
      'GEMINI_API_KEY is not set. Add it to backend/.env (see https://aistudio.google.com/apikey) to enable AI summaries and highlights.'
    );
  }

  const [match, commentary] = await Promise.all([fetchMatchById(matchId), fetchCommentary(matchId)]);
  const recent = commentary.slice(-40).map((c) => `[${c.over}.${c.ball}] ${c.text}`);
  const context = buildContextBlock(matchId, match, recent);

  const systemTone =
    'You are PulsePlay, a sharp cricket co-pilot for T20 / IPL fans. Only use facts present in the JSON context; if scores or names are missing, say so briefly instead of inventing.';

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
- Be specific to teams / score / recent balls when the data allows; if data is thin, stay honest.
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

    if (!sh.success) {
      console.warn('[aiInsights] summary/highlights validation failed', sh.error.flatten());
      throw new ApiError(502, 'AI returned an invalid summary payload. Try again in a moment.');
    }
    if (!ins.success) {
      console.warn('[aiInsights] insights validation failed', ins.error.flatten());
      throw new ApiError(502, 'AI returned invalid insight cards. Try again in a moment.');
    }

    return {
      summary: sh.data.summary,
      highlights: sh.data.highlights,
      insights: normalizeInsights(matchId, ins.data),
    };
  } catch (e) {
    if (e instanceof ApiError) throw e;
    console.error('[aiInsights] Gemini match analysis failed', e);
    throw new ApiError(502, 'Gemini request failed while building match analysis.');
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
    throw new ApiError(
      503,
      'GEMINI_API_KEY is not set. Configure Gemini in backend/.env to use wicket explanations.'
    );
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
    console.error('[aiInsights] Gemini explainWicket failed', e);
    throw new ApiError(502, 'Gemini could not explain this wicket snippet right now.');
  }
}
