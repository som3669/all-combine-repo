import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { MetadataStore } from './metadata';
import { Project, Session, TranscriptEvent } from './model';

interface Summary {
  firstPrompt?: string;
  aiTitle?: string;
  messageCount: number;
  createdAt?: number;
  cwd?: string;
  gitBranch?: string;
}

/** Locates and parses Claude Code conversation transcripts. */
export class ChatStore {
  meta: MetadataStore;
  private home: string;
  private summaryCache = new Map<string, Summary>();

  constructor() {
    this.home = ChatStore.resolveHome();
    this.meta = new MetadataStore(this.home);
  }

  /** Re-read config-driven paths (call after settings change). */
  reload(): void {
    this.home = ChatStore.resolveHome();
    this.meta = new MetadataStore(this.home);
  }

  get claudeHome(): string {
    return this.home;
  }

  get projectsDir(): string {
    return path.join(this.home, 'projects');
  }

  exists(): boolean {
    try {
      return fs.statSync(this.projectsDir).isDirectory();
    } catch {
      return false;
    }
  }

  static resolveHome(): string {
    const configured = vscode.workspace
      .getConfiguration('claudeChats')
      .get<string>('claudeHome');
    if (configured && configured.trim()) {
      return expandHome(configured.trim());
    }
    if (process.env.CLAUDE_CONFIG_DIR && process.env.CLAUDE_CONFIG_DIR.trim()) {
      return process.env.CLAUDE_CONFIG_DIR.trim();
    }
    return path.join(os.homedir(), '.claude');
  }

  /** List all projects with their sessions, most recently used first. */
  listProjects(): Project[] {
    if (!this.exists()) return [];
    const projects: Project[] = [];
    let dirs: string[] = [];
    try {
      dirs = fs
        .readdirSync(this.projectsDir, { withFileTypes: true })
        .filter((d) => d.isDirectory())
        .map((d) => d.name);
    } catch {
      return [];
    }

    for (const projectDir of dirs) {
      const dirPath = path.join(this.projectsDir, projectDir);
      let files: string[];
      try {
        files = fs.readdirSync(dirPath).filter((f) => f.endsWith('.jsonl'));
      } catch {
        continue;
      }
      const sessions: Session[] = [];
      let cwd = decodeProjectDir(projectDir);

      for (const f of files) {
        const s = this.readSession(projectDir, path.join(dirPath, f));
        if (!s) continue;
        if (s.cwd) cwd = s.cwd;
        sessions.push(s);
      }
      if (sessions.length === 0) continue;
      sessions.sort((a, b) => b.updatedAt - a.updatedAt);
      projects.push({
        projectDir,
        cwd,
        label: path.basename(cwd) || cwd || projectDir,
        sessions,
      });
    }

    projects.sort((a, b) => {
      const am = Math.max(...a.sessions.map((s) => s.updatedAt));
      const bm = Math.max(...b.sessions.map((s) => s.updatedAt));
      return bm - am;
    });
    return projects;
  }

  allSessions(): Session[] {
    return this.listProjects().flatMap((p) => p.sessions);
  }

  findSession(sessionId: string): Session | undefined {
    return this.allSessions().find((s) => s.sessionId === sessionId);
  }

  /** Raw transcript lines for a session (used for export/backup). */
  readLines(file: string): string[] {
    try {
      return fs
        .readFileSync(file, 'utf8')
        .split('\n')
        .filter((l) => l.trim().length > 0);
    } catch {
      return [];
    }
  }

  readSession(projectDir: string, file: string): Session | undefined {
    let stat: fs.Stats;
    try {
      stat = fs.statSync(file);
    } catch {
      return undefined;
    }
    const sessionId = path.basename(file, '.jsonl');
    const sum = this.summarize(file, stat);
    const meta = this.meta.get(sessionId);
    const title =
      meta.customTitle ||
      sum.aiTitle ||
      sum.firstPrompt ||
      '(untitled conversation)';

    return {
      sessionId,
      projectDir,
      cwd: sum.cwd || decodeProjectDir(projectDir),
      file,
      title: title.length > 120 ? title.slice(0, 117) + '…' : title,
      aiTitle: sum.aiTitle,
      firstPrompt: sum.firstPrompt,
      messageCount: sum.messageCount,
      createdAt: sum.createdAt,
      updatedAt: stat.mtimeMs,
      sizeBytes: stat.size,
      gitBranch: sum.gitBranch,
      meta,
    };
  }

