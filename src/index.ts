import { createServer } from 'http';
import { Server } from 'socket.io';
import app from './app';
import { connectDatabase } from './database/connectDatabase';
import { config } from './config/env';
import { registerSockets } from './sockets';
import { startLivePulse } from './services/livePulse.service';

async function bootstrap() {
  await connectDatabase();
  const httpServer = createServer(app);
  const io = new Server(httpServer, {
    cors: { origin: config.CLIENT_URL, methods: ['GET', 'POST'], credentials: true },
  });
  registerSockets(io);
  startLivePulse(io);

  httpServer.listen(config.PORT, () => {
    console.log(`PulsePlay API + WebSocket on :${config.PORT}`);
    console.log(`GET http://localhost:${config.PORT}/health — check routers.users and routers.features are > 0`);
  });
}

bootstrap().catch((e) => {
  console.error(e);
  process.exit(1);
});
