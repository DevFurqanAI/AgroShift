"""Explainable multi-dimensional screening planner (regional calendars, NASA POWER climate & rainfall,
qualitative soil health, multi-season feasibility, and scenario sensitivity).

Not a field-validated local prescription; always discloses missing dimensions and evidence boundaries.
"""
from collections import defaultdict
from itertools import product
from statistics import mean

from .calendars import resolve_regional_calendar_context
from .catalog import CATALOG_NOTE, CROPS
from .feasibility import evaluate_sequence_feasibility
from .models import RotationRequest, ScenarioRotationRequest
from .rainfall import IRRIGATED_METHODS, evaluate_crop_water_and_rainfall, summarize_monthly_rainfall
from .soil_health import evaluate_soil_health_sequence, score_soil_ph
from .sources import get_sources_for_context

GOAL_WEIGHTS: dict[str, dict[str, float]] = {
    'water': {'climate': 0.22, 'water': 0.36, 'soil_health': 0.14, 'diversity': 0.14, 'calendar': 0.14},
    'soil': {'climate': 0.20, 'water': 0.16, 'soil_health': 0.32, 'diversity': 0.18, 'calendar': 0.14},
    'diversity': {'climate': 0.20, 'water': 0.16, 'soil_health': 0.18, 'diversity': 0.32, 'calendar': 0.14},
    'climate': {'climate': 0.38, 'water': 0.18, 'soil_health': 0.14, 'diversity': 0.14, 'calendar': 0.16},
}

FARMER_SCREENING_SUMMARY = (
    'These crop plans are preliminary multi-factor comparisons based on NASA POWER historical climate '
    'records, regional planting calendars where verified, and your saved farm context. Verify local '
    'cultivars, field moisture, and market conditions before planting.'
)

DEFAULT_LIMITATIONS = [
    'Verified regional planting calendars cover selective countries and crops; unverified locations are explicitly flagged and require local confirmation.',
    'Historical temperature and precipitation averages are not weather forecasts or seasonal outlooks.',
    'NASA POWER rainfall values indicate historical precipitation totals, not effective rainfall, irrigation delivery, or FAO-56 Penman-Monteith evapotranspiration (ET0/CROPWAT).',
    'Soil-health notes (such as potential legume nitrogen fixation or residue benefits) are qualitative screening indicators and do not predict kg N/ha, soil carbon change, or yield gains.',
    'Optional farm parameters (soil pH, texture, drainage, salinity) are never fabricated when omitted.',
]


def _climate_by_calendar_month(monthly: list[dict]) -> dict[int, dict]:
    temps, rain = defaultdict(list), defaultdict(list)
    for row in monthly:
        try:
            m = int(str(row['month'])[4:])
        except (KeyError, TypeError, ValueError, IndexError):
            continue
        if not 1 <= m <= 12:
            continue
        if row.get('temperature_c') is not None:
            temps[m].append(float(row['temperature_c']))
        est = row.get('estimated_monthly_precipitation_mm')
        if est is None and row.get('precipitation_mm_per_day') is not None:
            est = float(row['precipitation_mm_per_day']) * 30.4375
        if est is not None:
            rain[m].append(float(est))
    return {
        m: {
            'temp': mean(temps[m]) if temps[m] else None,
            'rain': mean(rain[m]) if rain[m] else None,
            'n_temp': len(temps[m]),
            'n_rain': len(rain[m]),
        }
        for m in range(1, 13)
    }


def _score_temperature(temp: float, temp_min_c: float, temp_max_c: float) -> float:
    """Continuous thermal comfort curve instead of a flat plateau."""
    if temp_min_c <= temp <= temp_max_c:
        mid = (temp_min_c + temp_max_c) / 2.0
        half_span = max(0.5, (temp_max_c - temp_min_c) / 2.0)
        norm_dist = min(1.0, abs(temp - mid) / half_span)
        return 100.0 - 22.0 * (norm_dist ** 1.6)
    overshoot = min(abs(temp - temp_min_c), abs(temp - temp_max_c))
    return max(0.0, 78.0 - 16.0 * overshoot)


