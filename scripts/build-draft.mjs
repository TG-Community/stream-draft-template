import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename } from 'node:path';
import { findDraftFile } from './draft-file.mjs';

const escapeHtml = (value) =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');

const stripQuotes = (value) => {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
};

const linkify = (value) =>
  escapeHtml(value).replace(
    /https?:\/\/[^\s<]+/g,
    (url) => `<a href="${url}" target="_blank" rel="noreferrer">${url}</a>`,
  );

const parseFrontMatter = (input) => {
  const lines = input.split('\n');
  if (lines[0] !== '---') {
    return { frontMatter: '', body: input };
  }

  let endIndex = -1;
  let keepDelimiterLine = false;
  for (let index = 1; index < lines.length; index += 1) {
    if (lines[index] === '---') {
      endIndex = index;
      break;
    }
    if (/^---\s+(abstract|middle|back)\s*$/.test(lines[index])) {
      endIndex = index;
      keepDelimiterLine = true;
      break;
    }
  }

  if (endIndex === -1) {
    return { frontMatter: '', body: input };
  }

  return {
    frontMatter: lines.slice(1, endIndex).join('\n'),
    body: lines.slice(keepDelimiterLine ? endIndex : endIndex + 1).join('\n').replace(/^\n+/, ''),
  };
};

const getScalar = (frontMatter, key) => {
  const match = frontMatter.match(new RegExp(`^${key}:\\s*(.+)$`, 'm'));
  return match ? stripQuotes(match[1]) : '';
};

const parseAuthors = (frontMatter) => {
  const authors = [];
  const lines = frontMatter.split('\n');
  let index = 0;

  while (index < lines.length) {
    if (!/^author:\s*$/.test(lines[index])) {
      index += 1;
      continue;
    }

    index += 1;

    while (index < lines.length) {
      const line = lines[index];
      if (/^\S/.test(line)) break;

      if (!/^  -\s*$/.test(line)) {
        index += 1;
        continue;
      }

      const author = {
        fullname: '',
        organization: '',
        email: '',
        address: '',
      };

      index += 1;

      while (index < lines.length) {
        const detailLine = lines[index];
        if (/^\S/.test(detailLine) || /^  -\s*$/.test(detailLine)) break;

        const fullnameMatch = detailLine.match(/^    fullname:\s*(.+)$/);
        const organizationMatch = detailLine.match(/^    organization:\s*(.+)$/);
        const emailMatch = detailLine.match(/^    email:\s*(.+)$/);
        const addressMatch = detailLine.match(/^    address:\s*(.+)$/);

        if (fullnameMatch) {
          author.fullname = stripQuotes(fullnameMatch[1]);
        } else if (organizationMatch) {
          author.organization = stripQuotes(organizationMatch[1]);
        } else if (emailMatch) {
          author.email = stripQuotes(emailMatch[1]);
        } else if (addressMatch) {
          author.address = stripQuotes(addressMatch[1]);
        }

        index += 1;
      }

      authors.push(author);
    }
  }

  return authors;
};

const parseReferenceSections = (frontMatter) => {
  const sections = {
    normative: [],
    informative: [],
  };
  const lines = frontMatter.split('\n');
  let index = 0;

  while (index < lines.length) {
    const sectionMatch = lines[index].match(/^(normative|informative):\s*$/);
    if (!sectionMatch) {
      index += 1;
      continue;
    }

    const sectionName = sectionMatch[1];
    index += 1;

    while (index < lines.length) {
      const line = lines[index];
      if (/^\S/.test(line)) break;

      const refMatch = line.match(/^  ([^:\s][^:]*):\s*$/);
      if (!refMatch) {
        index += 1;
        continue;
      }

      const reference = {
        id: refMatch[1].trim(),
        title: '',
        date: '',
        target: '',
        organizations: [],
      };

      index += 1;

      while (index < lines.length) {
        const detailLine = lines[index];
        if (/^\S/.test(detailLine) || /^  [^:\s][^:]*:\s*$/.test(detailLine)) break;

        const titleMatch = detailLine.match(/^    title:\s*(.+)$/);
        const dateMatch = detailLine.match(/^    date:\s*(.+)$/);
        const targetMatch = detailLine.match(/^    target:\s*(.+)$/);
        const orgMatch = detailLine.match(/^        organization:\s*(.+)$/);

        if (titleMatch) {
          reference.title = stripQuotes(titleMatch[1]);
        } else if (dateMatch) {
          reference.date = stripQuotes(dateMatch[1]);
        } else if (targetMatch) {
          reference.target = stripQuotes(targetMatch[1]);
        } else if (orgMatch) {
          reference.organizations.push(stripQuotes(orgMatch[1]));
        }

        index += 1;
      }

      sections[sectionName].push(reference);
    }
  }

  return sections;
};

