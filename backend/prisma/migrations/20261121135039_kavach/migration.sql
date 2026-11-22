-- CreateTable
CREATE TABLE "tenants" (
    "id" UUID NOT NULL,
    "slug" VARCHAR(50) NOT NULL,
    "display_name" VARCHAR(100) NOT NULL,
    "premium_multiplier" DECIMAL(4,2) NOT NULL DEFAULT 1.00,
    "allowed_admin_domains" TEXT[],
    "oauth_issuer" VARCHAR(255),
    "oauth_client_id" VARCHAR(255),
    "config" JSONB NOT NULL DEFAULT '{}',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tenants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_users" (
    "id" UUID NOT NULL,
    "tenant_id" UUID,
    "email" VARCHAR(255) NOT NULL,
    "role" VARCHAR(20) NOT NULL,
    "last_login_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dark_stores" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "zone_id" VARCHAR(50) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "latitude" DECIMAL(10,8) NOT NULL,
    "longitude" DECIMAL(11,8) NOT NULL,
    "qr_secret" VARCHAR(255) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dark_stores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workers" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "phone_number" VARCHAR(20) NOT NULL,
    "email" VARCHAR(255),
    "date_of_birth" DATE,
    "platform_worker_id" VARCHAR(100) NOT NULL,
    "platform_oauth_subject" VARCHAR(255),
    "platform_verified_at" TIMESTAMP(3),
    "aadhaar_number" VARCHAR(255),
    "pan_number" VARCHAR(255),
    "kyc_verified" BOOLEAN NOT NULL DEFAULT false,
    "kyc_verified_at" TIMESTAMP(3),
    "zone_id" VARCHAR(50) NOT NULL,
    "current_city" VARCHAR(100),
    "state" VARCHAR(100),
    "bank_account_number" VARCHAR(255),
    "bank_ifsc_code" VARCHAR(100),
    "account_holder_name" VARCHAR(255),
    "bank_verification_status" VARCHAR(20) NOT NULL DEFAULT 'pending',
    "password_hash" VARCHAR(255) NOT NULL,
    "last_login_at" TIMESTAMP(3),
    "status" VARCHAR(20) NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_active_at" TIMESTAMP(3),
    "registration_ip_address" TEXT,
    "registration_device_fingerprint" VARCHAR(255),

    CONSTRAINT "workers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "policies" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "worker_id" UUID NOT NULL,
    "tier" INTEGER NOT NULL,
    "premium_weekly" DECIMAL(8,2) NOT NULL,
    "max_payout_per_event" DECIMAL(10,2) NOT NULL,
    "max_payouts_per_month" INTEGER NOT NULL,
    "coverage_ceiling" DECIMAL(10,2) NOT NULL,
    "trigger_day_limit" INTEGER NOT NULL,
    "coverage_percentage" DECIMAL(5,2) NOT NULL DEFAULT 100.00,
    "reserved_amount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "settled_amount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "auto_renew" BOOLEAN NOT NULL DEFAULT true,
    "status" VARCHAR(20) NOT NULL DEFAULT 'active',
    "cancellation_reason" VARCHAR(255),
    "cancelled_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "policies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "policy_coverage" (
    "id" UUID NOT NULL,
    "policy_id" UUID NOT NULL,
    "trigger_type" VARCHAR(50) NOT NULL,
    "is_covered" BOOLEAN NOT NULL DEFAULT true,
    "coverage_percentage" DECIMAL(5,2) NOT NULL DEFAULT 100.00,
    "threshold_value" DECIMAL(10,2),
    "minimum_duration_minutes" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "policy_coverage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trigger_events" (
    "id" UUID NOT NULL,
    "tenant_id" UUID,
    "trigger_type" VARCHAR(50) NOT NULL,
    "zone_id" VARCHAR(50) NOT NULL,
    "severity" VARCHAR(20),
    "threshold_value" DECIMAL(10,2),
    "actual_value" DECIMAL(10,2),
    "detected_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "announced_at" TIMESTAMP(3),
    "started_at" TIMESTAMP(3),
    "ended_at" TIMESTAMP(3),
    "duration_minutes" INTEGER,
    "status" VARCHAR(20) NOT NULL DEFAULT 'active',
    "data_source" VARCHAR(50),
    "raw_data" JSONB,
    "confirmed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "trigger_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "claims" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "worker_id" UUID NOT NULL,
    "policy_id" UUID NOT NULL,
    "trigger_event_id" UUID NOT NULL,
    "confidence_score" DECIMAL(3,2),
    "fraud_probability" DECIMAL(3,2),
    "is_flagged_for_review" BOOLEAN NOT NULL DEFAULT false,
    "requested_amount" DECIMAL(10,2),
    "approved_amount" DECIMAL(10,2),
    "payout_amount" DECIMAL(10,2),
    "payout_percentage" DECIMAL(5,2),
    "status" VARCHAR(20) NOT NULL DEFAULT 'filed',
    "state_version" INTEGER NOT NULL DEFAULT 0,
    "dispute_window_ends_at" TIMESTAMP(3),
    "closed_at" TIMESTAMP(3),
    "payout_id" UUID,
    "payout_status" VARCHAR(20),
    "payout_initiated_at" TIMESTAMP(3),
    "payout_completed_at" TIMESTAMP(3),
    "reviewed_by" VARCHAR(255),
    "review_notes" VARCHAR(1000),
    "reviewed_at" TIMESTAMP(3),
    "hold_reason" VARCHAR(500),
    "held_until" TIMESTAMP(3),
    "review_priority" INTEGER NOT NULL DEFAULT 0,
    "idempotency_key" VARCHAR(255) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "claims_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "claim_state_transitions" (
    "id" SERIAL NOT NULL,
    "claim_id" UUID NOT NULL,
    "from_state" VARCHAR(20),
    "to_state" VARCHAR(20) NOT NULL,
    "actor" VARCHAR(100) NOT NULL,
    "reason" VARCHAR(500),
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "claim_state_transitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "claim_disputes" (
    "id" UUID NOT NULL,
    "claim_id" UUID NOT NULL,
    "worker_id" UUID NOT NULL,
    "reason" VARCHAR(1000) NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'open',
    "resolution_notes" VARCHAR(1000),
    "resolved_by" VARCHAR(255),
    "opened_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMP(3),

    CONSTRAINT "claim_disputes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fraud_signals" (
    "id" UUID NOT NULL,
    "claim_id" UUID NOT NULL,
    "signal_type" VARCHAR(50) NOT NULL,
    "is_suspicious" BOOLEAN,
    "score" DECIMAL(3,2),
    "details" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fraud_signals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payouts" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "claim_id" UUID NOT NULL,
    "worker_id" UUID NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "idempotency_key" VARCHAR(255) NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'pending',
    "bank_reference_number" VARCHAR(100),
    "initiated_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "failure_reason" VARCHAR(500),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payouts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_log" (
    "id" UUID NOT NULL,
    "tenant_id" UUID,
    "worker_id" UUID NOT NULL,
    "notification_type" VARCHAR(50) NOT NULL,
    "channel" VARCHAR(20) NOT NULL,
    "title" VARCHAR(255),
    "body" TEXT,
    "sent_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" VARCHAR(20) NOT NULL DEFAULT 'sent',
    "metadata" JSONB,

    CONSTRAINT "notification_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tenants_slug_key" ON "tenants"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "admin_users_email_key" ON "admin_users"("email");

-- CreateIndex
CREATE INDEX "dark_stores_tenant_id_zone_id_idx" ON "dark_stores"("tenant_id", "zone_id");

-- CreateIndex
CREATE UNIQUE INDEX "workers_phone_number_key" ON "workers"("phone_number");

-- CreateIndex
CREATE UNIQUE INDEX "workers_email_key" ON "workers"("email");

-- CreateIndex
CREATE INDEX "workers_tenant_id_zone_id_idx" ON "workers"("tenant_id", "zone_id");

-- CreateIndex
CREATE INDEX "workers_phone_number_idx" ON "workers"("phone_number");

-- CreateIndex
CREATE INDEX "workers_created_at_idx" ON "workers"("created_at" DESC);

-- CreateIndex
CREATE INDEX "workers_registration_ip_address_idx" ON "workers"("registration_ip_address");

-- CreateIndex
CREATE INDEX "workers_registration_device_fingerprint_idx" ON "workers"("registration_device_fingerprint");

-- CreateIndex
CREATE UNIQUE INDEX "workers_tenant_id_platform_worker_id_key" ON "workers"("tenant_id", "platform_worker_id");

-- CreateIndex
CREATE INDEX "policies_tenant_id_worker_id_is_active_idx" ON "policies"("tenant_id", "worker_id", "is_active");

-- CreateIndex
CREATE INDEX "policies_end_date_idx" ON "policies"("end_date");

-- CreateIndex
CREATE INDEX "policies_status_idx" ON "policies"("status");

-- CreateIndex
CREATE INDEX "policy_coverage_policy_id_idx" ON "policy_coverage"("policy_id");

-- CreateIndex
CREATE INDEX "trigger_events_zone_id_idx" ON "trigger_events"("zone_id");

-- CreateIndex
CREATE INDEX "trigger_events_detected_at_idx" ON "trigger_events"("detected_at" DESC);

-- CreateIndex
CREATE INDEX "trigger_events_status_idx" ON "trigger_events"("status");

-- CreateIndex
CREATE INDEX "trigger_events_trigger_type_idx" ON "trigger_events"("trigger_type");

-- CreateIndex
CREATE UNIQUE INDEX "claims_idempotency_key_key" ON "claims"("idempotency_key");

-- CreateIndex
CREATE INDEX "claims_tenant_id_worker_id_idx" ON "claims"("tenant_id", "worker_id");

-- CreateIndex
CREATE INDEX "claims_tenant_id_status_created_at_idx" ON "claims"("tenant_id", "status", "created_at" DESC);

-- CreateIndex
CREATE INDEX "claims_trigger_event_id_idx" ON "claims"("trigger_event_id");

-- CreateIndex
CREATE INDEX "claims_payout_status_idx" ON "claims"("payout_status");

-- CreateIndex
CREATE UNIQUE INDEX "claims_worker_id_trigger_event_id_key" ON "claims"("worker_id", "trigger_event_id");

-- CreateIndex
CREATE INDEX "claim_state_transitions_claim_id_created_at_idx" ON "claim_state_transitions"("claim_id", "created_at");

-- CreateIndex
CREATE INDEX "claim_disputes_claim_id_idx" ON "claim_disputes"("claim_id");

-- CreateIndex
CREATE INDEX "fraud_signals_claim_id_idx" ON "fraud_signals"("claim_id");

-- CreateIndex
CREATE INDEX "fraud_signals_signal_type_idx" ON "fraud_signals"("signal_type");

-- CreateIndex
CREATE UNIQUE INDEX "payouts_claim_id_key" ON "payouts"("claim_id");

-- CreateIndex
CREATE UNIQUE INDEX "payouts_idempotency_key_key" ON "payouts"("idempotency_key");

-- CreateIndex
CREATE INDEX "payouts_worker_id_idx" ON "payouts"("worker_id");

-- CreateIndex
CREATE INDEX "payouts_status_idx" ON "payouts"("status");

-- CreateIndex
CREATE INDEX "notification_log_worker_id_sent_at_idx" ON "notification_log"("worker_id", "sent_at" DESC);

-- AddForeignKey
ALTER TABLE "admin_users" ADD CONSTRAINT "admin_users_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dark_stores" ADD CONSTRAINT "dark_stores_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workers" ADD CONSTRAINT "workers_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "policies" ADD CONSTRAINT "policies_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "policies" ADD CONSTRAINT "policies_worker_id_fkey" FOREIGN KEY ("worker_id") REFERENCES "workers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "policy_coverage" ADD CONSTRAINT "policy_coverage_policy_id_fkey" FOREIGN KEY ("policy_id") REFERENCES "policies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trigger_events" ADD CONSTRAINT "trigger_events_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "claims" ADD CONSTRAINT "claims_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "claims" ADD CONSTRAINT "claims_worker_id_fkey" FOREIGN KEY ("worker_id") REFERENCES "workers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "claims" ADD CONSTRAINT "claims_policy_id_fkey" FOREIGN KEY ("policy_id") REFERENCES "policies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "claims" ADD CONSTRAINT "claims_trigger_event_id_fkey" FOREIGN KEY ("trigger_event_id") REFERENCES "trigger_events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "claim_state_transitions" ADD CONSTRAINT "claim_state_transitions_claim_id_fkey" FOREIGN KEY ("claim_id") REFERENCES "claims"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "claim_disputes" ADD CONSTRAINT "claim_disputes_claim_id_fkey" FOREIGN KEY ("claim_id") REFERENCES "claims"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fraud_signals" ADD CONSTRAINT "fraud_signals_claim_id_fkey" FOREIGN KEY ("claim_id") REFERENCES "claims"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payouts" ADD CONSTRAINT "payouts_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payouts" ADD CONSTRAINT "payouts_claim_id_fkey" FOREIGN KEY ("claim_id") REFERENCES "claims"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payouts" ADD CONSTRAINT "payouts_worker_id_fkey" FOREIGN KEY ("worker_id") REFERENCES "workers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_log" ADD CONSTRAINT "notification_log_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE SET NULL ON UPDATE CASCADE;
