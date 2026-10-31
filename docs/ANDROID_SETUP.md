# TraceX Android Client — Build & Installation Guide

This document explains how to install and run the **TraceX Native Android Client** on a physical Android device or emulator and connect it to the TraceX Forensic Server and Real-Time SOC Dashboard.

---

## 1. Generated APK Artifact

The APK is already compiled and ready for transfer and installation:

- **Debug APK Location**:
  `android/app/build/outputs/apk/debug/app-debug.apk`
- **Package Name**: `com.tracex.investigation`
- **Application Name**: `TraceX`
- **Min SDK**: Android 8.0 (API 26)
- **Target SDK**: Android 14 / 15 (API 34)

---

## 2. Installation on a Physical Android Phone

### Option A: Direct File Transfer (Simplest)
1. Send or copy `app-debug.apk` directly to your Android device via USB Cable, Google Drive, WhatsApp, or local file share.
2. Open your device's **Files** app and tap `app-debug.apk`.
3. If prompted, toggle **Allow from this source** to permit installing apps outside the Play Store.
4. Tap **Install** and then open **TraceX**.

### Option B: USB Debugging via ADB
1. Enable **Developer Options** and **USB Debugging** on your phone:
   - Settings → About Phone → Tap *Build Number* 7 times.
   - Settings → System / Developer Options → Enable *USB Debugging*.
2. Connect your phone to your PC with a USB cable.
3. In PowerShell, install the APK:
   ```powershell
   adb install -r android/app/build/outputs/apk/debug/app-debug.apk
   ```
4. Verify the package is installed:
   ```powershell
   adb shell pm list packages | findstr tracex
   ```

---

## 3. Connecting the Mobile App to the TraceX Server

1. **Find your Computer's Local Wi-Fi IP Address**:
   In PowerShell on your PC:
   ```powershell
   ipconfig
   ```
   Look for the `IPv4 Address` under your active Wi-Fi adapter (e.g. `192.168.1.15`).

2. **Ensure Phone and PC are on the Same Wi-Fi Network**.

3. **Launch the FastAPI Server on your PC**:
   ```powershell
   cd project-tracex/backend
   py -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload
   ```
   *(Listening on `0.0.0.0` ensures your mobile phone can reach it over your local network).*

4. **Open the TraceX App on Mobile**:
   - In the **Server URL** input, enter:
     ```text
     http://<YOUR_COMPUTER_LOCAL_IP>:8000
     ```
     *(Example: `http://192.168.1.15:8000`)*
     *(If using an Android Emulator on the same PC, use: `http://10.0.2.2:8000`)*
   - Case ID: enter an existing Case ID (default created on first run: `CASE-2026-001`, or any active case from the dashboard).
   - Tap **Register Device**.

5. **Start Authorized Telemetry**:
   - Grant the authorized location permission when requested.
   - Tap **Start Monitoring**.
   - A truthful Android foreground notification will appear:
     **"TraceX — Forensic telemetry acquisition active"**
   - Live location coordinates and cryptographic SHA-256 evidence hashes will begin streaming.

---

## 4. Real-Time Dashboard Verification

1. On your PC, open:
   ```text
   http://localhost:8000/
   ```
2. Log into the SOC Dashboard:
   - **Email**: `<YOUR_CONFIGURED_ADMIN_USERNAME>`
   - **Password**: `<YOUR_CONFIGURED_ADMIN_PASSWORD>`
3. Navigate to:
   - **Enrolled Devices**: Your mobile phone (`DEV-...`) will show as **ACTIVE** with its device model, Android OS version, and battery percentage.
   - **Live Telemetry Stream**: Incoming telemetry coordinates and SHA-256 evidence hashes appear automatically via WebSocket in real-time without refreshing the page!

---

## 5. Re-building the APK (If Modifying Code)

If you modify Kotlin code in `android/app/src/main/`:
```powershell
cd project-tracex/android
.\gradlew.bat assembleDebug
```
The newly built APK will be written to `android/app/build/outputs/apk/debug/app-debug.apk`.
