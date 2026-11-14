"""FAO-56 Water Intelligence & Multi-Season Rotation Water Comparison Engine (Phase 4W).

Distinguishes:
1. Atmospheric water demand (FAO-56 Penman-Monteith daily ET0, mm)
2. Crop evapotranspiration (FAO-56 single Kc curve ETc = Kc * ET0, mm)
3. Historical precipitation (NASA POWER PRECTOTCORR, mm)
4. Estimated effective rainfall (USDA-SCS monthly CROPWAT method, mm)
5. Preliminary net irrigation deficit (monthly-step sum of max(0, ETc - Peff), mm & optional m3)
6. Actual farmer water availability (cannot be confirmed from weather data alone)

Never fabricates Kc values, weather days, elevation, field soil moisture, or irrigation sufficiency.
"""
from __future__ import annotations

import calendar
from collections import defaultdict
from dataclasses import replace
from datetime import date, timedelta
import math
from statistics import mean
from typing import Any

from app.rotation.catalog import CROPS
from app.rotation.sources import get_water_sources

from .crop_coefficients import (
    CropKcProfile,
    adjust_kc_end_fao56,
    adjust_kc_mid_fao56,
    build_daily_kc_curve,
    get_crop_kc_profile,
)
from .effective_rainfall import (
    EFFECTIVE_RAIN_METHOD_ID,
    EFFECTIVE_RAIN_METHOD_NAME,
    estimate_overlap_effective_rainfall_mm,
)
from .fao56_et0 import calculate_daily_fao56_et0, saturation_vapour_pressure_kpa
from .models import DailyWeatherDayInput, WaterCompareRequest, WaterPlanInput, WaterSeasonInput
from .nasa_daily import (
    NASADailyError,
    _clean_value,
    fetch_nasa_daily_weather,
    resolve_complete_historical_window,
)

MIN_MONTHLY_COVERAGE_RATIO = 0.85
MIN_SEASON_COVERAGE_RATIO = 0.85

WATER_AVAILABILITY_DISCLOSURE = (
    "Estimated crop water demand is available, but actual irrigation sufficiency cannot be determined "
    "from the information provided."
)

PADDY_RICE_CAVEAT = (
    "Rice water figures reflect FAO-56 open-field evapotranspiration (ETc) only and exclude paddy land "
    "preparation/puddling water (~150-250 mm typical) and bund seepage or deep percolation losses."
)

WATER_METHODOLOGY_LIMITATIONS = [
    "Historical climate baseline only: summarizes past NASA POWER daily meteorology and does not forecast future rainfall or drought.",
    "Atmospheric demand (ET0) and crop evapotranspiration (ETc) assume non-stressed, well-watered standard FAO-56 canopy conditions without site soil-water stress coefficients (Ks).",
    "USDA-SCS monthly effective rainfall provides a generalized medium-soil screening estimate; it does not simulate daily soil water storage, slope runoff, storm intensity, drainage, or shallow water-table rise.",
    "Monthly-step deficit prevents wet-month rainfall surpluses from cancelling dry-month shortfalls, yet sub-monthly dry spells or soil carry-over between months are not modeled.",
    "Net irrigation deficit excludes irrigation application/conveyance efficiency losses, leaching requirements, and actual groundwater or canal water allocations.",
    "NASA SMAP soil moisture and GPM IMERG precipitation are intentionally deferred due to NASA Earthdata token requirements, satellite latency, and surface-only 5 cm SMAP depth limits.",
]


def _scale_profile_to_months(profile: CropKcProfile, duration_months: int | None) -> tuple[CropKcProfile, bool]:
    """Use exact FAO Table 11 days unless caller requests a materially different duration_months."""
    if duration_months is None:
        return profile, False
    cat_crop = CROPS.get(profile.crop_id)
    if cat_crop is not None and duration_months == cat_crop.duration_months:
        return profile, False

    target_days = max(30, round(duration_months * 30.4375))
    orig_total = max(1, profile.total_days)
    if abs(target_days - orig_total) <= 10:
        return profile, False

    l_ini = max(5, round(profile.l_ini * target_days / orig_total))
    l_dev = max(5, round(profile.l_dev * target_days / orig_total))
    l_mid = max(10, round(profile.l_mid * target_days / orig_total))
    l_late = max(5, target_days - (l_ini + l_dev + l_mid))
    scaled = replace(profile, l_ini=l_ini, l_dev=l_dev, l_mid=l_mid, l_late=l_late)
    return scaled, True


def _add_months(year: int, month: int, delta_months: int) -> tuple[int, int]:
    idx = (year * 12 + (month - 1)) + delta_months
    return idx // 12, (idx % 12) + 1


def _next_season_start_date(
    *,
    prev_start_year: int,
    prev_start_month: int,
    prev_end_date: date,
    prev_nominal_months: int,
    requested_month: int,
) -> date:
    """Resolve non-overlapping chronological start date (Day 1 of planting_month) across year boundaries."""
    nom_y, nom_m = _add_months(prev_start_year, prev_start_month, prev_nominal_months)
    if nom_m == requested_month:
        candidate = date(nom_y, nom_m, 1)
        return max(candidate, prev_end_date + timedelta(days=1))

    y, m = prev_end_date.year, prev_end_date.month
    for offset in range(0, 14):
        cy, cm = _add_months(y, m, offset)
        if cm != requested_month:
            continue
        candidate = date(cy, cm, 1)
        if candidate > prev_end_date:
            return candidate
    # Fallback safeguard (unreachable within 14-month scan)
    return prev_end_date + timedelta(days=1)


