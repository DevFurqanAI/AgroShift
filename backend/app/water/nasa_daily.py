"""NASA POWER Daily meteorological archive client for FAO-56 evapotranspiration & rainfall screening.

Endpoint: https://power.larc.nasa.gov/api/temporal/daily/point
Official docs: https://power.larc.nasa.gov/docs/services/api/temporal/daily/

Verified AG-community daily parameters & units:
- T2M: 2 m daily mean air temperature (C)
- T2M_MAX: 2 m daily maximum air temperature (C)
- T2M_MIN: 2 m daily minimum air temperature (C)
- RH2M: 2 m relative humidity (%)
- T2MDEW: 2 m dew/frost point temperature (C)
- WS2M: 2 m wind speed (m/s)
- ALLSKY_SFC_SW_DWN: All-sky surface shortwave downward irradiance (MJ/m^2/day)
- PRECTOTCORR: Bias-corrected daily precipitation rate (mm/day)
- PS: Surface atmospheric pressure (kPa)

Notes:
- Preserves exact 0.0 mm/day precipitation as valid dry days.
- Never treats missing/fill sentinel values (-999.0) or physically impossible values as zero.
- Uses real calendar dates (YYYYMMDD) and extracts grid-cell elevation (meters) from geometry.coordinates[2].
- Bounded cache shared across competing rotation plans within a request and across repeated calls.
"""
from __future__ import annotations

from datetime import date, datetime, timezone
import logging
import math
import threading
import time
from typing import Any

import requests

logger = logging.getLogger("agroshift.water.nasa_daily")

NASA_POWER_DAILY_URL = "https://power.larc.nasa.gov/api/temporal/daily/point"

DAILY_PARAMETERS = [
    "T2M",
    "T2M_MAX",
    "T2M_MIN",
    "RH2M",
    "T2MDEW",
    "WS2M",
    "ALLSKY_SFC_SW_DWN",
    "PRECTOTCORR",
    "PS",
]

CACHE_TTL_SECONDS = 3600
MAX_CACHE_ENTRIES = 64
MAX_HISTORY_YEARS = 15

_cache_lock = threading.Lock()
_daily_cache: dict[tuple[float, float, int, int], tuple[float, dict[str, Any]]] = {}


class NASADailyError(Exception):
    def __init__(self, message: str, kind: str = "unavailable"):
        super().__init__(message)
        self.kind = kind


def clear_nasa_daily_cache() -> None:
    with _cache_lock:
        _daily_cache.clear()


def _clean_value(
    raw: Any,
    fill_value: float | None = -999.0,
    min_valid: float | None = None,
    max_valid: float | None = None,
) -> float | None:
    if raw is None or isinstance(raw, bool):
        return None
    try:
        num = float(raw)
    except (TypeError, ValueError):
        return None
    if not math.isfinite(num):
        return None
    if fill_value is not None and abs(num - fill_value) < 1e-6:
        return None
    if num <= -900.0 or num >= 9000.0:
        return None
    if min_valid is not None and num < min_valid:
        return None
    if max_valid is not None and num > max_valid:
        return None
    return num


def _parse_daily_date(key: str) -> date | None:
    if not isinstance(key, str) or len(key) != 8 or not key.isdigit():
        return None
    try:
        return date(int(key[:4]), int(key[4:6]), int(key[6:8]))
    except ValueError:
        return None


def resolve_complete_historical_window(
    start_year: int | None = None,
    end_year: int | None = None,
    today_utc: date | None = None,
) -> tuple[int, int, bool]:
    """Bound requests to complete historical years by default.

    Returns (start_year, end_year, includes_partial_current_year).
    """
    ref_today = today_utc or datetime.now(timezone.utc).date()
    latest_complete_year = max(1981, ref_today.year - 1)
    resolved_end = end_year if end_year is not None else latest_complete_year
    if resolved_end < 1981 or resolved_end > ref_today.year:
        raise NASADailyError("Invalid historical end year for NASA POWER daily query.", kind="invalid_range")

    resolved_start = start_year if start_year is not None else max(1981, resolved_end - 9)
    if resolved_start < 1981 or resolved_start > resolved_end:
        raise NASADailyError("Invalid historical start year for NASA POWER daily query.", kind="invalid_range")

    if (resolved_end - resolved_start + 1) > MAX_HISTORY_YEARS:
        raise NASADailyError(
            f"Daily meteorological window cannot exceed {MAX_HISTORY_YEARS} years per request.",
            kind="invalid_range",
        )

    includes_partial_current = resolved_end == ref_today.year
    return resolved_start, resolved_end, includes_partial_current


def _prune_cache() -> None:
    now = time.monotonic()
    expired = [k for k, (ts, _) in _daily_cache.items() if now - ts > CACHE_TTL_SECONDS]
    for k in expired:
        _daily_cache.pop(k, None)
    while len(_daily_cache) >= MAX_CACHE_ENTRIES:
        oldest = min(_daily_cache.items(), key=lambda item: item[1][0])[0]
        _daily_cache.pop(oldest, None)


