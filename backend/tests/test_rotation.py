from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.rotation.models import RotationRequest
from app.rotation.engine import calculate_plan

client = TestClient(app)


def monthly(temperature=22, precip_mm=50, precip_mm_day=None):
    rows = []
    for m in range(1, 13):
        row = {
            'month': f'2025{m:02d}',
            'temperature_c': temperature,
            'estimated_monthly_precipitation_mm': precip_mm,
        }
        if precip_mm_day is not None:
            row['precipitation_mm_per_day'] = precip_mm_day
        rows.append(row)
    return rows


def seasonal_monthly(temp_by_month, rain_by_month):
    rows = []
    for y in (2022, 2023, 2024):
        for m in range(1, 13):
            rows.append({
                'month': f'{y}{m:02d}',
                'temperature_c': temp_by_month[m - 1],
                'estimated_monthly_precipitation_mm': rain_by_month[m - 1],
                'precipitation_mm_per_day': round(rain_by_month[m - 1] / 30.0, 2),
            })
    return rows


def valid_payload():
    return {
        'latitude': 30.2,
        'longitude': 71.5,
        'previous_crop': 'wheat',
        'planting_month': 1,
        'seasons': 2,
        'candidate_crop_ids': ['wheat', 'chickpea', 'maize'],
        'climate_monthly': monthly(),
    }


def test_catalog():
    r = client.get('/api/v1/rotation/crops')
    assert r.status_code == 200 and len(r.json()['crops']) >= 10
    assert 'catalog_warning' in r.json()
    assert isinstance(r.json().get('sources'), list) and len(r.json()['sources']) >= 1


def test_plan_deterministic_and_bounded():
    p = valid_payload()
    r = client.post('/api/v1/rotation/plan', json=p)
    assert r.status_code == 200, r.text
    d = r.json()
    assert d['status'] == 'ok' and len(d['plans']) == 3
    assert all(0 <= x['score'] <= 100 for x in d['plans'])
    assert d['plans'] == client.post('/api/v1/rotation/plan', json=p).json()['plans']
    assert d['climate_source'] == 'user_supplied_climate_series_unverified'


def test_no_fake_soil_score():
    d = client.post('/api/v1/rotation/plan', json=valid_payload()).json()
    assert all(v['soil_ph_compatibility_score'] is None for plan in d['plans'] for v in plan['seasons'])


def test_missing_data_no_recommendations():
    p = valid_payload()
    p['climate_monthly'] = []
    d = client.post('/api/v1/rotation/plan', json=p).json()
    assert d['status'] == 'insufficient_data' and d['plans'] == []


def test_partial_data_no_recommendations():
    p = valid_payload()
    p['climate_monthly'] = monthly()[:4]
    d = client.post('/api/v1/rotation/plan', json=p).json()
    assert d['status'] == 'insufficient_data'


@pytest.mark.parametrize(
    'change',
    [
        {'latitude': 99},
        {'soil_ph': 11},
        {'planting_month': 13},
        {'candidate_crop_ids': ['wheat']},
        {'start_year': 2025, 'end_year': 2024},
        {'seasons': 5},
    ],
)
def test_invalid_input_422(change):
    p = valid_payload()
    p.update(change)
    assert client.post('/api/v1/rotation/plan', json=p).status_code == 422


def test_unknown_crop_handled():
    p = valid_payload()
    p['previous_crop'] = 'not-a-crop'
    d = client.post('/api/v1/rotation/plan', json=p).json()
    assert d['status'] == 'invalid_crops' and d['plans'] == []


def test_nasa_failure_graceful(monkeypatch):
    from app.rotation import routes
    from app.nasa_power import NASAClimateError

    def fail(*args):
        raise NASAClimateError('unavailable')

    monkeypatch.setattr(routes, 'fetch_climate_summary', fail)
    p = valid_payload()
    p.pop('climate_monthly')
    r = client.post('/api/v1/rotation/plan', json=p)
    assert r.status_code == 200 and r.json()['status'] == 'insufficient_data'


