import hashlib
import json
import math
import logging
import threading
import time
import re
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Optional, Tuple

import requests
try:
    from groq import Groq
except ImportError:
    Groq = None  # Optional AI integration, deterministic fallback remains available

from app.config import settings

logger = logging.getLogger("agroshift.services")

groq_client = Groq(api_key=settings.GROQ_API_KEY) if (Groq and settings.GROQ_API_KEY) else None

COPERNICUS_TOKEN_URL = "https://identity.dataspace.copernicus.eu/auth/realms/CDSE/protocol/openid-connect/token"
COPERNICUS_STATS_URL = "https://sh.dataspace.copernicus.eu/api/v1/statistics"
# Free non-commercial Open-Meteo endpoint: does not require or accept an API key.
OPEN_METEO_FORECAST_URL = "https://api.open-meteo.com/v1/forecast"

_provider_lock = threading.Lock()
_copernicus_token_cache: Dict[str, Any] = {
    "cred_hash": None,
    "access_token": None,
    "expires_at": 0.0,
}
_copernicus_cooldown_until: float = 0.0
_copernicus_cooldown_message: Optional[str] = None
_open_meteo_cooldown_until: float = 0.0
_open_meteo_cooldown_message: Optional[str] = None
_analysis_satellite_cache: Dict[str, Dict[str, Any]] = {}
_analysis_weather_cache: Dict[str, Dict[str, Any]] = {}

SATELLITE_SUCCESS_TTL_SECONDS = 900.0
SATELLITE_NO_SCENE_TTL_SECONDS = 180.0
WEATHER_SUCCESS_TTL_SECONDS = 300.0

_REDACT_SECRET_RE = re.compile(
    r"(Bearer\s+\S+|(?:client_secret|access_token|refresh_token|appid|api_key|apikey|token)=[^&\s]+)",
    re.IGNORECASE,
)


def clear_provider_caches() -> None:
    """Clear in-memory token, cooldown, and observation caches (used in tests)."""
    global _copernicus_cooldown_until, _copernicus_cooldown_message
    global _open_meteo_cooldown_until, _open_meteo_cooldown_message
    with _provider_lock:
        _copernicus_token_cache["cred_hash"] = None
        _copernicus_token_cache["access_token"] = None
        _copernicus_token_cache["expires_at"] = 0.0
        _copernicus_cooldown_until = 0.0
        _copernicus_cooldown_message = None
        _open_meteo_cooldown_until = 0.0
        _open_meteo_cooldown_message = None
        _analysis_satellite_cache.clear()
        _analysis_weather_cache.clear()


def _sanitize_provider_detail(raw: Any, max_len: int = 240) -> str:
    if not isinstance(raw, str):
        return ""
    cleaned = " ".join(raw.split())
    cleaned = _REDACT_SECRET_RE.sub("[REDACTED]", cleaned)
    return cleaned[:max_len]


def _extract_provider_error_detail(res: Any) -> str:
    """Extract a concise, secret-free error summary from a provider HTTP response."""
    parts = []
    try:
        payload = res.json()
    except (ValueError, TypeError, AttributeError):
        payload = None

    if isinstance(payload, dict):
        err = payload.get("error")
        if isinstance(err, dict):
            for key in ("code", "reason", "message"):
                val = err.get(key)
                if isinstance(val, str) and val.strip():
                    parts.append(val.strip())
            nested_errors = err.get("errors")
            if isinstance(nested_errors, list) and nested_errors:
                first = nested_errors[0]
                if isinstance(first, dict):
                    first_msg = first.get("message") or first.get("violation") or first.get("parameter")
                    if isinstance(first_msg, str) and first_msg.strip():
                        parts.append(first_msg.strip())
        elif isinstance(err, str) and err.strip():
            parts.append(err.strip())

        for key in ("error_description", "reason", "message", "detail"):
            val = payload.get(key)
            if isinstance(val, str) and val.strip() and val.strip() not in parts:
                parts.append(val.strip())

    if not parts:
        raw_text = getattr(res, "text", None)
        if isinstance(raw_text, str) and raw_text.strip():
            parts.append(raw_text.strip())

    return _sanitize_provider_detail(" | ".join(parts))


def _parse_retry_after_seconds(headers: Any, default_seconds: float = 60.0, max_seconds: float = 300.0) -> float:
    if not headers:
        return default_seconds
    raw = headers.get("Retry-After") if hasattr(headers, "get") else None
    parsed = _safe_number(raw, 1, max_seconds)
    if parsed is not None:
        return float(parsed)
    return default_seconds


def _invalidate_copernicus_token() -> None:
    with _provider_lock:
        _copernicus_token_cache["access_token"] = None
        _copernicus_token_cache["expires_at"] = 0.0


def _set_copernicus_cooldown(seconds: float, message: str) -> None:
    global _copernicus_cooldown_until, _copernicus_cooldown_message
    with _provider_lock:
        _copernicus_cooldown_until = max(_copernicus_cooldown_until, time.monotonic() + seconds)
        _copernicus_cooldown_message = message


def _get_active_copernicus_cooldown() -> Optional[str]:
    global _copernicus_cooldown_until, _copernicus_cooldown_message
    with _provider_lock:
        now = time.monotonic()
        if _copernicus_cooldown_until > now and _copernicus_cooldown_message:
            return _copernicus_cooldown_message
        if _copernicus_cooldown_until <= now:
            _copernicus_cooldown_until = 0.0
            _copernicus_cooldown_message = None
        return None


def _set_open_meteo_cooldown(seconds: float, message: str) -> None:
    global _open_meteo_cooldown_until, _open_meteo_cooldown_message
    with _provider_lock:
        _open_meteo_cooldown_until = max(_open_meteo_cooldown_until, time.monotonic() + seconds)
        _open_meteo_cooldown_message = message


def _get_active_open_meteo_cooldown() -> Optional[str]:
    global _open_meteo_cooldown_until, _open_meteo_cooldown_message
    with _provider_lock:
        now = time.monotonic()
        if _open_meteo_cooldown_until > now and _open_meteo_cooldown_message:
            return _open_meteo_cooldown_message
        if _open_meteo_cooldown_until <= now:
            _open_meteo_cooldown_until = 0.0
            _open_meteo_cooldown_message = None
        return None


# ---------------------------------------------------------------------------
# V1 heuristic thresholds.
#
# These are general-purpose, crop-agnostic heuristics used only to bucket raw
# NDVI/NDMI/weather values into human-readable bands for the dashboard and the
# AI explanation. They are NOT universal agronomic diagnostic thresholds -
# actual thresholds vary heavily by crop type, growth stage, season and soil.
# Treat all outputs as decision-support signals, not lab-grade diagnostics.
# ---------------------------------------------------------------------------
NDVI_THRESHOLDS = [
    (0.20, "VERY_LOW"),
    (0.35, "LOW"),
    (0.50, "MODERATE"),
    (0.65, "GOOD"),
]
NDVI_MAX_LABEL = "VERY_GOOD"

NDMI_THRESHOLDS = [
    (0.05, "VERY_LOW"),
    (0.15, "LOW"),
    (0.30, "MODERATE"),
]
NDMI_MAX_LABEL = "GOOD"

HEAT_THRESHOLDS = [
    (30.0, "LOW"),
    (38.0, "MODERATE"),
]
HEAT_MAX_LABEL = "HIGH"

