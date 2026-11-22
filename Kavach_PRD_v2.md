# Kavach (InsureGig) Backend & AI System — Product Requirements Document (PRD)

**Version:** 3.1 (resume-aligned revision of v2.0 — plain JavaScript edition)  
**Date:** November 2026  
**Author:** Third-Year CSE Student (Gaming Technology) — Kavach Dev Team  
**Project:** Kavach — AI-Powered Parametric Income Insurance for Q-Commerce Gig Workers (portfolio / resume name: *InsureGig*)  
**Scope:** Backend API, Database Architecture, ML/AI Layer, Fraud Detection System, Claims State Machine, Real-Time Updates, Multi-Tenancy, Frontend  
**Stack:** JavaScript (Node.js/Express) + PostgreSQL (Prisma) + MongoDB + Redis (cache · pub/sub · BullMQ) + Python (FastAPI/XGBoost) + React (JavaScript/JSX)/Tailwind CSS

> **Note on Scope (v3.0):** Docker, containerisation, and CI/CD pipelines are **explicitly out of scope for now**. Infrastructure scope is limited to **caching** (Redis). Everything runs as plain local processes (see Section 15). These can be added in a later phase.

> **What changed from v2.0:** the language stays plain JavaScript (no TypeScript); Knex → Prisma; Bull → BullMQ; MongoDB added for telemetry/audit data; Redis pub/sub joins the stack as the inter-service event bus; Server-Sent Events replace polling; multi-tenancy (one tenant per delivery platform) and OAuth/domain-scoped authorization added; claims now follow an explicit state machine with a delayed-job dispute window; concurrency control (Redis locks + PostgreSQL row-level locks) made explicit; Docker/compose/CI removed; Tailwind frontend brought into scope. Appendix A maps every resume skill and bullet to the section that covers it.

---

## Table of Contents

