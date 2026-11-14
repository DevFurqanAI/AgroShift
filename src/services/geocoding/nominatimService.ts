import { COUNTRIES } from '../../data/countries';

export interface PlaceSearchCandidate {
  placeId: string;
  displayName: string;
  latitude: number;
  longitude: number;
  country: string;
  countryCode: string;
  region: string;
  locality: string;
}

export interface ReverseGeocodeResult {
  status: 'resolved' | 'unresolved';
  country: string;
  countryCode: string;
  region: string;
  locality: string;
  displayName: string;
  error?: string;
}

interface NominatimAddress {
  country?: string;
  country_code?: string;
  state?: string;
  province?: string;
  region?: string;
  state_district?: string;
  county?: string;
  city?: string;
  town?: string;
  village?: string;
  municipality?: string;
  suburb?: string;
  hamlet?: string;
  locality?: string;
}

interface NominatimItem {
  place_id: number | string;
  display_name?: string;
  lat: string;
  lon: string;
  address?: NominatimAddress;
}

const searchCache = new Map<string, PlaceSearchCandidate[]>();
const reverseCache = new Map<string, ReverseGeocodeResult>();

let lastRequestTime = 0;
const MIN_REQUEST_INTERVAL_MS = 1050;
let queueTail: Promise<void> = Promise.resolve();

function scheduleThrottled<T>(fn: () => Promise<T>, signal?: AbortSignal): Promise<T> {
  const run = async (): Promise<T> => {
    if (signal?.aborted) {
      throw new DOMException('Aborted', 'AbortError');
    }
    const now = Date.now();
    const waitMs = Math.max(0, lastRequestTime + MIN_REQUEST_INTERVAL_MS - now);
    if (waitMs > 0) {
      await new Promise<void>((resolve, reject) => {
        const timer = globalThis.setTimeout(() => {
          signal?.removeEventListener('abort', onAbort);
          resolve();
        }, waitMs);
        const onAbort = () => {
          globalThis.clearTimeout(timer);
          reject(new DOMException('Aborted', 'AbortError'));
        };
        signal?.addEventListener('abort', onAbort, { once: true });
      });
    }
    if (signal?.aborted) {
      throw new DOMException('Aborted', 'AbortError');
    }
    lastRequestTime = Date.now();
    return fn();
  };

  const task = queueTail.then(run, run);
  queueTail = task.then(
    () => undefined,
    () => undefined
  );
  return task;
}

function matchPresetCountryCode(isoLower?: string, countryName?: string): string {
  const isoUpper = (isoLower || '').trim().toUpperCase();
  if (isoUpper && COUNTRIES.some((c) => c.code === isoUpper)) {
    return isoUpper;
  }
  if (isoUpper) return isoUpper;
  if (countryName) {
    const match = COUNTRIES.find(
      (c) => c.name.toLowerCase() === countryName.trim().toLowerCase()
    );
    if (match) return match.code;
  }
  return 'OTHER';
}

function extractAddressFields(address?: NominatimAddress) {
  const country = (address?.country || '').trim();
  const countryCode = matchPresetCountryCode(address?.country_code, country);
  const region = (
    address?.state ||
    address?.province ||
    address?.region ||
    address?.state_district ||
    address?.county ||
    ''
  ).trim();
  const locality = (
    address?.village ||
    address?.town ||
    address?.city ||
    address?.municipality ||
    address?.locality ||
    address?.suburb ||
    address?.hamlet ||
    ''
  ).trim();

  return { country, countryCode, region, locality };
}

function normalizeLanguageCode(language?: string): string {
  const clean = (language || 'en').trim().toLowerCase();
  return /^[a-z]{2,3}(-[a-z0-9]{2,8})?$/.test(clean) ? clean : 'en';
}

/**
 * Explicit user-submitted Nominatim forward search (never called per keystroke).
 * Only sends search query and optional country code filter — never farm names or user notes.
 */
