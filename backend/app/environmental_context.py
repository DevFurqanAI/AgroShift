"""Phase 4A: Automatic environmental & public soil context retrieval.

Combines:
1. NASA POWER AG monthly climatology + irradiance + relative humidity +
   coarse MERRA-2 soil wetness indices (GWETTOP, GWETROOT).
2. ISRIC SoilGrids v2.0 public 250 m soil property estimates (REST primary with
   OGC WMS GetFeatureInfo fallback) for properties actually supported by the
   dataset (pH in H2O, soil organic carbon g/kg, sand/silt/clay %, bulk density).

Scientific honesty rules:
- Never fabricate missing values, soil salinity, drainage, organic matter %, or NPK.
- Never silently equate Soil Organic Carbon (g/kg) with Organic Matter (%).
- Never overwrite farmer-reported or laboratory-measured farm profile values.
- Distinguish historical climate, gridded reanalysis, public modeled soil estimates,
  farmer observations, and laboratory measurements in every payload.
"""
from __future__ import annotations

from calendar import monthrange
from collections import defaultdict
from datetime import datetime, timezone
import html
import logging
import math
import re
from statistics import mean
import threading
import time
from typing import Any

import requests

logger = logging.getLogger("agroshift.environmental_context")

NASA_POWER_URL = "https://power.larc.nasa.gov/api/temporal/monthly/point"
ISRIC_REST_URL = "https://rest.isric.org/soilgrids/v2.0/properties/query"
ISRIC_WMS_BASE_URL = "https://maps.isric.org/mapserv"

NASA_PARAMETERS = [
    "T2M",
    "PRECTOTCORR",
    "ALLSKY_SFC_SW_DWN",
    "RH2M",
    "GWETTOP",
    "GWETROOT",
]

SOILGRIDS_PROPERTIES = ["phh2o", "soc", "sand", "silt", "clay", "bdod"]
SOILGRIDS_DEPTHS = ["0-5cm", "5-15cm"]
SOILGRIDS_VALUES = ["mean", "Q0.05", "Q0.95"]

CACHE_TTL_SECONDS = 3600
MAX_CACHE_ENTRIES = 128

_cache_lock = threading.Lock()
_nasa_cache: dict[tuple[float, float, int, int], tuple[float, dict[str, Any]]] = {}
_soil_cache: dict[tuple[float, float], tuple[float, dict[str, Any]]] = {}

PROVENANCE_RANK: dict[str, int] = {
    "lab_test": 4,
    "farmer_observation": 3,
    "farmer_provided": 3,
    "public_dataset_estimate": 2,
    "nasa_gridded_observation": 2,
    "external_estimate": 2,
    "estimated": 2,
    "unknown": 0,
}

USDA_TO_FARM_TEXTURE: dict[str, str] = {
    "Sand": "sandy",
    "Loamy Sand": "sandy",
    "Sandy Loam": "sandy_loam",
    "Loam": "loam",
    "Silt Loam": "silt_loam",
    "Silt": "silt_loam",
    "Sandy Clay Loam": "clay_loam",
    "Clay Loam": "clay_loam",
    "Silty Clay Loam": "clay_loam",
    "Sandy Clay": "clay",
    "Silty Clay": "clay",
    "Clay": "clay",
}


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _prune_cache(cache: dict[Any, tuple[float, dict[str, Any]]]) -> None:
    now = time.monotonic()
    expired = [k for k, (ts, _) in cache.items() if now - ts > CACHE_TTL_SECONDS]
    for k in expired:
        cache.pop(k, None)
    while len(cache) >= MAX_CACHE_ENTRIES:
        oldest_key = min(cache.items(), key=lambda item: item[1][0])[0]
        cache.pop(oldest_key, None)


def clear_environmental_caches() -> None:
    with _cache_lock:
        _nasa_cache.clear()
        _soil_cache.clear()


def _clean_nasa_value(raw: Any, min_valid: float | None = None, max_valid: float | None = None) -> float | None:
    try:
        num = float(raw)
    except (TypeError, ValueError):
        return None
    if not math.isfinite(num) or num <= -900 or num >= 9000:
        return None
    if min_valid is not None and num < min_valid:
        return None
    if max_valid is not None and num > max_valid:
        return None
    return num


def _build_nasa_variable_entry(
    *,
    variable: str,
    label: str,
    value: float | None,
    unit: str,
    category: str,
    spatial_resolution: str,
    observation_period: str,
    retrieved_at: str,
    uncertainty_note: str,
    valid_months: int = 0,
    total_months: int = 0,
    seasonal_summary: dict[str, float | None] | None = None,
    extra: dict[str, Any] | None = None,
) -> dict[str, Any]:
    return {
        "variable": variable,
        "label": label,
        "value": value,
        "unit": unit,
        "available": value is not None,
        "status": "available" if value is not None else "missing_or_unavailable",
        "source": "NASA POWER (AG Community)",
        "source_url": "https://power.larc.nasa.gov/",
        "category": category,
        "spatial_resolution": spatial_resolution,
        "observation_period": observation_period,
        "valid_months": valid_months,
        "total_months": total_months,
        "retrieved_at": retrieved_at,
        "uncertainty_note": uncertainty_note,
        "seasonal_summary": seasonal_summary or {},
        **(extra or {}),
    }


