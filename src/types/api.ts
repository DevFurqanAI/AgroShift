import type { GeoJSONPolygon } from './farm';

export interface BackendHealthResponse {
  status?: string;
  message?: string;
  [key: string]: unknown;
}

export interface FieldAnalyzeRequest {
  latitude: number;
  longitude: number;
  acres: number;
  polygon_geojson?: GeoJSONPolygon | null;
  language?: 'en' | 'ur';
}

export interface FieldAnalyzeResponse {
  ndvi: number | null;
  ndvi_status: string | null;
  ndmi: number | null;
  ndmi_status: string | null;
  temperature_c: number | null;
  humidity_percent: number | null;
  recent_rainfall_mm: number | null;
  heat_risk: string | null;
  rainfall_status: string | null;
  possible_water_stress: boolean | null;
  analysis_confidence: string;
  satellite_available: boolean;
  satellite_observation_date: string | null;
  cloud_cover_percent: number | null;
  satellite_message: string | null;
  weather_available: boolean;
  weather_message: string | null;
  ai_explanation: string;
  recommendations: string[];
}

export interface ClimateHistoryMonthlyPoint {
  month: string; // "YYYYMM", e.g. "202401"
  temperature_c: number | null;
  precipitation_mm_per_day: number | null;
  estimated_monthly_precipitation_mm: number | null;
}

export interface ClimateHistoryResponse {
  data_available: boolean;
  source?: string | null;
  source_url?: string | null;
  location?: {
    latitude: number;
    longitude: number;
  };
  start_year?: number;
  end_year?: number;
  units?: {
    temperature_c?: string;
    precipitation_mm_per_day?: string;
    estimated_monthly_precipitation_mm?: string;
  };
  historical_not_forecast?: boolean;
  monthly?: ClimateHistoryMonthlyPoint[] | null;
  note?: string | null;
  message?: string | null;
}

export interface RotationCatalogCrop {
  id: string;
  name: string;
  family: string;
  water_demand: 'low' | 'medium' | 'high';
  ph_min: number;
  ph_max: number;
  temp_min_c: number;
  temp_max_c: number;
  duration_months: number;
}

export interface RotationCropsResponse {
  crops: RotationCatalogCrop[];
  catalog_warning: string;
}

export type BackendRotationGoal = 'water' | 'diversity' | 'climate' | 'soil';
export type BackendWaterLevel = 'low' | 'medium' | 'high';

export interface RotationPlanRequest {
  latitude: number;
  longitude: number;
  previous_crop: string;
  candidate_crop_ids?: string[];
  soil_ph?: number | null;
  water_availability: BackendWaterLevel;
  goal: BackendRotationGoal;
  planting_month: number;
  seasons: 2 | 3;
  start_year: number;
  end_year: number;
  max_results: number;
}

export interface RotationSeasonDetail {
  crop_id: string;
  name: string;
  planting_month: number;
  duration_months: number;
  avg_historical_temperature_c: number;
  temperature_fit_score: number;
  water_category: 'low' | 'medium' | 'high';
  water_compatibility_score: number;
  soil_ph_compatibility_score: number | null;
  family_diversity_score: number;
  screening_score: number;
}

export interface RotationPlanOption {
  crop_ids: string[];
  score: number;
  seasons: RotationSeasonDetail[];
  explanation: string;
}

export interface RotationPlanResponse {
  status: 'ok' | 'insufficient_data' | 'invalid_crops';
  data_available: boolean;
  plans: RotationPlanOption[];
  climate_source?: string;
  historical_not_forecast?: boolean;
  method?: string;
  catalog_warning?: string;
  limitations?: string[];
  message?: string | null;
}

export interface AssistantStatusResponse {
  available: boolean;
  model: string | null;
  provider: string;
}

export interface AssistantChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}
