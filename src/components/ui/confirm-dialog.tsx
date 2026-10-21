"use client";

import { useRef } from "react";
import { SubmitButton } from "@/components/ui/form";

/**
 * Button that opens a modal confirmation before running a server action.
 * Uses the native <dialog> element (focus trap and Esc handling built in).
 */
export function ConfirmAction({
  action,
  trigger,
  title,
  description,
  confirmLabel,
  danger = false,
}: {
  action: (formData: FormData) => void | Promise<void>;
  trigger: string;
  title: string;
  description: string;
  confirmLabel: string;
  danger?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  return (
    <>
      <button
        type="button"
        onClick={() => ref.current?.showModal()}
        className="rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-background"
      >
        {trigger}
      </button>
      <dialog
        ref={ref}
        aria-labelledby="confirm-title"
        className="m-auto w-full max-w-md rounded-xl border border-border bg-surface p-0 text-foreground backdrop:bg-black/40"
      >
        <form action={action} className="space-y-4 p-6">
          <h2 id="confirm-title" className="text-base font-semibold">
            {title}
          </h2>
          <p className="text-sm text-muted">{description}</p>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => ref.current?.close()}
              className="rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-background"
            >
              Cancel
            </button>
            <SubmitButton variant={danger ? "danger" : "primary"} pendingText="Working…">
              {confirmLabel}
            </SubmitButton>
          </div>
        </form>
      </dialog>
    </>
  );
}
