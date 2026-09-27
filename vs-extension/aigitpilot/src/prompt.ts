// Prompt text and reply cleanup. No VS Code imports, so tests can load it directly.
// hooks/aigitpilot-message.sh builds the same user prompt in shell; keep the two in step.

export type Style = 'conventional' | 'short' | 'detailed';

export interface PromptSettings {
  style: string;
  language: string;
  customInstructions: string;
}

export interface PromptContext {
  branch?: string;
  recentSubjects?: string[];
  /** Text the author already typed in the commit box. */
  draft?: string;
  source: 'staged' | 'all';
  files: string;
  diff: string;
  truncated: boolean;
}

const STYLE_GUIDES: Record<Style, string> = {
  conventional: `Use the Conventional Commits format: type(scope): description
- Types: feat, fix, docs, style, refactor, perf, test, build, ci, chore, revert. The scope is optional.
- Subject line at most 72 characters, imperative mood, no period at the end.
- Never put file names in the subject line.
- Add a body after a blank line only when the change needs its reason explained.`,
  short: 'Write a single line under 72 characters in the imperative mood, with no type prefix and no body.',
  detailed: `Write a detailed commit message:
- Line 1: a summary of at most 72 characters in the imperative mood.
- Line 2: blank.
- Then a body that explains what changed and why (not how), wrapped at 72 characters.`,
};

export function systemPrompt(s: PromptSettings): string {
  return [
    'You write git commit messages from a diff.',
    `Write the message in ${s.language || 'english'}.`,
    STYLE_GUIDES[s.style as Style] ?? STYLE_GUIDES.conventional,
    s.customInstructions ? `Extra instructions from the user: ${s.customInstructions}` : '',
    'Reply with the commit message only: no preamble, no explanation, no markdown, no code fences, no quotes.',
  ].filter(Boolean).join('\n\n');
}

export function userPrompt(c: PromptContext): string {
  const parts: string[] = [];
  if (c.branch) { parts.push(`Branch: ${c.branch}`); }
  if (c.recentSubjects?.length) {
    parts.push('Recent commit subjects in this repository. Follow the required format; use these only for scopes, ticket references and wording:\n'
      + c.recentSubjects.map(s => `- ${s}`).join('\n'));
  }
  if (c.draft) { parts.push(`The author's own note about this commit (keep its intent):\n${c.draft}`); }
  parts.push(`Changed files (${c.source === 'staged' ? 'staged' : 'all uncommitted changes; nothing is staged'}):\n${c.files}`);
  const note = c.truncated ? ' (long files are cut short; the file list above is complete)' : '';
  parts.push(`Diff${note}:\n${c.diff.trim() || '(no text diff: only excluded or binary files changed)'}`);
  return parts.join('\n\n');
}

/** Strips what models wrap around the message: reasoning blocks, fences, preambles, quotes. */
export function cleanMessage(raw: string, style: string): string {
  let s = raw.replace(/\r\n?/g, '\n');
  s = s.replace(/<think>[\s\S]*?<\/think>/gi, '');
  s = s.replace(/^[\s\S]*<\/think>/i, '');
  const fenced = s.match(/```[\w-]*\n([\s\S]*?)```/);
  if (fenced) { s = fenced[1]; }
  s = s.replace(/^\s*(?:(?:here is|here's|sure)[^:\n]*:[ \t]*\n|commit message:[ \t]*)/i, '');
  s = s.trim();
  const quoted = s.match(/^(["'`])([\s\S]+)\1$/);
  if (quoted) { s = quoted[2].trim(); }
  const bold = s.match(/^\*\*(.+?)\*\*(\n|$)/);
  if (bold) { s = bold[1] + s.slice(bold[0].length - bold[2].length); }
  s = s.split('\n').map(line => line.trimEnd()).join('\n').replace(/\n{3,}/g, '\n\n').trim();
  if (style === 'short') { s = s.split('\n')[0]; }
  return s;
}
