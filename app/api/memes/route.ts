import { NextResponse } from 'next/server';
import type { MemeAudio } from '@/lib/message-types';
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
  'freesound.org',
  'cdn.freesound.org',
  'pixabay.com',
  'cdn.pixabay.com',
  'mixkit.co',
  'assets.mixkit.co',
  'cdn.mixkit.co',
];
const MEME_RESULT_LIMIT = 24;
const MAX_RESULTS_PER_PROVIDER = 10;
const MAX_TITLE_URL_CANDIDATES = 40;
const MAX_DIRECT_URL_CANDIDATES = 80;
const MAX_PROVIDER_HTML_LENGTH = 300_000;
const PROVIDER_REQUEST_TIMEOUT_MS = 4_500;
const SCORE_EXACT_MATCH = 50;
const SCORE_TOKEN_MATCH = 14;
const SCORE_PARTIAL_TOKEN_MATCH = 7;
const SCORE_SYNONYM_MATCH = 6;
const SCORE_TREND_HINT = 2;
const SCORE_INDIAN_HINT = 3;
const SCORE_PROVIDER_DIVERSITY = 4;
const TREND_HINTS = ['meme', 'viral', 'trending', 'funny', 'template', 'reel', 'shorts', 'sigma'];
const INDIAN_HINTS = ['indian', 'india', 'bollywood', 'hindi', 'desi', 'bhojpuri', 'tollywood'];
const HTML_AUDIO_URL_PATTERN = String.raw`https:\/\/[^"'\s<]+\.(?:mp3|wav|ogg|m4a)(?:\?[^"'\s<]*)?`;
const TOKEN_SYNONYMS: Record<string, string[]> = {
  meme: ['funny', 'viral', 'template'],
  trend: ['trending', 'viral'],
  trending: ['trend', 'viral'],
  indian: ['india', 'bollywood', 'hindi', 'desi'],
  india: ['indian', 'bollywood', 'hindi', 'desi'],
  laugh: ['lol', 'funny', 'comedy'],
  scream: ['shout', 'yell'],
  fail: ['oops', 'error', 'wrong'],
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
  const hasIndianContext = INDIAN_HINTS.some((hint) => normalizeSpace(query).includes(hint));
  const variants = [query, `${query} meme`, `${query} funny`, `${query} viral`, `trending ${query}`, `popular ${query}`];
  if (hasIndianContext) {
    variants.push(`${query} indian`);
  }
  return [...new Set(variants.map((variant) => sanitizeMemeTitle(variant)).filter((variant) => variant.length >= 2))].slice(0, 6);
}

async function fetchJson(url: string): Promise<unknown | null> {
  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': 'Wisp Meme Search' },
      signal: AbortSignal.timeout(PROVIDER_REQUEST_TIMEOUT_MS),
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
      signal: AbortSignal.timeout(PROVIDER_REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) return null;
    const text = await response.text();
    if (text.length > MAX_PROVIDER_HTML_LENGTH) {
      return text.slice(0, MAX_PROVIDER_HTML_LENGTH);
    }
    return text;
  } catch {
    return null;
  }
}

function buildSoundboard101SearchUrl(query: string): string {
  const url = new URL('https://www.101soundboards.com/search');
  url.searchParams.set('keyword', query);
  return url.toString();
}

function buildVoicySearchUrl(query: string): string {
  const url = new URL('https://www.voicy.network/search');
  url.searchParams.set('q', query);
  return url.toString();
}

function buildFreesoundSearchUrl(query: string): string {
  const url = new URL('https://freesound.org/search/');
  url.searchParams.set('q', query);
  return url.toString();
}

function buildPixabaySearchUrl(query: string): string {
  const url = new URL('https://pixabay.com/sound-effects/search/');
  url.searchParams.set('q', query);
  return url.toString();
}

