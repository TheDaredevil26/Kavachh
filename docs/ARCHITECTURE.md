# Kavach (InsureGig) System Architecture

## 1. Overview
Kavach is a multi-tenant parametric income insurance platform for India's Q-Commerce gig workers (Zepto, Blinkit, Swiggy Instamart). It provides automatic disruption detection and payout settlement without manual claims paperwork.

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
```

## 2. Microservices Topology
- **API Gateway (8000):** JWT auth, tenant scoping, rate-limiting, Swagger UI, SSE fan-out hub.
- **Worker Service (3001):** Worker registration, phone login, platform OAuth PKCE linkage, encrypted KYC/banking, dark store QR HMAC check-in.
- **Policy Service (3002):** Dynamic tier calculation, coverage limits, policy creation, auto-renew scheduler.
- **Trigger Service (3003):** OpenWeatherMap polling, dark store volume drop monitoring, T+8 min announcement timer, pre-alerts.
- **Claims Service (3004):** Core 7-state lifecycle machine, 6-layer fraud detection pipeline, Redis distributed locks, idempotent bank transfers, delayed 2-hour dispute window.
- **ML / Fraud Service (5000):** FastAPI + XGBoost classifier inference over Redis pub/sub and fallback HTTP `/infer`.
- **Notification Service (3005):** Consumes BullMQ `notifications` queue for multi-channel worker communication.
- **Frontend (5173):** React 18 + Vite + Tailwind CSS featuring real-time SSE live claim tracker and admin priority queue.