def parse_nasa_daily_payload(
    payload: dict[str, Any],
    *,
    latitude: float,
    longitude: float,
    start_year: int,
    end_year: int,
    includes_partial_current_year: bool = False,
) -> dict[str, Any]:
    """Parse and physically validate a NASA POWER Daily API JSON payload."""
    props = payload.get("properties") or {}
    raw_params = props.get("parameter") if isinstance(props, dict) else None
    if not isinstance(raw_params, dict) or not raw_params:
        raise NASADailyError("NASA POWER daily response contained no parameter series.", kind="invalid_payload")

    header = payload.get("header") or {}
    fill_raw = header.get("fill_value", -999.0)
    try:
        fill_value = float(fill_raw)
    except (TypeError, ValueError):
        fill_value = -999.0

    geom_coords = (payload.get("geometry") or {}).get("coordinates")
    elevation_m: float | None = None
    if isinstance(geom_coords, list) and len(geom_coords) >= 3:
        try:
            elev = float(geom_coords[2])
            if math.isfinite(elev) and -500.0 <= elev <= 9000.0:
                elevation_m = round(elev, 2)
        except (TypeError, ValueError):
            elevation_m = None

    param_meta = payload.get("parameters") or header.get("parameters") or {}
    units_verified: dict[str, str] = {}
    for pname in DAILY_PARAMETERS:
        meta = param_meta.get(pname) if isinstance(param_meta, dict) else None
        if isinstance(meta, dict) and meta.get("units"):
            units_verified[pname] = str(meta["units"])

    # Expected unit sanity guard against unexpected NASA API changes
    if "ALLSKY_SFC_SW_DWN" in units_verified:
        sw_u = units_verified["ALLSKY_SFC_SW_DWN"].lower()
        if "mj" not in sw_u:
            raise NASADailyError(
                f"Unexpected solar radiation unit '{units_verified['ALLSKY_SFC_SW_DWN']}' from NASA POWER.",
                kind="invalid_units",
            )
    if "WS2M" in units_verified and "m/s" not in units_verified["WS2M"].lower():
        raise NASADailyError(
            f"Unexpected wind speed unit '{units_verified['WS2M']}' from NASA POWER.",
            kind="invalid_units",
        )
    if "PS" in units_verified and "kpa" not in units_verified["PS"].lower():
        raise NASADailyError(
            f"Unexpected surface pressure unit '{units_verified['PS']}' from NASA POWER.",
            kind="invalid_units",
        )

    series_map = {
        pname: (raw_params.get(pname) if isinstance(raw_params.get(pname), dict) else {})
        for pname in DAILY_PARAMETERS
    }
    all_keys = sorted({k for s in series_map.values() for k in s.keys()})

    days: list[dict[str, Any]] = []
    coverage = {pname: 0 for pname in DAILY_PARAMETERS}
    rejected_invalid = {pname: 0 for pname in DAILY_PARAMETERS}

    for key in all_keys:
        parsed_dt = _parse_daily_date(key)
        if parsed_dt is None:
            continue
        if not (start_year <= parsed_dt.year <= end_year):
            continue

        t_mean = _clean_value(series_map["T2M"].get(key), fill_value, -80.0, 65.0)
        t_max = _clean_value(series_map["T2M_MAX"].get(key), fill_value, -80.0, 65.0)
        t_min = _clean_value(series_map["T2M_MIN"].get(key), fill_value, -80.0, 65.0)
        if series_map["T2M_MAX"].get(key) is not None and t_max is None:
            rejected_invalid["T2M_MAX"] += 1
        if series_map["T2M_MIN"].get(key) is not None and t_min is None:
            rejected_invalid["T2M_MIN"] += 1

        # Reject physically inverted temperature pair
        if t_max is not None and t_min is not None and t_max < t_min:
            t_max = None
            t_min = None
            rejected_invalid["T2M_MAX"] += 1
            rejected_invalid["T2M_MIN"] += 1

        rh2m = _clean_value(series_map["RH2M"].get(key), fill_value, 0.0, 100.0)
        if series_map["RH2M"].get(key) is not None and rh2m is None:
            rejected_invalid["RH2M"] += 1

        t_dew = _clean_value(series_map["T2MDEW"].get(key), fill_value, -85.0, 50.0)
        if t_dew is not None and t_max is not None and t_dew > t_max + 2.0:
            t_dew = None
            rejected_invalid["T2MDEW"] += 1

        ws2m = _clean_value(series_map["WS2M"].get(key), fill_value, 0.0, 75.0)
        if series_map["WS2M"].get(key) is not None and ws2m is None:
            rejected_invalid["WS2M"] += 1

        sw_dwn = _clean_value(series_map["ALLSKY_SFC_SW_DWN"].get(key), fill_value, 0.0, 50.0)
        if series_map["ALLSKY_SFC_SW_DWN"].get(key) is not None and sw_dwn is None:
            rejected_invalid["ALLSKY_SFC_SW_DWN"] += 1

        precip = _clean_value(series_map["PRECTOTCORR"].get(key), fill_value, 0.0, 1500.0)
        if series_map["PRECTOTCORR"].get(key) is not None and precip is None:
            rejected_invalid["PRECTOTCORR"] += 1

        ps = _clean_value(series_map["PS"].get(key), fill_value, 30.0, 110.0)
        if series_map["PS"].get(key) is not None and ps is None:
            rejected_invalid["PS"] += 1

        row = {
            "date": parsed_dt.isoformat(),
            "date_obj": parsed_dt,
            "t2m_c": t_mean,
            "t2m_max_c": t_max,
            "t2m_min_c": t_min,
            "rh2m_percent": rh2m,
            "t2m_dew_c": t_dew,
            "ws2m_ms": ws2m,
            "solar_radiation_mj_m2_day": sw_dwn,
            "precip_mm_day": precip,
            "surface_pressure_kpa": ps,
        }
        days.append(row)

        val_map = {
            "T2M": t_mean,
            "T2M_MAX": t_max,
            "T2M_MIN": t_min,
            "RH2M": rh2m,
            "T2MDEW": t_dew,
            "WS2M": ws2m,
            "ALLSKY_SFC_SW_DWN": sw_dwn,
            "PRECTOTCORR": precip,
            "PS": ps,
        }
        for pname, pval in val_map.items():
            if pval is not None:
                coverage[pname] += 1

    if not days:
        raise NASADailyError("NASA POWER returned no valid calendar-date records for the period.", kind="nodata")

    total_days = len(days)
    years_present = sorted({d["date_obj"].year for d in days})

    return {
        "source": "NASA POWER Daily AG Archive",
        "source_url": "https://power.larc.nasa.gov/docs/services/api/temporal/daily/",
        "api_version": (header.get("api") or {}).get("version"),
        "location": {
            "latitude": latitude,
            "longitude": longitude,
            "elevation_m": elevation_m,
            "elevation_source": "NASA POWER MERRA-2 grid-cell elevation" if elevation_m is not None else None,
        },
        "start_year": start_year,
        "end_year": end_year,
        "includes_partial_current_year": includes_partial_current_year,
        "units": units_verified or {
            "T2M": "C",
            "T2M_MAX": "C",
            "T2M_MIN": "C",
            "RH2M": "%",
            "T2MDEW": "C",
            "WS2M": "m/s",
            "ALLSKY_SFC_SW_DWN": "MJ/m^2/day",
            "PRECTOTCORR": "mm/day",
            "PS": "kPa",
        },
        "total_calendar_days": total_days,
        "years_present": years_present,
        "coverage_counts": coverage,
        "rejected_invalid_counts": rejected_invalid,
        "days": days,
    }


