"""FastAPI routes for Phase 4W NASA Water Intelligence & Crop Water Requirements."""
from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException

from .engine import WATER_AVAILABILITY_DISCLOSURE, WATER_METHODOLOGY_LIMITATIONS, evaluate_water_comparison
from .models import WaterCompareRequest
from .nasa_daily import NASADailyError

router = APIRouter(prefix="/api/v1/water", tags=["water"])
logger = logging.getLogger("agroshift.water.routes")


@router.post("/compare")
def compare_rotation_water(req: WaterCompareRequest):
    """Compare FAO-56 crop water demand, effective rainfall, and preliminary deficit across rotation plans."""
    try:
        return evaluate_water_comparison(req)
    except NASADailyError as exc:
        logger.warning("NASA POWER daily meteorology unavailable (%s): %s", exc.kind, exc)
        if exc.kind == "invalid_range" or exc.kind == "invalid_coordinates":
            raise HTTPException(status_code=422, detail=str(exc)) from exc
        return {
            "status": "data_unavailable",
            "data_available": False,
            "error_kind": exc.kind,
            "message": str(exc),
            "historical_not_forecast": True,
            "plans": [],
            "comparison": {
                "status": "data_unavailable",
                "comparable_plan_count": 0,
                "common_comparable_years": [],
                "common_comparable_years_count": 0,
            },
            "farm_water_context": {
                "cultivated_area_ha": req.cultivated_area_ha,
                "volume_unit": "m3" if req.cultivated_area_ha else None,
                "water_availability_confirmed": False,
                "water_availability_note": WATER_AVAILABILITY_DISCLOSURE,
            },
            "limitations": WATER_METHODOLOGY_LIMITATIONS,
        }
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except Exception as exc:
        logger.exception("Unexpected Phase 4W water comparison failure")
        raise HTTPException(
            status_code=503,
            detail="Water intelligence comparison is temporarily unavailable. Please retry shortly.",
        ) from exc