def _normalize_supplied_daily_weather(
    rows: list[DailyWeatherDayInput],
    *,
    latitude: float,
    longitude: float,
    start_year: int | None,
    end_year: int | None,
    elevation_m: float | None,
) -> dict[str, Any]:
    """Validate and convert deterministic caller-supplied daily weather records without fabrication."""
    parsed_days: list[dict[str, Any]] = []
    years_found: set[int] = set()
    for item in rows:
        try:
            dt = date.fromisoformat(item.date)
        except ValueError:
            continue
        t_max = _clean_value(item.t2m_max_c, None, -80.0, 65.0)
        t_min = _clean_value(item.t2m_min_c, None, -80.0, 65.0)
        t_mean = _clean_value(item.t2m_c, None, -80.0, 65.0)
        if t_max is not None and t_min is not None and t_max < t_min:
            t_max = None
            t_min = None
        t_dew = _clean_value(item.t2m_dew_c, None, -85.0, 50.0)
        if t_dew is not None and t_max is not None and t_dew > t_max + 2.0:
            t_dew = None
        rh = _clean_value(item.rh2m_percent, None, 0.0, 100.0)
        ws = _clean_value(item.ws2m_ms, None, 0.0, 75.0)
        sw = _clean_value(item.solar_radiation_mj_m2_day, None, 0.0, 50.0)
        precip = _clean_value(item.precip_mm_day, None, 0.0, 1500.0)
        ps = _clean_value(item.surface_pressure_kpa, None, 30.0, 110.0)

        years_found.add(dt.year)
        parsed_days.append({
            "date": dt.isoformat(),
            "date_obj": dt,
            "t2m_c": t_mean,
            "t2m_max_c": t_max,
            "t2m_min_c": t_min,
            "rh2m_percent": rh,
            "t2m_dew_c": t_dew,
            "ws2m_ms": ws,
            "solar_radiation_mj_m2_day": sw,
            "precip_mm_day": precip,
            "surface_pressure_kpa": ps,
        })

    if not parsed_days:
        raise NASADailyError("No valid daily meteorological records provided.", kind="nodata")

    inferred_start = start_year if start_year is not None else min(years_found)
    inferred_end = end_year if end_year is not None else max(years_found)
    filtered = [d for d in parsed_days if inferred_start <= d["date_obj"].year <= inferred_end]
    if not filtered:
        raise NASADailyError("No daily weather records fall inside requested year range.", kind="nodata")

    return {
        "source": "user_supplied_daily_weather_unverified",
        "source_url": None,
        "api_version": None,
        "is_verified_nasa_observation": False,
        "location": {
            "latitude": latitude,
            "longitude": longitude,
            "elevation_m": elevation_m,
            "elevation_source": "caller_supplied_elevation" if elevation_m is not None else None,
        },
        "start_year": inferred_start,
        "end_year": inferred_end,
        "includes_partial_current_year": False,
        "days": sorted(filtered, key=lambda d: d["date_obj"]),
    }


def _precompute_daily_et0_and_months(
    *,
    days: list[dict[str, Any]],
    latitude: float,
    elevation_m: float | None,
) -> tuple[dict[date, dict[str, Any]], dict[tuple[int, int], dict[str, Any]], dict[str, Any]]:
    """Compute FAO-56 daily ET0 once across all days and aggregate full-month precipitation coverage."""
    day_index: dict[date, dict[str, Any]] = {}
    month_buckets: dict[tuple[int, int], list[dict[str, Any]]] = defaultdict(list)

    valid_et0_days = 0
    valid_precip_days = 0
    pressure_sources: set[str] = set()
    ea_methods: set[str] = set()

    for row in days:
        dt: date = row["date_obj"]
        et0_res = calculate_daily_fao56_et0(
            latitude=latitude,
            day_date=dt,
            t_max_c=row.get("t2m_max_c"),
            t_min_c=row.get("t2m_min_c"),
            wind_speed_ms=row.get("ws2m_ms"),
            solar_radiation_mj_m2_day=row.get("solar_radiation_mj_m2_day"),
            rh_mean_percent=row.get("rh2m_percent"),
            t_dew_c=row.get("t2m_dew_c"),
            surface_pressure_kpa=row.get("surface_pressure_kpa"),
            elevation_m=elevation_m,
        )
        if et0_res["available"]:
            valid_et0_days += 1
            pressure_sources.add(et0_res["pressure_source"])
            ea_methods.add(et0_res["ea_method"])

        precip = row.get("precip_mm_day")
        if precip is not None:
            valid_precip_days += 1

        # Approximate daily RHmin from ea / e0(Tmax) for FAO-56 Eq. 62/65 when hourly RHmin unavailable
        rh_min_approx: float | None = None
        if et0_res.get("available") and row.get("t2m_max_c") is not None:
            e0_tmax = saturation_vapour_pressure_kpa(float(row["t2m_max_c"]))
            if e0_tmax > 0:
                rh_min_approx = max(5.0, min(100.0, 100.0 * float(et0_res["ea_kpa"]) / e0_tmax))

        enriched = {
            "date": dt,
            "weather": row,
            "et0": et0_res,
            "rh_min_approx": rh_min_approx,
        }
        day_index[dt] = enriched
        month_buckets[(dt.year, dt.month)].append(enriched)

    monthly_precip_index: dict[tuple[int, int], dict[str, Any]] = {}
    for (yr, mo), rows_in_month in month_buckets.items():
        cal_days = calendar.monthrange(yr, mo)[1]
        precips = [r["weather"]["precip_mm_day"] for r in rows_in_month if r["weather"]["precip_mm_day"] is not None]
        n_valid_p = len(precips)
        if n_valid_p > 0 and (n_valid_p / cal_days) >= MIN_MONTHLY_COVERAGE_RATIO:
            full_p = sum(precips) * (cal_days / n_valid_p)
            monthly_precip_index[(yr, mo)] = {
                "available": True,
                "full_month_precip_mm": full_p,
                "valid_days": n_valid_p,
                "calendar_days": cal_days,
            }
        else:
            monthly_precip_index[(yr, mo)] = {
                "available": False,
                "full_month_precip_mm": None,
                "valid_days": n_valid_p,
                "calendar_days": cal_days,
            }

    stats = {
        "total_days_loaded": len(days),
        "valid_et0_days": valid_et0_days,
        "valid_precip_days": valid_precip_days,
        "pressure_sources": sorted(pressure_sources),
        "ea_methods": sorted(ea_methods),
    }
    return day_index, monthly_precip_index, stats


