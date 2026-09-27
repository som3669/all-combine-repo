#!/bin/sh
# AI Git Pilot (aigitpilot:managed): prints an AI commit message for the staged changes.
# Prints nothing when something is missing or fails, so callers fall back quietly.
# Installed by the AI Git Pilot VS Code extension, which overwrites local edits.
# The prompt text mirrors src/prompt.ts; keep the two in step.

CONFIG="$HOME/.config/aigitpilot/config.json"
[ -f "$CONFIG" ] || exit 0
DIR=$(cd "$(dirname "$0")" && pwd)
if command -v jq >/dev/null 2>&1; then
  JQ=jq
elif [ -f "$DIR/jq.exe" ]; then
  JQ="$DIR/jq.exe"
else
  exit 0
fi
command -v curl >/dev/null 2>&1 || exit 0
git rev-parse --git-dir >/dev/null 2>&1 || exit 0

# One jq call turns the config into shell variables (@sh quotes every value).
SETTINGS=$("$JQ" -r '
  def v(k; d): (.[k] | if . == null or . == "" then d else . end);
  v("provider"; "ollama") as $p
  | @sh "PROVIDER=\($p)",
    @sh "STYLE=\(v("style"; "conventional"))",
    @sh "MAX=\(v("maxDiffSize"; 8000) | tostring)",
    @sh "MATCH=\(v("matchRepoStyle"; true) | tostring)",
    @sh "OLLAMA_URL=\(v("ollamaUrl"; "http://localhost:11434") | sub("/+$"; ""))",
    @sh "MODEL=\(if $p == "ollama" then v("ollamaModel"; "qwen2.5-coder:7b")
                elif $p == "groq" then v("groqModel"; "openai/gpt-oss-20b")
                elif $p == "gemini" then v("geminiModel"; "gemini-flash-latest") | sub("^models/"; "")
                else v("openrouterModel"; "openrouter/free") end)",
    @sh "KEY=\(if $p == "ollama" then "" else v($p + "ApiKey"; "") end)",
    "EXCLUDES=\([v("excludeFiles"; [])[] | select(type == "string" and . != "")
                 | ":(exclude,glob)" + (if test("/") then . else "**/" + . end)] | @sh | @sh)"
' "$CONFIG" 2>/dev/null | tr -d '\r')
eval "$SETTINGS"
[ -n "$PROVIDER" ] || exit 0
case "$MAX" in '' | *[!0-9]*) MAX=8000 ;; esac

FILES=$(git -c core.quotePath=false diff --cached --name-status -M 2>/dev/null)
[ -n "$FILES" ] || exit 0
STAT=$(git diff --cached --shortstat 2>/dev/null)
BRANCH=$(git symbolic-ref --short -q HEAD 2>/dev/null)
RECENT=""
[ "$MATCH" = true ] && RECENT=$(git log -n 10 --no-merges --pretty=format:'- %s' 2>/dev/null)

eval "set -- $EXCLUDES"
DIFF=$(git -c core.quotePath=false diff --cached --no-color --no-ext-diff -M -- "$@" 2>/dev/null | head -c "$((MAX + 1))")
NOTE=""
if [ "$(printf '%s' "$DIFF" | wc -c)" -gt "$MAX" ]; then
  DIFF=$(printf '%s' "$DIFF" | head -c "$MAX")
  NOTE=" (cut to the first $MAX characters; the file list above is complete)"
fi
[ -n "$DIFF" ] || DIFF="(no text diff: only excluded or binary files changed)"

PROMPT=$(
  [ -n "$BRANCH" ] && printf 'Branch: %s\n\n' "$BRANCH"
  [ -n "$RECENT" ] && printf 'Recent commit subjects in this repository. Follow the required format; use these only for scopes, ticket references and wording:\n%s\n\n' "$RECENT"
  printf 'Changed files (staged):\n%s\n%s\n\n' "$FILES" "$STAT"
  printf 'Diff%s:\n%s\n' "$NOTE" "$DIFF"
)