def _compute_annual_precipitation_summary(precip_series: dict[str, Any], start_year: int, end_year: int) -> tuple[float | None, float | None, int, int, int]:
    """Compute mean mm/day across valid months and mean mm/year across COMPLETE 12-month years only."""
    valid_daily: list[float] = []
    by_year: dict[int, list[float]] = defaultdict(list)

    for key, raw_val in precip_series.items():
        if not isinstance(key, str) or len(key) != 6 or not key.isdigit():
            continue
        year, month = int(key[:4]), int(key[4:])
        if not (start_year <= year <= end_year and 1 <= month <= 12):
            continue
        val = _clean_nasa_value(raw_val, min_valid=0.0)
        if val is None:
            continue
        valid_daily.append(val)
        days = monthrange(year, month)[1]
        by_year[year].append(val * days)

    complete_year_totals = [sum(vals) for vals in by_year.values() if len(vals) == 12]
    mean_daily = round(mean(valid_daily), 2) if valid_daily else None
    mean_annual = round(mean(complete_year_totals), 1) if complete_year_totals else None
    return mean_daily, mean_annual, len(valid_daily), len(complete_year_totals), len(by_year)


def _compute_series_stats(
    series: dict[str, Any],
    start_year: int,
    end_year: int,
    min_valid: float | None = None,
    max_valid: float | None = None,
    decimals: int = 2,
) -> tuple[float | None, dict[str, float | None], int, int]:
    all_vals: list[float] = []
    by_quarter: dict[str, list[float]] = defaultdict(list)
    total_candidates = 0

    for key, raw_val in series.items():
        if not isinstance(key, str) or len(key) != 6 or not key.isdigit():
            continue
        year, month = int(key[:4]), int(key[4:])
        if not (start_year <= year <= end_year and 1 <= month <= 12):
            continue
        total_candidates += 1
        val = _clean_nasa_value(raw_val, min_valid=min_valid, max_valid=max_valid)
        if val is None:
            continue
        all_vals.append(val)
        if month in (12, 1, 2):
            by_quarter["djf"].append(val)
        elif month in (3, 4, 5):
            by_quarter["mam"].append(val)
        elif month in (6, 7, 8):
            by_quarter["jja"].append(val)
        else:
            by_quarter["son"].append(val)

    overall = round(mean(all_vals), decimals) if all_vals else None
    seasonal = {
        q: (round(mean(by_quarter[q]), decimals) if by_quarter[q] else None)
        for q in ("djf", "mam", "jja", "son")
    }
    return overall, seasonal, len(all_vals), total_candidates


