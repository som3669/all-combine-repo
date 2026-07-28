import * as vscode from 'vscode';
import { ChatStore, extractText } from './store';
import { Session, TranscriptEvent } from './model';

export interface RenderOpts {
  thinking: boolean;
  tools: boolean;
}

export function optsFromConfig(): RenderOpts {
  const cfg = vscode.workspace.getConfiguration('claudeChats');
  return {
    thinking: cfg.get<boolean>('includeThinking', false),
    tools: cfg.get<boolean>('includeToolCalls', true),
  };
}

/** Render a full transcript to readable Markdown. */
export function sessionToMarkdown(
  store: ChatStore,
  session: Session,
  opts: RenderOpts
): string {
  const lines = store.readLines(session.file);
  const out: string[] = [];
  out.push(`# ${session.title}`);
  out.push('');
  out.push(`- **Project:** \`${session.cwd}\``);
  if (session.gitBranch) out.push(`- **Branch:** \`${session.gitBranch}\``);
  out.push(`- **Session:** \`${session.sessionId}\``);
  if (session.createdAt)
    out.push(`- **Started:** ${new Date(session.createdAt).toLocaleString()}`);
  out.push(`- **Messages:** ${session.messageCount}`);
  if (session.meta.tags?.length)
    out.push(`- **Tags:** ${session.meta.tags.map((t) => '#' + t).join(' ')}`);
  if (session.meta.note) out.push(`- **Note:** ${session.meta.note}`);
  out.push('');
  out.push('---');
  out.push('');

  for (const line of lines) {
    let ev: TranscriptEvent;
    try {
      ev = JSON.parse(line);
    } catch {
      continue;
    }
    if (ev.type !== 'user' && ev.type !== 'assistant') continue;
    const text = extractText(ev.message?.content, opts).trim();
    if (!text) continue;

    const who = ev.type === 'user' ? '🧑 User' : '🤖 Claude';
    const ts = ev.timestamp
      ? ` — _${new Date(ev.timestamp).toLocaleString()}_`
      : '';
    out.push(`### ${who}${ts}`);
    out.push('');
    out.push(text);
    out.push('');
  }
  return out.join('\n');
}
