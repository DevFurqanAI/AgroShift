"""NASA POWER historical rainfall intelligence for rotation screening.

Uses NASA POWER monthly precipitation estimates (`estimated_monthly_precipitation_mm` in mm/month
and `precipitation_mm_per_day` in mm/day). Reports seasonal distribution, inter-annual variability,
and growing-window rainfall alongside crop water-demand screening.
Does NOT compute FAO-56 Penman-Monteith ET0, CROPWAT schedules, effective rainfall, or irrigation volumes.
"""
from collections import defaultdict
from statistics import mean, pstdev

from .catalog import Crop

WATER_RANK = {'low': 1, 'medium': 2, 'high': 3}
IRRIGATED_METHODS = {'drip', 'sprinkler', 'furrow_surface', 'canal_flood', 'center_pivot'}


def summarize_monthly_rainfall(monthly: list[dict]) -> dict:
    """Extract monthly means, daily rates, inter-annual CV, and wettest/driest 3-month seasonal contrast."""
    rain_by_month: dict[int, list[float]] = defaultdict(list)
    rate_by_month: dict[int, list[float]] = defaultdict(list)

    for row in monthly:
        try:
            m = int(str(row.get('month', ''))[4:6])
        except (ValueError, TypeError):
            continue
        if not 1 <= m <= 12:
            continue

        est_mm = row.get('estimated_monthly_precipitation_mm')
        mm_day = row.get('precipitation_mm_per_day')

        # Handle series where only precipitation_mm_per_day was supplied (convert via ~30.44 days conservatively)
        if est_mm is None and mm_day is not None:
            est_mm = float(mm_day) * 30.4375

        if est_mm is not None:
            rain_by_month[m].append(float(est_mm))
        if mm_day is not None:
            rate_by_month[m].append(float(mm_day))

    months_summary: dict[int, dict] = {}
    for m in range(1, 13):
        vals = rain_by_month.get(m, [])
        rates = rate_by_month.get(m, [])
        avg_mm = mean(vals) if vals else None
        cv_pct = None
        if len(vals) >= 3 and avg_mm is not None and avg_mm >= 5.0:
            cv_pct = round((pstdev(vals) / avg_mm) * 100.0, 1)
        months_summary[m] = {
            'mean_mm': round(avg_mm, 1) if avg_mm is not None else None,
            'mean_mm_per_day': round(mean(rates), 2) if rates else None,
            'cv_percent': cv_pct,
            'n_years': len(vals),
        }

    valid_months = [m for m in range(1, 13) if months_summary[m]['mean_mm'] is not None]
    if len(valid_months) < 6:
        return {
            'rainfall_available': False,
            'months': months_summary,
            'annual_mean_mm': None,
            'wettest_3mo_mm': None,
            'driest_3mo_mm': None,
            'wettest_3mo_months': [],
            'driest_3mo_months': [],
            'seasonal_contrast_note': 'Insufficient monthly precipitation history to characterize seasonal rainfall.',
        }

    # Annual sum over available months (scaled only when all 12 months exist)
    annual_mean_mm = (
        round(sum(months_summary[m]['mean_mm'] for m in range(1, 13)), 1)
        if len(valid_months) == 12
        else None
    )

    best_3_start, best_3_val = None, -1.0
    worst_3_start, worst_3_val = None, 1e12
    for start in range(1, 13):
        tri = [((start - 1 + i) % 12) + 1 for i in range(3)]
        if all(months_summary[m]['mean_mm'] is not None for m in tri):
            total_3 = sum(months_summary[m]['mean_mm'] for m in tri)
            if total_3 > best_3_val:
                best_3_val = total_3
                best_3_start = tri
            if total_3 < worst_3_val:
                worst_3_val = total_3
                worst_3_start = tri

    contrast_note = 'Historical monthly rainfall varies little across the year.'
    if best_3_start and worst_3_start:
        if worst_3_val <= 15.0 and best_3_val >= 120.0:
            contrast_note = (
                f"Strong dry-vs-wet seasonal contrast: wettest 3 months avg ~{round(best_3_val)} mm "
                f"vs. driest 3 months ~{round(worst_3_val)} mm."
            )
        elif best_3_val > worst_3_val * 2.5:
            contrast_note = (
                f"Distinct wet and dry seasons: wettest 3 months ~{round(best_3_val)} mm vs. "
                f"driest 3 months ~{round(worst_3_val)} mm."
            )
        else:
            contrast_note = (
                f"Moderate seasonal spread: wettest 3 months ~{round(best_3_val)} mm vs. "
                f"driest 3 months ~{round(worst_3_val)} mm."
            )

    return {
        'rainfall_available': True,
        'months': months_summary,
        'annual_mean_mm': annual_mean_mm,
        'wettest_3mo_mm': round(best_3_val, 1) if best_3_start else None,
        'driest_3mo_mm': round(worst_3_val, 1) if worst_3_start else None,
        'wettest_3mo_months': best_3_start or [],
        'driest_3mo_months': worst_3_start or [],
        'seasonal_contrast_note': contrast_note,
    }


