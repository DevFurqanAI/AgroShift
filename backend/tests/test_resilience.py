import sys
from pathlib import Path
from unittest.mock import patch
import pytest
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from fastapi.testclient import TestClient
from app.main import app
from app import services
from app.nasa_power import fetch_climate_summary, NASAClimateError

client=TestClient(app)

class Fake:
    status_code=200
    headers={}
    def __init__(self,payload): self.payload=payload
    def json(self): return self.payload
    def raise_for_status(self): pass

def test_no_external_services_graceful():
    with patch('app.services.get_weather_data',return_value={'weather_available':False,'weather_message':'offline'}),patch('app.services.get_satellite_data',return_value={'satellite_available':False,'satellite_message':'offline'}):
        r=client.post('/api/v1/analyze',json={'latitude':30,'longitude':71,'language':'en'})
    assert r.status_code==200 and r.json()['analysis_confidence']=='LOW'
    assert r.json()['satellite_available'] is False and r.json()['weather_available'] is False

def test_nasa_service_down_graceful():
    with patch('app.main.fetch_climate_summary',side_effect=NASAClimateError('unavailable')):
        r=client.get('/api/v1/climate/history?latitude=30&longitude=71')
    assert r.status_code==200 and r.json()['data_available'] is False and r.json()['monthly']==[]

@pytest.mark.parametrize('latitude,longitude',[(91,2),(0,181),('NaN',71)])
def test_invalid_coordinates_rejected(latitude,longitude):
    r=client.post('/api/v1/analyze',json={'latitude':latitude,'longitude':longitude})
    assert r.status_code==422

def test_nasa_fill_only_graceful():
    with patch('app.nasa_power.requests.get',return_value=Fake({'properties':{'parameter':{'T2M':{'202401':-999},'PRECTOTCORR':{'202401':-999}}}})):
        with pytest.raises(NASAClimateError): fetch_climate_summary(30,71,2024,2024)

def test_nasa_invalid_month_skipped_and_monthly_rain_correct():
    payload={'properties':{'parameter':{'T2M':{'202413':20,'202402':24},'PRECTOTCORR':{'202413':1.0,'202402':2}}}}
    with patch('app.nasa_power.requests.get',return_value=Fake(payload)):
        result=fetch_climate_summary(30,71,2024,2024)
    assert len(result['monthly'])==1 and result['monthly'][0]['estimated_monthly_precipitation_mm']==58

def test_satellite_malformed_payload_does_not_crash():
    with patch('app.services.requests.post',return_value=Fake({'data':[{'outputs':{'ndvi':{'bands':{'B0':{'stats':{'sampleCount':'bad','noDataCount':0,'mean':'NaN'}}}}}}]})):
        out=services.fetch_sentinel2_indices({'type':'Polygon','coordinates':[]},'token')
    assert out['satellite_available'] is False

def test_weather_partial_nullable_data():
    services.clear_provider_caches()
    payload={'daily':{'temperature_2m_max':[31], 'relative_humidity_2m_mean':None,'precipitation_sum':None}}
    with patch('app.services.requests.get',return_value=Fake(payload)):
        out=services._fetch_open_meteo(30,71)
    assert out['weather_available'] is True and out['humidity_percent'] is None and out['recent_rainfall_mm'] is None

def test_weather_nan_rejected():
    services.clear_provider_caches()
    with patch('app.services.requests.get',return_value=Fake({'daily':{'temperature_2m_max':['NaN']}})):
        out=services._fetch_open_meteo(30,71)
    assert out['weather_available'] is False

def test_ai_malformed_content_uses_fallback():
    assert services.sanitize_ai_result({'ai_explanation':'hello','recommendations':None})['recommendations']==[]


def test_copernicus_token_cached_across_requests():
    services.clear_provider_caches()
    calls = {'token': 0, 'stats': 0}

    def fake_post(url, *args, **kwargs):
        if 'openid-connect/token' in url:
            calls['token'] += 1
            res = Fake({'access_token': 'tok-123', 'expires_in': 600})
            return res
        calls['stats'] += 1
        return Fake({
            'data': [{
                'interval': {'from': '2026-04-01T00:00:00Z'},
                'outputs': {
                    'ndvi': {'bands': {'B0': {'stats': {'sampleCount': 100, 'noDataCount': 10, 'mean': 0.55}}}},
                    'ndmi': {'bands': {'B0': {'stats': {'sampleCount': 100, 'noDataCount': 10, 'mean': 0.22}}}},
                },
            }]
        })

    with patch('app.services.settings.COPERNICUS_CLIENT_ID', 'cid'), \
         patch('app.services.settings.COPERNICUS_CLIENT_SECRET', 'csec'), \
         patch('app.services.requests.post', side_effect=fake_post):
        first = services.get_satellite_data(None, 31.2, 72.4)
        second = services.get_satellite_data(None, 31.3, 72.5)

    assert first['satellite_available'] is True and second['satellite_available'] is True
    assert calls['token'] == 1 and calls['stats'] == 2


