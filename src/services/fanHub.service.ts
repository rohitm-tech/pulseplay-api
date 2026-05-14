import { z } from 'zod';
import { geminiService } from './geminiService';
import { createQuizPack, registerAiQuizPack, resolvePackQuestionForHint, type TriviaItem } from './trivia.service';
import { ApiError } from '../utils/apiError';

const fanAiSchema = z.object({
  headline: z.string().min(1),
  insights: z.array(z.string().min(1)).min(3).max(6),
  kpis: z
    .array(
      z.object({
        label: z.string().min(1),
        value: z.string().min(1),
        note: z.string().optional(),
      })
    )
    .min(3)
    .max(5),
});

export type FanDeskAi = z.infer<typeof fanAiSchema> & { source: 'gemini' | 'offline' };

function offlineFanPulse(): FanDeskAi {
  return {
    headline: 'Cricket fan desk — insights without live scores',
    source: 'offline',
    insights: [
      'Powerplay is where intent matters most: fewer fielders outside the ring makes boundary hitting easier, but wickets reset momentum fast.',
      'Middle overs often separate T20 plans: spin vs pace match-ups and “dot pressure” can drag required rate into the death overs.',
      'Death overs reward calm strike rotation plus two or three boundary windows — yorker lengths and wide yorkers change the risk map.',
      'Net run rate ties can matter late in a league — fans track not just wins but margin and chase efficiency.',
      'DRS adds a second-screen drama layer: ball-tracking, umpire’s call, and stump-line reviews keep chats noisy even between balls.',
    ],
    kpis: [
      { label: 'Typical powerplay (T20)', value: '0–6 ov', note: 'Fielding ring rules tighten scoring shapes early.' },
      { label: 'Illustrative boundary burst', value: '12 balls / 4×4', note: 'Momentum swings faster than ODI tempo.' },
      { label: 'Death overs band (demo)', value: '17–20', note: 'Economy targets collapse if yorkers miss slot.' },
      { label: 'Fan hub quiz bank', value: '12 Qs', note: 'Static pack — add GEMINI_API_KEY for AI-written fan copy.' },
    ],
  };
}

async function geminiFanPulse(): Promise<z.infer<typeof fanAiSchema>> {
  const prompt = `You write short cricket fan-hub content for T20 and IPL-style audiences (year 2026).
Return ONLY valid JSON (no markdown fences) with this exact shape:
{
  "headline": string,
  "insights": string[],
  "kpis": { "label": string, "value": string, "note": string }[]
}

Rules:
- headline: max 14 words, energetic but not clickbait.
- insights: exactly 4 items; each 1–2 sentences; mix tactics (powerplay/middle/death), fan rituals, second-screen behavior, or DRS drama. Do not invent specific live match scores, player aggregates, or “as of today” league tables.
- kpis: exactly 4 items; labels read like a small dashboard for fans; values are illustrative snippets (not presented as official ICC/IPL statistics). Notes are one short clause.`;
  const raw = await geminiService.generateJSON<unknown>(prompt);
  return fanAiSchema.parse(raw);
}

export interface FanDeskPayload {
  geminiConfigured: boolean;
  ai: FanDeskAi;
  quiz: ReturnType<typeof createQuizPack>;
}

export async function buildFanDesk(): Promise<FanDeskPayload> {
  const quiz = createQuizPack(5);
  const geminiConfigured = geminiService.isConfigured();

  if (!geminiConfigured) {
    return { geminiConfigured, ai: offlineFanPulse(), quiz };
  }

  try {
    const parsed = await geminiFanPulse();
    return { geminiConfigured, ai: { ...parsed, source: 'gemini' }, quiz };
  } catch (e) {
    console.warn('[fanHub] Gemini fan pulse failed, using offline copy', e);
    return { geminiConfigured, ai: offlineFanPulse(), quiz };
  }
}

export type QuizHintPayload = { hint: string; source: 'gemini' | 'offline' };

