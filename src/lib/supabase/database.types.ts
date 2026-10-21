/**
 * Typed view of the database. Mirrors supabase/migrations by hand; if you have the Supabase CLI,
 * regenerate with: npx supabase gen types typescript --project-id <ref> > this file.
 * NOTE: PostgREST returns numeric columns as JSON numbers at runtime even though they are typed
 * string here. Always wrap them in `new Decimal(String(x))` before doing arithmetic; never add them as floats.
 */

export type AppRole = "admin" | "editor" | "viewer";
export type SubscriptionStatus =
  | "active"
  | "pending"
  | "under_review"
  | "cancellation_requested"
  | "expired"
  | "archived";
export type BillingFrequency =
  | "monthly"
  | "quarterly"
  | "semi_annual"
  | "annual"
  | "multi_year"
  | "one_time"
  | "custom";
export type Category =
  | "infrastructure"
  | "monitoring"
  | "security"
  | "developer_tools"
  | "saas"
  | "database"
  | "other";
export type Criticality = "critical" | "high" | "medium" | "low";
export type ChangeType =
  | "initial"
  | "increase"
  | "decrease"
  | "plan_change"
  | "discount"
  | "correction"
  | "other";
export type AlertType =
  | "renewal_approaching"
  | "cancellation_deadline"
  | "subscription_expiring"
  | "payment_card_expiring"
  | "payment_card_expired"
  | "cost_increase"
  | "marked_for_review"
  | "missing_details"
  | "potential_duplicate"
  | "newly_registered"
  | "delivery_failure";
export type AlertSeverity = "info" | "warning" | "critical";
export type AlertStatus = "open" | "acknowledged" | "resolved";
export type DeliveryStatus = "sent" | "failed" | "skipped";

type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

type Table<Row, Required extends keyof Row> = {
  Row: Row;
  Insert: Partial<Row> & Pick<Row, Required>;
  Update: Partial<Row>;
  Relationships: [];
};

export type AppSettingRow = { key: string; value: Json; updated_by: string | null; updated_at: string };
export type UserProfileRow = {
  id: string;
  email: string;
  display_name: string | null;
  role: AppRole;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};
export type TeamRow = {
  id: string;
  name: string;
  description: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
};
export type ProductRow = {
  id: string;
  name: string;
  description: string | null;
  owner_team_id: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
};
export type PaymentMethodRow = {
  id: string;
  label: string;
  last_four: string;
  expiry_month: number;
  expiry_year: number;
  responsible_team_id: string | null;
  cardholder_note: string | null;
  notes: string | null;
  retired_at: string | null;
  created_at: string;
  updated_at: string;
};
export type SubscriptionRow = {
  id: string;
  name: string;
  vendor: string;
  description: string | null;
  business_purpose: string | null;
  product_id: string | null;
  responsible_team_id: string | null;
  owner_id: string | null;
  category: Category;
  billing_frequency: BillingFrequency;
  cycle_months: number | null;
  auto_renew: boolean | null;
  next_billing_date: string | null;
  next_renewal_date: string | null;
  start_date: string | null;
  expiration_date: string | null;
  cancellation_notice_days: number | null;
  payment_method_id: string | null;
  status: SubscriptionStatus;
  cost_center: string | null;
  criticality: Criticality | null;
  notes: string | null;
  archived_at: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};
