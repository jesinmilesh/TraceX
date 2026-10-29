# TraceX — Digital Forensics and Authorized Device Telemetry Platform

TraceX is an enterprise-grade digital forensics, authorized device telemetry, and incident response platform designed for accredited digital forensic examiners, law enforcement agencies, and security operation centers (SOC).

Canonical Repository: [https://github.com/jesinmilesh/TraceX](https://github.com/jesinmilesh/TraceX)  
Production Branch: `main`

---

## Architecture

```text
               ┌──────────────────────────────────────┐
               │          TraceX Android APK          │
               │   Kotlin / Android 16 (API 36)       │
               │  • Visible Truthful Foreground Notif │
               │  • Fused Location (Speed, Accuracy)  │
               │  • Incremental Call Log & SMS Sync   │
               │  • Offline Encrypted FIFO Queue      │
               └──────────────────┬───────────────────┘
                                  │ HTTPS POST
                                  ▼
               ┌──────────────────────────────────────┐
               │        TraceX FastAPI Backend        │
               │  • RESTful API Engine                │
               │  • Cryptographic Chain-of-Custody    │
               │  • Evidence Vault with SHA-256       │
               │  • RBAC & JWT Session Management     │
               └───────────┬──────────────┬───────────┘
                           │              │
              MongoDB Atlas│              │Persistent WebSocket
             (Cluster DB)  │              │Broadcasts
                           ▼              ▼
               ┌────────────────┐  ┌─────────────────────────────────┐
               │    MongoDB     │  │       WebSocket Stream Hub      │
               │  Collections   │  │  • LOCATION_UPDATED             │
               │  • Telemetry   │  │  • CALL_LOG_ADDED               │
               │  • Evidence    │  │  • MESSAGE_ADDED                │
               │  • Custody     │  │  • DEVICE_STATUS_CHANGED        │
               │  • Audit Logs  │  └──────────────┬──────────────────┘
               └────────────────┘                 │
                                                  ▼
                               ┌─────────────────────────────────────┐
                               │       TraceX SOC Web Dashboard      │
                               │   Pure Vanilla HTML5 + CSS3 + JS    │
                               │        (Zero React / No SPAs)       │
                               │  • Real-Time Leaflet CartoDB Map    │
                               │  • Directional Polyline Trails      │
                               │  • Communications Timeline Feeds    │
                               │  • Chained Custody Ledger Inspector │
                               └──────────────────┬──────────────────┘
                                                  │
                                                  ▼
                               ┌─────────────────────────────────────┐
                               │           Vercel Platform           │
                               │   Continuous Deployment (CI/CD)     │
                               │  • GitHub Git Integration           │
                               │  • Automatic Preview on PRs         │
                               │  • Automatic Production on `main`   │
                               └─────────────────────────────────────┘
```

---

## Production CI/CD & Deployment Pipeline

Every change committed locally follows an automated pipeline where GitHub is the source of truth and Vercel manages global edge deployment:

```text
Local Workstation
      │
      ▼
git add . && git commit -m "feat/fix: description" && git push origin main
      │
      ▼
GitHub Repository: https://github.com/jesinmilesh/TraceX
      │
      ├──► GitHub Actions CI (.github/workflows/ci.yml)
      │      1. Production Security Audit (detects hardcoded credentials & endpoints)
      │      2. Frontend Build Verification (Vite asset packaging & health check)
      │      3. Backend Syntax Compilation (AST verification across all modules)
      │      4. Android Client Build Check (Gradle assembleDebug verification)
      │
      └──► Vercel Git Integration
             • Push to feature branch  ──► Vercel Preview Deployment
             • Pull Request to `main`  ──► CI Validation Checks
             • Merge into `main`       ──► Vercel Production Deployment
```

---

## Environment Variable Checklist

Configure environment variables appropriately across environments:

| Variable | Environment | Component | Purpose |
| :--- | :--- | :--- | :--- |
| `VITE_API_BASE_URL` | Preview & Production | Frontend (Vercel) | Full HTTPS URL of deployed FastAPI backend |
| `VITE_WS_URL` | Preview & Production | Frontend (Vercel) | Full WSS URL of persistent WebSocket server |
| `ENVIRONMENT` | All Environments | Backend | `development`, `staging`, or `production` |
| `PORT` | All Environments | Backend | Server binding port (default: `8000`) |
| `HOST` | All Environments | Backend | Server binding host (default: `0.0.0.0`) |
| `MONGODB_URI` | All Environments | Backend | MongoDB Atlas connection string |
| `MONGODB_DATABASE` | All Environments | Backend | Database namespace (e.g. `monitor`) |
| `JWT_SECRET` | All Environments | Backend | High-entropy JWT signing key (`openssl rand -hex 32`) |
| `ALLOWED_ORIGINS` | Production | Backend | Strict comma-separated dashboard origins (e.g. `https://tracex.vercel.app`) |
| `TRACEX_SERVER_URL` | Build / CI | Android APK | Production backend endpoint compiled into APK |

---

## Local Development Setup

### 1. Backend Service
```bash
cd backend
py -m pip install -r requirements.txt
# Copy configuration
cp .env.example .env
# Start FastAPI development engine
py -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```
Interactive API documentation: `http://localhost:8000/docs`  
Health check endpoint: `http://localhost:8000/health`

### 2. Frontend Dashboard (Pure HTML5 + CSS3 + Vanilla JavaScript)
No npm installation, bundler, or build step required. The dashboard is pure native ES6 web modules:
- Served directly by FastAPI at `http://localhost:8000/` or `http://localhost:8000/dashboard/`.
- Or run any lightweight static web server:
```bash
python -m http.server 5173 -d dashboard
```

### 3. Android Forensic Collector (Kotlin)
- Project location: `android/`
- Target SDK: **Android 16 (API 36)**
- Build Debug APK:
```bash
cd android
./gradlew assembleDebug
```
- Build Release APK:
```bash
./gradlew assembleRelease
```

---

## Vercel Project Connection

1. Log into your [Vercel Dashboard](https://vercel.com).
2. Click **Add New Project** and select **Import Git Repository**.
3. Select `jesinmilesh/TraceX`.
4. In Project Settings:
   - **Framework Preset**: `Other` (Pure Static Site)
   - **Root Directory**: `./` (handled by `vercel.json`)
   - **Output Directory**: `dashboard`
5. Click **Deploy**. Vercel will serve the native HTML, CSS, and JS directly with zero build delays! Future pushes to `main` will trigger automatic instant production deployments.

---

## Security & Ethics Boundary

Project TraceX is engineered strictly for **authorized digital forensic investigations**, consent-based evidentiary collection, and formal incident response:
- **Zero Stealth Surveillance**: The Android application operates with transparent foreground service indicators and unambiguous user notifications.
- **Tamper-Evident Ledger**: All evidence acquisitions are timestamped and cryptographically linked with SHA-256 blocks.
- **Strict Role-Based Access Control**: Separation of duties between System Administrators and Forensics Examiners.
