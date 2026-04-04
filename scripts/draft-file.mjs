import { existsSync, readdirSync } from 'node:fs';

const TEMPLATE_DRAFT = 'draft-todo-author-stream.md';
const IGNORED_MARKDOWN = new Set(['README.md', 'CONTRIBUTING.md']);

export const findDraftFile = ({ allowTemplate = true, allowMissing = false } = {}) => {
  const explicit = String(process.env.DRAFT_FILE || '').trim();
  if (explicit) {
    if (existsSync(explicit)) {
      return explicit;
    }
    throw new Error(`DRAFT_FILE is set to "${explicit}" but that file does not exist.`);
  }

  const markdownFiles = readdirSync('.').filter(
    (file) => file.endsWith('.md') && !IGNORED_MARKDOWN.has(file),
  );
  const draftFiles = markdownFiles.filter((file) => file.startsWith('draft-'));
  const renamedDraft = draftFiles.find((file) => file !== TEMPLATE_DRAFT);

  if (renamedDraft) {
    return renamedDraft;
  }

  if (allowTemplate && draftFiles.includes(TEMPLATE_DRAFT)) {
    return TEMPLATE_DRAFT;
  }

  const nonTemplateMarkdown = markdownFiles.filter((file) => file !== TEMPLATE_DRAFT);

  if (nonTemplateMarkdown.length === 1) {
    throw new Error(
      `Found "${nonTemplateMarkdown[0]}", but draft source files must be named "draft-*.md". Rename it so it starts with "draft-".`,
    );
  }

  if (nonTemplateMarkdown.length > 1) {
    throw new Error(
      `No "draft-*.md" file found. Markdown files present: ${nonTemplateMarkdown.join(', ')}. Rename your draft file so it starts with "draft-".`,
    );
  }

  if (allowMissing) {
    return null;
  }

  throw new Error(`No draft source file found. Expected "${TEMPLATE_DRAFT}" or a renamed "draft-*.md" file.`);
};
