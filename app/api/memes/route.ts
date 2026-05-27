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
  'instantbuttons.com',
  'blerp.com',
  'memesoundboard.com',
  'soundboardguy.com',
];
const MEME_RESULT_LIMIT = 24;
const MAX_RESULTS_PER_PROVIDER = 10;
const MAX_TITLE_URL_CANDIDATES = 40;
const MAX_DIRECT_URL_CANDIDATES = 80;
const MAX_PROVIDER_HTML_LENGTH = 300_000;
const PROVIDER_REQUEST_TIMEOUT_MS = 4_500;
const SCORE_EXACT_MATCH = 50;
const SCORE_STARTS_WITH = 24;
const SCORE_TOKEN_MATCH = 14;
const SCORE_PARTIAL_TOKEN_MATCH = 7;
const SCORE_SYNONYM_MATCH = 6;
const SCORE_TREND_HINT = 2;
const SCORE_INDIAN_HINT = 3;
const SCORE_PROVIDER_DIVERSITY = 4;
const TREND_HINTS = ['meme', 'viral', 'trending', 'funny', 'template', 'reel', 'shorts', 'sigma'];
const INDIAN_HINTS = ['indian', 'india', 'bollywood', 'hindi', 'desi', 'bhojpuri', 'tollywood'];
const HTML_AUDIO_URL_PATTERN = String.raw`https:\/\/[^"'\s<]+\.(?:mp3|wav|ogg|m4a)(?:\?[^"'\s<]*)?`;
const STOP_WORDS = new Set([
  'the',
  'a',
  'an',
  'to',
  'of',
  'and',
  'or',
  'for',
  'in',
  'on',
  'with',
  'is',
  'it',
  'this',
  'that',
]);
const TOKEN_SYNONYMS: Record<string, string[]> = {
  meme: ['funny', 'viral', 'template'],
  trend: ['trending', 'viral'],
  trending: ['trend', 'viral'],
  indian: ['india', 'bollywood', 'hindi', 'desi'],
  india: ['indian', 'bollywood', 'hindi', 'desi'],
  laugh: ['lol', 'lmao', 'rofl'],
  lol: ['laugh', 'lmao', 'rofl'],
  sad: ['cry', 'tears', 'sobbing'],
  cry: ['sad', 'tears', 'sobbing'],
  angry: ['mad', 'rage'],
  mad: ['angry', 'rage'],
  wow: ['omg', 'whoa'],
  omg: ['wow', 'whoa'],
  bruh: ['bruhh', 'bruhhh'],
  sus: ['sussy', 'imposter'],
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
    .filter((token) => token.length > 1 && !STOP_WORDS.has(token));
}

function buildQueryVariants(query: string): string[] {
  const normalizedQuery = sanitizeMemeTitle(query);
  const normalizedSpace = normalizeSpace(normalizedQuery);
  const tokens = tokenize(normalizedQuery);
  const hasIndianContext = INDIAN_HINTS.some((hint) => normalizedSpace.includes(hint));
  const variants = new Set<string>();
  const baseHints = ['meme', 'funny', 'viral', 'sound', 'audio', 'clip'];

  if (normalizedQuery) {
    variants.add(normalizedQuery);
  }

  baseHints.forEach((hint) => {
    variants.add(`${normalizedQuery} ${hint}`.trim());
  });
  variants.add(`trending ${normalizedQuery}`.trim());
  variants.add(`popular ${normalizedQuery}`.trim());

  if (hasIndianContext) {
    variants.add(`${normalizedQuery} indian`.trim());
  }

  tokens.forEach((token) => {
    const synonyms = TOKEN_SYNONYMS[token] || [];
    synonyms.slice(0, 2).forEach((synonym) => {
      const regex = new RegExp(`\\b${token}\\b`, 'gi');
      const replaced = normalizedQuery.replace(regex, synonym);
      if (replaced !== normalizedQuery) {
        variants.add(replaced);
        variants.add(`${replaced} meme`.trim());
      }
    });
  });

  return [...variants]
    .map((variant) => sanitizeMemeTitle(variant))
    .filter((variant) => variant.length >= 2)
    .slice(0, 8);
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

function buildInstantButtonsSearchUrl(query: string): string {
  const url = new URL('https://www.instantbuttons.com/search');
  url.searchParams.set('query', query);
  return url.toString();
}

function buildBlerpSearchUrl(query: string): string {
  const url = new URL('https://blerp.com/soundboard/search');
  url.searchParams.set('q', query);
  return url.toString();
}

function buildMemeSoundboardSearchUrl(query: string): string {
  const url = new URL('https://www.memesoundboard.com/search');
  url.searchParams.set('query', query);
  return url.toString();
}

function buildSoundboardGuySearchUrl(query: string): string {
  const url = new URL('https://www.soundboardguy.com/search');
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

async function searchHtmlProvider(
  searchUrl: string,
  provider: 'voicy' | 'soundboard101' | 'instantbuttons' | 'blerp' | 'memesoundboard' | 'soundboardguy'
) {
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
    if (!exactMatch && titleText.startsWith(queryText)) {
      score += SCORE_STARTS_WITH;
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
  const queryTokens = tokenize(query);
  const minScore = queryTokens.length ? Math.max(8, queryTokens.length * 5) : 0;

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
  const filtered = sorted.filter((result) => {
    const key = `${result.sourceUrl || ''}::${normalizeSpace(result.title || '')}`;
    return (scoreByKey.get(key) || 0) >= minScore;
  });
  const candidates = filtered.length >= 6 ? filtered : sorted;

  const providerCounts = new Map<string, number>();
  const mixed: MemeAudio[] = [];
  for (const result of candidates) {
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
    searchTasks.push(searchHtmlProvider(buildInstantButtonsSearchUrl(safeQuery), 'instantbuttons'));
    searchTasks.push(searchHtmlProvider(buildBlerpSearchUrl(safeQuery), 'blerp'));
    searchTasks.push(searchHtmlProvider(buildMemeSoundboardSearchUrl(safeQuery), 'memesoundboard'));
    searchTasks.push(searchHtmlProvider(buildSoundboardGuySearchUrl(safeQuery), 'soundboardguy'));

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
