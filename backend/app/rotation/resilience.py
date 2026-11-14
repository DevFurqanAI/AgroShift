"""Historical year-by-year climate resilience analysis using actual NASA POWER monthly records.

Evaluates inter-annual variability across complete crop-season cycles (including Dec-Jan year
crossings), identifies driest and wettest historical growing windows, counts historical warm/cool/dry/excess-rain
exposures, and tracks missing years transparently without interpolation or climate forecasting.
"""
from statistics import mean, pstdev

from .catalog import Crop
from .rainfall import IRRIGATED_METHODS


def _parse_year_month(monthly: list[dict]) -> dict[tuple[int, int], dict]:
    indexed: dict[tuple[int, int], dict] = {}
    for row in monthly:
        raw_month = str(row.get('month', '')).strip()
        if len(raw_month) != 6 or not raw_month.isdigit():
            continue
        year = int(raw_month[:4])
        month = int(raw_month[4:6])
        if not 1 <= month <= 12:
            continue
        temp = row.get('temperature_c')
        rain = row.get('estimated_monthly_precipitation_mm')
        if rain is None and row.get('precipitation_mm_per_day') is not None:
            rain = float(row['precipitation_mm_per_day']) * 30.4375
        indexed[(year, month)] = {
            'temp': float(temp) if temp is not None else None,
            'rain': float(rain) if rain is not None else None,
        }
    return indexed


def _step_year_month(start_year: int, start_month: int, offset: int) -> tuple[int, int]:
    total_months = (start_year * 12 + (start_month - 1)) + offset
    return total_months // 12, (total_months % 12) + 1


def _cycle_label(start_year: int, start_month: int, duration_months: int) -> str:
    end_year, _ = _step_year_month(start_year, start_month, duration_months - 1)
    return f'{start_year}' if end_year == start_year else f'{start_year}/{str(end_year)[2:]}'


