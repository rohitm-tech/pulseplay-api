import { randomUUID } from 'crypto';

export interface TriviaItem {
  id: string;
  question: string;
  options: string[];
  answer: string;
  category: string;
}

const PACK_TTL_MS = 45 * 60 * 1000;

type QuizPackRow = {
  createdAt: number;
  answers: Map<string, string>;
  /** AI-generated packs: full rows for hint resolution (answers stay server-side). */
  items?: Map<string, TriviaItem>;
};

const quizPacks = new Map<string, QuizPackRow>();

function sweepExpiredPacks(): void {
  const now = Date.now();
  for (const [id, row] of quizPacks.entries()) {
    if (now - row.createdAt > PACK_TTL_MS) quizPacks.delete(id);
  }
}

function sampleDistinct<T>(arr: T[], n: number): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j]!, copy[i]!];
  }
  return copy.slice(0, Math.min(n, copy.length));
}

const BANK: TriviaItem[] = [
  {
    id: 't1',
    question: 'In T20, what is the maximum number of overs per bowler (standard rules)?',
    options: ['2', '3', '4', '5'],
    answer: '4',
    category: 'Rules',
  },
  {
    id: 't2',
    question: 'What does LBW stand for?',
    options: ['Leg Before Wicket', 'Long Ball Wide', 'Line Behind Wicket', 'Late Bat Wobble'],
    answer: 'Leg Before Wicket',
    category: 'Basics',
  },
  {
    id: 't3',
    question: 'How many runs for a ball crossing the boundary without bouncing?',
    options: ['4', '5', '6', 'Depends on umpire'],
    answer: '6',
    category: 'Scoring',
  },
  {
    id: 't4',
    question: 'A "free hit" is usually awarded after which delivery?',
    options: ['Wide', 'No-ball', 'Bye', 'Leg bye'],
    answer: 'No-ball',
    category: 'Rules',
  },
  {
    id: 't5',
    question: 'Powerplay typically refers to the first set of overs with fielding restrictions — often how many overs in IPL?',
    options: ['4', '6', '8', '10'],
    answer: '6',
    category: 'IPL',
  },
  {
    id: 't6',
    question: 'What is the minimum number of overs required to constitute a match in a standard T20 international?',
    options: ['5 per side', '10 per side', '15 per side', '20 per side'],
    answer: '5 per side',
    category: 'Rules',
  },
  {
    id: 't7',
    question: 'A "dot ball" means the batsman scores how many runs off that delivery?',
    options: ['0', '1', '2', '4'],
    answer: '0',
    category: 'Basics',
  },
  {
    id: 't8',
    question: 'In limited-overs cricket, what is a "Super Over" primarily used to resolve?',
    options: ['Rain delays', 'Tied scores after full innings', 'Umpire disputes', 'DRS reviews'],
    answer: 'Tied scores after full innings',
    category: 'Rules',
  },
  {
    id: 't9',
    question: 'Which fielding position is typically behind the wicket-keeper on the leg side?',
    options: ['Silly point', 'Fine leg', 'Third man', 'Cover'],
    answer: 'Fine leg',
    category: 'Fielding',
  },
  {
    id: 't10',
    question: 'What is the usual maximum fielders allowed outside the 30-yard circle during non-powerplay overs in T20?',
    options: ['3', '4', '5', '6'],
    answer: '5',
    category: 'Rules',
  },
  {
    id: 't11',
    question: 'A batsman is "stumped" when dismissed primarily by whom?',
    options: ['Umpire', 'Wicket-keeper', 'Square leg fielder', 'Third umpire'],
    answer: 'Wicket-keeper',
    category: 'Dismissals',
  },
  {
    id: 't12',
    question: 'How many legal deliveries are in one over in standard cricket?',
    options: ['5', '6', '8', '10'],
    answer: '6',
    category: 'Basics',
  },
];

export function randomTrivia(): TriviaItem {
  return BANK[Math.floor(Math.random() * BANK.length)]!;
}

export function verifyTriviaAnswer(id: string, choice: string): { correct: boolean; answer?: string } {
  const q = BANK.find((x) => x.id === id);
  if (!q) return { correct: false };
  return { correct: q.answer === choice, answer: q.answer };
}

export type QuizPackQuestion = Pick<TriviaItem, 'id' | 'question' | 'options' | 'category'>;

/** Ephemeral pack for multi-question hub UI; answers live server-side until TTL. */
export function createQuizPack(questionCount: number): { packId: string; questions: QuizPackQuestion[] } {
  sweepExpiredPacks();
  const n = Math.min(Math.max(1, questionCount), BANK.length);
  const picked = sampleDistinct(BANK, n);
  const packId = randomUUID();
  const answers = new Map(picked.map((q) => [q.id, q.answer] as const));
  quizPacks.set(packId, { createdAt: Date.now(), answers });
  return {
    packId,
    questions: picked.map(({ id, question, options, category }) => ({ id, question, options, category })),
  };
}

/** Register a server-built pack (e.g. Gemini). Each row must include a stable `answer` matching one of `options`. */
export function registerAiQuizPack(rows: Omit<TriviaItem, 'id'>[]): { packId: string; questions: QuizPackQuestion[] } {
  sweepExpiredPacks();
  const n = Math.min(Math.max(1, rows.length), 12);
  const sliced = rows.slice(0, n);
  const items: TriviaItem[] = sliced.map((r) => ({ ...r, id: randomUUID() }));
  const packId = randomUUID();
  const answers = new Map(items.map((q) => [q.id, q.answer] as const));
  const itemMap = new Map(items.map((q) => [q.id, q] as const));
  quizPacks.set(packId, { createdAt: Date.now(), answers, items: itemMap });
  return {
    packId,
    questions: items.map(({ id, question, options, category }) => ({ id, question, options, category })),
  };
}

export function verifyQuizPackAnswer(
  packId: string,
  questionId: string,
  choice: string
): { correct: boolean; answer?: string } {
  sweepExpiredPacks();
  const pack = quizPacks.get(packId);
  if (!pack) return { correct: false };
  const ans = pack.answers.get(questionId);
  if (!ans) return { correct: false };
  return { correct: ans === choice, answer: ans };
}

/** Resolve row for a question in an active pack (hint API — never expose answer to the client). */
export function resolvePackQuestionForHint(packId: string, questionId: string): TriviaItem | null {
  sweepExpiredPacks();
  const pack = quizPacks.get(packId);
  if (!pack?.answers.has(questionId)) return null;
  const fromAi = pack.items?.get(questionId);
  if (fromAi) return fromAi;
  return BANK.find((x) => x.id === questionId) ?? null;
}
