import express, { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import swaggerUi from 'swagger-ui-express';
import swaggerJsdoc from 'swagger-jsdoc';
import { config } from './config/env';
import { ApiError } from './utils/apiError';
import { apiLimiter } from './middleware/rateLimit.middleware';

import authRoutes from './modules/auth/auth.routes';
import userRoutes from './modules/users/user.routes';
import matchRoutes from './modules/matches/match.routes';
import pollRoutes from './modules/polls/poll.routes';
import leaderboardRoutes from './modules/leaderboard/leaderboard.routes';
import chatRoutes from './modules/chat/chat.routes';
import aiRoutes from './modules/ai/ai.routes';
import featuresRoutes from './modules/features/features.routes';
import adminRoutes from './modules/admin/admin.routes';

const app = express();

const swaggerSpec = swaggerJsdoc({
  definition: {
    openapi: '3.0.0',
    info: { title: 'PulsePlay API', version: '1.0.0' },
    servers: [{ url: `http://localhost:${config.PORT}` }],
  },
  apis: ['./src/modules/**/*.ts'],
});

app.use(
  cors({
    origin: config.CLIENT_URL,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());
app.use(apiLimiter);

app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'pulseplay-backend' });
});

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/matches', matchRoutes);
app.use('/api/polls', pollRoutes);
app.use('/api/leaderboard', leaderboardRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/features', featuresRoutes);
app.use('/api/admin', adminRoutes);

app.use((_req, res) => {
  res.status(404).json({ success: false, message: 'Not found' });
});

app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof ZodError) {
    res.status(400).json({ success: false, message: 'Validation error', data: err.flatten() });
    return;
  }
  if (err instanceof ApiError) {
    res.status(err.statusCode).json({ success: false, message: err.message, data: err.data });
    return;
  }
  if (err instanceof Error) {
    console.error(err);
    res.status(500).json({ success: false, message: err.message || 'Server error' });
    return;
  }
  res.status(500).json({ success: false, message: 'Server error' });
});

export default app;
