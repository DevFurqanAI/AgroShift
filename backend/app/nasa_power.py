"""NASA POWER monthly climatology data. Source: https://power.larc.nasa.gov/ ."""
from typing import Any
from calendar import monthrange
from datetime import datetime, timezone
import requests
import math

NASA_POWER_URL = "https://power.larc.nasa.gov/api/temporal/monthly/point"


class NASAClimateError(Exception):
    pass


def fetch_climate_summary(latitude: float, longitude: float, start_year: int, end_year: int) -> dict[str, Any]:
    """Return monthly historical temperature and precipitation observations.

    NASA POWER T2M is degrees C, PRECTOTCORR is mm/day.
    Missing/fill values are converted to null. No forecasts or agronomic advice.
    """
    if not all(math.isfinite(v) for v in (latitude, longitude)) or not (-90 <= latitude <= 90 and -180 <= longitude <= 180):
        raise NASAClimateError("Invalid geographic coordinates.")
    if end_year < start_year or start_year < 1981 or end_year > datetime.now(timezone.utc).year:
        raise NASAClimateError("Invalid historical year range.")
    params = {
        "parameters": "T2M,PRECTOTCORR", "community": "AG",
        "longitude": longitude, "latitude": latitude,
        "start": start_year, "end": end_year, "format": "JSON",
    }
    try:
        response = requests.get(NASA_POWER_URL, params=params, timeout=35)
        response.raise_for_status()
        data = response.json()
        raw = data["properties"]["parameter"]
        temp = raw["T2M"]
        rain = raw["PRECTOTCORR"]
        if not isinstance(temp, dict) or not isinstance(rain, dict):
            raise ValueError("Invalid parameter series")
    except (requests.RequestException, ValueError, KeyError, TypeError) as exc:
        raise NASAClimateError("NASA POWER observations could not be retrieved right now.") from exc

    def value(v):
        try:
            n = float(v)
            return None if not math.isfinite(n) or n <= -900 or n >= 9000 else n
        except (TypeError, ValueError):
            return None

    keys = sorted(set(temp) | set(rain))
    monthly = []
    for key in keys:
        if len(key) != 6 or not key.isdigit():
            continue
        year, month = int(key[:4]), int(key[4:])
        if not (start_year <= year <= end_year and 1 <= month <= 12):
            continue
        temperature, rain_rate = value(temp.get(key)), value(rain.get(key))
        if temperature is None and rain_rate is None:
            continue
        days = monthrange(year, month)[1]
        monthly.append({
            "month": key, "temperature_c": temperature,
            "precipitation_mm_per_day": rain_rate,
            "estimated_monthly_precipitation_mm": round(rain_rate * days, 2) if rain_rate is not None else None,
        })
    if not monthly:
        raise NASAClimateError("NASA POWER returned no monthly records for the requested period.")
    return {
        "source": "NASA POWER", "source_url": "https://power.larc.nasa.gov/",
        "location": {"latitude": latitude, "longitude": longitude},
        "start_year": start_year, "end_year": end_year,
        "units": {"temperature_c": "°C", "precipitation_mm_per_day": "mm/day", "estimated_monthly_precipitation_mm": "mm"},
        "historical_not_forecast": True, "monthly": monthly,
        "note": "Historical gridded climate estimates, not field soil measurements or validated crop recommendations.",
    }
