import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { SubscriptionForm } from "@/components/subscriptions/subscription-form";
import { updateSubscriptionAction } from "../../actions";
import { loadFormOptions } from "@/data/reference";
import { getSubscription } from "@/data/subscriptions";
import { requireUser } from "@/lib/auth";

export const metadata: Metadata = { title: "Edit subscription" };

export default async function EditSubscriptionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [user, sub, options] = await Promise.all([requireUser(), getSubscription(id), loadFormOptions()]);
  if (!sub) notFound();
  if (!user.canEdit || sub.status === "archived") redirect(`/subscriptions/${id}`);

  const s = (v: unknown) => (v == null ? "" : String(v));
  const initial: Record<string, string> = {
    name: s(sub.name), vendor: s(sub.vendor), description: s(sub.description),
    business_purpose: s(sub.business_purpose), product_id: s(sub.product_id),
    responsible_team_id: s(sub.responsible_team_id), owner_id: s(sub.owner_id),
    category: s(sub.category), billing_frequency: s(sub.billing_frequency),
    cycle_months: sub.billing_frequency === "multi_year" || sub.billing_frequency === "custom" ? s(sub.cycle_months) : "",
    auto_renew: sub.auto_renew == null ? "" : sub.auto_renew ? "yes" : "no",
    next_billing_date: s(sub.next_billing_date), next_renewal_date: s(sub.next_renewal_date),
    start_date: s(sub.start_date), expiration_date: s(sub.expiration_date),
    cancellation_notice_days: s(sub.cancellation_notice_days), payment_method_id: s(sub.payment_method_id),
    status: s(sub.status), cost_center: s(sub.cost_center), criticality: s(sub.criticality), notes: s(sub.notes),
  };

  return (
    <>
      <PageHeader
        title={`Edit ${sub.name}`}
        description={sub.vendor}
        actions={<Link href={`/subscriptions/${id}`} className="text-sm text-accent underline">Back to details</Link>}
      />
      <SubscriptionForm
        mode="edit"
        action={updateSubscriptionAction.bind(null, id)}
        options={options}
        initial={initial}
        cancelHref={`/subscriptions/${id}`}
      />
    </>
  );
}