def _score_season_diversity(
    crop_id: str,
    crop_family: str,
    prev_id: str,
    prev_family: str,
    seen_crop_ids: set[str],
    seen_families: set[str],
) -> float:
    if crop_id == prev_id:
        return 20.0
    if crop_family == prev_family:
        return 42.0
    if crop_id in seen_crop_ids:
        return 68.0
    if crop_family in seen_families:
        return 80.0
    return 96.0


def _compatibility_band(score: float) -> str:
    if score >= 88.0:
        return 'Strong Screening Match'
    if score >= 74.0:
        return 'Good Screening Match'
    if score >= 58.0:
        return 'Moderate Screening Match'
    return 'Limited Screening Match'


def _summarize_rejected_sequences(rejected_sequences: list[dict], limit: int = 24) -> list[dict]:
    """Return representative rejected sequences without crowding out crops sorted later alphabetically."""
    if len(rejected_sequences) <= limit:
        return rejected_sequences
    selected: list[dict] = []
    seen_indices: set[int] = set()
    seen_first_crops: set[str] = set()
    for idx, entry in enumerate(rejected_sequences):
        crop_ids = entry.get('crop_ids') or []
        first_crop = crop_ids[0] if crop_ids else ''
        if first_crop not in seen_first_crops:
            seen_first_crops.add(first_crop)
            seen_indices.add(idx)
            selected.append(entry)
            if len(selected) >= limit:
                return selected
    for idx, entry in enumerate(rejected_sequences):
        if idx in seen_indices:
            continue
        selected.append(entry)
        if len(selected) >= limit:
            break
    return selected


