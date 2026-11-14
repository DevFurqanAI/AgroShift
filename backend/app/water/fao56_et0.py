"""FAO-56 Penman-Monteith daily reference evapotranspiration (ET0).

Reference: Allen, R.G., Pereira, L.S., Raes, D., Smith, M. (1998).
Crop evapotranspiration - Guidelines for computing crop water requirements.
FAO Irrigation and Drainage Paper No. 56, Chapter 3.
https://www.fao.org/4/X0490E/x0490e06.htm

Units:
- Temperature: degrees Celsius (°C)
- Vapour pressure: kPa
- Atmospheric pressure: kPa
- Solar radiation & net radiation: MJ m-2 day-1
- Wind speed at 2 m height: m s-1
- Soil heat flux (daily 24-hr step): G = 0.0 MJ m-2 day-1 (Eq. 42)
- Output ET0: mm/day
"""
from __future__ import annotations

from datetime import date
import math
from typing import Any

SOLAR_CONSTANT_GSC = 0.0820  # MJ m-2 min-1 (Eq. 21)
STEFAN_BOLTZMANN_DAILY = 4.903e-9  # MJ K-4 m-2 day-1 (Eq. 39)
GRASS_ALBEDO = 0.23  # Eq. 38


def saturation_vapour_pressure_kpa(temp_c: float) -> float:
    """FAO-56 Eq. 11: e°(T) = 0.6108 * exp(17.27 * T / (T + 237.3)) [kPa]."""
    return 0.6108 * math.exp((17.27 * temp_c) / (temp_c + 237.3))


def slope_saturation_vapour_pressure_kpa_per_c(temp_mean_c: float) -> float:
    """FAO-56 Eq. 13: Delta = 4098 * e°(Tmean) / (Tmean + 237.3)^2 [kPa/°C]."""
    denom = temp_mean_c + 237.3
    if denom <= 0:
        raise ValueError("Invalid temperature below -237.3 °C")
    e_sat = saturation_vapour_pressure_kpa(temp_mean_c)
    return (4098.0 * e_sat) / (denom * denom)


def atmospheric_pressure_from_elevation_kpa(elevation_m: float) -> float:
    """FAO-56 Eq. 7: P = 101.3 * ((293 - 0.0065 * z) / 293)^5.26 [kPa]."""
    base = (293.0 - 0.0065 * elevation_m) / 293.0
    if base <= 0:
        raise ValueError("Elevation out of valid tropospheric range")
    return 101.3 * (base ** 5.26)


def effective_elevation_from_pressure_m(pressure_kpa: float) -> float:
    """Invert FAO-56 Eq. 7 conservatively when surface pressure PS is given without elevation."""
    ratio = max(0.1, min(1.2, pressure_kpa / 101.3))
    return (293.0 / 0.0065) * (1.0 - (ratio ** (1.0 / 5.26)))


def psychrometric_constant_kpa_per_c(pressure_kpa: float) -> float:
    """FAO-56 Eq. 8: gamma = 0.665e-3 * P [kPa/°C]."""
    return 0.000665 * pressure_kpa


def wind_speed_at_2m(wind_speed_ms: float, measurement_height_m: float = 2.0) -> float:
    """FAO-56 Eq. 47 logarithmic wind-profile adjustment to standard 2 m height [m/s]."""
    if wind_speed_ms < 0:
        raise ValueError("Wind speed cannot be negative")
    if abs(measurement_height_m - 2.0) < 1e-6:
        return wind_speed_ms
    if measurement_height_m <= 0.2:
        raise ValueError("Wind measurement height must exceed roughness offset")
    return wind_speed_ms * (4.87 / math.log(67.8 * measurement_height_m - 5.42))


def solar_geometry(latitude_deg: float, day_date: date) -> dict[str, float]:
    """Compute daily solar geometry & extraterrestrial radiation Ra [MJ m-2 day-1] (Eqs. 21-25, 34)."""
    if not (-90.0 <= latitude_deg <= 90.0):
        raise ValueError("Latitude out of bounds")
    j_day = day_date.timetuple().tm_yday
    phi = math.radians(latitude_deg)
    dr = 1.0 + 0.033 * math.cos((2.0 * math.pi / 365.0) * j_day)
    decl = 0.409 * math.sin((2.0 * math.pi / 365.0) * j_day - 1.39)
    # Clamp -tan(phi)*tan(decl) to [-1, 1] for high-latitude polar day/night numerical stability
    arg = max(-1.0, min(1.0, -math.tan(phi) * math.tan(decl)))
    omega_s = math.acos(arg)
    ra = (
        (24.0 * 60.0 / math.pi)
        * SOLAR_CONSTANT_GSC
        * dr
        * (omega_s * math.sin(phi) * math.sin(decl) + math.cos(phi) * math.cos(decl) * math.sin(omega_s))
    )
    daylight_hours = (24.0 / math.pi) * omega_s
    return {
        "julian_day": float(j_day),
        "phi_rad": phi,
        "dr": dr,
        "solar_declination_rad": decl,
        "sunset_hour_angle_rad": omega_s,
        "ra_mj_m2_day": max(0.0, ra),
        "daylight_hours_n": daylight_hours,
    }


