/** Lightweight spam / slur guard — not a full moderation pipeline. */
const BLOCK = new Set(
  [
    'spam',
    'scam',
    'click here',
    'porn',
    'nazi',
    'kill yourself',
    'kys',
  ].map((s) => s.toLowerCase())
);

export function isToxicOrSpam(text: string): boolean {
  const t = text.toLowerCase();
  for (const w of BLOCK) {
    if (t.includes(w)) return true;
  }
  if (text.length > 800 && /(.)\1{12,}/.test(text)) return true;
  return false;
}