def _evaluate_plan_cycle_year(
    *,
    plan: WaterPlanInput,
    profiles: list[tuple[CropKcProfile, bool]],
    cycle_start_year: int,
    window_start_date: date,
    window_end_date: date,
    day_index: dict[date, dict[str, Any]],
    monthly_precip_index: dict[tuple[int, int], dict[str, Any]],
    apply_kc_adjustment: bool,
) -> dict[str, Any]:
    """Evaluate a complete multi-season rotation cycle anchored at cycle_start_year."""
    season_spans: list[dict[str, Any]] = []
    prev_end: date | None = None
    prev_start_year = cycle_start_year
    prev_start_month = plan.seasons[0].planting_month
    prev_nominal_months = 4

    for idx, season_in in enumerate(plan.seasons):
        profile, duration_scaled = profiles[idx]
        if idx == 0:
            s_start = date(cycle_start_year, season_in.planting_month, 1)
            gap_days = 0
        else:
            assert prev_end is not None
            s_start = _next_season_start_date(
                prev_start_year=prev_start_year,
                prev_start_month=prev_start_month,
                prev_end_date=prev_end,
                prev_nominal_months=prev_nominal_months,
                requested_month=season_in.planting_month,
            )
            gap_days = max(0, (s_start - prev_end).days - 1)

        s_end = s_start + timedelta(days=profile.total_days - 1)
        cat_crop = CROPS.get(profile.crop_id)
        nominal_months = (
            season_in.duration_months
            if season_in.duration_months is not None
            else (cat_crop.duration_months if cat_crop is not None else max(1, round(profile.total_days / 30)))
        )

        season_spans.append({
            "season_index": idx + 1,
            "crop_id": profile.crop_id,
            "crop_name": profile.crop_name,
            "profile": profile,
            "duration_scaled": duration_scaled,
            "planting_month": season_in.planting_month,
            "start_date": s_start,
            "end_date": s_end,
            "gap_days_before": gap_days,
        })
        prev_end = s_end
        prev_start_year = s_start.year
        prev_start_month = s_start.month
        prev_nominal_months = nominal_months

    cycle_start = season_spans[0]["start_date"]
    cycle_end = season_spans[-1]["end_date"]
    if cycle_start < window_start_date or cycle_end > window_end_date:
        return {
            "complete": False,
            "reason": "outside_historical_window",
            "cycle_start_year": cycle_start_year,
        }

    season_results: list[dict[str, Any]] = []
    for span in season_spans:
        profile: CropKcProfile = span["profile"]
        s_start: date = span["start_date"]
        n_days = profile.total_days

        # Gather daily records in exact calendar order
        daily_records: list[dict[str, Any] | None] = [
            day_index.get(s_start + timedelta(days=d_idx)) for d_idx in range(n_days)
        ]

        valid_et0_count = sum(1 for r in daily_records if r is not None and r["et0"]["available"])
        valid_precip_count = sum(
            1 for r in daily_records if r is not None and r["weather"]["precip_mm_day"] is not None
        )
        if (valid_et0_count / n_days) < MIN_SEASON_COVERAGE_RATIO or (
            valid_precip_count / n_days
        ) < MIN_SEASON_COVERAGE_RATIO:
            return {
                "complete": False,
                "reason": "insufficient_season_daily_coverage",
                "cycle_start_year": cycle_start_year,
            }

        # Optional FAO-56 Eq. 62 / Eq. 65 climate adjustment on Kc_mid and Kc_end
        kc_mid_used = profile.kc_mid
        kc_end_used = profile.kc_end
        if apply_kc_adjustment:
            mid_start = profile.l_ini + profile.l_dev
            mid_end = mid_start + profile.l_mid
            late_start = mid_end

            mid_u2 = [
                r["et0"]["u2_ms"]
                for r in daily_records[mid_start:mid_end]
                if r is not None and r["et0"]["available"]
            ]
            mid_rhmin = [
                r["rh_min_approx"]
                for r in daily_records[mid_start:mid_end]
                if r is not None and r["rh_min_approx"] is not None
            ]
            if mid_u2 and mid_rhmin:
                kc_mid_used = adjust_kc_mid_fao56(
                    profile.kc_mid,
                    profile.max_height_m,
                    mean(mid_u2),
                    mean(mid_rhmin),
                )

            late_u2 = [
                r["et0"]["u2_ms"]
                for r in daily_records[late_start:]
                if r is not None and r["et0"]["available"]
            ]
            late_rhmin = [
                r["rh_min_approx"]
                for r in daily_records[late_start:]
                if r is not None and r["rh_min_approx"] is not None
            ]
            if late_u2 and late_rhmin:
                kc_end_used = adjust_kc_end_fao56(
                    profile.kc_end,
                    profile.max_height_m,
                    mean(late_u2),
                    mean(late_rhmin),
                )

        kc_curve = build_daily_kc_curve(profile, kc_mid_override=kc_mid_used, kc_end_override=kc_end_used)

        # Group active crop days by calendar month so wet-month excess NEVER offsets dry-month deficit
        month_groups: dict[tuple[int, int], list[tuple[float, dict[str, Any] | None]]] = defaultdict(list)
        for d_idx in range(n_days):
            cur_dt = s_start + timedelta(days=d_idx)
            month_groups[(cur_dt.year, cur_dt.month)].append((kc_curve[d_idx], daily_records[d_idx]))

        s_et0_mm = 0.0
        s_etc_mm = 0.0
        s_precip_mm = 0.0
        s_peff_mm = 0.0
        s_deficit_mm = 0.0
        s_excess_rain_mm = 0.0
        monthly_slices: list[dict[str, Any]] = []

        for ym in sorted(month_groups.keys()):
            slice_items = month_groups[ym]
            slice_days = len(slice_items)
            et0_vals = [(kc, r["et0"]["et0_mm_day"]) for kc, r in slice_items if r is not None and r["et0"]["available"]]
            p_vals = [r["weather"]["precip_mm_day"] for _, r in slice_items if r is not None and r["weather"]["precip_mm_day"] is not None]

            if (len(et0_vals) / slice_days) < MIN_MONTHLY_COVERAGE_RATIO or (
                len(p_vals) / slice_days
            ) < MIN_MONTHLY_COVERAGE_RATIO:
                return {
                    "complete": False,
                    "reason": "insufficient_monthly_overlap_coverage",
                    "cycle_start_year": cycle_start_year,
                }

            full_month_meta = monthly_precip_index.get(ym)
            if not full_month_meta or not full_month_meta["available"]:
                return {
                    "complete": False,
                    "reason": "insufficient_full_month_precip_for_usda_scs",
                    "cycle_start_year": cycle_start_year,
                }

            et0_scale = slice_days / len(et0_vals)
            p_scale = slice_days / len(p_vals)

            m_et0 = sum(et0_val for _, et0_val in et0_vals) * et0_scale
            m_etc = sum(kc * et0_val for kc, et0_val in et0_vals) * et0_scale
            m_precip = sum(p_vals) * p_scale

            m_peff = estimate_overlap_effective_rainfall_mm(
                full_month_precip_mm=full_month_meta["full_month_precip_mm"],
                active_window_precip_mm=m_precip,
                active_valid_days=slice_days,
                month_valid_days=full_month_meta["calendar_days"],
            )
            if m_peff is None:
                return {
                    "complete": False,
                    "reason": "effective_rainfall_unavailable",
                    "cycle_start_year": cycle_start_year,
                }

            m_deficit = max(0.0, m_etc - m_peff)
            m_excess = max(0.0, m_peff - m_etc)

            s_et0_mm += m_et0
            s_etc_mm += m_etc
            s_precip_mm += m_precip
            s_peff_mm += m_peff
            s_deficit_mm += m_deficit
            s_excess_rain_mm += m_excess

            monthly_slices.append({
                "year_month": f"{ym[0]:04d}-{ym[1]:02d}",
                "active_days": slice_days,
                "et0_mm": round(m_et0, 1),
                "etc_mm": round(m_etc, 1),
                "precip_mm": round(m_precip, 1),
                "effective_rainfall_mm": round(m_peff, 1),
                "preliminary_deficit_mm": round(m_deficit, 1),
            })

        season_results.append({
            "season_index": span["season_index"],
            "crop_id": profile.crop_id,
            "crop_name": profile.crop_name,
            "planting_month": span["planting_month"],
            "start_date": span["start_date"].isoformat(),
            "end_date": span["end_date"].isoformat(),
            "cycle_days": n_days,
            "gap_days_before": span["gap_days_before"],
            "kc_ini": profile.kc_ini,
            "kc_mid_table": profile.kc_mid,
            "kc_mid_used": kc_mid_used,
            "kc_end_table": profile.kc_end,
            "kc_end_used": kc_end_used,
            "et0_mm": round(s_et0_mm, 1),
            "etc_mm": round(s_etc_mm, 1),
            "precip_mm": round(s_precip_mm, 1),
            "effective_rainfall_mm": round(s_peff_mm, 1),
            "preliminary_deficit_mm": round(s_deficit_mm, 1),
            "non_offsetting_excess_rain_mm": round(s_excess_rain_mm, 1),
            "monthly_slices": monthly_slices,
        })

    return {
        "complete": True,
        "cycle_start_year": cycle_start_year,
        "cycle_start_date": cycle_start.isoformat(),
        "cycle_end_date": cycle_end.isoformat(),
        "total_crop_days": sum(s["cycle_days"] for s in season_results),
        "total_turnaround_gap_days": sum(s["gap_days_before"] for s in season_results),
        "et0_mm": round(sum(s["et0_mm"] for s in season_results), 1),
        "etc_mm": round(sum(s["etc_mm"] for s in season_results), 1),
        "precip_mm": round(sum(s["precip_mm"] for s in season_results), 1),
        "effective_rainfall_mm": round(sum(s["effective_rainfall_mm"] for s in season_results), 1),
        "preliminary_deficit_mm": round(sum(s["preliminary_deficit_mm"] for s in season_results), 1),
        "non_offsetting_excess_rain_mm": round(sum(s["non_offsetting_excess_rain_mm"] for s in season_results), 1),
        "seasons": season_results,
    }


