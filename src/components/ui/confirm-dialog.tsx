"use client";

import { useRef } from "react";
import { SubmitButton } from "@/components/ui/form";
import { buttonCls } from "@/components/ui/button";

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
        className={buttonCls("secondary")}
      >
        {trigger}
      </button>
      <dialog
        ref={ref}
        aria-labelledby="confirm-title"
        className="m-auto w-full max-w-md rounded-lg border border-border bg-surface-solid p-0 text-foreground shadow-md"
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
              className={buttonCls("secondary")}
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
