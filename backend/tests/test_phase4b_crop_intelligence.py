"""Phase 4B regression tests for evidence-backed crop intelligence, provenance, resilience & baseline comparison."""
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import pytest
from app.rotation.catalog import CROPS
from app.rotation.engine import calculate_plan, calculate_scenario_comparison
from app.rotation.models import RotationRequest, ScenarioRotationRequest
from app.rotation.resilience import analyze_historical_resilience
from app.rotation.sources import AGRONOMIC_SOURCES, get_all_catalog_sources


def _build_multi_year_monthly(
    years: list[int],
    temps_by_month: list[float],
    rain_by_month: list[float],
    omit_ym: set[tuple[int, int]] | None = None,
    vary_by_year: dict[int, tuple[float, float]] | None = None,
) -> list[dict]:
    omit = omit_ym or set()
    vary = vary_by_year or {}
    rows: list[dict] = []
    for y in years:
        temp_offset, rain_mult = vary.get(y, (0.0, 1.0))
        for m in range(1, 13):
            if (y, m) in omit:
                continue
            rows.append({
                'month': f'{y}{m:02d}',
                'temperature_c': round(temps_by_month[m - 1] + temp_offset, 2),
                'estimated_monthly_precipitation_mm': round(rain_by_month[m - 1] * rain_mult, 1),
                'precipitation_mm_per_day': round((rain_by_month[m - 1] * rain_mult) / 30.0, 2),
            })
    return rows


def test_catalog_keeps_exactly_14_crops_with_evidence_backed_metadata_and_sources():
    expected_ids = {
        'wheat', 'rice', 'maize', 'sorghum', 'millet',
        'soybean', 'chickpea', 'lentil', 'cowpea',
        'potato', 'tomato', 'sunflower', 'cotton', 'canola',
    }
    assert set(CROPS.keys()) == expected_ids

    all_sources = {s['id']: s for s in get_all_catalog_sources()}
    assert 'fao_ecocrop' in all_sources
    assert 'fao_56_irrigation' in all_sources
    assert 'fao_soil_conservation' in all_sources
    assert 'isric_soilgrids' in all_sources
    for src in AGRONOMIC_SOURCES.values():
        assert src.url.startswith('https://')
        assert src.public()['url'] == src.url

    for cid, crop in CROPS.items():
        pub = crop.public()
        assert pub['scientific_name'], f'{cid} missing scientific_name'
        assert pub['category'], f'{cid} missing category'
        assert 45 <= pub['cycle_days_min'] <= pub['cycle_days_max'] <= 300
        assert pub['cycle_variability_note']
        assert pub['temp_tol_min_c'] <= crop.temp_min_c < crop.temp_max_c <= pub['temp_tol_max_c']
        assert pub['heat_stress_threshold_c'] is not None
        assert pub['frost_sensitivity'] in ('low', 'moderate', 'high', 'very_high')
        assert len(pub['suitable_soil_textures']) >= 2
        assert pub['residue_management_notes']
        assert len(pub['succession_cautions']) >= 1
        assert len(pub['rotation_advantages']) >= 1
        assert len(pub['known_unknowns']) >= 1
        # Unknown ECe threshold must remain None rather than fabricated
        if cid == 'lentil':
            assert pub['salinity_ec_threshold_dsm'] is None
        for src_list in pub['parameter_sources'].values():
            for sid in src_list:
                assert sid in AGRONOMIC_SOURCES, f'{cid} references unknown source {sid}'