def _mm_to_volume_m3(depth_mm: float | None, area_ha: float | None) -> float | None:
    if depth_mm is None or area_ha is None or area_ha <= 0.0:
        return None
    # 1 mm over 1 hectare = 10 m^3
    return round(depth_mm * area_ha * 10.0, 1)


def _aggregate_plan_over_years(
    *,
    plan: WaterPlanInput,
    profiles: list[tuple[CropKcProfile, bool]],
    cycles_by_year: dict[int, dict[str, Any]],
    selected_years: list[int],
    incomplete_years: list[int],
    area_ha: float | None,
) -> dict[str, Any]:
    selected_cycles = [cycles_by_year[y] for y in selected_years if y in cycles_by_year]
    n_years = len(selected_cycles)

    et0_vals = [c["et0_mm"] for c in selected_cycles]
    etc_vals = [c["etc_mm"] for c in selected_cycles]
    p_vals = [c["precip_mm"] for c in selected_cycles]
    peff_vals = [c["effective_rainfall_mm"] for c in selected_cycles]
    def_vals = [c["preliminary_deficit_mm"] for c in selected_cycles]

    mean_et0 = round(mean(et0_vals), 1)
    mean_etc = round(mean(etc_vals), 1)
    mean_p = round(mean(p_vals), 1)
    mean_peff = round(mean(peff_vals), 1)
    mean_def = round(mean(def_vals), 1)

    rainfall_share_pct = round(min(100.0, (mean_peff / mean_etc) * 100.0), 1) if mean_etc > 0 else None

    season_summaries: list[dict[str, Any]] = []
    for s_idx, season_in in enumerate(plan.seasons):
        profile, duration_scaled = profiles[s_idx]
        s_cycles = [c["seasons"][s_idx] for c in selected_cycles]
        s_et0 = round(mean(s["et0_mm"] for s in s_cycles), 1)
        s_etc = round(mean(s["etc_mm"] for s in s_cycles), 1)
        s_p = round(mean(s["precip_mm"] for s in s_cycles), 1)
        s_peff = round(mean(s["effective_rainfall_mm"] for s in s_cycles), 1)
        s_def = round(mean(s["preliminary_deficit_mm"] for s in s_cycles), 1)
        s_kc_mid = round(mean(s["kc_mid_used"] for s in s_cycles), 3)
        s_kc_end = round(mean(s["kc_end_used"] for s in s_cycles), 3)

        season_summaries.append({
            "season_index": s_idx + 1,
            "crop_id": profile.crop_id,
            "crop_name": profile.crop_name,
            "planting_month": season_in.planting_month,
            "cycle_days": profile.total_days,
            "duration_scaled_from_catalog_override": duration_scaled,
            "gap_days_before": s_cycles[0]["gap_days_before"],
            "evidence_status": profile.evidence_status,
            "requires_paddy_water_adjustment": profile.requires_paddy_water_adjustment,
            "kc_ini": profile.kc_ini,
            "kc_mid_table": profile.kc_mid,
            "kc_mid_mean_used": s_kc_mid,
            "kc_end_table": profile.kc_end,
            "kc_end_mean_used": s_kc_end,
            "stage_days": {
                "initial": profile.l_ini,
                "development": profile.l_dev,
                "mid_season": profile.l_mid,
                "late_season": profile.l_late,
            },
            "fao_table12_reference": profile.fao_table12_reference,
            "fao_table11_reference": profile.fao_table11_reference,
            "limitations_note": profile.limitations_note,
            "mean_et0_mm": s_et0,
            "mean_etc_mm": s_etc,
            "mean_precip_mm": s_p,
            "mean_effective_rainfall_mm": s_peff,
            "mean_preliminary_deficit_mm": s_def,
            "deficit_range_mm": {
                "min": round(min(s["preliminary_deficit_mm"] for s in s_cycles), 1),
                "max": round(max(s["preliminary_deficit_mm"] for s in s_cycles), 1),
            },
            "volume_m3": {
                "etc_m3": _mm_to_volume_m3(s_etc, area_ha),
                "effective_rainfall_m3": _mm_to_volume_m3(s_peff, area_ha),
                "preliminary_deficit_m3": _mm_to_volume_m3(s_def, area_ha),
            },
        })

    preliminary_crops = [p.crop_id for p, _ in profiles if p.evidence_status == "preliminary"]
    has_paddy = any(p.requires_paddy_water_adjustment for p, _ in profiles)
    evidence_status = "preliminary" if preliminary_crops else "verified"

    return {
        "plan_id": plan.plan_id,
        "label": plan.label,
        "is_current_practice": plan.is_current_practice,
        "available": True,
        "status": "ok",
        "evidence_status": evidence_status,
        "preliminary_kc_crops": preliminary_crops,
        "missing_kc_crops": [],
        "has_paddy_rice_caveat": has_paddy,
        "paddy_rice_note": PADDY_RICE_CAVEAT if has_paddy else None,
        "crop_ids": [s.crop_id for s in plan.seasons],
        "crop_names": [p.crop_name for p, _ in profiles],
        "comparable_years_used": selected_years,
        "comparable_years_count": n_years,
        "all_complete_years_count": len(cycles_by_year),
        "incomplete_years_skipped": incomplete_years,
        "total_crop_days": sum(p.total_days for p, _ in profiles),
        "total_turnaround_gap_days": selected_cycles[0]["total_turnaround_gap_days"],
        "totals_mean_mm": {
            "et0_mm": mean_et0,
            "etc_mm": mean_etc,
            "precip_mm": mean_p,
            "effective_rainfall_mm": mean_peff,
            "preliminary_deficit_mm": mean_def,
        },
        "ranges_mm": {
            "etc_min": round(min(etc_vals), 1),
            "etc_max": round(max(etc_vals), 1),
            "precip_min": round(min(p_vals), 1),
            "precip_max": round(max(p_vals), 1),
            "deficit_min": round(min(def_vals), 1),
            "deficit_max": round(max(def_vals), 1),
        },
        "effective_rainfall_etc_share_percent": rainfall_share_pct,
        "volumes_mean_m3": {
            "area_ha": round(area_ha, 3) if area_ha is not None else None,
            "et0_m3": _mm_to_volume_m3(mean_et0, area_ha),
            "etc_m3": _mm_to_volume_m3(mean_etc, area_ha),
            "precip_m3": _mm_to_volume_m3(mean_p, area_ha),
            "effective_rainfall_m3": _mm_to_volume_m3(mean_peff, area_ha),
            "preliminary_deficit_m3": _mm_to_volume_m3(mean_def, area_ha),
        },
        "seasons": season_summaries,
        "yearly_cycles": [
            {
                "cycle_start_year": c["cycle_start_year"],
                "cycle_start_date": c["cycle_start_date"],
                "cycle_end_date": c["cycle_end_date"],
                "et0_mm": c["et0_mm"],
                "etc_mm": c["etc_mm"],
                "precip_mm": c["precip_mm"],
                "effective_rainfall_mm": c["effective_rainfall_mm"],
                "preliminary_deficit_mm": c["preliminary_deficit_mm"],
            }
            for c in selected_cycles
        ],
    }


