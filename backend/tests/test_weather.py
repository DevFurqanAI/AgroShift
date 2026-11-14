import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app import services  # noqa: E402


class FakeResponse:
    def __init__(self, status_code=200, json_data=None, headers=None):
        self.status_code = status_code
        self._json_data = json_data or {}
        self.headers = headers or {}

    def json(self):
        return self._json_data


def _owm_entry(local_dt, temp, humidity, rain_3h=None):
    entry = {
        "dt": int(local_dt.timestamp()),
        "main": {"temp": temp, "humidity": humidity},
    }
    if rain_3h is not None:
        entry["rain"] = {"3h": rain_3h}
    return entry


def _owm_payload(tz_offset_seconds, entries):
    return {
        "cod": "200",
        "list": entries,
        "city": {"timezone": tz_offset_seconds},
    }


def test_open_meteo_success_returns_primary_without_fallback():
    services.clear_provider_caches()
    ok_response = FakeResponse(
        status_code=200,
        json_data={
            "daily": {
                "temperature_2m_max": [30.0],
                "relative_humidity_2m_mean": [55],
                "precipitation_sum": [1.2],
            }
        },
    )
    with patch("app.services.requests.get", return_value=ok_response) as mock_get:
        result = services.get_weather_data(30.0, 70.0)

    assert result["weather_available"] is True
    assert result["temperature_c"] == 30.0
    assert result["humidity_percent"] == 55
    assert result["recent_rainfall_mm"] == 1.2
    mock_get.assert_called_once()  # only Open-Meteo, no fallback attempted


def test_open_meteo_failure_then_openwatermap_success():
    services.clear_provider_caches()
    tz_offset = 5 * 3600
    now_local = datetime.now(timezone.utc) + timedelta(seconds=tz_offset)
    today_local = now_local.replace(hour=6, minute=0, second=0, microsecond=0)

    entries = [
        _owm_entry(today_local, temp=28.0, humidity=40, rain_3h=0.5),
        _owm_entry(today_local + timedelta(hours=3), temp=33.0, humidity=50, rain_3h=1.5),
        _owm_entry(today_local - timedelta(days=1), temp=99.0, humidity=99),  # different local day, must be excluded
    ]
    owm_response = FakeResponse(status_code=200, json_data=_owm_payload(tz_offset, entries))
    open_meteo_failure = FakeResponse(status_code=503, json_data={})

    def fake_get(url, *args, **kwargs):
        if "open-meteo.com" in url:
            return open_meteo_failure
        return owm_response

    with patch("app.services.settings.OPENWEATHER_API_KEY", "fake-key"), \
         patch("app.services.requests.get", side_effect=fake_get), \
         patch("app.services.time.sleep"):
        result = services.get_weather_data(30.0, 70.0)

    assert result["weather_available"] is True
    assert result["temperature_c"] == 33.0
    assert result["humidity_percent"] == 45  # average of 40 and 50
    assert result["recent_rainfall_mm"] == 2.0  # 0.5 + 1.5, excluding the other-day entry


def test_open_meteo_failure_then_openweathermap_failure():
    services.clear_provider_caches()
    open_meteo_failure = FakeResponse(status_code=503, json_data={})
    owm_failure = FakeResponse(status_code=401, json_data={"message": "Invalid API key"})

    def fake_get(url, *args, **kwargs):
        if "open-meteo.com" in url:
            return open_meteo_failure
        return owm_failure

    with patch("app.services.settings.OPENWEATHER_API_KEY", "fake-key"), \
         patch("app.services.requests.get", side_effect=fake_get), \
         patch("app.services.time.sleep"):
        result = services.get_weather_data(30.0, 70.0)

    assert result["weather_available"] is False
    assert result.get("weather_message")


def test_openweathermap_no_fallback_configured_returns_primary_failure():
    services.clear_provider_caches()
    open_meteo_failure = FakeResponse(status_code=503, json_data={})

    with patch("app.services.settings.OPENWEATHER_API_KEY", ""), \
         patch("app.services.requests.get", return_value=open_meteo_failure) as mock_get, \
         patch("app.services.time.sleep"):
        result = services.get_weather_data(30.0, 70.0)

    assert result["weather_available"] is False
    # Only Open-Meteo's retries should have been attempted, never OpenWeatherMap.
    for call in mock_get.call_args_list:
        assert "openweathermap.org" not in call.args[0]


