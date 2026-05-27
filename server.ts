import { createServer } from 'node:http';
import { parse } from 'node:url';
import next from 'next';
import { Server } from 'socket.io';
import { saveMessage, fetchMessageHistory, fetchRoom, saveRoom } from './lib/redis';
import type { ChatRoom, MemeAudio, Message, MessageType } from './lib/message-types';
import { sanitizeMessage, filterBadWords, isSpam } from './lib/chat-utils';
import { sanitizeMemeAudioPayload, sanitizeMemeTitle } from './lib/meme-utils';
import { sendPushNotifications } from './lib/push';
import { isValidRoomKey } from './lib/room-utils';

const dev = process.env.NODE_ENV !== 'production';
const hostname = process.env.HOSTNAME || '0.0.0.0';
const port = 3000;

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

const rateLimitMap = new Map<string, number>();
const socketRoomMap = new Map<string, ChatRoom>();

app.prepare().then(() => {
  const httpServer = createServer((req, res) => {
    try {
      const parsedUrl = parse(req.url || '', true);
      const { pathname } = parsedUrl;

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
      origin: '*',
      methods: ['GET', 'POST'],
    },
    pingInterval: 10000,
    pingTimeout: 5000,
  });

  io.on('connection', (socket) => {
    socket.emit('room_required');

    socket.on('join_room', async (payload: { roomKey: string; roomName?: string }) => {
      try {
        const roomKey = (payload.roomKey || '').trim();
        const roomName = (payload.roomName || '').trim();
        if (!isValidRoomKey(roomKey)) {
          socket.emit('error', 'Room key must be exactly 4 digits.');
          return;
        }

        let room = await fetchRoom(roomKey);
        if (!room && roomName) {
          room = { key: roomKey, name: roomName };
          await saveRoom(room);
        }
        if (!room) {
          socket.emit('room_join_failed', { reason: 'Room not found. Check the 4-digit key.' });
          return;
        }

        const previousRoom = socketRoomMap.get(socket.id);
        if (previousRoom && previousRoom.key !== room.key) {
          socket.leave(previousRoom.key);
          io.to(previousRoom.key).emit('stop_typing', { socketId: socket.id });
          io.to(previousRoom.key).emit('user_count', io.sockets.adapter.rooms.get(previousRoom.key)?.size || 0);
        }

        socket.join(room.key);
        socketRoomMap.set(socket.id, room);
        const history = await fetchMessageHistory(room.key);
        socket.emit('room_joined', room);
        socket.emit('history', history);
        io.to(room.key).emit('user_count', io.sockets.adapter.rooms.get(room.key)?.size || 0);
      } catch (err) {
        console.error('Error processing join_room:', err);
        socket.emit('room_join_failed', { reason: 'Unable to join room right now.' });
      }
    });

    socket.on(
      'message',
      async (data: {
        nickname: string;
        text?: string;
        type?: MessageType;
        memeAudio?: Partial<MemeAudio>;
        clientId?: string;
        replyToId?: string;
        replyToNickname?: string;
        replyToText?: string;
      }) => {
        const room = socketRoomMap.get(socket.id);
        if (!room) {
          socket.emit('error', 'Join a room before sending messages.');
          return;
        }

        try {
          const { nickname, text, clientId, type, memeAudio } = data;
          const socketId = socket.id;
          const now = Date.now();
          const messageType: MessageType = type === 'meme_audio' ? 'meme_audio' : 'text';

          const lastMsgTime = rateLimitMap.get(socketId) || 0;
          if (now - lastMsgTime < 5000) {
            socket.emit('error', 'You are whispering too fast! Rate limit: 1 msg / 5s.');
            return;
          }

          rateLimitMap.set(socketId, now);

          let processedText = '';
          let processedMemeAudio = undefined;

          if (messageType === 'text') {
            const sanitizedText = sanitizeMessage(text || '');
            if (!sanitizedText || sanitizedText.length === 0) {
              socket.emit('error', 'Cannot whisper empty voids.');
              return;
            }

            if (isSpam(sanitizedText, nickname)) {
              socket.emit('error', 'Message caught by anti-spam filtration.');
              return;
            }

            processedText = filterBadWords(sanitizedText);
          } else {
            const sanitizedAudio = sanitizeMemeAudioPayload(memeAudio);
            if (!sanitizedAudio) {
              socket.emit('error', 'Unsupported meme audio payload.');
              return;
            }

            const safeTitle = filterBadWords(sanitizeMemeTitle(sanitizedAudio.title));
            if (!safeTitle) {
              socket.emit('error', 'Meme audio title missing.');
              return;
            }
            if (isSpam(safeTitle, nickname)) {
              socket.emit('error', 'Message caught by anti-spam filtration.');
              return;
            }

            processedMemeAudio = { ...sanitizedAudio, title: safeTitle };
            processedText = safeTitle;
          }

          const newMsg: Message = {
            id: globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 10)}`,
            nickname: nickname || 'AnonymousGhost',
            text: processedText,
            createdAt: now,
            roomKey: room.key,
            replyToId: data.replyToId,
            replyToNickname: data.replyToNickname,
            replyToText: data.replyToText,
            type: messageType,
            memeAudio: processedMemeAudio,
          };

          await saveMessage(newMsg, room.key);
          io.to(room.key).emit('message', newMsg);
          sendPushNotifications(newMsg, clientId).catch((err) => console.error('Push notification error:', err));
          socket.to(room.key).emit('stop_typing', { nickname: nickname });
        } catch (err) {
          console.error('Error processing whisper message:', err);
          socket.emit('error', 'A spatial anomaly occurred. Whisper failed.');
        }
      }
    );

    socket.on('typing', (data: { nickname: string }) => {
      const room = socketRoomMap.get(socket.id);
      if (!room) return;
      socket.to(room.key).emit('typing', { nickname: data.nickname || 'Ghost' });
    });

    socket.on('stop_typing', (data: { nickname: string }) => {
      const room = socketRoomMap.get(socket.id);
      if (!room) return;
      socket.to(room.key).emit('stop_typing', { nickname: data.nickname || 'Ghost' });
    });

    socket.on('leave_room', () => {
      const room = socketRoomMap.get(socket.id);
      if (!room) return;
      socket.leave(room.key);
      socketRoomMap.delete(socket.id);
      io.to(room.key).emit('stop_typing', {});
      io.to(room.key).emit('user_count', io.sockets.adapter.rooms.get(room.key)?.size || 0);
    });

    socket.on('disconnect', () => {
      rateLimitMap.delete(socket.id);
      const room = socketRoomMap.get(socket.id);
      if (room) {
        socketRoomMap.delete(socket.id);
        io.to(room.key).emit('stop_typing', {});
        io.to(room.key).emit('user_count', io.sockets.adapter.rooms.get(room.key)?.size || 0);
      }
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
