import type { MemeAudio, MemeAudioProvider } from './message-types';

const PROVIDER_URL_RULES: Record<
  MemeAudioProvider,
  { hosts: string[]; pathPrefixes?: string[]; requiredExt?: string[] }
> = {
  myinstants: {
    hosts: ['myinstants.com'],
    pathPrefixes: ['/media/sounds/'],
  },
  voicy: {
    hosts: ['voicy.network', 'cdn.voicy.network', 'media.voicy.network'],
    requiredExt: ['.mp3', '.ogg', '.wav', '.m4a'],
  },
  soundboard101: {
    hosts: ['101soundboards.com', 'cdn.101soundboards.com', 'static.101soundboards.com'],
    requiredExt: ['.mp3', '.ogg', '.wav', '.m4a'],
  },
};
const ALLOWED_MEME_PROVIDERS: MemeAudioProvider[] = ['myinstants', 'voicy', 'soundboard101'];
const MAX_TITLE_LENGTH = 80;
const MAX_URL_LENGTH = 512;
const MAX_DURATION_MS = 600000;

export function sanitizeMemeTitle(title: string): string {
  const trimmed = (title || '').replace(/[<>]/g, '').replace(/\s+/g, ' ').trim();
  return trimmed.slice(0, MAX_TITLE_LENGTH);
}

export function isAllowedMemeAudioUrl(rawUrl?: string): boolean {
  if (!rawUrl || rawUrl.length > MAX_URL_LENGTH) return false;
  try {
    const url = new URL(rawUrl);
    if (url.protocol !== 'https:') return false;
    return Object.values(PROVIDER_URL_RULES).some((rule) =>
      rule.hosts.some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`))
    );
  } catch {
    return false;
  }
}

export function isAllowedMemeAudioFileUrl(rawUrl?: string, provider?: MemeAudioProvider): boolean {
  if (!isAllowedMemeAudioUrl(rawUrl)) return false;
  try {
    const url = new URL(rawUrl as string);
    if (!provider) {
      return Object.values(PROVIDER_URL_RULES).some((rule) => {
        const hostAllowed = rule.hosts.some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`));
        if (!hostAllowed) return false;
        if (rule.pathPrefixes?.length) {
          return rule.pathPrefixes.some((prefix) => url.pathname.startsWith(prefix));
        }
        if (rule.requiredExt?.length) {
          const normalizedPath = url.pathname.toLowerCase();
          return rule.requiredExt.some((ext) => normalizedPath.endsWith(ext));
        }
        return false;
      });
    }

    const rule = PROVIDER_URL_RULES[provider];
    const hostAllowed = rule.hosts.some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`));
    if (!hostAllowed) return false;

    if (rule.pathPrefixes?.length) {
      return rule.pathPrefixes.some((prefix) => url.pathname.startsWith(prefix));
    }

    if (rule.requiredExt?.length) {
      const normalizedPath = url.pathname.toLowerCase();
      return rule.requiredExt.some((ext) => normalizedPath.endsWith(ext));
    }

    return false;
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
  const provider = payload.provider;

  const title = sanitizeMemeTitle(payload.title || '');
  const sourceUrl = payload.sourceUrl?.trim();
  const previewUrl = payload.previewUrl?.trim();
  const imageUrl = payload.imageUrl?.trim();
  const pageUrl = payload.pageUrl?.trim();

  if (!title || !sourceUrl || !isAllowedMemeAudioFileUrl(sourceUrl, provider)) return null;
  if (previewUrl && !isAllowedMemeAudioFileUrl(previewUrl, provider)) return null;
  if (imageUrl && !isAllowedMemeAudioUrl(imageUrl)) return null;
  if (pageUrl && (!isAllowedMemeAudioUrl(pageUrl) || pageUrl.length > MAX_URL_LENGTH)) return null;

  const rawId = payload.id || sourceUrl || title;

  return {
    id: rawId.toString().slice(0, 80),
    title,
    provider,
    sourceUrl,
    previewUrl,
    duration: typeof payload.duration === 'number' ? Math.max(0, Math.min(payload.duration, MAX_DURATION_MS)) : undefined,
    imageUrl,
    pageUrl,
  };
}

export function getMemeAudioPreviewLabel(memeAudio?: MemeAudio): string {
  if (!memeAudio) return '🔊 Meme sound';
  return `🔊 ${memeAudio.title}`;
}
