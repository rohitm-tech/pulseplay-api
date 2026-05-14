import mongoose, { Types } from 'mongoose';
import dotenv from 'dotenv';
import { User } from '../modules/users/user.model';
import { Leaderboard } from '../modules/leaderboard/leaderboard.model';
import { Notification } from '../modules/notifications/notification.model';
import type { UserRole } from '../modules/users/user.model';

dotenv.config();

type SeedUser = {
  email: string;
  name: string;
  password: string;
  role?: UserRole;
  favoriteTeam?: string;
  favoritePlayers?: string[];
  xpPoints: number;
  correctPredictions: number;
  streak: number;
  badges: string[];
};

const DEMO_NOTIFICATION_TITLE = 'PulsePlay demo notification';

/** Demo users + leaderboard stats (does not seed live matches, CricAPI cache, or AI payloads). */
const SEED_USERS: SeedUser[] = [
  {
    email: 'admin@pulseplay.local',
    name: 'Pulse Admin',
    password: 'Admin12345!',
    role: 'admin',
    favoriteTeam: 'IND',
    xpPoints: 5200,
    correctPredictions: 28,
    streak: 9,
    badges: ['founder'],
  },
  {
    email: 'fan@pulseplay.local',
    name: 'Super Fan',
    password: 'Fan12345!',
    favoriteTeam: 'RCB',
    xpPoints: 120,
    correctPredictions: 4,
    streak: 1,
    badges: ['early'],
  },
  {
    email: 'nova@pulseplay.local',
    name: 'Nova Patel',
    password: 'Demo12345!',
    favoriteTeam: 'MI',
    xpPoints: 12480,
    correctPredictions: 52,
    streak: 14,
    badges: ['early'],
    favoritePlayers: ['Rohit Sharma', 'Jasprit Bumrah'],
  },
  {
    email: 'eli@pulseplay.local',
    name: 'Eli Carter',
    password: 'Demo12345!',
    favoriteTeam: 'CSK',
    xpPoints: 9820,
    correctPredictions: 41,
    streak: 11,
    badges: [],
  },
  {
    email: 'mei@pulseplay.local',
    name: 'Mei Tan',
    password: 'Demo12345!',
    favoriteTeam: 'KKR',
    xpPoints: 7650,
    correctPredictions: 33,
    streak: 8,
    badges: ['early'],
  },
  {
    email: 'rohan@pulseplay.local',
    name: 'Rohan Iyer',
    password: 'Demo12345!',
    favoriteTeam: 'RCB',
    xpPoints: 5410,
    correctPredictions: 24,
    streak: 6,
    badges: [],
  },
  {
    email: 'sofia@pulseplay.local',
    name: 'Sofia Martins',
    password: 'Demo12345!',
    favoriteTeam: 'DC',
    xpPoints: 4180,
    correctPredictions: 19,
    streak: 5,
    badges: [],
  },
  {
    email: 'jamal@pulseplay.local',
    name: 'Jamal Brooks',
    password: 'Demo12345!',
    favoriteTeam: 'SRH',
    xpPoints: 3290,
    correctPredictions: 15,
    streak: 4,
    badges: [],
  },
  {
    email: 'yuki@pulseplay.local',
    name: 'Yuki Sato',
    password: 'Demo12345!',
    favoriteTeam: 'LSG',
    xpPoints: 2180,
    correctPredictions: 11,
    streak: 3,
    badges: [],
  },
  {
    email: 'alex@pulseplay.local',
    name: 'Alex Morgan',
    password: 'Demo12345!',
    favoriteTeam: 'GT',
    xpPoints: 1560,
    correctPredictions: 8,
    streak: 2,
    badges: [],
  },
  {
    email: 'priya@pulseplay.local',
    name: 'Priya Nair',
    password: 'Demo12345!',
    favoriteTeam: 'RR',
    xpPoints: 890,
    correctPredictions: 5,
    streak: 2,
    badges: [],
  },
  {
    email: 'chris@pulseplay.local',
    name: 'Chris Lee',
    password: 'Demo12345!',
    favoriteTeam: 'PBKS',
    xpPoints: 420,
    correctPredictions: 2,
    streak: 1,
    badges: [],
  },
  {
    email: 'taylor@pulseplay.local',
    name: 'Taylor Kim',
    password: 'Demo12345!',
    favoriteTeam: 'MI',
    xpPoints: 180,
    correctPredictions: 1,
    streak: 1,
    badges: [],
  },
  {
    email: 'sam@pulseplay.local',
    name: 'Sam Rivera',
    password: 'Demo12345!',
    favoriteTeam: 'CSK',
    xpPoints: 45,
    correctPredictions: 0,
    streak: 0,
    badges: [],
  },
];