RAINFALL_THRESHOLDS = [
    (2.0, "LOW"),
    (10.0, "MODERATE"),
]
RAINFALL_MAX_LABEL = "HIGH"


def _safe_number(value, minimum=None, maximum=None):
    try:
        if value is None or isinstance(value, bool):
            return None
        n = float(value)
        if not math.isfinite(n) or (minimum is not None and n < minimum) or (maximum is not None and n > maximum):
            return None
        return n
    except (ValueError, TypeError, OverflowError):
        return None


def _bucket(value: float, thresholds, max_label: str) -> str:
    if _safe_number(value) is None:
        return "UNKNOWN"
    for limit, label in thresholds:
        if value < limit:
            return label
    return max_label


def classify_ndvi(ndvi: float) -> str:
    return _bucket(ndvi, NDVI_THRESHOLDS, NDVI_MAX_LABEL)


def classify_ndmi(ndmi: float) -> str:
    return _bucket(ndmi, NDMI_THRESHOLDS, NDMI_MAX_LABEL)


def classify_heat(temp_c: float) -> str:
    return _bucket(temp_c, HEAT_THRESHOLDS, HEAT_MAX_LABEL)


def classify_rainfall(rainfall_mm: float) -> str:
    return _bucket(rainfall_mm, RAINFALL_THRESHOLDS, RAINFALL_MAX_LABEL)


