"""Preliminary Effective Rainfall Estimation using the USDA Soil Conservation Service (USDA-SCS) Monthly Method.

Implemented in FAO CROPWAT and documented in FAO Irrigation & Drainage Paper No. 25
(Dastane, N.G., 1978, Effective Rainfall in Irrigated Agriculture).
Official FAO water overview: https://www.fao.org/4/X0490E/x0490e00.htm

Formula (monthly total precipitation P_m in mm):
- If P_m <= 0.0: P_eff = 0.0
- If P_m <= 250.0 mm/month: P_eff = P_m * (125.0 - 0.2 * P_m) / 125.0
- If P_m > 250.0 mm/month:  P_eff = 125.0 + 0.1 * P_m

Physical Invariants & Limitations:
- Always satisfies 0.0 <= P_eff <= P_m.
- Preserves original precipitation totals alongside P_eff.
- Prorates partial boundary months by active crop-day ratio (overlap_days / valid_month_days)
  and caps partial-month effective rain strictly at actual precipitation received during those active days.
- Assumes generalized medium-soil infiltration without site-specific slope, soil compaction, storm intensity,
  drainage, capillary rise, or field-scale runoff measurements.
- Distinct from laboratory soil moisture and NASA MERRA-2 surface/root-zone wetness indices (GWETTOP/GWETROOT).
"""
from __future__ import annotations

import math


EFFECTIVE_RAIN_METHOD_ID = "usda_scs_monthly_cropwat"
EFFECTIVE_RAIN_METHOD_NAME = "USDA Soil Conservation Service (USDA-SCS) Monthly Method (FAO CROPWAT baseline)"


def estimate_monthly_effective_rainfall_mm(monthly_precip_mm: float | None) -> float | None:
    """Compute monthly effective rainfall [mm] from monthly total precipitation [mm].

    Returns None when monthly precipitation is missing (never equates missing to zero).
    """
    if monthly_precip_mm is None or not math.isfinite(monthly_precip_mm):
        return None
    if monthly_precip_mm < 0.0:
        return None
    if monthly_precip_mm == 0.0:
        return 0.0

    p_tot = float(monthly_precip_mm)
    if p_tot <= 250.0:
        p_eff = p_tot * ((125.0 - 0.2 * p_tot) / 125.0)
    else:
        p_eff = 125.0 + 0.1 * p_tot

    # Strict physical cap: effective rainfall can never exceed total rainfall
    return max(0.0, min(p_tot, p_eff))


def estimate_overlap_effective_rainfall_mm(
    *,
    full_month_precip_mm: float | None,
    active_window_precip_mm: float | None,
    active_valid_days: int,
    month_valid_days: int,
) -> float | None:
    """Estimate effective rainfall [mm] for active crop days overlapping a calendar month.

    If active_valid_days == month_valid_days, returns full monthly USDA-SCS Peff directly.
    For partial boundary months, prorates full-month USDA-SCS Peff by active day share and caps
    strictly at actual rainfall recorded during the active crop days (never exceeding P_active).
    """
    if (
        full_month_precip_mm is None
        or active_window_precip_mm is None
        or month_valid_days <= 0
        or active_valid_days <= 0
    ):
        return None
    full_peff = estimate_monthly_effective_rainfall_mm(full_month_precip_mm)
    if full_peff is None:
        return None
    if active_window_precip_mm <= 0.0:
        return 0.0
    if active_valid_days >= month_valid_days:
        return min(active_window_precip_mm, full_peff)

    scaled = full_peff * (active_valid_days / month_valid_days)
    return max(0.0, min(active_window_precip_mm, scaled))
