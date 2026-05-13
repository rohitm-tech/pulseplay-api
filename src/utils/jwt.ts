import jwt, { SignOptions } from 'jsonwebtoken';
import { config } from '../config/env';

export interface AccessPayload {
  sub: string;
  email: string;
  role: 'user' | 'admin';
}

export interface RefreshPayload {
  sub: string;
  tokenVersion: number;
}

export function signAccessToken(payload: AccessPayload): string {
  return jwt.sign(payload, config.JWT_SECRET, {
    expiresIn: config.JWT_ACCESS_EXPIRES,
  } as SignOptions);
}

export function signRefreshToken(payload: RefreshPayload): string {
  return jwt.sign(payload, config.JWT_REFRESH_SECRET, {
    expiresIn: config.JWT_REFRESH_EXPIRES,
  } as SignOptions);
}

export function verifyAccessToken(token: string): AccessPayload {
  return jwt.verify(token, config.JWT_SECRET) as AccessPayload;
}

export function verifyRefreshToken(token: string): RefreshPayload {
  return jwt.verify(token, config.JWT_REFRESH_SECRET) as RefreshPayload;
}
