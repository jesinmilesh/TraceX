/**
 * Project TraceX — Isolated Frontend-Only Demonstration Mode & Mock Datasets
 * 
 * Strict Isolation Rules:
 * 1. Used ONLY when DEMO MODE is enabled (window.__TRACEX_DEMO_MODE__ === true).
 * 2. Operates entirely in-memory on the client; never sends requests to the backend.
 * 3. Never broadcasts events through the production WebSocket.
 * 4. Never creates real database records.
 * 5. All demonstration evidence records are explicitly labelled as fictional/simulated.
 * 6. When DEMO MODE is disabled, live API responses are used exclusively.
 */

const DEMO_STORAGE_KEY = 'tracex_demo_mode';

export function isDemoMode() {
  if (typeof window === 'undefined') return false;
  if (typeof window.__TRACEX_CONFIG__ !== 'undefined' && typeof window.__TRACEX_CONFIG__.DEMO_MODE === 'boolean') {
    return window.__TRACEX_CONFIG__.DEMO_MODE;
  }
  const stored = localStorage.getItem(DEMO_STORAGE_KEY);
  if (stored !== null) {
    return stored === 'true';
  }
  return false;
}

export function setDemoMode(enabled) {
  if (typeof window !== 'undefined') {
    window.__TRACEX_CONFIG__ = window.__TRACEX_CONFIG__ || {};
    window.__TRACEX_CONFIG__.DEMO_MODE = enabled;
    localStorage.setItem(DEMO_STORAGE_KEY, enabled ? 'true' : 'false');
    window.dispatchEvent(new CustomEvent('demo:toggle', { detail: { enabled } }));
  }
}

// ----------------- Fictional Demonstration Datasets -----------------

export const DEMO_USER = {
  user_id: 'USR-DEMO-001',
  email: 'investigator.demo@tracex.local',
  name: 'Chief Forensic Examiner Vance',
  role: 'DEMO EXAMINER',
  badge_number: 'FX-8841-DEMO',
  is_active: true,
  is_demo: true
};

export const DEMO_CASES = [
  {
    case_id: 'CASE-2026-001',
    case_number: 'TX-2026-089',
    title: 'Operation Sentinel Shadow — Cyber Espionage [DEMO]',
    status: 'ACTIVE',
    priority: 'CRITICAL',
    lead_investigator: 'Special Agent Vance',
    description: 'Fictional authorized judicial interception and forensic telemetry collection on suspected exfiltration handset.',
    device_count: 2,
    evidence_count: 4,
    created_at: '2026-10-25T08:30:00Z',
    is_demo: true
  },
  {
    case_id: 'CASE-2026-002',
    case_number: 'TX-2026-092',
    title: 'Harbor Logistics Breach Incident [DEMO]',
    status: 'ACTIVE',
    priority: 'HIGH',
    lead_investigator: 'Analyst Reynolds',
    description: 'Simulated forensic integrity assessment of enrolled terminal devices.',
    device_count: 1,
    evidence_count: 2,
    created_at: '2026-10-28T14:15:00Z',
    is_demo: true
  }
];

export const DEMO_DEVICES = [
  {
    device_id: 'DEV-ANDROID-01',
    case_id: 'CASE-2026-001',
    device_name: 'Pixel 8 Pro (Seized Terminal)',
    model: 'Pixel 8 Pro (Android 16 API 36)',
    status: 'ONLINE',
    battery_level: 84,
    is_charging: false,
    wifi_ssid: 'Corporate-Guest-5G',
    cellular_network: 'Verizon LTE',
    location: { latitude: 37.7749, longitude: -122.4194, accuracy: 4.2 },
    last_seen: new Date().toISOString(),
    is_demo: true
  },
  {
    device_id: 'DEV-ANDROID-02',
    case_id: 'CASE-2026-001',
    device_name: 'Samsung Galaxy S24 Ultra',
    model: 'SM-S928B (Android 15)',
    status: 'ONLINE',
    battery_level: 92,
    is_charging: true,
    wifi_ssid: 'Secure-Lab-WPA3',
    cellular_network: 'T-Mobile 5G UC',
    location: { latitude: 37.7833, longitude: -122.4167, accuracy: 3.1 },
    last_seen: new Date().toISOString(),
    is_demo: true
  }
];

