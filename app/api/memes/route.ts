import { NextResponse } from 'next/server';
import { sanitizeMemeAudioPayload, sanitizeMemeTitle } from '@/lib/meme-utils';

const SEARCH_CACHE = new Map<string, { expiresAt: number; payload: any }>();
const RATE_LIMIT = new Map<string, { count: number; resetAt: number }>();

const CACHE_TTL_MS = 90_000;
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 30;
const MYINSTANTS_BASE_URL = 'https://www.myinstants.com';
const ALLOWED_PROVIDER_HOST_SUFFIXES = [
  'myinstants.com',
  'voicy.network',
  'cdn.voicy.network',
  'media.voicy.network',
  '101soundboards.com',
  'cdn.101soundboards.com',
  'static.101soundboards.com',
];
const MEME_RESULT_LIMIT = 24;
const TREND_HINTS = ['meme', 'viral', 'trending', 'funny', 'template', 'reel', 'shorts', 'sigma'];
const INDIAN_HINTS = ['indian', 'india', 'bollywood', 'hindi', 'desi', 'bhojpuri', 'tollywood'];
const TOKEN_SYNONYMS: Record<string, string[]> = {
  meme: ['funny', 'viral', 'template'],
  trend: ['trending', 'viral'],
  trending: ['trend', 'viral'],
  indian: ['india', 'bollywood', 'hindi', 'desi'],
  india: ['indian', 'bollywood', 'hindi', 'desi'],
};

function isAllowedProviderHost(hostname: string): boolean {
  return ALLOWED_PROVIDER_HOST_SUFFIXES.some(
    (allowedHost) => hostname === allowedHost || hostname.endsWith(`.${allowedHost}`)
  );
}

function normalizeProviderUrl(rawUrl: unknown): string | undefined {
  if (typeof rawUrl !== 'string') return undefined;
  const trimmed = rawUrl.trim();
  if (!trimmed) return undefined;

  let resolved: URL;

  try {
    if (trimmed.startsWith('//')) {
      resolved = new URL(`https:${trimmed}`);
    } else if (trimmed.startsWith('/')) {
      resolved = new URL(trimmed, MYINSTANTS_BASE_URL);
    } else if (/^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(trimmed)) {
      resolved = new URL(trimmed);
    } else {
      resolved = new URL(`https://${trimmed}`);
    }
  } catch {
    return undefined;
  }

  if (resolved.protocol !== 'https:' || !isAllowedProviderHost(resolved.hostname)) {
    return undefined;
  }

  return resolved.toString();
}

function normalizeSpace(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function tokenize(value: string): string[] {
  return normalizeSpace(value)
    .split(' ')
    .filter(Boolean);
}

function buildQueryVariants(query: string): string[] {
  const variants = [query, `${query} meme`, `${query} funny`, `${query} viral`, `${query} indian meme`, `trending ${query}`];
  return [...new Set(variants.map((variant) => sanitizeMemeTitle(variant)).filter((variant) => variant.length >= 2))].slice(0, 6);
}

async function fetchJson(url: string): Promise<any | null> {
  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': 'Wisp Meme Search' },
      signal: AbortSignal.timeout(4500),
    });
    if (!response.ok) return null;
    return response.json();
  } catch {
    return null;
  }
}

async function fetchText(url: string): Promise<string | null> {
  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': 'Wisp Meme Search' },
      signal: AbortSignal.timeout(4500),
    });
    if (!response.ok) return null;
    return response.text();
  } catch {
    return null;
  }
}

function build101SoundboardsSearchUrl(query: string): string {
  const url = new URL('https://www.101soundboards.com/search');
  url.searchParams.set('keyword', query);
  return url.toString();
}

function buildVoicySearchUrl(query: string): string {
  const url = new URL('https://www.voicy.network/search');
  url.searchParams.set('q', query);
  return url.toString();
}

function getTitleFromAudioUrl(audioUrl: string): string {
  try {
    const pathname = new URL(audioUrl).pathname;
    const slug = pathname.split('/').pop() || 'meme-sound';
    return sanitizeMemeTitle(decodeURIComponent(slug.replace(/\.[a-z0-9]+$/i, '').replace(/[-_]+/g, ' '))) || 'Meme sound';
  } catch {
    return 'Meme sound';
  }
}

