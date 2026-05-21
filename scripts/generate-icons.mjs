import sharp from 'sharp';
import { existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const publicDir = join(__dirname, '..', 'public');

if (!existsSync(publicDir)) mkdirSync(publicDir, { recursive: true });

const source = join(publicDir, 'icon-512.png');
const sizes = [72, 96, 128, 144, 152, 192, 384];

for (const size of sizes) {
  await sharp(source)
    .resize(size, size)
    .png()
    .toFile(join(publicDir, `icon-${size}.png`));
  console.log(`✓ icon-${size}.png`);
}

// Apple touch icon (180x180)
await sharp(source)
  .resize(180, 180)
  .png()
  .toFile(join(publicDir, 'apple-touch-icon.png'));
console.log('✓ apple-touch-icon.png');

// favicon 32x32
await sharp(source)
  .resize(32, 32)
  .png()
  .toFile(join(publicDir, 'favicon-32x32.png'));
console.log('✓ favicon-32x32.png');

// favicon 16x16
await sharp(source)
  .resize(16, 16)
  .png()
  .toFile(join(publicDir, 'favicon.png'));
console.log('✓ favicon.png');

console.log('\n✅ All icons generated!');
