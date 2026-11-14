import sys
from pathlib import Path
from unittest.mock import MagicMock, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app import services  # noqa: E402


def _clean_satellite(ndvi: float, ndmi: float, obs_date: str = "2026-11-09") -> dict:
    return {
        "satellite_available": True,
        "ndvi": ndvi,
        "ndmi": ndmi,
        "satellite_observation_date": obs_date,
        "cloud_cover_percent": 4.0,
        "valid_coverage_percent": 96.0,
        "excluded_pixel_percent": 4.0,
        "satellite_message": None,
        "satellite_error_kind": None,
    }


def _clean_weather(temp_c: float, rain_mm: float, humidity: int = 58) -> dict:
    return {
        "weather_available": True,
        "weather_source": "open-meteo",
        "weather_data_type": "daily_summary",
        "weather_is_forecast": False,
        "weather_observation_window": "Open-Meteo daily summary",
        "temperature_c": temp_c,
        "humidity_percent": humidity,
        "recent_rainfall_mm": rain_mm,
        "weather_message": None,
        "weather_error_kind": None,
    }


def test_freezing_temperature_with_low_ndmi_bosnia_case_is_never_classified_warm_or_drought():
    """Regression: Bosnia & Herzegovina Nov snapshot (NDVI=0.577, NDMI=0.058, T=-1.7 C, rain=0 mm)."""
    services.clear_provider_caches()
    sat = _clean_satellite(ndvi=0.577, ndmi=0.058, obs_date="2026-11-09")
    weather = _clean_weather(temp_c=-1.7, rain_mm=0.0, humidity=68)

    with patch("app.services.get_satellite_data", return_value=sat), \
         patch("app.services.get_weather_data", return_value=weather), \
         patch("app.services.groq_client", None):
        out = services.process_farm_analysis(44.2, 17.9, 10.0, None, "en")

    # Original indices, weather, date, quality, and attribution preserved verbatim
    assert out["ndvi"] == 0.577
    assert out["ndmi"] == 0.058
    assert out["temperature_c"] == -1.7
    assert out["recent_rainfall_mm"] == 0.0
    assert out["satellite_observation_date"] == "2026-11-09"
    assert out["valid_coverage_percent"] == 96.0
    assert out["excluded_pixel_percent"] == 4.0
    assert out["weather_source"] == "open-meteo"

    # Must not flag freezing low-NDMI + 0 mm rain as possible drought / warm-weather moisture stress
    assert out["possible_water_stress"] is None
    assert out["moisture_stress_status"] == "INCONCLUSIVE_COLD_OR_DORMANT"
    assert out["analysis_confidence"] == "MODERATE"

    combined_text = " ".join([out["ai_explanation"], out["confidence_reason"], *out["recommendations"]]).lower()
    assert "warm" not in combined_text
    assert "freezing" in combined_text
    assert "dormancy" in combined_text
    assert "senescence" in combined_text
    assert "frost" in combined_text
    assert "unknown" in combined_text
    assert "not confirmed drought" in combined_text or "does not indicate" in combined_text

    # Also verify Urdu deterministic output stays cold-aware and non-certain
    with patch("app.services.get_satellite_data", return_value=sat), \
         patch("app.services.get_weather_data", return_value=weather), \
         patch("app.services.groq_client", None):
        out_ur = services.process_farm_analysis(44.2, 17.9, 10.0, None, "ur")
    assert out_ur["possible_water_stress"] is None
    assert out_ur["moisture_stress_status"] == "INCONCLUSIVE_COLD_OR_DORMANT"
    assert "گرم" not in out_ur["ai_explanation"]


def test_near_freezing_and_llm_guardrail_rejects_warm_claim():
    """Near-freezing (<= 5 C) never passes warm claims even if an external LLM emits them."""
    facts = {
        "ndvi": 0.55,
        "ndmi": 0.06,
        "ndmi_status": "LOW",
        "temperature_c": -1.7,
        "recent_rainfall_mm": 0.0,
        "heat_risk": "LOW",
        "rainfall_status": "LOW",
        "possible_water_stress": None,
        "moisture_stress_status": "INCONCLUSIVE_COLD_OR_DORMANT",
        "observation_month": "November",
        "satellite_available": True,
        "weather_available": True,
    }
    bad_llm_choice = MagicMock()
    bad_llm_choice.message.content = (
        '{"ai_explanation": "Low NDMI with warm weather suggests moisture stress.", '
        '"recommendations": ["Inspect leaves in afternoon warmth."]}'
    )
    fake_groq = MagicMock()
    fake_groq.chat.completions.create.return_value = MagicMock(choices=[bad_llm_choice])

    with patch("app.services.groq_client", fake_groq):
        res = services.get_ai_explanation("en", facts)

    assert "warm" not in res["ai_explanation"].lower()
    assert all("warm" not in r.lower() for r in res["recommendations"])
    assert "freezing" in res["ai_explanation"].lower()


def test_hot_and_dry_weather_with_low_ndmi_flags_possible_stress_without_confirming_drought():
    services.clear_provider_caches()
    sat = _clean_satellite(ndvi=0.54, ndmi=0.04, obs_date="2026-07-15")
    weather = _clean_weather(temp_c=36.5, rain_mm=0.0, humidity=28)

    with patch("app.services.get_satellite_data", return_value=sat), \
         patch("app.services.get_weather_data", return_value=weather), \
         patch("app.services.groq_client", None):
        out = services.process_farm_analysis(31.2, 72.4, 5.0, None, "en")

    assert out["ndvi"] == 0.54
    assert out["ndmi"] == 0.04
    assert out["temperature_c"] == 36.5
    assert out["heat_risk"] == "MODERATE"
    assert out["rainfall_status"] == "LOW"
    assert out["possible_water_stress"] is True
    assert out["moisture_stress_status"] == "POSSIBLE_STRESS"

    explanation = out["ai_explanation"].lower()
    assert "not confirmed drought or irrigation deficiency" in explanation
    assert "uncertain" in explanation
    assert "unknown" in explanation