def test_copernicus_429_respects_cooldown_without_retry_loop():
    services.clear_provider_caches()
    post_urls = []

    def fake_post(url, *args, **kwargs):
        post_urls.append(url)
        if 'openid-connect/token' in url:
            return Fake({'access_token': 'tok-123', 'expires_in': 600})
        res = Fake({})
        res.status_code = 429
        res.headers = {'Retry-After': '45'}
        return res

    with patch('app.services.settings.COPERNICUS_CLIENT_ID', 'cid'), \
         patch('app.services.settings.COPERNICUS_CLIENT_SECRET', 'csec'), \
         patch('app.services.requests.post', side_effect=fake_post):
        first = services.get_satellite_data(None, 31.2, 72.4)
        second = services.get_satellite_data(None, 31.2, 72.4)

    assert first['satellite_available'] is False
    assert '45 seconds' in first['satellite_message']
    assert 'not configured' not in first['satellite_message'].lower()
    assert second['satellite_available'] is False
    assert '45 seconds' in second['satellite_message']
    # Only 1 token call + 1 stats call total (no tight 429 retries, second call stopped by cooldown)
    assert len(post_urls) == 2


def test_copernicus_missing_vs_invalid_credentials_messages():
    services.clear_provider_caches()
    with patch('app.services.settings.COPERNICUS_CLIENT_ID', ''), \
         patch('app.services.settings.COPERNICUS_CLIENT_SECRET', ''):
        missing = services.get_satellite_data(None, 31.2, 72.4)
    assert missing['satellite_available'] is False
    assert 'not configured' in missing['satellite_message'].lower()

    services.clear_provider_caches()
    unauth = Fake({})
    unauth.status_code = 401
    with patch('app.services.settings.COPERNICUS_CLIENT_ID', 'bad'), \
         patch('app.services.settings.COPERNICUS_CLIENT_SECRET', 'bad'), \
         patch('app.services.requests.post', return_value=unauth):
        invalid = services.get_satellite_data(None, 31.2, 72.4)
    assert invalid['satellite_available'] is False
    assert 'authorized' in invalid['satellite_message'].lower()
    assert 'not configured' not in invalid['satellite_message'].lower()


def test_process_farm_analysis_caches_successful_observations():
    services.clear_provider_caches()
    sat_calls = 0
    weather_calls = 0

    def fake_sat(*args, **kwargs):
        nonlocal sat_calls
        sat_calls += 1
        return {
            'satellite_available': True,
            'ndvi': 0.52,
            'ndmi': 0.18,
            'satellite_observation_date': '2026-04-01',
            'cloud_cover_percent': 8.0,
        }

    def fake_weather(*args, **kwargs):
        nonlocal weather_calls
        weather_calls += 1
        return {
            'weather_available': True,
            'temperature_c': 27.5,
            'humidity_percent': 48,
            'recent_rainfall_mm': 0.0,
        }

    with patch('app.services.get_satellite_data', side_effect=fake_sat), \
         patch('app.services.get_weather_data', side_effect=fake_weather):
        first = services.process_farm_analysis(31.2, 72.4, 5.0, None, 'en')
        second = services.process_farm_analysis(31.2, 72.4, 5.0, None, 'en')

    assert first['satellite_available'] is True and second['ndvi'] == 0.52
    assert sat_calls == 1 and weather_calls == 1


def test_copernicus_stats_payload_uses_degree_resolution_with_epsg4326():
    services.clear_provider_caches()
    captured_payloads = []

    def fake_post(url, *args, **kwargs):
        if 'openid-connect/token' in url:
            return Fake({'access_token': 'tok-123', 'expires_in': 600})
        captured_payloads.append(kwargs.get('json'))
        return Fake({'data': []})

    with patch('app.services.settings.COPERNICUS_CLIENT_ID', 'cid'), \
         patch('app.services.settings.COPERNICUS_CLIENT_SECRET', 'csec'), \
         patch('app.services.requests.post', side_effect=fake_post):
        out = services.get_satellite_data(None, 31.2, 72.4)

    assert out['satellite_available'] is False
    assert out['satellite_error_kind'] == 'no_clear_scene'
    assert len(captured_payloads) == 1
    agg = captured_payloads[0]['aggregation']
    # Must be in EPSG:4326 degrees (~0.00009 deg for 10m), never 10 degrees
    assert 0.00001 < agg['resx'] < 0.001
    assert 0.00001 < agg['resy'] < 0.001
    assert captured_payloads[0]['input']['bounds']['properties']['crs'].endswith('4326')