def calculate_plan(req: RotationRequest, monthly: list[dict], source: str) -> dict:
    calendar_context = resolve_regional_calendar_context(
        latitude=req.latitude,
        longitude=req.longitude,
        country=req.country,
        country_code=req.country_code,
        region=req.region,
    )
    has_nasa = 'nasa' in source.lower()
    sources_meta = get_sources_for_context(calendar_context.get('source_ids'), has_nasa_data=has_nasa)

    if not monthly:
        return {
            'status': 'insufficient_data',
            'data_available': False,
            'plans': [],
            'rejected_sequences': [],
            'regional_context': calendar_context,
            'rainfall_intelligence': None,
            'sources': sources_meta,
            'message': 'No historical climate observations were available. No rotation scores were calculated.',
            'climate_source': source,
            'screening_disclaimer': FARMER_SCREENING_SUMMARY,
        }

    climate = _climate_by_calendar_month(monthly)
    if sum(x['temp'] is not None for x in climate.values()) < 10:
        return {
            'status': 'insufficient_data',
            'data_available': False,
            'plans': [],
            'rejected_sequences': [],
            'regional_context': calendar_context,
            'rainfall_intelligence': None,
            'sources': sources_meta,
            'message': 'At least 10 calendar months with valid historical temperatures are required for initial screening.',
            'climate_source': source,
            'screening_disclaimer': FARMER_SCREENING_SUMMARY,
        }

    selected = sorted(set(req.candidate_crop_ids)) if req.candidate_crop_ids is not None else sorted(CROPS)
    unknown = [c for c in selected if c not in CROPS]
    if unknown or req.previous_crop not in CROPS:
        return {
            'status': 'invalid_crops',
            'data_available': bool(monthly),
            'plans': [],
            'rejected_sequences': [],
            'regional_context': calendar_context,
            'rainfall_intelligence': None,
            'sources': sources_meta,
            'message': f"Unknown crop IDs: {unknown + ([req.previous_crop] if req.previous_crop not in CROPS else [])}",
            'climate_source': source,
            'screening_disclaimer': FARMER_SCREENING_SUMMARY,
        }

    rainfall_summary = summarize_monthly_rainfall(monthly)
    crops = [CROPS[c] for c in selected]
    weights = GOAL_WEIGHTS[req.goal]
    prev_crop_obj = CROPS[req.previous_crop]
    explicit_country_supplied = bool((req.country_code or req.country or '').strip())
    strict_verified_calendar = explicit_country_supplied and bool(calendar_context.get('verified'))

    missing_data_notes: list[str] = []
    if req.soil_ph is None:
        missing_data_notes.append('Soil pH was not provided, so soil pH compatibility was excluded from scoring.')
    if not req.soil_texture or req.soil_texture == 'unknown':
        missing_data_notes.append('Soil texture was not specified.')
    if not req.drainage or req.drainage == 'unknown':
        missing_data_notes.append('Field drainage quality was not specified.')
    if not req.salinity_concern or req.salinity_concern == 'unknown':
        missing_data_notes.append('Salinity status was not specified.')
    if not rainfall_summary['rainfall_available']:
        missing_data_notes.append(
            'Historical precipitation records were incomplete; water comparison used qualitative farm water supply only.'
        )
    if not calendar_context.get('verified') and calendar_context.get('warning'):
        missing_data_notes.append(calendar_context['warning'])

    ranking: list[dict] = []
    rejected_sequences: list[dict] = []

    for rotation in product(crops, repeat=req.seasons):
        feasibility = evaluate_sequence_feasibility(
            rotation=rotation,
            prev_crop=prev_crop_obj,
            initial_planting_month=req.planting_month,
            calendar_context=calendar_context,
            strict_verified_calendar=strict_verified_calendar,
        )
        if not feasibility['is_feasible']:
            rejected_sequences.append({
                'crop_ids': [c.id for c in rotation],
                'crop_names': [c.name for c in rotation],
                'reasons': feasibility['rejection_reasons'],
            })
            continue

        soil_assessment = evaluate_soil_health_sequence(
            rotation=rotation,
            prev_crop=prev_crop_obj,
            soil_ph=req.soil_ph,
            soil_texture=req.soil_texture,
            drainage=req.drainage,
            salinity_concern=req.salinity_concern,
        )

        previous = prev_crop_obj
        seen_crop_ids = {prev_crop_obj.id}
        seen_families = {prev_crop_obj.family}
        details: list[dict] = []

        for idx, crop in enumerate(rotation):
            season_check = feasibility['season_checks'][idx]
            month = season_check['planting_month']
            period = [((month - 1 + i) % 12) + 1 for i in range(crop.duration_months)]
            records = [climate[m] for m in period]
            if any(r['temp'] is None for r in records):
                break

            temp = mean(r['temp'] for r in records)
            temperature_fit = _score_temperature(temp, crop.temp_min_c, crop.temp_max_c)
            water_eval = evaluate_crop_water_and_rainfall(
                crop=crop,
                period_months=period,
                farm_water_availability=req.water_availability,
                goal=req.goal,
                rainfall_summary=rainfall_summary,
                irrigation_method=req.irrigation_method,
            )
            soil_ph_fit = score_soil_ph(req.soil_ph, crop.ph_min, crop.ph_max)
            diversity_fit = _score_season_diversity(
                crop.id,
                crop.family,
                previous.id,
                previous.family,
                seen_crop_ids,
                seen_families,
            )

            season_components: dict[str, float] = {
                'climate': temperature_fit,
                'water': water_eval['score'],
                'soil_health': soil_assessment['soil_health_score'],
                'diversity': diversity_fit,
            }
            if season_check['calendar_score'] is not None:
                season_components['calendar'] = season_check['calendar_score']

            total_w = sum(weights[k] for k in season_components)
            season_total = sum(season_components[k] * weights[k] for k in season_components) / total_w

            details.append({
                'crop_id': crop.id,
                'name': crop.name,
                'family': crop.family,
                'is_legume': crop.is_legume,
                'planting_month': month,
                'harvest_month': season_check['harvest_month'],
                'duration_months': crop.duration_months,
                'window_label': season_check['window_label'],
                'wraps_year': season_check['wraps_year'],
                'local_season_name': season_check['local_season_name'],
                'calendar_status': season_check['calendar_status'],
                'calendar_note': season_check['calendar_note'],
                'avg_historical_temperature_c': round(temp, 2),
                'temperature_fit_score': round(temperature_fit, 1),
                'water_category': crop.water_demand,
                'water_compatibility_score': water_eval['score'],
                'season_rainfall_mm': water_eval['season_rainfall_mm'],
                'rainfall_variability_level': water_eval['variability_level'],
                'rainfall_fit_status': water_eval['rainfall_fit_status'],
                'rainfall_note': water_eval['note'],
                'soil_ph_compatibility_score': round(soil_ph_fit, 1) if soil_ph_fit is not None else None,
                'family_diversity_score': round(diversity_fit, 1),
                'screening_score': round(season_total, 1),
            })

            previous = crop
            seen_crop_ids.add(crop.id)
            seen_families.add(crop.family)

        if len(details) != req.seasons:
            continue

        climate_avg = round(mean(d['temperature_fit_score'] for d in details), 1)
        water_avg = round(mean(d['water_compatibility_score'] for d in details), 1)
        diversity_avg = round(mean(d['family_diversity_score'] for d in details), 1)
        soil_health_val = soil_assessment['soil_health_score']
        calendar_avg = feasibility['calendar_score']

        plan_dimensions: dict[str, float] = {
            'climate': climate_avg,
            'water': water_avg,
            'soil_health': soil_health_val,
            'diversity': diversity_avg,
        }
        if calendar_avg is not None and feasibility['calendar_evaluated']:
            plan_dimensions['calendar'] = calendar_avg

        total_w = sum(weights[k] for k in plan_dimensions)
        active_weights = {k: round(weights[k] / total_w, 3) for k in plan_dimensions}
        base_score = sum(plan_dimensions[k] * weights[k] for k in plan_dimensions) / total_w

        distinct_families = len(set(c.family for c in rotation))
        distinct_crops = len(set(c.id for c in rotation))

        repeat_penalty = 0.0
        if distinct_families == 1:
            repeat_penalty += 6.0
        if distinct_crops < req.seasons:
            repeat_penalty += 3.0 * (req.seasons - distinct_crops)
        if feasibility['status'] == 'off_season_warning':
            repeat_penalty += 8.0

        final_score = max(0.0, min(100.0, round(base_score - repeat_penalty, 1)))

        evaluated_dims = ['historical_climate', 'water_rainfall', 'family_diversity', 'soil_health', 'priority_alignment']
        unevaluated_dims: list[str] = []
        if feasibility['calendar_evaluated']:
            evaluated_dims.insert(0, 'regional_calendar')
        else:
            unevaluated_dims.append('regional_calendar')
        if req.soil_ph is None:
            unevaluated_dims.append('soil_ph')
        if not rainfall_summary['rainfall_available']:
            unevaluated_dims.append('precipitation_history')

        completeness_count = len(evaluated_dims)
        completeness_total = 6
        completeness_label = (
            'High' if completeness_count >= 6 and req.soil_ph is not None
            else 'Moderate' if completeness_count >= 5
            else 'Partial'
        )

        # Build concise, plain-language reasons & unverified cautions
        reasons: list[str] = []
        if feasibility['calendar_evaluated'] and calendar_avg is not None:
            reasons.append(f"regional timing {calendar_avg}/100 ({feasibility['timeline_summary']})")
        elif not calendar_context.get('verified'):
            reasons.append('regional calendar unverified here (climate-only timing)')
        reasons.append(f"climate fit {climate_avg}/100")
        reasons.append(f"water/rainfall fit {water_avg}/100")
        reasons.append(f"soil-health fit {soil_health_val}/100")
        reasons.append(f"family diversity {diversity_avg}/100")

        plan_missing_notes = list(missing_data_notes)
        if soil_assessment['soil_ph_compatibility'] is not None:
            ph_summary = f"soil pH fit {soil_assessment['soil_ph_compatibility']}/100"
        else:
            ph_summary = 'soil pH not evaluated'

        ranking.append({
            'crop_ids': [c.id for c in rotation],
            'score': final_score,
            'compatibility_band': _compatibility_band(final_score),
            'feasibility': {
                'status': feasibility['status'],
                'total_cycle_months': feasibility['total_cycle_months'],
                'timeline_summary': feasibility['timeline_summary'],
                'warnings': feasibility['warnings'],
            },
            'seasons': details,
            'soil_health_summary': soil_assessment,
            'diagnostics': {
                'climate_compatibility': climate_avg,
                'water_compatibility': water_avg,
                'family_rotation': diversity_avg,
                'soil_compatibility': soil_assessment['soil_ph_compatibility'],
                'soil_evaluated': req.soil_ph is not None,
                'soil_health_score': soil_health_val,
                'regional_calendar_score': calendar_avg,
                'regional_calendar_evaluated': feasibility['calendar_evaluated'],
                'rainfall_evaluated': rainfall_summary['rainfall_available'],
                'evaluated_dimensions': evaluated_dims,
                'unevaluated_dimensions': unevaluated_dims,
                'data_completeness': {
                    'evaluated_count': completeness_count,
                    'total_count': completeness_total,
                    'label': completeness_label,
                },
                'distinct_families': distinct_families,
                'distinct_crops': distinct_crops,
                'goal_applied': req.goal,
                'goal_weights_applied': active_weights,
                'missing_data_notes': plan_missing_notes,
                'tie_note': None,
            },
            'explanation': (
                f"{_compatibility_band(final_score)}: {'; '.join(reasons)}; {ph_summary}. "
                'Preliminary comparison only; confirm local planting dates and field conditions.'
            ),
            '_sort_feasible_tier': 0 if feasibility['status'] != 'off_season_warning' else 1,
        })

    ranking.sort(
        key=lambda p: (
            p['_sort_feasible_tier'],
            -p['score'],
            -p['diagnostics']['distinct_families'],
            p['crop_ids'],
        )
    )

    chosen: list[dict] = []
    seen_seqs: set[tuple[str, ...]] = set()
    for plan in ranking:
        plan.pop('_sort_feasible_tier', None)
        key = tuple(plan['crop_ids'])
        if key in seen_seqs:
            continue
        chosen.append(plan)
        seen_seqs.add(key)
        if len(chosen) >= req.max_results:
            break

    if chosen:
        top_score = chosen[0]['score']
        for idx, plan in enumerate(chosen):
            prev_score = chosen[idx - 1]['score'] if idx > 0 else None
            next_score = chosen[idx + 1]['score'] if idx + 1 < len(chosen) else None
            if (
                (idx > 0 and abs(top_score - plan['score']) <= 0.3)
                or (prev_score is not None and abs(prev_score - plan['score']) <= 0.3)
                or (idx == 0 and next_score is not None and abs(plan['score'] - next_score) <= 0.3)
            ):
                plan['diagnostics']['tie_note'] = (
                    'Nearly tied in screening score with an adjacent option; weigh local markets, '
                    'fodder value, and field drainage equally.'
                )

    no_feasible_message = None
    if not chosen:
        if rejected_sequences:
            no_feasible_message = (
                f"All {len(rejected_sequences)} candidate sequence(s) conflicted with verified regional planting windows "
                f"for {calendar_context.get('country_name')} starting in month {req.planting_month}. "
                'Try another planting month or broaden candidate crops.'
            )
        else:
            no_feasible_message = 'Insufficient monthly observations to evaluate proposed planting windows.'

    status = 'ok' if (chosen or rejected_sequences) else 'insufficient_data'

    return {
        'status': status,
        'data_available': bool(chosen or rejected_sequences),
        'plans': chosen,
        'rejected_sequences': _summarize_rejected_sequences(rejected_sequences, limit=24),
        'regional_context': calendar_context,
        'rainfall_intelligence': {
            'rainfall_available': rainfall_summary['rainfall_available'],
            'annual_mean_mm': rainfall_summary['annual_mean_mm'],
            'wettest_3mo_mm': rainfall_summary['wettest_3mo_mm'],
            'driest_3mo_mm': rainfall_summary['driest_3mo_mm'],
            'seasonal_contrast_note': rainfall_summary['seasonal_contrast_note'],
            'note': (
                'NASA POWER historical precipitation totals (not effective rainfall, irrigation supply, or FAO-56 ET0).'
            ),
        },
        'sources': sources_meta,
        'climate_source': source,
        'historical_not_forecast': True,
        'screening_disclaimer': FARMER_SCREENING_SUMMARY,
        'method': (
            'Multi-factor screening combining regional planting calendars (when verified), NASA POWER '
            'historical temperatures & seasonal precipitation, qualitative soil-health & legume traits, '
            'and farmer-weighted priorities.'
        ),
        'catalog_warning': CATALOG_NOTE,
        'limitations': list(DEFAULT_LIMITATIONS),
        'message': no_feasible_message,
    }


