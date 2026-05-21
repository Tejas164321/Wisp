const ADJECTIVES = [
  'Ghost',
  'Silent',
  'Void',
  'Neon',
  'Midnight',
  'Shadow',
  'Cryptic',
  'Phantom',
  'Hazy',
  'Mystic',
  'Astral',
  'Cloaked',
  'Elusive',
  'Spectral',
  'Dark',
  'Pale',
  'Eerie',
  'Lurking',
  'Shrouded',
  'Obscure',
  'Static',
  'Echoing',
  'Cursed',
  'Haunted',
  'Drifting'
];

const NOUNS = [
  'Tiger',
  'Crow',
  'Wolf',
  'Fox',
  'Echo',
  'Spectre',
  'Phantom',
  'Wraith',
  'Spirit',
  'Golem',
  'Raven',
  'Banshee',
  'Goblin',
  'Shade',
  'Viper',
  'Lynx',
  'Falcon',
  'Leopard',
  'Owl',
  'Cobra',
  'Panther',
  'Gargoyle',
  'Reaper',
  'Spectator'
];

export function generateNickname(): string {
  const adjIndex = Math.floor(Math.random() * ADJECTIVES.length);
  const nounIndex = Math.floor(Math.random() * NOUNS.length);
  const number = Math.floor(Math.random() * 90) + 10; // 10-99

  return `${ADJECTIVES[adjIndex]}${NOUNS[nounIndex]}${number}`;
}
