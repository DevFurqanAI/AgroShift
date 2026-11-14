import turfArea from '@turf/area';
import { polygon as turfPolygon } from '@turf/helpers';
import type { GeoJSONPolygon } from '../types/farm';

export interface LatLonPoint {
  lat: number;
  lon: number;
}

export interface PolygonMetricsResult {
  valid: boolean;
  selfIntersecting: boolean;
  error: string | null;
  geojson: GeoJSONPolygon | null;
  estimatedHectares: number | null;
  representativePoint: LatLonPoint | null;
}

const EPSILON = 1e-12;

function isValidCoordPair(lon: unknown, lat: unknown): boolean {
  return (
    typeof lon === 'number' &&
    typeof lat === 'number' &&
    Number.isFinite(lon) &&
    Number.isFinite(lat) &&
    lon >= -180 &&
    lon <= 180 &&
    lat >= -90 &&
    lat <= 90
  );
}

/**
 * Converts [lat, lon] map vertices into a closed GeoJSON Polygon ([lon, lat]).
 */
export function ringToGeoJSON(vertices: Array<[number, number]>): GeoJSONPolygon | null {
  if (vertices.length < 3) return null;
  const coords = vertices.map(([lat, lon]) => [
    Number(lon.toFixed(6)),
    Number(lat.toFixed(6)),
  ]);
  coords.push([...coords[0]]);
  return {
    type: 'Polygon',
    coordinates: [coords],
  };
}

function orientation(
  px: number,
  py: number,
  qx: number,
  qy: number,
  rx: number,
  ry: number
): number {
  const val = (qy - py) * (rx - qx) - (qx - px) * (ry - qy);
  if (Math.abs(val) <= EPSILON) return 0;
  return val > 0 ? 1 : 2;
}

function onSegment(
  px: number,
  py: number,
  qx: number,
  qy: number,
  rx: number,
  ry: number
): boolean {
  return (
    qx <= Math.max(px, rx) + EPSILON &&
    qx >= Math.min(px, rx) - EPSILON &&
    qy <= Math.max(py, ry) + EPSILON &&
    qy >= Math.min(py, ry) - EPSILON
  );
}

/**
 * Returns true if segment (p1 -> p2) intersects segment (q1 -> q2).
 */
export function segmentsIntersect(
  p1: [number, number],
  p2: [number, number],
  q1: [number, number],
  q2: [number, number]
): boolean {
  const [p1x, p1y] = p1;
  const [p2x, p2y] = p2;
  const [q1x, q1y] = q1;
  const [q2x, q2y] = q2;

  // Quick bounding-box rejection
  if (
    Math.max(p1x, p2x) < Math.min(q1x, q2x) - EPSILON ||
    Math.max(q1x, q2x) < Math.min(p1x, p2x) - EPSILON ||
    Math.max(p1y, p2y) < Math.min(q1y, q2y) - EPSILON ||
    Math.max(q1y, q2y) < Math.min(p1y, p2y) - EPSILON
  ) {
    return false;
  }

  const o1 = orientation(p1x, p1y, p2x, p2y, q1x, q1y);
  const o2 = orientation(p1x, p1y, p2x, p2y, q2x, q2y);
  const o3 = orientation(q1x, q1y, q2x, q2y, p1x, p1y);
  const o4 = orientation(q1x, q1y, q2x, q2y, p2x, p2y);

  if (o1 !== o2 && o3 !== o4) return true;
  if (o1 === 0 && onSegment(p1x, p1y, q1x, q1y, p2x, p2y)) return true;
  if (o2 === 0 && onSegment(p1x, p1y, q2x, q2y, p2x, p2y)) return true;
  if (o3 === 0 && onSegment(q1x, q1y, p1x, p1y, q2x, q2y)) return true;
  if (o4 === 0 && onSegment(q1x, q1y, p2x, p2y, q2x, q2y)) return true;

  return false;
}

/**
 * Checks whether a GeoJSON Polygon exterior ring has any self-intersecting edges
 * or collinear overlapping edges.
 */
