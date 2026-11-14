"""Multi-season crop rotation feasibility evaluator and timeline builder.

Checks seasonal window alignment, Dec/Jan year-crossings, turnaround continuity,
family/disease succession cautions, and honest rejection of demonstrably impossible timings.
Never rejects uncertain/unverified regions merely for lacking a regional calendar.
"""
from .calendars import evaluate_crop_planting_window
from .catalog import Crop

MONTH_SHORT = ('Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec')


def format_month_span(start_month: int, duration_months: int) -> dict:
    end_month = ((start_month - 1 + duration_months - 1) % 12) + 1
    wraps_year = (start_month - 1 + duration_months - 1) >= 12
    label = f"{MONTH_SHORT[start_month - 1]}–{MONTH_SHORT[end_month - 1]}"
    if wraps_year:
        label += ' (crosses Dec–Jan)'
    return {
        'start_month': start_month,
        'end_month': end_month,
        'wraps_year': wraps_year,
        'window_label': label,
    }


def evaluate_sequence_feasibility(
    rotation: tuple[Crop, ...],
    prev_crop: Crop,
    initial_planting_month: int,
    calendar_context: dict,
    strict_verified_calendar: bool = False,
) -> dict:
    """Assess whether a multi-season sequence is temporally & agronomically feasible.

    When strict_verified_calendar is True (explicit verified country supplied) and one or more crops
    are demonstrably off-season in verified regional windows, marks feasibility as 'infeasible'.
    When location is unverified, marks timing 'uncertain' rather than auto-rejecting.
    """
    season_checks: list[dict] = []
    calendar_scores: list[float] = []
    warnings: list[str] = []
    rejection_reasons: list[str] = []

    month = initial_planting_month
    prev_id = prev_crop.id
    prev_family = prev_crop.family
    total_duration = 0

    for idx, crop in enumerate(rotation, start=1):
        span = format_month_span(month, crop.duration_months)
        cal_eval = evaluate_crop_planting_window(
            crop_id=crop.id,
            planting_month=month,
            duration_months=crop.duration_months,
            calendar_context=calendar_context,
        )
        if cal_eval['score'] is not None:
            calendar_scores.append(cal_eval['score'])

        if cal_eval['status'] == 'off_season':
            msg = (
                f"Season {idx} ({crop.name} in {MONTH_SHORT[month - 1]}): {cal_eval['note']}"
            )
            if strict_verified_calendar and calendar_context.get('verified'):
                rejection_reasons.append(msg)
            else:
                warnings.append(msg)
        elif cal_eval['status'] == 'shoulder_window':
            warnings.append(f"Season {idx} ({crop.name}): {cal_eval['note']}")
        elif cal_eval['status'] == 'crop_not_in_regional_calendar':
            warnings.append(f"Season {idx} ({crop.name}): {cal_eval['note']}")

        # Direct succession checks (e.g. consecutive Solanaceae disease bridge or cotton monoculture)
        if crop.id == prev_id and crop.family in ('solanaceae', 'malvaceae'):
            warnings.append(
                f"Season {idx} repeats {crop.name} immediately after {crop.name}, risking carry-over soil-borne pests/pathogens."
            )
        elif crop.family == 'solanaceae' and prev_family == 'solanaceae':
            warnings.append(
                f"Season {idx} follows a Solanaceae crop ({prev_id} → {crop.id}), elevating shared blight/nematode carryover risk."
            )

        season_checks.append({
            'season_index': idx,
            'crop_id': crop.id,
            'crop_name': crop.name,
            'planting_month': month,
            'harvest_month': span['end_month'],
            'duration_months': crop.duration_months,
            'wraps_year': span['wraps_year'],
            'window_label': span['window_label'],
            'local_season_name': cal_eval['matched_season_name'],
            'calendar_status': cal_eval['status'],
            'calendar_verified': cal_eval['verified'],
            'calendar_evidence_tier': cal_eval.get('evidence_tier', 'verified' if cal_eval['verified'] else 'unverified'),
            'calendar_score': cal_eval['score'],
            'calendar_note': cal_eval['note'],
        })

        total_duration += crop.duration_months
        month = ((month - 1 + crop.duration_months) % 12) + 1
        prev_id = crop.id
        prev_family = crop.family

    # Multi-season cycle length vs planning slots: e.g. 2 long 6-mo crops = 12 mo leaves 0 turnaround gap.
    if total_duration == len(rotation) * 6:
        warnings.append(
            f"Back-to-back {total_duration}-month total cycle leaves virtually zero turnaround days between harvest and sowing."
        )

    verified_season_count = sum(1 for sc in season_checks if sc['calendar_verified'])
    all_seasons_verified = len(season_checks) == len(rotation) and verified_season_count == len(rotation)
    unverified_crop_ids = [
        sc['crop_id'] for sc in season_checks if sc['calendar_status'] == 'crop_not_in_regional_calendar'
    ]
    has_off_season = any(sc['calendar_status'] == 'off_season' for sc in season_checks)

    if rejection_reasons:
        status = 'infeasible'
        regional_timing_evidence = 'verified'
    elif not calendar_context.get('verified'):
        status = 'uncertain_unverified'
        regional_timing_evidence = 'unverified'
    elif verified_season_count == 0:
        status = 'unverified_crop_timing'
        regional_timing_evidence = 'unverified'
    elif has_off_season:
        status = 'off_season_warning'
        regional_timing_evidence = 'conditional'
    elif not all_seasons_verified:
        status = 'conditional_partial_calendar'
        regional_timing_evidence = 'conditional'
    elif calendar_context.get('evidence_status') == 'inferred_from_coordinates':
        status = 'feasible_with_cautions'
        regional_timing_evidence = 'conditional'
    elif warnings:
        status = 'feasible_with_cautions'
        regional_timing_evidence = 'verified'
    else:
        status = 'feasible'
        regional_timing_evidence = 'verified'

    timeline_summary = ' → '.join(
        f"S{sc['season_index']}: {sc['crop_name']} ({sc['window_label']})"
        for sc in season_checks
    )

    return {
        'status': status,
        'is_feasible': status != 'infeasible',
        'regional_timing_evidence': regional_timing_evidence,
        'verified_calendar_seasons': verified_season_count,
        'total_seasons': len(rotation),
        'unverified_crop_ids': unverified_crop_ids,
        'total_cycle_months': total_duration,
        'season_checks': season_checks,
        # Never treat partial crop calendar coverage as a complete sequence calendar score
        'calendar_score': round(sum(calendar_scores) / len(calendar_scores), 1) if all_seasons_verified and calendar_scores else None,
        'calendar_evaluated': all_seasons_verified,
        'timeline_summary': timeline_summary,
        'warnings': warnings,
        'rejection_reasons': rejection_reasons,
    }