def fetch_nasa_environmental_context(
    latitude: float,
    longitude: float,
    start_year: int,
    end_year: int,
) -> dict[str, Any]:
    """Fetch expanded NASA POWER variables while tolerating partial parameter or network failures."""
    retrieved_at = _now_iso()
    cache_key = (round(latitude, 2), round(longitude, 2), start_year, end_year)

    with _cache_lock:
        cached = _nasa_cache.get(cache_key)
        if cached and time.monotonic() - cached[0] <= CACHE_TTL_SECONDS:
            return cached[1]

    period_label = f"{start_year}–{end_year} monthly climatology"
    params = {
        "parameters": ",".join(NASA_PARAMETERS),
        "community": "AG",
        "longitude": longitude,
        "latitude": latitude,
        "start": start_year,
        "end": end_year,
        "format": "JSON",
    }

    try:
        response = requests.get(NASA_POWER_URL, params=params, timeout=25)
        if response.status_code == 429:
            return {
                "available": False,
                "status": "rate_limited",
                "message": "NASA POWER rate limit reached; please retry shortly.",
                "retrieved_at": retrieved_at,
                "climate_variables": {},
                "soil_wetness_variables": {},
            }
        response.raise_for_status()
        payload = response.json()
        raw_params = payload.get("properties", {}).get("parameter", {})
        header_params = (
            payload.get("header", {}).get("parameters")
            or payload.get("parameters")
            or {}
        )
        if not isinstance(raw_params, dict) or not raw_params:
            raise ValueError("Empty NASA POWER parameter payload")
    except (requests.RequestException, ValueError, TypeError) as exc:
        logger.warning("NASA POWER environmental context unavailable: %s", exc)
        return {
            "available": False,
            "status": "unavailable",
            "message": "NASA POWER Earth observations could not be retrieved right now.",
            "retrieved_at": retrieved_at,
            "climate_variables": {},
            "soil_wetness_variables": {},
        }

    t2m_series = raw_params.get("T2M") if isinstance(raw_params.get("T2M"), dict) else {}
    prec_series = raw_params.get("PRECTOTCORR") if isinstance(raw_params.get("PRECTOTCORR"), dict) else {}
    solar_series = raw_params.get("ALLSKY_SFC_SW_DWN") if isinstance(raw_params.get("ALLSKY_SFC_SW_DWN"), dict) else {}
    rh_series = raw_params.get("RH2M") if isinstance(raw_params.get("RH2M"), dict) else {}
    gwettop_series = raw_params.get("GWETTOP") if isinstance(raw_params.get("GWETTOP"), dict) else {}
    gwetroot_series = raw_params.get("GWETROOT") if isinstance(raw_params.get("GWETROOT"), dict) else {}

    t2m_mean, t2m_seasons, t2m_n, t2m_total = _compute_series_stats(t2m_series, start_year, end_year, decimals=1)
    prec_daily, prec_annual, prec_n, complete_years, total_years = _compute_annual_precipitation_summary(
        prec_series, start_year, end_year
    )
    _, prec_seasons_daily, _, _ = _compute_series_stats(prec_series, start_year, end_year, min_valid=0.0, decimals=2)

    solar_unit_raw = (
        header_params.get("ALLSKY_SFC_SW_DWN", {}).get("units")
        if isinstance(header_params, dict)
        else None
    )
    solar_unit = "MJ/m²/day" if not solar_unit_raw or "MJ" in str(solar_unit_raw) else str(solar_unit_raw)
    solar_mean, solar_seasons, solar_n, solar_total = _compute_series_stats(
        solar_series, start_year, end_year, min_valid=0.0, decimals=2
    )
    rh_mean, rh_seasons, rh_n, rh_total = _compute_series_stats(
        rh_series, start_year, end_year, min_valid=0.0, max_valid=100.0, decimals=1
    )
    gwettop_mean, gwettop_seasons, gwettop_n, gwettop_total = _compute_series_stats(
        gwettop_series, start_year, end_year, min_valid=0.0, max_valid=1.0, decimals=2
    )
    gwetroot_mean, gwetroot_seasons, gwetroot_n, gwetroot_total = _compute_series_stats(
        gwetroot_series, start_year, end_year, min_valid=0.0, max_valid=1.0, decimals=2
    )

    merra_res = "0.5° × 0.625° (~50 × 60 km, MERRA-2 reanalysis)"
    ceres_res = "1.0° × 1.0° (~110 km, CERES SYN1deg)"

    climate_variables = {
        "air_temperature_c": _build_nasa_variable_entry(
            variable="T2M",
            label="Historical 2m Air Temperature",
            value=t2m_mean,
            unit="°C",
            category="observed_historical_climate",
            spatial_resolution=merra_res,
            observation_period=period_label,
            valid_months=t2m_n,
            total_months=t2m_total,
            retrieved_at=retrieved_at,
            seasonal_summary=t2m_seasons,
            uncertainty_note="Gridded historical air temperature climatology, not a weather forecast.",
        ),
        "precipitation_mm_per_year": _build_nasa_variable_entry(
            variable="PRECTOTCORR",
            label="Historical Mean Annual Precipitation",
            value=prec_annual,
            unit="mm/year",
            category="observed_historical_climate",
            spatial_resolution=merra_res,
            observation_period=period_label,
            valid_months=prec_n,
            total_months=t2m_total,
            retrieved_at=retrieved_at,
            seasonal_summary=prec_seasons_daily,
            uncertainty_note=(
                f"Calculated strictly from {complete_years} complete 12-month year(s) out of {total_years} year(s) with records; "
                "gridded precipitation total, not effective rainfall or irrigation supply."
            ),
            extra={
                "mean_daily_mm": prec_daily,
                "complete_years_count": complete_years,
                "years_with_records": total_years,
            },
        ),
        "solar_radiation": _build_nasa_variable_entry(
            variable="ALLSKY_SFC_SW_DWN",
            label="All-Sky Surface Solar Radiation",
            value=solar_mean,
            unit=solar_unit,
            category="remote_sensing_estimate",
            spatial_resolution=ceres_res,
            observation_period=period_label,
            valid_months=solar_n,
            total_months=solar_total,
            retrieved_at=retrieved_at,
            seasonal_summary=solar_seasons,
            uncertainty_note="Satellite-derived surface shortwave downward irradiance; coarse ~1° grid cell average.",
        ),
        "relative_humidity_percent": _build_nasa_variable_entry(
            variable="RH2M",
            label="Historical 2m Relative Humidity",
            value=rh_mean,
            unit="%",
            category="observed_historical_climate",
            spatial_resolution=merra_res,
            observation_period=period_label,
            valid_months=rh_n,
            total_months=rh_total,
            retrieved_at=retrieved_at,
            seasonal_summary=rh_seasons,
            uncertainty_note="Gridded 2 m atmospheric humidity climatology; local irrigated microclimates may differ.",
        ),
    }

    soil_wetness_variables = {
        "surface_soil_wetness": _build_nasa_variable_entry(
            variable="GWETTOP",
            label="Surface Soil Wetness Index (0–5 cm)",
            value=gwettop_mean,
            unit="0–1 wetness fraction",
            category="modeled_reanalysis_estimate",
            spatial_resolution=merra_res,
            observation_period=period_label,
            valid_months=gwettop_n,
            total_months=gwettop_total,
            retrieved_at=retrieved_at,
            seasonal_summary=gwettop_seasons,
            uncertainty_note=(
                "Coarse MERRA-2 reanalysis relative surface wetness (0 = dry wilting, 1 = saturated). "
                "Does NOT measure field volumetric moisture, irrigation adequacy, or drainage class."
            ),
        ),
        "root_zone_soil_wetness": _build_nasa_variable_entry(
            variable="GWETROOT",
            label="Root-Zone Soil Wetness Index (10–100 cm)",
            value=gwetroot_mean,
            unit="0–1 wetness fraction",
            category="modeled_reanalysis_estimate",
            spatial_resolution=merra_res,
            observation_period=period_label,
            valid_months=gwetroot_n,
            total_months=gwetroot_total,
            retrieved_at=retrieved_at,
            seasonal_summary=gwetroot_seasons,
            uncertainty_note=(
                "Coarse MERRA-2 reanalysis relative root-zone wetness (0–1 fraction). "
                "Do NOT use as a replacement for local soil moisture probes or field drainage checks."
            ),
        ),
    }

    climate_any = any(v["available"] for v in climate_variables.values())
    wetness_any = any(v["available"] for v in soil_wetness_variables.values())

    result = {
        "available": climate_any or wetness_any,
        "climate_available": climate_any,
        "wetness_available": wetness_any,
        "status": "available" if (climate_any or wetness_any) else "nodata",
        "message": None if (climate_any or wetness_any) else "NASA POWER returned only missing/fill values for this location.",
        "retrieved_at": retrieved_at,
        "climate_variables": climate_variables,
        "soil_wetness_variables": soil_wetness_variables,
    }

    if result["available"]:
        with _cache_lock:
            _prune_cache(_nasa_cache)
            _nasa_cache[cache_key] = (time.monotonic(), result)

    return result