def evaluate_crop_water_and_rainfall(
    crop: Crop,
    period_months: list[int],
    farm_water_availability: str,
    goal: str,
    rainfall_summary: dict,
    irrigation_method: str | None = None,
) -> dict:
    """Evaluate water compatibility using farmer water tier + NASA POWER seasonal rainfall (when present)."""
    # 1. Qualitative farmer water-availability base fit (unchanged core semantics)
    gap = WATER_RANK[crop.water_demand] - WATER_RANK[farm_water_availability]
    if gap >= 2:
        base_water_score = 12.0 if goal == 'water' else 22.0
    elif gap == 1:
        base_water_score = 48.0 if goal == 'water' else 58.0
    elif goal == 'water':
        base_water_score = {'low': 100.0, 'medium': 82.0, 'high': 64.0}[crop.water_demand]
    elif gap == 0:
        base_water_score = 96.0
    elif gap == -1:
        base_water_score = 91.0
    else:
        base_water_score = 85.0

    # 2. Growing-window historical NASA POWER rainfall calculation
    months_map = rainfall_summary.get('months', {})
    period_entries = [months_map.get(m) for m in period_months]
    has_period_rain = bool(rainfall_summary.get('rainfall_available')) and all(
        e and e.get('mean_mm') is not None for e in period_entries
    )

    if not has_period_rain:
        return {
            'score': round(base_water_score, 1),
            'rainfall_evaluated': False,
            'season_rainfall_mm': None,
            'season_avg_mm_per_day': None,
            'variability_level': 'unknown',
            'variability_cv_percent': None,
            'rainfall_fit_status': 'rainfall_unavailable',
            'note': 'Historical precipitation unavailable for one or more months; scored from farmer water category only.',
        }

    season_rain_mm = round(sum(e['mean_mm'] for e in period_entries), 1)
    daily_rates = [e['mean_mm_per_day'] for e in period_entries if e.get('mean_mm_per_day') is not None]
    season_mm_day = round(mean(daily_rates), 2) if daily_rates else None
    cvs = [e['cv_percent'] for e in period_entries if e.get('cv_percent') is not None]
    avg_cv = round(mean(cvs), 1) if cvs else None

    if avg_cv is None:
        variability_level = 'insufficient_years'
    elif avg_cv >= 50.0:
        variability_level = 'high'
    elif avg_cv >= 25.0:
        variability_level = 'moderate'
    else:
        variability_level = 'low'

    is_irrigated = (irrigation_method or '') in IRRIGATED_METHODS
    rain_min = crop.seasonal_rain_min_mm
    rain_max = crop.seasonal_rain_max_mm

    # Classify total growing-window precipitation vs. coarse screening reference range
    if season_rain_mm < rain_min * 0.65:
        rain_fit_status = 'deficit_under_rainfed'
        rain_score = 28.0 if not is_irrigated else 74.0
    elif season_rain_mm < rain_min:
        rain_fit_status = 'marginal_rainfall'
        rain_score = 62.0 if not is_irrigated else 82.0
    elif season_rain_mm <= rain_max:
        rain_fit_status = 'adequate_historical_rainfall'
        rain_score = 92.0
    else:
        rain_fit_status = 'excess_moisture_caution'
        rain_score = 52.0 if crop.waterlogging_sensitivity == 'high' else 72.0

    # Blend farmer water availability & observed NASA POWER rainfall honestly:
    # Rainfed systems rely strongly on seasonal rainfall; irrigated systems remain governed primarily by supply reliability.
    if is_irrigated:
        blended = 0.80 * base_water_score + 0.20 * rain_score
        rain_role_note = (
            f"Growing-window NASA POWER rainfall averages ~{season_rain_mm} mm ({crop.duration_months} mo); "
            f"with irrigation ({irrigation_method.replace('_', ' ')}), supplemental water buffers rainfall gaps."
        )
    else:
        blended = 0.55 * base_water_score + 0.45 * rain_score
        if rain_fit_status == 'deficit_under_rainfed':
            rain_role_note = (
                f"Growing-window rainfall (~{season_rain_mm} mm) is below coarse rainfed reference (~{rain_min}+ mm) "
                f"for {crop.name}; supplemental irrigation or a lower-water crop would reduce moisture risk."
            )
        elif rain_fit_status == 'excess_moisture_caution':
            rain_role_note = (
                f"High historical rainfall (~{season_rain_mm} mm) during the window warrants drainage/disease checks for {crop.name}."
            )
        else:
            rain_role_note = (
                f"Historical seasonal rainfall (~{season_rain_mm} mm) falls within general rainfed screening bounds (~{rain_min}–{rain_max} mm); "
                'not effective rainfall or evapotranspiration.'
            )

    if variability_level == 'high' and not is_irrigated:
        blended = max(0.0, blended - 4.0)
        rain_role_note += f" Inter-annual rainfall variability is high (CV ~{avg_cv}%)."

    return {
        'score': round(max(0.0, min(100.0, blended)), 1),
        'rainfall_evaluated': True,
        'season_rainfall_mm': season_rain_mm,
        'season_avg_mm_per_day': season_mm_day,
        'variability_level': variability_level,
        'variability_cv_percent': avg_cv,
        'rainfall_fit_status': rain_fit_status,
        'note': rain_role_note,
    }
