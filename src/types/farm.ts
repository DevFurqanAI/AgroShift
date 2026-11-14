export type AreaUnit = 'acres' | 'hectares';
export type TemperatureUnit = 'celsius' | 'fahrenheit';
export type DataProvenance = 'farmer_provided' | 'estimated' | 'unknown';

export type FarmType =
  | 'smallholder'
  | 'rainfed'
  | 'irrigated'
  | 'mixed'
  | 'commercial';

export type IrrigationMethod =
  | 'rainfed_only'
  | 'drip'
  | 'sprinkler'
  | 'furrow_surface'
  | 'canal_flood'
  | 'center_pivot'
  | 'other';

export type WaterAvailability =
  | 'abundant'
  | 'seasonal_adequate'
  | 'limited'
  | 'scarce'
  | 'unknown';

export type SoilTexture =
  | 'sandy'
  | 'sandy_loam'
  | 'loam'
  | 'clay_loam'
  | 'clay'
  | 'silt_loam'
  | 'unknown';

export type DrainageQuality =
  | 'well_drained'
  | 'moderately_drained'
  | 'poorly_drained'
  | 'waterlogging_prone'
  | 'unknown';

export type FarmerPriorityId =
  | 'reduce_water_demand'
  | 'support_soil_health'
  | 'maintain_productivity'
  | 'climate_resilience'
  | 'diversify_crops';

export interface GeoJSONPolygon {
  type: 'Polygon';
  coordinates: number[][][];
}

export interface FarmLocation {
  country: string;
  countryCode: string;
  region: string;
  locality: string;
  latitude: number;
  longitude: number;
  geometryType: 'point' | 'polygon';
  polygonGeoJSON: GeoJSONPolygon | null;
  polygonEstimatedHectares: number | null;
}

export interface FarmDetails {
  name: string;
  areaHectares: number;
  preferredAreaUnit: AreaUnit;
  farmType: FarmType;
  irrigationMethod: IrrigationMethod;
  waterAvailability: WaterAvailability;
  managedFieldsCount: number | null;
}

export interface SoilProfile {
  texture: SoilTexture;
  textureProvenance: DataProvenance;
  ph: number | null;
  phProvenance: DataProvenance;
  drainage: DrainageQuality;
  drainageProvenance: DataProvenance;
  organicMatterPercent: number | null;
  organicMatterProvenance: DataProvenance;
  hasLabSoilTest: boolean;
  observations: string;
}

export interface CropHistoryRecord {
  previousCropId: string;
  previousCropName: string;
  earlierCrops: string[];
  typicalPlantingWindow: string;
  typicalHarvestWindow: string;
  rotationChallenges: string;
}

export interface FarmProfile {
  id: string;
  location: FarmLocation;
  details: FarmDetails;
  soil: SoilProfile;
  history: CropHistoryRecord;
  priorities: FarmerPriorityId[];
  createdAt: string;
  updatedAt: string;
}

export interface FarmActivityItem {
  id: string;
  farmId: string;
  farmName: string;
  action: string;
  timestamp: string;
}

export interface AppSettings {
  language: SupportedLanguageCode;
  areaUnit: AreaUnit;
  temperatureUnit: TemperatureUnit;
  theme: 'light' | 'dark';
  customApiBaseUrl: string;
}

export type SupportedLanguageCode =
  | 'en'
  | 'ur'
  | 'hi'
  | 'es'
  | 'pt'
  | 'sw'
  | 'ar'
  | 'fr';