def classify_usda_soil_texture(sand_pct: float, silt_pct: float, clay_pct: float) -> tuple[str | None, str]:
    """Classify sand/silt/clay percentages using the standard USDA textural triangle.

    Returns (usda_class_name, closest_agroshift_texture).
    Returns (None, 'unknown') when inputs are invalid or do not sum near 100%.
    """
    vals = (sand_pct, silt_pct, clay_pct)
    if not all(isinstance(v, (int, float)) and math.isfinite(v) and 0.0 <= v <= 100.0 for v in vals):
        return None, "unknown"
    total = sand_pct + silt_pct + clay_pct
    if total < 90.0 or total > 110.0 or total <= 0:
        return None, "unknown"

    sand = (sand_pct / total) * 100.0
    silt = (silt_pct / total) * 100.0
    clay = (clay_pct / total) * 100.0

    # Standard USDA Soil Survey Manual textural triangle rules
    if (silt + 1.5 * clay) < 15.0:
        usda = "Sand"
    elif (silt + 1.5 * clay) >= 15.0 and (silt + 2.0 * clay) < 30.0:
        usda = "Loamy Sand"
    elif (
        (clay >= 7.0 and clay < 20.0 and sand > 52.0 and (silt + 2.0 * clay) >= 30.0)
        or (clay < 7.0 and silt < 50.0 and (silt + 2.0 * clay) >= 30.0)
    ):
        usda = "Sandy Loam"
    elif clay >= 7.0 and clay < 27.0 and silt >= 28.0 and silt < 50.0 and sand <= 52.0:
        usda = "Loam"
    elif (silt >= 50.0 and clay >= 12.0 and clay < 27.0) or (
        silt >= 50.0 and silt < 80.0 and clay < 12.0
    ):
        usda = "Silt Loam"
    elif silt >= 80.0 and clay < 12.0:
        usda = "Silt"
    elif clay >= 20.0 and clay < 35.0 and silt < 28.0 and sand > 45.0:
        usda = "Sandy Clay Loam"
    elif clay >= 27.0 and clay < 40.0 and sand > 20.0 and sand <= 45.0:
        usda = "Clay Loam"
    elif clay >= 27.0 and clay < 40.0 and sand <= 20.0:
        usda = "Silty Clay Loam"
    elif clay >= 35.0 and sand > 45.0:
        usda = "Sandy Clay"
    elif clay >= 40.0 and silt >= 40.0:
        usda = "Silty Clay"
    else:
        usda = "Clay"

    return usda, USDA_TO_FARM_TEXTURE.get(usda, "unknown")


