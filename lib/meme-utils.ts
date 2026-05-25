import type { MemeAudio, MemeAudioProvider } from './message-types';

const ALLOWED_MEME_AUDIO_HOSTS = ['myinstants.com'];
const ALLOWED_MEME_PROVIDERS: MemeAudioProvider[] = ['myinstants'];
const MAX_TITLE_LENGTH = 80;
const MAX_URL_LENGTH = 512;

export function sanitizeMemeTitle(title: string): string {
  const trimmed = (title || '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
  return trimmed.slice(0, MAX_TITLE_LENGTH);
}

export function isAllowedMemeAudioUrl(rawUrl?: string): boolean {
  if (!rawUrl || rawUrl.length > MAX_URL_LENGTH) return false;
  try {
    const url = new URL(rawUrl);
    if (url.protocol !== 'https:') return false;
    return ALLOWED_MEME_AUDIO_HOSTS.some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`));
  } catch {
    return false;
  }
}

export function isAllowedMemeProvider(provider?: string): provider is MemeAudioProvider {
  return !!provider && ALLOWED_MEME_PROVIDERS.includes(provider as MemeAudioProvider);
}

export function sanitizeMemeAudioPayload(payload: Partial<MemeAudio> | undefined): MemeAudio | null {
  if (!payload) return null;
  if (!payload.provider || !isAllowedMemeProvider(payload.provider)) return null;

  const title = sanitizeMemeTitle(payload.title || '');
  const sourceUrl = payload.sourceUrl?.trim();
  const previewUrl = payload.previewUrl?.trim();
  const imageUrl = payload.imageUrl?.trim();
  const pageUrl = payload.pageUrl?.trim();

  if (!title || !sourceUrl || !isAllowedMemeAudioUrl(sourceUrl)) return null;
  if (previewUrl && !isAllowedMemeAudioUrl(previewUrl)) return null;
  if (imageUrl && !isAllowedMemeAudioUrl(imageUrl)) return null;
  if (pageUrl && (!isAllowedMemeAudioUrl(pageUrl) || pageUrl.length > MAX_URL_LENGTH)) return null;

  const rawId = payload.id || sourceUrl || title;

  return {
    id: rawId.toString().slice(0, 80),
    title,
    provider: payload.provider,
    sourceUrl,
    previewUrl,
    duration: typeof payload.duration === 'number' ? Math.max(0, Math.min(payload.duration, 600000)) : undefined,
    imageUrl,
    pageUrl,
  };
}

export function getMemeAudioPreviewLabel(memeAudio?: MemeAudio): string {
  if (!memeAudio) return '🔊 Meme sound';
  return `🔊 ${memeAudio.title}`;
}
