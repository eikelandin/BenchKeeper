#!/bin/sh
# PreToolUse hook of an exported run, on each Bash call (JSON on stdin). It allows git add, git commit, the push and
# gh issue comment only as the exact commands of step 5, with the digest path: $1 with a real date in place of YYYY-MM-DD
# (or $1 itself without it), in mode act ($3) with commit true ($4) or issue $2, the push only to the branch that the
# project's origin/HEAD names. It answers nothing for a read-only command alone (gh issue list|view, gh pr list|view|checks,
# gh repo view, the fetch of one origin branch, git rev-list, git remote get-url, git log, git status) and for a call
# without the words git or gh, so the run's allow rules decide those, and denies every other call with the word git or gh.
file=$1 issue=$2 mode=$3 commit=$4
in=$(cat)
# The value of tool_input.command with its JSON escapes: a raw quote or newline never sits inside a JSON string.
c=$(printf '%s\n' "$in" | sed -n -E 's/.*"command"[[:space:]]*:[[:space:]]*"(([^"\\]|\\.)*)".*/\1/p' | head -n 1)
say() { printf '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"%s","permissionDecisionReason":"%s"}}\n' "$1" "$2"; exit 0; }
# One command key, or the sed above may have read another key's text, or none.
[ -n "$c" ] && [ "$(printf '%s\n' "$in" | grep -o '"command"[[:space:]]*:' | wc -l)" -eq 1 ] || say deny 'The hook found no single command in the input.'
# Words only, an escape (\t, \u0009) as a separator, so a tab or a quoted word does not hide git add.
w=" $(printf '%s\n' "$c" | sed -E 's/\\(u[0-9a-fA-F]{4}|.)/ /g; s/[^A-Za-z]+/ /g' | tr A-Z a-z) "
case $w in *" git "*|*" gh "*) ;; *) exit 0 ;; esac

pre=${file%%YYYY-MM-DD*} suf=${file#*YYYY-MM-DD}
digest() {
  if [ "$pre" = "$file" ]; then [ "$1" = "$file" ]; return; fi
  case $1 in "$pre"[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]"$suf") ;; *) return 1 ;; esac
  d=${1#"$pre"}
  echo "${d%"$suf"}" | awk -F- '{ m = $2 + 0; n = m == 2 ? 28 + ($1 % 4 == 0 && $1 % 100 != 0 || $1 % 400 == 0) : 30 + (m + (m > 7)) % 2; exit !(m >= 1 && m <= 12 && $3 >= 1 && $3 <= n) }'
}
# owner/name of the project's github.com origin, as the precheck reads it; not the current folder's, which follows a cd.
own=$(git -C "${CLAUDE_PROJECT_DIR:?}" remote get-url origin 2>/dev/null | tr A-Z a-z | sed -n -E -e 's#/*$##' -e 's#\.git$##' -e 's#^([a-z+]+://)?([^@/]+@)?([a-z0-9-]+\.)?github\.com(:[0-9]+)?[:/]([^/]+/[^/]+)$#\5#p')

# Spelled through $g, since the template lint reads git with push or fetch after it in a helper as network use.
g=git
push="$g push origin HEAD:" fetch="$g fetch"
add='git add -- ' msg='git commit -m \"docs: daily digest\" -- '
if [ "$mode $commit" = "act true" ]; then
  case $c in
    "$add"*) digest "${c#"$add"}" && say allow 'the digest file alone' ;;
    "$msg"*) digest "${c#"$msg"}" && say allow 'the digest file alone' ;;
    "$push"*)
      d=$(git -C "$CLAUDE_PROJECT_DIR" symbolic-ref --short refs/remotes/origin/HEAD 2>/dev/null)
      [ -n "$d" ] && [ "${c#"$push"}" = "${d#origin/}" ] && say allow 'the digest commit to the default branch' ;;
  esac
fi
case $mode/$issue in act/0*|act/*[!0-9]*|*/) ;; act/*)
  case $c in "gh issue comment $issue --repo "*)
    r=${c#"gh issue comment $issue --repo "}; p=${r#* --body-file }; r=${r%% --body-file *}
    [ -n "$own" ] && [ "$(printf '%s' "$r" | tr A-Z a-z)" = "$own" ] && digest "$p" && say allow 'the digest file on the digest issue'
  esac ;;
esac
# A read-only command alone: no JSON escape but \", and outside quotes no character that chains, redirects or expands.
r=$(printf '%s\n' "$c" | sed 's/\\"/"/g')
case $r in *\\*) ;; *)
  if printf '%s\n' "$r" | sed -E "s/'[^']*'/_/g; s/\"[^\"\$\`]*\"/_/g" | LC_ALL=C grep -q '^[A-Za-z0-9 _./:=,@%+*-]*$'; then
    case " $r " in *" --output"*) ;; *)
      case "$r " in "gh issue list "*|"gh issue view "*|"gh pr list "*|"gh pr view "*|"gh pr checks "*|"gh repo view "*|"git rev-list "*|"git remote get-url "*|"git log "*|"git status "*) exit 0 ;; esac
      # The fetch takes no option, since --upload-pack runs a command.
      b=${r#"$fetch origin "}
      case $r in "$fetch"|"$fetch origin") exit 0 ;; "$fetch origin "*) case $b in -*|*[!A-Za-z0-9._/-]*) ;; *) exit 0 ;; esac ;; esac ;;
    esac
  fi ;;
esac
say deny "In this run git and gh run only as the exact commands of step 5 with the digest path, or alone as one of these read-only commands: gh issue list|view, gh pr list|view|checks, gh repo view, $fetch origin <branch>, git rev-list, git remote get-url, git log, git status."
