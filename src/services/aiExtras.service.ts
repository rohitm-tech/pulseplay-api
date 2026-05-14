import { geminiService } from './geminiService';

function offlineComparePlayers(a: string, b: string, contextJson?: string): { comparison: string[] } {
  let venue = '';
  try {
    const ctx = contextJson ? (JSON.parse(contextJson) as { match?: { venue?: string; name?: string } }) : {};
    venue = ctx.match?.venue ? ` at ${ctx.match.venue}` : '';
  } catch {
    /* ignore */
  }
  const A = a.trim();
  const B = b.trim();
  return {
    comparison: [
      `${A} vs ${B}${venue}: both can swing a tight T20 if the match-up lines up with role clarity.`,
      `${A} — watch intent in the powerplay and against spin in the middle overs (heuristic preview, not career stats).`,
      `${B} — look for boundary windows when pace is off radar; field spread changes the risk profile.`,
      `Without Gemini: add GEMINI_API_KEY for grounded Gemini bullets using your live JSON + commentary context.`,
    ],
  };
}

function offlineWhatHappened(snippet: string): { explanation: string } {
  const t = snippet.trim().slice(0, 600);
  return {
    explanation: `Offline recap: ${t}${snippet.trim().length > 600 ? '…' : ''} — set GEMINI_API_KEY on the backend for a tighter Gemini paragraph on each ball.`,
  };
}

function offlineMatchPreview(matchJson: string): { preview: string } {
  try {
    const m = JSON.parse(matchJson) as { name?: string; teams?: string[]; venue?: string; status?: string };
    const title = m.name ?? (m.teams?.length ? `${m.teams[0]} vs ${m.teams[1]}` : 'T20 fixture');
    const bits = [title, m.venue, m.status].filter(Boolean).join(' · ');
    return {
      preview: `${bits}. Neutral preview (offline) — enable Gemini for richer venue + form copy from the same JSON.`,
    };
  } catch {
    return {
      preview: 'Match preview (offline): wire GEMINI_API_KEY for Gemini-written preview text from structured match JSON.',
    };
  }
}

export async function comparePlayers(a: string, b: string, contextJson?: string): Promise<{ comparison: string[] }> {
  if (!geminiService.isConfigured()) {
    return offlineComparePlayers(a, b, contextJson);
  }
  try {
    const ctx = contextJson?.trim() || '{}';
    const prompt = `Compare two cricket players for a T20 fan. Players: "${a}" vs "${b}". Use optional JSON context (scores, recent lines) if helpful; do not invent career stats not implied by context.

Context JSON:
${ctx}

Return JSON object with key "comparison" as array of 4–6 short bullet strings (no markdown inside strings).`;
    return await geminiService.generateJSON<{ comparison: string[] }>(prompt, {
      comparison: ['string'],
    });
  } catch (e) {
    console.warn('[aiExtras] comparePlayers Gemini failed, offline fallback', e);
    return offlineComparePlayers(a, b, contextJson);
  }
}

export async function whatHappened(snippet: string): Promise<{ explanation: string }> {
  if (!geminiService.isConfigured()) {
    return offlineWhatHappened(snippet);
  }
  try {
    const text = await geminiService.generateText(
      `In one short paragraph, explain what happened in this cricket passage for a casual fan. No markdown.\n\n${snippet.trim().slice(0, 2500)}`,
      { temperature: 0.4, maxTokens: 400 }
    );
    return { explanation: text.trim() };
  } catch (e) {
    console.warn('[aiExtras] whatHappened Gemini failed, offline fallback', e);
    return offlineWhatHappened(snippet);
  }
}

export async function matchPreviewBlurb(matchJson: string): Promise<{ preview: string }> {
  if (!geminiService.isConfigured()) {
    return offlineMatchPreview(matchJson);
  }
  try {
    const prompt = `Write a 2–3 sentence neutral match preview for fans based only on this JSON (teams, venue, status). If data is thin, keep it generic. No markdown.\n\n${matchJson.slice(0, 4000)}`;
    const text = await geminiService.generateText(prompt, { temperature: 0.45, maxTokens: 320 });
    return { preview: text.trim() };
  } catch (e) {
    console.warn('[aiExtras] matchPreviewBlurb Gemini failed, offline fallback', e);
    return offlineMatchPreview(matchJson);
  }
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