const slugify = (value) =>
  value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-');

const formatShortAuthor = (name) => {
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return name;
  const surname = parts.at(-1);
  const initials = parts
    .slice(0, -1)
    .map((part) => `${part[0]}.`)
    .join(' ');
  return `${initials} ${surname}`;
};

const renderDocumentHeader = (metadata) => {
  const rows = [
    ['Stream Draft', metadata.docname],
    ['Published', metadata.date],
    ['Author', metadata.shortAuthor],
    ['Organization', metadata.primaryOrganization],
  ].filter(([, value]) => Boolean(value));

  return [
    '<header class="doc-header">',
    '  <dl class="doc-meta">',
    ...rows.map(
      ([label, value]) =>
        `    <div class="doc-meta-row"><dt>${escapeHtml(label)}:</dt><dd>${escapeHtml(value)}</dd></div>`,
    ),
    '  </dl>',
    `  <h1 class="doc-title">${escapeHtml(metadata.title)}</h1>`,
    `  ${metadata.abbrev ? `<p class="doc-subtitle">${escapeHtml(metadata.abbrev)}</p>` : ''}`,
    '</header>',
  ].join('\n');
};

const renderToc = (entries) => {
  if (entries.length === 0) return '';

  return [
    '<aside class="toc-panel">',
    '  <h2 class="toc-title">Table of Contents</h2>',
    '  <ol class="toc-list">',
    ...entries.map(
      (entry) =>
        `    <li class="toc-item toc-level-${entry.depth}"><a href="#${entry.id}">${escapeHtml(entry.label)}</a></li>`,
    ),
    '  </ol>',
    '</aside>',
  ].join('\n');
};

const hasRenderableReference = (reference) =>
  Boolean(reference.title || reference.date || reference.target || reference.organizations.length > 0);

const formatReferenceLabel = (value) => {
  const compact = value.replace(/\s+/g, '');
  return compact.startsWith('[') && compact.endsWith(']') ? compact : `[${compact}]`;
};

const parseReferenceItem = (item) => {
  const bracketMatch = item.match(/^\[([^\]]+)\]\s+(.*)$/);
  if (bracketMatch) {
    return {
      label: formatReferenceLabel(bracketMatch[1]),
      content: bracketMatch[2].trim(),
    };
  }

  const colonMatch = item.match(/^([^:]+):\s*(.*)$/);
  if (colonMatch) {
    return {
      label: formatReferenceLabel(colonMatch[1].trim()),
      content: colonMatch[2].trim(),
    };
  }

  return {
    label: '',
    content: item,
  };
};

const renderReferenceList = (items) => {
  const entries = items.map(parseReferenceItem);
  return [
    '<div class="ref-list">',
    ...entries.map((entry) => {
      const labelCell = entry.label
        ? `<div class="ref-label">${escapeHtml(entry.label)}</div>`
        : '<div class="ref-label"></div>';
      return `  <div class="ref-entry">${labelCell}<div class="ref-text">${linkify(entry.content)}</div></div>`;
    }),
    '</div>',
  ].join('\n');
};

const renderGeneratedReferenceEntries = (references) => {
  if (references.length === 0) {
    return '';
  }

  return [
    '<div class="ref-list">',
    ...references.map((reference) => {
      const parts = [];
      if (reference.organizations.length > 0) {
        parts.push(reference.organizations.join(', '));
      }
      if (reference.title) {
        parts.push(reference.title);
      }
      if (reference.date) {
        parts.push(reference.date);
      }

      let content = parts.join(', ');
      if (reference.target) {
        content = `${content}${content ? ', ' : ''}${reference.target}`;
      }
      if (!content) {
        content = 'Reference metadata not provided.';
      }

      return `  <div class="ref-entry"><div class="ref-label">${escapeHtml(formatReferenceLabel(reference.id))}</div><div class="ref-text">${linkify(content)}</div></div>`;
    }),
    '</div>',
  ].join('\n');
};

