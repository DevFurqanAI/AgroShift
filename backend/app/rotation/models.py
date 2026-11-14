from datetime import date
from typing import Literal
from pydantic import BaseModel, Field, model_validator

Water = Literal['low', 'medium', 'high']
Goal = Literal['water', 'diversity', 'climate', 'soil']


class RotationRequest(BaseModel):
    latitude: float = Field(ge=-90, le=90, allow_inf_nan=False)
    longitude: float = Field(ge=-180, le=180, allow_inf_nan=False)
    previous_crop: str = Field(min_length=1, max_length=32)
    candidate_crop_ids: list[str] | None = Field(default=None, max_length=30)
    soil_ph: float | None = Field(default=None, ge=3, le=10, allow_inf_nan=False)
    water_availability: Water = 'medium'
    goal: Goal = 'water'
    planting_month: int = Field(default=1, ge=1, le=12)
    seasons: int = Field(default=3, ge=2, le=3)
    start_year: int = Field(default=2015, ge=1981, le=2100)
    end_year: int = Field(default=2025, ge=1981, le=2100)
    max_results: int = Field(default=3, ge=1, le=10)
    # Optional Phase 3 & 4B agronomic, provenance & baseline-comparison context
    country: str | None = Field(default=None, max_length=64)
    country_code: str | None = Field(default=None, max_length=8)
    region: str | None = Field(default=None, max_length=120)
    soil_texture: str | None = Field(default=None, max_length=32)
    drainage: str | None = Field(default=None, max_length=32)
    salinity_concern: str | None = Field(default=None, max_length=32)
    irrigation_method: str | None = Field(default=None, max_length=32)
    soil_ph_provenance: str | None = Field(default=None, max_length=40)
    soil_texture_provenance: str | None = Field(default=None, max_length=40)
    soil_organic_carbon_g_kg: float | None = Field(default=None, ge=0, le=500, allow_inf_nan=False)
    current_rotation_crop_ids: list[str] | None = Field(default=None, max_length=3)
    # Allow supplied observations for deterministic testing and offline analysis;
    # never claim that these came from NASA.
    climate_monthly: list['ClimateMonth'] | None = Field(default=None, max_length=1000)

    @model_validator(mode='after')
    def validate_request(self):
        if self.end_year < self.start_year or self.end_year - self.start_year > 30:
            raise ValueError('Historical range must be ordered and no longer than 31 years')
        if self.end_year > date.today().year:
            raise ValueError('Historical year cannot be in the future')
        if self.candidate_crop_ids is not None and len(self.candidate_crop_ids) < 2:
            raise ValueError('At least two candidate crops are required')
        if self.current_rotation_crop_ids is not None:
            if len(self.current_rotation_crop_ids) == 0:
                self.current_rotation_crop_ids = None
            elif len(self.current_rotation_crop_ids) == 1:
                raise ValueError('Current practice comparison requires an explicit 2- or 3-season sequence')
        return self


class ClimateMonth(BaseModel):
    month: str = Field(pattern=r'^\d{6}$')
    temperature_c: float | None = Field(default=None, ge=-100, le=80, allow_inf_nan=False)
    precipitation_mm_per_day: float | None = Field(default=None, ge=0, le=500, allow_inf_nan=False)
    estimated_monthly_precipitation_mm: float | None = Field(default=None, ge=0, le=20000, allow_inf_nan=False)

    @model_validator(mode='after')
    def month_valid(self):
        if not 1 <= int(self.month[4:]) <= 12:
            raise ValueError('Invalid month')
        return self


class ScenarioRotationRequest(RotationRequest):
    scenario_label: str = Field(default='Custom Sensitivity', min_length=1, max_length=80)
    temperature_delta_c: float = Field(default=0.0, ge=-5.0, le=8.0, allow_inf_nan=False)
    precipitation_shift_percent: float = Field(default=0.0, ge=-80.0, le=100.0, allow_inf_nan=False)


RotationRequest.model_rebuild()
ScenarioRotationRequest.model_rebuild()
