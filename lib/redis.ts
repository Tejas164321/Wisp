import { Redis } from '@upstash/redis';

let redisClient: Redis | null = null;

// Simple in-memory fallback cache that expires objects based on timestamps.
let memoryMessages: any[] = [];

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

export interface Message {
  id: string;
  nickname: string;
  text: string;
  createdAt: number;
}

/**
 * Save a message to Redis with a 24 hour TTL, or store in memory if Redis is absent.
 */
export async function saveMessage(msg: Message): Promise<void> {
  const redis = getRedis();
  
  if (redis) {
    try {
      // 1. Set individual key value with 24 hours (86400 seconds) expiration (TTL)
      await redis.set(`ghostroom:message:${msg.id}`, JSON.stringify(msg), { ex: 86400 });
      
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
 * Retrieve current message history (under 24 hours old).
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
  const dayInMillis = 24 * 60 * 60 * 1000;
  // Expressive 24 hour TTL filtering
  memoryMessages = memoryMessages.filter(msg => (now - msg.createdAt) < dayInMillis);
  // Cap list size
  if (memoryMessages.length > 200) {
    memoryMessages = memoryMessages.slice(memoryMessages.length - 200);
  }
}