def _extract_soilgrids_rest_property(
    layer: dict[str, Any],
    d_factor: float,
    valid_min: float,
    valid_max: float,
    decimals: int = 2,
) -> dict[str, Any] | None:
    """Extract thickness-weighted 0–15 cm (or single available layer) values from a SoilGrids REST layer."""
    depths = layer.get("depths")
    if not isinstance(depths, list):
        return None

    layer_weights = {"0-5cm": 5.0, "5-15cm": 10.0}
    collected: list[tuple[str, float, float | None, float | None, float | None]] = []

    for depth_entry in depths:
        if not isinstance(depth_entry, dict):
            continue
        label = str(depth_entry.get("label") or "")
        weight = layer_weights.get(label)
        if weight is None:
            continue
        values = depth_entry.get("values") or {}
        if not isinstance(values, dict):
            continue
        raw_mean = values.get("mean")
        if raw_mean is None or isinstance(raw_mean, bool):
            continue
        try:
            mean_val = float(raw_mean) / d_factor
        except (TypeError, ValueError, ZeroDivisionError):
            continue
        if not math.isfinite(mean_val) or mean_val < valid_min or mean_val > valid_max:
            continue

        def _conv(qkey: str) -> float | None:
            rv = values.get(qkey)
            if rv is None or isinstance(rv, bool):
                return None
            try:
                num = float(rv) / d_factor
                return num if math.isfinite(num) else None
            except (TypeError, ValueError, ZeroDivisionError):
                return None

        collected.append((label, weight, mean_val, _conv("Q0.05"), _conv("Q0.95")))

    if not collected:
        return None

    total_w = sum(item[1] for item in collected)
    weighted_mean = round(sum(item[2] * item[1] for item in collected if item[2] is not None) / total_w, decimals)
    q05_vals = [(item[3], item[1]) for item in collected if item[3] is not None]
    q95_vals = [(item[4], item[1]) for item in collected if item[4] is not None]
    q05 = round(sum(v * w for v, w in q05_vals) / sum(w for _, w in q05_vals), decimals) if q05_vals else None
    q95 = round(sum(v * w for v, w in q95_vals) / sum(w for _, w in q95_vals), decimals) if q95_vals else None

    depth_label = "0–15 cm (thickness-weighted)" if len(collected) == 2 else collected[0][0].replace("-", "–").replace("cm", " cm")
    return {
        "value": weighted_mean,
        "q05": q05,
        "q95": q95,
        "depth_interval": depth_label,
    }


def _parse_wms_html_value(body: str) -> float | None:
    """Parse ISRIC MapServer WMS GetFeatureInfo text/html response cleanly."""
    if not body:
        return None
    match = re.search(r"<b>\s*Value:\s*</b>\s*<span[^>]*>\s*([^<\s]+)\s*</span>", body, flags=re.IGNORECASE)
    if not match:
        return None
    raw = html.unescape(match.group(1)).strip()
    try:
        val = float(raw)
        return val if math.isfinite(val) else None
    except ValueError:
        return None


def _fetch_wms_single_stat(prop: str, layer_name: str, latitude: float, longitude: float, timeout: float = 8.0) -> float | None:
    d_lat = 0.05
    d_lon = 0.05
    min_lat = max(-90.0, latitude - d_lat)
    max_lat = min(90.0, latitude + d_lat)
    min_lon = max(-180.0, longitude - d_lon)
    max_lon = min(180.0, longitude + d_lon)
    if max_lat <= min_lat or max_lon <= min_lon:
        return None

    params = {
        "map": f"/map/{prop}.map",
        "SERVICE": "WMS",
        "VERSION": "1.3.0",
        "REQUEST": "GetFeatureInfo",
        "LAYERS": layer_name,
        "QUERY_LAYERS": layer_name,
        "STYLES": "",
        "CRS": "EPSG:4326",
        "BBOX": f"{min_lat},{min_lon},{max_lat},{max_lon}",
        "WIDTH": 101,
        "HEIGHT": 101,
        "I": 50,
        "J": 50,
        "INFO_FORMAT": "text/html",
    }
    resp = requests.get(ISRIC_WMS_BASE_URL, params=params, timeout=timeout)
    resp.raise_for_status()
    return _parse_wms_html_value(resp.text)


def _fetch_soilgrids_via_wms(latitude: float, longitude: float) -> dict[str, dict[str, Any]]:
    """Fallback point lookup via ISRIC SoilGrids OGC WMS 0-5cm layers when REST is unavailable."""
    specs = {
        "phh2o": (10.0, 2.5, 10.5, 1),
        "soc": (10.0, 0.0, 600.0, 1),
        "sand": (10.0, 0.0, 100.0, 1),
        "silt": (10.0, 0.0, 100.0, 1),
        "clay": (10.0, 0.0, 100.0, 1),
        "bdod": (100.0, 0.2, 2.6, 2),
    }
    extracted: dict[str, dict[str, Any]] = {}
    for prop, (d_factor, vmin, vmax, decimals) in specs.items():
        try:
            raw_mean = _fetch_wms_single_stat(prop, f"{prop}_0-5cm_mean", latitude, longitude)
            if raw_mean is None:
                continue
            mean_val = round(raw_mean / d_factor, decimals)
            if not (vmin <= mean_val <= vmax):
                continue
            raw_q05 = _fetch_wms_single_stat(prop, f"{prop}_0-5cm_Q0.05", latitude, longitude)
            raw_q95 = _fetch_wms_single_stat(prop, f"{prop}_0-5cm_Q0.95", latitude, longitude)
            extracted[prop] = {
                "value": mean_val,
                "q05": round(raw_q05 / d_factor, decimals) if raw_q05 is not None else None,
                "q95": round(raw_q95 / d_factor, decimals) if raw_q95 is not None else None,
                "depth_interval": "0–5 cm (WMS fallback)",
            }
        except requests.RequestException:
            # Propagate if first probe fails completely so we don't stall on 6 sequential timeouts
            if not extracted and prop == "phh2o":
                raise
            continue
    return extracted


