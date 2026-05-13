import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { User } from '../modules/users/user.model';
import { Leaderboard } from '../modules/leaderboard/leaderboard.model';
import { Poll } from '../modules/polls/poll.model';

dotenv.config();

async function seed() {
  const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/pulseplay';
  await mongoose.connect(uri);
  const email = 'admin@pulseplay.local';
  let admin = await User.findOne({ email });
  if (!admin) {
    admin = await User.create({
      name: 'Pulse Admin',
      email,
      password: 'Admin12345!',
      role: 'admin',
      xpPoints: 500,
      badges: ['founder'],
    });
    await Leaderboard.findOneAndUpdate(
      { userId: admin._id },
      { $setOnInsert: { userId: admin._id, xp: 500, correctPredictions: 10, streak: 3 } },
      { upsert: true }
    );
    console.log('Created admin:', email, '/ Admin12345!');
  }

  const demoUserEmail = 'fan@pulseplay.local';
  let fan = await User.findOne({ email: demoUserEmail });
  if (!fan) {
    fan = await User.create({
      name: 'Super Fan',
      email: demoUserEmail,
      password: 'Fan12345!',
      favoriteTeam: 'RCB',
      xpPoints: 120,
      badges: ['early'],
    });
    await Leaderboard.findOneAndUpdate(
      { userId: fan._id },
      { $setOnInsert: { userId: fan._id, xp: 120, correctPredictions: 4, streak: 1 } },
      { upsert: true }
    );
    console.log('Created demo user:', demoUserEmail, '/ Fan12345!');
  }

  const openPoll = await Poll.findOne({ question: /15 runs/i });
  if (!openPoll) {
    await Poll.create({
      question: 'Will this over go above 15 runs?',
      options: ['Yes', 'No'],
      matchId: 'mock-ipl-1',
      expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 6),
      status: 'open',
    });
    console.log('Seeded sample poll');
  }

  await mongoose.disconnect();
  console.log('Seed complete');
}

seed().catch((e) => {
  console.error(e);
  process.exit(1);
});
