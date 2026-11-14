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
