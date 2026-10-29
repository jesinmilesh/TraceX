# Project TraceX — System Architecture

## 1. Architectural Overview

Project TraceX is an authorized, consent-based, auditable digital-forensics and investigation platform designed for institutional forensic labs and authorized examiners.

```
┌─────────────────────────────────┐
│     ANDROID APP (KOTLIN)        │
│  com.tracex.investigation       │
│  - Visible Foreground Service   │
│  - Fused Location Tracking      │
│  - Cryptographic Hash Gen       │
│  - Offline FIFO Retry Queue     │
└────────────────┬────────────────┘
                 │ HTTP POST (/api/v1/telemetry/ingest)
                 ▼
┌─────────────────────────────────┐      WebSocket (/ws/investigation)      ┌─────────────────────────────────┐
│     FASTAPI PYTHON BACKEND      │ ──────────────────────────────────────► │   INVESTIGATOR SOC DASHBOARD    │
│  - RBAC (Admin, Investigator)   │                                         │   - HTML5 + CSS3 + Vanilla JS   │
│  - SHA-256 Vaulting & Chaining  │ ◄────────────────────────────────────── │   - No React / Zero Framework   │
│  - Append-Only Audit Trail      │      HTTP REST API (/api/v1/*)          │   - Live Breadcrumbs & Radar    │
│  - Report Generator (HTML)      │                                         │   - SHA-256 Verification Modal  │
└────────────────┬────────────────┘                                         └─────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────┐
│      MONGODB ATLAS CLUSTER      │
│      Database: "monitor"        │
│  - users, cases, devices        │
│  - telemetry_events, evidence   │
│  - chain_of_custody, audit_logs │
└─────────────────────────────────┘
```

## 2. Core Subsystems

### A. Native Android Client (`TraceX`)
- **Package**: `com.tracex.investigation`
- **Model**: Fully transparent and consent-based. No stealth behavior, no hidden icons, no fake notifications.
- **Service**: Runs an ongoing Android Foreground Service with explicit notification: *"TraceX Forensic Telemetry Active"*.
- **Offline Resilience**: Buffers events in an internal persistent FIFO queue (`tracex_telemetry_queue.json`) when offline; automatically flushes in chronological order once connectivity is restored.
- **Boot Persistence**: If authorized collection is active, restarts upon device reboot via `BootReceiver`.

### B. Python FastAPI Backend Engine
- **Framework**: FastAPI + Motor (Async MongoDB) + Pydantic v2 + Uvicorn.
- **Database**: Targeted strictly to MongoDB database `monitor`.
- **Integrity**: Every telemetry packet and uploaded file is cryptographically hashed with SHA-256 upon arrival.
- **Audit Logging**: Every action across authentication, case management, telemetry, and vault operations is appended to `audit_logs`.

### C. Investigator SOC Dashboard
- **Technology**: Pure HTML5, CSS3, and ES6 JavaScript Modules.
- **Strict Compliance**: Zero React, zero ReactDOM, zero JSX.
- **Live Stream**: WebSocket connection to `/ws/investigation` updates live telemetry markers and breadcrumb paths in real time.
- **Evidence Verification**: Real-time physical file re-hashing against database records with instant pass/fail display.

### D. Cryptographic Chain of Custody
- Chained ledger implementation:
  $$\text{Event Hash}_N = \text{SHA-256}(\text{Event Hash}_{N-1} \,\|\, \text{CanonicalJSON}(\text{Event Payload}))$$
- Genesis blocks start from 64 zeros (`0000...0000`).
- Immutable and mathematically verifiable.
