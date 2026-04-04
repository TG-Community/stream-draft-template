import { existsSync, readdirSync, writeFileSync } from 'node:fs';

const files = existsSync('versioned')
  ? readdirSync('versioned', { withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) => entry.name)
      .sort()
  : [];

writeFileSync('archive.json', JSON.stringify({ generatedAt: new Date().toISOString(), files }, null, 2));
console.log(`Wrote archive.json (${files.length} file${files.length === 1 ? '' : 's'})`);
