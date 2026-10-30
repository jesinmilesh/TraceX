/**
 * Project TraceX - Enterprise Google Maps Integration & Coordinate Utilities
 * Security & Reliability Rules:
 * - Strict numeric coordinate validation (-90 <= lat <= 90, -180 <= lon <= 180).
 * - Safe URL construction: https://www.google.com/maps?q=LAT,LON
 * - User-initiated opening only (never automatically dispatch on load/network).
 * - Target _blank with rel="noopener noreferrer" for web security.
 * - Graceful fallback/disabled states for invalid or missing coordinates.
 */

import { escapeHtml, showToast } from './api.js';

/**
 * Validates whether latitude and longitude are valid numeric geographic coordinates.
 * @param {number|string} lat - Latitude
 * @param {number|string} lon - Longitude
 * @returns {boolean}
 */
export function isValidCoordinate(lat, lon) {
  if (lat === null || lat === undefined || lon === null || lon === undefined) return false;
  if (typeof lat === 'string' && lat.trim() === '') return false;
  if (typeof lon === 'string' && lon.trim() === '') return false;

  const numLat = Number(lat);
  const numLon = Number(lon);

  if (isNaN(numLat) || isNaN(numLon)) return false;
  if (!isFinite(numLat) || !isFinite(numLon)) return false;
  if (numLat < -90 || numLat > 90) return false;
  if (numLon < -180 || numLon > 180) return false;

  return true;
}

/**
 * Constructs a secure Google Maps direct coordinate search URL.
 * Format: https://www.google.com/maps?q=LATITUDE,LONGITUDE
 * @param {number|string} lat
 * @param {number|string} lon
 * @returns {string|null}
 */
export function buildGoogleMapsUrl(lat, lon) {
  if (!isValidCoordinate(lat, lon)) return null;
  const numLat = Number(lat).toFixed(6);
  const numLon = Number(lon).toFixed(6);
  return `https://www.google.com/maps?q=${encodeURIComponent(numLat)},${encodeURIComponent(numLon)}`;
}

/**
 * Safely opens Google Maps in a new tab for the given coordinates.
 * Dispatches only upon explicit user interaction.
 * @param {number|string} lat
 * @param {number|string} lon
 * @returns {boolean}
 */
export function openInGoogleMaps(lat, lon) {
  if (!isValidCoordinate(lat, lon)) {
    showToast('Missing or invalid GPS coordinates. Google Maps view unavailable.', 'warning');
    return false;
  }
  const url = buildGoogleMapsUrl(lat, lon);
  if (!url) return false;

  window.open(url, '_blank', 'noopener,noreferrer');
  return true;
}

/**
 * Copies numeric coordinates to clipboard with user notification.
 * @param {number|string} lat
 * @param {number|string} lon
 */
export function copyCoordinates(lat, lon) {
  if (!isValidCoordinate(lat, lon)) {
    showToast('Invalid coordinates cannot be copied.', 'warning');
    return;
  }
  const str = `${Number(lat).toFixed(6)}, ${Number(lon).toFixed(6)}`;
  if (navigator && navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(str)
      .then(() => showToast(`Coordinates copied: ${str}`, 'info'))
      .catch(() => showToast(`Coordinates: ${str}`, 'info'));
  } else {
    showToast(`Coordinates: ${str}`, 'info');
  }
}

/**
 * Renders an accessible, secure "View in Google Maps ↗" button or link.
 * @param {number|string} lat
 * @param {number|string} lon
 * @param {string} label
 * @param {string} extraClasses
 * @returns {string} HTML markup
 */
export function renderGoogleMapsButton(lat, lon, label = 'View in Google Maps ↗', extraClasses = '') {
  if (!isValidCoordinate(lat, lon)) {
    return `
      <button class="btn btn-secondary btn-sm gmaps-btn-disabled ${extraClasses}" disabled title="No valid GPS coordinates recorded">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right: 3px; vertical-align: middle;">
          <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"></path>
          <circle cx="12" cy="9" r="2.5"></circle>
        </svg>
        <span>No GPS</span>
      </button>
    `;
  }

  const url = buildGoogleMapsUrl(lat, lon);
  const formattedLat = Number(lat).toFixed(6);
  const formattedLon = Number(lon).toFixed(6);

  return `
    <a href="${url}" target="_blank" rel="noopener noreferrer"
       class="btn btn-secondary btn-sm gmaps-action-btn ${extraClasses}"
       title="Open location (${formattedLat}, ${formattedLon}) in Google Maps"
       aria-label="View GPS observation (${formattedLat}, ${formattedLon}) in Google Maps">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right: 4px; vertical-align: middle; flex-shrink: 0;">
        <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"></path>
        <circle cx="12" cy="9" r="2.5"></circle>
      </svg>
      <span>${escapeHtml(label)}</span>
    </a>
  `;
}

/**
 * Renders a standardized, professional Location Observation Card.
 * @param {object} opts
 * @param {number|string} opts.latitude
 * @param {number|string} opts.longitude
 * @param {string} [opts.timestamp]
 * @param {string} [opts.deviceId]
 * @param {number|string} [opts.accuracy]
 * @param {string} [opts.title]
 * @returns {string} HTML markup
 */
export function renderLocationObservationCard({
  latitude,
  longitude,
  timestamp = null,
  deviceId = null,
  accuracy = null,
  title = 'LOCATION OBSERVATION'
}) {
  const valid = isValidCoordinate(latitude, longitude);
  const latStr = valid ? Number(latitude).toFixed(6) : 'N/A';
  const lonStr = valid ? Number(longitude).toFixed(6) : 'N/A';
  const timeStr = timestamp ? new Date(timestamp).toLocaleString() : 'Recent Observation';
  const accStr = accuracy ? ` (±${Number(accuracy).toFixed(1)}m accuracy)` : '';

  return `
    <div class="location-observation-card">
      <div class="loc-card-header">
        <span class="loc-card-tag">📍 ${escapeHtml(title)}</span>
        ${valid ? '<span class="badge badge-accent">GPS FIX</span>' : '<span class="badge badge-neutral">UNAVAILABLE</span>'}
      </div>
      <div class="loc-card-body">
        <div class="loc-coords-row mono">
          <div><span class="text-muted">Latitude:</span> <strong class="text-primary">${latStr}</strong></div>
          <div><span class="text-muted">Longitude:</span> <strong class="text-primary">${lonStr}</strong></div>
        </div>
        ${deviceId ? `<div class="loc-meta-row"><span class="text-muted">Source:</span> <strong class="mono text-cyan">${escapeHtml(deviceId)}</strong>${escapeHtml(accStr)}</div>` : ''}
        ${timestamp ? `<div class="loc-meta-row"><span class="text-muted">Recorded:</span> <span class="mono">${escapeHtml(timeStr)}</span></div>` : ''}
      </div>
      <div class="loc-card-actions">
        ${renderGoogleMapsButton(latitude, longitude, 'View in Google Maps ↗', 'btn-primary')}
        ${valid ? `
          <button type="button" class="btn btn-secondary btn-sm" onclick="window.TraceXMaps ? window.TraceXMaps.copyCoordinates('${latStr}', '${lonStr}') : null">
            📋 Copy Coords
          </button>
        ` : ''}
      </div>
    </div>
  `;
}

// Expose on window for easy inline event binding
if (typeof window !== 'undefined') {
  window.TraceXMaps = {
    isValidCoordinate,
    buildGoogleMapsUrl,
    openInGoogleMaps,
    copyCoordinates,
    renderGoogleMapsButton,
    renderLocationObservationCard
  };
}