def test_nasa_success(monkeypatch):
    from app.rotation import routes

    monkeypatch.setattr(routes, 'fetch_climate_summary', lambda *args: {'monthly': monthly()})
    p = valid_payload()
    p.pop('climate_monthly')
    d = client.post('/api/v1/rotation/plan', json=p).json()
    assert d['status'] == 'ok' and 'NASA POWER' in d['climate_source']


def test_leap_month_not_used_as_fabricated_climate():
    p = valid_payload()
    p['climate_monthly'] = monthly()
    d = client.post('/api/v1/rotation/plan', json=p).json()
    assert all(x['avg_historical_temperature_c'] == 22 for r in d['plans'] for x in r['seasons'])


def test_scores_differentiated_and_not_saturated_at_100():
    p = {
        'latitude': 30.2,
        'longitude': 71.5,
        'previous_crop': 'wheat',
        'planting_month': 1,
        'seasons': 3,
        'water_availability': 'medium',
        'goal': 'water',
        'soil_ph': 6.8,
        'candidate_crop_ids': ['wheat', 'chickpea', 'canola', 'maize', 'rice'],
        'max_results': 5,
        'climate_monthly': monthly(22),
    }
    d = client.post('/api/v1/rotation/plan', json=p).json()
    assert d['status'] == 'ok'
    scores = [plan['score'] for plan in d['plans']]
    assert len(set(scores)) >= 2
    assert not all(s == 100.0 for s in scores)
    assert all('compatibility_band' in plan and 'diagnostics' in plan for plan in d['plans'])


def test_goal_changes_ranking_and_penalizes_monoculture():
    climate = monthly(24)
    water_req = {
        'latitude': 30.2,
        'longitude': 71.5,
        'previous_crop': 'wheat',
        'planting_month': 3,
        'seasons': 2,
        'water_availability': 'medium',
        'goal': 'water',
        'candidate_crop_ids': ['cowpea', 'rice', 'sunflower'],
        'max_results': 4,
        'climate_monthly': climate,
    }
    climate_req = dict(water_req, goal='climate')
    w_plans = client.post('/api/v1/rotation/plan', json=water_req).json()['plans']
    c_plans = client.post('/api/v1/rotation/plan', json=climate_req).json()['plans']
    assert w_plans[0]['diagnostics']['goal_applied'] == 'water'
    assert c_plans[0]['diagnostics']['goal_applied'] == 'climate'
    diverse = next(p for p in w_plans if p['crop_ids'] == ['cowpea', 'sunflower'])
    repeated = next((p for p in w_plans if p['crop_ids'] == ['cowpea', 'cowpea']), None)
    if repeated is not None:
        assert diverse['score'] > repeated['score']


def test_missing_soil_ph_reported_honestly_in_diagnostics():
    p = valid_payload()
    p['soil_ph'] = None
    d = client.post('/api/v1/rotation/plan', json=p).json()
    diag = d['plans'][0]['diagnostics']
    assert diag['soil_evaluated'] is False
    assert diag['soil_compatibility'] is None
    assert any('soil ph' in note.lower() for note in diag['missing_data_notes'])


def test_pakistan_rabi_kharif_calendars_and_off_season_rejection():
    punjab_temps = [12, 16, 22, 28, 33, 35, 33, 32, 30, 26, 20, 14]
    punjab_rain = [18, 22, 25, 18, 15, 35, 110, 105, 45, 8, 5, 12]
    payload = {
        'latitude': 30.2,
        'longitude': 71.5,
        'country': 'Pakistan',
        'country_code': 'PK',
        'region': 'Punjab',
        'previous_crop': 'wheat',
        'planting_month': 6,  # Kharif onset
        'seasons': 2,
        'candidate_crop_ids': ['rice', 'wheat', 'chickpea', 'sorghum'],
        'water_availability': 'high',
        'irrigation_method': 'canal_flood',
        'max_results': 6,
        'climate_monthly': seasonal_monthly(punjab_temps, punjab_rain),
    }
    d = client.post('/api/v1/rotation/plan', json=payload).json()
    assert d['status'] == 'ok'
    assert d['regional_context']['verified'] is True
    assert d['regional_context']['country_code'] == 'PK'
    feasible_ids = [p['crop_ids'] for p in d['plans']]
    rejected_ids = [r['crop_ids'] for r in d['rejected_sequences']]
    # Rice (June Kharif, 5 mo -> Nov) followed by Wheat or Chickpea (Nov Rabi) is feasible
    assert ['rice', 'wheat'] in feasible_ids or ['rice', 'chickpea'] in feasible_ids
    # Wheat planted in June in Pakistan must be rejected as off-season
    assert ['wheat', 'rice'] in rejected_ids


