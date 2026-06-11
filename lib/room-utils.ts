import type { ChatRoom } from './message-types';

const ROOM_THEMES = [
  'Hogwarts',
  'Westeros',
  'Pandora',
  'Shire',
  'Atlantis',
  'Asgard',
  'Tatooine',
  'Narnia',
  'Springfield',
  'BikiniBottom',
  'StrangerThings',
  'PeakyBlinders',
  'Gotham',
  'Konoha',
  'Elbaf',
  'Namek',
  'Pawnee',
  'MonstersInc',
];

const ROOM_SUFFIXES = [
  'Club',
  'Squad',
  'Lounge',
  'Verse',
  'Arena',
  'Hideout',
  'Council',
  'Chronicles',
];

export function generateRoomKey(): string {
  return String(secureRandomInt(10000)).padStart(4, '0');
}

export function isValidRoomKey(key: string): boolean {
  return /^\d{4}$/.test(key.trim());
}

export function generateRoomName(): string {
  const theme = ROOM_THEMES[secureRandomInt(ROOM_THEMES.length)];
  const suffix = ROOM_SUFFIXES[secureRandomInt(ROOM_SUFFIXES.length)];
  return `${theme}${suffix}`;
}

export function generateRoom(customName?: string): ChatRoom {
  return {
    key: generateRoomKey(),
    name: customName?.trim() || generateRoomName(),
  };
}

function secureRandomInt(max: number): number {
  if (max <= 0) return 0;
  const cryptoObj = globalThis.crypto;
  if (cryptoObj?.getRandomValues) {
    const randomBuffer = new Uint32Array(1);
    cryptoObj.getRandomValues(randomBuffer);
    return randomBuffer[0] % max;
  }
  return Math.floor(Math.random() * max);
}
