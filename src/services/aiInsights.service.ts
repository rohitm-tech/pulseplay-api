export interface AiInsight {
  id: string;
  title: string;
  body: string;
  tone: 'hype' | 'analytical';
  createdAt: string;
}

/**
 * Placeholder AI layer — swap for OpenAI/Gemini later.
 */
export async function getMatchInsights(matchId: string): Promise<AiInsight[]> {
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

export async function explainWicket(commentarySnippet: string): Promise<string> {
  return `Explain wicket (mock): likely misjudged length — "${commentarySnippet.slice(0, 120)}..."`;
}