function buildMixkitSearchUrl(query: string): string {
  const url = new URL('https://mixkit.co/free-sound-effects/');
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

function asString(value: unknown): string | undefined {
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  return undefined;
}

function extractAudioCandidates(html: string): Array<{ title?: string; sourceUrl: string }> {
  const results: Array<{ title?: string; sourceUrl: string }> = [];
  const titleAndUrlPattern = new RegExp(
    String.raw`(data-title|title|aria-label)=["']([^"']{2,120})["'][^>]{0,300}?(${HTML_AUDIO_URL_PATTERN})`,
    'gi'
  );
  const directUrlPattern = new RegExp(`(${HTML_AUDIO_URL_PATTERN})`, 'gi');

  let match: RegExpExecArray | null;
  while ((match = titleAndUrlPattern.exec(html)) && results.length < MAX_TITLE_URL_CANDIDATES) {
    results.push({
      title: sanitizeMemeTitle(match[2]),
      sourceUrl: match[3],
    });
  }

  while ((match = directUrlPattern.exec(html)) && results.length < MAX_DIRECT_URL_CANDIDATES) {
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

  const items = Array.isArray(data)
    ? data
    : Array.isArray((data as { results?: unknown[] })?.results)
      ? (data as { results: unknown[] }).results
      : [];

  return items
    .map((item) => {
      const typedItem = item as Record<string, unknown>;
      const slug = asString(typedItem?.slug);
      const candidate = {
        id:
          asString(typedItem?.id)
          || slug
          || asString(typedItem?.sound)
          || asString(typedItem?.url)
          || asString(typedItem?.name)
          || 'meme-sound',
        title:
          asString(typedItem?.name)
          || asString(typedItem?.title)
          || asString(typedItem?.sound_name)
          || slug
          || 'Meme sound',
        provider: 'myinstants' as const,
        sourceUrl: normalizeProviderUrl(typedItem?.sound || typedItem?.mp3 || typedItem?.audio || typedItem?.preview || typedItem?.url),
        previewUrl: normalizeProviderUrl(typedItem?.sound || typedItem?.preview || typedItem?.mp3 || typedItem?.audio),
        imageUrl: normalizeProviderUrl(typedItem?.icon || typedItem?.image || typedItem?.thumbnail),
        pageUrl: normalizeProviderUrl(
          typedItem?.url
            || typedItem?.permalink
            || (slug ? `https://www.myinstants.com/instant/${slug}/` : undefined)
        ),
        duration: typedItem?.duration ? Number(typedItem.duration) * 1000 : undefined,
      };
      return sanitizeMemeAudioPayload(candidate);
    })
    .filter(Boolean);
}

type HtmlProvider = 'voicy' | 'soundboard101' | 'freesound' | 'pixabay' | 'mixkit';

async function searchHtmlProvider(searchUrl: string, provider: HtmlProvider) {
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
  const exactMatch = titleText.includes(queryText);
  if (exactMatch) {
    score += SCORE_EXACT_MATCH;
  } else {
    for (const token of queryTokens) {
      if (titleTokens.has(token)) {
        score += SCORE_TOKEN_MATCH;
        continue;
      }

      if (titleText.includes(token)) score += SCORE_PARTIAL_TOKEN_MATCH;

      const synonyms = TOKEN_SYNONYMS[token] || [];
      if (synonyms.some((synonym) => titleTokens.has(synonym) || titleText.includes(synonym))) {
        score += SCORE_SYNONYM_MATCH;
      }
    }
  }

  score += TREND_HINTS.reduce((total, hint) => total + (titleText.includes(hint) ? SCORE_TREND_HINT : 0), 0);
  score += INDIAN_HINTS.reduce((total, hint) => total + (titleText.includes(hint) ? SCORE_INDIAN_HINT : 0), 0);
  if (provider !== 'myinstants') score += SCORE_PROVIDER_DIVERSITY;

  return score;
}

function rankAndMixResults(query: string, rawResults: MemeAudio[]) {
  const deduped = new Map<string, MemeAudio>();
  const scoreByKey = new Map<string, number>();

  rawResults.forEach((result) => {
    if (!result) return;
    const dedupeKey = `${result.sourceUrl || ''}::${normalizeSpace(result.title || '')}`;
    const nextScore = scoreMemeResult(query, result.title || '', result.provider || '');
    const existing = deduped.get(dedupeKey);
    if (!existing) {
      deduped.set(dedupeKey, result);
      scoreByKey.set(dedupeKey, nextScore);
      return;
    }

    const existingScore = scoreByKey.get(dedupeKey) || 0;
    if (nextScore > existingScore) {
      deduped.set(dedupeKey, result);
      scoreByKey.set(dedupeKey, nextScore);
    }
  });

  const sorted = [...deduped.values()].sort((a, b) => {
    const keyA = `${a.sourceUrl || ''}::${normalizeSpace(a.title || '')}`;
    const keyB = `${b.sourceUrl || ''}::${normalizeSpace(b.title || '')}`;
    const scoreDiff = (scoreByKey.get(keyB) || 0) - (scoreByKey.get(keyA) || 0);
    if (scoreDiff !== 0) return scoreDiff;
    return (a.title || '').localeCompare(b.title || '');
  });

  const providerCounts = new Map<string, number>();
  const mixed: MemeAudio[] = [];
  for (const result of sorted) {
    const provider = result.provider || 'unknown';
    const count = providerCounts.get(provider) || 0;
    if (count >= MAX_RESULTS_PER_PROVIDER) continue;
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
    searchTasks.push(searchHtmlProvider(buildSoundboard101SearchUrl(safeQuery), 'soundboard101'));
    searchTasks.push(searchHtmlProvider(buildFreesoundSearchUrl(safeQuery), 'freesound'));
    searchTasks.push(searchHtmlProvider(buildPixabaySearchUrl(safeQuery), 'pixabay'));
    searchTasks.push(searchHtmlProvider(buildMixkitSearchUrl(safeQuery), 'mixkit'));

    const settled = await Promise.allSettled(searchTasks);
    const rawResults = settled.flatMap((item) => (item.status === 'fulfilled' ? item.value : []));
    const results = rankAndMixResults(safeQuery, rawResults);
    if (!results.length) {
      return NextResponse.json({ error: 'No meme sounds found from current sources.' }, { status: 404 });
    }

    const payload = {
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
