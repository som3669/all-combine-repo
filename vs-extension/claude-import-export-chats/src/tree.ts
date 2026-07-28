import * as vscode from 'vscode';
import { ChatStore } from './store';
import { Project, Session } from './model';

export type Node = FavoritesNode | ProjectNode | SessionNode;

export class FavoritesNode {
  readonly kind = 'favorites';
  constructor(public sessions: Session[]) {}
}
export class ProjectNode {
  readonly kind = 'project';
  constructor(public project: Project) {}
}
export class SessionNode {
  readonly kind = 'session';
  constructor(public session: Session) {}
}

export class ChatTreeProvider implements vscode.TreeDataProvider<Node> {
  private _onDidChange = new vscode.EventEmitter<Node | undefined | void>();
  readonly onDidChangeTreeData = this._onDidChange.event;

  constructor(private store: ChatStore) {}

  refresh(): void {
    this._onDidChange.fire();
  }

  getTreeItem(node: Node): vscode.TreeItem {
    if (node.kind === 'favorites') {
      const item = new vscode.TreeItem(
        `Favorites (${node.sessions.length})`,
        vscode.TreeItemCollapsibleState.Expanded
      );
      item.iconPath = new vscode.ThemeIcon('star-full');
      item.contextValue = 'favorites';
      return item;
    }
    if (node.kind === 'project') {
      const p = node.project;
      const item = new vscode.TreeItem(
        p.label,
        vscode.TreeItemCollapsibleState.Collapsed
      );
      item.description = `${p.sessions.length} chat${p.sessions.length === 1 ? '' : 's'}`;
      item.tooltip = p.cwd;
      item.iconPath = new vscode.ThemeIcon('folder');
      item.contextValue = 'project';
      item.resourceUri = vscode.Uri.file(p.cwd);
      return item;
    }
    // session
    const s = node.session;
    const item = new vscode.TreeItem(
      s.title,
      vscode.TreeItemCollapsibleState.None
    );
    item.description = describe(s);
    item.tooltip = tooltip(s);
    item.contextValue = 'session';
    item.iconPath = new vscode.ThemeIcon(
      s.meta.favorite ? 'star-full' : 'comment-discussion'
    );
    item.command = {
      command: 'claudeChats.preview',
      title: 'Open Conversation',
      arguments: [node],
    };
    return item;
  }

  getChildren(node?: Node): Node[] {
    if (!node) {
      const projects = this.store.listProjects();
      const favorites = projects
        .flatMap((p) => p.sessions)
        .filter((s) => s.meta.favorite)
        .sort((a, b) => b.updatedAt - a.updatedAt);
      const roots: Node[] = [];
      if (favorites.length) roots.push(new FavoritesNode(favorites));
      roots.push(...projects.map((p) => new ProjectNode(p)));
      return roots;
    }
    if (node.kind === 'favorites') {
      return node.sessions.map((s) => new SessionNode(s));
    }
    if (node.kind === 'project') {
      return node.project.sessions.map((s) => new SessionNode(s));
    }
    return [];
  }
}

function describe(s: Session): string {
  const bits = [relTime(s.updatedAt), `${s.messageCount} msg`];
  if (s.meta.tags && s.meta.tags.length) {
    bits.push(s.meta.tags.map((t) => `#${t}`).join(' '));
  }
  return bits.join(' · ');
}

function tooltip(s: Session): vscode.MarkdownString {
  const md = new vscode.MarkdownString();
  md.appendMarkdown(`**${escapeMd(s.title)}**\n\n`);
  md.appendMarkdown(`- Folder: \`${s.cwd}\`\n`);
  if (s.gitBranch) md.appendMarkdown(`- Branch: \`${s.gitBranch}\`\n`);
  md.appendMarkdown(`- Messages: ${s.messageCount}\n`);
  md.appendMarkdown(`- Updated: ${new Date(s.updatedAt).toLocaleString()}\n`);
  md.appendMarkdown(`- Size: ${(s.sizeBytes / 1024).toFixed(0)} KB\n`);
  if (s.meta.tags?.length) md.appendMarkdown(`- Tags: ${s.meta.tags.join(', ')}\n`);
  if (s.meta.note) md.appendMarkdown(`\n${escapeMd(s.meta.note)}\n`);
  md.appendMarkdown(`\n_${s.sessionId}_`);
  return md;
}

function escapeMd(s: string): string {
  return s.replace(/[<>]/g, '');
}

export function relTime(ms: number): string {
  const diff = Date.now() - ms;
  const sec = Math.round(diff / 1000);
  if (sec < 60) return 'just now';
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  if (day < 30) return `${day}d ago`;
  const mo = Math.round(day / 30);
  if (mo < 12) return `${mo}mo ago`;
  return `${Math.round(mo / 12)}y ago`;
}
