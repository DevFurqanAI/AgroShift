"""Prototype crop catalog with documented screening parameters and soil-response traits.

Thresholds are general screening ranges grounded in global agronomic references (not cultivar-specific local advice).
"""
from dataclasses import asdict, dataclass


@dataclass(frozen=True)
class Crop:
    id: str
    name: str
    family: str
    water_demand: str  # low / medium / high — qualitative screening category
    ph_min: float
    ph_max: float
    temp_min_c: float
    temp_max_c: float
    duration_months: int
    is_legume: bool = False
    residue_profile: str = 'moderate'  # low / moderate / high surface residue persistence
    rooting_depth_class: str = 'medium'  # shallow / medium / deep
    waterlogging_sensitivity: str = 'moderate'  # low / moderate / high
    salinity_tolerance: str = 'moderate'  # sensitive / moderate / tolerant
    seasonal_rain_min_mm: int = 250  # coarse screening rainfall reference over cycle (not ETc)
    seasonal_rain_max_mm: int = 1200

    def public(self) -> dict:
        return asdict(self)


CROPS = {
    c.id: c
    for c in [
        Crop(
            'wheat', 'Wheat', 'poaceae', 'medium', 6.0, 7.5, 10, 25, 5,
            is_legume=False, residue_profile='high', rooting_depth_class='medium',
            waterlogging_sensitivity='moderate', salinity_tolerance='moderate',
            seasonal_rain_min_mm=300, seasonal_rain_max_mm=900,
        ),
        Crop(
            'rice', 'Rice', 'poaceae', 'high', 5.5, 7.0, 22, 35, 5,
            is_legume=False, residue_profile='high', rooting_depth_class='shallow',
            waterlogging_sensitivity='low', salinity_tolerance='moderate',
            seasonal_rain_min_mm=700, seasonal_rain_max_mm=2200,
        ),
        Crop(
            'maize', 'Maize', 'poaceae', 'medium', 5.8, 7.5, 18, 32, 4,
            is_legume=False, residue_profile='high', rooting_depth_class='medium',
            waterlogging_sensitivity='moderate', salinity_tolerance='sensitive',
            seasonal_rain_min_mm=400, seasonal_rain_max_mm=1100,
        ),
        Crop(
            'sorghum', 'Sorghum', 'poaceae', 'low', 5.5, 8.0, 22, 35, 4,
            is_legume=False, residue_profile='high', rooting_depth_class='deep',
            waterlogging_sensitivity='moderate', salinity_tolerance='moderate',
            seasonal_rain_min_mm=220, seasonal_rain_max_mm=850,
        ),
        Crop(
            'millet', 'Pearl millet', 'poaceae', 'low', 5.5, 8.0, 22, 35, 4,
            is_legume=False, residue_profile='moderate', rooting_depth_class='deep',
            waterlogging_sensitivity='high', salinity_tolerance='moderate',
            seasonal_rain_min_mm=180, seasonal_rain_max_mm=750,
        ),
        Crop(
            'soybean', 'Soybean', 'fabaceae', 'medium', 6.0, 7.5, 18, 30, 4,
            is_legume=True, residue_profile='moderate', rooting_depth_class='medium',
            waterlogging_sensitivity='moderate', salinity_tolerance='sensitive',
            seasonal_rain_min_mm=380, seasonal_rain_max_mm=1050,
        ),
        Crop(
            'chickpea', 'Chickpea', 'fabaceae', 'low', 6.0, 8.0, 12, 25, 4,
            is_legume=True, residue_profile='low', rooting_depth_class='deep',
            waterlogging_sensitivity='high', salinity_tolerance='sensitive',
            seasonal_rain_min_mm=200, seasonal_rain_max_mm=650,
        ),
        Crop(
            'lentil', 'Lentil', 'fabaceae', 'low', 6.0, 8.0, 10, 25, 4,
            is_legume=True, residue_profile='low', rooting_depth_class='shallow',
            waterlogging_sensitivity='high', salinity_tolerance='sensitive',
            seasonal_rain_min_mm=200, seasonal_rain_max_mm=600,
        ),
        Crop(
            'cowpea', 'Cowpea', 'fabaceae', 'low', 5.5, 7.5, 20, 35, 3,
            is_legume=True, residue_profile='moderate', rooting_depth_class='medium',
            waterlogging_sensitivity='high', salinity_tolerance='moderate',
            seasonal_rain_min_mm=200, seasonal_rain_max_mm=800,
        ),
        Crop(
            'potato', 'Potato', 'solanaceae', 'medium', 5.0, 6.5, 12, 23, 4,
            is_legume=False, residue_profile='low', rooting_depth_class='shallow',
            waterlogging_sensitivity='high', salinity_tolerance='sensitive',
            seasonal_rain_min_mm=350, seasonal_rain_max_mm=900,
        ),
        Crop(
            'tomato', 'Tomato', 'solanaceae', 'medium', 6.0, 7.0, 18, 30, 4,
            is_legume=False, residue_profile='low', rooting_depth_class='medium',
            waterlogging_sensitivity='high', salinity_tolerance='moderate',
            seasonal_rain_min_mm=350, seasonal_rain_max_mm=950,
        ),
        Crop(
            'sunflower', 'Sunflower', 'asteraceae', 'medium', 6.0, 7.8, 17, 32, 4,
            is_legume=False, residue_profile='moderate', rooting_depth_class='deep',
            waterlogging_sensitivity='moderate', salinity_tolerance='moderate',
            seasonal_rain_min_mm=300, seasonal_rain_max_mm=900,
        ),
        Crop(
            'cotton', 'Cotton', 'malvaceae', 'high', 5.8, 8.0, 20, 35, 6,
            is_legume=False, residue_profile='moderate', rooting_depth_class='deep',
            waterlogging_sensitivity='high', salinity_tolerance='tolerant',
            seasonal_rain_min_mm=450, seasonal_rain_max_mm=1300,
        ),
        Crop(
            'canola', 'Canola', 'brassicaceae', 'medium', 5.5, 7.5, 10, 25, 4,
            is_legume=False, residue_profile='moderate', rooting_depth_class='deep',
            waterlogging_sensitivity='moderate', salinity_tolerance='moderate',
            seasonal_rain_min_mm=280, seasonal_rain_max_mm=800,
        ),
    ]
}

CATALOG_NOTE = (
    'General screening crop parameters derived from global agronomic literature bands; '
    'cultivar maturity, local planting dates, and regional extension guidance vary locally.'
)
