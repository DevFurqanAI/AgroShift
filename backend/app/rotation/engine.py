"""Explainable prototype planner for *screening*, not verified agricultural recommendations."""
from collections import defaultdict
from itertools import product
from statistics import mean
from .catalog import CROPS, CATALOG_NOTE
from .models import RotationRequest, ScenarioRotationRequest

WATER_RANK = {'low': 1, 'medium': 2, 'high': 3}
GOAL_WEIGHTS = {
    'water': {'climate': 0.30, 'water': 0.40, 'soil': 0.15, 'diversity': 0.15},
    'soil': {'climate': 0.25, 'water': 0.20, 'soil': 0.35, 'diversity': 0.20},
    'diversity': {'climate': 0.25, 'water': 0.20, 'soil': 0.20, 'diversity': 0.35},
    'climate': {'climate': 0.45, 'water': 0.20, 'soil': 0.15, 'diversity': 0.20},
}

FARMER_SCREENING_SUMMARY = (
    'These crop plans are preliminary comparisons based on available climate information and your farm details. '
    'Check local growing seasons and conditions before planting.'
)

DEFAULT_LIMITATIONS = [
    'Crop growth windows are approximate; planting month must be verified locally.',
    'Historical temperature alone is not a future forecast.',
    'Rainfall is not used as a validated crop water-supply estimate; farmer water category is qualitative.',
    'Soil pH is optional; missing soil pH receives no fabricated score.',
    'Yield, economics, pests, soil nutrients and local regulations are not modeled.',
]


def _climate_by_calendar_month(monthly):
    temps, rain = defaultdict(list), defaultdict(list)
    for row in monthly:
        try:
            m = int(row['month'][4:])
        except (KeyError, TypeError, ValueError, IndexError):
            continue
        if not 1 <= m <= 12:
            continue
        if row.get('temperature_c') is not None:
            temps[m].append(row['temperature_c'])
        if row.get('estimated_monthly_precipitation_mm') is not None:
            rain[m].append(row['estimated_monthly_precipitation_mm'])
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
    """Continuous comfort-curve temperature score instead of a flat 100 plateau."""
    if temp_min_c <= temp <= temp_max_c:
        mid = (temp_min_c + temp_max_c) / 2.0
        half_span = max(0.5, (temp_max_c - temp_min_c) / 2.0)
        norm_dist = min(1.0, abs(temp - mid) / half_span)
        # 100.0 at optimal midpoint, tapering smoothly to 78.0 at tolerance boundary.
        return 100.0 - 22.0 * (norm_dist ** 1.6)
    overshoot = min(abs(temp - temp_min_c), abs(temp - temp_max_c))
    return max(0.0, 78.0 - 16.0 * overshoot)


def _score_water(crop_water: str, farm_water: str, goal: str) -> float:
    """Differentiate water efficiency and mismatch risk; avoid flattening all non-deficit crops to 100."""
    gap = WATER_RANK[crop_water] - WATER_RANK[farm_water]
    if gap >= 2:
        return 12.0 if goal == 'water' else 22.0
    if gap == 1:
        return 48.0 if goal == 'water' else 58.0

    if goal == 'water':
        return {'low': 100.0, 'medium': 82.0, 'high': 64.0}[crop_water]

    # When another priority leads, exact demand match scores slightly above under-utilized water surplus.
    if gap == 0:
        return 96.0
    if gap == -1:
        return 91.0
    return 85.0


def _score_soil_ph(soil_ph: float | None, ph_min: float, ph_max: float) -> float | None:
    """Optional soil pH comfort curve; returns None when soil pH is not provided."""
    if soil_ph is None:
        return None
    if ph_min <= soil_ph <= ph_max:
        mid = (ph_min + ph_max) / 2.0
        half_span = max(0.25, (ph_max - ph_min) / 2.0)
        norm_dist = min(1.0, abs(soil_ph - mid) / half_span)
        return 100.0 - 18.0 * (norm_dist ** 1.5)
    overshoot = min(abs(soil_ph - ph_min), abs(soil_ph - ph_max))
    return max(0.0, 82.0 - 32.0 * overshoot)


def _score_season_diversity(
    crop_id: str,
    crop_family: str,
    prev_id: str,
    prev_family: str,
    seen_crop_ids: set[str],
    seen_families: set[str],
) -> float:
    """Penalize both adjacent repeats and non-adjacent repeats across the multi-season horizon."""
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


