/**
 * One-tap turn-by-turn navigation deep links for Unguja pickups,
 * Stone Town Smart-Snap perimeter gates, dropoffs, and Vituo hotspots.
 */
export function buildGoogleMapsDirectionsUrl(lat: number, lng: number): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(
    `${lat.toFixed(6)},${lng.toFixed(6)}`
  )}&travelmode=driving`;
}

export function buildAppleMapsDirectionsUrl(
  lat: number,
  lng: number,
  label?: string
): string {
  const params = new URLSearchParams({
    daddr: `${lat.toFixed(6)},${lng.toFixed(6)}`,
    dirflg: "d",
  });
  if (label) {
    params.set("q", label);
  }
  return `https://maps.apple.com/?${params.toString()}`;
}

export function formatShortCoords(lat: number, lng: number): string {
  return `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
}
