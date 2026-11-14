import type { AreaUnit, TemperatureUnit } from '../types/farm';

/** Exact international conversion factor: 1 hectare = 2.4710538147 acres */
export const ACRES_PER_HECTARE = 2.4710538147;
export const HECTARES_TO_ACRES = ACRES_PER_HECTARE;
export const ACRES_TO_HECTARES = 1 / ACRES_PER_HECTARE;

export function acresToHectares(acres: number): number {
  if (!Number.isFinite(acres) || acres < 0) return 0;
  return acres * ACRES_TO_HECTARES;
}

export function hectaresToAcres(hectares: number): number {
  if (!Number.isFinite(hectares) || hectares < 0) return 0;
  return hectares * HECTARES_TO_ACRES;
}

export function toHectares(value: number, unit: AreaUnit): number {
  if (!Number.isFinite(value) || value < 0) return 0;
  return unit === 'acres' ? acresToHectares(value) : value;
}

export function fromHectares(hectares: number, unit: AreaUnit): number {
  if (!Number.isFinite(hectares) || hectares < 0) return 0;
  return unit === 'acres' ? hectaresToAcres(hectares) : hectares;
}

export function formatAreaInputValue(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '';
  return String(Number(value.toFixed(4)));
}

export function formatArea(
  hectares: number | null | undefined,
  unit: AreaUnit,
  locale = 'en-US'
): string {
  if (hectares === null || hectares === undefined || !Number.isFinite(hectares)) {
    return 'Not specified';
  }
  const value = fromHectares(hectares, unit);
  const formatted = new Intl.NumberFormat(locale, {
    maximumFractionDigits: value < 10 ? 2 : 1,
  }).format(value);
  return `${formatted} ${unit === 'acres' ? 'ac' : 'ha'}`;
}

export function formatAreaDual(hectares: number | null | undefined, locale = 'en-US'): string {
  if (hectares === null || hectares === undefined || !Number.isFinite(hectares)) {
    return 'Not specified';
  }
  const ha = new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(hectares);
  const ac = new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(
    hectaresToAcres(hectares)
  );
  return `${ha} ha (${ac} ac)`;
}

export function celsiusToFahrenheit(c: number): number {
  return (c * 9) / 5 + 32;
}

export function formatTemperature(
  celsius: number | null | undefined,
  unit: TemperatureUnit,
  locale = 'en-US'
): string {
  if (celsius === null || celsius === undefined || !Number.isFinite(celsius)) {
    return 'Unavailable';
  }
  const val = unit === 'fahrenheit' ? celsiusToFahrenheit(celsius) : celsius;
  const formatted = new Intl.NumberFormat(locale, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(val);
  return `${formatted} ${unit === 'fahrenheit' ? '°F' : '°C'}`;
}

export function formatCoordinate(value: number, axis: 'lat' | 'lon'): string {
  if (!Number.isFinite(value)) return 'Invalid';
  const dir =
    axis === 'lat' ? (value >= 0 ? 'N' : 'S') : value >= 0 ? 'E' : 'W';
  return `${Math.abs(value).toFixed(4)}° ${dir}`;
}
