"""Pydantic schemas for AgroShift Phase 4W Water Intelligence endpoint (/api/v1/water/compare)."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Literal

from pydantic import BaseModel, Field, model_validator

from .nasa_daily import MAX_HISTORY_YEARS


class WaterSeasonInput(BaseModel):
    crop_id: str = Field(min_length=1, max_length=40)
    planting_month: int = Field(ge=1, le=12)
    duration_months: int | None = Field(default=None, ge=1, le=12)


class WaterPlanInput(BaseModel):
    plan_id: str = Field(min_length=1, max_length=64)
    label: str = Field(min_length=1, max_length=120)
    is_current_practice: bool = False
    seasons: list[WaterSeasonInput] = Field(min_length=1, max_length=3)


class DailyWeatherDayInput(BaseModel):
    date: str = Field(pattern=r'^\d{4}-\d{2}-\d{2}$')
    t2m_c: float | None = Field(default=None, ge=-80.0, le=65.0, allow_inf_nan=False)
    t2m_max_c: float | None = Field(default=None, ge=-80.0, le=65.0, allow_inf_nan=False)
    t2m_min_c: float | None = Field(default=None, ge=-80.0, le=65.0, allow_inf_nan=False)
    rh2m_percent: float | None = Field(default=None, ge=0.0, le=100.0, allow_inf_nan=False)
    t2m_dew_c: float | None = Field(default=None, ge=-85.0, le=50.0, allow_inf_nan=False)
    ws2m_ms: float | None = Field(default=None, ge=0.0, le=75.0, allow_inf_nan=False)
    solar_radiation_mj_m2_day: float | None = Field(default=None, ge=0.0, le=50.0, allow_inf_nan=False)
    precip_mm_day: float | None = Field(default=None, ge=0.0, le=1500.0, allow_inf_nan=False)
    surface_pressure_kpa: float | None = Field(default=None, ge=30.0, le=110.0, allow_inf_nan=False)


class WaterCompareRequest(BaseModel):
    latitude: float = Field(ge=-90.0, le=90.0, allow_inf_nan=False)
    longitude: float = Field(ge=-180.0, le=180.0, allow_inf_nan=False)
    start_year: int | None = Field(default=None, ge=1981, le=2100)
    end_year: int | None = Field(default=None, ge=1981, le=2100)
    plans: list[WaterPlanInput] = Field(min_length=1, max_length=6)
    cultivated_area_ha: float | None = Field(default=None, gt=0.0, le=1_000_000.0, allow_inf_nan=False)
    irrigation_method: str | None = Field(default=None, max_length=32)
    water_availability: Literal['low', 'medium', 'high'] | None = None
    elevation_m: float | None = Field(default=None, ge=-500.0, le=9000.0, allow_inf_nan=False)
    apply_fao56_climate_kc_adjustment: bool = True
    # Deterministic offline test weather supply; labeled unverified when present
    daily_weather: list[DailyWeatherDayInput] | None = Field(default=None, max_length=6000)

    @model_validator(mode='after')
    def validate_period(self) -> 'WaterCompareRequest':
        current_year = datetime.now(timezone.utc).year
        if self.end_year is not None and self.end_year > current_year:
            raise ValueError('Historical end year cannot be in the future.')
        if self.start_year is not None and self.end_year is not None:
            if self.end_year < self.start_year:
                raise ValueError('end_year must be >= start_year.')
            if (self.end_year - self.start_year + 1) > MAX_HISTORY_YEARS:
                raise ValueError(f'Historical daily period cannot exceed {MAX_HISTORY_YEARS} years.')
        return self