const renderGeneratedReferences = (references, topLevelCount) => {
  const referenceNumber = topLevelCount + 1;
  const baseId = `${referenceNumber}-references`;
  const normativeId = `${referenceNumber}1-normative-references`;
  const informativeId = `${referenceNumber}2-informative-references`;
  const normativeReferences = references.normative.filter(hasRenderableReference);
  const informativeReferences = references.informative.filter(hasRenderableReference);

  const normativeHtml =
    normativeReferences.length > 0
      ? renderGeneratedReferenceEntries(normativeReferences)
      : '<p>This document has no normative references.</p>';
  const informativeHtml =
    informativeReferences.length > 0
      ? renderGeneratedReferenceEntries(informativeReferences)
      : '<p>This document has no informative references.</p>';

  return {
    html: [
      '<section class="generated-references">',
      `  <h2 id="${baseId}">${referenceNumber}. References</h2>`,
      `  <h3 id="${normativeId}">${referenceNumber}.1. Normative References</h3>`,
      `  ${normativeHtml}`,
      `  <h3 id="${informativeId}">${referenceNumber}.2. Informative References</h3>`,
      `  ${informativeHtml}`,
      '</section>',
    ].join('\n'),
    toc: [
      {
        depth: 1,
        id: baseId,
        label: `${referenceNumber}. References`,
      },
      {
        depth: 2,
        id: normativeId,
        label: `${referenceNumber}.1. Normative References`,
      },
      {
        depth: 2,
        id: informativeId,
        label: `${referenceNumber}.2. Informative References`,
      },
    ],
  };
};

const renderGeneratedAuthors = (authors) => {
  if (authors.length === 0) {
    return {
      html: '',
      toc: [],
    };
  }

  const id = 'authors-address';

  return {
    html: [
      '<section class="generated-authors">',
      `  <h2 id="${id}">Author&apos;s Address</h2>`,
      ...authors.map((author) => {
        const lines = [
          author.fullname,
          author.organization,
          author.email ? `Email: ${author.email}` : '',
          author.address,
        ]
          .filter(Boolean)
          .map((line) => linkify(line));
        return `  <address class="author-address">${lines.join('<br>')}</address>`;
      }),
      '</section>',
    ].join('\n'),
    toc: [
      {
        depth: 1,
        id,
        label: "Author's Address",
      },
    ],
  };
};

const renderBoilerplate = (metadata) => {
  const year = metadata.date ? metadata.date.slice(0, 4) : String(new Date().getUTCFullYear());

  return [
    '<section class="boilerplate">',
    '  <h2>Status of This Memo</h2>',
    '  <p>This page is a rendered build of the current The Gathering draft source. Final publication status and normative effect are determined by The Gathering process.</p>',
    '  <h2>Copyright Notice</h2>',
    `  <p>Copyright (c) ${escapeHtml(year)} The Gathering and the persons identified as the document authors. All rights reserved.</p>`,
    '  <p>This rendered output is subject to The Gathering legal and policy terms in effect on the date of publication: <a href="https://gathering.foundation/privacy-and-policies" target="_blank" rel="noreferrer">https://gathering.foundation/privacy-and-policies</a></p>',
    '</section>',
  ].join('\n');
};