export async function searchPlaces(
  query: string,
  options: { countryCode?: string; signal?: AbortSignal; language?: string } = {}
): Promise<PlaceSearchCandidate[]> {
  const cleanQuery = query.trim();
  if (!cleanQuery) return [];

  const filterCode =
    options.countryCode &&
    options.countryCode !== 'OTHER' &&
    options.countryCode.length === 2
      ? options.countryCode.toLowerCase()
      : '';
  const lang = normalizeLanguageCode(options.language);

  const cacheKey = `${lang}::${filterCode}::${cleanQuery.toLowerCase()}`;
  const cached = searchCache.get(cacheKey);
  if (cached) return cached;

  const params = new URLSearchParams({
    format: 'jsonv2',
    addressdetails: '1',
    limit: '6',
    'accept-language': lang,
    q: cleanQuery,
  });
  if (filterCode) {
    params.set('countrycodes', filterCode);
  }

  const results = await scheduleThrottled(async () => {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?${params.toString()}`,
      {
        headers: {
          Accept: 'application/json',
        },
        signal: options.signal,
      }
    );
    if (!res.ok) {
      throw new Error(`Nominatim search failed with HTTP ${res.status}`);
    }
    const raw = (await res.json()) as NominatimItem[];
    if (!Array.isArray(raw)) return [];

    return raw
      .map((item): PlaceSearchCandidate | null => {
        const lat = Number(parseFloat(item.lat).toFixed(6));
        const lon = Number(parseFloat(item.lon).toFixed(6));
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
        const fields = extractAddressFields(item.address);
        return {
          placeId: String(item.place_id),
          displayName: item.display_name || `${lat}, ${lon}`,
          latitude: lat,
          longitude: lon,
          country: fields.country,
          countryCode: fields.countryCode,
          region: fields.region,
          locality: fields.locality,
        };
      })
      .filter((x): x is PlaceSearchCandidate => x !== null);
  }, options.signal);

  searchCache.set(cacheKey, results);
  return results;
}

export interface ReverseGeocodeOptions {
  signal?: AbortSignal;
  language?: string;
}

/**
 * Reverse geocode geographic coordinates via Nominatim with caching & throttling.
 * Never falls back to a default country when lookup fails or returns ocean/empty.
 */
export async function reverseGeocode(
  latitude: number,
  longitude: number,
  signalOrOptions?: AbortSignal | ReverseGeocodeOptions
): Promise<ReverseGeocodeResult> {
  const signal =
    signalOrOptions && 'aborted' in signalOrOptions
      ? signalOrOptions
      : (signalOrOptions as ReverseGeocodeOptions | undefined)?.signal;
  const language =
    signalOrOptions && !('aborted' in signalOrOptions)
      ? (signalOrOptions as ReverseGeocodeOptions).language
      : undefined;
  const lang = normalizeLanguageCode(language);

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return {
      status: 'unresolved',
      country: '',
      countryCode: '',
      region: '',
      locality: '',
      displayName: 'Address could not be determined.',
      error: 'Address could not be determined.',
    };
  }

  const cacheKey = `${lang}::${latitude.toFixed(4)},${longitude.toFixed(4)}`;
  const cached = reverseCache.get(cacheKey);
  if (cached) return cached;

  const params = new URLSearchParams({
    format: 'jsonv2',
    addressdetails: '1',
    zoom: '14',
    'accept-language': lang,
    lat: String(latitude),
    lon: String(longitude),
  });

  try {
    const data = await scheduleThrottled(async () => {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/reverse?${params.toString()}`,
        {
          headers: {
            Accept: 'application/json',
          },
          signal,
        }
      );
      if (!res.ok) {
        throw new Error(`Nominatim reverse failed with HTTP ${res.status}`);
      }
      return (await res.json()) as {
        error?: string;
        display_name?: string;
        address?: NominatimAddress;
      };
    }, signal);

    if (!data || data.error || !data.address?.country) {
      const unresolved: ReverseGeocodeResult = {
        status: 'unresolved',
        country: '',
        countryCode: '',
        region: '',
        locality: '',
        displayName: 'Address could not be determined.',
        error: 'Address could not be determined.',
      };
      reverseCache.set(cacheKey, unresolved);
      return unresolved;
    }

    const fields = extractAddressFields(data.address);
    const resolved: ReverseGeocodeResult = {
      status: 'resolved',
      country: fields.country,
      countryCode: fields.countryCode,
      region: fields.region,
      locality: fields.locality,
      displayName:
        data.display_name ||
        [fields.locality, fields.region, fields.country].filter(Boolean).join(', '),
    };
    reverseCache.set(cacheKey, resolved);
    return resolved;
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw err;
    }
    console.error('[AgroShift Nominatim] Reverse geocoding error:', err);
    return {
      status: 'unresolved',
      country: '',
      countryCode: '',
      region: '',
      locality: '',
      displayName: 'Address could not be determined.',
      error: 'Address could not be determined.',
    };
  }
}

export function clearGeocodingCaches(): void {
  searchCache.clear();
  reverseCache.clear();
}
