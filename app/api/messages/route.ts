import { NextResponse } from 'next/server';
import { fetchMessageHistory, saveMessage, Message, getRedis } from '@/lib/redis';
import { sanitizeMessage, filterBadWords, isSpam } from '@/lib/chat-utils';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const nickname = searchParams.get('nickname');

  let onlineCount = 1;
  const redis = getRedis();

  if (redis && nickname) {
    try {
      const cleanNickname = nickname.trim();
      if (cleanNickname) {
        // Track presence: key expires in 15 seconds
        await redis.set(`ghostroom:presence:${cleanNickname}`, '1', { ex: 15 });
      }
      
      // Retrieve count of active presence keys
      const keys = await redis.keys('ghostroom:presence:*');
      onlineCount = Math.max(1, keys.length);
    } catch (err) {
      console.error('Failed to update presence in GET:', err);
    }
  }

  try {
    const messages = await fetchMessageHistory();
    return NextResponse.json({ messages, onlineCount });
  } catch (err) {
    console.error('Failed to fetch messages in GET API:', err);
    return NextResponse.json({ messages: [], onlineCount: 1 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { nickname, text } = body;
    const now = Date.now();

    const redis = getRedis();

    // 1. Rate limiting: Max 1 message every 5 seconds per user
    if (redis && nickname) {
      const rateLimitKey = `ghostroom:ratelimit:${nickname}`;
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
    const processedText = filterBadWords(sanitizedText);

    const newMsg: Message = {
      id: Math.random().toString(36).substring(2, 15) + Date.now().toString(36),
      nickname: nickname || 'AnonymousGhost',
      text: processedText,
      createdAt: now,
    };

    // 5. Save message
    await saveMessage(newMsg);

    // Keep presence active
    if (redis && nickname) {
      await redis.set(`ghostroom:presence:${nickname}`, '1', { ex: 15 });
    }

    return NextResponse.json({ success: true, message: newMsg });
  } catch (err) {
    console.error('Error in POST message API:', err);
    return NextResponse.json({ error: 'A spatial anomaly occurred. Whisper failed.' }, { status: 500 });
  }
}
