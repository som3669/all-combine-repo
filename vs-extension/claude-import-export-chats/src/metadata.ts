import * as fs from 'fs';
import * as path from 'path';
import { SessionMeta } from './model';

/**
 * Organizer sidecar: user-managed metadata (favorites, tags, custom titles,
 * notes) keyed by sessionId. Stored as a single JSON file in the Claude home
 * so it travels with exports and is independent of VS Code workspace state.
 */
export class MetadataStore {
  private file: string;
  private data: { sessions: Record<string, SessionMeta> } = { sessions: {} };

  constructor(claudeHome: string) {
    this.file = path.join(claudeHome, 'chat-organizer.json');
    this.load();
  }

  private load(): void {
    try {
      const raw = fs.readFileSync(this.file, 'utf8');
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && parsed.sessions) {
        this.data = parsed;
      }
    } catch {
      // No sidecar yet, or unreadable — start fresh.
      this.data = { sessions: {} };
    }
  }

  private save(): void {
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      fs.writeFileSync(this.file, JSON.stringify(this.data, null, 2), 'utf8');
    } catch {
      // Non-fatal: metadata is a convenience layer.
    }
  }

  get(sessionId: string): SessionMeta {
    return this.data.sessions[sessionId] ?? {};
  }

  set(sessionId: string, meta: SessionMeta): void {
    const clean: SessionMeta = {};
    if (meta.favorite) clean.favorite = true;
    if (meta.tags && meta.tags.length) clean.tags = meta.tags;
    if (meta.customTitle) clean.customTitle = meta.customTitle;
    if (meta.note) clean.note = meta.note;

    if (Object.keys(clean).length === 0) {
      delete this.data.sessions[sessionId];
    } else {
      this.data.sessions[sessionId] = clean;
    }
    this.save();
  }

  update(sessionId: string, patch: Partial<SessionMeta>): SessionMeta {
    const next = { ...this.get(sessionId), ...patch };
    this.set(sessionId, next);
    return this.get(sessionId);
  }

  /** Merge imported metadata without clobbering existing local values. */
  merge(sessionId: string, incoming: SessionMeta): void {
    if (!incoming || Object.keys(incoming).length === 0) return;
    const current = this.get(sessionId);
    const mergedTags = Array.from(
      new Set([...(current.tags ?? []), ...(incoming.tags ?? [])])
    );
    this.set(sessionId, {
      favorite: current.favorite || incoming.favorite,
      tags: mergedTags,
      customTitle: current.customTitle ?? incoming.customTitle,
      note: current.note ?? incoming.note,
    });
  }

  allTags(): string[] {
    const set = new Set<string>();
    for (const m of Object.values(this.data.sessions)) {
      (m.tags ?? []).forEach((t) => set.add(t));
    }
    return Array.from(set).sort();
  }
}
