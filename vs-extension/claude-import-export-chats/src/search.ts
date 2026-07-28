import { ChatStore, extractText } from './store';
import { Session, TranscriptEvent } from './model';

export interface SearchHit {
  session: Session;
  role: string;
  snippet: string;
  timestamp?: string;
}

export interface SearchQuery {
  text: string;
  regex: boolean;
  caseSensitive: boolean;
}

/** Full-text search across all conversation transcripts. */
export function searchSessions(
  store: ChatStore,
  query: SearchQuery,
  maxHits = 200
): SearchHit[] {
  const hits: SearchHit[] = [];
  let matcher: (s: string) => number;

  if (query.regex) {
    let re: RegExp;
    try {
      re = new RegExp(query.text, query.caseSensitive ? 'g' : 'gi');
    } catch {
      return [];
    }
    matcher = (s) => {
      re.lastIndex = 0;
      const m = re.exec(s);
      return m ? m.index : -1;
    };
  } else {
    const needle = query.caseSensitive ? query.text : query.text.toLowerCase();
    matcher = (s) => (query.caseSensitive ? s : s.toLowerCase()).indexOf(needle);
  }

  const opts = { thinking: false, tools: false };
  for (const session of store.allSessions()) {
    for (const line of store.readLines(session.file)) {
      let ev: TranscriptEvent;
      try {
        ev = JSON.parse(line);
      } catch {
        continue;
      }
      if (ev.type !== 'user' && ev.type !== 'assistant') continue;
      const text = extractText(ev.message?.content, opts);
      if (!text) continue;
      const idx = matcher(text);
      if (idx < 0) continue;
      hits.push({
        session,
        role: ev.type,
        snippet: makeSnippet(text, idx, query.text.length),
        timestamp: ev.timestamp,
      });
      if (hits.length >= maxHits) return hits;
    }
  }
  return hits;
}

function makeSnippet(text: string, idx: number, matchLen: number): string {
  const pad = 50;
  const start = Math.max(0, idx - pad);
  const end = Math.min(text.length, idx + Math.max(matchLen, 1) + pad);
  let snip = text.slice(start, end).replace(/\s+/g, ' ').trim();
  if (start > 0) snip = '…' + snip;
  if (end < text.length) snip = snip + '…';
  return snip;
}
