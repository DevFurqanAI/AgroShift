"""Explainable prototype planner for *screening*, not verified agricultural recommendations."""
from collections import defaultdict
from itertools import product
from statistics import mean
from .catalog import CROPS, CATALOG_NOTE
from .models import RotationRequest

WATER_RANK = {'low': 1, 'medium': 2, 'high': 3}
GOAL_WEIGHTS = {
    'water': {'climate': .30, 'water': .40, 'soil': .15, 'diversity': .15},
    'soil': {'climate': .25, 'water': .20, 'soil': .35, 'diversity': .20},
    'diversity': {'climate': .25, 'water': .20, 'soil': .20, 'diversity': .35},
    'climate': {'climate': .45, 'water': .20, 'soil': .15, 'diversity': .20},
}

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
    return {m: {'temp': mean(temps[m]) if temps[m] else None,
                'rain': mean(rain[m]) if rain[m] else None,
                'n_temp': len(temps[m]), 'n_rain': len(rain[m])} for m in range(1,13)}

def calculate_plan(req: RotationRequest, monthly: list[dict], source: str):
    if not monthly:
        return {'status':'insufficient_data','data_available':False,'plans':[], 'message':'No historical climate observations were available. No rotation scores were calculated.', 'climate_source':source}
    climate = _climate_by_calendar_month(monthly)
    if sum(x['temp'] is not None for x in climate.values()) < 10:
        return {'status':'insufficient_data','data_available':False,'plans':[], 'message':'At least 10 calendar months with valid historical temperatures are required for initial screening.', 'climate_source':source}
    selected = sorted(set(req.candidate_crop_ids)) if req.candidate_crop_ids is not None else sorted(CROPS)
    unknown = [c for c in selected if c not in CROPS]
    if unknown or req.previous_crop not in CROPS:
        return {'status':'invalid_crops','data_available':bool(monthly),'plans':[], 'message':f'Unknown crop IDs: {unknown + ([req.previous_crop] if req.previous_crop not in CROPS else [])}', 'climate_source':source}
    crops = [CROPS[c] for c in selected]
    ranking = []
    for rotation in product(crops, repeat=req.seasons):
        previous = CROPS[req.previous_crop]
        month = req.planting_month
        details = []
        for crop in rotation:
            period = [((month - 1 + i) % 12) + 1 for i in range(crop.duration_months)]
            records = [climate[m] for m in period]
            # Require actual climate information for each crop's intended calendar months.
            if any(r['temp'] is None for r in records):
                break
            temp = mean(r['temp'] for r in records)
            temperature_fit = 100.0 if crop.temp_min_c <= temp <= crop.temp_max_c else max(0.0, 100 - 15 * min(abs(temp-crop.temp_min_c), abs(temp-crop.temp_max_c)))
            water_gap = max(0, WATER_RANK[crop.water_demand] - WATER_RANK[req.water_availability])
            water_fit = max(0, 100 - 35 * water_gap)
            soil_fit = None if req.soil_ph is None else (100.0 if crop.ph_min <= req.soil_ph <= crop.ph_max else max(0.0, 100 - 30 * min(abs(req.soil_ph-crop.ph_min), abs(req.soil_ph-crop.ph_max))))
            diversity_fit = 100 if crop.family != previous.family else 30
            # Do not conflate diversity with proven soil health improvement.
            components = {'climate':temperature_fit,'water':water_fit,'diversity':diversity_fit}
            if soil_fit is not None: components['soil'] = soil_fit
            weights = GOAL_WEIGHTS[req.goal]
            total = sum(components[k]*weights[k] for k in components)/sum(weights[k] for k in components)
            details.append({'crop_id':crop.id,'name':crop.name,'planting_month':month,
                            'duration_months':crop.duration_months,'avg_historical_temperature_c':round(temp,2),
                            'temperature_fit_score':round(temperature_fit,1),'water_category':crop.water_demand,
                            'water_compatibility_score':round(water_fit,1),
                            'soil_ph_compatibility_score':round(soil_fit,1) if soil_fit is not None else None,
                            'family_diversity_score':diversity_fit,'screening_score':round(total,1)})
            month = ((month - 1 + crop.duration_months) % 12)+1
            previous = crop
        if len(details) == req.seasons:
            score = mean(d['screening_score'] for d in details)
            # Minor whole-plan bonus for varied crop families; does not model soil health.
            distinct = len(set(c.family for c in rotation))
            score = min(100, score + 2 * (distinct - 1))
            ranking.append({'crop_ids':[c.id for c in rotation], 'score':round(score,1),
                            'seasons':details,'explanation':'Illustrative compatibility screening only; does not predict yield, profit, or soil improvements.'})
    ranking.sort(key=lambda p:(-p['score'],p['crop_ids']))
    # Avoid near-duplicate solutions where feasible.
    chosen, seen = [], set()
    for plan in ranking:
        if tuple(plan['crop_ids']) in seen: continue
        chosen.append(plan);seen.add(tuple(plan['crop_ids']))
        if len(chosen) >= req.max_results: break
    return {'status':'ok' if chosen else 'insufficient_data', 'data_available':bool(chosen),
            'plans':chosen,'climate_source':source,'historical_not_forecast':True,
            'method':'Transparent rule-based prototype screening; weights and crop thresholds require regional validation.',
            'catalog_warning':CATALOG_NOTE,
            'limitations':['Crop growth windows are approximate; planting month must be verified locally.',
                           'Historical temperature alone is not a future forecast.',
                           'Rainfall is not used as a validated crop water-supply estimate; farmer water category is qualitative.',
                           'Soil pH is optional; missing soil pH receives no fabricated score.',
                           'Yield, economics, pests, soil nutrients and local regulations are not modeled.'],
            'message':None if chosen else 'Insufficient monthly observations to evaluate proposed planting windows.'}
