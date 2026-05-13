import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken, AccessPayload } from '../utils/jwt';
import { User, SafeUser, toSafeUser } from '../modules/users/user.model';
import { ApiError } from '../utils/apiError';

export interface AuthRequest extends Request {
  auth?: AccessPayload;
  userDoc?: SafeUser;
}

export async function authMiddleware(req: AuthRequest, _res: Response, next: NextFunction) {
  try {
    const header = req.headers.authorization;
    const token = header?.startsWith('Bearer ') ? header.slice(7) : undefined;
    if (!token) throw new ApiError(401, 'Unauthorized');
    const payload = verifyAccessToken(token);
    const user = await User.findById(payload.sub);
    if (!user) throw new ApiError(401, 'Unauthorized');
    req.auth = payload;
    req.userDoc = toSafeUser(user);
    next();
  } catch {
    next(new ApiError(401, 'Unauthorized'));
  }
}

export function requireAdmin(req: AuthRequest, _res: Response, next: NextFunction) {
  if (req.auth?.role !== 'admin') {
    next(new ApiError(403, 'Forbidden'));
    return;
  }
  next();
}
