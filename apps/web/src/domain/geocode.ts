// Best-effort reverse geocoding using the free OpenStreetMap Nominatim API.
// No key required. Network/usage failures resolve to null so callers can fall
// back to a manually typed place name. Not called in tests (jsdom skips it).

interface NominatimAddress {
  city?: string; town?: string; village?: string; suburb?: string;
  county?: string; state?: string; country?: string;
}

/** Resolve a lat/lng to a short, human place label, or null on any failure. */
export async function reverseGeocode(lat: number, lng: number): Promise<string | null> {
  if (typeof fetch === 'undefined') return null;
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=12`;
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) return null;
    const body = (await res.json()) as { address?: NominatimAddress; display_name?: string };
    const a = body.address ?? {};
    const place = a.city || a.town || a.village || a.suburb || a.county;
    const region = a.state || a.country;
    if (place && region) return `${place}, ${region}`;
    if (place) return place;
    if (body.display_name) return body.display_name.split(',').slice(0, 2).join(',').trim();
    return null;
  } catch {
    return null;
  }
}