1. [Executive Overview](#1-executive-overview)
2. [Tech Stack & Rationale](#2-tech-stack--rationale)
3. [System Architecture](#3-system-architecture)
4. [Database Design](#4-database-design)
5. [API Specifications](#5-api-specifications)
6. [AI/ML Architecture](#6-aiml-architecture)
7. [Fraud Detection System](#7-fraud-detection-system)
8. [Claims Processing Engine](#8-claims-processing-engine)
9. [Trigger Evaluation System](#9-trigger-evaluation-system)
10. [Authentication, Authorization & Multi-Tenancy](#10-authentication-authorization--multi-tenancy)
11. [Caching Strategy](#11-caching-strategy)
12. [Event-Driven Architecture & Real-Time Updates](#12-event-driven-architecture--real-time-updates)
13. [Frontend](#13-frontend)
14. [Monitoring & Observability](#14-monitoring--observability)
15. [Local Setup, Configuration & Migrations](#15-local-setup-configuration--migrations)
16. [Error Handling & Resilience](#16-error-handling--resilience)
17. [Performance Requirements](#17-performance-requirements)
18. [Testing Strategy](#18-testing-strategy)
19. [GitHub Repository Structure](#19-github-repository-structure)
20. [Interview Readiness Checklist](#20-interview-readiness-checklist)
- [Appendix A — Resume Traceability Matrix](#appendix-a--resume-traceability-matrix)
- [Appendix B — Out of Scope (For Now)](#appendix-b--out-of-scope-for-now)

---

## 1. Executive Overview

### 1.1 Product Summary

Kavach is a **multi-tenant** parametric income insurance platform for India's Q-Commerce delivery riders (Zepto, Blinkit, Swiggy Instamart — each modelled as a **tenant**). The system **automatically triggers payouts** when external disruptions — heavy rainfall, extreme heat, hazardous AQI, curfews, and dark store outages — cause income loss, without requiring any paperwork from the worker. Claim progress, trigger alerts, and payouts are pushed to clients in real time over Server-Sent Events.

### 1.2 Core Features

1. **Worker Registration & Onboarding** — Phone-based auth, OAuth 2.0 platform-account linking, bank account for payouts
2. **Multi-Tenant Policy Management** — Three weekly tiers (₹49 / ₹89 / ₹129) with AI-calibrated zone-based coverage; per-tenant configuration and data isolation
3. **Parametric Triggers** — 5 objective, API-verified triggers; no paperwork, no subjective claims
4. **Predictive Pre-Alert System** — 36–48 hour forecast monitoring, worker notifications before disruption hits
5. **AI-Powered Fraud Detection** — 6-layer defense with XGBoost classifier, a versioned feature contract, and weighted confidence scoring
6. **Claims Lifecycle State Machine** — 7 core states plus branch states (held, rejected, cancelled, expired, disputed, payout_failed) with an append-only audit trail
7. **Idempotent Instant Payouts** — fraud-flag re-check before disbursement; exactly-once semantics under concurrency
8. **Dispute Window** — a delayed BullMQ job enforces a 2-hour dispute window before a paid claim is closed and its coverage reservation is settled
9. **Real-Time Updates (SSE)** — live claim tracker, trigger alerts, and admin feed with heartbeat and leak-free connection cleanup
10. **QR Dark-Store Check-In** — rider scans a QR at the dark store; a GPS-independent presence proof that strengthens fraud Layer F
11. **Admin Review Queue** — priority-ordered (min-heap semantics) queue for held claims
12. **Tenant Analytics** — per-platform claims, payout, and fraud-rate summaries

### 1.3 Technical Constraints

| Constraint | Target |
|---|---|
| Target Users | 1.2M Q-Commerce riders across 3 tenants |
| Peak Concurrent Claims | 10–50 claims/second during a disruption event |
| Claim Evaluation SLA | < 2 seconds |
| Claim Decision SLA | < 5 seconds |
| Payout SLA | < 15 minutes from approval |
| Dispute Window | 2 hours after `paid`, then auto-close |
| Concurrent SSE Connections | 5,000 per gateway instance, zero leaked connections after client disconnect |
| Cache Hit Ratio | ≥ 85% for policy, trigger, and weather reads |
| Uptime SLA | 99.5% |
| Data Privacy | India Stack (Aadhaar) compliant, PII encrypted at rest, strict tenant isolation |

---

## 2. Tech Stack & Rationale

> **Ground Rule:** The Node.js codebase and the React frontend are **plain JavaScript (Node.js 20, CommonJS on the backend; JSX on the frontend)**. The ML service is Python 3.11. No Docker / containerisation / CI/CD in this phase.

### 2.1 Stack Decisions

| Layer | Technology | Why |
|---|---|---|
| Language (backend + frontend) | JavaScript (ES2022) | No build step, fastest to write and debug; safety comes from runtime validation, ESLint, JSDoc hints, and tests (Section 2.2) |
| Module system | CommonJS (`require` / `module.exports`) on the backend; ES modules (`import`) in the Vite frontend | Matches v2.0; works with Jest out of the box |
| Runtime | Node.js 20 LTS | Event-loop model handles high-concurrency claim bursts and long-lived SSE connections well |
| Framework | Express.js | Minimal overhead, well-understood, large ecosystem |
| Primary DB | PostgreSQL 15 | ACID guarantees and row-level locking — critical for financial data and exactly-once payouts |
| ORM | Prisma ORM | Client generated from the schema (editor autocomplete in VS Code even in plain JS), migrations via `prisma migrate`, `$transaction` + `$queryRaw` for `SELECT … FOR UPDATE` |
| Document DB | MongoDB 7 (Mongoose) | High-volume, schema-flexible telemetry (GPS pings, activity events, QR check-ins), ML prediction log, audit events; TTL indexes for retention |
| Cache / Bus / Queue | Redis 7 (ioredis) | Triple use: (1) cache, (2) pub/sub event bus between services, (3) BullMQ backing store |
| Job Queue | BullMQ | Redis-backed, supports **delayed jobs** (dispute window, trigger announcement), retries with backoff, rate limiting, and job-ID de-duplication |
| ML Service | Python 3.11 + FastAPI | XGBoost + scikit-learn are Python-native; async endpoints plus a Redis subscriber |
| ML Model | XGBoost | Tabular fraud data + interpretability for regulatory explainability |
| Frontend | React 18 (JSX) + Vite + Tailwind CSS | Fast dev loop, utility-first styling, `EventSource` for SSE |
| Auth | JWT (`jsonwebtoken`) + OAuth 2.0 / OIDC (`openid-client`) | Stateless access tokens; OAuth for platform linking and admin SSO |
| Validation | Joi | Declarative runtime validation of every request body (also used for env validation) |
| Logging | Winston + Morgan | Structured logs, request logging |
| Metrics | prom-client | Prometheus-format metrics (dashboards optional) |
| Testing | Jest + Supertest + pytest | Unit, integration, concurrency, ML tests |
| API Docs | Swagger (swagger-jsdoc + swagger-ui-express) | Generated from JSDoc comments |
| Local Orchestration | `concurrently` + npm scripts | One command starts all services as local processes (no containers) |

### 2.2 Why Plain JavaScript (and How We Keep It Safe)

The whole stack is plain JavaScript so the codebase stays quick to write, debug, and explain in an interview, with no compile step or type syntax to learn. The trade-off is that JavaScript will not catch a wrong field name or an illegal state change before the code runs, so the PRD compensates with runtime guards and tests:

- **Frozen constants and a transition table.** `ClaimState` and the allowed-transitions map are `Object.freeze`d, and `ClaimStateMachine.transition()` throws `ILLEGAL_TRANSITION` for anything not in the table (`filed → paid` fails at runtime). A table-driven test covers every pair (Section 18.1).
- **Joi validation at every API boundary**, so malformed input never reaches business logic; env variables are validated at startup the same way.
- **Prisma** checks query shapes at runtime, and its generated client gives autocomplete in VS Code even in `.js` files.
- **JSDoc `@typedef` / `@param` comments** on shared shapes (claim context, ML request/response) give editor hints without any build step.
- **ESLint** (`no-undef`, `no-unused-vars`, `eqeqeq`) catches typos and dead code before they run.
- **Tenant IDs come only from the verified JWT**, and the tenant-scoped Prisma client (`forTenant`) is the single data-access path, so a wrong ID cannot silently cross tenants (Section 10.4).
- **Concurrency and integration tests** (Section 18) cover the places where a type system would not help anyway: races, idempotency, and state transitions.

### 2.3 Why Redis (BullMQ + Pub/Sub) and Not RabbitMQ / Kafka

Redis is already required for caching, so BullMQ and pub/sub add **zero new infrastructure**. They are used for different jobs:

| Mechanism | Used for | Durable? |
|---|---|---|
| **BullMQ** | Fraud-scoring jobs, payouts, notifications, delayed jobs (trigger announcement, dispute-window close, policy auto-renew) | Yes — jobs persist in Redis, retry with backoff |
| **Redis pub/sub** | Decoupled service events (`claim.state_changed`, `trigger.announced`), Node ↔ FastAPI fraud-evaluation request/response, fan-out to the SSE hub | No — fire-and-forget |

Because pub/sub is not durable, nothing that must not be lost relies on it alone: every claim state is persisted in PostgreSQL first, and the ML request path has a timeout, an HTTP fallback, and a rule-based fallback (Section 16). Pub/sub carries *notifications*; PostgreSQL and BullMQ carry *truth*.

### 2.4 Why PostgreSQL + MongoDB

| Data | Store | Reason |
|---|---|---|
| Workers, policies, claims, payouts, tenants, state transitions | PostgreSQL | Relational integrity, ACID, row-level locks, unique constraints for idempotency |
| GPS pings, activity events, QR check-ins | MongoDB | Very high write volume, append-only, TTL retention (30 days), flexible payloads |
| ML prediction log, SHAP explanations, raw provider payloads, audit events | MongoDB | Schema-flexible documents that evolve with model versions |

### 2.5 Infrastructure Scope

Infrastructure is limited to **caching** (Section 11). There is no Docker, no containerisation, no CI/CD, and no cloud deployment in this phase — see Appendix B.

---

## 3. System Architecture

### 3.1 High-Level Architecture
```
┌───────────────────────────────────────────────────────────┐
│               API Gateway (Express + Node.js)           │
│                       Port 8000                            │
│  Rate Limiting · JWT/OAuth · Tenant Resolution · SSE Hub   │
└──────┬─────────────┬──────────────┬──────────────┬────────┘
       │ REST        │ REST         │ REST         │ REST
┌──────▼──────┐ ┌────▼───────┐ ┌────▼───────┐ ┌────▼────────────┐
│ Worker Svc  │ │ Policy Svc │ │ Trigger Svc│ │ Claims Svc      │
│ :3001       │ │ :3002      │ │ :3003      │ │ :3004           │
│ Auth, QR    │ │ Tiers,     │ │ Weather +  │ │ State machine,  │
│ check-in    │ │ Coverage   │ │ outage poll│ │ locks, payouts  │
└──────┬──────┘ └────┬───────┘ └────┬───────┘ └────┬────────────┘
       │              │              │ publish       │ publish / BullMQ
       ▼              ▼              ▼               ▼
┌────────────────────────────────────────────────────────────────┐
│                          REDIS 7                                │
│   Cache (cache-aside) · Pub/Sub event bus · BullMQ queues       │
│   Distributed locks · Rate-limit counters · Sorted sets         │
└──────────┬───────────────────────────────┬─────────────────────┘
           │ subscribe                      │ subscribe / consume
   ┌───────▼─────────────┐          ┌───────▼───────────────┐
   │ ML / Fraud Service  │          │ Notification Service  │
   │ Python FastAPI :5000│          │ :3005 (BullMQ worker) │
   │ XGBoost · features  │          │ Push / SMS (mock)     │
   └─────────────────────┘          └───────────────────────┘

┌─────────────────────────────┐   ┌──────────────────────────────┐
│ PostgreSQL 15 (via Prisma)  │   │ MongoDB 7 (via Mongoose)     │
│ tenants · workers · policies│   │ gps_pings · activity_events  │
│ claims · payouts · triggers │   │ dark_store_checkins          │
│ claim_state_transitions     │   │ ml_prediction_log · audit    │
└─────────────────────────────┘   └──────────────────────────────┘

┌────────────────────────────────────────────────────────────────┐
│ External: OpenWeatherMap · Mock Platform API + OAuth provider   │
│ Mock Bank Transfer API · FCM/SMS (mock) · Google OIDC (admin)   │
└────────────────────────────────────────────────────────────────┘
```

### 3.2 Service Breakdown
```
SERVICE 1: Worker Service (Port 3001)
  Endpoints: Register, Login, PlatformOAuthLink, GetProfile, UpdateProfile,
             UploadGPS, DarkStoreQrCheckIn
  Stores:    PostgreSQL (workers, dark_stores) · MongoDB (gps_pings,
             activity_events, dark_store_checkins)
  Deps:      PostgreSQL, MongoDB, Redis

SERVICE 2: Policy Service (Port 3002)
  Endpoints: BuyPolicy, GetPolicies, CancelPolicy, GetCoverageDetails
  Tables:    policies, policy_coverage
  Jobs:      BullMQ delayed job `policy-auto-renew` (fires at end_date − 24h)
  Deps:      PostgreSQL, Redis, Worker Service (REST)

SERVICE 3: Trigger Service (Port 3003)
  Endpoints: GetActiveTriggers, SimulateTrigger (admin), GetTriggerHistory
  Tables:    trigger_events (+ MongoDB provider_payloads)
  Jobs:      Repeatable BullMQ jobs — weather poll every 30 min,
             platform-outage check every 5 min
             Delayed BullMQ job `announce-trigger` (T+8 min)
  Deps:      PostgreSQL, MongoDB, Redis, OpenWeatherMap, Mock Platform API

SERVICE 4: Claims Service (Port 3004)
  Endpoints: FileClaim, GetClaimStatus, GetClaimHistory, DisputeClaim,
             AdminReviewClaim, AdminReviewQueue
  Tables:    claims, claim_state_transitions, claim_disputes,
             fraud_signals, payouts
  Queues:    BullMQ — fraud-eval, payout, close-claim (delayed)
  Locks:     Redis SET NX PX + PostgreSQL SELECT … FOR UPDATE
  Deps:      PostgreSQL, MongoDB, Redis, ML Service (pub/sub, HTTP fallback)

SERVICE 5: ML/Fraud Detection Service (Port 5000)
  Language:  Python 3.11, FastAPI
  Functions: Redis subscriber on `ml:fraud:request`, HTTP /infer (fallback),
             /train (retrain), /health
  Stores:    MongoDB ml_prediction_log
  Artifacts: fraud_model.pkl, scaler.pkl (versioned on filesystem)

SERVICE 6: Notification Service (Port 3005)
  Endpoints: Internal only — consumes BullMQ `notifications` queue
  Tables:    notification_log
  Deps:      Firebase Cloud Messaging (mock), Twilio (mock)

API GATEWAY: Express.js (Port 8000)
  - JWT validation, tenant resolution (tenant_id from token claims)
  - Rate limiting (express-rate-limit + Redis store)
  - Reverse proxy to internal services (http-proxy-middleware)
  - SSE Hub: /api/v1/stream/* — subscribes to Redis pub/sub, fans out to clients
  - Swagger UI at /api/docs
```

### 3.3 Claims Data Flow
```
Worker app / Trigger system
        │
        ▼
[Claims Service]  state: filed
  - Validates worker, active policy, 72h waiting period
  - Validates announced trigger in worker's zone
  - Idempotent insert (unique constraint + idempotency key)
        │
        ▼
[Claims Service]  state: validated
  - Row-locks policy (FOR UPDATE), checks coverage ceiling,
    RESERVES the payout amount against the ceiling
  - Enqueues BullMQ `fraud-eval` job
        │
        ▼
[Claims Service]  state: scoring
  - Gathers signals (Postgres + MongoDB), builds feature-contract payload
  - Publishes `ml:fraud:request` over Redis pub/sub
        │
        ▼
[ML Service — Python FastAPI]
  - Extracts 8 features, runs XGBoost, returns
    { fraud_probability, features, signals[] } on `ml:fraud:result`
        │
        ▼
[Claims Service — Decision Engine]  state: decided
  - confidence = 0.6 × weighted signals + 0.4 × (1 − fraud_probability)
  - confidence ≥ 0.65        → AUTO APPROVE (100%) → payout_pending
  - confidence 0.40–0.64     → PARTIAL (60%) → payout_pending, 40% held
  - confidence < 0.40        → state: held → admin review queue
        │
        ▼
[Payout Worker — BullMQ]  state: payout_pending
  - Redis lock + row lock, re-checks fraud flags
  - Idempotent bank transfer (idempotency key = payout:{claim_id})
        │
        ▼
state: paid → push SSE event + notification
        │  (delayed BullMQ job, delay = 2 hours)
        ▼
state: closed — dispute window elapsed, reservation settled
        (worker dispute inside the window → state: disputed)
```

---
## 4. Database Design

### 4.1 Entity Relationships
```
TENANTS (1) ──── (Many) WORKERS
   │           ├── (Many) POLICIES
   │           ├── (Many) DARK_STORES
   │           └── (Many) ADMIN_USERS
   │
WORKERS (1) ──── (Many) POLICIES
   │
   ├── (Many) CLAIMS
   ├── (Many) PAYOUTS
   └── (Many, MongoDB) GPS_PINGS · ACTIVITY_EVENTS · DARK_STORE_CHECKINS

POLICIES (1) ──── (Many) CLAIMS
POLICIES (1) ──── (Many) POLICY_COVERAGE

TRIGGER_EVENTS (1) ──── (Many) CLAIMS
CLAIMS (1) ──── (Many) CLAIM_STATE_TRANSITIONS   (append-only audit trail)
CLAIMS (1) ──── (Many) FRAUD_SIGNALS
CLAIMS (1) ──── (0..1) PAYOUTS                   (UNIQUE claim_id)
CLAIMS (1) ──── (Many) CLAIM_DISPUTES
```

### 4.2 Multi-Tenancy Model

- **Model:** shared database, shared schema, `tenant_id` discriminator column on every tenant-owned table.
- **Tenant = delivery platform** (`blinkit`, `zepto`, `swiggy_instamart`). Each tenant has its own thresholds, premium multiplier, OAuth provider config, and allowed admin email domains.
- **Isolation, three layers:** (1) tenant ID comes **only** from the verified JWT, never from request bodies; (2) a Prisma client extension injects `tenant_id` into every query on tenant-owned models; (3) PostgreSQL **Row-Level Security** (RLS) as defense in depth (Section 10.4).
- **Global vs tenant data:** weather-based `trigger_events` are global (one storm affects riders of every platform) so `tenant_id` is `NULL`; `platform_outage` triggers are tenant-specific and carry a `tenant_id`.
- **Composite indexes** always lead with `tenant_id` on tenant-scoped queries.

### 4.3 PostgreSQL Schema (Source of Truth for Money and State)

Prisma owns the schema (`prisma/schema.prisma`, Section 4.4). Prisma does not natively express `CHECK` constraints, partial indexes, or RLS, so those live in a hand-written SQL migration that `prisma migrate` applies. The resulting database schema:

```sql
-- ======================================================
-- TENANTS (one per delivery platform)
-- ======================================================
CREATE TABLE tenants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug VARCHAR(50) UNIQUE NOT NULL,          -- 'blinkit' | 'zepto' | 'swiggy_instamart'
    display_name VARCHAR(100) NOT NULL,
    premium_multiplier DECIMAL(4, 2) DEFAULT 1.00,
    allowed_admin_domains TEXT[] NOT NULL DEFAULT '{}',   -- domain-scoped admin access
    oauth_issuer VARCHAR(255),                 -- platform OAuth/OIDC provider
    oauth_client_id VARCHAR(255),
    config JSONB DEFAULT '{}',                 -- per-tenant trigger thresholds etc.
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ======================================================
-- ADMIN USERS (SSO via Google OIDC, domain-restricted)
-- ======================================================
CREATE TABLE admin_users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id),     -- NULL for super_admin
    email VARCHAR(255) UNIQUE NOT NULL,
    role VARCHAR(20) NOT NULL,
    last_login_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT valid_admin_role CHECK (role IN ('tenant_admin', 'super_admin'))
);

-- ======================================================
-- DARK STORES (reference data for QR check-in + outage detection)
-- ======================================================
CREATE TABLE dark_stores (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    zone_id VARCHAR(50) NOT NULL,
    name VARCHAR(255) NOT NULL,
    latitude DECIMAL(10, 8) NOT NULL,
    longitude DECIMAL(11, 8) NOT NULL,
    qr_secret VARCHAR(255) NOT NULL,           -- HMAC key for rotating QR payloads
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_dark_stores_tenant_zone ON dark_stores(tenant_id, zone_id);

-- ======================================================
-- WORKERS
-- ======================================================
CREATE TABLE workers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    name VARCHAR(255) NOT NULL,
    phone_number VARCHAR(20) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE,
    date_of_birth DATE,

    -- Platform linkage (OAuth 2.0 Authorization Code + PKCE)
    platform_worker_id VARCHAR(100) NOT NULL,
    platform_oauth_subject VARCHAR(255),       -- `sub` claim from platform OAuth
    platform_verified_at TIMESTAMP,

    -- KYC (PII — encrypted at app level before insert)
    aadhaar_number VARCHAR(255),
    pan_number VARCHAR(255),
    kyc_verified BOOLEAN DEFAULT FALSE,
    kyc_verified_at TIMESTAMP,

    -- Location
    zone_id VARCHAR(50) NOT NULL,
    current_city VARCHAR(100),
    state VARCHAR(100),

    -- Banking (PII — encrypted at app level)
    bank_account_number VARCHAR(255),
    bank_ifsc_code VARCHAR(100),
    account_holder_name VARCHAR(255),
    bank_verification_status VARCHAR(20) DEFAULT 'pending',

    -- Auth
    password_hash VARCHAR(255) NOT NULL,
    last_login_at TIMESTAMP,

    -- Status
    status VARCHAR(20) DEFAULT 'active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_active_at TIMESTAMP,

    -- Anti-fraud metadata
    registration_ip_address INET,
    registration_device_fingerprint VARCHAR(255),

    CONSTRAINT uq_workers_tenant_platform_id UNIQUE (tenant_id, platform_worker_id),
    CONSTRAINT valid_status CHECK (status IN
        ('active', 'inactive', 'suspended', 'deleted')),
    CONSTRAINT valid_bank_status CHECK (bank_verification_status IN
        ('pending', 'verified', 'failed'))
);

CREATE INDEX idx_workers_tenant_zone ON workers(tenant_id, zone_id);
CREATE INDEX idx_workers_phone ON workers(phone_number);
CREATE INDEX idx_workers_created ON workers(created_at DESC);
-- Registration IP / device clustering — fraud ring detection (Layer B)
CREATE INDEX idx_workers_reg_ip ON workers(registration_ip_address);
CREATE INDEX idx_workers_device ON workers(registration_device_fingerprint);

-- ======================================================
-- POLICIES
-- ======================================================
CREATE TABLE policies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    worker_id UUID NOT NULL REFERENCES workers(id) ON DELETE CASCADE,

    tier INTEGER NOT NULL CHECK (tier IN (1, 2, 3)),
    premium_weekly DECIMAL(8, 2) NOT NULL,

    -- AI-calibrated per zone
    max_payout_per_event DECIMAL(10, 2) NOT NULL,
    max_payouts_per_month INTEGER NOT NULL,
    coverage_ceiling DECIMAL(10, 2) NOT NULL,
    trigger_day_limit INTEGER NOT NULL,
    coverage_percentage DECIMAL(5, 2) DEFAULT 100.00,

    -- Concurrency-safe coverage accounting
    reserved_amount DECIMAL(10, 2) NOT NULL DEFAULT 0,  -- held for in-flight claims
    settled_amount  DECIMAL(10, 2) NOT NULL DEFAULT 0,  -- finalised after dispute window

    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    auto_renew BOOLEAN DEFAULT TRUE,

    status VARCHAR(20) DEFAULT 'active',
    cancellation_reason VARCHAR(255),
    cancelled_at TIMESTAMP,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT end_after_start CHECK (end_date > start_date),
    CONSTRAINT ceiling_not_exceeded CHECK (reserved_amount + settled_amount <= coverage_ceiling),
    CONSTRAINT valid_policy_status CHECK (status IN
        ('active', 'expired', 'cancelled', 'suspended'))
);

CREATE INDEX idx_policies_tenant_worker_active ON policies(tenant_id, worker_id, is_active);
CREATE INDEX idx_policies_end_date ON policies(end_date);
CREATE INDEX idx_policies_status ON policies(status);
-- At most one active policy per worker at a time
CREATE UNIQUE INDEX uq_one_active_policy_per_worker
    ON policies(worker_id) WHERE status = 'active';

-- ======================================================
-- POLICY COVERAGE
-- ======================================================
CREATE TABLE policy_coverage (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    policy_id UUID NOT NULL REFERENCES policies(id) ON DELETE CASCADE,
    trigger_type VARCHAR(50) NOT NULL,
    is_covered BOOLEAN DEFAULT TRUE,
    coverage_percentage DECIMAL(5, 2) DEFAULT 100.00,
    threshold_value DECIMAL(10, 2),
    minimum_duration_minutes INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT valid_trigger_type CHECK (trigger_type IN
        ('rainfall', 'heat', 'aqi', 'curfew', 'platform_outage'))
);

CREATE INDEX idx_policy_coverage_policy ON policy_coverage(policy_id);

-- ======================================================
-- TRIGGER EVENTS (global for weather; tenant-scoped for platform_outage)
-- ======================================================
CREATE TABLE trigger_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id),          -- NULL = global weather trigger
    trigger_type VARCHAR(50) NOT NULL,
    zone_id VARCHAR(50) NOT NULL,
    severity VARCHAR(20),
    threshold_value DECIMAL(10, 2),
    actual_value DECIMAL(10, 2),

    -- Temporal decoupling: detected_at ≠ announced_at
    detected_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    announced_at TIMESTAMP,          -- T+8 minutes from detected_at
    started_at TIMESTAMP,
    ended_at TIMESTAMP,
    duration_minutes INTEGER,

    status VARCHAR(20) DEFAULT 'active',
    data_source VARCHAR(50),
    raw_data JSONB,                  -- summary; full payload in MongoDB provider_payloads
    confirmed_at TIMESTAMP,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT valid_trigger CHECK (trigger_type IN
        ('rainfall', 'heat', 'aqi', 'curfew', 'platform_outage')),
    CONSTRAINT valid_trigger_status CHECK (status IN
        ('active', 'resolved', 'cancelled')),
    CONSTRAINT valid_severity CHECK (severity IN ('low', 'medium', 'high'))
);

CREATE INDEX idx_triggers_zone ON trigger_events(zone_id);
CREATE INDEX idx_triggers_detected ON trigger_events(detected_at DESC);
CREATE INDEX idx_triggers_status ON trigger_events(status);
CREATE INDEX idx_triggers_type ON trigger_events(trigger_type);
-- Only one active trigger per (type, zone, tenant-scope) — closes a race in trigger creation
CREATE UNIQUE INDEX uq_active_trigger_per_zone
    ON trigger_events(trigger_type, zone_id, COALESCE(tenant_id, '00000000-0000-0000-0000-000000000000'::uuid))
    WHERE status = 'active';

-- ======================================================
-- CLAIMS  (7-state lifecycle + branch states — see Section 8.1)
-- ======================================================
CREATE TABLE claims (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    worker_id UUID NOT NULL REFERENCES workers(id) ON DELETE CASCADE,
    policy_id UUID NOT NULL REFERENCES policies(id) ON DELETE CASCADE,
    trigger_event_id UUID NOT NULL REFERENCES trigger_events(id) ON DELETE CASCADE,

    -- ML scores
    confidence_score DECIMAL(3, 2),    -- 0.00–1.00, higher = more genuine
    fraud_probability DECIMAL(3, 2),   -- 0.00–1.00, higher = more suspicious
    is_flagged_for_review BOOLEAN DEFAULT FALSE,

    -- Amounts
    requested_amount DECIMAL(10, 2),
    approved_amount DECIMAL(10, 2),
    payout_amount DECIMAL(10, 2),
    payout_percentage DECIMAL(5, 2),   -- 100.00, 60.00, or 0.00

    -- Lifecycle state machine
    status VARCHAR(20) NOT NULL DEFAULT 'filed',
    state_version INTEGER NOT NULL DEFAULT 0,       -- bumped on every transition
    dispute_window_ends_at TIMESTAMP,               -- paid_at + 2 hours
    closed_at TIMESTAMP,

    -- Payout tracking
    payout_id UUID,
    payout_status VARCHAR(20),
    payout_initiated_at TIMESTAMP,
    payout_completed_at TIMESTAMP,

    -- Review
    reviewed_by VARCHAR(255),
    review_notes VARCHAR(1000),
    reviewed_at TIMESTAMP,
    hold_reason VARCHAR(500),
    held_until TIMESTAMP,
    review_priority INTEGER DEFAULT 0,              -- admin queue ordering

    -- Idempotency key — prevent double-claims
    idempotency_key VARCHAR(255) UNIQUE NOT NULL,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT unique_worker_trigger UNIQUE (worker_id, trigger_event_id),
    CONSTRAINT valid_claim_status CHECK (status IN (
        -- core 7
        'filed', 'validated', 'scoring', 'decided',
        'payout_pending', 'paid', 'closed',
        -- branches
        'held', 'rejected', 'cancelled', 'expired', 'disputed', 'payout_failed')),
    CONSTRAINT score_range CHECK (
        confidence_score >= 0 AND confidence_score <= 1 AND
        fraud_probability >= 0 AND fraud_probability <= 1)
);

CREATE INDEX idx_claims_tenant_worker ON claims(tenant_id, worker_id);
CREATE INDEX idx_claims_tenant_status ON claims(tenant_id, status, created_at DESC);
CREATE INDEX idx_claims_trigger ON claims(trigger_event_id);
CREATE INDEX idx_claims_payout_status ON claims(payout_status);
-- Admin review queue: held claims ordered by priority
CREATE INDEX idx_claims_review_queue ON claims(tenant_id, review_priority DESC, created_at)
    WHERE status = 'held';
-- Closing job sweeper: paid claims whose window has elapsed
CREATE INDEX idx_claims_dispute_window ON claims(dispute_window_ends_at)
    WHERE status = 'paid';

-- ======================================================
-- CLAIM STATE TRANSITIONS (append-only audit trail)
-- ======================================================
CREATE TABLE claim_state_transitions (
    id BIGSERIAL PRIMARY KEY,
    claim_id UUID NOT NULL REFERENCES claims(id) ON DELETE CASCADE,
    from_state VARCHAR(20),
    to_state VARCHAR(20) NOT NULL,
    actor VARCHAR(100) NOT NULL,                    -- 'system:fraud-eval', 'admin:<email>', 'worker:<id>'
    reason VARCHAR(500),
    metadata JSONB,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_transitions_claim ON claim_state_transitions(claim_id, created_at);

-- ======================================================
-- CLAIM DISPUTES (opened inside the 2-hour window)
-- ======================================================
CREATE TABLE claim_disputes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    claim_id UUID NOT NULL REFERENCES claims(id) ON DELETE CASCADE,
    worker_id UUID NOT NULL REFERENCES workers(id),
    reason VARCHAR(1000) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'open',
    resolution_notes VARCHAR(1000),
    resolved_by VARCHAR(255),
    opened_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    resolved_at TIMESTAMP,
    CONSTRAINT valid_dispute_status CHECK (status IN ('open', 'upheld', 'rejected'))
);
CREATE UNIQUE INDEX uq_one_open_dispute_per_claim ON claim_disputes(claim_id) WHERE status = 'open';

-- ======================================================
-- FRAUD SIGNALS
-- ======================================================
CREATE TABLE fraud_signals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    claim_id UUID NOT NULL REFERENCES claims(id) ON DELETE CASCADE,
    signal_type VARCHAR(50) NOT NULL,
    is_suspicious BOOLEAN,
    score DECIMAL(3, 2),
    details JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT valid_signal CHECK (signal_type IN
        ('gps_physics', 'network_graph', 'burst', 'zone_rate',
         'platform_activity', 'temporal'))
);

CREATE INDEX idx_fraud_signals_claim ON fraud_signals(claim_id);
CREATE INDEX idx_fraud_signals_type ON fraud_signals(signal_type);

-- ======================================================
-- PAYOUTS  (exactly one payout row per claim)
-- ======================================================
CREATE TABLE payouts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    claim_id UUID NOT NULL UNIQUE REFERENCES claims(id) ON DELETE CASCADE,  -- UNIQUE = no double payout
    worker_id UUID NOT NULL REFERENCES workers(id) ON DELETE CASCADE,
    amount DECIMAL(10, 2) NOT NULL,
    idempotency_key VARCHAR(255) UNIQUE NOT NULL,   -- 'payout:{claim_id}', also sent to the bank API
    status VARCHAR(20) DEFAULT 'pending',
    bank_reference_number VARCHAR(100),
    initiated_at TIMESTAMP,
    completed_at TIMESTAMP,
    failure_reason VARCHAR(500),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT valid_payout_status CHECK (status IN
        ('pending', 'initiated', 'completed', 'failed', 'rejected'))
);

CREATE INDEX idx_payouts_worker ON payouts(worker_id);
CREATE INDEX idx_payouts_status ON payouts(status);

-- ======================================================
-- NOTIFICATION LOG
-- ======================================================
CREATE TABLE notification_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    worker_id UUID NOT NULL REFERENCES workers(id) ON DELETE CASCADE,
    notification_type VARCHAR(50) NOT NULL,
    -- 'pre_alert' | 'claim_approved' | 'claim_held' | 'payout_sent' | 'dispute_update'
    channel VARCHAR(20) NOT NULL,  -- 'push' | 'sms' | 'email' | 'sse'
    title VARCHAR(255),
    body TEXT,
    sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    status VARCHAR(20) DEFAULT 'sent',
    metadata JSONB
);

CREATE INDEX idx_notif_worker ON notification_log(worker_id, sent_at DESC);
```

### 4.4 Prisma Schema (Excerpt)

```prisma
// prisma/schema.prisma  (excerpt — remaining models mirror the SQL above)

generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model Tenant {
  id                  String   @id @default(uuid()) @db.Uuid
  slug                String   @unique
  displayName         String   @map("display_name")
  premiumMultiplier   Decimal  @default(1.00) @map("premium_multiplier") @db.Decimal(4, 2)
  allowedAdminDomains String[] @map("allowed_admin_domains")
  workers             Worker[]
  policies            Policy[]
  claims              Claim[]
  @@map("tenants")
}

model Worker {
  id                 String   @id @default(uuid()) @db.Uuid
  tenantId           String   @map("tenant_id") @db.Uuid
  tenant             Tenant   @relation(fields: [tenantId], references: [id])
  name               String
  phoneNumber        String   @unique @map("phone_number")
  platformWorkerId   String   @map("platform_worker_id")
  zoneId             String   @map("zone_id")
  status             String   @default("active")
  policies           Policy[]
  claims             Claim[]
  @@unique([tenantId, platformWorkerId])
  @@index([tenantId, zoneId])
  @@map("workers")
}

model Policy {
  id               String  @id @default(uuid()) @db.Uuid
  tenantId         String  @map("tenant_id") @db.Uuid
  workerId         String  @map("worker_id") @db.Uuid
  coverageCeiling  Decimal @map("coverage_ceiling") @db.Decimal(10, 2)
  reservedAmount   Decimal @default(0) @map("reserved_amount") @db.Decimal(10, 2)
  settledAmount    Decimal @default(0) @map("settled_amount") @db.Decimal(10, 2)
  // …remaining columns as in SQL
  @@index([tenantId, workerId, isActive])
  @@map("policies")
}

model Claim {
  id                  String    @id @default(uuid()) @db.Uuid
  tenantId            String    @map("tenant_id") @db.Uuid
  workerId            String    @map("worker_id") @db.Uuid
  policyId            String    @map("policy_id") @db.Uuid
  triggerEventId      String    @map("trigger_event_id") @db.Uuid
  status              String    @default("filed")
  stateVersion        Int       @default(0) @map("state_version")
  idempotencyKey      String    @unique @map("idempotency_key")
  disputeWindowEndsAt DateTime? @map("dispute_window_ends_at")
  // …remaining columns as in SQL
  @@unique([workerId, triggerEventId])
  @@index([tenantId, status, createdAt(sort: Desc)])
  @@map("claims")
}
```

Workflow: edit `schema.prisma` → `npx prisma migrate dev --name <change>` → append raw SQL (CHECK constraints, partial indexes, RLS policies) to the generated migration file → `npx prisma generate`.

### 4.5 MongoDB Collections (Telemetry, Audit, ML Logs)

```javascript
// gps_pings — time-series style, TTL 30 days
{
  _id: ObjectId,
  tenantId: "uuid",
  workerId: "uuid",
  loc: { type: "Point", coordinates: [77.610123, 12.934567] },   // [lng, lat]
  accuracyMeters: 8.4,
  jitter: 0.8123,                    // stddev of last 5 readings (computed on write)
  source: "app",                     // 'app' | 'qr_checkin'
  ts: ISODate                        // device timestamp
}
// Indexes: { workerId: 1, ts: -1 }, { loc: "2dsphere" }, { ts: 1 } expireAfterSeconds 2592000

// activity_events — platform activity (delivery_completed, order_accepted, …)
{ _id, tenantId, workerId, type: "delivery_completed", payload: {...}, ts }
// Indexes: { workerId: 1, type: 1, ts: -1 }, TTL 90 days

// dark_store_checkins — QR scan proofs (Section 5.2)
{ _id, tenantId, workerId, darkStoreId, zoneId, nonce, scannedAt, deviceLoc, verified: true }
// Indexes: { workerId: 1, scannedAt: -1 }, { nonce: 1 } unique (replay protection), TTL 30 days

// ml_prediction_log — every inference + eventual outcome (Section 6.7)
{ _id, claimId, modelVersion, contractVersion, features: {...}, fraudProbability,
  shapTopFactors: [...], outcome: "paid" | "held" | "rejected" | null, ts }
// Indexes: { claimId: 1 }, { modelVersion: 1, ts: -1 }

// provider_payloads — raw OpenWeatherMap / platform API responses for audit
{ _id, triggerEventId, provider: "openweathermap", payload: {...}, fetchedAt }
// TTL 180 days

// audit_events — security-relevant actions (admin review, login, tenant switch attempts)
{ _id, tenantId, actor, action, target, ip, ts, meta }
```

---
## 5. API Specifications

### 5.1 Base URL & Conventions
```
Base URL:    http://localhost:8000/api/v1
Content-Type: application/json
Auth:        Bearer <jwt_access_token>  (all endpoints except /auth/*, /policies/tiers)
Tenant:      Derived from the JWT `tenant_id` claim — NEVER from the request body or a header
Idempotency: Mutating POSTs that move money or create claims accept `Idempotency-Key: <uuid>`
```

All responses follow this envelope:

```json
{
  "success": true,
  "data": { },
  "error": null,
  "meta": { "request_id": "uuid", "timestamp": "ISO8601" }
}
```

On error:

```json
{
  "success": false,
  "data": null,
  "error": { "code": "WORKER_NOT_FOUND", "message": "No worker with that ID" }
}
```

### 5.2 Worker Service Endpoints
```
POST   /api/v1/auth/register
POST   /api/v1/auth/login
POST   /api/v1/auth/refresh
GET    /api/v1/auth/platform/:tenantSlug/authorize   (start OAuth 2.0 + PKCE platform link)
GET    /api/v1/auth/platform/:tenantSlug/callback    (OAuth redirect URI)
GET    /api/v1/workers/me
PUT    /api/v1/workers/me
POST   /api/v1/workers/me/gps              (upload GPS snapshot)
POST   /api/v1/workers/me/bank-verify      (mock bank account verification)
POST   /api/v1/workers/me/checkin/qr       (dark-store QR check-in)
GET    /api/v1/workers/me/notifications
```

**POST /api/v1/auth/register**

Request:
```json
{
  "name": "Rajan Kumar",
  "phone_number": "9876543210",
  "password": "secure_pass_123",
  "tenant_slug": "blinkit",
  "platform_worker_id": "BLK-WORKER-88821",
  "zone_id": "560034",
  "current_city": "Bengaluru",
  "state": "Karnataka"
}
```

Response `201`:
```json
{
  "success": true,
  "data": {
    "worker_id": "uuid",
    "access_token": "jwt_access_token",
    "refresh_token": "opaque_token",
    "expires_in": 900
  }
}
```

**POST /api/v1/auth/login** — Request: `{ "phone_number": "9876543210", "password": "secure_pass_123" }`. Response `200`: same shape as register.

**OAuth platform linking** — `authorize` redirects to the tenant's OAuth/OIDC provider using Authorization Code + PKCE; `callback` exchanges the code, verifies the ID token, confirms the `platform_worker_id` claim matches the registered worker, and stores `platform_oauth_subject` + `platform_verified_at`. Unlinked workers can register but cannot buy a policy (`PLATFORM_NOT_LINKED`).

**POST /api/v1/workers/me/gps**

Request:
```json
{
  "latitude": 12.934567,
  "longitude": 77.610123,
  "accuracy_meters": 8.4,
  "timestamp": "2026-11-12T14:32:00Z"
}
```

Writes to MongoDB `gps_pings`; the write path computes `jitter` from the last 5 pings.

**POST /api/v1/workers/me/checkin/qr** — Dark-Store QR Check-In

Each dark store displays a QR encoding `{ dark_store_id, nonce, issued_at, sig }` where `sig = HMAC-SHA256(qr_secret, dark_store_id|nonce|issued_at)`; the QR rotates every 5 minutes.

Request:
```json
{
  "qr_payload": "base64url(...)",
  "device_lat": 12.9346,
  "device_lng": 77.6101
}
```

Server verifies: signature, `issued_at` within 5 minutes, nonce not seen before (unique index — replay protection), the worker belongs to the same tenant as the dark store, and device location is within 150 m of the store. On success a `dark_store_checkins` document and a `source: "qr_checkin"` GPS ping are written. A valid check-in within the 60 minutes before `trigger.detected_at` counts as presence proof for fraud Layer F (Section 7.1).

### 5.3 Policy Service Endpoints
```
POST   /api/v1/policies              (buy policy)
GET    /api/v1/policies              (list worker's policies)
GET    /api/v1/policies/:id          (get single policy)
DELETE /api/v1/policies/:id          (cancel policy)
GET    /api/v1/policies/:id/coverage (coverage details per trigger type)
GET    /api/v1/policies/tiers        (static tier info — no auth required; cached)
```

**POST /api/v1/policies** — Buy Policy

Request:
```json
{
  "tier": 2,
  "auto_renew": true
}
```

Response `201`:
```json
{
  "success": true,
  "data": {
    "policy_id": "uuid",
    "tier": 2,
    "premium_weekly": 89.00,
    "start_date": "2026-11-16",
    "end_date": "2026-11-23",
    "max_payout_per_event": 350.00,
    "coverage_ceiling": 1400.00,
    "trigger_day_limit": 4,
    "waiting_period_ends_at": "2026-11-19T00:00:00Z"
  }
}
```

Buying is guarded by the `uq_one_active_policy_per_worker` partial unique index; two simultaneous purchase requests produce exactly one policy and a `409 POLICY_ALREADY_ACTIVE` for the other. Premium is `tier base × tenant.premium_multiplier`.

**GET /api/v1/policies/tiers** — Static Tier Info (Public)

```json
{
  "tiers": [
    { "tier": 1, "premium_weekly": 49, "label": "Basic", "max_payout_per_event": 200, "max_days_per_month": 3 },
    { "tier": 2, "premium_weekly": 89, "label": "Standard", "max_payout_per_event": 350, "max_days_per_month": 4 },
    { "tier": 3, "premium_weekly": 129, "label": "Premium", "max_payout_per_event": 500, "max_days_per_month": 6 }
  ]
}
```

### 5.4 Trigger Service Endpoints
```
GET    /api/v1/triggers/active                  (active, announced triggers for worker's zone — cached)
GET    /api/v1/triggers/:id                     (trigger details)
GET    /api/v1/triggers/history                 (last 30 days)
POST   /api/v1/admin/triggers/simulate          (ADMIN ONLY — for testing)
```

**POST /api/v1/admin/triggers/simulate** — Testing Only

Request:
```json
{
  "trigger_type": "rainfall",
  "zone_id": "560034",
  "actual_value": 42.5,
  "severity": "high",
  "duration_minutes": 90
}
```

### 5.5 Claims Service Endpoints
```
POST   /api/v1/claims                        (file claim against an announced trigger)
GET    /api/v1/claims                        (worker's claim history)
GET    /api/v1/claims/:id                    (claim detail + state timeline)
GET    /api/v1/claims/:id/status             (lightweight status check)
POST   /api/v1/claims/:id/dispute            (worker disputes inside the 2-hour window)
GET    /api/v1/admin/claims/queue            (ADMIN — held claims, highest priority first)
POST   /api/v1/admin/claims/:id/review       (ADMIN — manual review decision)
POST   /api/v1/admin/disputes/:id/resolve    (ADMIN — uphold / reject dispute)
GET    /api/v1/admin/analytics/tenant        (ADMIN — claims, payouts, fraud rate for own tenant)
```

**POST /api/v1/claims** — File Claim

Headers: `Idempotency-Key: <uuid>` (optional; the server also derives `worker_id:trigger_event_id`).

Request:
```json
{
  "trigger_event_id": "uuid",
  "policy_id": "uuid",
  "gps_lat": 12.934567,
  "gps_lng": 77.610123
}
```

Response `202` (accepted for async processing):
```json
{
  "success": true,
  "data": {
    "claim_id": "uuid",
    "status": "filed",
    "estimated_decision_seconds": 5,
    "stream_url": "/api/v1/stream/claims/uuid",
    "message": "Your claim is being processed. You'll be notified shortly."
  }
}
```

**GET /api/v1/claims/:id** — worker view (fraud scores hidden from workers; admins also see signals)

```json
{
  "claim_id": "uuid",
  "status": "paid",
  "payout_amount": 350.00,
  "payout_status": "completed",
  "dispute_window_ends_at": "2026-11-17T16:42:00Z",
  "can_dispute": true,
  "timeline": [
    { "state": "filed", "at": "2026-11-17T14:40:01Z" },
    { "state": "validated", "at": "2026-11-17T14:40:01Z" },
    { "state": "scoring", "at": "2026-11-17T14:40:02Z" },
    { "state": "decided", "at": "2026-11-17T14:40:03Z" },
    { "state": "payout_pending", "at": "2026-11-17T14:40:03Z" },
    { "state": "paid", "at": "2026-11-17T14:42:00Z" }
  ],
  "trigger": { "type": "rainfall", "zone_id": "560034", "severity": "high" },
  "worker_message": "Payout of ₹350 has been sent to your bank account."
}
```

**POST /api/v1/claims/:id/dispute**

Request: `{ "reason": "Partial payout but I was working through the whole event." }`  
Allowed only while `status = 'paid'` and `now < dispute_window_ends_at`; moves the claim to `disputed` and creates a `claim_disputes` row. Otherwise `409 DISPUTE_WINDOW_CLOSED`.

**GET /api/v1/admin/claims/queue** — returns held claims ordered by `review_priority DESC, created_at ASC` (Section 8.5).

**POST /api/v1/admin/claims/:id/review**

Request:
```json
{
  "decision": "approve",
  "review_notes": "GPS history verified manually. Legitimate claim.",
  "payout_percentage": 100
}
```

### 5.6 Real-Time Streams (Server-Sent Events)
```
GET    /api/v1/stream/claims/:id     (claim state changes for one claim — owner only)
GET    /api/v1/stream/worker         (worker feed: trigger announcements, pre-alerts, claim updates)
GET    /api/v1/stream/admin          (ADMIN — tenant-scoped live feed: new held claims, ring alerts)
```

Response headers: `Content-Type: text/event-stream`, `Cache-Control: no-cache, no-transform`, `Connection: keep-alive`, `X-Accel-Buffering: no`.
```
event: claim.state_changed
id: 1731854523000-1
data: {"claim_id":"uuid","from":"scoring","to":"decided","payout_percentage":100}

: heartbeat
```

A `: heartbeat` comment is sent every 25 seconds. Browsers reconnect automatically; the client re-fetches `/claims/:id/status` on reconnect to close any gap. Details in Section 12.3.

### 5.7 Internal Endpoints
```
(Internal — consumed from BullMQ `notifications` queue, not exposed via gateway)
```

### 5.8 Health & Monitoring
```
GET    /health                  (gateway health check)
GET    /api/v1/health/services  (ADMIN — all service + Redis + Postgres + Mongo health)
GET    /metrics                 (Prometheus format — includes SSE connection gauge, cache hit ratio)
```

---
## 6. AI/ML Architecture

### 6.1 Overview

The ML layer is a **Python 3.11 FastAPI microservice** running separately from the Node.js backend. The Claims Service talks to it over **Redis pub/sub** (request on `ml:fraud:request`, result on `ml:fraud:result`) with an **HTTP `/infer` fallback**. This decouples fraud evaluation from claim intake: a slow model never blocks the API, and the ML service can scale independently. The Python service is responsible for **feature extraction and model inference only**; the **decision logic (confidence score and approve/partial/hold thresholds) lives in one place — the Node.js Decision Engine** (Section 7.2). v2.0 duplicated that logic in both services.

### 6.2 Model: XGBoost Fraud Classifier

**Why XGBoost?**
- Tabular fraud data — XGBoost consistently outperforms neural networks on structured tabular data
- Interpretable — can explain each prediction to regulators with SHAP values (top factors stored in `ml_prediction_log`)
- Fast inference — < 10ms per prediction
- Handles class imbalance well — genuine claims >> fraud claims

**Training Data:**
- Genuine claims: 500 synthetic samples (realistic GPS, delivery history, activity patterns)
- Fraud ring scenarios: 100 synthetic samples (coordinated registration, GPS spoofing patterns, burst timing)
- Features: 8 per claim (the feature contract, Section 6.4)

**Target Metrics:**
- Precision ≥ 95% (minimize false fraud accusations — honest workers must not be wrongly held)
- Recall ≥ 80% (catch most fraud rings)
- ROC-AUC ≥ 0.92
- F1 Score ≥ 0.85

### 6.3 FastAPI Service Structure

```python
# ml/inference_server.py

import asyncio, json, joblib
from contextlib import asynccontextmanager
from fastapi import FastAPI
from pydantic import BaseModel, Field
import redis.asyncio as aioredis
import features  # local feature extraction module

CONTRACT_VERSION = "1.0"
MODEL_VERSION = "v1"

model = joblib.load("data/models/fraud_detector_v1.pkl")
scaler = joblib.load("data/models/scaler_v1.pkl")
redis = aioredis.from_url("redis://localhost:6379")

# ---------- Feature contract (versioned request/response schema) ----------
class ClaimInferenceRequest(BaseModel):
    contract_version: str = CONTRACT_VERSION
    correlation_id: str
    claim_id: str
    tenant_id: str
    worker_id: str
    trigger_event_id: str
    # --- GPS plausibility ---
    gps_lat: float
    gps_lng: float
    pre_trigger_gps_history: list[dict]     # [{lat, lng, ts, jitter}]
    qr_checkin_within_window: bool = False  # strengthens pre_trigger_active
    # --- Claim burst patterns ---
    zone_claims_last_3min: int
    # --- Zone claim rate ---
    zone_claim_count: int
    zone_total_workers: int
    # --- Activity history ---
    last_delivery_timestamp: str | None
    registration_timestamp: str
    registration_ip_cluster: int
    claim_timestamp: str

class ClaimInferenceResponse(BaseModel):
    contract_version: str = CONTRACT_VERSION
    model_version: str = MODEL_VERSION
    correlation_id: str
    claim_id: str
    fraud_probability: float = Field(ge=0, le=1)
    features: dict[str, float]
    signals: list[dict]                     # per-layer {type, suspicious, score, details}
    shap_top_factors: list[dict] = []

def score(req: ClaimInferenceRequest) -> ClaimInferenceResponse:
    vec = features.extract(req)                       # list[float], FEATURES order
    scaled = scaler.transform([vec])
    prob = float(model.predict_proba(scaled)[0][1])
    return ClaimInferenceResponse(
        correlation_id=req.correlation_id,
        claim_id=req.claim_id,
        fraud_probability=round(prob, 4),
        features=dict(zip(features.FEATURES, vec)),
        signals=features.extract_signals(req, vec),
    )

# ---------- Redis pub/sub listener (primary path) ----------
async def listen():
    pubsub = redis.pubsub()
    await pubsub.subscribe("ml:fraud:request")
    async for msg in pubsub.listen():
        if msg["type"] != "message":
            continue
        req = ClaimInferenceRequest.model_validate_json(msg["data"])
        # Pub/sub broadcasts to every subscriber; only one ML instance may answer.
        if not await redis.set(f"ml:claimed:{req.correlation_id}", "1", nx=True, ex=10):
            continue
        res = score(req)
        await redis.publish("ml:fraud:result", res.model_dump_json())

@asynccontextmanager
async def lifespan(app: FastAPI):
    task = asyncio.create_task(listen())
    yield
    task.cancel()

app = FastAPI(title="Kavach ML Service", version="1.0", lifespan=lifespan)

# ---------- HTTP fallback ----------
@app.post("/infer", response_model=ClaimInferenceResponse)
async def infer_fraud(req: ClaimInferenceRequest):
    return score(req)

@app.get("/health")
async def health():
    return {"status": "ok", "model_version": MODEL_VERSION, "contract_version": CONTRACT_VERSION}
```

### 6.4 Feature Contract (8 Features, Versioned)

The **feature contract** is the agreement between the Node.js Claims Service (which gathers raw signals) and the Python ML service (which turns them into model inputs). It is versioned (`contract_version`); the ML service rejects unknown major versions, and the Node client pins the version it was built against. A contract change requires a model retrain.

| Group | # | Feature | Description | Fraud Signal Direction |
|---|---|---|---|---|
| **GPS plausibility** | 1 | `gps_jitter_score` | StdDev of last 5 GPS readings | Perfect (≈0) jitter = suspicious |
| | 2 | `velocity_plausible` | Max speed between last 3 GPS points (km/h) | > 80 km/h = physically impossible |
| | 3 | `pre_trigger_active` | In zone at T=0 (detected, not announced) — via GPS **or** a valid QR check-in | 0 = not present before announcement |
| **Claim burst patterns** | 4 | `burst_flag` | Part of a burst (> 50 claims in < 3 min in the zone)? | 1 = burst detected |
| **Zone claim rate** | 5 | `zone_claim_rate` | Claims / registered workers in zone for this event | > 0.70 = ring suspected |
| **Activity history** | 6 | `delivery_history_hours` | Hours since last platform delivery | > 48h = dormant account |
| | 7 | `registration_age_days` | Days since account registration | < 3 days = new-account fraud risk |
| | 8 | `registration_ip_cluster` | Count of other accounts from same registration IP | > 5 = likely a farm |

### 6.5 Training Script (Synthetic Data Generation)

```python
# ml/synthetic_data.py

import pandas as pd, numpy as np, random

def generate_genuine_claim():
    return {
        "gps_jitter_score": round(np.random.normal(0.8, 0.15), 4),    # normal GPS noise
        "velocity_plausible": round(random.uniform(0, 1), 1),          # moving at delivery pace
        "pre_trigger_active": 1,                                        # was in zone
        "delivery_history_hours": round(random.uniform(0, 6), 1),      # delivered recently
        "registration_age_days": random.randint(30, 730),
        "registration_ip_cluster": random.randint(1, 2),
        "zone_claim_rate": round(random.uniform(0.2, 0.55), 2),
        "burst_flag": 0,
        "label": 0  # genuine
    }

def generate_fraud_claim():
    return {
        "gps_jitter_score": round(np.random.normal(0.02, 0.01), 4),   # suspiciously perfect GPS
        "velocity_plausible": round(random.uniform(0, 1), 1),
        "pre_trigger_active": 0,                                        # not in zone before announcement
        "delivery_history_hours": round(random.uniform(48, 200), 1),   # dormant account
        "registration_age_days": random.randint(1, 5),                 # brand new account
        "registration_ip_cluster": random.randint(8, 50),              # IP farm
        "zone_claim_rate": round(random.uniform(0.75, 0.99), 2),       # ring activity
        "burst_flag": 1,                                                # burst detected
        "label": 1  # fraud
    }

genuine = [generate_genuine_claim() for _ in range(500)]
fraud = [generate_fraud_claim() for _ in range(100)]
df = pd.DataFrame(genuine + fraud).sample(frac=1).reset_index(drop=True)
df.to_csv("data/training_data.csv", index=False)
```

> **Improvement over a purely separable dataset:** add 5–10% label noise and a handful of "hard negatives" (genuine workers with low jitter, or fraud with realistic GPS) so reported precision/recall are not trivially perfect.

### 6.6 Model Training Script

```python
# ml/train.py

import pandas as pd
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import classification_report, roc_auc_score
from xgboost import XGBClassifier
import joblib, os

FEATURES = [
    "gps_jitter_score", "velocity_plausible", "pre_trigger_active",
    "delivery_history_hours", "registration_age_days",
    "registration_ip_cluster", "zone_claim_rate", "burst_flag"
]

df = pd.read_csv("data/training_data.csv")
X = df[FEATURES]
y = df["label"]

X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42, stratify=y)

scaler = StandardScaler()
X_train_s = scaler.fit_transform(X_train)
X_test_s = scaler.transform(X_test)

model = XGBClassifier(
    n_estimators=200,
    max_depth=5,
    learning_rate=0.1,
    scale_pos_weight=5,  # class imbalance: 500 genuine : 100 fraud
    eval_metric="logloss",
    random_state=42
)

model.fit(X_train_s, y_train, eval_set=[(X_test_s, y_test)], verbose=False)

y_pred = model.predict(X_test_s)
y_prob = model.predict_proba(X_test_s)[:, 1]

print(classification_report(y_test, y_pred))
print(f"ROC-AUC: {roc_auc_score(y_test, y_prob):.4f}")

os.makedirs("data/models", exist_ok=True)
joblib.dump(model, "data/models/fraud_detector_v1.pkl")
joblib.dump(scaler, "data/models/scaler_v1.pkl")
print("Model saved.")
```

### 6.7 Retraining Strategy

- **Schedule:** Weekly cron job (Sunday midnight)
- **Trigger:** F1-score < 0.85 on last 30 days of labeled data
- **Versioning:** Models stored as `fraud_detector_v{N}.pkl` — never overwrite previous
- **Monitoring:** Log all predictions + eventual outcomes (paid/held/rejected) to the MongoDB `ml_prediction_log` collection
- **Drift Detection:** Compare fraud_probability distribution weekly; alert if mean shifts > 0.15

---

## 7. Fraud Detection System

### 7.1 Six-Layer Defense Architecture
```
LAYER A: GPS Physics Validation
  Input:  Last 5 GPS coordinates + timestamps (MongoDB gps_pings)
  Check:  Velocity between consecutive points (haversine)
          Jitter pattern (natural vs perfect/spoofed)
  Output: gps_physics_score (0–1)

  Real GPS:    Jitter = 0.5–1.5m natural variation
  Spoofed GPS: Jitter ≈ 0 (programmatic, no hardware noise)
  Physics:     Cannot move 18km in 8 minutes on a scooter

LAYER B: Network Graph Analysis
  Input:  Registration IP, device fingerprint, phone number patterns
  Check:  How many accounts share this registration IP / device?
          Graph connectivity — is this account within 2 hops of a known
          fraud account? (BFS over an account–IP–device graph)
  Output: network_graph_score (0–1)

  Fraud ring signature: 500 accounts registered from 12 IPs in one evening

LAYER C: Claim Burst Detection
  Input:  Claim timestamps from this zone in the last 5 minutes
  Check:  Sliding window — if > 50 claims arrive from one zone in
          < 3 minutes → burst flag (Redis sorted set, O(log n) per op)
  Output: burst_flag (0 or 1)

  Genuine behavior: Claims trickle in as workers become aware
  Fraud ring:       All 500 claims in a 90-second coordinated window

LAYER D: Zone Claim Rate Anomaly
  Input:  (Claims filed for this trigger) / (Workers registered in zone)
  Check:  Historical participation rate = 35–55% for genuine events
  Output: zone_claim_rate feature

  Anomaly threshold: > 70% participation → freeze zone, cross-validate all claims

LAYER E: Platform Activity Reconciliation
  Input:  Worker's last delivery timestamp (MongoDB activity_events /
          mock platform API)
  Check:  "Did this worker complete any delivery in the 2 hours before trigger fired?"
  Output: delivery_history_hours feature

  Genuine worker:   Delivered at 6:12pm, trigger at 6:34pm → hours = 0.37
  Fraud ring actor: Zero deliveries today → account is dormant

LAYER F: Temporal Decoupling (The Ring's Achilles Heel)
  Input:  GPS snapshot taken at T=0 (trigger DETECTED, not announced)
          Trigger announced to clients at T+8 minutes
          Dark-store QR check-ins (cryptographically signed, replay-protected)
  Check:  Was worker in the zone at T=0 — by GPS history OR by a valid
          QR check-in in the 60 minutes before detection?
  Output: pre_trigger_active feature (1 = was in zone before announcement)

  The ring cannot fake where they were before they knew the trigger fired.
  The 8-minute silent window makes retroactive spoofing impossible, and a
  rotating-QR check-in is a presence proof that does not depend on GPS.
```

### 7.2 Confidence Score Computation (Decision Engine — Single Source of Truth)

```javascript
// backend/src/services/claims/decisionEngine.js

const WEIGHTS = {
  pre_trigger_activity: 0.30,
  gps_physics:          0.25,
  platform_delivery:    0.20,
  network_graph:        0.15,
  zone_claim_rate:      0.10,
} ;

function computeConfidenceScore(mlFraudProbability, s) {
  // Map each signal's "suspicious" value to a "genuine" score in [0, 1]
  const genuine = {
    pre_trigger_activity: s.pre_trigger_active,
    gps_physics:          s.gps_physics_score,
    platform_delivery:    1 - Math.min(s.delivery_history_hours / 48, 1),
    network_graph:        1 - Math.min(s.registration_ip_cluster / 20, 1),
    zone_claim_rate:      1 - Math.min(s.zone_claim_rate / 0.7, 1),
  };

  const weighted = (Object.keys(WEIGHTS) )
    .reduce((acc, k) => acc + WEIGHTS[k] * genuine[k], 0);

  // Blend weighted rule signals (60%) with ML model output (40%)
  return 0.6 * weighted + 0.4 * (1 - mlFraudProbability);
}

function makeClaimDecision(confidence) {
  if (confidence >= 0.65) return { decision: 'auto_approve', payoutPercentage: 100 };
  if (confidence >= 0.40) return { decision: 'partial',      payoutPercentage: 60 };
  return { decision: 'hold', payoutPercentage: 0 };
}

module.exports = { computeConfidenceScore, makeClaimDecision };
```

### 7.3 Fraud Layers as Objects (OOP: Interface + Strategy + Composition)

Each layer is a class implementing a common interface; a `FraudPipeline` composes them. New layers are added without touching existing ones (open/closed principle), and each layer is unit-testable in isolation.

```javascript
// backend/src/services/claims/fraud/FraudLayer.js

// JavaScript has no abstract classes or interfaces, so the "contract" is: every layer
// extends FraudLayer, sets `type`, and implements evaluate(ctx) -> LayerResult.
// LayerResult = { type, suspicious: boolean, score: 0..1 (higher = more genuine), details: {} }
class FraudLayer {
  evaluate(_ctx) {
    throw new Error(`${this.constructor.name} must implement evaluate(ctx)`);
  }

  result(suspicious, score, details = {}) {
    return { type: this.type, suspicious, score: Math.max(0, Math.min(1, score)), details };
  }
}

class GpsPhysicsLayer extends FraudLayer {
  type = 'gps_physics';
  async evaluate(ctx) {
    const maxKmh = maxSpeedKmh(ctx.gpsHistory);                  // haversine between points
    const jitter = stddev(ctx.gpsHistory.slice(0, 5).map(p => p.jitter));
    const impossible = maxKmh > 80;
    const tooPerfect = jitter < 0.05;
    return this.result(impossible || tooPerfect, impossible ? 0 : tooPerfect ? 0.05 : 0.9,
                       { maxKmh, jitter });
  }
}

class NetworkGraphLayer extends FraudLayer { /* BFS over account–IP–device graph, 2 hops */ }
class BurstLayer        extends FraudLayer { /* Redis sorted-set sliding window */ }
class ZoneRateLayer     extends FraudLayer { /* claims / workers in zone */ }
class PlatformActivityLayer extends FraudLayer { /* hours since last delivery */ }
class TemporalLayer     extends FraudLayer { /* GPS at T=0 OR valid QR check-in */ }

class FraudPipeline {
  constructor(layers) {
    this.layers = layers;
  }
  async run(ctx) {
    return Promise.all(this.layers.map(l => l.evaluate(ctx)));   // layers are independent
  }
}

module.exports = { FraudLayer, GpsPhysicsLayer, NetworkGraphLayer, BurstLayer, ZoneRateLayer, PlatformActivityLayer, TemporalLayer, FraudPipeline };
```

### 7.4 Data Structures & Algorithms Used

| Where | Structure / Algorithm | Why |
|---|---|---|
| Layer A | Haversine distance + sliding max over consecutive GPS points | O(k) per claim, k ≤ 10 |
| Layer B | Account–IP–device **graph**, BFS to depth 2 (adjacency lists built from indexed Postgres queries) | Finds accounts within 2 hops of a known fraud account without scanning the whole table |
| Layer B (batch) | **Union-Find (disjoint set)** nightly job to merge accounts sharing IP or device into clusters | Near-O(α(n)) merge; cluster size feeds `registration_ip_cluster` |
| Layer C | **Sliding window** on a Redis sorted set (`ZADD` / `ZREMRANGEBYSCORE` / `ZCARD`) | O(log n) per claim; burst check is a single `ZCARD` |
| Admin review queue | **Priority queue** (min-heap semantics) via Redis sorted set, or Postgres partial index | Highest-priority held claim in O(log n) (Section 8.5) |
| QR replay protection | Unique index on `nonce` (hash lookup) | O(1) duplicate detection |
| Cache single-flight | Per-key lock + in-process `Map<string, Promise>` | Prevents cache stampede (Section 11.3) |

### 7.5 Burst Detection (Sliding Window Implementation)

```javascript
// backend/src/services/claims/fraud/burst.js

async function recordClaimAndCheckBurst(zoneId, triggerId, claimId) {
  const key = `burst:${triggerId}:${zoneId}`;
  const now = Date.now();
  const pipeline = redis.pipeline();
  pipeline.zadd(key, now, claimId);
  pipeline.zremrangebyscore(key, 0, now - 3 * 60 * 1000);      // keep only the last 3 minutes
  pipeline.zcard(key);
  pipeline.expire(key, 600);
  const results = await pipeline.exec();
  const count = results[2][1] ;
  return count > 50;                                            // burst_flag
}

module.exports = { recordClaimAndCheckBurst };
```

### 7.6 Zone Fraud Ring Detection Protocol

```javascript
// backend/src/services/claims/fraud/ringDetection.js

async function detectZoneFraudRing(triggerEventId, zoneId) {
  const [totalWorkers, totalClaims] = await Promise.all([
    cached(`zone:workers:${zoneId}`, 300, () => prisma.worker.count({ where: { zoneId } })),
    prisma.claim.count({ where: { triggerEventId } }),
  ]);

  const zoneRate = totalClaims / Math.max(totalWorkers, 1);
  if (zoneRate > 0.70) {
    // Statistically impossible participation — hold all low-confidence claims
    await redis.set(`zone:fraud_ring:${zoneId}`, '1', 'EX', 3600);
    await freezeZoneLowConfidenceClaims(triggerEventId, zoneId);
    await redis.publish('evt:fraud.ring_suspected', JSON.stringify({ zoneId, triggerEventId, zoneRate }));
  }
}

module.exports = { detectZoneFraudRing };
```

The ring flag is also consulted by the payout worker as a pre-disbursement fraud-flag check (Section 8.4). **Honest worker guarantee:** claims with `confidence ≥ 0.65` still process even while the zone ring flag is set.

---
## 8. Claims Processing Engine

### 8.1 Claim Lifecycle State Machine

Every claim moves through **7 core states**, with **branch states** for rejection, cancellation, expiry, holds, disputes, and payout failure. Transitions are the only way status changes, are validated against a table, executed under a row lock, and recorded in `claim_state_transitions`.
```
 CORE PATH
 filed ──► validated ──► scoring ──► decided ──► payout_pending ──► paid ──► closed
   │           │            │           │              │              │
   │           │            │           │              ▼              ▼
   │           │            │           ▼          payout_failed    disputed
   │           │            │         held ◄───────────┘              │
   ▼           ▼            ▼           │                             ▼
 rejected   cancelled    rejected       ├──► payout_pending   (dispute upheld → adjustment)
                                        ├──► rejected         closed (dispute rejected)
                                        └──► expired
```

| From | Allowed → To | Triggered by |
|---|---|---|
| `filed` | `validated`, `rejected`, `cancelled` | Validation worker / worker cancels |
| `validated` | `scoring`, `cancelled` | Coverage reserved, `fraud-eval` job started |
| `scoring` | `decided`, `rejected` | ML result received / hard rule failure |
| `decided` | `payout_pending`, `held` | Decision Engine (auto_approve/partial → payout; hold → held) |
| `held` | `payout_pending`, `rejected`, `expired` | Admin review / 7-day expiry |
| `payout_pending` | `paid`, `payout_failed` | Payout worker |
| `payout_failed` | `payout_pending`, `held` | Retry / manual escalation |
| `paid` | `closed`, `disputed` | Delayed close job (2 h) / worker dispute |
| `disputed` | `closed`, `payout_pending` | Admin resolves dispute (reject / uphold with adjustment) |
| `closed`, `rejected`, `cancelled`, `expired` | — | Terminal |

```javascript
// backend/src/services/claims/stateMachine.js

const ClaimState = Object.freeze({
  FILED: 'filed', VALIDATED: 'validated', SCORING: 'scoring', DECIDED: 'decided',
  PAYOUT_PENDING: 'payout_pending', PAID: 'paid', CLOSED: 'closed',
  HELD: 'held', REJECTED: 'rejected', CANCELLED: 'cancelled', EXPIRED: 'expired',
  DISPUTED: 'disputed', PAYOUT_FAILED: 'payout_failed',
});

const TRANSITIONS = Object.freeze({
  filed:          ['validated', 'rejected', 'cancelled'],
  validated:      ['scoring', 'cancelled'],
  scoring:        ['decided', 'rejected'],
  decided:        ['payout_pending', 'held'],
  held:           ['payout_pending', 'rejected', 'expired'],
  payout_pending: ['paid', 'payout_failed'],
  payout_failed:  ['payout_pending', 'held'],
  paid:           ['closed', 'disputed'],
  disputed:       ['closed', 'payout_pending'],
  closed: [], rejected: [], cancelled: [], expired: [],
});

class ClaimStateMachine {
  constructor(prisma, bus) {
    this.prisma = prisma;
    this.bus = bus;
  }

  canTransition(from, to) {
    return TRANSITIONS[from].includes(to);
  }

  /**
   * Atomically move a claim to a new state.
   * - Locks the claim row (SELECT … FOR UPDATE) so concurrent transitions serialise.
   * - Validates the transition table.
   * - Writes the audit row and bumps state_version in the same transaction.
   * - Publishes `claim.state_changed` AFTER commit (never inside the transaction).
   */
  async transition(
    claimId, to, actor,
    opts = {}
  ) {
    const run = async (tx) => {
      const [row] = await tx.$queryRaw`
        SELECT status, tenant_id, worker_id FROM claims WHERE id = ${claimId}::uuid FOR UPDATE`;
      if (!row) throw new AppError('CLAIM_NOT_FOUND', 404);
      if (!this.canTransition(row.status, to)) {
        throw new AppError('ILLEGAL_TRANSITION', 409, `${row.status} → ${to} is not allowed`);
      }
      const claim = await tx.claim.update({
        where: { id: claimId },
        data: { ...opts.patch, status: to, stateVersion: { increment: 1 } },
      });
      await tx.claimStateTransition.create({
        data: { claimId, fromState: row.status, toState: to, actor, reason: opts.reason },
      });
      return { claim, from: row.status, tenantId: row.tenant_id, workerId: row.worker_id };
    };

    const out = opts.tx ? await run(opts.tx)
                        : await this.prisma.$transaction(run, { timeout: 5000 });

    // Publish after commit — subscribers (SSE hub, notifications) never see uncommitted state
    await this.bus.publish('evt:claim.state_changed', {
      claimId, from: out.from, to, tenantId: out.tenantId, workerId: out.workerId,
    });
    return out.claim;
  }
}

module.exports = { ClaimState, ClaimStateMachine };
```

### 8.2 Filing a Claim (Idempotent, Concurrency-Safe)

```javascript
// backend/src/services/claims/service.js

async function fileClaim(
  tenantId, workerId, triggerEventId, policyId, gps
) {
  const db = forTenant(tenantId);                       // tenant-scoped Prisma client (Section 10.4)

  const worker = await db.worker.findFirst({ where: { id: workerId, status: 'active' } });
  if (!worker) throw new AppError('WORKER_NOT_FOUND', 404);

  const policy = await db.policy.findFirst({
    where: { id: policyId, workerId, isActive: true, startDate: { lte: new Date() }, endDate: { gte: new Date() } },
  });
  if (!policy) throw new AppError('NO_ACTIVE_POLICY', 400);

  // 72-hour waiting period
  if (Date.now() < policy.createdAt.getTime() + 72 * 3600_000) throw new AppError('WAITING_PERIOD_ACTIVE', 400);

  // Trigger must be announced (T+8 min after detection) and cover this zone
  const trigger = await getActiveTrigger(worker.zoneId, triggerEventId);   // cache-aside, Section 11
  if (!trigger || !trigger.announcedAt) throw new AppError('NO_ACTIVE_TRIGGER', 400);

  const idempotencyKey = `${workerId}:${triggerEventId}`;

  // Layer 1 — cheap Redis guard against double-taps and retries storms
  const first = await redis.set(`claim:filing:${idempotencyKey}`, '1', 'EX', 30, 'NX');
  if (!first) {
    const existing = await db.claim.findUnique({ where: { idempotencyKey } });
    if (existing) return existing;
  }

  try {
    // Layer 2 — database unique constraints are the real guarantee
    const claim = await db.claim.create({
      data: {
        tenantId, workerId, policyId, triggerEventId, idempotencyKey,
        status: 'filed', requestedAmount: policy.maxPayoutPerEvent,
      },
    });
    await recordTransition(claim.id, null, 'filed', `worker:${workerId}`);
    await validationQueue.add('validate', { claimId: claim.id }, { jobId: `validate:${claim.id}` });
    return claim;
  } catch (e) {
    if (isUniqueViolation(e)) {                         // Prisma P2002 on idempotency_key / (worker, trigger)
      return db.claim.findUniqueOrThrow({ where: { idempotencyKey } });
    }
    throw e;
  }
}

module.exports = { fileClaim };
```

### 8.3 Pipeline Workers (BullMQ)

```javascript
// backend/src/services/claims/workers.js

const { Queue, Worker } = require('bullmq');
const connection = { host: env.REDIS_HOST, port: 6379 };

const validationQueue = new Queue('claim-validate', { connection });
const fraudQueue      = new Queue('fraud-eval', { connection });
const payoutQueue     = new Queue('payout', { connection });
const closeQueue      = new Queue('close-claim', { connection });

const defaultJobOpts = {
  attempts: 3,
  backoff: { type: 'exponential', delay: 2000 },
  removeOnComplete: 1000,
  removeOnFail: 5000,
};

/** filed → validated: reserve coverage under a policy row lock, then enqueue fraud-eval */
new Worker('claim-validate', async (job) => {
  const { claimId } = job.data;
  await withRedisLock(`lock:claim:${claimId}`, 15_000, async () => {
    await prisma.$transaction(async (tx) => {
      const claim = await tx.claim.findUniqueOrThrow({ where: { id: claimId } });

      // Row-level lock on the POLICY: two claims on different triggers cannot both
      // squeeze past the coverage ceiling.
      const [p] = await tx.$queryRaw`
        SELECT id, coverage_ceiling, reserved_amount, settled_amount, max_payout_per_event
        FROM policies WHERE id = ${claim.policyId}::uuid FOR UPDATE`;

      const available = p.coverage_ceiling.minus(p.reserved_amount).minus(p.settled_amount);
      if (available.lt(p.max_payout_per_event)) {
        await sm.transition(claimId, 'rejected', 'system:validate',
          { reason: 'COVERAGE_CEILING_REACHED', tx });
        return;
      }
      await tx.policy.update({
        where: { id: p.id }, data: { reservedAmount: { increment: p.max_payout_per_event } },
      });
      await sm.transition(claimId, 'validated', 'system:validate', { tx });
    });
  });
  await fraudQueue.add('score', { claimId }, { ...defaultJobOpts, jobId: `score:${claimId}` });
}, { connection, concurrency: 20 });

/** validated → scoring → decided (→ payout_pending | held) */
new Worker('fraud-eval', async (job) => {
  const { claimId } = job.data;
  await sm.transition(claimId, 'scoring', 'system:fraud-eval');

  const ctx = await buildClaimContext(claimId);            // Postgres + MongoDB + Redis
  const ml = await mlClient.score(ctx);                    // pub/sub → HTTP → rule-based (Section 8.6)
  const layers = await fraudPipeline.run(ctx);

  const signals = toSignals(ml, layers);
  const confidence = computeConfidenceScore(ml.fraud_probability, signals);
  const d = makeClaimDecision(confidence);

  const policy = await prisma.policy.findUniqueOrThrow({ where: { id: ctx.claim.policyId } });
  const payoutAmount = policy.maxPayoutPerEvent.mul(d.payoutPercentage).div(100);

  await prisma.fraudSignal.createMany({
    data: layers.map(l => ({ claimId, signalType: l.type, isSuspicious: l.suspicious,
                             score: l.score, details: l.details })),
  });
  await mongo.mlPredictionLog.insertOne({ claimId, modelVersion: ml.model_version,
    contractVersion: ml.contract_version, features: ml.features,
    fraudProbability: ml.fraud_probability, shapTopFactors: ml.shap_top_factors, ts: new Date() });

  await sm.transition(claimId, 'decided', 'system:fraud-eval', {
    patch: { confidenceScore: confidence, fraudProbability: ml.fraud_probability,
             payoutPercentage: d.payoutPercentage, payoutAmount,
             approvedAmount: policy.maxPayoutPerEvent },
  });

  if (d.decision === 'hold') {
    const priority = reviewPriority(policy.maxPayoutPerEvent, confidence);
    await sm.transition(claimId, 'held', 'system:fraud-eval', {
      reason: 'Low confidence score — pending manual review',
      patch: { isFlaggedForReview: true, reviewPriority: priority,
               heldUntil: new Date(Date.now() + 24 * 3600_000) },
    });
    await releaseReservation(ctx.claim.policyId, policy.maxPayoutPerEvent);   // nothing will be paid yet
  } else {
    await sm.transition(claimId, 'payout_pending', 'system:fraud-eval');
    await releaseReservationDelta(ctx.claim.policyId, policy.maxPayoutPerEvent.minus(payoutAmount)); // partial: free the 40%
    await payoutQueue.add('pay', { claimId }, { ...defaultJobOpts, jobId: `pay:${claimId}` });
  }
  await detectZoneFraudRing(ctx.claim.triggerEventId, ctx.worker.zoneId);
}, { connection, concurrency: 20 });

module.exports = { validationQueue, fraudQueue, payoutQueue, closeQueue };
```

> `jobId` de-duplication means a retried or duplicated enqueue for the same claim is a no-op while the job exists.

### 8.4 Idempotent Payouts, Fraud-Flag Check, and the Dispute-Window Job

```javascript
// backend/src/services/claims/payoutWorker.js

new Worker('payout', async (job) => {
  const { claimId } = job.data;

  await withRedisLock(`lock:payout:${claimId}`, 60_000, async () => {
    // ---- 1. Pre-disbursement checks, under the claim row lock ----
    const claim = await prisma.$transaction(async (tx) => {
      const [row] = await tx.$queryRaw`
        SELECT * FROM claims WHERE id = ${claimId}::uuid FOR UPDATE`;
      if (row.status === 'paid' || row.status === 'closed') return null;     // already done → no-op
      if (row.status !== 'payout_pending') throw new AppError('NOT_PAYABLE', 409);

      const worker = await tx.worker.findUniqueOrThrow({ where: { id: row.worker_id } });
      const ringFlag = await redis.get(`zone:fraud_ring:${worker.zoneId}`);
      const lowConfidenceInRing = ringFlag && Number(row.confidence_score) < 0.65;

      // FRAUD-FLAG CHECKS before any money moves
      if (row.is_flagged_for_review || worker.status !== 'active' || lowConfidenceInRing) {
        await sm.transition(claimId, 'held', 'system:payout-guard',
          { reason: 'Fraud flag raised before disbursement', tx });
        return null;
      }
      return row;
    });
    if (!claim) return;

    // ---- 2. One payout row per claim (UNIQUE claim_id + UNIQUE idempotency_key) ----
    const idemKey = `payout:${claimId}`;
    const payout = await prisma.payout.upsert({
      where: { idempotencyKey: idemKey },
      create: { tenantId: claim.tenant_id, claimId, workerId: claim.worker_id,
                amount: claim.payout_amount, idempotencyKey: idemKey, status: 'initiated',
                initiatedAt: new Date() },
      update: {},
    });
    if (payout.status === 'completed') return;                               // idempotent replay

    // ---- 3. Bank transfer — the bank API ALSO receives the idempotency key ----
    const worker = await prisma.worker.findUniqueOrThrow({ where: { id: claim.worker_id } });
    const bank = await bankClient.transfer({
      idempotencyKey: idemKey,
      account: decrypt(worker.bankAccountNumber), ifsc: decrypt(worker.bankIfscCode),
      amount: payout.amount, reference: payout.id,
    });

    // ---- 4. Persist outcome + transition atomically ----
    await prisma.$transaction(async (tx) => {
      await tx.payout.update({ where: { id: payout.id }, data: {
        status: bank.success ? 'completed' : 'failed',
        bankReferenceNumber: bank.referenceNumber, completedAt: new Date(),
        failureReason: bank.error ?? null } });

      if (bank.success) {
        const windowEnds = new Date(Date.now() + 2 * 3600_000);              // 2-hour dispute window
        await sm.transition(claimId, 'paid', 'system:payout', { tx, patch: {
          payoutStatus: 'completed', payoutCompletedAt: new Date(), disputeWindowEndsAt: windowEnds } });
      } else {
        await sm.transition(claimId, 'payout_failed', 'system:payout',
          { tx, reason: bank.error });
      }
    });

    // ---- 5. Schedule the delayed close job (deduplicated by jobId) ----
    if (bank.success) {
      await closeQueue.add('close', { claimId },
        { delay: 2 * 3600_000, jobId: `close:${claimId}`, attempts: 5,
          backoff: { type: 'exponential', delay: 10_000 } });
    }
  });
}, { connection, concurrency: 10 });
```

**Crash safety.** If the process dies after the bank call succeeds but before step 4, the retried job re-enters step 3 with the *same* idempotency key; the bank returns the original result instead of paying twice.

```javascript
// backend/src/services/claims/closeWorker.js  — delayed job: paid → closed

new Worker('close-claim', async (job) => {
  const { claimId } = job.data;
  await withRedisLock(`lock:claim:${claimId}`, 15_000, async () => {
    await prisma.$transaction(async (tx) => {
      const [row] = await tx.$queryRaw`
        SELECT status, policy_id, payout_amount, dispute_window_ends_at
        FROM claims WHERE id = ${claimId}::uuid FOR UPDATE`;

      if (row.status !== 'paid') return;                                      // disputed / already closed → no-op
      if (new Date() < row.dispute_window_ends_at) {                          // fired early → re-delay
        await closeQueue.add('close', { claimId },
          { delay: row.dispute_window_ends_at.getTime() - Date.now(), jobId: `close:${claimId}:retry` });
        return;
      }
      // Settle: reserved → settled on the policy
      await tx.$executeRaw`
        UPDATE policies SET reserved_amount = reserved_amount - ${row.payout_amount},
                            settled_amount  = settled_amount  + ${row.payout_amount}
        WHERE id = ${row.policy_id}::uuid`;
      await sm.transition(claimId, 'closed', 'system:close-window',
        { tx, patch: { closedAt: new Date() } });
    });
  });
}, { connection });
```

A **safety-net sweeper** (repeatable BullMQ job, every 10 min) selects `status = 'paid' AND dispute_window_ends_at < now()` using `idx_claims_dispute_window` and enqueues any missed close jobs, so a Redis flush cannot strand claims.

### 8.5 Admin Review Queue (Priority Queue)

Held claims are served highest-priority first. Priority rises with the amount at stake and with how close the confidence score is to the approval boundary (cases most likely to be false positives):

```javascript
function reviewPriority(amount, confidence) {
  const amountScore = Math.min(amount.toNumber() / 500, 1) * 50;              // up to 50
  const borderlineScore = (1 - Math.abs(0.40 - confidence) / 0.40) * 50;      // up to 50
  return Math.round(amountScore + Math.max(borderlineScore, 0));
}

module.exports = { reviewPriority };
```

`GET /admin/claims/queue` reads `idx_claims_review_queue` (`review_priority DESC, created_at ASC`) — a priority queue backed by an index. The 24-hour hold SLA is enforced by a repeatable job that bumps priority as `held_until` approaches.

### 8.6 ML Client: Pub/Sub → HTTP → Rule-Based

```javascript
// backend/src/services/claims/mlClient.js

class MlClient {
  pending = new Map();

  constructor(sub, pub) {
    this.sub = sub;
    this.pub = pub;
    sub.subscribe('ml:fraud:result');
    sub.on('message', (_ch, raw) => {
      const res = JSON.parse(raw);
      this.pending.get(res.correlation_id)?.(res);
    });
  }

  async score(ctx) {
    const correlationId = randomUUID();
    const payload = { contract_version: '1.0', correlation_id: correlationId, ...toContract(ctx) };

    const viaPubSub = new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(correlationId); reject(new Error('ML_TIMEOUT')); }, 3000);
      this.pending.set(correlationId, (r) => { clearTimeout(timer); this.pending.delete(correlationId); resolve(r); });
    });
    await this.pub.publish('ml:fraud:request', JSON.stringify(payload));

    try { return await viaPubSub; }
    catch { return mlBreaker.fire(payload); }              // HTTP /infer via circuit breaker → rule-based fallback
  }
}
```

### 8.7 Double-Payout Prevention (Defense in Depth)

Five independent layers make a second payout for the same claim impossible, even under concurrent retries:

1. **Database constraint:** `UNIQUE(worker_id, trigger_event_id)` on `claims` — a duplicate insert throws.
2. **Idempotency key:** `worker_id:trigger_event_id` on claims, and `payout:{claim_id}` on payouts (`UNIQUE`), also forwarded to the bank API.
3. **Payout row uniqueness:** `payouts.claim_id UNIQUE` — at most one payout record per claim.
4. **Distributed lock + row lock:** Redis `SET NX PX` lock (`lock:payout:{claim_id}`) serialises workers across processes; PostgreSQL `SELECT … FOR UPDATE` serialises the state transition; the state machine rejects `paid → payout_pending`.
5. **Nightly reconciliation:** a job joins `payouts` (`completed`) with `claims`, flags mismatches (a payout with no `paid`/`closed` claim, or the reverse) for manual review.

### 8.8 Redis Distributed Lock Helper

```javascript
// backend/src/utils/lock.js

const RELEASE_LUA = `
  if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("del", KEYS[1]) else return 0 end`;

async function withRedisLock(key, ttlMs, fn) {
  const token = randomUUID();
  const acquired = await redis.set(key, token, 'PX', ttlMs, 'NX');
  if (!acquired) return undefined;                          // another worker holds it — skip (BullMQ will retry if needed)
  try {
    return await fn();
  } finally {
    await redis.eval(RELEASE_LUA, 1, key, token);           // only the owner can release
  }
}

module.exports = { withRedisLock };
```

> The Redis lock is a **performance and coordination optimisation**; correctness never depends on it alone. If the lock expires mid-job, the PostgreSQL row lock, unique constraints, and the idempotent bank call still prevent a double payout.

---

## 9. Trigger Evaluation System

### 9.1 Weather Trigger Polling

Polling runs as a **repeatable BullMQ job** (every 30 minutes), not a bare `setInterval`, so it survives restarts and never runs twice concurrently.

```javascript
// backend/src/services/trigger/triggerService.js

const TRIGGER_THRESHOLDS = {
  rainfall: { field: 'rain_1h',    threshold: 30,  unit: 'mm/hr', minDurationMin: 45 },
  heat:     { field: 'feels_like', threshold: 43,  unit: '°C',    minDurationMin: 60 },
  aqi:      { field: 'aqi',        threshold: 300, unit: 'AQI',   minDurationMin: 90 },
} ;

await triggerQueue.add('poll-weather', {}, { repeat: { every: 30 * 60 * 1000 }, jobId: 'poll-weather' });

async function pollWeatherForZone(zoneId) {
  // Zone weather is cache-aside with a 10-minute TTL (Section 11)
  const weather = await cached(`weather:${zoneId}`, 600, async () => {
    const [lat, lon] = await getZoneCoordinates(zoneId);
    const res = await axios.get('https://api.openweathermap.org/data/2.5/weather', {
      params: { lat, lon, appid: env.OWM_API_KEY, units: 'metric' },
    });
    await mongo.providerPayloads.insertOne({ provider: 'openweathermap', zoneId, payload: res.data, fetchedAt: new Date() });
    return res.data;
  });

  for (const [type, cfg] of Object.entries(TRIGGER_THRESHOLDS)) {
    const actual = extractValue(weather, cfg.field);
    if (actual >= cfg.threshold) await evaluateAndFireTrigger(type , zoneId, actual, cfg, null);
  }
}

async function evaluateAndFireTrigger(
  type, zoneId, actual, cfg, tenantId
) {
  const detectedAt = new Date();
  const announceAt = new Date(detectedAt.getTime() + 8 * 60 * 1000);

  try {
    // The partial unique index uq_active_trigger_per_zone makes this race-free:
    // two pollers detecting the same storm → exactly one row is created.
    const trigger = await prisma.triggerEvent.create({ data: {
      triggerType: type, zoneId, tenantId, actualValue: actual, thresholdValue: cfg.threshold,
      severity: actual >= cfg.threshold * 1.5 ? 'high' : 'medium',
      detectedAt, announcedAt: announceAt, status: 'active', dataSource: 'openweathermap',
    }});

    await snapshotPresence(trigger);                       // T=0 silent snapshot (Layer F)

    // Delayed BullMQ job replaces v2.0's setTimeout — survives restarts and deploys
    await triggerQueue.add('announce-trigger', { triggerId: trigger.id },
      { delay: 8 * 60 * 1000, jobId: `announce:${trigger.id}` });
  } catch (e) {
    if (isUniqueViolation(e)) return;                      // already active for this zone/type
    throw e;
  }
}

new Worker('trigger', async (job) => {
  if (job.name === 'announce-trigger') {
    const trigger = await prisma.triggerEvent.findUniqueOrThrow({ where: { id: job.data.triggerId } });
    await redis.setex(`trigger:active:${trigger.zoneId}`, 300, JSON.stringify(trigger));   // write-through cache
    await redis.publish('evt:trigger.announced', JSON.stringify(trigger));                 // → SSE hub → clients
  }
  if (job.name === 'poll-weather') { /* iterate active zones */ }
}, { connection });

module.exports = { pollWeatherForZone, evaluateAndFireTrigger };
```

`snapshotPresence` records which workers were in the zone at T=0 (from `gps_pings` and recent QR check-ins) so Layer F compares against a snapshot taken **before** anyone could know a trigger existed.

### 9.2 Dark Store Outage Detection (Q-Commerce Exclusive)

```javascript
// Repeatable BullMQ job — every 5 minutes, per tenant

async function checkDarkStoreHealth(tenantId, darkStoreId, zoneId) {
  const currentVolume = await mockPlatformAPI.getOrderVolume(tenantId, darkStoreId, '90min');
  const historicalAvg = await getHistoricalOrderVolume(darkStoreId);

  const dropPercentage = 1 - currentVolume / historicalAvg;

  if (dropPercentage >= 0.75) {
    // Order volume dropped > 75% for 90+ minutes — tenant-scoped trigger
    await evaluateAndFireTrigger('platform_outage', zoneId, dropPercentage * 100,
      { threshold: 75, unit: '%_volume_drop', minDurationMin: 90 }, tenantId);
  }
}

module.exports = { checkDarkStoreHealth };
```

### 9.3 Pre-Alert System

```javascript
// Repeatable BullMQ job — every 3 hours

async function pollWeatherForecast() {
  const zones = await prisma.worker.findMany({ distinct: ['zoneId'], select: { zoneId: true } });

  for (const { zoneId } of zones) {
    const [lat, lon] = await getZoneCoordinates(zoneId);
    const forecast = await cached(`forecast:${zoneId}`, 3 * 3600, async () =>
      (await axios.get('https://api.openweathermap.org/data/2.5/forecast', {
        params: { lat, lon, appid: env.OWM_API_KEY, units: 'metric', cnt: 16 },   // ~48 hrs
      })).data);

    for (const p of analyzeForecastForTriggers(forecast)) {
      if (p.probability < 0.65) continue;

      const holders = await prisma.worker.findMany({
        where: { zoneId, policies: { some: { isActive: true } } },
        select: { id: true, tenantId: true, phoneNumber: true },
      });
      await notificationQueue.addBulk(holders.map(w => ({
        name: 'pre_alert',
        data: { workerId: w.id, tenantId: w.tenantId, type: 'pre_alert',
          message: `${p.type} forecast in your zone ${p.window}. You're covered. ` +
                   `Estimated protection: ₹${p.estimatedPayoutMin}–₹${p.estimatedPayoutMax}.` },
        opts: { jobId: `prealert:${w.id}:${p.type}:${p.windowStart}` },           // no duplicate alerts
      })));
    }
  }
}

module.exports = { pollWeatherForecast };
```

---
## 10. Authentication, Authorization & Multi-Tenancy

### 10.1 JWT Access Tokens + Refresh Sessions

Access tokens are short-lived (15 minutes) and carry `worker_id`, `tenant_id`, and `role`. Refresh tokens are opaque, stored in Redis, and rotated on use, so a session can be revoked instantly.

```javascript
// backend/src/middleware/auth.js

const jwt = require('jsonwebtoken');

function authMiddleware(req, _res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) throw new AppError('UNAUTHORIZED', 401, 'Missing or invalid auth token');

  try {
    req.auth = jwt.verify(header.slice(7), env.JWT_SECRET) ;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') throw new AppError('TOKEN_EXPIRED', 401);
    throw new AppError('INVALID_TOKEN', 401);
  }
}

const requireRole = (...roles) =>
  (req, _res, next) => {
    if (!roles.includes(req.auth.role)) throw new AppError('FORBIDDEN', 403);
    next();
  };

function issueTokens(c) {
  const access = jwt.sign(c, env.JWT_SECRET, { expiresIn: '15m' });
  const refresh = randomBytes(32).toString('hex');
  return redis.setex(`session:refresh:${refresh}`, 7 * 86400, JSON.stringify(c)).then(() => ({ access, refresh }));
}

module.exports = { authMiddleware, requireRole, issueTokens };
```

### 10.2 OAuth 2.0 / OIDC

**(a) Worker ↔ platform account linking (Authorization Code + PKCE).** Each tenant is its own OAuth client config (`tenants.oauth_issuer`, `oauth_client_id`). In development a mock platform OAuth provider stands in.
```
Worker app → GET /auth/platform/blinkit/authorize
   → server generates state + PKCE code_verifier (stored in Redis, 10 min TTL)
   → 302 to tenant's authorization endpoint
Platform → redirects back to /callback?code=…&state=…
   → server verifies state, exchanges code (with code_verifier), validates ID token
   → asserts ID token's platform_worker_id == worker.platform_worker_id AND tenant matches
   → stores platform_oauth_subject, platform_verified_at
```

**(b) Admin console SSO (Google OIDC) with domain-scoped authorization.**

```javascript
// backend/src/auth/adminSso.js

async function handleAdminCallback(idToken, tenantSlug) {
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { slug: tenantSlug } });
  const emailDomain = idToken.email.split('@')[1].toLowerCase();

  // Domain-scoped authorization: only the tenant's allow-listed domains may sign in as its admin.
  // `hd` (hosted domain) must match the email domain — blocks cross-domain impersonation.
  if (!idToken.email_verified
      || idToken.hd?.toLowerCase() !== emailDomain
      || !tenant.allowedAdminDomains.includes(emailDomain)) {
    await audit('admin.login.denied', { email: idToken.email, tenant: tenantSlug });
    throw new AppError('DOMAIN_NOT_ALLOWED', 403);
  }

  const admin = await prisma.adminUser.findUnique({ where: { email: idToken.email } });
  if (!admin || admin.tenantId !== tenant.id) throw new AppError('ADMIN_NOT_REGISTERED', 403);

  return issueTokens({ sub: admin.id, tenant_id: tenant.id, role: admin.role });
}

module.exports = { handleAdminCallback };
```

### 10.3 Encryption for PII

```javascript
// backend/src/utils/encryption.js

const crypto = require('crypto');
const ALGORITHM = 'aes-256-gcm';                         // authenticated encryption (upgrade from v2.0's CBC)
const KEY = Buffer.from(env.ENCRYPTION_KEY, 'hex');      // 32 bytes

function encrypt(plaintext) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, KEY, iv);
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return [iv.toString('hex'), cipher.getAuthTag().toString('hex'), enc.toString('hex')].join(':');
}

function decrypt(ciphertext) {
  const [ivHex, tagHex, encHex] = ciphertext.split(':');
  const decipher = crypto.createDecipheriv(ALGORITHM, KEY, Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  return Buffer.concat([decipher.update(Buffer.from(encHex, 'hex')), decipher.final()]).toString('utf8');
}

module.exports = { encrypt, decrypt };
```

**Fields encrypted before DB insert:** Aadhaar number, PAN number, bank account number, bank IFSC, account holder name.

### 10.4 Tenant Isolation (Multi-Tenancy Enforcement)

**Layer 1 — Tenant from the token only.** `tenant_id` is read from the verified JWT. Request bodies and query strings can never override it.

**Layer 2 — Tenant-scoped Prisma client.** Every data access goes through `forTenant(tenantId)`, a Prisma client extension that injects the tenant filter into reads/updates/deletes and the tenant ID into creates for all tenant-owned models:

```javascript
// backend/src/db/tenantClient.js

const TENANT_MODELS = new Set(['Worker', 'Policy', 'Claim', 'Payout', 'DarkStore']);

const forTenant = (tenantId) =>
  prisma.$extends({
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          if (!TENANT_MODELS.has(model)) return query(args);
          const a = args ;
          if (['create', 'createMany'].includes(operation)) {
            a.data = Array.isArray(a.data) ? a.data.map((d) => ({ ...d, tenantId }))
                                           : { ...a.data, tenantId };
          } else {
            a.where = { ...a.where, tenantId };
          }
          return query(a);
        },
      },
    },
  });

module.exports = { forTenant };
```

**Layer 3 — PostgreSQL Row-Level Security (defense in depth).** Even a missed filter cannot leak rows:

```sql
ALTER TABLE claims ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON claims
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
-- Same pattern for workers, policies, payouts. The service connects as a non-owner role,
-- and each request's transaction runs: SELECT set_config('app.tenant_id', $1, true);
```

**Cross-tenant attempts** (e.g., a Zepto admin requesting a Blinkit claim ID) return `404`, not `403`, so IDs cannot be probed, and an `audit_events` document is written.

**Cache and stream isolation:** every Redis cache key and SSE channel that holds tenant data is prefixed `t:{tenantId}:` (Sections 11 and 12).

### 10.5 Security Checklist

- Passwords: bcrypt with salt rounds = 12
- Access tokens 15 min; refresh tokens rotated and revocable (Redis)
- Rate limiting: 1000 req/min per user (express-rate-limit + Redis store); stricter on `/auth/*` and `/checkin/qr`
- CORS: whitelist frontend origin only
- Input validation: Joi schema on every request body
- SQL injection: Prisma parameterised queries; `$queryRaw` only via tagged templates (never string concatenation)
- Secrets: all in `.env` — never committed
- QR check-ins: HMAC-signed, 5-minute rotation, nonce replay protection, geofence check
- Logs: never log PII, tokens, or passwords

---

## 11. Caching Strategy

Caching is the one piece of infrastructure in scope for this phase, so it is specified in depth.

### 11.1 What Is (and Is Not) Cached

| Cache layer | Key | Value | TTL | Pattern |
|---|---|---|---|---|
| Session / refresh | `session:refresh:{token}` | claims JSON | 7 days | Write on login, delete on logout/rotation |
| Policy | `t:{tenant}:policy:{id}` | tier, coverage, limits, status | 1 hour | Cache-aside, invalidate on update |
| Worker's policies | `t:{tenant}:policies:worker:{id}` | list | 1 hour | Cache-aside, invalidate on buy/cancel |
| Tier info | `tiers:v1` | static tiers JSON | 24 hours | Cache-aside |
| Active trigger | `trigger:active:{zone}` | trigger JSON | 5 minutes | **Write-through** on announce |
| Zone weather | `weather:{zone}` | weather snapshot | 10 minutes | Cache-aside (protects OpenWeatherMap quota) |
| Forecast | `forecast:{zone}` | forecast JSON | 3 hours | Cache-aside |
| Zone worker count | `zone:workers:{zone}` | integer | 5 minutes | Cache-aside |
| Zone fraud-ring flag | `zone:fraud_ring:{zone}` | `"1"` | 1 hour | Set by detector, auto-expires |
| Rate limiting | `ratelimit:{user}:{endpoint}` | counter | 1 minute | Atomic `INCR` |

**Never cached:** claim status, state transitions, payouts, or coverage balances (`reserved_amount`, `settled_amount`). Money and state are always read from PostgreSQL; a stale cache there would cause wrong decisions.

### 11.2 Cache-Aside Helper with Stampede Protection

```javascript
// backend/src/cache/cached.js

const inflight = new Map();      // in-process single-flight

async function cached(key, ttlSec, loader) {
  const hit = await redis.get(key);
  if (hit !== null) { metrics.cacheHits.inc({ layer: keyPrefix(key) }); return JSON.parse(hit) ; }
  metrics.cacheMisses.inc({ layer: keyPrefix(key) });

  // Single-flight: concurrent misses in this process share one loader call
  if (inflight.has(key)) return inflight.get(key) ;

  const p = (async () => {
    // Cross-process stampede guard: only one process refills; others briefly wait and re-read
    const gotLock = await redis.set(`lock:fill:${key}`, '1', 'PX', 5000, 'NX');
    if (!gotLock) {
      await sleep(75);
      const retry = await redis.get(key);
      if (retry !== null) return JSON.parse(retry) ;
    }
    try {
      const value = await loader();
      // TTL jitter (±10%) so keys created together don't all expire together
      const jitter = Math.round(ttlSec * (0.9 + Math.random() * 0.2));
      // Negative caching: store `null` briefly so repeated lookups of missing rows don't hit the DB
      await redis.set(key, JSON.stringify(value ?? null), 'EX', value == null ? 30 : jitter);
      return value;
    } finally {
      await redis.del(`lock:fill:${key}`);
      inflight.delete(key);
    }
  })();

  inflight.set(key, p);
  return p;
}

module.exports = { cached };
```

### 11.3 Invalidation

```javascript
// Policy update: write to DB first, then delete (never update) the cache entries
async function updatePolicy(tenantId, policyId, data) {
  const policy = await forTenant(tenantId).policy.update({ where: { id: policyId }, data });
  await redis.del(`t:${tenantId}:policy:${policyId}`, `t:${tenantId}:policies:worker:${policy.workerId}`);
  await redis.publish('evt:cache.invalidate', JSON.stringify({ keys: [`t:${tenantId}:policy:${policyId}`] }));
  return policy;
}
```

`evt:cache.invalidate` lets any in-process caches in other service instances drop their copies. Trigger cache is **write-through**: the `announce-trigger` job writes the row to PostgreSQL and then `SETEX`es the cache entry, so claim validation reads a warm key. When a trigger resolves, the key is deleted.

### 11.4 Cache Observability

`kavach_cache_hits_total{layer}` and `kavach_cache_misses_total{layer}` feed the **≥ 85% hit-ratio** target in Section 1.3. If the ratio drops, the first suspects are TTLs that are too short or a missing invalidation causing churn.

---

## 12. Event-Driven Architecture & Real-Time Updates

### 12.1 BullMQ Queue Configuration

```javascript
// backend/src/config/queues.js

const { Queue, QueueEvents, } = require('bullmq');

const connection = { host: env.REDIS_HOST, port: Number(env.REDIS_PORT) };

const queues = {
  claimValidate: new Queue('claim-validate', { connection }),
  fraudEval:     new Queue('fraud-eval', { connection }),
  payout:        new Queue('payout', { connection }),
  closeClaim:    new Queue('close-claim', { connection }),   // delayed: 2h dispute window
  trigger:       new Queue('trigger', { connection }),       // repeatable polls + delayed T+8 announce
  notifications: new Queue('notifications', { connection }),
  policyRenew:   new Queue('policy-renew', { connection }),  // delayed: end_date − 24h
};

// Failed-job handling: after the final attempt, alert admins and keep the job for inspection
for (const [name, q] of Object.entries(queues)) {
  new QueueEvents(q.name, { connection }).on('failed', async ({ jobId, failedReason }) => {
    const job = await q.getJob(jobId);
    logger.error(`Queue ${name} job ${jobId} failed: ${failedReason}`);
    if (job && job.attemptsMade >= (job.opts.attempts ?? 1)) {
      await redis.publish('evt:admin.alert', JSON.stringify({ queue: name, jobId, failedReason }));
    }
  });
}

module.exports = { queues };
```

### 12.2 Event Flow Summary
```
BullMQ (durable — must not be lost)
  claim.filed         → claim-validate → fraud-eval → payout → (delayed 2h) close-claim
  trigger.detected    → (delayed 8 min) announce-trigger
  policy.created      → (delayed to end_date − 24h) policy-renew
  forecast.alert      → notifications queue → worker push/SMS

Redis pub/sub (fire-and-forget — notifications of facts already persisted)
  evt:claim.state_changed     → SSE hub → claim tracker, worker feed, admin feed
  evt:trigger.announced       → SSE hub → worker feeds in the zone; claim window opens
  evt:fraud.ring_suspected    → SSE hub → admin feed
  evt:cache.invalidate        → all services drop local cache copies
  evt:admin.alert             → SSE hub → admin feed
  ml:fraud:request / result   → Node ↔ FastAPI fraud scoring (HTTP fallback on timeout)
```

### 12.3 Server-Sent Events Hub (Replaces Polling)

v2.0's dashboard polled the API for claim status. The SSE hub pushes changes the instant they happen, cutting database and gateway load, and each connection is cleaned up deterministically so idle or dropped clients cannot leak memory.

```javascript
// backend/src/gateway/sseHub.js

const HEARTBEAT_MS = 25_000;
const MAX_CONNECTIONS_PER_USER = 3;

class SseHub {
  channels = new Map();        // channel key → clients
  perUser = new Map();

  subscribe(channel, userId, req, res) {
    if ((this.perUser.get(userId) ?? 0) >= MAX_CONNECTIONS_PER_USER) {
      throw new AppError('TOO_MANY_STREAMS', 429);
    }

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.write('retry: 3000\n\n');                           // client reconnect delay

    const client = {
      res, userId,
      heartbeat: setInterval(() => res.write(': heartbeat\n\n'), HEARTBEAT_MS),
    };

    if (!this.channels.has(channel)) this.channels.set(channel, new Set());
    this.channels.get(channel).add(client);
    this.perUser.set(userId, (this.perUser.get(userId) ?? 0) + 1);
    metrics.sseConnections.inc();

    // ---- CLEANUP: runs exactly once, whichever way the connection ends ----
    let cleaned = false;
    const cleanup = () => {
      if (cleaned) return;
      cleaned = true;
      clearInterval(client.heartbeat);                      // stops the timer holding the closure alive
      const set = this.channels.get(channel);
      set?.delete(client);
      if (set && set.size === 0) this.channels.delete(channel);   // no empty Sets left behind
      const n = (this.perUser.get(userId) ?? 1) - 1;
      n <= 0 ? this.perUser.delete(userId) : this.perUser.set(userId, n);
      metrics.sseConnections.dec();
    };
    req.on('close', cleanup);                               // client disconnect / navigation
    res.on('error', cleanup);                               // broken pipe
    res.on('close', cleanup);
  }

  publish(channel, event, data) {
    const set = this.channels.get(channel);
    if (!set) return;
    const frame = `event: ${event}\nid: ${Date.now()}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const c of set) {
      if (!c.res.write(frame)) { /* backpressure: socket buffer full — drop; client will resync on reconnect */ }
    }
  }

  closeAll() {                                              // graceful shutdown (SIGTERM)
    for (const set of this.channels.values()) for (const c of set) c.res.end();
  }
}

module.exports = { SseHub };
```

**Wiring: one Redis subscriber per gateway process fans out to local clients.** Channels are tenant-scoped so a tenant can never receive another tenant's events:

```javascript
// backend/src/gateway/streams.js

const sub = redis.duplicate();                               // dedicated subscriber connection
await sub.subscribe('evt:claim.state_changed', 'evt:trigger.announced',
                    'evt:fraud.ring_suspected', 'evt:admin.alert');

sub.on('message', (ch, raw) => {
  const e = JSON.parse(raw);
  switch (ch) {
    case 'evt:claim.state_changed':
      hub.publish(`t:${e.tenantId}:claim:${e.claimId}`, 'claim.state_changed', e);
      hub.publish(`t:${e.tenantId}:worker:${e.workerId}`, 'claim.state_changed', e);
      if (e.to === 'held') hub.publish(`t:${e.tenantId}:admin`, 'claim.held', e);
      break;
    case 'evt:trigger.announced':
      hub.publish(`zone:${e.zoneId}`, 'trigger.announced', e);       // workers join their zone channel
      break;
    case 'evt:fraud.ring_suspected':
      hub.publish(`t:${e.tenantId}:admin`, 'fraud.ring_suspected', e);
      break;
  }
});

router.get('/stream/claims/:id', authMiddleware, async (req, res) => {
  const claim = await forTenant(req.auth.tenant_id).claim.findFirst({
    where: { id: req.params.id, ...(req.auth.role === 'worker' && { workerId: req.auth.sub }) },
  });
  if (!claim) throw new AppError('CLAIM_NOT_FOUND', 404);                // not 403 — no ID probing
  hub.subscribe(`t:${req.auth.tenant_id}:claim:${claim.id}`, req.auth.sub, req, res);
});
```

Because every gateway instance subscribes to Redis, SSE works behind multiple gateway processes without sticky sessions. Reconnection after a gap: the client calls `GET /claims/:id/status` on `EventSource.onopen` to re-sync.

### 12.4 Policy Auto-Renew (Delayed Job)

When a policy is bought with `auto_renew = true`, the Policy Service enqueues a `policy-renew` job with `delay = end_date − 24h − now` and `jobId = renew:{policyId}`. The worker re-checks the policy is still active and the worker is in good standing, creates the next week's policy, and sends a notification. Cancelling the policy removes the job by `jobId`.

---
## 13. Frontend

> **Purpose:** A React (JavaScript/JSX) + Tailwind CSS client that demonstrates the full flow end-to-end and showcases real-time updates: **Register → Link platform → Buy policy → Trigger announced (live) → Claim → Watch the state machine progress (live) → Payout → Dispute window**. Visual polish beyond Tailwind utility styling is not a goal.

### 13.1 Pages

| Page | Route | Purpose |
|---|---|---|
| Register / Login | `/` `/login` | Phone + password; "Link {platform} account" OAuth button |
| Dashboard | `/dashboard` | Active policy, live zone-trigger status (SSE), recent claims |
| Buy Policy | `/policies/buy` | Tier selection + purchase |
| Claim Tracker | `/claims/:id` | **Live** state-machine timeline (SSE), payout status, 2-hour dispute countdown + "Dispute" button |
| QR Check-In | `/checkin` | Camera-based QR scan for dark-store check-in |
| Admin: Review Queue | `/admin/queue` | Held claims by priority, approve/deny with notes, live ring alerts |
| Admin: Tenant Analytics | `/admin/analytics` | Claims, payouts, fraud rate for the admin's own tenant |

### 13.2 API + SSE Integration Layer

```javascript
// frontend/src/services/api.js

export const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000/api/v1';

async function request(method, path, body) {
  const token = sessionStorage.getItem('kavach_access');
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token && { Authorization: `Bearer ${token}` }) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json();
  if (!json.success) throw new Error(json.error?.message ?? 'Request failed');
  return json.data ;
}

export const api = {
  register:         (b)  => request('POST', '/auth/register', b),
  login:            (b)     => request('POST', '/auth/login', b),
  getTiers:         ()                 => request('GET', '/policies/tiers'),
  buyPolicy:        (b) => request('POST', '/policies', b),
  getPolicies:      ()                 => request('GET', '/policies'),
  getActiveTriggers:()                 => request('GET', '/triggers/active'),
  fileClaim:        (b) => request('POST', '/claims', b),
  getClaim:         (id)       => request('GET', `/claims/${id}`),
  disputeClaim:     (id, reason) => request('POST', `/claims/${id}/dispute`, { reason }),
  qrCheckIn:        (b) => request('POST', '/workers/me/checkin/qr', b),
};
```

```javascript
// frontend/src/hooks/useEventStream.js — SSE with reconnect + resync

import { useEffect, useRef } from 'react';
import { EventSourcePolyfill } from 'event-source-polyfill';
import { BASE_URL } from '../services/api';   // native EventSource cannot send Authorization headers

export function useEventStream(path, onEvent, onReconnect) {
  const handler = useRef(onEvent);
  handler.current = onEvent;

  useEffect(() => {
    const es = new EventSourcePolyfill(`${BASE_URL}${path}`, {
      headers: { Authorization: `Bearer ${sessionStorage.getItem('kavach_access')}` },
    });
    ['claim.state_changed', 'trigger.announced', 'claim.held', 'fraud.ring_suspected']
      .forEach(name => es.addEventListener(name, (e) => handler.current(name, JSON.parse(e.data))));
    es.onopen = () => onReconnect?.();                       // re-fetch status to close any gap
    return () => es.close();                                 // cleanup on unmount → server frees the connection
  }, [path]);
}
```

### 13.3 Claim Tracker Component

```jsx
// frontend/src/pages/ClaimTracker.jsx

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../services/api';
import { useEventStream } from '../hooks/useEventStream';
import DisputePanel from '../components/DisputePanel';

const CORE_STATES = ['filed', 'validated', 'scoring', 'decided', 'payout_pending', 'paid', 'closed'];

export default function ClaimTracker() {
  const { id } = useParams();
  const [claim, setClaim] = useState(null);

  const refresh = useCallback(() => api.getClaim(id).then(setClaim), [id]);
  useEffect(() => { refresh(); }, [refresh]);

  // Live updates: re-fetch whenever the server pushes a state change (and after any reconnect)
  useEventStream(`/stream/claims/${id}`, (name) => {
    if (name === 'claim.state_changed') refresh();
  }, refresh);

  if (!claim) return <div className="p-6 text-slate-500">Loading claim…</div>;
  const reached = new Set(claim.timeline.map((t) => t.state));

  return (
    <div className="mx-auto max-w-xl space-y-6 p-6">
      <h1 className="text-2xl font-semibold">Claim status</h1>

      <ol className="space-y-2">
        {CORE_STATES.map((s) => (
          <li
            key={s}
            className={`flex items-center gap-3 rounded-lg border p-3 ${
              reached.has(s) ? 'border-emerald-300 bg-emerald-50' : 'border-slate-200 text-slate-400'
            }`}
          >
            <span className={`h-3 w-3 rounded-full ${reached.has(s) ? 'bg-emerald-500' : 'bg-slate-300'}`} />
            <span className="capitalize">{s.replace('_', ' ')}</span>
          </li>
        ))}
      </ol>

      {['held', 'rejected', 'disputed', 'payout_failed'].includes(claim.status) && (
        <p className="rounded-lg bg-amber-50 p-3 text-amber-800">
          Status: <strong>{claim.status.replace('_', ' ')}</strong> — {claim.worker_message}
        </p>
      )}

      {claim.can_dispute && claim.dispute_window_ends_at && (
        <DisputePanel claimId={claim.claim_id} endsAt={claim.dispute_window_ends_at} onDone={refresh} />
      )}
    </div>
  );
}
```

### 13.4 Frontend Notes

- **Styling:** Tailwind CSS utility classes only; a small component set (`Card`, `StatusPill`, `Timeline`).
- **Auth storage:** access token in `sessionStorage`; refresh token via `POST /auth/refresh`.
- **Out of scope for now:** animations, PWA/mobile-app packaging, advanced charts, i18n.
- **Acceptance bar:** the full flow in the first paragraph of Section 13 can be demonstrated from a browser, and the claim timeline visibly advances **without a page refresh**.

---

## 14. Monitoring & Observability

### 14.1 Key Metrics to Track

```javascript
// backend/src/middleware/metrics.js

const client = require('prom-client');

const metrics = {
  claimsTotal:       new client.Counter({ name: 'kavach_claims_total', help: 'Claims by final state', labelNames: ['status', 'tenant'] }),
  claimLatency:      new client.Histogram({ name: 'kavach_claim_processing_ms', help: 'filed → decided', buckets: [100, 500, 1000, 2000, 5000] }),
  fraudFlagged:      new client.Counter({ name: 'kavach_claims_fraud_flagged', help: 'Held for fraud' }),
  payoutsTotal:      new client.Counter({ name: 'kavach_payouts_total', help: 'Payouts', labelNames: ['status'] }),
  payoutAmountTotal: new client.Counter({ name: 'kavach_payout_amount_inr_total', help: 'INR paid' }),
  activeTriggers:    new client.Gauge({ name: 'kavach_active_triggers', help: 'Active triggers' }),
  mlInferenceMs:     new client.Histogram({ name: 'kavach_ml_inference_ms', help: 'ML round trip', buckets: [10, 50, 100, 200] }),
  sseConnections:    new client.Gauge({ name: 'kavach_sse_connections', help: 'Open SSE connections' }),
  cacheHits:         new client.Counter({ name: 'kavach_cache_hits_total', help: 'Cache hits', labelNames: ['layer'] }),
  cacheMisses:       new client.Counter({ name: 'kavach_cache_misses_total', help: 'Cache misses', labelNames: ['layer'] }),
  lockContention:    new client.Counter({ name: 'kavach_lock_contention_total', help: 'Redis lock not acquired', labelNames: ['lock'] }),
  illegalTransitions:new client.Counter({ name: 'kavach_illegal_transitions_total', help: 'Rejected state transitions' }),
  queueDepth:        new client.Gauge({ name: 'kavach_queue_depth', help: 'Waiting + delayed jobs', labelNames: ['queue'] }),
};

module.exports = { metrics };
```

### 14.2 Logging (Winston)

```javascript
// backend/src/utils/logger.js

const winston = require('winston');

const REDACTED_FIELDS = ['password', 'aadhaar', 'pan', 'bank_account', 'token', 'refresh_token', 'qr_payload'];

const redact = winston.format((info) => {
  for (const f of REDACTED_FIELDS) if (f in info) info[f] = '[REDACTED]';
  return info;
});

const logger = winston.createLogger({
  level: env.LOG_LEVEL ?? 'info',
  format: winston.format.combine(redact(), winston.format.timestamp(), winston.format.json()),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
    new winston.transports.File({ filename: 'logs/combined.log' }),
  ],
});

module.exports = { logger };
```

Every log line carries `request_id`, and `tenant_id` where applicable.

### 14.3 Optional Dashboard

Metrics are exposed at `/metrics`. A Grafana dashboard is optional for this phase; if built, panels are: claims processed/hour, fraud flag rate (< 15% normally), claim-to-payout latency, active triggers by zone/type, ML confidence distribution, SSE connections, cache hit ratio, queue depth.

---

## 15. Local Setup, Configuration & Migrations

> **No Docker, no containerisation, no CI/CD.** All services run as plain local processes. Infrastructure dependencies are installed natively.

### 15.1 Prerequisites (Installed Locally)

| Tool | Version | Purpose |
|---|---|---|
| Node.js | 20 LTS | Gateway + backend services + frontend tooling |
| Python | 3.11 | ML service |
| PostgreSQL | 15 | System of record |
| MongoDB | 7 | Telemetry, audit, ML logs |
| Redis | 7 | Cache, pub/sub, BullMQ |

### 15.2 Starting Everything

```jsonc
// package.json (repo root, npm workspaces)
{
  "scripts": {
    "db:migrate":  "npm --workspace backend exec prisma migrate dev",
    "db:seed":     "npm --workspace backend exec prisma db seed",
    "dev:gateway": "npm --workspace backend run dev:gateway",
    "dev:worker":  "npm --workspace backend run dev:worker-service",
    "dev:policy":  "npm --workspace backend run dev:policy-service",
    "dev:trigger": "npm --workspace backend run dev:trigger-service",
    "dev:claims":  "npm --workspace backend run dev:claims-service",
    "dev:notify":  "npm --workspace backend run dev:notification-service",
    "dev:ml":      "cd ml && uvicorn inference_server:app --port 5000 --reload",
    "dev:web":     "npm --workspace frontend run dev",
    "dev": "concurrently -n gw,wrk,pol,trg,clm,ntf,ml,web \"npm:dev:gateway\" \"npm:dev:worker\" \"npm:dev:policy\" \"npm:dev:trigger\" \"npm:dev:claims\" \"npm:dev:notify\" \"npm:dev:ml\" \"npm:dev:web\"",
    "test": "npm --workspace backend test && cd ml && pytest"
  }
}
```

First-time setup: start local PostgreSQL, MongoDB, and Redis → copy `.env.example` to `.env` → `npm install` → `cd ml && pip install -r requirements.txt && python synthetic_data.py && python train.py` → `npm run db:migrate && npm run db:seed` → `npm run dev`.

### 15.3 Environment Variables

```bash
# .env.example (commit this, not .env)

# PostgreSQL (Prisma)
DATABASE_URL=postgresql://kavach_user:kavach_pass@localhost:5432/kavach

# MongoDB
MONGO_URL=mongodb://localhost:27017/kavach

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379

# Auth
JWT_SECRET=replace_with_64_char_random_string
JWT_ACCESS_EXPIRY=15m
REFRESH_TTL_DAYS=7

# Encryption (PII) — AES-256-GCM
ENCRYPTION_KEY=replace_with_64_hex_chars_32_bytes

# OAuth / OIDC
GOOGLE_OIDC_CLIENT_ID=your_google_client_id
GOOGLE_OIDC_CLIENT_SECRET=your_google_client_secret
OAUTH_REDIRECT_BASE=http://localhost:8000/api/v1/auth
MOCK_PLATFORM_OAUTH_URL=http://localhost:4010

# External APIs
OWM_API_KEY=your_openweathermap_key

# ML Service
ML_SERVICE_URL=http://localhost:5000

# Environment
NODE_ENV=development
LOG_LEVEL=info
PORT=8000
```

### 15.4 Database Migrations (Prisma)

```bash
npx prisma migrate dev --name init_tenants_workers      # create + apply a migration
# Append hand-written SQL to the generated migration.sql for what Prisma cannot express:
#   CHECK constraints, partial unique indexes, row-level security policies
npx prisma generate                                     # regenerate the client
npx prisma migrate deploy                               # apply pending migrations (non-dev)
npx prisma db seed                                      # tenants (blinkit, zepto, swiggy_instamart), admin users, dark stores, demo workers
```

Migration plan: `001_tenants_admins`, `002_workers_dark_stores`, `003_policies`, `004_trigger_events`, `005_claims_and_state_transitions`, `006_payouts_disputes_signals`, `007_rls_policies`. MongoDB indexes (TTL, 2dsphere, unique nonce) are created idempotently by `npm run db:mongo-indexes`.

---
## 16. Error Handling & Resilience

### 16.1 Centralized Error Handler

```javascript
// backend/src/middleware/errorHandler.js

class AppError extends Error {
  isOperational = true;
  constructor(code, statusCode = 500, message) {
    super(message ?? code);
    this.code = code;
    this.statusCode = statusCode;
  }
}

function errorHandler(err, req, res, _next) {
  const statusCode = err.statusCode ?? 500;
  const code = err.code ?? 'INTERNAL_ERROR';

  // Never expose stack traces or internals in production
  const message = env.NODE_ENV === 'production'
    ? (err.isOperational ? err.message : 'An unexpected error occurred')
    : err.message;

  // Operational errors (bad input, illegal transition) are warnings; bugs are errors
  if (!err.isOperational) logger.error({ code, message: err.message, stack: err.stack, path: req.path, request_id: req.id });
  else logger.warn({ code, message: err.message, path: req.path, request_id: req.id });

  if (code === 'ILLEGAL_TRANSITION') metrics.illegalTransitions.inc();

  res.status(statusCode).json({ success: false, data: null, error: { code, message }, meta: { request_id: req.id } });
}

module.exports = { AppError, errorHandler };
```

### 16.2 Circuit Breaker + Fallback Chain for the ML Service

Fallback order for fraud scoring: **(1)** Redis pub/sub → **(2)** HTTP `/infer` through a circuit breaker → **(3)** rule-based scoring. The Decision Engine works with any of the three because they all produce `fraud_probability` + signals.

```javascript
// backend/src/utils/circuitBreaker.js

const CircuitBreaker = require('opossum');
const axios = require('axios');

async function callMlHttp(payload) {
  const res = await axios.post(`${env.ML_SERVICE_URL}/infer`, payload, { timeout: 3000 });
  return res.data;
}

const mlBreaker = new CircuitBreaker(callMlHttp, {
  timeout: 3000,
  errorThresholdPercentage: 50,
  resetTimeout: 30_000,
});

// If the ML service is down, degrade gracefully to rule-based scoring.
// Claims scored this way are tagged model_version = 'rule-based-fallback' and
// lean toward 'partial' rather than 'auto_approve' (conservative by design).
mlBreaker.fallback((payload) => {
  logger.warn('ML service unavailable — using rule-based fallback');
  return ruleBasedFraudScore(payload);
});

module.exports = { mlBreaker };
```

### 16.3 Graceful Shutdown

```javascript
process.on('SIGTERM', async () => {
  hub.closeAll();                         // end SSE streams cleanly
  await Promise.all(workers.map(w => w.close()));   // BullMQ: finish in-flight jobs, take no new ones
  await prisma.$disconnect();
  await mongoose.disconnect();
  redis.disconnect();
  process.exit(0);
});
```

### 16.4 Failure Modes

| Failure | Behaviour |
|---|---|
| Redis down | Cache bypassed (reads go to Postgres); BullMQ enqueue fails → claim stays `filed`, sweeper re-enqueues on recovery; SSE paused, clients fall back to status fetch on reconnect |
| ML service down | Pub/sub timeout → breaker → rule-based fallback |
| Bank API timeout | Payout job retries with the same idempotency key; claim stays `payout_pending` |
| Bank API hard failure | Claim → `payout_failed`; retry or escalate to `held` |
| Process crash mid-payout | Retried job is a no-op or resumes safely (Section 8.4) |
| Redis flush loses delayed jobs | Sweepers re-derive the work from Postgres (`dispute_window_ends_at`, `trigger_events`) |
| MongoDB down | GPS/activity reads fail → fraud layers needing them degrade to `suspicious: unknown` and claims route to `partial`/`held` rather than auto-approve |

---

## 17. Performance Requirements

| Metric | Target | Measurement |
|---|---|---|
| API response time (p95) | < 200ms | Morgan request logging |
| Claim evaluation (end-to-end) | < 2 seconds | `kavach_claim_processing_ms` |
| Claim decision | < 5 seconds | From `filed` to `decided` timestamp |
| ML inference round trip (pub/sub) | < 100ms | `kavach_ml_inference_ms` |
| Payout initiation | < 15 minutes | Payout queue processing time |
| DB query time (p95) | < 50ms | `EXPLAIN ANALYZE` on critical queries |
| Peak throughput | 50 claims/second | Artillery load test |
| Cache hit ratio | ≥ 85% | `kavach_cache_hits_total / (hits + misses)` |
| SSE capacity | 5,000 connections / gateway process | Connection-soak script; gauge returns to 0 after disconnect |
| SSE event latency | < 500ms from commit to client | Timestamp in event vs client receipt |
| Lock contention | < 5% of acquisitions | `kavach_lock_contention_total` |
| Uptime | 99.5% | Uptime monitoring |

### 17.1 Load Test (Artillery)

Artillery is a local load-testing tool and is independent of any CI/CD pipeline.

```yaml
# tests/load/claims-load.yml

config:
  target: "http://localhost:8000"
  phases:
    - duration: 60
      arrivalRate: 10
      name: Warm up
    - duration: 120
      arrivalRate: 50
      name: Peak disruption simulation

scenarios:
  - name: File Claim
    flow:
      - post:
          url: "/api/v1/auth/login"
          json: { "phone_number": "{{ phone }}", "password": "testpass" }
          capture:
            - json: "$.data.access_token"
              as: token
      - post:
          url: "/api/v1/claims"
          headers:
            Authorization: "Bearer {{ token }}"
            Idempotency-Key: "{{ $randomString() }}"
          json:
            trigger_event_id: "{{ trigger_id }}"
            policy_id: "{{ policy_id }}"
            gps_lat: 12.934567
            gps_lng: 77.610123
```

---

## 18. Testing Strategy

### 18.1 Unit Tests

```javascript
// backend/tests/unit/decisionEngine.test.js

const { computeConfidenceScore, makeClaimDecision } = require('../../src/services/claims/decisionEngine');

describe('Decision Engine', () => {
  test('genuine worker gets auto-approved', () => {
    const score = computeConfidenceScore(0.05, {
      pre_trigger_active: 1, gps_physics_score: 0.9, delivery_history_hours: 1.5,
      registration_ip_cluster: 1, zone_claim_rate: 0.42,
    });
    expect(score).toBeGreaterThanOrEqual(0.65);
    expect(makeClaimDecision(score).decision).toBe('auto_approve');
  });

  test('fraud ring actor gets held', () => {
    const score = computeConfidenceScore(0.95, {
      pre_trigger_active: 0, gps_physics_score: 0.02, delivery_history_hours: 120,
      registration_ip_cluster: 25, zone_claim_rate: 0.88,
    });
    expect(score).toBeLessThan(0.40);
    expect(makeClaimDecision(score).decision).toBe('hold');
  });
});
```

```javascript
// backend/tests/unit/stateMachine.test.js — table-driven

const ALL = ['filed','validated','scoring','decided','payout_pending','paid','closed',
                           'held','rejected','cancelled','expired','disputed','payout_failed'];

describe('ClaimStateMachine', () => {
  test.each([
    ['filed', 'validated', true], ['filed', 'paid', false], ['paid', 'payout_pending', false],
    ['decided', 'held', true],    ['paid', 'disputed', true], ['closed', 'disputed', false],
    ['payout_failed', 'payout_pending', true], ['rejected', 'filed', false],
  ])('%s → %s allowed=%s', (from, to, ok) => {
    expect(sm.canTransition(from , to )).toBe(ok);
  });

  test('terminal states have no outgoing transitions', () => {
    for (const s of ['closed', 'rejected', 'cancelled', 'expired'] )
      for (const t of ALL) expect(sm.canTransition(s, t)).toBe(false);
  });
});
```

Other unit suites: each `FraudLayer` class in isolation (GPS physics with spoofed vs real traces, burst window, union-find clustering), `reviewPriority` ordering, `encrypt/decrypt` round-trip + tamper detection (GCM auth tag), QR signature/nonce/expiry verification, 72-hour waiting period, tenant-client injection (`forTenant` adds `tenantId` to every operation).

### 18.2 Concurrency Tests (Critical)

These prove the race conditions described in Section 8 are actually closed.

```javascript
// backend/tests/integration/concurrency.test.js

test('50 simultaneous file-claim requests create exactly one claim', async () => {
  const results = await Promise.all(Array.from({ length: 50 }, () =>
    fileClaim(tenantId, workerId, triggerId, policyId, gps)));
  expect(new Set(results.map(c => c.id)).size).toBe(1);
  expect(await prisma.claim.count({ where: { workerId, triggerEventId: triggerId } })).toBe(1);
});

test('50 simultaneous payout jobs for one claim produce exactly one payout and one bank call', async () => {
  const bankSpy = jest.spyOn(bankClient, 'transfer');
  await Promise.all(Array.from({ length: 50 }, () => runPayoutJob(claimId)));
  expect(await prisma.payout.count({ where: { claimId } })).toBe(1);
  expect(bankSpy).toHaveBeenCalledTimes(1);
});

test('concurrent claims cannot exceed the policy coverage ceiling', async () => {
  // Policy ceiling = 700, per-event max = 350, three different triggers claimed at once
  await Promise.allSettled(triggers.map(t => runValidation(claimFor(t))));
  const p = await prisma.policy.findUniqueOrThrow({ where: { id: policyId } });
  expect(p.reservedAmount.plus(p.settledAmount).lte(p.coverageCeiling)).toBe(true);
});

test('two simultaneous policy purchases yield one active policy', async () => {
  const r = await Promise.allSettled([buyPolicy(workerId, 2), buyPolicy(workerId, 2)]);
  expect(r.filter(x => x.status === 'fulfilled')).toHaveLength(1);
});

test('payout guard holds a claim flagged for review before any money moves', async () => {
  await prisma.claim.update({ where: { id: claimId }, data: { isFlaggedForReview: true } });
  await runPayoutJob(claimId);
  expect((await prisma.claim.findUniqueOrThrow({ where: { id: claimId } })).status).toBe('held');
  expect(await prisma.payout.count({ where: { claimId } })).toBe(0);
});
```

### 18.3 Integration Tests

```javascript
// backend/tests/integration/claims.test.js

describe('Claims API — End-to-End', () => {
  test('register → link platform → buy policy → trigger → claim → paid', async () => { /* … */ });

  test('claim reaches a decided state within 5 seconds', async () => {
    const res = await pollUntil(() => getStatus(claimId), s => ['payout_pending','held','paid'].includes(s), 5000);
    expect(res).toBeTruthy();
  });

  test('delayed close job moves paid → closed and settles the reservation', async () => {
    // Test mode: dispute window shortened to 1 second via env override
    await runPayoutJob(claimId);
    await sleep(1500);
    expect((await getClaim(claimId)).status).toBe('closed');
    expect((await getPolicy(policyId)).settledAmount.toNumber()).toBe(350);
  });

  test('dispute inside the window moves paid → disputed and cancels the auto-close', async () => { /* … */ });
  test('dispute after the window returns 409 DISPUTE_WINDOW_CLOSED', async () => { /* … */ });
});
```

**Tenant isolation tests** (`tenant.test.js`): a Zepto token requesting a Blinkit claim, worker, or SSE stream → `404`; an admin from a non-allow-listed email domain → `403 DOMAIN_NOT_ALLOWED`; Prisma queries with a missing tenant filter are blocked by RLS.

**SSE tests** (`sse.test.js`): open 1,000 streams, abort them all, assert `hub.channels.size === 0`, the per-user map is empty, and `kavach_sse_connections === 0` (no leaked connections or timers); heartbeat arrives within 30 s; a 4th concurrent stream for one user gets `429`.

**Caching tests** (`cache.test.js`): 100 concurrent misses on one key → loader called once (single-flight); policy update invalidates the cache; negative caching prevents repeated DB hits for missing rows.

### 18.4 ML Model Tests

```python
# ml/tests/test_model.py

import joblib
from features import FEATURES

model = joblib.load("data/models/fraud_detector_v1.pkl")
scaler = joblib.load("data/models/scaler_v1.pkl")

def _prob(sample: dict) -> float:
    return float(model.predict_proba(scaler.transform([[sample[f] for f in FEATURES]]))[0][1])

def test_genuine_claim_low_fraud_probability():
    genuine = {"gps_jitter_score": 0.85, "velocity_plausible": 0.7, "pre_trigger_active": 1,
               "delivery_history_hours": 2.0, "registration_age_days": 180,
               "registration_ip_cluster": 1, "zone_claim_rate": 0.40, "burst_flag": 0}
    assert _prob(genuine) < 0.30

def test_fraud_ring_actor_high_fraud_probability():
    fraud = {"gps_jitter_score": 0.01, "velocity_plausible": 0.0, "pre_trigger_active": 0,
             "delivery_history_hours": 150.0, "registration_age_days": 2,
             "registration_ip_cluster": 30, "zone_claim_rate": 0.92, "burst_flag": 1}
    assert _prob(fraud) > 0.80

def test_contract_version_rejected_when_major_differs():
    # FastAPI returns 422 for contract_version "2.x" against a 1.x service
    ...
```

---

## 19. GitHub Repository Structure
```
kavach/
├── README.md                    ← Product overview + local setup (no Docker)
├── ARCHITECTURE.md              ← System design, state-machine diagram, data flow
├── ML_MODEL.md                  ← Fraud detection + feature contract deep-dive
├── .env.example                 ← Environment variable template
├── package.json                 ← npm workspaces root (backend, frontend) + dev scripts
│
├── backend/
│   ├── package.json
│   ├── .eslintrc.json           ← no-undef, no-unused-vars, eqeqeq
│   ├── jest.config.js
│   │
│   ├── prisma/
│   │   ├── schema.prisma
│   │   ├── seed.js              ← tenants, admins, dark stores, demo workers
│   │   └── migrations/          ← generated + hand-written SQL (CHECKs, partial indexes, RLS)
│   │
│   ├── src/
│   │   ├── gateway/
│   │   │   ├── index.js         ← Express gateway entry point (port 8000)
│   │   │   ├── app.js           ← Express app (importable for tests)
│   │   │   ├── router.js        ← Route → service proxy mapping
│   │   │   ├── sseHub.js        ← SSE hub (heartbeat + leak-free cleanup)
│   │   │   └── streams.js       ← Redis subscriber → hub fan-out, /stream/* routes
│   │   │
│   │   ├── services/
│   │   │   ├── worker/          ← auth, profile, GPS, QR check-in, platform OAuth
│   │   │   ├── policy/          ← tiers, purchase, coverage, auto-renew job
│   │   │   ├── trigger/         ← weather poller, outage detector, announce job
│   │   │   ├── claims/
│   │   │   │   ├── index.js
│   │   │   │   ├── routes.js
│   │   │   │   ├── controller.js
│   │   │   │   ├── service.js           ← fileClaim (idempotent)
│   │   │   │   ├── stateMachine.js      ← ClaimStateMachine + transition table
│   │   │   │   ├── decisionEngine.js    ← confidence score + decision
│   │   │   │   ├── workers.js           ← BullMQ validate / fraud-eval workers
│   │   │   │   ├── payoutWorker.js      ← idempotent payout + fraud-flag guard
│   │   │   │   ├── closeWorker.js       ← delayed paid → closed
│   │   │   │   ├── mlClient.js          ← pub/sub → HTTP → rule-based
│   │   │   │   ├── reviewQueue.js       ← priority ordering
│   │   │   │   └── fraud/
│   │   │   │       ├── FraudLayer.js    ← base class + FraudPipeline
│   │   │   │       ├── layers/          ← GpsPhysics, NetworkGraph, Burst, ZoneRate, PlatformActivity, Temporal
│   │   │   │       ├── graph.js         ← BFS + union-find
│   │   │   │       └── ringDetection.js
│   │   │   └── notifications/
│   │   │
│   │   ├── db/
│   │   │   ├── prisma.js        ← Prisma client
│   │   │   ├── tenantClient.js  ← forTenant() extension
│   │   │   └── mongo.js         ← Mongoose connection + models
│   │   │
│   │   ├── cache/
│   │   │   └── cached.js        ← cache-aside + single-flight + jitter
│   │   │
│   │   ├── config/
│   │   │   ├── redis.js         ← ioredis clients (cmd, subscriber)
│   │   │   ├── queues.js        ← BullMQ queues + failure handling
│   │   │   └── env.js           ← dotenv + Joi validation
│   │   │
│   │   ├── middleware/
│   │   │   ├── auth.js          ← JWT + role guard
│   │   │   ├── tenant.js        ← tenant context + RLS set_config
│   │   │   ├── errorHandler.js
│   │   │   ├── rateLimiter.js
│   │   │   └── requestLogger.js
│   │   │
│   │   ├── auth/
│   │   │   ├── platformOAuth.js ← Authorization Code + PKCE
│   │   │   └── adminSso.js      ← Google OIDC, domain-scoped
│   │   │
│   │   └── utils/
│   │       ├── encryption.js    ← AES-256-GCM for PII
│   │       ├── lock.js          ← Redis lock helper
│   │       ├── qr.js            ← HMAC QR sign/verify
│   │       ├── geo.js           ← haversine
│   │       ├── logger.js
│   │       └── validators.js    ← Joi schemas
│   │
│   └── tests/
│       ├── unit/                ← decisionEngine, stateMachine, fraud layers, encryption, qr, tenantClient
│       ├── integration/         ← claims, policies, auth, tenant, sse, cache
│       ├── concurrency/         ← double-payout, ceiling, purchase races
│       └── load/claims-load.yml
│
├── ml/
│   ├── requirements.txt         ← fastapi, uvicorn, xgboost, scikit-learn, pandas, joblib, redis, shap
│   ├── inference_server.py      ← FastAPI app + Redis subscriber
│   ├── train.py
│   ├── synthetic_data.py
│   ├── features.py              ← feature contract extraction
│   ├── data/
│   │   ├── training_data.csv
│   │   └── models/
│   │       ├── fraud_detector_v1.pkl
│   │       └── scaler_v1.pkl
│   └── tests/test_model.py
│
├── frontend/
│   ├── package.json
│   ├── vite.config.js
│   ├── tailwind.config.js
│   └── src/
│       ├── App.jsx
│       ├── services/api.js
│       ├── hooks/useEventStream.js
│       ├── pages/               ← Login, Register, Dashboard, BuyPolicy, ClaimTracker, QrCheckIn, admin/*
│       └── components/          ← Card, StatusPill, Timeline, DisputePanel
│
└── docs/
    ├── API.md                   ← OpenAPI/Swagger export
    ├── DATABASE.md              ← Schema + index rationale + RLS
    ├── STATE_MACHINE.md         ← Claim lifecycle diagram + transition table
    └── FRAUD_DETECTION.md       ← 6-layer deep-dive
```

---

## 20. Interview Readiness Checklist

### Code Quality
- [ ] ESLint passing (`no-undef`, `no-unused-vars`, `eqeqeq`); JSDoc on shared shapes and public functions
- [ ] No `console.log` left in production paths (use Winston `logger`)
- [ ] Error messages do not expose stack traces in production mode
- [ ] All secrets in `.env`, never hardcoded, `.env` in `.gitignore`
- [ ] ESLint + Prettier passing locally (`npm run lint`)
- [ ] Meaningful commit history (no "fix", "update", "stuff")

### Testing
- [ ] Unit tests: decision engine, fraud layers, state-machine transition table
- [ ] Unit tests: 72-hour waiting period and idempotency-key logic
- [ ] **Concurrency tests:** 50 parallel claims → 1 claim; 50 parallel payout jobs → 1 payout + 1 bank call
- [ ] Concurrency test: coverage ceiling cannot be exceeded; one active policy per worker
- [ ] Integration test: register → link platform → buy policy → trigger → claim → paid → closed
- [ ] Delayed-job test: `paid → closed` after the dispute window
- [ ] Tenant isolation tests (cross-tenant = 404, wrong email domain = 403)
- [ ] SSE test: 1,000 connect/disconnect cycles leave zero leaked clients or timers
- [ ] Cache tests: single-flight, invalidation, negative caching
- [ ] ML model tests: genuine < 0.30 fraud prob, fraud actor > 0.80
- [ ] All tests passing locally (`npm test`); coverage > 70% on business logic

### API & Documentation
- [ ] Swagger UI accessible at `/api/docs`
- [ ] All core endpoints (auth, policies, triggers, claims, disputes, streams) documented with examples
- [ ] README includes local setup (no Docker): prerequisites → `.env` → migrate → `npm run dev`
- [ ] ARCHITECTURE.md and STATE_MACHINE.md with diagrams

### Performance
- [ ] Claim processing < 2 seconds (integration test timer)
- [ ] ML inference round trip < 100ms
- [ ] DB queries optimised — `EXPLAIN ANALYZE` on claims + fraud_signals joins and the review-queue index
- [ ] Load tested at 50 claims/sec (Artillery)
- [ ] Cache hit ratio ≥ 85% under load (`/metrics`)
- [ ] SSE soak test at 5,000 connections; gauge returns to 0

### Security & Multi-Tenancy
- [ ] `bcrypt` for passwords (salt rounds = 12); AES-256-GCM for PII
- [ ] Access tokens 15 min; refresh tokens rotated/revocable
- [ ] OAuth 2.0 + PKCE platform linking; Google OIDC admin SSO with domain allow-list
- [ ] Tenant ID only from JWT; `forTenant()` on every query; RLS enabled
- [ ] CORS configured to frontend origin only; rate limiting on public endpoints
- [ ] QR check-ins: HMAC-signed, rotating, replay-protected
- [ ] No sensitive data in logs

### Fraud Detection
- [ ] XGBoost model trained on ≥ 600 synthetic samples (with label noise / hard negatives)
- [ ] F1 ≥ 0.85, Precision ≥ 0.95, ROC-AUC ≥ 0.92
- [ ] All 6 fraud layers implemented as classes behind one interface
- [ ] Versioned feature contract enforced by both services
- [ ] 8-minute trigger announcement delay implemented as a delayed BullMQ job
- [ ] Zone fraud-ring detection with freeze protocol
- [ ] Honest worker guarantee: high-confidence claims process even when a ring is detected in the zone

### Business Logic
- [ ] No double payouts possible (5 layers, Section 8.7)
- [ ] Fraud-flag check runs immediately before disbursement
- [ ] 72-hour waiting period enforced on all new policies
- [ ] Trigger announced at T+8 min, silent snapshot at T=0
- [ ] Claim lifecycle follows the state machine; every transition audited
- [ ] 2-hour dispute window enforced by delayed job + sweeper
- [ ] Held claims have a 24-hour SLA, priority-ordered admin queue, and worker notification

### Local Run
- [ ] `npm run dev` starts all services from a fresh clone after the documented setup
- [ ] Migrations and seed run cleanly (`npm run db:migrate && npm run db:seed`)
- [ ] Health check endpoints respond

---

## Appendix A — Resume Traceability Matrix

| Resume item | Where it appears in this PRD |
|---|---|
| **Languages:** Java, Python, TypeScript, JavaScript, C/C++ | JavaScript (backend + frontend, §2.2), Python (ML service, §6). *Java, C/C++, and TypeScript are not used in this project; DSA and OOP skills are demonstrated in JavaScript (§7.3–7.4).* |
| **Frontend:** React, Tailwind CSS, HTML, CSS | §13 (React 18 + JSX + Tailwind, SSE-driven claim tracker) |
| **Backend:** Node.js, Express.js, FastAPI, REST APIs | §3 (gateway + services), §5 (REST API), §6 (FastAPI ML service) |
| **Data & Queues:** PostgreSQL (SQL) | §4.3 (full schema, partial indexes, constraints, RLS) |
| **Data & Queues:** MongoDB | §4.5 (GPS pings, activity events, QR check-ins, ML log, audit) |
| **Data & Queues:** Redis | §11 (caching), §12.2 (pub/sub), §7.5 (sorted-set sliding window), §8.8 (locks) |
| **Data & Queues:** BullMQ | §8.3–8.4 (pipeline + delayed close job), §9.1 (repeatable + delayed trigger jobs), §12.1 |
| **Data & Queues:** Prisma ORM | §4.4 (schema), §8 (`$transaction`, `$queryRaw … FOR UPDATE`), §10.4 (tenant extension), §15.4 |
| **Concepts:** DSA | §7.4 (graph BFS, union-find, sliding window, priority queue, haversine, hashing) |
| **Concepts:** OOPs | §7.3 (abstract `FraudLayer`, strategy + composition), §8.1 (`ClaimStateMachine`) |
| **Concepts:** Multi-Tenancy | §4.2, §10.4 (JWT tenant, Prisma extension, RLS, tenant-scoped SSE/cache) |
| **Concepts:** Server-Sent Events | §5.6, §12.3 (hub with heartbeat and cleanup), §13.2 (`useEventStream`) |
| **Concepts:** Concurrency | §8.2–8.4, §8.7–8.8 (Redis locks, row-level locks, idempotency), §18.2 (race tests) |
| **Project bullet:** OAuth-based authentication and domain-scoped authorization | §10.2 (platform OAuth + PKCE; Google OIDC admin SSO with domain allow-list) |
| **Project bullet:** race-condition elimination via Redis + PostgreSQL row-level locks | §8.4, §8.7–8.8 (double-payout and coverage-ceiling races), §18.2 |
| **Project bullet:** 7-state lifecycle with branch states (rejection, cancellation, expiry, dispute) | §8.1 (state machine and transition table) |
| **Project bullet:** QR-based handoffs | §5.2 (dark-store QR check-in), §7.1 Layer F |
| **Project bullet:** delayed BullMQ job enforcing a 2-hour dispute window before release | §8.4 (`close-claim` job), §8.1 (`paid → closed`) |
| **Project bullet:** SSE replacing polling, with cleanup so idle connections don't leak | §12.3 (hub), §18.3 (leak test) |
| **InsureGig bullet:** decoupled claims pipeline (Node API + FastAPI ML) over Redis pub/sub | §3.1, §6.1, §6.3, §8.6, §12.2 |
| **InsureGig bullet:** feature contract (GPS plausibility, claim bursts, zone claim rate, activity history) | §6.4 (versioned contract table) |
| **InsureGig bullet:** XGBoost fraud classifier flagging claims for hold/review | §6.2–6.6, §7.2, §8.3 |
| **InsureGig bullet:** idempotent payouts and fraud-flag checks before disbursement | §8.4, §8.7 |

## Appendix B — Out of Scope (For Now)

Deliberately excluded in this phase; each can be added later without changing the architecture above:

- **Docker, Docker Compose, and any containerisation** — services run as local processes (§15)
- **CI/CD pipelines** — tests are run locally with `npm test` / `pytest`
- **Cloud deployment / hosted demo URL** and infrastructure-as-code
- **Infrastructure beyond caching** — no CDN, load balancer, service mesh, or managed message broker
- Kubernetes, autoscaling, blue/green deploys
- Production KYC/Aadhaar integration, real bank rails, real FCM/Twilio (all mocked)

---

*Kavach PRD v3.0 — Built for India's 10-minute economy*  
*Guidewire DEVTrails 2026 | Backend Implementation Guide (resume-aligned revision)*
