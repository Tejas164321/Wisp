const ADJECTIVES = [
  'Sassy',
  'Sneaky',
  'Chaotic',
  'Legendary',
  'Hyper',
  'Dramatic',
  'Cosmic',
  'Goofy',
  'Clever',
  'Noisy',
  'Epic',
  'Turbo',
  'Wholesome',
  'Spicy',
  'Mystic',
  'Nerdy',
];

const NOUNS = [
  'Skywalker',
  'Potter',
  'Stark',
  'Lannister',
  'Naruto',
  'Goku',
  'Pikachu',
  'Shrek',
  'SpongeBob',
  'Batman',
  'Joker',
  'Wednesday',
  'Eleven',
  'Barbie',
  'Kenobi',
  'Dumbledore',
  'Arya',
  'Thor',
  'Loki',
  'Deadpool',
];

export function generateNickname(): string {
  const adjIndex = Math.floor(Math.random() * ADJECTIVES.length);
  const nounIndex = Math.floor(Math.random() * NOUNS.length);
  const number = Math.floor(Math.random() * 90) + 10; // 10-99

  return `${ADJECTIVES[adjIndex]}${NOUNS[nounIndex]}${number}`;
}