  private summarize(file: string, stat: fs.Stats): Summary {
    const key = `${file}:${stat.mtimeMs}:${stat.size}`;
    const cached = this.summaryCache.get(key);
    if (cached) return cached;

    const sum: Summary = { messageCount: 0 };
    let content = '';
    try {
      content = fs.readFileSync(file, 'utf8');
    } catch {
      return sum;
    }

    for (const line of content.split('\n')) {
      if (!line.trim()) continue;
      let ev: TranscriptEvent;
      try {
        ev = JSON.parse(line);
      } catch {
        continue;
      }
      if (!sum.cwd && ev.cwd) sum.cwd = ev.cwd;
      if (!sum.gitBranch && ev.gitBranch) sum.gitBranch = ev.gitBranch;
      if (ev.type === 'ai-title' && ev.aiTitle) sum.aiTitle = ev.aiTitle;

      if (ev.type === 'user' || ev.type === 'assistant') {
        sum.messageCount++;
        if (!sum.createdAt && ev.timestamp) {
          const t = Date.parse(ev.timestamp);
          if (!Number.isNaN(t)) sum.createdAt = t;
        }
        if (!sum.firstPrompt && ev.type === 'user') {
          const text = extractText(ev.message?.content, {
            thinking: false,
            tools: false,
          }).trim();
          // Skip tool-result-only or system-injected user turns.
          if (text && !text.startsWith('<') ) {
            sum.firstPrompt = firstLine(text, 120);
          }
        }
      }
    }

    // Cap cache so long sessions of browsing don't grow unbounded.
    if (this.summaryCache.size > 500) this.summaryCache.clear();
    this.summaryCache.set(key, sum);
    return sum;
  }
}

function firstLine(text: string, max: number): string {
  const line = text.split('\n').find((l) => l.trim()) ?? text;
  const t = line.trim();
  return t.length > max ? t.slice(0, max - 1) + '…' : t;
}

function expandHome(p: string): string {
  if (p === '~') return os.homedir();
  if (p.startsWith('~/') || p.startsWith('~\\')) {
    return path.join(os.homedir(), p.slice(2));
  }
  return p;
}

/**
 * Best-effort reverse of Claude's project-dir encoding (path separators and
 * drive colons become '-'). Not perfectly invertible, so callers prefer the
 * real `cwd` recorded inside the transcript when available.
 */
export function decodeProjectDir(dir: string): string {
  return dir;
}

interface ExtractOpts {
  thinking: boolean;
  tools: boolean;
}

/** Flatten a Claude message content value into plain text. */
export function extractText(content: unknown, opts: ExtractOpts): string {
  if (content == null) return '';
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';

  const parts: string[] = [];
  for (const block of content as any[]) {
    if (!block || typeof block !== 'object') continue;
    switch (block.type) {
      case 'text':
        if (typeof block.text === 'string') parts.push(block.text);
        break;
      case 'thinking':
        if (opts.thinking && typeof block.thinking === 'string') {
          parts.push('> _[thinking]_ ' + block.thinking.replace(/\n/g, '\n> '));
        }
        break;
      case 'tool_use':
        if (opts.tools) {
          const input = safeJson(block.input);
          parts.push(`\`[tool: ${block.name ?? 'unknown'}]\`\n\n\`\`\`json\n${input}\n\`\`\``);
        }
        break;
      case 'tool_result': {
        if (opts.tools) {
          const inner =
            typeof block.content === 'string'
              ? block.content
              : extractText(block.content, opts);
          parts.push(`\`[tool result]\`\n\n${truncate(inner, 4000)}`);
        }
        break;
      }
      default:
        break;
    }
  }
  return parts.join('\n\n');
}

function safeJson(v: unknown): string {
  try {
    return JSON.stringify(v, null, 2) ?? String(v);
  } catch {
    return String(v);
  }
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max) + '\n…(truncated)' : s;
}
