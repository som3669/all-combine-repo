// Settings and API keys. Keys live in VS Code's secret storage; the old plain-text
// settings still work and are moved into secret storage when found.
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { ProviderId, ProviderSettings } from './providers';
import { PromptSettings } from './prompt';

export const PROVIDERS: ProviderId[] = ['ollama', 'groq', 'gemini', 'openrouter'];

export const MODEL_SETTING: Record<ProviderId, string> = {
  ollama: 'ollamaModel', groq: 'groqModel', gemini: 'geminiModel', openrouter: 'openrouterModel',
};

export const DEFAULT_MODEL: Record<ProviderId, string> = {
  ollama: 'qwen2.5-coder:7b',
  groq: 'openai/gpt-oss-20b',
  gemini: 'gemini-flash-latest',
  openrouter: 'openrouter/free',
};

export type KeyedProvider = Exclude<ProviderId, 'ollama'>;

export const KEY_SETTING: Record<KeyedProvider, string> = {
  groq: 'groqApiKey', gemini: 'geminiApiKey', openrouter: 'openrouterApiKey',
};

export const DEFAULT_EXCLUDES = ['package-lock.json', 'yarn.lock', 'composer.lock', '*.min.js', '*.min.css'];

const LEGACY_CONFIG_FILE = path.join(os.homedir(), '.config', 'aigitpilot', 'config.json');

/** A setting, with empty strings treated as unset. */
export function cfg<T>(key: string, fallback: T): T {
  const value = vscode.workspace.getConfiguration('aigitpilot').get<T>(key);
  return value === undefined || value === null || value === '' ? fallback : value;
}

export function currentProvider(): ProviderId {
  const p = cfg<string>('provider', 'ollama') as ProviderId;
  return PROVIDERS.includes(p) ? p : 'ollama';
}

let secrets: vscode.SecretStorage | undefined;

export function initSecrets(storage: vscode.SecretStorage): void { secrets = storage; }

const secretId = (p: KeyedProvider) => `aigitpilot.${p}ApiKey`;

export async function getApiKey(p: ProviderId): Promise<string> {
  if (p === 'ollama') { return ''; }
  return (await secrets?.get(secretId(p))) || cfg<string>(KEY_SETTING[p], '');
}

export async function storeApiKey(p: KeyedProvider, key: string): Promise<void> {
  await secrets?.store(secretId(p), key);
}

/**
 * Moves keys out of settings.json (which Settings Sync uploads) and out of the hook's
 * config file written by older versions. Returns how many keys moved.
 */
export async function migrateKeysToSecrets(): Promise<number> {
  if (!secrets) { return 0; }
  const conf = vscode.workspace.getConfiguration('aigitpilot');
  let legacy: Record<string, unknown> = {};
  try { legacy = JSON.parse(fs.readFileSync(LEGACY_CONFIG_FILE, 'utf8')); } catch { /* none */ }
  let moved = 0;
  for (const p of Object.keys(KEY_SETTING) as KeyedProvider[]) {
    const fromSettings = conf.inspect<string>(KEY_SETTING[p])?.globalValue;
    if (fromSettings) {
      await storeApiKey(p, fromSettings);
      await conf.update(KEY_SETTING[p], undefined, vscode.ConfigurationTarget.Global);
      moved++;
      continue;
    }
    const fromFile = legacy[KEY_SETTING[p]];
    if (typeof fromFile === 'string' && fromFile && !(await secrets.get(secretId(p)))) {
      await storeApiKey(p, fromFile);
      moved++;
    }
  }
  return moved;
}

export async function providerSettings(p: ProviderId = currentProvider()): Promise<ProviderSettings> {
  return {
    provider: p,
    model: cfg<string>(MODEL_SETTING[p], DEFAULT_MODEL[p]),
    apiKey: await getApiKey(p),
    ollamaUrl: cfg<string>('ollamaUrl', 'http://localhost:11434'),
  };
}

export function promptSettings(): PromptSettings {
  return {
    style: cfg<string>('style', 'conventional'),
    language: cfg<string>('language', 'english'),
    customInstructions: cfg<string>('customInstructions', ''),
  };
}