def _build_soil_context_from_extracted(
    extracted: dict[str, dict[str, Any]],
    endpoint_used: str,
    retrieved_at: str,
    source_assessment: dict[str, Any],
) -> dict[str, Any]:
    if not extracted:
        return {
            "available": False,
            "status": "nodata_or_masked",
            "source": "ISRIC SoilGrids v2.0",
            "endpoint_used": endpoint_used,
            "source_url": "https://soilgrids.org/",
            "spatial_resolution": "250 m",
            "retrieved_at": retrieved_at,
            "message": (
                "No SoilGrids soil profile values exist at these coordinates "
                "(water body, masked urban area, glacier, or unmapped surface). "
                "Soil properties remain unknown."
            ),
            "properties": {},
            "derived_usda_texture": None,
            "mapped_farm_texture": "unknown",
            "source_assessment": source_assessment,
            "unsupported_soil_properties": [
                "Soil salinity / EC (dS/m) — not available from SoilGrids; requires field observation or lab test.",
                "Field drainage class — requires local field observation.",
                "Organic Matter (%) — SoilGrids estimates Organic Carbon (g/kg), not lab OM%.",
                "Available N / P / K — requires laboratory soil testing.",
            ],
        }

    prop_specs = {
        "phh2o": ("Soil pH in H₂O", "pH", 1),
        "soc": ("Soil Organic Carbon (SOC — not Organic Matter %)", "g/kg", 1),
        "sand": ("Sand Fraction", "%", 1),
        "silt": ("Silt Fraction", "%", 1),
        "clay": ("Clay Fraction", "%", 1),
        "bdod": ("Bulk Density (Fine Earth)", "kg/dm³", 2),
    }

    properties_out: dict[str, Any] = {}
    for prop, (label, unit, _) in prop_specs.items():
        if prop not in extracted:
            continue
        item = extracted[prop]
        q05, q95 = item.get("q05"), item.get("q95")
        range_note = (
            f"250 m modeled grid prediction (5th–95th percentile range: {q05}–{q95} {unit}); "
            "not a field-level laboratory soil test."
            if q05 is not None and q95 is not None
            else "250 m modeled grid prediction; not a field-level laboratory soil test."
        )
        properties_out[prop] = {
            "variable": prop,
            "label": label,
            "value": item["value"],
            "unit": unit,
            "q05": q05,
            "q95": q95,
            "depth_interval": item["depth_interval"],
            "available": True,
            "source": "ISRIC SoilGrids v2.0",
            "source_url": "https://soilgrids.org/",
            "category": "public_modeled_soil_estimate",
            "spatial_resolution": "250 m",
            "observation_period": "SoilGrids v2.0 (2020 global compilation)",
            "retrieved_at": retrieved_at,
            "uncertainty_note": range_note,
        }

    usda_texture = None
    mapped_texture = "unknown"
    if all(k in extracted for k in ("sand", "silt", "clay")):
        usda_texture, mapped_texture = classify_usda_soil_texture(
            extracted["sand"]["value"],
            extracted["silt"]["value"],
            extracted["clay"]["value"],
        )

    return {
        "available": bool(properties_out),
        "status": "available" if properties_out else "nodata_or_masked",
        "source": "ISRIC SoilGrids v2.0",
        "endpoint_used": endpoint_used,
        "source_url": "https://soilgrids.org/",
        "spatial_resolution": "250 m",
        "retrieved_at": retrieved_at,
        "message": None,
        "properties": properties_out,
        "derived_usda_texture": usda_texture,
        "mapped_farm_texture": mapped_texture,
        "source_assessment": source_assessment,
        "unsupported_soil_properties": [
            "Soil salinity / EC (dS/m) — not available from SoilGrids; requires field observation or lab test.",
            "Field drainage class — requires local field observation.",
            "Organic Matter (%) — SoilGrids reports Soil Organic Carbon (g/kg); AgroShift never converts SOC to OM% silently.",
            "Available N / P / K — requires laboratory soil testing.",
        ],
    }