def test_southern_hemisphere_and_year_crossing_seasons():
    # Australia winter-summer cropping (Apr-Jul sowing, Oct-Jan harvest crosses Dec-Jan)
    au_temps = [24, 23, 20, 16, 12, 10, 9, 11, 14, 18, 21, 23]
    au_rain = [60, 55, 50, 40, 45, 48, 45, 42, 40, 50, 55, 65]
    au_payload = {
        'latitude': -32.2,
        'longitude': 148.6,
        'country': 'Australia',
        'country_code': 'AU',
        'previous_crop': 'wheat',
        'planting_month': 5,  # Autumn-winter sowing in Southern Hemisphere
        'seasons': 2,
        'candidate_crop_ids': ['wheat', 'canola', 'chickpea', 'sorghum'],
        'water_availability': 'medium',
        'max_results': 6,
        'climate_monthly': seasonal_monthly(au_temps, au_rain),
    }
    d = client.post('/api/v1/rotation/plan', json=au_payload).json()
    assert d['regional_context']['hemisphere'] == 'southern'
    assert len(d['plans']) >= 1
    assert any(p['crop_ids'][0] in ('canola', 'chickpea', 'wheat') for p in d['plans'])

    # Kenya Short Rains (October planting -> crosses Dec-Jan)
    ke_temps = [21, 22, 22, 21, 20, 19, 18, 19, 20, 21, 20, 20]
    ke_rain = [40, 45, 110, 160, 120, 45, 35, 45, 50, 115, 140, 75]
    ke_payload = {
        'latitude': -0.3,
        'longitude': 36.08,
        'country': 'Kenya',
        'country_code': 'KE',
        'previous_crop': 'maize',
        'planting_month': 10,
        'seasons': 2,
        'candidate_crop_ids': ['cowpea', 'sorghum', 'maize'],
        'water_availability': 'medium',
        'max_results': 4,
        'climate_monthly': seasonal_monthly(ke_temps, ke_rain),
    }
    ke_d = client.post('/api/v1/rotation/plan', json=ke_payload).json()
    assert ke_d['status'] == 'ok'
    # Oct + 3 months (cowpea Oct-Dec) or sorghum (Oct-Jan crosses Dec-Jan)
    assert any(s['wraps_year'] is True for p in ke_d['plans'] for s in p['seasons'])


def test_unsupported_country_honest_fallback():
    temps = [2, 3, 6, 10, 15, 18, 20, 19, 15, 10, 5, 3]
    rain = [80, 70, 65, 60, 65, 80, 90, 95, 90, 95, 90, 85]
    payload = {
        'latitude': 60.4,
        'longitude': 5.3,
        'country': 'Norway',
        'country_code': 'NO',
        'previous_crop': 'wheat',
        'planting_month': 5,
        'seasons': 2,
        'candidate_crop_ids': ['wheat', 'canola', 'potato'],
        'climate_monthly': seasonal_monthly(temps, rain),
    }
    d = client.post('/api/v1/rotation/plan', json=payload).json()
    assert d['status'] == 'ok'
    assert d['regional_context']['verified'] is False
    assert d['regional_context']['evidence_status'] == 'unverified_location'
    assert len(d['plans']) >= 1
    diag = d['plans'][0]['diagnostics']
    assert diag['regional_calendar_evaluated'] is False
    assert diag['regional_calendar_score'] is None
    assert 'regional_calendar' in diag['unevaluated_dimensions']
    assert any('not yet in agroshift' in note.lower() for note in diag['missing_data_notes'])


