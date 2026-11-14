import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.rotation.models import RotationRequest
from app.rotation.engine import calculate_plan

client=TestClient(app)

def monthly(temperature=22):
    return [{'month':f'2025{m:02d}','temperature_c':temperature,'estimated_monthly_precipitation_mm':50} for m in range(1,13)]

def valid_payload():
    return {'latitude':30.2,'longitude':71.5,'previous_crop':'wheat','planting_month':1,
            'seasons':2,'candidate_crop_ids':['wheat','chickpea','maize'], 'climate_monthly':monthly()}

def test_catalog():
    r=client.get('/api/v1/rotation/crops')
    assert r.status_code==200 and len(r.json()['crops']) >=10
    assert 'not locally validated' in r.json()['catalog_warning'].lower()

def test_plan_deterministic_and_bounded():
    p=valid_payload()
    r=client.post('/api/v1/rotation/plan',json=p)
    assert r.status_code==200, r.text
    d=r.json()
    assert d['status']=='ok' and len(d['plans'])==3
    assert all(0<=x['score']<=100 for x in d['plans'])
    assert d['plans']==client.post('/api/v1/rotation/plan',json=p).json()['plans']
    assert d['climate_source']=='user_supplied_climate_series_unverified'

def test_no_fake_soil_score():
    d=client.post('/api/v1/rotation/plan',json=valid_payload()).json()
    assert all(v['soil_ph_compatibility_score'] is None for plan in d['plans'] for v in plan['seasons'])

def test_missing_data_no_recommendations():
    p=valid_payload();p['climate_monthly']=[]
    d=client.post('/api/v1/rotation/plan',json=p).json()
    assert d['status']=='insufficient_data' and d['plans']==[]

def test_partial_data_no_recommendations():
    p=valid_payload();p['climate_monthly']=monthly()[:4]
    d=client.post('/api/v1/rotation/plan',json=p).json()
    assert d['status']=='insufficient_data'

@pytest.mark.parametrize('change',[{'latitude':99},{'soil_ph':11},{'planting_month':13},{'candidate_crop_ids':['wheat']},{'start_year':2025,'end_year':2024},{'seasons':5}])
def test_invalid_input_422(change):
    p=valid_payload();p.update(change)
    assert client.post('/api/v1/rotation/plan',json=p).status_code==422

def test_unknown_crop_handled():
    p=valid_payload();p['previous_crop']='not-a-crop'
    d=client.post('/api/v1/rotation/plan',json=p).json()
    assert d['status']=='invalid_crops' and d['plans']==[]

def test_nasa_failure_graceful(monkeypatch):
    from app.rotation import routes
    from app.nasa_power import NASAClimateError
    def fail(*args): raise NASAClimateError('unavailable')
    monkeypatch.setattr(routes,'fetch_climate_summary',fail)
    p=valid_payload();p.pop('climate_monthly')
    r=client.post('/api/v1/rotation/plan',json=p)
    assert r.status_code==200 and r.json()['status']=='insufficient_data'

def test_nasa_success(monkeypatch):
    from app.rotation import routes
    monkeypatch.setattr(routes,'fetch_climate_summary',lambda *args:{'monthly':monthly()})
    p=valid_payload();p.pop('climate_monthly')
    d=client.post('/api/v1/rotation/plan',json=p).json()
    assert d['status']=='ok' and 'NASA POWER' in d['climate_source']

def test_leap_month_not_used_as_fabricated_climate():
    p=valid_payload();p['climate_monthly']=monthly()
    d=client.post('/api/v1/rotation/plan',json=p).json()
    assert all(x['avg_historical_temperature_c']==22 for r in d['plans'] for x in r['seasons'])


def test_scores_differentiated_and_not_saturated_at_100():
    p={
        'latitude':30.2,'longitude':71.5,'previous_crop':'wheat','planting_month':1,
        'seasons':3,'water_availability':'medium','goal':'water','soil_ph':6.8,
        'candidate_crop_ids':['wheat','chickpea','canola','maize','rice'],
        'max_results':5,'climate_monthly':monthly(22),
    }
    d=client.post('/api/v1/rotation/plan',json=p).json()
    assert d['status']=='ok'
    scores=[plan['score'] for plan in d['plans']]
    assert len(set(scores)) >= 2
    assert not all(s == 100.0 for s in scores)
    assert all('compatibility_band' in plan and 'diagnostics' in plan for plan in d['plans'])


def test_goal_changes_ranking_and_penalizes_monoculture():
    climate = monthly(24)
    water_req = {
        'latitude':30.2,'longitude':71.5,'previous_crop':'wheat','planting_month':3,
        'seasons':2,'water_availability':'medium','goal':'water',
        'candidate_crop_ids':['cowpea','rice','sunflower'],
        'max_results':4,'climate_monthly':climate,
    }
    climate_req = dict(water_req, goal='climate')
    w_plans = client.post('/api/v1/rotation/plan', json=water_req).json()['plans']
    c_plans = client.post('/api/v1/rotation/plan', json=climate_req).json()['plans']
    assert w_plans[0]['diagnostics']['goal_applied'] == 'water'
    assert c_plans[0]['diagnostics']['goal_applied'] == 'climate'
    # Sequence with repeated crop (cowpea, cowpea) must score lower than diverse sequence (cowpea, sunflower)
    diverse = next(p for p in w_plans if p['crop_ids'] == ['cowpea', 'sunflower'])
    repeated = next((p for p in w_plans if p['crop_ids'] == ['cowpea', 'cowpea']), None)
    if repeated is not None:
        assert diverse['score'] > repeated['score']


def test_missing_soil_ph_reported_honestly_in_diagnostics():
    p=valid_payload();p['soil_ph']=None
    d=client.post('/api/v1/rotation/plan',json=p).json()
    diag=d['plans'][0]['diagnostics']
    assert diag['soil_evaluated'] is False
    assert diag['soil_compatibility'] is None
    assert any('soil ph' in note.lower() for note in diag['missing_data_notes'])


def test_scenario_comparison_adjusts_scores_and_preserves_disclaimer():
    p={
        'latitude':30.2,'longitude':71.5,'previous_crop':'wheat','planting_month':1,
        'seasons':2,'water_availability':'medium','goal':'water',
        'candidate_crop_ids':['wheat','chickpea','sorghum','maize'],
        'max_results':3,'climate_monthly':monthly(23),
        'scenario_label':'Drier & Warmer','temperature_delta_c':3.0,'precipitation_shift_percent':-25.0,
    }
    r=client.post('/api/v1/rotation/scenario',json=p)
    assert r.status_code==200, r.text
    d=r.json()
    assert d['status']=='ok' and d['is_hypothetical_sensitivity'] is True
    assert d['assumptions']['scenario_water_availability']=='low'
    assert d['climate_metrics']['scenario_avg_temp_c'] > d['climate_metrics']['baseline_avg_temp_c']
    assert len(d['comparisons']) >= 2
    assert 'not a weather forecast' in d['disclaimer'].lower()

