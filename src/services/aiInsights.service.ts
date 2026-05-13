import { z } from 'zod';
import { fetchCommentary, fetchMatchById } from './cricapi.service';
import { geminiService } from './geminiService';

export interface AiInsight {
  id: string;
  title: string;
  body: string;
  tone: 'hype' | 'analytical';
  createdAt: string;
}

const insightItemSchema = z.object({
  id: z.string().min(1).optional(),
  title: z.string().min(1),
  body: z.string().min(1),
  tone: z.enum(['hype', 'analytical']),
});

const insightsArraySchema = z.array(insightItemSchema).min(1).max(8);

function mockInsights(matchId: string): AiInsight[] {
  const now = new Date().toISOString();
  return [
    {
      id: `${matchId}-sum`,
      title: 'Match summary',
      body: 'Run rate climbing in the middle overs — spinners applying the squeeze from both ends.',
      tone: 'analytical',
      createdAt: now,
    },
    {
      id: `${matchId}-mom`,
      title: 'Momentum',
      body: 'Chasing side ahead of par on DLS-style trajectory; boundary every 2.1 overs in last five.',
      tone: 'analytical',
      createdAt: now,
    },
    {
      id: `${matchId}-hype`,
      title: 'Hype track',
      body: 'Stadium noise at 11 — this over could flip the game. Hold tight.',
      tone: 'hype',
      createdAt: now,
    },
  ];
}

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

/**
 * Match insights: uses Gemini when `GEMINI_API_KEY` is set; otherwise returns mock cards.
 */
export async function getMatchInsights(matchId: string): Promise<AiInsight[]> {
  if (!geminiService.isConfigured()) {
    return mockInsights(matchId);
  }

  try {
    const [match, commentary] = await Promise.all([
      fetchMatchById(matchId),
      fetchCommentary(matchId),
    ]);
    const recent = commentary.slice(-24).map((c) => `[${c.over}] ${c.text}`);
    const context = JSON.stringify(
      {
        match: match ?? { id: matchId, note: 'Limited match metadata available.' },
        recentCommentaryLines: recent,
      },
      null,
      2
    );

    const prompt = `You are PulsePlay, a sharp IPL / T20 cricket co-pilot. Given live-ish context (match summary + recent ball-by-ball lines), produce 3 to 5 insight cards for fans watching on a second screen.

Rules:
- Be specific to the teams/score situation when the data allows; if data is thin, say what you can infer and stay honest.
- Mix tones: include at least one "hype" card and at least one "analytical" card.
- Keep each body under 320 characters, punchy, no markdown, no hashtags.
- ids: short kebab or slug unique strings.

Context JSON:
${context}`;

    const parsed = await geminiService.generateJSON<unknown>(prompt, [
      {
        id: 'string',
        title: 'string',
        body: 'string',
        tone: 'hype | analytical',
      },
    ]);

    const list = insightsArraySchema.safeParse(parsed);
    if (!list.success) {
      console.warn('[aiInsights] Gemini output failed validation, using mock', list.error.flatten());
      return mockInsights(matchId);
    }
    return normalizeInsights(matchId, list.data);
  } catch (e) {
    console.warn('[aiInsights] Gemini match insights failed, using mock', e);
    return mockInsights(matchId);
  }
}

/**
 * Plain-language wicket explanation from a commentary snippet.
 */
export async function explainWicket(commentarySnippet: string): Promise<string> {
  const trimmed = commentarySnippet.trim().slice(0, 2000);
  if (!trimmed) {
    return 'No commentary text was provided.';
  }

  if (!geminiService.isConfigured()) {
    return `Explain wicket (offline mock): likely misjudged length — "${trimmed.slice(0, 120)}${trimmed.length > 120 ? '…' : ''}"`;
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
    console.warn('[aiInsights] Gemini explainWicket failed, using mock', e);
    return `Explain wicket (fallback): likely misjudged length — "${trimmed.slice(0, 120)}${trimmed.length > 120 ? '…' : ''}"`;
  }
}