export function isRingSelfIntersecting(ring: number[][]): boolean {
  if (!Array.isArray(ring) || ring.length < 4) return false;
  // Number of edges = ring.length - 1 (ring[0] === ring[last])
  const edgeCount = ring.length - 1;
  if (edgeCount < 3) return false;

  for (let i = 0; i < edgeCount; i++) {
    const a1: [number, number] = [ring[i][0], ring[i][1]];
    const a2: [number, number] = [ring[i + 1][0], ring[i + 1][1]];

    for (let j = i + 1; j < edgeCount; j++) {
      // Adjacent edges share a vertex — only reject if they overlap collinearly
      const isAdjacent =
        j === i + 1 || (i === 0 && j === edgeCount - 1);

      const b1: [number, number] = [ring[j][0], ring[j][1]];
      const b2: [number, number] = [ring[j + 1][0], ring[j + 1][1]];

      if (isAdjacent) {
        // Check for degenerate zero-length or collinear backtracking overlap
        const o = orientation(a1[0], a1[1], a2[0], a2[1], b2[0], b2[1]);
        const oAlt = orientation(a1[0], a1[1], a2[0], a2[1], b1[0], b1[1]);
        if (o === 0 && oAlt === 0) {
          // If the shared edge folds directly back onto itself
          const sameAsPrev =
            (i === 0 && j === edgeCount - 1 && onSegment(a1[0], a1[1], b1[0], b1[1], a2[0], a2[1])) ||
            (j === i + 1 && onSegment(a1[0], a1[1], b2[0], b2[1], a2[0], a2[1]));
          if (sameAsPrev) return true;
        }
        continue;
      }

      if (segmentsIntersect(a1, a2, b1, b2)) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Validates GeoJSON Polygon structure, coordinates, closure, non-self-intersection, and area.
 */
export function validatePolygonGeometry(
  polygon: GeoJSONPolygon | null | undefined
): { valid: boolean; selfIntersecting: boolean; error?: string } {
  if (!polygon || polygon.type !== 'Polygon' || !Array.isArray(polygon.coordinates)) {
    return { valid: false, selfIntersecting: false, error: 'Invalid polygon format.' };
  }

  const ring = polygon.coordinates[0];
  if (!Array.isArray(ring) || ring.length < 4) {
    return {
      valid: false,
      selfIntersecting: false,
      error: 'A field boundary needs at least 3 corners.',
    };
  }

  for (const coord of ring) {
    if (!Array.isArray(coord) || coord.length < 2 || !isValidCoordPair(coord[0], coord[1])) {
      return {
        valid: false,
        selfIntersecting: false,
        error: 'Polygon boundary contains invalid latitude or longitude values.',
      };
    }
  }

  const first = ring[0];
  const last = ring[ring.length - 1];
  if (first[0] !== last[0] || first[1] !== last[1]) {
    return {
      valid: false,
      selfIntersecting: false,
      error: 'Polygon boundary ring must be closed.',
    };
  }

  const uniqueVertices = new Set(ring.slice(0, -1).map(([lon, lat]) => `${lon},${lat}`));
  if (uniqueVertices.size < 3) {
    return {
      valid: false,
      selfIntersecting: false,
      error: 'Please place at least 3 distinct corners on the map.',
    };
  }

  if (isRingSelfIntersecting(ring)) {
    return {
      valid: false,
      selfIntersecting: true,
      error:
        'Boundary lines cross each other. Undo or adjust corners so edges do not intersect.',
    };
  }

  try {
    const areaSqM = turfArea(turfPolygon(polygon.coordinates));
    if (!Number.isFinite(areaSqM) || areaSqM <= 1) {
      return {
        valid: false,
        selfIntersecting: false,
        error: 'Boundary area is too small or degenerate. Place corners around a field.',
      };
    }
  } catch {
    return {
      valid: false,
      selfIntersecting: false,
      error: 'Unable to calculate area for this boundary.',
    };
  }

  return { valid: true, selfIntersecting: false };
}

function pointInRing(lon: number, lat: number, ring: number[][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0];
    const yi = ring[i][1];
    const xj = ring[j][0];
    const yj = ring[j][1];

    const intersect =
      yi > lat !== yj > lat &&
      lon < ((xj - xi) * (lat - yi)) / (yj - yi + 0.0) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

/**
 * Ray-casting point-in-polygon check (handles exterior ring and optional holes).
 */
export function isPointInPolygon(
  lat: number,
  lon: number,
  polygon: GeoJSONPolygon
): boolean {
  if (!polygon?.coordinates?.length) return false;
  const [exterior, ...holes] = polygon.coordinates;
  if (!pointInRing(lon, lat, exterior)) return false;
  for (const hole of holes) {
    if (pointInRing(lon, lat, hole)) return false;
  }
  return true;
}

/**
 * Computes a representative point guaranteed to lie strictly INSIDE the polygon.
 * First checks the shoelace planar centroid; if that lies outside (e.g. L-shaped or
 * crescent-shaped fields), scans horizontal chords inside the bounding box and returns
 * the midpoint of the widest interior chord.
 */
export function getRepresentativeInteriorPoint(
  polygon: GeoJSONPolygon
): LatLonPoint | null {
  const ring = polygon?.coordinates?.[0];
  if (!Array.isArray(ring) || ring.length < 4) return null;

  const openVerts = ring.slice(0, -1);
  if (openVerts.length < 3) return null;

  // 1. Shoelace polygon area centroid
  let twiceArea = 0;
  let cx = 0;
  let cy = 0;
  let minLon = Infinity;
  let maxLon = -Infinity;
  let minLat = Infinity;
  let maxLat = -Infinity;

  for (let i = 0; i < ring.length - 1; i++) {
    const [x0, y0] = ring[i];
    const [x1, y1] = ring[i + 1];
    const cross = x0 * y1 - x1 * y0;
    twiceArea += cross;
    cx += (x0 + x1) * cross;
    cy += (y0 + y1) * cross;

    if (x0 < minLon) minLon = x0;
    if (x0 > maxLon) maxLon = x0;
    if (y0 < minLat) minLat = y0;
    if (y0 > maxLat) maxLat = y0;
  }

  if (Math.abs(twiceArea) > EPSILON) {
    const centroidLon = cx / (3 * twiceArea);
    const centroidLat = cy / (3 * twiceArea);
    if (isPointInPolygon(centroidLat, centroidLon, polygon)) {
      return {
        lat: Number(centroidLat.toFixed(6)),
        lon: Number(centroidLon.toFixed(6)),
      };
    }
  }

  // Fallback arithmetic mean check
  const avgLon =
    openVerts.reduce((sum, [lon]) => sum + lon, 0) / openVerts.length;
  const avgLat =
    openVerts.reduce((sum, [, lat]) => sum + lat, 0) / openVerts.length;
  if (isPointInPolygon(avgLat, avgLon, polygon)) {
    return {
      lat: Number(avgLat.toFixed(6)),
      lon: Number(avgLon.toFixed(6)),
    };
  }

  // 2. Scan horizontal scanlines across bounding box to find longest interior chord
  const STEPS = 24;
  let bestWidth = -1;
  let bestPoint: LatLonPoint | null = null;

  const candidateLats = new Set<number>();
  for (let s = 1; s < STEPS; s++) {
    candidateLats.add(minLat + ((maxLat - minLat) * s) / STEPS);
  }
  // Include midpoints between consecutive sorted vertex latitudes
  const sortedUniqueLats = Array.from(
    new Set(openVerts.map(([, lat]) => lat))
  ).sort((a, b) => a - b);
  for (let i = 0; i < sortedUniqueLats.length - 1; i++) {
    candidateLats.add((sortedUniqueLats[i] + sortedUniqueLats[i + 1]) / 2);
  }

  for (const scanLat of candidateLats) {
    const intersections: number[] = [];
    for (let i = 0; i < ring.length - 1; i++) {
      const [x1, y1] = ring[i];
      const [x2, y2] = ring[i + 1];
      if ((y1 <= scanLat && y2 > scanLat) || (y2 <= scanLat && y1 > scanLat)) {
        const x = x1 + ((scanLat - y1) * (x2 - x1)) / (y2 - y1);
        intersections.push(x);
      }
    }
    intersections.sort((a, b) => a - b);
    for (let k = 0; k + 1 < intersections.length; k += 2) {
      const span = intersections[k + 1] - intersections[k];
      if (span > bestWidth) {
        const midLon = (intersections[k] + intersections[k + 1]) / 2;
        if (isPointInPolygon(scanLat, midLon, polygon)) {
          bestWidth = span;
          bestPoint = {
            lat: Number(scanLat.toFixed(6)),
            lon: Number(midLon.toFixed(6)),
          };
        }
      }
    }
  }

  if (bestPoint) return bestPoint;

  // 3. Final grid search fallback inside bounding box
  for (let iy = 1; iy < 16; iy++) {
    const lat = minLat + ((maxLat - minLat) * iy) / 16;
    for (let ix = 1; ix < 16; ix++) {
      const lon = minLon + ((maxLon - minLon) * ix) / 16;
      if (isPointInPolygon(lat, lon, polygon)) {
        return {
          lat: Number(lat.toFixed(6)),
          lon: Number(lon.toFixed(6)),
        };
      }
    }
  }

  return null;
}

/**
 * Computes full validation, area, and interior representative point for map vertices.
 */
export function computePolygonMetrics(
  vertices: Array<[number, number]>
): PolygonMetricsResult {
  if (vertices.length < 3) {
    return {
      valid: false,
      selfIntersecting: false,
      error: null,
      geojson: null,
      estimatedHectares: null,
      representativePoint: null,
    };
  }

  const geojson = ringToGeoJSON(vertices);
  if (!geojson) {
    return {
      valid: false,
      selfIntersecting: false,
      error: 'A field boundary needs at least 3 corners.',
      geojson: null,
      estimatedHectares: null,
      representativePoint: null,
    };
  }

  const check = validatePolygonGeometry(geojson);
  if (!check.valid) {
    return {
      valid: false,
      selfIntersecting: check.selfIntersecting,
      error: check.error || 'Invalid field boundary.',
      geojson: null,
      estimatedHectares: null,
      representativePoint: null,
    };
  }

  const sqMeters = turfArea(turfPolygon(geojson.coordinates));
  const estimatedHectares = sqMeters / 10000;
  const representativePoint = getRepresentativeInteriorPoint(geojson);

  return {
    valid: true,
    selfIntersecting: false,
    error: null,
    geojson,
    estimatedHectares,
    representativePoint,
  };
}
