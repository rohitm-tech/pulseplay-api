import { z } from 'zod';
import { Types } from 'mongoose';
import { geminiService } from './geminiService';
import { ApiError } from '../utils/apiError';
import { getCommentaryFromDatabase, getSharedCommentary } from './matchCricCache.service';
import { createPoll } from '../modules/polls/poll.service';

const generatedPollSchema = z.object({
  question: z.string().min(12).max(280),
  options: z.array(z.string().min(1).max(120)).min(2).max(4),
  correctAnswer: z.string().min(1).max(120),
});

export async function generateAndCreatePollFromCommentary(input: {
  matchId: string;
  expiresAt: Date;
  createdBy: Types.ObjectId;
  /** If DB has no rows, pull via shared commentary (CricAPI) once, then persist to Mongo. */
  hydrateIfEmpty?: boolean;
}) {
  if (!geminiService.isConfigured()) {
    throw new ApiError(503, 'Set GEMINI_API_KEY on the backend to generate commentary-based polls.');
  }

  const mid = String(input.matchId).trim();
  let balls = await getCommentaryFromDatabase(mid);
  if (!balls.length && input.hydrateIfEmpty) {
    balls = await getSharedCommentary(mid);
  }
  if (!balls.length) {
    throw new ApiError(
      400,
      'No commentary in the database for this match. Load the match so commentary caches, or send hydrateIfEmpty: true to fetch once from CricAPI.'
    );
  }

  const tail = balls.slice(-50);
  const transcript = tail
    .map((b) => `[${String(b.over ?? '?')}.${String(b.ball ?? '')}] ${String(b.text ?? '').trim()}`)
    .join('\n')
    .slice(-14_000);

  const prompt = `You write ONE prediction poll for a live cricket second-screen app (year ${new Date().getFullYear()}).

Recent ball-by-ball commentary (oldest first in block, may end with the latest balls):
${transcript}

Return ONLY valid JSON with this exact shape:
{ "question": string, "options": string[], "correctAnswer": string }

Rules:
- question: one clear, fair question fans can answer from the situation implied by the lines (next boundary, momentum, likely outcome of the over, etc.). Max 220 chars. No "option A/B" wording.
- options: exactly 2 or 3 distinct short answers (each max 72 chars).
- correctAnswer: MUST be identical (same spelling/case) to one of the options — pick the single best-supported answer from the commentary only; do not invent balls or scores not supported by the text.

If the snippet is too thin for a fair factual poll, still output a light "fan pulse" question grounded only on what is explicitly there.`;

  let raw: unknown;
  try {
    raw = await geminiService.generateJSON<unknown>(prompt);
  } catch (e) {
    console.warn('[pollGeneration] Gemini JSON failed', e);
    throw new ApiError(502, 'Could not generate a poll from commentary — try again.');
  }

  let parsed: z.infer<typeof generatedPollSchema>;
  try {
    parsed = generatedPollSchema.parse(raw);
  } catch (e) {
    if (e instanceof z.ZodError) {
      throw new ApiError(502, 'AI returned an invalid poll shape — try again.');
    }
    throw e;
  }

  const optsNorm = parsed.options.map((o) => o.trim()).filter(Boolean);
  if (optsNorm.length < 2) throw new ApiError(502, 'Generated poll needs at least two options.');
  const lower = new Set(optsNorm.map((o) => o.toLowerCase()));
  if (lower.size !== optsNorm.length) throw new ApiError(502, 'Generated options must be distinct.');

  let correct = parsed.correctAnswer.trim();
  const exact = optsNorm.find((o) => o === correct);
  const fold = optsNorm.find((o) => o.toLowerCase() === correct.toLowerCase());
  const resolved = exact ?? fold;
  if (!resolved) throw new ApiError(502, 'AI correctAnswer did not match any option — try again.');

  return createPoll({
    question: parsed.question.trim(),
    options: optsNorm,
    matchId: mid,
    expiresAt: input.expiresAt.toISOString(),
    correctAnswer: resolved,
    createdBy: input.createdBy,
  });
}
