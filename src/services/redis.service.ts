import Redis from 'ioredis';
import { config } from '../config/env';

/**
 * Optional Redis cache — no-ops when REDIS_URL is unset.
 */
class RedisCache {
  private client: Redis | null = null;

  constructor() {
    if (config.REDIS_URL) {
      this.client = new Redis(config.REDIS_URL, { maxRetriesPerRequest: 2 });
      this.client.on('error', (e) => console.warn('[redis]', e.message));
    }
  }

  isEnabled(): boolean {
    return this.client !== null;
  }

  async get<T>(key: string): Promise<T | null> {
    if (!this.client) return null;
    const raw = await this.client.get(key);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  }

  async set(key: string, value: unknown, ttlSeconds?: number): Promise<void> {
    if (!this.client) return;
    const payload = JSON.stringify(value);
    if (ttlSeconds) await this.client.setex(key, ttlSeconds, payload);
    else await this.client.set(key, payload);
  }

  async del(key: string): Promise<void> {
    if (!this.client) return;
    await this.client.del(key);
  }
}

export const redisCache = new RedisCache();
