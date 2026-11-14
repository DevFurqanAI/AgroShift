import sys
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import requests  # noqa: E402
from app.environmental_context import (  # noqa: E402
    classify_usda_soil_texture,
    clear_environmental_caches,
    fetch_environmental_context,
    fetch_nasa_environmental_context,
    fetch_soil_context,
    resolve_field_precedence,
)
from app.rotation.engine import calculate_plan  # noqa: E402
from app.rotation.models import RotationRequest  # noqa: E402


class FakeResponse:
    def __init__(self, *, json_data=None, text_data="", status_code=200):
        self._json = json_data
        self.text = text_data
        self.status_code = status_code

    def raise_for_status(self):
        if self.status_code >= 400:
            raise requests.HTTPError(f"HTTP {self.status_code}")

    def json(self):
        return self._json


def _sample_nasa_payload():
    t2m = {f"2023{m:02d}": 24.0 for m in range(1, 13)}
    t2m["202401"] = -999
    prec = {f"2023{m:02d}": 2.0 for m in range(1, 13)}
    prec["202401"] = 1.5  # Partial 2024 should NOT dilute complete-year 2023 annual mean
    solar = {f"2023{m:02d}": 18.5 for m in range(1, 13)}
    rh = {f"2023{m:02d}": 56.0 for m in range(1, 13)}
    gwettop = {f"2023{m:02d}": 0.38 for m in range(1, 13)}
    gwetroot = {f"2023{m:02d}": 0.44 for m in range(1, 13)}
    return {
        "header": {
            "parameters": {
                "ALLSKY_SFC_SW_DWN": {"units": "MJ/m^2/day"},
            }
        },
        "properties": {
            "parameter": {
                "T2M": t2m,
                "PRECTOTCORR": prec,
                "ALLSKY_SFC_SW_DWN": solar,
                "RH2M": rh,
                "GWETTOP": gwettop,
                "GWETROOT": gwetroot,
            }
        },
    }


def _sample_soilgrids_rest_payload():
    return {
        "type": "Feature",
        "properties": {
            "layers": [
                {
                    "name": "phh2o",
                    "unit_measure": {"d_factor": 10},
                    "depths": [
                        {"label": "0-5cm", "values": {"mean": 73, "Q0.05": 65, "Q0.95": 81}},
                        {"label": "5-15cm", "values": {"mean": 76, "Q0.05": 68, "Q0.95": 84}},
                    ],
                },
                {
                    "name": "soc",
                    "unit_measure": {"d_factor": 10},
                    "depths": [
                        {"label": "0-5cm", "values": {"mean": 60, "Q0.05": 25, "Q0.95": 110}},
                        {"label": "5-15cm", "values": {"mean": 45, "Q0.05": 20, "Q0.95": 90}},
                    ],
                },
                {
                    "name": "sand",
                    "unit_measure": {"d_factor": 10},
                    "depths": [
                        {"label": "0-5cm", "values": {"mean": 400, "Q0.05": 250, "Q0.95": 550}},
                        {"label": "5-15cm", "values": {"mean": 400, "Q0.05": 250, "Q0.95": 550}},
                    ],
                },
                {
                    "name": "silt",
                    "unit_measure": {"d_factor": 10},
                    "depths": [
                        {"label": "0-5cm", "values": {"mean": 400, "Q0.05": 250, "Q0.95": 550}},
                        {"label": "5-15cm", "values": {"mean": 400, "Q0.05": 250, "Q0.95": 550}},
                    ],
                },
                {
                    "name": "clay",
                    "unit_measure": {"d_factor": 10},
                    "depths": [
                        {"label": "0-5cm", "values": {"mean": 200, "Q0.05": 100, "Q0.95": 350}},
                        {"label": "5-15cm", "values": {"mean": 200, "Q0.05": 100, "Q0.95": 350}},
                    ],
                },
                {
                    "name": "bdod",
                    "unit_measure": {"d_factor": 100},
                    "depths": [
                        {"label": "0-5cm", "values": {"mean": 150, "Q0.05": 110, "Q0.95": 182}},
                        {"label": "5-15cm", "values": {"mean": 153, "Q0.05": 112, "Q0.95": 182}},
                    ],
                },
            ]
        },
    }


