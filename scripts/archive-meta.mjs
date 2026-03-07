import { readdirSync, writeFileSync } from 'node:fs';

const files = readdirSync('versioned', { withFileTypes: true })
  .filter((entry) => entry.isFile())
  .map((entry) => entry.name)
  .sort();

writeFileSync('archive.json', JSON.stringify({ generatedAt: new Date().toISOString(), files }, null, 2));
console.log('Wrote archive.json');
