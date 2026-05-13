import { geminiService } from './geminiService';
import { ApiError } from '../utils/apiError';

function requireGemini() {
  if (!geminiService.isConfigured()) {
    throw new ApiError(503, 'GEMINI_API_KEY required for this AI feature.');
  }
}

export async function comparePlayers(a: string, b: string, contextJson?: string): Promise<{ comparison: string[] }> {
  requireGemini();
  const ctx = contextJson?.trim() || '{}';
  const prompt = `Compare two cricket players for a T20 fan. Players: "${a}" vs "${b}". Use optional JSON context (scores, recent lines) if helpful; do not invent career stats not implied by context.

Context JSON:
${ctx}

Return JSON object with key "comparison" as array of 4–6 short bullet strings (no markdown inside strings).`;
  return geminiService.generateJSON<{ comparison: string[] }>(prompt, {
    comparison: ['string'],
  });
}

export async function whatHappened(snippet: string): Promise<{ explanation: string }> {
  requireGemini();
  const text = await geminiService.generateText(
    `In one short paragraph, explain what happened in this cricket passage for a casual fan. No markdown.\n\n${snippet.trim().slice(0, 2500)}`,
    { temperature: 0.4, maxTokens: 400 }
  );
  return { explanation: text.trim() };
}

export async function matchPreviewBlurb(matchJson: string): Promise<{ preview: string }> {
  requireGemini();
  const prompt = `Write a 2–3 sentence neutral match preview for fans based only on this JSON (teams, venue, status). If data is thin, keep it generic. No markdown.\n\n${matchJson.slice(0, 4000)}`;
  const text = await geminiService.generateText(prompt, { temperature: 0.45, maxTokens: 320 });
  return { preview: text.trim() };
}

/** Lightweight sentiment — no extra model call. */
export function sentimentHeuristic(text: string): { label: 'positive' | 'neutral' | 'negative'; score: number } {
  const t = text.toLowerCase();
  let score = 0;
  const pos = ['great', 'love', '🔥', 'go ', 'win', 'six', 'yes', 'clutch', 'legend'];
  const neg = ['hate', 'boring', 'worst', 'choke', 'pain', '💔', 'noob', 'trash'];
  for (const p of pos) if (t.includes(p)) score += 0.12;
  for (const n of neg) if (t.includes(n)) score -= 0.15;
  score = Math.max(-1, Math.min(1, score));
  const label = score > 0.08 ? 'positive' : score < -0.08 ? 'negative' : 'neutral';
  return { label, score: Math.round(score * 100) / 100 };
}