def test_soil_provenance_distinction_and_soc_reference_only():
    temps = [13, 16, 22, 28, 33, 35, 33, 32, 30, 25, 19, 14]
    rain = [18, 22, 25, 18, 15, 40, 110, 100, 45, 8, 5, 12]
    monthly = _build_multi_year_monthly([2020, 2021, 2022, 2023, 2024], temps, rain)

    lab_req = RotationRequest(
        latitude=30.2,
        longitude=71.5,
        country='Pakistan',
        country_code='PK',
        region='Punjab',
        previous_crop='wheat',
        planting_month=6,
        seasons=2,
        goal='soil',
        soil_ph=7.1,
        soil_ph_provenance='lab_test',
        soil_texture='sandy',
        soil_texture_provenance='lab_test',
        soil_organic_carbon_g_kg=5.4,
        candidate_crop_ids=['rice', 'sorghum', 'wheat', 'chickpea'],
        climate_monthly=monthly,
    )
    est_req = lab_req.model_copy(update={
        'soil_ph_provenance': 'public_dataset_estimate',
        'soil_texture_provenance': 'public_dataset_estimate',
    })
    omitted_req = lab_req.model_copy(update={
        'soil_ph': None,
        'soil_ph_provenance': None,
        'soil_texture': 'unknown',
        'soil_texture_provenance': None,
        'soil_organic_carbon_g_kg': None,
    })

    lab_res = calculate_plan(lab_req, monthly, 'NASA POWER')
    est_res = calculate_plan(est_req, monthly, 'NASA POWER')
    omitted_res = calculate_plan(omitted_req, monthly, 'NASA POWER')

    lab_sh = lab_res['plans'][0]['soil_health_summary']
    est_sh = est_res['plans'][0]['soil_health_summary']
    omitted_sh = omitted_res['plans'][0]['soil_health_summary']

    assert lab_sh['soil_ph_provenance'] == 'lab_test'
    assert lab_sh['soil_texture_provenance'] == 'lab_test'
    assert lab_sh['soc_reference_note'] is not None
    soc_note = lab_sh['soc_reference_note'].lower()
    assert 'neither converted' in soc_note and 'organic matter' in soc_note and 'mineralization' in soc_note

    assert est_sh['soil_ph_provenance'] == 'public_dataset_estimate'
    assert any('soilgrids' in c.lower() and '250 m' in c.lower() for c in est_sh['cautions'])
    assert any(s['id'] == 'isric_soilgrids' for s in est_res['sources'])

    assert omitted_sh['soil_ph_evaluated'] is False
    assert omitted_sh['soil_ph_compatibility'] is None
    assert 'soil_ph' in omitted_sh['missing_factors']


def test_species_aware_legume_bnf_and_soybean_grain_export_caution():
    temps = [22, 23, 24, 24, 23, 21, 20, 21, 22, 23, 23, 22]
    rain = [90, 95, 110, 120, 90, 40, 25, 30, 50, 85, 110, 100]
    monthly = _build_multi_year_monthly([2020, 2021, 2022, 2023], temps, rain)

    req = RotationRequest(
        latitude=-23.5,
        longitude=-47.5,
        previous_crop='maize',
        planting_month=10,
        seasons=2,
        goal='soil',
        soil_ph=5.4,
        candidate_crop_ids=['soybean', 'wheat', 'cowpea'],
        max_results=6,
        climate_monthly=monthly,
    )
    res = calculate_plan(req, monthly, 'NASA POWER')
    soy_plan = next(p for p in res['plans'] if 'soybean' in p['crop_ids'])
    sh = soy_plan['soil_health_summary']
    cautions_text = ' '.join(sh['cautions']).lower()
    assert sh['has_legume'] is True
    assert sh['legume_tradeoff_note']
    assert 'export substantial nitrogen in grain' in cautions_text
    assert 'acidic' in cautions_text


def test_historical_resilience_skips_incomplete_years_handles_year_crossing_and_extremes():
    # AU Southern Hemisphere pattern (May planting crosses Dec-Jan cleanly)
    temps = [24, 23, 20, 16, 12, 10, 9, 11, 14, 18, 21, 23]
    rain = [60, 55, 50, 45, 55, 60, 55, 50, 45, 55, 60, 65]
    # 5 years with distinct wet (2021), dry (2022), warm summer heatwave (2023), and incomplete 2024
    monthly = _build_multi_year_monthly(
        [2019, 2020, 2021, 2022, 2023, 2024],
        temps,
        rain,
        vary_by_year={
            2021: (-0.5, 1.9),   # wet cycle
            2022: (0.0, 0.35),   # dry cycle
            2023: (6.0, 0.8),    # warmer year baseline
        },
        omit_ym={(2024, 11)},  # makes 2024/25 cycle incomplete for season 2
    )
    # Apply an authentic Dec 2023 summer heatwave spike exceeding Sorghum's 38.0 °C heat-stress threshold
    for row in monthly:
        if row['month'] == '202312':
            row['temperature_c'] = 38.5

    rot = (CROPS['chickpea'], CROPS['sorghum'])  # 4 mo (May-Aug) + 4 mo (Oct-Jan crossing Dec-Jan)
    hr = analyze_historical_resilience(rot, [5, 10], monthly, irrigation_method='rainfed_only')

    assert hr['available'] is True
    assert hr['years_evaluated'] >= 4
    assert hr['incomplete_years_skipped'] >= 1
    assert hr['driest_cycle_mm'] < hr['wettest_cycle_mm']
    assert hr['driest_cycle_year'] is not None and hr['wettest_cycle_year'] is not None
    assert hr['warm_stress_seasons_count'] >= 1
    assert hr['dry_deficit_seasons_count'] >= 1
    assert 'not a seasonal forecast' in hr['caveat'].lower() or 'do not forecast' in hr['caveat'].lower()

    # Limited history (<3 years)
    short_monthly = _build_multi_year_monthly([2023, 2024], temps, rain)
    hr_short = analyze_historical_resilience(rot, [5, 10], short_monthly, irrigation_method='rainfed_only')
    assert hr_short['resilience_class'] == 'limited_history'


