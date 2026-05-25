import { NextResponse } from 'next/server';

const STREAM_RATE_LIMIT = new Map<string, { count: number; resetAt: number }>();
const STREAM_WINDOW_MS = 30_000;
const STREAM_MAX = 20;
const ALLOWED_STREAM_HOSTS = ['myinstants.com'];

function getClientKey(request: Request) {
  const forwardedFor = request.headers.get('x-forwarded-for');
  const realIp = request.headers.get('x-real-ip');
  return (forwardedFor?.split(',')[0] || realIp || 'unknown').trim();
}

function isRateLimited(key: string) {
  const now = Date.now();
  const existing = STREAM_RATE_LIMIT.get(key);
  if (!existing || existing.resetAt <= now) {
    STREAM_RATE_LIMIT.set(key, { count: 1, resetAt: now + STREAM_WINDOW_MS });
    return false;
  }
  existing.count += 1;
  return existing.count > STREAM_MAX;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const sourceUrl = searchParams.get('url') || '';

  if (!sourceUrl || sourceUrl.length > 512) {
    return NextResponse.json({ error: 'Unsupported audio URL.' }, { status: 400 });
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(sourceUrl);
  } catch {
    return NextResponse.json({ error: 'Unsupported audio URL.' }, { status: 400 });
  }

  const allowedHost = ALLOWED_STREAM_HOSTS.some(
    (host) => parsedUrl.hostname === host || parsedUrl.hostname.endsWith(`.${host}`)
  );
  if (!allowedHost || parsedUrl.protocol !== 'https:') {
    return NextResponse.json({ error: 'Unsupported audio URL.' }, { status: 400 });
  }

  const key = getClientKey(request);
  if (isRateLimited(key)) {
    return NextResponse.json({ error: 'Audio rate limit reached.' }, { status: 429 });
  }

  try {
    const rangeHeader = request.headers.get('range');
    const upstream = await fetch(parsedUrl.toString(), {
      headers: rangeHeader ? { range: rangeHeader } : undefined,
    });

    if (!(upstream.ok || upstream.status === 206)) {
      return NextResponse.json({ error: 'Unable to fetch audio.' }, { status: 502 });
    }

    const headers = new Headers();
    const passthroughHeaders = ['content-type', 'content-length', 'accept-ranges', 'content-range'];
    passthroughHeaders.forEach((header) => {
      const value = upstream.headers.get(header);
      if (value) headers.set(header, value);
    });
    headers.set('cache-control', 'public, max-age=3600');

    return new Response(upstream.body, {
      status: upstream.status,
      headers,
    });
  } catch (err) {
    console.error('Meme audio proxy failed:', err);
    return NextResponse.json({ error: 'Audio proxy failed.' }, { status: 502 });
  }
}
