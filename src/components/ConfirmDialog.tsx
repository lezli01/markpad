import { useEffect, useRef } from "react";

type ConfirmDialogProps = {
  open: boolean;
  title: string;
  message: string;
  onSave(): void;
  onDiscard(): void;
  onCancel(): void;
};

const dialogShell =
  "m-auto rounded-lg border border-[color:var(--border)] bg-[color:var(--panel)] shadow-xl p-6 max-w-md backdrop:bg-black/40 text-[color:var(--text)]";

const buttonBase =
  "inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium text-[color:var(--text)] border border-[color:var(--border)] bg-transparent hover:bg-[color:var(--hover)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent)] transition-colors";

const buttonPrimary =
  "inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium text-[color:var(--accent-fg)] border border-transparent bg-[color:var(--accent)] hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent)] transition-opacity";

export default function ConfirmDialog({
  open,
  title,
  message,
  onSave,
  onDiscard,
  onCancel,
}: ConfirmDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  return (
    <dialog
      ref={dialogRef}
      onCancel={(e) => {
        e.preventDefault();
        onCancel();
      }}
      className={dialogShell}
      aria-labelledby="confirm-dialog-title"
      aria-describedby="confirm-dialog-message"
    >
      <h2 id="confirm-dialog-title" className="text-base font-semibold mb-2">
        {title}
      </h2>
      <p id="confirm-dialog-message" className="text-sm mb-4">
        {message}
      </p>
      <div className="flex justify-end gap-2">
        <button type="button" autoFocus onClick={onSave} className={buttonPrimary}>
          Save
        </button>
        <button type="button" onClick={onDiscard} className={buttonBase}>
          Discard
        </button>
        <button type="button" onClick={onCancel} className={buttonBase}>
          Cancel
        </button>
      </div>
    </dialog>
  );
}