def analyze_historical_resilience(
    rotation: tuple[Crop, ...],
    season_planting_months: list[int],
    monthly: list[dict],
    irrigation_method: str | None = None,
) -> dict:
    """Analyze actual historical seasonal cycles across available years for a multi-season rotation."""
    indexed = _parse_year_month(monthly)
    if not indexed or len(rotation) != len(season_planting_months):
        return {
            'available': False,
            'years_evaluated': 0,
            'complete_precip_years': 0,
            'incomplete_years_skipped': 0,
            'year_span_label': None,
            'resilience_class': 'limited_history',
            'wettest_cycle_mm': None,
            'wettest_cycle_year': None,
            'driest_cycle_mm': None,
            'driest_cycle_year': None,
            'warm_stress_seasons_count': 0,
            'cool_stress_seasons_count': 0,
            'dry_deficit_seasons_count': 0,
            'excess_rain_seasons_count': 0,
            'season_variability': [],
            'summary': 'Insufficient year-by-year historical records to evaluate inter-annual season variability.',
            'caveat': 'Historical year-by-year screening describes past climate exposure only; it is not a seasonal forecast or yield guarantee.',
        }

    years_present = sorted({y for y, _ in indexed.keys()})
    is_irrigated = (irrigation_method or '') in IRRIGATED_METHODS

    # Precompute month offsets within the multi-season rotation timeline
    season_offsets: list[int] = []
    running_offset = 0
    for crop in rotation:
        season_offsets.append(running_offset)
        running_offset += crop.duration_months
    total_horizon_months = running_offset

    # Per-season historical series
    per_season_records: list[list[dict]] = [[] for _ in rotation]
    per_season_skipped = [0 for _ in rotation]

    complete_sequence_years: list[int] = []
    complete_sequence_rain_records: list[dict] = []
    sequence_skipped = 0

    for start_year in years_present:
        first_month = season_planting_months[0]
        seq_temp_ok = True
        seq_rain_ok = True
        seq_rain_total = 0.0

        # Evaluate each season anchored from the start_year cycle
        for s_idx, crop in enumerate(rotation):
            s_offset = season_offsets[s_idx]
            s_start_year, s_start_month = _step_year_month(start_year, first_month, s_offset)
            temps: list[float] = []
            rains: list[float] = []
            temp_ok = True
            rain_ok = True

            for i in range(crop.duration_months):
                ym = _step_year_month(s_start_year, s_start_month, i)
                entry = indexed.get(ym)
                if not entry or entry['temp'] is None:
                    temp_ok = False
                    break
                temps.append(entry['temp'])
                if entry['rain'] is None:
                    rain_ok = False
                else:
                    rains.append(entry['rain'])

            if not temp_ok:
                per_season_skipped[s_idx] += 1
                seq_temp_ok = False
                seq_rain_ok = False
                continue

            season_temp = mean(temps)
            season_peak = max(temps)
            season_rain = sum(rains) if rain_ok else None
            cycle_lbl = _cycle_label(s_start_year, s_start_month, crop.duration_months)

            heat_hit = season_temp > crop.temp_max_c or (
                crop.heat_stress_threshold_c is not None and season_peak >= crop.heat_stress_threshold_c
            )
            cool_hit = season_temp < crop.temp_min_c
            dry_hit = season_rain is not None and season_rain < (crop.seasonal_rain_min_mm * 0.75)
            excess_hit = season_rain is not None and season_rain > crop.seasonal_rain_max_mm

            per_season_records[s_idx].append({
                'cycle_label': cycle_lbl,
                'temp_mean_c': season_temp,
                'temp_peak_c': season_peak,
                'rain_mm': season_rain,
                'heat_hit': heat_hit,
                'cool_hit': cool_hit,
                'dry_hit': dry_hit,
                'excess_hit': excess_hit,
            })

            if not rain_ok or season_rain is None:
                seq_rain_ok = False
            else:
                seq_rain_total += season_rain

        if seq_temp_ok:
            complete_sequence_years.append(start_year)
            if seq_rain_ok:
                end_seq_year, _ = _step_year_month(start_year, first_month, max(0, total_horizon_months - 1))
                lbl = f'{start_year}' if end_seq_year == start_year else f'{start_year}–{end_seq_year}'
                complete_sequence_rain_records.append({
                    'year_label': lbl,
                    'rain_mm': round(seq_rain_total, 1),
                })
        else:
            sequence_skipped += 1

    # Summarize per-season stats
    season_variability: list[dict] = []
    warm_total = 0
    cool_total = 0
    dry_total = 0
    excess_total = 0

    for s_idx, crop in enumerate(rotation):
        recs = per_season_records[s_idx]
        temps = [r['temp_mean_c'] for r in recs]
        rains = [r['rain_mm'] for r in recs if r['rain_mm'] is not None]
        warm_cnt = sum(1 for r in recs if r['heat_hit'])
        cool_cnt = sum(1 for r in recs if r['cool_hit'])
        dry_cnt = sum(1 for r in recs if r['dry_hit'])
        excess_cnt = sum(1 for r in recs if r['excess_hit'])

        warm_total += warm_cnt
        cool_total += cool_cnt
        dry_total += dry_cnt
        excess_total += excess_cnt

        rain_recs = [r for r in recs if r['rain_mm'] is not None]
        wettest_s = max(rain_recs, key=lambda r: float(r['rain_mm'])) if rain_recs else None
        driest_s = min(rain_recs, key=lambda r: float(r['rain_mm'])) if rain_recs else None

        rain_cv = None
        if len(rains) >= 3 and mean(rains) >= 15.0:
            rain_cv = round((pstdev(rains) / mean(rains)) * 100.0, 1)

        temp_spread = round(max(temps) - min(temps), 1) if len(temps) >= 2 else None
        temp_sd = round(pstdev(temps), 2) if len(temps) >= 3 else None

        season_variability.append({
            'season_index': s_idx + 1,
            'crop_id': crop.id,
            'crop_name': crop.name,
            'years_evaluated': len(recs),
            'precip_years_evaluated': len(rains),
            'incomplete_years_skipped': per_season_skipped[s_idx],
            'mean_season_temp_c': round(mean(temps), 1) if temps else None,
            'min_year_temp_c': round(min(temps), 1) if temps else None,
            'max_year_temp_c': round(max(temps), 1) if temps else None,
            'temp_spread_c': temp_spread,
            'temp_sd_c': temp_sd,
            'wettest_season_mm': round(float(wettest_s['rain_mm']), 1) if wettest_s else None,
            'wettest_season_year': wettest_s['cycle_label'] if wettest_s else None,
            'driest_season_mm': round(float(driest_s['rain_mm']), 1) if driest_s else None,
            'driest_season_year': driest_s['cycle_label'] if driest_s else None,
            'precip_cv_percent': rain_cv,
            'warm_stress_years': warm_cnt,
            'cool_stress_years': cool_cnt,
            'dry_deficit_years': dry_cnt,
            'excess_rain_years': excess_cnt,
        })

    wettest_cycle = (
        max(complete_sequence_rain_records, key=lambda r: r['rain_mm'])
        if complete_sequence_rain_records
        else None
    )
    driest_cycle = (
        min(complete_sequence_rain_records, key=lambda r: r['rain_mm'])
        if complete_sequence_rain_records
        else None
    )

    # Use minimum evaluated years across seasons as conservative sample count
    min_season_years = min((sv['years_evaluated'] for sv in season_variability), default=0)
    effective_years = len(complete_sequence_years) if complete_sequence_years else min_season_years
    year_span_label = (
        f'{min(years_present)}–{max(years_present)}'
        if years_present
        else None
    )

    exposure_events = warm_total + cool_total + excess_total + (0 if is_irrigated else dry_total)
    max_possible_season_slots = max(1, sum(sv['years_evaluated'] for sv in season_variability))
    exposure_rate = exposure_events / max_possible_season_slots

    if effective_years < 3:
        resilience_class = 'limited_history'
    elif exposure_rate <= 0.15:
        resilience_class = 'consistent'
    elif exposure_rate <= 0.40:
        resilience_class = 'moderate_variability'
    else:
        resilience_class = 'high_exposure'

    # Plain-language summary
    summary_parts: list[str] = []
    if effective_years > 0:
        summary_parts.append(
            f'Evaluated {effective_years} complete historical cycle(s)'
            f"{f' ({year_span_label})' if year_span_label else ''}"
            f"{f'; {sequence_skipped} boundary/incomplete year(s) skipped' if sequence_skipped > 0 else ''}."
        )
    if wettest_cycle and driest_cycle and len(complete_sequence_rain_records) >= 2:
        summary_parts.append(
            f"Multi-season rainfall ranged from ~{driest_cycle['rain_mm']} mm "
            f"({driest_cycle['year_label']}) to ~{wettest_cycle['rain_mm']} mm ({wettest_cycle['year_label']})."
        )
    if warm_total > 0:
        summary_parts.append(f'{warm_total} historical season-year(s) exceeded upper crop thermal or heat-risk benchmarks.')
    if cool_total > 0:
        summary_parts.append(f'{cool_total} historical season-year(s) fell below crop optimal minimum temperature.')
    if dry_total > 0:
        mitigation = (
            f" (mitigated locally when {irrigation_method.replace('_', ' ')} supply is reliable)"
            if is_irrigated and irrigation_method
            else ' under rainfed screening'
        )
        summary_parts.append(
            f'{dry_total} historical season-year(s) received less than 75% of coarse seasonal crop rainfall reference{mitigation}.'
        )
    if excess_total > 0:
        summary_parts.append(f'{excess_total} historical season-year(s) exceeded upper seasonal rainfall reference (waterlogging/disease check).')
    if effective_years >= 3 and warm_total == 0 and cool_total == 0 and dry_total == 0 and excess_total == 0:
        summary_parts.append('No extreme thermal or seasonal precipitation outliers crossed coarse crop bounds in available years.')

    return {
        'available': effective_years > 0 or any(sv['years_evaluated'] > 0 for sv in season_variability),
        'years_evaluated': effective_years,
        'complete_precip_years': len(complete_sequence_rain_records),
        'incomplete_years_skipped': sequence_skipped,
        'year_span_label': year_span_label,
        'resilience_class': resilience_class,
        'wettest_cycle_mm': wettest_cycle['rain_mm'] if wettest_cycle else None,
        'wettest_cycle_year': wettest_cycle['year_label'] if wettest_cycle else None,
        'driest_cycle_mm': driest_cycle['rain_mm'] if driest_cycle else None,
        'driest_cycle_year': driest_cycle['year_label'] if driest_cycle else None,
        'warm_stress_seasons_count': warm_total,
        'cool_stress_seasons_count': cool_total,
        'dry_deficit_seasons_count': dry_total,
        'excess_rain_seasons_count': excess_total,
        'season_variability': season_variability,
        'summary': ' '.join(summary_parts) if summary_parts else 'Historical year-by-year climate coverage was limited.',
        'caveat': (
            'Summarizes historical NASA POWER year-to-year variability only; gridded records miss localized '
            'hail, frost nights, and intra-month dry spells, and past cycles do not forecast future seasons.'
        ),
    }