export async function buildQuizHint(packId: string, questionId: string): Promise<QuizHintPayload> {
  const q = resolvePackQuestionForHint(packId, questionId);
  if (!q) {
    throw new ApiError(404, 'Quiz pack expired or question not in this pack. Open a new pack from Fan hub.');
  }

  if (!geminiService.isConfigured()) {
    return {
      hint: 'Set GEMINI_API_KEY on the backend to get short AI hints without revealing answers.',
      source: 'offline',
    };
  }

  const prompt = `You help fans with a cricket trivia practice question (multiple choice exists, but you must not spoil it).

Question: ${JSON.stringify(q.question)}
Category: ${JSON.stringify(q.category)}

Rules:
- Reply with 1–2 sentences only, plain text, no bullet list.
- Give a subtle hint about the underlying cricket fact (rule, scenario, or definition).
- Do NOT state the correct answer. Do NOT name, quote, or rank any of the answer options. Do not say "choose" or "pick" a specific option.`;

  try {
    const text = await geminiService.generateText(prompt, { temperature: 0.5, maxTokens: 200 });
    const hint = text.trim().replace(/\s+/g, ' ').slice(0, 480);
    if (!hint) {
      return { hint: 'No hint returned — try again.', source: 'offline' };
    }
    return { hint, source: 'gemini' };
  } catch (e) {
    console.warn('[fanHub] Gemini quiz hint failed', e);
    return { hint: 'Hint unavailable right now — try again in a moment.', source: 'offline' };
  }
}

const generatedPackSchema = z.object({
  questions: z.array(
    z.object({
      question: z.string().min(10).max(450),
      options: z.array(z.string().min(1).max(160)).length(4),
      answer: z.string().min(1).max(160),
      category: z.string().min(1).max(80),
    })
  ).length(5),
});

function normalizeGeneratedPack(raw: z.infer<typeof generatedPackSchema>): Omit<TriviaItem, 'id'>[] {
  return raw.questions.map((row) => {
    const options = row.options.map((o) => o.trim()).filter(Boolean);
    if (options.length !== 4) {
      throw new ApiError(502, 'Generated pack has invalid options.');
    }
    const lower = options.map((o) => o.toLowerCase());
    if (new Set(lower).size !== 4) {
      throw new ApiError(502, 'Each question needs four distinct options.');
    }
    let answer = row.answer.trim();
    const exact = options.find((o) => o === answer);
    if (!exact) {
      const idx = options.findIndex((o) => o.toLowerCase() === answer.toLowerCase());
      if (idx === -1) {
        throw new ApiError(502, 'Generated answer must match one of the four options.');
      }
      answer = options[idx]!;
    }
    return {
      question: row.question.trim(),
      options,
      answer,
      category: row.category.trim() || 'General',
    };
  });
}

export async function generateAiQuizPack(interests?: string): Promise<ReturnType<typeof registerAiQuizPack>> {
  if (!geminiService.isConfigured()) {
    throw new ApiError(503, 'Set GEMINI_API_KEY on the backend to generate AI quiz packs.');
  }

  const hint = (interests?.trim() ?? '').slice(0, 500);
  const bias =
    hint.length > 0
      ? `Fan interests to bias topics (stay factual; do not invent undocumented match results): ${JSON.stringify(hint)}`
      : 'Use a broad mix of rules, scoring, fielding, and cricket history suitable for T20 and IPL-style fans.';

  const prompt = `You create cricket trivia for a fan hub (year 2026). ${bias}

Return ONLY valid JSON (no markdown fences) with this exact shape:
{
  "questions": [
    { "question": string, "options": [string, string, string, string], "answer": string, "category": string }
  ]
}

Rules:
- Exactly 5 questions.
- Each question has exactly four distinct option strings; "answer" must be identical to one of those four strings (trim consistently).
- No "all of the above" or combined answers.
- Avoid fabricated statistics; keep each question defensible.`;

  try {
    const raw = await geminiService.generateJSON<unknown>(prompt);
    const parsed = generatedPackSchema.parse(raw);
    const rows = normalizeGeneratedPack(parsed);
    return registerAiQuizPack(rows);
  } catch (e) {
    if (e instanceof ApiError) throw e;
    if (e instanceof z.ZodError) {
      throw new ApiError(502, 'Could not parse AI quiz — try again.');
    }
    console.warn('[fanHub] generateAiQuizPack failed', e);
    throw new ApiError(502, 'AI quiz generation failed — try again.');
  }
}