def fetch_soil_context(latitude: float, longitude: float) -> dict[str, Any]:
    """Retrieve ISRIC SoilGrids v2.0 estimates via REST with automatic OGC WMS fallback."""
    retrieved_at = _now_iso()
    cache_key = (round(latitude, 4), round(longitude, 4))

    with _cache_lock:
        cached = _soil_cache.get(cache_key)
        if cached and time.monotonic() - cached[0] <= CACHE_TTL_SECONDS:
            return cached[1]

    source_assessment = {
        "primary_checked": "ISRIC SoilGrids v2.0 REST (rest.isric.org)",
        "fallback_available": "ISRIC SoilGrids OGC WMS GetFeatureInfo (maps.isric.org)",
        "rest_status": "unchecked",
        "wms_status": "not_needed",
    }

    extracted: dict[str, dict[str, Any]] = {}
    endpoint_used = "rest.isric.org"

    # 1. Try ISRIC SoilGrids REST v2.0
    try:
        resp = requests.get(
            ISRIC_REST_URL,
            params=[
                ("lon", longitude),
                ("lat", latitude),
                *[("property", p) for p in SOILGRIDS_PROPERTIES],
                *[("depth", d) for d in SOILGRIDS_DEPTHS],
                *[("value", v) for v in SOILGRIDS_VALUES],
            ],
            timeout=12,
        )
        if resp.status_code == 429:
            source_assessment["rest_status"] = "rate_limited_429"
            raise requests.HTTPError("SoilGrids REST rate-limited (429)")
        resp.raise_for_status()
        data = resp.json()
        layers = data.get("properties", {}).get("layers", [])
        if not isinstance(layers, list):
            raise ValueError("Invalid SoilGrids REST layers payload")
        source_assessment["rest_status"] = "available"
        spec_bounds = {
            "phh2o": (10.0, 2.5, 10.5, 1),
            "soc": (10.0, 0.0, 600.0, 1),
            "sand": (10.0, 0.0, 100.0, 1),
            "silt": (10.0, 0.0, 100.0, 1),
            "clay": (10.0, 0.0, 100.0, 1),
            "bdod": (100.0, 0.2, 2.6, 2),
        }
        for layer in layers:
            if not isinstance(layer, dict):
                continue
            name = str(layer.get("name") or "")
            if name not in spec_bounds:
                continue
            d_factor, vmin, vmax, decimals = spec_bounds[name]
            unit_info = layer.get("unit_measure") or {}
            if isinstance(unit_info, dict) and unit_info.get("d_factor"):
                try:
                    d_factor = float(unit_info["d_factor"])
                except (TypeError, ValueError):
                    pass
            parsed = _extract_soilgrids_rest_property(layer, d_factor, vmin, vmax, decimals=decimals)
            if parsed is not None:
                extracted[name] = parsed

        result = _build_soil_context_from_extracted(extracted, endpoint_used, retrieved_at, source_assessment)
        with _cache_lock:
            _prune_cache(_soil_cache)
            _soil_cache[cache_key] = (time.monotonic(), result)
        return result
    except (requests.RequestException, ValueError, TypeError) as rest_exc:
        if source_assessment["rest_status"] == "unchecked":
            source_assessment["rest_status"] = f"unavailable ({type(rest_exc).__name__})"
        logger.info("SoilGrids REST fallback triggered: %s", rest_exc)

    # 2. Fallback to ISRIC SoilGrids OGC WMS GetFeatureInfo
    endpoint_used = "maps.isric.org (OGC WMS)"
    try:
        extracted = _fetch_soilgrids_via_wms(latitude, longitude)
        source_assessment["wms_status"] = "available"
        result = _build_soil_context_from_extracted(extracted, endpoint_used, retrieved_at, source_assessment)
        if result["available"]:
            with _cache_lock:
                _prune_cache(_soil_cache)
                _soil_cache[cache_key] = (time.monotonic(), result)
        return result
    except (requests.RequestException, ValueError, TypeError) as wms_exc:
        source_assessment["wms_status"] = f"unavailable ({type(wms_exc).__name__})"
        logger.warning("SoilGrids WMS fallback also unavailable: %s", wms_exc)
        return {
            "available": False,
            "status": "service_unavailable",
            "source": "ISRIC SoilGrids v2.0",
            "endpoint_used": None,
            "source_url": "https://soilgrids.org/",
            "spatial_resolution": "250 m",
            "retrieved_at": retrieved_at,
            "message": (
                "Public SoilGrids estimates are temporarily unreachable. "
                "Your soil profile remains unknown unless you enter lab or field observations."
            ),
            "properties": {},
            "derived_usda_texture": None,
            "mapped_farm_texture": "unknown",
            "source_assessment": source_assessment,
            "unsupported_soil_properties": [
                "Soil salinity / EC (dS/m) — not available from public datasets.",
                "Field drainage class — requires local field observation.",
                "Organic Matter (%) — not auto-estimated.",
                "Available N / P / K — requires laboratory soil testing.",
            ],
        }


def resolve_field_precedence(
    *,
    current_value: Any,
    current_provenance: str,
    candidate_value: Any,
    candidate_provenance: str,
) -> tuple[Any, str, bool]:
    """Enforce strict precedence: lab_test > farmer_observation > public_dataset_estimate > unknown.

    Returns (final_value, final_provenance, accepted_new_candidate).
    """
    current_rank = PROVENANCE_RANK.get(current_provenance or "unknown", 0)
    candidate_rank = PROVENANCE_RANK.get(candidate_provenance or "unknown", 0)
    has_meaningful_current = current_value is not None and current_value != "" and current_value != "unknown"
    if has_meaningful_current and current_rank >= 3:
        return current_value, current_provenance, False
    if candidate_value is None or candidate_value == "" or candidate_value == "unknown":
        return current_value, current_provenance, False
    if candidate_rank > current_rank or not has_meaningful_current:
        return candidate_value, candidate_provenance, True
    return current_value, current_provenance, False


