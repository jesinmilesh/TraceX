# Project TraceX — REST API & WebSocket Specification

Base URL: `http://localhost:8000/api/v1`
Interactive Swagger Docs: `http://localhost:8000/docs`

---

## 1. Authentication (`/api/v1/auth`)

### `POST /auth/login`
Authenticates user and returns JWT bearer token.
- **Request**:
  ```json
  {
    "email": "admin@tracex.local",
    "password": "TraceX@2026!"
  }
  ```
- **Response (200 OK)**:
  ```json
  {
    "access_token": "eyJhbGciOi...",
    "token_type": "bearer",
    "user": {
      "user_id": "USR-ADMIN-001",
      "email": "admin@tracex.local",
      "name": "Lead Forensic Administrator",
      "role": "ADMIN"
    }
  }
  ```

---

## 2. Cases (`/api/v1/cases`)

### `POST /cases`
Creates a new forensic investigation case.
- **Headers**: `Authorization: Bearer <token>`
- **Request**:
  ```json
  {
    "title": "Operation Sovereign Chain",
    "description": "Authorized examination of forensic telemetry under court order 2026-X."
  }
  ```

### `GET /cases`
Returns all investigation cases with device, evidence, and telemetry counts.

---

## 3. Devices (`/api/v1/devices`)

### `POST /devices/register`
Binds an authorized mobile device to a case.
- **Request**:
  ```json
  {
    "device_id": "DEV-A81B92C3",
    "case_id": "CASE-2026-001",
    "device_model": "Pixel 8 Pro",
    "android_version": "14.0",
    "app_version": "1.0.0"
  }
  ```

---

## 4. Telemetry (`/api/v1/telemetry`)

### `POST /telemetry/ingest`
Ingests a GPS telemetry point from an enrolled collector.
- **Request**:
  ```json
  {
    "case_id": "CASE-2026-001",
    "device_id": "DEV-A81B92C3",
    "session_id": "SESS-90F2",
    "timestamp": 1730000000,
    "latitude": 37.774929,
    "longitude": -122.419416,
    "event_type": "LOCATION_UPDATE",
    "accuracy": 3.8
  }
  ```

---

## 5. Evidence Vault (`/api/v1/evidence`)

### `POST /evidence/upload`
Uploads forensic extraction artifact.
- **Form Data**:
  - `case_id`: String
  - `file`: Binary file stream

### `GET /evidence/{evidence_id}/verify`
Re-computes physical SHA-256 on disk and compares against immutable DB checksum.

---

## 6. Chain of Custody (`/api/v1/custody`)

### `GET /custody/case/{case_id}`
Returns all cryptographically linked custody blocks for the case.

---

## 7. Reports (`/api/v1/reports`)

### `GET /reports/{case_id}/html`
Generates authoritative standalone HTML examination report.

---

## 8. Real-Time WebSocket (`/ws/investigation`)
Connect: `ws://localhost:8000/ws/investigation`
Broadcasts live `TELEMETRY_UPDATE` events as devices report in.
