import { Redis } from '@upstash/redis';
import type { Message } from './message-types';

let redisClient: Redis | null = null;

// Simple in-memory fallback cache that expires objects based on timestamps.
let memoryMessages: Message[] = [];
// In-memory push subscriptions fallback
const memorySubscriptions: Record<string, any> = {};

/**
 * Lazy initializer for the Redis client.
 */
export function getRedis(): Redis | null {
  if (redisClient) return redisClient;

  let url = process.env.UPSTASH_REDIS_REST_URL;
  let token = process.env.UPSTASH_REDIS_REST_TOKEN;

  // Clean ambient quotes if parsed literally from the environment configuration
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

/**
 * Save a message to Redis with a 3 hour TTL, or store in memory if Redis is absent.
 */
export async function saveMessage(msg: Message): Promise<void> {
  const redis = getRedis();
  
  if (redis) {
    try {
      // 1. Set individual key value with 3 hours (10800 seconds) expiration (TTL)
      await redis.set(`ghostroom:message:${msg.id}`, JSON.stringify(msg), { ex: 10800 });
      
      // 2. LPUSH to index list
      await redis.lpush('ghostroom:message_ids', msg.id);
      
      // 3. Trim index list to maximum 200 entries to prevent memory-waste
      await redis.ltrim('ghostroom:message_ids', 0, 199);
    } catch (err) {
      console.error('Failed to save message to Redis:', err);
      saveToMemory(msg);
    }
  } else {
    saveToMemory(msg);
  }
}

/**
 * Retrieve current message history (under 3 hours old).
 */
export async function fetchMessageHistory(): Promise<Message[]> {
  const redis = getRedis();
  const now = Date.now();

  if (redis) {
    try {
      // 1. Get the list of message IDs
      const messageIds: string[] = await redis.lrange('ghostroom:message_ids', 0, -1);
      if (!messageIds || messageIds.length === 0) return [];

      // 2. Query all of those individual messages
      const fetched: any[] = [];
      
      // Upstash supports mget
      const values = await redis.mget<string[]>(...messageIds.map(id => `ghostroom:message:${id}`));
      
      // Filter expired keys and construct response
      const validIds: string[] = [];
      const expiredIds: string[] = [];

      values.forEach((val, idx) => {
        const id = messageIds[idx];
        if (val) {
          try {
            const msgObj = typeof val === 'string' ? JSON.parse(val) : val;
            fetched.push(msgObj);
            validIds.push(id);
          } catch {
            // Unparseable JSON, skip
          }
        } else {
          // Key expired! Keep track of it to clean from index list
          expiredIds.push(id);
        }
      });

      // Cleanup: asynchronously remove expired message IDs from index list to keep space optimal
      if (expiredIds.length > 0) {
        Promise.all(expiredIds.map(eid => redis.lrem('ghostroom:message_ids', 0, eid))).catch(err => {
          console.warn('Failed to clean up expired ids from Redis list:', err);
        });
      }

      // Return sorted from oldest to newest for chronological chat stream
      return fetched.sort((a, b) => a.createdAt - b.createdAt);
    } catch (err) {
      console.error('Failed to fetch message history from Redis:', err);
      return getFromMemory();
    }
  }

  return getFromMemory();
}

// Memory managers
function saveToMemory(msg: Message): void {
  memoryMessages.push(msg);
  cleanupMemory();
}

function getFromMemory(): Message[] {
  cleanupMemory();
  // Return sorted chronologically
  return [...memoryMessages].sort((a, b) => a.createdAt - b.createdAt);
}

function cleanupMemory(): void {
  const now = Date.now();
  const threeHoursInMillis = 3 * 60 * 60 * 1000;
  // Expressive 3 hour TTL filtering
  memoryMessages = memoryMessages.filter(msg => (now - msg.createdAt) < threeHoursInMillis);
  // Cap list size
  if (memoryMessages.length > 200) {
    memoryMessages = memoryMessages.slice(memoryMessages.length - 200);
  }
}

// Push subscription managers

export async function savePushSubscription(clientId: string, subscription: any): Promise<void> {
  const redis = getRedis();
  if (redis) {
    try {
      await redis.hset('ghostroom:push_subs', { [clientId]: JSON.stringify(subscription) });
    } catch (err) {
      console.error('Failed to save push subscription to Redis:', err);
      memorySubscriptions[clientId] = subscription;
    }
  } else {
    memorySubscriptions[clientId] = subscription;
  }
}

export async function removePushSubscription(clientId: string): Promise<void> {
  const redis = getRedis();
  if (redis) {
    try {
      await redis.hdel('ghostroom:push_subs', clientId);
    } catch (err) {
      console.error('Failed to remove push subscription from Redis:', err);
      delete memorySubscriptions[clientId];
    }
  } else {
    delete memorySubscriptions[clientId];
  }
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
          // Upstash redis client might automatically parse JSON objects depending on configuration.
          // Handle both string and object.
          const sub = typeof subStr === 'string' ? JSON.parse(subStr) : subStr;
          parsedSubs.push({ clientId, subscription: sub });
        } catch (e) {
          console.error(`Failed to parse subscription for ${clientId}`);
        }
      }
      return parsedSubs;
    } catch (err) {
      console.error('Failed to get push subscriptions from Redis:', err);
      return Object.entries(memorySubscriptions).map(([clientId, sub]) => ({ clientId, subscription: sub }));
    }
  }
  
  return Object.entries(memorySubscriptions).map(([clientId, sub]) => ({ clientId, subscription: sub }));
}