def build_reviewed_farm_suggestions(
    nasa_context: dict[str, Any],
    soil_context: dict[str, Any],
) -> dict[str, Any]:
    """Explicit reviewed mapping layer: produces candidate farm defaults requiring farmer confirmation.

    Never returns fabricated salinity, drainage, or organicMatterPercent.
    """
    soil_props = soil_context.get("properties") or {}
    ph_prop = soil_props.get("phh2o")
    usda_texture = soil_context.get("derived_usda_texture")
    mapped_texture = soil_context.get("mapped_farm_texture") or "unknown"

    suggestions: dict[str, Any] = {
        "soil_ph": {
            "field": "soil.ph",
            "available": bool(ph_prop and ph_prop.get("value") is not None),
            "suggested_value": ph_prop["value"] if ph_prop else None,
            "unit": "pH" if ph_prop else None,
            "provenance": "public_dataset_estimate",
            "source_label": (
                f"ISRIC SoilGrids v2.0 ({ph_prop['depth_interval']}, 250 m grid"
                + (
                    f", Q0.05–Q0.95: {ph_prop['q05']}–{ph_prop['q95']}"
                    if ph_prop.get("q05") is not None and ph_prop.get("q95") is not None
                    else ""
                )
                + ")"
                if ph_prop
                else None
            ),
            "requires_confirmation": True,
            "auto_applied": False,
        },
        "soil_texture": {
            "field": "soil.texture",
            "available": bool(mapped_texture and mapped_texture != "unknown"),
            "suggested_value": mapped_texture if mapped_texture != "unknown" else None,
            "usda_class": usda_texture,
            "provenance": "public_dataset_estimate",
            "source_label": (
                f"Derived via USDA triangle from SoilGrids 250 m sand/silt/clay ({usda_texture})"
                if usda_texture
                else None
            ),
            "requires_confirmation": True,
            "auto_applied": False,
        },
    }

    details_farmer_must_confirm = [
        "Field drainage quality (well drained, moderately drained, poorly drained, or waterlogging-prone)",
        "Soil salinity or visible salt-crusting concerns",
        "Actual irrigation method and seasonal water supply reliability",
        "Ordered crop history, planting/harvest dates, and field-specific challenges",
        "Laboratory Organic Matter (%) or N/P/K if you have a soil lab report (SOC g/kg is reference context only)",
    ]

    return {
        "suggestions": suggestions,
        "details_farmer_must_confirm": details_farmer_must_confirm,
        "precedence_policy": "lab_test > farmer_observation > public_dataset_estimate > unknown",
    }


def fetch_environmental_context(
    latitude: float,
    longitude: float,
    start_year: int | None = None,
    end_year: int | None = None,
    include_soil: bool = True,
) -> dict[str, Any]:
    """Retrieve combined NASA Earth Observation and public SoilGrids context for onboarding."""
    if not all(math.isfinite(v) for v in (latitude, longitude)) or not (
        -90 <= latitude <= 90 and -180 <= longitude <= 180
    ):
        raise ValueError("Invalid geographic coordinates.")

    current_year = datetime.now(timezone.utc).year
    resolved_end = end_year if end_year is not None else max(1985, current_year - 1)
    resolved_start = start_year if start_year is not None else max(1981, resolved_end - 9)
    if (
        resolved_end < resolved_start
        or resolved_start < 1981
        or resolved_end > current_year
        or resolved_end - resolved_start > 30
    ):
        raise ValueError("Invalid historical year range.")

    nasa_context = fetch_nasa_environmental_context(latitude, longitude, resolved_start, resolved_end)
    if include_soil:
        soil_context = fetch_soil_context(latitude, longitude)
    else:
        soil_context = {
            "available": False,
            "status": "skipped",
            "source": "ISRIC SoilGrids v2.0",
            "properties": {},
            "derived_usda_texture": None,
            "mapped_farm_texture": "unknown",
            "message": "Soil lookup skipped.",
        }

    reviewed = build_reviewed_farm_suggestions(nasa_context, soil_context)

    return {
        "location": {"latitude": latitude, "longitude": longitude},
        "start_year": resolved_start,
        "end_year": resolved_end,
        "retrieved_at": _now_iso(),
        "nasa_climate": {
            "available": nasa_context.get("climate_available", False),
            "status": nasa_context.get("status"),
            "message": nasa_context.get("message"),
            "variables": nasa_context.get("climate_variables", {}),
        },
        "nasa_soil_wetness": {
            "available": nasa_context.get("wetness_available", False),
            "status": nasa_context.get("status"),
            "message": nasa_context.get("message"),
            "variables": nasa_context.get("soil_wetness_variables", {}),
        },
        "soil_context": soil_context,
        "suggested_farm_defaults": reviewed["suggestions"],
        "details_farmer_must_confirm": reviewed["details_farmer_must_confirm"],
        "precedence_policy": reviewed["precedence_policy"],
        "limitations": [
            "NASA POWER climate and MERRA-2 soil wetness observations reflect coarse gridded cells (~50 × 60 km for MERRA-2; ~110 km for CERES irradiance) and are not weather forecasts or field moisture probe readings.",
            "ISRIC SoilGrids v2.0 properties are modeled 250 m global map predictions with stated 5th–95th percentile uncertainty and do not replace laboratory soil testing.",
            "Soil salinity, drainage class, organic matter %, and N/P/K nutrients cannot be auto-retrieved here and are never fabricated.",
            "Retrieving or accepting public environmental context does not overwrite laboratory or farmer-entered values and does not alter rotation scoring weights.",
        ],
    }