def calculate_plan(req: RotationRequest, monthly: list[dict], source: str):
    if not monthly:
        return {
            'status': 'insufficient_data',
            'data_available': False,
            'plans': [],
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
            'message': f"Unknown crop IDs: {unknown + ([req.previous_crop] if req.previous_crop not in CROPS else [])}",
            'climate_source': source,
            'screening_disclaimer': FARMER_SCREENING_SUMMARY,
        }

    crops = [CROPS[c] for c in selected]
    weights = GOAL_WEIGHTS[req.goal]
    prev_crop_obj = CROPS[req.previous_crop]
    missing_data_notes: list[str] = []
    if req.soil_ph is None:
        missing_data_notes.append('Soil pH was not provided, so soil pH compatibility was excluded from scoring.')

    ranking = []
    for rotation in product(crops, repeat=req.seasons):
        previous = prev_crop_obj
        seen_crop_ids = {prev_crop_obj.id}
        seen_families = {prev_crop_obj.family}
        month = req.planting_month
        details = []
        raw_totals: list[float] = []
        active_weight_sums: dict[str, float] = {}

        for crop in rotation:
            period = [((month - 1 + i) % 12) + 1 for i in range(crop.duration_months)]
            records = [climate[m] for m in period]
            # Require actual climate information for each crop's intended calendar months.
            if any(r['temp'] is None for r in records):
                break
            temp = mean(r['temp'] for r in records)
            temperature_fit = _score_temperature(temp, crop.temp_min_c, crop.temp_max_c)
            water_fit = _score_water(crop.water_demand, req.water_availability, req.goal)
            soil_fit = _score_soil_ph(req.soil_ph, crop.ph_min, crop.ph_max)
            diversity_fit = _score_season_diversity(
                crop.id,
                crop.family,
                previous.id,
                previous.family,
                seen_crop_ids,
                seen_families,
            )

            components = {
                'climate': temperature_fit,
                'water': water_fit,
                'diversity': diversity_fit,
            }
            if soil_fit is not None:
                components['soil'] = soil_fit

            total_w = sum(weights[k] for k in components)
            active_weight_sums = {k: round(weights[k] / total_w, 3) for k in components}
            total = sum(components[k] * weights[k] for k in components) / total_w

            details.append({
                'crop_id': crop.id,
                'name': crop.name,
                'planting_month': month,
                'duration_months': crop.duration_months,
                'avg_historical_temperature_c': round(temp, 2),
                'temperature_fit_score': round(temperature_fit, 1),
                'water_category': crop.water_demand,
                'water_compatibility_score': round(water_fit, 1),
                'soil_ph_compatibility_score': round(soil_fit, 1) if soil_fit is not None else None,
                'family_diversity_score': round(diversity_fit, 1),
                'screening_score': round(total, 1),
            })
            raw_totals.append(total)
            month = ((month - 1 + crop.duration_months) % 12) + 1
            previous = crop
            seen_crop_ids.add(crop.id)
            seen_families.add(crop.family)

        if len(details) == req.seasons:
            base_score = mean(raw_totals)
            distinct_families = len(set(c.family for c in rotation))
            distinct_crops = len(set(c.id for c in rotation))

            # Penalize whole-plan repetition rather than artificially inflating distinct plans to 100/100.
            repeat_penalty = 0.0
            if distinct_families == 1:
                repeat_penalty += 5.0
            if distinct_crops < req.seasons:
                repeat_penalty += 3.0 * (req.seasons - distinct_crops)

            final_score = max(0.0, min(100.0, round(base_score - repeat_penalty, 1)))
            climate_avg = round(mean(d['temperature_fit_score'] for d in details), 1)
            water_avg = round(mean(d['water_compatibility_score'] for d in details), 1)
            diversity_avg = round(mean(d['family_diversity_score'] for d in details), 1)
            soil_vals = [d['soil_ph_compatibility_score'] for d in details if d['soil_ph_compatibility_score'] is not None]
            soil_avg = round(mean(soil_vals), 1) if soil_vals else None

            ranking.append({
                'crop_ids': [c.id for c in rotation],
                'score': final_score,
                'compatibility_band': _compatibility_band(final_score),
                'seasons': details,
                'diagnostics': {
                    'climate_compatibility': climate_avg,
                    'water_compatibility': water_avg,
                    'family_rotation': diversity_avg,
                    'soil_compatibility': soil_avg,
                    'soil_evaluated': req.soil_ph is not None,
                    'distinct_families': distinct_families,
                    'distinct_crops': distinct_crops,
                    'goal_applied': req.goal,
                    'goal_weights_applied': active_weight_sums,
                    'missing_data_notes': list(missing_data_notes),
                    'tie_note': None,
                },
                'explanation': (
                    f"{_compatibility_band(final_score)}: climate fit {climate_avg}/100, "
                    f"water fit {water_avg}/100, family rotation {diversity_avg}/100"
                    + (f", soil pH fit {soil_avg}/100." if soil_avg is not None else " (soil pH not evaluated).")
                    + " Screening comparison only; verify local conditions before planting."
                ),
            })

    ranking.sort(key=lambda p: (-p['score'], -p['diagnostics']['distinct_families'], p['crop_ids']))

    chosen, seen = [], set()
    for plan in ranking:
        key = tuple(plan['crop_ids'])
        if key in seen:
            continue
        chosen.append(plan)
        seen.add(key)
        if len(chosen) >= req.max_results:
            break

    if chosen:
        top_score = chosen[0]['score']
        for idx, plan in enumerate(chosen):
            prev_score = chosen[idx - 1]['score'] if idx > 0 else None
            next_score = chosen[idx + 1]['score'] if idx + 1 < len(chosen) else None
            if (idx > 0 and abs(top_score - plan['score']) <= 0.3) or (
                prev_score is not None and abs(prev_score - plan['score']) <= 0.3
            ) or (idx == 0 and next_score is not None and abs(plan['score'] - next_score) <= 0.3):
                plan['diagnostics']['tie_note'] = (
                    'Nearly tied in screening score with an adjacent option; weigh local markets, fodder value, and field drainage equally.'
                )

    return {
        'status': 'ok' if chosen else 'insufficient_data',
        'data_available': bool(chosen),
        'plans': chosen,
        'climate_source': source,
        'historical_not_forecast': True,
        'screening_disclaimer': FARMER_SCREENING_SUMMARY,
        'method': 'Transparent rule-based prototype screening; weights and crop thresholds require regional validation.',
        'catalog_warning': CATALOG_NOTE,
        'limitations': list(DEFAULT_LIMITATIONS),
        'message': None if chosen else 'Insufficient monthly observations to evaluate proposed planting windows.',
    }


