"use client";

import Link from "next/link";
import { buttonCls } from "@/components/ui/button";
import { useActionState, useState } from "react";
import { Field, SelectInput, SubmitButton, inputCls } from "@/components/ui/form";
import { CATEGORIES, COMMON_CURRENCIES, CRITICALITIES, FREQUENCIES, STATUSES } from "@/domain/constants";
import type { FormState } from "@/app/(app)/subscriptions/actions";
import type { Option } from "@/data/reference";

type Action = (prev: FormState, formData: FormData) => Promise<FormState>;

export type FormOptions = {
  teams: Option[];
  products: Option[];
  owners: Option[];
  cards: Option[];
};

export function SubscriptionForm({
  action,
  options,
  initial = {},
  mode,
  cancelHref,
}: {
  action: Action;
  options: FormOptions;
  initial?: Record<string, string>;
  mode: "create" | "edit";
  cancelHref: string;
}) {
  const [state, formAction] = useActionState<FormState, FormData>(action, {});
  const [frequency, setFrequency] = useState(state.values?.billing_frequency ?? initial.billing_frequency ?? "monthly");

  const v = (name: string) => state.values?.[name] ?? initial[name] ?? "";
  const err = (name: string) => state.errors?.[name];
  const flexible = frequency === "multi_year" || frequency === "custom";

  return (
    <form action={formAction} className="space-y-6" noValidate>
      {state.message && (
        <p role="alert" className="rounded-md border border-danger/30 bg-danger-wash p-3 text-sm">
          {state.message}
        </p>
      )}

      {state.duplicates && state.duplicates.length > 0 && (
        <div role="alert" className="rounded-md border border-warn/30 bg-warn-wash p-4 text-sm">
          <p className="font-medium">This looks similar to an existing subscription:</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {state.duplicates.map((d) => (
              <li key={d.id}>
                <Link href={`/subscriptions/${d.id}`} className="underline" target="_blank">
                  {d.name} ({d.vendor})
                </Link>{" "}
                <span className="text-muted">· {d.reason}</span>
              </li>
            ))}
          </ul>
          <label className="mt-3 flex items-center gap-2">
            <input type="checkbox" name="confirm_duplicate" value="yes" />
            <span>It is a different subscription. Save it anyway.</span>
          </label>
        </div>
      )}

      <Section n={1} title="Basics">
        <Field label="Subscription name" name="name" required error={err("name")}>
          <input id="name" name="name" defaultValue={v("name")} className={inputCls} aria-invalid={!!err("name")} />
        </Field>
        <Field label="Vendor / provider" name="vendor" required error={err("vendor")}>
          <input id="vendor" name="vendor" defaultValue={v("vendor")} className={inputCls} aria-invalid={!!err("vendor")} />
        </Field>
        <Field label="Category" name="category" error={err("category")}>
          <SelectInput name="category" options={CATEGORIES} defaultValue={v("category") || "other"} />
        </Field>
        <Field label="Status" name="status" error={err("status")}>
          <SelectInput
            name="status"
            options={STATUSES.filter((s) => s.value !== "archived")}
            defaultValue={v("status") || "active"}
          />
        </Field>
        <Field label="Business criticality" name="criticality" error={err("criticality")}>
          <SelectInput name="criticality" options={CRITICALITIES} defaultValue={v("criticality")} placeholder="Not set" />
        </Field>
        <Field label="Cost center / budget" name="cost_center">
          <input id="cost_center" name="cost_center" defaultValue={v("cost_center")} className={inputCls} />
        </Field>
        <Field label="Description" name="description" className="sm:col-span-2">
          <textarea id="description" name="description" rows={2} defaultValue={v("description")} className={inputCls} />
        </Field>
        <Field label="Business purpose" name="business_purpose" className="sm:col-span-2">
          <textarea id="business_purpose" name="business_purpose" rows={2} defaultValue={v("business_purpose")} className={inputCls} />
        </Field>
      </Section>

      <Section n={2} title="Ownership">
        <Field label="Product / service using it" name="product_id" error={err("product_id")}>
          <SelectInput name="product_id" options={options.products} defaultValue={v("product_id")} placeholder="None" />
        </Field>
        <Field label="Responsible team" name="responsible_team_id" error={err("responsible_team_id")}>
          <SelectInput name="responsible_team_id" options={options.teams} defaultValue={v("responsible_team_id")} placeholder="None" />
        </Field>
        <Field label="Internal owner" name="owner_id" error={err("owner_id")}>
          <SelectInput name="owner_id" options={options.owners} defaultValue={v("owner_id")} placeholder="Unassigned" />
        </Field>
        <Field label="Payment method" name="payment_method_id" error={err("payment_method_id")}>
          <SelectInput name="payment_method_id" options={options.cards} defaultValue={v("payment_method_id")} placeholder="None" />
        </Field>
      </Section>

      <Section n={3} title="Billing">
        <Field label="Billing frequency" name="billing_frequency" required error={err("billing_frequency")}>
          <select
            id="billing_frequency"
            name="billing_frequency"
            value={frequency}
            onChange={(e) => setFrequency(e.target.value)}
            className={inputCls}
          >
            {FREQUENCIES.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </select>
        </Field>
        {flexible && (
          <Field label="Cycle length (months)" name="cycle_months" required error={err("cycle_months")} hint="Months between charges, 1–120.">
            <input id="cycle_months" name="cycle_months" type="number" min={1} max={120} defaultValue={v("cycle_months")} className={inputCls} />
          </Field>
        )}
        {mode === "create" ? (
          <>
            <Field label="Billing amount" name="amount" error={err("amount")} hint="Amount charged each cycle. Leave blank if unknown.">
              <input id="amount" name="amount" inputMode="decimal" defaultValue={v("amount")} className={inputCls} placeholder="0.00" />
            </Field>
            <Field label="Currency" name="currency" error={err("currency")}>
              <input id="currency" name="currency" list="currencies" maxLength={3} defaultValue={v("currency")} className={`${inputCls} uppercase`} placeholder="USD" />
              <datalist id="currencies">
                {COMMON_CURRENCIES.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </Field>
            <Field label="Price effective from" name="cost_effective_from" error={err("cost_effective_from")} hint="Defaults to the start date, or today.">
              <input id="cost_effective_from" name="cost_effective_from" type="date" defaultValue={v("cost_effective_from")} className={inputCls} />
            </Field>
          </>
        ) : (
          <p className="text-sm text-muted sm:col-span-2">
            The price is not edited here, so earlier prices are never overwritten. Price changes are recorded from
            the subscription&apos;s cost history.
          </p>
        )}
        <Field label="Auto-renewal" name="auto_renew">
          <SelectInput
            name="auto_renew"
            options={[
              { value: "yes", label: "Yes" },
              { value: "no", label: "No" },
            ]}
            defaultValue={v("auto_renew")}
            placeholder="Unknown"
          />
        </Field>
        <Field label="Cancellation notice (days)" name="cancellation_notice_days" error={err("cancellation_notice_days")}>
          <input id="cancellation_notice_days" name="cancellation_notice_days" type="number" min={0} defaultValue={v("cancellation_notice_days")} className={inputCls} />
        </Field>
      </Section>

      <Section n={4} title="Dates">
        <Field label="Start date" name="start_date" error={err("start_date")}>
          <input id="start_date" name="start_date" type="date" defaultValue={v("start_date")} className={inputCls} />
        </Field>
        <Field label="Expiration date" name="expiration_date" error={err("expiration_date")}>
          <input id="expiration_date" name="expiration_date" type="date" defaultValue={v("expiration_date")} className={inputCls} />
        </Field>
        <Field label="Next billing date" name="next_billing_date" error={err("next_billing_date")}>
          <input id="next_billing_date" name="next_billing_date" type="date" defaultValue={v("next_billing_date")} className={inputCls} />
        </Field>
        <Field label="Next renewal date" name="next_renewal_date" error={err("next_renewal_date")}>
          <input id="next_renewal_date" name="next_renewal_date" type="date" defaultValue={v("next_renewal_date")} className={inputCls} />
        </Field>
      </Section>

      <Section n={5} title="Notes">
        <Field label="Notes and remarks" name="notes" className="sm:col-span-2">
          <textarea id="notes" name="notes" rows={3} defaultValue={v("notes")} className={inputCls} />
        </Field>
      </Section>

      <div className="flex justify-end gap-2">
        <Link href={cancelHref} className={buttonCls("secondary")}>
          Cancel
        </Link>
        <SubmitButton>{mode === "create" ? "Create subscription" : "Save changes"}</SubmitButton>
      </div>
    </form>
  );
}

function Section({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <fieldset className="rounded-lg border border-border bg-surface p-5 shadow-sm">
      <legend className="px-1 text-sm font-semibold">
        <span className="mr-2 inline-flex h-5 w-5 items-center justify-center rounded-full bg-accent/10 text-xs text-accent">
          {n}
        </span>
        {title}
      </legend>
      <div className="mt-3 grid gap-4 sm:grid-cols-2">{children}</div>
    </fieldset>
  );
}
