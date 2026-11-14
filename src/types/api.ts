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
  moisture_stress_status?: string | null;
  analysis_confidence: string;
  observation_quality?: string | null;
  confidence_reason?: string | null;
  satellite_available: boolean;
  satellite_observation_date: string | null;
  cloud_cover_percent: number | null;
  valid_coverage_percent?: number | null;
  excluded_pixel_percent?: number | null;
  satellite_message: string | null;
  satellite_error_kind?: string | null;
  weather_available: boolean;
  weather_message: string | null;
  weather_source?: string | null;
  weather_error_kind?: string | null;
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

export interface RotationPlanDiagnostics {
  climate_compatibility: number;
  water_compatibility: number;
  family_rotation: number;
  soil_compatibility: number | null;
  soil_evaluated: boolean;
  distinct_families: number;
  distinct_crops: number;
  goal_applied: BackendRotationGoal;
  goal_weights_applied: Record<string, number>;
  missing_data_notes: string[];
  tie_note: string | null;
}

export interface RotationPlanOption {
  crop_ids: string[];
  score: number;
  compatibility_band?: string;
  seasons: RotationSeasonDetail[];
  diagnostics?: RotationPlanDiagnostics;
  explanation: string;
}

export interface RotationPlanResponse {
  status: 'ok' | 'insufficient_data' | 'invalid_crops';
  data_available: boolean;
  plans: RotationPlanOption[];
  climate_source?: string;
  historical_not_forecast?: boolean;
  screening_disclaimer?: string;
  method?: string;
  catalog_warning?: string;
  limitations?: string[];
  message?: string | null;
}

export interface ScenarioRotationRequest extends RotationPlanRequest {
  scenario_label?: string;
  temperature_delta_c: number;
  precipitation_shift_percent: number;
}

export interface ScenarioComparisonRow {
  crop_ids: string[];
  crop_names: string[];
  baseline_rank: number | null;
  scenario_rank: number | null;
  rank_change: number | null;
  baseline_score: number | null;
  scenario_score: number | null;
  score_delta: number | null;
  baseline_band: string | null;
  scenario_band: string | null;
  reason: string;
}

export interface ScenarioComparisonResponse {
  status: 'ok' | 'insufficient_data' | 'invalid_crops';
  data_available: boolean;
  climate_source?: string;
  historical_not_forecast?: boolean;
  is_hypothetical_sensitivity?: boolean;
  scenario_label: string;
  assumptions: {
    temperature_delta_c: number;
    precipitation_shift_percent: number;
    baseline_water_availability: BackendWaterLevel;
    scenario_water_availability: BackendWaterLevel;
    water_shift_note: string;
  };
  climate_metrics: {
    baseline_avg_temp_c: number | null;
    scenario_avg_temp_c: number | null;
    baseline_avg_monthly_precip_mm: number | null;
    scenario_avg_monthly_precip_mm: number | null;
  } | null;
  baseline_plans: RotationPlanOption[];
  scenario_plans: RotationPlanOption[];
  comparisons: ScenarioComparisonRow[];
  disclaimer: string;
  screening_disclaimer?: string;
  method?: string;
  catalog_warning?: string;
  limitations?: string[];
  message?: string | null;
}

export interface AssistantStatusResponse {
  available: boolean;
  model: string | null;
  configuredModel?: string;
  provider: string;
  reason?: string | null;
}

export interface AssistantChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}