def _extract_polygon_geometry(polygon_geojson: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    if not polygon_geojson or not isinstance(polygon_geojson, dict):
        return None
    if polygon_geojson.get("type") == "Feature":
        return polygon_geojson.get("geometry")
    return polygon_geojson


def _normalize_polygon_2d(geometry: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    """Return a clean GeoJSON Polygon with 2D [lng, lat] closed rings, or None if unusable."""
    if not isinstance(geometry, dict) or geometry.get("type") != "Polygon":
        return None
    coords = geometry.get("coordinates")
    if not isinstance(coords, list) or not coords:
        return None
    normalized_rings = []
    for ring in coords:
        if not isinstance(ring, list) or len(ring) < 4:
            return None
        clean_ring = []
        for point in ring:
            if not isinstance(point, (list, tuple)) or len(point) < 2:
                return None
            lon = _safe_number(point[0], -180, 180)
            lat = _safe_number(point[1], -90, 90)
            if lon is None or lat is None:
                return None
            clean_ring.append([float(lon), float(lat)])
        if clean_ring[0] != clean_ring[-1]:
            clean_ring.append(list(clean_ring[0]))
        normalized_rings.append(clean_ring)
    return {"type": "Polygon", "coordinates": normalized_rings}


def _compute_epsg4326_resolution(
    polygon_geometry: Optional[Dict[str, Any]],
    target_meters: float = 10.0,
) -> Tuple[float, float]:
    """
    Convert target metric resolution (10m for Sentinel-2) into EPSG:4326 degrees.

    Copernicus / Sentinel Hub Statistical API interprets `resx` and `resy` in the
    units of `input.bounds.properties.crs` (degrees for EPSG:4326). Passing `10`
    in EPSG:4326 requests 10-degree pixels (~1,110 km), causing HTTP 400 errors.
    """
    center_lat = 0.0
    span_x = 0.0
    span_y = 0.0

    coords = (polygon_geometry or {}).get("coordinates") if isinstance(polygon_geometry, dict) else None
    exterior = coords[0] if isinstance(coords, list) and coords and isinstance(coords[0], list) else []
    pts = [
        (float(p[0]), float(p[1]))
        for p in exterior
        if isinstance(p, (list, tuple)) and len(p) >= 2
        and _safe_number(p[0], -180, 180) is not None
        and _safe_number(p[1], -90, 90) is not None
    ]
    if pts:
        lngs = [p[0] for p in pts]
        lats = [p[1] for p in pts]
        min_lng, max_lng = min(lngs), max(lngs)
        min_lat, max_lat = min(lats), max(lats)
        center_lat = (min_lat + max_lat) / 2.0
        span_x = max(0.0, max_lng - min_lng)
        span_y = max(0.0, max_lat - min_lat)

    resy = target_meters / 111320.0
    cos_lat = max(0.1, math.cos(math.radians(center_lat)))
    resx = target_meters / (111320.0 * cos_lat)

    # Stay well below Sentinel Hub's 2500x2500 max synchronous pixel dimensions
    max_dim_px = 1500.0
    if span_x > 0 and (span_x / resx) > max_dim_px:
        resx = span_x / max_dim_px
    if span_y > 0 and (span_y / resy) > max_dim_px:
        resy = span_y / max_dim_px

    # Ensure ultra-small polygons still resolve to at least ~2 pixels across
    if 0 < span_x < resx:
        resx = max(span_x / 2.0, 1e-6)
    if 0 < span_y < resy:
        resy = max(span_y / 2.0, 1e-6)

    return round(resx, 8), round(resy, 8)


def _fallback_bbox_polygon(lat: float, lng: float, delta: float = 0.001) -> Dict[str, Any]:
    west, east = max(-180.0, lng - delta), min(180.0, lng + delta)
    south, north = max(-90.0, lat - delta), min(90.0, lat + delta)
    return {
        "type": "Polygon",
        "coordinates": [[
            [west, south],
            [east, south],
            [east, north],
            [west, north],
            [west, south],
        ]],
    }


def _acquire_copernicus_token(force_refresh: bool = False) -> Dict[str, Any]:
    client_id = (settings.COPERNICUS_CLIENT_ID or "").strip()
    client_secret = (settings.COPERNICUS_CLIENT_SECRET or "").strip()
    if not client_id or not client_secret:
        return {
            "ok": False,
            "error_kind": "missing_credentials",
            "message": "Satellite imagery is not configured on the analysis server.",
        }

    cooldown_msg = _get_active_copernicus_cooldown()
    if cooldown_msg:
        return {
            "ok": False,
            "error_kind": "rate_limited",
            "message": cooldown_msg,
        }

    cred_hash = hashlib.sha256(f"{client_id}:{client_secret}".encode("utf-8")).hexdigest()
    now = time.monotonic()
    if not force_refresh:
        with _provider_lock:
            if (
                _copernicus_token_cache["cred_hash"] == cred_hash
                and _copernicus_token_cache["access_token"]
                and _copernicus_token_cache["expires_at"] > now
            ):
                return {"ok": True, "token": _copernicus_token_cache["access_token"]}

    data = {
        "client_id": client_id,
        "client_secret": client_secret,
        "grant_type": "client_credentials",
    }

    last_status: Optional[int] = None
    for attempt in range(2):
        try:
            res = requests.post(COPERNICUS_TOKEN_URL, data=data, timeout=8)
        except requests.RequestException as exc:
            logger.warning("Copernicus token request failed (attempt %d): %s", attempt + 1, type(exc).__name__)
            if attempt == 0:
                time.sleep(0.5)
                continue
            return {
                "ok": False,
                "error_kind": "network_error",
                "message": "Satellite authentication service is temporarily unreachable. Please try again shortly.",
            }

        last_status = res.status_code
        if res.status_code == 200:
            try:
                payload = res.json() or {}
                token = payload.get("access_token")
                expires_in = _safe_number(payload.get("expires_in"), 30, 86400) or 300.0
                if not token:
                    return {
                        "ok": False,
                        "error_kind": "provider_error",
                        "message": "Satellite authentication returned an incomplete response.",
                    }
                ttl = max(30.0, float(expires_in) - 60.0)
                with _provider_lock:
                    _copernicus_token_cache["cred_hash"] = cred_hash
                    _copernicus_token_cache["access_token"] = token
                    _copernicus_token_cache["expires_at"] = time.monotonic() + ttl
                return {"ok": True, "token": token}
            except (ValueError, TypeError, AttributeError):
                return {
                    "ok": False,
                    "error_kind": "provider_error",
                    "message": "Satellite authentication returned an unreadable response.",
                }

        if res.status_code == 429:
            retry_after = _parse_retry_after_seconds(res.headers, default_seconds=60.0)
            msg = (
                f"Satellite imagery service is temporarily busy (rate limit reached). "
                f"Please wait about {int(round(retry_after))} seconds before refreshing."
            )
            _set_copernicus_cooldown(retry_after, msg)
            detail = _extract_provider_error_detail(res)
            logger.warning(
                "Copernicus token endpoint returned HTTP 429 (cooldown %ss)%s",
                int(round(retry_after)),
                f": {detail}" if detail else "",
            )
            return {"ok": False, "error_kind": "rate_limited", "message": msg}

        if res.status_code in (401, 403):
            _invalidate_copernicus_token()
            detail = _extract_provider_error_detail(res)
            logger.warning(
                "Copernicus token endpoint rejected credentials (HTTP %d)%s",
                res.status_code,
                f": {detail}" if detail else "",
            )
            return {
                "ok": False,
                "error_kind": "invalid_credentials",
                "message": "Satellite imagery could not be authorized on the server right now.",
            }

        if 500 <= res.status_code < 600 and attempt == 0:
            time.sleep(0.5)
            continue

        detail = _extract_provider_error_detail(res)
        logger.warning(
            "Copernicus token endpoint returned HTTP %d%s",
            res.status_code,
            f": {detail}" if detail else "",
        )
        break

    return {
        "ok": False,
        "error_kind": "provider_error",
        "message": f"Satellite imagery service is temporarily unavailable (HTTP {last_status}).",
    }


def get_copernicus_token() -> Optional[str]:
    result = _acquire_copernicus_token()
    if result.get("ok"):
        return result.get("token")
    return None


NDVI_NDMI_EVALSCRIPT = """
//VERSION=3
function setup() {
  return {
    input: [{ bands: ["B04", "B08", "B11", "SCL", "dataMask"] }],
    output: [
      { id: "ndvi", bands: 1, sampleType: "FLOAT32" },
      { id: "ndmi", bands: 1, sampleType: "FLOAT32" },
      { id: "dataMask", bands: 1 }
    ]
  };
}

function evaluatePixel(sample) {
  let ndvi = (sample.B08 - sample.B04) / (sample.B08 + sample.B04 + 1e-6);
  let ndmi = (sample.B08 - sample.B11) / (sample.B08 + sample.B11 + 1e-6);
  // SCL cloud/shadow classes: 3 cloud shadow, 8/9 cloud medium/high prob, 10 thin cirrus
  let cloudy = [3, 8, 9, 10].includes(sample.SCL) ? 0 : 1;
  let valid = sample.dataMask * cloudy;
  return {
    ndvi: [ndvi],
    ndmi: [ndmi],
    dataMask: [valid]
  };
}
"""


def fetch_sentinel2_indices(polygon_geometry: Dict[str, Any], token: str) -> Dict[str, Any]:
    """
    Query the Copernicus Data Space Sentinel Hub Statistical API for polygon-level
    NDVI/NDMI statistics, avoiding a full raster download.

    Returns a dict with satellite_available + (on success) ndvi, ndmi,
    satellite_observation_date, cloud_cover_percent.
    """
    now = datetime.now(timezone.utc)
    time_from = (now - timedelta(days=45)).strftime("%Y-%m-%dT00:00:00Z")
    time_to = now.strftime("%Y-%m-%dT23:59:59Z")
    resx, resy = _compute_epsg4326_resolution(polygon_geometry, target_meters=10.0)

    request_body = {
        "input": {
            "bounds": {
                "geometry": polygon_geometry,
                "properties": {"crs": "http://www.opengis.net/def/crs/EPSG/0/4326"},
            },
            "data": [{
                "type": "sentinel-2-l2a",
                "dataFilter": {
                    "maxCloudCoverage": 80,
                },
            }],
        },
        "aggregation": {
            "timeRange": {"from": time_from, "to": time_to},
            "aggregationInterval": {"of": "P1D"},
            "evalscript": NDVI_NDMI_EVALSCRIPT,
            "resx": resx,
            "resy": resy,
        },
    }

    res = None
    for attempt in range(2):
        try:
            res = requests.post(
                COPERNICUS_STATS_URL,
                headers={
                    "Authorization": f"Bearer {token}",
                    "Content-Type": "application/json",
                    "Accept": "application/json",
                },
                json=request_body,
                timeout=20,
            )
        except requests.RequestException as exc:
            logger.warning("Copernicus stats request failed (attempt %d): %s", attempt + 1, type(exc).__name__)
            if attempt == 0:
                time.sleep(0.5)
                continue
            return {
                "satellite_available": False,
                "satellite_error_kind": "network_error",
                "satellite_message": f"Satellite service request failed: {type(exc).__name__}.",
            }

        if res.status_code == 200:
            break

        detail = _extract_provider_error_detail(res)

        if res.status_code == 429:
            retry_after = _parse_retry_after_seconds(res.headers, default_seconds=60.0)
            msg = (
                f"Satellite imagery service is temporarily busy (rate limit reached). "
                f"Please wait about {int(round(retry_after))} seconds before refreshing."
            )
            _set_copernicus_cooldown(retry_after, msg)
            logger.warning(
                "Copernicus stats API returned HTTP 429 (cooldown %ss)%s",
                int(round(retry_after)),
                f": {detail}" if detail else "",
            )
            return {
                "satellite_available": False,
                "satellite_error_kind": "rate_limited",
                "satellite_message": msg,
            }

        if res.status_code in (401, 403):
            _invalidate_copernicus_token()
            logger.warning(
                "Copernicus stats API rejected token (HTTP %d)%s",
                res.status_code,
                f": {detail}" if detail else "",
            )
            return {
                "satellite_available": False,
                "satellite_error_kind": "invalid_credentials",
                "satellite_message": "Satellite imagery could not be authorized on the server right now.",
            }

        if res.status_code in (400, 422):
            logger.warning(
                "Copernicus stats API rejected request (HTTP %d)%s",
                res.status_code,
                f": {detail}" if detail else "",
            )
            return {
                "satellite_available": False,
                "satellite_error_kind": "invalid_request",
                "satellite_message": (
                    "Satellite imagery request was rejected for this field boundary or query parameters."
                ),
            }

        if 500 <= res.status_code < 600 and attempt == 0:
            logger.warning(
                "Copernicus stats API server error (HTTP %d, retrying)%s",
                res.status_code,
                f": {detail}" if detail else "",
            )
            time.sleep(0.5)
            continue

        logger.warning(
            "Copernicus stats API failed with HTTP %d%s",
            res.status_code,
            f": {detail}" if detail else "",
        )
        return {
            "satellite_available": False,
            "satellite_error_kind": "provider_error",
            "satellite_message": f"Satellite service returned HTTP {res.status_code}.",
        }

    if res is None or res.status_code != 200:
        return {
            "satellite_available": False,
            "satellite_error_kind": "provider_error",
            "satellite_message": "Satellite service is temporarily unavailable.",
        }

    try:
        payload = res.json()
        intervals = payload.get("data", [])
        if not isinstance(intervals, list):
            raise ValueError("Invalid observation list")
    except (ValueError, KeyError, TypeError, AttributeError):
        return {
            "satellite_available": False,
            "satellite_error_kind": "parse_error",
            "satellite_message": "Satellite service returned an unreadable response.",
        }

    best_candidate = None
    for entry in intervals:
        if not isinstance(entry, dict):
            continue
        outputs = entry.get("outputs") or {}
        if not isinstance(outputs, dict):
            continue
        ndvi_stats = outputs.get("ndvi", {}).get("bands", {}).get("B0", {}).get("stats")
        ndmi_stats = outputs.get("ndmi", {}).get("bands", {}).get("B0", {}).get("stats")
        if not ndvi_stats:
            continue

        sample_count = _safe_number(ndvi_stats.get("sampleCount"), 0)
        nodata_count = _safe_number(ndvi_stats.get("noDataCount"), 0)
        if sample_count is None or nodata_count is None or nodata_count > sample_count:
            continue
        valid_count = sample_count - nodata_count
        if sample_count <= 0 or valid_count <= 0:
            continue

        valid_fraction = valid_count / sample_count
        if valid_fraction < 0.15:
            continue  # too cloud-contaminated to be useful

        observation_date = str((entry.get("interval") or {}).get("from") or "")[:10]
        ndvi_value = _safe_number(ndvi_stats.get("mean"), -1, 1)
        ndmi_value = _safe_number((ndmi_stats or {}).get("mean"), -1, 1)
        if ndvi_value is None or not observation_date:
            continue
        candidate = {
            "date": observation_date,
            "ndvi": ndvi_value,
            "ndmi": ndmi_value,
            "valid_fraction": valid_fraction,
            "cloud_cover_percent": round((1 - valid_fraction) * 100, 1),
        }

        # Prefer the most recent date with a usable observation.
        if best_candidate is None or candidate["date"] > best_candidate["date"]:
            best_candidate = candidate

    if best_candidate is None or best_candidate["ndvi"] is None:
        return {
            "satellite_available": False,
            "satellite_error_kind": "no_clear_scene",
            "satellite_message": "No cloud-free Sentinel-2 observation was found for this area in the last 45 days.",
        }

    return {
        "satellite_available": True,
        "ndvi": round(float(best_candidate["ndvi"]), 3),
        "ndmi": round(float(best_candidate["ndmi"]), 3) if best_candidate["ndmi"] is not None else None,
        "satellite_observation_date": best_candidate["date"],
        "cloud_cover_percent": best_candidate["cloud_cover_percent"],
    }


def get_satellite_data(polygon_geojson: Optional[Dict[str, Any]], lat: float, lng: float) -> Dict[str, Any]:
    token_result = _acquire_copernicus_token()
    if not token_result.get("ok"):
        return {
            "satellite_available": False,
            "satellite_error_kind": token_result.get("error_kind") or "provider_error",
            "satellite_message": token_result.get("message") or "Satellite imagery is temporarily unavailable.",
        }

    extracted = _extract_polygon_geometry(polygon_geojson)
    if extracted is not None:
        geometry = _normalize_polygon_2d(extracted)
        if geometry is None:
            logger.warning("Copernicus satellite request aborted locally: invalid GeoJSON polygon")
            return {
                "satellite_available": False,
                "satellite_error_kind": "invalid_request",
                "satellite_message": (
                    "Satellite imagery request was rejected for this field boundary or query parameters."
                ),
            }
    else:
        geometry = _fallback_bbox_polygon(lat, lng)

    try:
        result = fetch_sentinel2_indices(geometry, token_result["token"])
        # If the cached token just expired remotely, refresh once unless rate-limited
        if result.get("satellite_error_kind") == "invalid_credentials":
            retry_token = _acquire_copernicus_token(force_refresh=True)
            if retry_token.get("ok"):
                result = fetch_sentinel2_indices(geometry, retry_token["token"])
        return result
    except (TypeError, ValueError, KeyError, AttributeError, OverflowError) as exc:
        logger.warning("Invalid satellite provider response: %s", type(exc).__name__)
        return {
            "satellite_available": False,
            "satellite_error_kind": "parse_error",
            "satellite_message": "Satellite observations are temporarily unavailable.",
        }


WEATHER_MAX_ATTEMPTS = 3  # 1 initial attempt + 2 retries for 5xx server errors only
WEATHER_BACKOFF_SECONDS = [1, 2]  # wait before retry 1, then before retry 2


def _is_retryable_weather_status(status_code: int) -> bool:
    # Never retry HTTP 429 rate-limit responses; retrying multiplies quota pressure.
    return 500 <= status_code < 600


def _fetch_open_meteo(lat: float, lng: float) -> Dict[str, Any]:
    """Primary weather provider. Uses Open-Meteo's free forecast API (no API key
    required). Retries transient 5xx responses only and cools down on HTTP 429."""
    cooldown_msg = _get_active_open_meteo_cooldown()
    if cooldown_msg:
        logger.info("[WEATHER-DIAG] Open-Meteo skipped: active 429 cooldown")
        return {
            "weather_available": False,
            "weather_error_kind": "rate_limited",
            "weather_message": cooldown_msg,
        }

    params = {
        "latitude": lat,
        "longitude": lng,
        "daily": "temperature_2m_max,precipitation_sum,relative_humidity_2m_mean",
        "timezone": "auto",
        "forecast_days": 1,
        "past_days": 1,
    }

    logger.info("[WEATHER-DIAG] Attempting Open-Meteo")

    res = None
    for attempt in range(WEATHER_MAX_ATTEMPTS):
        try:
            res = requests.get(OPEN_METEO_FORECAST_URL, params=params, timeout=6)
        except requests.RequestException as exc:
            logger.warning("Open-Meteo request failed: %s", type(exc).__name__)
            logger.info("[WEATHER-DIAG] Open-Meteo result: network failure")
            return {
                "weather_available": False,
                "weather_error_kind": "network_error",
                "weather_message": "Weather service request failed. Please try again shortly.",
            }

        if res.status_code == 200 or not _is_retryable_weather_status(res.status_code):
            break

        is_last_attempt = attempt == WEATHER_MAX_ATTEMPTS - 1
        logger.warning(
            "Open-Meteo returned HTTP %d (attempt %d/%d)%s",
            res.status_code,
            attempt + 1,
            WEATHER_MAX_ATTEMPTS,
            "" if is_last_attempt else ", retrying",
        )
        if is_last_attempt:
            break

        wait_seconds = WEATHER_BACKOFF_SECONDS[attempt]
        retry_after = res.headers.get("Retry-After")
        if retry_after:
            delay = _safe_number(retry_after, 0, 10)
            if delay is not None:
                wait_seconds = max(wait_seconds, delay)
        time.sleep(wait_seconds)

    if res.status_code == 429:
        retry_after = _parse_retry_after_seconds(res.headers, default_seconds=60.0)
        msg = (
            f"Weather service is temporarily busy (rate limit reached). "
            f"Please wait about {int(round(retry_after))} seconds before refreshing."
        )
        _set_open_meteo_cooldown(retry_after, msg)
        detail = _extract_provider_error_detail(res)
        logger.warning(
            "Open-Meteo returned HTTP 429 (cooldown %ss, not retrying)%s",
            int(round(retry_after)),
            f": {detail}" if detail else "",
        )
        logger.info("[WEATHER-DIAG] Open-Meteo result: failed with HTTP status code=429 (no retry)")
        return {
            "weather_available": False,
            "weather_error_kind": "rate_limited",
            "weather_message": msg,
        }
    if res.status_code != 200:
        detail = _extract_provider_error_detail(res)
        logger.warning(
            "Open-Meteo returned HTTP %d%s",
            res.status_code,
            f": {detail}" if detail else "",
        )
        logger.info("[WEATHER-DIAG] Open-Meteo result: failed with HTTP status code=%d", res.status_code)
        return {
            "weather_available": False,
            "weather_error_kind": "invalid_request" if res.status_code == 400 else "provider_error",
            "weather_message": f"Weather service returned HTTP {res.status_code}.",
        }

    try:
        daily = res.json().get("daily") or {}
        temps = daily.get("temperature_2m_max") or []
        hums = daily.get("relative_humidity_2m_mean") or []
        rains = daily.get("precipitation_sum") or []

        if not temps or temps[-1] is None:
            logger.info("[WEATHER-DIAG] Open-Meteo result: failed with HTTP status code=200 (no usable data)")
            return {
                "weather_available": False,
                "weather_error_kind": "no_observation",
                "weather_message": "Weather service returned no usable data for this location.",
            }

        temperature = _safe_number(temps[-1], -100, 70)
        if temperature is None:
            return {
                "weather_available": False,
                "weather_error_kind": "parse_error",
                "weather_message": "Weather service returned invalid temperature data.",
            }
        humidity = _safe_number(hums[-1], 0, 100) if hums else None
        rainfall = _safe_number(rains[-1], 0, 2000) if rains else None
        logger.info("[WEATHER-DIAG] Open-Meteo result: success")
        return {
            "weather_available": True,
            "weather_source": "open-meteo",
            "temperature_c": temperature,
            "humidity_percent": round(humidity) if humidity is not None else None,
            "recent_rainfall_mm": rainfall,
        }
    except (ValueError, KeyError, IndexError, TypeError, AttributeError):
        logger.info("[WEATHER-DIAG] Open-Meteo result: response parsing failure")
        return {
            "weather_available": False,
            "weather_error_kind": "parse_error",
            "weather_message": "Weather service returned an unreadable response.",
        }


OPENWEATHERMAP_FORECAST_URL = "https://api.openweathermap.org/data/2.5/forecast"
OPENWEATHERMAP_TIMEOUT_SECONDS = 6


def _fetch_openweathermap_fallback(lat: float, lng: float) -> Dict[str, Any]:
    """Secondary weather provider, used only when Open-Meteo is unavailable.

    Uses the free 5-day/3-hour forecast endpoint (not One Call 3.0). The response
    has no daily aggregates, so today's 3-hour entries - determined from the
    response's city timezone offset, not the server's local time - are aggregated
    into daily-equivalent values (max temperature, average humidity, total
    rainfall) matching the semantics of Open-Meteo's temperature_2m_max /
    relative_humidity_2m_mean / precipitation_sum.
    """
    try:
        res = requests.get(
            OPENWEATHERMAP_FORECAST_URL,
            params={
                "lat": lat,
                "lon": lng,
                "appid": settings.OPENWEATHER_API_KEY,
                "units": "metric",
            },
            timeout=OPENWEATHERMAP_TIMEOUT_SECONDS,
        )
    except requests.RequestException as exc:
        logger.warning("OpenWeatherMap fallback request failed: %s", exc)
        logger.info("[WEATHER-DIAG] OpenWeatherMap result: network failure")
        return {"weather_available": False, "weather_message": "Weather service request failed."}

    if res.status_code != 200:
        # Safe short error message only (e.g. OpenWeatherMap's {"message": "..."}).
        # Never log the request URL or params here, since the API key is a query param.
        safe_error_message = None
        try:
            safe_error_message = res.json().get("message")
        except (ValueError, AttributeError):
            pass
        if safe_error_message:
            safe_error_message = str(safe_error_message)[:200]
        logger.warning("OpenWeatherMap fallback returned HTTP %d: %s", res.status_code, safe_error_message)
        logger.info(
            "[WEATHER-DIAG] OpenWeatherMap result: failed with HTTP status code=%d, message=%s",
            res.status_code,
            safe_error_message,
        )
        return {"weather_available": False, "weather_message": "Weather service returned no usable data for this location."}

    try:
        payload = res.json()
        entries = payload.get("list", [])
        tz_offset_seconds = payload.get("city", {}).get("timezone", 0)

        if not entries:
            logger.info("[WEATHER-DIAG] OpenWeatherMap result: response parsing failure (no forecast entries)")
            return {"weather_available": False, "weather_message": "Weather service returned no usable data for this location."}

        local_today = (datetime.now(timezone.utc) + timedelta(seconds=tz_offset_seconds)).date()

        todays_temps = []
        todays_humidity = []
        todays_rain_mm = 0.0
        matched_any = False

        for entry in entries:
            dt_unix = entry.get("dt")
            if dt_unix is None:
                continue
            entry_local_date = (
                datetime.fromtimestamp(dt_unix, tz=timezone.utc) + timedelta(seconds=tz_offset_seconds)
            ).date()
            if entry_local_date != local_today:
                continue

            main = entry.get("main", {})
            temp = main.get("temp")
            if temp is None:
                continue

            temperature = _safe_number(temp, -100, 70)
            if temperature is None:
                continue
            matched_any = True
            todays_temps.append(temperature)
            humidity = main.get("humidity")
            if humidity is not None:
                valid_humidity = _safe_number(humidity, 0, 100)
                if valid_humidity is not None:
                    todays_humidity.append(valid_humidity)
            rain = _safe_number((entry.get("rain") or {}).get("3h", 0), 0, 2000)
            if rain is not None:
                todays_rain_mm += rain

        if not matched_any:
            logger.info("[WEATHER-DIAG] OpenWeatherMap result: no usable entries for local current date")
            return {"weather_available": False, "weather_message": "Weather service returned no usable data for this location."}

        logger.info("[WEATHER-DIAG] OpenWeatherMap result: success")
        return {
            "weather_available": True,
            "weather_source": "openweathermap",
            "temperature_c": round(max(todays_temps), 1),
            "humidity_percent": round(sum(todays_humidity) / len(todays_humidity)) if todays_humidity else None,
            "recent_rainfall_mm": round(todays_rain_mm, 1),
        }
    except (ValueError, KeyError, IndexError, TypeError, OSError, AttributeError, OverflowError):
        logger.info("[WEATHER-DIAG] OpenWeatherMap result: response parsing failure")
        return {"weather_available": False, "weather_message": "Weather service returned an unreadable response."}


def get_weather_data(lat: float, lng: float) -> Dict[str, Any]:
    primary_result = _fetch_open_meteo(lat, lng)
    if primary_result.get("weather_available"):
        logger.info("Weather data obtained from provider=open-meteo")
        return primary_result

    fallback_eligible = bool(settings.OPENWEATHER_API_KEY)
    logger.info("[WEATHER-DIAG] OpenWeatherMap fallback eligible: %s", fallback_eligible)

    if not fallback_eligible:
        return primary_result

    logger.warning("Open-Meteo unavailable, attempting OpenWeatherMap fallback")
    logger.info("[WEATHER-DIAG] Attempting OpenWeatherMap fallback")
    fallback_result = _fetch_openweathermap_fallback(lat, lng)
    if fallback_result.get("weather_available"):
        logger.info("Weather data obtained from provider=openweathermap")
        return fallback_result

    logger.warning("OpenWeatherMap fallback also unavailable")
    return primary_result


def compute_confidence(satellite_available: bool, weather_available: bool, cloud_cover_percent: Optional[float]) -> str:
    if not satellite_available or not weather_available:
        return "LOW"
    if cloud_cover_percent is not None and cloud_cover_percent > 40:
        return "MEDIUM"
    return "HIGH"


# ---------------------------------------------------------------------------
# ASCII-safe text sanitization for AI-generated text only.
#
# Groq output can include "smart" Unicode punctuation (en/em dashes, curly
# quotes, non-breaking or narrow no-break spaces, ellipsis characters). These
# render fine in UTF-8-aware terminals but show up as mojibake (e.g. "38.4â¯Â°C")
# in some Windows consoles / codepages. We normalize them to plain ASCII
# equivalents. This does not touch any numeric/satellite/weather/rule values,
# only the free-text ai_explanation/recommendations strings.
# ---------------------------------------------------------------------------
_UNICODE_PUNCTUATION_MAP = {
    "‐": "-", "‑": "-", "‒": "-", "–": "-", "—": "-", "―": "-",
    "‘": "'", "’": "'", "‚": "'", "‛": "'",
    "“": '"', "”": '"', "„": '"', "‟": '"',
    "…": "...",
    " ": " ", " ": " ", " ": " ", " ": " ", "⁠": "", "﻿": "",
    "•": "-", "·": "-",
}

PLAIN_TEXT_INSTRUCTION = (
    "Formatting rule: use only plain ASCII punctuation - a regular hyphen (-), regular spaces, "
    "straight quotes, and the degree symbol only if directly followed by C with a plain space "
    "(e.g. \"38.4 C\"). Do not use en dashes, em dashes, curly/smart quotes, ellipsis characters, "
    "non-breaking spaces, or narrow no-break spaces."
)


def sanitize_ai_text(text: Any) -> Any:
    if not isinstance(text, str):
        return text
    for bad_char, replacement in _UNICODE_PUNCTUATION_MAP.items():
        text = text.replace(bad_char, replacement)
    return text


def sanitize_ai_result(ai_result: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "ai_explanation": sanitize_ai_text(ai_result.get("ai_explanation", "")),
        "recommendations": [sanitize_ai_text(rec) for rec in (ai_result.get("recommendations") or []) if isinstance(rec, str)],
    }


def build_ai_prompt(lang: str, facts: Dict[str, Any]) -> str:
    facts_json = json.dumps(facts, ensure_ascii=False, indent=2)

    if lang == "en":
        return f"""You explain remote-sensing and weather indicators for a selected agricultural area. You are an
explanation layer only - you interpret the structured facts below, you do not diagnose or measure anything yourself.

You must ONLY use the structured facts provided below. Never invent or estimate NDVI, NDMI, rainfall, soil
moisture, crop type, disease, pests, soil NPK values, fertilizer dosage, irrigation quantities, or yield beyond
what is given.

Strict guardrails - do not do any of the following:
- Do not identify or guess a specific crop type.
- Do not diagnose a disease or pest.
- Do not state exact soil moisture, NPK, or fertilizer amounts.
- Do not prescribe exact irrigation quantities or a fertilizer dosage.
- Do not guarantee a yield outcome or make a definitive crop-health verdict.

Wording guidance - prefer neutral, cautious phrasing:
- Say "relatively strong vegetation activity" or "higher vegetation activity" instead of "healthy vegetation".
- Say "conditions may indicate increasing moisture stress" instead of "the crops may be approaching water stress".
- Use terms like "vegetation activity", "moisture condition", "possible moisture stress", "conditions may indicate...",
  "consider checking...", "verify...", "inspect..." rather than "healthy crop", "unhealthy crop", "your crop is
  stressed", "the field needs irrigation", or "you should irrigate now".
- The dashboard already shows the exact numbers - interpret them, don't just restate every value.

Data availability: check the "satellite_available" and "weather_available" fields in the structured facts before
writing anything. If a source is unavailable (false), its fields will be null - never describe or imply a value
for it. If only weather is available, say so and explain that vegetation/moisture indicators cannot be assessed
until satellite data is available. If only satellite is available, say so and explain that current weather
conditions cannot be assessed until weather data is available. If neither is available, clearly state that a full
analysis could not be completed. Recommendations must never refer to an unavailable measurement as if it were known.

{PLAIN_TEXT_INSTRUCTION}

Structured facts:
{facts_json}

Return STRICTLY valid JSON with this shape:
{{
  "ai_explanation": "2-4 concise sentences interpreting the most important signals (vegetation activity, moisture, heat/rainfall context, and whether a moisture-stress signal is present) in plain, non-technical language.",
  "recommendations": ["2-3 cautious, actionable recommendations - no exact quantities, dosages, or diagnoses"]
}}"""

    return f"""آپ منتخب زرعی رقبے کے سیٹلائٹ اور موسمی اشاریوں کی وضاحت کرتے ہیں۔ آپ صرف ایک وضاحتی تہہ ہیں - آپ نیچے
دیے گئے ساختہ حقائق کی تشریح کرتے ہیں، خود کوئی پیمائش یا تشخیص نہیں کرتے۔

آپ کو صرف نیچے دیے گئے ساختہ حقائق استعمال کرنے ہیں۔ NDVI، NDMI، بارش، مٹی کی نمی، فصل کی قسم، بیماری، کیڑے،
مٹی کے NPK اعداد، کھاد کی مقدار، آبپاشی کی مقدار، یا پیداوار ہرگز خود سے نہ بنائیں۔

سخت حدود:
- کسی مخصوص فصل کی قسم کی شناخت یا اندازہ نہ لگائیں۔
- کسی بیماری یا کیڑے کی تشخیص نہ کریں۔
- مٹی کی نمی، NPK، یا کھاد کی صحیح مقدار نہ بتائیں۔
- آبپاشی کی صحیح مقدار یا کھاد کی خوراک تجویز نہ کریں۔
- پیداوار کی ضمانت یا فصل کی صحت کا حتمی فیصلہ نہ دیں۔

الفاظ کا انتخاب - محتاط اور غیر جانبدار زبان استعمال کریں:
"نباتاتی سرگرمی زیادہ ہے" جیسے الفاظ استعمال کریں، "فصل صحت مند ہے" کہنے کے بجائے۔ "حالات نمی کے دباؤ کی طرف اشارہ کر
سکتے ہیں" کہیں، "فصل پانی کی کمی کا شکار ہو رہی ہے" کہنے کے بجائے۔ "ظاہر کر سکتا ہے"، "معائنہ کرنے پر غور کریں"،
"چیک کریں"، "تصدیق کریں" جیسے الفاظ استعمال کریں۔ ڈیش بورڈ پر تمام اعداد پہلے سے موجود ہیں - انہیں دہرانے کے بجائے
ان کی مختصر تشریح کریں۔

ڈیٹا کی دستیابی: لکھنے سے پہلے ساختہ حقائق میں "satellite_available" اور "weather_available" کی قدریں چیک کریں۔
اگر کوئی ذریعہ دستیاب نہیں (false) تو اس کی قدریں null ہوں گی - ایسی صورت میں اس کے بارے میں کوئی قدر بیان یا فرض نہ
کریں۔ اگر صرف موسمی ڈیٹا دستیاب ہے تو یہ واضح کریں اور بتائیں کہ نباتاتی و نمی کے اشاریوں کا اندازہ سیٹلائٹ ڈیٹا کے
بغیر نہیں لگایا جا سکتا۔ اگر صرف سیٹلائٹ ڈیٹا دستیاب ہے تو یہ واضح کریں اور بتائیں کہ موجودہ موسمی حالات کا اندازہ
موسمی ڈیٹا کے بغیر نہیں لگایا جا سکتا۔ اگر دونوں دستیاب نہیں تو واضح طور پر کہیں کہ مکمل تجزیہ ممکن نہیں۔ تجاویز میں
کبھی بھی کسی غیر دستیاب پیمائش کا یوں ذکر نہ کریں جیسے وہ معلوم ہو۔

فارمیٹنگ اصول: صرف سادہ ASCII اعداد اور عام ہائیفن (-) استعمال کریں جہاں انگریزی نمبر یا یونٹ لکھیں
(مثلا "38.4 C")۔ خاص یونیکوڈ ڈیش، خمدار حوالہ جاتی علامات، یا نان بریکنگ اسپیس استعمال نہ کریں۔

ساختہ حقائق:
{facts_json}

صرف اور صرف درست JSON فارمیٹ میں جواب دیں:
{{
  "ai_explanation": "نباتاتی سرگرمی، نمی، موسمی حالات، اور ممکنہ نمی کے دباؤ کے بارے میں 2-4 مختصر اور سادہ جملے۔",
  "recommendations": ["2-3 محتاط اور عملی تجاویز - بغیر صحیح مقدار، خوراک، یا تشخیص کے"]
}}"""


def default_ai_response(lang: str, satellite_available: bool, weather_available: bool) -> Dict[str, Any]:
    """
    Static fallback text used when Groq is unavailable or its response could not be parsed.
    Wording must always match what data actually came back - never imply a measurement
    is known when its source (satellite or weather) was unavailable for this request.
    """
    if lang == "en":
        if satellite_available and weather_available:
            return {
                "ai_explanation": "Structured vegetation and weather indicators were calculated for this area, but "
                                   "an AI-generated interpretation is not available right now. The measurements "
                                   "above reflect the current satellite and weather data for the selected area.",
                "recommendations": [
                    "Inspect the selected area for visible signs of moisture stress.",
                    "Consider checking field moisture and irrigation coverage if low rainfall continues.",
                    "Continue monitoring vegetation and weather conditions over the coming days.",
                ],
            }
        if weather_available and not satellite_available:
            return {
                "ai_explanation": "Weather indicators were retrieved successfully for the selected area, but "
                                   "satellite indicators are currently unavailable. The available weather data "
                                   "shows the current environmental conditions, while vegetation and "
                                   "satellite-derived moisture conditions cannot be assessed until satellite data "
                                   "becomes available.",
                "recommendations": [
                    "Review the available weather conditions shown above.",
                    "Check back later for satellite-based vegetation and moisture indicators.",
                    "Consider a field visit to assess vegetation and moisture conditions directly in the meantime.",
                ],
            }
        if satellite_available and not weather_available:
            return {
                "ai_explanation": "Satellite indicators were retrieved successfully for the selected area, but "
                                   "weather indicators are currently unavailable. The available satellite data "
                                   "shows vegetation and moisture conditions, while current temperature, humidity, "
                                   "and rainfall cannot be assessed until weather data becomes available.",
                "recommendations": [
                    "Review the available vegetation and moisture indicators shown above.",
                    "Check back later for current weather conditions for this area.",
                    "Consider a field visit to verify current temperature and moisture conditions in the meantime.",
                ],
            }
        return {
            "ai_explanation": "Neither satellite nor weather data could be retrieved for the selected area, so a "
                               "full analysis is not currently available.",
            "recommendations": [
                "Try the analysis again later once satellite and weather data sources are reachable.",
                "Consider verifying the selected location or trying a nearby area.",
                "In the meantime, consider a field visit to assess current conditions directly.",
            ],
        }

    if satellite_available and weather_available:
        return {
            "ai_explanation": "اس رقبے کے لیے نباتاتی اور موسمی اشاریے حاصل کر لیے گئے ہیں، لیکن اس وقت AI کی تفصیلی "
                               "تشریح دستیاب نہیں۔ اوپر دی گئی اقدار موجودہ سیٹلائٹ اور موسمی ڈیٹا کی عکاسی کرتی ہیں۔",
            "recommendations": [
                "منتخب رقبے میں نمی کے دباؤ کی ظاہری علامات کے لیے معائنہ کریں۔",
                "اگر بارش کم ہو رہی ہے تو زمین کی نمی اور آبپاشی کی صورتحال چیک کرنے پر غور کریں۔",
                "اگلے چند دنوں تک نباتات اور موسمی حالات کی نگرانی جاری رکھیں۔",
            ],
        }
    if weather_available and not satellite_available:
        return {
            "ai_explanation": "اس رقبے کے لیے موسمی اشاریے کامیابی سے حاصل کر لیے گئے ہیں، لیکن سیٹلائٹ اشاریے اس "
                               "وقت دستیاب نہیں۔ موجودہ موسمی ڈیٹا ماحولیاتی حالات ظاہر کرتا ہے، جبکہ نباتاتی سرگرمی "
                               "اور سیٹلائٹ سے حاصل ہونے والی نمی کی صورتحال کا اندازہ سیٹلائٹ ڈیٹا دستیاب ہونے تک "
                               "نہیں لگایا جا سکتا۔",
            "recommendations": [
                "اوپر دی گئی موسمی صورتحال کا جائزہ لیں۔",
                "سیٹلائٹ پر مبنی نباتاتی اور نمی کے اشاریوں کے لیے بعد میں دوبارہ چیک کریں۔",
                "اس دوران نباتات اور نمی کی صورتحال جانچنے کے لیے کھیت کا معائنہ کرنے پر غور کریں۔",
            ],
        }
    if satellite_available and not weather_available:
        return {
            "ai_explanation": "اس رقبے کے لیے سیٹلائٹ اشاریے کامیابی سے حاصل کر لیے گئے ہیں، لیکن موسمی اشاریے اس "
                               "وقت دستیاب نہیں۔ موجودہ سیٹلائٹ ڈیٹا نباتاتی سرگرمی اور نمی کی صورتحال ظاہر کرتا ہے، "
                               "جبکہ موجودہ درجہ حرارت، نمی اور بارش کا اندازہ موسمی ڈیٹا دستیاب ہونے تک نہیں لگایا "
                               "جا سکتا۔",
            "recommendations": [
                "اوپر دی گئی نباتاتی اور نمی کی صورتحال کا جائزہ لیں۔",
                "اس رقبے کے موجودہ موسمی حالات کے لیے بعد میں دوبارہ چیک کریں۔",
                "اس دوران موجودہ درجہ حرارت اور نمی کی تصدیق کے لیے کھیت کا معائنہ کرنے پر غور کریں۔",
            ],
        }
    return {
        "ai_explanation": "اس منتخب رقبے کے لیے نہ سیٹلائٹ اور نہ ہی موسمی ڈیٹا حاصل کیا جا سکا، اس لیے مکمل تجزیہ "
                           "اس وقت دستیاب نہیں۔",
        "recommendations": [
            "سیٹلائٹ اور موسمی ڈیٹا دستیاب ہونے کے بعد دوبارہ کوشش کریں۔",
            "منتخب مقام کی تصدیق کریں یا قریبی رقبے کو آزمائیں۔",
            "اس دوران موجودہ حالات جانچنے کے لیے کھیت کا معائنہ کرنے پر غور کریں۔",
        ],
    }


def get_ai_explanation(lang: str, facts: Dict[str, Any]) -> Dict[str, Any]:
    satellite_available = bool(facts.get("satellite_available", False))
    weather_available = bool(facts.get("weather_available", False))
    fallback = sanitize_ai_result(default_ai_response(lang, satellite_available, weather_available))
    if not groq_client:
        return fallback

    prompt = build_ai_prompt(lang, facts)
    try:
        response = groq_client.chat.completions.create(
            model="openai/gpt-oss-120b",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.2,
        )
        content = response.choices[0].message.content.strip()
        if content.startswith("```json"):
            content = content[7:]
        if content.startswith("```"):
            content = content[3:]
        if content.endswith("```"):
            content = content[:-3]

        parsed = json.loads(content.strip())
        if (isinstance(parsed, dict) and isinstance(parsed.get("ai_explanation"), str)
                and isinstance(parsed.get("recommendations"), list)):
            return sanitize_ai_result(
                {"ai_explanation": parsed["ai_explanation"], "recommendations": parsed["recommendations"]}
            )
    except Exception:
        pass

    return fallback


def _analysis_coord_key(lat: float, lng: float) -> str:
    return f"{round(float(lat), 5):.5f},{round(float(lng), 5):.5f}"


def _weather_coord_key(lat: float, lng: float) -> str:
    # Gridded weather forecast (~11 km cell); 3 decimals (~110 m) avoids duplicate calls on slight pin nudges.
    return f"{round(float(lat), 3):.3f},{round(float(lng), 3):.3f}"


def _analysis_satellite_key(lat: float, lng: float, polygon_geojson: Optional[Dict[str, Any]]) -> str:
    geom = _extract_polygon_geometry(polygon_geojson)
    geom_sig = hashlib.sha256(
        json.dumps(geom, sort_keys=True, separators=(",", ":")).encode("utf-8")
    ).hexdigest()[:16] if geom else "point"
    return f"{_analysis_coord_key(lat, lng)}:{geom_sig}"


def _cached_weather_for_analysis(lat: float, lng: float) -> Dict[str, Any]:
    key = _weather_coord_key(lat, lng)
    now = time.monotonic()
    with _provider_lock:
        entry = _analysis_weather_cache.get(key)
        if entry and entry["expires_at"] > now:
            return dict(entry["data"])

    weather = get_weather_data(lat, lng)
    if weather.get("weather_available"):
        with _provider_lock:
            _analysis_weather_cache[key] = {
                "expires_at": time.monotonic() + WEATHER_SUCCESS_TTL_SECONDS,
                "data": dict(weather),
            }
    return weather


def _cached_satellite_for_analysis(
    polygon_geojson: Optional[Dict[str, Any]],
    lat: float,
    lng: float,
) -> Dict[str, Any]:
    key = _analysis_satellite_key(lat, lng, polygon_geojson)
    now = time.monotonic()
    with _provider_lock:
        entry = _analysis_satellite_cache.get(key)
        if entry and entry["expires_at"] > now:
            return dict(entry["data"])

    satellite = get_satellite_data(polygon_geojson, lat, lng)
    ttl: Optional[float] = None
    if satellite.get("satellite_available"):
        ttl = SATELLITE_SUCCESS_TTL_SECONDS
    elif "no cloud-free" in str(satellite.get("satellite_message") or "").lower():
        ttl = SATELLITE_NO_SCENE_TTL_SECONDS

    if ttl is not None:
        with _provider_lock:
            _analysis_satellite_cache[key] = {
                "expires_at": time.monotonic() + ttl,
                "data": dict(satellite),
            }
    return satellite


def process_farm_analysis(
    lat: float,
    lng: float,
    acres: Optional[float],
    polygon_geojson: Optional[Dict[str, Any]],
    lang: str,
) -> Dict[str, Any]:
    lang = (lang or "ur").strip().lower()

    weather = _cached_weather_for_analysis(lat, lng)
    satellite = _cached_satellite_for_analysis(polygon_geojson, lat, lng)

    ndvi = satellite.get("ndvi")
    ndmi = satellite.get("ndmi")
    ndvi_status = classify_ndvi(ndvi) if ndvi is not None else None
    ndmi_status = classify_ndmi(ndmi) if ndmi is not None else None

    temp_c = weather.get("temperature_c")
    humidity = weather.get("humidity_percent")
    rainfall = weather.get("recent_rainfall_mm")
    heat_risk = classify_heat(temp_c) if temp_c is not None else None
    rainfall_status = classify_rainfall(rainfall) if rainfall is not None else None

    possible_water_stress = None
    if ndmi_status is not None and heat_risk is not None and rainfall_status is not None:
        possible_water_stress = bool(
            ndmi_status in ("VERY_LOW", "LOW") and heat_risk == "HIGH" and rainfall_status == "LOW"
        )

    confidence = compute_confidence(
        satellite.get("satellite_available", False),
        weather.get("weather_available", False),
        satellite.get("cloud_cover_percent"),
    )

    facts = {
        "acres": acres,
        "ndvi": ndvi,
        "ndvi_status": ndvi_status,
        "ndmi": ndmi,
        "ndmi_status": ndmi_status,
        "temperature_c": temp_c,
        "humidity_percent": humidity,
        "recent_rainfall_mm": rainfall,
        "heat_risk": heat_risk,
        "rainfall_status": rainfall_status,
        "possible_water_stress": possible_water_stress,
        "analysis_confidence": confidence,
        "satellite_observation_date": satellite.get("satellite_observation_date"),
        "cloud_cover_percent": satellite.get("cloud_cover_percent"),
        "satellite_available": satellite.get("satellite_available", False),
        "weather_available": weather.get("weather_available", False),
    }

    ai_result = get_ai_explanation(lang, facts)

    return {
        "ndvi": ndvi,
        "ndvi_status": ndvi_status,
        "ndmi": ndmi,
        "ndmi_status": ndmi_status,
        "temperature_c": temp_c,
        "humidity_percent": humidity,
        "recent_rainfall_mm": rainfall,
        "heat_risk": heat_risk,
        "rainfall_status": rainfall_status,
        "possible_water_stress": possible_water_stress,
        "analysis_confidence": confidence,
        "satellite_available": satellite.get("satellite_available", False),
        "satellite_observation_date": satellite.get("satellite_observation_date"),
        "cloud_cover_percent": satellite.get("cloud_cover_percent"),
        "satellite_message": satellite.get("satellite_message"),
        "satellite_error_kind": satellite.get("satellite_error_kind"),
        "weather_available": weather.get("weather_available", False),
        "weather_message": weather.get("weather_message"),
        "weather_source": weather.get("weather_source"),
        "weather_error_kind": weather.get("weather_error_kind"),
        "ai_explanation": ai_result["ai_explanation"],
        "recommendations": ai_result["recommendations"],
    }