def evaluate_water_comparison(req: WaterCompareRequest) -> dict[str, Any]:
    """Run FAO-56 Penman-Monteith water balance comparison across 1..6 competing rotation plans."""
    if req.daily_weather is not None:
        weather_bundle = _normalize_supplied_daily_weather(
            req.daily_weather,
            latitude=req.latitude,
            longitude=req.longitude,
            start_year=req.start_year,
            end_year=req.end_year,
            elevation_m=req.elevation_m,
        )
    else:
        resolved_start, resolved_end, _ = resolve_complete_historical_window(req.start_year, req.end_year)
        weather_bundle = fetch_nasa_daily_weather(
            req.latitude,
            req.longitude,
            resolved_start,
            resolved_end,
        )
        weather_bundle["is_verified_nasa_observation"] = True

    elevation_m = (
        req.elevation_m
        if req.elevation_m is not None
        else weather_bundle.get("location", {}).get("elevation_m")
    )
    days = weather_bundle["days"]
    window_start_date = days[0]["date_obj"]
    window_end_date = days[-1]["date_obj"]
    start_year = weather_bundle["start_year"]
    end_year = weather_bundle["end_year"]

    # Shared daily ET0 + monthly precip coverage across all plans in this request
    day_index, monthly_precip_index, daily_stats = _precompute_daily_et0_and_months(
        days=days,
        latitude=req.latitude,
        elevation_m=elevation_m,
    )

    candidate_cycle_years = list(range(start_year, end_year + 1))

    # First pass: resolve crop Kc profiles & per-year cycles per plan
    per_plan_evaluated: list[dict[str, Any]] = []
    comparable_year_sets: list[set[int]] = []

    for plan in req.plans:
        missing_crops: list[str] = []
        profiles: list[tuple[CropKcProfile, bool]] = []
        for s in plan.seasons:
            prof = get_crop_kc_profile(s.crop_id)
            if prof is None:
                missing_crops.append(s.crop_id)
            else:
                profiles.append(_scale_profile_to_months(prof, s.duration_months))

        if missing_crops:
            per_plan_evaluated.append({
                "plan": plan,
                "missing_crops": list(dict.fromkeys(missing_crops)),
                "profiles": [],
                "cycles_by_year": {},
                "incomplete_years": [],
            })
            continue

        cycles_by_year: dict[int, dict[str, Any]] = {}
        incomplete_years: list[int] = []
        for yr in candidate_cycle_years:
            res = _evaluate_plan_cycle_year(
                plan=plan,
                profiles=profiles,
                cycle_start_year=yr,
                window_start_date=window_start_date,
                window_end_date=window_end_date,
                day_index=day_index,
                monthly_precip_index=monthly_precip_index,
                apply_kc_adjustment=req.apply_fao56_climate_kc_adjustment,
            )
            if res["complete"]:
                cycles_by_year[yr] = res
            else:
                incomplete_years.append(yr)

        per_plan_evaluated.append({
            "plan": plan,
            "missing_crops": [],
            "profiles": profiles,
            "cycles_by_year": cycles_by_year,
            "incomplete_years": incomplete_years,
        })
        if cycles_by_year:
            comparable_year_sets.append(set(cycles_by_year.keys()))

    # Equal historical period alignment across all comparable plans
    plans_with_kc = [p for p in per_plan_evaluated if not p["missing_crops"]]
    if plans_with_kc and len(comparable_year_sets) == len(plans_with_kc):
        common_years = sorted(set.intersection(*comparable_year_sets))
    else:
        common_years = []

    min_required_years = 1 if start_year == end_year else 2
    comparison_ready = len(plans_with_kc) > 0 and len(common_years) >= min_required_years

    plan_outputs: list[dict[str, Any]] = []
    for entry in per_plan_evaluated:
        plan: WaterPlanInput = entry["plan"]
        if entry["missing_crops"]:
            plan_outputs.append({
                "plan_id": plan.plan_id,
                "label": plan.label,
                "is_current_practice": plan.is_current_practice,
                "available": False,
                "status": "unavailable_crop_kc",
                "evidence_status": "unavailable",
                "preliminary_kc_crops": [],
                "missing_kc_crops": entry["missing_crops"],
                "has_paddy_rice_caveat": False,
                "paddy_rice_note": None,
                "crop_ids": [s.crop_id for s in plan.seasons],
                "crop_names": [s.crop_id for s in plan.seasons],
                "comparable_years_used": [],
                "comparable_years_count": 0,
                "all_complete_years_count": 0,
                "incomplete_years_skipped": [],
                "total_crop_days": None,
                "total_turnaround_gap_days": None,
                "totals_mean_mm": None,
                "ranges_mm": None,
                "effective_rainfall_etc_share_percent": None,
                "volumes_mean_m3": None,
                "seasons": [],
                "yearly_cycles": [],
                "message": (
                    f"Crop coefficient (Kc) data is not verified in AgroShift for: {', '.join(entry['missing_crops'])}. "
                    "ETc and irrigation deficit were not fabricated."
                ),
            })
            continue

        if not comparison_ready:
            plan_outputs.append({
                "plan_id": plan.plan_id,
                "label": plan.label,
                "is_current_practice": plan.is_current_practice,
                "available": False,
                "status": "insufficient_comparable_data",
                "evidence_status": "unavailable",
                "preliminary_kc_crops": [p.crop_id for p, _ in entry["profiles"] if p.evidence_status == "preliminary"],
                "missing_kc_crops": [],
                "has_paddy_rice_caveat": any(p.requires_paddy_water_adjustment for p, _ in entry["profiles"]),
                "paddy_rice_note": None,
                "crop_ids": [s.crop_id for s in plan.seasons],
                "crop_names": [p.crop_name for p, _ in entry["profiles"]],
                "comparable_years_used": common_years,
                "comparable_years_count": len(common_years),
                "all_complete_years_count": len(entry["cycles_by_year"]),
                "incomplete_years_skipped": entry["incomplete_years"],
                "total_crop_days": sum(p.total_days for p, _ in entry["profiles"]),
                "total_turnaround_gap_days": None,
                "totals_mean_mm": None,
                "ranges_mm": None,
                "effective_rainfall_etc_share_percent": None,
                "volumes_mean_m3": None,
                "seasons": [],
                "yearly_cycles": [],
                "message": (
                    "Insufficient comparable data: fewer than "
                    f"{min_required_years} complete aligned historical cycle years share valid NASA POWER observations across plans."
                ),
            })
            continue

        plan_outputs.append(
            _aggregate_plan_over_years(
                plan=plan,
                profiles=entry["profiles"],
                cycles_by_year=entry["cycles_by_year"],
                selected_years=common_years,
                incomplete_years=entry["incomplete_years"],
                area_ha=req.cultivated_area_ha,
            )
        )

    available_plans = [p for p in plan_outputs if p["available"]]
    comparison_summary: dict[str, Any]
    if comparison_ready and available_plans:
        lowest_def = min(available_plans, key=lambda p: p["totals_mean_mm"]["preliminary_deficit_mm"])
        lowest_etc = min(available_plans, key=lambda p: p["totals_mean_mm"]["etc_mm"])
        current_plan = next((p for p in available_plans if p["is_current_practice"]), None)

        baseline_delta = None
        if current_plan is not None and len(available_plans) > 1:
            alternatives = [p for p in available_plans if p["plan_id"] != current_plan["plan_id"]]
            best_alt = min(alternatives, key=lambda p: p["totals_mean_mm"]["preliminary_deficit_mm"])
            def_diff = round(
                best_alt["totals_mean_mm"]["preliminary_deficit_mm"]
                - current_plan["totals_mean_mm"]["preliminary_deficit_mm"],
                1,
            )
            etc_diff = round(
                best_alt["totals_mean_mm"]["etc_mm"] - current_plan["totals_mean_mm"]["etc_mm"],
                1,
            )
            curr_def = current_plan["totals_mean_mm"]["preliminary_deficit_mm"]
            def_pct = round((def_diff / curr_def) * 100.0, 1) if curr_def > 0 else None
            baseline_delta = {
                "current_plan_id": current_plan["plan_id"],
                "current_plan_label": current_plan["label"],
                "compared_plan_id": best_alt["plan_id"],
                "compared_plan_label": best_alt["label"],
                "deficit_delta_mm": def_diff,
                "deficit_delta_percent": def_pct,
                "etc_delta_mm": etc_diff,
                "deficit_delta_m3": _mm_to_volume_m3(def_diff, req.cultivated_area_ha),
                "note": (
                    "Historical average difference over identical aligned cycle years; not a guaranteed water saving."
                ),
            }

        comparison_summary = {
            "status": "ok",
            "comparable_plan_count": len(available_plans),
            "common_comparable_years": common_years,
            "common_comparable_years_count": len(common_years),
            "lowest_deficit_plan_id": lowest_def["plan_id"],
            "lowest_deficit_plan_label": lowest_def["label"],
            "lowest_deficit_mm": lowest_def["totals_mean_mm"]["preliminary_deficit_mm"],
            "lowest_etc_plan_id": lowest_etc["plan_id"],
            "lowest_etc_plan_label": lowest_etc["label"],
            "lowest_etc_mm": lowest_etc["totals_mean_mm"]["etc_mm"],
            "baseline_comparison": baseline_delta,
        }
    else:
        comparison_summary = {
            "status": "insufficient_comparable_data",
            "comparable_plan_count": len(available_plans),
            "common_comparable_years": common_years,
            "common_comparable_years_count": len(common_years),
            "lowest_deficit_plan_id": None,
            "lowest_deficit_plan_label": None,
            "lowest_deficit_mm": None,
            "lowest_etc_plan_id": None,
            "lowest_etc_plan_label": None,
            "lowest_etc_mm": None,
            "baseline_comparison": None,
            "message": "Insufficient comparable data across competing rotation plans.",
        }

    overall_status = "ok" if comparison_ready else "insufficient_comparable_data"
    has_any_paddy = any(p.get("has_paddy_rice_caveat") for p in plan_outputs)

    return {
        "status": overall_status,
        "data_available": daily_stats["valid_et0_days"] > 0,
        "historical_not_forecast": True,
        "meteorology": {
            "source": weather_bundle["source"],
            "source_url": weather_bundle.get("source_url"),
            "api_version": weather_bundle.get("api_version"),
            "is_verified_nasa_observation": weather_bundle.get("is_verified_nasa_observation", False),
            "start_year": start_year,
            "end_year": end_year,
            "includes_partial_current_year": weather_bundle.get("includes_partial_current_year", False),
            "location": {
                "latitude": req.latitude,
                "longitude": req.longitude,
                "elevation_m": elevation_m,
                "elevation_source": (
                    "caller_supplied_elevation"
                    if req.elevation_m is not None
                    else weather_bundle.get("location", {}).get("elevation_source")
                ),
            },
            "coverage": daily_stats,
        },
        "methods": {
            "et0_method": "FAO-56 Penman-Monteith daily equation (Paper No. 56, Eq. 6)",
            "kc_method": (
                "FAO-56 single crop coefficient piecewise curve (Tables 11 & 12"
                + ("; Eq. 62/65 climate adjustment applied)" if req.apply_fao56_climate_kc_adjustment else ")")
            ),
            "effective_rainfall_method_id": EFFECTIVE_RAIN_METHOD_ID,
            "effective_rainfall_method": EFFECTIVE_RAIN_METHOD_NAME,
            "deficit_step": "monthly_step_non_carrying",
            "representative_planting_day_assumption": "Day 1 of each selected planting month",
        },
        "farm_water_context": {
            "cultivated_area_ha": round(req.cultivated_area_ha, 3) if req.cultivated_area_ha is not None else None,
            "volume_unit": "m3" if req.cultivated_area_ha is not None else None,
            "volume_conversion_note": (
                f"Converted using 1 mm = 10 m³/ha across {round(req.cultivated_area_ha, 3)} ha of explicitly provided cultivated area."
                if req.cultivated_area_ha is not None
                else "Volume in m³ is omitted because cultivated field area (ha) was not provided or confirmed."
            ),
            "irrigation_method": req.irrigation_method,
            "reported_water_availability": req.water_availability,
            "water_availability_confirmed": False,
            "water_availability_note": WATER_AVAILABILITY_DISCLOSURE,
        },
        "comparison": comparison_summary,
        "plans": plan_outputs,
        "paddy_rice_caveat": PADDY_RICE_CAVEAT if has_any_paddy else None,
        "limitations": WATER_METHODOLOGY_LIMITATIONS,
        "sources": get_water_sources(uses_nasa_daily=weather_bundle.get("is_verified_nasa_observation", False)),
    }
