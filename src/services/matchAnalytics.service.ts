import type { ParsedCricketEvent } from './commentaryProcessor.service';
import { parseCommentaryLine } from './commentaryProcessor.service';
import type { CricMatchSummary, CommentaryBall } from './cricapi.service';

export interface MatchAnalytics {
  momentum: { over: string; score: number }[];
  /** Simple two-team prior — drifts with recent boundary / wicket mix (not a bookmaker model). */
  winProbability: { teamA: string; teamB: string; pTeamA: number; pTeamB: number; note: string };
  timeline: { id: string; over: string; label: string; kind: string }[];
}

function teamLabels(match: CricMatchSummary | null): { a: string; b: string } {
  const teams = match?.teams ?? [];
  if (teams.length >= 2) return { a: teams[0], b: teams[1] };
  const name = match?.name ?? 'Team A vs Team B';
  const parts = name.split(/\s+vs\s+/i);
  if (parts.length >= 2) return { a: parts[0].trim(), b: parts[1].trim() };
  return { a: 'Chasing', b: 'Defending' };
}

function momentumFromCommentary(balls: CommentaryBall[]): { over: string; score: number }[] {
  let acc = 0;
  const out: { over: string; score: number }[] = [];
  for (const b of balls) {
    const ev = parseCommentaryLine(b.text);
    let delta = 0.15;
    if (ev.type === 'SIX') delta = 3;
    else if (ev.type === 'FOUR') delta = 2;
    else if (ev.type === 'WICKET') delta = -3.5;
    else if (ev.type === 'WIN') delta = 4;
    acc += delta;
    out.push({ over: b.over || String(out.length), score: Math.round(acc * 10) / 10 });
  }
  return out.slice(-24);
}

function winProbHeuristic(
  match: CricMatchSummary | null,
  balls: CommentaryBall[],
  labels: { a: string; b: string }
): MatchAnalytics['winProbability'] {
  const recent = balls.slice(-18);
  let drift = 0;
  for (const b of recent) {
    const ev: ParsedCricketEvent = parseCommentaryLine(b.text);
    if (ev.type === 'SIX' || ev.type === 'FOUR') drift += 0.02;
    if (ev.type === 'WICKET') drift -= 0.025;
    if (ev.type === 'WIN') drift += 0.08;
  }
  drift = Math.max(-0.2, Math.min(0.2, drift));
  const pA = Math.round((0.5 + drift) * 1000) / 1000;
  const pB = Math.round((1 - pA) * 1000) / 1000;
  return {
    teamA: labels.a,
    teamB: labels.b,
    pTeamA: pA,
    pTeamB: pB,
    note: 'Heuristic from recent ball events — not betting-grade.',
  };
}

function timelineFromBalls(balls: CommentaryBall[]): MatchAnalytics['timeline'] {
  const picks: MatchAnalytics['timeline'] = [];
  for (const b of balls.slice(-40)) {
    const ev = parseCommentaryLine(b.text);
    if (ev.type === 'UNKNOWN') continue;
    picks.push({
      id: b.id,
      over: b.over,
      label: ev.type,
      kind: ev.type,
    });
  }
  return picks.slice(-16);
}

export function buildMatchAnalytics(match: CricMatchSummary | null, commentary: CommentaryBall[]): MatchAnalytics {
  const labels = teamLabels(match);
  return {
    momentum: momentumFromCommentary(commentary),
    winProbability: winProbHeuristic(match, commentary, labels),
    timeline: timelineFromBalls(commentary),
  };
}
