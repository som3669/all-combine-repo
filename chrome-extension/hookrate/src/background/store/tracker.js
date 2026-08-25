// Real-time channel tracker.
//
// chrome.alarms polls tracked channels and stores a snapshot per run, so the
// UI can show growth deltas that YouTube itself never exposes for other
// people's channels.

import * as channelApi from '../analytics/channel.js';
import * as settings from './settings.js';

const KEY = 'hr:tracked';
const ALARM = 'hr-tracker';
const MAX_SNAPSHOTS = 180; // ~6 months of daily points per channel

async function read() {
  const bag = await chrome.storage.local.get(KEY);
  return bag[KEY] || { channels: {} };
}

async function write(state) {
  await chrome.storage.local.set({ [KEY]: state });
  return state;
}

export async function schedule(periodMinutes) {
  if (!periodMinutes) {
    const s = await settings.get();
    periodMinutes = s.tracker?.periodMinutes || 360;
  }
  await chrome.alarms.clear(ALARM);
  await chrome.alarms.create(ALARM, { periodInMinutes: periodMinutes, delayInMinutes: 1 });
  return { periodMinutes };
}

export async function add(channelIdOrHandle) {
  const channelId = await channelApi.resolve(channelIdOrHandle);
  const state = await read();
  if (!state.channels[channelId]) {
    state.channels[channelId] = { channelId, addedAt: Date.now(), snapshots: [] };
    await write(state);
    await schedule();
    await poll(channelId); // seed the first data point immediately
  }
  return { channelId, tracking: true };
}

export async function remove(channelId) {
  const state = await read();
  delete state.channels[channelId];
  await write(state);
  if (!Object.keys(state.channels).length) await chrome.alarms.clear(ALARM);
  return { channelId, tracking: false };
}

export async function isTracked(channelId) {
  const state = await read();
  return !!state.channels[channelId];
}

function delta(snapshots, field, windowMs) {
  if (snapshots.length < 2) return null;
  const latest = snapshots[snapshots.length - 1];
  const cutoff = latest.at - windowMs;
  // Nearest snapshot at or before the cutoff.
  const earlier = [...snapshots].reverse().find((s) => s.at <= cutoff) || snapshots[0];
  if (earlier === latest) return null;
  const from = earlier[field];
  const to = latest[field];
  if (!Number.isFinite(from) || !Number.isFinite(to)) return null;
  return {
    change: to - from,
    percent: from ? +(((to - from) / from) * 100).toFixed(2) : null,
    spanHours: Math.round((latest.at - earlier.at) / 3600e3),
  };
}

/** One poll of one channel. Failures are recorded, not thrown. */
export async function poll(channelId) {
  const state = await read();
  const row = state.channels[channelId];
  if (!row) return null;

  try {
    const a = await channelApi.analytics(channelId, { deep: false });
    row.title = a.title;
    row.avatar = a.avatar;
    row.snapshots.push({
      at: Date.now(),
      subscribers: a.subscribers,
      totalViews: a.totalViews,
      videoCount: a.videoCount,
      lastUploadAt: a.lastUploadAt,
    });
    if (row.snapshots.length > MAX_SNAPSHOTS) {
      row.snapshots = row.snapshots.slice(-MAX_SNAPSHOTS);
    }
    row.lastError = null;
  } catch (err) {
    row.lastError = String(err.message || err);
  }

  row.polledAt = Date.now();
  await write(state);
  return row;
}

export async function pollAll() {
  const state = await read();
  const ids = Object.keys(state.channels);
  for (const id of ids) {
    await poll(id);
    await new Promise((r) => setTimeout(r, 1500)); // be a polite client
  }
  return { polled: ids.length };
}

/** Tracked channels with computed 24h / 7d / 30d deltas. */
export async function list() {
  const state = await read();
  return Object.values(state.channels).map((row) => {
    const snaps = row.snapshots || [];
    const latest = snaps[snaps.length - 1] || null;
    return {
      channelId: row.channelId,
      title: row.title || row.channelId,
      avatar: row.avatar || null,
      addedAt: row.addedAt,
      polledAt: row.polledAt || null,
      lastError: row.lastError || null,
      points: snaps.length,
      current: latest,
      subs24h: delta(snaps, 'subscribers', 864e5),
      subs7d: delta(snaps, 'subscribers', 7 * 864e5),
      subs30d: delta(snaps, 'subscribers', 30 * 864e5),
      views24h: delta(snaps, 'totalViews', 864e5),
      views7d: delta(snaps, 'totalViews', 7 * 864e5),
      views30d: delta(snaps, 'totalViews', 30 * 864e5),
      history: snaps,
    };
  });
}

export { ALARM };
