const ADJECTIVES = [
  'Sleazy',
  'Naughty',
  'Crusty',
  'Sketchy',
  'Thirsty',
  'Sloppy',
  'Greasy',
  'Filthy',
  'Salty',
  'Grumpy',
  'Shady',
  'Spicy',
  'Saucy',
  'Tipsy',
  'Cranky',
  'Rowdy',
  'Trashy',
  'Cheeky',
  'Sneaky',
  'Psycho',
  'Wasted',
  'Drunk',
  'Cocky',
  'Sassy',
  'Moody',
];

const NOUNS = [
  'Goblin',
  'Gremlin',
  'Troll',
  'Creep',
  'Menace',
  'Degen',
  'Rascal',
  'Weenie',
  'Muppet',
  'Freak',
  'Weasel',
  'Bastard',
  'Pervert',
  'Karen',
  'Bozo',
  'Chump',
  'Dingus',
  'Goofball',
  'Slacker',
  'Wacko',
  'Joker',
  'Goon',
  'Slob',
  'Miser',
];

export function generateNickname(): string {
  const adjIndex = Math.floor(Math.random() * ADJECTIVES.length);
  const nounIndex = Math.floor(Math.random() * NOUNS.length);

  return `${ADJECTIVES[adjIndex]}${NOUNS[nounIndex]}`;
}
