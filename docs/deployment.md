# Project TraceX — Deployment & Execution Guide

## Prerequisites
- **Python**: 3.10+ (tested with Python 3.14 on Windows)
- **MongoDB**: MongoDB Atlas Cluster URI configured in `.env`
- **Android Studio / Gradle**: JDK 17+ for Android compilation

---

## 1. Running the FastAPI Backend & SOC Dashboard

The backend serves both the REST API and the framework-free vanilla JavaScript dashboard.

### A. Environment Configuration
Navigate to `project-tracex/backend/`:
The `.env` file should contain:
```env
PORT=8000
HOST=0.0.0.0
ENVIRONMENT=production
MONGODB_URI=<PRODUCTION_MONGODB_URI>
MONGODB_DATABASE=monitor
JWT_SECRET=<SECURE_HIGH_ENTROPY_JWT_SECRET>
JWT_ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=1440
UPLOAD_DIR=./evidence_vault
MAX_UPLOAD_SIZE_BYTES=104857600
ALLOWED_ORIGINS=https://tracex.local
```

### B. Launching the Server
From `project-tracex/backend`:
```powershell
py -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```
Once launched:
- **SOC Dashboard**: Open `http://localhost:8000/` or `http://localhost:8000/dashboard/`
- **Interactive Swagger Docs**: `http://localhost:8000/docs`
- **Health Check**: `http://localhost:8000/health`

### C. Running Automated Backend Tests
From `project-tracex/backend`:
```powershell
py test_suite.py
```

---

## 2. Running the Investigator SOC Dashboard (Standalone Vite Dev Server, Optional)

If you prefer hot module reloading via Vite:
```powershell
cd ../dashboard
npm install
npx vite --port 5173
```
Access at `http://localhost:5173/`.

---

## 3. Building the Native Android Client (`TraceX`)

1. Open Android Studio.
2. Select **Open an Existing Project** and choose `project-tracex/android`.
3. Allow Gradle to sync dependencies.
4. Run on an Android device or emulator (API 26+).
5. In the app:
   - For an emulator: set server URL to `http://10.0.2.2:8000`
   - For a physical device on the same Wi-Fi: set server URL to `http://<YOUR_LAN_IP>:8000`