case "$PROVIDER" in
  ollama)
    URL="$OLLAMA_URL/api/chat"
    ANSWER='.message.content' ;;
  groq)
    URL="https://api.groq.com/openai/v1/chat/completions"
    ANSWER='.choices[0].message.content' ;;
  openrouter)
    URL="https://openrouter.ai/api/v1/chat/completions"
    ANSWER='.choices[0].message.content' ;;
  gemini)
    URL="https://generativelanguage.googleapis.com/v1beta/models/$MODEL:generateContent"
    ANSWER='[.candidates[0].content.parts[]? | select(.thought != true) | .text // empty] | join("")' ;;
  *) exit 0 ;;
esac

set -- -H "Content-Type: application/json"
case "$PROVIDER" in
  ollama) ;;
  gemini) [ -n "$KEY" ] || exit 0; set -- "$@" -H "x-goog-api-key: $KEY" ;;
  openrouter) [ -n "$KEY" ] || exit 0; set -- "$@" -H "Authorization: Bearer $KEY" -H "X-Title: AI Git Pilot" ;;
  *) [ -n "$KEY" ] || exit 0; set -- "$@" -H "Authorization: Bearer $KEY" ;;
esac

# The request body is built inside jq from the config file, so no free text is passed as an
# argument (Git Bash rewrites arguments that look like paths before jq.exe sees them).
BODY='
  def v(k; d): (.[k] | if . == null or . == "" then d else . end);
  $cfg[0] as $c | . as $user
  | ($c.systemPrompt // ("Write a git commit message in " + ($c.language // "english")
      + ". Reply with the commit message only.")) as $system
  | if $p == "gemini" then
      {systemInstruction: {parts: [{text: $system}]},
       contents: [{role: "user", parts: [{text: $user}]}],
       generationConfig: {temperature: 0.3}}
    else
      {messages: [{role: "system", content: $system}, {role: "user", content: $user}]}
      + if $p == "ollama" then
          {model: ($c | v("ollamaModel"; "qwen2.5-coder:7b")), stream: false, options: {temperature: 0.3}}
        elif $p == "groq" then
          {model: ($c | v("groqModel"; "openai/gpt-oss-20b")), temperature: 0.3, max_tokens: 1024}
        else
          {model: ($c | v("openrouterModel"; "openrouter/free")), temperature: 0.3, max_tokens: 1024}
        end
    end'
MESSAGE=$(printf '%s' "$PROMPT" \
  | "$JQ" -Rsc --arg p "$PROVIDER" --slurpfile cfg "$CONFIG" "$BODY" 2>/dev/null \
  | curl -sS --connect-timeout 5 --max-time 60 "$@" --data-binary @- "$URL" 2>/dev/null \
  | "$JQ" -r "($ANSWER) // empty" 2>/dev/null)

# Tidy what models add around the message: reasoning blocks, code fences, a preamble line,
# wrapping quotes, trailing spaces and surrounding blank lines.
MESSAGE=$(printf '%s\n' "$MESSAGE" | awk '
  { sub(/\r$/, "") }
  /<think>/ { thinking = 1 }
  thinking {
    if ($0 !~ /<\/think>/) next
    thinking = 0
    sub(/.*<\/think>/, "")
  }
  /^[ \t]*```/ { next }
  { line[++n] = $0 }
  END {
    s = 1; while (s <= n && line[s] ~ /^[ \t]*$/) s++
    e = n; while (e >= s && line[e] ~ /^[ \t]*$/) e--
    if (s > e) exit
    low = tolower(line[s])
    if (s < e && (low ~ /^(here is|here'\''s|sure)[^:]*:[ \t]*$/ || low ~ /^commit message:[ \t]*$/)) {
      s++; while (s <= e && line[s] ~ /^[ \t]*$/) s++
    }
    sub(/^[Cc]ommit [Mm]essage:[ \t]*/, "", line[s])
    q = substr(line[s], 1, 1)
    if ((q == "\"" || q == "`" || q == "'\''") && length(line[e]) > 1 && substr(line[e], length(line[e]), 1) == q) {
      line[s] = substr(line[s], 2)
      line[e] = substr(line[e], 1, length(line[e]) - 1)
    }
    for (i = s; i <= e; i++) { sub(/[ \t]+$/, "", line[i]); print line[i] }
  }')
[ "$STYLE" = short ] && MESSAGE=$(printf '%s\n' "$MESSAGE" | head -n 1)
printf '%s' "$MESSAGE"