export const DEMO_TELEMETRY = [
  {
    event_id: 'TEL-DEMO-1001',
    device_id: 'DEV-ANDROID-01',
    case_id: 'CASE-2026-001',
    event_type: 'LOCATION_UPDATE',
    latitude: 37.7749,
    longitude: -122.4194,
    accuracy: 4.2,
    speed: 1.2,
    altitude: 18.4,
    battery: 84,
    evidence_hash: '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08',
    received_at: new Date(Date.now() - 180000).toISOString(),
    timestamp: Date.now() - 180000,
    is_demo: true
  },
  {
    event_id: 'TEL-DEMO-1002',
    device_id: 'DEV-ANDROID-01',
    case_id: 'CASE-2026-001',
    event_type: 'LOCATION_UPDATE',
    latitude: 37.7768,
    longitude: -122.4170,
    accuracy: 3.8,
    speed: 4.5,
    altitude: 19.1,
    battery: 83,
    evidence_hash: '5e884898da28047151d0e56f8dc6292773603d0d6aabbdd62a11ef721d1542d8',
    received_at: new Date(Date.now() - 120000).toISOString(),
    timestamp: Date.now() - 120000,
    is_demo: true
  },
  {
    event_id: 'TEL-DEMO-1003',
    device_id: 'DEV-ANDROID-01',
    case_id: 'CASE-2026-001',
    event_type: 'LOCATION_UPDATE',
    latitude: 37.7795,
    longitude: -122.4145,
    accuracy: 3.2,
    speed: 5.6,
    altitude: 20.2,
    battery: 82,
    evidence_hash: '4b227777d4dd1fc61c6f884f48641d02b4d121d3fd328cb08b5531fcacdabf8a',
    received_at: new Date(Date.now() - 60000).toISOString(),
    timestamp: Date.now() - 60000,
    is_demo: true
  },
  {
    event_id: 'TEL-DEMO-1004',
    device_id: 'DEV-ANDROID-01',
    case_id: 'CASE-2026-001',
    event_type: 'LOCATION_UPDATE',
    latitude: 37.7820,
    longitude: -122.4110,
    accuracy: 2.9,
    speed: 3.8,
    altitude: 21.0,
    battery: 81,
    evidence_hash: 'ef2d127de37b942baad06145e54b0c619a1f22327b2ebbcfbec78f5564afe39d',
    received_at: new Date().toISOString(),
    timestamp: Date.now(),
    is_demo: true
  }
];

export const DEMO_CALLS = [
  {
    call_id: 'CALL-DEMO-001',
    device_id: 'DEV-ANDROID-01',
    phone_number: '+1 (415) 555-0199',
    call_type: 'INCOMING',
    duration_seconds: 142,
    date: Date.now() - 3600000,
    recorded_at: new Date(Date.now() - 3600000).toISOString(),
    call_event_id: 'CAL-9A8F2C01DE44',
    is_demo: true
  },
  {
    call_id: 'CALL-DEMO-002',
    device_id: 'DEV-ANDROID-01',
    phone_number: '+1 (650) 555-0143',
    call_type: 'OUTGOING',
    duration_seconds: 318,
    date: Date.now() - 1800000,
    recorded_at: new Date(Date.now() - 1800000).toISOString(),
    call_event_id: 'CAL-7C4A8D09CA37',
    is_demo: true
  },
  {
    call_id: 'CALL-DEMO-003',
    device_id: 'DEV-ANDROID-01',
    phone_number: '+1 (415) 555-0182',
    call_type: 'MISSED',
    duration_seconds: 0,
    date: Date.now() - 7200000,
    recorded_at: new Date(Date.now() - 7200000).toISOString(),
    call_event_id: 'CAL-3A7BD3E2360A',
    is_demo: true
  }
];

