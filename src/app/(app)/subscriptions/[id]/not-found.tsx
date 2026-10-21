import { EmptyState } from "@/components/ui/panel";
import { LinkButton } from "@/components/ui/button";

export default function NotFound() {
  return (
    <EmptyState title="Subscription not found" action={<LinkButton href="/subscriptions">Back to subscriptions</LinkButton>}>
      It may have been removed, or you may not have access to it.
    </EmptyState>
  );
}
