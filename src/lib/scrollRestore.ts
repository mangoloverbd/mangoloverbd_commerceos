// Lets a page that restored its own scroll position tell the shell layout not
// to reset it to the top. React runs a page's layout effects before its parent
// layout's in the same commit, so the page marks first and the layout consumes.
let restoredPath: string | null = null;

export function markScrollRestored(path: string) {
  restoredPath = path;
}

/** True once if the page at `path` restored its scroll; always clears the mark. */
export function consumeScrollRestored(path: string): boolean {
  const hit = restoredPath === path;
  restoredPath = null;
  return hit;
}
