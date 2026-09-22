-- Canlı şema dışa aktarımı: 2026-09-22
-- scripts/sema-disa-aktar.sql ile üretildi. Elle düzenlemeyin.
-- Sıra: tipler, sekanslar, tablolar, fonksiyonlar, varsayılanlar,
-- kısıtlar, yabancı anahtarlar, indeksler, görünümler, RLS, politikalar,
-- yetkiler, tetikleyiciler. Fonksiyon gövdeleri tablolar tamamlanmadan
-- denetlenmesin diye:
set check_function_bodies = false;
-- Politikalar ve tetikleyiciler private şemasındaki fonksiyonlara dayanıyor.
create schema if not exists private;

do $t$ begin create type public.membership_role as enum ('owner', 'admin', 'manager', 'member', 'operasyoncu'); exception when duplicate_object then null; end $t$;

do $t$ begin create type public.organization_status as enum ('trial', 'active', 'suspended', 'archived'); exception when duplicate_object then null; end $t$;

do $t$ begin create type public.plan_code as enum ('starter', 'professional', 'enterprise'); exception when duplicate_object then null; end $t$;

create table if not exists public.account_entries (
  id uuid not null,
  organization_id uuid not null,
  party_id uuid not null,
  entry_type text not null,
  source_type text not null,
  amount bigint not null,
  currency text not null,
  description text not null,
  reference_no text,
  transaction_date date not null,
  due_date date,
  created_by uuid not null,
  created_at timestamp with time zone not null
);

create table if not exists public.account_parties (
  id uuid not null,
  organization_id uuid not null,
  party_type text not null,
  name text not null,
  tax_number text,
  tax_office text,
  email text,
  phone text,
  address text,
  is_active boolean not null,
  created_by uuid not null,
  created_at timestamp with time zone not null,
  updated_at timestamp with time zone not null
);

create table if not exists public.activity_logs (
  id bigint generated always as identity not null,
  organization_id uuid not null,
  actor_user_id uuid,
  action text not null,
  entity_type text not null,
  entity_id text,
  metadata jsonb not null,
  created_at timestamp with time zone not null
);

create table if not exists public.arc_collection_products (
  organization_id uuid not null,
  collection_id uuid not null,
  product_id uuid not null,
  "position" integer not null,
  created_at timestamp with time zone not null
);

create table if not exists public.arc_collections (
  id uuid not null,
  organization_id uuid not null,
  title text not null,
  slug text not null,
  description text not null,
  status text not null,
  source text not null,
  seo_title text not null,
  seo_description text not null,
  metadata jsonb not null,
  created_at timestamp with time zone not null,
  updated_at timestamp with time zone not null
);

create table if not exists public.arc_customer_addresses (
  id uuid not null,
  user_id uuid not null,
  title text not null,
  full_name text not null,
  phone text not null,
  city text not null,
  district text not null,
  postal_code text,
  line text not null,
  company_name text,
  tax_office text,
  tax_number text,
  is_billing boolean not null,
  is_shipping boolean not null,
  is_default boolean not null,
  created_at timestamp with time zone not null,
  updated_at timestamp with time zone not null
);

create table if not exists public.arc_customer_favourites (
  id uuid not null,
  user_id uuid not null,
  product_slug text not null,
  created_at timestamp with time zone not null
);

create table if not exists public.arc_discounts (
  id uuid not null,
  organization_id uuid not null,
  name text not null,
  code text,
  discount_type text not null,
  value bigint not null,
  minimum_subtotal bigint not null,
  usage_limit integer,
  usage_count integer not null,
  per_customer_limit integer,
  starts_at timestamp with time zone,
  ends_at timestamp with time zone,
  status text not null,
  combinable boolean not null,
  metadata jsonb not null,
  created_at timestamp with time zone not null,
  updated_at timestamp with time zone not null
);

create table if not exists public.arc_import_batches (
  id uuid not null,
  organization_id uuid not null,
  source text not null,
  kind text not null,
  file_name text,
  status text not null,
  total_rows integer not null,
  imported_rows integer not null,
  skipped_rows integer not null,
  error_rows integer not null,
  metadata jsonb not null,
  created_by uuid,
  created_at timestamp with time zone not null,
  completed_at timestamp with time zone
);

create table if not exists public.arc_import_errors (
  id uuid not null,
  batch_id uuid not null,
  organization_id uuid not null,
  row_key text,
  message text not null,
  payload jsonb not null,
  created_at timestamp with time zone not null
);

create table if not exists public.arc_inventory_movements (
  id uuid not null,
  organization_id uuid not null,
  variant_id uuid not null,
  kind text not null,
  quantity integer not null,
  reference_type text,
  reference_id text,
  note text,
  created_by uuid,
  created_at timestamp with time zone not null
);

create table if not exists public.arc_order_events (
  id uuid not null,
  organization_id uuid not null,
  order_id uuid not null,
  event_type text not null,
  event_data jsonb not null,
  created_by uuid,
  created_at timestamp with time zone not null
);

create table if not exists public.arc_order_items (
  id uuid not null,
  organization_id uuid not null,
  order_id uuid not null,
  variant_id uuid,
  product_name text not null,
  sku text not null,
  quantity integer not null,
  unit_price bigint not null,
  total bigint not null
);

create table if not exists public.arc_orders (
  id uuid not null,
  organization_id uuid not null,
  order_number text not null,
  source text not null,
  external_id text,
  status text not null,
  payment_status text not null,
  customer_email text,
  customer_name text,
  currency text not null,
  subtotal bigint not null,
  tax bigint not null,
  shipping bigint not null,
  total bigint not null,
  metadata jsonb not null,
  created_at timestamp with time zone not null,
  updated_at timestamp with time zone not null,
  user_id uuid
);

create table if not exists public.arc_payment_orders (
  id uuid not null,
  organization_id uuid not null,
  merchant_oid text not null,
  status text not null,
  payment_method text not null,
  currency text not null,
  expected_amount integer not null,
  paid_amount integer,
  customer_email text not null,
  customer_name text not null,
  customer_phone text not null,
  delivery_address jsonb not null,
  basket jsonb not null,
  paytr_test_mode boolean not null,
  payment_type text,
  failure_code text,
  failure_message text,
  callback_received_at timestamp with time zone,
  paid_at timestamp with time zone,
  created_at timestamp with time zone not null,
  updated_at timestamp with time zone not null
);

create table if not exists public.arc_product_variants (
  id uuid not null,
  organization_id uuid not null,
  product_id uuid not null,
  sku text not null,
  title text,
  price bigint not null,
  currency text not null,
  stock integer not null,
  attributes jsonb not null,
  external_id text,
  created_at timestamp with time zone not null,
  updated_at timestamp with time zone not null,
  allow_backorder boolean not null,
  compare_at_price bigint,
  supplier text,
  supplier_sku text,
  cost_price bigint
);

create table if not exists public.arc_products (
  id uuid not null,
  organization_id uuid not null,
  name text not null,
  slug text not null,
  description text not null,
  status text not null,
  source text not null,
  external_id text,
  created_by uuid,
  created_at timestamp with time zone not null,
  updated_at timestamp with time zone not null,
  metadata jsonb not null,
  supplier text,
  supplier_product_code text,
  supplier_synced_at timestamp with time zone,
  tax_rate numeric(5,2)
);

create table if not exists public.arc_return_requests (
  id uuid not null,
  organization_id uuid not null,
  order_id uuid not null,
  user_id uuid,
  items jsonb not null,
  reason text not null,
  note text,
  status text not null,
  status_note text,
  refund_amount bigint,
  refund_reference text,
  created_at timestamp with time zone not null,
  updated_at timestamp with time zone not null,
  resolved_at timestamp with time zone
);

create table if not exists public.arc_store_settings (
  organization_id uuid not null,
  store_name text not null,
  storefront_url text,
  currency text not null,
  locale text not null,
  low_stock_threshold integer not null,
  created_at timestamp with time zone not null,
  updated_at timestamp with time zone not null,
  logo_path text,
  favicon_path text,
  primary_color text not null,
  accent_color text not null,
  custom_domain text,
  platform_subdomain text,
  domain_status text not null,
  domain_verification_token text,
  domain_verified_at timestamp with time zone,
  panel_custom_domain text,
  panel_domain_status text not null,
  panel_domain_verification_token text,
  panel_domain_verified_at timestamp with time zone,
  bank_transfer_enabled boolean not null,
  bank_name text,
  bank_account_holder text,
  bank_iban text,
  bank_transfer_instructions text,
  paytr_enabled boolean not null,
  paytr_test_mode boolean not null,
  paytr_merchant_id text,
  paytr_no_installment boolean not null,
  paytr_max_installment integer not null,
  default_tax_rate numeric(5,2) not null,
  legal_name text,
  trade_name text,
  mersis_no text,
  tax_office text,
  tax_number text,
  trade_registry_no text,
  address_line text,
  address_district text,
  address_city text,
  address_country text,
  contact_email text,
  contact_phone text,
  whatsapp_number text,
  kep_address text,
  etbis_verified boolean,
  paytr_merchant_key_enc text,
  paytr_merchant_salt_enc text,
  order_prefix text not null,
  shipping_fee bigint not null,
  free_shipping_threshold bigint not null,
  bank_transfer_discount_percent numeric not null,
  email_from text,
  email_reply_to text
);

create table if not exists public.arc_store_themes (
  id uuid not null,
  organization_id uuid not null,
  mode text not null,
  version integer not null,
  config jsonb not null,
  updated_by uuid,
  published_at timestamp with time zone,
  created_at timestamp with time zone not null,
  updated_at timestamp with time zone not null
);

create table if not exists public.arc_suppliers (
  id uuid not null,
  organization_id uuid not null,
  code text not null,
  name text not null,
  feed_url text,
  active boolean not null,
  margin_percent integer not null,
  shipping_markup bigint not null,
  round_to_kurus integer not null,
  brand_override text,
  publish_directly boolean not null,
  last_synced_at timestamp with time zone,
  last_sync_note text,
  created_at timestamp with time zone not null,
  updated_at timestamp with time zone not null,
  sync_cursor integer not null,
  sync_total integer not null,
  service_fee bigint not null,
  stock_buffer integer not null
);

create table if not exists public.arvo_modules (
  code text not null,
  name text not null,
  description text not null,
  sort_order integer not null,
  is_active boolean not null
);

create table if not exists public.bank_transactions (
  id uuid not null,
  organization_id uuid not null,
  bank_account_id uuid not null,
  direction text not null,
  amount bigint not null,
  currency text not null,
  transaction_date date not null,
  description text not null,
  reference_no text,
  reconciliation_status text not null,
  matched_invoice_id uuid,
  matched_party_id uuid,
  created_by uuid not null,
  created_at timestamp with time zone not null,
  updated_at timestamp with time zone not null
);

create table if not exists public.billing_customers (
  organization_id uuid not null,
  provider text not null,
  provider_customer_id text,
  billing_email text,
  tax_number text,
  billing_address jsonb not null,
  created_at timestamp with time zone not null,
  updated_at timestamp with time zone not null
);

create table if not exists public.billing_events (
  id uuid not null,
  organization_id uuid,
  provider text not null,
  provider_event_id text not null,
  event_type text not null,
  payload jsonb not null,
  processed_at timestamp with time zone,
  error_message text,
  created_at timestamp with time zone not null
);

create table if not exists public.billing_invoices (
  id uuid not null,
  organization_id uuid not null,
  subscription_id uuid,
  provider text not null,
  provider_invoice_id text,
  status text not null,
  currency text not null,
  subtotal bigint not null,
  tax bigint not null,
  total bigint not null,
  due_at timestamp with time zone,
  paid_at timestamp with time zone,
  invoice_url text,
  created_at timestamp with time zone not null,
  product text not null
);

create table if not exists public.billing_subscriptions (
  id uuid not null,
  organization_id uuid not null,
  provider text not null,
  provider_subscription_id text,
  plan_code plan_code not null,
  status text not null,
  currency text not null,
  unit_amount bigint not null,
  "interval" text not null,
  current_period_start timestamp with time zone,
  current_period_end timestamp with time zone,
  cancel_at_period_end boolean not null,
  canceled_at timestamp with time zone,
  created_at timestamp with time zone not null,
  updated_at timestamp with time zone not null,
  product text not null
);

create table if not exists public.contract_cost_items (
  id uuid not null,
  organization_id uuid not null,
  contract_id uuid not null,
  category text not null,
  description text not null,
  supplier text,
  amount bigint not null,
  cost_date date not null,
  status text not null,
  reference_no text,
  created_by uuid not null,
  created_at timestamp with time zone not null,
  updated_at timestamp with time zone not null
);

create table if not exists public.crm_appointments (
  id uuid not null,
  organization_id uuid not null,
  employee_id uuid not null,
  title text not null,
  contact_name text,
  contact_phone text,
  note text,
  starts_at timestamp with time zone not null,
  ends_at timestamp with time zone,
  status text not null,
  created_by uuid not null,
  created_at timestamp with time zone not null,
  updated_at timestamp with time zone not null
);

create table if not exists public.crm_automation_runs (
  opportunity_id uuid not null,
  organization_id uuid not null,
  workflow_id uuid,
  invoice_id uuid,
  processed_at timestamp with time zone not null,
  created_at timestamp with time zone not null
);

create table if not exists public.crm_contract_addenda (
  id uuid not null,
  organization_id uuid not null,
  contract_id uuid not null,
  opportunity_id uuid not null,
  addendum_no integer not null,
  work_plan jsonb not null,
  payment_dates jsonb not null,
  note text,
  status text not null,
  created_by uuid,
  created_at timestamp with time zone not null,
  responded_at timestamp with time zone,
  responder_name text,
  responder_ip text,
  responder_user_agent text,
  response_note text,
  cancelled_at timestamp with time zone,
  cancelled_by uuid
);

create table if not exists public.crm_contracts (
  id uuid not null,
  organization_id uuid not null,
  opportunity_id uuid not null,
  proposal_id uuid not null,
  contract_no text not null,
  title text not null,
  scope text,
  amount bigint not null,
  currency text not null,
  payment_plan text,
  start_date date,
  due_date date,
  status text not null,
  access_token_hash text not null,
  sent_at timestamp with time zone,
  signed_name text,
  signed_at timestamp with time zone,
  workflow_id uuid,
  created_by uuid not null,
  created_at timestamp with time zone not null,
  updated_at timestamp with time zone not null,
  first_viewed_at timestamp with time zone,
  last_viewed_at timestamp with time zone,
  view_count integer not null,
  party_id uuid,
  payment_plan_id uuid,
  invoice_id uuid,
  signed_ip text,
  signed_user_agent text,
  acceptance_recorded_at timestamp with time zone,
  contract_template_key text,
  contract_template_version text,
  signed_signature_data text,
  customer_address text,
  customer_tax_number text,
  customer_tax_office text,
  payment_plan_type text,
  payment_schedule jsonb,
  tracking_code text not null,
  share_token text,
  service_cost bigint not null,
  service_cost_supplier text,
  service_cost_reference text,
  service_cost_status text not null,
  service_cost_transaction_id uuid,
  legal_text_version text,
  signed_consents jsonb,
  work_plan jsonb,
  tracking_open_before_signature boolean not null,
  subscription_intent jsonb
);

create table if not exists public.crm_internal_comments (
  id uuid not null,
  organization_id uuid not null,
  opportunity_id uuid not null,
  context_type text not null,
  context_id uuid not null,
  body text not null,
  created_by uuid not null,
  created_at timestamp with time zone not null,
  edited_at timestamp with time zone
);

create table if not exists public.crm_opportunities (
  id uuid not null,
  organization_id uuid not null,
  title text not null,
  customer_name text not null,
  contact_email text,
  contact_phone text,
  stage text not null,
  estimated_value bigint not null,
  probability integer not null,
  expected_close_date date,
  owner_user_id uuid,
  source text,
  notes text,
  lost_reason text,
  created_by uuid not null,
  created_at timestamp with time zone not null,
  updated_at timestamp with time zone not null,
  request_details jsonb not null,
  assigned_employee_id uuid
);

create table if not exists public.crm_proposals (
  id uuid not null,
  organization_id uuid not null,
  opportunity_id uuid not null,
  proposal_no text not null,
  title text not null,
  scope text,
  amount bigint not null,
  currency text not null,
  payment_plan text,
  valid_until date,
  status text not null,
  access_token_hash text not null,
  sent_at timestamp with time zone,
  responded_at timestamp with time zone,
  created_by uuid not null,
  created_at timestamp with time zone not null,
  updated_at timestamp with time zone not null,
  first_viewed_at timestamp with time zone,
  last_viewed_at timestamp with time zone,
  view_count integer not null,
  tax_status text not null,
  tax_rate numeric(5,2) not null,
  net_amount bigint not null,
  tax_amount bigint not null,
  gross_amount bigint not null,
  payment_plan_type text not null,
  payment_schedule jsonb not null,
  root_proposal_id uuid,
  previous_revision_id uuid,
  revision_no integer not null,
  revision_note text,
  superseded_at timestamp with time zone,
  superseded_by uuid,
  estimated_delivery_date date,
  response_ip text,
  archived_at timestamp with time zone,
  archive_reason text,
  share_token text,
  response_user_agent text,
  customer_responded_at timestamp with time zone
);

create table if not exists public.crm_requests (
  id uuid not null,
  organization_id uuid not null,
  title text not null,
  customer_name text not null,
  email text,
  phone text,
  status text not null,
  estimated_value numeric(14,2) not null,
  notes text,
  created_by uuid not null,
  created_at timestamp with time zone not null,
  updated_at timestamp with time zone not null
);

create table if not exists public.customer_file_messages (
  id uuid not null,
  organization_id uuid not null,
  contract_id uuid not null,
  workflow_id uuid,
  sender_type text not null,
  sender_user_id uuid,
  sender_name text not null,
  body text not null,
  read_at timestamp with time zone,
  created_at timestamp with time zone not null
);

create table if not exists public.document_access_logs (
  id uuid not null,
  organization_id uuid not null,
  document_type text not null,
  document_id uuid not null,
  access_type text not null,
  actor_user_id uuid,
  access_ip text,
  user_agent text,
  referrer text,
  metadata jsonb not null,
  created_at timestamp with time zone not null
);

create table if not exists public.document_number_sequences (
  organization_id uuid not null,
  document_type text not null,
  sequence_year integer not null,
  prefix text not null,
  last_number bigint not null,
  padding integer not null,
  updated_at timestamp with time zone not null
);

create table if not exists public.finance_transactions (
  id uuid not null,
  organization_id uuid not null,
  transaction_type text not null,
  status text not null,
  title text not null,
  counterparty text,
  category text,
  amount bigint not null,
  currency text not null,
  due_date date,
  paid_at timestamp with time zone,
  notes text,
  created_by uuid not null,
  created_at timestamp with time zone not null,
  updated_at timestamp with time zone not null,
  party_id uuid
);

create table if not exists public.hr_confidentiality_agreements (
  id uuid not null,
  organization_id uuid not null,
  employee_id uuid not null,
  agreement_no text not null,
  agreement_version text not null,
  content_snapshot text not null,
  status text not null,
  signer_name text,
  signature_path text,
  signer_ip inet,
  signer_user_agent text,
  signed_at timestamp with time zone,
  created_by uuid,
  created_at timestamp with time zone not null,
  updated_at timestamp with time zone not null
);

create table if not exists public.hr_departments (
  id uuid not null,
  organization_id uuid not null,
  name text not null,
  code text,
  manager_user_id uuid,
  is_active boolean not null,
  created_at timestamp with time zone not null,
  updated_at timestamp with time zone not null
);

create table if not exists public.hr_employee_commission_rates (
  id uuid not null,
  organization_id uuid not null,
  employee_id uuid not null,
  commission_rate numeric(5,2) not null,
  operation_commission_rate numeric(5,2) not null,
  valid_from timestamp with time zone not null,
  changed_by uuid
);

create table if not exists public.hr_employee_documents (
  id uuid not null,
  organization_id uuid not null,
  employee_id uuid not null,
  file_name text not null,
  storage_path text not null,
  file_size bigint,
  content_type text,
  uploaded_by uuid not null,
  created_at timestamp with time zone not null
);

create table if not exists public.hr_employees (
  id uuid not null,
  organization_id uuid not null,
  user_id uuid,
  department_id uuid,
  employee_no text,
  full_name text not null,
  job_title text,
  email text,
  phone text,
  employment_type text not null,
  employment_status text not null,
  start_date date,
  manager_employee_id uuid,
  can_receive_sales_requests boolean not null,
  created_by uuid,
  created_at timestamp with time zone not null,
  updated_at timestamp with time zone not null,
  commission_rate numeric(5,2) not null,
  operation_commission_rate numeric(5,2) not null
);

create table if not exists public.hr_leave_requests (
  id uuid not null,
  organization_id uuid not null,
  employee_id uuid not null,
  leave_type text not null,
  start_date date not null,
  end_date date not null,
  total_days integer not null,
  reason text,
  status text not null,
  reviewed_by uuid,
  reviewed_at timestamp with time zone,
  review_note text,
  created_by uuid not null,
  created_at timestamp with time zone not null,
  updated_at timestamp with time zone not null
);

create table if not exists public.hr_operation_commissions (
  id uuid not null,
  organization_id uuid not null,
  employee_id uuid not null,
  workflow_id uuid not null,
  contract_id uuid,
  base_amount bigint not null,
  commission_rate numeric(5,2) not null,
  commission_amount bigint not null,
  status text not null,
  accrued_at timestamp with time zone not null,
  approved_at timestamp with time zone,
  paid_at timestamp with time zone,
  created_at timestamp with time zone not null
);

create table if not exists public.hr_sales_commissions (
  id uuid not null,
  organization_id uuid not null,
  employee_id uuid not null,
  opportunity_id uuid,
  payment_installment_id uuid,
  collected_amount bigint not null,
  commission_rate numeric(5,2) not null,
  commission_amount bigint not null,
  status text not null,
  accrued_at timestamp with time zone not null,
  paid_at timestamp with time zone,
  created_at timestamp with time zone not null
);

create table if not exists public.internal_messages (
  id uuid not null,
  organization_id uuid not null,
  channel_id uuid not null,
  sender_id uuid not null,
  body text,
  created_at timestamp with time zone not null,
  edited_at timestamp with time zone,
  attachment_path text,
  attachment_name text,
  attachment_mime text,
  attachment_size bigint,
  deleted_at timestamp with time zone
);

create table if not exists public.message_channel_members (
  channel_id uuid not null,
  organization_id uuid not null,
  user_id uuid not null,
  created_at timestamp with time zone not null,
  channel_created_by uuid,
  channel_direct_key text
);

create table if not exists public.message_channels (
  id uuid not null,
  organization_id uuid not null,
  name text not null,
  description text,
  is_private boolean not null,
  created_by uuid not null,
  created_at timestamp with time zone not null,
  updated_at timestamp with time zone not null,
  channel_type text not null,
  direct_key text,
  last_message_at timestamp with time zone,
  last_message_preview text,
  last_message_sender uuid
);

create table if not exists public.message_read_states (
  organization_id uuid not null,
  channel_id uuid not null,
  user_id uuid not null,
  last_read_at timestamp with time zone not null,
  updated_at timestamp with time zone not null
);

create table if not exists public.notification_user_dismissals (
  notification_id uuid not null,
  user_id uuid not null,
  dismissed_at timestamp with time zone not null
);

create table if not exists public.notification_user_reads (
  notification_id uuid not null,
  user_id uuid not null,
  read_at timestamp with time zone not null
);

create table if not exists public.notifications (
  id uuid not null,
  organization_id uuid,
  user_id uuid,
  audience text not null,
  category text not null,
  title text not null,
  message text not null,
  action_url text,
  metadata jsonb not null,
  read_at timestamp with time zone,
  created_at timestamp with time zone not null
);

create table if not exists public.operation_customer_file_downloads (
  id uuid not null,
  organization_id uuid,
  workflow_id uuid,
  file_id uuid,
  outcome text not null,
  client_ip text,
  user_agent text,
  created_at timestamp with time zone not null
);

create table if not exists public.operation_customer_files (
  id uuid not null,
  organization_id uuid not null,
  workflow_id uuid not null,
  storage_path text not null,
  file_name text not null,
  mime_type text not null,
  size_bytes bigint not null,
  note text,
  access_rule text not null,
  uploaded_by uuid,
  created_at timestamp with time zone not null,
  deleted_at timestamp with time zone,
  deleted_by uuid
);

create table if not exists public.operation_steps (
  id uuid not null,
  organization_id uuid not null,
  workflow_id uuid not null,
  title text not null,
  is_completed boolean not null,
  sort_order integer not null,
  completed_by uuid,
  completed_at timestamp with time zone,
  created_at timestamp with time zone not null
);

create table if not exists public.operation_workflow_comments (
  id uuid not null,
  organization_id uuid not null,
  workflow_id uuid not null,
  body text not null,
  created_by uuid,
  created_at timestamp with time zone not null
);

create table if not exists public.operation_workflows (
  id uuid not null,
  organization_id uuid not null,
  title text not null,
  customer_name text,
  description text,
  status text not null,
  priority text not null,
  start_date date,
  due_date date,
  created_by uuid not null,
  created_at timestamp with time zone not null,
  updated_at timestamp with time zone not null,
  contract_id uuid,
  assigned_employee_id uuid,
  archived_at timestamp with time zone,
  archived_by uuid
);

create table if not exists public.organization_bank_accounts (
  id uuid not null,
  organization_id uuid not null,
  bank_name text not null,
  account_name text,
  iban text not null,
  currency text not null,
  opening_balance bigint not null,
  is_active boolean not null,
  created_by uuid not null,
  created_at timestamp with time zone not null,
  updated_at timestamp with time zone not null
);

create table if not exists public.organization_crm_stages (
  organization_id uuid not null,
  code text not null,
  name text not null,
  probability integer not null,
  sort_order integer not null,
  is_terminal boolean not null,
  is_active boolean not null
);

create table if not exists public.organization_form_templates (
  id uuid not null,
  organization_id uuid not null,
  template_type text not null,
  code text not null,
  name text not null,
  description text,
  schema_json jsonb not null,
  content_html text,
  is_default boolean not null,
  is_active boolean not null,
  created_by uuid,
  created_at timestamp with time zone not null,
  updated_at timestamp with time zone not null
);

create table if not exists public.organization_invitations (
  id uuid not null,
  organization_id uuid not null,
  email text not null,
  role membership_role not null,
  status text not null,
  invited_by uuid not null,
  auth_user_id uuid,
  expires_at timestamp with time zone not null,
  sent_at timestamp with time zone,
  accepted_at timestamp with time zone,
  error_message text,
  created_at timestamp with time zone not null,
  updated_at timestamp with time zone not null
);

create table if not exists public.organization_licenses (
  organization_id uuid not null,
  plan_code plan_code not null,
  license_status text not null,
  trial_started_at timestamp with time zone not null,
  trial_ends_at timestamp with time zone,
  current_period_start timestamp with time zone,
  current_period_end timestamp with time zone,
  user_limit integer not null,
  storage_limit_mb bigint not null,
  ai_credit_limit bigint not null,
  ai_credits_used bigint not null,
  module_limits jsonb not null,
  suspended_at timestamp with time zone,
  suspension_reason text,
  updated_by uuid,
  created_at timestamp with time zone not null,
  updated_at timestamp with time zone not null,
  monthly_fee bigint
);

create table if not exists public.organization_memberships (
  organization_id uuid not null,
  user_id uuid not null,
  role membership_role not null,
  permissions jsonb not null,
  is_active boolean not null,
  joined_at timestamp with time zone not null,
  role_before_management text,
  role_from_management boolean not null
);

create table if not exists public.organization_modules (
  organization_id uuid not null,
  module_code text not null,
  is_enabled boolean not null,
  configuration jsonb not null,
  enabled_at timestamp with time zone not null
);

create table if not exists public.organization_onboarding (
  organization_id uuid not null,
  current_step integer not null,
  legal_name text,
  phone text,
  website text,
  logo_url text,
  primary_color text not null,
  completed_at timestamp with time zone,
  completed_by uuid,
  created_at timestamp with time zone not null,
  updated_at timestamp with time zone not null
);

create table if not exists public.organization_payment_providers (
  organization_id uuid not null,
  provider text not null,
  merchant_id text not null,
  merchant_key_enc text not null,
  merchant_salt_enc text not null,
  is_enabled boolean not null,
  last_test_payment_at timestamp with time zone,
  last_payment_at timestamp with time zone,
  updated_by uuid,
  created_at timestamp with time zone not null,
  updated_at timestamp with time zone not null
);

create table if not exists public.organization_payment_requests (
  id uuid not null,
  organization_id uuid not null,
  bank_account_id uuid,
  plan_code plan_code not null,
  amount bigint not null,
  currency text not null,
  payment_method text not null,
  status text not null,
  receipt_path text,
  reference_no text,
  customer_note text,
  review_note text,
  submitted_by uuid not null,
  reviewed_by uuid,
  reviewed_at timestamp with time zone,
  created_at timestamp with time zone not null,
  updated_at timestamp with time zone not null,
  product text not null
);

create table if not exists public.organization_product_licenses (
  organization_id uuid not null,
  product text not null,
  status text not null,
  plan_code plan_code,
  monthly_fee bigint,
  current_period_start timestamp with time zone,
  current_period_end timestamp with time zone,
  trial_ends_at timestamp with time zone,
  suspended_at timestamp with time zone,
  suspension_reason text,
  updated_by uuid,
  created_at timestamp with time zone not null,
  updated_at timestamp with time zone not null,
  integrated boolean not null,
  limits jsonb not null
);

create table if not exists public.organization_vertical_profiles (
  organization_id uuid not null,
  relationship_type text not null,
  vertical_code text not null,
  display_name text not null,
  legal_name text,
  short_name text,
  brand_config jsonb not null,
  feature_flags jsonb not null,
  created_at timestamp with time zone not null,
  updated_at timestamp with time zone not null
);

create table if not exists public.organizations (
  id uuid not null,
  name text not null,
  slug text not null,
  sector text not null,
  status organization_status not null,
  plan_code plan_code not null,
  custom_domain text,
  created_at timestamp with time zone not null,
  updated_at timestamp with time zone not null,
  provisioning_state text not null,
  logo_url text,
  primary_color text not null,
  document_footer text,
  contact_email text,
  contact_phone text,
  website_url text,
  signature_stamp_url text,
  custom_domain_status text,
  custom_domain_verification jsonb,
  custom_domain_updated_at timestamp with time zone,
  display_name text,
  brand_color text,
  legal_name text,
  legal_address text,
  legal_city text,
  legal_district text,
  tax_office text,
  tax_number text,
  mersis_no text,
  bank_name text,
  bank_account_holder text,
  iban text,
  kind text not null
);

create table if not exists public.payment_installments (
  id uuid not null,
  organization_id uuid not null,
  payment_plan_id uuid not null,
  installment_no integer not null,
  due_date date,
  amount bigint not null,
  status text not null,
  paid_at timestamp with time zone,
  created_at timestamp with time zone not null,
  payment_url text,
  notice_sent_at timestamp with time zone,
  reminder_sent_at timestamp with time zone,
  notice_sent_by uuid,
  payment_link_source text
);

create table if not exists public.payment_links (
  id uuid not null,
  organization_id uuid not null,
  installment_id uuid,
  provider text not null,
  provider_link_id text not null,
  url text not null,
  amount bigint not null,
  status text not null,
  expires_at text,
  created_by uuid,
  created_at timestamp with time zone not null,
  paid_at timestamp with time zone,
  cancelled_at timestamp with time zone,
  purpose text not null,
  payer_organization_id uuid,
  plan_code plan_code,
  product text,
  subscriber_id uuid
);

create table if not exists public.payment_plans (
  id uuid not null,
  organization_id uuid not null,
  contract_id uuid not null,
  party_id uuid not null,
  total_amount bigint not null,
  currency text not null,
  status text not null,
  created_by uuid not null,
  created_at timestamp with time zone not null,
  updated_at timestamp with time zone not null
);

create table if not exists public.payment_provider_events (
  id uuid not null,
  provider text not null,
  merchant_oid text not null,
  organization_id uuid not null,
  payment_link_id uuid,
  total_amount bigint,
  payment_amount bigint,
  currency text,
  test_mode boolean not null,
  result text not null,
  account_entry_id uuid,
  payload jsonb not null,
  received_at timestamp with time zone not null
);

create table if not exists public.plans (
  code plan_code not null,
  name text not null,
  description text not null,
  is_active boolean not null,
  created_at timestamp with time zone not null
);

create table if not exists public.platform_bank_accounts (
  id uuid not null,
  bank_name text not null,
  account_holder text,
  iban text not null,
  currency text not null,
  is_active boolean not null,
  sort_order integer not null,
  created_at timestamp with time zone not null,
  updated_at timestamp with time zone not null
);

create table if not exists public.platform_subscription_requests (
  id uuid not null,
  contract_id uuid not null,
  source_organization_id uuid not null,
  target_organization_id uuid,
  customer_name text,
  contract_no text,
  amount bigint,
  currency text not null,
  requested jsonb not null,
  status text not null,
  review_note text,
  reviewed_by uuid,
  reviewed_at timestamp with time zone,
  created_at timestamp with time zone not null,
  updated_at timestamp with time zone not null
);

create table if not exists public.product_plans (
  product text not null,
  individual_monthly_fee bigint,
  trial_days integer not null,
  updated_by uuid,
  updated_at timestamp with time zone not null
);

create table if not exists public.product_subscribers (
  id uuid not null,
  product text not null,
  external_user_id uuid not null,
  email text not null,
  full_name text,
  status text not null,
  trial_ends_at timestamp with time zone,
  current_period_start timestamp with time zone,
  current_period_end timestamp with time zone,
  suspended_at timestamp with time zone,
  suspension_reason text,
  updated_by uuid,
  created_at timestamp with time zone not null,
  updated_at timestamp with time zone not null
);

create table if not exists public.profiles (
  id uuid not null,
  full_name text,
  job_title text,
  phone text,
  created_at timestamp with time zone not null,
  updated_at timestamp with time zone not null
);

create table if not exists public.provisioning_audit_logs (
  id uuid not null,
  organization_id uuid,
  invitation_id uuid,
  actor_user_id uuid,
  action text not null,
  state text not null,
  result text not null,
  details jsonb not null,
  duration_ms integer,
  created_at timestamp with time zone not null
);

create table if not exists public.role_module_permissions (
  organization_id uuid not null,
  role text not null,
  module_key text not null,
  can_access boolean not null,
  updated_at timestamp with time zone not null,
  updated_by uuid
);

create table if not exists public.site_lead_attempts (
  id bigint generated always as identity not null,
  ip_hash text not null,
  email_norm text,
  interest text,
  outcome text not null,
  reference text,
  opportunity_id uuid,
  created_at timestamp with time zone not null
);

create table if not exists public.subscriber_payments (
  id uuid not null,
  subscriber_id uuid not null,
  provider text not null,
  merchant_oid text,
  amount bigint not null,
  currency text not null,
  period_start timestamp with time zone,
  period_end timestamp with time zone,
  paid_at timestamp with time zone not null,
  created_at timestamp with time zone not null
);

create table if not exists public.support_messages (
  id uuid not null,
  ticket_id uuid not null,
  organization_id uuid not null,
  author_id uuid not null,
  body text not null,
  is_staff boolean not null,
  created_at timestamp with time zone not null
);

create table if not exists public.support_tickets (
  id uuid not null,
  organization_id uuid not null,
  created_by uuid not null,
  subject text not null,
  category text not null,
  priority text not null,
  status text not null,
  last_message_at timestamp with time zone not null,
  resolved_at timestamp with time zone,
  created_at timestamp with time zone not null,
  updated_at timestamp with time zone not null
);

create table if not exists public.tracking_lookup_attempts (
  id bigint generated always as identity not null,
  client_ip text,
  code_digest text not null,
  outcome text not null,
  created_at timestamp with time zone not null
);

create table if not exists public.user_presence (
  organization_id uuid not null,
  user_id uuid not null,
  session_id uuid not null,
  last_seen_at timestamp with time zone not null,
  current_path text,
  user_agent text,
  updated_at timestamp with time zone not null
);

create table if not exists public.user_session_logs (
  id uuid not null,
  organization_id uuid not null,
  user_id uuid not null,
  employee_id uuid,
  login_at timestamp with time zone not null,
  last_seen_at timestamp with time zone not null,
  logout_at timestamp with time zone,
  logout_reason text,
  ip_address inet,
  user_agent text,
  created_at timestamp with time zone not null,
  current_path text
);

create table if not exists public.whatsapp_accounts (
  organization_id uuid not null,
  waba_id text not null,
  phone_number_id text not null,
  display_phone text,
  verified_name text,
  access_token_enc text not null,
  status text not null,
  last_verified_at timestamp with time zone,
  last_error text,
  connected_by uuid,
  created_at timestamp with time zone not null,
  updated_at timestamp with time zone not null
);

create table if not exists public.whatsapp_conversation_state (
  organization_id uuid not null,
  counterpart_phone text not null,
  archived_at timestamp with time zone,
  archived_by uuid,
  created_at timestamp with time zone not null,
  updated_at timestamp with time zone not null,
  last_read_at timestamp with time zone,
  last_read_by uuid
);

create table if not exists public.whatsapp_messages (
  id uuid not null,
  organization_id uuid not null,
  product text not null,
  sender text not null,
  direction text not null,
  phone_number_id text,
  wa_message_id text,
  counterpart_phone text not null,
  template text,
  params jsonb,
  body text,
  status text not null,
  error text,
  ref text,
  created_at timestamp with time zone not null,
  updated_at timestamp with time zone not null,
  profile_name text,
  message_type text not null,
  media_id text,
  media_mime text,
  media_filename text,
  media_size bigint,
  media_path text,
  media_error text,
  media_status text not null
);

create table if not exists public.whatsapp_quick_replies (
  id uuid not null,
  organization_id uuid not null,
  title text not null,
  body text not null,
  sort_index integer not null,
  created_by uuid,
  created_at timestamp with time zone not null,
  updated_at timestamp with time zone not null
);

CREATE OR REPLACE FUNCTION private.activate_organization_owner_invitation()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  invitation_id uuid;
  invitation public.organization_invitations%rowtype;
  employee_id uuid;
  v_role public.organization_invitations.role%type;
  v_provisioning boolean;
  v_trusted_inviter boolean;
begin
  if new.email_confirmed_at is null or old.email_confirmed_at is not null then return new; end if;
  invitation_id := nullif(new.raw_user_meta_data ->> 'arvoos_invitation_id', '')::uuid;
  if invitation_id is null then return new; end if;

  select * into invitation from public.organization_invitations
  where id = invitation_id and lower(email) = lower(new.email) and status in ('pending','sent') and expires_at > now()
  for update;
  if not found then return new; end if;

  v_provisioning := not exists (
    select 1 from public.organization_memberships m
    where m.organization_id = invitation.organization_id and m.role::text = 'owner' and m.is_active
  );
  v_trusted_inviter := v_provisioning or exists (
    select 1 from public.organization_memberships m
    where m.organization_id = invitation.organization_id
      and m.user_id = invitation.invited_by
      and m.role::text = 'owner'
      and m.is_active
  );
  v_role := invitation.role;
  if v_role::text = 'owner' and not v_trusted_inviter then
    v_role := 'member';
  end if;

  insert into public.profiles (id, full_name, updated_at)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)), now())
  on conflict (id) do update set updated_at = excluded.updated_at;

  insert into public.organization_memberships (organization_id, user_id, role, is_active)
  values (invitation.organization_id, new.id, v_role, true)
  on conflict (organization_id, user_id) do nothing;

  -- Yönetim departmanındaki bir kaydı bağlamak owner yetkisi verir;
  -- daveti bir Kurum Sahibi göndermediyse bağlanmaz.
  employee_id := nullif(new.raw_user_meta_data ->> 'arvoos_employee_id', '')::uuid;
  if employee_id is not null and (
    v_trusted_inviter or not exists (
      select 1 from public.hr_employees e
      where e.id = employee_id and private.arvo_is_management_department(e.department_id)
    )
  ) then
    update public.hr_employees
    set user_id = new.id
    where id = employee_id and organization_id = invitation.organization_id;
  end if;

  update public.organization_invitations
  set status = 'accepted', auth_user_id = new.id, accepted_at = now(), updated_at = now(), error_message = null
  where id = invitation.id;

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION private.arc_guard_payment_settings()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;
  if private.arvo_is_org_admin(new.organization_id) then
    return new;
  end if;

  if tg_op = 'INSERT' then
    -- Satır yoksa manager'ın upsert'i satırı oluşturur; ödeme alanları
    -- varsayılanda (kapalı, boş) kalmalı.
    if new.bank_transfer_enabled or new.paytr_enabled
    or new.bank_iban is not null or new.bank_name is not null
    or new.bank_account_holder is not null
    or new.paytr_merchant_id is not null
    or new.paytr_merchant_key_enc is not null
    or new.paytr_merchant_salt_enc is not null then
      raise exception 'Ödeme hesaplarını yalnızca mağaza sahibi ve yöneticisi (admin) ayarlayabilir.'
        using errcode = 'insufficient_privilege';
    end if;
    return new;
  end if;

  if new.organization_id            is distinct from old.organization_id
  or new.bank_transfer_enabled      is distinct from old.bank_transfer_enabled
  or new.bank_name                  is distinct from old.bank_name
  or new.bank_account_holder        is distinct from old.bank_account_holder
  or new.bank_iban                  is distinct from old.bank_iban
  or new.bank_transfer_instructions is distinct from old.bank_transfer_instructions
  or new.paytr_enabled              is distinct from old.paytr_enabled
  or new.paytr_test_mode            is distinct from old.paytr_test_mode
  or new.paytr_merchant_id          is distinct from old.paytr_merchant_id
  or new.paytr_no_installment       is distinct from old.paytr_no_installment
  or new.paytr_max_installment      is distinct from old.paytr_max_installment
  or new.paytr_merchant_key_enc     is distinct from old.paytr_merchant_key_enc
  or new.paytr_merchant_salt_enc    is distinct from old.paytr_merchant_salt_enc
  then
    raise exception 'Ödeme hesaplarını yalnızca mağaza sahibi ve yöneticisi (admin) değiştirebilir.'
      using errcode = 'insufficient_privilege';
  end if;

  return new;
end
$function$
;

CREATE OR REPLACE FUNCTION private.arc_guard_store_domains()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_domain text;
  v_owner uuid;
begin
  foreach v_domain in array array[
    nullif(lower(trim(coalesce(new.custom_domain, ''))), ''),
    nullif(lower(trim(coalesce(new.panel_custom_domain, ''))), '')
  ]
  loop
    continue when v_domain is null;

    select s.organization_id into v_owner
    from public.arc_store_settings s
    where s.organization_id <> new.organization_id
      and (lower(trim(coalesce(s.custom_domain, ''))) = v_domain
        or lower(trim(coalesce(s.panel_custom_domain, ''))) = v_domain)
    limit 1;

    if v_owner is not null then
      -- Kimin kullandığı SÖYLENMEZ: mağazalar birbirinin varlığını
      -- öğrenmemeli.
      -- Biçim metni ile "using message" birlikte verilemez
      -- ("RAISE option already specified: MESSAGE"); yalnızca using.
      raise using
        errcode = 'unique_violation',
        message = 'Bu alan adı başka bir mağazada kullanılıyor.';
    end if;
  end loop;

  return new;
end
$function$
;

CREATE OR REPLACE FUNCTION private.arvo_account_entry_reconcile()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if new.entry_type = 'credit' and new.party_id is not null then
    perform private.arvo_reconcile_party_installments(new.organization_id, new.party_id);
  end if;
  return null;
end
$function$
;

CREATE OR REPLACE FUNCTION private.arvo_account_entry_refund_unreconcile()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if new.entry_type = 'debit' and new.source_type = 'adjustment' and new.party_id is not null then
    perform private.arvo_unreconcile_party_installments(new.organization_id, new.party_id);
  end if;
  return null;
end
$function$
;

CREATE OR REPLACE FUNCTION private.arvo_account_entry_unreconcile()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if old.party_id is not null then
    perform private.arvo_unreconcile_party_installments(old.organization_id, old.party_id);
  end if;
  return null;
end
$function$
;

CREATE OR REPLACE FUNCTION private.arvo_activate_license_period(p_organization_id uuid, p_plan_code plan_code, p_amount bigint, p_currency text, p_provider text, p_actor uuid)
 RETURNS timestamp with time zone
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_current_end timestamptz;
  v_start timestamptz;
  v_end timestamptz;
begin
  select current_period_end into v_current_end
  from public.organization_licenses
  where organization_id = p_organization_id
  for update;

  -- Süre dolmadıysa yeni ay mevcut dönem sonundan başlar.
  v_start := greatest(now(), coalesce(v_current_end, now()));
  v_end := v_start + interval '1 month';

  update public.organization_licenses
  set plan_code = p_plan_code,
      license_status = 'active',
      current_period_start = case when v_current_end is not null and v_current_end > now() then coalesce(current_period_start, now()) else now() end,
      current_period_end = v_end,
      trial_ends_at = null,
      suspended_at = null,
      suspension_reason = null,
      updated_by = p_actor,
      updated_at = now()
  where organization_id = p_organization_id;

  update public.organizations
  set plan_code = p_plan_code,
      status = 'active',
      provisioning_state = 'active',
      updated_at = now()
  where id = p_organization_id;

  insert into public.billing_subscriptions (
    organization_id, provider, plan_code, status, currency, unit_amount,
    interval, current_period_start, current_period_end, updated_at
  ) values (
    p_organization_id, p_provider, p_plan_code, 'active', coalesce(p_currency, 'TRY'),
    p_amount, 'month', v_start, v_end, now()
  );

  insert into public.billing_invoices (
    organization_id, provider, status, currency, subtotal, tax, total, due_at, paid_at
  ) values (
    p_organization_id, p_provider, 'paid', coalesce(p_currency, 'TRY'),
    p_amount, 0, p_amount, now(), now()
  );

  return v_end;
end
$function$
;

CREATE OR REPLACE FUNCTION private.arvo_activate_product_period(p_organization_id uuid, p_product text, p_plan_code plan_code, p_amount bigint, p_currency text, p_provider text, p_actor uuid)
 RETURNS timestamp with time zone
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_current_end timestamptz;
  v_start timestamptz;
  v_end timestamptz;
  v_period_start timestamptz;
begin
  if p_product not in ('arvolab', 'arc', 'randevu') then
    raise exception 'Bilinmeyen ürün: %', p_product;
  end if;

  select current_period_end into v_current_end
  from public.organization_product_licenses
  where organization_id = p_organization_id and product = p_product
  for update;

  v_start := greatest(now(), coalesce(v_current_end, now()));
  v_end := v_start + interval '1 month';
  v_period_start := case when v_current_end is not null and v_current_end > now() then null else now() end;

  insert into public.organization_product_licenses (
    organization_id, product, status, plan_code, current_period_start, current_period_end,
    trial_ends_at, suspended_at, suspension_reason, updated_by, updated_at
  ) values (
    p_organization_id, p_product, 'active', p_plan_code, now(), v_end,
    null, null, null, p_actor, now()
  )
  on conflict (organization_id, product) do update
  set status = 'active',
      plan_code = coalesce(excluded.plan_code, public.organization_product_licenses.plan_code),
      current_period_start = coalesce(v_period_start, public.organization_product_licenses.current_period_start, now()),
      current_period_end = v_end,
      trial_ends_at = null,
      suspended_at = null,
      suspension_reason = null,
      updated_by = p_actor,
      updated_at = now();

  insert into public.billing_subscriptions (
    organization_id, product, provider, plan_code, status, currency, unit_amount,
    interval, current_period_start, current_period_end, updated_at
  ) values (
    p_organization_id, p_product, p_provider, p_plan_code, 'active', coalesce(p_currency, 'TRY'),
    p_amount, 'month', v_start, v_end, now()
  );

  insert into public.billing_invoices (
    organization_id, product, provider, status, currency, subtotal, tax, total, due_at, paid_at
  ) values (
    p_organization_id, p_product, p_provider, 'paid', coalesce(p_currency, 'TRY'),
    p_amount, 0, p_amount, now(), now()
  );

  return v_end;
end
$function$
;

CREATE OR REPLACE FUNCTION private.arvo_activate_subscriber_period(p_subscriber_id uuid, p_amount bigint, p_currency text, p_provider text, p_merchant_oid text)
 RETURNS timestamp with time zone
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_current_end timestamptz;
  v_start timestamptz;
  v_end timestamptz;
begin
  select current_period_end into v_current_end
  from public.product_subscribers
  where id = p_subscriber_id
  for update;
  if not found then
    raise exception 'Abone bulunamadı: %', p_subscriber_id;
  end if;

  -- Süre dolmadıysa yeni ay mevcut dönem sonundan başlar. Deneme süresi
  -- ödemeyle biter: kalan deneme günü eklenmez, dönem bugünden işler.
  v_start := greatest(now(), coalesce(v_current_end, now()));
  v_end := v_start + interval '1 month';

  update public.product_subscribers
  set status = 'active',
      trial_ends_at = null,
      current_period_start = case when v_current_end is not null and v_current_end > now()
                                  then coalesce(current_period_start, now()) else now() end,
      current_period_end = v_end,
      suspended_at = null,
      suspension_reason = null,
      updated_at = now()
  where id = p_subscriber_id;

  insert into public.subscriber_payments (subscriber_id, provider, merchant_oid, amount, currency, period_start, period_end)
  values (p_subscriber_id, p_provider, p_merchant_oid, p_amount, coalesce(p_currency, 'TRY'), v_start, v_end);

  return v_end;
end
$function$
;

CREATE OR REPLACE FUNCTION private.arvo_bump_message_channel()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if tg_op = 'INSERT' then
    update public.message_channels
       set last_message_at = new.created_at,
           last_message_preview = private.arvo_message_preview(new.body, new.attachment_name),
           last_message_sender = new.sender_id,
           updated_at = now()
     where id = new.channel_id
       and (last_message_at is null or last_message_at <= new.created_at);
  elsif new.deleted_at is not null and old.deleted_at is null then
    update public.message_channels
       set last_message_preview = 'Bu mesaj silindi'
     where id = new.channel_id and last_message_at = new.created_at;
  elsif new.body is distinct from old.body then
    update public.message_channels
       set last_message_preview = private.arvo_message_preview(new.body, new.attachment_name)
     where id = new.channel_id and last_message_at = new.created_at;
  end if;
  return null;
end;
$function$
;

CREATE OR REPLACE FUNCTION private.arvo_caller_is_owner(p_organization_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select case
    when private.arvo_request_role() is null then true
    when auth.uid() is null then false
    else exists (
      select 1
      from public.organization_memberships m
      where m.organization_id = p_organization_id
        and m.user_id = auth.uid()
        and m.is_active = true
        and m.role::text = 'owner'
    )
  end;
$function$
;

CREATE OR REPLACE FUNCTION private.arvo_can_access_opportunity(target_opportunity uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$ select exists (
  select 1
  from public.crm_opportunities o
  join public.organization_memberships m on m.organization_id=o.organization_id
    and m.user_id=(select auth.uid()) and m.is_active=true
  left join public.hr_employees sales_employee on sales_employee.id=o.assigned_employee_id
    and sales_employee.organization_id=o.organization_id and sales_employee.employment_status='active'
  where o.id=target_opportunity
    and (
      m.role::text in ('owner','admin','manager')
      or sales_employee.user_id=(select auth.uid())
      or exists (
        select 1
        from public.crm_contracts contract
        join public.operation_workflows workflow on workflow.id=contract.workflow_id
        join public.hr_employees operation_employee on operation_employee.id=workflow.assigned_employee_id
          and operation_employee.organization_id=workflow.organization_id
          and operation_employee.employment_status='active'
        where contract.opportunity_id=o.id
          and contract.organization_id=o.organization_id
          and operation_employee.user_id=(select auth.uid())
      )
    )
) $function$
;

CREATE OR REPLACE FUNCTION private.arvo_can_access_workflow(target_workflow uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$ select exists (
 select 1 from public.operation_workflows w
 join public.organization_memberships m on m.organization_id=w.organization_id and m.user_id=(select auth.uid()) and m.is_active=true
 left join public.hr_employees e on e.id=w.assigned_employee_id and e.organization_id=w.organization_id and e.employment_status='active'
 where w.id=target_workflow and (m.role::text in ('owner','admin','manager') or e.user_id=(select auth.uid()))
) $function$
;

CREATE OR REPLACE FUNCTION private.arvo_can_manage_group(p_channel_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists (
    select 1
    from public.message_channels c
    where c.id = p_channel_id
      and c.channel_type = 'group'
      and c.is_private
      and (
        c.created_by = (select auth.uid())
        or (
          public.arvo_is_message_channel_member(c.id)
          and exists (
            select 1 from public.organization_memberships m
            where m.organization_id = c.organization_id
              and m.user_id = (select auth.uid())
              and m.is_active
              and m.role in ('owner', 'admin')
          )
        )
      )
  );
$function$
;

CREATE OR REPLACE FUNCTION private.arvo_confirm_proposal(p_proposal_id uuid, p_decision text, p_ip text, p_user_agent text)
 RETURNS TABLE(result_status text, contract_token text, contract_status text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  prop public.crm_proposals%rowtype;
  con public.crm_contracts%rowtype;
  v_status text;
  v_ip text := nullif(left(btrim(coalesce(p_ip, '')), 120), '');
  v_ua text := nullif(left(btrim(coalesce(p_user_agent, '')), 1000), '');
  v_customer text;
begin
  if coalesce(p_decision, '') not in ('accept', 'reject') then
    raise exception 'invalid_decision' using errcode = 'check_violation';
  end if;

  select * into prop from public.crm_proposals where id = p_proposal_id for update;
  if prop.id is null then
    raise exception 'proposal_not_found' using errcode = 'P0002';
  end if;

  select * into con
  from public.crm_contracts
  where proposal_id = prop.id
  order by created_at desc
  limit 1;

  if private.arvo_proposal_customer_decided(prop.responded_at, prop.response_ip, prop.customer_responded_at) then
    return query select 'already'::text, con.share_token, con.status;
    return;
  end if;

  v_status := private.arvo_proposal_status_with_contract(prop.status, prop.archive_reason, con.status);
  if v_status <> 'accepted' then
    return query select 'closed'::text, con.share_token, con.status;
    return;
  end if;

  if p_decision = 'accept' then
    -- Arşivlenmiş teklifte sebep de 'accepted' olur (süresi dolmuş görünmesin).
    update public.crm_proposals
       set responded_at = now(),
           response_ip = v_ip,
           response_user_agent = v_ua,
           customer_responded_at = now(),
           archive_reason = case when status = 'archived' then 'accepted' else archive_reason end,
           updated_at = now()
     where id = prop.id;
  else
    if con.id is not null and con.status in ('signed', 'completed') then
      return query select 'contract_signed'::text, con.share_token, con.status;
      return;
    end if;
    update public.crm_proposals
       set status = 'rejected',
           responded_at = now(),
           response_ip = v_ip,
           response_user_agent = v_ua,
           customer_responded_at = now(),
           updated_at = now()
     where id = prop.id;
    if con.id is not null and con.status in ('draft', 'sent') then
      update public.crm_contracts set status = 'cancelled', updated_at = now() where id = con.id;
      con.status := 'cancelled';
    end if;
    update public.crm_opportunities
       set stage = 'lost',
           probability = 0,
           lost_reason = 'Teklif müşteri tarafından reddedildi',
           updated_at = now()
     where id = prop.opportunity_id;
  end if;

  select o.customer_name into v_customer from public.crm_opportunities o where o.id = prop.opportunity_id;

  insert into public.notifications (organization_id, user_id, audience, category, title, message, action_url, metadata)
  select distinct
    prop.organization_id,
    recipient.user_id,
    'organization',
    'proposal_customer_decision',
    case p_decision when 'accept' then 'Müşteri teklifi onayladı' else 'Müşteri teklifi reddetti' end,
    coalesce(prop.proposal_no, 'Teklif')
      || case p_decision when 'accept' then ' müşteri tarafından onaylandı.' else ' müşteri tarafından reddedildi.' end,
    case when con.id is not null then '/panel/crm/contracts/' || con.id::text else '/panel/crm/proposals' end,
    jsonb_build_object(
      'proposal_id', prop.id,
      'proposal_no', prop.proposal_no,
      'contract_id', con.id,
      'decision', p_decision,
      'customer_name', v_customer
    )
  from (
    select m.user_id
    from public.organization_memberships m
    where m.organization_id = prop.organization_id
      and m.is_active
      and m.role::text in ('owner', 'admin', 'manager')
    union
    select e.user_id
    from public.crm_opportunities o
    join public.hr_employees e on e.id = o.assigned_employee_id
    join public.organization_memberships m on m.organization_id = prop.organization_id and m.user_id = e.user_id and m.is_active
    where o.id = prop.opportunity_id
      and e.user_id is not null
  ) recipient
  where recipient.user_id is not null;

  return query select case p_decision when 'accept' then 'accepted' else 'rejected' end, con.share_token, con.status;
end
$function$
;

CREATE OR REPLACE FUNCTION private.arvo_contract_payment_summary(p_contract_id uuid)
 RETURNS TABLE(total_amount bigint, paid_amount bigint, remaining_amount bigint, settled boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select
    coalesce(c.amount, 0)::bigint,
    coalesce(collections.net_paid, 0)::bigint,
    greatest(0, coalesce(c.amount, 0) - coalesce(collections.net_paid, 0))::bigint,
    greatest(0, coalesce(c.amount, 0) - coalesce(collections.net_paid, 0)) <= 0
  from public.crm_contracts c
  left join lateral (
    select least(
      coalesce(c.amount, 0),
      greatest(
        0,
        coalesce(sum(ae.amount) filter (where ae.entry_type = 'credit'), 0)
        - coalesce(sum(ae.amount) filter (
            where ae.entry_type = 'debit' and ae.source_type = 'adjustment'
          ), 0)
      )
    )::bigint as net_paid
    from public.account_entries ae
    where ae.organization_id = c.organization_id
      and ae.party_id = c.party_id
  ) collections on c.party_id is not null
  where c.id = p_contract_id;
$function$
;

CREATE OR REPLACE FUNCTION private.arvo_contract_tracking_code()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if tg_op = 'UPDATE' and nullif(btrim(coalesce(old.tracking_code, '')), '') is not null then
    -- Müşteriye verilmiş kod değişmez.
    new.tracking_code := old.tracking_code;
  elsif nullif(btrim(coalesce(new.tracking_code, '')), '') is null then
    new.tracking_code := private.arvo_generate_tracking_code();
  end if;
  return new;
end
$function$
;

CREATE OR REPLACE FUNCTION private.arvo_contract_tracking_open(p_status text, p_open boolean)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  select p_status in ('signed', 'completed')
      or (p_status in ('draft', 'sent') and coalesce(p_open, false))
$function$
;

CREATE OR REPLACE FUNCTION private.arvo_contract_workflow_completed(target_contract uuid, target_workflow uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists (
    select 1 from public.operation_workflows w
    where w.status::text = 'completed'
      and (w.contract_id = target_contract or w.id = target_workflow)
  );
$function$
;

CREATE OR REPLACE FUNCTION private.arvo_crm_customer_units(p_organization_id uuid)
 RETURNS TABLE(unit_kind text, unit_id uuid, phone_key text, name_key text, customer_key text, customer_name text, contact_phone text, contact_email text, at timestamp with time zone)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  with opp as (
    select o.id, o.customer_name, o.contact_phone, o.contact_email,
      greatest(o.created_at, coalesce(o.updated_at, o.created_at)) as at,
      private.arvo_phone_key(o.contact_phone) as pk,
      private.arvo_name_key(o.customer_name) as nk
    from public.crm_opportunities o
    where o.organization_id = p_organization_id
  ),
  -- Adı tek bir telefona bağlanan müşteriler: telefonsuz kayıtları oraya kat
  phone_names as (
    select nk, min(pk) as pk
    from opp
    where length(pk) >= 7 and nk <> ''
    group by nk
    having count(distinct pk) = 1
  ),
  linked_workflows as (
    select distinct w.id
    from public.operation_workflows w
    join public.crm_contracts c on c.organization_id = w.organization_id
      and (c.id = w.contract_id or c.workflow_id = w.id)
    where w.organization_id = p_organization_id
  ),
  orphan as (
    select w.id, w.customer_name,
      coalesce(w.updated_at, w.created_at) as at,
      private.arvo_name_key(w.customer_name) as nk
    from public.operation_workflows w
    where w.organization_id = p_organization_id
      and not exists (select 1 from linked_workflows l where l.id = w.id)
  )
  select 'opportunity'::text, o.id, o.pk, o.nk,
    case
      when length(o.pk) >= 7 then 'p:' || o.pk
      when pn.pk is not null then 'p:' || pn.pk
      else 'n:' || o.nk
    end,
    o.customer_name, o.contact_phone, o.contact_email, o.at
  from opp o
  left join phone_names pn on pn.nk = o.nk and length(o.pk) < 7
  union all
  select 'workflow'::text, w.id, ''::text, w.nk,
    case when pn.pk is not null then 'p:' || pn.pk else 'n:' || w.nk end,
    w.customer_name, null::text, null::text, w.at
  from orphan w
  left join phone_names pn on pn.nk = w.nk
  where w.nk <> ''
$function$
;

CREATE OR REPLACE FUNCTION private.arvo_crm_lookup_role(p_organization_id uuid)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select m.role::text
  from public.organization_memberships m
  join public.organizations o on o.id = m.organization_id and o.status = 'active'
  where m.organization_id = p_organization_id
    and m.user_id = (select auth.uid())
    and m.is_active = true
    and exists (
      select 1 from public.organization_modules om
      where om.organization_id = p_organization_id
        and om.module_code = 'crm'
        and om.is_enabled = true
    )
    and (
      m.role::text = 'owner'
      or not exists (
        select 1 from public.role_module_permissions rp
        where rp.organization_id = p_organization_id
          and rp.role = m.role::text
          and rp.module_key = 'crm'
          and rp.can_access = false
      )
    )
  limit 1
$function$
;

CREATE OR REPLACE FUNCTION private.arvo_department_management_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_org uuid;
  v_new boolean := false;
  v_old boolean := false;
begin
  -- INSERT'te OLD, DELETE'te NEW boş; yalnızca dolu olanı okuyoruz.
  if tg_op = 'DELETE' then
    v_org := old.organization_id;
    v_old := private.arvo_is_management_name(old.name);
  else
    v_org := new.organization_id;
    v_new := private.arvo_is_management_name(new.name);
    if tg_op = 'UPDATE' then
      v_old := private.arvo_is_management_name(old.name);
    end if;
  end if;

  if v_new is distinct from v_old and not private.arvo_caller_is_owner(v_org) then
    raise exception 'Yönetici departmanını oluşturma, yeniden adlandırma veya silme yalnızca Kurum Sahibi tarafından yapılabilir.'
      using errcode = 'insufficient_privilege';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end
$function$
;

CREATE OR REPLACE FUNCTION private.arvo_department_management_sync()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  r record;
begin
  for r in
    select distinct e.organization_id, e.user_id
    from public.hr_employees e
    where e.department_id = new.id
      and e.user_id is not null
  loop
    perform private.arvo_sync_management_owner(r.organization_id, r.user_id);
  end loop;
  return null;
end
$function$
;

CREATE OR REPLACE FUNCTION private.arvo_employee_management_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_new boolean := false;
  v_old boolean := false;
begin
  -- INSERT'te OLD boş olduğu için yalnızca UPDATE'te okunur.
  v_new := private.arvo_is_management_department(new.department_id);
  if tg_op = 'UPDATE' then
    v_old := private.arvo_is_management_department(old.department_id);
  end if;

  if v_new is distinct from v_old
     and not private.arvo_caller_is_owner(new.organization_id) then
    raise exception 'Yönetici departmanına çalışan ekleme veya çıkarma yalnızca Kurum Sahibi tarafından yapılabilir.'
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end
$function$
;

CREATE OR REPLACE FUNCTION private.arvo_employee_management_sync()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if tg_op in ('UPDATE', 'DELETE') then
    perform private.arvo_sync_management_owner(old.organization_id, old.user_id);
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    perform private.arvo_sync_management_owner(new.organization_id, new.user_id);
  end if;
  return null;
end
$function$
;

CREATE OR REPLACE FUNCTION private.arvo_freeze_accepted_proposal()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  was_accepted boolean := old.status = 'accepted'
    or (old.status = 'archived' and old.archive_reason = 'accepted');
  is_accepted boolean := new.status = 'accepted'
    or (new.status = 'archived' and new.archive_reason = 'accepted');
  from_client boolean := current_user in ('authenticated', 'anon');
begin
  if from_client and not was_accepted and is_accepted then
    raise exception 'Teklif yalnızca müşteri yanıtıyla kabul edilir.'
      using errcode = 'insufficient_privilege';
  end if;
  if from_client and (
       new.response_ip           is distinct from old.response_ip
    or new.response_user_agent   is distinct from old.response_user_agent
    or new.customer_responded_at is distinct from old.customer_responded_at
  ) then
    raise exception 'Müşteri yanıtı bilgileri yalnızca müşteri yanıtıyla değişir.'
      using errcode = 'insufficient_privilege';
  end if;
  if not was_accepted then
    return new;
  end if;
  if from_client and not is_accepted then
    raise exception 'Bu teklif müşteri tarafından onaylandı; durumu geri alınamaz. Değişiklik gerekiyorsa yeni bir teklif oluşturun.'
      using errcode = 'check_violation';
  end if;
  if new.amount is distinct from old.amount
  or new.net_amount is distinct from old.net_amount
  or new.tax_amount is distinct from old.tax_amount
  or new.gross_amount is distinct from old.gross_amount
  or new.tax_rate is distinct from old.tax_rate
  or new.tax_status is distinct from old.tax_status
  or new.currency is distinct from old.currency
  or new.title is distinct from old.title
  or new.scope is distinct from old.scope
  or new.payment_plan is distinct from old.payment_plan
  or new.payment_plan_type is distinct from old.payment_plan_type
  or new.payment_schedule is distinct from old.payment_schedule
  or new.valid_until is distinct from old.valid_until
  or new.estimated_delivery_date is distinct from old.estimated_delivery_date
  then
    raise exception 'Bu teklif müşteri tarafından onaylandı; tutar ve içeriği değiştirilemez. Değişiklik gerekiyorsa yeni bir teklif oluşturun.'
      using errcode = 'check_violation';
  end if;
  return new;
end
$function$
;

CREATE OR REPLACE FUNCTION private.arvo_freeze_signed_contract()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if old.status not in ('signed', 'completed') then
    return new;
  end if;

  if new.amount   is distinct from old.amount
  or new.currency is distinct from old.currency
  or new.title    is distinct from old.title
  or new.scope    is distinct from old.scope
  or new.payment_plan      is distinct from old.payment_plan
  or new.payment_plan_type is distinct from old.payment_plan_type
  or new.payment_schedule  is distinct from old.payment_schedule
  or new.start_date is distinct from old.start_date
  or new.due_date   is distinct from old.due_date
  or new.customer_address    is distinct from old.customer_address
  or new.customer_tax_number is distinct from old.customer_tax_number
  or new.customer_tax_office is distinct from old.customer_tax_office
  then
    raise exception
      'Bu sözleşme imzalandı; tutar ve içeriği değiştirilemez.'
      using errcode = 'check_violation';
  end if;

  return new;
end
$function$
;

CREATE OR REPLACE FUNCTION private.arvo_freeze_signed_work_plan()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if old.status in ('signed', 'completed') and new.work_plan is distinct from old.work_plan then
    raise exception
      'Bu sözleşme imzalandı; iş planı değiştirilemez. Değişiklik için ek protokol oluşturun.'
      using errcode = 'check_violation';
  end if;
  return new;
end
$function$
;

CREATE OR REPLACE FUNCTION private.arvo_generate_tracking_code()
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare
  v_alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_bytes bytea;
  v_code text;
  v_try integer := 0;
begin
  loop
    v_bytes := extensions.gen_random_bytes(6);
    v_code := '';
    for i in 0..5 loop
      v_code := v_code || substr(v_alphabet, 1 + (get_byte(v_bytes, i) % 32), 1);
    end loop;
    exit when not exists (select 1 from public.crm_contracts c where upper(c.tracking_code) = v_code);
    v_try := v_try + 1;
    if v_try > 50 then
      raise exception 'tracking_code_exhausted';
    end if;
  end loop;
  return v_code;
end
$function$
;

CREATE OR REPLACE FUNCTION private.arvo_guard_confidentiality_signature()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  if new.organization_id   is distinct from old.organization_id
  or new.employee_id       is distinct from old.employee_id
  or new.agreement_no      is distinct from old.agreement_no
  or new.agreement_version is distinct from old.agreement_version
  or new.content_snapshot  is distinct from old.content_snapshot
  or new.created_by        is distinct from old.created_by
  or new.created_at        is distinct from old.created_at
  then
    raise exception 'Gizlilik sözleşmesinin metni ve tarafları değiştirilemez.'
      using errcode = 'insufficient_privilege';
  end if;

  if new.status = 'signed' and old.status is distinct from 'signed' then
    if new.signature_path is null
       or new.signature_path not like
          old.organization_id::text || '/' || old.employee_id::text || '/' || old.id::text || '-%.png' then
      raise exception 'İmza dosyası bu sözleşmeye ait değil.'
        using errcode = 'insufficient_privilege';
    end if;
    new.signed_at := now();
  end if;

  return new;
end
$function$
;

CREATE OR REPLACE FUNCTION private.arvo_guard_contract_addendum()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if new.organization_id is distinct from old.organization_id
  or new.contract_id     is distinct from old.contract_id
  or new.opportunity_id  is distinct from old.opportunity_id
  or new.addendum_no     is distinct from old.addendum_no
  or new.work_plan       is distinct from old.work_plan
  or new.payment_dates   is distinct from old.payment_dates
  or new.note            is distinct from old.note
  or new.created_by      is distinct from old.created_by
  or new.created_at      is distinct from old.created_at
  then
    raise exception 'Ek protokolün içeriği değiştirilemez; yeni bir ek protokol oluşturun.'
      using errcode = 'check_violation';
  end if;

  if old.status <> 'sent' and new is distinct from old then
    raise exception 'Bu ek protokol sonuçlandı; değiştirilemez.'
      using errcode = 'check_violation';
  end if;

  return new;
end
$function$
;

CREATE OR REPLACE FUNCTION private.arvo_guard_contract_signature()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.status in ('signed', 'completed')
    or new.signed_at is not null
    or new.signed_name is not null
    or new.signed_signature_data is not null
    or new.acceptance_recorded_at is not null then
      raise exception 'Sözleşme imzalı olarak oluşturulamaz.'
        using errcode = 'insufficient_privilege';
    end if;
    return new;
  end if;

  -- İmza kanıtı yalnızca imza fonksiyonlarıyla yazılır.
  if new.signed_at             is distinct from old.signed_at
  or new.signed_name           is distinct from old.signed_name
  or new.signed_ip             is distinct from old.signed_ip
  or new.signed_user_agent     is distinct from old.signed_user_agent
  or new.signed_signature_data is distinct from old.signed_signature_data
  or new.signed_consents       is distinct from old.signed_consents
  or new.acceptance_recorded_at is distinct from old.acceptance_recorded_at
  or new.legal_text_version    is distinct from old.legal_text_version
  then
    raise exception 'İmza bilgileri yalnızca müşteri imzasıyla değişir.'
      using errcode = 'insufficient_privilege';
  end if;

  if new.status is distinct from old.status then
    if new.status = 'signed' then
      raise exception 'Sözleşme yalnızca müşteri imzasıyla imzalanır.'
        using errcode = 'insufficient_privilege';
    end if;

    if new.status = 'completed' then
      if not private.arvo_contract_workflow_completed(new.id, new.workflow_id) then
        raise exception 'Sözleşme, bağlı iş akışı tamamlanınca tamamlanır.'
          using errcode = 'insufficient_privilege';
      end if;
    elsif old.status in ('signed', 'completed') then
      raise exception 'İmzalanmış sözleşmenin durumu geri alınamaz.'
        using errcode = 'insufficient_privilege';
    end if;
  end if;

  return new;
end
$function$
;

CREATE OR REPLACE FUNCTION private.arvo_guard_message_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  if old.deleted_at is not null then
    raise exception 'Silinmiş mesaj değiştirilemez.';
  end if;
  if new.deleted_at is not null then
    new.deleted_at := now();
    new.body := null;
    new.attachment_path := null;
    new.attachment_name := null;
    new.attachment_mime := null;
    new.attachment_size := null;
    new.edited_at := old.edited_at;
    return new;
  end if;
  -- Ekler düzenlemede değişmez
  new.attachment_path := old.attachment_path;
  new.attachment_name := old.attachment_name;
  new.attachment_mime := old.attachment_mime;
  new.attachment_size := old.attachment_size;
  if new.body is distinct from old.body then
    if (new.body is null or char_length(trim(new.body)) = 0) and old.attachment_path is null then
      raise exception 'Mesaj boş bırakılamaz.';
    end if;
    new.edited_at := now();
  else
    new.edited_at := old.edited_at;
  end if;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION private.arvo_guard_opportunity_assignment()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  if (new.assigned_employee_id is distinct from old.assigned_employee_id
      or new.owner_user_id is distinct from old.owner_user_id)
     and not private.arvo_is_privileged_member(old.organization_id) then
    raise exception 'Satış temsilcisini yalnızca yöneticiler değiştirebilir.'
      using errcode = 'insufficient_privilege';
  end if;

  return new;
end
$function$
;

CREATE OR REPLACE FUNCTION private.arvo_guard_workflow_contract_link()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.contract_id is not null then
      raise exception 'İş, sözleşmeye yalnızca müşteri imzasıyla bağlanır.'
        using errcode = 'insufficient_privilege';
    end if;
  elsif new.contract_id is distinct from old.contract_id then
    raise exception 'İşin bağlı olduğu sözleşme değiştirilemez.'
      using errcode = 'insufficient_privilege';
  end if;

  return new;
end
$function$
;

CREATE OR REPLACE FUNCTION private.arvo_is_finance_manager(p_organization_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists (
    select 1
    from public.organization_memberships m
    where m.organization_id = p_organization_id
      and m.user_id = (select auth.uid())
      and m.is_active
      and m.role::text in ('owner', 'admin')
  )
$function$
;

CREATE OR REPLACE FUNCTION private.arvo_is_management_department(p_department_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists (
    select 1
    from public.hr_departments d
    where d.id = p_department_id
      and private.arvo_is_management_name(d.name)
  );
$function$
;

CREATE OR REPLACE FUNCTION private.arvo_is_management_name(p_name text)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  select coalesce(lower(translate(btrim(p_name), 'İIÖ', 'iıö')) ~ '^y[oö]net[iı](c[iı]|m)', false);
$function$
;

CREATE OR REPLACE FUNCTION private.arvo_is_org_admin(target_org uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists (
    select 1 from public.organization_memberships m
    where m.organization_id = target_org
      and m.user_id = (select auth.uid())
      and m.is_active
      and m.role::text in ('owner', 'admin')
  );
$function$
;

CREATE OR REPLACE FUNCTION private.arvo_is_privileged_member(target_org uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$ select exists (select 1 from public.organization_memberships m where m.organization_id=target_org and m.user_id=(select auth.uid()) and m.is_active=true and m.role::text in ('owner','admin','manager')) $function$
;

CREATE OR REPLACE FUNCTION private.arvo_link_contract_messages_to_workflow()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  update public.customer_file_messages m
     set workflow_id = new.workflow_id
   where m.contract_id = new.id
     and m.workflow_id is null;
  return new;
end
$function$
;

CREATE OR REPLACE FUNCTION private.arvo_membership_management_sync()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  perform private.arvo_sync_management_owner(new.organization_id, new.user_id);
  return null;
end
$function$
;

CREATE OR REPLACE FUNCTION private.arvo_membership_manual_role_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if new.role is distinct from old.role
     and coalesce(current_setting('arvo.management_sync', true), 'off') <> 'on' then
    new.role_from_management := false;
    new.role_before_management := null;
  end if;
  return new;
end
$function$
;

CREATE OR REPLACE FUNCTION private.arvo_membership_owner_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_org uuid;
  v_user uuid;
  v_grant boolean := false;
  v_revoke boolean := false;
  v_was_owner boolean := false;
begin
  -- INSERT'te OLD, DELETE'te NEW boş; yalnızca dolu olanı okuyoruz.
  if tg_op = 'DELETE' then
    v_org := old.organization_id;
    v_user := old.user_id;
    v_revoke := old.role::text = 'owner' and old.is_active;
  else
    v_org := new.organization_id;
    v_user := new.user_id;
    v_grant := new.role::text = 'owner' and new.is_active;
    if tg_op = 'UPDATE' then
      v_was_owner := old.role::text = 'owner' and old.is_active;
      v_revoke := v_was_owner and not v_grant;
      v_grant := v_grant and not v_was_owner;
    end if;
  end if;

  if not (v_grant or v_revoke) then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  if not private.arvo_caller_is_owner(v_org) then
    -- Kurulum: aktif sahibi olmayan kuruma ilk sahip eklenebilir.
    if not (v_grant and not exists (
      select 1 from public.organization_memberships m
      where m.organization_id = v_org
        and m.role::text = 'owner'
        and m.is_active
        and m.user_id <> v_user
    )) then
      raise exception 'Kurum Sahibi yetkisi yalnızca bir Kurum Sahibi tarafından verilebilir veya kaldırılabilir.'
        using errcode = 'insufficient_privilege';
    end if;
  end if;

  -- Kurum kilitlenmesin: son aktif sahip kaldırılamaz (API istekleri için).
  if v_revoke
     and private.arvo_request_role() is not null
     and not exists (
       select 1 from public.organization_memberships m
       where m.organization_id = v_org
         and m.role::text = 'owner'
         and m.is_active
         and m.user_id <> v_user
     ) then
    raise exception 'Kurumun en az bir aktif Kurum Sahibi olmalı; son sahibin yetkisi kaldırılamaz.'
      using errcode = 'insufficient_privilege';
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end
$function$
;

CREATE OR REPLACE FUNCTION private.arvo_message_preview(p_body text, p_attachment_name text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  select case
    when p_body is not null and char_length(trim(p_body)) > 0 then left(regexp_replace(trim(p_body), '\s+', ' ', 'g'), 140)
    when p_attachment_name is not null then 'Ek: ' || left(p_attachment_name, 120)
    else 'Ek'
  end;
$function$
;

CREATE OR REPLACE FUNCTION private.arvo_name_key(value text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE PARALLEL SAFE
 SET search_path TO ''
AS $function$
  select btrim(regexp_replace(
    lower(translate(
      coalesce(value, ''),
      'İIıŞşĞğÜüÖöÇçÂâÎîÛûÊêÉéÀàÁá' || chr(775),
      'iiissgguuooccaaiiuueeeeaaaa'
    )),
    '[^[:alnum:]]+', ' ', 'g'
  ))
$function$
;

CREATE OR REPLACE FUNCTION private.arvo_normalize_contract_work_plan()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_plan jsonb;
begin
  v_plan := private.arvo_normalize_work_plan(new.work_plan);
  new.work_plan := case when jsonb_array_length(v_plan) = 0 then null else v_plan end;
  return new;
end
$function$
;

CREATE OR REPLACE FUNCTION private.arvo_normalize_work_plan(p_plan jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO ''
AS $function$
declare
  v_item jsonb;
  v_title text;
  v_date date;
  v_rows jsonb := '[]'::jsonb;
begin
  if p_plan is null or jsonb_typeof(p_plan) = 'null' then
    return '[]'::jsonb;
  end if;
  if jsonb_typeof(p_plan) <> 'array' then
    raise exception 'invalid_work_plan' using errcode = 'check_violation';
  end if;
  if jsonb_array_length(p_plan) > 20 then
    raise exception 'work_plan_too_long' using errcode = 'check_violation';
  end if;

  for v_item in select value from jsonb_array_elements(p_plan) loop
    if jsonb_typeof(v_item) <> 'object' then
      raise exception 'invalid_work_plan' using errcode = 'check_violation';
    end if;
    v_title := btrim(regexp_replace(coalesce(v_item->>'title', ''), '\s+', ' ', 'g'));
    if char_length(v_title) < 2 or char_length(v_title) > 200 then
      raise exception 'invalid_work_plan_title' using errcode = 'check_violation';
    end if;
    v_date := private.arvo_try_date(v_item->>'due_date');
    if v_date is null then
      raise exception 'invalid_work_plan_date' using errcode = 'check_violation';
    end if;
    v_rows := v_rows || jsonb_build_array(jsonb_build_object('title', v_title, 'due_date', to_char(v_date, 'YYYY-MM-DD')));
  end loop;

  return coalesce((
    select jsonb_agg(s.elem || jsonb_build_object('sequence', s.ord) order by s.ord)
    from (
      select t.elem, row_number() over (order by t.elem->>'due_date', t.idx) as ord
      from jsonb_array_elements(v_rows) with ordinality as t(elem, idx)
    ) s
  ), '[]'::jsonb);
end
$function$
;

CREATE OR REPLACE FUNCTION private.arvo_phone_key(value text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE PARALLEL SAFE
 SET search_path TO ''
AS $function$
  select case when length(s.d) > 10 then right(s.d, 10) else s.d end
  from (select regexp_replace(coalesce(value, ''), '[^0-9]', '', 'g') as d) s
$function$
;

CREATE OR REPLACE FUNCTION private.arvo_promote_draft_on_customer_view()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if new.status = 'draft'
     and (
       coalesce(new.view_count, 0) > coalesce(old.view_count, 0)
       or (new.first_viewed_at is not null and old.first_viewed_at is null)
       or (new.last_viewed_at is not null and new.last_viewed_at is distinct from old.last_viewed_at)
     )
     and not public.arvo_is_member(new.organization_id)
  then
    new.status := 'sent';
    new.sent_at := coalesce(new.sent_at, new.first_viewed_at, now());
  end if;
  return new;
end
$function$
;

CREATE OR REPLACE FUNCTION private.arvo_proposal_customer_decided(p_responded_at timestamp with time zone, p_response_ip text, p_customer_responded_at timestamp with time zone)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  select p_customer_responded_at is not null
      or (p_responded_at is not null and nullif(btrim(coalesce(p_response_ip, '')), '') is not null)
$function$
;

CREATE OR REPLACE FUNCTION private.arvo_proposal_effective_status(p_status text, p_reason text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  select case
    when p_status = 'archived' and p_reason in ('accepted', 'rejected', 'expired') then p_reason
    else p_status
  end
$function$
;

CREATE OR REPLACE FUNCTION private.arvo_proposal_status_with_contract(p_status text, p_reason text, p_contract_status text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  select case
    when private.arvo_proposal_effective_status(p_status, p_reason) in ('expired', 'archived', 'sent', 'draft')
     and p_contract_status in ('draft', 'sent', 'signed', 'completed')
      then 'accepted'
    else private.arvo_proposal_effective_status(p_status, p_reason)
  end
$function$
;

CREATE OR REPLACE FUNCTION private.arvo_reconcile_party_installments(p_organization_id uuid, p_party_id uuid, p_dry_run boolean DEFAULT false)
 RETURNS TABLE(installment_id uuid, installment_no integer, amount bigint, due_date date)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_unallocated bigint;
  v_party_name text;
  r record;
begin
  if p_organization_id is null or p_party_id is null then
    return;
  end if;

  -- Eşzamanlı tahsilatlarda aynı taksidin iki kez kapanmasını önle.
  perform 1
  from public.payment_installments i
  join public.payment_plans p on p.id = i.payment_plan_id
  where p.organization_id = p_organization_id and p.party_id = p_party_id
  for update of i;

  select
    coalesce(sum(case
      when e.entry_type = 'credit' then e.amount
      when e.entry_type = 'debit' and e.source_type = 'adjustment' then -e.amount
      else 0
    end), 0)
  into v_unallocated
  from public.account_entries e
  where e.organization_id = p_organization_id and e.party_id = p_party_id;

  v_unallocated := v_unallocated - coalesce((
    select sum(i.amount)
    from public.payment_installments i
    join public.payment_plans p on p.id = i.payment_plan_id
    where p.organization_id = p_organization_id
      and p.party_id = p_party_id
      and i.status = 'paid'
  ), 0);

  select name into v_party_name from public.account_parties where id = p_party_id;

  for r in
    select i.id, i.installment_no, i.amount, i.due_date
    from public.payment_installments i
    join public.payment_plans p on p.id = i.payment_plan_id
    where p.organization_id = p_organization_id
      and p.party_id = p_party_id
      and i.status = 'pending'
    order by i.due_date nulls last, i.installment_no
  loop
    exit when v_unallocated < r.amount;
    v_unallocated := v_unallocated - r.amount;

    installment_id := r.id;
    installment_no := r.installment_no;
    amount := r.amount;
    due_date := r.due_date;
    return next;

    if not p_dry_run then
      update public.payment_installments
      set status = 'paid', paid_at = now()
      where id = r.id;

      -- collect_payment_installment ile aynı eşleştirme, ama tek satır.
      update public.finance_transactions
      set status = 'paid', paid_at = now(), updated_at = now()
      where id = (
        select ft.id
        from public.finance_transactions ft
        where ft.organization_id = p_organization_id
          and ft.transaction_type = 'income'
          and ft.status = 'planned'
          and ft.counterparty = v_party_name
          and ft.amount = r.amount
          and (ft.due_date = r.due_date or ft.due_date is null)
        order by ft.due_date nulls last
        limit 1
      );
    end if;
  end loop;

  if not p_dry_run then
    update public.payment_plans p
    set status = 'completed', updated_at = now()
    where p.organization_id = p_organization_id
      and p.party_id = p_party_id
      and p.status is distinct from 'completed'
      and exists (select 1 from public.payment_installments i where i.payment_plan_id = p.id)
      and not exists (
        select 1 from public.payment_installments i
        where i.payment_plan_id = p.id and i.status = 'pending'
      );
  end if;
end
$function$
;

CREATE OR REPLACE FUNCTION private.arvo_record_commission_rate()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if tg_op = 'INSERT'
     or new.commission_rate is distinct from old.commission_rate
     or new.operation_commission_rate is distinct from old.operation_commission_rate then
    insert into public.hr_employee_commission_rates
      (organization_id, employee_id, commission_rate, operation_commission_rate, valid_from, changed_by)
    values (
      new.organization_id,
      new.id,
      coalesce(new.commission_rate, 0)::numeric(5,2),
      coalesce(new.operation_commission_rate, 0)::numeric(5,2),
      case when tg_op = 'INSERT' then '-infinity'::timestamptz else now() end,
      auth.uid()
    );
  end if;
  return null;
end
$function$
;

CREATE OR REPLACE FUNCTION private.arvo_request_role()
 RETURNS text
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  select coalesce(
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
    nullif(current_setting('request.jwt.claim.role', true), '')
  );
$function$
;

CREATE OR REPLACE FUNCTION private.arvo_search_digits(value text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE PARALLEL SAFE
 SET search_path TO ''
AS $function$
  select ltrim(
    case
      when btrim(coalesce(value, '')) ~ '^(\+|00)[[:space:]]*9[[:space:]]*0' then regexp_replace(s.d, '^(00)?90', '')
      when length(s.d) > 10 then right(s.d, 10)
      else s.d
    end, '0')
  from (select regexp_replace(coalesce(value, ''), '[^0-9]', '', 'g') as d) s
$function$
;

CREATE OR REPLACE FUNCTION private.arvo_sozlesmeden_abonelik_istegi()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_kurum_turu text;
  v_musteri text;
begin
  -- Yalnızca imzaya GEÇİŞ; imzalı bir sözleşmenin her güncellemesi değil.
  if new.status is distinct from 'signed' or old.status = 'signed' then
    return new;
  end if;

  select o.kind into v_kurum_turu
  from public.organizations o
  where o.id = new.organization_id;

  /*
    Kapsam: yalnızca Arvo'nun kendi kurumundaki sözleşmeler. Kiracının
    kendi müşterisiyle imzaladığı sözleşme onun işi; konsola düşerse
    kurucu başkasının satışlarını onaylamaya çalışır.
  */
  if v_kurum_turu is distinct from 'internal' then
    return new;
  end if;

  select op.customer_name into v_musteri
  from public.crm_opportunities op
  where op.id = new.opportunity_id;

  insert into public.platform_subscription_requests (
    contract_id, source_organization_id, customer_name, contract_no,
    amount, currency, requested
  ) values (
    new.id, new.organization_id, v_musteri, new.contract_no,
    new.amount, coalesce(new.currency, 'TRY'), coalesce(new.subscription_intent, '{}'::jsonb)
  )
  -- Sözleşme yeniden imzalanamıyor (arvo_guard_contract_signature) ama
  -- tetikleyici yine de iki kez çalışabilir; kuyruk çiftlenmesin.
  on conflict (contract_id) do nothing;

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION private.arvo_sync_installment_due_dates()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_schedule jsonb;
begin
  v_schedule := coalesce(
    new.payment_schedule,
    (select p.payment_schedule from public.crm_proposals p where p.id = new.proposal_id)
  );
  if v_schedule is null or jsonb_typeof(v_schedule) <> 'array' then
    return new;
  end if;

  update public.payment_installments i
     set due_date = s.due_on
    from (
      select (x->>'sequence')::integer as seq, private.arvo_try_date(x->>'due_date') as due_on
      from jsonb_array_elements(v_schedule) x
      where jsonb_typeof(x) = 'object' and coalesce(x->>'sequence', '') ~ '^\d{1,3}$'
    ) s
   where i.payment_plan_id = new.payment_plan_id
     and i.installment_no = s.seq
     and s.due_on is not null
     and coalesce(i.status, '') not in ('paid', 'cancelled')
     and i.due_date is distinct from s.due_on;

  return new;
end
$function$
;

CREATE OR REPLACE FUNCTION private.arvo_sync_management_owner(p_organization_id uuid, p_user_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_grant boolean;
begin
  if p_organization_id is null or p_user_id is null then
    return;
  end if;

  select exists (
    select 1
    from public.hr_employees e
    where e.organization_id = p_organization_id
      and e.user_id = p_user_id
      and e.employment_status in ('active', 'on_leave')
      and private.arvo_is_management_department(e.department_id)
  ) into v_grant;

  -- Aşağıdaki güncellemeler elle yapılan rol değişikliği sayılmasın.
  perform set_config('arvo.management_sync', 'on', true);

  if v_grant then
    update public.organization_memberships m
    set role_before_management = m.role::text,
        role_from_management = true,
        role = 'owner'
    where m.organization_id = p_organization_id
      and m.user_id = p_user_id
      and m.role::text <> 'owner';
  else
    update public.organization_memberships m
    set role = coalesce(m.role_before_management, 'member')::public.membership_role,
        role_before_management = null,
        role_from_management = false
    where m.organization_id = p_organization_id
      and m.user_id = p_user_id
      and m.role_from_management;
  end if;

  perform set_config('arvo.management_sync', 'off', true);
end
$function$
;

CREATE OR REPLACE FUNCTION private.arvo_try_date(p_value text)
 RETURNS date
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO ''
AS $function$
begin
  if p_value is null or p_value !~ '^\d{4}-\d{2}-\d{2}$' then
    return null;
  end if;
  return p_value::date;
exception when others then
  return null;
end
$function$
;

CREATE OR REPLACE FUNCTION private.arvo_unreconcile_party_installments(p_organization_id uuid, p_party_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_available bigint;
  v_paid_total bigint;
  r record;
begin
  if p_organization_id is null or p_party_id is null then
    return;
  end if;

  -- Kapatma fonksiyonuyla aynı kilit, aynı sırayla.
  perform 1
  from public.payment_installments i
  join public.payment_plans p on p.id = i.payment_plan_id
  where p.organization_id = p_organization_id and p.party_id = p_party_id
  for update of i;

  -- Carideki net tahsilat: alacaklar eksi iadeler. Kapatma fonksiyonundaki
  -- hesabın birebir aynısı.
  select
    coalesce(sum(case
      when e.entry_type = 'credit' then e.amount
      when e.entry_type = 'debit' and e.source_type = 'adjustment' then -e.amount
      else 0
    end), 0)
  into v_available
  from public.account_entries e
  where e.organization_id = p_organization_id and e.party_id = p_party_id;

  select coalesce(sum(i.amount), 0)
  into v_paid_total
  from public.payment_installments i
  join public.payment_plans p on p.id = i.payment_plan_id
  where p.organization_id = p_organization_id
    and p.party_id = p_party_id
    and i.status = 'paid';

  if v_paid_total <= v_available then
    return;
  end if;

  for r in
    select i.id, i.amount
    from public.payment_installments i
    join public.payment_plans p on p.id = i.payment_plan_id
    where p.organization_id = p_organization_id
      and p.party_id = p_party_id
      and i.status = 'paid'
    order by i.due_date desc nulls first, i.installment_no desc
  loop
    exit when v_paid_total <= v_available;

    update public.payment_installments
    set status = 'pending', paid_at = null
    where id = r.id;

    v_paid_total := v_paid_total - r.amount;
  end loop;

  -- Açılan taksit varsa plan artık tamamlanmış sayılmaz.
  update public.payment_plans p
  set status = 'active', updated_at = now()
  where p.organization_id = p_organization_id
    and p.party_id = p_party_id
    and p.status = 'completed'
    and exists (
      select 1 from public.payment_installments i
      where i.payment_plan_id = p.id and i.status = 'pending'
    );
end
$function$
;

CREATE OR REPLACE FUNCTION private.arvo_within_one_edit(a text, b text)
 RETURNS boolean
 LANGUAGE plpgsql
 IMMUTABLE PARALLEL SAFE STRICT
 SET search_path TO ''
AS $function$
declare
  la integer := length(a);
  lb integer := length(b);
  i integer := 1;
  j integer := 1;
  edits integer := 0;
begin
  if abs(la - lb) > 1 then
    return false;
  end if;
  while i <= la and j <= lb loop
    if substr(a, i, 1) = substr(b, j, 1) then
      i := i + 1;
      j := j + 1;
    else
      edits := edits + 1;
      if edits > 1 then
        return false;
      end if;
      if la > lb then
        i := i + 1;
      elsif lb > la then
        j := j + 1;
      else
        i := i + 1;
        j := j + 1;
      end if;
    end if;
  end loop;
  return edits + (la - i + 1) + (lb - j + 1) <= 1;
end
$function$
;

CREATE OR REPLACE FUNCTION private.can_manage_organization_assets(organization_id_text text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1
    from public.organization_memberships m
    where m.user_id = (select auth.uid())
      and m.is_active = true
      and m.role::text in ('owner', 'admin')
      and m.organization_id::text = organization_id_text
  );
$function$
;

CREATE OR REPLACE FUNCTION private.create_default_organization_license()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  limits jsonb;
begin
  limits := private.default_license_limits(new.plan_code);
  insert into public.organization_licenses (
    organization_id, plan_code, license_status, trial_started_at, trial_ends_at,
    user_limit, storage_limit_mb, ai_credit_limit
  ) values (
    new.id, new.plan_code, 'trialing', now(), now() + interval '14 days',
    (limits ->> 'user_limit')::integer,
    (limits ->> 'storage_limit_mb')::bigint,
    (limits ->> 'ai_credit_limit')::bigint
  ) on conflict (organization_id) do nothing;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION private.default_license_limits(p_plan plan_code)
 RETURNS jsonb
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  select case p_plan
    when 'starter'::public.plan_code then jsonb_build_object('user_limit', 5, 'storage_limit_mb', 5120, 'ai_credit_limit', 50000)
    when 'professional'::public.plan_code then jsonb_build_object('user_limit', 25, 'storage_limit_mb', 51200, 'ai_credit_limit', 500000)
    else jsonb_build_object('user_limit', 250, 'storage_limit_mb', 512000, 'ai_credit_limit', 5000000)
  end;
$function$
;

CREATE OR REPLACE FUNCTION private.is_arvoos_founder()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists (
    select 1
    from public.organization_memberships membership
    join public.organizations organization
      on organization.id = membership.organization_id
    where organization.slug = 'arvo-os'
      and membership.user_id = (select auth.uid())
      and membership.is_active = true
      and membership.role = 'owner'
  );
$function$
;

CREATE OR REPLACE FUNCTION private.notify_crm_assignment()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  target_user_id uuid;
  assigner_name text;
begin
  if new.assigned_employee_id is null
     or (tg_op = 'UPDATE' and new.assigned_employee_id is not distinct from old.assigned_employee_id) then
    return new;
  end if;

  select employee.user_id into target_user_id
  from public.hr_employees employee
  where employee.id = new.assigned_employee_id
    and employee.organization_id = new.organization_id
    and employee.employment_status = 'active';

  if target_user_id is null or target_user_id = (select auth.uid()) then return new; end if;

  select employee.full_name into assigner_name
  from public.hr_employees employee
  where employee.organization_id = new.organization_id
    and employee.user_id = (select auth.uid())
  limit 1;

  insert into public.notifications (
    organization_id, user_id, audience, category, title, message, action_url, metadata
  ) values (
    new.organization_id,
    target_user_id,
    'organization',
    'sales_assignment',
    'Yeni talep atandı',
    coalesce(assigner_name, 'Yönetim') || ' tarafından ' || coalesce(new.customer_name, 'bir müşteri') ||
      ' müşterisine ait “' || coalesce(new.title, 'Yeni Talep') || '” talebi size atandı.',
    '/panel/crm/requests/' || new.id::text,
    jsonb_build_object('opportunity_id', new.id, 'assigned_employee_id', new.assigned_employee_id, 'assigned_by', (select auth.uid()))
  );
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION private.notify_crm_internal_comment()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  customer_name text;
  target_url text;
begin
  select opportunity.customer_name into customer_name
  from public.crm_opportunities opportunity where opportunity.id = new.opportunity_id;

  target_url := case new.context_type
    when 'proposal' then '/panel/crm/proposals/' || new.context_id::text
    when 'contract' then '/panel/crm/contracts/' || new.context_id::text
    when 'operation' then '/panel/operations/' || new.context_id::text
    else '/panel/crm/requests/' || new.opportunity_id::text
  end;

  insert into public.notifications (
    organization_id, user_id, audience, category, title, message, action_url, metadata
  )
  select distinct
    new.organization_id,
    recipient.user_id,
    'organization',
    'internal_comment',
    'Yeni kurum içi yorum',
    coalesce(customer_name, 'Bir müşteri') || ' kaydına yeni bir yorum eklendi.',
    target_url,
    jsonb_build_object(
      'comment_id', new.id, 'opportunity_id', new.opportunity_id,
      'context_type', new.context_type, 'context_id', new.context_id
    )
  from (
    select membership.user_id
    from public.organization_memberships membership
    where membership.organization_id = new.organization_id
      and membership.is_active and membership.role::text in ('owner', 'admin', 'manager')
    union
    select sales_employee.user_id
    from public.crm_opportunities opportunity
    join public.hr_employees sales_employee on sales_employee.id = opportunity.assigned_employee_id
    where opportunity.id = new.opportunity_id and sales_employee.user_id is not null
    union
    select operation_employee.user_id
    from public.crm_contracts contract
    join public.operation_workflows workflow on workflow.id = contract.workflow_id
    join public.hr_employees operation_employee on operation_employee.id = workflow.assigned_employee_id
    where contract.opportunity_id = new.opportunity_id and operation_employee.user_id is not null
  ) recipient
  where recipient.user_id is not null and recipient.user_id <> new.created_by;

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION private.notify_operation_assignment()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  target_user_id uuid;
  assigner_name text;
begin
  if new.assigned_employee_id is null
     or (tg_op = 'UPDATE' and new.assigned_employee_id is not distinct from old.assigned_employee_id) then
    return new;
  end if;

  select employee.user_id into target_user_id
  from public.hr_employees employee
  where employee.id = new.assigned_employee_id
    and employee.organization_id = new.organization_id
    and employee.employment_status = 'active';

  if target_user_id is null or target_user_id = (select auth.uid()) then return new; end if;

  select employee.full_name into assigner_name
  from public.hr_employees employee
  where employee.organization_id = new.organization_id
    and employee.user_id = (select auth.uid())
  limit 1;

  insert into public.notifications (
    organization_id, user_id, audience, category, title, message, action_url, metadata
  ) values (
    new.organization_id,
    target_user_id,
    'organization',
    'operation_assignment',
    'Yeni operasyon işi atandı',
    coalesce(assigner_name, 'Yönetim') || ' tarafından ' || coalesce(new.customer_name, 'kurum içi') ||
      ' kaydına ait “' || coalesce(new.title, 'Yeni İş') || '” operasyonu size atandı.',
    '/panel/operations/' || new.id::text,
    jsonb_build_object('workflow_id', new.id, 'assigned_employee_id', new.assigned_employee_id, 'assigned_by', (select auth.uid()))
  );
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION private.notify_payment_request_created()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare organization_name text;
begin
  select name into organization_name from public.organizations where id = new.organization_id;
  insert into public.notifications (organization_id, audience, category, title, message, action_url, metadata)
  values (
    new.organization_id,
    'founder',
    'payment_submitted',
    'Yeni ödeme bildirimi',
    coalesce(organization_name, 'Bir kurum') || ' EFT/Havale dekontu gönderdi.',
    '/panel/platform/payments',
    jsonb_build_object('payment_id', new.id, 'amount', new.amount, 'currency', new.currency, 'plan_code', new.plan_code)
  );
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION private.notify_payment_request_reviewed()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if old.status = new.status or new.status not in ('approved','rejected') then return new; end if;
  insert into public.notifications (organization_id, audience, category, title, message, action_url, metadata)
  values (
    new.organization_id,
    'organization',
    case when new.status = 'approved' then 'payment_approved' else 'payment_rejected' end,
    case when new.status = 'approved' then 'Ödemeniz onaylandı' else 'Ödemeniz reddedildi' end,
    case when new.status = 'approved'
      then 'EFT/Havale ödemeniz onaylandı ve lisansınız aktif edildi.'
      else 'EFT/Havale ödemeniz reddedildi. Açıklama: ' || coalesce(new.review_note, 'Belirtilmedi')
    end,
    '/panel/billing',
    jsonb_build_object('payment_id', new.id, 'status', new.status, 'review_note', new.review_note)
  );
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION private.process_won_crm_opportunity()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  new_workflow_id uuid;
  new_invoice_id uuid;
  workflow_due_date date;
begin
  if new.stage <> 'won' or old.stage = 'won' then
    return new;
  end if;

  -- Already handled by the formal contract-signing flow: do nothing.
  if exists (
    select 1 from public.crm_contracts contract
    where contract.opportunity_id = new.id
      and contract.workflow_id is not null
  ) then
    return new;
  end if;

  if exists (
    select 1 from public.crm_automation_runs automation
    where automation.opportunity_id = new.id
  ) then
    return new;
  end if;

  workflow_due_date := coalesce(new.expected_close_date, current_date + 30);

  insert into public.operation_workflows (
    organization_id,
    title,
    customer_name,
    description,
    status,
    priority,
    start_date,
    due_date,
    created_by
  ) values (
    new.organization_id,
    new.title,
    new.customer_name,
    concat('CRM fırsatından otomatik oluşturuldu. Fırsat: ', new.title),
    'planned',
    'normal',
    current_date,
    workflow_due_date,
    new.created_by
  ) returning id into new_workflow_id;

  insert into public.operation_steps (
    organization_id,
    workflow_id,
    title,
    sort_order
  ) values
    (new.organization_id, new_workflow_id, 'Müşteri ihtiyaçlarını ve kapsamı doğrula', 0),
    (new.organization_id, new_workflow_id, 'Teslimat planını oluştur', 1),
    (new.organization_id, new_workflow_id, 'Sorumluları ve terminleri ata', 2),
    (new.organization_id, new_workflow_id, 'Teslimatı tamamla ve müşteri onayı al', 3);

  insert into public.billing_invoices (
    organization_id,
    provider,
    status,
    currency,
    subtotal,
    tax,
    total,
    due_at
  ) values (
    new.organization_id,
    'manual',
    'open',
    'TRY',
    new.estimated_value,
    0,
    new.estimated_value,
    (workflow_due_date::timestamp at time zone 'Europe/Istanbul')
  ) returning id into new_invoice_id;

  insert into public.crm_automation_runs (
    opportunity_id,
    organization_id,
    workflow_id,
    invoice_id
  ) values (
    new.id,
    new.organization_id,
    new_workflow_id,
    new_invoice_id
  );

  insert into public.notifications (
    organization_id,
    audience,
    category,
    title,
    message,
    action_url,
    metadata
  ) values (
    new.organization_id,
    'organization',
    'crm_won_automation',
    'Satış operasyona aktarıldı',
    'Kazanılan fırsat için operasyon iş akışı ve açık ödeme kaydı otomatik oluşturuldu.',
    '/panel/operations',
    jsonb_build_object(
      'opportunity_id', new.id,
      'workflow_id', new_workflow_id,
      'invoice_id', new_invoice_id
    )
  );

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION private.touch_support_ticket()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  ticket_organization_id uuid;
begin
  select organization_id into ticket_organization_id
  from public.support_tickets
  where id = new.ticket_id;

  if ticket_organization_id is null or ticket_organization_id <> new.organization_id then
    raise exception 'Support ticket organization mismatch';
  end if;

  update public.support_tickets set last_message_at = new.created_at, updated_at = now(),
    status = case when new.is_staff then 'waiting_customer' else case when status in ('resolved','closed') then 'open' else status end end
  where id = new.ticket_id and organization_id = new.organization_id;
  insert into public.notifications (organization_id,audience,category,title,message,action_url,metadata)
  values (
    new.organization_id,
    case when new.is_staff then 'organization' else 'founder' end,
    'support_message',
    case when new.is_staff then 'Destek ekibinden yanıt' else 'Yeni destek mesajı' end,
    case when new.is_staff then 'Destek talebinize yeni bir yanıt eklendi.' else 'Bir kurum destek talebine yeni mesaj ekledi.' end,
    '/panel/support',
    jsonb_build_object('ticket_id',new.ticket_id,'message_id',new.id)
  );
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.accrue_operation_commission()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  employee_rate numeric(5,2);
  contract_amount bigint := 0;
  was_done boolean := old.status in ('completed', 'archived');
  is_done boolean := new.status in ('completed', 'archived');
begin
  if is_done and not was_done
     and new.assigned_employee_id is not null then
    select operation_commission_rate into employee_rate from public.hr_employees
      where id = new.assigned_employee_id and organization_id = new.organization_id
        and employment_status = 'active';
    if coalesce(employee_rate, 0) > 0 then
      if new.contract_id is not null then
        select coalesce(amount, 0) into contract_amount from public.crm_contracts
          where id = new.contract_id and organization_id = new.organization_id;
      end if;
      insert into public.hr_operation_commissions(
        organization_id, employee_id, workflow_id, contract_id,
        base_amount, commission_rate, commission_amount
      ) values (
        new.organization_id, new.assigned_employee_id, new.id, new.contract_id,
        coalesce(contract_amount, 0), employee_rate,
        round(coalesce(contract_amount, 0) * employee_rate / 100.0)
      )
      on conflict (workflow_id) do update set
        employee_id = excluded.employee_id,
        contract_id = excluded.contract_id,
        base_amount = excluded.base_amount,
        commission_rate = excluded.commission_rate,
        commission_amount = excluded.commission_amount,
        status = 'accrued',
        accrued_at = now(),
        approved_at = null,
        paid_at = null
      where public.hr_operation_commissions.status = 'cancelled';
    end if;
  elsif was_done and not is_done then
    update public.hr_operation_commissions
    set status = 'cancelled'
    where workflow_id = new.id
      and status in ('accrued', 'approved');
  end if;
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.add_standard_operation_steps(target_workflow_id uuid, target_organization_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  insert into public.operation_steps(organization_id, workflow_id, title, sort_order)
  select target_organization_id, target_workflow_id, item.title, item.sort_order
  from (values
    ('İş Kabul Edildi'::text, 10),
    ('Hazırlık Yapılıyor'::text, 20),
    ('Hazırlanıyor'::text, 30),
    ('İç Kontrol Yapılıyor'::text, 40),
    ('Hazırlandı'::text, 50),
    ('Müşteri İlişkileri Talimatı Bekleniyor'::text, 60),
    ('Revizyonlar Yapılıyor'::text, 70),
    ('Evrak Teslimine Hazır'::text, 80)
  ) as item(title, sort_order)
  where not exists (
    select 1
    from public.operation_steps existing
    where existing.workflow_id = target_workflow_id
      and existing.title = item.title
  );
end
$function$
;

CREATE OR REPLACE FUNCTION public.arc_address_before_write()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  -- user_id istemciden gelse bile her zaman oturum sahibine sabitlenir.
  new.user_id := auth.uid();
  new.updated_at := now();

  -- Aynı anda yalnızca bir varsayılan adres olabilir.
  if new.is_default then
    update public.arc_customer_addresses
       set is_default = false
     where user_id = new.user_id
       and id <> coalesce(new.id, '00000000-0000-0000-0000-000000000000'::uuid);
  end if;

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.arc_address_line(p_addr jsonb)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  select nullif(
    trim(
      concat_ws(
        ', ',
        public.arc_clean(p_addr ->> 'address1'),
        public.arc_clean(p_addr ->> 'address2')
      )
    ),
    ''
  );
$function$
;

CREATE OR REPLACE FUNCTION public.arc_adjust_inventory(p_variant_id uuid, p_quantity integer, p_kind text, p_reference_type text DEFAULT NULL::text, p_reference_id text DEFAULT NULL::text, p_note text DEFAULT NULL::text)
 RETURNS TABLE(variant_id uuid, previous_stock integer, new_stock integer, movement_id uuid)
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  v_user_id uuid := auth.uid();
  v_org_id uuid;
  v_prev integer;
  v_next integer;
  v_allow_backorder boolean;
  v_movement_id uuid;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  if p_quantity = 0 then
    raise exception 'Quantity cannot be zero';
  end if;

  if p_kind not in ('in','out','adjustment','sale','return','sync') then
    raise exception 'Invalid inventory movement kind';
  end if;

  select organization_id, stock, allow_backorder
    into v_org_id, v_prev, v_allow_backorder
  from public.arc_product_variants
  where id = p_variant_id
  for update;

  if v_org_id is null then
    raise exception 'Variant not found';
  end if;

  if not exists (
    select 1
    from public.organization_memberships m
    where m.organization_id = v_org_id
      and m.user_id = v_user_id
      and m.is_active = true
      and m.role in ('owner','admin','manager')
  ) then
    raise exception 'Insufficient permissions';
  end if;

  if not exists (
    select 1
    from public.organization_modules om
    where om.organization_id = v_org_id
      and om.module_code = 'commerce'
      and om.is_enabled = true
  ) then
    raise exception 'Commerce module is disabled';
  end if;

  v_next := v_prev + p_quantity;

  if v_next < 0 and not v_allow_backorder then
    raise exception 'Insufficient stock and backorder is disabled';
  end if;

  update public.arc_product_variants
  set stock = v_next,
      updated_at = now()
  where id = p_variant_id;

  insert into public.arc_inventory_movements (
    organization_id,
    variant_id,
    kind,
    quantity,
    reference_type,
    reference_id,
    note,
    created_by
  ) values (
    v_org_id,
    p_variant_id,
    p_kind,
    p_quantity,
    p_reference_type,
    p_reference_id,
    p_note,
    v_user_id
  ) returning id into v_movement_id;

  return query select p_variant_id, v_prev, v_next, v_movement_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.arc_aktarim_hesaplar()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  with secili as (
    select u.id
    from auth.users u
    where exists (
            select 1 from public.organization_memberships m
            join public.organization_product_licenses l on l.organization_id = m.organization_id and l.product = 'arc'
            where m.user_id = u.id)
       or exists (select 1 from public.arc_orders o where o.user_id = u.id)
       or exists (select 1 from public.arc_customer_addresses a where a.user_id = u.id)
       or exists (select 1 from public.arc_customer_favourites f where f.user_id = u.id)
       or exists (select 1 from public.arc_return_requests r where r.user_id = u.id)
       or u.id in (
            select created_by from public.arc_products where created_by is not null
            union select created_by from public.arc_inventory_movements where created_by is not null
            union select created_by from public.arc_import_batches where created_by is not null
            union select created_by from public.arc_order_events where created_by is not null
            union select updated_by from public.arc_store_themes where updated_by is not null)
       or (not exists (select 1 from public.organization_memberships m where m.user_id = u.id)
           and not (coalesce(u.raw_user_meta_data, '{}'::jsonb) ?| array['arvoos_employee_id', 'arvoos_invitation_id', 'arvoos_organization_id']))
  )
  select jsonb_build_object(
    'kullanicilar', coalesce((select jsonb_agg(to_jsonb(u)) from auth.users u where u.id in (select id from secili)), '[]'::jsonb),
    'kimlikler', coalesce((select jsonb_agg(to_jsonb(i)) from auth.identities i where i.user_id in (select id from secili)), '[]'::jsonb)
  );
$function$
;

CREATE OR REPLACE FUNCTION public.arc_baslik(p_text text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  select nullif(
    array_to_string(
      array(
        select
          case
            when kelime = '' then ''
            -- İlk harf Türkçe kurallarıyla büyütülür.
            when left(kelime, 1) = 'i' then 'İ' || substr(kelime, 2)
            when left(kelime, 1) = 'ı' then 'I' || substr(kelime, 2)
            else upper(left(kelime, 1)) || substr(kelime, 2)
          end
        from unnest(
          string_to_array(
            -- Türkçe küçültme: I→ı, İ→i, sonra genel lower().
            lower(translate(coalesce(p_text, ''), 'IİĞÜŞÖÇ', 'ıiğüşöç')),
            ' '
          )
        ) as kelime
      ),
      ' '
    ),
    ''
  );
$function$
;

CREATE OR REPLACE FUNCTION public.arc_bulk_update_supplier_stock(p_organization_id uuid, p_supplier text, p_rows jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_updated integer;
begin
  if p_organization_id is null then
    raise exception 'Mağaza belirtilmedi';
  end if;

  /*
    Gelen JSON dizisi tabloya açılıp tek UPDATE ile uygulanır.

    Beklenen biçim:
    [{"sku":"869-1395-...","stock":12,"cost":19965,"price":33990}]
  */
  with veri as (
    select
      (row ->> 'sku')::text as sku,
      (row ->> 'stock')::integer as stock,
      (row ->> 'cost')::bigint as cost,
      (row ->> 'price')::bigint as price
    from jsonb_array_elements(p_rows) as row
  )
  update public.arc_product_variants v
     set stock = d.stock,
         cost_price = d.cost,
         price = d.price,
         updated_at = now()
    from veri d
   where v.organization_id = p_organization_id
     and v.supplier = p_supplier
     and v.supplier_sku = d.sku
     -- Değişmemiş satırı yazmamak gereksiz WAL trafiğini önler.
     and (v.stock is distinct from d.stock
          or v.price is distinct from d.price
          or v.cost_price is distinct from d.cost);

  get diagnostics v_updated = row_count;
  return v_updated;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.arc_categorize_supplier_products(p_supplier text DEFAULT 'tarzyeri'::text, p_organization_id uuid DEFAULT NULL::uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_org_id uuid;
  v_links integer := 0;
  v_added integer;
begin
  /*
    Kurum artık çağırandan gelir. Parametre verilmezse eski davranış korunur
    (arvoculture): bu fonksiyonu elle çağıran eski kayıtlar ve alışkanlıklar
    bozulmasın. Yeni çağrılar kurumu açıkça geçiyor.
  */
  v_org_id := p_organization_id;
  if v_org_id is null then
    select id into v_org_id
    from public.organizations where slug = 'arvoculture' limit 1;
  end if;

  if v_org_id is null then
    raise exception 'Organizasyon bulunamadı';
  end if;

  create temporary table if not exists arc_kategori_gecici (
    product_id uuid,
    ana text,      -- Erkek, Kadın, Çocuk, Aksesuar
    grup text,     -- Üst Giyim, Alt Giyim, Dış Giyim…
    tur text       -- T-Shirt, Ceket, Kol Saati…
  ) on commit drop;

  -- pg_safeupdate: where'süz delete reddedilir; truncate korumaya takılmaz.
  truncate table arc_kategori_gecici;

  insert into arc_kategori_gecici
  select
    p.id,
    public.arc_baslik(trim(split_part(k, '>', 1))),
    /*
      Menü grubu normalleştirmesi.

      - "ERKEK ALT GİYİM" → "Alt Giyim" (cinsiyet öneki atılır)
      - "UNİSEX ÇOCUK"    → "Çocuk"
      - Aksesuarda ikinci seviye cinsiyettir; grup "Aksesuar"
        olarak sabitlenir.
    */
    case
      when upper(trim(split_part(k, '>', 1))) = 'AKSESUAR'
        then 'Aksesuar'
      else public.arc_baslik(
        trim(
          regexp_replace(
            trim(split_part(k, '>', 2)),
            '^(ERKEK|KADIN|UNİSEX|UNISEX)\s+', '', 'i'
          )
        )
      )
    end,
    public.arc_baslik(trim(split_part(k, '>', 3)))
  from public.arc_products p
  cross join lateral (
    select p.metadata ->> 'supplier_category' as k
  ) x
  where p.organization_id = v_org_id
    and p.supplier = p_supplier
    and p.status = 'active'
    and coalesce(x.k, '') <> '';

  -- Ana koleksiyonlar: Erkek, Kadın, Çocuk, Aksesuar
  insert into public.arc_collections
    (organization_id, title, slug, description, status, metadata)
  select distinct
    v_org_id, t.ana, public.arc_slugify(t.ana), '', 'active',
    jsonb_build_object('menu_group', 'Kime Göre', 'auto', true)
  from arc_kategori_gecici t
  where coalesce(t.ana, '') <> ''
  on conflict (organization_id, slug) do nothing;

  -- Tür koleksiyonları: "Erkek T-Shirt", "Kadın Ceket"…
  insert into public.arc_collections
    (organization_id, title, slug, description, status, metadata)
  select distinct
    v_org_id,
    t.ana || ' ' || t.tur,
    public.arc_slugify(t.ana || '-' || t.tur),
    '', 'active',
    jsonb_build_object(
      'menu_group', coalesce(nullif(t.grup, ''), t.ana),
      'parent', t.ana,
      'auto', true
    )
  from arc_kategori_gecici t
  where coalesce(t.tur, '') <> ''
  on conflict (organization_id, slug) do nothing;

  /*
    Var olan otomatik koleksiyonların başlığını ve menü grubunu
    da tazele — önceki sürüm bozuk Türkçe üretmişti.
  */
  update public.arc_collections c
     set title = t.ana,
         metadata = c.metadata || jsonb_build_object('menu_group', 'Kime Göre'),
         updated_at = now()
  from (select distinct ana from arc_kategori_gecici) t
  where c.organization_id = v_org_id
    and c.metadata ->> 'auto' = 'true'
    and c.slug = public.arc_slugify(t.ana);

  update public.arc_collections c
     set title = t.ana || ' ' || t.tur,
         metadata = c.metadata || jsonb_build_object(
           'menu_group', coalesce(nullif(t.grup, ''), t.ana),
           'parent', t.ana
         ),
         updated_at = now()
  from (select distinct ana, grup, tur from arc_kategori_gecici) t
  where c.organization_id = v_org_id
    and c.metadata ->> 'auto' = 'true'
    and c.slug = public.arc_slugify(t.ana || '-' || t.tur);

  -- Bağlantılar
  insert into public.arc_collection_products
    (organization_id, collection_id, product_id)
  select v_org_id, c.id, t.product_id
  from arc_kategori_gecici t
  join public.arc_collections c
    on c.organization_id = v_org_id
   and c.slug = public.arc_slugify(t.ana)
  where coalesce(t.ana, '') <> ''
  on conflict (collection_id, product_id) do nothing;

  get diagnostics v_added = row_count;
  v_links := v_links + v_added;

  insert into public.arc_collection_products
    (organization_id, collection_id, product_id)
  select v_org_id, c.id, t.product_id
  from arc_kategori_gecici t
  join public.arc_collections c
    on c.organization_id = v_org_id
   and c.slug = public.arc_slugify(t.ana || '-' || t.tur)
  where coalesce(t.tur, '') <> ''
  on conflict (collection_id, product_id) do nothing;

  get diagnostics v_added = row_count;
  v_links := v_links + v_added;

  return v_links;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.arc_check_coupon(p_organization_id uuid, p_code text, p_subtotal bigint DEFAULT NULL::bigint, p_email text DEFAULT NULL::text)
 RETURNS TABLE(valid boolean, message text, discount_type text, value numeric, minimum_subtotal bigint, discount_amount bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_d public.arc_discounts%rowtype;
  v_used integer := 0;
  v_amount bigint := 0;
begin
  if p_organization_id is null then
    return query select false, 'Mağaza bulunamadı.'::text, null::text, null::numeric, null::bigint, 0::bigint;
    return;
  end if;

  if p_code is null or length(trim(p_code)) = 0 then
    return query select false, 'Kupon kodu girin.'::text, null::text,
      null::numeric, null::bigint, 0::bigint;
    return;
  end if;

  select * into v_d
  from public.arc_discounts d
  where d.organization_id = p_organization_id
    and upper(d.code) = upper(trim(p_code))
  limit 1;

  if v_d.id is null then
    return query select false, 'Bu kod geçerli değil.'::text, null::text,
      null::numeric, null::bigint, 0::bigint;
    return;
  end if;

  if v_d.status <> 'active' then
    return query select false, 'Bu kampanya artık geçerli değil.'::text,
      null::text, null::numeric, null::bigint, 0::bigint;
    return;
  end if;

  if v_d.starts_at is not null and v_d.starts_at > now() then
    return query select false, 'Bu kampanya henüz başlamadı.'::text,
      null::text, null::numeric, null::bigint, 0::bigint;
    return;
  end if;

  if v_d.ends_at is not null and v_d.ends_at < now() then
    return query select false, 'Bu kampanyanın süresi dolmuş.'::text,
      null::text, null::numeric, null::bigint, 0::bigint;
    return;
  end if;

  /* Toplam kullanım hakkı. */
  if v_d.usage_limit is not null
     and coalesce(v_d.usage_count, 0) >= v_d.usage_limit then
    return query select false, 'Bu kampanyanın kullanım hakkı dolmuş.'::text,
      null::text, null::numeric, null::bigint, 0::bigint;
    return;
  end if;

  /*
    Müşteri başına kullanım. "İlk alışverişe özel" kodlarda kritik:
    aynı müşteri ikinci kez kullanamamalı.
  */
  if v_d.per_customer_limit is not null and p_email is not null then
    select count(*) into v_used
    from public.arc_orders o
    where o.organization_id = p_organization_id
      and lower(o.customer_email) = lower(trim(p_email))
      and upper(coalesce(o.metadata ->> 'coupon_code', '')) = upper(trim(p_code))
      and o.status not in ('cancelled', 'refunded')
      /*
        Ödenmemiş sipariş hakkı YAKMAZ. Sipariş satırı ödemeden ÖNCE
        'pending' olarak yazılıyor; müşteri PayTR ekranını kapatıp tekrar
        denediğinde kendi kodunu kullanamaz hale geliyordu.

        Sayılanlar: ödenmiş siparişler (kısmi iade dahil, para geçmiş) ve
        hâlâ akıştaki taze denemeler. 30 dakikalık pencere, aynı anda iki
        sekmeden kupon yakmayı engellerken terk edilmiş ödemeyi serbest
        bırakıyor. Havale siparişi onaylanınca 'paid' oluyor, zaten sayılır.
      */
      and (
        o.payment_status in ('paid', 'partially_refunded')
        or o.created_at > now() - interval '30 minutes'
      );

    if v_used >= v_d.per_customer_limit then
      return query select false,
        'Bu indirim kodunu daha önce kullandınız.'::text,
        null::text, null::numeric, null::bigint, 0::bigint;
      return;
    end if;
  end if;

  /*
    Alt limit yalnızca ara toplam BİLİNİYORSA kontrol edilir. Bilinmiyorsa
    (p_subtotal null) bu kural atlanır; sipariş oluşturulurken gerçek ara
    toplamla zaten uygulanıyor.
  */
  if p_subtotal is not null
     and v_d.minimum_subtotal is not null
     and p_subtotal < v_d.minimum_subtotal then
    return query select false,
      format('Bu kod %s TL ve üzeri siparişlerde geçerli.',
             to_char(v_d.minimum_subtotal / 100.0, 'FM999G999D00'))::text,
      null::text, null::numeric, v_d.minimum_subtotal, 0::bigint;
    return;
  end if;

  /*
    İndirim tutarı. Sabit indirimde value zaten kuruş (panel
    Math.round(tutar*100) ile yazıyor). Ara toplam bilinmiyorsa tutar
    hesaplanamaz; 0 dönülür, kodun geçerliliği yine bildirilir.
  */
  if p_subtotal is null then
    v_amount := 0;
  elsif v_d.discount_type = 'percentage' then
    v_amount := round(p_subtotal * v_d.value / 100);
  else
    v_amount := least(v_d.value::bigint, p_subtotal);
  end if;

  return query select true, 'Kod uygulandı.'::text, v_d.discount_type,
    v_d.value, v_d.minimum_subtotal, v_amount;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.arc_check_supplier_stock()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_available boolean;
  v_stock integer;
begin
  select
    public.arc_variant_available(v.stock, v.allow_backorder, v.supplier),
    v.stock
  into v_available, v_stock
  from public.arc_product_variants v
  where v.organization_id = new.organization_id
    and v.sku = new.sku
  limit 1;

  -- Varyant bulunamazsa engelleme: manuel siparişlerde SKU
  -- katalogda olmayabilir.
  if v_available is null then
    return new;
  end if;

  if not v_available then
    raise exception 'Bu ürün şu anda satışa kapalı (stok: %).', v_stock
      using errcode = 'check_violation';
  end if;

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.arc_clean(p_value text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  select nullif(trim(both from regexp_replace(coalesce(p_value, ''), '^''+', '')), '');
$function$
;

CREATE OR REPLACE FUNCTION public.arc_count_coupon_use()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_code text := nullif(upper(trim(coalesce(new.metadata ->> 'coupon_code', ''))), '');
begin
  if v_code is not null
     and new.payment_status = 'paid'
     and coalesce(old.payment_status, '') not in ('paid', 'partially_refunded', 'refunded') then
    update public.arc_discounts d
       set usage_count = d.usage_count + 1,
           updated_at = now()
     where d.organization_id = new.organization_id
       and upper(d.code) = v_code;
  end if;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.arc_create_order(p_customer_name text, p_customer_email text, p_items jsonb, p_source text DEFAULT 'native'::text)
 RETURNS TABLE(order_id uuid, order_number text, total bigint)
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  v_user_id uuid := auth.uid();
  v_org_id uuid;
  v_order_id uuid;
  v_order_number text;
  v_total bigint := 0;
  v_item jsonb;
  v_variant_id uuid;
  v_quantity integer;
  v_variant record;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  if p_source not in ('native','shopify') then
    raise exception 'Invalid order source';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Order must contain at least one item';
  end if;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_variant_id := nullif(v_item->>'variant_id','')::uuid;
    v_quantity := nullif(v_item->>'quantity','')::integer;

    if v_variant_id is null or v_quantity is null or v_quantity <= 0 then
      raise exception 'Invalid order item';
    end if;

    select v.id, v.organization_id, v.product_id, v.sku, v.price, v.currency, v.stock, v.allow_backorder, p.name as product_name
      into v_variant
    from public.arc_product_variants v
    join public.arc_products p on p.id = v.product_id and p.organization_id = v.organization_id
    where v.id = v_variant_id
    for update of v;

    if not found then
      raise exception 'Variant not found';
    end if;

    if v_org_id is null then
      v_org_id := v_variant.organization_id;
    elsif v_org_id <> v_variant.organization_id then
      raise exception 'All order items must belong to the same organization';
    end if;

    if (v_variant.stock - v_quantity) < 0 and not v_variant.allow_backorder then
      raise exception 'Insufficient stock for SKU %', v_variant.sku;
    end if;

    v_total := v_total + (v_variant.price * v_quantity);
  end loop;

  if not exists (
    select 1 from public.organization_memberships m
    where m.organization_id = v_org_id
      and m.user_id = v_user_id
      and m.is_active = true
      and m.role in ('owner','admin','manager')
  ) then
    raise exception 'Insufficient permissions';
  end if;

  if not exists (
    select 1 from public.organization_modules om
    where om.organization_id = v_org_id
      and om.module_code = 'commerce'
      and om.is_enabled = true
  ) then
    raise exception 'Commerce module is disabled';
  end if;

  v_order_number := 'ARC-' || to_char(clock_timestamp(), 'YYYYMMDD-HH24MISS') || '-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,6));

  insert into public.arc_orders (
    organization_id, order_number, source, status, payment_status,
    customer_email, customer_name, currency, subtotal, tax, shipping, total, metadata
  ) values (
    v_org_id, v_order_number, p_source, 'pending', 'pending',
    nullif(trim(p_customer_email), ''), nullif(trim(p_customer_name), ''), 'TRY', v_total, 0, 0, v_total, '{}'::jsonb
  ) returning id into v_order_id;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_variant_id := (v_item->>'variant_id')::uuid;
    v_quantity := (v_item->>'quantity')::integer;

    select v.id, v.organization_id, v.product_id, v.sku, v.price, v.currency, v.stock, v.allow_backorder, p.name as product_name
      into v_variant
    from public.arc_product_variants v
    join public.arc_products p on p.id = v.product_id and p.organization_id = v.organization_id
    where v.id = v_variant_id;

    insert into public.arc_order_items (
      organization_id, order_id, variant_id, product_name, sku, quantity, unit_price, total
    ) values (
      v_org_id, v_order_id, v_variant_id, v_variant.product_name, v_variant.sku,
      v_quantity, v_variant.price, v_variant.price * v_quantity
    );

    perform public.arc_adjust_inventory(
      v_variant_id,
      -v_quantity,
      'sale',
      'order',
      v_order_id::text,
      'Sipariş ' || v_order_number
    );
  end loop;

  return query select v_order_id, v_order_number, v_total;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.arc_create_storefront_order(p_organization_id uuid, p_email text, p_name text, p_phone text, p_address jsonb, p_items jsonb, p_coupon_code text DEFAULT NULL::text)
 RETURNS TABLE(order_id uuid, order_number text, total bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_order_id uuid;
  v_order_number text;
  v_prefix text;
  v_shipping_fee bigint;
  v_free_threshold bigint;
  v_subtotal bigint := 0;
  v_shipping bigint := 0;
  v_discount bigint := 0;
  v_total bigint := 0;
  v_item jsonb;
  v_key text;
  v_qty integer;
  v_variant record;
  v_count integer := 0;
  v_addr jsonb;
  v_free_shipping_coupon boolean := false;
begin
  if p_organization_id is null then
    raise exception 'Mağaza belirtilmedi';
  end if;

  -- Satış ayarları mağazadan; satır yoksa bugünkü ArvoCulture değerleri.
  select coalesce(s.order_prefix, 'AC'),
         coalesce(s.shipping_fee, 12000),
         coalesce(s.free_shipping_threshold, 200000)
    into v_prefix, v_shipping_fee, v_free_threshold
  from public.arc_store_settings s
  where s.organization_id = p_organization_id;

  v_prefix := coalesce(v_prefix, 'AC');
  v_shipping_fee := coalesce(v_shipping_fee, 12000);
  v_free_threshold := coalesce(v_free_threshold, 200000);

  if p_email is null or p_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]{2,}$' then
    raise exception 'Geçersiz e-posta';
  end if;

  if p_name is null or char_length(trim(p_name)) < 2 then
    raise exception 'Geçersiz ad soyad';
  end if;

  if jsonb_typeof(p_items) is distinct from 'array'
     or jsonb_array_length(p_items) = 0 then
    raise exception 'Sepet boş';
  end if;

  if jsonb_array_length(p_items) > 50 then
    raise exception 'Sepette çok fazla kalem var';
  end if;

  /*
    Panelin okuduğu adres yapısı. Alan adları Shopify aktarımıyla aynı
    tutulur ki panelde tek bir gösterim kodu yeterli olsun.
  */
  v_addr := jsonb_build_object(
    'name', trim(p_name),
    'phone', nullif(trim(coalesce(p_phone, '')), ''),
    'address1', nullif(trim(coalesce(p_address ->> 'line', '')), ''),
    'address2', null,
    'city', nullif(trim(coalesce(p_address ->> 'city', '')), ''),
    'province', nullif(trim(coalesce(p_address ->> 'district', '')), ''),
    'zip', nullif(trim(coalesce(p_address ->> 'postal', '')), ''),
    'country', coalesce(nullif(trim(coalesce(p_address ->> 'country', '')), ''), 'TR')
  );

  v_order_number := v_prefix || to_char(now(), 'YYMMDD') || '-' ||
                    upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));

  insert into public.arc_orders (
    organization_id, order_number, source, status, payment_status,
    customer_email, customer_name, currency, metadata
  )
  values (
    p_organization_id, v_order_number, 'native', 'pending', 'pending',
    lower(trim(p_email)), trim(p_name), 'TRY',
    jsonb_build_object(
      'phone', p_phone,
      'shipping_address', v_addr,
      'billing', v_addr,
      'address', p_address,
      'coupon_code', p_coupon_code,
      'channel', 'storefront'
    )
  )
  returning id into v_order_id;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_key := v_item ->> 'sku';
    v_qty := coalesce((v_item ->> 'quantity')::integer, 0);

    if v_key is null or v_qty < 1 or v_qty > 20 then
      raise exception 'Geçersiz sepet kalemi';
    end if;

    -- Önce SKU, bulunamazsa ürün slug'ı.
    select v.id, v.price, v.stock, v.allow_backorder, p.name
      into v_variant
    from public.arc_product_variants v
    join public.arc_products p
      on p.id = v.product_id
     and p.organization_id = v.organization_id
    where v.organization_id = p_organization_id
      and p.status = 'active'
      and (v.sku = v_key or p.slug = v_key)
    order by
      (v.sku = v_key) desc,
      (v.stock > 0) desc,
      v.price asc
    limit 1;

    if not found then
      raise exception 'Ürün bulunamadı: %', v_key;
    end if;

    if v_variant.stock < v_qty
       and not coalesce(v_variant.allow_backorder, false) then
      raise exception 'Yetersiz stok: %', v_variant.name;
    end if;

    insert into public.arc_order_items (
      organization_id, order_id, variant_id,
      product_name, sku, quantity, unit_price, total
    )
    values (
      p_organization_id, v_order_id, v_variant.id,
      v_variant.name, v_key, v_qty,
      v_variant.price, v_variant.price * v_qty
    );

    v_subtotal := v_subtotal + (v_variant.price * v_qty);
    v_count := v_count + 1;
  end loop;

  if v_count = 0 then
    raise exception 'Sepet boş';
  end if;

  if p_coupon_code is not null and length(trim(p_coupon_code)) > 0 then
    select case
             when d.discount_type = 'percentage'
               then (v_subtotal * d.value) / 100
             when d.discount_type = 'fixed_amount'
               then least(d.value, v_subtotal)
             else 0
           end,
           d.discount_type = 'free_shipping'
      into v_discount, v_free_shipping_coupon
    from public.arc_discounts d
    where d.organization_id = p_organization_id
      and upper(d.code) = upper(trim(p_coupon_code))
      and d.status = 'active'
      and (d.starts_at is null or d.starts_at <= now())
      and (d.ends_at is null or d.ends_at > now())
      and (d.usage_limit is null or d.usage_count < d.usage_limit)
      and v_subtotal >= coalesce(d.minimum_subtotal, 0)
    limit 1;

    v_discount := coalesce(v_discount, 0);
    v_free_shipping_coupon := coalesce(v_free_shipping_coupon, false);
  end if;

  /*
    Ücretsiz kargo iki yoldan gelir:
      - "Ücretsiz Kargo" tipli kupon (eskiden hiçbir şey yapmıyordu),
      - eşiği geçen sepet.
    Eşik indirim ÖNCESİ ara toplamla karşılaştırılır: eskiden indirim
    sonrası tutarla bakılıyordu, yani kupon kullanan müşteri ücretsiz
    kargoyu kaybediyordu.
  */
  if v_free_shipping_coupon or v_subtotal >= v_free_threshold then
    v_shipping := 0;
  else
    v_shipping := v_shipping_fee;
  end if;

  v_total := greatest(v_subtotal - v_discount, 0) + v_shipping;

  update public.arc_orders
     set subtotal = v_subtotal,
         shipping = v_shipping,
         total = v_total,
         metadata = metadata || jsonb_build_object('discount', v_discount),
         updated_at = now()
   where id = v_order_id;

  return query select v_order_id, v_order_number, v_total;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.arc_decode_entities(t text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select replace(replace(replace(replace(replace(replace(replace(replace(
         replace(replace(replace(replace(replace(replace(replace(replace(
         replace(replace(replace(replace(replace(replace(replace(replace(
         replace(replace(coalesce(t,''),
         '&Uuml;','Ü'),'&uuml;','ü'),
         '&Ouml;','Ö'),'&ouml;','ö'),
         '&Ccedil;','Ç'),'&ccedil;','ç'),
         '&Scedil;','Ş'),'&scedil;','ş'),
         '&Gbreve;','Ğ'),'&gbreve;','ğ'),
         '&Idot;','İ'),'&inodot;','ı'),
         '&ndash;','–'),'&mdash;','—'),
         '&rsquo;','’'),'&lsquo;','‘'),
         '&ldquo;','“'),'&rdquo;','”'),
         '&bull;','•'),'&hellip;','…'),
         '&rarr;','→'),'&eacute;','é'),
         '&acirc;','â'),'&nbsp;',' '),
         '&gt;','>'),'&lt;','<')
$function$
;

CREATE OR REPLACE FUNCTION public.arc_extract_vat(p_gross bigint, p_rate numeric)
 RETURNS bigint
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  /*
    KDV dâhil tutardan vergi payını çıkarır.

    Örnek: 366,90 TL, %10 → 366,90 - (366,90 / 1,10) = 33,35 TL

    Kuruş bazında yuvarlanır; toplamda kuruş farkı oluşmaması
    için her kalem ayrı hesaplanıp toplanır.
  */
  select case
    when p_gross is null or p_rate is null or p_rate <= 0 then 0
    else round(p_gross - (p_gross / (1 + p_rate / 100)))::bigint
  end;
$function$
;

CREATE OR REPLACE FUNCTION public.arc_fill_order_tax()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_rate numeric;
  v_tax bigint := 0;
  v_discount bigint := 0;
  v_gross bigint := 0;
begin
  -- Yalnızca yeni siparişte ve vergi girilmemişse hesapla.
  if coalesce(new.tax, 0) <> 0 then
    return new;
  end if;

  select coalesce(s.default_tax_rate, 20) into v_rate
  from public.arc_store_settings s
  where s.organization_id = new.organization_id;

  /*
    Her kalem kendi ürününün oranıyla hesaplanır. Ürün
    bulunamazsa mağaza varsayılanı kullanılır.
  */
  select coalesce(sum(
    public.arc_extract_vat(i.total, coalesce(p.tax_rate, v_rate, 20))
  ), 0)
  into v_tax
  from public.arc_order_items i
  left join public.arc_product_variants v
    on v.organization_id = i.organization_id
   and v.sku = i.sku
  left join public.arc_products p
    on p.id = v.product_id
  where i.order_id = new.id;

  -- Kargo da KDV'ye tabidir; genel oranla hesaplanır.
  v_tax := v_tax + public.arc_extract_vat(
    coalesce(new.shipping, 0),
    coalesce(v_rate, 20)
  );

  /*
    İndirim payı düşülür.

    Vergi kalem tutarları üzerinden hesaplanıyor ama müşteri
    indirimli tutarı ödüyor. İndirim düşülmezse devlete fazla
    vergi beyan edilir.

    İndirim toplam üzerinden orantılı dağıtılıyor: hangi kaleme
    ait olduğu bilinmiyor.
  */
  v_discount := coalesce((new.metadata ->> 'discount')::bigint, 0);
  v_gross := coalesce(new.subtotal, 0) + coalesce(new.shipping, 0);

  if v_discount > 0 and v_gross > 0 then
    v_tax := round(v_tax * (1 - v_discount::numeric / v_gross))::bigint;
  end if;

  update public.arc_orders
  set tax = v_tax
  where id = new.id;

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.arc_find_address(p_meta jsonb)
 RETURNS jsonb
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  select coalesce(
    case when jsonb_typeof(p_meta -> 'shipping_address') = 'object'
         then p_meta -> 'shipping_address' end,
    case when jsonb_typeof(p_meta -> 'billing') = 'object'
         then p_meta -> 'billing' end,
    case when jsonb_typeof(p_meta -> 'billing_address') = 'object'
         then p_meta -> 'billing_address' end,
    case when jsonb_typeof(p_meta -> 'address') = 'object'
         then p_meta -> 'address' end,
    '{}'::jsonb
  );
$function$
;

CREATE OR REPLACE FUNCTION public.arc_first_text(p_source jsonb, VARIADIC p_keys text[])
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  select coalesce(
    (
      select nullif(trim(p_source ->> k), '')
      from unnest(p_keys) as k
      where nullif(trim(p_source ->> k), '') is not null
      limit 1
    ),
    null
  );
$function$
;

CREATE OR REPLACE FUNCTION public.arc_log_order_event()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
if old.status is distinct from new.status or old.payment_status is distinct from new.payment_status then insert into public.arc_order_events(organization_id,order_id,event_type,event_data,created_by) values(new.organization_id,new.id,'status_updated',jsonb_build_object('old_status',old.status,'new_status',new.status,'old_payment_status',old.payment_status,'new_payment_status',new.payment_status),auth.uid());
elsif (old.metadata->>'shipping_carrier') is distinct from (new.metadata->>'shipping_carrier') or (old.metadata->>'tracking_number') is distinct from (new.metadata->>'tracking_number') or (old.metadata->>'tracking_url') is distinct from (new.metadata->>'tracking_url') or (old.metadata->>'internal_note') is distinct from (new.metadata->>'internal_note') then insert into public.arc_order_events(organization_id,order_id,event_type,event_data,created_by) values(new.organization_id,new.id,'fulfillment_updated',jsonb_build_object('shipping_carrier',new.metadata->>'shipping_carrier','tracking_number',new.metadata->>'tracking_number'),auth.uid());
end if;return new;end;$function$
;

CREATE OR REPLACE FUNCTION public.arc_normalize_address(p_addr jsonb)
 RETURNS jsonb
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  select case
    when jsonb_typeof(p_addr) is distinct from 'object' then null
    when public.arc_clean(coalesce(p_addr ->> 'line', p_addr ->> 'address1')) is null
      then null
    else jsonb_strip_nulls(
      jsonb_build_object(
        'line',
        nullif(
          trim(
            concat_ws(
              ', ',
              public.arc_clean(coalesce(p_addr ->> 'line', p_addr ->> 'address1')),
              public.arc_clean(p_addr ->> 'address2')
            )
          ),
          ''
        ),
        'district',
        public.arc_clean(coalesce(p_addr ->> 'district', p_addr ->> 'province')),
        'city', public.arc_clean(p_addr ->> 'city'),
        'postal',
        public.arc_clean(coalesce(p_addr ->> 'postal', p_addr ->> 'zip')),
        'name',
        public.arc_clean(coalesce(p_addr ->> 'name', p_addr ->> 'full_name')),
        'phone', public.arc_clean(p_addr ->> 'phone'),
        'company', public.arc_clean(p_addr ->> 'company_name'),
        'tax_office', public.arc_clean(p_addr ->> 'tax_office'),
        'tax_number', public.arc_clean(p_addr ->> 'tax_number')
      )
    )
  end;
$function$
;

CREATE OR REPLACE FUNCTION public.arc_reprice_supplier(p_supplier text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_rule record;
  v_count integer;
begin
  select s.* into v_rule
  from public.arc_suppliers s
  join public.organizations o on o.id = s.organization_id
  where o.slug = 'arvoculture'
    and s.code = p_supplier
  limit 1;

  if not found then
    raise exception 'Tedarikçi bulunamadı: %', p_supplier;
  end if;

  update public.arc_product_variants v
     set price = public.arc_sale_price(
           v.cost_price,
           v_rule.margin_percent,
           v_rule.shipping_markup,
           v_rule.round_to_kurus
         ),
         updated_at = now()
   where v.organization_id = v_rule.organization_id
     and v.supplier = p_supplier
     and v.cost_price is not null;

  get diagnostics v_count = row_count;
  return v_count;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.arc_resolve_commerce_tenant()
 RETURNS TABLE(organization_id uuid, membership_role text, organization_name text, organization_slug text, plan_code text, organization_status text, commerce_enabled boolean, arc_license_status text, arc_period_end timestamp with time zone, arc_stage text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select organization.id,
         membership.role::text,
         organization.name,
         organization.slug,
         organization.plan_code::text,
         organization.status::text,
         coalesce(module.is_enabled, false),
         coalesce(arc.status, 'inactive'),
         arc.current_period_end,
         public.arc_store_stage(organization.id)
  from public.organization_memberships membership
  join public.organizations organization on organization.id = membership.organization_id
  left join public.organization_modules module
    on module.organization_id = organization.id and module.module_code = 'commerce'
  left join public.organization_product_licenses arc
    on arc.organization_id = organization.id and arc.product = 'arc'
  where membership.user_id = auth.uid() and membership.is_active = true
  order by (organization.slug = 'arvoculture') desc, membership.joined_at
  limit 1
$function$
;

CREATE OR REPLACE FUNCTION public.arc_sale_price(p_cost bigint, p_margin integer, p_shipping bigint, p_round integer DEFAULT 90)
 RETURNS bigint
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  select case
    when p_cost is null or p_cost <= 0 then null
    when coalesce(p_round, 0) <= 0 then
      (p_cost * (100 + coalesce(p_margin, 0))) / 100 + coalesce(p_shipping, 0)
    else
      -- Lira tabanına yuvarla, sonra istenen kuruş sonunu ekle.
      (
        ceil(
          (
            (p_cost * (100 + coalesce(p_margin, 0))) / 100.0
            + coalesce(p_shipping, 0)
            - p_round
          ) / 100.0
        )::bigint * 100
      ) + p_round
  end;
$function$
;

CREATE OR REPLACE FUNCTION public.arc_sale_price(p_cost bigint, p_margin numeric, p_shipping bigint, p_round integer, p_service bigint DEFAULT 0)
 RETURNS bigint
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  with hesap as (
    select ((coalesce(p_cost, 0) + coalesce(p_service, 0))
            * (100 + coalesce(p_margin, 0)) / 100
            + coalesce(p_shipping, 0))::numeric as ham
  )
  select case
    when coalesce(p_round, 0) <= 0 then round(ham)::bigint
    -- ,90 gibi bir kuruş değerine yuvarla
    else (ceil((ham - p_round) / 100) * 100 + p_round)::bigint
  end
  from hesap;
$function$
;

CREATE OR REPLACE FUNCTION public.arc_settle_storefront_order(p_order_id uuid, p_paid boolean, p_payment_reference text DEFAULT NULL::text, p_failure_reason text DEFAULT NULL::text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_org_id uuid;
  v_current text;
  v_item record;
  v_prev integer;
  v_short jsonb := '[]'::jsonb;
begin
  -- Kurum siparişten türetilir; slug kontrolü YOK.
  select o.organization_id, o.payment_status
    into v_org_id, v_current
  from public.arc_orders o
  where o.id = p_order_id
  for update;

  if not found then
    raise exception 'Sipariş bulunamadı';
  end if;

  -- Tekrarlanan bildirim: sessizce çık.
  if v_current in ('paid', 'refunded', 'partially_refunded') then
    return v_current;
  end if;

  if not p_paid then
    update public.arc_orders
       set payment_status = 'failed',
           status = 'cancelled',
           metadata = metadata || jsonb_build_object(
             'payment_failure_reason', p_failure_reason
           ),
           updated_at = now()
     where id = p_order_id;
    return 'failed';
  end if;

  /*
    Stok düşümü. Yetersizse sipariş ödendi kalır — müşterinin parası
    alınmışken siparişi sessizce iptal etmek yanlış olur — ama aşım artık
    kayda geçiyor.
  */
  for v_item in
    select oi.variant_id, oi.quantity, oi.sku
    from public.arc_order_items oi
    where oi.order_id = p_order_id
      and oi.variant_id is not null
  loop
    /*
      Önceki stok kilitlenerek okunur. "returning stock + miktar" işe
      yaramaz: kırpma olduğunda yanlış sonuç verir (1 stoktan 3 düşünce
      0 + 3 = 3 çıkar ve aşım görünmez). FOR UPDATE ayrıca aynı varyanta
      eşzamanlı gelen iki sonuçlandırmayı sıraya sokar.
    */
    select stock into v_prev
    from public.arc_product_variants
    where id = v_item.variant_id
      and organization_id = v_org_id
    for update;

    continue when v_prev is null;

    update public.arc_product_variants
       set stock = greatest(v_prev - v_item.quantity, 0),
           updated_at = now()
     where id = v_item.variant_id
       and organization_id = v_org_id;

    if v_prev < v_item.quantity then
      v_short := v_short || jsonb_build_object(
        'sku', v_item.sku,
        'istenen', v_item.quantity,
        'mevcut', v_prev
      );
    end if;
  end loop;

  if jsonb_array_length(v_short) > 0 then
    insert into public.arc_order_events (organization_id, order_id, event_type, event_data)
    values (v_org_id, p_order_id, 'stock_shortfall',
            jsonb_build_object('items', v_short));
  end if;

  update public.arc_orders
     set payment_status = 'paid',
         status = 'confirmed',
         metadata = metadata || jsonb_build_object(
           'payment_reference', p_payment_reference,
           'paid_at', now()
         ),
         updated_at = now()
   where id = p_order_id;

  return 'paid';
end;
$function$
;

CREATE OR REPLACE FUNCTION public.arc_slugify(p_text text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  select trim(both '-' from
    regexp_replace(
      lower(
        translate(
          coalesce(p_text, ''),
          'ÇĞİIÖŞÜçğıiöşü',
          'cgiiosucgiiosu'
        )
      ),
      '[^a-z0-9]+', '-', 'g'
    )
  );
$function$
;

CREATE OR REPLACE FUNCTION public.arc_store_stage(p_organization_id uuid)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select coalesce(
    (
      select case
        -- Kurucu iptal ettiyse kademe işletilmez.
        when l.status = 'canceled' then 'closed'
        -- Süresi dolmamış aktif ya da deneme lisansı: her şey açık.
        when l.status in ('active','trialing')
             and (l.current_period_end is null or l.current_period_end > now())
          then 'open'
        -- Kurucu elle askıya aldıysa satış da durur; vitrin görünür kalır.
        when l.status = 'suspended' then 'sales_closed'
        -- Dönem sonu yoksa kademe sayılamaz; en hafif yaptırım uygulanır.
        when l.current_period_end is null then 'panel_closed'
        when now() < l.current_period_end + interval '1 month' then 'panel_closed'
        when now() < l.current_period_end + interval '2 months' then 'sales_closed'
        else 'closed'
      end
      from public.organization_product_licenses l
      where l.organization_id = p_organization_id and l.product = 'arc'
    ),
    -- Lisans satırı hiç yok: abonelik henüz başlamamış demektir, gecikmiş
    -- değil. Kurum meşruysa mağaza açık kalır; değilse kapalı.
    (
      select case when o.status in ('active','trial') then 'open' else 'closed' end
      from public.organizations o
      where o.id = p_organization_id
    ),
    'closed'
  )
$function$
;

CREATE OR REPLACE FUNCTION public.arc_total_stock_units()
 RETURNS bigint
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select coalesce(sum(v.stock), 0)::bigint
  from public.arc_product_variants v
  where v.organization_id = (
    select t.organization_id from public.arc_resolve_commerce_tenant() t limit 1
  );
$function$
;

CREATE OR REPLACE FUNCTION public.arc_update_order_status(p_order_id uuid, p_status text, p_payment_status text)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare v_user_id uuid:=auth.uid();v_order record;v_item record;v_variant record;v_old_terminal boolean;v_new_terminal boolean;
begin
if v_user_id is null then raise exception 'Authentication required';end if;
if p_status not in ('pending','confirmed','processing','fulfilled','cancelled','refunded') then raise exception 'Invalid order status';end if;
if p_payment_status not in ('pending','authorized','paid','partially_refunded','refunded','failed') then raise exception 'Invalid payment status';end if;
select id,organization_id,order_number,source,status into v_order from public.arc_orders where id=p_order_id for update;
if not found then raise exception 'Order not found';end if;
if not exists(select 1 from public.organization_memberships membership where membership.organization_id=v_order.organization_id and membership.user_id=v_user_id and membership.is_active=true and membership.role::text in ('owner','admin','manager')) then raise exception 'Insufficient permissions';end if;
v_old_terminal:=v_order.status in ('cancelled','refunded');v_new_terminal:=p_status in ('cancelled','refunded');
if v_order.source='native' and v_old_terminal<>v_new_terminal then
for v_item in select variant_id,quantity from public.arc_order_items where organization_id=v_order.organization_id and order_id=v_order.id and variant_id is not null loop
select id,stock,allow_backorder into v_variant from public.arc_product_variants where id=v_item.variant_id and organization_id=v_order.organization_id for update;
if not found then raise exception 'Order variant not found';end if;
if v_new_terminal then
update public.arc_product_variants set stock=stock+v_item.quantity,updated_at=now() where id=v_variant.id;
insert into public.arc_inventory_movements(organization_id,variant_id,kind,quantity,reference_type,reference_id,note,created_by) values(v_order.organization_id,v_variant.id,'return',v_item.quantity,'order_status',v_order.id::text,'Sipariş iptal/iade: '||v_order.order_number,v_user_id);
else
if v_variant.stock<v_item.quantity and not v_variant.allow_backorder then raise exception 'Insufficient stock to reopen order %',v_order.order_number;end if;
update public.arc_product_variants set stock=stock-v_item.quantity,updated_at=now() where id=v_variant.id;
insert into public.arc_inventory_movements(organization_id,variant_id,kind,quantity,reference_type,reference_id,note,created_by) values(v_order.organization_id,v_variant.id,'sale',-v_item.quantity,'order_status',v_order.id::text,'Sipariş yeniden açıldı: '||v_order.order_number,v_user_id);
end if;end loop;end if;
update public.arc_orders set status=p_status,payment_status=p_payment_status,updated_at=now() where id=v_order.id and organization_id=v_order.organization_id;
end;$function$
;

CREATE OR REPLACE FUNCTION public.arc_variant_available(p_stock integer, p_allow_backorder boolean, p_supplier text)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  select case
    -- Tedarikçi ürünü: tampon kuralı
    when p_supplier is not null then
      coalesce(p_stock, 0) > coalesce(
        (select stock_buffer from public.arc_suppliers
         where code = p_supplier limit 1),
        5
      )
    -- Kendi ürünümüz
    else coalesce(p_stock, 0) > 0 or coalesce(p_allow_backorder, false)
  end;
$function$
;

CREATE OR REPLACE FUNCTION public.archive_inactive_crm_proposal()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  if new.status in ('accepted', 'rejected', 'expired') then
    new.archive_reason := new.status;
    new.status := 'archived';
    new.archived_at := coalesce(new.archived_at, now());
  elsif new.status = 'sent'
    and new.valid_until is not null
    and new.valid_until < (now() at time zone 'Europe/Istanbul')::date then
    new.status := 'archived';
    new.archive_reason := 'expired';
    new.archived_at := coalesce(new.archived_at, now());
  elsif new.status = 'archived' then
    new.archive_reason := coalesce(new.archive_reason, 'manual');
    new.archived_at := coalesce(new.archived_at, now());
  else
    new.archive_reason := null;
    new.archived_at := null;
  end if;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.arvo_can_access_message_channel(p_channel_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists (
    select 1
    from public.message_channels c
    join public.organization_memberships m
      on m.organization_id = c.organization_id
     and m.user_id = (select auth.uid())
     and m.is_active
    where c.id = p_channel_id
      and (
        not c.is_private
        or exists (
          select 1 from public.message_channel_members cm
          where cm.channel_id = c.id and cm.user_id = (select auth.uid())
        )
      )
  );
$function$
;

CREATE OR REPLACE FUNCTION public.arvo_can_access_opportunity(target_opportunity uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select private.arvo_can_access_opportunity(target_opportunity);
$function$
;

CREATE OR REPLACE FUNCTION public.arvo_cancel_contract_addendum(p_addendum_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := auth.uid();
  a public.crm_contract_addenda%rowtype;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  select * into a from public.crm_contract_addenda where id = p_addendum_id for update;
  if a.id is null or not private.arvo_can_access_opportunity(a.opportunity_id) then
    raise exception 'addendum_not_found' using errcode = 'P0002';
  end if;
  if a.status <> 'sent' then
    return a.status;
  end if;
  update public.crm_contract_addenda
     set status = 'cancelled', cancelled_at = now(), cancelled_by = v_uid
   where id = a.id;
  return 'cancelled';
end
$function$
;

CREATE OR REPLACE FUNCTION public.arvo_confirm_proposal_decision(public_token text, p_decision text, p_ip text DEFAULT NULL::text, p_user_agent text DEFAULT NULL::text)
 RETURNS TABLE(result_status text, contract_token text, contract_status text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare
  v_id uuid;
begin
  select p.id into v_id
  from public.crm_proposals p
  where p.access_token_hash = encode(extensions.digest(public_token, 'sha256'), 'hex');
  if v_id is null then
    raise exception 'invalid_token' using errcode = 'P0002';
  end if;
  return query select * from private.arvo_confirm_proposal(v_id, p_decision, p_ip, p_user_agent);
end
$function$
;

CREATE OR REPLACE FUNCTION public.arvo_create_contract_addendum(p_contract_id uuid, p_work_plan jsonb, p_payment_dates jsonb, p_note text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := auth.uid();
  c public.crm_contracts%rowtype;
  v_plan jsonb;
  v_dates jsonb := '[]'::jsonb;
  v_item jsonb;
  v_seq integer;
  v_date date;
  v_status text;
  v_no integer;
  v_id uuid;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  select * into c from public.crm_contracts where id = p_contract_id for update;
  if c.id is null or not private.arvo_can_access_opportunity(c.opportunity_id) then
    raise exception 'contract_not_found' using errcode = 'P0002';
  end if;
  if c.status not in ('signed', 'completed') then
    raise exception 'contract_not_signed' using errcode = 'check_violation';
  end if;
  if exists (select 1 from public.crm_contract_addenda a where a.contract_id = c.id and a.status = 'sent') then
    raise exception 'addendum_pending' using errcode = 'check_violation';
  end if;

  v_plan := private.arvo_normalize_work_plan(p_work_plan);

  if p_payment_dates is not null and jsonb_typeof(p_payment_dates) not in ('array', 'null') then
    raise exception 'invalid_payment_date' using errcode = 'check_violation';
  end if;
  if p_payment_dates is not null and jsonb_typeof(p_payment_dates) = 'array' then
    if jsonb_array_length(p_payment_dates) > 24 then
      raise exception 'invalid_payment_date' using errcode = 'check_violation';
    end if;
    for v_item in select value from jsonb_array_elements(p_payment_dates) loop
      if jsonb_typeof(v_item) <> 'object' or coalesce(v_item->>'sequence', '') !~ '^\d{1,3}$' then
        raise exception 'invalid_payment_date' using errcode = 'check_violation';
      end if;
      v_seq := (v_item->>'sequence')::integer;
      v_date := private.arvo_try_date(v_item->>'due_date');
      if v_date is null then
        raise exception 'invalid_payment_date' using errcode = 'check_violation';
      end if;
      if c.payment_plan_id is null then
        raise exception 'unknown_installment' using errcode = 'check_violation';
      end if;
      select i.status into v_status
      from public.payment_installments i
      where i.payment_plan_id = c.payment_plan_id and i.installment_no = v_seq
      limit 1;
      if not found then
        raise exception 'unknown_installment' using errcode = 'check_violation';
      end if;
      if coalesce(v_status, '') in ('paid', 'cancelled') then
        raise exception 'installment_closed' using errcode = 'check_violation';
      end if;
      if exists (select 1 from jsonb_array_elements(v_dates) d where (d->>'sequence')::integer = v_seq) then
        raise exception 'duplicate_installment' using errcode = 'check_violation';
      end if;
      v_dates := v_dates || jsonb_build_array(jsonb_build_object('sequence', v_seq, 'due_date', to_char(v_date, 'YYYY-MM-DD')));
    end loop;
  end if;

  if jsonb_array_length(v_plan) = 0 and jsonb_array_length(v_dates) = 0 then
    raise exception 'addendum_empty' using errcode = 'check_violation';
  end if;

  select coalesce(max(a.addendum_no), 0) + 1 into v_no
  from public.crm_contract_addenda a
  where a.contract_id = c.id;

  insert into public.crm_contract_addenda(
    organization_id, contract_id, opportunity_id, addendum_no,
    work_plan, payment_dates, note, status, created_by
  ) values (
    c.organization_id, c.id, c.opportunity_id, v_no,
    v_plan,
    (select coalesce(jsonb_agg(d order by (d->>'sequence')::integer), '[]'::jsonb) from jsonb_array_elements(v_dates) d),
    nullif(left(btrim(coalesce(p_note, '')), 2000), ''),
    'sent',
    v_uid
  ) returning id into v_id;

  return v_id;
end
$function$
;

CREATE OR REPLACE FUNCTION public.arvo_custom_domain_available(p_domain text, p_organization_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select not exists (
    select 1
    from public.organizations o
    where lower(o.custom_domain) = lower(trim(p_domain))
      and o.id is distinct from p_organization_id
  );
$function$
;

CREATE OR REPLACE FUNCTION public.arvo_is_member(target_org uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists(select 1 from public.organization_memberships m where m.organization_id=target_org and m.user_id=auth.uid() and m.is_active=true)
$function$
;

CREATE OR REPLACE FUNCTION public.arvo_is_message_channel_member(p_channel_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists (
    select 1 from public.message_channel_members cm
    where cm.channel_id = p_channel_id and cm.user_id = (select auth.uid())
  );
$function$
;

CREATE OR REPLACE FUNCTION public.arvo_message_unread_counts(p_organization_id uuid)
 RETURNS TABLE(channel_id uuid, unread integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  -- Katılma tarihi: organization_memberships'te zaman kolonu yok; hesabın
  -- oluşturulma zamanı (davetle katılan çalışan için katılma anı) kullanılır.
  with me as (
    select m.user_id, u.created_at as joined_at
    from public.organization_memberships m
    join auth.users u on u.id = m.user_id
    where m.organization_id = p_organization_id
      and m.user_id = (select auth.uid())
      and m.is_active
    limit 1
  )
  select c.id, count(msg.id)::integer
  from public.message_channels c
  cross join me
  left join public.message_channel_members cm on cm.channel_id = c.id and cm.user_id = me.user_id
  left join public.message_read_states rs on rs.channel_id = c.id and rs.user_id = me.user_id
  join public.internal_messages msg
    on msg.channel_id = c.id
   and msg.sender_id <> me.user_id
   and msg.deleted_at is null
   and msg.created_at > coalesce(rs.last_read_at, cm.created_at, me.joined_at)
  where c.organization_id = p_organization_id
    and (not c.is_private or cm.user_id is not null)
  group by c.id;
$function$
;

CREATE OR REPLACE FUNCTION public.arvo_public_contract_audit(public_token text)
 RETURNS TABLE(signed_user_agent text, legal_text_version text, signed_consents jsonb, proposal_no text, tax_status text, tax_rate numeric, net_amount bigint, tax_amount bigint, gross_amount bigint, estimated_delivery_date date, installments jsonb)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
  select
    c.signed_user_agent::text,
    c.legal_text_version::text,
    c.signed_consents,
    p.proposal_no::text,
    p.tax_status::text,
    p.tax_rate::numeric,
    p.net_amount::bigint,
    p.tax_amount::bigint,
    p.gross_amount::bigint,
    p.estimated_delivery_date::date,
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'installment_no', i.installment_no,
        'due_date', i.due_date,
        'amount', i.amount,
        'status', i.status,
        'payment_url', i.payment_url
      ) order by i.installment_no)
      from public.payment_installments i
      where c.payment_plan_id is not null
        and i.payment_plan_id = c.payment_plan_id
    ), '[]'::jsonb)
  from public.crm_contracts c
  left join public.crm_proposals p on p.id = c.proposal_id
  where c.access_token_hash = encode(extensions.digest(public_token, 'sha256'), 'hex')
  limit 1;
$function$
;

CREATE OR REPLACE FUNCTION public.arvo_public_contract_links(public_token text)
 RETURNS TABLE(proposal_share_token text, proposal_no text, proposal_status text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
  select p.share_token, p.proposal_no, p.status
  from public.crm_contracts c
  join public.crm_proposals p on p.id = c.proposal_id
  where c.access_token_hash = encode(extensions.digest(public_token, 'sha256'), 'hex')
  limit 1;
$function$
;

CREATE OR REPLACE FUNCTION public.arvo_public_contract_plan(public_token text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
  select jsonb_build_object(
    'work_plan', coalesce(c.work_plan, '[]'::jsonb),
    'tracking_code', case when private.arvo_contract_tracking_open(c.status, c.tracking_open_before_signature) then c.tracking_code end,
    'addenda', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', a.id,
        'addendum_no', a.addendum_no,
        'work_plan', a.work_plan,
        'payment_dates', a.payment_dates,
        'note', a.note,
        'status', a.status,
        'created_at', a.created_at,
        'responded_at', a.responded_at,
        'responder_name', a.responder_name,
        'responder_ip', a.responder_ip,
        'responder_user_agent', a.responder_user_agent,
        'response_note', a.response_note
      ) order by a.addendum_no)
      from public.crm_contract_addenda a
      where a.contract_id = c.id
        and a.status in ('sent', 'accepted', 'rejected')
    ), '[]'::jsonb)
  )
  from public.crm_contracts c
  where c.access_token_hash = encode(extensions.digest(public_token, 'sha256'), 'hex')
  limit 1;
$function$
;

CREATE OR REPLACE FUNCTION public.arvo_public_organization_legal(public_token text, document_type text)
 RETURNS TABLE(legal_name text, legal_address text, legal_city text, legal_district text, tax_office text, tax_number text, mersis_no text, bank_name text, bank_account_holder text, iban text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
  with target as (
    select p.organization_id
    from public.crm_proposals p
    where document_type = 'proposal'
      and p.access_token_hash = encode(extensions.digest(public_token, 'sha256'), 'hex')
    union all
    select c.organization_id
    from public.crm_contracts c
    where document_type = 'contract'
      and c.access_token_hash = encode(extensions.digest(public_token, 'sha256'), 'hex')
  )
  select
    org.legal_name::text,
    org.legal_address::text,
    org.legal_city::text,
    org.legal_district::text,
    org.tax_office::text,
    org.tax_number::text,
    org.mersis_no::text,
    org.bank_name::text,
    org.bank_account_holder::text,
    org.iban::text
  from target t
  join public.organizations org on org.id = t.organization_id
  where coalesce(public_token, '') <> ''
  limit 1;
$function$
;

CREATE OR REPLACE FUNCTION public.arvo_public_proposal_decision(public_token text)
 RETURNS TABLE(status text, responded_at timestamp with time zone, response_ip text, valid_until date, contract_share_token text, contract_no text, contract_status text, response_user_agent text, proposal_created_at timestamp with time zone, estimated_delivery_date date, tax_rate numeric, payment_plan_type text, payment_schedule jsonb, customer_decided boolean, contract_signed boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
  select
    private.arvo_proposal_status_with_contract(p.status::text, p.archive_reason::text, c.status::text),
    p.responded_at,
    p.response_ip::text,
    p.valid_until::date,
    c.share_token::text,
    c.contract_no::text,
    c.status::text,
    p.response_user_agent::text,
    p.created_at,
    p.estimated_delivery_date::date,
    p.tax_rate::numeric,
    p.payment_plan_type::text,
    p.payment_schedule::jsonb,
    private.arvo_proposal_customer_decided(p.responded_at, p.response_ip::text, p.customer_responded_at),
    coalesce(c.status in ('signed', 'completed'), false)
  from public.crm_proposals p
  left join lateral (
    select con.* from public.crm_contracts con
    where con.proposal_id = p.id
    order by con.created_at desc
    limit 1
  ) c on true
  where p.access_token_hash = encode(extensions.digest(public_token, 'sha256'), 'hex')
  limit 1;
$function$
;

CREATE OR REPLACE FUNCTION public.arvo_record_contract_consents(public_token text, p_legal_version text, p_consents jsonb)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare
  affected integer;
begin
  if p_consents is null or jsonb_typeof(p_consents) <> 'object' or pg_column_size(p_consents) > 4096 then
    raise exception 'invalid_consents';
  end if;
  update public.crm_contracts
     set legal_text_version = nullif(left(trim(coalesce(p_legal_version, '')), 20), ''),
         signed_consents = p_consents || jsonb_build_object('recorded_at', now())
   where access_token_hash = encode(extensions.digest(public_token, 'sha256'), 'hex')
     and signed_at is not null
     and signed_at > now() - interval '10 minutes'
     and legal_text_version is null;
  get diagnostics affected = row_count;
  return affected > 0;
end
$function$
;

CREATE OR REPLACE FUNCTION public.arvo_record_paytr_payment(p_payment_link_id uuid, p_merchant_oid text, p_total_amount bigint, p_payment_amount bigint, p_currency text, p_test_mode boolean, p_payload jsonb)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_link public.payment_links%rowtype;
  v_product text;
  v_party uuid;
  v_installment_no integer;
  v_contract_no text;
  v_event uuid;
  v_entry uuid;
  v_request uuid;
begin
  if p_payment_link_id is null or coalesce(p_merchant_oid, '') = '' then
    return 'invalid';
  end if;

  select * into v_link from public.payment_links where id = p_payment_link_id for update;
  if not found then
    return 'not_found';
  end if;

  insert into public.payment_provider_events(provider, merchant_oid, organization_id, payment_link_id, total_amount, payment_amount, currency, test_mode, result, payload)
  values ('paytr', p_merchant_oid, v_link.organization_id, v_link.id, p_total_amount, p_payment_amount, p_currency, coalesce(p_test_mode, false),
          case when coalesce(p_test_mode, false) then 'test' else 'recorded' end, coalesce(p_payload, '{}'::jsonb))
  on conflict (provider, merchant_oid) do nothing
  returning id into v_event;
  if v_event is null then
    return 'duplicate';
  end if;

  -- Test ödemesi: bağlantının çalıştığını gösterir; cariye/lisansa dokunmaz.
  if coalesce(p_test_mode, false) then
    update public.organization_payment_providers
    set last_test_payment_at = now()
    where organization_id = v_link.organization_id and provider = 'paytr';
    return 'test';
  end if;

  if coalesce(p_payment_amount, 0) <= 0 then
    update public.payment_provider_events set result = 'invalid_amount' where id = v_event;
    return 'invalid_amount';
  end if;

  if v_link.purpose = 'subscription' then
    -- Eksik ödeme lisans açmaz (bağlantı tutarı sunucuda belirlenir).
    if p_payment_amount < v_link.amount then
      update public.payment_provider_events set result = 'amount_mismatch' where id = v_event;
      return 'amount_mismatch';
    end if;

    v_product := coalesce(v_link.product, 'arvoos');

    if v_link.subscriber_id is not null then
      -- Bireysel abone: kurum kaydı yok, ödeme kendi geçmişine yazılır.
      perform private.arvo_activate_subscriber_period(
        v_link.subscriber_id, p_payment_amount, 'TRY', 'paytr', p_merchant_oid
      );
    else
      insert into public.organization_payment_requests (
        organization_id, bank_account_id, plan_code, product, amount, currency, payment_method, status,
        receipt_path, reference_no, review_note, submitted_by, reviewed_at, updated_at
      ) values (
        v_link.payer_organization_id, null, v_link.plan_code, v_product, p_payment_amount, 'TRY', 'paytr', 'approved',
        null, left('PAYTR-' || p_merchant_oid, 120), 'PayTR ile ödendi, otomatik onaylandı', v_link.created_by, now(), now()
      )
      returning id into v_request;

      if v_product = 'arvoos' then
        perform private.arvo_activate_license_period(
          v_link.payer_organization_id, v_link.plan_code, p_payment_amount, 'TRY', 'paytr', v_link.created_by
        );
      else
        perform private.arvo_activate_product_period(
          v_link.payer_organization_id, v_product, v_link.plan_code, p_payment_amount, 'TRY', 'paytr', v_link.created_by
        );
      end if;
    end if;
  else
    select p.party_id, i.installment_no, c.contract_no
    into v_party, v_installment_no, v_contract_no
    from public.payment_installments i
    join public.payment_plans p on p.id = i.payment_plan_id
    left join public.crm_contracts c on c.id = p.contract_id
    where i.id = v_link.installment_id;

    if v_party is null then
      update public.payment_provider_events set result = 'no_party' where id = v_event;
      return 'no_party';
    end if;

    insert into public.account_entries(organization_id, party_id, entry_type, source_type, amount, currency, description, reference_no, transaction_date, created_by)
    values (
      v_link.organization_id, v_party, 'credit', 'payment', p_payment_amount, 'TRY',
      left(format('PayTR tahsilatı · %s %s. taksit', coalesce(v_contract_no, 'Sözleşme'), v_installment_no), 500),
      left('PAYTR-' || p_merchant_oid, 100),
      (now() at time zone 'Europe/Istanbul')::date,
      v_link.created_by
    )
    returning id into v_entry;
    -- arvo_account_entry_reconcile tetikleyicisi bekleyen taksitleri kapatır.
    update public.payment_provider_events set account_entry_id = v_entry where id = v_event;
  end if;

  update public.payment_links set status = 'paid', paid_at = now() where id = v_link.id;
  update public.organization_payment_providers
  set last_payment_at = now()
  where organization_id = v_link.organization_id and provider = 'paytr';
  return 'recorded';
end
$function$
;

CREATE OR REPLACE FUNCTION public.arvo_record_proposal_response_agent(public_token text, p_user_agent text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare
  affected integer;
begin
  update public.crm_proposals
     set response_user_agent = coalesce(response_user_agent, nullif(left(trim(coalesce(p_user_agent, '')), 1000), '')),
         customer_responded_at = coalesce(customer_responded_at, responded_at)
   where access_token_hash = encode(extensions.digest(public_token, 'sha256'), 'hex')
     and private.arvo_proposal_effective_status(status, archive_reason) in ('accepted', 'rejected')
     and responded_at is not null
     and responded_at > now() - interval '10 minutes'
     and customer_responded_at is null;
  get diagnostics affected = row_count;
  return affected > 0;
end
$function$
;

CREATE OR REPLACE FUNCTION public.arvo_respond_contract_addendum(public_token text, p_addendum_id uuid, p_decision text, p_name text, p_note text DEFAULT NULL::text, p_ip text DEFAULT NULL::text, p_user_agent text DEFAULT NULL::text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare
  c public.crm_contracts%rowtype;
  a public.crm_contract_addenda%rowtype;
  v_name text := left(btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g')), 180);
  v_note text := nullif(left(btrim(coalesce(p_note, '')), 2000), '');
  v_status text;
begin
  if coalesce(p_decision, '') not in ('accept', 'reject') then
    raise exception 'invalid_decision' using errcode = 'check_violation';
  end if;

  select * into c
  from public.crm_contracts
  where access_token_hash = encode(extensions.digest(public_token, 'sha256'), 'hex');
  if c.id is null then
    raise exception 'invalid_token' using errcode = 'P0002';
  end if;

  select * into a
  from public.crm_contract_addenda
  where id = p_addendum_id and contract_id = c.id
  for update;
  if a.id is null then
    raise exception 'addendum_not_found' using errcode = 'P0002';
  end if;
  if a.status <> 'sent' then
    return 'closed';
  end if;
  if char_length(v_name) < 2 then
    return 'missing_name';
  end if;
  if p_decision = 'reject' and char_length(coalesce(v_note, '')) < 3 then
    return 'missing_note';
  end if;

  v_status := case p_decision when 'accept' then 'accepted' else 'rejected' end;

  update public.crm_contract_addenda
     set status = v_status,
         responded_at = now(),
         responder_name = v_name,
         responder_ip = nullif(left(btrim(coalesce(p_ip, '')), 120), ''),
         responder_user_agent = nullif(left(btrim(coalesce(p_user_agent, '')), 1000), ''),
         response_note = v_note
   where id = a.id;

  -- Onaylanan vadeler finans kaydına işlenir (ödenmiş taksite dokunulmaz).
  if v_status = 'accepted' and c.payment_plan_id is not null then
    update public.payment_installments i
       set due_date = d.due_on
      from (
        select (x->>'sequence')::integer as seq, private.arvo_try_date(x->>'due_date') as due_on
        from jsonb_array_elements(a.payment_dates) x
      ) d
     where i.payment_plan_id = c.payment_plan_id
       and i.installment_no = d.seq
       and d.due_on is not null
       and coalesce(i.status, '') not in ('paid', 'cancelled');
  end if;

  -- Satış ekibine bildirim: aktif owner/admin/manager ve ek protokolü hazırlayan kişi.
  insert into public.notifications (organization_id, user_id, audience, category, title, message, action_url, metadata)
  select distinct on (m.user_id)
    c.organization_id,
    m.user_id,
    'organization',
    case v_status when 'accepted' then 'contract_addendum_accepted' else 'contract_addendum_rejected' end,
    case v_status when 'accepted' then 'Ek protokol onaylandı' else 'Ek protokolde değişiklik istendi' end,
    coalesce(c.contract_no, 'Sözleşme') || ' Ek Protokol ' || a.addendum_no
      || case v_status when 'accepted' then ' müşteri tarafından onaylandı.' else ' için müşteri değişiklik istedi.' end,
    '/panel/crm/contracts/' || c.id::text,
    jsonb_build_object(
      'contract_id', c.id,
      'addendum_id', a.id,
      'addendum_no', a.addendum_no,
      'contract_no', c.contract_no,
      'responder_name', v_name,
      'note', v_note
    )
  from public.organization_memberships m
  where m.organization_id = c.organization_id
    and m.is_active
    and (m.role::text in ('owner', 'admin', 'manager') or m.user_id = a.created_by);

  return v_status;
end
$function$
;

CREATE OR REPLACE FUNCTION public.arvo_storage_usage()
 RETURNS TABLE(organization_id uuid, bytes bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select
    (storage.foldername(o.name))[1]::uuid as organization_id,
    sum(coalesce((o.metadata ->> 'size')::bigint, 0))::bigint as bytes
  from storage.objects o
  where coalesce(array_length(storage.foldername(o.name), 1), 0) > 0
    -- uuid'ye çevrilemeyen ilk klasör: kurum klasörü değil, atlanıyor.
    and (storage.foldername(o.name))[1] ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
  group by 1
$function$
;

CREATE OR REPLACE FUNCTION public.arvo_tracking_attempts_prune()
 RETURNS integer
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
  with removed as (
    delete from public.tracking_lookup_attempts
    where created_at < now() - interval '7 days'
    returning 1
  )
  select count(*)::integer from removed;
$function$
;

CREATE OR REPLACE FUNCTION public.arvo_tracking_confirm_proposal(p_tracking_code text, p_decision text, p_ip text DEFAULT NULL::text, p_user_agent text DEFAULT NULL::text)
 RETURNS TABLE(result_status text, contract_token text, contract_status text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare
  v_id uuid;
begin
  select c.proposal_id into v_id
  from public.crm_contracts c
  where c.tracking_code = upper(regexp_replace(trim(coalesce(p_tracking_code, '')), '[^A-Za-z0-9]', '', 'g'))
    and char_length(coalesce(c.tracking_code, '')) >= 6
    and private.arvo_contract_tracking_open(c.status, c.tracking_open_before_signature)
  limit 1;
  if v_id is null then
    raise exception 'proposal_not_found' using errcode = 'P0002';
  end if;
  return query select * from private.arvo_confirm_proposal(v_id, p_decision, p_ip, p_user_agent);
end
$function$
;

CREATE OR REPLACE FUNCTION public.arvo_tracking_document_links(p_tracking_code text)
 RETURNS TABLE(proposal_share_token text, proposal_no text, proposal_status text, contract_share_token text, contract_no text, contract_status text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare
  v_code text := upper(trim(coalesce(p_tracking_code, '')));
  c public.crm_contracts%rowtype;
  p public.crm_proposals%rowtype;
  v_token text;
begin
  if char_length(v_code) < 6 then
    return;
  end if;

  select * into c
  from public.crm_contracts
  where upper(tracking_code) = v_code
    and private.arvo_contract_tracking_open(status, tracking_open_before_signature)
  limit 1
  for update;

  if c.id is null then
    return;
  end if;

  if c.share_token is null and coalesce(c.status, 'draft') <> 'draft' then
    v_token := encode(extensions.gen_random_bytes(24), 'hex');
    update public.crm_contracts
       set share_token = v_token,
           access_token_hash = encode(extensions.digest(v_token, 'sha256'), 'hex'),
           updated_at = now()
     where id = c.id
       and share_token is null;
    c.share_token := v_token;
  end if;

  if c.proposal_id is not null then
    select * into p
    from public.crm_proposals
    where id = c.proposal_id
    for update;

    if p.id is not null and p.share_token is null and coalesce(p.status, 'draft') <> 'draft' then
      v_token := encode(extensions.gen_random_bytes(24), 'hex');
      update public.crm_proposals
         set share_token = v_token,
             access_token_hash = encode(extensions.digest(v_token, 'sha256'), 'hex'),
             updated_at = now()
       where id = p.id
         and share_token is null;
      p.share_token := v_token;
    end if;
  end if;

  return query
  select p.share_token, p.proposal_no, p.status,
         c.share_token, c.contract_no, c.status;
end
$function$
;

CREATE OR REPLACE FUNCTION public.arvo_tracking_documents(p_tracking_code text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare
  c public.crm_contracts%rowtype;
  p public.crm_proposals%rowtype;
  v_status text;
  v_decided boolean;
  v_signed boolean;
begin
  select * into c
  from public.crm_contracts
  where tracking_code = upper(regexp_replace(trim(coalesce(p_tracking_code, '')), '[^A-Za-z0-9]', '', 'g'))
    and char_length(coalesce(tracking_code, '')) >= 6
    and private.arvo_contract_tracking_open(status, tracking_open_before_signature)
  limit 1;
  if c.id is null then
    return null;
  end if;

  v_signed := c.status in ('signed', 'completed');
  if c.proposal_id is not null then
    select * into p from public.crm_proposals where id = c.proposal_id;
  end if;
  if p.id is not null then
    v_status := private.arvo_proposal_status_with_contract(p.status, p.archive_reason, c.status);
    v_decided := private.arvo_proposal_customer_decided(p.responded_at, p.response_ip, p.customer_responded_at);
  end if;

  return jsonb_build_object(
    'proposal', case when p.id is null then null else jsonb_build_object(
      'no', p.proposal_no,
      'status', v_status,
      'customer_decided', v_decided,
      'can_accept', v_status = 'accepted' and not v_decided,
      'can_reject', v_status = 'accepted' and not v_decided and not v_signed
    ) end,
    'contract', jsonb_build_object('no', c.contract_no, 'status', c.status, 'signed', v_signed)
  );
end
$function$
;

CREATE OR REPLACE FUNCTION public.arvo_tracking_guard(p_client_ip text, p_code text)
 RETURNS TABLE(allowed boolean, code_exists boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_ip text := nullif(left(trim(coalesce(p_client_ip, '')), 64), '');
  v_code text := upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
  -- sha256 Postgres çekirdeğinde (pg_catalog); pgcrypto'ya bağımlılık yok.
  v_digest text := encode(sha256(convert_to(v_code, 'UTF8')), 'hex');
  v_ip_attempts integer;
  v_global_attempts integer;
  v_exists boolean;
begin
  -- Yalnızca SONUÇSUZ denemeler sayılır. Kaba kuvvetin ürettiği tek şey
  -- sonuçsuz denemedir; geçerli koduyla gelen müşteri bu sayaca girmez.
  -- Bu ayrım şart: takip sayfası mesajları 20 saniyede bir yeniliyor, yani
  -- açık sekmesi olan bir müşteri 10 dakikada 30 istek üretiyor. Her deneme
  -- sayılsaydı müşteri kendi kendini kilitlerdi.
  --
  -- IP bilinmiyorsa hepsi tek kovada toplanır; uydurulamadığı için bu kova
  -- yalnızca gerçekten IP okunamayan istekleri barındırır.
  select count(*) into v_ip_attempts
  from public.tracking_lookup_attempts a
  where a.client_ip is not distinct from v_ip
    and a.outcome = 'not_found'
    and a.created_at > now() - interval '10 minutes';

  select count(*) into v_global_attempts
  from public.tracking_lookup_attempts a
  where a.outcome = 'not_found'
    and a.created_at > now() - interval '10 minutes';

  -- IP başına 30 sonuçsuz / 10 dk; platform genelinde 2000 / 10 dk (IP
  -- havuzuyla dağıtılmış taramaya karşı üst sınır). Gerçek müşteri kodunu
  -- bir-iki denemede girer; 30 yanlış deneme normal kullanımın çok üstünde.
  if v_ip_attempts >= 30 or v_global_attempts >= 2000 then
    return query select false, false;
    return;
  end if;

  -- Kodun varlığı burada belirlenir. Sözleşmenin açık olup olmadığına
  -- bakılmaz: var olan bir kod tahmin değildir, asıl fonksiyonlar kendi
  -- görünürlük kurallarını zaten uyguluyor.
  select exists (
    select 1 from public.crm_contracts c
    where c.tracking_code = v_code
  ) into v_exists;

  insert into public.tracking_lookup_attempts (client_ip, code_digest, outcome)
  values (v_ip, v_digest, case when v_exists then 'found' else 'not_found' end);

  return query select true, v_exists;
end
$function$
;

CREATE OR REPLACE FUNCTION public.arvo_tracking_work_plan(p_tracking_code text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare
  v_code text := upper(btrim(coalesce(p_tracking_code, '')));
  c public.crm_contracts%rowtype;
  v_plan jsonb;
  v_source text := 'contract';
  v_schedule jsonb;
  v_payments jsonb;
begin
  if char_length(v_code) < 6 then
    return null;
  end if;

  select * into c
  from public.crm_contracts
  where upper(tracking_code) = v_code
    and private.arvo_contract_tracking_open(status, tracking_open_before_signature)
  limit 1;
  if c.id is null then
    return null;
  end if;

  select a.work_plan into v_plan
  from public.crm_contract_addenda a
  where a.contract_id = c.id
    and a.status = 'accepted'
    and jsonb_array_length(a.work_plan) > 0
  order by a.addendum_no desc
  limit 1;
  if v_plan is not null then
    v_source := 'addendum';
  else
    v_plan := coalesce(c.work_plan, '[]'::jsonb);
  end if;

  v_schedule := coalesce(
    c.payment_schedule,
    (select p.payment_schedule from public.crm_proposals p where p.id = c.proposal_id),
    '[]'::jsonb
  );
  if jsonb_typeof(v_schedule) <> 'array' then
    v_schedule := '[]'::jsonb;
  end if;

  if c.payment_plan_id is not null then
    select coalesce(jsonb_agg(jsonb_build_object(
      'sequence', i.installment_no,
      'label', coalesce(s.item->>'label', i.installment_no::text || '. Ödeme'),
      'amount', i.amount,
      'due_date', to_char(i.due_date, 'YYYY-MM-DD'),
      'trigger', nullif(s.item->>'trigger', ''),
      'status', i.status
    ) order by i.installment_no), '[]'::jsonb)
    into v_payments
    from public.payment_installments i
    left join lateral (
      select x as item
      from jsonb_array_elements(v_schedule) x
      where jsonb_typeof(x) = 'object'
        and coalesce(x->>'sequence', '') ~ '^\d{1,3}$'
        and (x->>'sequence')::integer = i.installment_no
      limit 1
    ) s on true
    where i.payment_plan_id = c.payment_plan_id;
  else
    select coalesce(jsonb_agg(jsonb_build_object(
      'sequence', case when coalesce(x->>'sequence', '') ~ '^\d{1,3}$' then (x->>'sequence')::integer else t.idx::integer end,
      'label', coalesce(x->>'label', t.idx::text || '. Ödeme'),
      'amount', x->'amount',
      'due_date', to_char(private.arvo_try_date(x->>'due_date'), 'YYYY-MM-DD'),
      'trigger', nullif(x->>'trigger', ''),
      'status', null
    ) order by t.idx), '[]'::jsonb)
    into v_payments
    from jsonb_array_elements(v_schedule) with ordinality as t(x, idx)
    where jsonb_typeof(t.x) = 'object';
  end if;

  return jsonb_build_object(
    'work_plan', v_plan,
    'source', v_source,
    'payments', v_payments,
    'pending_addendum', exists (
      select 1 from public.crm_contract_addenda a where a.contract_id = c.id and a.status = 'sent'
    )
  );
end
$function$
;

CREATE OR REPLACE FUNCTION public.arvo_unread_notification_count(p_organization_id uuid)
 RETURNS integer
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  select count(*)::integer
  from public.notifications n
  where n.audience = 'organization'
    and n.organization_id = p_organization_id
    and (
      (n.user_id = (select auth.uid()) and n.read_at is null)
      or (n.user_id is null and not exists (
        select 1 from public.notification_user_reads r
        where r.notification_id = n.id and r.user_id = (select auth.uid())
      ))
    )
    and not exists (
      select 1 from public.notification_user_dismissals d
      where d.notification_id = n.id and d.user_id = (select auth.uid())
    );
$function$
;

CREATE OR REPLACE FUNCTION public.attach_arvoculture_order_owner()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if new.user_id is null and auth.uid() is not null then
    new.user_id := auth.uid();
  end if;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.authorize_customer_portal_file_download(p_tracking_code text, p_file_id uuid, p_client_ip text DEFAULT NULL::text, p_user_agent text DEFAULT NULL::text)
 RETURNS TABLE(outcome text, storage_path text, file_name text, mime_type text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  clean_code text := upper(regexp_replace(trim(coalesce(p_tracking_code, '')), '[^A-Za-z0-9]', '', 'g'));
  clean_ip text := nullif(left(trim(coalesce(p_client_ip, '')), 64), '');
  clean_ua text := nullif(left(coalesce(p_user_agent, ''), 500), '');
  target_file public.operation_customer_files%rowtype;
  target_contract uuid;
  is_settled boolean;
begin
  if p_file_id is not null then
    select f.* into target_file
    from public.operation_customer_files f
    where f.id = p_file_id;
  end if;

  if (
    select count(*) from public.operation_customer_file_downloads d
    where d.file_id = p_file_id and d.outcome = 'denied'
      and d.created_at > now() - interval '15 minutes'
  ) >= 10 or (
    clean_ip is not null and (
      select count(*) from public.operation_customer_file_downloads d
      where d.client_ip = clean_ip and d.outcome = 'denied'
        and d.created_at > now() - interval '15 minutes'
    ) >= 30
  ) or (
    select count(*) from public.operation_customer_file_downloads d
    where d.file_id = p_file_id and d.outcome = 'granted'
      and d.created_at > now() - interval '10 minutes'
  ) >= 30 then
    insert into public.operation_customer_file_downloads (organization_id, workflow_id, file_id, outcome, client_ip, user_agent)
    values (target_file.organization_id, target_file.workflow_id, p_file_id, 'rate_limited', clean_ip, clean_ua);
    return query select 'rate_limited'::text, null::text, null::text, null::text;
    return;
  end if;

  -- İptal edilen işin dosyası indirilemez. Listeyi filtrelemek tek başına
  -- yetmez: bu adres dosya kimliğiyle doğrudan çağrılabiliyor.
  if target_file.id is not null and exists (
    select 1 from public.operation_workflows w
    where w.id = target_file.workflow_id and w.status = 'cancelled'
  ) then
    insert into public.operation_customer_file_downloads (organization_id, workflow_id, file_id, outcome, client_ip, user_agent)
    values (target_file.organization_id, target_file.workflow_id, p_file_id, 'denied', clean_ip, clean_ua);
    return query select 'not_found'::text, null::text, null::text, null::text;
    return;
  end if;

  if target_file.id is not null and target_file.deleted_at is null and char_length(clean_code) >= 6 then
    select c.id into target_contract
    from public.crm_contracts c
    where c.tracking_code = clean_code
      and c.status in ('signed', 'completed')
      and c.organization_id = target_file.organization_id
      and (
        c.workflow_id = target_file.workflow_id
        or exists (
          select 1 from public.operation_workflows w
          where w.id = target_file.workflow_id and w.contract_id = c.id
        )
      )
    limit 1;
  end if;

  if target_contract is null then
    insert into public.operation_customer_file_downloads (organization_id, workflow_id, file_id, outcome, client_ip, user_agent)
    values (target_file.organization_id, target_file.workflow_id, p_file_id, 'denied', clean_ip, clean_ua);
    return query select 'not_found'::text, null::text, null::text, null::text;
    return;
  end if;

  select s.settled into is_settled from private.arvo_contract_payment_summary(target_contract) s;

  if target_file.access_rule = 'after_full_payment' and not coalesce(is_settled, false) then
    insert into public.operation_customer_file_downloads (organization_id, workflow_id, file_id, outcome, client_ip, user_agent)
    values (target_file.organization_id, target_file.workflow_id, p_file_id, 'locked', clean_ip, clean_ua);
    return query select 'locked'::text, null::text, target_file.file_name, null::text;
    return;
  end if;

  insert into public.operation_customer_file_downloads (organization_id, workflow_id, file_id, outcome, client_ip, user_agent)
  values (target_file.organization_id, target_file.workflow_id, p_file_id, 'granted', clean_ip, clean_ua);
  return query select 'ok'::text, target_file.storage_path, target_file.file_name, target_file.mime_type;
end $function$
;

CREATE OR REPLACE FUNCTION public.check_arvoculture_coupon(p_code text, p_subtotal bigint DEFAULT 0, p_email text DEFAULT NULL::text)
 RETURNS TABLE(valid boolean, message text, discount_type text, value numeric, minimum_subtotal bigint, discount_amount bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select * from public.arc_check_coupon(
    (select id from public.organizations where slug = 'arvoculture' limit 1),
    p_code, p_subtotal, p_email)
$function$
;

CREATE OR REPLACE FUNCTION public.claim_arvoculture_orders()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user_id uuid := auth.uid();
  v_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
  v_verified boolean :=
    coalesce((auth.jwt() -> 'user_metadata' ->> 'email_verified')::boolean, false)
    or coalesce((auth.jwt() ->> 'email_verified')::boolean, false);
  v_imported boolean;
  v_count integer;
  v_name text;
  v_phone text;
  v_meta jsonb;
  v_addr jsonb;
  v_line text;
  v_city text;
  v_district text;
  v_postal text;
  v_row record;
  v_seq integer := 0;
begin
  if v_user_id is null or v_email = '' or not v_verified then
    return 0;
  end if;

  -- --- 1. Siparişleri hesaba bağla -------------------------
  update public.arc_orders
     set user_id = v_user_id, updated_at = now()
   where user_id is null
     and lower(customer_email) = v_email;

  get diagnostics v_count = row_count;

  -- --- 2. Ad ve telefon ------------------------------------
  select o.customer_name, o.metadata
    into v_name, v_meta
  from public.arc_orders o
  where o.user_id = v_user_id
  order by o.created_at desc
  limit 1;

  v_addr := public.arc_find_address(coalesce(v_meta, '{}'::jsonb));

  v_phone := coalesce(
    public.arc_clean(v_addr ->> 'phone'),
    public.arc_clean(v_meta ->> 'phone')
  );

  v_name := coalesce(
    public.arc_clean(v_name),
    public.arc_clean(v_addr ->> 'name')
  );

  update auth.users u
     set raw_user_meta_data =
           coalesce(u.raw_user_meta_data, '{}'::jsonb)
           || jsonb_strip_nulls(
                jsonb_build_object(
                  'full_name',
                  case when coalesce(u.raw_user_meta_data ->> 'full_name', '') = ''
                       then v_name end,
                  'phone',
                  case when coalesce(u.raw_user_meta_data ->> 'phone', '') = ''
                       then v_phone end
                )
              )
   where u.id = v_user_id;

  -- --- 3. Adresler: yalnızca bir kez ------------------------
  select coalesce(
           (raw_user_meta_data ->> 'addresses_imported')::boolean,
           false
         )
    into v_imported
  from auth.users
  where id = v_user_id;

  if v_imported then
    -- Aktarım daha önce yapıldı. Müşterinin sildiği adresleri
    -- geri getirmiyoruz.
    return v_count;
  end if;

  for v_row in
    select o.customer_name, o.metadata as meta, o.created_at
    from public.arc_orders o
    where o.user_id = v_user_id
    order by o.created_at desc
  loop
    v_addr := public.arc_find_address(coalesce(v_row.meta, '{}'::jsonb));

    v_line := coalesce(
      public.arc_clean(v_addr ->> 'line'),
      public.arc_address_line(v_addr)
    );

    if v_line is null then
      continue;
    end if;

    v_city := coalesce(public.arc_clean(v_addr ->> 'city'), '-');
    v_district := coalesce(
      public.arc_clean(v_addr ->> 'district'),
      public.arc_clean(v_addr ->> 'province'),
      '-'
    );
    v_postal := coalesce(
      public.arc_clean(v_addr ->> 'postal'),
      public.arc_clean(v_addr ->> 'zip')
    );

    if exists (
      select 1 from public.arc_customer_addresses a
      where a.user_id = v_user_id
        and lower(trim(a.line)) = lower(v_line)
        and lower(trim(a.city)) = lower(v_city)
    ) then
      continue;
    end if;

    v_seq := v_seq + 1;

    insert into public.arc_customer_addresses (
      user_id, title, full_name, phone,
      city, district, postal_code, line,
      is_billing, is_shipping, is_default
    )
    values (
      v_user_id,
      case when v_seq = 1 then 'Ev' else 'Kayıtlı adres ' || v_seq end,
      coalesce(
        public.arc_clean(v_row.customer_name),
        public.arc_clean(v_addr ->> 'name'),
        'Ad Soyad'
      ),
      coalesce(
        public.arc_clean(v_addr ->> 'phone'),
        public.arc_clean(v_row.meta ->> 'phone'),
        '-'
      ),
      v_city,
      v_district,
      v_postal,
      v_line,
      true,
      true,
      v_seq = 1 and not exists (
        select 1 from public.arc_customer_addresses a2
        where a2.user_id = v_user_id and a2.is_default
      )
    );
  end loop;

  -- Aktarım tamamlandı; bir daha çalışmayacak.
  update auth.users
     set raw_user_meta_data =
           coalesce(raw_user_meta_data, '{}'::jsonb)
           || jsonb_build_object('addresses_imported', true)
   where id = v_user_id;

  return v_count;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.collect_payment_installment(target_installment_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  inst public.payment_installments%rowtype;
  plan public.payment_plans%rowtype;
  con public.crm_contracts%rowtype;
  opp public.crm_opportunities%rowtype;
  emp public.hr_employees%rowtype;
  commission_value bigint;
begin
  select * into inst from public.payment_installments where id=target_installment_id;
  if inst.id is null then raise exception 'installment_not_found'; end if;
  select * into plan from public.payment_plans where id=inst.payment_plan_id;
  -- Eskiden yalnızca "üye mi" diye bakılıyordu: finans modülü kapalı bir satış
  -- personeli taksiti "ödendi" yapıp kendi primini tahakkuk ettirebiliyordu.
  -- Sunucudaki kural (app/panel/finance/actions.ts) owner/admin istiyor.
  if (select auth.uid()) is not null and not private.arvo_is_finance_manager(plan.organization_id) then
    raise exception 'forbidden';
  end if;
  if inst.status='paid' then return; end if;

  select * into con from public.crm_contracts where id=plan.contract_id;
  select * into opp from public.crm_opportunities where id=con.opportunity_id;

  update public.payment_installments set status='paid',paid_at=now() where id=inst.id;

  insert into public.account_entries(organization_id,party_id,entry_type,source_type,amount,currency,description,reference_no,transaction_date,due_date,created_by)
  values(plan.organization_id,plan.party_id,'credit','payment',inst.amount,plan.currency,'Tahsilat - '||coalesce(con.title,'Sözleşme'),coalesce(con.contract_no,'TAHSILAT'),current_date,inst.due_date,auth.uid());

  update public.finance_transactions set status='paid',paid_at=now(),updated_at=now()
  where organization_id=plan.organization_id and transaction_type='income' and status='planned'
    and counterparty=(select name from public.account_parties where id=plan.party_id)
    and amount=inst.amount and (due_date=inst.due_date or due_date is null);

  if opp.assigned_employee_id is not null then
    select * into emp from public.hr_employees
    where id=opp.assigned_employee_id and organization_id=plan.organization_id and employment_status='active';
    if emp.id is not null and emp.commission_rate > 0 then
      commission_value:=round(inst.amount*emp.commission_rate/100.0);
      insert into public.hr_sales_commissions(organization_id,employee_id,opportunity_id,payment_installment_id,collected_amount,commission_rate,commission_amount,status)
      values(plan.organization_id,emp.id,opp.id,inst.id,inst.amount,emp.commission_rate,commission_value,'accrued')
      on conflict(payment_installment_id,employee_id) do nothing;
    end if;
  end if;

  if not exists(select 1 from public.payment_installments where payment_plan_id=plan.id and status='pending') then
    update public.payment_plans set status='completed',updated_at=now() where id=plan.id;
  end if;
end$function$
;

CREATE OR REPLACE FUNCTION public.complete_organization_onboarding(p_organization_id uuid, p_legal_name text, p_phone text, p_website text, p_logo_url text, p_primary_color text)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  if length(trim(p_legal_name)) < 2 or length(trim(p_legal_name)) > 180 then
    raise exception 'Invalid legal name';
  end if;
  if p_primary_color !~ '^#[0-9A-Fa-f]{6}$' then
    raise exception 'Invalid color';
  end if;

  insert into public.organization_onboarding (
    organization_id, current_step, legal_name, phone, website, logo_url,
    primary_color, completed_at, completed_by, updated_at
  ) values (
    p_organization_id, 4, trim(p_legal_name), nullif(trim(p_phone), ''),
    nullif(trim(p_website), ''), nullif(trim(p_logo_url), ''), p_primary_color,
    now(), (select auth.uid()), now()
  )
  on conflict (organization_id) do update set
    current_step = 4,
    legal_name = excluded.legal_name,
    phone = excluded.phone,
    website = excluded.website,
    logo_url = excluded.logo_url,
    primary_color = excluded.primary_color,
    completed_at = excluded.completed_at,
    completed_by = excluded.completed_by,
    updated_at = excluded.updated_at;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.create_arvoculture_return_request(p_order_number text, p_items jsonb, p_reason text, p_note text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_order public.arc_orders%rowtype;
  v_uid uuid := auth.uid();
  v_id uuid;
  v_days integer;
begin
  if v_uid is null then
    raise exception 'Oturum açmanız gerekiyor.';
  end if;

  select * into v_order
  from public.arc_orders o
  join public.organizations org
    on org.id = o.organization_id and org.slug = 'arvoculture'
  where o.order_number = p_order_number
    and o.user_id = v_uid
  limit 1;

  if v_order.id is null then
    raise exception 'Sipariş bulunamadı.';
  end if;

  if v_order.payment_status <> 'paid' then
    raise exception 'Ödemesi tamamlanmamış sipariş için iade talebi açılamaz.';
  end if;

  /*
    Cayma süresi. Teslim tarihi kayıtlı değilse sipariş
    tarihinden sayılıyor; müşteri lehine geniş yorum.
  */
  v_days := extract(day from now() - v_order.created_at);

  if v_days > 30 then
    raise exception 'İade süresi dolmuş.';
  end if;

  if p_reason is null or length(trim(p_reason)) < 3 then
    raise exception 'İade sebebi belirtilmeli.';
  end if;

  insert into public.arc_return_requests
    (organization_id, order_id, user_id, items, reason, note)
  values
    (v_order.organization_id, v_order.id, v_uid,
     coalesce(p_items, '[]'::jsonb), trim(p_reason), nullif(trim(p_note), ''))
  returning id into v_id;

  return v_id;
exception
  when unique_violation then
    raise exception 'Bu sipariş için zaten açık bir iade talebiniz var.';
end;
$function$
;

CREATE OR REPLACE FUNCTION public.create_arvoculture_storefront_order(p_email text, p_name text, p_phone text, p_address jsonb, p_items jsonb, p_coupon_code text DEFAULT NULL::text)
 RETURNS TABLE(order_id uuid, order_number text, total bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_org_id uuid;
begin
  select id into v_org_id from public.organizations where slug = 'arvoculture' limit 1;
  if v_org_id is null then
    raise exception 'Organizasyon bulunamadı';
  end if;
  return query select * from public.arc_create_storefront_order(
    v_org_id, p_email, p_name, p_phone, p_address, p_items, p_coupon_code);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.create_crm_proposal(target_opportunity_id uuid, proposal_title text, proposal_scope text, proposal_amount bigint, proposal_payment_plan text, proposal_valid_until date)
 RETURNS TABLE(proposal_id uuid, access_token text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare opp public.crm_opportunities%rowtype; raw_token text:=encode(gen_random_bytes(24),'hex'); new_id uuid; next_no text;
begin
 select * into opp from public.crm_opportunities where id=target_opportunity_id;
 if opp.id is null or not public.arvo_is_member(opp.organization_id) then raise exception 'opportunity_not_found'; end if;
 next_no:='TKL-'||to_char(now(),'YYYY')||'-'||lpad((select (count(*)+1)::text from public.crm_proposals where organization_id=opp.organization_id),5,'0');
 insert into public.crm_proposals(organization_id,opportunity_id,proposal_no,title,scope,amount,payment_plan,valid_until,status,access_token_hash,created_by)
 values(opp.organization_id,opp.id,next_no,proposal_title,proposal_scope,proposal_amount,proposal_payment_plan,proposal_valid_until,'draft',encode(digest(raw_token,'sha256'),'hex'),auth.uid()) returning id into new_id;
 update public.crm_opportunities set stage='proposal',probability=50,updated_at=now() where id=opp.id;
 return query select new_id,raw_token;
end$function$
;

CREATE OR REPLACE FUNCTION public.create_crm_proposal_revision(target_proposal_id uuid, revision_reason text DEFAULT NULL::text)
 RETURNS TABLE(proposal_id uuid, access_token text)
 LANGUAGE plpgsql
 SET search_path TO 'public', 'extensions'
AS $function$
declare
  source public.crm_proposals%rowtype;
  new_id uuid;
  raw_token text := encode(gen_random_bytes(24), 'hex');
  next_revision integer;
  root_id uuid;
  revised_no text;
begin
  select * into source from public.crm_proposals where id = target_proposal_id;
  if source.id is null or not public.arvo_is_member(source.organization_id) then
    raise exception 'proposal_not_found';
  end if;
  if source.status in ('accepted','rejected','archived') then
    raise exception 'proposal_locked';
  end if;
  if source.superseded_by is not null then
    raise exception 'proposal_already_superseded';
  end if;

  root_id := coalesce(source.root_proposal_id, source.id);
  select coalesce(max(revision_no), 0) + 1 into next_revision
  from public.crm_proposals
  where coalesce(root_proposal_id, id) = root_id;

  revised_no := regexp_replace(source.proposal_no, '-R[0-9]+$', '') || '-R' || next_revision::text;

  insert into public.crm_proposals(
    organization_id, opportunity_id, proposal_no, title, scope, amount, currency,
    payment_plan, valid_until, status, access_token_hash, created_by,
    tax_status, tax_rate, net_amount, tax_amount, gross_amount,
    payment_plan_type, payment_schedule, root_proposal_id, previous_revision_id,
    revision_no, revision_note
  ) values (
    source.organization_id, source.opportunity_id, revised_no, source.title, source.scope,
    source.amount, source.currency, source.payment_plan, source.valid_until, 'draft',
    encode(digest(raw_token, 'sha256'), 'hex'), auth.uid(), source.tax_status,
    source.tax_rate, source.net_amount, source.tax_amount, source.gross_amount,
    source.payment_plan_type, source.payment_schedule, root_id, source.id,
    next_revision, nullif(trim(coalesce(revision_reason, '')), '')
  ) returning id into new_id;

  update public.crm_proposals
  set status = 'archived', superseded_at = now(), superseded_by = new_id, updated_at = now()
  where id = source.id;

  return query select new_id, raw_token;
end
$function$
;

CREATE OR REPLACE FUNCTION public.create_crm_proposal_v2(target_opportunity_id uuid, proposal_title text, proposal_scope text, proposal_amount bigint, proposal_tax_status text, proposal_payment_plan_type text, proposal_payment_plan text, proposal_payment_schedule jsonb, proposal_valid_until date, proposal_estimated_delivery_date date DEFAULT NULL::date)
 RETURNS TABLE(proposal_id uuid, access_token text)
 LANGUAGE plpgsql
 SET search_path TO 'public', 'extensions'
AS $function$
declare
  opp public.crm_opportunities%rowtype;
  raw_token text := encode(gen_random_bytes(24), 'hex');
  new_id uuid;
  next_no text;
  v_net bigint;
  v_tax bigint;
  v_gross bigint;
begin
  select * into opp
  from public.crm_opportunities
  where id = target_opportunity_id;

  if opp.id is null or not public.arvo_is_member(opp.organization_id) then
    raise exception 'opportunity_not_found';
  end if;

  if proposal_tax_status not in ('included', 'excluded', 'exempt') then
    raise exception 'invalid_tax_status';
  end if;

  if proposal_payment_plan_type not in (
    'cash',
    'half',
    'third',
    'custom',
    'installments_3',
    'installments_6',
    'installments_12'
  ) then
    raise exception 'invalid_payment_plan_type';
  end if;

  if proposal_amount < 0 then
    raise exception 'invalid_amount';
  end if;

  if proposal_tax_status = 'included' then
    v_gross := proposal_amount;
    v_net := round(proposal_amount / 1.20);
    v_tax := v_gross - v_net;
  elsif proposal_tax_status = 'excluded' then
    v_net := proposal_amount;
    v_tax := round(proposal_amount * 0.20);
    v_gross := v_net + v_tax;
  else
    v_net := proposal_amount;
    v_tax := 0;
    v_gross := proposal_amount;
  end if;

  next_no := public.next_document_number(
    opp.organization_id,
    'proposal',
    'TKF',
    current_date
  );

  insert into public.crm_proposals(
    organization_id,
    opportunity_id,
    proposal_no,
    title,
    scope,
    amount,
    payment_plan,
    valid_until,
    estimated_delivery_date,
    status,
    access_token_hash,
    created_by,
    tax_status,
    tax_rate,
    net_amount,
    tax_amount,
    gross_amount,
    payment_plan_type,
    payment_schedule
  ) values (
    opp.organization_id,
    opp.id,
    next_no,
    proposal_title,
    proposal_scope,
    v_gross,
    proposal_payment_plan,
    proposal_valid_until,
    proposal_estimated_delivery_date,
    'draft',
    encode(digest(raw_token, 'sha256'), 'hex'),
    auth.uid(),
    proposal_tax_status,
    case when proposal_tax_status = 'exempt' then 0 else 20 end,
    v_net,
    v_tax,
    v_gross,
    proposal_payment_plan_type,
    coalesce(proposal_payment_schedule, '[]'::jsonb)
  )
  returning id into new_id;

  update public.crm_opportunities
  set
    stage = 'proposal',
    probability = 50,
    estimated_value = v_gross,
    updated_at = now()
  where id = opp.id;

  return query select new_id, raw_token;
end
$function$
;

CREATE OR REPLACE FUNCTION public.create_customer_organization(p_name text, p_slug text, p_sector text, p_plan_code text, p_custom_domain text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  raise exception 'Use provision_customer_organization with an owner email';
end;
$function$
;

CREATE OR REPLACE FUNCTION public.create_direct_message_channel(target_user_id uuid, target_organization_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  current_user_id uuid := (select auth.uid());
  direct_channel_id uuid;
  pair_key text;
begin
  if current_user_id is null then
    raise exception 'Oturum gerekli.';
  end if;

  if target_user_id is null or target_user_id = current_user_id then
    raise exception 'Geçerli bir ekip üyesi seçin.';
  end if;

  if not exists (
    select 1
    from public.organization_memberships membership
    where membership.organization_id = target_organization_id
      and membership.user_id = current_user_id
      and membership.is_active
  ) then
    raise exception 'Aktif kurum üyeliği bulunamadı.';
  end if;

  if not exists (
    select 1
    from public.organization_memberships membership
    where membership.organization_id = target_organization_id
      and membership.user_id = target_user_id
      and membership.is_active
  ) then
    raise exception 'Seçilen kullanıcı bu kurumun aktif üyesi değil.';
  end if;

  pair_key := case
    when current_user_id::text < target_user_id::text
      then current_user_id::text || ':' || target_user_id::text
    else target_user_id::text || ':' || current_user_id::text
  end;

  select channel.id into direct_channel_id
  from public.message_channels channel
  where channel.organization_id = target_organization_id
    and channel.channel_type = 'direct'
    and channel.direct_key = pair_key
  limit 1;

  if direct_channel_id is null then
    insert into public.message_channels (
      organization_id, name, description, is_private, created_by, channel_type, direct_key
    ) values (
      target_organization_id, 'direct:' || pair_key, 'Kişiye özel ekip sohbeti',
      true, current_user_id, 'direct', pair_key
    )
    returning id into direct_channel_id;

    insert into public.message_channel_members (
      channel_id, organization_id, user_id, channel_created_by, channel_direct_key
    ) values
      (direct_channel_id, target_organization_id, current_user_id, current_user_id, pair_key),
      (direct_channel_id, target_organization_id, target_user_id, current_user_id, pair_key)
    on conflict (channel_id, user_id) do nothing;
  end if;

  return direct_channel_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.create_group_message_channel(p_organization_id uuid, p_name text, p_member_ids uuid[])
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_me uuid := (select auth.uid());
  v_name text := btrim(coalesce(p_name, ''));
  v_id uuid;
begin
  if v_me is null then raise exception 'Oturum gerekli.'; end if;
  if not exists (
    select 1 from public.organization_memberships
    where organization_id = p_organization_id and user_id = v_me and is_active
  ) then
    raise exception 'Aktif kurum üyeliği bulunamadı.';
  end if;
  if char_length(v_name) not between 2 and 80 then
    raise exception 'Grup adı 2 ile 80 karakter arasında olmalıdır.';
  end if;
  if exists (
    select 1 from public.message_channels
    where organization_id = p_organization_id and lower(name) = lower(v_name)
  ) then
    raise exception 'Bu adla bir sohbet zaten var.';
  end if;

  insert into public.message_channels (organization_id, name, description, is_private, created_by, channel_type)
  values (p_organization_id, v_name, null, true, v_me, 'group')
  returning id into v_id;

  insert into public.message_channel_members (channel_id, organization_id, user_id)
  select distinct v_id, p_organization_id, x.u
  from unnest(array_append(coalesce(p_member_ids, '{}'::uuid[]), v_me)) as x(u)
  where exists (
    select 1 from public.organization_memberships m
    where m.organization_id = p_organization_id and m.user_id = x.u and m.is_active
  )
  on conflict (channel_id, user_id) do nothing;

  return v_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.crm_customer_history(p_organization_id uuid, p_customer_key text DEFAULT NULL::text, p_phone text DEFAULT NULL::text, p_name text DEFAULT NULL::text, p_exclude_opportunity_id uuid DEFAULT NULL::uuid, p_limit integer DEFAULT 200)
 RETURNS TABLE(kind text, record_id uuid, opportunity_id uuid, title text, request_title text, service_type text, record_no text, customer_name text, amount numeric, currency text, status text, archive_reason text, happened_at timestamp with time zone, sales_rep text, operator_name text, match_kind text, can_open boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
#variable_conflict use_column
declare
  v_role text;
  v_privileged boolean;
  v_my_employees uuid[];
  v_key text := nullif(btrim(left(coalesce(p_customer_key, ''), 200)), '');
  v_key_phone text := '';
  v_phone text := '';
  v_name text := '';
  v_limit integer := least(greatest(coalesce(p_limit, 200), 1), 500);
  v_today date := (now() at time zone 'Europe/Istanbul')::date;
begin
  v_role := private.arvo_crm_lookup_role(p_organization_id);
  if v_role is null then
    return;
  end if;
  v_privileged := v_role in ('owner', 'admin', 'manager');
  select coalesce(array_agg(e.id), '{}'::uuid[]) into v_my_employees
  from hr_employees e
  where e.organization_id = p_organization_id
    and e.user_id = auth.uid()
    and e.employment_status = 'active';

  if v_key is not null then
    if v_key !~ '^(p:[0-9]{7,10}|n:.+)$' then
      return;
    end if;
    if left(v_key, 2) = 'p:' then
      v_key_phone := substr(v_key, 3);
    end if;
  else
    v_phone := private.arvo_phone_key(p_phone);
    if length(v_phone) < 7 then
      v_phone := '';
    end if;
    v_name := private.arvo_name_key(p_name);
    if length(replace(v_name, ' ', '')) < 2 then
      v_name := '';
    end if;
    if v_phone = '' and v_name = '' then
      return;
    end if;
  end if;

  return query
  with units as (
    select * from private.arvo_crm_customer_units(p_organization_id)
  ),
  picked as (
    select u.unit_kind as uk, u.unit_id as uid,
      case
        when v_key is not null then
          case when v_key_phone <> '' and u.phone_key = v_key_phone then 'phone' else 'name' end
        when v_phone <> '' and u.phone_key = v_phone and v_name <> '' and u.name_key = v_name then 'both'
        when v_phone <> '' and u.phone_key = v_phone then 'phone'
        else 'name'
      end as m
    from units u
    where (
        case
          when v_key is not null then u.customer_key = v_key
          else (v_phone <> '' and u.phone_key = v_phone) or (v_name <> '' and u.name_key = v_name)
        end
      )
      and (p_exclude_opportunity_id is null or u.unit_id <> p_exclude_opportunity_id)
  ),
  opps as (
    select o.id as oid, o.title::text as otitle, o.customer_name::text as oname, o.stage::text as ostage,
      o.created_at as ocreated, o.request_details ->> 'service_type' as oservice,
      pk.m as om, e.full_name::text as orep,
      (v_privileged or coalesce(o.assigned_employee_id = any(v_my_employees), false)) as omine
    from picked pk
    join crm_opportunities o on o.id = pk.uid and o.organization_id = p_organization_id
    left join hr_employees e on e.id = o.assigned_employee_id
    where pk.uk = 'opportunity'
  ),
  props as (
    select pr.id as pid, pr.opportunity_id as poid, pr.proposal_no::text as pno, pr.title::text as ptitle,
      pr.amount::numeric as pamount, pr.currency::text as pcur, pr.status::text as pstatus,
      pr.archive_reason::text as preason, pr.valid_until as pvalid,
      coalesce(pr.responded_at, pr.sent_at, pr.created_at) as pat
    from crm_proposals pr
    join opps o on o.oid = pr.opportunity_id
    where pr.organization_id = p_organization_id
      and pr.superseded_at is null
  ),
  contr as (
    select ct.id as cid, ct.opportunity_id as coid, ct.contract_no::text as cno, ct.title::text as ctitle,
      ct.amount::numeric as camount, ct.currency::text as ccur, ct.status::text as cstatus,
      ct.workflow_id as cwf, coalesce(ct.signed_at, ct.created_at) as cat
    from crm_contracts ct
    join opps o on o.oid = ct.opportunity_id
    where ct.organization_id = p_organization_id
  ),
  jobs as (
    select distinct on (wf.id)
      wf.id as jid, wf.title::text as jtitle, wf.customer_name::text as jname, wf.status::text as jstatus,
      wf.assigned_employee_id as jemp, coalesce(wf.updated_at, wf.created_at) as jat,
      c.coid as joid, c.cno as jno, pk.m as jm
    from operation_workflows wf
    left join contr c on c.cid = wf.contract_id or c.cwf = wf.id
    left join picked pk on pk.uk = 'workflow' and pk.uid = wf.id
    where wf.organization_id = p_organization_id
      and (c.cid is not null or pk.uid is not null)
    order by wf.id, (c.cid = wf.contract_id) desc nulls last
  ),
  items as (
    select 'proposal'::text as k, p.pid as rid, p.poid as roid, p.ptitle as rtitle, o.otitle as rreq,
      o.oservice as rservice, p.pno as rno, o.oname as rname, p.pamount as ramount, p.pcur as rcur,
      p.pstatus as rstatus, p.preason as rreason, p.pat as rat, o.orep as rrep, null::text as rop,
      o.om as rm,
      (v_privileged or (o.omine and (
        p.pstatus = 'draft'
        or (p.pstatus = 'sent' and (p.pvalid is null or p.pvalid >= v_today))
        or (p.pstatus = 'archived' and p.preason = 'expired')
      ))) as ropen
    from props p
    join opps o on o.oid = p.poid
    union all
    select 'contract'::text, c.cid, c.coid, c.ctitle, o.otitle, o.oservice, c.cno, o.oname, c.camount, c.ccur,
      c.cstatus, null::text, c.cat, o.orep, null::text, o.om, o.omine
    from contr c
    join opps o on o.oid = c.coid
    union all
    select 'job'::text, j.jid, j.joid, j.jtitle, o.otitle, o.oservice, j.jno, coalesce(o.oname, j.jname),
      null::numeric, null::text, j.jstatus, null::text, j.jat, o.orep, op.full_name::text,
      coalesce(o.om, j.jm, 'name'),
      (v_privileged or coalesce(j.jemp = any(v_my_employees), false))
    from jobs j
    left join opps o on o.oid = j.joid
    left join hr_employees op on op.id = j.jemp
    union all
    -- Teklif / sözleşme verilmemiş talepler de "daha önce aradı" bilgisi
    select 'request'::text, o.oid, o.oid, o.otitle, o.otitle, o.oservice, null::text, o.oname, null::numeric,
      null::text, o.ostage, null::text, o.ocreated, o.orep, null::text, o.om, o.omine
    from opps o
    where not exists (select 1 from props p where p.poid = o.oid)
      and not exists (select 1 from contr c where c.coid = o.oid)
  )
  select i.k, i.rid, i.roid, i.rtitle, i.rreq, i.rservice, i.rno, i.rname, i.ramount, i.rcur,
    i.rstatus, i.rreason, i.rat, i.rrep, i.rop, i.rm, i.ropen
  from items i
  order by i.rat desc nulls last
  limit v_limit;
end
$function$
;

CREATE OR REPLACE FUNCTION public.crm_customer_search(p_organization_id uuid, p_query text, p_limit integer DEFAULT 12)
 RETURNS TABLE(customer_key text, display_name text, phone text, email text, match_kind text, score integer, request_count integer, proposal_count integer, contract_count integer, job_count integer, archived_job_count integer, proposed_totals jsonb, contract_totals jsonb, last_contact_at timestamp with time zone, rep_names text[])
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
#variable_conflict use_column
declare
  v_raw text := btrim(left(coalesce(p_query, ''), 120));
  v_limit integer := least(greatest(coalesce(p_limit, 12), 1), 25);
  v_phone_mode boolean;
  v_digits text := '';
  v_name text := '';
  v_tokens text[] := '{}';
begin
  if private.arvo_crm_lookup_role(p_organization_id) is null then
    return;
  end if;

  -- Harf içermeyen sorgu telefon sayılır ("+90 (532) 462-80.98")
  v_phone_mode := regexp_replace(v_raw, '[0-9[:space:]+()./-]', '', 'g') = '';
  if v_phone_mode then
    v_digits := private.arvo_search_digits(v_raw);
    if length(regexp_replace(v_raw, '[^0-9]', '', 'g')) < 4 or length(v_digits) < 3 then
      return;
    end if;
  else
    v_name := private.arvo_name_key(v_raw);
    if length(replace(v_name, ' ', '')) < 2 then
      return;
    end if;
    v_tokens := string_to_array(v_name, ' ');
  end if;

  return query
  with units as (
    select * from private.arvo_crm_customer_units(p_organization_id)
  ),
  scored as (
    select u.customer_key as ck, u.at as at,
      case
        when v_phone_mode then
          case
            when length(u.phone_key) < 7 then null
            when u.phone_key = v_digits then 100
            when u.phone_key like v_digits || '%' then 85
            when strpos(u.phone_key, v_digits) > 0 then 60
          end
        when u.name_key = '' then null
        when u.name_key = v_name then 100
        when u.name_key like v_name || '%' then 90
        -- tüm kelimeler bir kelimenin başında ("cag isi" -> "isik caglar")
        when (select bool_and(strpos(' ' || u.name_key, ' ' || t) > 0) from unnest(v_tokens) t) then 80
        when (select bool_and(strpos(u.name_key, t) > 0) from unnest(v_tokens) t) then 65
        -- benzer: her kelime ya geçiyor ya da bir kelimeden tek harf farklı
        when (
          select bool_and(
            strpos(u.name_key, t) > 0
            or (length(t) >= 4 and exists (
              select 1 from unnest(string_to_array(u.name_key, ' ')) w
              where private.arvo_within_one_edit(t, w)
                 or (length(w) > length(t) and private.arvo_within_one_edit(t, left(w, length(t))))
            ))
          )
          from unnest(v_tokens) t
        ) then 45
        -- benzer: çok kelimeli aramada en az bir kelime tutuyor (ör. soyadı)
        when cardinality(v_tokens) > 1 and exists (
          select 1 from unnest(v_tokens) t
          where length(t) >= 3 and strpos(' ' || u.name_key, ' ' || t) > 0
        ) then 30
      end as s
    from units u
  ),
  best as (
    select sc.ck, max(sc.s)::integer as sc_score, max(sc.at) as last_unit_at
    from scored sc
    where sc.s is not null
    group by sc.ck
    order by max(sc.s) desc, max(sc.at) desc nulls last
    limit v_limit
  ),
  -- Özetler yalnızca seçilen müşterilerin birimleri üzerinden (tüm kurum
  -- birimleri her müşteri için yeniden taranmasın)
  grp as (
    select u.* from units u join best b on b.ck = u.customer_key
  )
  select
    b.ck,
    g.display_name,
    g.phone,
    g.email,
    case
      when v_phone_mode then case when b.sc_score = 100 then 'phone' else 'phone_partial' end
      when b.sc_score >= 90 then 'name'
      when b.sc_score >= 65 then 'name_partial'
      else 'similar'
    end,
    b.sc_score,
    g.request_count,
    p.proposal_count,
    c.contract_count,
    w.job_count,
    w.archived_job_count,
    p.totals,
    c.totals,
    -- Son temas: eşleşen birimler değil, müşterinin TÜM kayıtları
    greatest(g.last_at, p.last_at, c.last_at, w.last_at),
    r.names
  from best b
  cross join lateral (
    select
      (array_agg(u.customer_name order by (u.unit_kind = 'opportunity') desc, u.at desc nulls last))[1] as display_name,
      (array_agg(u.contact_phone order by u.at desc nulls last) filter (where coalesce(u.contact_phone, '') <> ''))[1] as phone,
      (array_agg(u.contact_email order by u.at desc nulls last) filter (where coalesce(u.contact_email, '') <> ''))[1] as email,
      (count(*) filter (where u.unit_kind = 'opportunity'))::integer as request_count,
      max(u.at) as last_at
    from grp u
    where u.customer_key = b.ck
  ) g
  cross join lateral (
    select coalesce(sum(x.n), 0)::integer as proposal_count,
      max(x.last_at) as last_at,
      jsonb_object_agg(x.cur, x.total) filter (where x.total <> 0) as totals
    from (
      select upper(coalesce(pr.currency::text, 'TRY')) as cur,
        count(*) as n,
        sum(coalesce(pr.amount, 0))::numeric as total,
        max(coalesce(pr.responded_at, pr.sent_at, pr.created_at)) as last_at
      from crm_proposals pr
      join grp u on u.unit_kind = 'opportunity' and u.unit_id = pr.opportunity_id and u.customer_key = b.ck
      where pr.organization_id = p_organization_id
        and pr.superseded_at is null
      group by 1
    ) x
  ) p
  cross join lateral (
    select coalesce(sum(x.n), 0)::integer as contract_count,
      max(x.last_at) as last_at,
      jsonb_object_agg(x.cur, x.total) filter (where x.total <> 0) as totals
    from (
      select upper(coalesce(ct.currency::text, 'TRY')) as cur,
        count(*) as n,
        sum(coalesce(ct.amount, 0))::numeric as total,
        max(coalesce(ct.signed_at, ct.created_at)) as last_at
      from crm_contracts ct
      join grp u on u.unit_kind = 'opportunity' and u.unit_id = ct.opportunity_id and u.customer_key = b.ck
      where ct.organization_id = p_organization_id
      group by 1
    ) x
  ) c
  cross join lateral (
    select count(*)::integer as job_count,
      (count(*) filter (where wf.status = 'archived'))::integer as archived_job_count,
      max(coalesce(wf.updated_at, wf.created_at)) as last_at
    from operation_workflows wf
    where wf.organization_id = p_organization_id
      and (
        exists (
          select 1 from grp u
          where u.customer_key = b.ck and u.unit_kind = 'workflow' and u.unit_id = wf.id
        )
        or exists (
          select 1
          from crm_contracts ct
          join grp u on u.unit_kind = 'opportunity' and u.unit_id = ct.opportunity_id and u.customer_key = b.ck
          where ct.organization_id = p_organization_id
            and (ct.id = wf.contract_id or ct.workflow_id = wf.id)
        )
      )
  ) w
  cross join lateral (
    select array_agg(x.full_name order by x.last_at desc) as names
    from (
      select e.full_name::text as full_name, max(o.created_at) as last_at
      from grp u
      join crm_opportunities o on o.id = u.unit_id
      join hr_employees e on e.id = o.assigned_employee_id
      where u.customer_key = b.ck and u.unit_kind = 'opportunity'
      group by e.full_name
      order by 2 desc
      limit 4
    ) x
  ) r
  order by 6 desc, 14 desc nulls last;
end
$function$
;

CREATE OR REPLACE FUNCTION public.delete_group_message_channel(p_channel_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not private.arvo_can_manage_group(p_channel_id) then
    raise exception 'Bu grubu silme yetkiniz yok.';
  end if;
  delete from public.message_channels where id = p_channel_id and channel_type = 'group';
end;
$function$
;

CREATE OR REPLACE FUNCTION public.expire_due_crm_proposals()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  affected_count integer;
begin
  update public.crm_proposals
     set status = 'expired',
         updated_at = now()
   where status = 'sent'
     and valid_until is not null
     and valid_until < (now() at time zone 'Europe/Istanbul')::date;

  get diagnostics affected_count = row_count;
  return affected_count;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.generate_contract_tracking_code()
 RETURNS text
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  candidate text;
  i integer;
begin
  loop
    candidate := '';
    for i in 1..6 loop
      candidate := candidate || substr(alphabet, 1 + floor(random() * length(alphabet))::integer, 1);
    end loop;
    exit when not exists (select 1 from public.crm_contracts c where c.tracking_code = candidate);
  end loop;
  return candidate;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.get_arvoculture_my_orders()
 RETURNS TABLE(order_number text, status text, payment_status text, subtotal bigint, discount bigint, shipping bigint, total bigint, currency text, coupon_code text, address jsonb, billing_address jsonb, note text, created_at timestamp with time zone, items jsonb)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select
    o.order_number,
    o.status,
    o.payment_status,
    coalesce(o.subtotal, 0) as subtotal,
    coalesce((o.metadata ->> 'discount')::bigint, 0) as discount,
    coalesce(o.shipping, 0) as shipping,
    coalesce(o.total, 0) as total,
    o.currency,
    o.metadata ->> 'coupon_code' as coupon_code,

    -- Teslimat adresi: hangi yapıda gelirse gelsin normalleştirilir.
    coalesce(
      public.arc_normalize_address(o.metadata -> 'shipping_address'),
      public.arc_normalize_address(o.metadata -> 'address'),
      public.arc_normalize_address(o.metadata -> 'billing')
    ) as address,

    -- Fatura adresi. Ayrı tanımlı değilse teslimat adresi kullanılır.
    coalesce(
      public.arc_normalize_address(o.metadata -> 'billing'),
      public.arc_normalize_address(o.metadata -> 'billing_address'),
      public.arc_normalize_address(o.metadata -> 'shipping_address'),
      public.arc_normalize_address(o.metadata -> 'address')
    ) as billing_address,

    public.arc_clean(o.metadata ->> 'note') as note,
    o.created_at,
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'name', i.product_name,
            'sku', i.sku,
            'quantity', i.quantity,
            'unit_price', i.unit_price,
            'total', i.total,
            'slug', p.slug,
            'image', p.metadata -> 'image_paths' ->> 0
          )
          order by i.id
        )
        from public.arc_order_items i
        left join lateral (
          select v.*
          from public.arc_product_variants v
          where (i.variant_id is not null and v.id = i.variant_id)
             or (
               i.variant_id is null
               and i.sku is not null
               and v.organization_id = i.organization_id
               and v.sku = i.sku
             )
          limit 1
        ) v on true
        left join public.arc_products p
          on p.id = v.product_id
        where i.order_id = o.id
      ),
      '[]'::jsonb
    ) as items
  from public.arc_orders o
  where o.user_id = auth.uid()
  order by o.created_at desc
  limit 100;
$function$
;

CREATE OR REPLACE FUNCTION public.get_arvoculture_my_returns()
 RETURNS TABLE(id uuid, order_number text, items jsonb, reason text, status text, status_note text, refund_amount bigint, created_at timestamp with time zone, resolved_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select
    r.id, o.order_number, r.items, r.reason,
    r.status, r.status_note, r.refund_amount,
    r.created_at, r.resolved_at
  from public.arc_return_requests r
  join public.arc_orders o on o.id = r.order_id
  where r.user_id = auth.uid()
  order by r.created_at desc
  limit 50;
$function$
;

CREATE OR REPLACE FUNCTION public.get_arvoculture_storefront_collection_products(p_collection_slug text DEFAULT NULL::text, p_menu_groups text[] DEFAULT NULL::text[], p_limit integer DEFAULT 200)
 RETURNS TABLE(slug text, name text, description text, subtitle text, vendor text, product_type text, price bigint, compare_at_price bigint, available boolean, image_paths jsonb, specs jsonb, size_guide jsonb, sizes jsonb)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select
    p.slug,
    p.name,
    p.description,
    coalesce(
      nullif(p.metadata ->> 'subtitle', ''),
      left(regexp_replace(coalesce(p.description, ''), '<[^>]*>', '', 'g'), 140)
    ) as subtitle,
    coalesce(p.metadata ->> 'vendor', 'ARVO') as vendor,
    coalesce(p.metadata ->> 'product_type', '') as product_type,
    min(v.price) as price,
    min(v.compare_at_price) filter (where v.compare_at_price > v.price)
      as compare_at_price,
    bool_or(v.stock > 0 or v.allow_backorder) as available,
    coalesce(p.metadata -> 'image_paths', '[]'::jsonb) as image_paths,
    coalesce(p.metadata -> 'specs', '[]'::jsonb) as specs,
    coalesce(p.metadata -> 'size_guide', '[]'::jsonb) as size_guide,
    coalesce(
      jsonb_agg(distinct upper(trim(split_part(v.title, '/', 2))))
        filter (
          where trim(coalesce(split_part(v.title, '/', 2), '')) <> ''
            and (v.stock > 0 or v.allow_backorder)
        ),
      '[]'::jsonb
    ) as sizes
  from public.arc_products p
  join public.arc_product_variants v
    on v.product_id = p.id
   and v.organization_id = p.organization_id
  join public.organizations o
    on o.id = p.organization_id
   and o.slug = 'arvoculture'
  join public.arc_collection_products cp
    on cp.product_id = p.id
  join public.arc_collections c
    on c.id = cp.collection_id
   and c.status = 'active'
  where p.status = 'active'
    and (
      (p_collection_slug is not null and c.slug = p_collection_slug)
      or (
        p_menu_groups is not null
        and (c.metadata ->> 'menu_group') = any (p_menu_groups)
      )
    )
  group by p.id, p.slug, p.name, p.description, p.metadata, p.updated_at
  order by p.updated_at desc
  limit greatest(1, least(coalesce(p_limit, 200), 5000));
$function$
;

CREATE OR REPLACE FUNCTION public.get_arvoculture_storefront_collections()
 RETURNS TABLE(title text, slug text, description text, menu_group text, parent text, product_count integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select
    c.title,
    c.slug,
    c.description,
    coalesce(c.metadata ->> 'menu_group', '') as menu_group,
    coalesce(c.metadata ->> 'parent', '') as parent,
    count(distinct p.id)::integer as product_count
  from public.arc_collections c
  join public.organizations o
    on o.id = c.organization_id
   and o.slug = 'arvoculture'
  left join public.arc_collection_products cp
    on cp.collection_id = c.id
  left join public.arc_products p
    on p.id = cp.product_id
   and p.status = 'active'
  where c.status = 'active'
  group by c.id, c.title, c.slug, c.description, c.metadata
  -- Boş koleksiyon menüde yer kaplamasın.
  having count(distinct p.id) > 0
  order by count(distinct p.id) desc;
$function$
;

CREATE OR REPLACE FUNCTION public.get_arvoculture_storefront_deals(p_limit integer DEFAULT 12)
 RETURNS TABLE(slug text, name text, description text, subtitle text, vendor text, product_type text, price bigint, compare_at_price bigint, available boolean, image_paths jsonb, specs jsonb, size_guide jsonb)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select
    p.slug,
    p.name,
    p.description,
    coalesce(
      nullif(p.metadata ->> 'subtitle', ''),
      left(regexp_replace(coalesce(p.description, ''), '<[^>]*>', '', 'g'), 140)
    ) as subtitle,
    coalesce(p.metadata ->> 'vendor', 'ARVO') as vendor,
    coalesce(p.metadata ->> 'product_type', '') as product_type,
    min(v.price) as price,
    min(v.compare_at_price) filter (where v.compare_at_price > v.price)
      as compare_at_price,
    bool_or(v.stock > 0 or v.allow_backorder) as available,
    coalesce(p.metadata -> 'image_paths', '[]'::jsonb) as image_paths,
    coalesce(p.metadata -> 'specs', '[]'::jsonb) as specs,
    coalesce(p.metadata -> 'size_guide', '[]'::jsonb) as size_guide
  from public.arc_products p
  join public.arc_product_variants v
    on v.product_id = p.id
   and v.organization_id = p.organization_id
  join public.organizations o
    on o.id = p.organization_id
   and o.slug = 'arvoculture'
  where p.status = 'active'
  group by p.id, p.slug, p.name, p.description, p.metadata
  -- Yalnızca gerçekten indirimli ve stokta olanlar.
  having min(v.compare_at_price) filter (where v.compare_at_price > v.price)
         is not null
     and bool_or(v.stock > 0 or v.allow_backorder)
  -- En yüksek indirim oranı başta.
  order by
    (
      min(v.compare_at_price) filter (where v.compare_at_price > v.price)
      - min(v.price)
    )::numeric
    / nullif(
        min(v.compare_at_price) filter (where v.compare_at_price > v.price),
        0
      ) desc
  limit greatest(1, least(coalesce(p_limit, 12), 100));
$function$
;

CREATE OR REPLACE FUNCTION public.get_arvoculture_storefront_discounts()
 RETURNS TABLE(id uuid, name text, code text, discount_type text, value bigint, minimum_subtotal bigint, combinable boolean, badge text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select d.id,d.name,d.code,d.discount_type,d.value,d.minimum_subtotal,d.combinable,
    coalesce(nullif(d.metadata ->> 'badge', ''), d.name) as badge
  from public.arc_discounts d
  join public.organizations o on o.id=d.organization_id
  where o.slug='arvoculture' and d.status='active'
    and (d.starts_at is null or d.starts_at<=now())
    and (d.ends_at is null or d.ends_at>now())
    and (d.usage_limit is null or d.usage_count<d.usage_limit)
  order by d.code nulls first,d.created_at;
$function$
;

CREATE OR REPLACE FUNCTION public.get_arvoculture_storefront_facets()
 RETURNS TABLE(brands jsonb, sizes jsonb, max_price bigint, total_count bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
with base as (
  select
    coalesce(p.metadata ->> 'vendor', 'ARVO') as vendor,
    min(v.price) as price,
    coalesce(
      jsonb_agg(distinct upper(trim(split_part(v.title, '/', 2))))
        filter (
          where trim(coalesce(split_part(v.title, '/', 2), '')) <> ''
            and public.arc_variant_available(v.stock, v.allow_backorder, v.supplier)
        ),
      '[]'::jsonb
    ) as sizes
  from public.arc_products p
  join public.arc_product_variants v
    on v.product_id = p.id and v.organization_id = p.organization_id
  join public.organizations o
    on o.id = p.organization_id and o.slug = 'arvoculture'
  where p.status = 'active'
  group by p.id, p.metadata
)
select
  (select coalesce(jsonb_agg(v order by v), '[]'::jsonb)
     from (select distinct vendor as v from base where vendor <> '') b1) as brands,
  (select coalesce(jsonb_agg(s order by s), '[]'::jsonb)
     from (select distinct e as s
             from base, lateral jsonb_array_elements_text(base.sizes) e) b2) as sizes,
  (select coalesce(max(price), 0) from base) as max_price,
  (select count(*) from base) as total_count;
$function$
;

CREATE OR REPLACE FUNCTION public.get_arvoculture_storefront_product(p_slug text)
 RETURNS TABLE(slug text, name text, description text, subtitle text, vendor text, product_type text, price bigint, compare_at_price bigint, available boolean, image_paths jsonb)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select
    p.slug,
    p.name,
    p.description,
    coalesce(
      nullif(p.metadata ->> 'subtitle', ''),
      left(regexp_replace(coalesce(p.description, ''), '<[^>]*>', '', 'g'), 140)
    ) as subtitle,
    coalesce(p.metadata ->> 'vendor', 'ARVO') as vendor,
    coalesce(p.metadata ->> 'product_type', '') as product_type,
    min(v.price) as price,
    min(v.compare_at_price) filter (where v.compare_at_price > v.price) as compare_at_price,
    bool_or(v.stock > 0 or v.allow_backorder) as available,
    coalesce(p.metadata -> 'image_paths', '[]'::jsonb) as image_paths
  from public.arc_products p
  join public.arc_product_variants v
    on v.product_id = p.id
   and v.organization_id = p.organization_id
  join public.organizations o
    on o.id = p.organization_id
   and o.slug = 'arvoculture'
  where p.status = 'active'
    and p.slug = p_slug
    and p_slug ~ '^[a-z0-9][a-z0-9-]{0,199}$'
  group by p.id, p.slug, p.name, p.description, p.metadata
  limit 1;
$function$
;

CREATE OR REPLACE FUNCTION public.get_arvoculture_storefront_product_badges()
 RETURNS TABLE(slug text, badge text, badge_tone text, is_best_seller boolean, discount_percent integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select
    p.slug,
    nullif(p.metadata ->> 'badge', '') as badge,
    coalesce(nullif(p.metadata ->> 'badge_tone', ''), 'green') as badge_tone,
    exists (
      select 1
      from public.arc_collection_products cp
      join public.arc_collections c
        on c.id = cp.collection_id
       and c.organization_id = cp.organization_id
      where cp.organization_id = p.organization_id
        and cp.product_id = p.id
        and c.status = 'active'
        and c.title = 'Çok Satanlar'
    ) as is_best_seller,
    coalesce((
      select max(
        round(
          (1 - v.price::numeric / nullif(v.compare_at_price, 0)::numeric) * 100
        )
      )::integer
      from public.arc_product_variants v
      where v.organization_id = p.organization_id
        and v.product_id = p.id
        and v.compare_at_price > v.price
        and v.price >= 0
    ), 0) as discount_percent
  from public.arc_products p
  join public.organizations o
    on o.id = p.organization_id
   and o.slug = 'arvoculture'
  where p.status = 'active';
$function$
;

CREATE OR REPLACE FUNCTION public.get_arvoculture_storefront_product_count()
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select count(distinct p.id)::integer
  from public.arc_products p
  join public.arc_product_variants v
    on v.product_id = p.id
   and v.organization_id = p.organization_id
  join public.organizations o
    on o.id = p.organization_id
   and o.slug = 'arvoculture'
  where p.status = 'active';
$function$
;

CREATE OR REPLACE FUNCTION public.get_arvoculture_storefront_product_slugs(p_limit integer DEFAULT 20000)
 RETURNS TABLE(slug text, updated_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select p.slug, p.updated_at
  from public.arc_products p
  join public.organizations o
    on o.id = p.organization_id and o.slug = 'arvoculture'
  where p.status = 'active'
    /*
      Varyantı olmayan ürünün sayfası da yok; sitemap'e girmemeli.
      Ama varyantları toplamaya gerek yok — varlık kontrolü yeter.
      Asıl fonksiyon burada group by yapıp fiyat ve beden
      hesaplıyor, sitemap ise hiçbirini kullanmıyor.
    */
    and exists (
      select 1
      from public.arc_product_variants v
      where v.product_id = p.id
        and v.organization_id = p.organization_id
    )
  order by p.updated_at desc
  limit greatest(1, least(coalesce(p_limit, 20000), 50000));
$function$
;

CREATE OR REPLACE FUNCTION public.get_arvoculture_storefront_products(p_limit integer DEFAULT 24, p_offset integer DEFAULT 0)
 RETURNS TABLE(slug text, name text, description text, subtitle text, vendor text, product_type text, price bigint, compare_at_price bigint, available boolean, image_paths jsonb, specs jsonb, size_guide jsonb, sizes jsonb)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select
    p.slug, p.name, p.description,
    coalesce(
      nullif(p.metadata ->> 'subtitle', ''),
      left(regexp_replace(coalesce(p.description, ''), '<[^>]*>', '', 'g'), 140)
    ) as subtitle,
    coalesce(p.metadata ->> 'vendor', 'ARVO') as vendor,
    coalesce(p.metadata ->> 'product_type', '') as product_type,
    min(v.price) as price,
    min(v.compare_at_price) filter (where v.compare_at_price > v.price)
      as compare_at_price,
    bool_or(public.arc_variant_available(v.stock, v.allow_backorder, v.supplier))
      as available,
    coalesce(p.metadata -> 'image_paths', '[]'::jsonb) as image_paths,
    coalesce(p.metadata -> 'specs', '[]'::jsonb) as specs,
    coalesce(p.metadata -> 'size_guide', '[]'::jsonb) as size_guide,
    coalesce(
      jsonb_agg(distinct upper(trim(split_part(v.title, '/', 2))))
        filter (
          where trim(coalesce(split_part(v.title, '/', 2), '')) <> ''
            and public.arc_variant_available(v.stock, v.allow_backorder, v.supplier)
        ),
      '[]'::jsonb
    ) as sizes
  from public.arc_products p
  join public.arc_product_variants v
    on v.product_id = p.id and v.organization_id = p.organization_id
  join public.organizations o
    on o.id = p.organization_id and o.slug = 'arvoculture'
  where p.status = 'active'
  group by p.id, p.slug, p.name, p.description, p.metadata, p.updated_at
  order by p.updated_at desc
  limit greatest(1, least(coalesce(p_limit, 24), 5000))
  offset greatest(0, coalesce(p_offset, 0));
$function$
;

CREATE OR REPLACE FUNCTION public.get_arvoculture_storefront_products_page(p_limit integer DEFAULT 24, p_offset integer DEFAULT 0, p_brand text DEFAULT NULL::text, p_size text DEFAULT NULL::text, p_max_price bigint DEFAULT NULL::bigint, p_only_discounted boolean DEFAULT false, p_only_available boolean DEFAULT false, p_sort text DEFAULT 'onerilen'::text)
 RETURNS TABLE(slug text, name text, subtitle text, vendor text, product_type text, price bigint, compare_at_price bigint, available boolean, image_paths jsonb, sizes jsonb, total_count bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
with base as (
  select
    p.slug,
    p.name,
    coalesce(
      nullif(p.metadata ->> 'subtitle', ''),
      left(regexp_replace(coalesce(p.description, ''), '<[^>]*>', '', 'g'), 140)
    ) as subtitle,
    coalesce(p.metadata ->> 'vendor', 'ARVO') as vendor,
    coalesce(p.metadata ->> 'product_type', '') as product_type,
    min(v.price) as price,
    min(v.compare_at_price) filter (where v.compare_at_price > v.price)
      as compare_at_price,
    bool_or(public.arc_variant_available(v.stock, v.allow_backorder, v.supplier))
      as available,
    coalesce(p.metadata -> 'image_paths', '[]'::jsonb) as image_paths,
    coalesce(
      jsonb_agg(distinct upper(trim(split_part(v.title, '/', 2))))
        filter (
          where trim(coalesce(split_part(v.title, '/', 2), '')) <> ''
            and public.arc_variant_available(v.stock, v.allow_backorder, v.supplier)
        ),
      '[]'::jsonb
    ) as sizes,
    p.updated_at
  from public.arc_products p
  join public.arc_product_variants v
    on v.product_id = p.id and v.organization_id = p.organization_id
  join public.organizations o
    on o.id = p.organization_id and o.slug = 'arvoculture'
  where p.status = 'active'
  group by p.id, p.slug, p.name, p.description, p.metadata, p.updated_at
),
scored as (
  select
    b.*,
    case
      when b.compare_at_price is not null and b.compare_at_price > b.price
        then round(100.0 * (b.compare_at_price - b.price) / b.compare_at_price)::int
      else 0
    end as discount_percent
  from base b
),
narrowed as (
  select * from scored
  where (nullif(p_brand, '') is null or vendor = p_brand)
    and (coalesce(p_max_price, 0) <= 0 or price <= p_max_price)
    and (not coalesce(p_only_available, false) or available)
    and (nullif(p_size, '') is null or sizes ? upper(p_size))
    and (not coalesce(p_only_discounted, false) or discount_percent > 0)
)
select
  slug, name, subtitle, vendor, product_type,
  price, compare_at_price, available, image_paths, sizes,
  count(*) over () as total_count
from narrowed
order by
  case when p_sort = 'ucuz'    then price            end asc  nulls last,
  case when p_sort = 'pahali'  then price            end desc nulls last,
  case when p_sort = 'indirim' then discount_percent end desc nulls last,
  case when p_sort = 'yeni'    then updated_at       end desc nulls last,
  -- Önerilen (varsayılan): stokta olanlar önce, sonra en çok indirim.
  case when p_sort not in ('ucuz', 'pahali', 'indirim', 'yeni')
       then (case when available then 0 else 1 end) end asc  nulls last,
  case when p_sort not in ('ucuz', 'pahali', 'indirim', 'yeni')
       then discount_percent end desc nulls last,
  updated_at desc
limit  greatest(1, least(coalesce(p_limit, 24), 200))
offset greatest(0, coalesce(p_offset, 0));
$function$
;

CREATE OR REPLACE FUNCTION public.get_arvoculture_storefront_search_index(p_limit integer DEFAULT 20000)
 RETURNS TABLE(slug text, name text, vendor text, product_type text, price bigint, compare_at_price bigint, image_path text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select
    p.slug,
    p.name,
    coalesce(p.metadata ->> 'vendor', 'ARVO') as vendor,
    coalesce(p.metadata ->> 'product_type', '') as product_type,
    min(v.price) as price,
    min(v.compare_at_price) filter (where v.compare_at_price > v.price)
      as compare_at_price,
    /*
      Yalnızca ilk görsel. Arama sonucu tek küçük resim gösteriyor
      ama katalog fonksiyonu her ürünün tüm galerisini taşıyordu —
      3.400 ürün için tek başına 1,7 MB.
    */
    (p.metadata -> 'image_paths' ->> 0) as image_path
  from public.arc_products p
  join public.arc_product_variants v
    on v.product_id = p.id and v.organization_id = p.organization_id
  join public.organizations o
    on o.id = p.organization_id and o.slug = 'arvoculture'
  where p.status = 'active'
  group by p.id, p.slug, p.name, p.metadata, p.updated_at
  /*
    Stokta olmayan ürün aramada zaten gösterilmiyordu; süzme
    uygulama tarafında yapılıyordu. Veritabanında yapmak hem
    satır sayısını hem taşınan veriyi düşürüyor.
  */
  having bool_or(
    public.arc_variant_available(v.stock, v.allow_backorder, v.supplier)
  )
  order by p.updated_at desc
  limit greatest(1, least(coalesce(p_limit, 20000), 50000));
$function$
;

CREATE OR REPLACE FUNCTION public.get_arvoculture_storefront_settings()
 RETURNS TABLE(shipping_fee bigint, free_shipping_threshold bigint, bank_transfer_enabled boolean, bank_transfer_discount_percent numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select
    coalesce(s.shipping_fee, 12000),
    coalesce(s.free_shipping_threshold, 200000),
    coalesce(s.bank_transfer_enabled, true),
    coalesce(s.bank_transfer_discount_percent, 3)
  from public.organizations o
  left join public.arc_store_settings s
    on s.organization_id = o.id
  where o.slug = 'arvoculture'
  limit 1;
$function$
;

CREATE OR REPLACE FUNCTION public.get_arvoculture_storefront_variants(p_slug text)
 RETURNS TABLE(sku text, title text, color text, size text, price bigint, compare_at_price bigint, stock integer, available boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select
    v.sku,
    coalesce(nullif(trim(v.title), ''), v.sku) as title,
    nullif(trim(split_part(coalesce(v.title, ''), '/', 1)), '') as color,
    nullif(trim(split_part(coalesce(v.title, ''), '/', 2)), '') as size,
    v.price,
    v.compare_at_price,
    v.stock,
    public.arc_variant_available(v.stock, v.allow_backorder, v.supplier)
      as available
  from public.arc_product_variants v
  join public.arc_products p
    on p.id = v.product_id
   and p.organization_id = v.organization_id
  join public.organizations o
    on o.id = p.organization_id
   and o.slug = 'arvoculture'
  where p.status = 'active'
    and p.slug = p_slug
    and p_slug ~ '^[a-z0-9][a-z0-9-]{0,199}$'
  order by
    case upper(trim(split_part(coalesce(v.title, ''), '/', 2)))
      when 'XXS' then 1 when 'XS' then 2 when 'S' then 3
      when 'M' then 4 when 'L' then 5 when 'XL' then 6
      when '2XL' then 7 when 'XXL' then 7
      when '3XL' then 8 when '4XL' then 9
      else 50
    end,
    v.price,
    v.sku
  limit 60;
$function$
;

CREATE OR REPLACE FUNCTION public.get_my_workspaces()
 RETURNS TABLE(organization_id uuid, role text, id uuid, name text, slug text, status text, plan_code text, sector text, custom_domain text, logo_url text, display_name text, brand_color text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select
    m.organization_id,
    m.role::text,
    o.id,
    o.name,
    o.slug,
    o.status,
    o.plan_code,
    o.sector,
    o.custom_domain,
    o.logo_url,
    o.display_name,
    o.brand_color
  from public.organization_memberships m
  join public.organizations o on o.id = m.organization_id
  where m.user_id = auth.uid()
    and m.is_active = true
    and o.status = 'active'
  order by case when o.slug = 'akademikmerkez' then 0 when o.slug = 'arvo-os' then 1 else 2 end,
           o.name;
$function$
;

CREATE OR REPLACE FUNCTION public.get_public_crm_contract(public_token text)
 RETURNS TABLE(id uuid, contract_no text, title text, scope text, amount bigint, currency text, payment_plan text, payment_schedule jsonb, start_date date, due_date date, created_at timestamp with time zone, status text, customer_name text, contact_email text, contact_phone text, customer_address text, customer_tax_number text, customer_tax_office text, organization_name text, organization_slug text, organization_logo_url text, organization_primary_color text, organization_document_footer text, organization_contact_email text, organization_contact_phone text, organization_website_url text, organization_signature_stamp_url text, signed_name text, signed_at timestamp with time zone, signed_signature_data text, signed_ip text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
  select
    c.id,
    c.contract_no,
    c.title,
    c.scope,
    c.amount,
    c.currency,
    c.payment_plan,
    coalesce(c.payment_schedule, p.payment_schedule, '[]'::jsonb),
    c.start_date,
    c.due_date,
    c.created_at,
    c.status,
    o.customer_name,
    o.contact_email,
    o.contact_phone,
    c.customer_address,
    c.customer_tax_number,
    c.customer_tax_office,
    org.name,
    org.slug,
    org.logo_url,
    org.primary_color,
    org.document_footer,
    org.contact_email,
    org.contact_phone,
    org.website_url,
    org.signature_stamp_url,
    c.signed_name,
    c.signed_at,
    c.signed_signature_data,
    c.signed_ip
  from public.crm_contracts c
  join public.crm_opportunities o on o.id = c.opportunity_id
  join public.organizations org on org.id = c.organization_id
  left join public.crm_proposals p on p.id = c.proposal_id
  where c.access_token_hash = encode(extensions.digest(public_token, 'sha256'), 'hex')
$function$
;

CREATE OR REPLACE FUNCTION public.get_public_crm_proposal(public_token text)
 RETURNS TABLE(id uuid, proposal_no text, title text, scope text, amount bigint, currency text, payment_plan text, payment_plan_type text, payment_schedule jsonb, created_at timestamp with time zone, valid_until date, estimated_delivery_date date, status text, customer_name text, contact_email text, contact_phone text, organization_name text, tax_status text, net_amount bigint, tax_amount bigint, gross_amount bigint, organization_logo_url text, organization_primary_color text, organization_document_footer text, organization_contact_email text, organization_contact_phone text, organization_website_url text, organization_signature_stamp_url text)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
  select p.id,p.proposal_no,p.title,p.scope,p.amount,p.currency,p.payment_plan,p.payment_plan_type,
    p.payment_schedule,p.created_at,p.valid_until,p.estimated_delivery_date,p.status,
    o.customer_name,o.contact_email,o.contact_phone,org.name,p.tax_status,p.net_amount,
    p.tax_amount,p.gross_amount,org.logo_url,org.primary_color,org.document_footer,
    org.contact_email,org.contact_phone,org.website_url,org.signature_stamp_url
  from public.crm_proposals p
  join public.crm_opportunities o on o.id=p.opportunity_id
  join public.organizations org on org.id=p.organization_id
  where p.access_token_hash=encode(extensions.digest(public_token,'sha256'),'hex')
$function$
;

CREATE OR REPLACE FUNCTION public.get_public_organization_branding(p_slug text)
 RETURNS TABLE(id uuid, slug text, name text, logo_url text, primary_color text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select id, slug, coalesce(display_name, name) as name, logo_url, primary_color
  from public.organizations
  where slug = lower(trim(p_slug))
  limit 1;
$function$
;

CREATE OR REPLACE FUNCTION public.get_public_organization_branding_by_id(p_org_id uuid)
 RETURNS TABLE(id uuid, slug text, name text, logo_url text, primary_color text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select id, slug, coalesce(display_name, name) as name, logo_url, primary_color
  from public.organizations
  where id = p_org_id
  limit 1;
$function$
;

CREATE OR REPLACE FUNCTION public.get_storefront_seller(p_tenant text DEFAULT 'arvoculture'::text)
 RETURNS TABLE(legal_name text, trade_name text, mersis_no text, tax_office text, tax_number text, trade_registry_no text, address_line text, address_district text, address_city text, address_country text, contact_email text, contact_phone text, whatsapp_number text, kep_address text, etbis_verified boolean, storefront_url text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select
    s.legal_name,
    coalesce(s.trade_name, o.name) as trade_name,
    s.mersis_no,
    s.tax_office,
    s.tax_number,
    s.trade_registry_no,
    s.address_line,
    s.address_district,
    s.address_city,
    coalesce(s.address_country, 'Türkiye') as address_country,
    s.contact_email,
    s.contact_phone,
    s.whatsapp_number,
    s.kep_address,
    coalesce(s.etbis_verified, false) as etbis_verified,
    s.storefront_url
  from public.arc_store_settings s
  join public.organizations o
    on o.id = s.organization_id
  where o.slug = p_tenant
  limit 1;
$function$
;

CREATE OR REPLACE FUNCTION public.guard_operation_customer_file()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  if tg_op = 'INSERT' then
    new.uploaded_by := (select auth.uid());
    new.created_at := now();
    new.deleted_at := null;
    new.deleted_by := null;
    return new;
  end if;

  if old.deleted_at is not null then
    raise exception 'Kaldırılan dosya değiştirilemez.' using errcode = 'check_violation';
  end if;
  if new.id is distinct from old.id
     or new.organization_id is distinct from old.organization_id
     or new.workflow_id is distinct from old.workflow_id
     or new.storage_path is distinct from old.storage_path
     or new.file_name is distinct from old.file_name
     or new.mime_type is distinct from old.mime_type
     or new.size_bytes is distinct from old.size_bytes
     or new.uploaded_by is distinct from old.uploaded_by
     or new.created_at is distinct from old.created_at then
    raise exception 'Dosyanın yalnızca erişim kuralı ve notu değiştirilebilir.' using errcode = 'check_violation';
  end if;
  if new.deleted_at is not null then
    new.deleted_at := now();
    new.deleted_by := (select auth.uid());
  else
    new.deleted_by := null;
  end if;
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.guard_operation_workflow_archive()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  if tg_op = 'INSERT' then
    if new.status = 'archived' then
      raise exception 'Yeni iş arşivde oluşturulamaz.' using errcode = 'check_violation';
    end if;
    new.archived_at := null;
    new.archived_by := null;
    return new;
  end if;

  if new.status = 'archived' and old.status is distinct from 'archived' then
    if old.status is distinct from 'completed' then
      raise exception 'Yalnızca tamamlanan işler arşivlenebilir.' using errcode = 'check_violation';
    end if;
    new.archived_at := coalesce(new.archived_at, now());
    new.archived_by := coalesce(new.archived_by, (select auth.uid()));
  elsif old.status = 'archived' and new.status is distinct from 'archived' then
    if new.status is distinct from 'completed' then
      raise exception 'Arşivdeki iş yalnızca tamamlandı durumuna geri alınabilir.' using errcode = 'check_violation';
    end if;
    new.archived_at := null;
    new.archived_by := null;
  elsif new.status is distinct from 'archived' then
    new.archived_at := null;
    new.archived_by := null;
  end if;
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.issue_crm_contract_link(target_contract_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SET search_path TO 'public', 'extensions'
AS $function$
declare
  c public.crm_contracts%rowtype;
  raw_token text;
begin
  select * into c
  from public.crm_contracts
  where id = target_contract_id
  for update;

  if c.id is null or not public.arvo_is_member(c.organization_id) then
    raise exception 'contract_not_found';
  end if;

  raw_token := coalesce(c.share_token, encode(extensions.gen_random_bytes(24), 'hex'));

  update public.crm_contracts
  set share_token = raw_token,
      access_token_hash = encode(extensions.digest(raw_token, 'sha256'), 'hex'),
      status = case when status = 'draft' then 'sent' else status end,
      sent_at = coalesce(sent_at, now()),
      updated_at = now()
  where id = c.id;

  return raw_token;
end
$function$
;

CREATE OR REPLACE FUNCTION public.issue_crm_proposal_link(target_proposal_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SET search_path TO 'public', 'extensions'
AS $function$
declare
  p public.crm_proposals%rowtype;
  raw_token text;
begin
  select * into p
  from public.crm_proposals
  where id = target_proposal_id
  for update;

  if p.id is null or not public.arvo_is_member(p.organization_id) then
    raise exception 'proposal_not_found';
  end if;

  raw_token := coalesce(p.share_token, encode(extensions.gen_random_bytes(24), 'hex'));

  update public.crm_proposals
  set share_token = raw_token,
      access_token_hash = encode(extensions.digest(raw_token, 'sha256'), 'hex'),
      status = case when status = 'draft' then 'sent' else status end,
      sent_at = coalesce(sent_at, now()),
      updated_at = now()
  where id = p.id;

  return raw_token;
end
$function$
;

CREATE OR REPLACE FUNCTION public.leave_message_channel(p_channel_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not exists (
    select 1 from public.message_channels
    where id = p_channel_id and channel_type = 'group'
  ) then
    raise exception 'Yalnızca grup sohbetlerinden ayrılabilirsiniz.';
  end if;
  delete from public.message_channel_members where channel_id = p_channel_id and user_id = (select auth.uid());
  delete from public.message_read_states where channel_id = p_channel_id and user_id = (select auth.uid());
  -- Son üye de ayrıldıysa grup kaldırılır
  if not exists (select 1 from public.message_channel_members where channel_id = p_channel_id) then
    delete from public.message_channels where id = p_channel_id and channel_type = 'group';
  end if;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.list_customer_file_messages(p_tracking_code text)
 RETURNS TABLE(sender_type text, sender_name text, body text, created_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select message.sender_type, message.sender_name, message.body, message.created_at
  from public.crm_contracts contract
  join public.customer_file_messages message on message.contract_id = contract.id
  where contract.tracking_code = upper(regexp_replace(trim(p_tracking_code), '[^A-Za-z0-9]', '', 'g'))
    and private.arvo_contract_tracking_open(contract.status, contract.tracking_open_before_signature)
  order by message.created_at asc
  limit 200;
$function$
;

CREATE OR REPLACE FUNCTION public.list_customer_portal_files(p_tracking_code text)
 RETURNS TABLE(id uuid, file_name text, mime_type text, size_bytes bigint, note text, created_at timestamp with time zone, locked boolean, total_amount bigint, paid_amount bigint, remaining_amount bigint, payment_url text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  with target as (
    select c.id, c.organization_id, c.workflow_id
    from public.crm_contracts c
    where c.tracking_code = upper(regexp_replace(trim(coalesce(p_tracking_code, '')), '[^A-Za-z0-9]', '', 'g'))
      and char_length(coalesce(c.tracking_code, '')) >= 6
      and c.status in ('signed', 'completed')
    limit 1
  ),
  pay as (
    select t.id as contract_id, s.*
    from target t
    cross join lateral private.arvo_contract_payment_summary(t.id) s
  ),
  link as (
    select i.payment_url
    from target t
    join public.payment_plans p on p.contract_id = t.id and p.organization_id = t.organization_id
    join public.payment_installments i on i.payment_plan_id = p.id
    where i.status in ('pending', 'overdue')
      and i.payment_url like 'https://%'
    order by i.due_date nulls last, i.installment_no
    limit 1
  )
  select
    f.id,
    f.file_name,
    f.mime_type,
    f.size_bytes,
    f.note,
    f.created_at,
    (f.access_rule = 'after_full_payment' and not coalesce(pay.settled, false)) as locked,
    pay.total_amount,
    pay.paid_amount,
    pay.remaining_amount,
    case when not coalesce(pay.settled, false) then (select link.payment_url from link) end as payment_url
  from target t
  join pay on pay.contract_id = t.id
  join public.operation_customer_files f
    on f.organization_id = t.organization_id
   and f.deleted_at is null
   -- İPTAL EDİLEN İŞİN DOSYALARI MÜŞTERİYE KAPALI. Eskiden yalnızca
   -- sözleşme durumuna bakılıyordu; iş "iptal" yapıldıktan sonra müşteri
   -- bütün portal dosyalarını görmeye ve indirmeye devam ediyordu.
   -- Arşiv kapsam dışı: "tamamlandı ve dosyalandı" demek, dosyalar durmalı.
   and not exists (
     select 1 from public.operation_workflows w
     where w.id = f.workflow_id and w.status = 'cancelled'
   )
   and (
     f.workflow_id = t.workflow_id
     or exists (
       select 1 from public.operation_workflows w
       where w.id = f.workflow_id and w.contract_id = t.id and w.organization_id = t.organization_id
     )
   )
  order by f.created_at desc
  limit 100;
$function$
;

CREATE OR REPLACE FUNCTION public.log_document_access(target_document_type text, target_document_id uuid, target_access_type text, target_ip text DEFAULT NULL::text, target_user_agent text DEFAULT NULL::text, target_referrer text DEFAULT NULL::text, target_metadata jsonb DEFAULT '{}'::jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  resolved_organization_id uuid;
  new_id uuid;
  cagiran_rol text := coalesce((select auth.jwt() ->> 'role'), '');
begin
  if target_document_type = 'proposal' then
    select organization_id into resolved_organization_id
    from public.crm_proposals where id = target_document_id;
  elsif target_document_type = 'contract' then
    select organization_id into resolved_organization_id
    from public.crm_contracts where id = target_document_id;
  else
    raise exception 'invalid_document_type';
  end if;

  if resolved_organization_id is null then raise exception 'document_not_found'; end if;
  if target_access_type not in ('panel_preview','public_view','pdf_print','share_link') then raise exception 'invalid_access_type'; end if;

  /*
    Eskiden kontrol "auth.uid() doluysa üye mi" diyordu: oturumsuz çağrı hiç
    denetlenmiyordu ve anonim biri belge kimliğini tutturduğunda başka kurumun
    denetim izine istediği kadar sahte kayıt yazabiliyordu. Jetonla gelen
    müşteri erişimleri zaten ayrı fonksiyonlarla (log_public_document_access*)
    kaydediliyor; burası panel içindir. Sunucu (servis rolü) serbest.
  */
  if cagiran_rol <> 'service_role' then
    if (select auth.uid()) is null then raise exception 'forbidden'; end if;
    if not public.arvo_is_member(resolved_organization_id) then raise exception 'forbidden'; end if;
  end if;

  insert into public.document_access_logs(
    organization_id, document_type, document_id, access_type, actor_user_id,
    access_ip, user_agent, referrer, metadata
  ) values (
    resolved_organization_id, target_document_type, target_document_id, target_access_type,
    (select auth.uid()), nullif(left(coalesce(target_ip,''),120),''),
    nullif(left(coalesce(target_user_agent,''),1000),''),
    nullif(left(coalesce(target_referrer,''),1000),''),
    coalesce(target_metadata,'{}'::jsonb)
  ) returning id into new_id;

  return new_id;
end
$function$
;

CREATE OR REPLACE FUNCTION public.log_public_document_access(public_token text, target_document_type text, target_access_type text DEFAULT 'public_view'::text, target_ip text DEFAULT NULL::text, target_user_agent text DEFAULT NULL::text, target_referrer text DEFAULT NULL::text, target_metadata jsonb DEFAULT '{}'::jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare
  resolved_document_id uuid;
  resolved_organization_id uuid;
  new_id uuid;
begin
  if target_document_type = 'proposal' then
    select id, organization_id
    into resolved_document_id, resolved_organization_id
    from public.crm_proposals
    where access_token_hash = encode(digest(public_token, 'sha256'), 'hex');
  elsif target_document_type = 'contract' then
    select id, organization_id
    into resolved_document_id, resolved_organization_id
    from public.crm_contracts
    where access_token_hash = encode(digest(public_token, 'sha256'), 'hex');
  else
    raise exception 'invalid_document_type';
  end if;

  if resolved_document_id is null then raise exception 'invalid_token'; end if;
  if target_access_type not in ('public_view','pdf_print','share_link') then raise exception 'invalid_access_type'; end if;

  insert into public.document_access_logs(
    organization_id, document_type, document_id, access_type, actor_user_id,
    access_ip, user_agent, referrer, metadata
  ) values (
    resolved_organization_id, target_document_type, resolved_document_id,
    target_access_type, auth.uid(),
    nullif(left(coalesce(target_ip,''),120),''),
    nullif(left(coalesce(target_user_agent,''),1000),''),
    nullif(left(coalesce(target_referrer,''),1000),''),
    coalesce(target_metadata,'{}'::jsonb)
  ) returning id into new_id;

  return new_id;
end
$function$
;

CREATE OR REPLACE FUNCTION public.log_public_document_access_by_token(target_document_type text, public_token text, target_access_type text DEFAULT 'public_view'::text, target_ip text DEFAULT NULL::text, target_user_agent text DEFAULT NULL::text, target_referrer text DEFAULT NULL::text, target_metadata jsonb DEFAULT '{}'::jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare
  resolved_document_id uuid;
  resolved_organization_id uuid;
  new_id uuid;
begin
  if target_document_type = 'proposal' then
    select id, organization_id
      into resolved_document_id, resolved_organization_id
    from public.crm_proposals
    where access_token_hash = encode(extensions.digest(public_token, 'sha256'), 'hex');
  elsif target_document_type = 'contract' then
    select id, organization_id
      into resolved_document_id, resolved_organization_id
    from public.crm_contracts
    where access_token_hash = encode(extensions.digest(public_token, 'sha256'), 'hex');
  else
    raise exception 'invalid_document_type';
  end if;

  if resolved_document_id is null then raise exception 'invalid_token'; end if;
  if target_access_type not in ('public_view','pdf_print','share_link') then raise exception 'invalid_access_type'; end if;

  insert into public.document_access_logs(
    organization_id, document_type, document_id, access_type, actor_user_id,
    access_ip, user_agent, referrer, metadata
  ) values (
    resolved_organization_id, target_document_type, resolved_document_id,
    target_access_type, null,
    nullif(left(coalesce(target_ip,''),120),''),
    nullif(left(coalesce(target_user_agent,''),1000),''),
    nullif(left(coalesce(target_referrer,''),1000),''),
    coalesce(target_metadata,'{}'::jsonb)
  ) returning id into new_id;

  return new_id;
end
$function$
;

CREATE OR REPLACE FUNCTION public.lookup_contract_by_tracking_code(p_org_slug text, p_tracking_code text)
 RETURNS TABLE(contract_no text, contract_title text, contract_status text, workflow_status text, last_update timestamp with time zone, total_amount bigint, paid_amount bigint, remaining_amount bigint, progress_percentage integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select
    c.contract_no,
    c.title,
    c.status,
    w.status as workflow_status,
    coalesce(w.updated_at, c.updated_at, c.created_at) as last_update,
    c.amount as total_amount,
    greatest(0, c.amount - coalesce(ledger.remaining, c.amount)) as paid_amount,
    greatest(0, coalesce(ledger.remaining, c.amount)) as remaining_amount,
    coalesce(steps.progress_percentage, 0) as progress_percentage
  from public.crm_contracts c
  join public.organizations o on o.id = c.organization_id
  left join public.operation_workflows w on w.contract_id = c.id
  left join lateral (
    select sum(case when ae.entry_type = 'debit' then ae.amount else -ae.amount end) as remaining
    from public.account_entries ae
    where ae.organization_id = c.organization_id and ae.party_id = c.party_id
  ) ledger on c.party_id is not null
  left join lateral (
    select round(100.0 * count(*) filter (where os.is_completed) / nullif(count(*), 0))::int as progress_percentage
    from public.operation_steps os
    where os.workflow_id = w.id
  ) steps on true
  -- DEĞİŞİKLİK: canlıdaki tanım, slug boş gelirse kurum filtresini tamamen
  -- kaldırıyordu (… is null or o.slug = …). Bu fonksiyon anon anahtarla
  -- çağrılabildiği için boş slug göndermek sorguyu bütün kiracılara açıyordu.
  -- Sayfa slug'ı her zaman yol parametresinden geçiriyor, yani bu kapının
  -- kapanması arayüzde hiçbir şeyi değiştirmez.
  where o.slug = nullif(lower(trim(coalesce(p_org_slug, ''))), '')
    and c.tracking_code = upper(regexp_replace(coalesce(p_tracking_code, ''), '[^A-Za-z0-9]', '', 'g'))
    and length(upper(regexp_replace(coalesce(p_tracking_code, ''), '[^A-Za-z0-9]', '', 'g'))) = 6
    and c.status in ('signed', 'completed')
  limit 1;
$function$
;

CREATE OR REPLACE FUNCTION public.lookup_contract_by_tracking_code_global(p_tracking_code text)
 RETURNS TABLE(contract_no text, contract_title text, contract_status text, workflow_status text, last_update timestamp with time zone, total_amount bigint, paid_amount bigint, remaining_amount bigint, progress_percentage integer, organization_name text, organization_logo_url text, organization_primary_color text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select
    c.contract_no,
    c.title,
    c.status,
    case when w.status = 'archived' then 'completed' else w.status end as workflow_status,
    coalesce(w.updated_at, c.updated_at, c.created_at) as last_update,
    c.amount as total_amount,
    coalesce(pay.paid_amount, 0) as paid_amount,
    coalesce(pay.remaining_amount, greatest(0, c.amount)) as remaining_amount,
    coalesce(steps.progress_percentage, 0) as progress_percentage,
    org.name,
    org.logo_url,
    org.primary_color
  from public.crm_contracts c
  join public.organizations org on org.id = c.organization_id
  left join public.operation_workflows w on w.contract_id = c.id
  left join lateral private.arvo_contract_payment_summary(c.id) pay on true
  left join lateral (
    select round(
      100.0 * count(*) filter (where os.is_completed) / nullif(count(*), 0)
    )::int as progress_percentage
    from public.operation_steps os
    where os.workflow_id = w.id
  ) steps on true
  where c.tracking_code = upper(regexp_replace(trim(coalesce(p_tracking_code, '')), '[^A-Za-z0-9]', '', 'g'))
    and private.arvo_contract_tracking_open(c.status, c.tracking_open_before_signature)
  limit 1;
$function$
;

CREATE OR REPLACE FUNCTION public.lookup_contracts_by_phone_suffix(p_org_slug text, p_phone_suffix text)
 RETURNS TABLE(contract_no text, contract_title text, contract_status text, workflow_status text, last_update timestamp with time zone, total_amount bigint, paid_amount bigint, remaining_amount bigint, progress_percentage integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select
    c.contract_no,
    c.title,
    c.status,
    case when w.status = 'archived' then 'completed' else w.status end as workflow_status,
    coalesce(w.updated_at, c.updated_at, c.created_at) as last_update,
    c.amount as total_amount,
    coalesce(paid.paid_amount, 0) as paid_amount,
    greatest(0, c.amount - coalesce(paid.paid_amount, 0)) as remaining_amount,
    coalesce(steps.progress_percentage, 0) as progress_percentage
  from public.crm_contracts c
  join public.organizations o on o.id = c.organization_id
  left join public.crm_opportunities op on op.id = c.opportunity_id
  left join public.operation_workflows w on w.contract_id = c.id
  left join lateral (
    select sum(pi.amount) as paid_amount
    from public.payment_plans pp
    join public.payment_installments pi on pi.payment_plan_id = pp.id
    where pp.contract_id = c.id and pi.status = 'paid'
  ) paid on true
  left join lateral (
    select round(
      100.0 * count(*) filter (where os.is_completed) / nullif(count(*), 0)
    )::int as progress_percentage
    from public.operation_steps os
    where os.workflow_id = w.id
  ) steps on true
  where o.slug = lower(trim(p_org_slug))
    and length(regexp_replace(coalesce(p_phone_suffix, ''), '[^0-9]', '', 'g')) = 4
    and regexp_replace(coalesce(op.contact_phone, ''), '[^0-9]', '', 'g')
        like '%' || regexp_replace(p_phone_suffix, '[^0-9]', '', 'g')
    and c.status in ('signed', 'completed')
  order by coalesce(w.updated_at, c.created_at) desc
  limit 20;
$function$
;

CREATE OR REPLACE FUNCTION public.mark_crm_contract_viewed(public_token text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
begin
  update public.crm_contracts
  set first_viewed_at=coalesce(first_viewed_at,now()), last_viewed_at=now(), view_count=view_count+1, updated_at=now()
  where access_token_hash=encode(extensions.digest(public_token,'sha256'),'hex');
end$function$
;

CREATE OR REPLACE FUNCTION public.mark_crm_proposal_viewed(public_token text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
begin
  update public.crm_proposals
  set first_viewed_at=coalesce(first_viewed_at,now()), last_viewed_at=now(), view_count=view_count+1,
      status=case when status='sent' then 'sent' else status end, updated_at=now()
  where access_token_hash=encode(extensions.digest(public_token,'sha256'),'hex');
end$function$
;

CREATE OR REPLACE FUNCTION public.mark_message_channel_read(p_channel_id uuid)
 RETURNS timestamp with time zone
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_org uuid;
  v_now timestamptz := now();
begin
  if (select auth.uid()) is null or not public.arvo_can_access_message_channel(p_channel_id) then
    raise exception 'Sohbet bulunamadı.';
  end if;
  select organization_id into v_org from public.message_channels where id = p_channel_id;
  insert into public.message_read_states (organization_id, channel_id, user_id, last_read_at, updated_at)
  values (v_org, p_channel_id, (select auth.uid()), v_now, v_now)
  on conflict (channel_id, user_id) do update
    set last_read_at = greatest(public.message_read_states.last_read_at, excluded.last_read_at),
        updated_at = excluded.updated_at;
  return v_now;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.next_document_number(target_organization_id uuid, target_document_type text, default_prefix text, target_date date DEFAULT CURRENT_DATE)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  seq_year integer := extract(year from target_date)::integer;
  next_value bigint;
  resolved_prefix text;
  resolved_padding integer;
begin
  if target_organization_id is null then raise exception 'organization_required'; end if;
  if trim(coalesce(target_document_type, '')) = '' then raise exception 'document_type_required'; end if;
  if trim(coalesce(default_prefix, '')) = '' then raise exception 'prefix_required'; end if;

  -- Oturumlu çağrı yalnızca kendi kurumunun sayacını ilerletebilir; sunucu
  -- (servis rolü, cron) eskisi gibi serbest. Eskiden hiçbir kontrol yoktu:
  -- herhangi bir kullanıcı başka kurumun numarasını tüketebiliyordu.
  if (select auth.uid()) is not null and not public.arvo_is_member(target_organization_id) then
    raise exception 'forbidden';
  end if;

  insert into public.document_number_sequences(
    organization_id, document_type, sequence_year, prefix, last_number, padding
  )
  values(
    target_organization_id,
    lower(trim(target_document_type)),
    seq_year,
    upper(trim(default_prefix)),
    1,
    6
  )
  on conflict (organization_id, document_type, sequence_year)
  do update set
    last_number = public.document_number_sequences.last_number + 1,
    updated_at = now()
  returning last_number, prefix, padding
  into next_value, resolved_prefix, resolved_padding;

  return resolved_prefix || '-' || seq_year::text || '-' || lpad(next_value::text, resolved_padding, '0');
end
$function$
;

CREATE OR REPLACE FUNCTION public.portal_payment_settled(p_workflow_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select coalesce((
    select pay.settled
    from public.operation_workflows w
    join public.crm_contracts c
      on c.organization_id = w.organization_id
     and (c.id = w.contract_id or c.workflow_id = w.id)
    cross join lateral private.arvo_contract_payment_summary(c.id) pay
    where w.id = p_workflow_id
    order by (c.id = w.contract_id) is true desc
    limit 1
  ), false);
$function$
;

CREATE OR REPLACE FUNCTION public.portal_workflow_payment_status(p_workflow_id uuid)
 RETURNS TABLE(has_contract boolean, settled boolean, total_amount bigint, paid_amount bigint, remaining_amount bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  target_org uuid;
  target_contract uuid;
  can_see_amounts boolean;
  pay record;
begin
  if p_workflow_id is null or not private.arvo_can_access_workflow(p_workflow_id) then
    return;
  end if;

  select w.organization_id,
         coalesce(
           (select c.id from public.crm_contracts c
             where c.id = w.contract_id and c.organization_id = w.organization_id),
           (select c.id from public.crm_contracts c
             where c.workflow_id = w.id and c.organization_id = w.organization_id
             order by c.created_at desc limit 1)
         )
    into target_org, target_contract
  from public.operation_workflows w
  where w.id = p_workflow_id;

  if target_contract is null then
    has_contract := false;
    settled := false;
    return next;
    return;
  end if;

  select * into pay from private.arvo_contract_payment_summary(target_contract);
  can_see_amounts := private.arvo_is_privileged_member(target_org);

  has_contract := true;
  settled := coalesce(pay.settled, false);
  total_amount := case when can_see_amounts then pay.total_amount end;
  paid_amount := case when can_see_amounts then pay.paid_amount end;
  remaining_amount := case when can_see_amounts then pay.remaining_amount end;
  return next;
end $function$
;

CREATE OR REPLACE FUNCTION public.provision_customer_organization(p_name text, p_slug text, p_sector text, p_plan_code text, p_owner_email text, p_custom_domain text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  new_organization_id uuid;
  new_invitation_id uuid;
  normalized_email text := lower(trim(p_owner_email));
begin
  if not (select private.is_arvoos_founder()) then raise exception 'Founder authorization required'; end if;
  if length(trim(p_name)) < 2 or length(trim(p_name)) > 160 then raise exception 'Invalid organization name'; end if;
  if p_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' then raise exception 'Invalid organization slug'; end if;
  if length(trim(p_sector)) < 2 or length(trim(p_sector)) > 80 then raise exception 'Invalid sector'; end if;
  if p_plan_code not in ('starter','professional','enterprise') then raise exception 'Invalid plan'; end if;
  if normalized_email !~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$' then raise exception 'Invalid owner email'; end if;

  insert into public.organizations (name, slug, sector, status, plan_code, custom_domain)
  values (trim(p_name), p_slug, trim(p_sector), 'trial'::public.organization_status, p_plan_code::public.plan_code, nullif(trim(p_custom_domain), ''))
  returning id into new_organization_id;

  insert into public.organization_modules (organization_id, module_code, is_enabled)
  select new_organization_id, module.code,
    case when p_plan_code = 'enterprise' then true
         when p_plan_code = 'professional' then module.code in ('crm','operations','finance','reporting')
         else module.code in ('crm','operations') end
  from public.arvo_modules module where module.is_active = true;

  insert into public.organization_invitations (organization_id, email, role, invited_by)
  values (new_organization_id, normalized_email, 'owner', (select auth.uid()))
  returning id into new_invitation_id;

  return jsonb_build_object('organization_id', new_organization_id, 'invitation_id', new_invitation_id, 'owner_email', normalized_email);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.rebuild_payment_plan_installments(p_plan_id uuid, p_installment_count integer, p_first_due_date date, p_interval_months integer DEFAULT 1)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_plan public.payment_plans%rowtype;
  v_base_amount bigint;
  v_remainder bigint;
  v_index integer;
begin
  select * into v_plan
  from public.payment_plans
  where id = p_plan_id;

  if v_plan.id is null then
    raise exception 'payment_plan_not_found';
  end if;
  -- Ödenmemiş taksitleri silip yeniden kurar; owner/admin işi (bkz. collect).
  if (select auth.uid()) is not null and not private.arvo_is_finance_manager(v_plan.organization_id) then
    raise exception 'forbidden';
  end if;
  if p_installment_count < 1 or p_installment_count > 36 then
    raise exception 'invalid_installment_count';
  end if;
  if p_interval_months < 1 or p_interval_months > 12 then
    raise exception 'invalid_interval';
  end if;
  if p_first_due_date is null then
    raise exception 'invalid_first_due_date';
  end if;
  if exists (
    select 1 from public.payment_installments
    where payment_plan_id = v_plan.id and status = 'paid'
  ) then
    raise exception 'payment_plan_has_paid_installments';
  end if;

  delete from public.payment_installments
  where payment_plan_id = v_plan.id;

  v_base_amount := v_plan.total_amount / p_installment_count;
  v_remainder := v_plan.total_amount - (v_base_amount * p_installment_count);

  for v_index in 1..p_installment_count loop
    insert into public.payment_installments (
      organization_id,
      payment_plan_id,
      installment_no,
      due_date,
      amount,
      status
    ) values (
      v_plan.organization_id,
      v_plan.id,
      v_index,
      (p_first_due_date + make_interval(months => (v_index - 1) * p_interval_months))::date,
      v_base_amount + case when v_index = p_installment_count then v_remainder else 0 end,
      'pending'
    );
  end loop;

  update public.payment_plans
  set status = 'active', updated_at = now()
  where id = v_plan.id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.resolve_organization_by_domain(p_domain text)
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select id from public.organizations
  where lower(custom_domain) = lower(trim(p_domain))
    and custom_domain_status = 'verified'
  limit 1;
$function$
;

CREATE OR REPLACE FUNCTION public.respond_to_crm_proposal(public_token text, decision text, p_ip text DEFAULT NULL::text)
 RETURNS TABLE(result_status text, contract_id uuid, contract_token text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare
  prop public.crm_proposals%rowtype;
  raw_token text;
  new_id uuid;
  next_no text;
begin
  if decision not in ('accept', 'reject') then
    raise exception 'invalid_decision';
  end if;
  select * into prop
  from public.crm_proposals
  where access_token_hash = encode(digest(public_token, 'sha256'), 'hex')
  for update;
  if prop.id is null then
    raise exception 'invalid_token';
  end if;
  if prop.superseded_by is not null then
    return query select 'superseded', null::uuid, null::text;
    return;
  end if;
  if prop.status in ('accepted', 'rejected', 'archived') then
    return query
    select
      prop.status,
      (select id from public.crm_contracts where proposal_id = prop.id),
      null::text;
    return;
  end if;
  if prop.valid_until is not null and prop.valid_until < current_date then
    update public.crm_proposals
    set status = 'expired', updated_at = now()
    where id = prop.id;
    return query select 'expired', null::uuid, null::text;
    return;
  end if;
  if decision = 'reject' then
    update public.crm_proposals
    set status = 'rejected', responded_at = now(), updated_at = now(), response_ip = p_ip
    where id = prop.id;
    update public.crm_opportunities
    set
      stage = 'lost',
      probability = 0,
      lost_reason = 'Teklif müşteri tarafından reddedildi',
      updated_at = now()
    where id = prop.opportunity_id;
    return query select 'rejected', null::uuid, null::text;
    return;
  end if;
  raw_token := encode(gen_random_bytes(24), 'hex');
  next_no := public.next_document_number(
    prop.organization_id,
    'contract',
    'SOZ',
    current_date
  );
  insert into public.crm_contracts(
    organization_id,
    opportunity_id,
    proposal_id,
    contract_no,
    title,
    scope,
    amount,
    currency,
    payment_plan,
    payment_plan_type,
    payment_schedule,
    status,
    access_token_hash,
    share_token,
    created_by
  ) values (
    prop.organization_id,
    prop.opportunity_id,
    prop.id,
    next_no,
    prop.title,
    prop.scope,
    prop.amount,
    prop.currency,
    prop.payment_plan,
    prop.payment_plan_type,
    prop.payment_schedule,
    'draft',
    encode(digest(raw_token, 'sha256'), 'hex'),
    raw_token,
    prop.created_by
  )
  returning id into new_id;
  update public.crm_proposals
  set status = 'accepted', responded_at = now(), updated_at = now(), response_ip = p_ip
  where id = prop.id;
  update public.crm_opportunities
  set stage = 'contract', probability = 70, updated_at = now()
  where id = prop.opportunity_id;
  return query select 'accepted', new_id, raw_token;
end
$function$
;

CREATE OR REPLACE FUNCTION public.review_bank_transfer_payment(p_payment_id uuid, p_decision text, p_review_note text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  payment public.organization_payment_requests%rowtype;
begin
  if not (select private.is_arvoos_founder()) then
    raise exception 'Founder authorization required';
  end if;
  if p_decision not in ('approved','rejected') then
    raise exception 'Invalid decision';
  end if;

  select * into payment
  from public.organization_payment_requests
  where id = p_payment_id and status = 'pending'
  for update;
  if not found then raise exception 'Pending payment not found'; end if;

  update public.organization_payment_requests
  set status = p_decision,
      review_note = nullif(trim(p_review_note), ''),
      reviewed_by = (select auth.uid()),
      reviewed_at = now(),
      updated_at = now()
  where id = payment.id;

  if p_decision = 'approved' then
    if coalesce(payment.product, 'arvoos') = 'arvoos' then
      perform private.arvo_activate_license_period(
        payment.organization_id, payment.plan_code, payment.amount, payment.currency, 'manual', (select auth.uid())
      );
    else
      perform private.arvo_activate_product_period(
        payment.organization_id, payment.product, payment.plan_code, payment.amount, payment.currency, 'manual', (select auth.uid())
      );
    end if;
  end if;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.seed_organization_demo_data(p_organization_id uuid, p_seed_crm boolean DEFAULT false, p_seed_operations boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$ declare actor_id uuid := (select auth.uid()); crm_count integer := 0; operation_count integer := 0; begin if not (select private.is_arvoos_founder()) then raise exception 'Founder authorization required'; end if; if p_seed_crm then insert into public.crm_requests (organization_id,title,customer_name,email,status,estimated_value,notes,created_by) values (p_organization_id,'Kurumsal tanıtım talebi','Demo Müşteri A','demo-a@example.com','new',25000,'ArvoOS demo kaydı',actor_id),(p_organization_id,'Süreç danışmanlığı','Demo Müşteri B','demo-b@example.com','qualified',45000,'ArvoOS demo kaydı',actor_id); get diagnostics crm_count = row_count; end if; if p_seed_operations then insert into public.operation_workflows (organization_id,title,customer_name,description,status,priority,start_date,due_date,created_by) values (p_organization_id,'Yeni müşteri onboarding','Demo Müşteri A','Örnek operasyon akışı','planned','high',current_date,current_date+14,actor_id),(p_organization_id,'Aylık hizmet teslimi','Demo Müşteri B','Örnek periyodik iş akışı','in_progress','normal',current_date,current_date+30,actor_id); get diagnostics operation_count = row_count; end if; return jsonb_build_object('crm',crm_count,'operations',operation_count); end; $function$
;

CREATE OR REPLACE FUNCTION public.seed_standard_operation_steps_trigger()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  perform public.add_standard_operation_steps(new.id, new.organization_id);
  return new;
end
$function$
;

CREATE OR REPLACE FUNCTION public.send_customer_file_message(p_tracking_code text, p_body text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  target_contract public.crm_contracts%rowtype;
  clean_body text := trim(p_body);
begin
  if char_length(clean_body) < 2 or char_length(clean_body) > 2000 then
    raise exception 'Mesaj 2 ile 2000 karakter arasında olmalıdır.';
  end if;

  select contract.* into target_contract
  from public.crm_contracts contract
  where contract.tracking_code = upper(regexp_replace(trim(p_tracking_code), '[^A-Za-z0-9]', '', 'g'))
    and private.arvo_contract_tracking_open(contract.status, contract.tracking_open_before_signature)
  limit 1;

  if target_contract.id is null then
    raise exception 'Dosya bulunamadı.';
  end if;

  if exists (
    select 1 from public.customer_file_messages recent
    where recent.contract_id = target_contract.id
      and recent.sender_type = 'customer'
      and recent.created_at > now() - interval '20 seconds'
  ) then
    raise exception 'Yeni bir mesaj göndermeden önce kısa bir süre bekleyin.';
  end if;

  insert into public.customer_file_messages (
    organization_id, contract_id, workflow_id, sender_type, sender_name, body
  ) values (
    target_contract.organization_id, target_contract.id, target_contract.workflow_id,
    'customer', 'Müşteri', clean_body
  );

  insert into public.notifications (
    organization_id, user_id, audience, category, title, message, action_url, metadata
  )
  select distinct
    target_contract.organization_id,
    recipient.user_id,
    'organization',
    'customer_message',
    'Müşteriden yeni mesaj',
    target_contract.contract_no || ' numaralı dosya için müşteri mesaj gönderdi.',
    case when target_contract.workflow_id is not null
      then '/panel/operations/' || target_contract.workflow_id::text
      else '/panel/crm/contracts/' || target_contract.id::text || '#musteri-mesajlari' end,
    jsonb_build_object('contract_id', target_contract.id, 'workflow_id', target_contract.workflow_id)
  from (
    select employee.user_id
    from public.operation_workflows workflow
    join public.hr_employees employee on employee.id = workflow.assigned_employee_id
    where workflow.id = target_contract.workflow_id
      and employee.user_id is not null
      and employee.employment_status = 'active'
    union
    select employee.user_id
    from public.crm_opportunities opportunity
    join public.hr_employees employee on employee.id = opportunity.assigned_employee_id
    where opportunity.id = target_contract.opportunity_id
      and target_contract.workflow_id is null
      and employee.user_id is not null
      and employee.employment_status = 'active'
      and exists (
        select 1 from public.organization_memberships m
        where m.organization_id = target_contract.organization_id and m.user_id = employee.user_id and m.is_active
      )
    union
    select membership.user_id
    from public.organization_memberships membership
    where membership.organization_id = target_contract.organization_id
      and membership.is_active = true
      and membership.role::text in ('owner', 'admin', 'manager')
  ) recipient
  where recipient.user_id is not null;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.send_management_announcement(p_organization_id uuid, p_title text, p_message text, p_target_user_id uuid DEFAULT NULL::uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  sender_membership public.organization_memberships%rowtype;
  sender_name text;
  inserted_count integer;
begin
  select membership.* into sender_membership
  from public.organization_memberships membership
  where membership.user_id = (select auth.uid())
    and membership.organization_id = p_organization_id
    and membership.is_active
    and membership.role in ('owner', 'admin', 'manager')
  order by membership.joined_at
  limit 1;

  if sender_membership.organization_id is null then raise exception 'Duyuru gönderme yetkiniz yok.'; end if;
  if length(trim(coalesce(p_title, ''))) not between 3 and 120 then raise exception 'Duyuru başlığı 3-120 karakter olmalı.'; end if;
  if length(trim(coalesce(p_message, ''))) not between 3 and 2000 then raise exception 'Duyuru metni 3-2000 karakter olmalı.'; end if;

  select employee.full_name into sender_name
  from public.hr_employees employee
  where employee.organization_id = sender_membership.organization_id
    and employee.user_id = (select auth.uid())
  limit 1;

  if p_target_user_id is not null and not exists (
    select 1 from public.organization_memberships target
    where target.organization_id = sender_membership.organization_id
      and target.user_id = p_target_user_id and target.is_active
  ) then raise exception 'Seçilen personel bu kurumda aktif değil.'; end if;

  insert into public.notifications (
    organization_id, user_id, audience, category, title, message, action_url, metadata
  )
  select
    sender_membership.organization_id,
    target.user_id,
    'organization',
    'management_announcement',
    trim(p_title),
    trim(p_message),
    '/panel/notifications?kategori=duyurular',
    jsonb_build_object('sent_by', (select auth.uid()), 'sender_name', coalesce(sender_name, 'Yönetim'))
  from public.organization_memberships target
  where target.organization_id = sender_membership.organization_id
    and target.is_active
    and (
      p_target_user_id is null
      or target.user_id = p_target_user_id
      or target.user_id = (select auth.uid())
    );

  get diagnostics inserted_count = row_count;
  return inserted_count;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.settle_arvoculture_storefront_order(p_order_id uuid, p_paid boolean, p_payment_reference text DEFAULT NULL::text, p_failure_reason text DEFAULT NULL::text)
 RETURNS text
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select public.arc_settle_storefront_order(p_order_id, p_paid, p_payment_reference, p_failure_reason);
$function$
;

CREATE OR REPLACE FUNCTION public.sign_crm_contract(public_token text, signer_name text, signer_ip text DEFAULT NULL::text, signer_user_agent text DEFAULT NULL::text)
 RETURNS TABLE(result_status text, workflow_id uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare
  con public.crm_contracts%rowtype;
  opp public.crm_opportunities%rowtype;
  proposal_schedule jsonb;
  org_slug text;
  template_key text;
  template_version text := '2.0';
  schedule_item jsonb;
  new_wf uuid;
  party uuid;
  plan uuid;
  invoice uuid;
  due_on date;
  installment_count integer := 0;
begin
  select * into con
  from public.crm_contracts
  where access_token_hash = encode(extensions.digest(public_token, 'sha256'), 'hex')
  for update;

  if con.id is null then
    raise exception 'invalid_token';
  end if;

  if con.workflow_id is not null then
    return query select
      case when con.status = 'signed' then 'signed' else 'workflow_exists' end,
      con.workflow_id;
    return;
  end if;

  if con.status = 'signed' then
    return query select 'signed', con.workflow_id;
    return;
  end if;

  -- Yalnızca taslak ve gönderilmiş sözleşme imzalanır. Eskiden durum hiç
  -- denetlenmiyordu: iptal edilmiş ya da reddedilmiş sözleşme eski
  -- bağlantıdan imzalanıp iş akışı, ödeme planı ve cari borç üretiyordu
  -- (kural yalnızca app/sozlesme/[token]/actions.ts içindeydi).
  if con.status not in ('draft', 'sent') then
    raise exception 'contract_closed';
  end if;

  if length(trim(coalesce(signer_name, ''))) < 2 then
    raise exception 'invalid_signer';
  end if;

  select * into opp
  from public.crm_opportunities
  where id = con.opportunity_id;

  select slug into org_slug
  from public.organizations
  where id = con.organization_id;

  template_key := case
    when regexp_replace(lower(coalesce(org_slug, '')), '[^a-z0-9]', '', 'g') like '%akademikmerkez%'
      then 'akademikmerkez_academic'
    else 'arvoos_general'
  end;

  select coalesce(payment_schedule, '[]'::jsonb)
  into proposal_schedule
  from public.crm_proposals
  where id = con.proposal_id;

  select id into party
  from public.account_parties
  where organization_id = con.organization_id
    and lower(name) = lower(opp.customer_name)
    and is_active = true
  order by created_at
  limit 1;

  if party is null then
    insert into public.account_parties(
      organization_id, party_type, name, email, phone, is_active, created_by
    ) values (
      con.organization_id, 'customer', opp.customer_name,
      opp.contact_email, opp.contact_phone, true, con.created_by
    ) returning id into party;
  end if;

  insert into public.operation_workflows(
    organization_id, contract_id, title, customer_name, description,
    status, priority, start_date, due_date, created_by
  ) values (
    con.organization_id, con.id, con.title, opp.customer_name, con.scope,
    'planned', 'normal', coalesce(con.start_date, current_date),
    con.due_date, con.created_by
  )
  on conflict (contract_id) where contract_id is not null
  do update set updated_at = now()
  returning id into new_wf;

  if not exists (
    select 1
    from public.operation_steps os
    where os.workflow_id = new_wf
  ) then
    insert into public.operation_steps(
      organization_id, workflow_id, title, sort_order
    ) values
      (con.organization_id, new_wf, 'Başlangıç ve kapsam kontrolü', 10),
      (con.organization_id, new_wf, 'Üretim / hizmet çalışması', 20),
      (con.organization_id, new_wf, 'Kalite kontrolü', 30),
      (con.organization_id, new_wf, 'Müşteri teslimi', 40);
  end if;

  due_on := coalesce(con.due_date, current_date + 30);

  insert into public.payment_plans(
    organization_id, contract_id, party_id, total_amount,
    currency, status, created_by
  ) values (
    con.organization_id, con.id, party, con.amount,
    con.currency, 'active', con.created_by
  ) returning id into plan;

  if jsonb_typeof(proposal_schedule) = 'array'
     and jsonb_array_length(proposal_schedule) > 0 then
    for schedule_item in select value from jsonb_array_elements(proposal_schedule)
    loop
      installment_count := installment_count + 1;
      insert into public.payment_installments(
        organization_id, payment_plan_id, installment_no,
        due_date, amount, status
      ) values (
        con.organization_id,
        plan,
        coalesce(nullif(schedule_item->>'sequence', '')::integer, installment_count),
        coalesce(nullif(schedule_item->>'due_date', '')::date, due_on),
        greatest(0, coalesce(nullif(schedule_item->>'amount', '')::bigint, 0)),
        'pending'
      );
    end loop;
  end if;

  if installment_count = 0 then
    insert into public.payment_installments(
      organization_id, payment_plan_id, installment_no,
      due_date, amount, status
    ) values (
      con.organization_id, plan, 1, due_on, con.amount, 'pending'
    );
  end if;

  insert into public.account_entries(
    organization_id, party_id, entry_type, source_type,
    amount, currency, description, reference_no,
    transaction_date, due_date, created_by
  ) values (
    con.organization_id, party, 'debit', 'crm_contract',
    con.amount, con.currency, con.title, con.contract_no,
    current_date, due_on, con.created_by
  );

  insert into public.finance_transactions(
    organization_id, transaction_type, status, title,
    counterparty, category, amount, currency,
    due_date, notes, created_by
  ) values (
    con.organization_id, 'income', 'planned', con.title,
    opp.customer_name, 'Sözleşme Tahsilatı', con.amount,
    con.currency, due_on,
    'Sözleşme ' || con.contract_no || ' üzerinden otomatik oluşturuldu.',
    con.created_by
  );

  insert into public.billing_invoices(
    organization_id, provider, status, currency,
    subtotal, tax, total, due_at
  ) values (
    con.organization_id, 'manual', 'draft', con.currency,
    con.amount, 0, con.amount, due_on::timestamptz
  ) returning id into invoice;

  update public.crm_contracts c
  set status = 'signed',
      signed_name = trim(signer_name),
      signed_at = now(),
      signed_ip = nullif(left(trim(coalesce(signer_ip, '')), 120), ''),
      signed_user_agent = nullif(left(trim(coalesce(signer_user_agent, '')), 1000), ''),
      acceptance_recorded_at = now(),
      contract_template_key = template_key,
      contract_template_version = template_version,
      workflow_id = new_wf,
      party_id = party,
      payment_plan_id = plan,
      invoice_id = invoice,
      updated_at = now()
  where c.id = con.id;

  update public.crm_opportunities o
  set stage = 'won', probability = 100, updated_at = now()
  where o.id = con.opportunity_id;

  return query select 'signed', new_wf;
end
$function$
;

CREATE OR REPLACE FUNCTION public.sign_crm_contract_v2(public_token text, signer_name text, signature_data text, signer_ip text DEFAULT NULL::text, signer_user_agent text DEFAULT NULL::text)
 RETURNS TABLE(result_status text, workflow_id uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare
  signed_result record;
  onceden_imzali boolean;
begin
  if signature_data is null
     or length(signature_data) < 200
     or length(signature_data) > 500000
     or signature_data not like 'data:image/png;base64,%' then
    raise exception 'invalid_signature';
  end if;

  select (c.status = 'signed' or c.signed_at is not null) into onceden_imzali
  from public.crm_contracts c
  where c.access_token_hash = encode(extensions.digest(public_token, 'sha256'), 'hex');

  select * into signed_result
  from public.sign_crm_contract(public_token, signer_name, signer_ip, signer_user_agent);

  -- Eskiden bu UPDATE koşulsuzdu: bağlantıyı ele geçiren biri imzalı
  -- sözleşmenin imza görselini değiştirebiliyordu (imzacı adı ve zamanı
  -- eskisi gibi kalıyor, yalnızca görsel değişiyordu).
  if not coalesce(onceden_imzali, false) then
    update public.crm_contracts
    set signed_signature_data = signature_data,
        updated_at = now()
    where access_token_hash = encode(extensions.digest(public_token, 'sha256'), 'hex');
  end if;

  return query select signed_result.result_status::text, signed_result.workflow_id::uuid;
end
$function$
;

CREATE OR REPLACE FUNCTION public.submit_public_lead(org_slug text, p_customer_name text, p_email text, p_phone text, p_service text, p_message text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_org_id uuid;
  v_owner uuid;
  v_request_id uuid;
  v_title text;
  v_notes text;
  v_source text;
begin
  if p_customer_name is null or char_length(trim(p_customer_name)) < 2 then
    raise exception 'invalid_name';
  end if;

  if (p_email is null or char_length(trim(p_email)) = 0)
     and (p_phone is null or char_length(trim(p_phone)) = 0) then
    raise exception 'contact_required';
  end if;

  -- Kaynak adı da buradan geliyor; ayrı sorgu yok.
  select o.id, coalesce(nullif(trim(o.custom_domain), ''), o.name)
    into v_org_id, v_source
  from public.organizations o
  where lower(o.slug) = lower(trim(org_slug))
    and o.status::text = 'active'
  limit 1;

  if v_org_id is null then
    raise exception 'organization_not_found';
  end if;

  -- Talep, kurumun sahibine (yoksa yöneticisine) atanır.
  select om.user_id
    into v_owner
  from public.organization_memberships om
  where om.organization_id = v_org_id
    and om.is_active = true
  order by
    case om.role::text
      when 'owner' then 0
      when 'admin' then 1
      else 2
    end,
    om.joined_at asc
  limit 1;

  if v_owner is null then
    raise exception 'organization_not_found';
  end if;

  -- Aynı e-postadan 2 dakika içinde ikinci talep kabul edilmez.
  if p_email is not null and trim(p_email) <> '' and exists (
    select 1
    from public.crm_requests r
    where r.organization_id = v_org_id
      and lower(r.email) = lower(trim(p_email))
      and r.created_at > now() - interval '2 minutes'
  ) then
    raise exception 'rate_limited';
  end if;

  v_title := left(coalesce(nullif(trim(p_service), ''), 'Web sitesi talebi'), 180);
  v_notes := trim(both E'\n' from format(
    E'Kaynak: %s — Teklif Al formu\nHizmet: %s\n\n%s',
    v_source,
    coalesce(nullif(trim(p_service), ''), 'Belirtilmedi'),
    coalesce(left(trim(p_message), 1500), '')
  ));

  insert into public.crm_requests (
    organization_id,
    title,
    customer_name,
    email,
    phone,
    status,
    notes,
    created_by
  ) values (
    v_org_id,
    v_title,
    left(trim(p_customer_name), 160),
    nullif(left(trim(p_email), 320), ''),
    nullif(left(trim(p_phone), 40), ''),
    'new',
    v_notes,
    v_owner
  )
  returning id into v_request_id;

  insert into public.crm_opportunities (
    organization_id,
    title,
    customer_name,
    contact_email,
    contact_phone,
    stage,
    estimated_value,
    probability,
    owner_user_id,
    source,
    notes,
    created_by,
    request_details
  ) values (
    v_org_id,
    v_title,
    left(trim(p_customer_name), 180),
    nullif(left(trim(p_email), 320), ''),
    nullif(left(trim(p_phone), 40), ''),
    'lead',
    0,
    10,
    v_owner,
    'WEB SİTESİ',
    v_notes,
    v_owner,
    jsonb_build_object(
      'source_request_id', v_request_id::text,
      'source', v_source,
      'service_type', coalesce(nullif(trim(p_service), ''), 'Belirtilmedi'),
      'scope', coalesce(left(trim(p_message), 1500), ''),
      'customer_type', 'Bireysel'
    )
  );

  return v_request_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.submit_site_lead(p_name text, p_email text, p_phone text, p_company text, p_interest text, p_message text, p_locale text, p_page text, p_ip_hash text, p_consent boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_name text := btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g'));
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_phone text := btrim(coalesce(p_phone, ''));
  v_phone_digits text := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
  v_company text := btrim(regexp_replace(coalesce(p_company, ''), '\s+', ' ', 'g'));
  v_interest text := lower(btrim(coalesce(p_interest, '')));
  v_message text := btrim(coalesce(p_message, ''));
  v_locale text := case when lower(coalesce(p_locale, '')) = 'en' then 'en' else 'tr' end;
  v_page text := left(btrim(coalesce(p_page, '')), 300);
  v_ip text := lower(btrim(coalesce(p_ip_hash, '')));
  v_org uuid;
  v_creator uuid;
  v_probability integer;
  v_previous text;
  v_reference text;
  v_opportunity uuid;
  v_title text;
  v_service text;
  v_now_local text := to_char(now() at time zone 'Europe/Istanbul', 'DD.MM.YYYY HH24:MI');
  v_alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_code text := '';
  i integer;
begin
  -- Aynı anda gelen çağrılar sayaçları tutarlı görsün (düşük hacim).
  perform pg_advisory_xact_lock(hashtext('public.submit_site_lead'));

  if v_ip !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('ok', false, 'code', 'invalid_request');
  end if;

  -- IP başına saatte 5 deneme (geçersiz denemeler dahil)
  if (select count(*) from public.site_lead_attempts a
      where a.ip_hash = v_ip and a.created_at > now() - interval '1 hour') >= 5 then
    return jsonb_build_object('ok', false, 'code', 'rate_limited');
  end if;
  -- Site genelinde saatte 50 kabul edilen talep (çöp istekler gerçek
  -- ziyaretçileri kilitleyemesin diye yalnızca kabul edilenler sayılır)
  if (select count(*) from public.site_lead_attempts a
      where a.outcome = 'accepted' and a.created_at > now() - interval '1 hour') >= 50 then
    return jsonb_build_object('ok', false, 'code', 'rate_limited');
  end if;

  delete from public.site_lead_attempts where created_at < now() - interval '2 days';

  -- Doğrulama
  v_reference := case
    when p_consent is distinct from true then 'consent_required'
    when char_length(v_name) not between 2 and 120 then 'invalid_name'
    when v_interest not in ('arvoos', 'arvolab', 'arc', 'services', 'other') then 'invalid_interest'
    when v_email = '' and v_phone = '' then 'contact_required'
    when v_email <> '' and (char_length(v_email) > 200
      or v_email !~ '^[a-z0-9._%+''-]+@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$') then 'invalid_email'
    when v_phone <> '' and (char_length(v_phone) > 40 or v_phone !~ '^[0-9 +().-]+$'
      or char_length(v_phone_digits) not between 7 and 20) then 'invalid_phone'
    when char_length(v_company) > 160 then 'invalid_company'
    when char_length(v_message) > 2000 then 'invalid_message'
    else null
  end;
  if v_reference is not null then
    insert into public.site_lead_attempts (ip_hash, interest, outcome)
    values (v_ip, left(v_interest, 20), v_reference);
    return jsonb_build_object('ok', false, 'code', v_reference);
  end if;

  -- Talebi alacak kurum: platform sahibi (slug 'arvo-os') ve ilk aktif sahibi
  select o.id into v_org
  from public.organizations o
  where o.slug = 'arvo-os' and o.status::text in ('active', 'trial')
  limit 1;
  if v_org is not null then
    select m.user_id into v_creator
    from public.organization_memberships m
    where m.organization_id = v_org and m.is_active and m.role::text = 'owner'
    order by m.joined_at
    limit 1;
  end if;
  if v_org is null or v_creator is null then
    insert into public.site_lead_attempts (ip_hash, interest, outcome)
    values (v_ip, v_interest, 'not_configured');
    return jsonb_build_object('ok', false, 'code', 'not_configured');
  end if;

  -- Tekrar: aynı e-posta + ilgi alanı 10 dk içinde → önceki referans
  if v_email <> '' then
    select a.reference into v_previous
    from public.site_lead_attempts a
    where a.outcome = 'accepted' and a.email_norm = v_email and a.interest = v_interest
      and a.created_at > now() - interval '10 minutes'
    order by a.created_at desc
    limit 1;
    if v_previous is not null then
      insert into public.site_lead_attempts (ip_hash, email_norm, interest, outcome, reference)
      values (v_ip, v_email, v_interest, 'duplicate', v_previous);
      return jsonb_build_object('ok', true, 'code', 'duplicate', 'reference', v_previous);
    end if;
  end if;

  for i in 1..6 loop
    v_code := v_code || substr(v_alphabet, 1 + floor(random() * length(v_alphabet))::int, 1);
  end loop;
  v_reference := 'WEB-' || v_code;

  v_title := case v_interest
    when 'arvoos' then 'Web sitesi · ArvoOS demo talebi'
    when 'arvolab' then 'Web sitesi · ArvoLab talebi'
    when 'arc' then 'Web sitesi · Arc talebi'
    when 'services' then 'Web sitesi · Hizmet talebi'
    else 'Web sitesi · Genel talep'
  end;
  v_service := case v_interest
    when 'arvoos' then 'ArvoOS demo'
    when 'arvolab' then 'ArvoLab'
    when 'arc' then 'Arc'
    when 'services' then 'Dijital hizmetler'
    else 'Genel iletişim'
  end;

  select s.probability into v_probability
  from public.organization_crm_stages s
  where s.organization_id = v_org and s.code = 'lead' and s.is_active
  limit 1;

  insert into public.crm_opportunities (
    organization_id, title, customer_name, contact_email, contact_phone,
    source, notes, estimated_value, probability, stage, request_details,
    assigned_employee_id, owner_user_id, created_by
  ) values (
    v_org,
    v_title,
    v_name,
    nullif(v_email, ''),
    nullif(v_phone, ''),
    'Web sitesi (arvo-os.com)',
    concat_ws(E'\n',
      'Web sitesi formu · Ref ' || v_reference,
      case when v_company <> '' then 'Şirket: ' || v_company end,
      'Dil: ' || case v_locale when 'en' then 'İngilizce' else 'Türkçe' end,
      case when v_page <> '' then 'Sayfa: ' || v_page end,
      'KVKK aydınlatma metni onayı: ' || v_now_local || ' (TSİ)'
    ),
    0,
    coalesce(v_probability, 10),
    'lead',
    jsonb_strip_nulls(jsonb_build_object(
      'customer_type', case when v_company <> '' then 'Kurumsal' else 'Bireysel' end,
      'service_type', v_service,
      'scope', nullif(v_message, ''),
      'company', nullif(v_company, ''),
      'channel', 'website',
      'site_reference', v_reference,
      'site_interest', v_interest,
      'site_locale', v_locale,
      'site_page', nullif(v_page, ''),
      'kvkk_consent_at', now()
    )),
    null,
    null,
    v_creator
  )
  returning id into v_opportunity;

  insert into public.site_lead_attempts (ip_hash, email_norm, interest, outcome, reference, opportunity_id)
  values (v_ip, nullif(v_email, ''), v_interest, 'accepted', v_reference, v_opportunity);

  -- Kayıt geçmişi (panelde "oluşturuldu" satırı)
  insert into public.activity_logs (organization_id, actor_user_id, action, entity_type, entity_id, metadata)
  values (v_org, null, 'create', 'crm_opportunity', v_opportunity::text,
    jsonb_build_object('opportunity_id', v_opportunity, 'changes', '[]'::jsonb,
      'note', 'Web sitesi formu · ' || v_name || ' · Ref ' || v_reference));

  -- Satış ekibine bildirim: aktif owner/admin/manager (atanmamış talebi
  -- yalnızca bu roller görebiliyor)
  insert into public.notifications (organization_id, user_id, audience, category, title, message, action_url, metadata)
  select distinct on (m.user_id)
    v_org,
    m.user_id,
    'organization',
    'site_lead',
    'Web sitesinden yeni talep',
    v_name || ' web sitesinden “' || v_service || '” talebi bıraktı (Ref ' || v_reference || ').',
    '/panel/crm/requests/' || v_opportunity::text,
    jsonb_build_object('opportunity_id', v_opportunity, 'reference', v_reference, 'interest', v_interest, 'locale', v_locale)
  from public.organization_memberships m
  where m.organization_id = v_org and m.is_active and m.role::text in ('owner', 'admin', 'manager');

  return jsonb_build_object('ok', true, 'code', 'ok', 'reference', v_reference);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.sync_contract_status_from_workflow()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  if new.status = 'completed' and old.status is distinct from new.status and new.contract_id is not null then
    update public.crm_contracts
    set status = 'completed', updated_at = now()
    where id = new.contract_id and status <> 'completed';
  end if;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.sync_contract_workflow_link()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  if new.contract_id is not null then
    update public.crm_contracts
    set workflow_id = new.id,
        updated_at = now()
    where id = new.contract_id
      and workflow_id is distinct from new.id;
  end if;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.sync_workflow_completion_from_steps()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  wf_id uuid;
  remaining_steps integer;
begin
  wf_id := coalesce(new.workflow_id, old.workflow_id);

  select count(*)
  into remaining_steps
  from public.operation_steps s
  where s.workflow_id = wf_id
    and coalesce(s.is_completed, false) = false;

  if remaining_steps = 0 and exists (select 1 from public.operation_steps s where s.workflow_id = wf_id) then
    update public.operation_workflows
    set status = 'completed', updated_at = now()
    where id = wf_id and status <> 'completed';
  end if;

  return coalesce(new, old);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.update_arvoculture_profile(p_full_name text, p_phone text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if auth.uid() is null then
    raise exception 'Oturum bulunamadı';
  end if;

  update auth.users
     set raw_user_meta_data =
           coalesce(raw_user_meta_data, '{}'::jsonb)
           || jsonb_build_object(
                'full_name', nullif(trim(p_full_name), ''),
                'phone', nullif(trim(p_phone), '')
              )
   where id = auth.uid();
end;
$function$
;

CREATE OR REPLACE FUNCTION public.update_crm_contract(target_contract_id uuid, contract_title text, contract_scope text, contract_amount bigint, contract_payment_plan text, contract_start_date date, contract_due_date date)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare c public.crm_contracts%rowtype;
begin
 select * into c from public.crm_contracts where id=target_contract_id;
 if c.id is null or not public.arvo_is_member(c.organization_id) then raise exception 'contract_not_found'; end if;
 if c.status in('signed','completed','cancelled') then raise exception 'contract_locked'; end if;
 update public.crm_contracts set title=contract_title,scope=contract_scope,amount=contract_amount,payment_plan=contract_payment_plan,start_date=contract_start_date,due_date=contract_due_date,updated_at=now() where id=c.id;
end$function$
;

CREATE OR REPLACE FUNCTION public.update_crm_proposal(target_proposal_id uuid, proposal_title text, proposal_scope text, proposal_amount bigint, proposal_payment_plan text, proposal_valid_until date)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare p public.crm_proposals%rowtype;
begin
 select * into p from public.crm_proposals where id=target_proposal_id;
 if p.id is null or not public.arvo_is_member(p.organization_id) then raise exception 'proposal_not_found'; end if;
 if p.status in('accepted','rejected','archived') then raise exception 'proposal_locked'; end if;
 update public.crm_proposals set title=proposal_title,scope=proposal_scope,amount=proposal_amount,payment_plan=proposal_payment_plan,valid_until=proposal_valid_until,updated_at=now() where id=p.id;
end$function$
;

CREATE OR REPLACE FUNCTION public.update_group_message_channel(p_channel_id uuid, p_name text, p_member_ids uuid[])
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_me uuid := (select auth.uid());
  v_org uuid;
  v_name text := btrim(coalesce(p_name, ''));
  v_members uuid[];
begin
  if not private.arvo_can_manage_group(p_channel_id) then
    raise exception 'Bu grubu düzenleme yetkiniz yok.';
  end if;
  select organization_id into v_org from public.message_channels where id = p_channel_id for update;
  if char_length(v_name) not between 2 and 80 then
    raise exception 'Grup adı 2 ile 80 karakter arasında olmalıdır.';
  end if;
  if exists (
    select 1 from public.message_channels
    where organization_id = v_org and lower(name) = lower(v_name) and id <> p_channel_id
  ) then
    raise exception 'Bu adla bir sohbet zaten var.';
  end if;
  update public.message_channels set name = v_name, updated_at = now() where id = p_channel_id;

  -- Düzenleyen her zaman üye kalır; yalnızca aktif kurum üyeleri eklenir
  v_members := array_append(coalesce(p_member_ids, '{}'::uuid[]), v_me);
  delete from public.message_channel_members
   where channel_id = p_channel_id and not (user_id = any (v_members));
  delete from public.message_read_states
   where channel_id = p_channel_id and not (user_id = any (v_members));
  insert into public.message_channel_members (channel_id, organization_id, user_id)
  select distinct p_channel_id, v_org, x.u
  from unnest(v_members) as x(u)
  where exists (
    select 1 from public.organization_memberships m
    where m.organization_id = v_org and m.user_id = x.u and m.is_active
  )
  on conflict (channel_id, user_id) do nothing;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.update_member_display_name(p_organization_id uuid, p_user_id uuid, p_full_name text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not exists (
    select 1 from public.organization_memberships m
    where m.organization_id = p_organization_id
      and m.user_id = (select auth.uid())
      and m.is_active
      and m.role in ('owner','admin')
  ) then
    raise exception 'Bu işlem için yetkiniz yok.';
  end if;

  if not exists (
    select 1 from public.organization_memberships target
    where target.organization_id = p_organization_id
      and target.user_id = p_user_id
  ) then
    raise exception 'Bu kullanıcı bu kuruma ait değil.';
  end if;

  insert into public.profiles (id, full_name, updated_at)
  values (p_user_id, nullif(trim(p_full_name), ''), now())
  on conflict (id) do update set full_name = excluded.full_name, updated_at = now();
end;
$function$
;

alter table public.account_entries alter column created_at set default now();

alter table public.account_entries alter column currency set default 'TRY'::text;

alter table public.account_entries alter column id set default gen_random_uuid();

alter table public.account_entries alter column source_type set default 'manual'::text;

alter table public.account_entries alter column transaction_date set default CURRENT_DATE;

alter table public.account_parties alter column created_at set default now();

alter table public.account_parties alter column id set default gen_random_uuid();

alter table public.account_parties alter column is_active set default true;

alter table public.account_parties alter column updated_at set default now();

alter table public.activity_logs alter column created_at set default now();

alter table public.activity_logs alter column metadata set default '{}'::jsonb;

alter table public.arc_collection_products alter column "position" set default 0;

alter table public.arc_collection_products alter column created_at set default now();

alter table public.arc_collections alter column created_at set default now();

alter table public.arc_collections alter column description set default ''::text;

alter table public.arc_collections alter column id set default gen_random_uuid();

alter table public.arc_collections alter column metadata set default '{}'::jsonb;

alter table public.arc_collections alter column seo_description set default ''::text;

alter table public.arc_collections alter column seo_title set default ''::text;

alter table public.arc_collections alter column source set default 'native'::text;

alter table public.arc_collections alter column status set default 'active'::text;

alter table public.arc_collections alter column updated_at set default now();

alter table public.arc_customer_addresses alter column created_at set default now();

alter table public.arc_customer_addresses alter column id set default gen_random_uuid();

alter table public.arc_customer_addresses alter column is_billing set default true;

alter table public.arc_customer_addresses alter column is_default set default false;

alter table public.arc_customer_addresses alter column is_shipping set default true;

alter table public.arc_customer_addresses alter column updated_at set default now();

alter table public.arc_customer_favourites alter column created_at set default now();

alter table public.arc_customer_favourites alter column id set default gen_random_uuid();

alter table public.arc_customer_favourites alter column user_id set default auth.uid();

alter table public.arc_discounts alter column combinable set default false;

alter table public.arc_discounts alter column created_at set default now();

alter table public.arc_discounts alter column id set default gen_random_uuid();

alter table public.arc_discounts alter column metadata set default '{}'::jsonb;

alter table public.arc_discounts alter column minimum_subtotal set default 0;

alter table public.arc_discounts alter column status set default 'draft'::text;

alter table public.arc_discounts alter column updated_at set default now();

alter table public.arc_discounts alter column usage_count set default 0;

alter table public.arc_discounts alter column value set default 0;

alter table public.arc_import_batches alter column created_at set default now();

alter table public.arc_import_batches alter column error_rows set default 0;

alter table public.arc_import_batches alter column id set default gen_random_uuid();

alter table public.arc_import_batches alter column imported_rows set default 0;

alter table public.arc_import_batches alter column metadata set default '{}'::jsonb;

alter table public.arc_import_batches alter column skipped_rows set default 0;

alter table public.arc_import_batches alter column source set default 'shopify'::text;

alter table public.arc_import_batches alter column status set default 'processing'::text;

alter table public.arc_import_batches alter column total_rows set default 0;

alter table public.arc_import_errors alter column created_at set default now();

alter table public.arc_import_errors alter column id set default gen_random_uuid();

alter table public.arc_import_errors alter column payload set default '{}'::jsonb;

alter table public.arc_inventory_movements alter column created_at set default now();

alter table public.arc_inventory_movements alter column id set default gen_random_uuid();

alter table public.arc_order_events alter column created_at set default now();

alter table public.arc_order_events alter column event_data set default '{}'::jsonb;

alter table public.arc_order_events alter column id set default gen_random_uuid();

alter table public.arc_order_items alter column id set default gen_random_uuid();

alter table public.arc_orders alter column created_at set default now();

alter table public.arc_orders alter column currency set default 'TRY'::text;

alter table public.arc_orders alter column id set default gen_random_uuid();

alter table public.arc_orders alter column metadata set default '{}'::jsonb;

alter table public.arc_orders alter column payment_status set default 'pending'::text;

alter table public.arc_orders alter column shipping set default 0;

alter table public.arc_orders alter column source set default 'native'::text;

alter table public.arc_orders alter column status set default 'pending'::text;

alter table public.arc_orders alter column subtotal set default 0;

alter table public.arc_orders alter column tax set default 0;

alter table public.arc_orders alter column total set default 0;

alter table public.arc_orders alter column updated_at set default now();

alter table public.arc_payment_orders alter column created_at set default now();

alter table public.arc_payment_orders alter column currency set default 'TL'::text;

alter table public.arc_payment_orders alter column id set default gen_random_uuid();

alter table public.arc_payment_orders alter column payment_method set default 'card'::text;

alter table public.arc_payment_orders alter column paytr_test_mode set default false;

alter table public.arc_payment_orders alter column status set default 'awaiting_payment'::text;

alter table public.arc_payment_orders alter column updated_at set default now();

alter table public.arc_product_variants alter column allow_backorder set default true;

alter table public.arc_product_variants alter column attributes set default '{}'::jsonb;

alter table public.arc_product_variants alter column created_at set default now();

alter table public.arc_product_variants alter column currency set default 'TRY'::text;

alter table public.arc_product_variants alter column id set default gen_random_uuid();

alter table public.arc_product_variants alter column price set default 0;

alter table public.arc_product_variants alter column stock set default 0;

alter table public.arc_product_variants alter column updated_at set default now();

alter table public.arc_products alter column created_at set default now();

alter table public.arc_products alter column description set default ''::text;

alter table public.arc_products alter column id set default gen_random_uuid();

alter table public.arc_products alter column metadata set default '{}'::jsonb;

alter table public.arc_products alter column source set default 'native'::text;

alter table public.arc_products alter column status set default 'draft'::text;

alter table public.arc_products alter column updated_at set default now();

alter table public.arc_return_requests alter column created_at set default now();

alter table public.arc_return_requests alter column id set default gen_random_uuid();

alter table public.arc_return_requests alter column items set default '[]'::jsonb;

alter table public.arc_return_requests alter column status set default 'beklemede'::text;

alter table public.arc_return_requests alter column updated_at set default now();

alter table public.arc_store_settings alter column accent_color set default '#6f9548'::text;

alter table public.arc_store_settings alter column address_country set default 'Türkiye'::text;

alter table public.arc_store_settings alter column bank_transfer_discount_percent set default 3;

alter table public.arc_store_settings alter column bank_transfer_enabled set default false;

alter table public.arc_store_settings alter column created_at set default now();

alter table public.arc_store_settings alter column currency set default 'TRY'::text;

alter table public.arc_store_settings alter column default_tax_rate set default 20;

alter table public.arc_store_settings alter column domain_status set default 'not_configured'::text;

alter table public.arc_store_settings alter column etbis_verified set default false;

alter table public.arc_store_settings alter column free_shipping_threshold set default 200000;

alter table public.arc_store_settings alter column locale set default 'tr-TR'::text;

alter table public.arc_store_settings alter column low_stock_threshold set default 5;

alter table public.arc_store_settings alter column order_prefix set default 'AC'::text;

alter table public.arc_store_settings alter column panel_domain_status set default 'not_configured'::text;

alter table public.arc_store_settings alter column paytr_enabled set default false;

alter table public.arc_store_settings alter column paytr_max_installment set default 0;

alter table public.arc_store_settings alter column paytr_no_installment set default false;

alter table public.arc_store_settings alter column paytr_test_mode set default true;

alter table public.arc_store_settings alter column primary_color set default '#002045'::text;

alter table public.arc_store_settings alter column shipping_fee set default 12000;

alter table public.arc_store_settings alter column updated_at set default now();

alter table public.arc_store_themes alter column config set default '{}'::jsonb;

alter table public.arc_store_themes alter column created_at set default now();

alter table public.arc_store_themes alter column id set default gen_random_uuid();

alter table public.arc_store_themes alter column updated_at set default now();

alter table public.arc_store_themes alter column version set default 1;

alter table public.arc_suppliers alter column active set default true;

alter table public.arc_suppliers alter column brand_override set default 'ArvoCulture'::text;

alter table public.arc_suppliers alter column created_at set default now();

alter table public.arc_suppliers alter column id set default gen_random_uuid();

alter table public.arc_suppliers alter column margin_percent set default 40;

alter table public.arc_suppliers alter column publish_directly set default false;

alter table public.arc_suppliers alter column round_to_kurus set default 90;

alter table public.arc_suppliers alter column service_fee set default 0;

alter table public.arc_suppliers alter column shipping_markup set default 6000;

alter table public.arc_suppliers alter column stock_buffer set default 5;

alter table public.arc_suppliers alter column sync_cursor set default 0;

alter table public.arc_suppliers alter column sync_total set default 0;

alter table public.arc_suppliers alter column updated_at set default now();

alter table public.arvo_modules alter column is_active set default true;

alter table public.arvo_modules alter column sort_order set default 0;

alter table public.bank_transactions alter column created_at set default now();

alter table public.bank_transactions alter column currency set default 'TRY'::text;

alter table public.bank_transactions alter column id set default gen_random_uuid();

alter table public.bank_transactions alter column reconciliation_status set default 'unmatched'::text;

alter table public.bank_transactions alter column transaction_date set default CURRENT_DATE;

alter table public.bank_transactions alter column updated_at set default now();

alter table public.billing_customers alter column billing_address set default '{}'::jsonb;

alter table public.billing_customers alter column created_at set default now();

alter table public.billing_customers alter column provider set default 'manual'::text;

alter table public.billing_customers alter column updated_at set default now();

alter table public.billing_events alter column created_at set default now();

alter table public.billing_events alter column id set default gen_random_uuid();

alter table public.billing_events alter column payload set default '{}'::jsonb;

alter table public.billing_invoices alter column created_at set default now();

alter table public.billing_invoices alter column currency set default 'TRY'::text;

alter table public.billing_invoices alter column id set default gen_random_uuid();

alter table public.billing_invoices alter column product set default 'arvoos'::text;

alter table public.billing_invoices alter column provider set default 'manual'::text;

alter table public.billing_invoices alter column status set default 'draft'::text;

alter table public.billing_invoices alter column subtotal set default 0;

alter table public.billing_invoices alter column tax set default 0;

alter table public.billing_invoices alter column total set default 0;

alter table public.billing_subscriptions alter column "interval" set default 'month'::text;

alter table public.billing_subscriptions alter column cancel_at_period_end set default false;

alter table public.billing_subscriptions alter column created_at set default now();

alter table public.billing_subscriptions alter column currency set default 'TRY'::text;

alter table public.billing_subscriptions alter column id set default gen_random_uuid();

alter table public.billing_subscriptions alter column product set default 'arvoos'::text;

alter table public.billing_subscriptions alter column provider set default 'manual'::text;

alter table public.billing_subscriptions alter column status set default 'trialing'::text;

alter table public.billing_subscriptions alter column unit_amount set default 0;

alter table public.billing_subscriptions alter column updated_at set default now();

alter table public.contract_cost_items alter column category set default 'Dış hizmet'::text;

alter table public.contract_cost_items alter column cost_date set default CURRENT_DATE;

alter table public.contract_cost_items alter column created_at set default now();

alter table public.contract_cost_items alter column id set default gen_random_uuid();

alter table public.contract_cost_items alter column status set default 'planned'::text;

alter table public.contract_cost_items alter column updated_at set default now();

alter table public.crm_appointments alter column created_at set default now();

alter table public.crm_appointments alter column id set default gen_random_uuid();

alter table public.crm_appointments alter column status set default 'planned'::text;

alter table public.crm_appointments alter column updated_at set default now();

alter table public.crm_automation_runs alter column created_at set default now();

alter table public.crm_automation_runs alter column processed_at set default now();

alter table public.crm_contract_addenda alter column created_at set default now();

alter table public.crm_contract_addenda alter column id set default gen_random_uuid();

alter table public.crm_contract_addenda alter column payment_dates set default '[]'::jsonb;

alter table public.crm_contract_addenda alter column status set default 'sent'::text;

alter table public.crm_contract_addenda alter column work_plan set default '[]'::jsonb;

alter table public.crm_contracts alter column amount set default 0;

alter table public.crm_contracts alter column created_at set default now();

alter table public.crm_contracts alter column currency set default 'TRY'::text;

alter table public.crm_contracts alter column id set default gen_random_uuid();

alter table public.crm_contracts alter column service_cost set default 0;

alter table public.crm_contracts alter column service_cost_status set default 'planned'::text;

alter table public.crm_contracts alter column status set default 'draft'::text;

alter table public.crm_contracts alter column tracking_code set default generate_contract_tracking_code();

alter table public.crm_contracts alter column tracking_open_before_signature set default false;

alter table public.crm_contracts alter column updated_at set default now();

alter table public.crm_contracts alter column view_count set default 0;

alter table public.crm_internal_comments alter column created_at set default now();

alter table public.crm_internal_comments alter column id set default gen_random_uuid();

alter table public.crm_opportunities alter column created_at set default now();

alter table public.crm_opportunities alter column estimated_value set default 0;

alter table public.crm_opportunities alter column id set default gen_random_uuid();

alter table public.crm_opportunities alter column probability set default 10;

alter table public.crm_opportunities alter column request_details set default '{}'::jsonb;

alter table public.crm_opportunities alter column stage set default 'lead'::text;

alter table public.crm_opportunities alter column updated_at set default now();

alter table public.crm_proposals alter column amount set default 0;

alter table public.crm_proposals alter column created_at set default now();

alter table public.crm_proposals alter column currency set default 'TRY'::text;

alter table public.crm_proposals alter column gross_amount set default 0;

alter table public.crm_proposals alter column id set default gen_random_uuid();

alter table public.crm_proposals alter column net_amount set default 0;

alter table public.crm_proposals alter column payment_plan_type set default 'cash'::text;

alter table public.crm_proposals alter column payment_schedule set default '[]'::jsonb;

alter table public.crm_proposals alter column revision_no set default 0;

alter table public.crm_proposals alter column status set default 'draft'::text;

alter table public.crm_proposals alter column tax_amount set default 0;

alter table public.crm_proposals alter column tax_rate set default 20;

alter table public.crm_proposals alter column tax_status set default 'excluded'::text;

alter table public.crm_proposals alter column updated_at set default now();

alter table public.crm_proposals alter column view_count set default 0;

alter table public.crm_requests alter column created_at set default now();

alter table public.crm_requests alter column estimated_value set default 0;

alter table public.crm_requests alter column id set default gen_random_uuid();

alter table public.crm_requests alter column status set default 'new'::text;

alter table public.crm_requests alter column updated_at set default now();

alter table public.customer_file_messages alter column created_at set default now();

alter table public.customer_file_messages alter column id set default gen_random_uuid();

alter table public.document_access_logs alter column created_at set default now();

alter table public.document_access_logs alter column id set default gen_random_uuid();

alter table public.document_access_logs alter column metadata set default '{}'::jsonb;

alter table public.document_number_sequences alter column last_number set default 0;

alter table public.document_number_sequences alter column padding set default 6;

alter table public.document_number_sequences alter column updated_at set default now();

alter table public.finance_transactions alter column created_at set default now();

alter table public.finance_transactions alter column currency set default 'TRY'::text;

alter table public.finance_transactions alter column id set default gen_random_uuid();

alter table public.finance_transactions alter column status set default 'planned'::text;

alter table public.finance_transactions alter column updated_at set default now();

alter table public.hr_confidentiality_agreements alter column created_at set default now();

alter table public.hr_confidentiality_agreements alter column id set default gen_random_uuid();

alter table public.hr_confidentiality_agreements alter column status set default 'pending'::text;

alter table public.hr_confidentiality_agreements alter column updated_at set default now();

alter table public.hr_departments alter column created_at set default now();

alter table public.hr_departments alter column id set default gen_random_uuid();

alter table public.hr_departments alter column is_active set default true;

alter table public.hr_departments alter column updated_at set default now();

alter table public.hr_employee_commission_rates alter column commission_rate set default 0;

alter table public.hr_employee_commission_rates alter column id set default gen_random_uuid();

alter table public.hr_employee_commission_rates alter column operation_commission_rate set default 0;

alter table public.hr_employee_commission_rates alter column valid_from set default now();

alter table public.hr_employee_documents alter column created_at set default now();

alter table public.hr_employee_documents alter column id set default gen_random_uuid();

alter table public.hr_employees alter column can_receive_sales_requests set default false;

alter table public.hr_employees alter column commission_rate set default 0;

alter table public.hr_employees alter column created_at set default now();

alter table public.hr_employees alter column employment_status set default 'active'::text;

alter table public.hr_employees alter column employment_type set default 'full_time'::text;

alter table public.hr_employees alter column id set default gen_random_uuid();

alter table public.hr_employees alter column operation_commission_rate set default 0;

alter table public.hr_employees alter column updated_at set default now();

alter table public.hr_leave_requests alter column created_at set default now();

alter table public.hr_leave_requests alter column id set default gen_random_uuid();

alter table public.hr_leave_requests alter column status set default 'pending'::text;

alter table public.hr_leave_requests alter column updated_at set default now();

alter table public.hr_operation_commissions alter column accrued_at set default now();

alter table public.hr_operation_commissions alter column base_amount set default 0;

alter table public.hr_operation_commissions alter column commission_amount set default 0;

alter table public.hr_operation_commissions alter column created_at set default now();

alter table public.hr_operation_commissions alter column id set default gen_random_uuid();

alter table public.hr_operation_commissions alter column status set default 'accrued'::text;

alter table public.hr_sales_commissions alter column accrued_at set default now();

alter table public.hr_sales_commissions alter column created_at set default now();

alter table public.hr_sales_commissions alter column id set default gen_random_uuid();

alter table public.hr_sales_commissions alter column status set default 'accrued'::text;

alter table public.internal_messages alter column created_at set default now();

alter table public.internal_messages alter column id set default gen_random_uuid();

alter table public.message_channel_members alter column created_at set default now();

alter table public.message_channels alter column channel_type set default 'channel'::text;

alter table public.message_channels alter column created_at set default now();

alter table public.message_channels alter column id set default gen_random_uuid();

alter table public.message_channels alter column is_private set default false;

alter table public.message_channels alter column updated_at set default now();

alter table public.message_read_states alter column last_read_at set default now();

alter table public.message_read_states alter column updated_at set default now();

alter table public.notification_user_dismissals alter column dismissed_at set default now();

alter table public.notification_user_reads alter column read_at set default now();

alter table public.notifications alter column created_at set default now();

alter table public.notifications alter column id set default gen_random_uuid();

alter table public.notifications alter column metadata set default '{}'::jsonb;

alter table public.operation_customer_file_downloads alter column created_at set default now();

alter table public.operation_customer_file_downloads alter column id set default gen_random_uuid();

alter table public.operation_customer_files alter column access_rule set default 'after_full_payment'::text;

alter table public.operation_customer_files alter column created_at set default now();

alter table public.operation_customer_files alter column id set default gen_random_uuid();

alter table public.operation_steps alter column created_at set default now();

alter table public.operation_steps alter column id set default gen_random_uuid();

alter table public.operation_steps alter column is_completed set default false;

alter table public.operation_steps alter column sort_order set default 0;

alter table public.operation_workflow_comments alter column created_at set default now();

alter table public.operation_workflow_comments alter column id set default gen_random_uuid();

alter table public.operation_workflows alter column created_at set default now();

alter table public.operation_workflows alter column id set default gen_random_uuid();

alter table public.operation_workflows alter column priority set default 'normal'::text;

alter table public.operation_workflows alter column status set default 'planned'::text;

alter table public.operation_workflows alter column updated_at set default now();

alter table public.organization_bank_accounts alter column created_at set default now();

alter table public.organization_bank_accounts alter column currency set default 'TRY'::text;

alter table public.organization_bank_accounts alter column id set default gen_random_uuid();

alter table public.organization_bank_accounts alter column is_active set default true;

alter table public.organization_bank_accounts alter column opening_balance set default 0;

alter table public.organization_bank_accounts alter column updated_at set default now();

alter table public.organization_crm_stages alter column is_active set default true;

alter table public.organization_crm_stages alter column is_terminal set default false;

alter table public.organization_crm_stages alter column probability set default 0;

alter table public.organization_crm_stages alter column sort_order set default 0;

alter table public.organization_form_templates alter column created_at set default now();

alter table public.organization_form_templates alter column id set default gen_random_uuid();

alter table public.organization_form_templates alter column is_active set default true;

alter table public.organization_form_templates alter column is_default set default false;

alter table public.organization_form_templates alter column schema_json set default '{}'::jsonb;

alter table public.organization_form_templates alter column updated_at set default now();

alter table public.organization_invitations alter column created_at set default now();

alter table public.organization_invitations alter column expires_at set default (now() + '7 days'::interval);

alter table public.organization_invitations alter column id set default gen_random_uuid();

alter table public.organization_invitations alter column role set default 'owner'::membership_role;

alter table public.organization_invitations alter column status set default 'pending'::text;

alter table public.organization_invitations alter column updated_at set default now();

alter table public.organization_licenses alter column ai_credits_used set default 0;

alter table public.organization_licenses alter column created_at set default now();

alter table public.organization_licenses alter column license_status set default 'trialing'::text;

alter table public.organization_licenses alter column module_limits set default '{}'::jsonb;

alter table public.organization_licenses alter column trial_started_at set default now();

alter table public.organization_licenses alter column updated_at set default now();

alter table public.organization_memberships alter column is_active set default true;

alter table public.organization_memberships alter column joined_at set default now();

alter table public.organization_memberships alter column permissions set default '{}'::jsonb;

alter table public.organization_memberships alter column role set default 'member'::membership_role;

alter table public.organization_memberships alter column role_from_management set default false;

alter table public.organization_modules alter column configuration set default '{}'::jsonb;

alter table public.organization_modules alter column enabled_at set default now();

alter table public.organization_modules alter column is_enabled set default true;

alter table public.organization_onboarding alter column created_at set default now();

alter table public.organization_onboarding alter column current_step set default 1;

alter table public.organization_onboarding alter column primary_color set default '#111827'::text;

alter table public.organization_onboarding alter column updated_at set default now();

alter table public.organization_payment_providers alter column created_at set default now();

alter table public.organization_payment_providers alter column is_enabled set default true;

alter table public.organization_payment_providers alter column updated_at set default now();

alter table public.organization_payment_requests alter column created_at set default now();

alter table public.organization_payment_requests alter column currency set default 'TRY'::text;

alter table public.organization_payment_requests alter column id set default gen_random_uuid();

alter table public.organization_payment_requests alter column payment_method set default 'bank_transfer'::text;

alter table public.organization_payment_requests alter column product set default 'arvoos'::text;

alter table public.organization_payment_requests alter column status set default 'pending'::text;

alter table public.organization_payment_requests alter column updated_at set default now();

alter table public.organization_product_licenses alter column created_at set default now();

alter table public.organization_product_licenses alter column integrated set default true;

alter table public.organization_product_licenses alter column limits set default '{}'::jsonb;

alter table public.organization_product_licenses alter column status set default 'inactive'::text;

alter table public.organization_product_licenses alter column updated_at set default now();

alter table public.organization_vertical_profiles alter column brand_config set default '{}'::jsonb;

alter table public.organization_vertical_profiles alter column created_at set default now();

alter table public.organization_vertical_profiles alter column feature_flags set default '{}'::jsonb;

alter table public.organization_vertical_profiles alter column relationship_type set default 'customer'::text;

alter table public.organization_vertical_profiles alter column updated_at set default now();

alter table public.organization_vertical_profiles alter column vertical_code set default 'general'::text;

alter table public.organizations alter column created_at set default now();

alter table public.organizations alter column id set default gen_random_uuid();

alter table public.organizations alter column kind set default 'customer'::text;

alter table public.organizations alter column primary_color set default '#183f31'::text;

alter table public.organizations alter column provisioning_state set default 'creating'::text;

alter table public.organizations alter column sector set default 'general'::text;

alter table public.organizations alter column status set default 'trial'::organization_status;

alter table public.organizations alter column updated_at set default now();

alter table public.payment_installments alter column created_at set default now();

alter table public.payment_installments alter column id set default gen_random_uuid();

alter table public.payment_installments alter column status set default 'pending'::text;

alter table public.payment_links alter column created_at set default now();

alter table public.payment_links alter column provider set default 'paytr'::text;

alter table public.payment_links alter column purpose set default 'installment'::text;

alter table public.payment_links alter column status set default 'active'::text;

alter table public.payment_plans alter column created_at set default now();

alter table public.payment_plans alter column currency set default 'TRY'::text;

alter table public.payment_plans alter column id set default gen_random_uuid();

alter table public.payment_plans alter column status set default 'active'::text;

alter table public.payment_plans alter column updated_at set default now();

alter table public.payment_provider_events alter column id set default gen_random_uuid();

alter table public.payment_provider_events alter column payload set default '{}'::jsonb;

alter table public.payment_provider_events alter column received_at set default now();

alter table public.payment_provider_events alter column test_mode set default false;

alter table public.plans alter column created_at set default now();

alter table public.plans alter column is_active set default true;

alter table public.platform_bank_accounts alter column created_at set default now();

alter table public.platform_bank_accounts alter column currency set default 'TRY'::text;

alter table public.platform_bank_accounts alter column id set default gen_random_uuid();

alter table public.platform_bank_accounts alter column is_active set default true;

alter table public.platform_bank_accounts alter column sort_order set default 0;

alter table public.platform_bank_accounts alter column updated_at set default now();

alter table public.platform_subscription_requests alter column created_at set default now();

alter table public.platform_subscription_requests alter column currency set default 'TRY'::text;

alter table public.platform_subscription_requests alter column id set default gen_random_uuid();

alter table public.platform_subscription_requests alter column requested set default '{}'::jsonb;

alter table public.platform_subscription_requests alter column status set default 'pending'::text;

alter table public.platform_subscription_requests alter column updated_at set default now();

alter table public.product_plans alter column trial_days set default 14;

alter table public.product_plans alter column updated_at set default now();

alter table public.product_subscribers alter column created_at set default now();

alter table public.product_subscribers alter column id set default gen_random_uuid();

alter table public.product_subscribers alter column status set default 'trialing'::text;

alter table public.product_subscribers alter column updated_at set default now();

alter table public.profiles alter column created_at set default now();

alter table public.profiles alter column updated_at set default now();

alter table public.provisioning_audit_logs alter column created_at set default now();

alter table public.provisioning_audit_logs alter column details set default '{}'::jsonb;

alter table public.provisioning_audit_logs alter column id set default gen_random_uuid();

alter table public.role_module_permissions alter column can_access set default true;

alter table public.role_module_permissions alter column updated_at set default now();

alter table public.site_lead_attempts alter column created_at set default now();

alter table public.subscriber_payments alter column created_at set default now();

alter table public.subscriber_payments alter column currency set default 'TRY'::text;

alter table public.subscriber_payments alter column id set default gen_random_uuid();

alter table public.subscriber_payments alter column paid_at set default now();

alter table public.subscriber_payments alter column provider set default 'paytr'::text;

alter table public.support_messages alter column created_at set default now();

alter table public.support_messages alter column id set default gen_random_uuid();

alter table public.support_messages alter column is_staff set default false;

alter table public.support_tickets alter column category set default 'general'::text;

alter table public.support_tickets alter column created_at set default now();

alter table public.support_tickets alter column id set default gen_random_uuid();

alter table public.support_tickets alter column last_message_at set default now();

alter table public.support_tickets alter column priority set default 'normal'::text;

alter table public.support_tickets alter column status set default 'open'::text;

alter table public.support_tickets alter column updated_at set default now();

alter table public.tracking_lookup_attempts alter column created_at set default now();

alter table public.user_presence alter column last_seen_at set default now();

alter table public.user_presence alter column updated_at set default now();

alter table public.user_session_logs alter column created_at set default now();

alter table public.user_session_logs alter column id set default gen_random_uuid();

alter table public.user_session_logs alter column last_seen_at set default now();

alter table public.user_session_logs alter column login_at set default now();

alter table public.whatsapp_accounts alter column created_at set default now();

alter table public.whatsapp_accounts alter column status set default 'connected'::text;

alter table public.whatsapp_accounts alter column updated_at set default now();

alter table public.whatsapp_conversation_state alter column created_at set default now();

alter table public.whatsapp_conversation_state alter column updated_at set default now();

alter table public.whatsapp_messages alter column created_at set default now();

alter table public.whatsapp_messages alter column id set default gen_random_uuid();

alter table public.whatsapp_messages alter column media_status set default 'none'::text;

alter table public.whatsapp_messages alter column message_type set default 'text'::text;

alter table public.whatsapp_messages alter column status set default 'queued'::text;

alter table public.whatsapp_messages alter column updated_at set default now();

alter table public.whatsapp_quick_replies alter column created_at set default now();

alter table public.whatsapp_quick_replies alter column id set default gen_random_uuid();

alter table public.whatsapp_quick_replies alter column sort_index set default 0;

alter table public.whatsapp_quick_replies alter column updated_at set default now();

alter table public.account_entries add constraint account_entries_amount_check CHECK ((amount > 0));

alter table public.account_entries add constraint account_entries_description_check CHECK (((char_length(description) >= 2) AND (char_length(description) <= 500)));

alter table public.account_entries add constraint account_entries_entry_type_check CHECK ((entry_type = ANY (ARRAY['debit'::text, 'credit'::text])));

alter table public.account_entries add constraint account_entries_pkey PRIMARY KEY (id);

alter table public.account_entries add constraint account_entries_source_type_check CHECK ((source_type = ANY (ARRAY['manual'::text, 'invoice'::text, 'payment'::text, 'expense'::text, 'adjustment'::text, 'crm_contract'::text])));

alter table public.account_parties add constraint account_parties_id_organization_id_key UNIQUE (id, organization_id);

alter table public.account_parties add constraint account_parties_name_check CHECK (((char_length(name) >= 2) AND (char_length(name) <= 180)));

alter table public.account_parties add constraint account_parties_party_type_check CHECK ((party_type = ANY (ARRAY['customer'::text, 'supplier'::text, 'both'::text])));

alter table public.account_parties add constraint account_parties_pkey PRIMARY KEY (id);

alter table public.activity_logs add constraint activity_logs_pkey PRIMARY KEY (id);

alter table public.arc_collection_products add constraint arc_collection_products_pkey PRIMARY KEY (collection_id, product_id);

alter table public.arc_collection_products add constraint arc_collection_products_position_check CHECK (("position" >= 0));

alter table public.arc_collections add constraint arc_collections_id_organization_id_key UNIQUE (id, organization_id);

alter table public.arc_collections add constraint arc_collections_metadata_check CHECK ((jsonb_typeof(metadata) = 'object'::text));

alter table public.arc_collections add constraint arc_collections_organization_id_slug_key UNIQUE (organization_id, slug);

alter table public.arc_collections add constraint arc_collections_pkey PRIMARY KEY (id);

alter table public.arc_collections add constraint arc_collections_slug_check CHECK ((slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'::text));

alter table public.arc_collections add constraint arc_collections_source_check CHECK ((source = ANY (ARRAY['native'::text, 'shopify'::text])));

alter table public.arc_collections add constraint arc_collections_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'active'::text, 'archived'::text])));

alter table public.arc_collections add constraint arc_collections_title_check CHECK (((char_length(title) >= 1) AND (char_length(title) <= 160)));

alter table public.arc_customer_addresses add constraint arc_customer_addresses_pkey PRIMARY KEY (id);

alter table public.arc_customer_favourites add constraint arc_customer_favourites_pkey PRIMARY KEY (id);

alter table public.arc_customer_favourites add constraint arc_customer_favourites_slug_format CHECK ((product_slug ~ '^[a-z0-9][a-z0-9-]{0,199}$'::text));

alter table public.arc_customer_favourites add constraint arc_customer_favourites_unique UNIQUE (user_id, product_slug);

alter table public.arc_discounts add constraint arc_discounts_check CHECK ((((discount_type = 'percentage'::text) AND ((value >= 1) AND (value <= 100))) OR ((discount_type = 'fixed_amount'::text) AND (value > 0)) OR ((discount_type = 'free_shipping'::text) AND (value = 0))));

alter table public.arc_discounts add constraint arc_discounts_check1 CHECK (((ends_at IS NULL) OR (starts_at IS NULL) OR (ends_at > starts_at)));

alter table public.arc_discounts add constraint arc_discounts_code_check CHECK (((code IS NULL) OR (code ~ '^[A-Z0-9_-]{2,40}$'::text)));

alter table public.arc_discounts add constraint arc_discounts_discount_type_check CHECK ((discount_type = ANY (ARRAY['percentage'::text, 'fixed_amount'::text, 'free_shipping'::text])));

alter table public.arc_discounts add constraint arc_discounts_metadata_check CHECK ((jsonb_typeof(metadata) = 'object'::text));

alter table public.arc_discounts add constraint arc_discounts_minimum_subtotal_check CHECK ((minimum_subtotal >= 0));

alter table public.arc_discounts add constraint arc_discounts_name_check CHECK (((char_length(name) >= 1) AND (char_length(name) <= 160)));

alter table public.arc_discounts add constraint arc_discounts_organization_id_code_key UNIQUE (organization_id, code);

alter table public.arc_discounts add constraint arc_discounts_per_customer_limit_check CHECK (((per_customer_limit IS NULL) OR (per_customer_limit > 0)));

alter table public.arc_discounts add constraint arc_discounts_pkey PRIMARY KEY (id);

alter table public.arc_discounts add constraint arc_discounts_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'active'::text, 'paused'::text, 'expired'::text])));

alter table public.arc_discounts add constraint arc_discounts_usage_count_check CHECK ((usage_count >= 0));

alter table public.arc_discounts add constraint arc_discounts_usage_limit_check CHECK (((usage_limit IS NULL) OR (usage_limit > 0)));

alter table public.arc_discounts add constraint arc_discounts_value_check CHECK ((value >= 0));

alter table public.arc_import_batches add constraint arc_import_batches_error_rows_check CHECK ((error_rows >= 0));

alter table public.arc_import_batches add constraint arc_import_batches_imported_rows_check CHECK ((imported_rows >= 0));

alter table public.arc_import_batches add constraint arc_import_batches_kind_check CHECK ((kind = ANY (ARRAY['products'::text, 'orders'::text])));

alter table public.arc_import_batches add constraint arc_import_batches_metadata_check CHECK ((jsonb_typeof(metadata) = 'object'::text));

alter table public.arc_import_batches add constraint arc_import_batches_pkey PRIMARY KEY (id);

alter table public.arc_import_batches add constraint arc_import_batches_skipped_rows_check CHECK ((skipped_rows >= 0));

alter table public.arc_import_batches add constraint arc_import_batches_source_check CHECK ((source = 'shopify'::text));

alter table public.arc_import_batches add constraint arc_import_batches_status_check CHECK ((status = ANY (ARRAY['processing'::text, 'completed'::text, 'failed'::text])));

alter table public.arc_import_batches add constraint arc_import_batches_total_rows_check CHECK ((total_rows >= 0));

alter table public.arc_import_errors add constraint arc_import_errors_pkey PRIMARY KEY (id);

alter table public.arc_inventory_movements add constraint arc_inventory_movements_kind_check CHECK ((kind = ANY (ARRAY['in'::text, 'out'::text, 'adjustment'::text, 'sale'::text, 'return'::text, 'sync'::text])));

alter table public.arc_inventory_movements add constraint arc_inventory_movements_pkey PRIMARY KEY (id);

alter table public.arc_order_events add constraint arc_order_events_event_data_check CHECK ((jsonb_typeof(event_data) = 'object'::text));

alter table public.arc_order_events add constraint arc_order_events_event_type_check CHECK ((event_type = ANY (ARRAY['status_updated'::text, 'fulfillment_updated'::text])));

alter table public.arc_order_events add constraint arc_order_events_pkey PRIMARY KEY (id);

alter table public.arc_order_items add constraint arc_order_items_pkey PRIMARY KEY (id);

alter table public.arc_order_items add constraint arc_order_items_quantity_check CHECK ((quantity > 0));

alter table public.arc_order_items add constraint arc_order_items_total_check CHECK ((total >= 0));

alter table public.arc_order_items add constraint arc_order_items_unit_price_check CHECK ((unit_price >= 0));

alter table public.arc_orders add constraint arc_orders_id_organization_id_key UNIQUE (id, organization_id);

alter table public.arc_orders add constraint arc_orders_metadata_check CHECK ((jsonb_typeof(metadata) = 'object'::text));

alter table public.arc_orders add constraint arc_orders_organization_id_order_number_key UNIQUE (organization_id, order_number);

alter table public.arc_orders add constraint arc_orders_organization_id_source_external_id_key UNIQUE (organization_id, source, external_id);

alter table public.arc_orders add constraint arc_orders_payment_status_check CHECK ((payment_status = ANY (ARRAY['pending'::text, 'authorized'::text, 'paid'::text, 'partially_refunded'::text, 'refunded'::text, 'failed'::text])));

alter table public.arc_orders add constraint arc_orders_pkey PRIMARY KEY (id);

alter table public.arc_orders add constraint arc_orders_shipping_check CHECK ((shipping >= 0));

alter table public.arc_orders add constraint arc_orders_source_check CHECK ((source = ANY (ARRAY['native'::text, 'shopify'::text])));

alter table public.arc_orders add constraint arc_orders_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'confirmed'::text, 'processing'::text, 'fulfilled'::text, 'cancelled'::text, 'refunded'::text])));

alter table public.arc_orders add constraint arc_orders_subtotal_check CHECK ((subtotal >= 0));

alter table public.arc_orders add constraint arc_orders_tax_check CHECK ((tax >= 0));

alter table public.arc_orders add constraint arc_orders_total_check CHECK ((total >= 0));

alter table public.arc_payment_orders add constraint arc_payment_orders_expected_amount_check CHECK ((expected_amount > 0));

alter table public.arc_payment_orders add constraint arc_payment_orders_merchant_oid_key UNIQUE (merchant_oid);

alter table public.arc_payment_orders add constraint arc_payment_orders_payment_method_check CHECK ((payment_method = ANY (ARRAY['card'::text, 'eft'::text])));

alter table public.arc_payment_orders add constraint arc_payment_orders_pkey PRIMARY KEY (id);

alter table public.arc_payment_orders add constraint arc_payment_orders_status_check CHECK ((status = ANY (ARRAY['awaiting_payment'::text, 'paid'::text, 'failed'::text, 'cancelled'::text])));

alter table public.arc_product_variants add constraint arc_product_variants_attributes_check CHECK ((jsonb_typeof(attributes) = 'object'::text));

alter table public.arc_product_variants add constraint arc_product_variants_compare_at_price_check CHECK (((compare_at_price IS NULL) OR (compare_at_price >= 0)));

alter table public.arc_product_variants add constraint arc_product_variants_id_organization_id_key UNIQUE (id, organization_id);

alter table public.arc_product_variants add constraint arc_product_variants_organization_id_external_id_key UNIQUE (organization_id, external_id);

alter table public.arc_product_variants add constraint arc_product_variants_pkey PRIMARY KEY (id);

alter table public.arc_product_variants add constraint arc_product_variants_price_check CHECK ((price >= 0));

alter table public.arc_products add constraint arc_products_id_organization_key UNIQUE (id, organization_id);

alter table public.arc_products add constraint arc_products_metadata_check CHECK ((jsonb_typeof(metadata) = 'object'::text));

alter table public.arc_products add constraint arc_products_name_check CHECK (((char_length(name) >= 1) AND (char_length(name) <= 200)));

alter table public.arc_products add constraint arc_products_organization_id_slug_key UNIQUE (organization_id, slug);

alter table public.arc_products add constraint arc_products_organization_id_source_external_id_key UNIQUE (organization_id, source, external_id);

alter table public.arc_products add constraint arc_products_pkey PRIMARY KEY (id);

alter table public.arc_products add constraint arc_products_source_check CHECK ((source = ANY (ARRAY['native'::text, 'shopify'::text])));

alter table public.arc_products add constraint arc_products_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'active'::text, 'archived'::text])));

alter table public.arc_return_requests add constraint arc_return_requests_pkey PRIMARY KEY (id);

alter table public.arc_return_requests add constraint arc_return_status_check CHECK ((status = ANY (ARRAY['beklemede'::text, 'onaylandi'::text, 'reddedildi'::text, 'tamamlandi'::text])));

alter table public.arc_store_settings add constraint arc_store_settings_accent_color_check CHECK ((accent_color ~ '^#[0-9A-Fa-f]{6}$'::text));

alter table public.arc_store_settings add constraint arc_store_settings_bank_iban_check CHECK (((bank_iban IS NULL) OR (bank_iban ~ '^TR[0-9]{24}$'::text)));

alter table public.arc_store_settings add constraint arc_store_settings_currency_check CHECK ((currency ~ '^[A-Z]{3}$'::text));

alter table public.arc_store_settings add constraint arc_store_settings_custom_domain_check CHECK (((custom_domain IS NULL) OR (custom_domain ~ '^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$'::text)));

alter table public.arc_store_settings add constraint arc_store_settings_domain_status_check CHECK ((domain_status = ANY (ARRAY['not_configured'::text, 'pending_dns'::text, 'verifying'::text, 'active'::text, 'failed'::text])));

alter table public.arc_store_settings add constraint arc_store_settings_locale_check CHECK (((char_length(locale) >= 2) AND (char_length(locale) <= 20)));

alter table public.arc_store_settings add constraint arc_store_settings_low_stock_threshold_check CHECK (((low_stock_threshold >= 0) AND (low_stock_threshold <= 10000)));

alter table public.arc_store_settings add constraint arc_store_settings_order_prefix_check CHECK ((order_prefix ~ '^[A-Z]{1,6}$'::text));

alter table public.arc_store_settings add constraint arc_store_settings_panel_custom_domain_check CHECK (((panel_custom_domain IS NULL) OR (panel_custom_domain ~ '^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$'::text)));

alter table public.arc_store_settings add constraint arc_store_settings_panel_domain_status_check CHECK ((panel_domain_status = ANY (ARRAY['not_configured'::text, 'pending_dns'::text, 'verifying'::text, 'active'::text, 'failed'::text])));

alter table public.arc_store_settings add constraint arc_store_settings_paytr_installment_check CHECK (((paytr_max_installment >= 0) AND (paytr_max_installment <= 12)));

alter table public.arc_store_settings add constraint arc_store_settings_pkey PRIMARY KEY (organization_id);

alter table public.arc_store_settings add constraint arc_store_settings_platform_subdomain_check CHECK (((platform_subdomain IS NULL) OR (platform_subdomain ~ '^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$'::text)));

alter table public.arc_store_settings add constraint arc_store_settings_primary_color_check CHECK ((primary_color ~ '^#[0-9A-Fa-f]{6}$'::text));

alter table public.arc_store_settings add constraint arc_store_settings_shipping_check CHECK (((shipping_fee >= 0) AND (free_shipping_threshold >= 0)));

alter table public.arc_store_settings add constraint arc_store_settings_store_name_check CHECK (((char_length(store_name) >= 1) AND (char_length(store_name) <= 160)));

alter table public.arc_store_settings add constraint arc_store_settings_storefront_url_check CHECK (((storefront_url IS NULL) OR (storefront_url ~ '^https://[A-Za-z0-9.-]+(?::[0-9]+)?(?:/.*)?$'::text)));

alter table public.arc_store_settings add constraint arc_store_settings_transfer_discount_check CHECK (((bank_transfer_discount_percent >= (0)::numeric) AND (bank_transfer_discount_percent <= (100)::numeric)));

alter table public.arc_store_themes add constraint arc_store_themes_config_check CHECK ((jsonb_typeof(config) = 'object'::text));

alter table public.arc_store_themes add constraint arc_store_themes_mode_check CHECK ((mode = ANY (ARRAY['draft'::text, 'published'::text])));

alter table public.arc_store_themes add constraint arc_store_themes_organization_id_mode_key UNIQUE (organization_id, mode);

alter table public.arc_store_themes add constraint arc_store_themes_pkey PRIMARY KEY (id);

alter table public.arc_store_themes add constraint arc_store_themes_version_check CHECK ((version > 0));

alter table public.arc_suppliers add constraint arc_suppliers_organization_id_code_key UNIQUE (organization_id, code);

alter table public.arc_suppliers add constraint arc_suppliers_pkey PRIMARY KEY (id);

alter table public.arvo_modules add constraint arvo_modules_code_check CHECK ((code ~ '^[a-z][a-z0-9_]*$'::text));

alter table public.arvo_modules add constraint arvo_modules_pkey PRIMARY KEY (code);

alter table public.bank_transactions add constraint bank_transactions_amount_check CHECK ((amount > 0));

alter table public.bank_transactions add constraint bank_transactions_description_check CHECK (((char_length(description) >= 2) AND (char_length(description) <= 500)));

alter table public.bank_transactions add constraint bank_transactions_direction_check CHECK ((direction = ANY (ARRAY['inflow'::text, 'outflow'::text])));

alter table public.bank_transactions add constraint bank_transactions_pkey PRIMARY KEY (id);

alter table public.bank_transactions add constraint bank_transactions_reconciliation_status_check CHECK ((reconciliation_status = ANY (ARRAY['unmatched'::text, 'matched'::text, 'ignored'::text])));

alter table public.billing_customers add constraint billing_customers_pkey PRIMARY KEY (organization_id);

alter table public.billing_customers add constraint billing_customers_provider_check CHECK ((provider = ANY (ARRAY['manual'::text, 'paytr'::text])));

alter table public.billing_customers add constraint billing_customers_provider_provider_customer_id_key UNIQUE (provider, provider_customer_id);

alter table public.billing_events add constraint billing_events_pkey PRIMARY KEY (id);

alter table public.billing_events add constraint billing_events_provider_provider_event_id_key UNIQUE (provider, provider_event_id);

alter table public.billing_invoices add constraint billing_invoices_pkey PRIMARY KEY (id);

alter table public.billing_invoices add constraint billing_invoices_product_check CHECK ((product = ANY (ARRAY['arvoos'::text, 'arvolab'::text, 'arc'::text, 'randevu'::text])));

alter table public.billing_invoices add constraint billing_invoices_provider_check CHECK ((provider = ANY (ARRAY['manual'::text, 'paytr'::text])));

alter table public.billing_invoices add constraint billing_invoices_provider_provider_invoice_id_key UNIQUE (provider, provider_invoice_id);

alter table public.billing_invoices add constraint billing_invoices_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'open'::text, 'paid'::text, 'void'::text, 'uncollectible'::text])));

alter table public.billing_subscriptions add constraint billing_subscriptions_interval_check CHECK (("interval" = ANY (ARRAY['month'::text, 'year'::text])));

alter table public.billing_subscriptions add constraint billing_subscriptions_pkey PRIMARY KEY (id);

alter table public.billing_subscriptions add constraint billing_subscriptions_product_check CHECK ((product = ANY (ARRAY['arvoos'::text, 'arvolab'::text, 'arc'::text, 'randevu'::text])));

alter table public.billing_subscriptions add constraint billing_subscriptions_provider_check CHECK ((provider = ANY (ARRAY['manual'::text, 'paytr'::text])));

alter table public.billing_subscriptions add constraint billing_subscriptions_provider_provider_subscription_id_key UNIQUE (provider, provider_subscription_id);

alter table public.billing_subscriptions add constraint billing_subscriptions_status_check CHECK ((status = ANY (ARRAY['trialing'::text, 'active'::text, 'past_due'::text, 'paused'::text, 'canceled'::text, 'incomplete'::text])));

alter table public.billing_subscriptions add constraint billing_subscriptions_unit_amount_check CHECK ((unit_amount >= 0));

alter table public.contract_cost_items add constraint contract_cost_items_amount_check CHECK ((amount > 0));

alter table public.contract_cost_items add constraint contract_cost_items_pkey PRIMARY KEY (id);

alter table public.contract_cost_items add constraint contract_cost_items_status_check CHECK ((status = ANY (ARRAY['planned'::text, 'paid'::text])));

alter table public.crm_appointments add constraint crm_appointments_pkey PRIMARY KEY (id);

alter table public.crm_appointments add constraint crm_appointments_status_check CHECK ((status = ANY (ARRAY['planned'::text, 'done'::text, 'cancelled'::text])));

alter table public.crm_appointments add constraint crm_appointments_title_check CHECK (((char_length(title) >= 2) AND (char_length(title) <= 160)));

alter table public.crm_automation_runs add constraint crm_automation_runs_pkey PRIMARY KEY (opportunity_id);

alter table public.crm_contract_addenda add constraint crm_contract_addenda_addendum_no_check CHECK ((addendum_no > 0));

alter table public.crm_contract_addenda add constraint crm_contract_addenda_contract_id_addendum_no_key UNIQUE (contract_id, addendum_no);

alter table public.crm_contract_addenda add constraint crm_contract_addenda_note_check CHECK (((note IS NULL) OR (char_length(note) <= 2000)));

alter table public.crm_contract_addenda add constraint crm_contract_addenda_payment_dates_check CHECK ((jsonb_typeof(payment_dates) = 'array'::text));

alter table public.crm_contract_addenda add constraint crm_contract_addenda_pkey PRIMARY KEY (id);

alter table public.crm_contract_addenda add constraint crm_contract_addenda_status_check CHECK ((status = ANY (ARRAY['sent'::text, 'accepted'::text, 'rejected'::text, 'cancelled'::text])));

alter table public.crm_contract_addenda add constraint crm_contract_addenda_work_plan_check CHECK ((jsonb_typeof(work_plan) = 'array'::text));

alter table public.crm_contracts add constraint crm_contracts_access_token_hash_key UNIQUE (access_token_hash);

alter table public.crm_contracts add constraint crm_contracts_amount_check CHECK ((amount >= 0));

alter table public.crm_contracts add constraint crm_contracts_organization_id_contract_no_key UNIQUE (organization_id, contract_no);

alter table public.crm_contracts add constraint crm_contracts_pkey PRIMARY KEY (id);

alter table public.crm_contracts add constraint crm_contracts_proposal_id_key UNIQUE (proposal_id);

alter table public.crm_contracts add constraint crm_contracts_service_cost_check CHECK ((service_cost >= 0));

alter table public.crm_contracts add constraint crm_contracts_service_cost_status_check CHECK ((service_cost_status = ANY (ARRAY['planned'::text, 'paid'::text])));

alter table public.crm_contracts add constraint crm_contracts_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'sent'::text, 'signed'::text, 'rejected'::text, 'cancelled'::text, 'completed'::text])));

alter table public.crm_internal_comments add constraint crm_internal_comments_body_check CHECK (((char_length(TRIM(BOTH FROM body)) >= 1) AND (char_length(TRIM(BOTH FROM body)) <= 4000)));

alter table public.crm_internal_comments add constraint crm_internal_comments_context_type_check CHECK ((context_type = ANY (ARRAY['request'::text, 'proposal'::text, 'contract'::text, 'operation'::text])));

alter table public.crm_internal_comments add constraint crm_internal_comments_pkey PRIMARY KEY (id);

alter table public.crm_opportunities add constraint crm_opportunities_customer_name_check CHECK (((char_length(customer_name) >= 2) AND (char_length(customer_name) <= 180)));

alter table public.crm_opportunities add constraint crm_opportunities_estimated_value_check CHECK ((estimated_value >= 0));

alter table public.crm_opportunities add constraint crm_opportunities_pkey PRIMARY KEY (id);

alter table public.crm_opportunities add constraint crm_opportunities_probability_check CHECK (((probability >= 0) AND (probability <= 100)));

alter table public.crm_opportunities add constraint crm_opportunities_stage_check CHECK ((stage = ANY (ARRAY['lead'::text, 'qualified'::text, 'proposal'::text, 'contract'::text, 'payment'::text, 'won'::text, 'lost'::text, 'pre_review'::text, 'academic_review'::text, 'proposal_ready'::text, 'proposal_approved'::text, 'contract_ready'::text, 'payment_pending'::text, 'payment_approved'::text, 'work_opened'::text, 'expert_assigned'::text, 'delivery'::text, 'completed'::text])));

alter table public.crm_opportunities add constraint crm_opportunities_title_check CHECK (((char_length(title) >= 2) AND (char_length(title) <= 180)));

alter table public.crm_proposals add constraint crm_proposals_access_token_hash_key UNIQUE (access_token_hash);

alter table public.crm_proposals add constraint crm_proposals_amount_check CHECK ((amount >= 0));

alter table public.crm_proposals add constraint crm_proposals_archive_reason_check CHECK (((archive_reason IS NULL) OR (archive_reason = ANY (ARRAY['accepted'::text, 'rejected'::text, 'expired'::text, 'superseded'::text, 'manual'::text]))));

alter table public.crm_proposals add constraint crm_proposals_organization_id_proposal_no_key UNIQUE (organization_id, proposal_no);

alter table public.crm_proposals add constraint crm_proposals_payment_plan_type_check CHECK ((payment_plan_type = ANY (ARRAY['cash'::text, 'half'::text, 'third'::text, 'custom'::text])));

alter table public.crm_proposals add constraint crm_proposals_pkey PRIMARY KEY (id);

alter table public.crm_proposals add constraint crm_proposals_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'sent'::text, 'accepted'::text, 'rejected'::text, 'expired'::text, 'archived'::text])));

alter table public.crm_proposals add constraint crm_proposals_tax_status_check CHECK ((tax_status = ANY (ARRAY['included'::text, 'excluded'::text, 'exempt'::text])));

alter table public.crm_requests add constraint crm_requests_customer_name_check CHECK (((char_length(customer_name) >= 2) AND (char_length(customer_name) <= 160)));

alter table public.crm_requests add constraint crm_requests_estimated_value_check CHECK ((estimated_value >= (0)::numeric));

alter table public.crm_requests add constraint crm_requests_pkey PRIMARY KEY (id);

alter table public.crm_requests add constraint crm_requests_status_check CHECK ((status = ANY (ARRAY['new'::text, 'qualified'::text, 'proposal'::text, 'won'::text, 'lost'::text])));

alter table public.crm_requests add constraint crm_requests_title_check CHECK (((char_length(title) >= 2) AND (char_length(title) <= 180)));

alter table public.customer_file_messages add constraint customer_file_messages_body_check CHECK (((char_length(body) >= 1) AND (char_length(body) <= 2000)));

alter table public.customer_file_messages add constraint customer_file_messages_pkey PRIMARY KEY (id);

alter table public.customer_file_messages add constraint customer_file_messages_sender_type_check CHECK ((sender_type = ANY (ARRAY['customer'::text, 'staff'::text])));

alter table public.document_access_logs add constraint document_access_logs_access_type_check CHECK ((access_type = ANY (ARRAY['panel_preview'::text, 'public_view'::text, 'pdf_print'::text, 'share_link'::text])));

alter table public.document_access_logs add constraint document_access_logs_document_type_check CHECK ((document_type = ANY (ARRAY['proposal'::text, 'contract'::text])));

alter table public.document_access_logs add constraint document_access_logs_pkey PRIMARY KEY (id);

alter table public.document_number_sequences add constraint document_number_sequences_padding_check CHECK (((padding >= 3) AND (padding <= 12)));

alter table public.document_number_sequences add constraint document_number_sequences_pkey PRIMARY KEY (organization_id, document_type, sequence_year);

alter table public.finance_transactions add constraint finance_transactions_amount_check CHECK ((amount > 0));

alter table public.finance_transactions add constraint finance_transactions_pkey PRIMARY KEY (id);

alter table public.finance_transactions add constraint finance_transactions_status_check CHECK ((status = ANY (ARRAY['planned'::text, 'paid'::text, 'canceled'::text])));

alter table public.finance_transactions add constraint finance_transactions_title_check CHECK (((char_length(title) >= 2) AND (char_length(title) <= 180)));

alter table public.finance_transactions add constraint finance_transactions_transaction_type_check CHECK ((transaction_type = ANY (ARRAY['income'::text, 'expense'::text])));

alter table public.hr_confidentiality_agreements add constraint hr_confidentiality_agreements_agreement_no_key UNIQUE (agreement_no);

alter table public.hr_confidentiality_agreements add constraint hr_confidentiality_agreements_employee_id_agreement_version_key UNIQUE (employee_id, agreement_version);

alter table public.hr_confidentiality_agreements add constraint hr_confidentiality_agreements_pkey PRIMARY KEY (id);

alter table public.hr_confidentiality_agreements add constraint hr_confidentiality_agreements_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'signed'::text, 'revoked'::text])));

alter table public.hr_departments add constraint hr_departments_organization_id_name_key UNIQUE (organization_id, name);

alter table public.hr_departments add constraint hr_departments_pkey PRIMARY KEY (id);

alter table public.hr_employee_commission_rates add constraint hr_employee_commission_rates_pkey PRIMARY KEY (id);

alter table public.hr_employee_documents add constraint hr_employee_documents_file_name_check CHECK (((char_length(file_name) >= 1) AND (char_length(file_name) <= 255)));

alter table public.hr_employee_documents add constraint hr_employee_documents_pkey PRIMARY KEY (id);

alter table public.hr_employees add constraint hr_employees_commission_rate_check CHECK (((commission_rate >= (0)::numeric) AND (commission_rate <= (100)::numeric)));

alter table public.hr_employees add constraint hr_employees_employment_status_check CHECK ((employment_status = ANY (ARRAY['active'::text, 'on_leave'::text, 'inactive'::text, 'terminated'::text])));

alter table public.hr_employees add constraint hr_employees_employment_type_check CHECK ((employment_type = ANY (ARRAY['full_time'::text, 'part_time'::text, 'contractor'::text, 'intern'::text])));

alter table public.hr_employees add constraint hr_employees_operation_commission_rate_check CHECK (((operation_commission_rate >= (0)::numeric) AND (operation_commission_rate <= (100)::numeric)));

alter table public.hr_employees add constraint hr_employees_organization_id_user_id_key UNIQUE (organization_id, user_id);

alter table public.hr_employees add constraint hr_employees_pkey PRIMARY KEY (id);

alter table public.hr_leave_requests add constraint hr_leave_requests_check CHECK ((end_date >= start_date));

alter table public.hr_leave_requests add constraint hr_leave_requests_leave_type_check CHECK ((leave_type = ANY (ARRAY['annual'::text, 'excuse'::text, 'sick'::text, 'unpaid'::text, 'other'::text])));

alter table public.hr_leave_requests add constraint hr_leave_requests_pkey PRIMARY KEY (id);

alter table public.hr_leave_requests add constraint hr_leave_requests_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text, 'cancelled'::text])));

alter table public.hr_leave_requests add constraint hr_leave_requests_total_days_check CHECK ((total_days > 0));

alter table public.hr_operation_commissions add constraint hr_operation_commissions_base_amount_check CHECK ((base_amount >= 0));

alter table public.hr_operation_commissions add constraint hr_operation_commissions_commission_amount_check CHECK ((commission_amount >= 0));

alter table public.hr_operation_commissions add constraint hr_operation_commissions_commission_rate_check CHECK (((commission_rate >= (0)::numeric) AND (commission_rate <= (100)::numeric)));

alter table public.hr_operation_commissions add constraint hr_operation_commissions_pkey PRIMARY KEY (id);

alter table public.hr_operation_commissions add constraint hr_operation_commissions_status_check CHECK ((status = ANY (ARRAY['accrued'::text, 'approved'::text, 'paid'::text, 'cancelled'::text])));

alter table public.hr_operation_commissions add constraint hr_operation_commissions_workflow_id_key UNIQUE (workflow_id);

alter table public.hr_sales_commissions add constraint hr_sales_commissions_collected_amount_check CHECK ((collected_amount >= 0));

alter table public.hr_sales_commissions add constraint hr_sales_commissions_commission_amount_check CHECK ((commission_amount >= 0));

alter table public.hr_sales_commissions add constraint hr_sales_commissions_commission_rate_check CHECK (((commission_rate >= (0)::numeric) AND (commission_rate <= (100)::numeric)));

alter table public.hr_sales_commissions add constraint hr_sales_commissions_payment_installment_id_employee_id_key UNIQUE (payment_installment_id, employee_id);

alter table public.hr_sales_commissions add constraint hr_sales_commissions_pkey PRIMARY KEY (id);

alter table public.hr_sales_commissions add constraint hr_sales_commissions_status_check CHECK ((status = ANY (ARRAY['accrued'::text, 'approved'::text, 'paid'::text, 'cancelled'::text])));

alter table public.internal_messages add constraint internal_messages_attachment_size_check CHECK (((attachment_size IS NULL) OR ((attachment_size >= 1) AND (attachment_size <= 10485760))));

alter table public.internal_messages add constraint internal_messages_content_check CHECK (((deleted_at IS NOT NULL) OR ((body IS NOT NULL) AND ((char_length(TRIM(BOTH FROM body)) >= 1) AND (char_length(TRIM(BOTH FROM body)) <= 4000))) OR (attachment_path IS NOT NULL)));

alter table public.internal_messages add constraint internal_messages_pkey PRIMARY KEY (id);

alter table public.message_channel_members add constraint message_channel_members_pkey PRIMARY KEY (channel_id, user_id);

alter table public.message_channels add constraint message_channels_channel_type_check CHECK ((channel_type = ANY (ARRAY['channel'::text, 'direct'::text])));

alter table public.message_channels add constraint message_channels_id_organization_id_key UNIQUE (id, organization_id);

alter table public.message_channels add constraint message_channels_name_check CHECK (((char_length(name) >= 2) AND (char_length(name) <= 80)));

alter table public.message_channels add constraint message_channels_organization_id_name_key UNIQUE (organization_id, name);

alter table public.message_channels add constraint message_channels_pkey PRIMARY KEY (id);

alter table public.message_read_states add constraint message_read_states_pkey PRIMARY KEY (channel_id, user_id);

alter table public.notification_user_dismissals add constraint notification_user_dismissals_pkey PRIMARY KEY (notification_id, user_id);

alter table public.notification_user_reads add constraint notification_user_reads_pkey PRIMARY KEY (notification_id, user_id);

alter table public.notifications add constraint notifications_audience_check CHECK ((audience = ANY (ARRAY['organization'::text, 'founder'::text])));

alter table public.notifications add constraint notifications_pkey PRIMARY KEY (id);

alter table public.operation_customer_file_downloads add constraint operation_customer_file_downloads_outcome_check CHECK ((outcome = ANY (ARRAY['granted'::text, 'locked'::text, 'denied'::text, 'rate_limited'::text])));

alter table public.operation_customer_file_downloads add constraint operation_customer_file_downloads_pkey PRIMARY KEY (id);

alter table public.operation_customer_files add constraint operation_customer_files_access_rule_check CHECK ((access_rule = ANY (ARRAY['after_full_payment'::text, 'immediate'::text])));

alter table public.operation_customer_files add constraint operation_customer_files_file_name_check CHECK (((char_length(file_name) >= 1) AND (char_length(file_name) <= 200)));

alter table public.operation_customer_files add constraint operation_customer_files_mime_type_check CHECK (((char_length(mime_type) >= 3) AND (char_length(mime_type) <= 120)));

alter table public.operation_customer_files add constraint operation_customer_files_note_check CHECK (((note IS NULL) OR (char_length(note) <= 500)));

alter table public.operation_customer_files add constraint operation_customer_files_path_scope CHECK ((storage_path ~~ ((((organization_id)::text || '/'::text) || (workflow_id)::text) || '/%'::text)));

alter table public.operation_customer_files add constraint operation_customer_files_pkey PRIMARY KEY (id);

alter table public.operation_customer_files add constraint operation_customer_files_size_bytes_check CHECK (((size_bytes >= 1) AND (size_bytes <= 52428800)));

alter table public.operation_customer_files add constraint operation_customer_files_storage_path_key UNIQUE (storage_path);

alter table public.operation_steps add constraint operation_steps_completion_consistency CHECK ((((is_completed = false) AND (completed_at IS NULL) AND (completed_by IS NULL)) OR ((is_completed = true) AND (completed_at IS NOT NULL) AND (completed_by IS NOT NULL))));

alter table public.operation_steps add constraint operation_steps_pkey PRIMARY KEY (id);

alter table public.operation_steps add constraint operation_steps_sort_order_check CHECK ((sort_order >= 0));

alter table public.operation_steps add constraint operation_steps_title_check CHECK (((char_length(title) >= 2) AND (char_length(title) <= 180)));

alter table public.operation_workflow_comments add constraint operation_workflow_comments_body_check CHECK (((char_length(body) >= 1) AND (char_length(body) <= 2000)));

alter table public.operation_workflow_comments add constraint operation_workflow_comments_pkey PRIMARY KEY (id);

alter table public.operation_workflows add constraint operation_workflows_archive_consistency CHECK (((status = 'archived'::text) = (archived_at IS NOT NULL)));

alter table public.operation_workflows add constraint operation_workflows_check CHECK (((due_date IS NULL) OR (start_date IS NULL) OR (due_date >= start_date)));

alter table public.operation_workflows add constraint operation_workflows_id_organization_unique UNIQUE (id, organization_id);

alter table public.operation_workflows add constraint operation_workflows_pkey PRIMARY KEY (id);

alter table public.operation_workflows add constraint operation_workflows_priority_check CHECK ((priority = ANY (ARRAY['low'::text, 'normal'::text, 'high'::text, 'urgent'::text])));

alter table public.operation_workflows add constraint operation_workflows_status_check CHECK ((status = ANY (ARRAY['planned'::text, 'in_progress'::text, 'blocked'::text, 'completed'::text, 'cancelled'::text, 'archived'::text])));

alter table public.operation_workflows add constraint operation_workflows_title_check CHECK (((char_length(title) >= 2) AND (char_length(title) <= 180)));

alter table public.organization_bank_accounts add constraint organization_bank_accounts_id_organization_id_key UNIQUE (id, organization_id);

alter table public.organization_bank_accounts add constraint organization_bank_accounts_organization_id_iban_key UNIQUE (organization_id, iban);

alter table public.organization_bank_accounts add constraint organization_bank_accounts_pkey PRIMARY KEY (id);

alter table public.organization_crm_stages add constraint organization_crm_stages_pkey PRIMARY KEY (organization_id, code);

alter table public.organization_crm_stages add constraint organization_crm_stages_probability_check CHECK (((probability >= 0) AND (probability <= 100)));

alter table public.organization_form_templates add constraint organization_form_templates_organization_id_template_type_c_key UNIQUE (organization_id, template_type, code);

alter table public.organization_form_templates add constraint organization_form_templates_pkey PRIMARY KEY (id);

alter table public.organization_form_templates add constraint organization_form_templates_template_type_check CHECK ((template_type = ANY (ARRAY['request'::text, 'proposal'::text, 'contract'::text])));

alter table public.organization_invitations add constraint organization_invitations_organization_id_email_key UNIQUE (organization_id, email);

alter table public.organization_invitations add constraint organization_invitations_pkey PRIMARY KEY (id);

alter table public.organization_invitations add constraint organization_invitations_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'sent'::text, 'accepted'::text, 'failed'::text, 'expired'::text])));

alter table public.organization_licenses add constraint organization_licenses_ai_credit_limit_check CHECK ((ai_credit_limit >= 0));

alter table public.organization_licenses add constraint organization_licenses_ai_credits_used_check CHECK ((ai_credits_used >= 0));

alter table public.organization_licenses add constraint organization_licenses_license_status_check CHECK ((license_status = ANY (ARRAY['trialing'::text, 'active'::text, 'past_due'::text, 'suspended'::text, 'canceled'::text])));

alter table public.organization_licenses add constraint organization_licenses_monthly_fee_check CHECK (((monthly_fee IS NULL) OR (monthly_fee > 0)));

alter table public.organization_licenses add constraint organization_licenses_pkey PRIMARY KEY (organization_id);

alter table public.organization_licenses add constraint organization_licenses_storage_limit_mb_check CHECK ((storage_limit_mb > 0));

alter table public.organization_licenses add constraint organization_licenses_user_limit_check CHECK ((user_limit > 0));

alter table public.organization_memberships add constraint organization_memberships_permissions_check CHECK ((jsonb_typeof(permissions) = 'object'::text));

alter table public.organization_memberships add constraint organization_memberships_pkey PRIMARY KEY (organization_id, user_id);

alter table public.organization_modules add constraint organization_modules_configuration_check CHECK ((jsonb_typeof(configuration) = 'object'::text));

alter table public.organization_modules add constraint organization_modules_pkey PRIMARY KEY (organization_id, module_code);

alter table public.organization_onboarding add constraint organization_onboarding_current_step_check CHECK (((current_step >= 1) AND (current_step <= 4)));

alter table public.organization_onboarding add constraint organization_onboarding_pkey PRIMARY KEY (organization_id);

alter table public.organization_payment_providers add constraint organization_payment_providers_merchant_id_check CHECK ((merchant_id ~ '^[0-9]{3,20}$'::text));

alter table public.organization_payment_providers add constraint organization_payment_providers_pkey PRIMARY KEY (organization_id, provider);

alter table public.organization_payment_providers add constraint organization_payment_providers_provider_check CHECK ((provider = 'paytr'::text));

alter table public.organization_payment_requests add constraint organization_payment_requests_amount_check CHECK ((amount > 0));

alter table public.organization_payment_requests add constraint organization_payment_requests_payment_method_check CHECK ((payment_method = ANY (ARRAY['bank_transfer'::text, 'paytr'::text])));

alter table public.organization_payment_requests add constraint organization_payment_requests_pkey PRIMARY KEY (id);

alter table public.organization_payment_requests add constraint organization_payment_requests_product_check CHECK ((product = ANY (ARRAY['arvoos'::text, 'arvolab'::text, 'arc'::text, 'randevu'::text])));

alter table public.organization_payment_requests add constraint organization_payment_requests_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text, 'canceled'::text])));

alter table public.organization_payment_requests add constraint organization_payment_requests_transfer_fields CHECK (((payment_method <> 'bank_transfer'::text) OR ((receipt_path IS NOT NULL) AND (bank_account_id IS NOT NULL))));

alter table public.organization_product_licenses add constraint organization_product_licenses_monthly_fee_check CHECK (((monthly_fee IS NULL) OR (monthly_fee > 0)));

alter table public.organization_product_licenses add constraint organization_product_licenses_pkey PRIMARY KEY (organization_id, product);

alter table public.organization_product_licenses add constraint organization_product_licenses_product_check CHECK ((product = ANY (ARRAY['arvolab'::text, 'arc'::text, 'randevu'::text])));

alter table public.organization_product_licenses add constraint organization_product_licenses_status_check CHECK ((status = ANY (ARRAY['inactive'::text, 'trialing'::text, 'active'::text, 'past_due'::text, 'suspended'::text, 'canceled'::text])));

alter table public.organization_vertical_profiles add constraint organization_vertical_profiles_pkey PRIMARY KEY (organization_id);

alter table public.organization_vertical_profiles add constraint organization_vertical_profiles_relationship_type_check CHECK ((relationship_type = ANY (ARRAY['customer'::text, 'sister_brand'::text, 'internal'::text])));

alter table public.organizations add constraint organizations_bank_account_holder_len CHECK (((bank_account_holder IS NULL) OR ((char_length(bank_account_holder) >= 1) AND (char_length(bank_account_holder) <= 200)))) NOT VALID;

alter table public.organizations add constraint organizations_bank_name_len CHECK (((bank_name IS NULL) OR ((char_length(bank_name) >= 1) AND (char_length(bank_name) <= 120)))) NOT VALID;

alter table public.organizations add constraint organizations_brand_color_format CHECK (((brand_color IS NULL) OR (brand_color ~* '^#[0-9a-f]{6}$'::text)));

alter table public.organizations add constraint organizations_custom_domain_key UNIQUE (custom_domain);

alter table public.organizations add constraint organizations_custom_domain_status_check CHECK ((custom_domain_status = ANY (ARRAY['pending'::text, 'verified'::text, 'failed'::text])));

alter table public.organizations add constraint organizations_iban_format CHECK (((iban IS NULL) OR ((iban ~ '^TR[0-9]{24}$'::text) AND (((((substr(iban, 5) || '2927'::text) || substr(iban, 3, 2)))::numeric % (97)::numeric) = (1)::numeric)))) NOT VALID;

alter table public.organizations add constraint organizations_kind_check CHECK ((kind = ANY (ARRAY['customer'::text, 'internal'::text])));

alter table public.organizations add constraint organizations_legal_address_len CHECK (((legal_address IS NULL) OR ((char_length(legal_address) >= 1) AND (char_length(legal_address) <= 500)))) NOT VALID;

alter table public.organizations add constraint organizations_legal_city_len CHECK (((legal_city IS NULL) OR ((char_length(legal_city) >= 1) AND (char_length(legal_city) <= 60)))) NOT VALID;

alter table public.organizations add constraint organizations_legal_district_len CHECK (((legal_district IS NULL) OR ((char_length(legal_district) >= 1) AND (char_length(legal_district) <= 60)))) NOT VALID;

alter table public.organizations add constraint organizations_legal_name_len CHECK (((legal_name IS NULL) OR ((char_length(legal_name) >= 1) AND (char_length(legal_name) <= 200)))) NOT VALID;

alter table public.organizations add constraint organizations_mersis_no_format CHECK (((mersis_no IS NULL) OR (mersis_no ~ '^[0-9]{16}$'::text))) NOT VALID;

alter table public.organizations add constraint organizations_name_check CHECK (((char_length(name) >= 2) AND (char_length(name) <= 160)));

alter table public.organizations add constraint organizations_pkey PRIMARY KEY (id);

alter table public.organizations add constraint organizations_provisioning_state_check CHECK ((provisioning_state = ANY (ARRAY['creating'::text, 'inviting_owner'::text, 'waiting_owner'::text, 'active'::text, 'suspended'::text, 'archived'::text, 'failed'::text])));

alter table public.organizations add constraint organizations_slug_check CHECK ((slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'::text));

alter table public.organizations add constraint organizations_slug_key UNIQUE (slug);

alter table public.organizations add constraint organizations_tax_number_format CHECK (((tax_number IS NULL) OR (tax_number ~ '^[0-9]{10,11}$'::text))) NOT VALID;

alter table public.organizations add constraint organizations_tax_office_len CHECK (((tax_office IS NULL) OR ((char_length(tax_office) >= 1) AND (char_length(tax_office) <= 120)))) NOT VALID;

alter table public.payment_installments add constraint payment_installments_amount_check CHECK ((amount >= 0));

alter table public.payment_installments add constraint payment_installments_payment_link_source_check CHECK ((payment_link_source = ANY (ARRAY['paytr'::text, 'manual'::text])));

alter table public.payment_installments add constraint payment_installments_payment_plan_id_installment_no_key UNIQUE (payment_plan_id, installment_no);

alter table public.payment_installments add constraint payment_installments_pkey PRIMARY KEY (id);

alter table public.payment_installments add constraint payment_installments_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'paid'::text, 'cancelled'::text])));

alter table public.payment_links add constraint payment_links_amount_check CHECK ((amount > 0));

alter table public.payment_links add constraint payment_links_creator_check CHECK (((created_by IS NOT NULL) OR (subscriber_id IS NOT NULL)));

alter table public.payment_links add constraint payment_links_pkey PRIMARY KEY (id);

alter table public.payment_links add constraint payment_links_provider_check CHECK ((provider = 'paytr'::text));

alter table public.payment_links add constraint payment_links_purpose_check CHECK ((((purpose = 'installment'::text) AND (installment_id IS NOT NULL)) OR ((purpose = 'subscription'::text) AND (product IS NOT NULL) AND (product = ANY (ARRAY['arvoos'::text, 'arvolab'::text, 'arc'::text, 'randevu'::text])) AND (((payer_organization_id IS NOT NULL) AND (plan_code IS NOT NULL)) OR (subscriber_id IS NOT NULL)) AND (NOT ((payer_organization_id IS NOT NULL) AND (subscriber_id IS NOT NULL))))));

alter table public.payment_links add constraint payment_links_status_check CHECK ((status = ANY (ARRAY['active'::text, 'paid'::text, 'cancelled'::text])));

alter table public.payment_links add constraint payment_links_url_check CHECK ((url ~ '^https://'::text));

alter table public.payment_plans add constraint payment_plans_contract_id_key UNIQUE (contract_id);

alter table public.payment_plans add constraint payment_plans_pkey PRIMARY KEY (id);

alter table public.payment_plans add constraint payment_plans_status_check CHECK ((status = ANY (ARRAY['active'::text, 'completed'::text, 'cancelled'::text])));

alter table public.payment_plans add constraint payment_plans_total_amount_check CHECK ((total_amount >= 0));

alter table public.payment_provider_events add constraint payment_provider_events_pkey PRIMARY KEY (id);

alter table public.payment_provider_events add constraint payment_provider_events_provider_merchant_oid_key UNIQUE (provider, merchant_oid);

alter table public.plans add constraint plans_pkey PRIMARY KEY (code);

alter table public.platform_bank_accounts add constraint platform_bank_accounts_iban_key UNIQUE (iban);

alter table public.platform_bank_accounts add constraint platform_bank_accounts_pkey PRIMARY KEY (id);

alter table public.platform_subscription_requests add constraint platform_subscription_requests_pkey PRIMARY KEY (id);

alter table public.platform_subscription_requests add constraint platform_subscription_requests_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text])));

alter table public.product_plans add constraint product_plans_individual_monthly_fee_check CHECK (((individual_monthly_fee IS NULL) OR (individual_monthly_fee > 0)));

alter table public.product_plans add constraint product_plans_pkey PRIMARY KEY (product);

alter table public.product_plans add constraint product_plans_product_check CHECK ((product = ANY (ARRAY['arvolab'::text, 'arc'::text])));

alter table public.product_plans add constraint product_plans_trial_days_check CHECK (((trial_days >= 0) AND (trial_days <= 365)));

alter table public.product_subscribers add constraint product_subscribers_pkey PRIMARY KEY (id);

alter table public.product_subscribers add constraint product_subscribers_product_check CHECK ((product = ANY (ARRAY['arvolab'::text, 'arc'::text])));

alter table public.product_subscribers add constraint product_subscribers_product_external_user_id_key UNIQUE (product, external_user_id);

alter table public.product_subscribers add constraint product_subscribers_status_check CHECK ((status = ANY (ARRAY['trialing'::text, 'active'::text, 'past_due'::text, 'suspended'::text, 'canceled'::text])));

alter table public.profiles add constraint profiles_pkey PRIMARY KEY (id);

alter table public.provisioning_audit_logs add constraint provisioning_audit_logs_pkey PRIMARY KEY (id);

alter table public.provisioning_audit_logs add constraint provisioning_audit_logs_result_check CHECK ((result = ANY (ARRAY['started'::text, 'success'::text, 'failed'::text])));

alter table public.role_module_permissions add constraint role_module_permissions_pkey PRIMARY KEY (organization_id, role, module_key);

alter table public.site_lead_attempts add constraint site_lead_attempts_pkey PRIMARY KEY (id);

alter table public.subscriber_payments add constraint subscriber_payments_amount_check CHECK ((amount > 0));

alter table public.subscriber_payments add constraint subscriber_payments_pkey PRIMARY KEY (id);

alter table public.support_messages add constraint support_messages_body_check CHECK (((char_length(body) >= 1) AND (char_length(body) <= 5000)));

alter table public.support_messages add constraint support_messages_pkey PRIMARY KEY (id);

alter table public.support_tickets add constraint support_tickets_category_check CHECK ((category = ANY (ARRAY['general'::text, 'technical'::text, 'billing'::text, 'feature'::text])));

alter table public.support_tickets add constraint support_tickets_id_organization_id_key UNIQUE (id, organization_id);

alter table public.support_tickets add constraint support_tickets_pkey PRIMARY KEY (id);

alter table public.support_tickets add constraint support_tickets_priority_check CHECK ((priority = ANY (ARRAY['low'::text, 'normal'::text, 'high'::text, 'urgent'::text])));

alter table public.support_tickets add constraint support_tickets_status_check CHECK ((status = ANY (ARRAY['open'::text, 'in_progress'::text, 'waiting_customer'::text, 'resolved'::text, 'closed'::text])));

alter table public.support_tickets add constraint support_tickets_subject_check CHECK (((char_length(subject) >= 3) AND (char_length(subject) <= 180)));

alter table public.tracking_lookup_attempts add constraint tracking_lookup_attempts_outcome_check CHECK ((outcome = ANY (ARRAY['found'::text, 'not_found'::text])));

alter table public.tracking_lookup_attempts add constraint tracking_lookup_attempts_pkey PRIMARY KEY (id);

alter table public.user_presence add constraint user_presence_pkey PRIMARY KEY (organization_id, user_id);

alter table public.user_session_logs add constraint user_session_logout_reason_check CHECK (((logout_reason IS NULL) OR (logout_reason = ANY (ARRAY['manual'::text, 'timeout'::text, 'workspace_switch'::text]))));

alter table public.user_session_logs add constraint user_session_logs_pkey PRIMARY KEY (id);

alter table public.whatsapp_accounts add constraint whatsapp_accounts_phone_number_id_key UNIQUE (phone_number_id);

alter table public.whatsapp_accounts add constraint whatsapp_accounts_pkey PRIMARY KEY (organization_id);

alter table public.whatsapp_accounts add constraint whatsapp_accounts_status_check CHECK ((status = ANY (ARRAY['connected'::text, 'unverified'::text, 'disabled'::text])));

alter table public.whatsapp_conversation_state add constraint whatsapp_conversation_state_pkey PRIMARY KEY (organization_id, counterpart_phone);

alter table public.whatsapp_messages add constraint whatsapp_messages_direction_check CHECK ((direction = ANY (ARRAY['outbound'::text, 'inbound'::text])));

alter table public.whatsapp_messages add constraint whatsapp_messages_media_status_check CHECK ((media_status = ANY (ARRAY['none'::text, 'pending'::text, 'stored'::text, 'failed'::text])));

alter table public.whatsapp_messages add constraint whatsapp_messages_pkey PRIMARY KEY (id);

alter table public.whatsapp_messages add constraint whatsapp_messages_product_check CHECK ((product = ANY (ARRAY['arvoos'::text, 'arvolab'::text, 'arc'::text, 'randevu'::text])));

alter table public.whatsapp_messages add constraint whatsapp_messages_sender_check CHECK ((sender = ANY (ARRAY['organization'::text, 'arvo'::text])));

alter table public.whatsapp_messages add constraint whatsapp_messages_status_check CHECK ((status = ANY (ARRAY['queued'::text, 'sent'::text, 'delivered'::text, 'read'::text, 'failed'::text, 'received'::text])));

alter table public.whatsapp_quick_replies add constraint whatsapp_quick_replies_body_check CHECK (((length(btrim(body)) >= 1) AND (length(btrim(body)) <= 1024)));

alter table public.whatsapp_quick_replies add constraint whatsapp_quick_replies_pkey PRIMARY KEY (id);

alter table public.whatsapp_quick_replies add constraint whatsapp_quick_replies_title_check CHECK (((length(btrim(title)) >= 1) AND (length(btrim(title)) <= 60)));

CREATE INDEX account_entries_party_date_idx ON public.account_entries USING btree (party_id, transaction_date DESC, created_at DESC);

CREATE INDEX account_parties_org_type_idx ON public.account_parties USING btree (organization_id, party_type, name);

CREATE INDEX activity_logs_entity_idx ON public.activity_logs USING btree (organization_id, entity_type, entity_id, created_at DESC);

CREATE INDEX activity_logs_metadata_idx ON public.activity_logs USING gin (metadata jsonb_path_ops);

CREATE INDEX activity_logs_organization_created_idx ON public.activity_logs USING btree (organization_id, created_at DESC);

CREATE INDEX arc_collection_products_collection_org_idx ON public.arc_collection_products USING btree (collection_id, organization_id);

CREATE INDEX arc_collection_products_collection_position_idx ON public.arc_collection_products USING btree (collection_id, "position");

CREATE INDEX arc_collection_products_org_product_idx ON public.arc_collection_products USING btree (organization_id, product_id);

CREATE INDEX arc_collection_products_product_org_idx ON public.arc_collection_products USING btree (product_id, organization_id);

CREATE INDEX arc_collections_org_status_idx ON public.arc_collections USING btree (organization_id, status);

CREATE INDEX arc_customer_addresses_user_idx ON public.arc_customer_addresses USING btree (user_id, created_at DESC);

CREATE INDEX arc_customer_favourites_user_created_idx ON public.arc_customer_favourites USING btree (user_id, created_at DESC);

CREATE INDEX arc_discounts_org_status_idx ON public.arc_discounts USING btree (organization_id, status);

CREATE INDEX arc_discounts_org_type_idx ON public.arc_discounts USING btree (organization_id, discount_type);

CREATE INDEX arc_import_batches_org_created_idx ON public.arc_import_batches USING btree (organization_id, created_at DESC);

CREATE INDEX arc_import_errors_batch_idx ON public.arc_import_errors USING btree (batch_id, created_at);

CREATE INDEX arc_inventory_org_created_idx ON public.arc_inventory_movements USING btree (organization_id, created_at DESC);

CREATE INDEX arc_inventory_org_variant_idx ON public.arc_inventory_movements USING btree (organization_id, variant_id, created_at DESC);

CREATE INDEX arc_order_events_order_created_idx ON public.arc_order_events USING btree (order_id, created_at DESC);

CREATE INDEX arc_order_items_org_order_idx ON public.arc_order_items USING btree (organization_id, order_id);

CREATE INDEX arc_orders_customer_email_idx ON public.arc_orders USING btree (lower(customer_email));

CREATE INDEX arc_orders_org_created_idx ON public.arc_orders USING btree (organization_id, created_at DESC);

CREATE INDEX arc_orders_org_payment_created_idx ON public.arc_orders USING btree (organization_id, payment_status, created_at DESC);

CREATE INDEX arc_orders_org_status_created_idx ON public.arc_orders USING btree (organization_id, status, created_at DESC);

CREATE INDEX arc_orders_user_id_idx ON public.arc_orders USING btree (user_id);

CREATE INDEX arc_payment_orders_org_created_idx ON public.arc_payment_orders USING btree (organization_id, created_at DESC);

CREATE INDEX arc_payment_orders_status_idx ON public.arc_payment_orders USING btree (status, created_at DESC);

CREATE INDEX arc_variants_org_product_idx ON public.arc_product_variants USING btree (organization_id, product_id);

CREATE INDEX arc_variants_org_stock_idx ON public.arc_product_variants USING btree (organization_id, stock);

CREATE INDEX arc_variants_product_idx ON public.arc_product_variants USING btree (product_id);

CREATE INDEX arc_variants_supplier_sku_idx ON public.arc_product_variants USING btree (organization_id, supplier, supplier_sku);

CREATE UNIQUE INDEX arc_variants_supplier_sku_uniq ON public.arc_product_variants USING btree (organization_id, supplier_sku) WHERE (supplier_sku IS NOT NULL);

CREATE INDEX arc_products_org_status_idx ON public.arc_products USING btree (organization_id, status);

CREATE INDEX arc_products_supplier_idx ON public.arc_products USING btree (organization_id, supplier, supplier_product_code);

CREATE INDEX arc_return_requests_order_idx ON public.arc_return_requests USING btree (order_id);

CREATE INDEX arc_return_requests_org_status_idx ON public.arc_return_requests USING btree (organization_id, status, created_at DESC);

CREATE UNIQUE INDEX arc_return_requests_open_unique ON public.arc_return_requests USING btree (order_id) WHERE (status = 'beklemede'::text);

CREATE UNIQUE INDEX arc_store_settings_custom_domain_uidx ON public.arc_store_settings USING btree (custom_domain) WHERE (custom_domain IS NOT NULL);

CREATE UNIQUE INDEX arc_store_settings_custom_domain_unique_idx ON public.arc_store_settings USING btree (lower(custom_domain)) WHERE ((custom_domain IS NOT NULL) AND (TRIM(BOTH FROM custom_domain) <> ''::text));

CREATE UNIQUE INDEX arc_store_settings_order_prefix_unique_idx ON public.arc_store_settings USING btree (upper(order_prefix)) WHERE ((order_prefix IS NOT NULL) AND (TRIM(BOTH FROM order_prefix) <> ''::text));

CREATE UNIQUE INDEX arc_store_settings_panel_custom_domain_uidx ON public.arc_store_settings USING btree (panel_custom_domain) WHERE (panel_custom_domain IS NOT NULL);

CREATE UNIQUE INDEX arc_store_settings_panel_domain_unique_idx ON public.arc_store_settings USING btree (lower(panel_custom_domain)) WHERE ((panel_custom_domain IS NOT NULL) AND (TRIM(BOTH FROM panel_custom_domain) <> ''::text));

CREATE UNIQUE INDEX arc_store_settings_platform_subdomain_uidx ON public.arc_store_settings USING btree (platform_subdomain) WHERE (platform_subdomain IS NOT NULL);

CREATE UNIQUE INDEX arc_store_settings_platform_subdomain_unique_idx ON public.arc_store_settings USING btree (lower(platform_subdomain)) WHERE ((platform_subdomain IS NOT NULL) AND (TRIM(BOTH FROM platform_subdomain) <> ''::text));

CREATE INDEX arc_store_themes_org_mode_idx ON public.arc_store_themes USING btree (organization_id, mode);

CREATE INDEX bank_transactions_org_date_idx ON public.bank_transactions USING btree (organization_id, transaction_date DESC, created_at DESC);

CREATE INDEX bank_transactions_reconciliation_idx ON public.bank_transactions USING btree (organization_id, reconciliation_status, transaction_date DESC);

CREATE INDEX billing_events_created_idx ON public.billing_events USING btree (created_at DESC);

CREATE INDEX billing_invoices_org_idx ON public.billing_invoices USING btree (organization_id, created_at DESC);

CREATE UNIQUE INDEX billing_invoices_id_org_uidx ON public.billing_invoices USING btree (id, organization_id);

CREATE INDEX billing_subscriptions_org_idx ON public.billing_subscriptions USING btree (organization_id, status);

CREATE INDEX contract_cost_items_contract_date_idx ON public.contract_cost_items USING btree (contract_id, cost_date DESC);

CREATE INDEX contract_cost_items_org_status_idx ON public.contract_cost_items USING btree (organization_id, status);

CREATE INDEX crm_appointments_employee_start_idx ON public.crm_appointments USING btree (employee_id, starts_at);

CREATE INDEX crm_appointments_org_start_idx ON public.crm_appointments USING btree (organization_id, starts_at);

CREATE INDEX crm_automation_runs_org_idx ON public.crm_automation_runs USING btree (organization_id, processed_at DESC);

CREATE INDEX crm_contract_addenda_opportunity_idx ON public.crm_contract_addenda USING btree (opportunity_id);

CREATE INDEX crm_contract_addenda_org_idx ON public.crm_contract_addenda USING btree (organization_id);

CREATE UNIQUE INDEX crm_contract_addenda_one_pending ON public.crm_contract_addenda USING btree (contract_id) WHERE (status = 'sent'::text);

CREATE INDEX crm_contracts_opportunity_idx ON public.crm_contracts USING btree (opportunity_id);

CREATE INDEX crm_contracts_org_contract_no_idx ON public.crm_contracts USING btree (organization_id, upper(contract_no));

CREATE INDEX crm_contracts_org_invoice_idx ON public.crm_contracts USING btree (organization_id, invoice_id) WHERE (invoice_id IS NOT NULL);

CREATE INDEX crm_contracts_org_status_idx ON public.crm_contracts USING btree (organization_id, status, created_at DESC);

CREATE INDEX crm_contracts_service_cost_status_idx ON public.crm_contracts USING btree (organization_id, service_cost_status) WHERE (service_cost > 0);

CREATE UNIQUE INDEX crm_contracts_share_token_key ON public.crm_contracts USING btree (share_token) WHERE (share_token IS NOT NULL);

CREATE UNIQUE INDEX crm_contracts_tracking_code_key ON public.crm_contracts USING btree (tracking_code) WHERE (tracking_code IS NOT NULL);

CREATE INDEX crm_internal_comments_chain_idx ON public.crm_internal_comments USING btree (organization_id, opportunity_id, created_at DESC);

CREATE INDEX crm_opportunities_assigned_employee_idx ON public.crm_opportunities USING btree (organization_id, assigned_employee_id);

CREATE INDEX crm_opportunities_close_date_idx ON public.crm_opportunities USING btree (organization_id, expected_close_date) WHERE (expected_close_date IS NOT NULL);

CREATE INDEX crm_opportunities_org_stage_idx ON public.crm_opportunities USING btree (organization_id, stage, updated_at DESC);

CREATE INDEX crm_opportunities_owner_idx ON public.crm_opportunities USING btree (organization_id, owner_user_id);

CREATE INDEX crm_proposals_opportunity_idx ON public.crm_proposals USING btree (opportunity_id);

CREATE INDEX crm_proposals_org_idx ON public.crm_proposals USING btree (organization_id, created_at DESC);

CREATE INDEX crm_proposals_org_status_idx ON public.crm_proposals USING btree (organization_id, status, created_at DESC);

CREATE INDEX crm_proposals_root_revision_idx ON public.crm_proposals USING btree (root_proposal_id, revision_no DESC);

CREATE UNIQUE INDEX crm_proposals_share_token_key ON public.crm_proposals USING btree (share_token) WHERE (share_token IS NOT NULL);

CREATE INDEX crm_requests_org_created_idx ON public.crm_requests USING btree (organization_id, created_at DESC);

CREATE INDEX customer_file_messages_contract_created_idx ON public.customer_file_messages USING btree (contract_id, created_at);

CREATE INDEX customer_file_messages_organization_idx ON public.customer_file_messages USING btree (organization_id);

CREATE INDEX customer_file_messages_sender_user_idx ON public.customer_file_messages USING btree (sender_user_id) WHERE (sender_user_id IS NOT NULL);

CREATE INDEX customer_file_messages_workflow_unread_idx ON public.customer_file_messages USING btree (workflow_id, created_at DESC) WHERE ((sender_type = 'customer'::text) AND (read_at IS NULL));

CREATE INDEX document_access_logs_document_idx ON public.document_access_logs USING btree (organization_id, document_type, document_id, created_at DESC);

CREATE INDEX finance_transactions_org_status_idx ON public.finance_transactions USING btree (organization_id, status, due_date);

CREATE INDEX finance_transactions_org_type_idx ON public.finance_transactions USING btree (organization_id, transaction_type, created_at DESC);

CREATE INDEX finance_transactions_party_idx ON public.finance_transactions USING btree (party_id);

CREATE INDEX hr_confidentiality_org_status_idx ON public.hr_confidentiality_agreements USING btree (organization_id, status, created_at DESC);

CREATE INDEX hr_departments_org_idx ON public.hr_departments USING btree (organization_id);

CREATE INDEX hr_employee_commission_rates_employee_idx ON public.hr_employee_commission_rates USING btree (employee_id, valid_from DESC);

CREATE INDEX hr_employee_documents_employee_idx ON public.hr_employee_documents USING btree (employee_id, created_at DESC);

CREATE INDEX hr_employees_org_active_idx ON public.hr_employees USING btree (organization_id, employment_status);

CREATE INDEX hr_employees_org_idx ON public.hr_employees USING btree (organization_id, employment_status);

CREATE INDEX hr_employees_org_sales_idx ON public.hr_employees USING btree (organization_id, can_receive_sales_requests) WHERE (employment_status = 'active'::text);

CREATE INDEX hr_employees_sales_idx ON public.hr_employees USING btree (organization_id, can_receive_sales_requests) WHERE (employment_status = 'active'::text);

CREATE INDEX hr_employees_user_idx ON public.hr_employees USING btree (user_id) WHERE (user_id IS NOT NULL);

CREATE INDEX hr_leave_requests_employee_idx ON public.hr_leave_requests USING btree (employee_id, start_date);

CREATE INDEX hr_leave_requests_org_status_idx ON public.hr_leave_requests USING btree (organization_id, status, start_date);

CREATE INDEX hr_sales_commissions_org_status_idx ON public.hr_sales_commissions USING btree (organization_id, status, accrued_at);

CREATE INDEX internal_messages_channel_created_idx ON public.internal_messages USING btree (channel_id, created_at DESC);

CREATE INDEX internal_messages_org_channel_created_idx ON public.internal_messages USING btree (organization_id, channel_id, created_at DESC);

CREATE INDEX message_channel_members_org_user_idx ON public.message_channel_members USING btree (organization_id, user_id);

CREATE INDEX message_channels_org_activity_idx ON public.message_channels USING btree (organization_id, last_message_at DESC NULLS LAST);

CREATE INDEX message_channels_org_idx ON public.message_channels USING btree (organization_id, name);

CREATE UNIQUE INDEX message_channels_direct_key_idx ON public.message_channels USING btree (organization_id, direct_key) WHERE (direct_key IS NOT NULL);

CREATE UNIQUE INDEX message_channels_direct_key_unique ON public.message_channels USING btree (organization_id, direct_key) WHERE ((channel_type = 'direct'::text) AND (direct_key IS NOT NULL));

CREATE UNIQUE INDEX message_channels_direct_membership_fk_idx ON public.message_channels USING btree (id, organization_id, created_by, direct_key);

CREATE INDEX message_read_states_user_idx ON public.message_read_states USING btree (organization_id, user_id, last_read_at);

CREATE INDEX notification_user_dismissals_user_idx ON public.notification_user_dismissals USING btree (user_id, dismissed_at DESC);

CREATE INDEX notification_user_reads_user_idx ON public.notification_user_reads USING btree (user_id, read_at DESC);

CREATE INDEX notifications_category_user_created_idx ON public.notifications USING btree (organization_id, category, user_id, created_at DESC);

CREATE INDEX notifications_founder_created_idx ON public.notifications USING btree (audience, created_at DESC);

CREATE INDEX notifications_org_created_idx ON public.notifications USING btree (organization_id, created_at DESC);

CREATE INDEX notifications_unread_idx ON public.notifications USING btree (read_at, created_at DESC) WHERE (read_at IS NULL);

CREATE INDEX operation_customer_file_downloads_file_idx ON public.operation_customer_file_downloads USING btree (file_id, created_at DESC);

CREATE INDEX operation_customer_file_downloads_ip_idx ON public.operation_customer_file_downloads USING btree (client_ip, created_at DESC) WHERE (outcome = 'denied'::text);

CREATE INDEX operation_customer_files_workflow_idx ON public.operation_customer_files USING btree (workflow_id, created_at DESC) WHERE (deleted_at IS NULL);

CREATE INDEX operation_steps_workflow_order_idx ON public.operation_steps USING btree (workflow_id, sort_order, id);

CREATE INDEX operation_workflow_comments_workflow_created_idx ON public.operation_workflow_comments USING btree (workflow_id, created_at DESC);

CREATE INDEX operation_workflow_comments_workflow_idx ON public.operation_workflow_comments USING btree (workflow_id, created_at DESC);

CREATE INDEX operation_workflows_assigned_employee_idx ON public.operation_workflows USING btree (organization_id, assigned_employee_id);

CREATE INDEX operation_workflows_org_archived_idx ON public.operation_workflows USING btree (organization_id, archived_at DESC) WHERE (status = 'archived'::text);

CREATE INDEX operation_workflows_org_status_idx ON public.operation_workflows USING btree (organization_id, status, created_at DESC);

CREATE UNIQUE INDEX operation_workflows_contract_id_unique ON public.operation_workflows USING btree (contract_id) WHERE (contract_id IS NOT NULL);

CREATE INDEX organization_bank_accounts_org_idx ON public.organization_bank_accounts USING btree (organization_id, is_active);

CREATE INDEX organization_crm_stages_org_idx ON public.organization_crm_stages USING btree (organization_id);

CREATE INDEX organization_form_templates_org_type_idx ON public.organization_form_templates USING btree (organization_id, template_type, is_active);

CREATE INDEX organization_memberships_user_active_idx ON public.organization_memberships USING btree (user_id, is_active);

CREATE INDEX organization_memberships_user_idx ON public.organization_memberships USING btree (user_id, organization_id) WHERE (is_active = true);

CREATE INDEX organization_modules_module_code_idx ON public.organization_modules USING btree (module_code);

CREATE INDEX organization_modules_org_enabled_idx ON public.organization_modules USING btree (organization_id, is_enabled);

CREATE INDEX organization_modules_org_idx ON public.organization_modules USING btree (organization_id) WHERE (is_enabled = true);

CREATE INDEX organization_payment_requests_org_status_idx ON public.organization_payment_requests USING btree (organization_id, status, created_at DESC);

CREATE INDEX organization_payment_requests_pending_idx ON public.organization_payment_requests USING btree (status, created_at DESC) WHERE (status = 'pending'::text);

CREATE INDEX organization_product_licenses_koprulu_idx ON public.organization_product_licenses USING btree (product, organization_id) WHERE integrated;

CREATE INDEX organization_product_licenses_product_status_idx ON public.organization_product_licenses USING btree (product, status);

CREATE INDEX organizations_kind_idx ON public.organizations USING btree (kind);

CREATE INDEX organizations_plan_code_idx ON public.organizations USING btree (plan_code);

CREATE UNIQUE INDEX organizations_custom_domain_unique_idx ON public.organizations USING btree (lower(custom_domain)) WHERE (custom_domain IS NOT NULL);

CREATE INDEX payment_installments_due_status_idx ON public.payment_installments USING btree (organization_id, status, due_date);

CREATE INDEX payment_installments_org_status_paid_idx ON public.payment_installments USING btree (organization_id, status, paid_at DESC);

CREATE INDEX payment_installments_plan_status_idx ON public.payment_installments USING btree (payment_plan_id, status, installment_no);

CREATE INDEX payment_links_organization_idx ON public.payment_links USING btree (organization_id, created_at DESC);

CREATE UNIQUE INDEX payment_links_one_active_per_installment ON public.payment_links USING btree (installment_id) WHERE (status = 'active'::text);

CREATE UNIQUE INDEX payment_links_one_active_subscriber ON public.payment_links USING btree (subscriber_id, product) WHERE ((status = 'active'::text) AND (purpose = 'subscription'::text) AND (subscriber_id IS NOT NULL));

CREATE UNIQUE INDEX payment_links_one_active_subscription ON public.payment_links USING btree (payer_organization_id, product) WHERE ((status = 'active'::text) AND (purpose = 'subscription'::text));

CREATE INDEX payment_plans_org_contract_idx ON public.payment_plans USING btree (organization_id, contract_id);

CREATE INDEX platform_subscription_requests_bekleyen_idx ON public.platform_subscription_requests USING btree (created_at DESC) WHERE (status = 'pending'::text);

CREATE UNIQUE INDEX platform_subscription_requests_sozlesme_uniq ON public.platform_subscription_requests USING btree (contract_id);

CREATE INDEX product_subscribers_email_idx ON public.product_subscribers USING btree (product, email);

CREATE INDEX product_subscribers_status_idx ON public.product_subscribers USING btree (product, status);

CREATE INDEX site_lead_attempts_created_idx ON public.site_lead_attempts USING btree (created_at DESC);

CREATE INDEX site_lead_attempts_dedupe_idx ON public.site_lead_attempts USING btree (email_norm, interest, created_at DESC) WHERE (outcome = 'accepted'::text);

CREATE INDEX site_lead_attempts_ip_idx ON public.site_lead_attempts USING btree (ip_hash, created_at DESC);

CREATE INDEX subscriber_payments_subscriber_idx ON public.subscriber_payments USING btree (subscriber_id, paid_at DESC);

CREATE INDEX support_messages_ticket_idx ON public.support_messages USING btree (ticket_id, created_at);

CREATE INDEX support_tickets_org_status_idx ON public.support_tickets USING btree (organization_id, status, last_message_at DESC);

CREATE INDEX tracking_lookup_attempts_created_idx ON public.tracking_lookup_attempts USING btree (created_at);

CREATE INDEX tracking_lookup_attempts_ip_open_idx ON public.tracking_lookup_attempts USING btree (client_ip, created_at DESC) WHERE (outcome = 'not_found'::text);

CREATE INDEX tracking_lookup_attempts_open_idx ON public.tracking_lookup_attempts USING btree (created_at DESC) WHERE (outcome = 'not_found'::text);

CREATE INDEX user_presence_online_idx ON public.user_presence USING btree (organization_id, last_seen_at DESC);

CREATE INDEX user_session_logs_org_login_idx ON public.user_session_logs USING btree (organization_id, login_at DESC);

CREATE INDEX user_session_logs_user_open_idx ON public.user_session_logs USING btree (user_id, logout_at, last_seen_at DESC);

CREATE INDEX whatsapp_conversation_state_arsiv_idx ON public.whatsapp_conversation_state USING btree (organization_id) WHERE (archived_at IS NOT NULL);

CREATE INDEX whatsapp_messages_medya_bekleyen_idx ON public.whatsapp_messages USING btree (organization_id, created_at) WHERE (media_status = 'pending'::text);

CREATE INDEX whatsapp_messages_org_idx ON public.whatsapp_messages USING btree (organization_id, created_at DESC);

CREATE INDEX whatsapp_messages_sohbet_idx ON public.whatsapp_messages USING btree (organization_id, counterpart_phone, created_at DESC);

CREATE INDEX whatsapp_messages_wa_id_idx ON public.whatsapp_messages USING btree (wa_message_id) WHERE (wa_message_id IS NOT NULL);

CREATE UNIQUE INDEX whatsapp_messages_inbound_uniq ON public.whatsapp_messages USING btree (wa_message_id) WHERE ((direction = 'inbound'::text) AND (wa_message_id IS NOT NULL));

CREATE INDEX whatsapp_quick_replies_org_idx ON public.whatsapp_quick_replies USING btree (organization_id, sort_index, created_at);

CREATE UNIQUE INDEX whatsapp_quick_replies_baslik_uniq ON public.whatsapp_quick_replies USING btree (organization_id, lower(btrim(title)));

alter table public.account_entries add constraint account_entries_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE RESTRICT;

alter table public.account_entries add constraint account_entries_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;

alter table public.account_entries add constraint account_entries_party_org_fk FOREIGN KEY (party_id, organization_id) REFERENCES account_parties(id, organization_id) ON DELETE CASCADE;

alter table public.account_parties add constraint account_parties_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE RESTRICT;

alter table public.account_parties add constraint account_parties_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;

alter table public.activity_logs add constraint activity_logs_actor_user_id_fkey FOREIGN KEY (actor_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

alter table public.activity_logs add constraint activity_logs_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;

alter table public.arc_collection_products add constraint arc_collection_products_collection_id_organization_id_fkey FOREIGN KEY (collection_id, organization_id) REFERENCES arc_collections(id, organization_id) ON DELETE CASCADE;

alter table public.arc_collection_products add constraint arc_collection_products_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;

alter table public.arc_collection_products add constraint arc_collection_products_product_id_organization_id_fkey FOREIGN KEY (product_id, organization_id) REFERENCES arc_products(id, organization_id) ON DELETE CASCADE;

alter table public.arc_collections add constraint arc_collections_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;

alter table public.arc_customer_addresses add constraint arc_customer_addresses_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

alter table public.arc_customer_favourites add constraint arc_customer_favourites_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

alter table public.arc_discounts add constraint arc_discounts_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;

alter table public.arc_import_batches add constraint arc_import_batches_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

alter table public.arc_import_batches add constraint arc_import_batches_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;

alter table public.arc_import_errors add constraint arc_import_errors_batch_id_fkey FOREIGN KEY (batch_id) REFERENCES arc_import_batches(id) ON DELETE CASCADE;

alter table public.arc_import_errors add constraint arc_import_errors_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;

alter table public.arc_inventory_movements add constraint arc_inventory_movements_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

alter table public.arc_inventory_movements add constraint arc_inventory_movements_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;

alter table public.arc_inventory_movements add constraint arc_inventory_movements_variant_id_organization_id_fkey FOREIGN KEY (variant_id, organization_id) REFERENCES arc_product_variants(id, organization_id) ON DELETE CASCADE;

alter table public.arc_order_events add constraint arc_order_events_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

alter table public.arc_order_events add constraint arc_order_events_order_id_organization_id_fkey FOREIGN KEY (order_id, organization_id) REFERENCES arc_orders(id, organization_id) ON DELETE CASCADE;

alter table public.arc_order_events add constraint arc_order_events_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;

alter table public.arc_order_items add constraint arc_order_items_order_id_organization_id_fkey FOREIGN KEY (order_id, organization_id) REFERENCES arc_orders(id, organization_id) ON DELETE CASCADE;

alter table public.arc_order_items add constraint arc_order_items_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;

alter table public.arc_order_items add constraint arc_order_items_variant_id_organization_id_fkey FOREIGN KEY (variant_id, organization_id) REFERENCES arc_product_variants(id, organization_id) ON DELETE SET NULL;

alter table public.arc_orders add constraint arc_orders_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;

alter table public.arc_orders add constraint arc_orders_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id);

alter table public.arc_product_variants add constraint arc_product_variants_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;

alter table public.arc_product_variants add constraint arc_product_variants_product_id_fkey FOREIGN KEY (product_id) REFERENCES arc_products(id) ON DELETE CASCADE;

alter table public.arc_products add constraint arc_products_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

alter table public.arc_products add constraint arc_products_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;

alter table public.arc_return_requests add constraint arc_return_requests_order_id_fkey FOREIGN KEY (order_id) REFERENCES arc_orders(id) ON DELETE CASCADE;

alter table public.arc_return_requests add constraint arc_return_requests_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;

alter table public.arc_return_requests add constraint arc_return_requests_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

alter table public.arc_store_settings add constraint arc_store_settings_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;

alter table public.arc_store_themes add constraint arc_store_themes_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;

alter table public.arc_store_themes add constraint arc_store_themes_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;

alter table public.arc_suppliers add constraint arc_suppliers_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;

alter table public.bank_transactions add constraint bank_transactions_account_org_fk FOREIGN KEY (bank_account_id, organization_id) REFERENCES organization_bank_accounts(id, organization_id) ON DELETE CASCADE;

alter table public.bank_transactions add constraint bank_transactions_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE RESTRICT;

alter table public.bank_transactions add constraint bank_transactions_invoice_org_fk FOREIGN KEY (matched_invoice_id, organization_id) REFERENCES billing_invoices(id, organization_id);

alter table public.bank_transactions add constraint bank_transactions_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;

alter table public.bank_transactions add constraint bank_transactions_party_org_fk FOREIGN KEY (matched_party_id, organization_id) REFERENCES account_parties(id, organization_id);

alter table public.billing_customers add constraint billing_customers_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;

alter table public.billing_events add constraint billing_events_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE SET NULL;

alter table public.billing_invoices add constraint billing_invoices_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;

alter table public.billing_invoices add constraint billing_invoices_subscription_id_fkey FOREIGN KEY (subscription_id) REFERENCES billing_subscriptions(id) ON DELETE SET NULL;

alter table public.billing_subscriptions add constraint billing_subscriptions_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;

alter table public.contract_cost_items add constraint contract_cost_items_contract_id_fkey FOREIGN KEY (contract_id) REFERENCES crm_contracts(id) ON DELETE CASCADE;

alter table public.contract_cost_items add constraint contract_cost_items_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);

alter table public.contract_cost_items add constraint contract_cost_items_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;

alter table public.crm_appointments add constraint crm_appointments_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);

alter table public.crm_appointments add constraint crm_appointments_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES hr_employees(id) ON DELETE CASCADE;

alter table public.crm_appointments add constraint crm_appointments_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;

alter table public.crm_automation_runs add constraint crm_automation_runs_invoice_id_fkey FOREIGN KEY (invoice_id) REFERENCES billing_invoices(id) ON DELETE SET NULL;

alter table public.crm_automation_runs add constraint crm_automation_runs_opportunity_id_fkey FOREIGN KEY (opportunity_id) REFERENCES crm_opportunities(id) ON DELETE CASCADE;

alter table public.crm_automation_runs add constraint crm_automation_runs_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;

alter table public.crm_automation_runs add constraint crm_automation_runs_workflow_id_fkey FOREIGN KEY (workflow_id) REFERENCES operation_workflows(id) ON DELETE SET NULL;

alter table public.crm_contract_addenda add constraint crm_contract_addenda_cancelled_by_fkey FOREIGN KEY (cancelled_by) REFERENCES auth.users(id) ON DELETE SET NULL;

alter table public.crm_contract_addenda add constraint crm_contract_addenda_contract_id_fkey FOREIGN KEY (contract_id) REFERENCES crm_contracts(id) ON DELETE CASCADE;

alter table public.crm_contract_addenda add constraint crm_contract_addenda_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

alter table public.crm_contract_addenda add constraint crm_contract_addenda_opportunity_id_fkey FOREIGN KEY (opportunity_id) REFERENCES crm_opportunities(id) ON DELETE CASCADE;

alter table public.crm_contract_addenda add constraint crm_contract_addenda_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;

alter table public.crm_contracts add constraint crm_contracts_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);

alter table public.crm_contracts add constraint crm_contracts_invoice_id_fkey FOREIGN KEY (invoice_id) REFERENCES billing_invoices(id) ON DELETE SET NULL;

alter table public.crm_contracts add constraint crm_contracts_opportunity_id_fkey FOREIGN KEY (opportunity_id) REFERENCES crm_opportunities(id) ON DELETE CASCADE;

alter table public.crm_contracts add constraint crm_contracts_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;

alter table public.crm_contracts add constraint crm_contracts_payment_plan_id_fkey FOREIGN KEY (payment_plan_id) REFERENCES payment_plans(id) ON DELETE SET NULL;

alter table public.crm_contracts add constraint crm_contracts_proposal_id_fkey FOREIGN KEY (proposal_id) REFERENCES crm_proposals(id);

alter table public.crm_contracts add constraint crm_contracts_service_cost_transaction_id_fkey FOREIGN KEY (service_cost_transaction_id) REFERENCES finance_transactions(id) ON DELETE SET NULL;

alter table public.crm_contracts add constraint crm_contracts_workflow_id_fkey FOREIGN KEY (workflow_id) REFERENCES operation_workflows(id) ON DELETE SET NULL;

alter table public.crm_internal_comments add constraint crm_internal_comments_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE RESTRICT;

alter table public.crm_internal_comments add constraint crm_internal_comments_opportunity_id_fkey FOREIGN KEY (opportunity_id) REFERENCES crm_opportunities(id) ON DELETE CASCADE;

alter table public.crm_internal_comments add constraint crm_internal_comments_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;

alter table public.crm_opportunities add constraint crm_opportunities_assigned_employee_id_fkey FOREIGN KEY (assigned_employee_id) REFERENCES hr_employees(id) ON DELETE SET NULL;

alter table public.crm_opportunities add constraint crm_opportunities_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE RESTRICT;

alter table public.crm_opportunities add constraint crm_opportunities_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;

alter table public.crm_opportunities add constraint crm_opportunities_owner_user_id_fkey FOREIGN KEY (owner_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

alter table public.crm_proposals add constraint crm_proposals_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);

alter table public.crm_proposals add constraint crm_proposals_opportunity_id_fkey FOREIGN KEY (opportunity_id) REFERENCES crm_opportunities(id) ON DELETE CASCADE;

alter table public.crm_proposals add constraint crm_proposals_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;

alter table public.crm_proposals add constraint crm_proposals_previous_revision_id_fkey FOREIGN KEY (previous_revision_id) REFERENCES crm_proposals(id) ON DELETE SET NULL;

alter table public.crm_proposals add constraint crm_proposals_root_proposal_id_fkey FOREIGN KEY (root_proposal_id) REFERENCES crm_proposals(id) ON DELETE SET NULL;

alter table public.crm_proposals add constraint crm_proposals_superseded_by_fkey FOREIGN KEY (superseded_by) REFERENCES crm_proposals(id) ON DELETE SET NULL;

alter table public.crm_requests add constraint crm_requests_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);

alter table public.crm_requests add constraint crm_requests_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;

alter table public.customer_file_messages add constraint customer_file_messages_contract_id_fkey FOREIGN KEY (contract_id) REFERENCES crm_contracts(id) ON DELETE CASCADE;

alter table public.customer_file_messages add constraint customer_file_messages_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;

alter table public.customer_file_messages add constraint customer_file_messages_sender_user_id_fkey FOREIGN KEY (sender_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

alter table public.customer_file_messages add constraint customer_file_messages_workflow_id_fkey FOREIGN KEY (workflow_id) REFERENCES operation_workflows(id) ON DELETE SET NULL;

alter table public.document_access_logs add constraint document_access_logs_actor_user_id_fkey FOREIGN KEY (actor_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

alter table public.document_access_logs add constraint document_access_logs_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;

alter table public.document_number_sequences add constraint document_number_sequences_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;

alter table public.finance_transactions add constraint finance_transactions_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE RESTRICT;

alter table public.finance_transactions add constraint finance_transactions_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;

alter table public.finance_transactions add constraint finance_transactions_party_id_fkey FOREIGN KEY (party_id) REFERENCES account_parties(id) ON DELETE SET NULL;

alter table public.hr_confidentiality_agreements add constraint hr_confidentiality_agreements_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

alter table public.hr_confidentiality_agreements add constraint hr_confidentiality_agreements_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES hr_employees(id) ON DELETE CASCADE;

alter table public.hr_confidentiality_agreements add constraint hr_confidentiality_agreements_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;

alter table public.hr_departments add constraint hr_departments_manager_user_id_fkey FOREIGN KEY (manager_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

alter table public.hr_departments add constraint hr_departments_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;

alter table public.hr_employee_commission_rates add constraint hr_employee_commission_rates_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES hr_employees(id) ON DELETE CASCADE;

alter table public.hr_employee_commission_rates add constraint hr_employee_commission_rates_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;

alter table public.hr_employee_documents add constraint hr_employee_documents_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES hr_employees(id) ON DELETE CASCADE;

alter table public.hr_employee_documents add constraint hr_employee_documents_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;

alter table public.hr_employee_documents add constraint hr_employee_documents_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES auth.users(id);

alter table public.hr_employees add constraint hr_employees_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

alter table public.hr_employees add constraint hr_employees_department_id_fkey FOREIGN KEY (department_id) REFERENCES hr_departments(id) ON DELETE SET NULL;

alter table public.hr_employees add constraint hr_employees_manager_employee_id_fkey FOREIGN KEY (manager_employee_id) REFERENCES hr_employees(id) ON DELETE SET NULL;

alter table public.hr_employees add constraint hr_employees_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;

alter table public.hr_employees add constraint hr_employees_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

alter table public.hr_leave_requests add constraint hr_leave_requests_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);

alter table public.hr_leave_requests add constraint hr_leave_requests_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES hr_employees(id) ON DELETE CASCADE;

alter table public.hr_leave_requests add constraint hr_leave_requests_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;

alter table public.hr_leave_requests add constraint hr_leave_requests_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES auth.users(id) ON DELETE SET NULL;

alter table public.hr_operation_commissions add constraint hr_operation_commissions_contract_id_fkey FOREIGN KEY (contract_id) REFERENCES crm_contracts(id) ON DELETE SET NULL;

alter table public.hr_operation_commissions add constraint hr_operation_commissions_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES hr_employees(id) ON DELETE RESTRICT;

alter table public.hr_operation_commissions add constraint hr_operation_commissions_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;

alter table public.hr_operation_commissions add constraint hr_operation_commissions_workflow_id_fkey FOREIGN KEY (workflow_id) REFERENCES operation_workflows(id) ON DELETE RESTRICT;

alter table public.hr_sales_commissions add constraint hr_sales_commissions_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES hr_employees(id) ON DELETE CASCADE;

alter table public.hr_sales_commissions add constraint hr_sales_commissions_opportunity_id_fkey FOREIGN KEY (opportunity_id) REFERENCES crm_opportunities(id) ON DELETE SET NULL;

alter table public.hr_sales_commissions add constraint hr_sales_commissions_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;

alter table public.hr_sales_commissions add constraint hr_sales_commissions_payment_installment_id_fkey FOREIGN KEY (payment_installment_id) REFERENCES payment_installments(id) ON DELETE SET NULL;

alter table public.internal_messages add constraint internal_messages_channel_org_fk FOREIGN KEY (channel_id, organization_id) REFERENCES message_channels(id, organization_id) ON DELETE CASCADE;

alter table public.internal_messages add constraint internal_messages_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;

alter table public.internal_messages add constraint internal_messages_sender_id_fkey FOREIGN KEY (sender_id) REFERENCES auth.users(id) ON DELETE RESTRICT;

alter table public.message_channel_members add constraint message_channel_members_channel_org_fk FOREIGN KEY (channel_id, organization_id) REFERENCES message_channels(id, organization_id) ON DELETE CASCADE;

alter table public.message_channel_members add constraint message_channel_members_direct_channel_fk FOREIGN KEY (channel_id, organization_id, channel_created_by, channel_direct_key) REFERENCES message_channels(id, organization_id, created_by, direct_key) ON DELETE CASCADE;

alter table public.message_channel_members add constraint message_channel_members_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;

alter table public.message_channel_members add constraint message_channel_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

alter table public.message_channels add constraint message_channels_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE RESTRICT;

alter table public.message_channels add constraint message_channels_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;

alter table public.message_read_states add constraint message_read_states_channel_org_fk FOREIGN KEY (channel_id, organization_id) REFERENCES message_channels(id, organization_id) ON DELETE CASCADE;

alter table public.message_read_states add constraint message_read_states_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;

alter table public.message_read_states add constraint message_read_states_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

alter table public.notification_user_dismissals add constraint notification_user_dismissals_notification_id_fkey FOREIGN KEY (notification_id) REFERENCES notifications(id) ON DELETE CASCADE;

alter table public.notification_user_dismissals add constraint notification_user_dismissals_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

alter table public.notification_user_reads add constraint notification_user_reads_notification_id_fkey FOREIGN KEY (notification_id) REFERENCES notifications(id) ON DELETE CASCADE;

alter table public.notification_user_reads add constraint notification_user_reads_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

alter table public.notifications add constraint notifications_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;

alter table public.notifications add constraint notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

alter table public.operation_customer_file_downloads add constraint operation_customer_file_downloads_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;

alter table public.operation_customer_file_downloads add constraint operation_customer_file_downloads_workflow_id_fkey FOREIGN KEY (workflow_id) REFERENCES operation_workflows(id) ON DELETE CASCADE;

alter table public.operation_customer_files add constraint operation_customer_files_deleted_by_fkey FOREIGN KEY (deleted_by) REFERENCES auth.users(id) ON DELETE SET NULL;

alter table public.operation_customer_files add constraint operation_customer_files_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;

alter table public.operation_customer_files add constraint operation_customer_files_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES auth.users(id) ON DELETE SET NULL;

alter table public.operation_customer_files add constraint operation_customer_files_workflow_id_fkey FOREIGN KEY (workflow_id) REFERENCES operation_workflows(id) ON DELETE CASCADE;

alter table public.operation_steps add constraint operation_steps_completed_by_fkey FOREIGN KEY (completed_by) REFERENCES auth.users(id);

alter table public.operation_steps add constraint operation_steps_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;

alter table public.operation_steps add constraint operation_steps_workflow_org_fkey FOREIGN KEY (workflow_id, organization_id) REFERENCES operation_workflows(id, organization_id) ON DELETE CASCADE;

alter table public.operation_workflow_comments add constraint operation_workflow_comments_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

alter table public.operation_workflow_comments add constraint operation_workflow_comments_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;

alter table public.operation_workflow_comments add constraint operation_workflow_comments_workflow_id_fkey FOREIGN KEY (workflow_id) REFERENCES operation_workflows(id) ON DELETE CASCADE;

alter table public.operation_workflows add constraint operation_workflows_archived_by_fkey FOREIGN KEY (archived_by) REFERENCES auth.users(id) ON DELETE SET NULL;

alter table public.operation_workflows add constraint operation_workflows_assigned_employee_id_fkey FOREIGN KEY (assigned_employee_id) REFERENCES hr_employees(id) ON DELETE SET NULL;

alter table public.operation_workflows add constraint operation_workflows_contract_id_fkey FOREIGN KEY (contract_id) REFERENCES crm_contracts(id) ON DELETE SET NULL;

alter table public.operation_workflows add constraint operation_workflows_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);

alter table public.operation_workflows add constraint operation_workflows_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;

alter table public.organization_bank_accounts add constraint organization_bank_accounts_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE RESTRICT;

alter table public.organization_bank_accounts add constraint organization_bank_accounts_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;

alter table public.organization_crm_stages add constraint organization_crm_stages_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;

alter table public.organization_form_templates add constraint organization_form_templates_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

alter table public.organization_form_templates add constraint organization_form_templates_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;

alter table public.organization_invitations add constraint organization_invitations_auth_user_id_fkey FOREIGN KEY (auth_user_id) REFERENCES auth.users(id);

alter table public.organization_invitations add constraint organization_invitations_invited_by_fkey FOREIGN KEY (invited_by) REFERENCES auth.users(id);

alter table public.organization_invitations add constraint organization_invitations_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;

alter table public.organization_licenses add constraint organization_licenses_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;

alter table public.organization_licenses add constraint organization_licenses_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;

alter table public.organization_memberships add constraint organization_memberships_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;

alter table public.organization_memberships add constraint organization_memberships_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

alter table public.organization_modules add constraint organization_modules_module_code_fkey FOREIGN KEY (module_code) REFERENCES arvo_modules(code);

alter table public.organization_modules add constraint organization_modules_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;

alter table public.organization_onboarding add constraint organization_onboarding_completed_by_fkey FOREIGN KEY (completed_by) REFERENCES auth.users(id) ON DELETE SET NULL;

alter table public.organization_onboarding add constraint organization_onboarding_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;

alter table public.organization_payment_providers add constraint organization_payment_providers_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;

alter table public.organization_payment_providers add constraint organization_payment_providers_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;

alter table public.organization_payment_requests add constraint organization_payment_requests_bank_account_id_fkey FOREIGN KEY (bank_account_id) REFERENCES platform_bank_accounts(id);

alter table public.organization_payment_requests add constraint organization_payment_requests_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;

alter table public.organization_payment_requests add constraint organization_payment_requests_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES auth.users(id);

alter table public.organization_payment_requests add constraint organization_payment_requests_submitted_by_fkey FOREIGN KEY (submitted_by) REFERENCES auth.users(id);

alter table public.organization_product_licenses add constraint organization_product_licenses_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;

alter table public.organization_product_licenses add constraint organization_product_licenses_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id);

alter table public.organization_vertical_profiles add constraint organization_vertical_profiles_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;

alter table public.organizations add constraint organizations_plan_code_fkey FOREIGN KEY (plan_code) REFERENCES plans(code);

alter table public.payment_installments add constraint payment_installments_notice_sent_by_fkey FOREIGN KEY (notice_sent_by) REFERENCES auth.users(id) ON DELETE SET NULL;

alter table public.payment_installments add constraint payment_installments_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;

alter table public.payment_installments add constraint payment_installments_payment_plan_id_fkey FOREIGN KEY (payment_plan_id) REFERENCES payment_plans(id) ON DELETE CASCADE;

alter table public.payment_links add constraint payment_links_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE RESTRICT;

alter table public.payment_links add constraint payment_links_installment_id_fkey FOREIGN KEY (installment_id) REFERENCES payment_installments(id) ON DELETE CASCADE;

alter table public.payment_links add constraint payment_links_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;

alter table public.payment_links add constraint payment_links_payer_organization_id_fkey FOREIGN KEY (payer_organization_id) REFERENCES organizations(id) ON DELETE CASCADE;

alter table public.payment_links add constraint payment_links_subscriber_id_fkey FOREIGN KEY (subscriber_id) REFERENCES product_subscribers(id) ON DELETE CASCADE;

alter table public.payment_plans add constraint payment_plans_contract_id_fkey FOREIGN KEY (contract_id) REFERENCES crm_contracts(id) ON DELETE CASCADE;

alter table public.payment_plans add constraint payment_plans_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);

alter table public.payment_plans add constraint payment_plans_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;

alter table public.payment_plans add constraint payment_plans_organization_id_party_id_fkey FOREIGN KEY (organization_id, party_id) REFERENCES account_parties(organization_id, id);

alter table public.payment_provider_events add constraint payment_provider_events_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;

alter table public.payment_provider_events add constraint payment_provider_events_payment_link_id_fkey FOREIGN KEY (payment_link_id) REFERENCES payment_links(id) ON DELETE SET NULL;

alter table public.platform_subscription_requests add constraint platform_subscription_requests_contract_id_fkey FOREIGN KEY (contract_id) REFERENCES crm_contracts(id) ON DELETE CASCADE;

alter table public.platform_subscription_requests add constraint platform_subscription_requests_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES auth.users(id) ON DELETE SET NULL;

alter table public.platform_subscription_requests add constraint platform_subscription_requests_source_organization_id_fkey FOREIGN KEY (source_organization_id) REFERENCES organizations(id) ON DELETE CASCADE;

alter table public.platform_subscription_requests add constraint platform_subscription_requests_target_organization_id_fkey FOREIGN KEY (target_organization_id) REFERENCES organizations(id) ON DELETE SET NULL;

alter table public.product_plans add constraint product_plans_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id);

alter table public.product_subscribers add constraint product_subscribers_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id);

alter table public.profiles add constraint profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;

alter table public.provisioning_audit_logs add constraint provisioning_audit_logs_actor_user_id_fkey FOREIGN KEY (actor_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

alter table public.provisioning_audit_logs add constraint provisioning_audit_logs_invitation_id_fkey FOREIGN KEY (invitation_id) REFERENCES organization_invitations(id) ON DELETE SET NULL;

alter table public.provisioning_audit_logs add constraint provisioning_audit_logs_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE SET NULL;

alter table public.role_module_permissions add constraint role_module_permissions_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;

alter table public.role_module_permissions add constraint role_module_permissions_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id);

alter table public.subscriber_payments add constraint subscriber_payments_subscriber_id_fkey FOREIGN KEY (subscriber_id) REFERENCES product_subscribers(id) ON DELETE CASCADE;

alter table public.support_messages add constraint support_messages_author_id_fkey FOREIGN KEY (author_id) REFERENCES auth.users(id) ON DELETE RESTRICT;

alter table public.support_messages add constraint support_messages_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;

alter table public.support_messages add constraint support_messages_ticket_org_fk FOREIGN KEY (ticket_id, organization_id) REFERENCES support_tickets(id, organization_id) ON DELETE CASCADE;

alter table public.support_tickets add constraint support_tickets_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE RESTRICT;

alter table public.support_tickets add constraint support_tickets_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;

alter table public.user_presence add constraint user_presence_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;

alter table public.user_presence add constraint user_presence_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

alter table public.user_session_logs add constraint user_session_logs_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES hr_employees(id) ON DELETE SET NULL;

alter table public.user_session_logs add constraint user_session_logs_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;

alter table public.user_session_logs add constraint user_session_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

alter table public.whatsapp_accounts add constraint whatsapp_accounts_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;

alter table public.whatsapp_conversation_state add constraint whatsapp_conversation_state_archived_by_fkey FOREIGN KEY (archived_by) REFERENCES auth.users(id) ON DELETE SET NULL;

alter table public.whatsapp_conversation_state add constraint whatsapp_conversation_state_last_read_by_fkey FOREIGN KEY (last_read_by) REFERENCES auth.users(id) ON DELETE SET NULL;

alter table public.whatsapp_conversation_state add constraint whatsapp_conversation_state_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;

alter table public.whatsapp_messages add constraint whatsapp_messages_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;

alter table public.whatsapp_quick_replies add constraint whatsapp_quick_replies_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

alter table public.whatsapp_quick_replies add constraint whatsapp_quick_replies_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;

alter table public.account_entries enable row level security;

alter table public.account_parties enable row level security;

alter table public.activity_logs enable row level security;

alter table public.arc_collection_products enable row level security;

alter table public.arc_collections enable row level security;

alter table public.arc_customer_addresses enable row level security;

alter table public.arc_customer_favourites enable row level security;

alter table public.arc_discounts enable row level security;

alter table public.arc_import_batches enable row level security;

alter table public.arc_import_errors enable row level security;

alter table public.arc_inventory_movements enable row level security;

alter table public.arc_order_events enable row level security;

alter table public.arc_order_items enable row level security;

alter table public.arc_orders enable row level security;

alter table public.arc_payment_orders enable row level security;

alter table public.arc_product_variants enable row level security;

alter table public.arc_products enable row level security;

alter table public.arc_return_requests enable row level security;

alter table public.arc_store_settings enable row level security;

alter table public.arc_store_themes enable row level security;

alter table public.arc_suppliers enable row level security;

alter table public.arvo_modules enable row level security;

alter table public.bank_transactions enable row level security;

alter table public.billing_customers enable row level security;

alter table public.billing_events enable row level security;

alter table public.billing_invoices enable row level security;

alter table public.billing_subscriptions enable row level security;

alter table public.contract_cost_items enable row level security;

alter table public.crm_appointments enable row level security;

alter table public.crm_automation_runs enable row level security;

alter table public.crm_contract_addenda enable row level security;

alter table public.crm_contracts enable row level security;

alter table public.crm_internal_comments enable row level security;

alter table public.crm_opportunities enable row level security;

alter table public.crm_proposals enable row level security;

alter table public.crm_requests enable row level security;

alter table public.customer_file_messages enable row level security;

alter table public.document_access_logs enable row level security;

alter table public.document_number_sequences enable row level security;

alter table public.finance_transactions enable row level security;

alter table public.hr_confidentiality_agreements enable row level security;

alter table public.hr_departments enable row level security;

alter table public.hr_employee_commission_rates enable row level security;

alter table public.hr_employee_documents enable row level security;

alter table public.hr_employees enable row level security;

alter table public.hr_leave_requests enable row level security;

alter table public.hr_operation_commissions enable row level security;

alter table public.hr_sales_commissions enable row level security;

alter table public.internal_messages enable row level security;

alter table public.message_channel_members enable row level security;

alter table public.message_channels enable row level security;

alter table public.message_read_states enable row level security;

alter table public.notification_user_dismissals enable row level security;

alter table public.notification_user_reads enable row level security;

alter table public.notifications enable row level security;

alter table public.operation_customer_file_downloads enable row level security;

alter table public.operation_customer_files enable row level security;

alter table public.operation_steps enable row level security;

alter table public.operation_workflow_comments enable row level security;

alter table public.operation_workflows enable row level security;

alter table public.organization_bank_accounts enable row level security;

alter table public.organization_crm_stages enable row level security;

alter table public.organization_form_templates enable row level security;

alter table public.organization_invitations enable row level security;

alter table public.organization_licenses enable row level security;

alter table public.organization_memberships enable row level security;

alter table public.organization_modules enable row level security;

alter table public.organization_onboarding enable row level security;

alter table public.organization_payment_providers enable row level security;

alter table public.organization_payment_requests enable row level security;

alter table public.organization_product_licenses enable row level security;

alter table public.organization_vertical_profiles enable row level security;

alter table public.organizations enable row level security;

alter table public.payment_installments enable row level security;

alter table public.payment_links enable row level security;

alter table public.payment_plans enable row level security;

alter table public.payment_provider_events enable row level security;

alter table public.plans enable row level security;

alter table public.platform_bank_accounts enable row level security;

alter table public.platform_subscription_requests enable row level security;

alter table public.product_plans enable row level security;

alter table public.product_subscribers enable row level security;

alter table public.profiles enable row level security;

alter table public.provisioning_audit_logs enable row level security;

alter table public.role_module_permissions enable row level security;

alter table public.site_lead_attempts enable row level security;

alter table public.subscriber_payments enable row level security;

alter table public.support_messages enable row level security;

alter table public.support_tickets enable row level security;

alter table public.tracking_lookup_attempts enable row level security;

alter table public.user_presence enable row level security;

alter table public.user_session_logs enable row level security;

alter table public.whatsapp_accounts enable row level security;

alter table public.whatsapp_conversation_state enable row level security;

alter table public.whatsapp_messages enable row level security;

alter table public.whatsapp_quick_replies enable row level security;

create policy members_read_own_account_entries on public.account_entries as PERMISSIVE for SELECT to authenticated
  using ((EXISTS ( SELECT 1
   FROM organization_memberships m
  WHERE ((m.organization_id = account_entries.organization_id) AND (m.user_id = ( SELECT auth.uid() AS uid)) AND m.is_active))));

create policy owners_create_account_entries on public.account_entries as PERMISSIVE for INSERT to authenticated
  with check (((created_by = ( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1
   FROM organization_memberships m
  WHERE ((m.organization_id = account_entries.organization_id) AND (m.user_id = ( SELECT auth.uid() AS uid)) AND m.is_active AND (m.role = ANY (ARRAY['owner'::membership_role, 'admin'::membership_role]))))) AND (EXISTS ( SELECT 1
   FROM account_parties p
  WHERE ((p.id = account_entries.party_id) AND (p.organization_id = account_entries.organization_id))))));

create policy owners_delete_account_entries on public.account_entries as PERMISSIVE for DELETE to authenticated
  using ((EXISTS ( SELECT 1
   FROM organization_memberships m
  WHERE ((m.organization_id = account_entries.organization_id) AND (m.user_id = ( SELECT auth.uid() AS uid)) AND m.is_active AND (m.role = ANY (ARRAY['owner'::membership_role, 'admin'::membership_role]))))));

create policy owners_update_account_entries on public.account_entries as PERMISSIVE for UPDATE to authenticated
  using ((EXISTS ( SELECT 1
   FROM organization_memberships m
  WHERE ((m.organization_id = account_entries.organization_id) AND (m.user_id = ( SELECT auth.uid() AS uid)) AND m.is_active AND (m.role = ANY (ARRAY['owner'::membership_role, 'admin'::membership_role]))))))
  with check (((EXISTS ( SELECT 1
   FROM organization_memberships m
  WHERE ((m.organization_id = account_entries.organization_id) AND (m.user_id = ( SELECT auth.uid() AS uid)) AND m.is_active AND (m.role = ANY (ARRAY['owner'::membership_role, 'admin'::membership_role]))))) AND (EXISTS ( SELECT 1
   FROM account_parties p
  WHERE ((p.id = account_entries.party_id) AND (p.organization_id = account_entries.organization_id))))));

create policy members_read_own_account_parties on public.account_parties as PERMISSIVE for SELECT to authenticated
  using ((EXISTS ( SELECT 1
   FROM organization_memberships m
  WHERE ((m.organization_id = account_parties.organization_id) AND (m.user_id = ( SELECT auth.uid() AS uid)) AND m.is_active))));

create policy owners_manage_account_parties on public.account_parties as PERMISSIVE for ALL to authenticated
  using ((EXISTS ( SELECT 1
   FROM organization_memberships m
  WHERE ((m.organization_id = account_parties.organization_id) AND (m.user_id = ( SELECT auth.uid() AS uid)) AND m.is_active AND (m.role = ANY (ARRAY['owner'::membership_role, 'admin'::membership_role]))))))
  with check ((EXISTS ( SELECT 1
   FROM organization_memberships m
  WHERE ((m.organization_id = account_parties.organization_id) AND (m.user_id = ( SELECT auth.uid() AS uid)) AND m.is_active AND (m.role = ANY (ARRAY['owner'::membership_role, 'admin'::membership_role]))))));

create policy activity_logs_insert on public.activity_logs as PERMISSIVE for INSERT to authenticated
  with check (((actor_user_id = ( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1
   FROM organization_memberships m
  WHERE ((m.organization_id = activity_logs.organization_id) AND (m.user_id = ( SELECT auth.uid() AS uid)) AND (m.is_active = true))))));

create policy activity_logs_select_crm_chain on public.activity_logs as PERMISSIVE for SELECT to authenticated
  using (((entity_type = ANY (ARRAY['crm_opportunity'::text, 'crm_proposal'::text, 'crm_contract'::text])) AND (EXISTS ( SELECT 1
   FROM organization_memberships m
  WHERE ((m.organization_id = activity_logs.organization_id) AND (m.user_id = ( SELECT auth.uid() AS uid)) AND (m.is_active = true)))) AND (EXISTS ( SELECT 1
   FROM crm_opportunities o
  WHERE ((o.organization_id = activity_logs.organization_id) AND ((o.id)::text = COALESCE((activity_logs.metadata ->> 'opportunity_id'::text), activity_logs.entity_id)) AND private.arvo_can_access_opportunity(o.id))))));

create policy "arc managers delete collection products" on public.arc_collection_products as PERMISSIVE for DELETE to authenticated
  using ((EXISTS ( SELECT 1
   FROM organization_memberships m
  WHERE ((m.organization_id = arc_collection_products.organization_id) AND (m.user_id = ( SELECT auth.uid() AS uid)) AND (m.is_active = true) AND ((m.role)::text = ANY (ARRAY['owner'::text, 'admin'::text, 'manager'::text]))))));

create policy "arc managers insert collection products" on public.arc_collection_products as PERMISSIVE for INSERT to authenticated
  with check ((EXISTS ( SELECT 1
   FROM organization_memberships m
  WHERE ((m.organization_id = arc_collection_products.organization_id) AND (m.user_id = ( SELECT auth.uid() AS uid)) AND (m.is_active = true) AND ((m.role)::text = ANY (ARRAY['owner'::text, 'admin'::text, 'manager'::text]))))));

create policy "arc managers update collection products" on public.arc_collection_products as PERMISSIVE for UPDATE to authenticated
  using ((EXISTS ( SELECT 1
   FROM organization_memberships m
  WHERE ((m.organization_id = arc_collection_products.organization_id) AND (m.user_id = ( SELECT auth.uid() AS uid)) AND (m.is_active = true) AND ((m.role)::text = ANY (ARRAY['owner'::text, 'admin'::text, 'manager'::text]))))))
  with check ((EXISTS ( SELECT 1
   FROM organization_memberships m
  WHERE ((m.organization_id = arc_collection_products.organization_id) AND (m.user_id = ( SELECT auth.uid() AS uid)) AND (m.is_active = true) AND ((m.role)::text = ANY (ARRAY['owner'::text, 'admin'::text, 'manager'::text]))))));

create policy "arc members read collection products" on public.arc_collection_products as PERMISSIVE for SELECT to authenticated
  using ((EXISTS ( SELECT 1
   FROM organization_memberships m
  WHERE ((m.organization_id = arc_collection_products.organization_id) AND (m.user_id = ( SELECT auth.uid() AS uid)) AND (m.is_active = true)))));

create policy "arc managers delete collections" on public.arc_collections as PERMISSIVE for DELETE to authenticated
  using ((EXISTS ( SELECT 1
   FROM organization_memberships m
  WHERE ((m.organization_id = arc_collections.organization_id) AND (m.user_id = ( SELECT auth.uid() AS uid)) AND (m.is_active = true) AND ((m.role)::text = ANY (ARRAY['owner'::text, 'admin'::text, 'manager'::text]))))));

create policy "arc managers insert collections" on public.arc_collections as PERMISSIVE for INSERT to authenticated
  with check ((EXISTS ( SELECT 1
   FROM organization_memberships m
  WHERE ((m.organization_id = arc_collections.organization_id) AND (m.user_id = ( SELECT auth.uid() AS uid)) AND (m.is_active = true) AND ((m.role)::text = ANY (ARRAY['owner'::text, 'admin'::text, 'manager'::text]))))));

create policy "arc managers update collections" on public.arc_collections as PERMISSIVE for UPDATE to authenticated
  using ((EXISTS ( SELECT 1
   FROM organization_memberships m
  WHERE ((m.organization_id = arc_collections.organization_id) AND (m.user_id = ( SELECT auth.uid() AS uid)) AND (m.is_active = true) AND ((m.role)::text = ANY (ARRAY['owner'::text, 'admin'::text, 'manager'::text]))))))
  with check ((EXISTS ( SELECT 1
   FROM organization_memberships m
  WHERE ((m.organization_id = arc_collections.organization_id) AND (m.user_id = ( SELECT auth.uid() AS uid)) AND (m.is_active = true) AND ((m.role)::text = ANY (ARRAY['owner'::text, 'admin'::text, 'manager'::text]))))));

create policy "arc members read collections" on public.arc_collections as PERMISSIVE for SELECT to authenticated
  using ((EXISTS ( SELECT 1
   FROM organization_memberships m
  WHERE ((m.organization_id = arc_collections.organization_id) AND (m.user_id = ( SELECT auth.uid() AS uid)) AND (m.is_active = true)))));

create policy arc_addresses_owner_delete on public.arc_customer_addresses as PERMISSIVE for DELETE to authenticated
  using ((user_id = auth.uid()));

create policy arc_addresses_owner_insert on public.arc_customer_addresses as PERMISSIVE for INSERT to authenticated
  with check ((user_id = auth.uid()));

create policy arc_addresses_owner_select on public.arc_customer_addresses as PERMISSIVE for SELECT to authenticated
  using ((user_id = auth.uid()));

create policy arc_addresses_owner_update on public.arc_customer_addresses as PERMISSIVE for UPDATE to authenticated
  using ((user_id = auth.uid()))
  with check ((user_id = auth.uid()));

create policy arc_customer_favourites_delete_own on public.arc_customer_favourites as PERMISSIVE for DELETE to authenticated
  using ((user_id = ( SELECT auth.uid() AS uid)));

create policy arc_customer_favourites_insert_own on public.arc_customer_favourites as PERMISSIVE for INSERT to authenticated
  with check ((user_id = ( SELECT auth.uid() AS uid)));

create policy arc_customer_favourites_select_own on public.arc_customer_favourites as PERMISSIVE for SELECT to authenticated
  using ((user_id = ( SELECT auth.uid() AS uid)));

create policy "arc managers delete discounts" on public.arc_discounts as PERMISSIVE for DELETE to authenticated
  using ((EXISTS ( SELECT 1
   FROM organization_memberships m
  WHERE ((m.organization_id = arc_discounts.organization_id) AND (m.user_id = ( SELECT auth.uid() AS uid)) AND (m.is_active = true) AND ((m.role)::text = ANY (ARRAY['owner'::text, 'admin'::text, 'manager'::text]))))));

create policy "arc managers insert discounts" on public.arc_discounts as PERMISSIVE for INSERT to authenticated
  with check ((EXISTS ( SELECT 1
   FROM organization_memberships m
  WHERE ((m.organization_id = arc_discounts.organization_id) AND (m.user_id = ( SELECT auth.uid() AS uid)) AND (m.is_active = true) AND ((m.role)::text = ANY (ARRAY['owner'::text, 'admin'::text, 'manager'::text]))))));

create policy "arc managers update discounts" on public.arc_discounts as PERMISSIVE for UPDATE to authenticated
  using ((EXISTS ( SELECT 1
   FROM organization_memberships m
  WHERE ((m.organization_id = arc_discounts.organization_id) AND (m.user_id = ( SELECT auth.uid() AS uid)) AND (m.is_active = true) AND ((m.role)::text = ANY (ARRAY['owner'::text, 'admin'::text, 'manager'::text]))))))
  with check ((EXISTS ( SELECT 1
   FROM organization_memberships m
  WHERE ((m.organization_id = arc_discounts.organization_id) AND (m.user_id = ( SELECT auth.uid() AS uid)) AND (m.is_active = true) AND ((m.role)::text = ANY (ARRAY['owner'::text, 'admin'::text, 'manager'::text]))))));

create policy "arc members read discounts" on public.arc_discounts as PERMISSIVE for SELECT to authenticated
  using ((EXISTS ( SELECT 1
   FROM organization_memberships m
  WHERE ((m.organization_id = arc_discounts.organization_id) AND (m.user_id = ( SELECT auth.uid() AS uid)) AND (m.is_active = true)))));

create policy "arc managers manage import batches" on public.arc_import_batches as PERMISSIVE for ALL to authenticated
  using ((EXISTS ( SELECT 1
   FROM organization_memberships m
  WHERE ((m.organization_id = arc_import_batches.organization_id) AND (m.user_id = ( SELECT auth.uid() AS uid)) AND (m.is_active = true) AND (m.role = ANY (ARRAY['owner'::membership_role, 'admin'::membership_role, 'manager'::membership_role]))))))
  with check ((EXISTS ( SELECT 1
   FROM organization_memberships m
  WHERE ((m.organization_id = arc_import_batches.organization_id) AND (m.user_id = ( SELECT auth.uid() AS uid)) AND (m.is_active = true) AND (m.role = ANY (ARRAY['owner'::membership_role, 'admin'::membership_role, 'manager'::membership_role]))))));

create policy "arc members read import batches" on public.arc_import_batches as PERMISSIVE for SELECT to authenticated
  using ((EXISTS ( SELECT 1
   FROM organization_memberships m
  WHERE ((m.organization_id = arc_import_batches.organization_id) AND (m.user_id = ( SELECT auth.uid() AS uid)) AND (m.is_active = true)))));

create policy "arc managers manage import errors" on public.arc_import_errors as PERMISSIVE for ALL to authenticated
  using ((EXISTS ( SELECT 1
   FROM organization_memberships m
  WHERE ((m.organization_id = arc_import_errors.organization_id) AND (m.user_id = ( SELECT auth.uid() AS uid)) AND (m.is_active = true) AND (m.role = ANY (ARRAY['owner'::membership_role, 'admin'::membership_role, 'manager'::membership_role]))))))
  with check ((EXISTS ( SELECT 1
   FROM organization_memberships m
  WHERE ((m.organization_id = arc_import_errors.organization_id) AND (m.user_id = ( SELECT auth.uid() AS uid)) AND (m.is_active = true) AND (m.role = ANY (ARRAY['owner'::membership_role, 'admin'::membership_role, 'manager'::membership_role]))))));

create policy "arc members read import errors" on public.arc_import_errors as PERMISSIVE for SELECT to authenticated
  using ((EXISTS ( SELECT 1
   FROM organization_memberships m
  WHERE ((m.organization_id = arc_import_errors.organization_id) AND (m.user_id = ( SELECT auth.uid() AS uid)) AND (m.is_active = true)))));

create policy "arc managers manage inventory" on public.arc_inventory_movements as PERMISSIVE for ALL to authenticated
  using ((EXISTS ( SELECT 1
   FROM organization_memberships m
  WHERE ((m.organization_id = arc_inventory_movements.organization_id) AND (m.user_id = ( SELECT auth.uid() AS uid)) AND (m.is_active = true) AND (m.role = ANY (ARRAY['owner'::membership_role, 'admin'::membership_role, 'manager'::membership_role]))))))
  with check ((EXISTS ( SELECT 1
   FROM organization_memberships m
  WHERE ((m.organization_id = arc_inventory_movements.organization_id) AND (m.user_id = ( SELECT auth.uid() AS uid)) AND (m.is_active = true) AND (m.role = ANY (ARRAY['owner'::membership_role, 'admin'::membership_role, 'manager'::membership_role]))))));

create policy "arc members read inventory" on public.arc_inventory_movements as PERMISSIVE for SELECT to authenticated
  using ((EXISTS ( SELECT 1
   FROM organization_memberships m
  WHERE ((m.organization_id = arc_inventory_movements.organization_id) AND (m.user_id = ( SELECT auth.uid() AS uid)) AND (m.is_active = true)))));

create policy "arc managers insert order events" on public.arc_order_events as PERMISSIVE for INSERT to authenticated
  with check ((EXISTS ( SELECT 1
   FROM organization_memberships m
  WHERE ((m.organization_id = arc_order_events.organization_id) AND (m.user_id = ( SELECT auth.uid() AS uid)) AND (m.is_active = true) AND ((m.role)::text = ANY (ARRAY['owner'::text, 'admin'::text, 'manager'::text]))))));

create policy "arc members read order events" on public.arc_order_events as PERMISSIVE for SELECT to authenticated
  using ((EXISTS ( SELECT 1
   FROM organization_memberships m
  WHERE ((m.organization_id = arc_order_events.organization_id) AND (m.user_id = ( SELECT auth.uid() AS uid)) AND (m.is_active = true)))));

create policy "arc managers manage order items" on public.arc_order_items as PERMISSIVE for ALL to authenticated
  using ((EXISTS ( SELECT 1
   FROM organization_memberships m
  WHERE ((m.organization_id = arc_order_items.organization_id) AND (m.user_id = ( SELECT auth.uid() AS uid)) AND (m.is_active = true) AND (m.role = ANY (ARRAY['owner'::membership_role, 'admin'::membership_role, 'manager'::membership_role]))))))
  with check ((EXISTS ( SELECT 1
   FROM organization_memberships m
  WHERE ((m.organization_id = arc_order_items.organization_id) AND (m.user_id = ( SELECT auth.uid() AS uid)) AND (m.is_active = true) AND (m.role = ANY (ARRAY['owner'::membership_role, 'admin'::membership_role, 'manager'::membership_role]))))));

create policy "arc members read order items" on public.arc_order_items as PERMISSIVE for SELECT to authenticated
  using ((EXISTS ( SELECT 1
   FROM organization_memberships m
  WHERE ((m.organization_id = arc_order_items.organization_id) AND (m.user_id = ( SELECT auth.uid() AS uid)) AND (m.is_active = true)))));

create policy arc_order_items_customer_select on public.arc_order_items as PERMISSIVE for SELECT to authenticated
  using ((EXISTS ( SELECT 1
   FROM arc_orders o
  WHERE ((o.id = arc_order_items.order_id) AND (o.user_id = auth.uid())))));

create policy "arc managers manage orders" on public.arc_orders as PERMISSIVE for ALL to authenticated
  using ((EXISTS ( SELECT 1
   FROM organization_memberships m
  WHERE ((m.organization_id = arc_orders.organization_id) AND (m.user_id = ( SELECT auth.uid() AS uid)) AND (m.is_active = true) AND (m.role = ANY (ARRAY['owner'::membership_role, 'admin'::membership_role, 'manager'::membership_role]))))))
  with check ((EXISTS ( SELECT 1
   FROM organization_memberships m
  WHERE ((m.organization_id = arc_orders.organization_id) AND (m.user_id = ( SELECT auth.uid() AS uid)) AND (m.is_active = true) AND (m.role = ANY (ARRAY['owner'::membership_role, 'admin'::membership_role, 'manager'::membership_role]))))));

create policy "arc members read orders" on public.arc_orders as PERMISSIVE for SELECT to authenticated
  using ((EXISTS ( SELECT 1
   FROM organization_memberships m
  WHERE ((m.organization_id = arc_orders.organization_id) AND (m.user_id = ( SELECT auth.uid() AS uid)) AND (m.is_active = true)))));

create policy arc_orders_customer_select on public.arc_orders as PERMISSIVE for SELECT to authenticated
  using ((user_id = auth.uid()));

create policy "arc managers manage variants" on public.arc_product_variants as PERMISSIVE for ALL to authenticated
  using ((EXISTS ( SELECT 1
   FROM organization_memberships m
  WHERE ((m.organization_id = arc_product_variants.organization_id) AND (m.user_id = ( SELECT auth.uid() AS uid)) AND (m.is_active = true) AND (m.role = ANY (ARRAY['owner'::membership_role, 'admin'::membership_role, 'manager'::membership_role]))))))
  with check ((EXISTS ( SELECT 1
   FROM organization_memberships m
  WHERE ((m.organization_id = arc_product_variants.organization_id) AND (m.user_id = ( SELECT auth.uid() AS uid)) AND (m.is_active = true) AND (m.role = ANY (ARRAY['owner'::membership_role, 'admin'::membership_role, 'manager'::membership_role]))))));

create policy "arc members read variants" on public.arc_product_variants as PERMISSIVE for SELECT to authenticated
  using ((EXISTS ( SELECT 1
   FROM organization_memberships m
  WHERE ((m.organization_id = arc_product_variants.organization_id) AND (m.user_id = ( SELECT auth.uid() AS uid)) AND (m.is_active = true)))));

create policy "arc managers manage products" on public.arc_products as PERMISSIVE for ALL to authenticated
  using ((EXISTS ( SELECT 1
   FROM organization_memberships m
  WHERE ((m.organization_id = arc_products.organization_id) AND (m.user_id = ( SELECT auth.uid() AS uid)) AND (m.is_active = true) AND (m.role = ANY (ARRAY['owner'::membership_role, 'admin'::membership_role, 'manager'::membership_role]))))))
  with check ((EXISTS ( SELECT 1
   FROM organization_memberships m
  WHERE ((m.organization_id = arc_products.organization_id) AND (m.user_id = ( SELECT auth.uid() AS uid)) AND (m.is_active = true) AND (m.role = ANY (ARRAY['owner'::membership_role, 'admin'::membership_role, 'manager'::membership_role]))))));

create policy "arc members read products" on public.arc_products as PERMISSIVE for SELECT to authenticated
  using ((EXISTS ( SELECT 1
   FROM organization_memberships m
  WHERE ((m.organization_id = arc_products.organization_id) AND (m.user_id = ( SELECT auth.uid() AS uid)) AND (m.is_active = true)))));

create policy "arc managers update returns" on public.arc_return_requests as PERMISSIVE for UPDATE to authenticated
  using ((EXISTS ( SELECT 1
   FROM organization_memberships m
  WHERE ((m.organization_id = arc_return_requests.organization_id) AND (m.user_id = ( SELECT auth.uid() AS uid)) AND (m.is_active = true) AND ((m.role)::text = ANY (ARRAY['owner'::text, 'admin'::text, 'manager'::text]))))));

create policy "arc members read returns" on public.arc_return_requests as PERMISSIVE for SELECT to authenticated
  using ((EXISTS ( SELECT 1
   FROM organization_memberships m
  WHERE ((m.organization_id = arc_return_requests.organization_id) AND (m.user_id = ( SELECT auth.uid() AS uid)) AND (m.is_active = true)))));

create policy "customers read own returns" on public.arc_return_requests as PERMISSIVE for SELECT to authenticated
  using ((user_id = ( SELECT auth.uid() AS uid)));

create policy "arc managers insert store settings" on public.arc_store_settings as PERMISSIVE for INSERT to authenticated
  with check ((EXISTS ( SELECT 1
   FROM organization_memberships membership
  WHERE ((membership.organization_id = arc_store_settings.organization_id) AND (membership.user_id = ( SELECT auth.uid() AS uid)) AND (membership.is_active = true) AND ((membership.role)::text = ANY (ARRAY['owner'::text, 'admin'::text, 'manager'::text]))))));

create policy "arc managers update store settings" on public.arc_store_settings as PERMISSIVE for UPDATE to authenticated
  using ((EXISTS ( SELECT 1
   FROM organization_memberships membership
  WHERE ((membership.organization_id = arc_store_settings.organization_id) AND (membership.user_id = ( SELECT auth.uid() AS uid)) AND (membership.is_active = true) AND ((membership.role)::text = ANY (ARRAY['owner'::text, 'admin'::text, 'manager'::text]))))))
  with check ((EXISTS ( SELECT 1
   FROM organization_memberships membership
  WHERE ((membership.organization_id = arc_store_settings.organization_id) AND (membership.user_id = ( SELECT auth.uid() AS uid)) AND (membership.is_active = true) AND ((membership.role)::text = ANY (ARRAY['owner'::text, 'admin'::text, 'manager'::text]))))));

create policy "arc members read store settings" on public.arc_store_settings as PERMISSIVE for SELECT to authenticated
  using ((EXISTS ( SELECT 1
   FROM organization_memberships membership
  WHERE ((membership.organization_id = arc_store_settings.organization_id) AND (membership.user_id = ( SELECT auth.uid() AS uid)) AND (membership.is_active = true)))));

create policy "arc managers delete store themes" on public.arc_store_themes as PERMISSIVE for DELETE to authenticated
  using (((mode = 'draft'::text) AND (EXISTS ( SELECT 1
   FROM organization_memberships m
  WHERE ((m.organization_id = arc_store_themes.organization_id) AND (m.user_id = ( SELECT auth.uid() AS uid)) AND (m.is_active = true) AND ((m.role)::text = ANY (ARRAY['owner'::text, 'admin'::text, 'manager'::text])))))));

create policy "arc managers insert store themes" on public.arc_store_themes as PERMISSIVE for INSERT to authenticated
  with check ((EXISTS ( SELECT 1
   FROM organization_memberships m
  WHERE ((m.organization_id = arc_store_themes.organization_id) AND (m.user_id = ( SELECT auth.uid() AS uid)) AND (m.is_active = true) AND ((m.role)::text = ANY (ARRAY['owner'::text, 'admin'::text, 'manager'::text]))))));

create policy "arc managers update store themes" on public.arc_store_themes as PERMISSIVE for UPDATE to authenticated
  using ((EXISTS ( SELECT 1
   FROM organization_memberships m
  WHERE ((m.organization_id = arc_store_themes.organization_id) AND (m.user_id = ( SELECT auth.uid() AS uid)) AND (m.is_active = true) AND ((m.role)::text = ANY (ARRAY['owner'::text, 'admin'::text, 'manager'::text]))))))
  with check ((EXISTS ( SELECT 1
   FROM organization_memberships m
  WHERE ((m.organization_id = arc_store_themes.organization_id) AND (m.user_id = ( SELECT auth.uid() AS uid)) AND (m.is_active = true) AND ((m.role)::text = ANY (ARRAY['owner'::text, 'admin'::text, 'manager'::text]))))));

create policy "arc members read store themes" on public.arc_store_themes as PERMISSIVE for SELECT to authenticated
  using ((EXISTS ( SELECT 1
   FROM organization_memberships m
  WHERE ((m.organization_id = arc_store_themes.organization_id) AND (m.user_id = ( SELECT auth.uid() AS uid)) AND (m.is_active = true)))));

create policy "public reads published store themes" on public.arc_store_themes as PERMISSIVE for SELECT to anon
  using ((mode = 'published'::text));

create policy arc_suppliers_admins_delete on public.arc_suppliers as PERMISSIVE for DELETE to authenticated
  using (private.arvo_is_org_admin(organization_id));

create policy arc_suppliers_admins_insert on public.arc_suppliers as PERMISSIVE for INSERT to authenticated
  with check (private.arvo_is_org_admin(organization_id));

create policy arc_suppliers_admins_update on public.arc_suppliers as PERMISSIVE for UPDATE to authenticated
  using (private.arvo_is_org_admin(organization_id))
  with check (private.arvo_is_org_admin(organization_id));

create policy arc_suppliers_members_read on public.arc_suppliers as PERMISSIVE for SELECT to authenticated
  using ((EXISTS ( SELECT 1
   FROM organization_memberships m
  WHERE ((m.organization_id = arc_suppliers.organization_id) AND (m.user_id = ( SELECT auth.uid() AS uid)) AND m.is_active))));

create policy authenticated_can_read_active_modules on public.arvo_modules as PERMISSIVE for SELECT to authenticated
  using ((is_active = true));

create policy members_read_own_bank_transactions on public.bank_transactions as PERMISSIVE for SELECT to authenticated
  using ((EXISTS ( SELECT 1
   FROM organization_memberships m
  WHERE ((m.organization_id = bank_transactions.organization_id) AND (m.user_id = ( SELECT auth.uid() AS uid)) AND m.is_active))));

create policy owners_manage_bank_transactions on public.bank_transactions as PERMISSIVE for ALL to authenticated
  using ((EXISTS ( SELECT 1
   FROM organization_memberships m
  WHERE ((m.organization_id = bank_transactions.organization_id) AND (m.user_id = ( SELECT auth.uid() AS uid)) AND m.is_active AND (m.role = ANY (ARRAY['owner'::membership_role, 'admin'::membership_role]))))))
  with check ((EXISTS ( SELECT 1
   FROM organization_memberships m
  WHERE ((m.organization_id = bank_transactions.organization_id) AND (m.user_id = ( SELECT auth.uid() AS uid)) AND m.is_active AND (m.role = ANY (ARRAY['owner'::membership_role, 'admin'::membership_role]))))));

create policy founder_manage_billing_customers on public.billing_customers as PERMISSIVE for ALL to authenticated
  using (( SELECT private.is_arvoos_founder() AS is_arvoos_founder))
  with check (( SELECT private.is_arvoos_founder() AS is_arvoos_founder));

create policy members_read_own_billing_customer on public.billing_customers as PERMISSIVE for SELECT to authenticated
  using ((EXISTS ( SELECT 1
   FROM organization_memberships m
  WHERE ((m.organization_id = billing_customers.organization_id) AND (m.user_id = ( SELECT auth.uid() AS uid)) AND m.is_active))));

create policy founder_manage_billing_events on public.billing_events as PERMISSIVE for ALL to authenticated
  using (( SELECT private.is_arvoos_founder() AS is_arvoos_founder))
  with check (( SELECT private.is_arvoos_founder() AS is_arvoos_founder));

create policy founder_read_billing_events on public.billing_events as PERMISSIVE for SELECT to authenticated
  using (( SELECT private.is_arvoos_founder() AS is_arvoos_founder));

create policy founder_manage_invoices on public.billing_invoices as PERMISSIVE for ALL to authenticated
  using (( SELECT private.is_arvoos_founder() AS is_arvoos_founder))
  with check (( SELECT private.is_arvoos_founder() AS is_arvoos_founder));

create policy members_read_own_invoices on public.billing_invoices as PERMISSIVE for SELECT to authenticated
  using ((EXISTS ( SELECT 1
   FROM organization_memberships m
  WHERE ((m.organization_id = billing_invoices.organization_id) AND (m.user_id = ( SELECT auth.uid() AS uid)) AND m.is_active))));

create policy founder_manage_subscriptions on public.billing_subscriptions as PERMISSIVE for ALL to authenticated
  using (( SELECT private.is_arvoos_founder() AS is_arvoos_founder))
  with check (( SELECT private.is_arvoos_founder() AS is_arvoos_founder));

create policy members_read_own_subscriptions on public.billing_subscriptions as PERMISSIVE for SELECT to authenticated
  using ((EXISTS ( SELECT 1
   FROM organization_memberships m
  WHERE ((m.organization_id = billing_subscriptions.organization_id) AND (m.user_id = ( SELECT auth.uid() AS uid)) AND m.is_active))));

create policy finance_managers_create_contract_costs on public.contract_cost_items as PERMISSIVE for INSERT to authenticated
  with check (((created_by = ( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1
   FROM organization_memberships m
  WHERE ((m.organization_id = contract_cost_items.organization_id) AND (m.user_id = ( SELECT auth.uid() AS uid)) AND m.is_active AND ((m.role)::text = ANY (ARRAY['owner'::text, 'admin'::text])))))));

create policy finance_managers_delete_contract_costs on public.contract_cost_items as PERMISSIVE for DELETE to authenticated
  using ((EXISTS ( SELECT 1
   FROM organization_memberships m
  WHERE ((m.organization_id = contract_cost_items.organization_id) AND (m.user_id = ( SELECT auth.uid() AS uid)) AND m.is_active AND ((m.role)::text = ANY (ARRAY['owner'::text, 'admin'::text]))))));

create policy finance_managers_read_contract_costs on public.contract_cost_items as PERMISSIVE for SELECT to authenticated
  using ((EXISTS ( SELECT 1
   FROM organization_memberships m
  WHERE ((m.organization_id = contract_cost_items.organization_id) AND (m.user_id = ( SELECT auth.uid() AS uid)) AND m.is_active AND ((m.role)::text = ANY (ARRAY['owner'::text, 'admin'::text]))))));

create policy finance_managers_update_contract_costs on public.contract_cost_items as PERMISSIVE for UPDATE to authenticated
  using ((EXISTS ( SELECT 1
   FROM organization_memberships m
  WHERE ((m.organization_id = contract_cost_items.organization_id) AND (m.user_id = ( SELECT auth.uid() AS uid)) AND m.is_active AND ((m.role)::text = ANY (ARRAY['owner'::text, 'admin'::text]))))))
  with check ((EXISTS ( SELECT 1
   FROM organization_memberships m
  WHERE ((m.organization_id = contract_cost_items.organization_id) AND (m.user_id = ( SELECT auth.uid() AS uid)) AND m.is_active AND ((m.role)::text = ANY (ARRAY['owner'::text, 'admin'::text]))))));

create policy members_can_create_appointments on public.crm_appointments as PERMISSIVE for INSERT to authenticated
  with check (((created_by = ( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1
   FROM organization_memberships m
  WHERE ((m.organization_id = crm_appointments.organization_id) AND (m.user_id = ( SELECT auth.uid() AS uid)) AND (m.is_active = true)))) AND ((EXISTS ( SELECT 1
   FROM organization_memberships m2
  WHERE ((m2.organization_id = crm_appointments.organization_id) AND (m2.user_id = ( SELECT auth.uid() AS uid)) AND (m2.is_active = true) AND (m2.role = ANY (ARRAY['owner'::membership_role, 'admin'::membership_role, 'manager'::membership_role]))))) OR (EXISTS ( SELECT 1
   FROM hr_employees e
  WHERE ((e.id = crm_appointments.employee_id) AND (e.user_id = ( SELECT auth.uid() AS uid))))))));

create policy members_can_read_own_or_managed_appointments on public.crm_appointments as PERMISSIVE for SELECT to authenticated
  using (((EXISTS ( SELECT 1
   FROM organization_memberships m
  WHERE ((m.organization_id = crm_appointments.organization_id) AND (m.user_id = ( SELECT auth.uid() AS uid)) AND (m.is_active = true) AND (m.role = ANY (ARRAY['owner'::membership_role, 'admin'::membership_role, 'manager'::membership_role]))))) OR (EXISTS ( SELECT 1
   FROM hr_employees e
  WHERE ((e.id = crm_appointments.employee_id) AND (e.user_id = ( SELECT auth.uid() AS uid)))))));

create policy owners_and_managers_can_delete_appointments on public.crm_appointments as PERMISSIVE for DELETE to authenticated
  using (((EXISTS ( SELECT 1
   FROM organization_memberships m
  WHERE ((m.organization_id = crm_appointments.organization_id) AND (m.user_id = ( SELECT auth.uid() AS uid)) AND (m.is_active = true) AND (m.role = ANY (ARRAY['owner'::membership_role, 'admin'::membership_role, 'manager'::membership_role]))))) OR (EXISTS ( SELECT 1
   FROM hr_employees e
  WHERE ((e.id = crm_appointments.employee_id) AND (e.user_id = ( SELECT auth.uid() AS uid)))))));

create policy owners_and_managers_can_update_appointments on public.crm_appointments as PERMISSIVE for UPDATE to authenticated
  using (((EXISTS ( SELECT 1
   FROM organization_memberships m
  WHERE ((m.organization_id = crm_appointments.organization_id) AND (m.user_id = ( SELECT auth.uid() AS uid)) AND (m.is_active = true) AND (m.role = ANY (ARRAY['owner'::membership_role, 'admin'::membership_role, 'manager'::membership_role]))))) OR (EXISTS ( SELECT 1
   FROM hr_employees e
  WHERE ((e.id = crm_appointments.employee_id) AND (e.user_id = ( SELECT auth.uid() AS uid)))))))
  with check (((EXISTS ( SELECT 1
   FROM organization_memberships m
  WHERE ((m.organization_id = crm_appointments.organization_id) AND (m.user_id = ( SELECT auth.uid() AS uid)) AND (m.is_active = true) AND (m.role = ANY (ARRAY['owner'::membership_role, 'admin'::membership_role, 'manager'::membership_role]))))) OR (EXISTS ( SELECT 1
   FROM hr_employees e
  WHERE ((e.id = crm_appointments.employee_id) AND (e.user_id = ( SELECT auth.uid() AS uid)))))));

create policy members_read_own_crm_automation_runs on public.crm_automation_runs as PERMISSIVE for SELECT to authenticated
  using ((EXISTS ( SELECT 1
   FROM organization_memberships membership
  WHERE ((membership.organization_id = crm_automation_runs.organization_id) AND (membership.user_id = ( SELECT auth.uid() AS uid)) AND (membership.is_active = true)))));

create policy "members read contract addenda" on public.crm_contract_addenda as PERMISSIVE for SELECT to authenticated
  using (private.arvo_can_access_opportunity(opportunity_id));

create policy "members create assigned contracts" on public.crm_contracts as PERMISSIVE for INSERT to authenticated
  with check (((created_by = ( SELECT auth.uid() AS uid)) AND private.arvo_can_access_opportunity(opportunity_id)));

create policy "members read assigned contracts" on public.crm_contracts as PERMISSIVE for SELECT to authenticated
  using (private.arvo_can_access_opportunity(opportunity_id));

create policy "members update assigned contracts" on public.crm_contracts as PERMISSIVE for UPDATE to authenticated
  using (private.arvo_can_access_opportunity(opportunity_id))
  with check (private.arvo_can_access_opportunity(opportunity_id));

create policy "owners admins delete crm contracts" on public.crm_contracts as PERMISSIVE for DELETE to authenticated
  using ((EXISTS ( SELECT 1
   FROM organization_memberships membership
  WHERE ((membership.organization_id = crm_contracts.organization_id) AND (membership.user_id = ( SELECT auth.uid() AS uid)) AND (membership.is_active = true) AND ((membership.role)::text = ANY (ARRAY['owner'::text, 'admin'::text]))))));

create policy "assigned members add crm internal comments" on public.crm_internal_comments as PERMISSIVE for INSERT to authenticated
  with check (((created_by = ( SELECT auth.uid() AS uid)) AND (organization_id = ( SELECT o.organization_id
   FROM crm_opportunities o
  WHERE (o.id = crm_internal_comments.opportunity_id))) AND private.arvo_can_access_opportunity(opportunity_id)));

create policy "assigned members read crm internal comments" on public.crm_internal_comments as PERMISSIVE for SELECT to authenticated
  using (((organization_id = ( SELECT o.organization_id
   FROM crm_opportunities o
  WHERE (o.id = crm_internal_comments.opportunity_id))) AND private.arvo_can_access_opportunity(opportunity_id)));

create policy "authors edit own crm internal comments" on public.crm_internal_comments as PERMISSIVE for UPDATE to authenticated
  using (((created_by = ( SELECT auth.uid() AS uid)) AND private.arvo_can_access_opportunity(opportunity_id)))
  with check (((created_by = ( SELECT auth.uid() AS uid)) AND (organization_id = ( SELECT o.organization_id
   FROM crm_opportunities o
  WHERE (o.id = crm_internal_comments.opportunity_id))) AND private.arvo_can_access_opportunity(opportunity_id)));

create policy "authors or managers delete crm internal comments" on public.crm_internal_comments as PERMISSIVE for DELETE to authenticated
  using ((private.arvo_can_access_opportunity(opportunity_id) AND ((created_by = ( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1
   FROM organization_memberships m
  WHERE ((m.user_id = ( SELECT auth.uid() AS uid)) AND (m.organization_id = crm_internal_comments.organization_id) AND (m.is_active = true) AND (m.role = ANY (ARRAY['owner'::membership_role, 'admin'::membership_role, 'manager'::membership_role]))))))));

create policy "owners admins delete crm opportunities" on public.crm_opportunities as PERMISSIVE for DELETE to authenticated
  using ((EXISTS ( SELECT 1
   FROM organization_memberships membership
  WHERE ((membership.organization_id = crm_opportunities.organization_id) AND (membership.user_id = ( SELECT auth.uid() AS uid)) AND (membership.is_active = true) AND ((membership.role)::text = ANY (ARRAY['owner'::text, 'admin'::text]))))));

create policy members_create_assigned_crm_opportunities on public.crm_opportunities as PERMISSIVE for INSERT to authenticated
  with check (((created_by = ( SELECT auth.uid() AS uid)) AND (private.arvo_is_privileged_member(organization_id) OR (EXISTS ( SELECT 1
   FROM hr_employees e
  WHERE ((e.id = crm_opportunities.assigned_employee_id) AND (e.organization_id = crm_opportunities.organization_id) AND (e.user_id = ( SELECT auth.uid() AS uid)) AND (e.employment_status = 'active'::text)))))));

create policy members_read_assigned_crm_opportunities on public.crm_opportunities as PERMISSIVE for SELECT to authenticated
  using (private.arvo_can_access_opportunity(id));

create policy members_update_assigned_crm_opportunities on public.crm_opportunities as PERMISSIVE for UPDATE to authenticated
  using (private.arvo_can_access_opportunity(id))
  with check ((private.arvo_is_privileged_member(organization_id) OR (EXISTS ( SELECT 1
   FROM hr_employees e
  WHERE ((e.id = crm_opportunities.assigned_employee_id) AND (e.organization_id = crm_opportunities.organization_id) AND (e.user_id = ( SELECT auth.uid() AS uid)) AND (e.employment_status = 'active'::text))))));

create policy "members create assigned proposals" on public.crm_proposals as PERMISSIVE for INSERT to authenticated
  with check (((created_by = ( SELECT auth.uid() AS uid)) AND private.arvo_can_access_opportunity(opportunity_id)));

create policy "members read assigned proposals" on public.crm_proposals as PERMISSIVE for SELECT to authenticated
  using ((private.arvo_can_access_opportunity(opportunity_id) AND ((status = 'draft'::text) OR ((status = 'sent'::text) AND ((valid_until IS NULL) OR (valid_until >= ((now() AT TIME ZONE 'Europe/Istanbul'::text))::date))) OR (status = 'archived'::text) OR (status = ANY (ARRAY['accepted'::text, 'rejected'::text])))));

create policy "members update assigned proposals" on public.crm_proposals as PERMISSIVE for UPDATE to authenticated
  using (private.arvo_can_access_opportunity(opportunity_id))
  with check (private.arvo_can_access_opportunity(opportunity_id));

create policy "owners admins delete crm proposals" on public.crm_proposals as PERMISSIVE for DELETE to authenticated
  using ((EXISTS ( SELECT 1
   FROM organization_memberships membership
  WHERE ((membership.organization_id = crm_proposals.organization_id) AND (membership.user_id = ( SELECT auth.uid() AS uid)) AND (membership.is_active = true) AND ((membership.role)::text = ANY (ARRAY['owner'::text, 'admin'::text]))))));

create policy founder_can_read_all_crm_requests on public.crm_requests as PERMISSIVE for SELECT to authenticated
  using (( SELECT private.is_arvoos_founder() AS is_arvoos_founder));

create policy managers_can_delete_organization_crm_requests on public.crm_requests as PERMISSIVE for DELETE to authenticated
  using ((EXISTS ( SELECT 1
   FROM organization_memberships m
  WHERE ((m.organization_id = crm_requests.organization_id) AND (m.user_id = ( SELECT auth.uid() AS uid)) AND (m.is_active = true) AND (m.role = ANY (ARRAY['owner'::membership_role, 'admin'::membership_role]))))));

create policy members_can_create_organization_crm_requests on public.crm_requests as PERMISSIVE for INSERT to authenticated
  with check (((created_by = ( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1
   FROM organization_memberships m
  WHERE ((m.organization_id = crm_requests.organization_id) AND (m.user_id = ( SELECT auth.uid() AS uid)) AND (m.is_active = true))))));

create policy members_can_read_organization_crm_requests on public.crm_requests as PERMISSIVE for SELECT to authenticated
  using ((EXISTS ( SELECT 1
   FROM organization_memberships m
  WHERE ((m.organization_id = crm_requests.organization_id) AND (m.user_id = ( SELECT auth.uid() AS uid)) AND (m.is_active = true)))));

create policy members_can_update_organization_crm_requests on public.crm_requests as PERMISSIVE for UPDATE to authenticated
  using ((EXISTS ( SELECT 1
   FROM organization_memberships m
  WHERE ((m.organization_id = crm_requests.organization_id) AND (m.user_id = ( SELECT auth.uid() AS uid)) AND (m.is_active = true)))))
  with check ((EXISTS ( SELECT 1
   FROM organization_memberships m
  WHERE ((m.organization_id = crm_requests.organization_id) AND (m.user_id = ( SELECT auth.uid() AS uid)) AND (m.is_active = true)))));

create policy organization_members_mark_customer_messages_read on public.customer_file_messages as PERMISSIVE for UPDATE to authenticated
  using ((EXISTS ( SELECT 1
   FROM organization_memberships membership
  WHERE ((membership.organization_id = customer_file_messages.organization_id) AND (membership.user_id = ( SELECT auth.uid() AS uid)) AND (membership.is_active = true)))))
  with check ((EXISTS ( SELECT 1
   FROM organization_memberships membership
  WHERE ((membership.organization_id = customer_file_messages.organization_id) AND (membership.user_id = ( SELECT auth.uid() AS uid)) AND (membership.is_active = true)))));

create policy organization_members_read_customer_file_messages on public.customer_file_messages as PERMISSIVE for SELECT to authenticated
  using ((EXISTS ( SELECT 1
   FROM organization_memberships membership
  WHERE ((membership.organization_id = customer_file_messages.organization_id) AND (membership.user_id = ( SELECT auth.uid() AS uid)) AND (membership.is_active = true)))));

create policy organization_members_reply_to_customer_file_messages on public.customer_file_messages as PERMISSIVE for INSERT to authenticated
  with check (((sender_type = 'staff'::text) AND (sender_user_id = ( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1
   FROM organization_memberships membership
  WHERE ((membership.organization_id = customer_file_messages.organization_id) AND (membership.user_id = ( SELECT auth.uid() AS uid)) AND (membership.is_active = true))))));

create policy document_access_logs_select on public.document_access_logs as PERMISSIVE for SELECT to authenticated
  using (arvo_is_member(organization_id));

create policy document_sequences_select on public.document_number_sequences as PERMISSIVE for SELECT to authenticated
  using (arvo_is_member(organization_id));

create policy members_read_own_finance_transactions on public.finance_transactions as PERMISSIVE for SELECT to authenticated
  using ((EXISTS ( SELECT 1
   FROM organization_memberships membership
  WHERE ((membership.organization_id = finance_transactions.organization_id) AND (membership.user_id = ( SELECT auth.uid() AS uid)) AND (membership.is_active = true)))));

create policy owners_create_finance_transactions on public.finance_transactions as PERMISSIVE for INSERT to authenticated
  with check (((created_by = ( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1
   FROM organization_memberships membership
  WHERE ((membership.organization_id = finance_transactions.organization_id) AND (membership.user_id = ( SELECT auth.uid() AS uid)) AND (membership.is_active = true) AND (membership.role = ANY (ARRAY['owner'::membership_role, 'admin'::membership_role])))))));

create policy owners_update_finance_transactions on public.finance_transactions as PERMISSIVE for UPDATE to authenticated
  using ((EXISTS ( SELECT 1
   FROM organization_memberships membership
  WHERE ((membership.organization_id = finance_transactions.organization_id) AND (membership.user_id = ( SELECT auth.uid() AS uid)) AND (membership.is_active = true) AND (membership.role = ANY (ARRAY['owner'::membership_role, 'admin'::membership_role]))))))
  with check ((EXISTS ( SELECT 1
   FROM organization_memberships membership
  WHERE ((membership.organization_id = finance_transactions.organization_id) AND (membership.user_id = ( SELECT auth.uid() AS uid)) AND (membership.is_active = true) AND (membership.role = ANY (ARRAY['owner'::membership_role, 'admin'::membership_role]))))));

create policy confidentiality_insert_manager on public.hr_confidentiality_agreements as PERMISSIVE for INSERT to authenticated
  with check ((EXISTS ( SELECT 1
   FROM organization_memberships m
  WHERE ((m.organization_id = hr_confidentiality_agreements.organization_id) AND (m.user_id = ( SELECT auth.uid() AS uid)) AND (m.is_active = true) AND ((m.role)::text = ANY (ARRAY['owner'::text, 'admin'::text]))))));

create policy confidentiality_select_manager_or_self on public.hr_confidentiality_agreements as PERMISSIVE for SELECT to authenticated
  using (((EXISTS ( SELECT 1
   FROM organization_memberships m
  WHERE ((m.organization_id = hr_confidentiality_agreements.organization_id) AND (m.user_id = ( SELECT auth.uid() AS uid)) AND (m.is_active = true) AND ((m.role)::text = ANY (ARRAY['owner'::text, 'admin'::text, 'manager'::text]))))) OR (EXISTS ( SELECT 1
   FROM hr_employees e
  WHERE ((e.id = hr_confidentiality_agreements.employee_id) AND (e.user_id = ( SELECT auth.uid() AS uid)))))));

create policy confidentiality_sign_self on public.hr_confidentiality_agreements as PERMISSIVE for UPDATE to authenticated
  using (((status = 'pending'::text) AND (EXISTS ( SELECT 1
   FROM hr_employees e
  WHERE ((e.id = hr_confidentiality_agreements.employee_id) AND (e.user_id = ( SELECT auth.uid() AS uid)))))))
  with check (((status = 'signed'::text) AND (signature_path IS NOT NULL) AND (signed_at IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM hr_employees e
  WHERE ((e.id = hr_confidentiality_agreements.employee_id) AND (e.user_id = ( SELECT auth.uid() AS uid)))))));

create policy "admins delete hr departments" on public.hr_departments as PERMISSIVE for DELETE to authenticated
  using (private.arvo_is_org_admin(organization_id));

create policy "admins insert hr departments" on public.hr_departments as PERMISSIVE for INSERT to authenticated
  with check (private.arvo_is_org_admin(organization_id));

create policy "admins update hr departments" on public.hr_departments as PERMISSIVE for UPDATE to authenticated
  using (private.arvo_is_org_admin(organization_id))
  with check (private.arvo_is_org_admin(organization_id));

create policy "members read hr departments" on public.hr_departments as PERMISSIVE for SELECT to authenticated
  using (arvo_is_member(organization_id));

create policy "privileged members read commission rate history" on public.hr_employee_commission_rates as PERMISSIVE for SELECT to authenticated
  using (private.arvo_is_privileged_member(organization_id));

create policy hr_employee_documents_delete on public.hr_employee_documents as PERMISSIVE for DELETE to authenticated
  using ((EXISTS ( SELECT 1
   FROM organization_memberships m
  WHERE ((m.organization_id = hr_employee_documents.organization_id) AND (m.user_id = ( SELECT auth.uid() AS uid)) AND m.is_active AND (m.role = ANY (ARRAY['owner'::membership_role, 'admin'::membership_role]))))));

create policy hr_employee_documents_insert on public.hr_employee_documents as PERMISSIVE for INSERT to authenticated
  with check (((uploaded_by = ( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1
   FROM organization_memberships m
  WHERE ((m.organization_id = hr_employee_documents.organization_id) AND (m.user_id = ( SELECT auth.uid() AS uid)) AND m.is_active AND (m.role = ANY (ARRAY['owner'::membership_role, 'admin'::membership_role])))))));

create policy hr_employee_documents_select on public.hr_employee_documents as PERMISSIVE for SELECT to authenticated
  using ((EXISTS ( SELECT 1
   FROM organization_memberships m
  WHERE ((m.organization_id = hr_employee_documents.organization_id) AND (m.user_id = ( SELECT auth.uid() AS uid)) AND m.is_active AND (m.role = ANY (ARRAY['owner'::membership_role, 'admin'::membership_role]))))));

create policy "admins delete hr employees" on public.hr_employees as PERMISSIVE for DELETE to authenticated
  using (private.arvo_is_org_admin(organization_id));

create policy "admins insert hr employees" on public.hr_employees as PERMISSIVE for INSERT to authenticated
  with check (private.arvo_is_org_admin(organization_id));

create policy "admins update hr employees" on public.hr_employees as PERMISSIVE for UPDATE to authenticated
  using (private.arvo_is_org_admin(organization_id))
  with check (private.arvo_is_org_admin(organization_id));

create policy "members read hr employees" on public.hr_employees as PERMISSIVE for SELECT to authenticated
  using (arvo_is_member(organization_id));

create policy "managers update hr leave requests" on public.hr_leave_requests as PERMISSIVE for UPDATE to authenticated
  using (private.arvo_is_privileged_member(organization_id))
  with check (private.arvo_is_privileged_member(organization_id));

create policy "members create hr leave requests" on public.hr_leave_requests as PERMISSIVE for INSERT to authenticated
  with check (arvo_is_member(organization_id));

create policy "members read hr leave requests" on public.hr_leave_requests as PERMISSIVE for SELECT to authenticated
  using (arvo_is_member(organization_id));

create policy "operation commissions manageable by managers" on public.hr_operation_commissions as PERMISSIVE for ALL to authenticated
  using (private.arvo_is_privileged_member(organization_id))
  with check (private.arvo_is_privileged_member(organization_id));

create policy "operation commissions readable" on public.hr_operation_commissions as PERMISSIVE for SELECT to authenticated
  using ((private.arvo_is_privileged_member(organization_id) OR (EXISTS ( SELECT 1
   FROM hr_employees e
  WHERE ((e.id = hr_operation_commissions.employee_id) AND (e.organization_id = hr_operation_commissions.organization_id) AND (e.user_id = ( SELECT auth.uid() AS uid)))))));

create policy "sales commissions manageable by managers" on public.hr_sales_commissions as PERMISSIVE for ALL to authenticated
  using (private.arvo_is_privileged_member(organization_id))
  with check (private.arvo_is_privileged_member(organization_id));

create policy "sales commissions readable" on public.hr_sales_commissions as PERMISSIVE for SELECT to authenticated
  using ((private.arvo_is_privileged_member(organization_id) OR (EXISTS ( SELECT 1
   FROM hr_employees e
  WHERE ((e.id = hr_sales_commissions.employee_id) AND (e.organization_id = hr_sales_commissions.organization_id) AND (e.user_id = ( SELECT auth.uid() AS uid)))))));

create policy messages_insert on public.internal_messages as PERMISSIVE for INSERT to authenticated
  with check (((sender_id = ( SELECT auth.uid() AS uid)) AND (deleted_at IS NULL) AND (edited_at IS NULL) AND arvo_can_access_message_channel(channel_id) AND (organization_id = ( SELECT c.organization_id
   FROM message_channels c
  WHERE (c.id = internal_messages.channel_id))) AND ((attachment_path IS NULL) OR (attachment_path ~~ ((((organization_id)::text || '/'::text) || (channel_id)::text) || '/%'::text)))));

create policy messages_select on public.internal_messages as PERMISSIVE for SELECT to authenticated
  using (arvo_can_access_message_channel(channel_id));

create policy messages_update_own on public.internal_messages as PERMISSIVE for UPDATE to authenticated
  using (((sender_id = ( SELECT auth.uid() AS uid)) AND (deleted_at IS NULL)))
  with check (((sender_id = ( SELECT auth.uid() AS uid)) AND arvo_can_access_message_channel(channel_id)));

create policy messages_members_select on public.message_channel_members as PERMISSIVE for SELECT to authenticated
  using (arvo_is_message_channel_member(channel_id));

create policy messages_channels_select on public.message_channels as PERMISSIVE for SELECT to authenticated
  using (arvo_can_access_message_channel(id));

create policy messages_read_states_select on public.message_read_states as PERMISSIVE for SELECT to authenticated
  using (((user_id = ( SELECT auth.uid() AS uid)) OR arvo_is_message_channel_member(channel_id)));

create policy "users dismiss own notifications" on public.notification_user_dismissals as PERMISSIVE for INSERT to authenticated
  with check ((user_id = ( SELECT auth.uid() AS uid)));

create policy "users read own notification dismissals" on public.notification_user_dismissals as PERMISSIVE for SELECT to authenticated
  using ((user_id = ( SELECT auth.uid() AS uid)));

create policy "users mark own notification reads" on public.notification_user_reads as PERMISSIVE for INSERT to authenticated
  with check (((user_id = ( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1
   FROM notifications n
  WHERE (n.id = notification_user_reads.notification_id)))));

create policy "users read own notification reads" on public.notification_user_reads as PERMISSIVE for SELECT to authenticated
  using ((user_id = ( SELECT auth.uid() AS uid)));

create policy members_mark_own_notifications_read on public.notifications as PERMISSIVE for UPDATE to authenticated
  using ((((audience = 'organization'::text) AND (user_id = ( SELECT auth.uid() AS uid))) OR ((audience = 'founder'::text) AND ( SELECT private.is_arvoos_founder() AS is_arvoos_founder))))
  with check ((((audience = 'organization'::text) AND (user_id = ( SELECT auth.uid() AS uid))) OR ((audience = 'founder'::text) AND ( SELECT private.is_arvoos_founder() AS is_arvoos_founder))));

create policy members_read_own_notifications on public.notifications as PERMISSIVE for SELECT to authenticated
  using ((((audience = 'organization'::text) AND ((user_id IS NULL) OR (user_id = ( SELECT auth.uid() AS uid))) AND (EXISTS ( SELECT 1
   FROM organization_memberships membership
  WHERE ((membership.organization_id = notifications.organization_id) AND (membership.user_id = ( SELECT auth.uid() AS uid)) AND membership.is_active)))) OR ((audience = 'founder'::text) AND ( SELECT private.is_arvoos_founder() AS is_arvoos_founder))));

create policy workflow_members_read_customer_file_downloads on public.operation_customer_file_downloads as PERMISSIVE for SELECT to authenticated
  using (((workflow_id IS NOT NULL) AND private.arvo_can_access_workflow(workflow_id)));

create policy workflow_members_add_customer_files on public.operation_customer_files as PERMISSIVE for INSERT to authenticated
  with check ((private.arvo_can_access_workflow(workflow_id) AND (EXISTS ( SELECT 1
   FROM operation_workflows w
  WHERE ((w.id = operation_customer_files.workflow_id) AND (w.organization_id = operation_customer_files.organization_id))))));

create policy workflow_members_read_customer_files on public.operation_customer_files as PERMISSIVE for SELECT to authenticated
  using (private.arvo_can_access_workflow(workflow_id));

create policy workflow_members_update_customer_files on public.operation_customer_files as PERMISSIVE for UPDATE to authenticated
  using ((private.arvo_can_access_workflow(workflow_id) AND (deleted_at IS NULL)))
  with check (private.arvo_can_access_workflow(workflow_id));

create policy admins_delete_operation_steps on public.operation_steps as PERMISSIVE for DELETE to authenticated
  using ((EXISTS ( SELECT 1
   FROM organization_memberships m
  WHERE ((m.organization_id = operation_steps.organization_id) AND (m.user_id = ( SELECT auth.uid() AS uid)) AND (m.is_active = true) AND (m.role = ANY (ARRAY['owner'::membership_role, 'admin'::membership_role]))))));

create policy members_create_assigned_operation_steps on public.operation_steps as PERMISSIVE for INSERT to authenticated
  with check (private.arvo_can_access_workflow(workflow_id));

create policy members_read_assigned_operation_steps on public.operation_steps as PERMISSIVE for SELECT to authenticated
  using (private.arvo_can_access_workflow(workflow_id));

create policy members_update_assigned_operation_steps on public.operation_steps as PERMISSIVE for UPDATE to authenticated
  using (private.arvo_can_access_workflow(workflow_id))
  with check (private.arvo_can_access_workflow(workflow_id));

create policy "operation comments deletable by creator" on public.operation_workflow_comments as PERMISSIVE for DELETE to authenticated
  using (((created_by = auth.uid()) AND arvo_is_member(organization_id)));

create policy "operation comments insertable by assigned members" on public.operation_workflow_comments as PERMISSIVE for INSERT to authenticated
  with check (((created_by = ( SELECT auth.uid() AS uid)) AND private.arvo_can_access_workflow(workflow_id)));

create policy "operation comments readable by assigned members" on public.operation_workflow_comments as PERMISSIVE for SELECT to authenticated
  using (private.arvo_can_access_workflow(workflow_id));

create policy admins_delete_operation_workflows on public.operation_workflows as PERMISSIVE for DELETE to authenticated
  using ((EXISTS ( SELECT 1
   FROM organization_memberships m
  WHERE ((m.organization_id = operation_workflows.organization_id) AND (m.user_id = ( SELECT auth.uid() AS uid)) AND (m.is_active = true) AND (m.role = ANY (ARRAY['owner'::membership_role, 'admin'::membership_role]))))));

create policy members_create_assigned_operation_workflows on public.operation_workflows as PERMISSIVE for INSERT to authenticated
  with check (((created_by = ( SELECT auth.uid() AS uid)) AND (private.arvo_is_privileged_member(organization_id) OR (EXISTS ( SELECT 1
   FROM hr_employees e
  WHERE ((e.id = operation_workflows.assigned_employee_id) AND (e.organization_id = operation_workflows.organization_id) AND (e.user_id = ( SELECT auth.uid() AS uid)) AND (e.employment_status = 'active'::text)))))));

create policy members_read_assigned_operation_workflows on public.operation_workflows as PERMISSIVE for SELECT to authenticated
  using (private.arvo_can_access_workflow(id));

create policy members_update_assigned_operation_workflows on public.operation_workflows as PERMISSIVE for UPDATE to authenticated
  using (private.arvo_can_access_workflow(id))
  with check ((private.arvo_is_privileged_member(organization_id) OR (EXISTS ( SELECT 1
   FROM hr_employees e
  WHERE ((e.id = operation_workflows.assigned_employee_id) AND (e.organization_id = operation_workflows.organization_id) AND (e.user_id = ( SELECT auth.uid() AS uid)) AND (e.employment_status = 'active'::text))))));

create policy members_read_own_bank_accounts on public.organization_bank_accounts as PERMISSIVE for SELECT to authenticated
  using ((EXISTS ( SELECT 1
   FROM organization_memberships m
  WHERE ((m.organization_id = organization_bank_accounts.organization_id) AND (m.user_id = ( SELECT auth.uid() AS uid)) AND m.is_active))));

create policy owners_manage_bank_accounts on public.organization_bank_accounts as PERMISSIVE for ALL to authenticated
  using ((EXISTS ( SELECT 1
   FROM organization_memberships m
  WHERE ((m.organization_id = organization_bank_accounts.organization_id) AND (m.user_id = ( SELECT auth.uid() AS uid)) AND m.is_active AND (m.role = ANY (ARRAY['owner'::membership_role, 'admin'::membership_role]))))))
  with check ((EXISTS ( SELECT 1
   FROM organization_memberships m
  WHERE ((m.organization_id = organization_bank_accounts.organization_id) AND (m.user_id = ( SELECT auth.uid() AS uid)) AND m.is_active AND (m.role = ANY (ARRAY['owner'::membership_role, 'admin'::membership_role]))))));

create policy admins_manage_crm_stages on public.organization_crm_stages as PERMISSIVE for ALL to authenticated
  using ((EXISTS ( SELECT 1
   FROM organization_memberships m
  WHERE ((m.organization_id = organization_crm_stages.organization_id) AND (m.user_id = auth.uid()) AND m.is_active AND (m.role = ANY (ARRAY['owner'::membership_role, 'admin'::membership_role]))))))
  with check ((EXISTS ( SELECT 1
   FROM organization_memberships m
  WHERE ((m.organization_id = organization_crm_stages.organization_id) AND (m.user_id = auth.uid()) AND m.is_active AND (m.role = ANY (ARRAY['owner'::membership_role, 'admin'::membership_role]))))));

create policy members_read_crm_stages on public.organization_crm_stages as PERMISSIVE for SELECT to authenticated
  using ((EXISTS ( SELECT 1
   FROM organization_memberships m
  WHERE ((m.organization_id = organization_crm_stages.organization_id) AND (m.user_id = auth.uid()) AND m.is_active))));

create policy admins_manage_organization_templates on public.organization_form_templates as PERMISSIVE for ALL to authenticated
  using ((EXISTS ( SELECT 1
   FROM organization_memberships m
  WHERE ((m.organization_id = organization_form_templates.organization_id) AND (m.user_id = auth.uid()) AND m.is_active AND (m.role = ANY (ARRAY['owner'::membership_role, 'admin'::membership_role]))))))
  with check ((EXISTS ( SELECT 1
   FROM organization_memberships m
  WHERE ((m.organization_id = organization_form_templates.organization_id) AND (m.user_id = auth.uid()) AND m.is_active AND (m.role = ANY (ARRAY['owner'::membership_role, 'admin'::membership_role]))))));

create policy members_read_organization_templates on public.organization_form_templates as PERMISSIVE for SELECT to authenticated
  using ((EXISTS ( SELECT 1
   FROM organization_memberships m
  WHERE ((m.organization_id = organization_form_templates.organization_id) AND (m.user_id = auth.uid()) AND m.is_active))));

create policy founder_can_read_all_organization_invitations on public.organization_invitations as PERMISSIVE for SELECT to authenticated
  using (( SELECT private.is_arvoos_founder() AS is_arvoos_founder));

create policy founder_can_manage_organization_licenses on public.organization_licenses as PERMISSIVE for ALL to authenticated
  using (( SELECT private.is_arvoos_founder() AS is_arvoos_founder))
  with check (( SELECT private.is_arvoos_founder() AS is_arvoos_founder));

create policy members_can_read_organization_license on public.organization_licenses as PERMISSIVE for SELECT to authenticated
  using ((EXISTS ( SELECT 1
   FROM organization_memberships membership
  WHERE ((membership.organization_id = organization_licenses.organization_id) AND (membership.user_id = ( SELECT auth.uid() AS uid)) AND (membership.is_active = true)))));

create policy founder_can_read_all_organization_memberships on public.organization_memberships as PERMISSIVE for SELECT to authenticated
  using (( SELECT private.is_arvoos_founder() AS is_arvoos_founder));

create policy users_can_read_own_memberships on public.organization_memberships as PERMISSIVE for SELECT to authenticated
  using ((user_id = ( SELECT auth.uid() AS uid)));

create policy founder_can_read_all_organization_modules on public.organization_modules as PERMISSIVE for SELECT to authenticated
  using (( SELECT private.is_arvoos_founder() AS is_arvoos_founder));

create policy founder_can_update_all_organization_modules on public.organization_modules as PERMISSIVE for UPDATE to authenticated
  using (( SELECT private.is_arvoos_founder() AS is_arvoos_founder))
  with check (( SELECT private.is_arvoos_founder() AS is_arvoos_founder));

create policy founder_can_update_arvoos_modules on public.organization_modules as PERMISSIVE for UPDATE to authenticated
  using ((EXISTS ( SELECT 1
   FROM (organizations organization
     JOIN organization_memberships membership ON ((membership.organization_id = organization.id)))
  WHERE ((organization.id = organization_modules.organization_id) AND (organization.slug = 'arvo-os'::text) AND (membership.user_id = ( SELECT auth.uid() AS uid)) AND (membership.is_active = true) AND (membership.role = 'owner'::membership_role)))))
  with check ((EXISTS ( SELECT 1
   FROM (organizations organization
     JOIN organization_memberships membership ON ((membership.organization_id = organization.id)))
  WHERE ((organization.id = organization_modules.organization_id) AND (organization.slug = 'arvo-os'::text) AND (membership.user_id = ( SELECT auth.uid() AS uid)) AND (membership.is_active = true) AND (membership.role = 'owner'::membership_role)))));

create policy members_can_read_enabled_organization_modules on public.organization_modules as PERMISSIVE for SELECT to authenticated
  using ((EXISTS ( SELECT 1
   FROM organization_memberships m
  WHERE ((m.organization_id = organization_modules.organization_id) AND (m.user_id = ( SELECT auth.uid() AS uid)) AND (m.is_active = true)))));

create policy members_can_read_organization_onboarding on public.organization_onboarding as PERMISSIVE for SELECT to authenticated
  using ((EXISTS ( SELECT 1
   FROM organization_memberships membership
  WHERE ((membership.organization_id = organization_onboarding.organization_id) AND (membership.user_id = ( SELECT auth.uid() AS uid)) AND (membership.is_active = true)))));

create policy owners_can_manage_organization_onboarding on public.organization_onboarding as PERMISSIVE for ALL to authenticated
  using ((EXISTS ( SELECT 1
   FROM organization_memberships membership
  WHERE ((membership.organization_id = organization_onboarding.organization_id) AND (membership.user_id = ( SELECT auth.uid() AS uid)) AND (membership.is_active = true) AND (membership.role = ANY (ARRAY['owner'::membership_role, 'admin'::membership_role]))))))
  with check ((EXISTS ( SELECT 1
   FROM organization_memberships membership
  WHERE ((membership.organization_id = organization_onboarding.organization_id) AND (membership.user_id = ( SELECT auth.uid() AS uid)) AND (membership.is_active = true) AND (membership.role = ANY (ARRAY['owner'::membership_role, 'admin'::membership_role]))))));

create policy founder_manage_payment_requests on public.organization_payment_requests as PERMISSIVE for ALL to authenticated
  using (( SELECT private.is_arvoos_founder() AS is_arvoos_founder))
  with check (( SELECT private.is_arvoos_founder() AS is_arvoos_founder));

create policy members_read_own_payment_requests on public.organization_payment_requests as PERMISSIVE for SELECT to authenticated
  using ((EXISTS ( SELECT 1
   FROM organization_memberships membership
  WHERE ((membership.organization_id = organization_payment_requests.organization_id) AND (membership.user_id = ( SELECT auth.uid() AS uid)) AND (membership.is_active = true)))));

create policy owners_create_payment_requests on public.organization_payment_requests as PERMISSIVE for INSERT to authenticated
  with check (((submitted_by = ( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1
   FROM organization_memberships membership
  WHERE ((membership.organization_id = organization_payment_requests.organization_id) AND (membership.user_id = ( SELECT auth.uid() AS uid)) AND (membership.is_active = true) AND (membership.role = ANY (ARRAY['owner'::membership_role, 'admin'::membership_role])))))));

create policy founder_manage_product_licenses on public.organization_product_licenses as PERMISSIVE for ALL to authenticated
  using (( SELECT private.is_arvoos_founder() AS is_arvoos_founder))
  with check (( SELECT private.is_arvoos_founder() AS is_arvoos_founder));

create policy members_read_own_product_licenses on public.organization_product_licenses as PERMISSIVE for SELECT to authenticated
  using ((EXISTS ( SELECT 1
   FROM organization_memberships membership
  WHERE ((membership.organization_id = organization_product_licenses.organization_id) AND (membership.user_id = ( SELECT auth.uid() AS uid)) AND (membership.is_active = true)))));

create policy members_read_vertical_profile on public.organization_vertical_profiles as PERMISSIVE for SELECT to authenticated
  using ((EXISTS ( SELECT 1
   FROM organization_memberships m
  WHERE ((m.organization_id = organization_vertical_profiles.organization_id) AND (m.user_id = auth.uid()) AND m.is_active))));

create policy owners_manage_vertical_profile on public.organization_vertical_profiles as PERMISSIVE for ALL to authenticated
  using ((EXISTS ( SELECT 1
   FROM organization_memberships m
  WHERE ((m.organization_id = organization_vertical_profiles.organization_id) AND (m.user_id = auth.uid()) AND m.is_active AND (m.role = 'owner'::membership_role)))))
  with check ((EXISTS ( SELECT 1
   FROM organization_memberships m
  WHERE ((m.organization_id = organization_vertical_profiles.organization_id) AND (m.user_id = auth.uid()) AND m.is_active AND (m.role = 'owner'::membership_role)))));

create policy founder_can_read_all_organizations on public.organizations as PERMISSIVE for SELECT to authenticated
  using (( SELECT private.is_arvoos_founder() AS is_arvoos_founder));

create policy founder_can_update_all_organizations on public.organizations as PERMISSIVE for UPDATE to authenticated
  using (( SELECT private.is_arvoos_founder() AS is_arvoos_founder))
  with check (( SELECT private.is_arvoos_founder() AS is_arvoos_founder));

create policy founder_can_update_arvoos_organization on public.organizations as PERMISSIVE for UPDATE to authenticated
  using (((slug = 'arvo-os'::text) AND (EXISTS ( SELECT 1
   FROM organization_memberships membership
  WHERE ((membership.organization_id = organizations.id) AND (membership.user_id = ( SELECT auth.uid() AS uid)) AND (membership.is_active = true) AND (membership.role = 'owner'::membership_role))))))
  with check (((slug = 'arvo-os'::text) AND (EXISTS ( SELECT 1
   FROM organization_memberships membership
  WHERE ((membership.organization_id = organizations.id) AND (membership.user_id = ( SELECT auth.uid() AS uid)) AND (membership.is_active = true) AND (membership.role = 'owner'::membership_role))))));

create policy members_can_read_their_organizations on public.organizations as PERMISSIVE for SELECT to authenticated
  using ((EXISTS ( SELECT 1
   FROM organization_memberships m
  WHERE ((m.organization_id = organizations.id) AND (m.user_id = ( SELECT auth.uid() AS uid)) AND (m.is_active = true)))));

create policy "admins update payment installments" on public.payment_installments as PERMISSIVE for UPDATE to authenticated
  using (private.arvo_is_org_admin(organization_id))
  with check (private.arvo_is_org_admin(organization_id));

create policy "members read payment installments" on public.payment_installments as PERMISSIVE for SELECT to authenticated
  using (arvo_is_member(organization_id));

create policy "admins update payment plans" on public.payment_plans as PERMISSIVE for UPDATE to authenticated
  using (private.arvo_is_org_admin(organization_id))
  with check (private.arvo_is_org_admin(organization_id));

create policy "members read payment plans" on public.payment_plans as PERMISSIVE for SELECT to authenticated
  using (arvo_is_member(organization_id));

create policy authenticated_can_read_active_plans on public.plans as PERMISSIVE for SELECT to authenticated
  using ((is_active = true));

create policy authenticated_read_active_bank_accounts on public.platform_bank_accounts as PERMISSIVE for SELECT to authenticated
  using (((is_active = true) OR ( SELECT private.is_arvoos_founder() AS is_arvoos_founder)));

create policy founder_manage_bank_accounts on public.platform_bank_accounts as PERMISSIVE for ALL to authenticated
  using (( SELECT private.is_arvoos_founder() AS is_arvoos_founder))
  with check (( SELECT private.is_arvoos_founder() AS is_arvoos_founder));

create policy founder_manage_product_plans on public.product_plans as PERMISSIVE for ALL to authenticated
  using (( SELECT private.is_arvoos_founder() AS is_arvoos_founder))
  with check (( SELECT private.is_arvoos_founder() AS is_arvoos_founder));

create policy founder_manage_product_subscribers on public.product_subscribers as PERMISSIVE for ALL to authenticated
  using (( SELECT private.is_arvoos_founder() AS is_arvoos_founder))
  with check (( SELECT private.is_arvoos_founder() AS is_arvoos_founder));

create policy users_can_read_own_profile on public.profiles as PERMISSIVE for SELECT to authenticated
  using ((id = ( SELECT auth.uid() AS uid)));

create policy users_can_update_own_profile on public.profiles as PERMISSIVE for UPDATE to authenticated
  using ((id = ( SELECT auth.uid() AS uid)))
  with check ((id = ( SELECT auth.uid() AS uid)));

create policy founder_can_read_provisioning_audit_logs on public.provisioning_audit_logs as PERMISSIVE for SELECT to authenticated
  using (( SELECT private.is_arvoos_founder() AS is_arvoos_founder));

create policy "org members read permissions" on public.role_module_permissions as PERMISSIVE for SELECT to public
  using ((EXISTS ( SELECT 1
   FROM organization_memberships m
  WHERE ((m.organization_id = role_module_permissions.organization_id) AND (m.user_id = auth.uid()) AND (m.is_active = true)))));

create policy "owner and admin manage permissions" on public.role_module_permissions as PERMISSIVE for ALL to public
  using ((EXISTS ( SELECT 1
   FROM organization_memberships m
  WHERE ((m.organization_id = role_module_permissions.organization_id) AND (m.user_id = auth.uid()) AND (m.is_active = true) AND (m.role = ANY (ARRAY['owner'::membership_role, 'admin'::membership_role]))))))
  with check ((EXISTS ( SELECT 1
   FROM organization_memberships m
  WHERE ((m.organization_id = role_module_permissions.organization_id) AND (m.user_id = auth.uid()) AND (m.is_active = true) AND (m.role = ANY (ARRAY['owner'::membership_role, 'admin'::membership_role]))))));

create policy founder_read_subscriber_payments on public.subscriber_payments as PERMISSIVE for ALL to authenticated
  using (( SELECT private.is_arvoos_founder() AS is_arvoos_founder))
  with check (( SELECT private.is_arvoos_founder() AS is_arvoos_founder));

create policy members_create_support_messages on public.support_messages as PERMISSIVE for INSERT to authenticated
  with check (((author_id = ( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1
   FROM support_tickets t
  WHERE ((t.id = support_messages.ticket_id) AND (t.organization_id = support_messages.organization_id)))) AND ((( SELECT private.is_arvoos_founder() AS is_arvoos_founder) AND (is_staff = true)) OR ((is_staff = false) AND (EXISTS ( SELECT 1
   FROM organization_memberships m
  WHERE ((m.organization_id = support_messages.organization_id) AND (m.user_id = ( SELECT auth.uid() AS uid)) AND m.is_active)))))));

create policy members_read_own_support_messages on public.support_messages as PERMISSIVE for SELECT to authenticated
  using ((( SELECT private.is_arvoos_founder() AS is_arvoos_founder) OR (EXISTS ( SELECT 1
   FROM organization_memberships m
  WHERE ((m.organization_id = support_messages.organization_id) AND (m.user_id = ( SELECT auth.uid() AS uid)) AND m.is_active)))));

create policy founder_updates_support_tickets on public.support_tickets as PERMISSIVE for UPDATE to authenticated
  using (( SELECT private.is_arvoos_founder() AS is_arvoos_founder))
  with check (( SELECT private.is_arvoos_founder() AS is_arvoos_founder));

create policy members_create_support_tickets on public.support_tickets as PERMISSIVE for INSERT to authenticated
  with check (((created_by = ( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1
   FROM organization_memberships m
  WHERE ((m.organization_id = support_tickets.organization_id) AND (m.user_id = ( SELECT auth.uid() AS uid)) AND m.is_active)))));

create policy members_read_own_support_tickets on public.support_tickets as PERMISSIVE for SELECT to authenticated
  using ((( SELECT private.is_arvoos_founder() AS is_arvoos_founder) OR (EXISTS ( SELECT 1
   FROM organization_memberships m
  WHERE ((m.organization_id = support_tickets.organization_id) AND (m.user_id = ( SELECT auth.uid() AS uid)) AND m.is_active)))));

create policy presence_insert_own on public.user_presence as PERMISSIVE for INSERT to authenticated
  with check (((user_id = ( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1
   FROM organization_memberships own_membership
  WHERE ((own_membership.organization_id = user_presence.organization_id) AND (own_membership.user_id = ( SELECT auth.uid() AS uid)) AND (own_membership.is_active = true))))));

create policy presence_select_same_organization on public.user_presence as PERMISSIVE for SELECT to authenticated
  using ((EXISTS ( SELECT 1
   FROM organization_memberships viewer
  WHERE ((viewer.organization_id = user_presence.organization_id) AND (viewer.user_id = ( SELECT auth.uid() AS uid)) AND (viewer.is_active = true)))));

create policy presence_update_own on public.user_presence as PERMISSIVE for UPDATE to authenticated
  using ((user_id = ( SELECT auth.uid() AS uid)))
  with check (((user_id = ( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1
   FROM organization_memberships own_membership
  WHERE ((own_membership.organization_id = user_presence.organization_id) AND (own_membership.user_id = ( SELECT auth.uid() AS uid)) AND (own_membership.is_active = true))))));

create policy session_logs_insert_own on public.user_session_logs as PERMISSIVE for INSERT to authenticated
  with check (((user_id = ( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1
   FROM organization_memberships own_membership
  WHERE ((own_membership.organization_id = user_session_logs.organization_id) AND (own_membership.user_id = ( SELECT auth.uid() AS uid)) AND (own_membership.is_active = true))))));

create policy session_logs_select_own_or_manager on public.user_session_logs as PERMISSIVE for SELECT to authenticated
  using (((user_id = ( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1
   FROM organization_memberships viewer
  WHERE ((viewer.organization_id = user_session_logs.organization_id) AND (viewer.user_id = ( SELECT auth.uid() AS uid)) AND (viewer.is_active = true) AND ((viewer.role)::text = ANY (ARRAY['owner'::text, 'admin'::text, 'manager'::text])))))));

create policy session_logs_update_own on public.user_session_logs as PERMISSIVE for UPDATE to authenticated
  using ((user_id = ( SELECT auth.uid() AS uid)))
  with check ((user_id = ( SELECT auth.uid() AS uid)));

create policy "privileged members read org whatsapp conversation state" on public.whatsapp_conversation_state as PERMISSIVE for SELECT to authenticated
  using (private.arvo_is_privileged_member(organization_id));

create policy "privileged members read org whatsapp messages" on public.whatsapp_messages as PERMISSIVE for SELECT to authenticated
  using (private.arvo_is_privileged_member(organization_id));

create policy "privileged members read org whatsapp quick replies" on public.whatsapp_quick_replies as PERMISSIVE for SELECT to authenticated
  using (private.arvo_is_privileged_member(organization_id));

revoke all on function private.arvo_account_entry_reconcile() from public;
grant execute on function private.arvo_account_entry_reconcile() to public;

revoke all on function private.arvo_account_entry_refund_unreconcile() from public;
grant execute on function private.arvo_account_entry_refund_unreconcile() to public;

revoke all on function private.arvo_account_entry_unreconcile() from public;
grant execute on function private.arvo_account_entry_unreconcile() to public;

revoke all on function private.arvo_bump_message_channel() from public;
grant execute on function private.arvo_bump_message_channel() to public;

revoke all on function private.arvo_can_access_opportunity(target_opportunity uuid) from public;
grant execute on function private.arvo_can_access_opportunity(target_opportunity uuid) to authenticated;
grant execute on function private.arvo_can_access_opportunity(target_opportunity uuid) to service_role;

revoke all on function private.arvo_can_access_workflow(target_workflow uuid) from public;
grant execute on function private.arvo_can_access_workflow(target_workflow uuid) to service_role;
grant execute on function private.arvo_can_access_workflow(target_workflow uuid) to authenticated;

revoke all on function private.arvo_contract_tracking_code() from public;
grant execute on function private.arvo_contract_tracking_code() to public;

revoke all on function private.arvo_contract_workflow_completed(target_contract uuid, target_workflow uuid) from public;
grant execute on function private.arvo_contract_workflow_completed(target_contract uuid, target_workflow uuid) to service_role;
grant execute on function private.arvo_contract_workflow_completed(target_contract uuid, target_workflow uuid) to authenticated;

revoke all on function private.arvo_department_management_guard() from public;
grant execute on function private.arvo_department_management_guard() to public;

revoke all on function private.arvo_department_management_sync() from public;
grant execute on function private.arvo_department_management_sync() to public;

revoke all on function private.arvo_employee_management_guard() from public;
grant execute on function private.arvo_employee_management_guard() to public;

revoke all on function private.arvo_employee_management_sync() from public;
grant execute on function private.arvo_employee_management_sync() to public;

revoke all on function private.arvo_freeze_signed_contract() from public;
grant execute on function private.arvo_freeze_signed_contract() to public;

revoke all on function private.arvo_freeze_signed_work_plan() from public;
grant execute on function private.arvo_freeze_signed_work_plan() to public;

revoke all on function private.arvo_guard_contract_addendum() from public;
grant execute on function private.arvo_guard_contract_addendum() to public;

revoke all on function private.arvo_guard_message_update() from public;
grant execute on function private.arvo_guard_message_update() to public;

revoke all on function private.arvo_is_finance_manager(p_organization_id uuid) from public;
grant execute on function private.arvo_is_finance_manager(p_organization_id uuid) to authenticated;
grant execute on function private.arvo_is_finance_manager(p_organization_id uuid) to service_role;

revoke all on function private.arvo_is_management_name(p_name text) from public;
grant execute on function private.arvo_is_management_name(p_name text) to public;

revoke all on function private.arvo_is_org_admin(target_org uuid) from public;
grant execute on function private.arvo_is_org_admin(target_org uuid) to authenticated;
grant execute on function private.arvo_is_org_admin(target_org uuid) to service_role;

revoke all on function private.arvo_is_privileged_member(target_org uuid) from public;
grant execute on function private.arvo_is_privileged_member(target_org uuid) to service_role;
grant execute on function private.arvo_is_privileged_member(target_org uuid) to authenticated;

revoke all on function private.arvo_link_contract_messages_to_workflow() from public;
grant execute on function private.arvo_link_contract_messages_to_workflow() to public;

revoke all on function private.arvo_membership_management_sync() from public;
grant execute on function private.arvo_membership_management_sync() to public;

revoke all on function private.arvo_membership_manual_role_change() from public;
grant execute on function private.arvo_membership_manual_role_change() to public;

revoke all on function private.arvo_message_preview(p_body text, p_attachment_name text) from public;
grant execute on function private.arvo_message_preview(p_body text, p_attachment_name text) to public;

revoke all on function private.arvo_normalize_contract_work_plan() from public;
grant execute on function private.arvo_normalize_contract_work_plan() to public;

revoke all on function private.arvo_promote_draft_on_customer_view() from public;
grant execute on function private.arvo_promote_draft_on_customer_view() to public;

revoke all on function private.arvo_request_role() from public;
grant execute on function private.arvo_request_role() to public;

revoke all on function private.arvo_sync_installment_due_dates() from public;
grant execute on function private.arvo_sync_installment_due_dates() to public;

revoke all on function private.can_manage_organization_assets(organization_id_text text) from public;
grant execute on function private.can_manage_organization_assets(organization_id_text text) to authenticated;

revoke all on function private.is_arvoos_founder() from public;
grant execute on function private.is_arvoos_founder() to authenticated;

revoke all on function public.accrue_operation_commission() from public;
grant execute on function public.accrue_operation_commission() to service_role;

revoke all on function public.add_standard_operation_steps(target_workflow_id uuid, target_organization_id uuid) from public;
grant execute on function public.add_standard_operation_steps(target_workflow_id uuid, target_organization_id uuid) to service_role;

revoke all on function public.arc_address_before_write() from public;
grant execute on function public.arc_address_before_write() to authenticated;
grant execute on function public.arc_address_before_write() to service_role;
grant execute on function public.arc_address_before_write() to anon;
grant execute on function public.arc_address_before_write() to public;

revoke all on function public.arc_address_line(p_addr jsonb) from public;
grant execute on function public.arc_address_line(p_addr jsonb) to authenticated;
grant execute on function public.arc_address_line(p_addr jsonb) to service_role;

revoke all on function public.arc_adjust_inventory(p_variant_id uuid, p_quantity integer, p_kind text, p_reference_type text, p_reference_id text, p_note text) from public;
grant execute on function public.arc_adjust_inventory(p_variant_id uuid, p_quantity integer, p_kind text, p_reference_type text, p_reference_id text, p_note text) to service_role;
grant execute on function public.arc_adjust_inventory(p_variant_id uuid, p_quantity integer, p_kind text, p_reference_type text, p_reference_id text, p_note text) to authenticated;

revoke all on function public.arc_aktarim_hesaplar() from public;
grant execute on function public.arc_aktarim_hesaplar() to service_role;

revoke all on function public.arc_baslik(p_text text) from public;
grant execute on function public.arc_baslik(p_text text) to authenticated;
grant execute on function public.arc_baslik(p_text text) to service_role;

revoke all on function public.arc_bulk_update_supplier_stock(p_organization_id uuid, p_supplier text, p_rows jsonb) from public;
grant execute on function public.arc_bulk_update_supplier_stock(p_organization_id uuid, p_supplier text, p_rows jsonb) to service_role;

revoke all on function public.arc_categorize_supplier_products(p_supplier text, p_organization_id uuid) from public;
grant execute on function public.arc_categorize_supplier_products(p_supplier text, p_organization_id uuid) to service_role;

revoke all on function public.arc_check_coupon(p_organization_id uuid, p_code text, p_subtotal bigint, p_email text) from public;
grant execute on function public.arc_check_coupon(p_organization_id uuid, p_code text, p_subtotal bigint, p_email text) to authenticated;
grant execute on function public.arc_check_coupon(p_organization_id uuid, p_code text, p_subtotal bigint, p_email text) to service_role;

revoke all on function public.arc_check_supplier_stock() from public;
grant execute on function public.arc_check_supplier_stock() to anon;
grant execute on function public.arc_check_supplier_stock() to service_role;
grant execute on function public.arc_check_supplier_stock() to authenticated;
grant execute on function public.arc_check_supplier_stock() to public;

revoke all on function public.arc_clean(p_value text) from public;
grant execute on function public.arc_clean(p_value text) to authenticated;
grant execute on function public.arc_clean(p_value text) to service_role;

revoke all on function public.arc_count_coupon_use() from public;
grant execute on function public.arc_count_coupon_use() to service_role;

revoke all on function public.arc_create_order(p_customer_name text, p_customer_email text, p_items jsonb, p_source text) from public;
grant execute on function public.arc_create_order(p_customer_name text, p_customer_email text, p_items jsonb, p_source text) to service_role;
grant execute on function public.arc_create_order(p_customer_name text, p_customer_email text, p_items jsonb, p_source text) to authenticated;

revoke all on function public.arc_create_storefront_order(p_organization_id uuid, p_email text, p_name text, p_phone text, p_address jsonb, p_items jsonb, p_coupon_code text) from public;
grant execute on function public.arc_create_storefront_order(p_organization_id uuid, p_email text, p_name text, p_phone text, p_address jsonb, p_items jsonb, p_coupon_code text) to service_role;

revoke all on function public.arc_decode_entities(t text) from public;
grant execute on function public.arc_decode_entities(t text) to anon;
grant execute on function public.arc_decode_entities(t text) to authenticated;
grant execute on function public.arc_decode_entities(t text) to service_role;
grant execute on function public.arc_decode_entities(t text) to public;

revoke all on function public.arc_extract_vat(p_gross bigint, p_rate numeric) from public;
grant execute on function public.arc_extract_vat(p_gross bigint, p_rate numeric) to service_role;
grant execute on function public.arc_extract_vat(p_gross bigint, p_rate numeric) to authenticated;
grant execute on function public.arc_extract_vat(p_gross bigint, p_rate numeric) to anon;

revoke all on function public.arc_fill_order_tax() from public;
grant execute on function public.arc_fill_order_tax() to service_role;
grant execute on function public.arc_fill_order_tax() to authenticated;
grant execute on function public.arc_fill_order_tax() to anon;
grant execute on function public.arc_fill_order_tax() to public;

revoke all on function public.arc_find_address(p_meta jsonb) from public;
grant execute on function public.arc_find_address(p_meta jsonb) to authenticated;
grant execute on function public.arc_find_address(p_meta jsonb) to service_role;

revoke all on function public.arc_first_text(p_source jsonb, VARIADIC p_keys text[]) from public;
grant execute on function public.arc_first_text(p_source jsonb, VARIADIC p_keys text[]) to authenticated;
grant execute on function public.arc_first_text(p_source jsonb, VARIADIC p_keys text[]) to service_role;

revoke all on function public.arc_log_order_event() from public;
grant execute on function public.arc_log_order_event() to service_role;

revoke all on function public.arc_normalize_address(p_addr jsonb) from public;
grant execute on function public.arc_normalize_address(p_addr jsonb) to service_role;
grant execute on function public.arc_normalize_address(p_addr jsonb) to authenticated;

revoke all on function public.arc_reprice_supplier(p_supplier text) from public;
grant execute on function public.arc_reprice_supplier(p_supplier text) to service_role;

revoke all on function public.arc_resolve_commerce_tenant() from public;
grant execute on function public.arc_resolve_commerce_tenant() to service_role;
grant execute on function public.arc_resolve_commerce_tenant() to authenticated;

revoke all on function public.arc_sale_price(p_cost bigint, p_margin integer, p_shipping bigint, p_round integer) from public;
grant execute on function public.arc_sale_price(p_cost bigint, p_margin integer, p_shipping bigint, p_round integer) to authenticated;
grant execute on function public.arc_sale_price(p_cost bigint, p_margin integer, p_shipping bigint, p_round integer) to service_role;

revoke all on function public.arc_sale_price(p_cost bigint, p_margin numeric, p_shipping bigint, p_round integer, p_service bigint) from public;
grant execute on function public.arc_sale_price(p_cost bigint, p_margin numeric, p_shipping bigint, p_round integer, p_service bigint) to service_role;
grant execute on function public.arc_sale_price(p_cost bigint, p_margin numeric, p_shipping bigint, p_round integer, p_service bigint) to authenticated;

revoke all on function public.arc_settle_storefront_order(p_order_id uuid, p_paid boolean, p_payment_reference text, p_failure_reason text) from public;
grant execute on function public.arc_settle_storefront_order(p_order_id uuid, p_paid boolean, p_payment_reference text, p_failure_reason text) to service_role;

revoke all on function public.arc_slugify(p_text text) from public;
grant execute on function public.arc_slugify(p_text text) to authenticated;
grant execute on function public.arc_slugify(p_text text) to service_role;

revoke all on function public.arc_store_stage(p_organization_id uuid) from public;
grant execute on function public.arc_store_stage(p_organization_id uuid) to anon;
grant execute on function public.arc_store_stage(p_organization_id uuid) to service_role;
grant execute on function public.arc_store_stage(p_organization_id uuid) to authenticated;

revoke all on function public.arc_total_stock_units() from public;
grant execute on function public.arc_total_stock_units() to service_role;
grant execute on function public.arc_total_stock_units() to authenticated;

revoke all on function public.arc_update_order_status(p_order_id uuid, p_status text, p_payment_status text) from public;
grant execute on function public.arc_update_order_status(p_order_id uuid, p_status text, p_payment_status text) to service_role;
grant execute on function public.arc_update_order_status(p_order_id uuid, p_status text, p_payment_status text) to authenticated;

revoke all on function public.arc_variant_available(p_stock integer, p_allow_backorder boolean, p_supplier text) from public;
grant execute on function public.arc_variant_available(p_stock integer, p_allow_backorder boolean, p_supplier text) to authenticated;
grant execute on function public.arc_variant_available(p_stock integer, p_allow_backorder boolean, p_supplier text) to service_role;
grant execute on function public.arc_variant_available(p_stock integer, p_allow_backorder boolean, p_supplier text) to anon;

revoke all on function public.archive_inactive_crm_proposal() from public;
grant execute on function public.archive_inactive_crm_proposal() to anon;
grant execute on function public.archive_inactive_crm_proposal() to public;
grant execute on function public.archive_inactive_crm_proposal() to service_role;
grant execute on function public.archive_inactive_crm_proposal() to authenticated;

revoke all on function public.arvo_can_access_message_channel(p_channel_id uuid) from public;
grant execute on function public.arvo_can_access_message_channel(p_channel_id uuid) to authenticated;
grant execute on function public.arvo_can_access_message_channel(p_channel_id uuid) to service_role;

revoke all on function public.arvo_can_access_opportunity(target_opportunity uuid) from public;
grant execute on function public.arvo_can_access_opportunity(target_opportunity uuid) to service_role;
grant execute on function public.arvo_can_access_opportunity(target_opportunity uuid) to authenticated;

revoke all on function public.arvo_cancel_contract_addendum(p_addendum_id uuid) from public;
grant execute on function public.arvo_cancel_contract_addendum(p_addendum_id uuid) to authenticated;
grant execute on function public.arvo_cancel_contract_addendum(p_addendum_id uuid) to service_role;

revoke all on function public.arvo_confirm_proposal_decision(public_token text, p_decision text, p_ip text, p_user_agent text) from public;
grant execute on function public.arvo_confirm_proposal_decision(public_token text, p_decision text, p_ip text, p_user_agent text) to anon;
grant execute on function public.arvo_confirm_proposal_decision(public_token text, p_decision text, p_ip text, p_user_agent text) to authenticated;
grant execute on function public.arvo_confirm_proposal_decision(public_token text, p_decision text, p_ip text, p_user_agent text) to service_role;

revoke all on function public.arvo_create_contract_addendum(p_contract_id uuid, p_work_plan jsonb, p_payment_dates jsonb, p_note text) from public;
grant execute on function public.arvo_create_contract_addendum(p_contract_id uuid, p_work_plan jsonb, p_payment_dates jsonb, p_note text) to authenticated;
grant execute on function public.arvo_create_contract_addendum(p_contract_id uuid, p_work_plan jsonb, p_payment_dates jsonb, p_note text) to service_role;

revoke all on function public.arvo_custom_domain_available(p_domain text, p_organization_id uuid) from public;
grant execute on function public.arvo_custom_domain_available(p_domain text, p_organization_id uuid) to authenticated;
grant execute on function public.arvo_custom_domain_available(p_domain text, p_organization_id uuid) to service_role;

revoke all on function public.arvo_is_member(target_org uuid) from public;
grant execute on function public.arvo_is_member(target_org uuid) to public;
grant execute on function public.arvo_is_member(target_org uuid) to authenticated;
grant execute on function public.arvo_is_member(target_org uuid) to anon;
grant execute on function public.arvo_is_member(target_org uuid) to service_role;

revoke all on function public.arvo_is_message_channel_member(p_channel_id uuid) from public;
grant execute on function public.arvo_is_message_channel_member(p_channel_id uuid) to authenticated;
grant execute on function public.arvo_is_message_channel_member(p_channel_id uuid) to service_role;

revoke all on function public.arvo_message_unread_counts(p_organization_id uuid) from public;
grant execute on function public.arvo_message_unread_counts(p_organization_id uuid) to service_role;
grant execute on function public.arvo_message_unread_counts(p_organization_id uuid) to authenticated;

revoke all on function public.arvo_public_contract_audit(public_token text) from public;
grant execute on function public.arvo_public_contract_audit(public_token text) to anon;
grant execute on function public.arvo_public_contract_audit(public_token text) to service_role;
grant execute on function public.arvo_public_contract_audit(public_token text) to authenticated;

revoke all on function public.arvo_public_contract_links(public_token text) from public;
grant execute on function public.arvo_public_contract_links(public_token text) to service_role;
grant execute on function public.arvo_public_contract_links(public_token text) to anon;
grant execute on function public.arvo_public_contract_links(public_token text) to authenticated;

revoke all on function public.arvo_public_contract_plan(public_token text) from public;
grant execute on function public.arvo_public_contract_plan(public_token text) to anon;
grant execute on function public.arvo_public_contract_plan(public_token text) to service_role;
grant execute on function public.arvo_public_contract_plan(public_token text) to authenticated;

revoke all on function public.arvo_public_organization_legal(public_token text, document_type text) from public;
grant execute on function public.arvo_public_organization_legal(public_token text, document_type text) to service_role;
grant execute on function public.arvo_public_organization_legal(public_token text, document_type text) to anon;
grant execute on function public.arvo_public_organization_legal(public_token text, document_type text) to authenticated;

revoke all on function public.arvo_public_proposal_decision(public_token text) from public;
grant execute on function public.arvo_public_proposal_decision(public_token text) to anon;
grant execute on function public.arvo_public_proposal_decision(public_token text) to authenticated;
grant execute on function public.arvo_public_proposal_decision(public_token text) to service_role;

revoke all on function public.arvo_record_contract_consents(public_token text, p_legal_version text, p_consents jsonb) from public;
grant execute on function public.arvo_record_contract_consents(public_token text, p_legal_version text, p_consents jsonb) to authenticated;
grant execute on function public.arvo_record_contract_consents(public_token text, p_legal_version text, p_consents jsonb) to service_role;
grant execute on function public.arvo_record_contract_consents(public_token text, p_legal_version text, p_consents jsonb) to anon;

revoke all on function public.arvo_record_paytr_payment(p_payment_link_id uuid, p_merchant_oid text, p_total_amount bigint, p_payment_amount bigint, p_currency text, p_test_mode boolean, p_payload jsonb) from public;
grant execute on function public.arvo_record_paytr_payment(p_payment_link_id uuid, p_merchant_oid text, p_total_amount bigint, p_payment_amount bigint, p_currency text, p_test_mode boolean, p_payload jsonb) to service_role;

revoke all on function public.arvo_record_proposal_response_agent(public_token text, p_user_agent text) from public;
grant execute on function public.arvo_record_proposal_response_agent(public_token text, p_user_agent text) to service_role;
grant execute on function public.arvo_record_proposal_response_agent(public_token text, p_user_agent text) to authenticated;
grant execute on function public.arvo_record_proposal_response_agent(public_token text, p_user_agent text) to anon;

revoke all on function public.arvo_respond_contract_addendum(public_token text, p_addendum_id uuid, p_decision text, p_name text, p_note text, p_ip text, p_user_agent text) from public;
grant execute on function public.arvo_respond_contract_addendum(public_token text, p_addendum_id uuid, p_decision text, p_name text, p_note text, p_ip text, p_user_agent text) to service_role;
grant execute on function public.arvo_respond_contract_addendum(public_token text, p_addendum_id uuid, p_decision text, p_name text, p_note text, p_ip text, p_user_agent text) to anon;
grant execute on function public.arvo_respond_contract_addendum(public_token text, p_addendum_id uuid, p_decision text, p_name text, p_note text, p_ip text, p_user_agent text) to authenticated;

revoke all on function public.arvo_storage_usage() from public;
grant execute on function public.arvo_storage_usage() to service_role;

revoke all on function public.arvo_tracking_attempts_prune() from public;
grant execute on function public.arvo_tracking_attempts_prune() to service_role;

revoke all on function public.arvo_tracking_confirm_proposal(p_tracking_code text, p_decision text, p_ip text, p_user_agent text) from public;
grant execute on function public.arvo_tracking_confirm_proposal(p_tracking_code text, p_decision text, p_ip text, p_user_agent text) to service_role;

revoke all on function public.arvo_tracking_document_links(p_tracking_code text) from public;
grant execute on function public.arvo_tracking_document_links(p_tracking_code text) to service_role;

revoke all on function public.arvo_tracking_documents(p_tracking_code text) from public;
grant execute on function public.arvo_tracking_documents(p_tracking_code text) to service_role;

revoke all on function public.arvo_tracking_guard(p_client_ip text, p_code text) from public;
grant execute on function public.arvo_tracking_guard(p_client_ip text, p_code text) to service_role;

revoke all on function public.arvo_tracking_work_plan(p_tracking_code text) from public;
grant execute on function public.arvo_tracking_work_plan(p_tracking_code text) to service_role;

revoke all on function public.arvo_unread_notification_count(p_organization_id uuid) from public;
grant execute on function public.arvo_unread_notification_count(p_organization_id uuid) to authenticated;
grant execute on function public.arvo_unread_notification_count(p_organization_id uuid) to service_role;

revoke all on function public.attach_arvoculture_order_owner() from public;
grant execute on function public.attach_arvoculture_order_owner() to service_role;
grant execute on function public.attach_arvoculture_order_owner() to authenticated;
grant execute on function public.attach_arvoculture_order_owner() to anon;
grant execute on function public.attach_arvoculture_order_owner() to public;

revoke all on function public.authorize_customer_portal_file_download(p_tracking_code text, p_file_id uuid, p_client_ip text, p_user_agent text) from public;
grant execute on function public.authorize_customer_portal_file_download(p_tracking_code text, p_file_id uuid, p_client_ip text, p_user_agent text) to service_role;

revoke all on function public.check_arvoculture_coupon(p_code text, p_subtotal bigint, p_email text) from public;
grant execute on function public.check_arvoculture_coupon(p_code text, p_subtotal bigint, p_email text) to service_role;

revoke all on function public.claim_arvoculture_orders() from public;
grant execute on function public.claim_arvoculture_orders() to service_role;
grant execute on function public.claim_arvoculture_orders() to authenticated;

revoke all on function public.collect_payment_installment(target_installment_id uuid) from public;
grant execute on function public.collect_payment_installment(target_installment_id uuid) to authenticated;
grant execute on function public.collect_payment_installment(target_installment_id uuid) to public;
grant execute on function public.collect_payment_installment(target_installment_id uuid) to service_role;
grant execute on function public.collect_payment_installment(target_installment_id uuid) to anon;

revoke all on function public.complete_organization_onboarding(p_organization_id uuid, p_legal_name text, p_phone text, p_website text, p_logo_url text, p_primary_color text) from public;
grant execute on function public.complete_organization_onboarding(p_organization_id uuid, p_legal_name text, p_phone text, p_website text, p_logo_url text, p_primary_color text) to authenticated;
grant execute on function public.complete_organization_onboarding(p_organization_id uuid, p_legal_name text, p_phone text, p_website text, p_logo_url text, p_primary_color text) to service_role;

revoke all on function public.create_arvoculture_return_request(p_order_number text, p_items jsonb, p_reason text, p_note text) from public;
grant execute on function public.create_arvoculture_return_request(p_order_number text, p_items jsonb, p_reason text, p_note text) to service_role;
grant execute on function public.create_arvoculture_return_request(p_order_number text, p_items jsonb, p_reason text, p_note text) to authenticated;

revoke all on function public.create_arvoculture_storefront_order(p_email text, p_name text, p_phone text, p_address jsonb, p_items jsonb, p_coupon_code text) from public;
grant execute on function public.create_arvoculture_storefront_order(p_email text, p_name text, p_phone text, p_address jsonb, p_items jsonb, p_coupon_code text) to service_role;

revoke all on function public.create_crm_proposal(target_opportunity_id uuid, proposal_title text, proposal_scope text, proposal_amount bigint, proposal_payment_plan text, proposal_valid_until date) from public;
grant execute on function public.create_crm_proposal(target_opportunity_id uuid, proposal_title text, proposal_scope text, proposal_amount bigint, proposal_payment_plan text, proposal_valid_until date) to public;
grant execute on function public.create_crm_proposal(target_opportunity_id uuid, proposal_title text, proposal_scope text, proposal_amount bigint, proposal_payment_plan text, proposal_valid_until date) to service_role;
grant execute on function public.create_crm_proposal(target_opportunity_id uuid, proposal_title text, proposal_scope text, proposal_amount bigint, proposal_payment_plan text, proposal_valid_until date) to authenticated;
grant execute on function public.create_crm_proposal(target_opportunity_id uuid, proposal_title text, proposal_scope text, proposal_amount bigint, proposal_payment_plan text, proposal_valid_until date) to anon;

revoke all on function public.create_crm_proposal_revision(target_proposal_id uuid, revision_reason text) from public;
grant execute on function public.create_crm_proposal_revision(target_proposal_id uuid, revision_reason text) to anon;
grant execute on function public.create_crm_proposal_revision(target_proposal_id uuid, revision_reason text) to public;
grant execute on function public.create_crm_proposal_revision(target_proposal_id uuid, revision_reason text) to service_role;
grant execute on function public.create_crm_proposal_revision(target_proposal_id uuid, revision_reason text) to authenticated;

revoke all on function public.create_crm_proposal_v2(target_opportunity_id uuid, proposal_title text, proposal_scope text, proposal_amount bigint, proposal_tax_status text, proposal_payment_plan_type text, proposal_payment_plan text, proposal_payment_schedule jsonb, proposal_valid_until date, proposal_estimated_delivery_date date) from public;
grant execute on function public.create_crm_proposal_v2(target_opportunity_id uuid, proposal_title text, proposal_scope text, proposal_amount bigint, proposal_tax_status text, proposal_payment_plan_type text, proposal_payment_plan text, proposal_payment_schedule jsonb, proposal_valid_until date, proposal_estimated_delivery_date date) to authenticated;
grant execute on function public.create_crm_proposal_v2(target_opportunity_id uuid, proposal_title text, proposal_scope text, proposal_amount bigint, proposal_tax_status text, proposal_payment_plan_type text, proposal_payment_plan text, proposal_payment_schedule jsonb, proposal_valid_until date, proposal_estimated_delivery_date date) to anon;
grant execute on function public.create_crm_proposal_v2(target_opportunity_id uuid, proposal_title text, proposal_scope text, proposal_amount bigint, proposal_tax_status text, proposal_payment_plan_type text, proposal_payment_plan text, proposal_payment_schedule jsonb, proposal_valid_until date, proposal_estimated_delivery_date date) to service_role;

revoke all on function public.create_customer_organization(p_name text, p_slug text, p_sector text, p_plan_code text, p_custom_domain text) from public;
grant execute on function public.create_customer_organization(p_name text, p_slug text, p_sector text, p_plan_code text, p_custom_domain text) to authenticated;
grant execute on function public.create_customer_organization(p_name text, p_slug text, p_sector text, p_plan_code text, p_custom_domain text) to service_role;

revoke all on function public.create_direct_message_channel(target_user_id uuid, target_organization_id uuid) from public;
grant execute on function public.create_direct_message_channel(target_user_id uuid, target_organization_id uuid) to authenticated;
grant execute on function public.create_direct_message_channel(target_user_id uuid, target_organization_id uuid) to service_role;

revoke all on function public.create_group_message_channel(p_organization_id uuid, p_name text, p_member_ids uuid[]) from public;
grant execute on function public.create_group_message_channel(p_organization_id uuid, p_name text, p_member_ids uuid[]) to service_role;
grant execute on function public.create_group_message_channel(p_organization_id uuid, p_name text, p_member_ids uuid[]) to authenticated;

revoke all on function public.crm_customer_history(p_organization_id uuid, p_customer_key text, p_phone text, p_name text, p_exclude_opportunity_id uuid, p_limit integer) from public;
grant execute on function public.crm_customer_history(p_organization_id uuid, p_customer_key text, p_phone text, p_name text, p_exclude_opportunity_id uuid, p_limit integer) to authenticated;
grant execute on function public.crm_customer_history(p_organization_id uuid, p_customer_key text, p_phone text, p_name text, p_exclude_opportunity_id uuid, p_limit integer) to service_role;

revoke all on function public.crm_customer_search(p_organization_id uuid, p_query text, p_limit integer) from public;
grant execute on function public.crm_customer_search(p_organization_id uuid, p_query text, p_limit integer) to authenticated;
grant execute on function public.crm_customer_search(p_organization_id uuid, p_query text, p_limit integer) to service_role;

revoke all on function public.delete_group_message_channel(p_channel_id uuid) from public;
grant execute on function public.delete_group_message_channel(p_channel_id uuid) to authenticated;
grant execute on function public.delete_group_message_channel(p_channel_id uuid) to service_role;

revoke all on function public.expire_due_crm_proposals() from public;
grant execute on function public.expire_due_crm_proposals() to service_role;

revoke all on function public.generate_contract_tracking_code() from public;
grant execute on function public.generate_contract_tracking_code() to anon;
grant execute on function public.generate_contract_tracking_code() to service_role;
grant execute on function public.generate_contract_tracking_code() to public;
grant execute on function public.generate_contract_tracking_code() to authenticated;

revoke all on function public.get_arvoculture_my_orders() from public;
grant execute on function public.get_arvoculture_my_orders() to service_role;
grant execute on function public.get_arvoculture_my_orders() to authenticated;

revoke all on function public.get_arvoculture_my_returns() from public;
grant execute on function public.get_arvoculture_my_returns() to authenticated;
grant execute on function public.get_arvoculture_my_returns() to service_role;

revoke all on function public.get_arvoculture_storefront_collection_products(p_collection_slug text, p_menu_groups text[], p_limit integer) from public;
grant execute on function public.get_arvoculture_storefront_collection_products(p_collection_slug text, p_menu_groups text[], p_limit integer) to anon;
grant execute on function public.get_arvoculture_storefront_collection_products(p_collection_slug text, p_menu_groups text[], p_limit integer) to service_role;
grant execute on function public.get_arvoculture_storefront_collection_products(p_collection_slug text, p_menu_groups text[], p_limit integer) to authenticated;

revoke all on function public.get_arvoculture_storefront_collections() from public;
grant execute on function public.get_arvoculture_storefront_collections() to service_role;
grant execute on function public.get_arvoculture_storefront_collections() to anon;
grant execute on function public.get_arvoculture_storefront_collections() to authenticated;

revoke all on function public.get_arvoculture_storefront_deals(p_limit integer) from public;
grant execute on function public.get_arvoculture_storefront_deals(p_limit integer) to anon;
grant execute on function public.get_arvoculture_storefront_deals(p_limit integer) to service_role;
grant execute on function public.get_arvoculture_storefront_deals(p_limit integer) to authenticated;

revoke all on function public.get_arvoculture_storefront_discounts() from public;
grant execute on function public.get_arvoculture_storefront_discounts() to anon;
grant execute on function public.get_arvoculture_storefront_discounts() to authenticated;
grant execute on function public.get_arvoculture_storefront_discounts() to service_role;

revoke all on function public.get_arvoculture_storefront_facets() from public;
grant execute on function public.get_arvoculture_storefront_facets() to public;
grant execute on function public.get_arvoculture_storefront_facets() to service_role;
grant execute on function public.get_arvoculture_storefront_facets() to authenticated;
grant execute on function public.get_arvoculture_storefront_facets() to anon;

revoke all on function public.get_arvoculture_storefront_product(p_slug text) from public;
grant execute on function public.get_arvoculture_storefront_product(p_slug text) to authenticated;
grant execute on function public.get_arvoculture_storefront_product(p_slug text) to anon;
grant execute on function public.get_arvoculture_storefront_product(p_slug text) to service_role;

revoke all on function public.get_arvoculture_storefront_product_badges() from public;
grant execute on function public.get_arvoculture_storefront_product_badges() to anon;
grant execute on function public.get_arvoculture_storefront_product_badges() to authenticated;
grant execute on function public.get_arvoculture_storefront_product_badges() to service_role;

revoke all on function public.get_arvoculture_storefront_product_count() from public;
grant execute on function public.get_arvoculture_storefront_product_count() to authenticated;
grant execute on function public.get_arvoculture_storefront_product_count() to service_role;
grant execute on function public.get_arvoculture_storefront_product_count() to anon;

revoke all on function public.get_arvoculture_storefront_product_slugs(p_limit integer) from public;
grant execute on function public.get_arvoculture_storefront_product_slugs(p_limit integer) to authenticated;
grant execute on function public.get_arvoculture_storefront_product_slugs(p_limit integer) to public;
grant execute on function public.get_arvoculture_storefront_product_slugs(p_limit integer) to anon;
grant execute on function public.get_arvoculture_storefront_product_slugs(p_limit integer) to service_role;

revoke all on function public.get_arvoculture_storefront_products(p_limit integer, p_offset integer) from public;
grant execute on function public.get_arvoculture_storefront_products(p_limit integer, p_offset integer) to authenticated;
grant execute on function public.get_arvoculture_storefront_products(p_limit integer, p_offset integer) to service_role;
grant execute on function public.get_arvoculture_storefront_products(p_limit integer, p_offset integer) to anon;

revoke all on function public.get_arvoculture_storefront_products_page(p_limit integer, p_offset integer, p_brand text, p_size text, p_max_price bigint, p_only_discounted boolean, p_only_available boolean, p_sort text) from public;
grant execute on function public.get_arvoculture_storefront_products_page(p_limit integer, p_offset integer, p_brand text, p_size text, p_max_price bigint, p_only_discounted boolean, p_only_available boolean, p_sort text) to authenticated;
grant execute on function public.get_arvoculture_storefront_products_page(p_limit integer, p_offset integer, p_brand text, p_size text, p_max_price bigint, p_only_discounted boolean, p_only_available boolean, p_sort text) to public;
grant execute on function public.get_arvoculture_storefront_products_page(p_limit integer, p_offset integer, p_brand text, p_size text, p_max_price bigint, p_only_discounted boolean, p_only_available boolean, p_sort text) to anon;
grant execute on function public.get_arvoculture_storefront_products_page(p_limit integer, p_offset integer, p_brand text, p_size text, p_max_price bigint, p_only_discounted boolean, p_only_available boolean, p_sort text) to service_role;

revoke all on function public.get_arvoculture_storefront_search_index(p_limit integer) from public;
grant execute on function public.get_arvoculture_storefront_search_index(p_limit integer) to public;
grant execute on function public.get_arvoculture_storefront_search_index(p_limit integer) to service_role;
grant execute on function public.get_arvoculture_storefront_search_index(p_limit integer) to authenticated;
grant execute on function public.get_arvoculture_storefront_search_index(p_limit integer) to anon;

revoke all on function public.get_arvoculture_storefront_settings() from public;
grant execute on function public.get_arvoculture_storefront_settings() to authenticated;
grant execute on function public.get_arvoculture_storefront_settings() to anon;
grant execute on function public.get_arvoculture_storefront_settings() to service_role;

revoke all on function public.get_arvoculture_storefront_variants(p_slug text) from public;
grant execute on function public.get_arvoculture_storefront_variants(p_slug text) to authenticated;
grant execute on function public.get_arvoculture_storefront_variants(p_slug text) to anon;
grant execute on function public.get_arvoculture_storefront_variants(p_slug text) to service_role;

revoke all on function public.get_my_workspaces() from public;
grant execute on function public.get_my_workspaces() to authenticated;
grant execute on function public.get_my_workspaces() to service_role;
grant execute on function public.get_my_workspaces() to anon;

revoke all on function public.get_public_crm_contract(public_token text) from public;
grant execute on function public.get_public_crm_contract(public_token text) to authenticated;
grant execute on function public.get_public_crm_contract(public_token text) to anon;
grant execute on function public.get_public_crm_contract(public_token text) to service_role;

revoke all on function public.get_public_crm_proposal(public_token text) from public;
grant execute on function public.get_public_crm_proposal(public_token text) to authenticated;
grant execute on function public.get_public_crm_proposal(public_token text) to service_role;
grant execute on function public.get_public_crm_proposal(public_token text) to anon;
grant execute on function public.get_public_crm_proposal(public_token text) to public;

revoke all on function public.get_public_organization_branding(p_slug text) from public;
grant execute on function public.get_public_organization_branding(p_slug text) to service_role;
grant execute on function public.get_public_organization_branding(p_slug text) to anon;
grant execute on function public.get_public_organization_branding(p_slug text) to authenticated;

revoke all on function public.get_public_organization_branding_by_id(p_org_id uuid) from public;
grant execute on function public.get_public_organization_branding_by_id(p_org_id uuid) to service_role;
grant execute on function public.get_public_organization_branding_by_id(p_org_id uuid) to authenticated;
grant execute on function public.get_public_organization_branding_by_id(p_org_id uuid) to anon;

revoke all on function public.get_storefront_seller(p_tenant text) from public;
grant execute on function public.get_storefront_seller(p_tenant text) to service_role;
grant execute on function public.get_storefront_seller(p_tenant text) to anon;
grant execute on function public.get_storefront_seller(p_tenant text) to authenticated;

revoke all on function public.guard_operation_customer_file() from public;
grant execute on function public.guard_operation_customer_file() to service_role;

revoke all on function public.guard_operation_workflow_archive() from public;
grant execute on function public.guard_operation_workflow_archive() to service_role;

revoke all on function public.issue_crm_contract_link(target_contract_id uuid) from public;
grant execute on function public.issue_crm_contract_link(target_contract_id uuid) to public;
grant execute on function public.issue_crm_contract_link(target_contract_id uuid) to anon;
grant execute on function public.issue_crm_contract_link(target_contract_id uuid) to authenticated;
grant execute on function public.issue_crm_contract_link(target_contract_id uuid) to service_role;

revoke all on function public.issue_crm_proposal_link(target_proposal_id uuid) from public;
grant execute on function public.issue_crm_proposal_link(target_proposal_id uuid) to service_role;
grant execute on function public.issue_crm_proposal_link(target_proposal_id uuid) to authenticated;
grant execute on function public.issue_crm_proposal_link(target_proposal_id uuid) to anon;
grant execute on function public.issue_crm_proposal_link(target_proposal_id uuid) to public;

revoke all on function public.leave_message_channel(p_channel_id uuid) from public;
grant execute on function public.leave_message_channel(p_channel_id uuid) to service_role;
grant execute on function public.leave_message_channel(p_channel_id uuid) to authenticated;

revoke all on function public.list_customer_file_messages(p_tracking_code text) from public;
grant execute on function public.list_customer_file_messages(p_tracking_code text) to service_role;

revoke all on function public.list_customer_portal_files(p_tracking_code text) from public;
grant execute on function public.list_customer_portal_files(p_tracking_code text) to service_role;

revoke all on function public.log_document_access(target_document_type text, target_document_id uuid, target_access_type text, target_ip text, target_user_agent text, target_referrer text, target_metadata jsonb) from public;
grant execute on function public.log_document_access(target_document_type text, target_document_id uuid, target_access_type text, target_ip text, target_user_agent text, target_referrer text, target_metadata jsonb) to service_role;
grant execute on function public.log_document_access(target_document_type text, target_document_id uuid, target_access_type text, target_ip text, target_user_agent text, target_referrer text, target_metadata jsonb) to anon;
grant execute on function public.log_document_access(target_document_type text, target_document_id uuid, target_access_type text, target_ip text, target_user_agent text, target_referrer text, target_metadata jsonb) to authenticated;
grant execute on function public.log_document_access(target_document_type text, target_document_id uuid, target_access_type text, target_ip text, target_user_agent text, target_referrer text, target_metadata jsonb) to public;

revoke all on function public.log_public_document_access(public_token text, target_document_type text, target_access_type text, target_ip text, target_user_agent text, target_referrer text, target_metadata jsonb) from public;
grant execute on function public.log_public_document_access(public_token text, target_document_type text, target_access_type text, target_ip text, target_user_agent text, target_referrer text, target_metadata jsonb) to public;
grant execute on function public.log_public_document_access(public_token text, target_document_type text, target_access_type text, target_ip text, target_user_agent text, target_referrer text, target_metadata jsonb) to service_role;
grant execute on function public.log_public_document_access(public_token text, target_document_type text, target_access_type text, target_ip text, target_user_agent text, target_referrer text, target_metadata jsonb) to authenticated;
grant execute on function public.log_public_document_access(public_token text, target_document_type text, target_access_type text, target_ip text, target_user_agent text, target_referrer text, target_metadata jsonb) to anon;

revoke all on function public.log_public_document_access_by_token(target_document_type text, public_token text, target_access_type text, target_ip text, target_user_agent text, target_referrer text, target_metadata jsonb) from public;
grant execute on function public.log_public_document_access_by_token(target_document_type text, public_token text, target_access_type text, target_ip text, target_user_agent text, target_referrer text, target_metadata jsonb) to authenticated;
grant execute on function public.log_public_document_access_by_token(target_document_type text, public_token text, target_access_type text, target_ip text, target_user_agent text, target_referrer text, target_metadata jsonb) to public;
grant execute on function public.log_public_document_access_by_token(target_document_type text, public_token text, target_access_type text, target_ip text, target_user_agent text, target_referrer text, target_metadata jsonb) to anon;
grant execute on function public.log_public_document_access_by_token(target_document_type text, public_token text, target_access_type text, target_ip text, target_user_agent text, target_referrer text, target_metadata jsonb) to service_role;

revoke all on function public.lookup_contract_by_tracking_code(p_org_slug text, p_tracking_code text) from public;
grant execute on function public.lookup_contract_by_tracking_code(p_org_slug text, p_tracking_code text) to service_role;

revoke all on function public.lookup_contract_by_tracking_code_global(p_tracking_code text) from public;
grant execute on function public.lookup_contract_by_tracking_code_global(p_tracking_code text) to service_role;

revoke all on function public.lookup_contracts_by_phone_suffix(p_org_slug text, p_phone_suffix text) from public;
grant execute on function public.lookup_contracts_by_phone_suffix(p_org_slug text, p_phone_suffix text) to service_role;

revoke all on function public.mark_crm_contract_viewed(public_token text) from public;
grant execute on function public.mark_crm_contract_viewed(public_token text) to authenticated;
grant execute on function public.mark_crm_contract_viewed(public_token text) to anon;
grant execute on function public.mark_crm_contract_viewed(public_token text) to public;
grant execute on function public.mark_crm_contract_viewed(public_token text) to service_role;

revoke all on function public.mark_crm_proposal_viewed(public_token text) from public;
grant execute on function public.mark_crm_proposal_viewed(public_token text) to service_role;
grant execute on function public.mark_crm_proposal_viewed(public_token text) to public;
grant execute on function public.mark_crm_proposal_viewed(public_token text) to anon;
grant execute on function public.mark_crm_proposal_viewed(public_token text) to authenticated;

revoke all on function public.mark_message_channel_read(p_channel_id uuid) from public;
grant execute on function public.mark_message_channel_read(p_channel_id uuid) to authenticated;
grant execute on function public.mark_message_channel_read(p_channel_id uuid) to service_role;

revoke all on function public.next_document_number(target_organization_id uuid, target_document_type text, default_prefix text, target_date date) from public;
grant execute on function public.next_document_number(target_organization_id uuid, target_document_type text, default_prefix text, target_date date) to service_role;
grant execute on function public.next_document_number(target_organization_id uuid, target_document_type text, default_prefix text, target_date date) to authenticated;

revoke all on function public.portal_payment_settled(p_workflow_id uuid) from public;
grant execute on function public.portal_payment_settled(p_workflow_id uuid) to service_role;

revoke all on function public.portal_workflow_payment_status(p_workflow_id uuid) from public;
grant execute on function public.portal_workflow_payment_status(p_workflow_id uuid) to authenticated;
grant execute on function public.portal_workflow_payment_status(p_workflow_id uuid) to service_role;

revoke all on function public.provision_customer_organization(p_name text, p_slug text, p_sector text, p_plan_code text, p_owner_email text, p_custom_domain text) from public;
grant execute on function public.provision_customer_organization(p_name text, p_slug text, p_sector text, p_plan_code text, p_owner_email text, p_custom_domain text) to authenticated;
grant execute on function public.provision_customer_organization(p_name text, p_slug text, p_sector text, p_plan_code text, p_owner_email text, p_custom_domain text) to service_role;

revoke all on function public.rebuild_payment_plan_installments(p_plan_id uuid, p_installment_count integer, p_first_due_date date, p_interval_months integer) from public;
grant execute on function public.rebuild_payment_plan_installments(p_plan_id uuid, p_installment_count integer, p_first_due_date date, p_interval_months integer) to public;
grant execute on function public.rebuild_payment_plan_installments(p_plan_id uuid, p_installment_count integer, p_first_due_date date, p_interval_months integer) to anon;
grant execute on function public.rebuild_payment_plan_installments(p_plan_id uuid, p_installment_count integer, p_first_due_date date, p_interval_months integer) to authenticated;
grant execute on function public.rebuild_payment_plan_installments(p_plan_id uuid, p_installment_count integer, p_first_due_date date, p_interval_months integer) to service_role;

revoke all on function public.resolve_organization_by_domain(p_domain text) from public;
grant execute on function public.resolve_organization_by_domain(p_domain text) to anon;
grant execute on function public.resolve_organization_by_domain(p_domain text) to authenticated;
grant execute on function public.resolve_organization_by_domain(p_domain text) to service_role;

revoke all on function public.respond_to_crm_proposal(public_token text, decision text, p_ip text) from public;
grant execute on function public.respond_to_crm_proposal(public_token text, decision text, p_ip text) to service_role;
grant execute on function public.respond_to_crm_proposal(public_token text, decision text, p_ip text) to anon;
grant execute on function public.respond_to_crm_proposal(public_token text, decision text, p_ip text) to authenticated;

revoke all on function public.review_bank_transfer_payment(p_payment_id uuid, p_decision text, p_review_note text) from public;
grant execute on function public.review_bank_transfer_payment(p_payment_id uuid, p_decision text, p_review_note text) to authenticated;
grant execute on function public.review_bank_transfer_payment(p_payment_id uuid, p_decision text, p_review_note text) to service_role;

revoke all on function public.seed_organization_demo_data(p_organization_id uuid, p_seed_crm boolean, p_seed_operations boolean) from public;
grant execute on function public.seed_organization_demo_data(p_organization_id uuid, p_seed_crm boolean, p_seed_operations boolean) to service_role;
grant execute on function public.seed_organization_demo_data(p_organization_id uuid, p_seed_crm boolean, p_seed_operations boolean) to authenticated;

revoke all on function public.seed_standard_operation_steps_trigger() from public;
grant execute on function public.seed_standard_operation_steps_trigger() to public;
grant execute on function public.seed_standard_operation_steps_trigger() to service_role;
grant execute on function public.seed_standard_operation_steps_trigger() to authenticated;
grant execute on function public.seed_standard_operation_steps_trigger() to anon;

revoke all on function public.send_customer_file_message(p_tracking_code text, p_body text) from public;
grant execute on function public.send_customer_file_message(p_tracking_code text, p_body text) to service_role;

revoke all on function public.send_management_announcement(p_organization_id uuid, p_title text, p_message text, p_target_user_id uuid) from public;
grant execute on function public.send_management_announcement(p_organization_id uuid, p_title text, p_message text, p_target_user_id uuid) to service_role;
grant execute on function public.send_management_announcement(p_organization_id uuid, p_title text, p_message text, p_target_user_id uuid) to authenticated;

revoke all on function public.settle_arvoculture_storefront_order(p_order_id uuid, p_paid boolean, p_payment_reference text, p_failure_reason text) from public;
grant execute on function public.settle_arvoculture_storefront_order(p_order_id uuid, p_paid boolean, p_payment_reference text, p_failure_reason text) to service_role;

revoke all on function public.sign_crm_contract(public_token text, signer_name text, signer_ip text, signer_user_agent text) from public;
grant execute on function public.sign_crm_contract(public_token text, signer_name text, signer_ip text, signer_user_agent text) to service_role;

revoke all on function public.sign_crm_contract_v2(public_token text, signer_name text, signature_data text, signer_ip text, signer_user_agent text) from public;
grant execute on function public.sign_crm_contract_v2(public_token text, signer_name text, signature_data text, signer_ip text, signer_user_agent text) to anon;
grant execute on function public.sign_crm_contract_v2(public_token text, signer_name text, signature_data text, signer_ip text, signer_user_agent text) to public;
grant execute on function public.sign_crm_contract_v2(public_token text, signer_name text, signature_data text, signer_ip text, signer_user_agent text) to service_role;
grant execute on function public.sign_crm_contract_v2(public_token text, signer_name text, signature_data text, signer_ip text, signer_user_agent text) to authenticated;

revoke all on function public.submit_public_lead(org_slug text, p_customer_name text, p_email text, p_phone text, p_service text, p_message text) from public;
grant execute on function public.submit_public_lead(org_slug text, p_customer_name text, p_email text, p_phone text, p_service text, p_message text) to service_role;
grant execute on function public.submit_public_lead(org_slug text, p_customer_name text, p_email text, p_phone text, p_service text, p_message text) to anon;
grant execute on function public.submit_public_lead(org_slug text, p_customer_name text, p_email text, p_phone text, p_service text, p_message text) to authenticated;

revoke all on function public.submit_site_lead(p_name text, p_email text, p_phone text, p_company text, p_interest text, p_message text, p_locale text, p_page text, p_ip_hash text, p_consent boolean) from public;
grant execute on function public.submit_site_lead(p_name text, p_email text, p_phone text, p_company text, p_interest text, p_message text, p_locale text, p_page text, p_ip_hash text, p_consent boolean) to authenticated;
grant execute on function public.submit_site_lead(p_name text, p_email text, p_phone text, p_company text, p_interest text, p_message text, p_locale text, p_page text, p_ip_hash text, p_consent boolean) to anon;
grant execute on function public.submit_site_lead(p_name text, p_email text, p_phone text, p_company text, p_interest text, p_message text, p_locale text, p_page text, p_ip_hash text, p_consent boolean) to service_role;

revoke all on function public.sync_contract_status_from_workflow() from public;
grant execute on function public.sync_contract_status_from_workflow() to service_role;
grant execute on function public.sync_contract_status_from_workflow() to public;
grant execute on function public.sync_contract_status_from_workflow() to anon;
grant execute on function public.sync_contract_status_from_workflow() to authenticated;

revoke all on function public.sync_contract_workflow_link() from public;
grant execute on function public.sync_contract_workflow_link() to anon;
grant execute on function public.sync_contract_workflow_link() to service_role;
grant execute on function public.sync_contract_workflow_link() to public;
grant execute on function public.sync_contract_workflow_link() to authenticated;

revoke all on function public.sync_workflow_completion_from_steps() from public;
grant execute on function public.sync_workflow_completion_from_steps() to authenticated;
grant execute on function public.sync_workflow_completion_from_steps() to service_role;
grant execute on function public.sync_workflow_completion_from_steps() to public;
grant execute on function public.sync_workflow_completion_from_steps() to anon;

revoke all on function public.update_arvoculture_profile(p_full_name text, p_phone text) from public;
grant execute on function public.update_arvoculture_profile(p_full_name text, p_phone text) to service_role;
grant execute on function public.update_arvoculture_profile(p_full_name text, p_phone text) to authenticated;

revoke all on function public.update_crm_contract(target_contract_id uuid, contract_title text, contract_scope text, contract_amount bigint, contract_payment_plan text, contract_start_date date, contract_due_date date) from public;
grant execute on function public.update_crm_contract(target_contract_id uuid, contract_title text, contract_scope text, contract_amount bigint, contract_payment_plan text, contract_start_date date, contract_due_date date) to anon;
grant execute on function public.update_crm_contract(target_contract_id uuid, contract_title text, contract_scope text, contract_amount bigint, contract_payment_plan text, contract_start_date date, contract_due_date date) to authenticated;
grant execute on function public.update_crm_contract(target_contract_id uuid, contract_title text, contract_scope text, contract_amount bigint, contract_payment_plan text, contract_start_date date, contract_due_date date) to service_role;
grant execute on function public.update_crm_contract(target_contract_id uuid, contract_title text, contract_scope text, contract_amount bigint, contract_payment_plan text, contract_start_date date, contract_due_date date) to public;

revoke all on function public.update_crm_proposal(target_proposal_id uuid, proposal_title text, proposal_scope text, proposal_amount bigint, proposal_payment_plan text, proposal_valid_until date) from public;
grant execute on function public.update_crm_proposal(target_proposal_id uuid, proposal_title text, proposal_scope text, proposal_amount bigint, proposal_payment_plan text, proposal_valid_until date) to service_role;
grant execute on function public.update_crm_proposal(target_proposal_id uuid, proposal_title text, proposal_scope text, proposal_amount bigint, proposal_payment_plan text, proposal_valid_until date) to public;
grant execute on function public.update_crm_proposal(target_proposal_id uuid, proposal_title text, proposal_scope text, proposal_amount bigint, proposal_payment_plan text, proposal_valid_until date) to anon;
grant execute on function public.update_crm_proposal(target_proposal_id uuid, proposal_title text, proposal_scope text, proposal_amount bigint, proposal_payment_plan text, proposal_valid_until date) to authenticated;

revoke all on function public.update_group_message_channel(p_channel_id uuid, p_name text, p_member_ids uuid[]) from public;
grant execute on function public.update_group_message_channel(p_channel_id uuid, p_name text, p_member_ids uuid[]) to service_role;
grant execute on function public.update_group_message_channel(p_channel_id uuid, p_name text, p_member_ids uuid[]) to authenticated;

revoke all on function public.update_member_display_name(p_organization_id uuid, p_user_id uuid, p_full_name text) from public;
grant execute on function public.update_member_display_name(p_organization_id uuid, p_user_id uuid, p_full_name text) to authenticated;
grant execute on function public.update_member_display_name(p_organization_id uuid, p_user_id uuid, p_full_name text) to anon;
grant execute on function public.update_member_display_name(p_organization_id uuid, p_user_id uuid, p_full_name text) to service_role;

CREATE TRIGGER arvo_account_entry_reconcile AFTER INSERT ON public.account_entries FOR EACH ROW EXECUTE FUNCTION private.arvo_account_entry_reconcile();

CREATE TRIGGER arvo_account_entry_refund_unreconcile AFTER INSERT ON public.account_entries FOR EACH ROW EXECUTE FUNCTION private.arvo_account_entry_refund_unreconcile();

CREATE TRIGGER arvo_account_entry_unreconcile AFTER DELETE ON public.account_entries FOR EACH ROW EXECUTE FUNCTION private.arvo_account_entry_unreconcile();

CREATE TRIGGER arc_addresses_before_write BEFORE INSERT OR UPDATE ON public.arc_customer_addresses FOR EACH ROW EXECUTE FUNCTION arc_address_before_write();

CREATE TRIGGER arc_order_items_stock_check BEFORE INSERT ON public.arc_order_items FOR EACH ROW EXECUTE FUNCTION arc_check_supplier_stock();

CREATE TRIGGER arc_orders_attach_owner BEFORE INSERT ON public.arc_orders FOR EACH ROW EXECUTE FUNCTION attach_arvoculture_order_owner();

CREATE TRIGGER arc_orders_count_coupon_use AFTER UPDATE OF payment_status ON public.arc_orders FOR EACH ROW EXECUTE FUNCTION arc_count_coupon_use();

CREATE TRIGGER arc_orders_fill_tax AFTER UPDATE OF subtotal, total ON public.arc_orders FOR EACH ROW EXECUTE FUNCTION arc_fill_order_tax();

CREATE TRIGGER arc_orders_log_event AFTER UPDATE ON public.arc_orders FOR EACH ROW EXECUTE FUNCTION arc_log_order_event();

CREATE TRIGGER arc_guard_payment_settings BEFORE INSERT OR UPDATE ON public.arc_store_settings FOR EACH ROW EXECUTE FUNCTION private.arc_guard_payment_settings();

CREATE TRIGGER arc_guard_store_domains BEFORE INSERT OR UPDATE OF custom_domain, panel_custom_domain ON public.arc_store_settings FOR EACH ROW EXECUTE FUNCTION private.arc_guard_store_domains();

CREATE TRIGGER arvo_guard_contract_addendum BEFORE UPDATE ON public.crm_contract_addenda FOR EACH ROW EXECUTE FUNCTION private.arvo_guard_contract_addendum();

CREATE TRIGGER arvo_contract_tracking_code BEFORE INSERT OR UPDATE OF tracking_code ON public.crm_contracts FOR EACH ROW EXECUTE FUNCTION private.arvo_contract_tracking_code();

CREATE TRIGGER arvo_freeze_signed_contract BEFORE UPDATE ON public.crm_contracts FOR EACH ROW EXECUTE FUNCTION private.arvo_freeze_signed_contract();

CREATE TRIGGER arvo_freeze_signed_work_plan BEFORE UPDATE OF work_plan ON public.crm_contracts FOR EACH ROW EXECUTE FUNCTION private.arvo_freeze_signed_work_plan();

CREATE TRIGGER arvo_guard_contract_signature BEFORE INSERT OR UPDATE ON public.crm_contracts FOR EACH ROW EXECUTE FUNCTION private.arvo_guard_contract_signature();

CREATE TRIGGER arvo_link_contract_messages_to_workflow AFTER UPDATE OF workflow_id ON public.crm_contracts FOR EACH ROW WHEN (((new.workflow_id IS NOT NULL) AND (new.workflow_id IS DISTINCT FROM old.workflow_id))) EXECUTE FUNCTION private.arvo_link_contract_messages_to_workflow();

CREATE TRIGGER arvo_normalize_contract_work_plan BEFORE INSERT OR UPDATE OF work_plan ON public.crm_contracts FOR EACH ROW EXECUTE FUNCTION private.arvo_normalize_contract_work_plan();

CREATE TRIGGER arvo_promote_draft_on_customer_view BEFORE UPDATE ON public.crm_contracts FOR EACH ROW EXECUTE FUNCTION private.arvo_promote_draft_on_customer_view();

CREATE TRIGGER arvo_sozlesmeden_abonelik_istegi AFTER UPDATE OF status ON public.crm_contracts FOR EACH ROW EXECUTE FUNCTION private.arvo_sozlesmeden_abonelik_istegi();

CREATE TRIGGER arvo_sync_installment_due_dates AFTER UPDATE OF payment_plan_id ON public.crm_contracts FOR EACH ROW WHEN (((new.payment_plan_id IS NOT NULL) AND (new.payment_plan_id IS DISTINCT FROM old.payment_plan_id))) EXECUTE FUNCTION private.arvo_sync_installment_due_dates();

CREATE TRIGGER notify_crm_internal_comment AFTER INSERT ON public.crm_internal_comments FOR EACH ROW EXECUTE FUNCTION private.notify_crm_internal_comment();

CREATE TRIGGER arvo_guard_opportunity_assignment BEFORE UPDATE OF assigned_employee_id, owner_user_id ON public.crm_opportunities FOR EACH ROW EXECUTE FUNCTION private.arvo_guard_opportunity_assignment();

CREATE TRIGGER notify_crm_assignment AFTER INSERT OR UPDATE OF assigned_employee_id ON public.crm_opportunities FOR EACH ROW EXECUTE FUNCTION private.notify_crm_assignment();

CREATE TRIGGER process_won_crm_opportunity AFTER UPDATE OF stage ON public.crm_opportunities FOR EACH ROW EXECUTE FUNCTION private.process_won_crm_opportunity();

CREATE TRIGGER archive_inactive_crm_proposal BEFORE INSERT OR UPDATE OF status, valid_until ON public.crm_proposals FOR EACH ROW EXECUTE FUNCTION archive_inactive_crm_proposal();

CREATE TRIGGER arvo_freeze_accepted_proposal BEFORE UPDATE ON public.crm_proposals FOR EACH ROW EXECUTE FUNCTION private.arvo_freeze_accepted_proposal();

CREATE TRIGGER arvo_promote_draft_on_customer_view BEFORE UPDATE ON public.crm_proposals FOR EACH ROW EXECUTE FUNCTION private.arvo_promote_draft_on_customer_view();

CREATE TRIGGER arvo_guard_confidentiality_signature BEFORE UPDATE ON public.hr_confidentiality_agreements FOR EACH ROW EXECUTE FUNCTION private.arvo_guard_confidentiality_signature();

CREATE TRIGGER arvo_department_management_guard BEFORE INSERT OR DELETE OR UPDATE OF name ON public.hr_departments FOR EACH ROW EXECUTE FUNCTION private.arvo_department_management_guard();

CREATE TRIGGER arvo_department_management_sync AFTER UPDATE OF name ON public.hr_departments FOR EACH ROW EXECUTE FUNCTION private.arvo_department_management_sync();

CREATE TRIGGER arvo_employee_management_guard BEFORE INSERT OR UPDATE OF department_id ON public.hr_employees FOR EACH ROW EXECUTE FUNCTION private.arvo_employee_management_guard();

CREATE TRIGGER arvo_employee_management_sync AFTER INSERT OR DELETE OR UPDATE OF department_id, user_id, employment_status, organization_id ON public.hr_employees FOR EACH ROW EXECUTE FUNCTION private.arvo_employee_management_sync();

CREATE TRIGGER arvo_record_commission_rate AFTER INSERT OR UPDATE OF commission_rate, operation_commission_rate ON public.hr_employees FOR EACH ROW EXECUTE FUNCTION private.arvo_record_commission_rate();

CREATE TRIGGER arvo_bump_message_channel AFTER INSERT OR UPDATE ON public.internal_messages FOR EACH ROW EXECUTE FUNCTION private.arvo_bump_message_channel();

CREATE TRIGGER arvo_guard_message_update BEFORE UPDATE ON public.internal_messages FOR EACH ROW EXECUTE FUNCTION private.arvo_guard_message_update();

CREATE TRIGGER guard_operation_customer_file BEFORE INSERT OR UPDATE ON public.operation_customer_files FOR EACH ROW EXECUTE FUNCTION guard_operation_customer_file();

CREATE TRIGGER sync_workflow_completion_from_steps AFTER INSERT OR DELETE OR UPDATE OF is_completed ON public.operation_steps FOR EACH ROW EXECUTE FUNCTION sync_workflow_completion_from_steps();

CREATE TRIGGER accrue_operation_commission_on_completion AFTER UPDATE OF status ON public.operation_workflows FOR EACH ROW EXECUTE FUNCTION accrue_operation_commission();

CREATE TRIGGER arvo_guard_workflow_contract_link BEFORE INSERT OR UPDATE OF contract_id ON public.operation_workflows FOR EACH ROW EXECUTE FUNCTION private.arvo_guard_workflow_contract_link();

CREATE TRIGGER guard_operation_workflow_archive BEFORE INSERT OR UPDATE OF status, archived_at, archived_by ON public.operation_workflows FOR EACH ROW EXECUTE FUNCTION guard_operation_workflow_archive();

CREATE TRIGGER notify_operation_assignment AFTER INSERT OR UPDATE OF assigned_employee_id ON public.operation_workflows FOR EACH ROW EXECUTE FUNCTION private.notify_operation_assignment();

CREATE TRIGGER operation_workflows_seed_standard_steps AFTER INSERT ON public.operation_workflows FOR EACH ROW EXECUTE FUNCTION seed_standard_operation_steps_trigger();

CREATE TRIGGER sync_contract_status_from_workflow AFTER UPDATE OF status ON public.operation_workflows FOR EACH ROW EXECUTE FUNCTION sync_contract_status_from_workflow();

CREATE TRIGGER sync_contract_workflow_link AFTER INSERT OR UPDATE OF contract_id ON public.operation_workflows FOR EACH ROW EXECUTE FUNCTION sync_contract_workflow_link();

CREATE TRIGGER arvo_membership_management_sync AFTER INSERT ON public.organization_memberships FOR EACH ROW EXECUTE FUNCTION private.arvo_membership_management_sync();

CREATE TRIGGER arvo_membership_manual_role_change BEFORE UPDATE OF role ON public.organization_memberships FOR EACH ROW EXECUTE FUNCTION private.arvo_membership_manual_role_change();

CREATE TRIGGER arvo_membership_owner_guard BEFORE INSERT OR DELETE OR UPDATE OF role, is_active ON public.organization_memberships FOR EACH ROW EXECUTE FUNCTION private.arvo_membership_owner_guard();

CREATE TRIGGER notify_payment_request_created AFTER INSERT ON public.organization_payment_requests FOR EACH ROW EXECUTE FUNCTION private.notify_payment_request_created();

CREATE TRIGGER notify_payment_request_reviewed AFTER UPDATE OF status ON public.organization_payment_requests FOR EACH ROW EXECUTE FUNCTION private.notify_payment_request_reviewed();

CREATE TRIGGER create_default_organization_license AFTER INSERT ON public.organizations FOR EACH ROW EXECUTE FUNCTION private.create_default_organization_license();

CREATE TRIGGER touch_support_ticket AFTER INSERT ON public.support_messages FOR EACH ROW EXECUTE FUNCTION private.touch_support_ticket();