export type CostHistoryRow = {
  id: string;
  subscription_id: string;
  effective_from: string;
  effective_to: string | null;
  amount: string;
  currency: string;
  billing_frequency: BillingFrequency;
  cycle_months: number | null;
  normalized_monthly: string | null;
  change_type: ChangeType;
  reason: string | null;
  recorded_by: string | null;
  recorded_at: string;
  updated_at: string;
};
export type SubscriptionDocumentRow = {
  id: string;
  subscription_id: string;
  title: string;
  url: string;
  created_by: string | null;
  created_at: string;
};
export type ExchangeRateRow = {
  id: string;
  base_currency: string;
  quote_currency: string;
  rate: string;
  effective_date: string;
  source: string | null;
  recorded_by: string | null;
  recorded_at: string;
};
export type AlertRuleRow = {
  alert_type: AlertType;
  enabled: boolean;
  reminder_days: number[];
  actionable: boolean;
  recurring_reminders: boolean;
  updated_by: string | null;
  updated_at: string;
};
export type SubscriptionAlertRow = {
  id: string;
  subscription_id: string | null;
  payment_method_id: string | null;
  alert_type: AlertType;
  severity: AlertSeverity;
  title: string;
  detail: string | null;
  due_date: string | null;
  reminder_days: number | null;
  dedupe_key: string;
  status: AlertStatus;
  acknowledged_by: string | null;
  acknowledged_at: string | null;
  resolved_by: string | null;
  resolved_at: string | null;
  payload: Json;
  created_at: string;
  updated_at: string;
};
export type NotificationDeliveryRow = {
  id: string;
  alert_id: string;
  channel: "google_chat";
  attempt: number;
  status: DeliveryStatus;
  http_status: number | null;
  error_message: string | null;
  attempted_at: string;
};
export type AuditLogRow = {
  id: number;
  occurred_at: string;
  actor_id: string | null;
  actor_email: string | null;
  entity_table: string;
  entity_id: string | null;
  action: string;
  before_data: Json | null;
  after_data: Json | null;
};
export type CurrentCostRow = {
  subscription_id: string;
  cost_id: string;
  amount: string;
  currency: string;
  billing_frequency: BillingFrequency;
  cycle_months: number | null;
  normalized_monthly: string | null;
  effective_from: string;
  effective_to: string | null;
};

/** Flat row from the subscription_inventory view (names + today's price). */
export type InventoryRow = SubscriptionRow & {
  product_name: string | null;
  team_name: string | null;
  owner_name: string | null;
  card_label: string | null;
  card_last_four: string | null;
  card_expiry_month: number | null;
  card_expiry_year: number | null;
  card_retired_at: string | null;
  current_amount: string | null;
  current_currency: string | null;
  current_frequency: BillingFrequency | null;
  current_cycle_months: number | null;
  current_normalized_monthly: string | null;
};

export type Database = {
  public: {
    Tables: {
      app_settings: Table<AppSettingRow, "key" | "value">;
      user_profiles: Table<UserProfileRow, "id" | "email">;
      teams: Table<TeamRow, "name">;
      products: Table<ProductRow, "name">;
      payment_methods: Table<PaymentMethodRow, "label" | "last_four" | "expiry_month" | "expiry_year">;
      subscriptions: Table<SubscriptionRow, "name" | "vendor" | "billing_frequency">;
      subscription_cost_history: Table<
        CostHistoryRow,
        "subscription_id" | "effective_from" | "amount" | "currency" | "billing_frequency"
      >;
      subscription_documents: Table<SubscriptionDocumentRow, "subscription_id" | "title" | "url">;
      exchange_rates: Table<
        ExchangeRateRow,
        "base_currency" | "quote_currency" | "rate" | "effective_date"
      >;
      alert_rules: Table<AlertRuleRow, "alert_type">;
      subscription_alerts: Table<
        SubscriptionAlertRow,
        "alert_type" | "severity" | "title" | "dedupe_key"
      >;
      notification_deliveries: Table<NotificationDeliveryRow, "alert_id" | "status">;
      audit_logs: Table<AuditLogRow, "entity_table" | "action">;
    };
    Views: {
      subscription_current_cost: { Row: CurrentCostRow; Relationships: [] };
      subscription_inventory: { Row: InventoryRow; Relationships: [] };
    };
    Functions: {
      create_subscription: {
        Args: {
          p_subscription: Json;
          p_amount?: number | string | null;
          p_currency?: string | null;
          p_cost_effective_from?: string | null;
          p_reason?: string | null;
        };
        Returns: SubscriptionRow;
      };
      record_cost_change: {
        Args: {
          p_subscription_id: string;
          p_effective_from: string;
          p_amount: number | string;
          p_currency: string;
          p_billing_frequency: BillingFrequency;
          p_cycle_months: number | null;
          p_reason?: string | null;
          p_change_type?: ChangeType;
        };
        Returns: CostHistoryRow;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