const renderMarkdown = (body) => {
  const lines = body.split('\n');
  const html = [];
  const tocMiddle = [];
  const tocBack = [];
  let paragraphLines = [];
  let listItems = [];
  let currentSection = null;
  let currentHeading = '';
  const sectionCounters = [0, 0, 0, 0, 0, 0];
  const headingIdCounts = new Map();

  const flushParagraph = () => {
    if (paragraphLines.length === 0) return;
    const joined = paragraphLines.join(' ');
    html.push(`<p>${linkify(joined)}</p>`);
    paragraphLines = [];
  };

  const flushList = () => {
    if (listItems.length === 0) return;
    if (currentHeading.toLowerCase().includes('references')) {
      html.push(renderReferenceList(listItems));
      listItems = [];
      return;
    }
    html.push('<ul>');
    for (const item of listItems) {
      html.push(`  <li>${linkify(item)}</li>`);
    }
    html.push('</ul>');
    listItems = [];
  };

  const closeSection = () => {
    flushParagraph();
    flushList();
    if (currentSection) {
      html.push('</section>');
      currentSection = null;
    }
  };

  const openSection = (name) => {
    closeSection();
    currentSection = name;
    html.push(`<section class="${name}">`);
    if (name === 'abstract') {
      html.push('<h2>Abstract</h2>');
    }
  };

  for (const rawLine of lines) {
    const line = rawLine.replace(/\r$/, '');
    const markerMatch = line.match(/^---\s+(abstract|middle|back)\s*$/);
    if (markerMatch) {
      openSection(markerMatch[1]);
      if (markerMatch[1] !== 'back') {
        currentHeading = '';
      }
      continue;
    }

    const headingMatch = line.match(/^(#{1,6})\s+(.*)$/);
    if (headingMatch) {
      flushParagraph();
      flushList();
      currentHeading = headingMatch[2].trim();
      const depth = headingMatch[1].length;
      const level = Math.min(6, depth + 1);
      let label = currentHeading;
      let headingText = currentHeading;

      if (currentSection === 'middle') {
        sectionCounters[depth - 1] += 1;
        for (let index = depth; index < sectionCounters.length; index += 1) {
          sectionCounters[index] = 0;
        }
        const number = sectionCounters.slice(0, depth).join('.');
        label = `${number}. ${currentHeading}`;
        headingText = label;
      }

      const slugBase = slugify(label || `section-${html.length + 1}`) || `section-${html.length + 1}`;
      const duplicateCount = headingIdCounts.get(slugBase) || 0;
      headingIdCounts.set(slugBase, duplicateCount + 1);
      const id = duplicateCount === 0 ? slugBase : `${slugBase}-${duplicateCount + 1}`;

      if (currentSection === 'middle') {
        tocMiddle.push({
          depth,
          id,
          label,
        });
      } else if (currentSection === 'back') {
        tocBack.push({
          depth,
          id,
          label,
        });
      }

      html.push(`<h${level} id="${escapeHtml(id)}">${linkify(headingText)}</h${level}>`);
      continue;
    }

    const listMatch = line.match(/^- (.*)$/);
    if (listMatch) {
      flushParagraph();
      listItems.push(listMatch[1].trim());
      continue;
    }

    if (line.trim() === '') {
      flushParagraph();
      flushList();
      continue;
    }

    paragraphLines.push(line.trim());
  }

  closeSection();

  return {
    html: html.join('\n'),
    tocMiddle,
    tocBack,
    topLevelCount: sectionCounters[0],
  };
};

const draftFile = findDraftFile();
const source = readFileSync(draftFile, 'utf8');
const timestamp = new Date().toISOString();
const base = basename(draftFile, '.md');
const { frontMatter, body } = parseFrontMatter(source);
const metadata = {
  title: getScalar(frontMatter, 'title') || base,
  abbrev: getScalar(frontMatter, 'abbrev'),
  docname: getScalar(frontMatter, 'docname'),
  date: getScalar(frontMatter, 'date'),
  authorEntries: parseAuthors(frontMatter),
  streamName: 'The Gathering Stream',
  references: parseReferenceSections(frontMatter),
};
metadata.authors = metadata.authorEntries.map((author) => author.fullname).filter(Boolean);
metadata.primaryAuthor = metadata.authorEntries[0]?.fullname || '';
metadata.shortAuthor = metadata.primaryAuthor ? formatShortAuthor(metadata.primaryAuthor) : '';
metadata.primaryOrganization = metadata.authorEntries[0]?.organization || '';
const rendered = renderMarkdown(body);
const generatedReferences = renderGeneratedReferences(metadata.references, rendered.topLevelCount);
const generatedAuthors = renderGeneratedAuthors(metadata.authorEntries);
const renderedContent = [rendered.html, generatedReferences.html, generatedAuthors.html].filter(Boolean).join('\n');
const tocHtml = renderToc([
  ...rendered.tocMiddle,
  ...generatedReferences.toc,
  ...generatedAuthors.toc,
  ...rendered.tocBack,
]);

mkdirSync('dist', { recursive: true });

const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(metadata.title)}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Mozilla+Headline:wght@400;600;700&display=swap" rel="stylesheet">
  <style>
    :root {
      color-scheme: light;
      --page-bg: #ffffff;
      --ink: #2c2c2c;
      --muted: #666666;
      --rule: #e6e6e6;
      --accent: #4b79aa;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background: var(--page-bg);
      color: var(--ink);
      font-family: "Mozilla Headline", sans-serif;
      line-height: 1.42;
    }
    main {
      max-width: 1240px;
      margin: 0 auto;
      padding: 48px 36px 64px;
    }
    .page-layout {
      display: grid;
      grid-template-columns: minmax(0, 74ch) minmax(240px, 300px);
      gap: 56px;
      align-items: start;
    }
    .doc {
      min-width: 0;
      font-size: 16px;
    }
    .doc-header {
      margin-bottom: 1.8rem;
    }
    .doc-meta {
      margin: 0 0 1.9rem;
      font-size: 0.92rem;
      font-family: "Mozilla Headline", sans-serif;
    }
    .doc-meta-row {
      display: grid;
      grid-template-columns: 132px minmax(0, 1fr);
      gap: 12px;
    }
    .doc-meta-row + .doc-meta-row {
      margin-top: 0.18rem;
    }
    .doc-meta dt,
    .doc-meta dd {
      margin: 0;
    }
    .doc-meta dt {
      text-align: right;
      color: var(--muted);
    }
    h1, h2, h3, h4 {
      margin: 0 0 0.75rem;
      line-height: 1.3;
      color: var(--ink);
      font-weight: 700;
      font-family: "Mozilla Headline", sans-serif;
    }
    .doc-title {
      font-size: 1.15rem;
      margin-bottom: 0.3rem;
    }
    .doc-subtitle {
      margin: 0;
      color: var(--muted);
      font-size: 0.95rem;
    }
    h2 {
      margin-top: 1.7rem;
      font-size: 1rem;
    }
    h3 {
      margin-top: 1.35rem;
      font-size: 1rem;
    }
    h4 {
      margin-top: 1.1rem;
      font-size: 1rem;
    }
    p, ul, address {
      margin: 0 0 1em;
      font-size: 1rem;
    }
    ul {
      padding-left: 1.25rem;
    }
    li + li {
      margin-top: 0.25em;
    }
    .toc-panel {
      position: sticky;
      top: 32px;
      font-size: 0.92rem;
    }
    .toc-title {
      margin: 0 0 1rem;
      font-size: 1rem;
      font-family: "Mozilla Headline", sans-serif;
    }
    .toc-list {
      margin: 0;
      padding: 0;
      list-style: none;
      font-family: "Mozilla Headline", sans-serif;
    }
    .toc-item {
      margin: 0;
      padding: 0;
    }
    .toc-item + .toc-item {
      margin-top: 0.35rem;
    }
    .toc-level-2 {
      padding-left: 1rem;
    }
    .toc-level-3 {
      padding-left: 2rem;
    }
    .toc-level-4 {
      padding-left: 3rem;
    }
    .stamp {
      margin-top: 2rem;
      color: var(--muted);
      font-size: 0.9rem;
    }
    section:first-of-type h2 {
      margin-top: 0;
    }
    .boilerplate {
      margin-bottom: 1.8rem;
    }
    address {
      font-style: normal;
    }
    a {
      color: var(--accent);
      text-decoration: underline;
    }
    .abstract,
    .middle,
    .back {
      margin-top: 1.35rem;
    }
    .ref-list {
      margin: 0 0 1.2rem;
    }
    .ref-entry {
      display: grid;
      grid-template-columns: max-content minmax(0, 1fr);
      gap: 1rem;
      align-items: start;
    }
    .ref-entry + .ref-entry {
      margin-top: 0.75rem;
    }
    .ref-label {
      font-weight: 700;
      white-space: nowrap;
    }
    .ref-text {
      min-width: 0;
    }
    .author-address + .author-address {
      margin-top: 1rem;
    }
    @media (max-width: 700px) {
      main {
        padding: 28px 16px 40px;
      }
      .page-layout {
        grid-template-columns: 1fr;
        gap: 36px;
      }
      .toc-panel {
        position: static;
        order: -1;
      }
      .doc-meta-row {
        grid-template-columns: 108px minmax(0, 1fr);
      }
      .doc-meta dt {
        text-align: left;
      }
      .ref-entry {
        grid-template-columns: 1fr;
        gap: 0.15rem;
      }
    }
  </style>
</head>
<body>
  <main>
    <div class="page-layout">
      <article class="doc">
        ${renderDocumentHeader(metadata)}
        ${renderBoilerplate(metadata)}
        ${renderedContent}
        <p class="stamp">Rendered from ${escapeHtml(base)}.md at ${escapeHtml(timestamp)}</p>
      </article>
      ${tocHtml}
    </div>
  </main>
</body>
</html>`;

writeFileSync(`dist/${base}.html`, html);
writeFileSync('dist/index.html', html);
writeFileSync('dist/.nojekyll', '');
writeFileSync(`dist/${base}.txt`, source);
console.log(`Built dist/${base}.html, dist/index.html, dist/.nojekyll, and dist/${base}.txt`);
