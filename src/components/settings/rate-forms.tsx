"use client";

import { useActionState } from "react";
import { Field, SubmitButton, inputCls } from "@/components/ui/form";
import { COMMON_CURRENCIES } from "@/domain/constants";
import type { RateFormState } from "@/app/(app)/settings/actions";

type Action = (prev: RateFormState, formData: FormData) => Promise<RateFormState>;

function Banner({ state }: { state: RateFormState }) {
  if (!state.message) return null;
  return (
    <p
      role={state.ok ? "status" : "alert"}
      className={`rounded-md border p-3 text-sm sm:col-span-2 ${state.ok ? "border-ok/40 bg-ok/10" : "border-danger/40 bg-danger/10"}`}
    >
      {state.message}
    </p>
  );
}

export function AddRateForm({ action }: { action: Action }) {
  const [state, formAction] = useActionState<RateFormState, FormData>(action, {});
  const v = (n: string) => state.values?.[n] ?? "";
  const err = (n: string) => state.errors?.[n];
  return (
    <form action={formAction} noValidate className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
      <div className="lg:col-span-5"><Banner state={state} /></div>
      <Field label="From" name="base_currency" required error={err("base_currency")} hint="1 unit of this…">
        <input id="base_currency" name="base_currency" list="rate-currencies" maxLength={3} defaultValue={v("base_currency") || "USD"} className={`${inputCls} uppercase`} />
      </Field>
      <Field label="To" name="quote_currency" required error={err("quote_currency")} hint="…equals this many">
        <input id="quote_currency" name="quote_currency" list="rate-currencies" maxLength={3} defaultValue={v("quote_currency") || "PHP"} className={`${inputCls} uppercase`} />
      </Field>
      <Field label="Rate" name="rate" required error={err("rate")} hint="Up to 8 decimals">
        <input id="rate" name="rate" inputMode="decimal" defaultValue={v("rate")} className={inputCls} />
      </Field>
      <Field label="Effective date" name="effective_date" required error={err("effective_date")}>
        <input id="effective_date" name="effective_date" type="date" defaultValue={v("effective_date")} className={inputCls} />
      </Field>
      <Field label="Source" name="source" hint="e.g. BSP, finance team">
        <input id="source" name="source" defaultValue={v("source")} className={inputCls} />
      </Field>
      <datalist id="rate-currencies">{COMMON_CURRENCIES.map((c) => <option key={c} value={c} />)}</datalist>
      <div className="lg:col-span-5"><SubmitButton pendingText="Saving…">Add rate</SubmitButton></div>
    </form>
  );
}

export function CorrectRateForm({ action, rate, source }: { action: Action; rate: string; source: string }) {
  const [state, formAction] = useActionState<RateFormState, FormData>(action, {});
  return (
    <form action={formAction} noValidate className="grid gap-3 rounded-md border border-border bg-background p-3 sm:grid-cols-3">
      <div className="sm:col-span-3"><Banner state={state} /></div>
      <Field id="fix-rate" label="Rate" name="rate" required error={state.errors?.rate}>
        <input id="fix-rate" name="rate" inputMode="decimal" defaultValue={state.values?.rate ?? rate} className={inputCls} />
      </Field>
      <Field id="fix-source" label="Source" name="source">
        <input id="fix-source" name="source" defaultValue={state.values?.source ?? source} className={inputCls} />
      </Field>
      <div className="flex items-end"><SubmitButton variant="secondary" pendingText="Saving…">Save correction</SubmitButton></div>
    </form>
  );
}

export function ImportRatesForm({ action }: { action: Action }) {
  const [state, formAction] = useActionState<RateFormState, FormData>(action, {});
  return (
    <form action={formAction} className="space-y-3">
      <Banner state={state} />
      {state.rowErrors && state.rowErrors.length > 0 && (
        <ul className="max-h-40 list-disc space-y-0.5 overflow-auto rounded-md border border-border bg-background p-3 pl-7 text-xs">
          {state.rowErrors.slice(0, 50).map((e) => <li key={`${e.line}-${e.message}`}>Line {e.line}: {e.message}</li>)}
          {state.rowErrors.length > 50 && <li>…and {state.rowErrors.length - 50} more.</li>}
        </ul>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <input type="file" name="file" accept=".csv,text/csv" aria-label="CSV file" className="text-sm" />
        <SubmitButton variant="secondary" pendingText="Importing…">Import CSV</SubmitButton>
      </div>
    </form>
  );
}
