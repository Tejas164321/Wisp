export type MessageType = 'text' | 'meme_audio';

export type MemeAudioProvider =
  | 'myinstants'
  | 'voicy'
  | 'soundboard101'
  | 'instantbuttons'
  | 'blerp'
  | 'memesoundboard'
  | 'soundboardguy';

export interface MemeAudio {
  id: string;
  title: string;
  provider: MemeAudioProvider;
  sourceUrl: string;
  previewUrl?: string;
  duration?: number;
  imageUrl?: string;
  pageUrl?: string;
}

export interface Message {
  id: string;
  nickname: string;
  text: string;
  createdAt: number;
  roomKey?: string;
  replyToId?: string;
  replyToNickname?: string;
  replyToText?: string;
  type?: MessageType;
  memeAudio?: MemeAudio;
}

export interface ChatRoom {
  key: string;
  name: string;
}
