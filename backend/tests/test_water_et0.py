"""Physical unit tests for FAO-56 Penman-Monteith daily ET0 & USDA-SCS effective rainfall."""
from datetime import date, timedelta
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import pytest

from app.water.effective_rainfall import (
    estimate_monthly_effective_rainfall_mm,
    estimate_overlap_effective_rainfall_mm,
)
from app.water.fao56_et0 import (
    atmospheric_pressure_from_elevation_kpa,
    calculate_daily_fao56_et0,
    saturation_vapour_pressure_kpa,
    solar_geometry,
    wind_speed_at_2m,
)


def test_fao56_example18_uccle_daily_et0_benchmark():
    """Verify FAO-56 Paper No. 56 Example 18 (Uccle, 6 July, lat 50°48'N, elev 100 m -> ~3.88 mm/day)."""
    u10_ms = 10.0 / 3.6  # 10 km/h measured at 10 m
    res = calculate_daily_fao56_et0(
        latitude=50.0 + 48.0 / 60.0,
        day_date=date(2001, 7, 6),  # J = 187
        t_max_c=21.5,
        t_min_c=12.3,
        rh_max_percent=84.0,
        rh_min_percent=63.0,
        wind_speed_ms=u10_ms,
        wind_height_m=10.0,
        sunshine_hours=9.25,
        elevation_m=100.0,
    )
    assert res["available"] is True
    assert res["pressure_source"] == "elevation_eq7"
    assert res["ea_method"] == "fao56_eq17_rh_max_min"
    assert res["rs_method"] == "fao56_eq35_angstrom_sunshine"
    assert res["p_kpa"] == pytest.approx(100.1, abs=0.1)
    assert res["delta_kpa_c"] == pytest.approx(0.122, abs=0.002)
    assert res["gamma_kpa_c"] == pytest.approx(0.0666, abs=0.0005)
    assert res["es_kpa"] == pytest.approx(2.00, abs=0.02)
    assert res["ea_kpa"] == pytest.approx(1.41, abs=0.02)
    assert res["vpd_kpa"] == pytest.approx(0.59, abs=0.02)
    assert res["u2_ms"] == pytest.approx(2.08, abs=0.03)
    assert res["ra_mj_m2_day"] == pytest.approx(41.1, abs=0.2)
    assert res["rs_mj_m2_day"] == pytest.approx(22.1, abs=0.2)
    assert res["rn_mj_m2_day"] == pytest.approx(13.3, abs=0.2)
    assert res["et0_mm_day"] == pytest.approx(3.88, abs=0.08)


def test_fao56_et0_climate_extremes_and_hemispheres():
    """Verify monotonic physical responses across hot/dry, cool/humid, wind=0, high solar, and equator/SH."""
    base_kwargs = dict(
        latitude=31.45,
        day_date=date(2023, 6, 15),
        t_max_c=38.0,
        t_min_c=24.0,
        rh_mean_percent=30.0,
        wind_speed_ms=2.5,
        solar_radiation_mj_m2_day=26.0,
        surface_pressure_kpa=99.0,
    )
    hot_dry = calculate_daily_fao56_et0(**base_kwargs)
    cool_humid = calculate_daily_fao56_et0(
        **{**base_kwargs, "t_max_c": 16.0, "t_min_c": 9.0, "rh_mean_percent": 88.0, "solar_radiation_mj_m2_day": 10.0}
    )
    zero_wind = calculate_daily_fao56_et0(**{**base_kwargs, "wind_speed_ms": 0.0})
    high_wind = calculate_daily_fao56_et0(**{**base_kwargs, "wind_speed_ms": 6.0})
    equator = calculate_daily_fao56_et0(**{**base_kwargs, "latitude": 0.0})
    southern_summer = calculate_daily_fao56_et0(**{**base_kwargs, "latitude": -34.2, "day_date": date(2023, 1, 15)})
    southern_winter = calculate_daily_fao56_et0(**{**base_kwargs, "latitude": -34.2, "day_date": date(2023, 7, 15)})

    assert hot_dry["available"] and cool_humid["available"]
    assert hot_dry["et0_mm_day"] > cool_humid["et0_mm_day"] * 2.5
    assert zero_wind["available"] and zero_wind["et0_mm_day"] > 0.0
    assert high_wind["et0_mm_day"] > zero_wind["et0_mm_day"]
    assert equator["available"] and equator["ra_mj_m2_day"] > 30.0
    assert southern_summer["et0_mm_day"] > southern_winter["et0_mm_day"]