def fetch_nasa_daily_weather(
    latitude: float,
    longitude: float,
    start_year: int | None = None,
    end_year: int | None = None,
) -> dict[str, Any]:
    """Fetch bounded daily NASA POWER meteorological records with shared thread-safe caching."""
    if not all(math.isfinite(v) for v in (latitude, longitude)) or not (-90 <= latitude <= 90 and -180 <= longitude <= 180):
        raise NASADailyError("Invalid geographic coordinates.", kind="invalid_coordinates")

    resolved_start, resolved_end, partial_current = resolve_complete_historical_window(start_year, end_year)
    cache_key = (round(latitude, 2), round(longitude, 2), resolved_start, resolved_end)

    with _cache_lock:
        cached = _daily_cache.get(cache_key)
        if cached and (time.monotonic() - cached[0]) <= CACHE_TTL_SECONDS:
            return cached[1]

    params = {
        "parameters": ",".join(DAILY_PARAMETERS),
        "community": "AG",
        "longitude": round(longitude, 4),
        "latitude": round(latitude, 4),
        "start": f"{resolved_start}0101",
        "end": f"{resolved_end}1231",
        "format": "JSON",
    }

    last_exc: Exception | None = None
    for attempt in range(2):
        try:
            response = requests.get(NASA_POWER_DAILY_URL, params=params, timeout=30)
            if response.status_code == 429:
                if attempt == 0:
                    time.sleep(0.6)
                    continue
                raise NASADailyError(
                    "NASA POWER daily API rate limit reached; please retry shortly.",
                    kind="rate_limited",
                )
            if response.status_code >= 500 and attempt == 0:
                time.sleep(0.4)
                continue
            response.raise_for_status()
            payload = response.json()
            parsed = parse_nasa_daily_payload(
                payload,
                latitude=latitude,
                longitude=longitude,
                start_year=resolved_start,
                end_year=resolved_end,
                includes_partial_current_year=partial_current,
            )
            with _cache_lock:
                _prune_cache()
                _daily_cache[cache_key] = (time.monotonic(), parsed)
            return parsed
        except NASADailyError:
            raise
        except requests.Timeout as exc:
            last_exc = exc
            if attempt == 0:
                continue
            raise NASADailyError(
                "NASA POWER daily meteorological request timed out.",
                kind="timeout",
            ) from exc
        except (requests.RequestException, ValueError, TypeError, KeyError) as exc:
            last_exc = exc
            break

    raise NASADailyError(
        "NASA POWER daily meteorological observations could not be retrieved right now.",
        kind="unavailable",
    ) from last_exc
