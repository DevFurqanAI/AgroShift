"""End-to-end Phase 4W comparison tests: NASA parsing, Kc, cross-year cycles, monthly deficit, alignment & invariance."""
from datetime import date, timedelta
from pathlib import Path
import sys
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fastapi.testclient import TestClient
import pytest
import requests

from app.main import app
from app.rotation.catalog import CROPS
from app.rotation.engine import calculate_plan
from app.rotation.models import RotationRequest
from app.water.crop_coefficients import CROP_KC_PROFILES, build_daily_kc_curve, get_crop_kc_profile
from app.water.nasa_daily import NASADailyError, clear_nasa_daily_cache, parse_nasa_daily_payload

client = TestClient(app)


def _generate_synthetic_daily_weather(
    start_year: int,
    end_year: int,
    *,
    monthly_rain_mm_day: dict[int, float] | None = None,
    t_max_c: float = 30.0,
    t_min_c: float = 18.0,
    rh2m: float = 48.0,
    ws2m: float = 2.2,
    sw_dwn: float = 22.0,
    ps_kpa: float = 99.5,
    omit_year_months: set[tuple[int, int]] | None = None,
) -> list[dict]:
    rain_by_m = monthly_rain_mm_day or {m: 0.5 for m in range(1, 13)}
    omit = omit_year_months or set()
    rows: list[dict] = []
    cur = date(start_year, 1, 1)
    end_dt = date(end_year, 12, 31)
    while cur <= end_dt:
        if (cur.year, cur.month) not in omit:
            rows.append({
                "date": cur.isoformat(),
                "t2m_c": (t_max_c + t_min_c) / 2.0,
                "t2m_max_c": t_max_c,
                "t2m_min_c": t_min_c,
                "rh2m_percent": rh2m,
                "t2m_dew_c": t_min_c - 2.0,
                "ws2m_ms": ws2m,
                "solar_radiation_mj_m2_day": sw_dwn,
                "precip_mm_day": rain_by_m.get(cur.month, 0.0),
                "surface_pressure_kpa": ps_kpa,
            })
        cur += timedelta(days=1)
    return rows


def test_kc_registry_covers_all_14_crops_and_discloses_preliminary_and_rice():
    assert set(CROP_KC_PROFILES.keys()) == set(CROPS.keys())
    assert CROP_KC_PROFILES["chickpea"].evidence_status == "preliminary"
    assert CROP_KC_PROFILES["canola"].evidence_status == "preliminary"
    assert CROP_KC_PROFILES["rice"].requires_paddy_water_adjustment is True
    assert get_crop_kc_profile("unknown_quinoa_xyz") is None

    wheat = CROP_KC_PROFILES["wheat"]
    curve = build_daily_kc_curve(wheat)
    assert len(curve) == wheat.total_days
    assert curve[0] == pytest.approx(wheat.kc_ini)
    assert curve[wheat.l_ini + wheat.l_dev] == pytest.approx(wheat.kc_mid)
    assert curve[-1] == pytest.approx(wheat.kc_end)


def test_nasa_daily_payload_parser_preserves_zero_rain_and_rejects_sentinels():
    payload = {
        "geometry": {"coordinates": [73.135, 31.45, 182.92]},
        "header": {"fill_value": -999.0, "api": {"version": "v2.10.3"}},
        "parameters": {
            "ALLSKY_SFC_SW_DWN": {"units": "MJ/m^2/day"},
            "WS2M": {"units": "m/s"},
            "PS": {"units": "kPa"},
        },
        "properties": {
            "parameter": {
                "T2M": {"20230601": 33.0, "20230602": -999.0},
                "T2M_MAX": {"20230601": 40.0, "20230602": 15.0},
                "T2M_MIN": {"20230601": 26.0, "20230602": 25.0},  # Inverted Tmax < Tmin
                "RH2M": {"20230601": 38.0, "20230602": 115.0},  # > 100 invalid
                "T2MDEW": {"20230601": 16.0, "20230602": 12.0},
                "WS2M": {"20230601": 2.4, "20230602": -999.0},
                "ALLSKY_SFC_SW_DWN": {"20230601": 25.2, "20230602": -999.0},
                "PRECTOTCORR": {"20230601": 0.0, "20230602": -999.0},
                "PS": {"20230601": 98.9, "20230602": -999.0},
            }
        },
    }
    parsed = parse_nasa_daily_payload(
        payload,
        latitude=31.45,
        longitude=73.135,
        start_year=2023,
        end_year=2023,
    )
    assert parsed["location"]["elevation_m"] == pytest.approx(182.92)
    day1, day2 = parsed["days"]
    assert day1["precip_mm_day"] == 0.0  # Dry day 0.0 preserved
    assert day2["precip_mm_day"] is None  # Sentinel -999 never converted to 0.0
    assert day2["t2m_max_c"] is None  # Inverted pair rejected
    assert day2["rh2m_percent"] is None  # Out-of-bounds RH rejected