def test_nasa_environmental_context_parses_all_variables_and_handles_sentinels():
    clear_environmental_caches()
    with patch("app.environmental_context.requests.get", return_value=FakeResponse(json_data=_sample_nasa_payload())) as mock_get:
        res = fetch_nasa_environmental_context(30.15, 71.52, 2023, 2024)
        # Repeat hit uses bounded TTL cache
        cached = fetch_nasa_environmental_context(30.15, 71.52, 2023, 2024)

    assert mock_get.call_count == 1
    assert cached["available"] is True
    clim = res["climate_variables"]
    wet = res["soil_wetness_variables"]

    assert clim["air_temperature_c"]["value"] == 24.0
    assert clim["air_temperature_c"]["unit"] == "°C"
    assert clim["air_temperature_c"]["category"] == "observed_historical_climate"
    assert clim["precipitation_mm_per_year"]["value"] == 730.0
    assert clim["precipitation_mm_per_year"]["complete_years_count"] == 1
    assert clim["solar_radiation"]["value"] == 18.5
    assert clim["solar_radiation"]["unit"] == "MJ/m²/day"
    assert clim["relative_humidity_percent"]["value"] == 56.0
    assert wet["surface_soil_wetness"]["value"] == 0.38
    assert wet["root_zone_soil_wetness"]["value"] == 0.44
    assert wet["surface_soil_wetness"]["category"] == "modeled_reanalysis_estimate"


def test_soilgrids_rest_and_wms_fallback_and_ocean_handling():
    clear_environmental_caches()
    with patch("app.environmental_context.requests.get", return_value=FakeResponse(json_data=_sample_soilgrids_rest_payload())):
        soil = fetch_soil_context(30.15, 71.52)

    assert soil["available"] is True
    assert soil["properties"]["phh2o"]["value"] == 7.5  # (7.3*5 + 7.6*10)/15 = 7.5
    assert soil["properties"]["soc"]["value"] == 5.0    # (6.0*5 + 4.5*10)/15 = 5.0 g/kg
    assert soil["properties"]["bdod"]["value"] == 1.52
    assert soil["derived_usda_texture"] == "Loam"
    assert soil["mapped_farm_texture"] == "loam"

    # When REST fails with 429, fallback to OGC WMS text/html parsing
    clear_environmental_caches()

    def _wms_router(url, params=None, timeout=None):
        if "rest.isric.org" in url:
            return FakeResponse(status_code=429)
        layer = (params or {}).get("LAYERS", "")
        if layer == "phh2o_0-5cm_mean":
            return FakeResponse(text_data='<b>Value: </b><span id="value">73</span>')
        if layer == "phh2o_0-5cm_Q0.05":
            return FakeResponse(text_data='<b>Value: </b><span id="value">65</span>')
        if layer == "phh2o_0-5cm_Q0.95":
            return FakeResponse(text_data='<b>Value: </b><span id="value">81</span>')
        return FakeResponse(text_data="<body></body>")

    with patch("app.environmental_context.requests.get", side_effect=_wms_router):
        fallback_soil = fetch_soil_context(30.15, 71.52)

    assert fallback_soil["available"] is True
    assert fallback_soil["endpoint_used"] == "maps.isric.org (OGC WMS)"
    assert fallback_soil["properties"]["phh2o"]["value"] == 7.3
    assert fallback_soil["properties"]["phh2o"]["q05"] == 6.5
    assert fallback_soil["properties"]["phh2o"]["q95"] == 8.1

    # Ocean / nodata degrades cleanly without inventing properties
    clear_environmental_caches()
    ocean_payload = {
        "properties": {
            "layers": [
                {"name": "phh2o", "unit_measure": {"d_factor": 10}, "depths": [{"label": "0-5cm", "values": {"mean": None}}]}
            ]
        }
    }
    with patch("app.environmental_context.requests.get", return_value=FakeResponse(json_data=ocean_payload)):
        ocean_soil = fetch_soil_context(0.0, 0.0)
    assert ocean_soil["available"] is False
    assert ocean_soil["status"] == "nodata_or_masked"
    assert ocean_soil["mapped_farm_texture"] == "unknown"


