import { NextResponse } from 'next/server';
import { sanitizeMemeAudioPayload, sanitizeMemeTitle } from '@/lib/meme-utils';

const SEARCH_CACHE = new Map<string, { expiresAt: number; payload: any }>();
const RATE_LIMIT = new Map<string, { count: number; resetAt: number }>();

const CACHE_TTL_MS = 90_000;
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 30;

function getClientKey(request: Request) {
  const forwardedFor = request.headers.get('x-forwarded-for');
  const realIp = request.headers.get('x-real-ip');
  return (forwardedFor?.split(',')[0] || realIp || 'unknown').trim();
}

function isRateLimited(key: string) {
  const now = Date.now();
  const existing = RATE_LIMIT.get(key);
  if (!existing || existing.resetAt <= now) {
    RATE_LIMIT.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return false;
  }
  existing.count += 1;
  if (existing.count > RATE_LIMIT_MAX) {
    return true;
  }
  return false;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = (searchParams.get('q') || '').trim();
  const page = Math.max(1, Number(searchParams.get('page') || '1'));

  if (!query || query.length < 2) {
    return NextResponse.json({ error: 'Search query too short.' }, { status: 400 });
  }

  const key = getClientKey(request);
  if (isRateLimited(key)) {
    return NextResponse.json({ error: 'Search rate limit reached.' }, { status: 429 });
  }

  const safeQuery = sanitizeMemeTitle(query);
  if (!safeQuery) {
    return NextResponse.json({ error: 'Search query too short.' }, { status: 400 });
  }
  const cacheKey = `${safeQuery.toLowerCase()}::${page}`;
  const cached = SEARCH_CACHE.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return NextResponse.json(cached.payload);
  }

  const providerUrl = new URL('https://www.myinstants.com/api/v1/instants/');
  providerUrl.searchParams.set('search', safeQuery);
  providerUrl.searchParams.set('page', String(page));

  try {
    const response = await fetch(providerUrl.toString(), {
      headers: {
        'User-Agent': 'Wisp Meme Search',
      },
    });
    if (!response.ok) {
      return NextResponse.json({ error: 'Meme source unavailable.' }, { status: 502 });
    }

    const data = await response.json();
    const results = (data?.results || data || [])
      .map((item: any) => {
        const candidate = {
          id: String(item?.id || item?.slug || item?.name || Math.random().toString(36)),
          title: item?.name || item?.title || item?.sound_name || item?.slug || 'Meme sound',
          provider: 'myinstants',
          sourceUrl: item?.sound || item?.mp3 || item?.audio || item?.preview || item?.url,
          previewUrl: item?.sound || item?.preview || item?.mp3 || item?.audio,
          imageUrl: item?.icon || item?.image || item?.thumbnail,
          pageUrl: item?.url || item?.permalink || (item?.slug ? `https://www.myinstants.com/instant/${item.slug}/` : undefined),
          duration: item?.duration ? Number(item.duration) * 1000 : undefined,
        };
        return sanitizeMemeAudioPayload(candidate);
      })
      .filter(Boolean)
      .slice(0, 12);

    const payload = {
      provider: 'myinstants',
      results,
      next: data?.next || null,
      previous: data?.previous || null,
    };

    SEARCH_CACHE.set(cacheKey, { expiresAt: Date.now() + CACHE_TTL_MS, payload });
    return NextResponse.json(payload);
  } catch (err) {
    console.error('Meme search failed:', err);
    return NextResponse.json({ error: 'Meme search failed.' }, { status: 502 });
  }
}
