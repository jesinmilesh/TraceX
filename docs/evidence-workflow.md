# Project TraceX — Investigator Workflow Guide

This guide walks an investigator through an end-to-end evidence collection and verification lifecycle.

---

## Step 1: Investigator Login
1. Open the TraceX SOC Dashboard in your browser: `http://localhost:8000/`.
2. Authenticate using authorized credentials configured in environment:
   - Email: `<YOUR_CONFIGURED_ADMIN_USERNAME>`
   - Password: `<YOUR_CONFIGURED_ADMIN_PASSWORD>`
3. The dashboard initializes and connects to the live WebSocket telemetry stream.

---

## Step 2: Create or Select an Investigation Case
1. Navigate to **Investigation Cases**.
2. Click **+ New Investigation Case**.
3. Specify Title: *"Operation Alpha Evidence Collection"* and the Warrant/Consent authorization details.
4. Select the case from the topbar dropdown to set the active operational context.

---

## Step 3: Enroll Android Collector Device
1. On the authorized Android test unit, launch the **TraceX** application.
2. Enter the **Case ID** (e.g. `CASE-2026-001`) and **Forensic Server URL** (`http://<SERVER_IP>:8000`).
3. Tap **Register / Bind to Case**. The device ID will appear under **Enrolled Devices** in the dashboard.
4. Grant the required Android location and notification permissions.
5. Tap **START** to begin telemetry collection. The truthful foreground notification *"TraceX Forensic Telemetry Active"* will be visible in the Android notification drawer.

---

## Step 4: Live Telemetry & Breadcrumb Monitoring
1. In the dashboard, switch to **Overview** or **Live Telemetry Stream**.
2. As the device moves, coordinates are plotted on the interactive radar/canvas breadcrumb trail.
3. Every GPS coordinate point displays an immutable SHA-256 evidence hash.

---

## Step 5: Vaulting Digital Evidence
1. Navigate to **Evidence Vault & SHA-256**.
2. Drag and drop any forensic extraction artifact (e.g., call log extract, database dump, photo, report) into the secure dropzone.
3. TraceX sanitizes the filename, writes the file to the secure vault, calculates its SHA-256 checksum, and links an initial `EVIDENCE_SECURED_IN_VAULT` block to the Chain of Custody ledger.

---

## Step 6: Mathematical Hash Verification
1. Locate the vaulted evidence item in the table.
2. Click **Verify SHA-256**.
3. The system reads the physical file from disk, computes a fresh SHA-256 hash, and compares it to the database record.
4. A verification modal displays the comparison and confirms `INTEGRITY VERIFIED`. This action is also cryptographically chained into the custody ledger.

---

## Step 7: Generating Authoritative Forensic Report
1. Navigate to **Report Export**.
2. Review the embedded live preview detailing case scope, authorized devices, vaulted artifacts, and chained custody blocks.
3. Click **Download Standalone HTML Report** to save a self-contained, auditable HTML report for court or institutional presentation.