def _adjust_water_level_for_scenario(water: str, precip_shift_percent: float) -> tuple[str, str]:
    order = ['low', 'medium', 'high']
    idx = order.index(water)
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
    return water, 'Qualitative farm water-supply category stayed unchanged under this precipitation assumption.'


def _summarize_climate_metrics(monthly: list[dict]) -> tuple[float | None, float | None]:
    temps = [row['temperature_c'] for row in monthly if row.get('temperature_c') is not None]
    rains = [
        row['estimated_monthly_precipitation_mm']
        for row in monthly
        if row.get('estimated_monthly_precipitation_mm') is not None
    ]
    avg_temp = round(mean(temps), 2) if temps else None
    avg_rain = round(mean(rains), 1) if rains else None
    return avg_temp, avg_rain


def calculate_scenario_comparison(req: ScenarioRotationRequest, monthly: list[dict], source: str):
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
    )
    baseline_full = calculate_plan(baseline_eval_req, monthly, source)
    if baseline_full['status'] != 'ok':
        return {
            'status': baseline_full['status'],
            'data_available': False,
            'climate_source': source,
            'historical_not_forecast': True,
            'is_hypothetical_sensitivity': True,
            'scenario_label': req.scenario_label,
            'assumptions': {
                'temperature_delta_c': req.temperature_delta_c,
                'precipitation_shift_percent': req.precipitation_shift_percent,
                'baseline_water_availability': req.water_availability,
                'scenario_water_availability': req.water_availability,
                'water_shift_note': 'Scenario comparison skipped because baseline data was unavailable.',
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

    adjusted_monthly = []
    for row in monthly:
        updated = dict(row)
        if row.get('temperature_c') is not None:
            updated['temperature_c'] = round(float(row['temperature_c']) + req.temperature_delta_c, 3)
        if row.get('estimated_monthly_precipitation_mm') is not None:
            factor = max(0.0, 1.0 + req.precipitation_shift_percent / 100.0)
            updated['estimated_monthly_precipitation_mm'] = round(
                float(row['estimated_monthly_precipitation_mm']) * factor,
                2,
            )
        adjusted_monthly.append(updated)

    scenario_water, water_shift_note = _adjust_water_level_for_scenario(
        req.water_availability,
        req.precipitation_shift_percent,
    )
    scenario_eval_req = baseline_eval_req.model_copy(
        update={'water_availability': scenario_water}
    )
    scenario_full = calculate_plan(scenario_eval_req, adjusted_monthly, source)

    base_temp, base_rain = _summarize_climate_metrics(monthly)
    scen_temp, scen_rain = _summarize_climate_metrics(adjusted_monthly)

    base_plans_all = baseline_full['plans']
    scen_plans_all = scenario_full['plans']

    base_by_key = {
        tuple(p['crop_ids']): (idx + 1, p) for idx, p in enumerate(base_plans_all)
    }
    scen_by_key = {
        tuple(p['crop_ids']): (idx + 1, p) for idx, p in enumerate(scen_plans_all)
    }

    candidate_keys: list[tuple[str, ...]] = []
    for p in base_plans_all[: req.max_results]:
        k = tuple(p['crop_ids'])
        if k not in candidate_keys:
            candidate_keys.append(k)
    for p in scen_plans_all[: req.max_results]:
        k = tuple(p['crop_ids'])
        if k not in candidate_keys:
            candidate_keys.append(k)

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
                    f"water fit {water_diff:+.1f} pts ({base_plan['diagnostics']['water_compatibility']} → {scen_plan['diagnostics']['water_compatibility']})"
                )
        if not reasons:
            reasons.append('minimal change in temperature or qualitative water compatibility under these shifts')
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
