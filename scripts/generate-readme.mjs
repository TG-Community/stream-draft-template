import { readFileSync, writeFileSync } from 'node:fs';
import { basename } from 'node:path';
import { findDraftFile } from './draft-file.mjs';

const draftFile = findDraftFile({ allowTemplate: false, allowMissing: true });

if (!draftFile) {
  console.log('No renamed draft file found. Skipping README generation.');
  process.exit(0);
}

const source = readFileSync(draftFile, 'utf8');
const titleMatch = source.match(/^title:\s*"([^"]+)"/m);
const docnameMatch = source.match(/^docname:\s*"?(.*?)"?\s*$/m);
const title = titleMatch?.[1]?.trim() || basename(draftFile, '.md');
const fileBase = basename(draftFile, '.md');
const docname = docnameMatch?.[1]?.trim() || fileBase;
const repository = process.env.GITHUB_REPOSITORY || '';
const [owner = 'OWNER', repo = 'REPO'] = repository.split('/');
const editorCopyUrl = `https://${owner}.github.io/${repo}/`;
const streamRecordUrl = `https://stream.tg.community/doc/${docname}`;
const latestReleaseUrl = `https://github.com/${owner}/${repo}/releases/latest`;
const authoringGuidelinesUrl = "https://tg.community/authors/stream-draft/content-guidelines";
const firstReleaseTag = `${docname}-00`;
const nextReleaseTag = `${docname}-01`;

const readme = `# ${title}\n\n> [!TIP]\n> This repository is the working area for The Gathering Stream draft, "${title}".\n\n## Quick links\n\n- [Editor's Copy](${editorCopyUrl})\n- [Stream Draft Record](${streamRecordUrl})\n- [Latest Release](${latestReleaseUrl})\n- [Stream Draft Content Guidelines](${authoringGuidelinesUrl})\n\n## How to publish your draft on Stream\n\n> [!IMPORTANT]\n> Make sure your GitHub account is connected to your Stream account in [Profile Settings](https://stream.tg.community/profile).\n\n1. Commit your draft updates to the \`main\` branch.\n2. Open the repository on GitHub and go to **Releases**.\n3. Click **Draft a new release**.\n4. In **Tag**, create a release tag for this publication.\n   Use \`${firstReleaseTag}\` for the first published version.\n   Use \`${nextReleaseTag}\`, \`${docname}-02\`, and so on for later versions.\n5. Keep the release target set to \`main\`.\n6. Set the release title. Using the same value as the tag is recommended.\n7. Click **Publish release**.\n8. Wait for the GitHub Actions release workflow to finish.\n   That workflow publishes the editor's copy, creates the versioned artifacts, and syncs the draft to Stream.\n\n## Contributing\n\nSee [CONTRIBUTING.md](./CONTRIBUTING.md) for contribution guidance.\n\n## Local build\n\nBuild the editor's copy and text output with:\n\n\`\`\`bash\nnpm install\nnpm run build\n\`\`\`\n`;

writeFileSync('README.md', readme);
console.log(`Updated README.md for ${draftFile}`);
