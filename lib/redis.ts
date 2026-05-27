import { Redis } from '@upstash/redis';
import type { ChatRoom, Message } from './message-types';

let redisClient: Redis | null = null;

const ROOM_TTL_SECONDS = 24 * 60 * 60;
const MESSAGE_TTL_SECONDS = 3 * 60 * 60;
const ROOM_MESSAGE_LIMIT = 200;

// In-memory fallback cache keyed by room key.
const memoryMessagesByRoom = new Map<string, Message[]>();
const memoryRooms = new Map<string, ChatRoom>();
// In-memory push subscriptions fallback
const memorySubscriptions: Record<string, any> = {};

function roomDataKey(roomKey: string): string {
  return `ghostroom:room:${roomKey}`;
}

function roomMessageIdsKey(roomKey: string): string {
  return `ghostroom:${roomKey}:message_ids`;
}

function roomMessageKey(roomKey: string, messageId: string): string {
  return `ghostroom:${roomKey}:message:${messageId}`;
}

/**
 * Lazy initializer for the Redis client.
 */
export function getRedis(): Redis | null {
  if (redisClient) return redisClient;

  let url = process.env.UPSTASH_REDIS_REST_URL;
  let token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (url) {
    url = url.trim().replace(/^['"]|['"]$/g, '').trim();
  }
  if (token) {
    token = token.trim().replace(/^['"]|['"]$/g, '').trim();
  }

  if (url && token) {
    try {
      redisClient = new Redis({
        url,
        token,
      });
      console.log('💚 [Upstash Redis] Connected successfully.');
      return redisClient;
    } catch (error) {
      console.error('❌ [Upstash Redis] Connection error, falling back to server memory:', error);
    }
  } else {
    console.log('ℹ️ [Upstash Redis] Info: Credentials not defined in environment. Fallback memory-state active.');
  }

  return null;
}

export type { Message } from './message-types';

export async function saveRoom(room: ChatRoom): Promise<void> {
  const safeRoom: ChatRoom = { key: room.key.trim(), name: room.name.trim() };
  if (!safeRoom.key) return;

  const redis = getRedis();
  if (redis) {
    try {
      await redis.set(roomDataKey(safeRoom.key), JSON.stringify(safeRoom), { ex: ROOM_TTL_SECONDS });
      return;
    } catch (err) {
      console.error('Failed to save room in Redis:', err);
    }
  }

  memoryRooms.set(safeRoom.key, safeRoom);
}

export async function fetchRoom(roomKey: string): Promise<ChatRoom | null> {
  const safeKey = roomKey.trim();
  if (!safeKey) return null;

  const redis = getRedis();
  if (redis) {
    try {
      const roomData = await redis.get(roomDataKey(safeKey));
      if (!roomData) return null;
      const parsed = typeof roomData === 'string' ? JSON.parse(roomData) : roomData;
      if (parsed?.key && parsed?.name) {
        await redis.expire(roomDataKey(safeKey), ROOM_TTL_SECONDS);
        return { key: String(parsed.key), name: String(parsed.name) };
      }
    } catch (err) {
      console.error('Failed to fetch room in Redis:', err);
    }
  }

  return memoryRooms.get(safeKey) || null;
}

/**
 * Save a message in a room with a 3 hour TTL.
 */
export async function saveMessage(msg: Message, roomKey: string): Promise<void> {
  const safeRoomKey = roomKey.trim();
  if (!safeRoomKey) return;

  const redis = getRedis();

  if (redis) {
    try {
      await redis.set(roomMessageKey(safeRoomKey, msg.id), JSON.stringify({ ...msg, roomKey: safeRoomKey }), {
        ex: MESSAGE_TTL_SECONDS,
      });
      await redis.lpush(roomMessageIdsKey(safeRoomKey), msg.id);
      await redis.ltrim(roomMessageIdsKey(safeRoomKey), 0, ROOM_MESSAGE_LIMIT - 1);
      return;
    } catch (err) {
      console.error('Failed to save message to Redis:', err);
    }
  }

  saveToMemory({ ...msg, roomKey: safeRoomKey }, safeRoomKey);
}

/**
 * Retrieve room message history (under 3 hours old).
 */
export async function fetchMessageHistory(roomKey: string): Promise<Message[]> {
  const safeRoomKey = roomKey.trim();
  if (!safeRoomKey) return [];

  const redis = getRedis();

  if (redis) {
    try {
      const messageIds: string[] = await redis.lrange(roomMessageIdsKey(safeRoomKey), 0, -1);
      if (!messageIds || messageIds.length === 0) return [];

      const fetched: Message[] = [];
      const values = await redis.mget<string[]>(...messageIds.map((id) => roomMessageKey(safeRoomKey, id)));
      const expiredIds: string[] = [];

      values.forEach((val, idx) => {
        const id = messageIds[idx];
        if (val) {
          try {
            const msgObj = typeof val === 'string' ? JSON.parse(val) : val;
            fetched.push(msgObj);
          } catch {
            expiredIds.push(id);
          }
        } else {
          expiredIds.push(id);
        }
      });

      if (expiredIds.length > 0) {
        Promise.all(expiredIds.map((id) => redis.lrem(roomMessageIdsKey(safeRoomKey), 0, id))).catch((err) => {
          console.warn('Failed to clean up expired ids from Redis list:', err);
        });
      }

      return fetched.sort((a, b) => a.createdAt - b.createdAt);
    } catch (err) {
      console.error('Failed to fetch message history from Redis:', err);
    }
  }

  return getFromMemory(safeRoomKey);
}

function saveToMemory(msg: Message, roomKey: string): void {
  const current = memoryMessagesByRoom.get(roomKey) || [];
  current.push(msg);
  memoryMessagesByRoom.set(roomKey, current);
  cleanupMemory(roomKey);
}

function getFromMemory(roomKey: string): Message[] {
  cleanupMemory(roomKey);
  return [...(memoryMessagesByRoom.get(roomKey) || [])].sort((a, b) => a.createdAt - b.createdAt);
}

function cleanupMemory(roomKey: string): void {
  const now = Date.now();
  const threeHoursInMillis = 3 * 60 * 60 * 1000;
  const filtered = (memoryMessagesByRoom.get(roomKey) || []).filter((msg) => now - msg.createdAt < threeHoursInMillis);
  if (filtered.length > ROOM_MESSAGE_LIMIT) {
    memoryMessagesByRoom.set(roomKey, filtered.slice(filtered.length - ROOM_MESSAGE_LIMIT));
    return;
  }
  memoryMessagesByRoom.set(roomKey, filtered);
}

// Push subscription managers
export async function savePushSubscription(clientId: string, subscription: any): Promise<void> {
  const redis = getRedis();
  if (redis) {
    try {
      await redis.hset('ghostroom:push_subs', { [clientId]: JSON.stringify(subscription) });
      return;
    } catch (err) {
      console.error('Failed to save push subscription to Redis:', err);
    }
  }
  memorySubscriptions[clientId] = subscription;
}

export async function removePushSubscription(clientId: string): Promise<void> {
  const redis = getRedis();
  if (redis) {
    try {
      await redis.hdel('ghostroom:push_subs', clientId);
      return;
    } catch (err) {
      console.error('Failed to remove push subscription from Redis:', err);
    }
  }
  delete memorySubscriptions[clientId];
}

export async function getAllPushSubscriptions(): Promise<{ clientId: string; subscription: any }[]> {
  const redis = getRedis();
  if (redis) {
    try {
      const subs = await redis.hgetall('ghostroom:push_subs');
      if (!subs) return [];

      const parsedSubs: { clientId: string; subscription: any }[] = [];
      for (const [clientId, subStr] of Object.entries(subs)) {
        try {
          const sub = typeof subStr === 'string' ? JSON.parse(subStr) : subStr;
          parsedSubs.push({ clientId, subscription: sub });
        } catch {
          console.error(`Failed to parse subscription for ${clientId}`);
        }
      }
      return parsedSubs;
    } catch (err) {
      console.error('Failed to get push subscriptions from Redis:', err);
    }
  }

  return Object.entries(memorySubscriptions).map(([clientId, subscription]) => ({ clientId, subscription }));
}
