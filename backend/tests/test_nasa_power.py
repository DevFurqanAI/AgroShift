from unittest.mock import patch
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.nasa_power import fetch_climate_summary, NASAClimateError


class FakeResponse:
    def raise_for_status(self): pass
    def json(self):
        return {"properties": {"parameter": {"T2M": {"202401": 22.4, "202402": -999}, "PRECTOTCORR": {"202401": 1.2, "202402": 0.4}}}}


def test_nasa_power_normalizes_missing_values():
    with patch("app.nasa_power.requests.get", return_value=FakeResponse()) as request:
        data = fetch_climate_summary(30, 71, 2024, 2024)
    assert data["source"] == "NASA POWER"
    assert data["monthly"][0]["temperature_c"] == 22.4
    assert data["monthly"][1]["temperature_c"] is None
    assert data["monthly"][0]["precipitation_mm_per_day"] == 1.2
    assert request.call_args.kwargs["params"]["community"] == "AG"


def test_nasa_power_raises_on_malformed_payload():
    class BadResponse:
        def raise_for_status(self): pass
        def json(self): return {"properties": {"parameter": {}}}
    import pytest
    with patch("app.nasa_power.requests.get", return_value=BadResponse()):
        with pytest.raises(NASAClimateError):
            fetch_climate_summary(0, 0, 2024, 2024)

def test_nasa_power_raises_on_request_error():
    import pytest, requests
    with patch("app.nasa_power.requests.get", side_effect=requests.Timeout):
        with pytest.raises(NASAClimateError):
            fetch_climate_summary(0, 0, 2024, 2024)