def test_openweathermap_response_with_no_rain_field_treats_missing_as_zero():
    tz_offset = 0
    now_local = datetime.now(timezone.utc)
    today_local = now_local.replace(hour=9, minute=0, second=0, microsecond=0)

    entries = [_owm_entry(today_local, temp=25.0, humidity=60)]  # no rain key at all
    payload = _owm_payload(tz_offset, entries)

    with patch("app.services.requests.get", return_value=FakeResponse(status_code=200, json_data=payload)):
        result = services._fetch_openweathermap_fallback(30.0, 70.0)

    assert result["weather_available"] is True
    assert result["recent_rainfall_mm"] == 0.0
    assert result["temperature_c"] == 25.0
    assert result["humidity_percent"] == 60


def test_openweathermap_response_with_multiple_3hour_rain_values_sums_them():
    tz_offset = 0
    now_local = datetime.now(timezone.utc)
    today_local = now_local.replace(hour=0, minute=0, second=0, microsecond=0)

    entries = [
        _owm_entry(today_local + timedelta(hours=3), temp=20.0, humidity=70, rain_3h=1.0),
        _owm_entry(today_local + timedelta(hours=6), temp=22.0, humidity=75, rain_3h=2.5),
        _owm_entry(today_local + timedelta(hours=9), temp=24.0, humidity=80, rain_3h=0.25),
    ]
    payload = _owm_payload(tz_offset, entries)

    with patch("app.services.requests.get", return_value=FakeResponse(status_code=200, json_data=payload)):
        result = services._fetch_openweathermap_fallback(30.0, 70.0)

    assert result["weather_available"] is True
    assert result["recent_rainfall_mm"] == 3.8  # 1.0 + 2.5 + 0.25 = 3.75, rounded to 1 decimal
    assert result["temperature_c"] == 24.0
    assert result["humidity_percent"] == 75  # round(average(70, 75, 80)) == round(75.0)


def test_openweathermap_no_usable_entries_for_local_date_is_unavailable():
    tz_offset = 0
    now_local = datetime.now(timezone.utc)
    # All entries fall on a different local calendar day than "today".
    other_day = now_local + timedelta(days=2)
    entries = [_owm_entry(other_day, temp=20.0, humidity=50, rain_3h=0.0)]
    payload = _owm_payload(tz_offset, entries)

    with patch("app.services.requests.get", return_value=FakeResponse(status_code=200, json_data=payload)):
        result = services._fetch_openweathermap_fallback(30.0, 70.0)

    assert result["weather_available"] is False
    assert result.get("weather_message")


def test_open_meteo_uses_free_endpoint_without_api_key():
    services.clear_provider_caches()
    ok_response = FakeResponse(
        status_code=200,
        json_data={
            "daily": {
                "temperature_2m_max": [29.5],
                "relative_humidity_2m_mean": [62],
                "precipitation_sum": [0.4],
            }
        },
    )
    with patch("app.services.requests.get", return_value=ok_response) as mock_get:
        result = services.get_weather_data(31.5, 74.3)

    assert result["weather_available"] is True
    assert result["weather_source"] == "open-meteo"
    mock_get.assert_called_once()
    called_url = mock_get.call_args.args[0]
    called_params = mock_get.call_args.kwargs.get("params") or {}
    assert called_url == services.OPEN_METEO_FORECAST_URL
    assert "apikey" not in {k.lower() for k in called_params}
    assert "appid" not in {k.lower() for k in called_params}


def test_open_meteo_429_is_not_retried_and_triggers_cooldown_and_fallback():
    services.clear_provider_caches()
    calls = []
    rate_limited = FakeResponse(
        status_code=429,
        json_data={"error": True, "reason": "Minutely API request limit exceeded."},
        headers={"Retry-After": "90"},
    )

    def fake_get(url, *args, **kwargs):
        calls.append(url)
        return rate_limited

    with patch("app.services.settings.OPENWEATHER_API_KEY", ""), \
         patch("app.services.requests.get", side_effect=fake_get), \
         patch("app.services.time.sleep") as mock_sleep:
        first = services.get_weather_data(30.0, 70.0)
        second = services.get_weather_data(30.2, 70.2)

    assert first["weather_available"] is False
    assert first["weather_error_kind"] == "rate_limited"
    assert "90 seconds" in first["weather_message"]
    assert second["weather_available"] is False
    assert second["weather_error_kind"] == "rate_limited"
    # Critical: HTTP 429 must NOT be retried, and the second call skips Open-Meteo during cooldown
    assert len(calls) == 1
    mock_sleep.assert_not_called()


