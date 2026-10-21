"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ForbiddenError, requireEditor, requireUser } from "@/lib/auth";
import { parseRate, parseRatesCsv } from "@/domain/exchange-rates";

export type RateFormState = {
  errors?: Record<string, string>;
  message?: string;
  /** Set after a CSV import that did not redirect, so the outcome can be listed. */
  ok?: boolean;
  rowErrors?: { line: number; message: string }[];
  values?: Record<string, string>;
};

const MAX_FILE_BYTES = 256 * 1024;

function rawValues(formData: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of formData.entries()) if (typeof v === "string") out[k] = v;
  return out;
}

function friendly(error: { code?: string; message: string }): string {
  if (error.code === "23505") return "A rate for that currency pair and date already exists. An admin can correct it in the table.";
  if (error.code === "42501" || /row-level security/i.test(error.message)) return "You do not have permission to do that.";
  if (error.code === "23514") return "One of the values is not allowed by the database rules.";
  return "The rate could not be saved. Please try again.";
}

async function editor() {
  try {
    return { user: await requireEditor() };
  } catch (e) {
    if (e instanceof ForbiddenError) return { message: e.message };
    throw e;
  }
}

export async function addRateAction(_prev: RateFormState, formData: FormData): Promise<RateFormState> {
  const g = await editor();
  if ("message" in g) return { message: g.message };

  const values = rawValues(formData);
  const parsed = parseRate(values);
  if (!parsed.ok) return { errors: parsed.errors, values };

  const supabase = await createClient();
  const { error } = await supabase.from("exchange_rates").insert(parsed.value);
  if (error) return { message: friendly(error), values };

  revalidatePath("/settings");
  redirect("/settings?saved=rate_saved");
}

/** Admin-only correction of an existing rate (the pair and date stay fixed; they are the record's identity). */
export async function correctRateAction(id: string, _prev: RateFormState, formData: FormData): Promise<RateFormState> {
  const user = await requireUser();
  if (!user.isAdmin) return { message: "Only an admin can correct an existing exchange rate." };

  const values = rawValues(formData);
  const supabase = await createClient();
  const { data: existing } = await supabase.from("exchange_rates").select("*").eq("id", id).maybeSingle();
  if (!existing) return { message: "That rate no longer exists.", values };

  const parsed = parseRate({
    base_currency: existing.base_currency,
    quote_currency: existing.quote_currency,
    effective_date: existing.effective_date,
    rate: values.rate,
    source: values.source,
  });
  if (!parsed.ok) return { errors: parsed.errors, values };

  const { data, error } = await supabase
    .from("exchange_rates")
    .update({ rate: parsed.value.rate, source: parsed.value.source })
    .eq("id", id)
    .select("id");
  if (error) return { message: friendly(error), values };
  if (!data || data.length === 0) return { message: "You do not have permission to do that.", values };

  revalidatePath("/settings");
  redirect("/settings?saved=rate_saved");
}

/**
 * Imports a CSV (base_currency, quote_currency, rate, effective_date, source). Editors can only add,
 * so rows that already exist are skipped and reported rather than overwritten.
 */
export async function importRatesAction(_prev: RateFormState, formData: FormData): Promise<RateFormState> {
  const g = await editor();
  if ("message" in g) return { message: g.message };

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { message: "Choose a CSV file to import." };
  if (file.size > MAX_FILE_BYTES) return { message: "That file is too large (256 KB max)." };

  const parsed = parseRatesCsv(await file.text());
  if (parsed.valid.length === 0) {
    return { message: "Nothing was imported.", rowErrors: parsed.errors };
  }

  const supabase = await createClient();
  const dates = parsed.valid.map((r) => r.effective_date).sort();
  const { data: existing, error: readError } = await supabase
    .from("exchange_rates")
    .select("base_currency, quote_currency, effective_date")
    .gte("effective_date", dates[0])
    .lte("effective_date", dates[dates.length - 1])
    .limit(5000);
  if (readError) return { message: friendly(readError) };

  const have = new Set((existing ?? []).map((r) => `${r.base_currency}/${r.quote_currency}/${r.effective_date}`));
  const fresh = parsed.valid.filter((r) => !have.has(`${r.base_currency}/${r.quote_currency}/${r.effective_date}`));
  const skipped = parsed.valid.length - fresh.length;

  if (fresh.length > 0) {
    const { error } = await supabase.from("exchange_rates").insert(fresh);
    if (error) return { message: friendly(error) };
  }

  revalidatePath("/settings");
  const bits = [`Imported ${fresh.length} rate${fresh.length === 1 ? "" : "s"}`];
  if (skipped) bits.push(`${skipped} already existed and were skipped`);
  if (parsed.errors.length) bits.push(`${parsed.errors.length} row${parsed.errors.length === 1 ? "" : "s"} had errors and were not imported`);
  return { ok: true, message: `${bits.join("; ")}.`, rowErrors: parsed.errors };
}