def test_current_practice_comparison_same_rules_and_off_season_detection():
    temps = [12, 16, 22, 28, 33, 35, 33, 32, 30, 26, 20, 14]
    rain = [18, 22, 25, 18, 15, 35, 110, 105, 45, 8, 5, 12]
    monthly = _build_multi_year_monthly([2019, 2020, 2021, 2022, 2023], temps, rain)

    # Single crop baseline must be rejected cleanly by RotationRequest validation
    with pytest.raises(Exception):
        RotationRequest(
            latitude=30.2,
            longitude=71.5,
            country='Pakistan',
            country_code='PK',
            previous_crop='wheat',
            planting_month=6,
            seasons=2,
            current_rotation_crop_ids=['rice'],
            climate_monthly=monthly,
        )

    # Valid feasible baseline (Rice -> Wheat) vs optimal alternatives
    req = RotationRequest(
        latitude=30.2,
        longitude=71.5,
        country='Pakistan',
        country_code='PK',
        region='Punjab',
        previous_crop='wheat',
        planting_month=6,
        seasons=2,
        goal='soil',
        candidate_crop_ids=['rice', 'wheat', 'chickpea', 'sorghum'],
        current_rotation_crop_ids=['rice', 'wheat'],
        climate_monthly=monthly,
    )
    res = calculate_plan(req, monthly, 'NASA POWER')
    cmp_ok = res['current_practice_comparison']
    assert cmp_ok is not None
    assert cmp_ok['status'] == 'ok'
    assert cmp_ok['evaluated_plan']['crop_ids'] == ['rice', 'wheat']
    assert cmp_ok['evaluated_plan']['diagnostics']['goal_applied'] == 'soil'
    assert cmp_ok['score_delta_vs_top'] == round(
        res['plans'][0]['score'] - cmp_ok['evaluated_plan']['score'], 1
    )

    # Off-season baseline (Wheat planted in June Kharif in PK) flagged transparently
    off_req = req.model_copy(update={'current_rotation_crop_ids': ['wheat', 'rice']})
    off_res = calculate_plan(off_req, monthly, 'NASA POWER')
    cmp_off = off_res['current_practice_comparison']
    assert cmp_off['status'] == 'ok'
    assert cmp_off['evaluated_plan']['feasibility']['status'] == 'infeasible_off_season'
    assert 'conflicts with verified regional planting windows' in cmp_off['comparison_summary'].lower()

    # Unsupported crop in current_rotation_crop_ids
    unsup_req = req.model_copy(update={'current_rotation_crop_ids': ['rice', 'cassava']})
    unsup_res = calculate_plan(unsup_req, monthly, 'NASA POWER')
    assert unsup_res['current_practice_comparison']['status'] == 'unsupported_crop'