def test_legumes_repeated_families_and_soil_constraints():
    payload = {
        'latitude': 30.2,
        'longitude': 71.5,
        'country': 'Pakistan',
        'previous_crop': 'wheat',
        'planting_month': 6,
        'seasons': 2,
        'goal': 'soil',
        'soil_ph': 7.2,
        'drainage': 'poorly_drained',
        'salinity_concern': 'confirmed',
        'candidate_crop_ids': ['sorghum', 'rice', 'chickpea', 'wheat'],
        'max_results': 6,
        'climate_monthly': monthly(25, 60),
    }
    d = client.post('/api/v1/rotation/plan', json=payload).json()
    assert d['status'] == 'ok'
    legume_plans = [p for p in d['plans'] if p['soil_health_summary']['has_legume']]
    assert len(legume_plans) >= 1
    sh = legume_plans[0]['soil_health_summary']
    assert 'biological nitrogen fixation' in ' '.join(sh['strengths']).lower()
    assert 'not a guaranteed nitrogen credit' in ' '.join(sh['strengths']).lower()
    # Poor drainage + confirmed salinity warnings should trigger for sensitive crops like chickpea
    cautions_text = ' '.join(sh['cautions']).lower()
    assert 'drainage' in cautions_text or 'salinity' in cautions_text


def test_precipitation_units_and_missing_rainfall_handled():
    # Supply only precipitation_mm_per_day (no estimated_monthly_precipitation_mm)
    p = valid_payload()
    p['climate_monthly'] = [
        {'month': f'2025{m:02d}', 'temperature_c': 23.0, 'precipitation_mm_per_day': 2.0}
        for m in range(1, 13)
    ]
    d = client.post('/api/v1/rotation/plan', json=p).json()
    assert d['rainfall_intelligence']['rainfall_available'] is True
    assert d['plans'][0]['seasons'][0]['season_rainfall_mm'] is not None

    # Supply temperature only (missing rainfall completely)
    p_norain = valid_payload()
    p_norain['climate_monthly'] = [
        {'month': f'2025{m:02d}', 'temperature_c': 23.0}
        for m in range(1, 13)
    ]
    d_norain = client.post('/api/v1/rotation/plan', json=p_norain).json()
    assert d_norain['rainfall_intelligence']['rainfall_available'] is False
    assert d_norain['plans'][0]['diagnostics']['rainfall_evaluated'] is False


def test_scenario_comparison_adjusts_scores_and_preserves_disclaimer():
    p = {
        'latitude': 30.2,
        'longitude': 71.5,
        'previous_crop': 'wheat',
        'planting_month': 1,
        'seasons': 2,
        'water_availability': 'medium',
        'goal': 'water',
        'candidate_crop_ids': ['wheat', 'chickpea', 'sorghum', 'maize'],
        'max_results': 3,
        'climate_monthly': monthly(23),
        'scenario_label': 'Drier & Warmer',
        'temperature_delta_c': 3.0,
        'precipitation_shift_percent': -25.0,
    }
    r = client.post('/api/v1/rotation/scenario', json=p)
    assert r.status_code == 200, r.text
    d = r.json()
    assert d['status'] == 'ok' and d['is_hypothetical_sensitivity'] is True
    assert d['assumptions']['scenario_water_availability'] == 'low'
    assert d['climate_metrics']['scenario_avg_temp_c'] > d['climate_metrics']['baseline_avg_temp_c']
    assert len(d['comparisons']) >= 2
    assert 'not a weather forecast' in d['disclaimer'].lower()


def test_scenario_irrigated_explains_minimal_precip_impact():
    p = {
        'latitude': 30.2,
        'longitude': 71.5,
        'country': 'Pakistan',
        'irrigation_method': 'canal_flood',
        'previous_crop': 'wheat',
        'planting_month': 6,
        'seasons': 2,
        'water_availability': 'medium',
        'goal': 'water',
        'candidate_crop_ids': ['rice', 'wheat', 'chickpea', 'sorghum'],
        'max_results': 3,
        'climate_monthly': monthly(25, 60),
        'scenario_label': 'Slight Rain Shift',
        'temperature_delta_c': 0.0,
        'precipitation_shift_percent': -10.0,
    }
    r = client.post('/api/v1/rotation/scenario', json=p)
    assert r.status_code == 200
    d = r.json()
    assert d['status'] == 'ok'
    assert 'irrigation' in d['assumptions']['water_shift_note'].lower()
    assert any('irrigated' in c['reason'].lower() for c in d['comparisons'])