def test_fao56_leap_year_and_tdew_fallback():
    """Verify leap year day-of-year (2020-02-29 is J=60, 2020-12-31 is J=366) and T2MDEW vapour pressure path."""
    geom_feb29 = solar_geometry(30.0, date(2020, 2, 29))
    geom_dec31 = solar_geometry(30.0, date(2020, 12, 31))
    assert geom_feb29["julian_day"] == 60.0
    assert geom_dec31["julian_day"] == 366.0

    dew_res = calculate_daily_fao56_et0(
        latitude=-1.28,
        day_date=date(2020, 2, 29),
        t_max_c=28.0,
        t_min_c=16.0,
        t_dew_c=14.0,
        wind_speed_ms=1.8,
        solar_radiation_mj_m2_day=21.5,
        elevation_m=1500.0,
    )
    assert dew_res["available"] is True
    assert dew_res["ea_method"] == "fao56_eq14_tdew"
    assert dew_res["ea_kpa"] == pytest.approx(saturation_vapour_pressure_kpa(14.0), rel=1e-4)
    assert dew_res["p_kpa"] == pytest.approx(atmospheric_pressure_from_elevation_kpa(1500.0), rel=1e-4)


def test_fao56_rejects_invalid_and_missing_inputs_without_fabrication():
    """Verify missing elevation+pressure, RH>100, Tmax<Tmin, and missing weather fail cleanly."""
    no_pressure_or_elev = calculate_daily_fao56_et0(
        latitude=30.0,
        day_date=date(2023, 5, 1),
        t_max_c=30.0,
        t_min_c=18.0,
        rh_mean_percent=50.0,
        wind_speed_ms=2.0,
        solar_radiation_mj_m2_day=22.0,
    )
    assert no_pressure_or_elev["available"] is False
    assert no_pressure_or_elev["et0_mm_day"] is None

    bad_rh = calculate_daily_fao56_et0(
        latitude=30.0,
        day_date=date(2023, 5, 1),
        t_max_c=30.0,
        t_min_c=18.0,
        rh_mean_percent=108.0,
        wind_speed_ms=2.0,
        solar_radiation_mj_m2_day=22.0,
        elevation_m=150.0,
    )
    assert bad_rh["available"] is False

    inverted_t = calculate_daily_fao56_et0(
        latitude=30.0,
        day_date=date(2023, 5, 1),
        t_max_c=15.0,
        t_min_c=22.0,
        rh_mean_percent=55.0,
        wind_speed_ms=2.0,
        solar_radiation_mj_m2_day=20.0,
        elevation_m=150.0,
    )
    assert inverted_t["available"] is False

    missing_solar = calculate_daily_fao56_et0(
        latitude=30.0,
        day_date=date(2023, 5, 1),
        t_max_c=28.0,
        t_min_c=16.0,
        rh_mean_percent=55.0,
        wind_speed_ms=2.0,
        elevation_m=150.0,
    )
    assert missing_solar["available"] is False
    assert wind_speed_at_2m(2.5, 2.0) == 2.5


def test_usda_scs_effective_rainfall_pieces_and_invariants():
    """Verify USDA-SCS piecewise formula, boundary prorating, Peff <= P, and None preservation."""
    assert estimate_monthly_effective_rainfall_mm(None) is None
    assert estimate_monthly_effective_rainfall_mm(-5.0) is None
    assert estimate_monthly_effective_rainfall_mm(0.0) == 0.0

    # At P = 100 mm (<= 250): 100 * (125 - 20) / 125 = 84.0 mm
    assert estimate_monthly_effective_rainfall_mm(100.0) == pytest.approx(84.0, abs=1e-6)
    # At P = 250 mm boundary: both branches equal 150.0 mm
    assert estimate_monthly_effective_rainfall_mm(250.0) == pytest.approx(150.0, abs=1e-6)
    # At P = 400 mm (> 250): 125 + 40 = 165.0 mm
    assert estimate_monthly_effective_rainfall_mm(400.0) == pytest.approx(165.0, abs=1e-6)

    for p in (0.0, 2.0, 25.0, 120.0, 250.0, 350.0, 900.0):
        peff = estimate_monthly_effective_rainfall_mm(p)
        assert peff is not None
        assert 0.0 <= peff <= p

    # Partial month overlap prorates by active days and never exceeds actual active rainfall
    partial = estimate_overlap_effective_rainfall_mm(
        full_month_precip_mm=150.0,
        active_window_precip_mm=20.0,
        active_valid_days=15,
        month_valid_days=30,
    )
    assert partial is not None
    assert partial <= 20.0
    assert partial == pytest.approx(20.0, abs=1e-6)

    zero_active = estimate_overlap_effective_rainfall_mm(
        full_month_precip_mm=150.0,
        active_window_precip_mm=0.0,
        active_valid_days=10,
        month_valid_days=30,
    )
    assert zero_active == 0.0