def _adjust_water_level_for_scenario(
    water: str,
    precip_shift_percent: float,
    irrigation_method: str | None = None,
    has_rainfall: bool = True,
) -> tuple[str, str]:
    order = ['low', 'medium', 'high']
    idx = order.index(water)
    is_irrigated = (irrigation_method or '') in IRRIGATED_METHODS

    if not has_rainfall:
        return water, (
            'Historical precipitation records are absent, so qualitative farm water tier stayed unchanged.'
        )
    if is_irrigated and abs(precip_shift_percent) < 25.0:
        return water, (
            f"Farm irrigation ({irrigation_method.replace('_', ' ')}) buffers modest precipitation changes "
            f"({precip_shift_percent:+.0f}%); qualitative water supply tier remained {water}."
        )
    if precip_shift_percent <= -15.0 and idx > 0:
        adjusted = order[idx - 1]
        return adjusted, (
            f"Under a {precip_shift_percent:+.0f}% drier rainfall assumption, qualitative farm water supply stepped from {water} to {adjusted}."
        )
    if precip_shift_percent >= 20.0 and idx < 2:
        adjusted = order[idx + 1]
        return adjusted, (
            f"Under a {precip_shift_percent:+.0f}% wetter rainfall assumption, qualitative farm water supply stepped from {water} to {adjusted}; verify field drainage locally."
        )
    return water, (
        'Qualitative farm water-supply tier stayed unchanged; shifted precipitation only affects rainfed seasonal rainfall screening.'
    )