def test_copernicus_400_logs_sanitized_reason_and_distinguishes_invalid_request(caplog):
    services.clear_provider_caches()
    calls = {'token': 0, 'stats': 0}

    def fake_post(url, *args, **kwargs):
        if 'openid-connect/token' in url:
            calls['token'] += 1
            return Fake({'access_token': 'tok-secret-value', 'expires_in': 600})
        calls['stats'] += 1
        bad = Fake({
            'error': {
                'status': 400,
                'reason': 'Bad Request',
                'message': 'Invalid geometry self-intersection near Bearer tok-secret-value',
                'code': 'COMMON_BAD_PAYLOAD',
            }
        })
        bad.status_code = 400
        return bad

    with caplog.at_level('WARNING', logger='agroshift.services'), \
         patch('app.services.settings.COPERNICUS_CLIENT_ID', 'cid'), \
         patch('app.services.settings.COPERNICUS_CLIENT_SECRET', 'csec'), \
         patch('app.services.requests.post', side_effect=fake_post):
        out = services.get_satellite_data(None, 31.2, 72.4)

    assert out['satellite_available'] is False
    assert out['satellite_error_kind'] == 'invalid_request'
    assert 'boundary or query parameters' in out['satellite_message'].lower()
    assert 'not configured' not in out['satellite_message'].lower()
    assert 'rate limit' not in out['satellite_message'].lower()
    assert 'cloud-free' not in out['satellite_message'].lower()
    # 400 must not retry or clear token cache unnecessarily
    assert calls['token'] == 1 and calls['stats'] == 1
    log_text = ' '.join(r.getMessage() for r in caplog.records)
    assert 'HTTP 400' in log_text and 'COMMON_BAD_PAYLOAD' in log_text
    assert 'tok-secret-value' not in log_text


def test_analyze_preserves_independent_weather_when_copernicus_returns_400():
    services.clear_provider_caches()

    def fake_post(url, *args, **kwargs):
        if 'openid-connect/token' in url:
            return Fake({'access_token': 'tok-123', 'expires_in': 600})
        bad = Fake({'error': {'status': 400, 'reason': 'Bad Request', 'message': 'Invalid bounds'}})
        bad.status_code = 400
        return bad

    weather_ok = Fake({
        'daily': {
            'temperature_2m_max': [28.4],
            'relative_humidity_2m_mean': [54],
            'precipitation_sum': [0.5],
        }
    })

    with patch('app.services.settings.COPERNICUS_CLIENT_ID', 'cid'), \
         patch('app.services.settings.COPERNICUS_CLIENT_SECRET', 'csec'), \
         patch('app.services.requests.post', side_effect=fake_post), \
         patch('app.services.requests.get', return_value=weather_ok):
        r = client.post('/api/v1/analyze', json={'latitude': 31.2, 'longitude': 72.4, 'language': 'en'})

    assert r.status_code == 200
    body = r.json()
    assert body['satellite_available'] is False
    assert body['satellite_error_kind'] == 'invalid_request'
    assert body['weather_available'] is True
    assert body['weather_source'] == 'open-meteo'
    assert body['temperature_c'] == 28.4
    assert body['analysis_confidence'] == 'LOW'


def test_analyze_preserves_independent_satellite_when_open_meteo_returns_429():
    services.clear_provider_caches()

    def fake_post(url, *args, **kwargs):
        if 'openid-connect/token' in url:
            return Fake({'access_token': 'tok-123', 'expires_in': 600})
        return Fake({
            'data': [{
                'interval': {'from': '2026-04-01T00:00:00Z'},
                'outputs': {
                    'ndvi': {'bands': {'B0': {'stats': {'sampleCount': 100, 'noDataCount': 10, 'mean': 0.58}}}},
                    'ndmi': {'bands': {'B0': {'stats': {'sampleCount': 100, 'noDataCount': 10, 'mean': 0.21}}}},
                },
            }]
        })

    om_429 = Fake({})
    om_429.status_code = 429
    om_429.headers = {'Retry-After': '60'}

    with patch('app.services.settings.COPERNICUS_CLIENT_ID', 'cid'), \
         patch('app.services.settings.COPERNICUS_CLIENT_SECRET', 'csec'), \
         patch('app.services.settings.OPENWEATHER_API_KEY', ''), \
         patch('app.services.requests.post', side_effect=fake_post), \
         patch('app.services.requests.get', return_value=om_429) as mock_get:
        r = client.post('/api/v1/analyze', json={'latitude': 31.2, 'longitude': 72.4, 'language': 'en'})

    assert r.status_code == 200
    body = r.json()
    assert body['satellite_available'] is True
    assert body['ndvi'] == 0.58
    assert body['weather_available'] is False
    assert body['weather_error_kind'] == 'rate_limited'
    assert '60 seconds' in body['weather_message']
    assert mock_get.call_count == 1


