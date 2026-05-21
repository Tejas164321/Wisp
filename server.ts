import { createServer } from 'node:http';
import { parse } from 'node:url';
import next from 'next';
import { Server } from 'socket.io';
import { saveMessage, fetchMessageHistory, Message } from './lib/redis';
import { sanitizeMessage, filterBadWords, isSpam } from './lib/chat-utils';

const dev = process.env.NODE_ENV !== 'production';
const hostname = process.env.HOSTNAME || '0.0.0.0';
const port = 3000;

// Initialize Next.js app in custom server mode
const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

// Keep a map of socket client rate-limiting. Cooldown: 1 msg per 5 seconds.
const rateLimitMap = new Map<string, number>();

app.prepare().then(() => {
  const httpServer = createServer((req, res) => {
    try {
      const parsedUrl = parse(req.url || '', true);
      const { pathname } = parsedUrl;

      // Prevent Next.js from intercepting Socket.io requests (causes 308 redirects and 404s)
      if (pathname && (pathname === '/socket.io' || pathname.startsWith('/socket.io/'))) {
        return;
      }

      handle(req, res, parsedUrl);
    } catch (err) {
      console.error('Error handling request in HTTP server:', err);
      res.statusCode = 500;
      res.end('Internal Server Error');
    }
  });

  const io = new Server(httpServer, {
    cors: {
      origin: '*', // Allow connection in local preview and deploy iframe environments
      methods: ['GET', 'POST'],
    },
    pingInterval: 10000,
    pingTimeout: 5000,
  });

  // Track the typing users: Map of socket.id -> nickname
  const typingUsers = new Map<string, string>();

  io.on('connection', async (socket) => {
    // Send immediate online user count to everyone
    io.emit('user_count', io.engine.clientsCount);

    try {
      // 1. Send message history to the newly connected ghost
      const history = await fetchMessageHistory();
      socket.emit('history', history);
    } catch (err) {
      console.error('Error fetching chat history on connection:', err);
      socket.emit('history', []);
    }

    // 2. Handle incoming chat messages
    socket.on('message', async (data: { nickname: string; text: string }) => {
      try {
        const { nickname, text } = data;
        const socketId = socket.id;
        const now = Date.now();

        // Check Rate-limiting (max 1 message every 5 seconds)
        const lastMsgTime = rateLimitMap.get(socketId) || 0;
        if (now - lastMsgTime < 5000) {
          socket.emit('error', 'You are whispering too fast! Rate limit: 1 msg / 5s.');
          return;
        }

        // Update last message time stamp immediately
        rateLimitMap.set(socketId, now);

        // Sanitize input
        const sanitizedText = sanitizeMessage(text);
        if (!sanitizedText || sanitizedText.length === 0) {
          socket.emit('error', 'Cannot whisper empty voids.');
          return;
        }

        // Basic spam detection
        if (isSpam(sanitizedText, nickname)) {
          socket.emit('error', 'Message caught by anti-spam filtration.');
          return;
        }

        // Profanity filtering
        const processedText = filterBadWords(sanitizedText);

        const newMsg: Message = {
          id: Math.random().toString(36).substring(2, 15) + Date.now().toString(36),
          nickname: nickname || 'AnonymousGhost',
          text: processedText,
          createdAt: now,
        };

        // Save message (automatically expires in 24 hours under Redis or memory)
        await saveMessage(newMsg);

        // Broadcast to everyone
        io.emit('message', newMsg);

        // Remove from typing status if they successfully posted
        socket.broadcast.emit('stop_typing', { nickname: nickname });
      } catch (err) {
        console.error('Error processing whisper message:', err);
        socket.emit('error', 'A spatial anomaly occurred. Whisper failed.');
      }
    });

    // 3. Handle Typing indicators
    socket.on('typing', (data: { nickname: string }) => {
      socket.broadcast.emit('typing', { nickname: data.nickname || 'Ghost' });
    });

    socket.on('stop_typing', (data: { nickname: string }) => {
      socket.broadcast.emit('stop_typing', { nickname: data.nickname || 'Ghost' });
    });

    // 4. Handle Disconnection
    socket.on('disconnect', () => {
      // Clean rate limit index
      rateLimitMap.delete(socket.id);
      
      // Clean typing status
      socket.broadcast.emit('stop_typing', { socketId: socket.id });

      // Broadcast updated online count
      io.emit('user_count', io.engine.clientsCount);
    });
  });

  httpServer.once('error', (err) => {
    console.error('Server failed to start on Port 3000:', err);
    process.exit(1);
  });

  httpServer.listen(port, () => {
    console.log(`👻 [Wisp] Server running at http://localhost:${port}`);
  });
});
