"""Rotation screening endpoints (not validated farm-specific recommendations)."""
import logging
from fastapi import APIRouter, HTTPException
from .catalog import CROPS, CATALOG_NOTE
from .engine import calculate_plan, calculate_scenario_comparison
from .models import RotationRequest, ScenarioRotationRequest
from .sources import get_all_catalog_sources
from app.nasa_power import fetch_climate_summary, NASAClimateError

router = APIRouter(prefix='/api/v1/rotation', tags=['rotation'])
logger = logging.getLogger(__name__)


def _resolve_climate_series(req: RotationRequest) -> tuple[list[dict] | None, str, dict | None]:
    if req.climate_monthly is not None:
        return [m.model_dump() for m in req.climate_monthly], 'user_supplied_climate_series_unverified', None
    try:
        data = fetch_climate_summary(req.latitude, req.longitude, req.start_year, req.end_year)['monthly']
        return data, 'NASA POWER historical gridded observations', None
    except NASAClimateError as exc:
        logger.warning('Rotation planner climate unavailable: %s', exc)
        return None, 'NASA POWER', {
            'status': 'insufficient_data',
            'data_available': False,
            'plans': [],
            'message': 'Historical NASA climate data are temporarily unavailable; no scores were generated.',
            'climate_source': 'NASA POWER',
        }
    except Exception:
        logger.exception('Unexpected climate provider failure in rotation planner')
        return None, 'NASA POWER', {
            'status': 'insufficient_data',
            'data_available': False,
            'plans': [],
            'message': 'Historical climate service is temporarily unavailable; no scores were generated.',
            'climate_source': 'NASA POWER',
        }


@router.get('/crops')
def crops():
    return {
        'crops': [CROPS[k].public() for k in sorted(CROPS)],
        'catalog_warning': CATALOG_NOTE,
        'sources': get_all_catalog_sources(),
    }

@router.post('/plan')
def rotation_plan(req: RotationRequest):
    data, source, err_payload = _resolve_climate_series(req)
    if err_payload is not None or data is None:
        return err_payload
    try:
        return calculate_plan(req, data, source)
    except Exception:
        logger.exception('Rotation screening failed')
        raise HTTPException(status_code=503, detail='Rotation screening is temporarily unavailable. Please retry later.')


@router.post('/scenario')
def rotation_scenario(req: ScenarioRotationRequest):
    data, source, err_payload = _resolve_climate_series(req)
    if err_payload is not None or data is None:
        return {
            'status': 'insufficient_data',
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
                'water_shift_note': 'Unavailable because baseline climate records could not be loaded.',
            },
            'climate_metrics': None,
            'baseline_plans': [],
            'scenario_plans': [],
            'comparisons': [],
            'disclaimer': 'Sensitivity screening only — not a weather forecast or yield prediction.',
            'message': err_payload.get('message') if err_payload else 'Historical climate data unavailable.',
        }
    try:
        return calculate_scenario_comparison(req, data, source)
    except Exception:
        logger.exception('Scenario comparison failed')
        raise HTTPException(status_code=503, detail='Scenario comparison is temporarily unavailable. Please retry later.')
