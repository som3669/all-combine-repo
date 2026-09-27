# AI Git Pilot shell integration for bash and zsh (aigitpilot:managed).
# Installed by the AI Git Pilot VS Code extension, which overwrites local edits.
# Sourced from ~/.bashrc / ~/.zshrc. Only interactive shells get the git wrapper and
# the shortcuts; scripts and tools that source your rc file keep plain commands.

case $- in *i*) ;; *) return 0 ;; esac

AIGITPILOT_DIR="$HOME/.git-hooks"
AIGITPILOT_SUGGEST_ON_ADD=1
AIGITPILOT_SHORTCUTS=1
[ -f "$HOME/.config/aigitpilot/shell.env" ] && . "$HOME/.config/aigitpilot/shell.env"

# Tools can copy these functions into their own non-interactive shells, so every
# function checks again at run time and falls back to the real command.
_aigitpilot_on() { case $- in *i*) return 0 ;; esac; return 1; }
_aigitpilot_tty() { _aigitpilot_on && [ -t 0 ] && [ -t 1 ]; }

# Only these extra flags keep `git commit` ours; anything else goes straight to git.
_aigitpilot_plain_commit() {
  local arg
  for arg in "$@"; do
    case "$arg" in
      -s | --signoff | -n | --no-verify | -q | --quiet | -v | --verbose | -S | -S* | --gpg-sign | --gpg-sign=* | --no-gpg-sign) ;;
      *) return 1 ;;
    esac
  done
  return 0
}

# Generates a message for the staged changes and lets you edit it before committing.
# Extra arguments are passed to git commit. Returns 1 when no message came back.
_aigitpilot_offer() {
  local msg answer
  printf '\033[36m✨ AI Git Pilot: writing a commit message...\033[0m'
  msg=$(sh "$AIGITPILOT_DIR/aigitpilot-message.sh" 2>/dev/null)
  printf '\r\033[2K'
  if [ -z "$msg" ]; then
    printf '\033[33mAI Git Pilot: no message came back. Check the provider with "AI Git Pilot: Setup" in VS Code.\033[0m\n'
    return 1
  fi
  case "$msg" in
    *$'\n'*)
      printf '\033[1;36m✨ AI Git Pilot\033[0m\n%s\n\n' "$msg"
      printf 'Commit with this message? [Y]es / [e]dit / [n]o: '
      read -r answer </dev/tty
      case "$answer" in
        '' | y | Y | yes) command git commit -m "$msg" "$@" ;;
        e | E | edit) command git commit -e -m "$msg" "$@" ;;
        *) printf 'Not committed.\n' ;;
      esac
      ;;
    *)
      answer=$msg
      if [ -n "$ZSH_VERSION" ]; then
        vared -p '%F{green}$%f git commit -m ' answer
      elif [ "${BASH_VERSINFO[0]:-0}" -ge 4 ]; then
        read -r -e -i "$msg" -p $'\001\033[32m\002$\001\033[0m\002 git commit -m ' answer </dev/tty
      else
        printf '\033[32m$\033[0m git commit -m %s\n' "$msg"
        printf 'Commit with this message? [Y/n]: '
        read -r answer </dev/tty
        case "$answer" in '' | y | Y | yes) answer=$msg ;; *) answer='' ;; esac
      fi
      if [ -n "$answer" ]; then
        command git commit -m "$answer" "$@"
      else
        printf 'Not committed.\n'
      fi
      ;;
  esac
  return 0
}

function git {
  if _aigitpilot_tty; then
    case "$1" in
      add)
        command git "$@" || return
        [ "$AIGITPILOT_SUGGEST_ON_ADD" = 1 ] || return 0
        case " $* " in *' -n '* | *' --dry-run '* | *' -h '* | *' --help '*) return 0 ;; esac
        command git diff --cached --quiet 2>/dev/null
        [ $? -eq 1 ] || return 0
        _aigitpilot_offer
        return 0
        ;;
      commit)
        shift
        if _aigitpilot_plain_commit "$@"; then
          command git diff --cached --quiet 2>/dev/null
          if [ $? -eq 1 ]; then
            _aigitpilot_offer "$@" && return
            AIGITPILOT_SKIP=1 command git commit "$@"
            return
          fi
        fi
        set -- commit "$@"
        ;;
    esac
  fi
  command git "$@"
}

[ "$AIGITPILOT_SHORTCUTS" = 1 ] || return 0

# Shortcuts. The `function name` form keeps your own aliases of the same name working.
function add    { _aigitpilot_on || { command add "$@"; return; }; if [ $# -eq 0 ]; then git add .; else git add "$@"; fi; }
function push   { _aigitpilot_on || { command push "$@"; return; }; command git push origin "$(command git rev-parse --abbrev-ref HEAD 2>/dev/null)" "$@"; }
function pull   { _aigitpilot_on || { command pull "$@"; return; }; command git pull origin "$(command git rev-parse --abbrev-ref HEAD 2>/dev/null)" "$@"; }
function status { _aigitpilot_on || { command status "$@"; return; }; command git status --short "$@"; }
function abort  { _aigitpilot_on || { command abort "$@"; return; }; command git merge --abort "$@"; }
function s      { _aigitpilot_on || { command s "$@"; return; }; command git status --short "$@"; }
function log    { _aigitpilot_on || { command log "$@"; return; }; command git log --oneline --graph --decorate -15 "$@"; }
function co     { _aigitpilot_on || { command co "$@"; return; }; command git checkout "$@"; }
function cb     { _aigitpilot_on || { command cb "$@"; return; }; command git checkout -b "$@"; }
function br     { _aigitpilot_on || { command br "$@"; return; }; command git branch "$@"; }
function fetch  { _aigitpilot_on || { command fetch "$@"; return; }; command git fetch "$@"; }
function stash  { _aigitpilot_on || { command stash "$@"; return; }; command git stash "$@"; }
function pop    { _aigitpilot_on || { command pop "$@"; return; }; command git stash pop "$@"; }
function diff   { _aigitpilot_on || { command diff "$@"; return; }; command git diff "$@"; }
function staged { _aigitpilot_on || { command staged "$@"; return; }; command git diff --cached "$@"; }
function undo   { _aigitpilot_on || { command undo "$@"; return; }; command git reset --soft HEAD~1; }
function amend  { _aigitpilot_on || { command amend "$@"; return; }; command git commit --amend --no-edit "$@"; }
function merge  { _aigitpilot_on || { command merge "$@"; return; }; command git merge "$@"; }
function rebase { _aigitpilot_on || { command rebase "$@"; return; }; command git rebase "$@"; }
function tag    { _aigitpilot_on || { command tag "$@"; return; }; command git tag "$@"; }
function clone  { _aigitpilot_on || { command clone "$@"; return; }; command git clone "$@"; }
function mas    { _aigitpilot_on || { command mas "$@"; return; }; command git pull origin master "$@"; }
function mn     { _aigitpilot_on || { command mn "$@"; return; }; command git pull origin main "$@"; }
function d      { _aigitpilot_on || { command d "$@"; return; }; command git pull origin develop "$@"; }
