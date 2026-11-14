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
  weather_data_type?: string | null;
  weather_is_forecast?: boolean | null;
  weather_observation_window?: string | null;
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
  // Phase 4B enriched crop intelligence metadata
  scientific_name?: string;
  category?: string;
  cycle_days_min?: number;
  cycle_days_max?: number;
  cycle_variability_note?: string;
  temp_tol_min_c?: number;
  temp_tol_max_c?: number;
  heat_stress_threshold_c?: number | null;
  frost_sensitivity?: 'low' | 'moderate' | 'high' | 'very_high' | string;
  is_legume?: boolean;
  residue_profile?: 'low' | 'moderate' | 'high' | string;
  rooting_depth_class?: 'shallow' | 'medium' | 'deep' | string;
  waterlogging_sensitivity?: 'low' | 'moderate' | 'high' | string;
  salinity_tolerance?: 'sensitive' | 'moderate' | 'tolerant' | string;
  salinity_ec_threshold_dsm?: number | null;
  seasonal_rain_min_mm?: number;
  seasonal_rain_max_mm?: number;
  suitable_soil_textures?: string[];
  legume_bnf_notes?: string | null;
  residue_management_notes?: string;
  succession_cautions?: string[];
  rotation_advantages?: string[];
  known_unknowns?: string[];
  parameter_sources?: Record<string, string[]>;
}

export interface AgronomicSourceItem {
  id: string;
  title: string;
  organization: string;
  url: string;
  geographic_applicability: string;
  crop_applicability: string;
  limitations: string;
  last_reviewed: string;
}

export interface RotationCropsResponse {
  crops: RotationCatalogCrop[];
  catalog_warning: string;
  sources?: AgronomicSourceItem[];
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
  country?: string | null;
  country_code?: string | null;
  region?: string | null;
  soil_texture?: string | null;
  drainage?: string | null;
  salinity_concern?: string | null;
  irrigation_method?: string | null;
  // Phase 4B soil provenance, SoilGrids SOC reference & explicit current-practice comparison
  soil_ph_provenance?: string | null;
  soil_texture_provenance?: string | null;
  soil_organic_carbon_g_kg?: number | null;
  current_rotation_crop_ids?: string[];
}

export interface RotationSeasonDetail {
  crop_id: string;
  name: string;
  family?: string;
  is_legume?: boolean;
  planting_month: number;
  harvest_month?: number;
  duration_months: number;
  window_label?: string;
  wraps_year?: boolean;
  local_season_name?: string | null;
  calendar_status?: string;
  calendar_note?: string;
  avg_historical_temperature_c: number;
  temperature_fit_score: number;
  water_category: 'low' | 'medium' | 'high';
  water_compatibility_score: number;
  season_rainfall_mm?: number | null;
  rainfall_variability_level?: string;
  rainfall_fit_status?: string;
  rainfall_note?: string;
  soil_ph_compatibility_score: number | null;
  family_diversity_score: number;
  screening_score: number;
}

export interface SoilHealthSummary {
  soil_health_score: number;
  soil_ph_compatibility: number | null;
  soil_ph_evaluated: boolean;
  soil_ph_provenance?: string;
  soil_texture_provenance?: string;
  soc_reference_note?: string | null;
  has_legume: boolean;
  legume_crops: string[];
  legume_tradeoff_note?: string | null;
  distinct_families: number;
  strengths: string[];
  cautions: string[];
  evaluated_factors: string[];
  missing_factors: string[];
  evidence_caveat: string;
}

export interface SeasonClimateVariability {
  season_index: number;
  crop_id: string;
  crop_name: string;
  years_evaluated: number;
  precip_years_evaluated: number;
  incomplete_years_skipped: number;
  mean_season_temp_c: number | null;
  min_year_temp_c: number | null;
  max_year_temp_c: number | null;
  temp_spread_c: number | null;
  temp_sd_c: number | null;
  wettest_season_mm: number | null;
  wettest_season_year: string | null;
  driest_season_mm: number | null;
  driest_season_year: string | null;
  precip_cv_percent: number | null;
  warm_stress_years: number;
  cool_stress_years: number;
  dry_deficit_years: number;
  excess_rain_years: number;
}

