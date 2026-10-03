import { cp, mkdir, readFile, rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const output = resolve(root, 'dist/tabtastic');
const archive = resolve(root, 'dist/tabtastic.zip');
const files = [
  'manifest.json',
  'index.html',
  'styles.css',
  'app.js',
  'background.js',
  'lib/model.js',
  'lib/browser.js',
  'lib/demo.js',
  'lib/window-layout.js',
  'assets/mark.svg',
  ...[16, 32, 48, 128].map((size) => `assets/icon-${size}.png`),
];

// Check every input before replacing the previous generated bundle.
await Promise.all(files.map((file) => readFile(resolve(root, file))));
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
for (const file of files) {
  await cp(resolve(root, file), resolve(output, file), { recursive: true });
}
await rm(archive, { force: true });
try {
  // macOS and Linux provide zip. The unpacked folder works without it, too.
  execFileSync('zip', ['-q', '-r', archive, '.'], { cwd: output });
  console.log(`Archive: ${archive}`);
} catch (error) {
  if (error.code !== 'ENOENT') {
    throw error;
  }
  console.warn('The zip command is unavailable; use the unpacked folder below.');
}
console.log(`Load unpacked in Chrome: ${output}`);