def test_complete_api_success_caps_confidence_at_moderate_and_reports_pixel_coverage():
    services.clear_provider_caches()
    sat_ok = {
        'satellite_available': True,
        'ndvi': 0.56,
        'ndmi': 0.24,
        'satellite_observation_date': '2026-11-10',
        'cloud_cover_percent': 8.0,
        'valid_coverage_percent': 92.0,
        'excluded_pixel_percent': 8.0,
    }
    weather_ok = {
        'weather_available': True,
        'weather_source': 'open-meteo',
        'temperature_c': 26.0,
        'humidity_percent': 58,
        'recent_rainfall_mm': 4.0,
    }
    with patch('app.services.get_satellite_data', return_value=sat_ok), \
         patch('app.services.get_weather_data', return_value=weather_ok):
        out = services.process_farm_analysis(31.2, 72.4, 5.0, None, 'en')

    assert out['analysis_confidence'] == 'MODERATE'
    assert out['analysis_confidence'] != 'HIGH'
    assert out['observation_quality'] == 'GOOD'
    assert out['valid_coverage_percent'] == 92.0
    assert out['excluded_pixel_percent'] == 8.0
    assert 'crop type' in out['ai_explanation'].lower()
    assert 'growth stage' in out['ai_explanation'].lower()


def test_low_vegetation_and_low_ndmi_do_not_claim_no_moisture_stress():
    services.clear_provider_caches()
    low_veg = {
        'satellite_available': True,
        'ndvi': 0.12,
        'ndmi': -0.04,
        'satellite_observation_date': '2026-11-10',
        'cloud_cover_percent': 4.0,
        'valid_coverage_percent': 96.0,
        'excluded_pixel_percent': 4.0,
    }
    mild_dry_weather = {
        'weather_available': True,
        'weather_source': 'open-meteo',
        'temperature_c': 27.0,
        'humidity_percent': 45,
        'recent_rainfall_mm': 0.2,
    }
    with patch('app.services.get_satellite_data', return_value=low_veg), \
         patch('app.services.get_weather_data', return_value=mild_dry_weather):
        out = services.process_farm_analysis(31.2, 72.4, 5.0, None, 'en')

    assert out['ndvi'] == 0.12
    assert out['ndmi'] == -0.04
    assert out['possible_water_stress'] is None
    assert out['moisture_stress_status'] == 'INCONCLUSIVE_LOW_VEGETATION'
    assert out['analysis_confidence'] == 'LOW'
    assert 'cannot confirm or rule out' in out['ai_explanation'].lower()


def test_low_ndmi_with_cool_wet_weather_remains_inconclusive_rather_than_no_stress():
    services.clear_provider_caches()
    sat_low_ndmi = {
        'satellite_available': True,
        'ndvi': 0.34,
        'ndmi': 0.04,
        'satellite_observation_date': '2026-11-10',
        'cloud_cover_percent': 5.0,
        'valid_coverage_percent': 95.0,
        'excluded_pixel_percent': 5.0,
    }
    cool_wet = {
        'weather_available': True,
        'weather_source': 'open-meteo',
        'temperature_c': 22.0,
        'humidity_percent': 72,
        'recent_rainfall_mm': 12.0,
    }
    with patch('app.services.get_satellite_data', return_value=sat_low_ndmi), \
         patch('app.services.get_weather_data', return_value=cool_wet):
        out = services.process_farm_analysis(31.2, 72.4, 5.0, None, 'en')

    assert out['possible_water_stress'] is None
    assert out['moisture_stress_status'] == 'INCONCLUSIVE_MIXED'
    assert 'do not assume moisture stress is absent' in out['ai_explanation'].lower()


def test_missing_observations_keep_confidence_low_and_stress_unavailable():
    services.clear_provider_caches()
    with patch('app.services.get_satellite_data', return_value={'satellite_available': False, 'satellite_message': 'offline'}), \
         patch('app.services.get_weather_data', return_value={'weather_available': True, 'weather_source': 'open-meteo', 'temperature_c': 25.0, 'humidity_percent': 50, 'recent_rainfall_mm': 0.0}):
        out = services.process_farm_analysis(31.2, 72.4, 5.0, None, 'en')

    assert out['analysis_confidence'] == 'LOW'
    assert out['observation_quality'] == 'LIMITED'
    assert out['possible_water_stress'] is None
    assert out['moisture_stress_status'] == 'UNAVAILABLE'
    assert 'cannot assess canopy condition or confirm or rule out' in out['ai_explanation'].lower()



