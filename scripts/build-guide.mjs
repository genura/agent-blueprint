// guide/FLOW_GUIDE.mjs uretir: scripts/flow-check.ts + src/flow/format.ts -> tek dosya, bagimliliksiz, kucuk.
// Kullanim: npm run build:guide   (vite-plugin-flow, format.ts degisince bunu kendisi de calistirir)
import { build } from 'rolldown';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const BANNER = [
  '// FLOW_GUIDE.mjs - validator for .flow files (part of FLOW_GUIDE). DO NOT READ THIS FILE, RUN IT:',
  '//   node FLOW_GUIDE.mjs <file.flow> [more.flow ...]',
  '// It only reads the given files: it writes nothing and uses no network. Exit code 1 = errors found.',
  '',
].join('\n');

export async function buildGuideCheck() {
  const out = path.join(root, 'guide', 'FLOW_GUIDE.mjs');
  await build({
    input: path.join(root, 'scripts/flow-check.ts'),
    platform: 'node',
    logLevel: 'silent',
    treeshake: { moduleSideEffects: false },
    output: { file: out, format: 'esm', minify: true },
  });
  // Kucultme yorumlari siler; uyari satirlarini sonradan basa ekle
  fs.writeFileSync(out, BANNER + fs.readFileSync(out, 'utf8'));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await buildGuideCheck();
