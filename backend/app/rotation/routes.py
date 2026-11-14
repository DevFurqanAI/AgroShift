"""Rotation screening endpoints (not validated farm-specific recommendations)."""
import logging
from fastapi import APIRouter, HTTPException
from .catalog import CROPS, CATALOG_NOTE
from .engine import calculate_plan
from .models import RotationRequest
from app.nasa_power import fetch_climate_summary, NASAClimateError

router = APIRouter(prefix='/api/v1/rotation', tags=['rotation'])
logger = logging.getLogger(__name__)

@router.get('/crops')
def crops():
    return {'crops':[CROPS[k].public() for k in sorted(CROPS)], 'catalog_warning':CATALOG_NOTE}

@router.post('/plan')
def rotation_plan(req: RotationRequest):
    if req.climate_monthly is not None:
        data = [m.model_dump() for m in req.climate_monthly]
        source = 'user_supplied_climate_series_unverified'
    else:
        try:
            data = fetch_climate_summary(req.latitude,req.longitude,req.start_year,req.end_year)['monthly']
            source = 'NASA POWER historical gridded observations'
        except NASAClimateError as exc:
            logger.warning('Rotation planner climate unavailable: %s',exc)
            return {'status':'insufficient_data','data_available':False,'plans':[],
                    'message':'Historical NASA climate data are temporarily unavailable; no scores were generated.',
                    'climate_source':'NASA POWER'}
        except Exception:
            logger.exception('Unexpected climate provider failure in rotation planner')
            return {'status':'insufficient_data','data_available':False,'plans':[],
                    'message':'Historical climate service is temporarily unavailable; no scores were generated.',
                    'climate_source':'NASA POWER'}
    try:
        return calculate_plan(req,data,source)
    except Exception:
        logger.exception('Rotation screening failed')
        raise HTTPException(status_code=503, detail='Rotation screening is temporarily unavailable. Please retry later.')
