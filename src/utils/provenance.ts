import type {
  DataProvenance,
  FarmEnvironmentalSnapshot,
  SoilTexture,
} from '../types/farm';
import type { EnvironmentalContextResponse } from '../types/api';

const PROVENANCE_PRECEDENCE: Record<string, number> = {
  lab_test: 4,
  farmer_observation: 3,
  farmer_provided: 3,
  public_dataset_estimate: 2,
  nasa_gridded_observation: 2,
  external_estimate: 2,
  estimated: 2,
  unknown: 0,
};

export function getProvenanceRank(provenance: DataProvenance | undefined): number {
  return PROVENANCE_PRECEDENCE[provenance ?? 'unknown'] ?? 0;
}

/**
 * Returns true ONLY when applying a public dataset estimate will NOT overwrite
 * a laboratory test, a farmer observation, or a blank/edited value locked by the farmer.
 */
export function canApplyPublicSuggestion(options: {
  currentHasValue: boolean;
  currentProvenance: DataProvenance;
  farmerLocked?: boolean;
}): boolean {
  if (options.farmerLocked) return false;
  const rank = getProvenanceRank(options.currentProvenance);
  if (options.currentHasValue && rank >= 3) {
    return false;
  }
  return true;
}

export function formatProvenanceLabel(provenance: DataProvenance | undefined): string {
  switch (provenance) {
    case 'lab_test':
      return 'Lab soil test';
    case 'farmer_observation':
    case 'farmer_provided':
      return 'Farmer observation';
    case 'public_dataset_estimate':
      return 'Public SoilGrids estimate';
    case 'nasa_gridded_observation':
      return 'NASA gridded observation';
    case 'external_estimate':
    case 'estimated':
      return 'External estimate';
    default:
      return 'Unknown';
  }
}

const VALID_FARM_TEXTURES = new Set<SoilTexture>([
  'sandy',
  'sandy_loam',
  'loam',
  'clay_loam',
  'clay',
  'silt_loam',
  'unknown',
]);

export function normalizeFarmTextureValue(value: string | null | undefined): SoilTexture {
  if (!value) return 'unknown';
  return VALID_FARM_TEXTURES.has(value as SoilTexture) ? (value as SoilTexture) : 'unknown';
}

export function buildEnvironmentalSnapshot(
  response: EnvironmentalContextResponse,
  reviewedDecisions?: {
    texture?: 'accepted' | 'edited' | 'ignored';
    ph?: 'accepted' | 'edited' | 'ignored';
  }
): FarmEnvironmentalSnapshot {
  const clim = response.nasa_climate?.variables ?? {};
  const wet = response.nasa_soil_wetness?.variables ?? {};
  const soilProps = response.soil_context?.properties ?? {};
  const firstClim =
    clim.air_temperature_c ?? clim.precipitation_mm_per_year ?? clim.solar_radiation ?? clim.relative_humidity_percent;
  const firstWet = wet.surface_soil_wetness ?? wet.root_zone_soil_wetness;

  return {
    retrievedAt: response.retrieved_at,
    latitude: response.location.latitude,
    longitude: response.location.longitude,
    startYear: response.start_year,
    endYear: response.end_year,
    nasaClimateAvailable: Boolean(response.nasa_climate?.available),
    nasaWetnessAvailable: Boolean(response.nasa_soil_wetness?.available),
    climateSummary: response.nasa_climate?.available
      ? {
          airTemperatureC: clim.air_temperature_c?.value ?? null,
          annualPrecipitationMm: clim.precipitation_mm_per_year?.value ?? null,
          solarRadiationMjM2Day: clim.solar_radiation?.value ?? null,
          relativeHumidityPercent: clim.relative_humidity_percent?.value ?? null,
          spatialResolution: firstClim?.spatial_resolution ?? null,
          period: firstClim?.observation_period ?? `${response.start_year}–${response.end_year}`,
        }
      : undefined,
    wetnessSummary: response.nasa_soil_wetness?.available
      ? {
          surfaceWetnessIndex: wet.surface_soil_wetness?.value ?? null,
          rootZoneWetnessIndex: wet.root_zone_soil_wetness?.value ?? null,
          spatialResolution: firstWet?.spatial_resolution ?? null,
          period: firstWet?.observation_period ?? `${response.start_year}–${response.end_year}`,
        }
      : undefined,
    soilAvailable: Boolean(response.soil_context?.available),
    soilSource: response.soil_context?.source ?? null,
    soilEndpointUsed: response.soil_context?.endpoint_used ?? null,
    soilReference: response.soil_context?.available
      ? {
          ph: soilProps.phh2o?.value ?? null,
          phQ05: soilProps.phh2o?.q05 ?? null,
          phQ95: soilProps.phh2o?.q95 ?? null,
          usdaTexture: response.soil_context?.derived_usda_texture ?? null,
          mappedTexture: normalizeFarmTextureValue(response.soil_context?.mapped_farm_texture),
          sandPercent: soilProps.sand?.value ?? null,
          siltPercent: soilProps.silt?.value ?? null,
          clayPercent: soilProps.clay?.value ?? null,
          socGKg: soilProps.soc?.value ?? null,
          bulkDensityKgDm3: soilProps.bdod?.value ?? null,
          depthInterval: soilProps.phh2o?.depth_interval ?? soilProps.soc?.depth_interval ?? null,
          spatialResolution: response.soil_context?.spatial_resolution ?? '250 m',
          retrievedAt: response.soil_context?.retrieved_at ?? response.retrieved_at,
        }
      : undefined,
    reviewedDecisions,
  };
}
