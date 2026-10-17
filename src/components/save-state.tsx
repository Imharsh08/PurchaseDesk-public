/** Beside a Save button: whether there is anything to save ("No changes" / "Unsaved changes"). */
export function SaveState({ dirty }: { dirty: boolean }) {
  return dirty ? (
    <span className="text-sm font-medium text-amber-700 dark:text-amber-400">Unsaved changes</span>
  ) : (
    <span className="text-sm text-muted-foreground">No changes</span>
  );
}
