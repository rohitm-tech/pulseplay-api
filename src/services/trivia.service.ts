export interface TriviaItem {
  id: string;
  question: string;
  options: string[];
  answer: string;
  category: string;
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
];

export function randomTrivia(): TriviaItem {
  return BANK[Math.floor(Math.random() * BANK.length)]!;
}

export function verifyTriviaAnswer(id: string, choice: string): { correct: boolean; answer?: string } {
  const q = BANK.find((x) => x.id === id);
  if (!q) return { correct: false };
  return { correct: q.answer === choice, answer: q.answer };
}