async function syncLeaderboard(
  userId: Types.ObjectId,
  row: { xp: number; correctPredictions: number; streak: number }
): Promise<void> {
  await Leaderboard.findOneAndUpdate(
    { userId },
    { $set: { userId, xp: row.xp, correctPredictions: row.correctPredictions, streak: row.streak } },
    { upsert: true }
  );
}

async function upsertSeedUser(row: SeedUser): Promise<void> {
  const existing = await User.findOne({ email: row.email });
  const stats = {
    name: row.name,
    favoriteTeam: row.favoriteTeam,
    favoritePlayers: row.favoritePlayers ?? [],
    xpPoints: row.xpPoints,
    correctPredictions: row.correctPredictions,
    streak: row.streak,
    badges: row.badges,
    role: row.role ?? 'user',
  };

  if (existing) {
    await User.updateOne(
      { _id: existing._id },
      {
        $set: {
          ...stats,
        },
      }
    );
    await syncLeaderboard(existing._id, {
      xp: row.xpPoints,
      correctPredictions: row.correctPredictions,
      streak: row.streak,
    });
    console.log('Updated user + leaderboard:', row.email);
    return;
  }

  const created = await User.create({
    email: row.email,
    password: row.password,
    ...stats,
  });
  await syncLeaderboard(created._id, {
    xp: row.xpPoints,
    correctPredictions: row.correctPredictions,
    streak: row.streak,
  });
  console.log('Created user + leaderboard:', row.email, row.role === 'admin' ? '(admin)' : '');
}

/** Cross-follow seed accounts so leaderboards / social achievements have realistic counts. */
async function wireDemoFollows(): Promise<void> {
  const emails = SEED_USERS.map((u) => u.email);
  const users = await User.find({ email: { $in: emails } }).select('_id email').lean();
  if (users.length < 2) return;
  const ids = users.map((u) => u._id as Types.ObjectId);
  for (const u of users) {
    const others = ids.filter((id) => !id.equals(u._id)).slice(0, 10);
    await User.updateOne({ _id: u._id }, { $set: { followingIds: others } });
  }
  console.log('Linked demo follows between seed users (up to 10 each).');
}

async function seedDemoNotifications(): Promise<void> {
  const exists = await Notification.exists({ title: DEMO_NOTIFICATION_TITLE });
  if (exists) return;
  const emails = SEED_USERS.map((u) => u.email);
  const recipients = await User.find({ email: { $in: emails } })
    .sort({ xpPoints: -1 })
    .limit(4)
    .select('_id')
    .lean();
  for (const r of recipients) {
    await Notification.create({
      userId: r._id,
      title: DEMO_NOTIFICATION_TITLE,
      body: 'Sample system notification from the database seed — polls, streaks, and XP sync here.',
      type: 'system',
      read: false,
    });
  }
  console.log('Seeded sample notifications for top XP demo users.');
}

async function seed() {
  const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/pulseplay';
  await mongoose.connect(uri);

  for (const row of SEED_USERS) {
    await upsertSeedUser(row);
  }

  await wireDemoFollows();
  await seedDemoNotifications();

  console.log('');
  console.log('Credentials: admin → Admin12345! · fan → Fan12345! · others → Demo12345!');
  console.log('(Does not modify live match snapshots, match cache, or AI-generated records.)');

  await mongoose.disconnect();
  console.log('Seed complete');
}

seed().catch((e) => {
  console.error(e);
  process.exit(1);
});
