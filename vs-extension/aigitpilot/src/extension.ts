import * as vscode from 'vscode';
import * as cp from 'child_process';
import * as https from 'https';
import * as http from 'http';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

// â”€â”€ helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function readConfigFile(): Record<string, unknown> {
  try {
    const f = path.join(os.homedir(), '.config', 'aigitpilot', 'config.json');
    return JSON.parse(fs.readFileSync(f, 'utf8'));
  } catch { return {}; }
}

function cfg<T>(key: string, fallback: T): T {
  const vsVal = vscode.workspace.getConfiguration('aigitpilot').get<T>(key);
  if (vsVal !== undefined && vsVal !== '' && vsVal !== null) { return vsVal; }
  const fileVal = readConfigFile()[key] as T;
  if (fileVal !== undefined && fileVal !== '' && fileVal !== null) { return fileVal; }
  return fallback;
}

function exec(cmd: string, cwd?: string): Promise<string> {
  return new Promise((resolve, reject) => {
    cp.exec(cmd, { cwd, maxBuffer: 1024 * 1024 * 10 }, (err, stdout, stderr) => {
      if (err) { reject(new Error(stderr || err.message)); return; }
      resolve(stdout);
    });
  });
}

function httpPost(url: string, body: object, headers: Record<string, string>): Promise<string> {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const parsed = new URL(url);
    const isHttps = parsed.protocol === 'https:';
    const options = {
      hostname: parsed.hostname,
      port: parsed.port || (isHttps ? 443 : 80),
      path: parsed.pathname + parsed.search,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data), ...headers },
    };
    const mod = isHttps ? https : http;
    const req = mod.request(options, res => {
      let out = '';
      res.on('data', chunk => out += chunk);
      res.on('end', () => resolve(out));
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

// â”€â”€ diff builder â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

async function getStagedDiff(repoRoot: string): Promise<string> {
  const maxSize = cfg<number>('maxDiffSize', 8000);
  const excludes = cfg<string[]>('excludeFiles', ['package-lock.json', 'yarn.lock', 'composer.lock']);

  let diff = '';
  try {
    diff = await exec('git diff --cached', repoRoot);
  } catch {
    return '';
  }

  // Strip excluded files
  const excludePatterns = excludes.map(e => e.replace(/\./g, '\\.').replace(/\*/g, '.*'));
  if (excludePatterns.length) {
    const lines = diff.split('\n');
    let skip = false;
    diff = lines.filter(line => {
      if (line.startsWith('diff --git')) {
        skip = excludePatterns.some(p => new RegExp(p).test(line));
      }
      return !skip;
    }).join('\n');
  }

  if (diff.length > maxSize) {
    const stat = await exec('git diff --cached --stat', repoRoot).catch(() => '');
    diff = `${stat}\n\n[diff truncated â€” ${diff.length} chars]\n${diff.slice(0, maxSize)}`;
  }

  return diff.trim();
}

// â”€â”€ prompt builder â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

async function buildPrompt(diff: string, repoRoot: string): Promise<string> {
  const style   = cfg<string>('style', 'conventional');
  const lang    = cfg<string>('language', 'english');
  const custom  = cfg<string>('customInstructions', '');

  let branch = '';
  try { branch = (await exec('git rev-parse --abbrev-ref HEAD', repoRoot)).trim(); } catch { /* ignore */ }

  let styleGuide = '';
  if (style === 'conventional') {
    styleGuide = `Use Conventional Commits format: type(scope): description
Types: feat, fix, docs, style, refactor, test, chore, perf
- Subject line max 72 chars, imperative mood, no period at end
- Add a body (after blank line) only if the change needs explanation of WHY
- Never mention file names in the subject line`;
  } else if (style === 'short') {
    styleGuide = `Write a single short commit message under 72 chars. Imperative mood. No prefix.`;
  } else {
    styleGuide = `Write a detailed commit message:
- Line 1: short summary (max 72 chars, imperative mood)
- Blank line
- Body: what changed and WHY (not how)`;
  }

  return `You are a Git commit message generator. Write a commit message in ${lang}.

${styleGuide}

${branch ? `Current branch: ${branch}` : ''}
${custom ? `Extra instructions: ${custom}` : ''}

Staged diff:
${diff}

Output ONLY the commit message. No explanation, no markdown, no quotes.`;
}

// â”€â”€ AI providers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

async function callOllama(prompt: string): Promise<string> {
  const url   = cfg<string>('ollamaUrl', 'http://localhost:11434');
  const model = cfg<string>('ollamaModel', 'qwen2.5-coder:7b');
  const raw = await httpPost(`${url}/api/generate`, { model, prompt, stream: false }, {});
  const parsed = JSON.parse(raw);
  return (parsed.response || '').trim();
}

async function callGroq(prompt: string): Promise<string> {
  const key   = cfg<string>('groqApiKey', '');
  const model = cfg<string>('groqModel', 'llama-3.3-70b-versatile');
  if (!key) { throw new Error('Groq API key not set. Add it in Settings â†’ PilotCommit.'); }
  const raw = await httpPost('https://api.groq.com/openai/v1/chat/completions', {
    model,
    messages: [{ role: 'user', content: prompt }],
    max_tokens: 300,
    temperature: 0.3,
  }, { Authorization: `Bearer ${key}` });
  const parsed = JSON.parse(raw);
  return (parsed.choices?.[0]?.message?.content || '').trim();
}

async function callGemini(prompt: string): Promise<string> {
  const key = cfg<string>('geminiApiKey', '');
  if (!key) { throw new Error('Gemini API key not set. Add it in Settings â†’ PilotCommit.'); }
  const raw = await httpPost(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${key}`,
    { contents: [{ parts: [{ text: prompt }] }], generationConfig: { maxOutputTokens: 300, temperature: 0.3 } },
    {}
  );
  const parsed = JSON.parse(raw);
  return (parsed.candidates?.[0]?.content?.parts?.[0]?.text || '').trim();
}

async function callOpenRouter(prompt: string): Promise<string> {
  const key = cfg<string>('openrouterApiKey', '');
  if (!key) { throw new Error('OpenRouter API key not set. Add it in Settings â†’ PilotCommit.'); }
  const raw = await httpPost('https://openrouter.ai/api/v1/chat/completions', {
    model: 'meta-llama/llama-3.1-8b-instruct:free',
    messages: [{ role: 'user', content: prompt }],
    max_tokens: 300,
  }, { Authorization: `Bearer ${key}` });
  const parsed = JSON.parse(raw);
  return (parsed.choices?.[0]?.message?.content || '').trim();
}

async function generateMessage(prompt: string): Promise<string> {
  const provider = cfg<string>('provider', 'ollama');
  switch (provider) {
    case 'ollama':     return callOllama(prompt);
    case 'groq':       return callGroq(prompt);
    case 'gemini':     return callGemini(prompt);
    case 'openrouter': return callOpenRouter(prompt);
    default:           return callOllama(prompt);
  }
}

// â”€â”€ git repo root â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

async function getRepoRoot(): Promise<string | undefined> {
  const candidates: string[] = [];

  // Active editor file's directory first
  const activeFile = vscode.window.activeTextEditor?.document.uri.fsPath;
  if (activeFile) { candidates.push(path.dirname(activeFile)); }

  // All workspace folders
  for (const f of vscode.workspace.workspaceFolders ?? []) {
    candidates.push(f.uri.fsPath);
  }

  for (const dir of candidates) {
    try {
      const root = (await exec('git rev-parse --show-toplevel', dir)).trim();
      if (root) { return root; }
    } catch { /* not a git repo, try next */ }
  }

  return undefined;
}

// â”€â”€ global hook installer â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

async function installShellIntegration(hooksDir: string): Promise<void> {
  const msgScript  = path.join(hooksDir, 'aigitpilot-message.sh');
  const shellFile  = path.join(hooksDir, 'aigitpilot-shell.sh');

  const msgScriptContent = [
    '#!/bin/sh',
    'HOOKS_DIR="$HOME/.git-hooks"',
    'CONFIG="$HOME/.config/aigitpilot/config.json"',
    'JQ="$HOOKS_DIR/jq.exe"',
    'command -v jq >/dev/null 2>&1 && JQ=jq',
    '[ ! -f "$CONFIG" ] && exit 0',
    'PROVIDER=$($JQ -r \'.provider // "ollama"\' "$CONFIG")',
    'STYLE=$($JQ -r \'.style // "conventional"\' "$CONFIG")',
    'LANG=$($JQ -r \'.language // "english"\' "$CONFIG")',
    'DIFF=$(git diff --cached --stat 2>/dev/null)',
    '[ -z "$DIFF" ] && exit 0',
    'if [ "$STYLE" = "conventional" ]; then',
    '  GUIDE="Conventional Commits: type(scope): description. Max 72 chars."',
    'else',
    '  GUIDE="Short commit message under 72 chars."',
    'fi',
    'PROMPT="Write a git commit message in $LANG. $GUIDE Output ONLY the message.\\n\\nDiff:\\n$DIFF"',
    'ESCAPED=$(printf \'%s\' "$PROMPT" | $JQ -Rs .)',
    'if [ "$PROVIDER" = "ollama" ]; then',
    '  URL=$($JQ -r \'.ollamaUrl // "http://localhost:11434"\' "$CONFIG")',
    '  MODEL=$($JQ -r \'.ollamaModel // "qwen2.5-coder:7b"\' "$CONFIG")',
    '  printf \'%s\' "$(curl -sf "$URL/api/generate" -H "Content-Type: application/json" -d "{\\"model\\":\\"$MODEL\\",\\"prompt\\":$ESCAPED,\\"stream\\":false}" 2>/dev/null | $JQ -r \'.response // empty\')"',
    'elif [ "$PROVIDER" = "groq" ]; then',
    '  KEY=$($JQ -r \'.groqApiKey // ""\' "$CONFIG")',
    '  GMODEL=$($JQ -r \'.groqModel // "llama-3.3-70b-versatile"\' "$CONFIG")',
    '  [ -z "$KEY" ] && exit 0',
    '  printf \'%s\' "$(curl -sf "https://api.groq.com/openai/v1/chat/completions" -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" -d "{\\"model\\":\\"$GMODEL\\",\\"messages\\":[{\\"role\\":\\"user\\",\\"content\\":$ESCAPED}],\\"max_tokens\\":300}" 2>/dev/null | $JQ -r \'.choices[0].message.content // empty\')"',
    'elif [ "$PROVIDER" = "gemini" ]; then',
    '  KEY=$($JQ -r \'.geminiApiKey // ""\' "$CONFIG")',
    '  [ -z "$KEY" ] && exit 0',
    '  printf \'%s\' "$(curl -sf "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=$KEY" -H "Content-Type: application/json" -d "{\\"contents\\":[{\\"parts\\":[{\\"text\\":$ESCAPED}]}]}" 2>/dev/null | $JQ -r \'.candidates[0].content.parts[0].text // empty\')"',
    'fi',
  ].join('\n');

  // Full shell integration with git wrapper + all shortcuts — embedded as base64 to avoid escaping issues
  const shellContent = Buffer.from(
    'IyEvYmluL2Jhc2gKIyBBSSBHaXQgUGlsb3Qgc2hlbGwgaW50ZWdyYXRpb24KCl9haWdpdHBpbG90' +
    'X2dlbmVyYXRlKCkgewogIF9SQVc9JChzaCAiJEhPTUUvLmdpdC1ob29rcy9haWdpdHBpbG90LW1l' +
    'c3NhZ2Uuc2giIDI+L2Rldi9udWxsIHwgdHIgLWQgJ1xyJykKICBfUkFXPSIke19SQVcjXCJ9IiA7' +
    'IF9SQVc9IiR7X1JBVyVcIn0iCiAgX1JBVz0iJHtfUkFXI1wnfSIgOyBfUkFXPSIke19SQVclXCd9' +
    'IgogIHByaW50ZiAnJXMnICIkX1JBVyIKfQoKX2FpZ2l0cGlsb3RfcHJvbXB0KCkgewogIGxvY2Fs' +
    'IGJyYW5jaAogIGJyYW5jaD0kKGNvbW1hbmQgZ2l0IHJldi1wYXJzZSAtLWFiYnJldi1yZWYgSEVB' +
    'RCAyPi9kZXYvbnVsbCkKICBsb2NhbCBzaG9ydF9wd2Q9IiR7UFdELyRIT01FL1x+fSIKICBwcmlu' +
    'dGYgIlwwMzNbMzJtJXNAJXNcMDMzWzBtIFwwMzNbMzVtTUlOR1c2NFwwMzNbMG0gXDAzM1szM20l' +
    'c1wwMzNbMG0iICIkVVNFUiIgIiRIT1NUTkFNRSIgIiRzaG9ydF9wd2QiCiAgWyAtbiAiJGJyYW5j' +
    'aCIgXSAmJiBwcmludGYgIiBcMDMzWzM2bSglcylcMDMzWzBtIiAiJGJyYW5jaCIKICBwcmludGYg' +
    'Ilxu' + 'Igp9CgpnaXQoKSB7CiAgIyDilIDilIAgZ2l0IGFkZDogc3RhZ2UgdGhlbiBzaG93IGVk' +
    'aXRhYmxlIGNvbW1hbmQgYXQgcHJvbXB0IOKUgOKUgOKUgOKUgOKUgOKUgOKUgAogIGlmIFsgIiQx' +
    'IiA9ICJhZGQiIF07IHRoZW4KICAgIGNvbW1hbmQgZ2l0ICIkQCIKICAgIF9TVEFHRUQ9JChjb21t' +
    'YW5kIGdpdCBkaWZmIC0tY2FjaGVkIC0tbmFtZS1vbmx5IDI+L2Rldi9udWxsKQogICAgaWYgWyAt' +
    'biAiJF9TVEFHRUQiIF07IHRoZW4KICAgICAgcHJpbnRmICJcMDMzWzM2beKcqCBnZW5lcmF0aW5n' +
    'Li4uXDAzM1swbVxyIiA+L2Rldi90dHkKICAgICAgX01TRz0kKF9haWdpdHBpbG90X2dlbmVyYXRl' +
    'KQogICAgICBwcmludGYgIlwwMzNbMksiID4vZGV2L3R0eQogICAgICBpZiBbIC1uICIkX01TRyIg' +
    'XTsgdGhlbgogICAgICAgIF9DTUQ9ImdpdCBjb21taXQgLW0gXCIkX01TR1wiIgogICAgICAgIF9h' +
    'aWdpdHBpbG90X3Byb21wdCA+L2Rldi90dHkKICAgICAgICByZWFkIC1lIC1pICIkX0NNRCIgLXAg' +
    'IiQocHJpbnRmICdcMDMzWzMybSRcMDMzWzBtICcpIiBGSU5BTF9DTUQgPC9kZXYvdHR5ID4vZGV2' +
    'L3R0eQogICAgICAgIGlmIFsgLW4gIiRGSU5BTF9DTUQiIF07IHRoZW4KICAgICAgICAgIGV2YWwg' +
    'IiRGSU5BTF9DTUQiCiAgICAgICAgZmkKICAgICAgZmkKICAgIGZpCiAgICByZXR1cm4KICBmaQoK' +
    'ICAjIOKUgOKUgCBnaXQgY29tbWl0IChubyAtbSk6IGdlbmVyYXRlICsgZWRpdGFibGUg4pSA4pSA' +
    '4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSACiAgaWYg' +
    'WyAiJDEiID0gImNvbW1pdCIgXTsgdGhlbgogICAgX0hBU19NPTAKICAgIGZvciBfYSBpbiAiJEAi' +
    'OyBkbwogICAgICBjYXNlICIkX2EiIGluIC1tfC0tbWVzc2FnZXwtbSopIF9IQVNfTT0xOyBicmVh' +
    'ayA7OyBlc2FjCiAgICBkb25lCiAgICBpZiBbICIkX0hBU19NIiAtZXEgMCBdOyB0aGVuCiAgICAg' +
    'IHByaW50ZiAiXDAzM1szNm3inKggZ2VuZXJhdGluZy4uLlwwMzNbMG1cciIgPi9kZXYvdHR5CiAg' +
    'ICAgIF9NU0c9JChfYWlnaXRwaWxvdF9nZW5lcmF0ZSkKICAgICAgcHJpbnRmICJcMDMzWzJLIiA+' +
    'L2Rldi90dHkKICAgICAgaWYgWyAtbiAiJF9NU0ciIF07IHRoZW4KICAgICAgICBfQ01EPSJnaXQg' +
    'Y29tbWl0IC1tIFwiJF9NU0dcIiIKICAgICAgICBfYWlnaXRwaWxvdF9wcm9tcHQgPi9kZXYvdHR5' +
    'CiAgICAgICAgcmVhZCAtZSAtaSAiJF9DTUQiIC1wICIkKHByaW50ZiAnXDAzM1szMm0kXDAzM1sw' +
    'bSAnKSIgRklOQUxfQ01EIDwvZGV2L3R0eSA+L2Rldi90dHkKICAgICAgICBpZiBbIC1uICIkRklO' +
    'QUxfQ01EIiBdOyB0aGVuCiAgICAgICAgICBldmFsICIkRklOQUxfQ01EIgogICAgICAgIGZpCiAg' +
    'ICAgICAgcmV0dXJuCiAgICAgIGZpCiAgICBmaQogIGZpCgogIGNvbW1hbmQgZ2l0ICIkQCIKfQoK' +
    'IyDilIDilIAgc2hvcnRjdXRzIOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKU' +
    'gOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKU' +
    'gOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgAphZGQoKSB7' +
    'CiAgZ2l0IGFkZCAuCn0KCnB1c2goKSB7CiAgbG9jYWwgYnJhbmNoCiAgYnJhbmNoPSQoY29tbWFu' +
    'ZCBnaXQgcmV2LXBhcnNlIC0tYWJicmV2LXJlZiBIRUFEIDI+L2Rldi9udWxsKQogIGNvbW1hbmQg' +
    'Z2l0IHB1c2ggb3JpZ2luICIkYnJhbmNoIiAiJEAiCn0KCnB1bGwoKSB7CiAgbG9jYWwgYnJhbmNo' +
    'CiAgYnJhbmNoPSQoY29tbWFuZCBnaXQgcmV2LXBhcnNlIC0tYWJicmV2LXJlZiBIRUFEIDI+L2Rl' +
    'di9udWxsKQogIGNvbW1hbmQgZ2l0IHB1bGwgb3JpZ2luICIkYnJhbmNoIiAiJEAiCn0KCnN0YXR1' +
    'cygpIHsKICBjb21tYW5kIGdpdCBzdGF0dXMgLS1zaG9ydAp9CgphYm9ydCgpIHsKICBjb21tYW5k' +
    'IGdpdCBtZXJnZSAtLWFib3J0ICIkQCIKfQoKcygpICAgICAgeyBjb21tYW5kIGdpdCBzdGF0dXMg' +
    'LS1zaG9ydDsgfQpsb2coKSAgICB7IGNvbW1hbmQgZ2l0IGxvZyAtLW9uZWxpbmUgLS1ncmFwaCAt' +
    'LWRlY29yYXRlIC0xNSAiJEAiOyB9CmNvKCkgICAgIHsgY29tbWFuZCBnaXQgY2hlY2tvdXQgIiRA' +
    'IjsgfQpjYigpICAgICB7IGNvbW1hbmQgZ2l0IGNoZWNrb3V0IC1iICIkQCI7IH0KYnIoKSAgICAg' +
    'eyBjb21tYW5kIGdpdCBicmFuY2ggIiRAIjsgfQpmZXRjaCgpICB7IGNvbW1hbmQgZ2l0IGZldGNo' +
    'ICIkQCI7IH0Kc3Rhc2goKSAgeyBjb21tYW5kIGdpdCBzdGFzaCAiJEAiOyB9CnBvcCgpICAgIHsg' +
    'Y29tbWFuZCBnaXQgc3Rhc2ggcG9wICIkQCI7IH0KZGlmZigpICAgeyBjb21tYW5kIGdpdCBkaWZm' +
    'ICIkQCI7IH0Kc3RhZ2VkKCkgeyBjb21tYW5kIGdpdCBkaWZmIC0tY2FjaGVkICIkQCI7IH0KdW5k' +
    'bygpICAgeyBjb21tYW5kIGdpdCByZXNldCAtLXNvZnQgSEVBRH4xOyB9CmFtZW5kKCkgIHsgY29t' +
    'bWFuZCBnaXQgY29tbWl0IC0tYW1lbmQgLS1uby1lZGl0OyB9Cm1lcmdlKCkgIHsgY29tbWFuZCBn' +
    'aXQgbWVyZ2UgIiRAIjsgfQpyZWJhc2UoKSB7IGNvbW1hbmQgZ2l0IHJlYmFzZSAiJEAiOyB9CnRh' +
    'ZygpICAgIHsgY29tbWFuZCBnaXQgdGFnICIkQCI7IH0KY2xvbmUoKSAgeyBjb21tYW5kIGdpdCBj' +
    'bG9uZSAiJEAiOyB9CgptYXMoKSB7IGNvbW1hbmQgZ2l0IHB1bGwgb3JpZ2luIG1hc3RlciAiJEAi' +
    'OyB9Cm1uKCkgIHsgY29tbWFuZCBnaXQgcHVsbCBvcmlnaW4gbWFpbiAiJEAiOyB9CmQoKSAgIHsg' +
    'Y29tbWFuZCBnaXQgcHVsbCBvcmlnaW4gZGV2ZWxvcCAiJEAiOyB9Cg==',
    'base64'
  ).toString('utf8');

  fs.writeFileSync(msgScript, msgScriptContent, { mode: 0o755 });
  fs.writeFileSync(shellFile, shellContent, { mode: 0o755 });

  // Source in .bashrc and .zshrc
  const sourceLine = '\n# AI Git Pilot\n[ -f "$HOME/.git-hooks/aigitpilot-shell.sh" ] && . "$HOME/.git-hooks/aigitpilot-shell.sh"\n';
  for (const rc of [path.join(os.homedir(), '.bashrc'), path.join(os.homedir(), '.zshrc')]) {
    try {
      const existing = fs.existsSync(rc) ? fs.readFileSync(rc, 'utf8') : '';
      if (!existing.includes('aigitpilot-shell.sh')) {
        fs.appendFileSync(rc, sourceLine, 'utf8');
      }
    } catch { /* rc may not exist on this OS */ }
  }
}
async function installGlobalHook(): Promise<void> {
  const hooksDir  = path.join(os.homedir(), '.git-hooks');
  const hookFile  = path.join(hooksDir, 'prepare-commit-msg');
  const batFile   = path.join(hooksDir, 'prepare-commit-msg.bat');
  const configDir = path.join(os.homedir(), '.config', 'aigitpilot');
  const configFile = path.join(configDir, 'config.json');

  fs.mkdirSync(hooksDir, { recursive: true });
  fs.mkdirSync(configDir, { recursive: true });

  // Write current config for the hook to read
  const config = {
    provider: cfg<string>('provider', 'ollama'),
    ollamaUrl: cfg<string>('ollamaUrl', 'http://localhost:11434'),
    ollamaModel: cfg<string>('ollamaModel', 'qwen2.5-coder:7b'),
    groqApiKey: cfg<string>('groqApiKey', ''),
    groqModel: cfg<string>('groqModel', 'llama-3.3-70b-versatile'),
    geminiApiKey: cfg<string>('geminiApiKey', ''),
    style: cfg<string>('style', 'conventional'),
    language: cfg<string>('language', 'english'),
    customInstructions: cfg<string>('customInstructions', ''),
  };
  fs.writeFileSync(configFile, JSON.stringify(config, null, 2), 'utf8');

  const hookScript = `#!/bin/sh
# AI Git Pilot â€” auto-generated hook
COMMIT_MSG_FILE="$1"
COMMIT_SOURCE="$2"

# Skip if message already provided
[ "$COMMIT_SOURCE" = "message" ] && exit 0
[ "$COMMIT_SOURCE" = "merge" ] && exit 0
[ "$COMMIT_SOURCE" = "squash" ] && exit 0

CONFIG="$HOME/.config/aigitpilot/config.json"
[ ! -f "$CONFIG" ] && exit 0

HOOKS_DIR=$(dirname "$0")
JQ="jq"
command -v jq >/dev/null 2>&1 || {
  [ -f "$HOOKS_DIR/jq.exe" ] && JQ="$HOOKS_DIR/jq.exe" || exit 0
}
command -v curl >/dev/null 2>&1 || exit 0

PROVIDER=$($JQ -r '.provider // "ollama"' "$CONFIG")
STYLE=$($JQ -r '.style // "conventional"' "$CONFIG")
LANG=$($JQ -r '.language // "english"' "$CONFIG")
CUSTOM=$($JQ -r '.customInstructions // ""' "$CONFIG")

DIFF=$(git diff --cached --stat 2>/dev/null)
[ -z "$DIFF" ] && exit 0

if [ "$STYLE" = "conventional" ]; then
  STYLE_GUIDE="Use Conventional Commits: type(scope): description. Types: feat,fix,docs,refactor,chore,test,perf. Max 72 chars."
else
  STYLE_GUIDE="Write a short clear commit message under 72 chars."
fi

EXTRA=""
[ -n "$CUSTOM" ] && EXTRA="Extra: $CUSTOM"
PROMPT="Write a git commit message in $LANG. $STYLE_GUIDE $EXTRA Output ONLY the message.\\n\\nDiff summary:\\n$DIFF"

MESSAGE=""

if [ "$PROVIDER" = "ollama" ]; then
  OLLAMA_URL=$($JQ -r '.ollamaUrl // "http://localhost:11434"' "$CONFIG")
  MODEL=$($JQ -r '.ollamaModel // "qwen2.5-coder:7b"' "$CONFIG")
  ESCAPED=$(printf '%s' "$PROMPT" | $JQ -Rs .)
  RESPONSE=$(curl -sf "$OLLAMA_URL/api/generate" \\
    -H "Content-Type: application/json" \\
    -d "{\\"model\\":\\"$MODEL\\",\\"prompt\\":$ESCAPED,\\"stream\\":false}" 2>/dev/null)
  MESSAGE=$(echo "$RESPONSE" | $JQ -r '.response // empty' 2>/dev/null)

elif [ "$PROVIDER" = "groq" ]; then
  KEY=$($JQ -r '.groqApiKey // ""' "$CONFIG")
  GMODEL=$($JQ -r '.groqModel // "llama-3.3-70b-versatile"' "$CONFIG")
  [ -z "$KEY" ] && exit 0
  ESCAPED=$(printf '%s' "$PROMPT" | $JQ -Rs .)
  RESPONSE=$(curl -sf "https://api.groq.com/openai/v1/chat/completions" \\
    -H "Authorization: Bearer $KEY" \\
    -H "Content-Type: application/json" \\
    -d "{\\"model\\":\\"$GMODEL\\",\\"messages\\":[{\\"role\\":\\"user\\",\\"content\\":$ESCAPED}],\\"max_tokens\\":300}" 2>/dev/null)
  MESSAGE=$(echo "$RESPONSE" | $JQ -r '.choices[0].message.content // empty' 2>/dev/null)

elif [ "$PROVIDER" = "gemini" ]; then
  KEY=$($JQ -r '.geminiApiKey // ""' "$CONFIG")
  [ -z "$KEY" ] && exit 0
  ESCAPED=$(printf '%s' "$PROMPT" | $JQ -Rs .)
  RESPONSE=$(curl -sf "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=$KEY" \\
    -H "Content-Type: application/json" \\
    -d "{\\"contents\\":[{\\"parts\\":[{\\"text\\":$ESCAPED}]}]}" 2>/dev/null)
  MESSAGE=$(echo "$RESPONSE" | $JQ -r '.candidates[0].content.parts[0].text // empty' 2>/dev/null)
fi

if [ -n "$MESSAGE" ]; then
  printf '%s' "$MESSAGE" > "$COMMIT_MSG_FILE"
  printf "\n\\\\033[1;36m\xE2\x9C\xA8 AI Git Pilot:\\\\033[0m \\\\033[0;33m%s\\\\033[0m\n\n" "$MESSAGE"
fi
exit 0
`;

  fs.writeFileSync(hookFile, hookScript, { mode: 0o755 });

  // Windows .bat wrapper
  const gitShPath = 'C:\\Program Files\\Git\\bin\\sh.exe';
  const batScript = `@echo off\r\n"${gitShPath}" "%~dp0prepare-commit-msg" %*\r\n`;
  fs.writeFileSync(batFile, batScript, 'utf8');

  // Install shell integration
  await installShellIntegration(hooksDir);

  // Set global hooks path
  try {
    await exec(`git config --global core.hooksPath "${hooksDir}"`);
    vscode.window.showInformationMessage(`AI Git Pilot: Global hook installed at ${hooksDir}. Works in all git clients.`);
  } catch (e) {
    vscode.window.showErrorMessage(`AI Git Pilot: Hook files written but git config failed: ${e}`);
  }
}

// â”€â”€ setup wizard â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

async function runSetup(): Promise<void> {
  const provider = await vscode.window.showQuickPick([
    { label: '$(vm) Ollama (Recommended)', description: 'Free, private, unlimited â€” runs locally', value: 'ollama' },
    { label: '$(cloud) Groq', description: 'Free cloud API â€” fastest inference, 1000 req/day', value: 'groq' },
    { label: '$(globe) Google Gemini', description: 'Free cloud API â€” 1500 req/day', value: 'gemini' },
    { label: '$(link) OpenRouter', description: 'Free models via OpenRouter', value: 'openrouter' },
  ], { title: 'AI Git Pilot: Choose AI Provider', placeHolder: 'Select provider' });

  if (!provider) { return; }

  const config = vscode.workspace.getConfiguration('aigitpilot');
  await config.update('provider', provider.value, vscode.ConfigurationTarget.Global);

  if (provider.value === 'ollama') {
    const model = await vscode.window.showQuickPick([
      { label: 'qwen2.5-coder:7b', description: 'Recommended â€” code-optimized, fast, 8GB RAM' },
      { label: 'llama3.2:3b',      description: 'Smallest â€” works on 4GB RAM, decent quality' },
      { label: 'llama3.1:8b',      description: 'General purpose, good quality' },
      { label: 'codellama:7b',     description: 'Meta code model' },
    ], { title: 'AI Git Pilot: Choose Ollama Model' });
    if (model) { await config.update('ollamaModel', model.label, vscode.ConfigurationTarget.Global); }
    vscode.window.showInformationMessage(
      'Run: ollama pull ' + (model?.label || 'qwen2.5-coder:7b'),
      'Open Ollama Docs'
    ).then(action => {
      if (action) { vscode.env.openExternal(vscode.Uri.parse('https://ollama.com')); }
    });
  } else if (provider.value === 'groq') {
    const key = await vscode.window.showInputBox({ prompt: 'Paste your Groq API key (free at console.groq.com)', password: true });
    if (key) { await config.update('groqApiKey', key, vscode.ConfigurationTarget.Global); }
  } else if (provider.value === 'gemini') {
    const key = await vscode.window.showInputBox({ prompt: 'Paste your Gemini API key (free at aistudio.google.com)', password: true });
    if (key) { await config.update('geminiApiKey', key, vscode.ConfigurationTarget.Global); }
  } else if (provider.value === 'openrouter') {
    const key = await vscode.window.showInputBox({ prompt: 'Paste your OpenRouter API key (free at openrouter.ai)', password: true });
    if (key) { await config.update('openrouterApiKey', key, vscode.ConfigurationTarget.Global); }
  }

  const style = await vscode.window.showQuickPick([
    { label: 'conventional', description: 'feat(scope): description â€” Conventional Commits standard' },
    { label: 'short',        description: 'Single short line, no prefix' },
    { label: 'detailed',     description: 'Summary + body explaining WHY' },
  ], { title: 'AI Git Pilot: Commit Message Style' });
  if (style) { await config.update('style', style.label, vscode.ConfigurationTarget.Global); }

  vscode.window.showInformationMessage('AI Git Pilot setup complete! Click âœ¨ in Source Control to generate.', 'Install Global Hook').then(action => {
    if (action) { installGlobalHook(); }
  });
}

// â”€â”€ main command â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

async function generateCommitMessage(): Promise<void> {
  const repoRoot = await getRepoRoot();
  if (!repoRoot) {
    vscode.window.showErrorMessage('AI Git Pilot: No git repository found in workspace.');
    return;
  }

  // Check staged files
  let stagedStat = '';
  try { stagedStat = await exec('git diff --cached --name-only', repoRoot); } catch { /* ignore */ }
  if (!stagedStat.trim()) {
    vscode.window.showWarningMessage('AI Git Pilot: No staged changes. Run git add first.');
    return;
  }

  await vscode.window.withProgress({
    location: vscode.ProgressLocation.SourceControl,
    title: 'AI Git Pilot: Generating commit messageâ€¦',
    cancellable: false,
  }, async () => {
    try {
      const diff    = await getStagedDiff(repoRoot);
      if (!diff) {
        vscode.window.showWarningMessage('AI Git Pilot: Could not read staged diff.');
        return;
      }
      const prompt  = await buildPrompt(diff, repoRoot);
      const message = await generateMessage(prompt);

      if (!message) {
        vscode.window.showErrorMessage('AI Git Pilot: AI returned an empty response. Check your provider settings.');
        return;
      }

      // Inject into Source Control input box
      const gitExtension = vscode.extensions.getExtension('vscode.git')?.exports;
      const api = gitExtension?.getAPI(1);
      if (api?.repositories?.length) {
        api.repositories[0].inputBox.value = message;
      } else {
        // Fallback: copy to clipboard
        await vscode.env.clipboard.writeText(message);
        vscode.window.showInformationMessage('AI Git Pilot: Copied to clipboard â€” paste into commit message box.');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('ECONNREFUSED') || msg.includes('ENOTFOUND')) {
        const action = await vscode.window.showErrorMessage(
          `AI Git Pilot: Cannot reach ${cfg<string>('provider', 'ollama')}. Is it running?`,
          'Setup Provider'
        );
        if (action) { runSetup(); }
      } else {
        vscode.window.showErrorMessage(`AI Git Pilot: ${msg}`);
      }
    }
  });
}

// â”€â”€ activate â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€


// -- auto requirements --------------------------------------------------------

function downloadFile(url: string, dest: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    const doGet = (u: string) => {
      https.get(u, res => {
        if (res.statusCode === 301 || res.statusCode === 302) {
          doGet(res.headers.location as string);
          return;
        }
        if (res.statusCode !== 200) { reject(new Error(`HTTP ${res.statusCode}`)); return; }
        res.pipe(file);
        file.on('finish', () => { file.close(); resolve(); });
        file.on('error', reject);
      }).on('error', reject);
    };
    doGet(url);
  });
}

async function ensureRequirements(hooksDir: string): Promise<void> {
  const jqInHooks = path.join(hooksDir, 'jq.exe');
  const jqInPath  = await exec('jq --version').then(() => true).catch(() => false);
  const jqBundled = fs.existsSync(jqInHooks);

  if (jqInPath || jqBundled) { return; }

  if (process.platform !== 'win32') {
    vscode.window.showWarningMessage('AI Git Pilot: Terminal hook needs jq. Run: brew install jq  or  apt install jq');
    return;
  }

  try {
    await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: 'AI Git Pilot: Downloading jq for terminal hook...', cancellable: false },
      () => downloadFile(
        'https://github.com/jqlang/jq/releases/download/jq-1.7.1/jq-windows-amd64.exe',
        jqInHooks
      )
    );
    fs.chmodSync(jqInHooks, 0o755);
  } catch {
    vscode.window.showWarningMessage('AI Git Pilot: Could not download jq. Terminal hook disabled until jq is installed.');
  }
}
function openManual(context: vscode.ExtensionContext): void {
  const manualUri = vscode.Uri.joinPath(context.extensionUri, 'MANUAL.md');
  vscode.commands.executeCommand('markdown.showPreview', manualUri);
}

export function activate(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('aigitpilot.generate', generateCommitMessage),
    vscode.commands.registerCommand('aigitpilot.setup', runSetup),
    vscode.commands.registerCommand('aigitpilot.installHook', installGlobalHook),
    vscode.commands.registerCommand('aigitpilot.openManual', () => openManual(context)),
  );

  // First-run setup prompt
  const hasSetup = context.globalState.get<boolean>('setupDone');
  if (!hasSetup) {
    vscode.window.showInformationMessage(
      'AI Git Pilot: Generate AI commit messages for free. Set up your provider.',
      'Setup Now', 'Later'
    ).then(action => {
      if (action === 'Setup Now') {
        runSetup();
        context.globalState.update('setupDone', true);
      }
    });
  }

  // Auto-install global hook and requirements on every activate
  const hooksDir = require('path').join(require('os').homedir(), '.git-hooks');
  ensureRequirements(hooksDir).then(() => installGlobalHook()).catch(() => { /* silent */ });
}

export function deactivate(): void { /* nothing */ }

