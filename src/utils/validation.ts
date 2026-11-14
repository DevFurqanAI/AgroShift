import type { GeoJSONPolygon } from '../types/farm';
import { validatePolygonGeometry } from './geo';

export function isValidLatitude(lat: number): boolean {
  return Number.isFinite(lat) && lat >= -90 && lat <= 90;
}

export function isValidLongitude(lon: number): boolean {
  return Number.isFinite(lon) && lon >= -180 && lon <= 180;
}

export function validateCoordinates(
  lat: number,
  lon: number
): { valid: boolean; error?: string } {
  if (!isValidLatitude(lat)) {
    return {
      valid: false,
      error: 'Latitude must be a number between -90 and 90 degrees.',
    };
  }
  if (!isValidLongitude(lon)) {
    return {
      valid: false,
      error: 'Longitude must be a number between -180 and 180 degrees.',
    };
  }
  return { valid: true };
}

export function isValidPolygon(polygon: GeoJSONPolygon | null | undefined): boolean {
  return validatePolygonGeometry(polygon).valid;
}

export function normalizeBaseUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  return trimmed.replace(/\/+$/, '');
}