export const DEMO_MESSAGES = [
  {
    message_id: 'SMS-DEMO-101',
    device_id: 'DEV-ANDROID-01',
    sender: '+1 (415) 555-0199',
    body: 'Confirming key exchange hash 9a8f2c... Rendezvous scheduled for 22:00 UTC.',
    msg_type: 'INCOMING',
    date: Date.now() - 7200000,
    recorded_at: new Date(Date.now() - 7200000).toISOString(),
    is_demo: true
  },
  {
    message_id: 'SMS-DEMO-102',
    device_id: 'DEV-ANDROID-01',
    sender: '+1 (415) 555-0100',
    body: 'Understood. Primary forensic channel secured and acknowledged.',
    msg_type: 'OUTGOING',
    date: Date.now() - 7100000,
    recorded_at: new Date(Date.now() - 7100000).toISOString(),
    is_demo: true
  }
];

export const DEMO_EVIDENCE = [
  {
    evidence_id: 'EVD-DEMO-0041',
    case_id: 'CASE-2026-001',
    original_filename: 'fictional_ram_dump_partition3.raw',
    file_size: 42891240,
    mime_type: 'application/octet-stream',
    sha256: '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08',
    acquired_by: 'Special Agent Vance',
    vault_status: 'SIMULATED_VERIFIED',
    uploaded_at: '2026-10-26T10:14:22Z',
    is_demo: true
  },
  {
    evidence_id: 'EVD-DEMO-0042',
    case_id: 'CASE-2026-001',
    original_filename: 'fictional_sqlite_signal_keystore.db',
    file_size: 1548200,
    mime_type: 'application/x-sqlite3',
    sha256: '5e884898da28047151d0e56f8dc6292773603d0d6aabbdd62a11ef721d1542d8',
    acquired_by: 'Special Agent Vance',
    vault_status: 'SIMULATED_VERIFIED',
    uploaded_at: '2026-10-27T16:45:09Z',
    is_demo: true
  }
];

export const DEMO_CUSTODY = [
  {
    block_id: 1,
    case_id: 'CASE-2026-001',
    evidence_id: 'EVD-DEMO-0041',
    action: 'ACQUISITION_AND_HASH_GENESIS [DEMO]',
    actor: 'Special Agent Vance',
    role: 'ADMIN',
    previous_hash: '0000000000000000000000000000000000000000000000000000000000000000',
    block_hash: '3a7bd3e2360a3d29eea436fcfb7e44c735d117c42d1c1835420b6b9942dd4f1b',
    timestamp: '2026-10-26T10:15:00Z',
    notes: 'Demonstration Genesis Block • Simulated Physical Extraction',
    is_demo: true
  },
  {
    block_id: 2,
    case_id: 'CASE-2026-001',
    evidence_id: 'EVD-DEMO-0042',
    action: 'EVIDENCE_TRANSFERRED_TO_LAB_VAULT [DEMO]',
    actor: 'Special Agent Vance',
    role: 'ADMIN',
    previous_hash: '3a7bd3e2360a3d29eea436fcfb7e44c735d117c42d1c1835420b6b9942dd4f1b',
    block_hash: '7c4a8d09ca3762af61e59520943dc26494f8941b714b136894c2e6f4f2c00a43',
    timestamp: '2026-10-27T16:50:00Z',
    notes: 'Demonstration Transfer Block • Simulated Secure Chain',
    is_demo: true
  }
];

export const DEMO_AUDIT = [
  {
    log_id: 'AUD-DEMO-891',
    actor: 'investigator.demo@tracex.local',
    action: 'SOC_DASHBOARD_LOGIN',
    ip_address: '127.0.0.1 (Local Simulation)',
    status: 'SUCCESS',
    timestamp: new Date().toISOString(),
    is_demo: true
  },
  {
    log_id: 'AUD-DEMO-890',
    actor: 'investigator.demo@tracex.local',
    action: 'TELEMETRY_MAP_INSPECT',
    ip_address: '127.0.0.1 (Local Simulation)',
    status: 'SUCCESS',
    timestamp: new Date(Date.now() - 600000).toISOString(),
    is_demo: true
  }
];