def test_open_meteo_429_still_uses_openweathermap_fallback_when_configured():
    services.clear_provider_caches()
    tz_offset = 0
    now_local = datetime.now(timezone.utc)
    today_local = now_local.replace(hour=9, minute=0, second=0, microsecond=0)
    owm_response = FakeResponse(
        status_code=200,
        json_data=_owm_payload(tz_offset, [_owm_entry(today_local, temp=27.0, humidity=52, rain_3h=0.0)]),
    )
    rate_limited = FakeResponse(status_code=429, json_data={}, headers={"Retry-After": "60"})
    calls = []

    def fake_get(url, *args, **kwargs):
        calls.append(url)
        if "open-meteo.com" in url:
            return rate_limited
        return owm_response

    with patch("app.services.settings.OPENWEATHER_API_KEY", "owm-test-key"), \
         patch("app.services.requests.get", side_effect=fake_get):
        result = services.get_weather_data(30.0, 70.0)

    assert result["weather_available"] is True
    assert result["weather_source"] == "openweathermap"
    assert result["temperature_c"] == 27.0
    assert sum(1 for u in calls if "open-meteo.com" in u) == 1
    assert sum(1 for u in calls if "openweathermap.org" in u) == 1


def test_openweathermap_late_evening_australia_rollover_uses_near_term_forecast():
    # Simulate 2026-05-10 22:30 AEST (UTC+10 -> 12:30 UTC on 2026-05-10)
    # OWM /2.5/forecast starts at the next 3-hour slot: 2026-05-11 01:00 AEST (15:00 UTC on 2026-05-10)
    tz_offset = 10 * 3600
    fixed_now_utc = datetime(2026, 5, 10, 12, 30, 0, tzinfo=timezone.utc)
    slot_1_utc = datetime(2026, 5, 10, 15, 0, 0, tzinfo=timezone.utc)
    slot_2_utc = datetime(2026, 5, 10, 18, 0, 0, tzinfo=timezone.utc)
    # A slot >24h ahead on local_tomorrow should not be included if beyond 24h
    entries = [
        {
            "dt": int(slot_1_utc.timestamp()),
            "main": {"temp": 14.2, "humidity": 78},
            "rain": {"3h": 0.4},
        },
        {
            "dt": int(slot_2_utc.timestamp()),
            "main": {"temp": 13.0, "humidity": 82},
            "rain": {"3h": 0.6},
        },
    ]
    payload = _owm_payload(tz_offset, entries)

    with patch("app.services._utc_now", return_value=fixed_now_utc), \
         patch("app.services.requests.get", return_value=FakeResponse(status_code=200, json_data=payload)):
        result = services._fetch_openweathermap_fallback(-33.8, 151.2)

    assert result["weather_available"] is True
    assert result["weather_source"] == "openweathermap"
    assert result["weather_data_type"] == "near_term_forecast"
    assert result["weather_is_forecast"] is True
    assert "2026-05-11" in result["weather_observation_window"]
    assert result["temperature_c"] == 14.2
    assert result["humidity_percent"] == 80
    assert result["recent_rainfall_mm"] == 1.0


def test_openweathermap_same_day_match_distinguishes_forecast_aggregate():
    tz_offset = 0
    fixed_now_utc = datetime(2026, 5, 10, 9, 0, 0, tzinfo=timezone.utc)
    slot_utc = datetime(2026, 5, 10, 12, 0, 0, tzinfo=timezone.utc)
    payload = _owm_payload(
        tz_offset,
        [{"dt": int(slot_utc.timestamp()), "main": {"temp": 21.5, "humidity": 65}, "rain": {"3h": 1.2}}],
    )

    with patch("app.services._utc_now", return_value=fixed_now_utc), \
         patch("app.services.requests.get", return_value=FakeResponse(status_code=200, json_data=payload)):
        result = services._fetch_openweathermap_fallback(51.5, -0.1)

    assert result["weather_available"] is True
    assert result["weather_source"] == "openweathermap"
    assert result["weather_data_type"] == "forecast_3h_aggregate"
    assert result["weather_is_forecast"] is True
    assert "2026-05-10" in result["weather_observation_window"]