export interface HistoricalResilienceSummary {
  available: boolean;
  years_evaluated: number;
  complete_precip_years: number;
  incomplete_years_skipped: number;
  year_span_label: string | null;
  resilience_class: 'consistent' | 'moderate_variability' | 'high_exposure' | 'limited_history' | string;
  wettest_cycle_mm: number | null;
  wettest_cycle_year: string | null;
  driest_cycle_mm: number | null;
  driest_cycle_year: string | null;
  warm_stress_seasons_count: number;
  cool_stress_seasons_count: number;
  dry_deficit_seasons_count: number;
  excess_rain_seasons_count: number;
  season_variability: SeasonClimateVariability[];
  summary: string;
  caveat: string;
}

export interface RotationPlanDiagnostics {
  climate_compatibility: number;
  water_compatibility: number;
  family_rotation: number;
  soil_compatibility: number | null;
  soil_evaluated: boolean;
  soil_health_score?: number;
  regional_calendar_score?: number | null;
  regional_calendar_evaluated?: boolean;
  regional_timing_evidence?: 'verified' | 'conditional' | 'unverified';
  verified_calendar_seasons?: number;
  total_seasons?: number;
  unverified_calendar_crops?: string[];
  rainfall_evaluated?: boolean;
  evaluated_dimensions?: string[];
  unevaluated_dimensions?: string[];
  data_completeness?: {
    evaluated_count: number;
    total_count: number;
    label: string;
  };
  distinct_families: number;
  distinct_crops: number;
  goal_applied: BackendRotationGoal;
  goal_weights_applied: Record<string, number>;
  missing_data_notes: string[];
  tie_note: string | null;
  ranking_drivers?: string[];
}

export interface RotationPlanOption {
  crop_ids: string[];
  score: number;
  compatibility_band?: string;
  feasibility?: {
    status: string;
    regional_timing_evidence?: 'verified' | 'conditional' | 'unverified';
    verified_calendar_seasons?: number;
    total_seasons?: number;
    unverified_crop_ids?: string[];
    total_cycle_months: number;
    timeline_summary: string;
    warnings: string[];
  };
  seasons: RotationSeasonDetail[];
  soil_health_summary?: SoilHealthSummary;
  historical_resilience?: HistoricalResilienceSummary;
  diagnostics?: RotationPlanDiagnostics;
  explanation: string;
}

export interface PrioritySensitivityOption {
  goal: BackendRotationGoal;
  label: string;
  is_active: boolean;
  top_crop_ids: string[];
  top_crop_names: string[];
  top_score: number;
  matches_active_top: boolean;
  reason: string;
}

export interface CurrentPracticeComparison {
  status: 'ok' | 'unsupported_crop' | 'insufficient_data' | string;
  crop_ids: string[];
  horizon_seasons?: number;
  matches_planner_horizon?: boolean;
  score_delta_vs_top: number | null;
  dimension_deltas_vs_top: {
    climate: number;
    water: number;
    soil_health: number;
    diversity: number;
    calendar: number | null;
  } | null;
  evaluated_plan: RotationPlanOption | null;
  comparison_summary: string | null;
  message: string | null;
}

export interface RegionalCalendarContext {
  verified: boolean;
  evidence_status: string;
  location_resolution: string;
  country_code: string | null;
  country_name: string | null;
  region: string | null;
  hemisphere: string;
  agroecological_zone: string | null;
  source_ids: string[];
  warning: string | null;
}

export interface RainfallIntelligenceSummary {
  rainfall_available: boolean;
  annual_mean_mm: number | null;
  wettest_3mo_mm: number | null;
  driest_3mo_mm: number | null;
  seasonal_contrast_note: string;
  note: string;
}

