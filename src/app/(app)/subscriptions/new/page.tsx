import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { SubscriptionForm } from "@/components/subscriptions/subscription-form";
import { createSubscriptionAction } from "../actions";
import { loadFormOptions } from "@/data/reference";
import { requireUser } from "@/lib/auth";

export const metadata: Metadata = { title: "New subscription" };

export default async function NewSubscriptionPage() {
  const [user, options] = await Promise.all([requireUser(), loadFormOptions()]);

  if (!user.canEdit) {
    return (
      <>
        <PageHeader title="New subscription" />
        <p className="rounded-md border border-border bg-surface p-4 text-sm">
          Your role ({user.role}) is read-only. Ask an admin for editor access.{" "}
          <Link href="/subscriptions" className="text-accent underline">Back to subscriptions</Link>
        </p>
      </>
    );
  }

  return (
    <>
      <PageHeader title="New subscription" description="Fields marked * are required. Everything else can be added later." />
      <SubscriptionForm mode="create" action={createSubscriptionAction} options={options} cancelHref="/subscriptions" />
    </>
  );
}
