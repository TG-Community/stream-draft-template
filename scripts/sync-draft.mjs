import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { findDraftFile } from './draft-file.mjs';

const extractScalar = (sourceMarkdown, key) => {
  const pattern = new RegExp(`^${key}:\\s*"?([^"\\n]+)"?\\s*$`, 'm');
  const match = sourceMarkdown.match(pattern);
  return match ? match[1].trim() : '';
};

const withValue = (value) => {
  const normalized = String(value || '').trim();
  return normalized ? normalized : undefined;
};

const draftFile = findDraftFile();
const sourceMarkdown = readFileSync(draftFile, 'utf8');
const docname = extractScalar(sourceMarkdown, 'docname');
const canonicalDocname = String(process.env.STREAM_CANONICAL_DOCNAME || docname || basename(draftFile, '.md')).trim();
const releaseTag = String(process.env.STREAM_RELEASE_TAG || process.env.GITHUB_REF_NAME || `${canonicalDocname}-00`).trim();
const releaseNumber = String(
  process.env.STREAM_RELEASE_NUMBER || (releaseTag.match(/-([0-9][0-9])$/)?.[1] ?? '00')
).trim();
const endpoint = String(process.env.STREAM_SYNC_ENDPOINT || 'https://api.tg.community/api/v1/drafts/sync').trim();
const githubActorLogin = String(process.env.STREAM_GITHUB_ACTOR || process.env.GITHUB_ACTOR || '').trim();

if (!githubActorLogin) {
  throw new Error('Missing GitHub actor identity. Set STREAM_GITHUB_ACTOR or run from GitHub Actions.');
}

const resolveAuthHeaders = async () => {
  const headers = {
    'content-type': 'application/json',
  };

  const requestUrl = String(process.env.ACTIONS_ID_TOKEN_REQUEST_URL || '').trim();
  const requestToken = String(process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN || '').trim();

  if (!requestUrl || !requestToken) {
    throw new Error(
      'GitHub OIDC request variables are missing. ' +
        'Run from GitHub Actions with id-token: write permission.',
    );
  }

  const audience = encodeURIComponent(String(process.env.STREAM_SYNC_OIDC_AUDIENCE || 'tg-stream-sync').trim());
  const separator = requestUrl.includes('?') ? '&' : '?';
  const oidcUrl = `${requestUrl}${separator}audience=${audience}`;
  const oidcResponse = await fetch(oidcUrl, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${requestToken}`,
    },
  });

  if (!oidcResponse.ok) {
    const body = await oidcResponse.text();
    throw new Error(`Unable to mint GitHub OIDC token (${oidcResponse.status}): ${body}`);
  }

  const oidcPayload = await oidcResponse.json();
  const jwt = String(oidcPayload?.value || '').trim();

  if (!jwt) {
    throw new Error('GitHub OIDC response did not include a token value.');
  }

  headers.authorization = `Bearer ${jwt}`;
  return headers;
};

const formatUrls = {
  html: withValue(process.env.STREAM_HTML_URL),
  txt: withValue(process.env.STREAM_TXT_URL),
  pdf: withValue(process.env.STREAM_PDF_URL),
};

for (const [key, value] of Object.entries(formatUrls)) {
  if (!value) delete formatUrls[key];
}

const payload = {
  draftId: releaseTag,
  githubActorLogin,
  canonicalDocname,
  releaseTag,
  releaseNumber,
  publishedAt: new Date().toISOString(),
  sourceMarkdown,
  status: String(process.env.STREAM_DRAFT_STATUS || 'Draft').trim(),
  ...(withValue(process.env.STREAM_SOURCE_REPOSITORY) ? { sourceRepository: withValue(process.env.STREAM_SOURCE_REPOSITORY) } : {}),
  ...(Object.keys(formatUrls).length > 0 ? { formatUrls } : {}),
};

const headers = await resolveAuthHeaders();
const response = await fetch(endpoint, {
  method: 'POST',
  headers,
  body: JSON.stringify(payload),
});

if (!response.ok) {
  const body = await response.text();
  throw new Error(`Sync failed (${response.status}): ${body}`);
}

const result = await response.json();
console.log(`Synced draft ${result?.data?.draftId || releaseTag}`);
