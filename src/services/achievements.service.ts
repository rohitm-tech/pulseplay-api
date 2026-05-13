import type { SafeUser } from '../modules/users/user.model';

export interface AchievementDef {
  id: string;
  title: string;
  description: string;
  icon: string;
}

const ACHIEVEMENTS: AchievementDef[] = [
  { id: 'first_vote', title: 'First call', description: 'Cast your first poll vote.', icon: '🗳️' },
  { id: 'streak_3', title: 'Hot streak', description: 'Reach a 3-day activity streak.', icon: '🔥' },
  { id: 'predictor_5', title: 'Sharp eye', description: 'Five correct poll predictions.', icon: '🎯' },
  { id: 'xp_500', title: 'Rising star', description: 'Earn 500 XP.', icon: '⭐' },
  { id: 'fan_tier_3', title: 'Regular', description: 'Reach fan tier 3.', icon: '🏟️' },
  { id: 'social_10', title: 'Squad', description: 'Follow 10 fans.', icon: '🤝' },
];

export function listAchievementDefinitions(): AchievementDef[] {
  return ACHIEVEMENTS;
}

export function unlockedAchievementIds(user: SafeUser): string[] {
  const unlocked: string[] = [];
  const following = user.followingCount ?? 0;
  if (user.correctPredictions >= 1 || user.xpPoints >= 10) unlocked.push('first_vote');
  if (user.streak >= 3) unlocked.push('streak_3');
  if (user.correctPredictions >= 5) unlocked.push('predictor_5');
  if (user.xpPoints >= 500) unlocked.push('xp_500');
  if (user.fanTier >= 3) unlocked.push('fan_tier_3');
  if (following >= 10) unlocked.push('social_10');
  return unlocked;
}

export function mergeBadges(userBadges: string[], unlocked: string[]): string[] {
  return Array.from(new Set([...userBadges, ...unlocked]));
}
