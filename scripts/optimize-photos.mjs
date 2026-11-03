// Gera versões leves das fotos do cardápio. Rodar ao trocar fotos em public/produtos:
//   node scripts/optimize-photos.mjs
import { mkdirSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const dir = 'public/produtos';
const sizes = [{ folder: 'm', width: 720, quality: 62 }, { folder: 's', width: 240, quality: 60 }];
let before = 0;
let after = 0;
for (const { folder } of sizes) mkdirSync(path.join(dir, folder), { recursive: true });
for (const file of readdirSync(dir).filter((name) => /\.(jpe?g|png|webp)$/i.test(name))) {
  const source = path.join(dir, file);
  before += statSync(source).size;
  for (const { folder, width, quality } of sizes) {
    const target = path.join(dir, folder, `${path.parse(file).name}.webp`);
    await sharp(source).resize({ width, withoutEnlargement: true }).webp({ quality }).toFile(target);
    if (folder === 'm') after += statSync(target).size;
  }
}
await sharp('public/brand/logo-sabor-da-carne.webp').resize({ width: 288 }).webp({ quality: 80 }).toFile('public/brand/logo-sabor-da-carne-288.webp');
console.log(`originais ${Math.round(before / 1024)} KB -> tamanho m ${Math.round(after / 1024)} KB`);