function extractAudioCandidates(html: string): Array<{ title?: string; sourceUrl: string }> {
  const results: Array<{ title?: string; sourceUrl: string }> = [];
  const titleAndUrlPattern = /(data-title|title|aria-label)=["']([^"']{2,120})["'][^>]{0,300}?(https:\/\/[^"'\s<]+\.(?:mp3|wav|ogg|m4a)(?:\?[^"'\s<]*)?)/gi;
  const directUrlPattern = /(https:\/\/[^"'\s<]+\.(?:mp3|wav|ogg|m4a)(?:\?[^"'\s<]*)?)/gi;

  let match: RegExpExecArray | null;
  while ((match = titleAndUrlPattern.exec(html)) && results.length < 40) {
    results.push({
      title: sanitizeMemeTitle(match[2]),
      sourceUrl: match[3],
    });
  }

  while ((match = directUrlPattern.exec(html)) && results.length < 80) {
    results.push({
      sourceUrl: match[1],
    });
  }

  return results;
}

async function searchMyInstants(variantQuery: string, page: number) {
  const providerUrl = new URL('https://www.myinstants.com/api/v1/instants/');
  providerUrl.searchParams.set('search', variantQuery);
  providerUrl.searchParams.set('page', String(page));

  const data = await fetchJson(providerUrl.toString());
  if (!data) {
    return [] as ReturnType<typeof sanitizeMemeAudioPayload>[];
  }

  return (data?.results || data || [])
    .map((item: any) => {
      const candidate = {
        id: item?.id || item?.slug || item?.sound || item?.url || item?.name,
        title: item?.name || item?.title || item?.sound_name || item?.slug || 'Meme sound',
        provider: 'myinstants' as const,
        sourceUrl: normalizeProviderUrl(item?.sound || item?.mp3 || item?.audio || item?.preview || item?.url),
        previewUrl: normalizeProviderUrl(item?.sound || item?.preview || item?.mp3 || item?.audio),
        imageUrl: normalizeProviderUrl(item?.icon || item?.image || item?.thumbnail),
        pageUrl: normalizeProviderUrl(
          item?.url || item?.permalink || (item?.slug ? `https://www.myinstants.com/instant/${item.slug}/` : undefined)
        ),
        duration: item?.duration ? Number(item.duration) * 1000 : undefined,
      };
      return sanitizeMemeAudioPayload(candidate);
    })
    .filter(Boolean);
}

async function searchHtmlProvider(searchUrl: string, provider: 'voicy' | 'soundboard101') {
  const html = await fetchText(searchUrl);
  if (!html) return [] as ReturnType<typeof sanitizeMemeAudioPayload>[];

  return extractAudioCandidates(html)
    .map((candidate, index) => {
      const sourceUrl = normalizeProviderUrl(candidate.sourceUrl);
      const title = candidate.title || getTitleFromAudioUrl(candidate.sourceUrl);
      return sanitizeMemeAudioPayload({
        id: `${provider}-${index}-${sourceUrl || candidate.sourceUrl}`,
        title,
        provider,
        sourceUrl,
        previewUrl: sourceUrl,
        pageUrl: searchUrl,
      });
    })
    .filter(Boolean);
}

function scoreMemeResult(query: string, title: string, provider: string): number {
  const queryText = normalizeSpace(query);
  const titleText = normalizeSpace(title);
  const queryTokens = tokenize(query);
  const titleTokens = new Set(tokenize(title));

  let score = 0;
  if (titleText.includes(queryText)) score += 50;

  for (const token of queryTokens) {
    if (titleTokens.has(token)) {
      score += 14;
      continue;
    }

    if (titleText.includes(token)) score += 7;

    const synonyms = TOKEN_SYNONYMS[token] || [];
    if (synonyms.some((synonym) => titleTokens.has(synonym) || titleText.includes(synonym))) {
      score += 6;
    }
  }

  score += TREND_HINTS.reduce((total, hint) => total + (titleText.includes(hint) ? 2 : 0), 0);
  score += INDIAN_HINTS.reduce((total, hint) => total + (titleText.includes(hint) ? 3 : 0), 0);
  if (provider !== 'myinstants') score += 4;

  return score;
}

function rankAndMixResults(query: string, rawResults: any[]) {
  const deduped = new Map<string, any>();

  rawResults.forEach((result) => {
    if (!result) return;
    const dedupeKey = `${result.sourceUrl || ''}::${normalizeSpace(result.title || '')}`;
    const existing = deduped.get(dedupeKey);
    if (!existing) {
      deduped.set(dedupeKey, result);
      return;
    }

    const existingScore = scoreMemeResult(query, existing.title || '', existing.provider || '');
    const nextScore = scoreMemeResult(query, result.title || '', result.provider || '');
    if (nextScore > existingScore) {
      deduped.set(dedupeKey, result);
    }
  });

  const sorted = [...deduped.values()].sort((a, b) => {
    const scoreDiff = scoreMemeResult(query, b.title || '', b.provider || '') - scoreMemeResult(query, a.title || '', a.provider || '');
    if (scoreDiff !== 0) return scoreDiff;
    return (a.title || '').localeCompare(b.title || '');
  });

  const providerCounts = new Map<string, number>();
  const mixed: any[] = [];
  for (const result of sorted) {
    const provider = result.provider || 'unknown';
    const count = providerCounts.get(provider) || 0;
    if (count >= 10) continue;
    providerCounts.set(provider, count + 1);
    mixed.push(result);
    if (mixed.length >= MEME_RESULT_LIMIT) break;
  }

  return mixed;
}

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

  try {
    const queryVariants = buildQueryVariants(safeQuery);
    const searchTasks: Promise<any[]>[] = [];

    searchTasks.push(searchMyInstants(queryVariants[0], page));
    searchTasks.push(searchMyInstants(queryVariants[0], page + 1));
    queryVariants.slice(1).forEach((variant) => {
      searchTasks.push(searchMyInstants(variant, 1));
    });
    searchTasks.push(searchHtmlProvider(buildVoicySearchUrl(safeQuery), 'voicy'));
    searchTasks.push(searchHtmlProvider(build101SoundboardsSearchUrl(safeQuery), 'soundboard101'));

    const settled = await Promise.allSettled(searchTasks);
    const rawResults = settled.flatMap((item) => (item.status === 'fulfilled' ? item.value : []));
    const results = rankAndMixResults(safeQuery, rawResults);
    if (!results.length) {
      return NextResponse.json({ error: 'No meme sounds found from current sources.' }, { status: 404 });
    }

    const payload = {
      provider: 'multi-source',
      results,
      next: null,
      previous: null,
    };

    SEARCH_CACHE.set(cacheKey, { expiresAt: Date.now() + CACHE_TTL_MS, payload });
    return NextResponse.json(payload);
  } catch (err) {
    console.error('Meme search failed:', err);
    return NextResponse.json({ error: 'Meme search failed.' }, { status: 502 });
  }
}
