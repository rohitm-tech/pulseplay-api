export type ParsedEventType =
  | 'SIX'
  | 'FOUR'
  | 'WICKET'
  | 'FIFTY'
  | 'CENTURY'
  | 'DRS'
  | 'REVIEW'
  | 'POWERPLAY'
  | 'WIN'
  | 'UNKNOWN';

export interface ParsedCricketEvent {
  type: ParsedEventType;
  player?: string;
  bowler?: string;
  runs?: number;
  raw: string;
}

/**
 * Heuristic normalization of commentary into structured events.
 */
export function parseCommentaryLine(text: string): ParsedCricketEvent {
  const raw = text.trim();
  const lower = raw.toLowerCase();

  if (/\bsix\b|massive six|sailed over|maximum/i.test(raw)) {
    const { batter, bowler } = extractPlayers(raw);
    return { type: 'SIX', player: batter, bowler, runs: 6, raw };
  }
  if (/\bfour\b|crashed through|boundary\b/i.test(raw)) {
    const { batter, bowler } = extractPlayers(raw);
    return { type: 'FOUR', player: batter, bowler, runs: 4, raw };
  }
  if (/\bwicket\b|bowled|lbw|caught|stumped|run out/i.test(lower)) {
    const { batter, bowler } = extractPlayers(raw);
    return { type: 'WICKET', player: batter, bowler, raw };
  }
  if (/\bfifty\b|half[- ]century|50 up/i.test(lower)) {
    const { batter } = extractPlayers(raw);
    return { type: 'FIFTY', player: batter, raw };
  }
  if (/\bcentury\b|100 up|ton\b/i.test(lower)) {
    const { batter } = extractPlayers(raw);
    return { type: 'CENTURY', player: batter, raw };
  }
  if (/\bdrs\b|decision review|umpire's call/i.test(lower)) {
    return { type: 'DRS', raw };
  }
  if (/\breview\b/i.test(lower)) {
    return { type: 'REVIEW', raw };
  }
  if (/\bpowerplay\b/i.test(lower)) {
    return { type: 'POWERPLAY', raw };
  }
  if (/\bwin\b|won the match|wins it/i.test(lower)) {
    return { type: 'WIN', raw };
  }
  return { type: 'UNKNOWN', raw };
}

function extractPlayers(line: string): { batter?: string; bowler?: string } {
  // "X smashes Y" / "X to Y"
  const smash = line.match(/^([A-Za-z .']+?)\s+smashes\s+([A-Za-z .']+?)\s+for/i);
  if (smash) return { batter: cleanName(smash[1]), bowler: cleanName(smash[2]) };
  const toPat = line.match(/^([A-Za-z .']+?)\s+to\s+([A-Za-z .']+?)[,!.\s]/i);
  if (toPat) return { batter: cleanName(toPat[2]), bowler: cleanName(toPat[1]) };
  return {};
}

function cleanName(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}