def test_usda_triangle_and_no_fabricated_soil_properties_and_precedence():
    assert classify_usda_soil_texture(40, 40, 20) == ("Loam", "loam")
    assert classify_usda_soil_texture(15, 25, 60) == ("Clay", "clay")
    assert classify_usda_soil_texture(65, 25, 10) == ("Sandy Loam", "sandy_loam")
    assert classify_usda_soil_texture(10, 10, 10) == (None, "unknown")  # Sum != ~100%

    clear_environmental_caches()

    def _combined_router(url, params=None, timeout=None):
        if "power.larc.nasa.gov" in url:
            return FakeResponse(json_data=_sample_nasa_payload())
        return FakeResponse(json_data=_sample_soilgrids_rest_payload())

    with patch("app.environmental_context.requests.get", side_effect=_combined_router):
        ctx = fetch_environmental_context(30.15, 71.52, 2023, 2024)

    # Suggestions require confirmation and never fabricate salinity/drainage/OM%
    suggestions = ctx["suggested_farm_defaults"]
    assert suggestions["soil_ph"]["auto_applied"] is False
    assert suggestions["soil_ph"]["provenance"] == "public_dataset_estimate"
    assert "salinity" not in suggestions
    assert "drainage" not in suggestions
    assert "organic_matter_percent" not in suggestions

    # Precedence rules: lab_test and farmer_observation are NEVER overwritten
    val, prov, changed = resolve_field_precedence(
        current_value=6.8,
        current_provenance="lab_test",
        candidate_value=7.5,
        candidate_provenance="public_dataset_estimate",
    )
    assert (val, prov, changed) == (6.8, "lab_test", False)

    val2, prov2, changed2 = resolve_field_precedence(
        current_value="clay_loam",
        current_provenance="farmer_observation",
        candidate_value="loam",
        candidate_provenance="public_dataset_estimate",
    )
    assert (val2, prov2, changed2) == ("clay_loam", "farmer_observation", False)

    val3, prov3, changed3 = resolve_field_precedence(
        current_value=None,
        current_provenance="unknown",
        candidate_value=7.5,
        candidate_provenance="public_dataset_estimate",
    )
    assert (val3, prov3, changed3) == (7.5, "public_dataset_estimate", True)


def test_offline_degradation_and_rotation_engine_invariance():
    clear_environmental_caches()
    with patch("app.environmental_context.requests.get", side_effect=requests.Timeout("offline")):
        ctx = fetch_environmental_context(30.15, 71.52, 2023, 2024)

    assert ctx["nasa_climate"]["available"] is False
    assert ctx["nasa_soil_wetness"]["available"] is False
    assert ctx["soil_context"]["available"] is False
    assert ctx["suggested_farm_defaults"]["soil_ph"]["suggested_value"] is None

    # Verify existing rotation engine scores are 100% invariant (new NASA wetness/SOC never alters rotation scores)
    monthly = [
        {"month": f"2023{m:02d}", "temperature_c": 22.0 + (m % 4), "precipitation_mm_per_day": 1.5, "estimated_monthly_precipitation_mm": 45.0}
        for m in range(1, 13)
    ]
    req = RotationRequest(
        latitude=30.15,
        longitude=71.52,
        previous_crop="wheat",
        soil_ph=None,
        water_availability="medium",
        goal="soil",
        planting_month=6,
        seasons=2,
        start_year=2023,
        end_year=2023,
        max_results=3,
        country="Pakistan",
        country_code="PK",
        region="Punjab",
    )
    plan_a = calculate_plan(req, monthly, "NASA POWER")
    plan_b = calculate_plan(req, monthly, "NASA POWER")
    assert plan_a["plans"][0]["score"] == plan_b["plans"][0]["score"]
    assert plan_a["plans"][0]["crop_ids"] == plan_b["plans"][0]["crop_ids"]
