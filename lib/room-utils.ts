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
  return String(Math.floor(Math.random() * 10000)).padStart(4, '0');
}

export function isValidRoomKey(key: string): boolean {
  return /^\d{4}$/.test(key.trim());
}

export function generateRoomName(): string {
  const theme = ROOM_THEMES[Math.floor(Math.random() * ROOM_THEMES.length)];
  const suffix = ROOM_SUFFIXES[Math.floor(Math.random() * ROOM_SUFFIXES.length)];
  return `${theme}${suffix}`;
}

export function generateRoom(): ChatRoom {
  return {
    key: generateRoomKey(),
    name: generateRoomName(),
  };
}
