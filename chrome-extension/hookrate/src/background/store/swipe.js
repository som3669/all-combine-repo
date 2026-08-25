// Swipe file — folders of saved videos, thumbnails, shorts and channels.
// Stored locally. Nothing leaves the machine.

const KEY = 'hr:swipe';

async function read() {
  const bag = await chrome.storage.local.get(KEY);
  return bag[KEY] || { folders: [{ id: 'default', name: 'Unsorted', createdAt: 0 }], items: [] };
}

async function write(state) {
  await chrome.storage.local.set({ [KEY]: state });
  return state;
}

function id() {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

export async function list({ folderId, type, query } = {}) {
  const state = await read();
  let items = state.items;
  if (folderId) items = items.filter((i) => i.folderId === folderId);
  if (type) items = items.filter((i) => i.type === type);
  if (query) {
    const q = query.toLowerCase();
    items = items.filter(
      (i) =>
        (i.title || '').toLowerCase().includes(q) ||
        (i.note || '').toLowerCase().includes(q) ||
        (i.tags || []).some((t) => t.toLowerCase().includes(q))
    );
  }
  return {
    folders: state.folders,
    items: items.sort((a, b) => b.savedAt - a.savedAt),
    total: state.items.length,
  };
}

/**
 * Save an item. Re-saving the same ref updates it instead of duplicating.
 * @param {object} item { type, ref, title, thumbnail, url, meta, note, tags, folderId }
 */
export async function save(item) {
  const state = await read();
  const folderId = item.folderId || 'default';
  if (!state.folders.some((f) => f.id === folderId)) {
    state.folders.push({ id: folderId, name: folderId, createdAt: Date.now() });
  }

  const existing = state.items.find((i) => i.ref === item.ref && i.folderId === folderId);
  if (existing) {
    Object.assign(existing, item, { folderId, savedAt: Date.now() });
    await write(state);
    return { item: existing, created: false };
  }

  const row = {
    id: id(),
    type: item.type || 'video',
    ref: item.ref,
    title: item.title || '',
    thumbnail: item.thumbnail || null,
    url: item.url || null,
    meta: item.meta || {},
    note: item.note || '',
    tags: item.tags || [],
    folderId,
    savedAt: Date.now(),
  };
  state.items.push(row);
  await write(state);
  return { item: row, created: true };
}

export async function remove(itemId) {
  const state = await read();
  const before = state.items.length;
  state.items = state.items.filter((i) => i.id !== itemId && i.ref !== itemId);
  await write(state);
  return { removed: before - state.items.length };
}

export async function update(itemId, patch) {
  const state = await read();
  const row = state.items.find((i) => i.id === itemId);
  if (!row) return { updated: false };
  Object.assign(row, patch, { id: row.id, savedAt: row.savedAt });
  await write(state);
  return { updated: true, item: row };
}

export async function has(ref) {
  const state = await read();
  return state.items.some((i) => i.ref === ref);
}

export async function folder(name) {
  const state = await read();
  const existing = state.folders.find((f) => f.name === name);
  if (existing) return existing;
  const row = { id: id(), name, createdAt: Date.now() };
  state.folders.push(row);
  await write(state);
  return row;
}

export async function removeFolder(folderId) {
  if (folderId === 'default') return { removed: false, reason: 'cannot delete Unsorted' };
  const state = await read();
  state.folders = state.folders.filter((f) => f.id !== folderId);
  // Orphaned items fall back to Unsorted rather than vanishing.
  for (const i of state.items) if (i.folderId === folderId) i.folderId = 'default';
  await write(state);
  return { removed: true };
}

/** Export the whole swipe file as JSON (used by the swipe-file page). */
export async function exportAll() {
  const state = await read();
  return { version: 1, exportedAt: Date.now(), ...state };
}

export async function importAll(payload, { merge = true } = {}) {
  const incoming = payload && Array.isArray(payload.items) ? payload : null;
  if (!incoming) throw new Error('not a Hookrate swipe-file export');

  if (!merge) {
    await write({ folders: incoming.folders || [], items: incoming.items });
    return { imported: incoming.items.length, mode: 'replace' };
  }

  const state = await read();
  const known = new Set(state.items.map((i) => `${i.folderId}|${i.ref}`));
  let added = 0;
  for (const row of incoming.items) {
    const key = `${row.folderId || 'default'}|${row.ref}`;
    if (known.has(key)) continue;
    state.items.push({ ...row, id: id(), folderId: row.folderId || 'default' });
    known.add(key);
    added++;
  }
  for (const f of incoming.folders || []) {
    if (!state.folders.some((x) => x.id === f.id || x.name === f.name)) state.folders.push(f);
  }
  await write(state);
  return { imported: added, mode: 'merge' };
}
