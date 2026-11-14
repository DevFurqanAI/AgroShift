export type AreaUnit = 'acres' | 'hectares';
export type TemperatureUnit = 'celsius' | 'fahrenheit';

export type DataProvenance =
  | 'lab_test'
  | 'farmer_observation'
  | 'public_dataset_estimate'
  | 'nasa_gridded_observation'
  | 'external_estimate'
  | 'unknown'
  // Legacy values preserved for reading previously saved localStorage records
  | 'farmer_provided'
  | 'estimated';

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

export type RainfallReliability =
  | 'reliable'
  | 'variable'
  | 'unreliable'
  | 'unknown';

export type AreaSource = 'calculated_from_boundary' | 'manual';

export type LocationSource =
  | 'search'
  | 'map_click'
  | 'polygon'
  | 'device_geolocation'
  | 'manual_coordinates';

export type LocationResolutionStatus =
  | 'resolved'
  | 'unresolved'
  | 'manual_confirmed';

export type SoilKnowledgeLevel = 'lab_test' | 'some_details' | 'unsure';

export type SalinityConcern = 'none' | 'suspected' | 'confirmed' | 'unknown';

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
  displayName?: string;
  latitude: number;
  longitude: number;
  geometryType: 'point' | 'polygon';
  polygonGeoJSON: GeoJSONPolygon | null;
  polygonEstimatedHectares: number | null;
  locationSource?: LocationSource;
  resolutionStatus?: LocationResolutionStatus;
  userConfirmedCorrections?: boolean;
}

export interface FarmDetails {
  name: string;
  areaHectares: number;
  areaSource?: AreaSource;
  preferredAreaUnit: AreaUnit;
  farmType: FarmType;
  irrigationMethod: IrrigationMethod;
  waterAvailability: WaterAvailability;
  rainfallReliability?: RainfallReliability;
  managedFieldsCount: number | null;
}

export interface SoilProfile {
  knowledgeLevel?: SoilKnowledgeLevel;
  texture: SoilTexture;
  textureProvenance: DataProvenance;
  ph: number | null;
  phProvenance: DataProvenance;
  drainage: DrainageQuality;
  drainageProvenance: DataProvenance;
  organicMatterPercent: number | null;
  organicMatterProvenance: DataProvenance;
  salinityConcern?: SalinityConcern;
  hasLabSoilTest: boolean;
  observations: string;
}

export interface FarmEnvironmentalSnapshot {
  retrievedAt: string;
  latitude: number;
  longitude: number;
  startYear: number;
  endYear: number;
  nasaClimateAvailable: boolean;
  nasaWetnessAvailable: boolean;
  climateSummary?: {
    airTemperatureC?: number | null;
    annualPrecipitationMm?: number | null;
    solarRadiationMjM2Day?: number | null;
    relativeHumidityPercent?: number | null;
    spatialResolution?: string | null;
    period?: string | null;
  };
  wetnessSummary?: {
    surfaceWetnessIndex?: number | null;
    rootZoneWetnessIndex?: number | null;
    spatialResolution?: string | null;
    period?: string | null;
  };
  soilAvailable: boolean;
  soilSource?: string | null;
  soilEndpointUsed?: string | null;
  soilReference?: {
    ph?: number | null;
    phQ05?: number | null;
    phQ95?: number | null;
    usdaTexture?: string | null;
    mappedTexture?: SoilTexture | null;
    sandPercent?: number | null;
    siltPercent?: number | null;
    clayPercent?: number | null;
    socGKg?: number | null;
    bulkDensityKgDm3?: number | null;
    depthInterval?: string | null;
    spatialResolution?: string | null;
    retrievedAt?: string | null;
  };
  reviewedDecisions?: {
    texture?: 'accepted' | 'edited' | 'ignored';
    ph?: 'accepted' | 'edited' | 'ignored';
  };
}

export interface SeasonCropEntry {
  id: string;
  cropId: string;
  cropName: string;
  isCustomOther?: boolean;
  plantingDate?: string;
  harvestDate?: string;
}

export interface CropHistoryRecord {
  seasons?: SeasonCropEntry[];
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
  environmentalContext?: FarmEnvironmentalSnapshot;
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