def _summarize_climate_metrics(monthly: list[dict]) -> tuple[float | None, float | None]:
    temps = [float(row['temperature_c']) for row in monthly if row.get('temperature_c') is not None]
    rains = []
    for row in monthly:
        est = row.get('estimated_monthly_precipitation_mm')
        if est is None and row.get('precipitation_mm_per_day') is not None:
            est = float(row['precipitation_mm_per_day']) * 30.4375
        if est is not None:
            rains.append(float(est))
    avg_temp = round(mean(temps), 2) if temps else None
    avg_rain = round(mean(rains), 1) if rains else None
    return avg_temp, avg_rain


def calculate_scenario_comparison(req: ScenarioRotationRequest, monthly: list[dict], source: str) -> dict:
    baseline_eval_req = RotationRequest(
        latitude=req.latitude,
        longitude=req.longitude,
        previous_crop=req.previous_crop,
        candidate_crop_ids=req.candidate_crop_ids,
        soil_ph=req.soil_ph,
        water_availability=req.water_availability,
        goal=req.goal,
        planting_month=req.planting_month,
        seasons=req.seasons,
        start_year=req.start_year,
        end_year=req.end_year,
        max_results=max(req.max_results, 10),
        country=req.country,
        country_code=req.country_code,
        region=req.region,
        soil_texture=req.soil_texture,
        drainage=req.drainage,
        salinity_concern=req.salinity_concern,
        irrigation_method=req.irrigation_method,
    )
    baseline_full = calculate_plan(baseline_eval_req, monthly, source)
    if baseline_full['status'] != 'ok' or not baseline_full['plans']:
        return {
            'status': baseline_full['status'],
            'data_available': False,
            'climate_source': source,
            'historical_not_forecast': True,
            'is_hypothetical_sensitivity': True,
            'scenario_label': req.scenario_label,
            'regional_context': baseline_full.get('regional_context'),
            'sources': baseline_full.get('sources', []),
            'assumptions': {
                'temperature_delta_c': req.temperature_delta_c,
                'precipitation_shift_percent': req.precipitation_shift_percent,
                'baseline_water_availability': req.water_availability,
                'scenario_water_availability': req.water_availability,
                'water_shift_note': 'Scenario comparison skipped because baseline plans were unavailable.',
            },
            'climate_metrics': None,
            'baseline_plans': [],
            'scenario_plans': [],
            'comparisons': [],
            'disclaimer': (
                'Sensitivity screening only — not a weather forecast or yield prediction. '
                'No baseline plans could be computed from current inputs.'
            ),
            'screening_disclaimer': FARMER_SCREENING_SUMMARY,
            'method': baseline_full.get('method'),
            'catalog_warning': CATALOG_NOTE,
            'limitations': list(DEFAULT_LIMITATIONS),
            'message': baseline_full.get('message'),
        }

    base_rain_summary = summarize_monthly_rainfall(monthly)
    factor = max(0.0, 1.0 + req.precipitation_shift_percent / 100.0)
    adjusted_monthly = []
    for row in monthly:
        updated = dict(row)
        if row.get('temperature_c') is not None:
            updated['temperature_c'] = round(float(row['temperature_c']) + req.temperature_delta_c, 3)
        if row.get('estimated_monthly_precipitation_mm') is not None:
            updated['estimated_monthly_precipitation_mm'] = round(
                float(row['estimated_monthly_precipitation_mm']) * factor,
                2,
            )
        if row.get('precipitation_mm_per_day') is not None:
            updated['precipitation_mm_per_day'] = round(
                float(row['precipitation_mm_per_day']) * factor,
                3,
            )
        adjusted_monthly.append(updated)

    scenario_water, water_shift_note = _adjust_water_level_for_scenario(
        req.water_availability,
        req.precipitation_shift_percent,
        irrigation_method=req.irrigation_method,
        has_rainfall=base_rain_summary['rainfall_available'],
    )
    scenario_eval_req = baseline_eval_req.model_copy(
        update={'water_availability': scenario_water}
    )
    scenario_full = calculate_plan(scenario_eval_req, adjusted_monthly, source)

    base_temp, base_rain = _summarize_climate_metrics(monthly)
    scen_temp, scen_rain = _summarize_climate_metrics(adjusted_monthly)

    base_plans_all = baseline_full['plans']
    scen_plans_all = scenario_full['plans']

    base_by_key = {tuple(p['crop_ids']): (idx + 1, p) for idx, p in enumerate(base_plans_all)}
    scen_by_key = {tuple(p['crop_ids']): (idx + 1, p) for idx, p in enumerate(scen_plans_all)}

    candidate_keys: list[tuple[str, ...]] = []
    for p in base_plans_all[: req.max_results]:
        k = tuple(p['crop_ids'])
        if k not in candidate_keys:
            candidate_keys.append(k)
    for p in scen_plans_all[: req.max_results]:
        k = tuple(p['crop_ids'])
        if k not in candidate_keys:
            candidate_keys.append(k)

    is_irrigated = (req.irrigation_method or '') in IRRIGATED_METHODS
    comparisons = []
    for key in candidate_keys:
        base_entry = base_by_key.get(key)
        scen_entry = scen_by_key.get(key)
        base_rank = base_entry[0] if base_entry else None
        base_plan = base_entry[1] if base_entry else None
        scen_rank = scen_entry[0] if scen_entry else None
        scen_plan = scen_entry[1] if scen_entry else None

        score_delta = (
            round(scen_plan['score'] - base_plan['score'], 1)
            if base_plan and scen_plan
            else None
        )
        rank_change = (
            base_rank - scen_rank
            if base_rank is not None and scen_rank is not None
            else None
        )

        reasons: list[str] = []
        if base_plan and scen_plan:
            temp_diff = round(
                scen_plan['diagnostics']['climate_compatibility']
                - base_plan['diagnostics']['climate_compatibility'],
                1,
            )
            water_diff = round(
                scen_plan['diagnostics']['water_compatibility']
                - base_plan['diagnostics']['water_compatibility'],
                1,
            )
            if abs(temp_diff) >= 0.5:
                reasons.append(
                    f"temperature fit {temp_diff:+.1f} pts ({base_plan['diagnostics']['climate_compatibility']} → {scen_plan['diagnostics']['climate_compatibility']})"
                )
            if abs(water_diff) >= 0.5:
                reasons.append(
                    f"water & rainfall fit {water_diff:+.1f} pts ({base_plan['diagnostics']['water_compatibility']} → {scen_plan['diagnostics']['water_compatibility']})"
                )
            elif abs(req.precipitation_shift_percent) >= 5.0:
                if not base_rain_summary['rainfall_available']:
                    reasons.append('precipitation shift did not change water score because historical rainfall observations were unavailable')
                elif is_irrigated:
                    reasons.append('water score changed minimally because irrigated water supply buffers this precipitation shift')
                else:
                    reasons.append('rainfall remained within similar qualitative water screening bands under this precipitation shift')

        if not reasons:
            reasons.append('minimal change in temperature or water/rainfall compatibility under these hypothetical shifts')
        if req.precipitation_shift_percent >= 20.0:
            reasons.append('check local drainage and disease risk for wetter seasons')

        ref_plan = scen_plan or base_plan
        comparisons.append({
            'crop_ids': list(key),
            'crop_names': [s['name'] for s in ref_plan['seasons']] if ref_plan else list(key),
            'baseline_rank': base_rank,
            'scenario_rank': scen_rank,
            'rank_change': rank_change,
            'baseline_score': base_plan['score'] if base_plan else None,
            'scenario_score': scen_plan['score'] if scen_plan else None,
            'score_delta': score_delta,
            'baseline_band': base_plan['compatibility_band'] if base_plan else None,
            'scenario_band': scen_plan['compatibility_band'] if scen_plan else None,
            'reason': '; '.join(reasons).capitalize() + '.',
        })

    return {
        'status': 'ok',
        'data_available': True,
        'climate_source': source,
        'historical_not_forecast': True,
        'is_hypothetical_sensitivity': True,
        'scenario_label': req.scenario_label,
        'regional_context': baseline_full.get('regional_context'),
        'sources': baseline_full.get('sources', []),
        'assumptions': {
            'temperature_delta_c': req.temperature_delta_c,
            'precipitation_shift_percent': req.precipitation_shift_percent,
            'baseline_water_availability': req.water_availability,
            'scenario_water_availability': scenario_water,
            'water_shift_note': water_shift_note,
        },
        'climate_metrics': {
            'baseline_avg_temp_c': base_temp,
            'scenario_avg_temp_c': scen_temp,
            'baseline_avg_monthly_precip_mm': base_rain,
            'scenario_avg_monthly_precip_mm': scen_rain,
        },
        'baseline_plans': base_plans_all[: req.max_results],
        'scenario_plans': scen_plans_all[: req.max_results],
        'comparisons': comparisons,
        'disclaimer': (
            'Sensitivity screening only — not a weather forecast or yield prediction. '
            'Baseline metrics use historical NASA POWER averages with user-selected hypothetical temperature and rainfall shifts applied.'
        ),
        'screening_disclaimer': FARMER_SCREENING_SUMMARY,
        'method': baseline_full['method'],
        'catalog_warning': CATALOG_NOTE,
        'limitations': list(DEFAULT_LIMITATIONS),
        'message': None,
    }