export interface RotationPlanResponse {
  status: 'ok' | 'insufficient_data' | 'invalid_crops';
  data_available: boolean;
  plans: RotationPlanOption[];
  unverified_plans?: RotationPlanOption[];
  rejected_sequences?: Array<{
    crop_ids: string[];
    crop_names: string[];
    reasons: string[];
  }>;
  current_practice_comparison?: CurrentPracticeComparison | null;
  priority_sensitivity?: PrioritySensitivityOption[];
  regional_context?: RegionalCalendarContext;
  rainfall_intelligence?: RainfallIntelligenceSummary | null;
  sources?: AgronomicSourceItem[];
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
  regional_context?: RegionalCalendarContext | null;
  sources?: AgronomicSourceItem[];
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

export interface EnvironmentalVariableReading {
  variable: string;
  label: string;
  value: number | null;
  unit: string;
  available: boolean;
  status: string;
  source: string;
  source_url: string;
  category:
    | 'observed_historical_climate'
    | 'modeled_reanalysis_estimate'
    | 'remote_sensing_estimate'
    | 'public_modeled_soil_estimate'
    | string;
  spatial_resolution: string;
  observation_period: string;
  valid_months?: number;
  total_months?: number;
  retrieved_at: string;
  uncertainty_note: string;
  seasonal_summary?: Record<string, number | null>;
  mean_daily_mm?: number | null;
  complete_years_count?: number;
  years_with_records?: number;
}

export interface SoilGridsPropertyReading extends EnvironmentalVariableReading {
  q05?: number | null;
  q95?: number | null;
  depth_interval: string;
}

export interface EnvironmentalContextSoilSection {
  available: boolean;
  status: string;
  source: string;
  endpoint_used?: string | null;
  source_url?: string;
  spatial_resolution?: string;
  retrieved_at?: string;
  message?: string | null;
  properties: Record<string, SoilGridsPropertyReading>;
  derived_usda_texture: string | null;
  mapped_farm_texture: string;
  source_assessment?: {
    primary_checked?: string;
    fallback_available?: string;
    rest_status?: string;
    wms_status?: string;
  };
  unsupported_soil_properties?: string[];
}

export interface SuggestedFarmField<T = string | number> {
  field: string;
  available: boolean;
  suggested_value: T | null;
  unit?: string | null;
  usda_class?: string | null;
  provenance: 'public_dataset_estimate' | string;
  source_label: string | null;
  requires_confirmation: boolean;
  auto_applied: boolean;
}

export interface EnvironmentalContextResponse {
  location: { latitude: number; longitude: number };
  start_year: number;
  end_year: number;
  retrieved_at: string;
  nasa_climate: {
    available: boolean;
    status?: string | null;
    message?: string | null;
    variables: Record<string, EnvironmentalVariableReading>;
  };
  nasa_soil_wetness: {
    available: boolean;
    status?: string | null;
    message?: string | null;
    variables: Record<string, EnvironmentalVariableReading>;
  };
  soil_context: EnvironmentalContextSoilSection;
  suggested_farm_defaults: {
    soil_ph?: SuggestedFarmField<number>;
    soil_texture?: SuggestedFarmField<string>;
  };
  details_farmer_must_confirm: string[];
  precedence_policy: string;
  limitations: string[];
}

export interface WaterSeasonInput {
  crop_id: string;
  planting_month: number;
  duration_months?: number | null;
}

export interface WaterPlanInput {
  plan_id: string;
  label: string;
  is_current_practice?: boolean;
  seasons: WaterSeasonInput[];
}

export interface WaterCompareRequest {
  latitude: number;
  longitude: number;
  start_year?: number | null;
  end_year?: number | null;
  plans: WaterPlanInput[];
  cultivated_area_ha?: number | null;
  irrigation_method?: string | null;
  water_availability?: BackendWaterLevel | null;
  elevation_m?: number | null;
  apply_fao56_climate_kc_adjustment?: boolean;
}

export interface WaterTotalsMm {
  et0_mm: number;
  etc_mm: number;
  precip_mm: number;
  effective_rainfall_mm: number;
  preliminary_deficit_mm: number;
}

export interface WaterVolumesM3 {
  area_ha: number | null;
  et0_m3: number | null;
  etc_m3: number | null;
  precip_m3: number | null;
  effective_rainfall_m3: number | null;
  preliminary_deficit_m3: number | null;
}

export interface WaterSeasonBreakdown {
  season_index: number;
  crop_id: string;
  crop_name: string;
  planting_month: number;
  cycle_days: number;
  duration_scaled_from_catalog_override: boolean;
  gap_days_before: number;
  evidence_status: 'verified' | 'preliminary' | string;
  requires_paddy_water_adjustment: boolean;
  kc_ini: number;
  kc_mid_table: number;
  kc_mid_mean_used: number;
  kc_end_table: number;
  kc_end_mean_used: number;
  stage_days: {
    initial: number;
    development: number;
    mid_season: number;
    late_season: number;
  };
  fao_table12_reference: string;
  fao_table11_reference: string;
  limitations_note: string;
  mean_et0_mm: number;
  mean_etc_mm: number;
  mean_precip_mm: number;
  mean_effective_rainfall_mm: number;
  mean_preliminary_deficit_mm: number;
  deficit_range_mm: {
    min: number;
    max: number;
  };
  volume_m3: {
    etc_m3: number | null;
    effective_rainfall_m3: number | null;
    preliminary_deficit_m3: number | null;
  };
}

export interface WaterPlanComparison {
  plan_id: string;
  label: string;
  is_current_practice: boolean;
  available: boolean;
  status: 'ok' | 'unavailable_crop_kc' | 'insufficient_comparable_data' | string;
  evidence_status: 'verified' | 'preliminary' | 'unavailable' | string;
  preliminary_kc_crops: string[];
  missing_kc_crops: string[];
  has_paddy_rice_caveat: boolean;
  paddy_rice_note: string | null;
  crop_ids: string[];
  crop_names: string[];
  comparable_years_used: number[];
  comparable_years_count: number;
  all_complete_years_count: number;
  incomplete_years_skipped: number[];
  total_crop_days: number | null;
  total_turnaround_gap_days: number | null;
  totals_mean_mm: WaterTotalsMm | null;
  ranges_mm: {
    etc_min: number;
    etc_max: number;
    precip_min: number;
    precip_max: number;
    deficit_min: number;
    deficit_max: number;
  } | null;
  effective_rainfall_etc_share_percent: number | null;
  volumes_mean_m3: WaterVolumesM3 | null;
  seasons: WaterSeasonBreakdown[];
  yearly_cycles: Array<{
    cycle_start_year: number;
    cycle_start_date: string;
    cycle_end_date: string;
    et0_mm: number;
    etc_mm: number;
    precip_mm: number;
    effective_rainfall_mm: number;
    preliminary_deficit_mm: number;
  }>;
  message?: string | null;
}

export interface WaterCompareResponse {
  status: 'ok' | 'insufficient_comparable_data' | 'data_unavailable' | string;
  data_available: boolean;
  error_kind?: string | null;
  message?: string | null;
  historical_not_forecast: boolean;
  meteorology?: {
    source: string;
    source_url: string | null;
    api_version: string | null;
    is_verified_nasa_observation: boolean;
    start_year: number;
    end_year: number;
    includes_partial_current_year: boolean;
    location: {
      latitude: number;
      longitude: number;
      elevation_m: number | null;
      elevation_source: string | null;
    };
    coverage: {
      total_days_loaded: number;
      valid_et0_days: number;
      valid_precip_days: number;
      pressure_sources: string[];
      ea_methods: string[];
    };
  };
  methods?: {
    et0_method: string;
    kc_method: string;
    effective_rainfall_method_id: string;
    effective_rainfall_method: string;
    deficit_step: string;
    representative_planting_day_assumption: string;
  };
  farm_water_context: {
    cultivated_area_ha: number | null;
    volume_unit: string | null;
    volume_conversion_note?: string;
    irrigation_method?: string | null;
    reported_water_availability?: string | null;
    water_availability_confirmed: boolean;
    water_availability_note: string;
  };
  comparison: {
    status: string;
    comparable_plan_count: number;
    common_comparable_years: number[];
    common_comparable_years_count: number;
    lowest_deficit_plan_id?: string | null;
    lowest_deficit_plan_label?: string | null;
    lowest_deficit_mm?: number | null;
    lowest_etc_plan_id?: string | null;
    lowest_etc_plan_label?: string | null;
    lowest_etc_mm?: number | null;
    baseline_comparison?: {
      current_plan_id: string;
      current_plan_label: string;
      compared_plan_id: string;
      compared_plan_label: string;
      deficit_delta_mm: number;
      deficit_delta_percent: number | null;
      etc_delta_mm: number;
      deficit_delta_m3: number | null;
      note: string;
    } | null;
    message?: string | null;
  };
  plans: WaterPlanComparison[];
  paddy_rice_caveat?: string | null;
  limitations: string[];
  sources?: AgronomicSourceItem[];
}

