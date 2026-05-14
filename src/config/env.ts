import dotenv from 'dotenv';

dotenv.config();

/** Default shared CricAPI cache window — 5 days (hackathon / demo: reviewers see last good data if API is down or rate-limited). */
const CRIC_CACHE_DEFAULT_TTL_MS = 5 * 24 * 60 * 60 * 1000;

export const config = {
  PORT: Number(process.env.PORT) || 4000,
  NODE_ENV: process.env.NODE_ENV || 'development',
  MONGODB_URI: process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/pulseplay',
  JWT_SECRET: process.env.JWT_SECRET || 'dev_access_secret_change_in_production_min_32',
  JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET || 'dev_refresh_secret_change_in_production_min_32',
  JWT_ACCESS_EXPIRES: process.env.JWT_ACCESS_EXPIRES || '15m',
  JWT_REFRESH_EXPIRES: process.env.JWT_REFRESH_EXPIRES || '7d',
  CRIC_API_KEY: process.env.CRIC_API_KEY || '',
  CRIC_API_BASE: process.env.CRIC_API_BASE || 'https://api.cricapi.com/v1',
  /** Off-list matches: reuse `match_info` in Mongo for this many ms (all users). */
  CRIC_CACHE_MATCH_SUMMARY_TTL_MS: Math.max(5_000, Number(process.env.CRIC_CACHE_MATCH_SUMMARY_TTL_MS) || CRIC_CACHE_DEFAULT_TTL_MS),
  /** Shared commentary cache — one CricAPI pull per match per window for every user. */
  CRIC_CACHE_COMMENTARY_TTL_MS: Math.max(3_000, Number(process.env.CRIC_CACHE_COMMENTARY_TTL_MS) || CRIC_CACHE_DEFAULT_TTL_MS),
  CLIENT_URL: process.env.CLIENT_URL || 'http://localhost:3000',
  LIVE_POLL_INTERVAL_MS: Number(process.env.LIVE_POLL_INTERVAL_MS) || 45_000,
  /** Google AI Studio / Gemini — see https://aistudio.google.com/apikey */
  GEMINI_API_KEY: process.env.GEMINI_API_KEY || '',
  GEMINI_MODEL: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
  /** Abort slow/hung Gemini HTTP calls so routes like fan-desk can fall back instead of blocking forever. */
  GEMINI_REQUEST_TIMEOUT_MS: Math.max(5_000, Number(process.env.GEMINI_REQUEST_TIMEOUT_MS) || 25_000),
};
