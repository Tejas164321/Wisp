import { NextResponse } from 'next/server';
import { fetchMessageHistory, saveMessage, getRedis } from '@/lib/redis';
import type { Message, MessageType } from '@/lib/message-types';
import { sanitizeMessage, filterBadWords, isSpam } from '@/lib/chat-utils';
import { sanitizeMemeAudioPayload, sanitizeMemeTitle } from '@/lib/meme-utils';
import { sendPushNotifications } from '@/lib/push';
import { isValidRoomKey } from '@/lib/room-utils';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const nickname = searchParams.get('nickname');
  const clientId = searchParams.get('clientId');
  const roomKey = (searchParams.get('roomKey') || '').trim();
  if (!isValidRoomKey(roomKey)) {
    return NextResponse.json({ error: 'Invalid room key.' }, { status: 400 });
  }

  let onlineCount = 1;
  const redis = getRedis();

  if (redis && (clientId || nickname)) {
    try {
      const presenceId = (clientId || nickname || '').trim();
      if (presenceId) {
        // Track presence: key expires in 15 seconds
        await redis.set(`ghostroom:${roomKey}:presence:${presenceId}`, '1', { ex: 15 });
      }
      
      // Retrieve count of active presence keys
      const keys = await redis.keys(`ghostroom:${roomKey}:presence:*`);
      onlineCount = Math.max(1, keys.length);
    } catch (err) {
      console.error('Failed to update presence in GET:', err);
    }
  }

  try {
    const messages = await fetchMessageHistory(roomKey);
    return NextResponse.json({ messages, onlineCount });
  } catch (err) {
    console.error('Failed to fetch messages in GET API:', err);
    return NextResponse.json({ messages: [], onlineCount: 1 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { nickname, text, clientId, replyToId, replyToNickname, replyToText, type, memeAudio, roomKey } = body;
    const now = Date.now();
    const messageType: MessageType = type === 'meme_audio' ? 'meme_audio' : 'text';
    const safeRoomKey = typeof roomKey === 'string' ? roomKey.trim() : '';
    if (!isValidRoomKey(safeRoomKey)) {
      return NextResponse.json({ error: 'Invalid room key.' }, { status: 400 });
    }

    const redis = getRedis();

    // 1. Rate limiting: Max 1 message every 5 seconds per user
    if (redis && nickname) {
      const rateLimitKey = `ghostroom:${safeRoomKey}:ratelimit:${nickname}`;
      const isLocked = await redis.get(rateLimitKey);
      if (isLocked) {
        return NextResponse.json(
          { error: 'You are whispering too fast! Rate limit: 1 msg / 5s.' },
          { status: 429 }
        );
      }
      // Set rate limit for 5 seconds
      await redis.set(rateLimitKey, '1', { ex: 5 });
    }

    let processedText = '';
    let processedMemeAudio = undefined;

    if (messageType === 'text') {
      // 2. Sanitize input
      const sanitizedText = sanitizeMessage(text);
      if (!sanitizedText || sanitizedText.length === 0) {
        return NextResponse.json({ error: 'Cannot whisper empty voids.' }, { status: 400 });
      }

      // 3. Spam detection
      if (isSpam(sanitizedText, nickname)) {
        return NextResponse.json({ error: 'Message caught by anti-spam filtration.' }, { status: 400 });
      }

      // 4. Profanity filtering
      processedText = filterBadWords(sanitizedText);
    } else {
      const sanitizedAudio = sanitizeMemeAudioPayload(memeAudio);
      if (!sanitizedAudio) {
        return NextResponse.json({ error: 'Unsupported meme audio payload.' }, { status: 400 });
      }

      const safeTitle = filterBadWords(sanitizeMemeTitle(sanitizedAudio.title));
      if (!safeTitle) {
        return NextResponse.json({ error: 'Meme audio title missing.' }, { status: 400 });
      }
      if (isSpam(safeTitle, nickname)) {
        return NextResponse.json({ error: 'Message caught by anti-spam filtration.' }, { status: 400 });
      }

      processedMemeAudio = { ...sanitizedAudio, title: safeTitle };
      processedText = safeTitle;
    }

    const newMsg: Message = {
      id: Math.random().toString(36).substring(2, 15) + Date.now().toString(36),
      nickname: nickname || 'AnonymousGhost',
      text: processedText,
      createdAt: now,
      roomKey: safeRoomKey,
      replyToId,
      replyToNickname,
      replyToText,
      type: messageType,
      memeAudio: processedMemeAudio,
    };

    // 5. Save message
    await saveMessage(newMsg, safeRoomKey);

    // Keep presence active
    if (redis && (clientId || nickname)) {
      const presenceId = (clientId || nickname || '').trim();
      if (presenceId) {
        await redis.set(`ghostroom:${safeRoomKey}:presence:${presenceId}`, '1', { ex: 15 });
      }
    }

    // Trigger push notifications
    sendPushNotifications(newMsg, clientId).catch(err => console.error('Push notification error:', err));

    return NextResponse.json({ success: true, message: newMsg });
  } catch (err) {
    console.error('Error in POST message API:', err);
    return NextResponse.json({ error: 'A spatial anomaly occurred. Whisper failed.' }, { status: 500 });
  }
}
