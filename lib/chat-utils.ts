// Standard profanity list to keep the chat friendly and clean
const BAD_WORDS = [
  'fuck', 'shit', 'bitch', 'asshole', 'bastard', 'cunt', 'dick', 'pussy', 
  'nigger', 'faggot', 'kike', 'chink', 'retard', 'whore', 'slut', 'bastard',
  'cock', 'crap', 'motherfuck', 'motherfucker'
];

/**
 * Filter and replace bad words with cute spooky ghost characters.
 * Uses word boundaries \b to avoid censoring common innocent words (e.g. "association", "classic").
 */
export function filterBadWords(text: string): string {
  let filtered = text;
  for (const word of BAD_WORDS) {
    const regex = new RegExp(`\\b${word}\\b`, 'gi');
    filtered = filtered.replace(regex, (match) => {
      // Replace with spooky ghost characters of similar length, or a cute block
      return '👻'.repeat(Math.max(1, Math.min(3, match.length)));
    });
  }
  return filtered;
}

/**
 * Sanitize message text to prevent XSS, remove extreme spacing, and enforce limits.
 */
export function sanitizeMessage(text: string): string {
  if (!text) return '';
  
  // 1. Strip raw HTML elements
  let sanitized = text.replace(/<[^>]*>/g, '');

  // 2. Trim spacing
  sanitized = sanitized.trim();

  // 3. Prevent excessive blank lines (max 2 consecutive newlines)
  sanitized = sanitized.replace(/\n{3,}/g, '\n\n');

  // 4. Enforce max length of 200 characters
  if (sanitized.length > 200) {
    sanitized = sanitized.substring(0, 200);
  }

  return sanitized;
}

/**
 * Checks if a message pattern or metadata looks like spam.
 */
export function isSpam(text: string, nickname: string): boolean {
  // Check empty content
  if (!text.replace(/\s/g, '')) return true;

  // Check if someone runs a bot with excessive repeat characters
  const repeatCharPattern = /(.)\1{19,}/i; // 20+ repeating chars
  if (repeatCharPattern.test(text)) return true;

  // If a single message contains too many uppercase letters (shouting bot)
  const uppercaseCount = (text.match(/[A-Z]/g) || []).length;
  if (text.length > 50 && uppercaseCount / text.length > 0.85) {
    return true;
  }

  return false;
}
