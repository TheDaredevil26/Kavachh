# Kavach (InsureGig) — Parametric Income Insurance for Gig Workers

## Executive Summary
Kavach is an AI-powered, multi-tenant parametric income insurance platform tailored for Q-Commerce delivery workers (Zepto, Blinkit, Swiggy Instamart). It provides automated compensation for income loss during external disruptions such as intense rainfall, heatwaves, hazardous AQI, curfews, and dark-store outages.

## Architecture Highlights
- **Deterministic State Machine:** 7 core states with append-only audit trail and 2-hour dispute window.
- **6-Layer Fraud Defense:** GPS velocity physics, network device graph, sliding-window claim burst detection, zone participation anomaly, delivery reconciliation, and T=0 temporal decoupling via rotating QR check-ins.
- **Zero Double-Payout Guarantee:** Database uniqueness, idempotency keys, distributed Redis locks, and pre-disbursement fraud checks.
- **Real-Time Push:** Server-Sent Events (SSE) with heartbeat and leak-free resource cleanup.
- **Microservices Stack:** Express (Node.js 20), PostgreSQL (Prisma), MongoDB (Mongoose), Redis 7 (BullMQ + pub/sub), Python FastAPI (XGBoost), React 18 + Vite + Tailwind CSS.

## Quick Start (Local Run)
### 1. Prerequisites
- Node.js 20 LTS
- Python 3.11+
- PostgreSQL 15+ (port 5432)
- MongoDB 7+ (port 27017)
- Redis 7+ (port 6379)

### 2. Configuration
Copy `.env.example` to `.env` and verify database/redis connection strings.

### 3. Setup ML Service
```bash
cd ml
pip install -r requirements.txt
python synthetic_data.py
python train.py
```

### 4. Setup Backend & Databases
```bash
npm install
npm run db:migrate
npm run db:seed
```

### 5. Launch All Services Concurrently
```bash
npm run dev
```

### 6. Run Test Suites
```bash
npm test
```
