import { supportedShells, type SupportedShell } from "./types.js";

export function parseShell(value: string): SupportedShell {
  if ((supportedShells as readonly string[]).includes(value)) return value as SupportedShell;
  throw new Error(`Unsupported shell: ${value}\nSupported shells: ${supportedShells.join(", ")}`);
}

export function getCompletionScript(shell: SupportedShell): string {
  switch (shell) {
    case "bash": return bashScript;
    case "zsh": return zshScript;
    case "fish": return fishScript;
  }
}

const bashScript = `# bsk shell completion for bash
_bsk_completion() {
  local completions cur
  cur="\${COMP_WORDS[COMP_CWORD]}"
  mapfile -t completions < <(COMP_LINE="$COMP_LINE" COMP_POINT="$COMP_POINT" bsk __complete --shell bash 2>/dev/null)
  if [[ "\${completions[0]}" == "__BSK_COMPLETE_FILES__" ]]; then
    mapfile -t COMPREPLY < <(compgen -f -- "$cur")
    return 0
  fi
  COMPREPLY=("\${completions[@]}")
  return 0
}
complete -F _bsk_completion bsk
`;

const zshScript = `#compdef bsk
# bsk shell completion for zsh
_bsk() {
  local -a completions
  completions=(\${(f)$(bsk __complete --shell zsh --line "$BUFFER" --point "$CURSOR" 2>/dev/null)})
  if [[ "\${completions[1]}" == "__BSK_COMPLETE_FILES__" ]]; then
    _files
    return
  fi
  _describe 'bsk completions' completions
}
compdef _bsk bsk
`;

const fishScript = String.raw`# bsk shell completion for fish
function __bsk_complete_raw
  bsk __complete --shell fish --line (commandline -cp) --point (commandline -C) 2>/dev/null
end

function __bsk_needs_files
  set -l completions (__bsk_complete_raw)
  test (count $completions) -gt 0; and test "$completions[1]" = "__BSK_COMPLETE_FILES__"
end

function __bsk_complete
  set -l completions (__bsk_complete_raw)
  if test (count $completions) -gt 0; and test "$completions[1]" = "__BSK_COMPLETE_FILES__"
    return 0
  end
  printf '%s\n' $completions
end

complete -c bsk -n '__bsk_needs_files' -F
complete -c bsk -n 'not __bsk_needs_files' -f -a "(__bsk_complete)"
`;