def test_monthly_deficit_does_not_offset_across_months_and_handles_cross_year_cycles():
    # Extreme contrast: Month 11 (Nov) very rainy (20 mm/day -> ~600 mm/mo, Peff >> ETc);
    # Months 12, 1, 2, 3 completely dry (0.0 mm/day).
    rain_pattern = {m: (20.0 if m == 11 else 0.0) for m in range(1, 13)}
    daily = _generate_synthetic_daily_weather(2019, 2023, monthly_rain_mm_day=rain_pattern)

    resp = client.post("/api/v1/water/compare", json={
        "latitude": 31.45,
        "longitude": 73.135,
        "start_year": 2019,
        "end_year": 2023,
        "cultivated_area_ha": 2.5,
        "plans": [
            {
                "plan_id": "wheat_chickpea",
                "label": "Wheat -> Chickpea",
                "seasons": [
                    {"crop_id": "wheat", "planting_month": 11},  # Nov -> Mar (crosses year boundary)
                    {"crop_id": "chickpea", "planting_month": 6},
                ],
            },
            {
                "plan_id": "rice_wheat",
                "label": "Rice -> Wheat",
                "is_current_practice": True,
                "seasons": [
                    {"crop_id": "rice", "planting_month": 6},
                    {"crop_id": "wheat", "planting_month": 11},
                ],
            },
        ],
        "daily_weather": daily,
    })
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "ok"
    assert data["meteorology"]["is_verified_nasa_observation"] is False
    assert data["farm_water_context"]["water_availability_confirmed"] is False
    assert "cannot be determined" in data["farm_water_context"]["water_availability_note"].lower()
    assert data["paddy_rice_caveat"] is not None

    wheat_chick = next(p for p in data["plans"] if p["plan_id"] == "wheat_chickpea")
    rice_wheat = next(p for p in data["plans"] if p["plan_id"] == "rice_wheat")
    assert wheat_chick["evidence_status"] == "preliminary"  # Chickpea uses preliminary Table 11 proxy
    assert rice_wheat["has_paddy_rice_caveat"] is True

    # Crucial physics check: wheat Nov has high Peff (> ETc in Nov), while Dec-Mar have Peff=0.
    # Seasonal deficit MUST equal Dec-Mar ETc (~hundreds of mm) and NOT be reduced by Nov surplus!
    wheat_season = wheat_chick["seasons"][0]
    assert wheat_season["mean_precip_mm"] > 500.0
    # Naive seasonal subtraction (ETc - Peff) would be much smaller than monthly sum max(0, ETc_m - Peff_m):
    naive_diff = max(0.0, wheat_season["mean_etc_mm"] - wheat_season["mean_effective_rainfall_mm"])
    assert wheat_season["mean_preliminary_deficit_mm"] > naive_diff + 40.0

    # Area conversion check: 1 mm * 2.5 ha * 10 = 25 m3 per mm
    expected_m3 = round(wheat_chick["totals_mean_mm"]["preliminary_deficit_mm"] * 2.5 * 10.0, 1)
    assert wheat_chick["volumes_mean_m3"]["preliminary_deficit_m3"] == pytest.approx(expected_m3, abs=2.0)

    # Equal historical period check: 2019..2022 cross-year cycles complete within 2019..2023; 2023 cycle ends in 2024 so skipped
    assert wheat_chick["comparable_years_used"] == rice_wheat["comparable_years_used"]
    assert len(wheat_chick["comparable_years_used"]) == 4