def clear_sky_radiation_mj_m2_day(ra_mj_m2_day: float, elevation_m: float) -> float:
    """FAO-56 Eq. 37: Rso = (0.75 + 2e-5 * z) * Ra [MJ m-2 day-1]."""
    return max(0.0, (0.75 + 2.0e-5 * elevation_m) * ra_mj_m2_day)


def solar_radiation_from_sunshine_hours(
    sunshine_hours: float,
    daylight_hours_n: float,
    ra_mj_m2_day: float,
    as_coeff: float = 0.25,
    bs_coeff: float = 0.50,
) -> float:
    """FAO-56 Eq. 35 Angstrom formula: Rs = (as + bs * (n / N)) * Ra."""
    if sunshine_hours < 0 or daylight_hours_n <= 0:
        return 0.0
    rel = min(1.0, max(0.0, sunshine_hours / daylight_hours_n))
    return (as_coeff + bs_coeff * rel) * ra_mj_m2_day


def calculate_daily_fao56_et0(
    *,
    latitude: float,
    day_date: date,
    t_max_c: float | None,
    t_min_c: float | None,
    wind_speed_ms: float | None,
    solar_radiation_mj_m2_day: float | None = None,
    sunshine_hours: float | None = None,
    rh_mean_percent: float | None = None,
    rh_max_percent: float | None = None,
    rh_min_percent: float | None = None,
    t_dew_c: float | None = None,
    surface_pressure_kpa: float | None = None,
    elevation_m: float | None = None,
    wind_height_m: float = 2.0,
) -> dict[str, Any]:
    """Calculate single-day FAO-56 Penman-Monteith reference evapotranspiration (ET0, mm/day).

    Returns structured diagnostics plus 'available=False' when mandatory physical inputs
    (Tmax, Tmin, solar radiation/sunshine, wind, humidity/dewpoint, and pressure/elevation) are missing or invalid.
    """
    if (
        t_max_c is None
        or t_min_c is None
        or not (math.isfinite(t_max_c) and math.isfinite(t_min_c))
        or t_max_c < t_min_c
        or t_min_c < -80.0
        or t_max_c > 65.0
    ):
        return {
            "available": False,
            "et0_mm_day": None,
            "reason": "Missing or physically invalid Tmax/Tmin.",
        }

    if wind_speed_ms is None or not math.isfinite(wind_speed_ms) or wind_speed_ms < 0:
        return {
            "available": False,
            "et0_mm_day": None,
            "reason": "Missing or negative 2 m wind speed.",
        }

    # Atmospheric pressure P [kPa]: explicit PS preferred, else elevation Eq. 7. Never fabricate elevation silently.
    pressure_source: str
    if surface_pressure_kpa is not None and math.isfinite(surface_pressure_kpa) and 30.0 <= surface_pressure_kpa <= 110.0:
        p_kpa = float(surface_pressure_kpa)
        pressure_source = "surface_pressure_kpa"
        z_for_rso = elevation_m if (elevation_m is not None and math.isfinite(elevation_m)) else effective_elevation_from_pressure_m(p_kpa)
    elif elevation_m is not None and math.isfinite(elevation_m) and -500.0 <= elevation_m <= 9000.0:
        p_kpa = atmospheric_pressure_from_elevation_kpa(float(elevation_m))
        pressure_source = "elevation_eq7"
        z_for_rso = float(elevation_m)
    else:
        return {
            "available": False,
            "et0_mm_day": None,
            "reason": "Neither surface atmospheric pressure (PS) nor elevation is available.",
        }

    # Mean temperature & saturation vapour pressure (Eqs. 9, 11, 12, 13)
    t_mean_c = (t_max_c + t_min_c) / 2.0
    e0_tmax = saturation_vapour_pressure_kpa(t_max_c)
    e0_tmin = saturation_vapour_pressure_kpa(t_min_c)
    e_s = (e0_tmax + e0_tmin) / 2.0
    delta = slope_saturation_vapour_pressure_kpa_per_c(t_mean_c)
    gamma = psychrometric_constant_kpa_per_c(p_kpa)

    # Actual vapour pressure e_a [kPa] & humidity validity
    ea_method: str
    if rh_max_percent is not None and rh_min_percent is not None:
        if not (0.0 <= rh_max_percent <= 100.0 and 0.0 <= rh_min_percent <= 100.0) or rh_max_percent < rh_min_percent:
            return {
                "available": False,
                "et0_mm_day": None,
                "reason": "Physically invalid RHmax/RHmin.",
            }
        e_a = (e0_tmin * (rh_max_percent / 100.0) + e0_tmax * (rh_min_percent / 100.0)) / 2.0
        ea_method = "fao56_eq17_rh_max_min"
    elif rh_mean_percent is not None:
        if not (math.isfinite(rh_mean_percent) and 0.0 <= rh_mean_percent <= 100.0):
            return {
                "available": False,
                "et0_mm_day": None,
                "reason": "Physically invalid RH2M outside 0-100%.",
            }
        e_a = (rh_mean_percent / 100.0) * e_s
        ea_method = "fao56_eq19_rh_mean"
    elif t_dew_c is not None and math.isfinite(t_dew_c):
        if t_dew_c > t_max_c + 2.0:
            return {
                "available": False,
                "et0_mm_day": None,
                "reason": "Physically inconsistent dewpoint temperature above Tmax.",
            }
        e_a = min(e_s, saturation_vapour_pressure_kpa(t_dew_c))
        ea_method = "fao56_eq14_tdew"
    else:
        return {
            "available": False,
            "et0_mm_day": None,
            "reason": "Missing relative humidity (RH2M) and dewpoint (T2MDEW).",
        }

    e_a = min(e_s, max(0.0, e_a))
    vpd_kpa = max(0.0, e_s - e_a)

    # Solar geometry & net radiation (Eqs. 21-25, 34, 35, 37, 38, 39, 40)
    geom = solar_geometry(latitude, day_date)
    ra = geom["ra_mj_m2_day"]
    r_so = clear_sky_radiation_mj_m2_day(ra, z_for_rso)

    rs_method: str
    if solar_radiation_mj_m2_day is not None:
        if not math.isfinite(solar_radiation_mj_m2_day) or solar_radiation_mj_m2_day < 0.0:
            return {
                "available": False,
                "et0_mm_day": None,
                "reason": "Invalid negative solar radiation.",
            }
        r_s = float(solar_radiation_mj_m2_day)
        rs_method = "observed_allsky_sw_dwn"
    elif sunshine_hours is not None and math.isfinite(sunshine_hours) and sunshine_hours >= 0.0:
        r_s = solar_radiation_from_sunshine_hours(sunshine_hours, geom["daylight_hours_n"], ra)
        rs_method = "fao56_eq35_angstrom_sunshine"
    else:
        return {
            "available": False,
            "et0_mm_day": None,
            "reason": "Missing surface solar radiation (ALLSKY_SFC_SW_DWN) and sunshine hours.",
        }

    r_ns = (1.0 - GRASS_ALBEDO) * r_s
    # FAO-56 Eq. 39 clamps Rs/Rso <= 1.0 and uses clear-sky ratio >= 0.25 if Ra > 0
    if r_so > 0.0:
        rs_rso = max(0.25, min(1.0, r_s / r_so))
    else:
        rs_rso = 0.5  # polar winter zero Ra -> shortwave zero; conservative mid cloud term

    t_max_k = t_max_c + 273.16
    t_min_k = t_min_c + 273.16
    r_nl = (
        STEFAN_BOLTZMANN_DAILY
        * ((t_max_k ** 4 + t_min_k ** 4) / 2.0)
        * (0.34 - 0.14 * math.sqrt(e_a))
        * (1.35 * rs_rso - 0.35)
    )
    r_n = r_ns - max(0.0, r_nl)
    soil_heat_flux_g = 0.0  # Eq. 42 daily assumption

    u2 = wind_speed_at_2m(float(wind_speed_ms), wind_height_m)

    # FAO-56 Eq. 6 Penman-Monteith
    num = 0.408 * delta * (r_n - soil_heat_flux_g) + gamma * (900.0 / (t_mean_c + 273.0)) * u2 * vpd_kpa
    den = delta + gamma * (1.0 + 0.34 * u2)
    et0 = max(0.0, num / den)

    return {
        "available": True,
        "et0_mm_day": et0,
        "t_mean_c": t_mean_c,
        "p_kpa": p_kpa,
        "pressure_source": pressure_source,
        "gamma_kpa_c": gamma,
        "delta_kpa_c": delta,
        "es_kpa": e_s,
        "ea_kpa": e_a,
        "ea_method": ea_method,
        "vpd_kpa": vpd_kpa,
        "ra_mj_m2_day": ra,
        "rs_mj_m2_day": r_s,
        "rs_method": rs_method,
        "rso_mj_m2_day": r_so,
        "rns_mj_m2_day": r_ns,
        "rnl_mj_m2_day": max(0.0, r_nl),
        "rn_mj_m2_day": r_n,
        "u2_ms": u2,
    }
