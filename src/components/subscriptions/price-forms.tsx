"use client";

import { useActionState, useState } from "react";
import { Field, SelectInput, SubmitButton, inputCls } from "@/components/ui/form";
import { COMMON_CURRENCIES, FREQUENCIES } from "@/domain/constants";
import type { FormState } from "@/app/(app)/subscriptions/actions";

type Action = (prev: FormState, formData: FormData) => Promise<FormState>;

const CHANGE_TYPES = [
  { value: "increase", label: "Price increase" },
  { value: "decrease", label: "Price decrease" },
  { value: "plan_change", label: "Plan change" },
  { value: "discount", label: "Discount / promotion" },
  { value: "other", label: "Other" },
];

export type PriceDefaults = { currency: string; billing_frequency: string; cycle_months: string; amount?: string };

function Banner({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p role="alert" className="rounded-md border border-danger/30 bg-danger-wash p-3 text-sm sm:col-span-2">
      {message}
    </p>
  );
}

function BillingFields({
  v,
  err,
  frequency,
  setFrequency,
  idp,
}: {
  idp: string;
  v: (n: string) => string;
  err: (n: string) => string | undefined;
  frequency: string;
  setFrequency: (f: string) => void;
}) {
  const flexible = frequency === "multi_year" || frequency === "custom";
  return (
    <>
      <Field id={`${idp}currency`} label="Currency" name="currency" required error={err("currency")} hint="3-letter code, e.g. USD">
        <input id={`${idp}currency`} name="currency" list="price-currencies" maxLength={3} defaultValue={v("currency")} className={`${inputCls} uppercase`} aria-invalid={!!err("currency")} />
        <datalist id="price-currencies">{COMMON_CURRENCIES.map((c) => <option key={c} value={c} />)}</datalist>
      </Field>
      <Field id={`${idp}billing_frequency`} label="Billing frequency" name="billing_frequency" required error={err("billing_frequency")}>
        <select
          id={`${idp}billing_frequency`}
          name="billing_frequency"
          value={frequency}
          onChange={(e) => setFrequency(e.target.value)}
          className={inputCls}
        >
          {FREQUENCIES.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
        </select>
      </Field>
      {flexible && (
        <Field id={`${idp}cycle_months`} label="Cycle length (months)" name="cycle_months" required error={err("cycle_months")} hint="1–120">
          <input id={`${idp}cycle_months`} name="cycle_months" type="number" min={1} max={120} defaultValue={v("cycle_months")} className={inputCls} aria-invalid={!!err("cycle_months")} />
        </Field>
      )}
    </>
  );
}

/** "Record price change": adds a new effective-dated period; future dates are fine. */
export function RecordPriceForm({ action, defaults }: { action: Action; defaults: PriceDefaults }) {
  const [state, formAction] = useActionState<FormState, FormData>(action, {});
  const [frequency, setFrequency] = useState(state.values?.billing_frequency ?? defaults.billing_frequency);
  const v = (n: string) => state.values?.[n] ?? (defaults as Record<string, string | undefined>)[n] ?? "";
  const err = (n: string) => state.errors?.[n];

  return (
    <form action={formAction} noValidate className="grid gap-3 sm:grid-cols-2">
      <Banner message={state.message} />
      <Field id="rec-amount" label="New amount" name="amount" required error={err("amount")} hint="Per billing cycle, up to 4 decimals">
        <input id="rec-amount" name="amount" inputMode="decimal" defaultValue={state.values?.amount ?? ""} className={inputCls} aria-invalid={!!err("amount")} />
      </Field>
      <Field id="rec-effective_from" label="Effective from" name="effective_from" required error={err("effective_from")} hint="Can be a future date">
        <input id="rec-effective_from" name="effective_from" type="date" defaultValue={v("effective_from")} className={inputCls} aria-invalid={!!err("effective_from")} />
      </Field>
      <BillingFields idp="rec-" v={v} err={err} frequency={frequency} setFrequency={setFrequency} />
      <Field label="Type of change" name="change_type" required error={err("change_type")}>
        <SelectInput name="change_type" options={CHANGE_TYPES} defaultValue={v("change_type") || "increase"} />
      </Field>
      <Field id="rec-reason" label="Reason" name="reason" className="sm:col-span-2" hint="Optional, e.g. vendor notice, plan upgrade">
        <input id="rec-reason" name="reason" defaultValue={v("reason")} className={inputCls} />
      </Field>
      <div className="sm:col-span-2">
        <SubmitButton pendingText="Recording…">Record price change</SubmitButton>
      </div>
    </form>
  );
}

/** Correct an existing record in place. A reason is required and the edit is audited. */
export function CorrectRecordForm({ action, initial }: { action: Action; initial: PriceDefaults }) {
  const [state, formAction] = useActionState<FormState, FormData>(action, {});
  const [frequency, setFrequency] = useState(state.values?.billing_frequency ?? initial.billing_frequency);
  const v = (n: string) => state.values?.[n] ?? (initial as Record<string, string | undefined>)[n] ?? "";
  const err = (n: string) => state.errors?.[n];

  return (
    <form action={formAction} noValidate className="mt-2 grid gap-3 rounded-md border border-border bg-background p-3 sm:grid-cols-2">
      <Banner message={state.message} />
      <Field id="fix-amount" label="Amount" name="amount" required error={err("amount")}>
        <input id="fix-amount" name="amount" inputMode="decimal" defaultValue={v("amount")} className={inputCls} aria-invalid={!!err("amount")} />
      </Field>
      <BillingFields idp="fix-" v={v} err={err} frequency={frequency} setFrequency={setFrequency} />
      <Field id="fix-reason" label="Why is this being corrected?" name="reason" required className="sm:col-span-2" error={err("reason")} hint="Recorded in the audit trail with the old and new values.">
        <input id="fix-reason" name="reason" defaultValue={state.values?.reason ?? ""} className={inputCls} aria-invalid={!!err("reason")} />
      </Field>
      <div className="sm:col-span-2">
        <SubmitButton variant="secondary" pendingText="Saving…">Save correction</SubmitButton>
      </div>
    </form>
  );
}