def test_unknown_area_omits_volume_and_unknown_crop_omits_fabricated_kc():
    daily = _generate_synthetic_daily_weather(2020, 2022)
    resp = client.post("/api/v1/water/compare", json={
        "latitude": 31.45,
        "longitude": 73.135,
        "start_year": 2020,
        "end_year": 2022,
        "plans": [
            {
                "plan_id": "sorghum_millet",
                "label": "Sorghum -> Millet",
                "seasons": [
                    {"crop_id": "sorghum", "planting_month": 3},
                    {"crop_id": "millet", "planting_month": 8},
                ],
            },
            {
                "plan_id": "unknown_crop",
                "label": "Unknown Crop Plan",
                "seasons": [{"crop_id": "dragonfruit_xyz", "planting_month": 4}],
            },
        ],
        "daily_weather": daily,
    })
    assert resp.status_code == 200
    data = resp.json()
    sorghum_plan = next(p for p in data["plans"] if p["plan_id"] == "sorghum_millet")
    unknown_plan = next(p for p in data["plans"] if p["plan_id"] == "unknown_crop")

    assert sorghum_plan["available"] is True
    assert sorghum_plan["volumes_mean_m3"]["area_ha"] is None
    assert sorghum_plan["volumes_mean_m3"]["preliminary_deficit_m3"] is None
    assert unknown_plan["available"] is False
    assert unknown_plan["status"] == "unavailable_crop_kc"
    assert unknown_plan["totals_mean_mm"] is None


def test_equal_historical_period_alignment_and_insufficient_common_years():
    # Window 2020..2024 -> Plan B (Wheat Oct, 150d) completes in 2020, 2021, 2022, 2023.
    # Omitting (2021, 5) removes 2021 for Maize Mar; omitting (2020, 10) removes 2020 for Wheat Oct.
    # Plan A has [2020, 2022, 2023, 2024]; Plan B has [2021, 2022, 2023] -> common = [2022, 2023].
    daily = _generate_synthetic_daily_weather(
        2020,
        2024,
        omit_year_months={(2021, 5), (2020, 10)},
    )
    resp = client.post("/api/v1/water/compare", json={
        "latitude": 30.0,
        "longitude": 71.0,
        "start_year": 2020,
        "end_year": 2024,
        "plans": [
            {
                "plan_id": "plan_a",
                "label": "Plan A (Maize Mar)",
                "seasons": [{"crop_id": "maize", "planting_month": 3}],
            },
            {
                "plan_id": "plan_b",
                "label": "Plan B (Wheat Oct)",
                "seasons": [{"crop_id": "wheat", "planting_month": 10}],
            },
        ],
        "daily_weather": daily,
    })
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "ok"
    assert data["comparison"]["common_comparable_years"] == [2022, 2023]

    # Now make common years < 2 by omitting (2023, 5) too -> only [2022] common across multi-year request!
    daily2 = _generate_synthetic_daily_weather(
        2020,
        2024,
        omit_year_months={(2021, 5), (2023, 5), (2020, 10)},
    )
    resp2 = client.post("/api/v1/water/compare", json={
        "latitude": 30.0,
        "longitude": 71.0,
        "start_year": 2020,
        "end_year": 2024,
        "plans": [
            {"plan_id": "plan_a", "label": "Plan A", "seasons": [{"crop_id": "maize", "planting_month": 3}]},
            {"plan_id": "plan_b", "label": "Plan B", "seasons": [{"crop_id": "wheat", "planting_month": 10}]},
        ],
        "daily_weather": daily2,
    })
    assert resp2.status_code == 200
    data2 = resp2.json()
    assert data2["status"] == "insufficient_comparable_data"
    assert data2["plans"][0]["available"] is False


