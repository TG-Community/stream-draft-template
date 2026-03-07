import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { basename } from 'node:path';
import { findDraftFile } from './draft-file.mjs';

const draftFile = findDraftFile();
const releaseNumber = process.env.RELEASE_NUMBER || '00';
const base = basename(draftFile, '.md');

mkdirSync('versioned', { recursive: true });

for (const ext of ['html', 'txt']) {
  const sourcePath = `dist/${base}.${ext}`;
  if (!existsSync(sourcePath)) {
    throw new Error(`Missing build artifact: ${sourcePath}. Run the build first.`);
  }
  copyFileSync(sourcePath, `versioned/${base}-${releaseNumber}.${ext}`);
}

console.log(`Released versioned/${base}-${releaseNumber}.html and .txt`);
