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
    payload={'daily':{'temperature_2m_max':[31], 'relative_humidity_2m_mean':None,'precipitation_sum':None}}
    with patch('app.services.requests.get',return_value=Fake(payload)):
        out=services._fetch_open_meteo(30,71)
    assert out['weather_available'] is True and out['humidity_percent'] is None and out['recent_rainfall_mm'] is None

def test_weather_nan_rejected():
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