def test_single_shared_nasa_fetch_for_multiple_plans_and_graceful_timeout():
    clear_nasa_daily_cache()
    daily = _generate_synthetic_daily_weather(2020, 2022)
    fake_nasa = {
        "geometry": {"coordinates": [73.135, 31.45, 182.9]},
        "header": {"fill_value": -999.0, "api": {"version": "v2.10.3"}},
        "parameters": {
            "ALLSKY_SFC_SW_DWN": {"units": "MJ/m^2/day"},
            "WS2M": {"units": "m/s"},
            "PS": {"units": "kPa"},
        },
        "properties": {
            "parameter": {
                k: {d["date"].replace("-", ""): d[f] for d in daily}
                for k, f in [
                    ("T2M", "t2m_c"),
                    ("T2M_MAX", "t2m_max_c"),
                    ("T2M_MIN", "t2m_min_c"),
                    ("RH2M", "rh2m_percent"),
                    ("T2MDEW", "t2m_dew_c"),
                    ("WS2M", "ws2m_ms"),
                    ("ALLSKY_SFC_SW_DWN", "solar_radiation_mj_m2_day"),
                    ("PRECTOTCORR", "precip_mm_day"),
                    ("PS", "surface_pressure_kpa"),
                ]
            }
        },
    }

    class FakeResp:
        status_code = 200

        def raise_for_status(self):
            return None

        def json(self):
            return fake_nasa

    with patch("app.water.nasa_daily.requests.get", return_value=FakeResp()) as mock_get:
        resp = client.post("/api/v1/water/compare", json={
            "latitude": 31.45,
            "longitude": 73.135,
            "start_year": 2020,
            "end_year": 2022,
            "plans": [
                {"plan_id": "p1", "label": "P1", "seasons": [{"crop_id": "wheat", "planting_month": 11}]},
                {"plan_id": "p2", "label": "P2", "seasons": [{"crop_id": "rice", "planting_month": 6}]},
                {"plan_id": "p3", "label": "P3", "seasons": [{"crop_id": "maize", "planting_month": 3}]},
            ],
        })
        assert resp.status_code == 200
        assert mock_get.call_count == 1  # Shared single download across 3 plans!
        assert resp.json()["meteorology"]["is_verified_nasa_observation"] is True

    # Timeout failure returns unavailable without fabricated zeros
    clear_nasa_daily_cache()
    with patch("app.water.nasa_daily.requests.get", side_effect=requests.Timeout("timed out")):
        err_resp = client.post("/api/v1/water/compare", json={
            "latitude": 31.45,
            "longitude": 73.135,
            "start_year": 2020,
            "end_year": 2022,
            "plans": [{"plan_id": "p1", "label": "P1", "seasons": [{"crop_id": "wheat", "planting_month": 11}]}],
        })
        assert err_resp.status_code == 200
        err_data = err_resp.json()
        assert err_data["status"] == "data_unavailable"
        assert err_data["data_available"] is False
        assert err_data["plans"] == []


def test_rotation_engine_scores_and_weights_remain_unchanged():
    """Guardrail: Phase 4W never alters existing Phase 4B rotation scoring or ranking."""
    monthly = []
    for y in (2020, 2021, 2022):
        for m in range(1, 13):
            monthly.append({
                "month": f"{y}{m:02d}",
                "temperature_c": [13, 16, 22, 28, 33, 35, 33, 32, 30, 25, 19, 14][m - 1],
                "estimated_monthly_precipitation_mm": [18, 22, 25, 18, 15, 45, 110, 95, 40, 8, 5, 12][m - 1],
                "precipitation_mm_per_day": 1.0,
            })

    req = RotationRequest(
        latitude=31.45,
        longitude=73.135,
        country="Pakistan",
        country_code="PK",
        region="Punjab",
        previous_crop="wheat",
        planting_month=6,
        seasons=2,
        goal="water",
        water_availability="medium",
        candidate_crop_ids=["rice", "maize", "sorghum", "wheat", "chickpea"],
        climate_monthly=monthly,
    )
    res = calculate_plan(req, monthly, "NASA POWER")
    assert res["status"] == "ok"
    assert res["plans"][0]["diagnostics"]["goal_weights_applied"]["water"] == pytest.approx(0.36, abs=0.01)
    assert len(res["plans"]) > 0
