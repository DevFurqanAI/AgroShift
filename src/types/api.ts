import type { GeoJSONPolygon } from './farm';

export interface BackendHealthResponse {
  status?: string;
  service?: string;
  version?: string;
  [key: string]: unknown;
}

export interface FieldAnalyzeRequest {
  latitude: number;
  longitude: number;
  acreage: number;
  polygon_geojson?: GeoJSONPolygon | null;
  language?: string;
}

export interface FieldWeatherSummary {
  temperature_c?: number | null;
  precipitation_mm?: number | null;
  humidity_percent?: number | null;
  wind_speed_kmh?: number | null;
  condition?: string | null;
  source?: string | null;
  observed_at?: string | null;
}

export interface FieldAnalyzeResponse {
  data_available?: boolean;
  ndvi?: number | null;
  ndmi?: number | null;
  ndvi_category?: string | null;
  ndmi_category?: string | null;
  observation_date?: string | null;
  /**
   * Legacy backend field representing an approximation of unusable sampled pixels,
   * NOT measured meteorological cloud cover.
   */
  cloud_cover_percent?: number | null;
  weather?: FieldWeatherSummary | null;
  field_explanation?: string | null;
  confidence?: string | null;
  limitations?: string[] | null;
  sources?: string[] | null;
  message?: string | null;
  [key: string]: unknown;
}

export interface ClimateHistoryMonthlyPoint {
  year: number;
  month: number;
  month_label?: string;
  t2m_c?: number | null;
  t2m_max_c?: number | null;
  t2m_min_c?: number | null;
  /**
   * NASA POWER precipitation rate in mm/day. Never treat as monthly total mm.
   */
  prectotcorr_mm_day?: number | null;
  /**
   * Backend-calculated monthly precipitation estimate in millimeters when provided.
   */
  estimated_monthly_precipitation_mm?: number | null;
  rh2m_percent?: number | null;
  allsky_sfc_sw_dwn?: number | null;
}

export interface ClimateSeasonalSummary {
  season: string;
  avg_temp_c?: number | null;
  estimated_precip_mm?: number | null;
  mean_precip_mm_day?: number | null;
}

export interface ClimateHistoryResponse {
  data_available: boolean;
  source?: string | null;
  latitude?: number;
  longitude?: number;
  start_year?: number;
  end_year?: number;
  years_available?: number[] | null;
  monthly_data?: ClimateHistoryMonthlyPoint[] | null;
  seasonal_summary?: ClimateSeasonalSummary[] | null;
  notes?: string[] | null;
  message?: string | null;
  [key: string]: unknown;
}

export interface ApiConnectionInfo {
  configured: boolean;
  baseUrl: string;
  source: 'env' | 'custom' | 'none';
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
