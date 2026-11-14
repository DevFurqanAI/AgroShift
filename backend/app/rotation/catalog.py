"""Prototype crop catalog. Thresholds are illustrative screening assumptions, NOT local agronomic advice.

A country/variety/planting-calendar verified catalog must replace these before farmer-facing use.
"""
from dataclasses import dataclass, asdict

@dataclass(frozen=True)
class Crop:
    id: str
    name: str
    family: str
    water_demand: str  # low / medium / high - relative qualitative category
    ph_min: float
    ph_max: float
    temp_min_c: float
    temp_max_c: float
    duration_months: int

    def public(self):
        return asdict(self)

CROPS = {c.id: c for c in [
    Crop('wheat','Wheat','poaceae','medium',6.0,7.5,10,25,5),
    Crop('rice','Rice','poaceae','high',5.5,7.0,22,35,5),
    Crop('maize','Maize','poaceae','medium',5.8,7.5,18,32,4),
    Crop('sorghum','Sorghum','poaceae','low',5.5,8.0,22,35,4),
    Crop('millet','Pearl millet','poaceae','low',5.5,8.0,22,35,4),
    Crop('soybean','Soybean','fabaceae','medium',6.0,7.5,18,30,4),
    Crop('chickpea','Chickpea','fabaceae','low',6.0,8.0,12,25,4),
    Crop('lentil','Lentil','fabaceae','low',6.0,8.0,10,25,4),
    Crop('cowpea','Cowpea','fabaceae','low',5.5,7.5,20,35,3),
    Crop('potato','Potato','solanaceae','medium',5.0,6.5,12,23,4),
    Crop('tomato','Tomato','solanaceae','medium',6.0,7.0,18,30,4),
    Crop('sunflower','Sunflower','asteraceae','medium',6.0,7.8,17,32,4),
    Crop('cotton','Cotton','malvaceae','high',5.8,8.0,20,35,6),
    Crop('canola','Canola','brassicaceae','medium',5.5,7.5,10,25,4),
]}
CATALOG_NOTE = 'Screening-only example thresholds. Not locally validated by variety or region; verify with local agronomic sources before use.'
