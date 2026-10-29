# Project TraceX — Forensic Security & Cryptographic Standards

## 1. Cryptographic Standards Compliance
Project TraceX aligns with digital evidence handling standards (ISO/IEC 27037 and NIST SP 800-86).

### A. SHA-256 Telemetry Hashing
For every location telemetry event received from an authorized mobile collector, a deterministic canonical hash is computed:
```
SHA-256(device_id + "-" + timestamp + "-" + latitude + "-" + longitude + "-" + event_type)
```
This guarantees that no GPS point can be altered in the database without invalidating its checksum.

### B. Evidence Vault Storage & Path Traversal Mitigation
Evidence files are uploaded via `multipart/form-data` and processed through strict security barriers:
1. **Filename Sanitization**: Directory traversal vectors (`../`, `..\`, absolute paths) are stripped via `Path(file.filename).name`.
2. **Safe Identifier Generation**: Physical files are prefixed with a UUID (`EV-2026-XXXXXXXX_filename.ext`).
3. **Immediate SHA-256 Calculation**: The raw byte stream is hashed immediately before disk write.
4. **On-the-Fly Verification**: An investigator can trigger live re-hashing of the stored physical file at any time. The system reads the physical bytes, re-computes the SHA-256 digest, compares it to the immutable database record, and writes an audit event.

### C. Tamper-Evident Chain of Custody Ledger
Custody transfers, evidence acquisitions, verifications, and laboratory exports are cryptographically chained:
```
Event Hash = SHA-256(previous_event_hash | canonical_json(custody_payload))
```
If an adversary attempts to modify any past custody entry, every subsequent hash in the chain breaks, immediately exposing the tampering.

### D. Role-Based Access Control (RBAC)
- **ADMIN**: User creation, case deletion/archival, evidence management, custody auditing.
- **INVESTIGATOR**: Case creation, evidence upload, device enrollment, report export.
- **ANALYST**: Custody verification, evidence inspection, telemetry examination.
- **VIEWER**: Read-only oversight.

Passwords are hashed using standard `bcrypt` with work factor 12. Sessions are secured with JSON Web Tokens (HS256).