def test_healthy_vegetation_with_uncertain_seasonal_context_explains_uncertainty():
    services.clear_provider_caches()
    sat = _clean_satellite(ndvi=0.68, ndmi=0.29, obs_date="2026-11-09")
    weather = _clean_weather(temp_c=18.5, rain_mm=4.5, humidity=62)

    with patch("app.services.get_satellite_data", return_value=sat), \
         patch("app.services.get_weather_data", return_value=weather), \
         patch("app.services.groq_client", None):
        out = services.process_farm_analysis(44.2, 17.9, 8.0, None, "en")

    assert out["ndvi"] == 0.68
    assert out["ndmi"] == 0.29
    assert out["possible_water_stress"] is False
    assert out["moisture_stress_status"] == "NOT_FLAGGED"
    assert out["analysis_confidence"] == "MODERATE"
    assert "unknown" in out["ai_explanation"].lower()
    assert "uncertain" in out["ai_explanation"].lower()
    assert "unknown" in out["confidence_reason"].lower()

    # Also test high NDVI + moderate NDMI under freezing temperatures
    services.clear_provider_caches()
    freezing_weather = _clean_weather(temp_c=-1.2, rain_mm=0.0, humidity=70)
    with patch("app.services.get_satellite_data", return_value=sat), \
         patch("app.services.get_weather_data", return_value=freezing_weather), \
         patch("app.services.groq_client", None):
        out_cold = services.process_farm_analysis(44.2, 17.9, 8.0, None, "en")

    assert out_cold["possible_water_stress"] is False
    assert "freezing" in out_cold["ai_explanation"].lower()
    assert "warm" not in out_cold["ai_explanation"].lower()
    assert "uncertain" in out_cold["ai_explanation"].lower()


def test_missing_weather_observations_preserve_satellite_values_and_stay_unavailable():
    services.clear_provider_caches()
    sat = _clean_satellite(ndvi=0.577, ndmi=0.058, obs_date="2026-11-09")
    weather_missing = {
        "weather_available": False,
        "weather_message": "Weather provider temporarily unavailable.",
        "weather_error_kind": "timeout",
    }

    with patch("app.services.get_satellite_data", return_value=sat), \
         patch("app.services.get_weather_data", return_value=weather_missing), \
         patch("app.services.groq_client", None):
        out = services.process_farm_analysis(44.2, 17.9, 10.0, None, "en")

    # Original satellite values preserved; weather fields not invented
    assert out["satellite_available"] is True
    assert out["ndvi"] == 0.577
    assert out["ndmi"] == 0.058
    assert out["satellite_observation_date"] == "2026-11-09"
    assert out["weather_available"] is False
    assert out["temperature_c"] is None
    assert out["recent_rainfall_mm"] is None
    assert out["possible_water_stress"] is None
    assert out["moisture_stress_status"] == "UNAVAILABLE"
    assert out["analysis_confidence"] == "LOW"
    assert "uncertain" in out["ai_explanation"].lower()


def test_unknown_current_crop_prompt_and_outputs_do_not_infer_crop_from_history():
    facts = {
        "acres": 10.0,
        "ndvi": 0.577,
        "ndvi_status": "GOOD",
        "ndmi": 0.058,
        "ndmi_status": "LOW",
        "temperature_c": -1.7,
        "thermal_regime": "FREEZING",
        "humidity_percent": 68,
        "recent_rainfall_mm": 0.0,
        "heat_risk": "LOW",
        "rainfall_status": "LOW",
        "possible_water_stress": None,
        "moisture_stress_status": "INCONCLUSIVE_COLD_OR_DORMANT",
        "observation_month": "November",
        "current_crop_known": False,
        "crop_growth_stage_known": False,
        "satellite_available": True,
        "weather_available": True,
    }
    prompt = services.build_ai_prompt("en", facts)
    assert '"current_crop_known": false' in prompt
    assert '"crop_growth_stage_known": false' in prompt
    assert "do not identify, assume, or guess a specific standing crop type" in prompt.lower()
    assert "dormancy" in prompt.lower()
    assert "senescence" in prompt.lower()


def test_seasonal_dormancy_or_senescence_ambiguity_in_cool_november_weather():
    services.clear_provider_caches()
    sat = _clean_satellite(ndvi=0.51, ndmi=0.07, obs_date="2026-11-09")
    cool_dry = _clean_weather(temp_c=10.5, rain_mm=0.0, humidity=60)

    with patch("app.services.get_satellite_data", return_value=sat), \
         patch("app.services.get_weather_data", return_value=cool_dry), \
         patch("app.services.groq_client", None):
        out = services.process_farm_analysis(44.2, 17.9, 10.0, None, "en")

    assert out["ndvi"] == 0.51
    assert out["ndmi"] == 0.07
    assert out["temperature_c"] == 10.5
    assert out["recent_rainfall_mm"] == 0.0
    assert out["possible_water_stress"] is None
    assert out["moisture_stress_status"] == "INCONCLUSIVE_MIXED"

    text = out["ai_explanation"].lower()
    assert "warm" not in text
    assert "dormancy" in text
    assert "senescence" in text
    assert "unknown" in text
    assert "uncertain" in text
    assert "do not assume moisture stress is absent" in text
