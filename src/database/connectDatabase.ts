import mongoose from 'mongoose';
import { config } from '../config/env';

export async function connectDatabase(): Promise<void> {
  mongoose.set('strictQuery', true);
  await mongoose.connect(config.MONGODB_URI);
  console.log('MongoDB connected');
}