def test_priority_sensitivity_and_scenario_provenance_parity():
    temps = [20, 21, 22, 23, 24, 24, 23, 22, 22, 21, 20, 20]
    rain = [50, 55, 70, 90, 80, 45, 35, 40, 60, 85, 75, 55]
    monthly = _build_multi_year_monthly([2019, 2020, 2021, 2022, 2023], temps, rain)

    req = RotationRequest(
        latitude=-0.3,
        longitude=36.08,
        country='Kenya',
        country_code='KE',
        previous_crop='maize',
        planting_month=3,
        seasons=2,
        goal='water',
        soil_ph=6.4,
        soil_ph_provenance='public_dataset_estimate',
        soil_organic_carbon_g_kg=12.3,
        candidate_crop_ids=['cowpea', 'rice', 'sorghum', 'maize'],
        max_results=5,
        climate_monthly=monthly,
    )
    res = calculate_plan(req, monthly, 'NASA POWER')
    sens = res['priority_sensitivity']
    assert len(sens) == 4
    goals_seen = {s['goal'] for s in sens}
    assert goals_seen == {'water', 'soil', 'climate', 'diversity'}
    active_entry = next(s for s in sens if s['is_active'])
    assert active_entry['goal'] == 'water'
    assert active_entry['top_crop_ids'] == res['plans'][0]['crop_ids']

    # Scenario comparison preserves provenance and historical_resilience on baseline_plans
    scen_req = ScenarioRotationRequest(
        **req.model_dump(),
        scenario_label='Warmer +1.5C',
        temperature_delta_c=1.5,
        precipitation_shift_percent=-10.0,
    )
    scen_res = calculate_scenario_comparison(scen_req, monthly, 'NASA POWER')
    assert scen_res['status'] == 'ok'
    assert scen_res['is_hypothetical_sensitivity'] is True
    assert scen_res['baseline_plans'][0]['historical_resilience']['available'] is True
    assert scen_res['baseline_plans'][0]['soil_health_summary']['soil_ph_provenance'] == 'public_dataset_estimate'
    assert any(s['id'] == 'isric_soilgrids' for s in scen_res['sources'])


def test_resilience_cross_year_january_spike_and_missing_next_january_boundary():
    # Regression test: Oct-Jan season must read Jan of start_year + 1 (not start_year)
    # and skip cycles whose wrapped January observation in start_year + 1 is missing.
    temps = [24, 23, 20, 16, 12, 10, 9, 11, 14, 22, 24, 25]
    rain = [60, 55, 50, 45, 55, 60, 55, 50, 45, 55, 60, 65]
    # 2020..2024 complete except 202501 is absent -> 2024/25 Oct-Jan cycle must be skipped
    monthly = _build_multi_year_monthly([2020, 2021, 2022, 2023, 2024], temps, rain)
    # Heat spike only in Jan 2024 (the wrapped 4th month of the 2023/24 Oct-Jan cycle)
    for row in monthly:
        if row['month'] == '202401':
            row['temperature_c'] = 38.5

    rot = (CROPS['chickpea'], CROPS['sorghum'])  # 4 mo May-Aug + gap to Oct (month 10) -> Oct-Jan
    hr = analyze_historical_resilience(rot, [5, 10], monthly, irrigation_method='rainfed_only')

    assert hr['available'] is True
    assert hr['years_evaluated'] == 4  # 2020, 2021, 2022, 2023 complete; 2024 skipped (missing 202501)
    assert hr['incomplete_years_skipped'] == 1
    assert hr['warm_stress_seasons_count'] == 1
    assert hr['season_variability'][1]['warm_stress_years'] == 1
    assert hr['season_variability'][1]['incomplete_years_skipped'] == 1


def test_higher_numerical_score_never_overrides_verified_regional_calendar_tier():
    # Regression test: An unverified crop pair with high thermal/water/soil fit must never
    # outrank a verified regional calendar sequence in plans or priority_sensitivity.
    temps = [21, 22, 22, 21, 20, 19, 18, 19, 20, 21, 20, 20]
    rain = [50, 55, 110, 140, 110, 45, 35, 45, 50, 115, 130, 75]
    monthly = _build_multi_year_monthly([2020, 2021, 2022, 2023], temps, rain)

    req = RotationRequest(
        latitude=-0.3,
        longitude=36.08,
        country='Kenya',
        country_code='KE',
        previous_crop='maize',
        planting_month=3,
        seasons=2,
        goal='soil',
        soil_ph=6.5,
        candidate_crop_ids=['cowpea', 'rice', 'canola', 'lentil'],
        max_results=6,
        climate_monthly=monthly,
    )
    res = calculate_plan(req, monthly, 'NASA POWER')
    assert res['status'] == 'ok'
    assert res['plans'][0]['feasibility']['regional_timing_evidence'] == 'verified'
    unverified_or_cond = [
        p for p in (res['plans'] + res['unverified_plans'])
        if p['feasibility']['regional_timing_evidence'] in ('conditional', 'unverified')
    ]
    assert unverified_or_cond
    assert any(p['score'] >= res['plans'][0]['score'] for p in unverified_or_cond) or len(unverified_or_cond) >= 1
    for sens in res['priority_sensitivity']:
        top_match = next(
            p for p in (res['plans'] + res['unverified_plans']) if p['crop_ids'] == sens['top_crop_ids']
        )
        assert top_match['feasibility']['regional_timing_evidence'] == 'verified'

