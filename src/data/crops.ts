import type { RotationCatalogCrop } from '../types/api';

export interface CropCatalogItem {
  id: string;
  name: string;
  commonAliases: string[];
  category:
    | 'Cereal'
    | 'Legume'
    | 'Oilseed & Fiber'
    | 'Root & Tuber'
    | 'Horticulture'
    | 'Forage & Cover';
  botanicalFamily: string;
  nitrogenFixing: boolean;
  typicalWaterProfile: 'Low' | 'Moderate' | 'High';
  supportedByRotationEngine: boolean;
  durationMonths?: number;
  // Phase 4B evidence-backed catalog details (synced cleanly with backend)
  scientificName?: string;
  cycleDaysMin?: number;
  cycleDaysMax?: number;
  cycleVariabilityNote?: string;
  tempMinC?: number;
  tempMaxC?: number;
  tempTolMinC?: number;
  tempTolMaxC?: number;
  heatStressThresholdC?: number | null;
  frostSensitivity?: string;
  phMin?: number;
  phMax?: number;
  seasonalRainMinMm?: number;
  seasonalRainMaxMm?: number;
  residueProfile?: string;
  rootingDepthClass?: string;
  waterloggingSensitivity?: string;
  salinityTolerance?: string;
  salinityEcThresholdDsm?: number | null;
  suitableSoilTextures?: string[];
  legumeBnfNotes?: string | null;
  residueManagementNotes?: string;
  successionCautions?: string[];
  rotationAdvantages?: string[];
  knownUnknowns?: string[];
  parameterSources?: Record<string, string[]>;
}

/**
 * Backend catalog IDs from /api/v1/rotation/crops:
 * canola, chickpea, cotton, cowpea, lentil, maize, millet,
 * potato, rice, sorghum, soybean, sunflower, tomato, wheat.
 */
export const BACKEND_SUPPORTED_CROP_IDS = new Set([
  'canola',
  'chickpea',
  'cotton',
  'cowpea',
  'lentil',
  'maize',
  'millet',
  'potato',
  'rice',
  'sorghum',
  'soybean',
  'sunflower',
  'tomato',
  'wheat',
]);

export const GLOBAL_CROPS: CropCatalogItem[] = [
  {
    id: 'wheat',
    name: 'Wheat',
    scientificName: 'Triticum aestivum',
    commonAliases: ['Winter Wheat', 'Spring Wheat', 'Durum', 'Gandum'],
    category: 'Cereal',
    botanicalFamily: 'Poaceae',
    nitrogenFixing: false,
    typicalWaterProfile: 'Moderate',
    supportedByRotationEngine: true,
    durationMonths: 5,
    cycleDaysMin: 110,
    cycleDaysMax: 240,
    tempMinC: 10,
    tempMaxC: 25,
    phMin: 6.0,
    phMax: 7.5,
    seasonalRainMinMm: 300,
    seasonalRainMaxMm: 900,
    residueProfile: 'high',
    rootingDepthClass: 'medium',
    waterloggingSensitivity: 'moderate',
    salinityTolerance: 'moderate',
    salinityEcThresholdDsm: 6.0,
    suitableSoilTextures: ['loam', 'silt_loam', 'clay_loam', 'clay'],
  },
  {
    id: 'maize',
    name: 'Maize',
    scientificName: 'Zea mays',
    commonAliases: ['Corn', 'Field Corn', 'Sweet Corn', 'Makai'],
    category: 'Cereal',
    botanicalFamily: 'Poaceae',
    nitrogenFixing: false,
    typicalWaterProfile: 'Moderate',
    supportedByRotationEngine: true,
    durationMonths: 4,
    cycleDaysMin: 95,
    cycleDaysMax: 150,
    tempMinC: 18,
    tempMaxC: 32,
    phMin: 5.8,
    phMax: 7.5,
    seasonalRainMinMm: 400,
    seasonalRainMaxMm: 1100,
    residueProfile: 'high',
    rootingDepthClass: 'medium',
    waterloggingSensitivity: 'moderate',
    salinityTolerance: 'sensitive',
    salinityEcThresholdDsm: 1.7,
    suitableSoilTextures: ['sandy_loam', 'loam', 'silt_loam', 'clay_loam'],
  },
  {
    id: 'rice',
    name: 'Rice',
    scientificName: 'Oryza sativa',
    commonAliases: ['Paddy', 'Upland Rice', 'Chawal'],
    category: 'Cereal',
    botanicalFamily: 'Poaceae',
    nitrogenFixing: false,
    typicalWaterProfile: 'High',
    supportedByRotationEngine: true,
    durationMonths: 5,
    cycleDaysMin: 105,
    cycleDaysMax: 160,
    tempMinC: 22,
    tempMaxC: 35,
    phMin: 5.5,
    phMax: 7.0,
    seasonalRainMinMm: 700,
    seasonalRainMaxMm: 2200,
    residueProfile: 'high',
    rootingDepthClass: 'shallow',
    waterloggingSensitivity: 'low',
    salinityTolerance: 'moderate',
    salinityEcThresholdDsm: 3.0,
    suitableSoilTextures: ['clay_loam', 'clay', 'silt_loam'],
  },
  {
    id: 'sorghum',
    name: 'Sorghum',
    scientificName: 'Sorghum bicolor',
    commonAliases: ['Jowar', 'Milo', 'Guinea Corn'],
    category: 'Cereal',
    botanicalFamily: 'Poaceae',
    nitrogenFixing: false,
    typicalWaterProfile: 'Low',
    supportedByRotationEngine: true,
    durationMonths: 4,
    cycleDaysMin: 95,
    cycleDaysMax: 135,
    tempMinC: 22,
    tempMaxC: 35,
    phMin: 5.5,
    phMax: 8.0,
    seasonalRainMinMm: 220,
    seasonalRainMaxMm: 850,
    residueProfile: 'high',
    rootingDepthClass: 'deep',
    waterloggingSensitivity: 'moderate',
    salinityTolerance: 'moderate',
    salinityEcThresholdDsm: 6.8,
    suitableSoilTextures: ['sandy_loam', 'loam', 'silt_loam', 'clay_loam', 'clay'],
  },
  {
    id: 'millet',
    name: 'Pearl millet',
    scientificName: 'Cenchrus americanus',
    commonAliases: ['Bajra', 'Millet', 'Pearl Millet'],
    category: 'Cereal',
    botanicalFamily: 'Poaceae',
    nitrogenFixing: false,
    typicalWaterProfile: 'Low',
    supportedByRotationEngine: true,
    durationMonths: 4,
    cycleDaysMin: 75,
    cycleDaysMax: 115,
    tempMinC: 22,
    tempMaxC: 35,
    phMin: 5.5,
    phMax: 8.0,
    seasonalRainMinMm: 180,
    seasonalRainMaxMm: 750,
    residueProfile: 'moderate',
    rootingDepthClass: 'deep',
    waterloggingSensitivity: 'high',
    salinityTolerance: 'moderate',
    suitableSoilTextures: ['sandy', 'sandy_loam', 'loam'],
  },
  {
    id: 'soybean',
    name: 'Soybean',
    scientificName: 'Glycine max',
    commonAliases: ['Soya', 'Soya Bean'],
    category: 'Legume',
    botanicalFamily: 'Fabaceae',
    nitrogenFixing: true,
    typicalWaterProfile: 'Moderate',
    supportedByRotationEngine: true,
    durationMonths: 4,
    cycleDaysMin: 95,
    cycleDaysMax: 140,
    tempMinC: 18,
    tempMaxC: 30,
    phMin: 6.0,
    phMax: 7.5,
    seasonalRainMinMm: 380,
    seasonalRainMaxMm: 1050,
    residueProfile: 'moderate',
    rootingDepthClass: 'medium',
    waterloggingSensitivity: 'moderate',
    salinityTolerance: 'sensitive',
    salinityEcThresholdDsm: 5.0,
    suitableSoilTextures: ['sandy_loam', 'loam', 'silt_loam', 'clay_loam'],
  },
  {
    id: 'chickpea',
    name: 'Chickpea',
    scientificName: 'Cicer arietinum',
    commonAliases: ['Garbanzo', 'Chana', 'Gram'],
    category: 'Legume',
    botanicalFamily: 'Fabaceae',
    nitrogenFixing: true,
    typicalWaterProfile: 'Low',
    supportedByRotationEngine: true,
    durationMonths: 4,
    cycleDaysMin: 95,
    cycleDaysMax: 145,
    tempMinC: 12,
    tempMaxC: 25,
    phMin: 6.0,
    phMax: 8.0,
    seasonalRainMinMm: 200,
    seasonalRainMaxMm: 650,
    residueProfile: 'low',
    rootingDepthClass: 'deep',
    waterloggingSensitivity: 'high',
    salinityTolerance: 'sensitive',
    suitableSoilTextures: ['sandy_loam', 'loam', 'silt_loam', 'clay_loam'],
  },
  {
    id: 'lentil',
    name: 'Lentil',
    scientificName: 'Lens culinaris',
    commonAliases: ['Masoor', 'Red Lentil'],
    category: 'Legume',
    botanicalFamily: 'Fabaceae',
    nitrogenFixing: true,
    typicalWaterProfile: 'Low',
    supportedByRotationEngine: true,
    durationMonths: 4,
    cycleDaysMin: 90,
    cycleDaysMax: 135,
    tempMinC: 10,
    tempMaxC: 25,
    phMin: 6.0,
    phMax: 8.0,
    seasonalRainMinMm: 200,
    seasonalRainMaxMm: 600,
    residueProfile: 'low',
    rootingDepthClass: 'shallow',
    waterloggingSensitivity: 'high',
    salinityTolerance: 'sensitive',
    suitableSoilTextures: ['sandy_loam', 'loam', 'silt_loam', 'clay_loam'],
  },
  {
    id: 'cowpea',
    name: 'Cowpea',
    scientificName: 'Vigna unguiculata',
    commonAliases: ['Black-eyed Pea', 'Niebe', 'Lobia'],
    category: 'Legume',
    botanicalFamily: 'Fabaceae',
    nitrogenFixing: true,
    typicalWaterProfile: 'Low',
    supportedByRotationEngine: true,
    durationMonths: 3,
    cycleDaysMin: 65,
    cycleDaysMax: 105,
    tempMinC: 20,
    tempMaxC: 35,
    phMin: 5.5,
    phMax: 7.5,
    seasonalRainMinMm: 200,
    seasonalRainMaxMm: 800,
    residueProfile: 'moderate',
    rootingDepthClass: 'medium',
    waterloggingSensitivity: 'high',
    salinityTolerance: 'moderate',
    salinityEcThresholdDsm: 4.9,
    suitableSoilTextures: ['sandy', 'sandy_loam', 'loam', 'silt_loam'],
  },
  {
    id: 'cotton',
    name: 'Cotton',
    scientificName: 'Gossypium hirsutum',
    commonAliases: ['Upland Cotton', 'Kapas'],
    category: 'Oilseed & Fiber',
    botanicalFamily: 'Malvaceae',
    nitrogenFixing: false,
    typicalWaterProfile: 'High',
    supportedByRotationEngine: true,
    durationMonths: 6,
    cycleDaysMin: 150,
    cycleDaysMax: 200,
    tempMinC: 20,
    tempMaxC: 35,
    phMin: 5.8,
    phMax: 8.0,
    seasonalRainMinMm: 450,
    seasonalRainMaxMm: 1300,
    residueProfile: 'moderate',
    rootingDepthClass: 'deep',
    waterloggingSensitivity: 'high',
    salinityTolerance: 'tolerant',
    salinityEcThresholdDsm: 7.7,
    suitableSoilTextures: ['sandy_loam', 'loam', 'silt_loam', 'clay_loam', 'clay'],
  },
  {
    id: 'canola',
    name: 'Canola',
    scientificName: 'Brassica napus',
    commonAliases: ['Rapeseed', 'Mustard Oilseed', 'Sarson'],
    category: 'Oilseed & Fiber',
    botanicalFamily: 'Brassicaceae',
    nitrogenFixing: false,
    typicalWaterProfile: 'Moderate',
    supportedByRotationEngine: true,
    durationMonths: 4,
    cycleDaysMin: 110,
    cycleDaysMax: 240,
    tempMinC: 10,
    tempMaxC: 25,
    phMin: 5.5,
    phMax: 7.5,
    seasonalRainMinMm: 280,
    seasonalRainMaxMm: 800,
    residueProfile: 'moderate',
    rootingDepthClass: 'deep',
    waterloggingSensitivity: 'moderate',
    salinityTolerance: 'moderate',
    suitableSoilTextures: ['sandy_loam', 'loam', 'silt_loam', 'clay_loam'],
  },
  {
    id: 'sunflower',
    name: 'Sunflower',
    scientificName: 'Helianthus annuus',
    commonAliases: ['Oil Sunflower', 'Surajmukhi'],
    category: 'Oilseed & Fiber',
    botanicalFamily: 'Asteraceae',
    nitrogenFixing: false,
    typicalWaterProfile: 'Moderate',
    supportedByRotationEngine: true,
    durationMonths: 4,
    cycleDaysMin: 95,
    cycleDaysMax: 130,
    tempMinC: 17,
    tempMaxC: 32,
    phMin: 6.0,
    phMax: 7.8,
    seasonalRainMinMm: 300,
    seasonalRainMaxMm: 900,
    residueProfile: 'moderate',
    rootingDepthClass: 'deep',
    waterloggingSensitivity: 'moderate',
    salinityTolerance: 'moderate',
    salinityEcThresholdDsm: 4.8,
    suitableSoilTextures: ['sandy_loam', 'loam', 'silt_loam', 'clay_loam', 'clay'],
  },
  {
    id: 'potato',
    name: 'Potato',
    scientificName: 'Solanum tuberosum',
    commonAliases: ['Irish Potato', 'Aloo'],
    category: 'Root & Tuber',
    botanicalFamily: 'Solanaceae',
    nitrogenFixing: false,
    typicalWaterProfile: 'Moderate',
    supportedByRotationEngine: true,
    durationMonths: 4,
    cycleDaysMin: 85,
    cycleDaysMax: 130,
    tempMinC: 12,
    tempMaxC: 23,
    phMin: 5.0,
    phMax: 6.5,
    seasonalRainMinMm: 350,
    seasonalRainMaxMm: 900,
    residueProfile: 'low',
    rootingDepthClass: 'shallow',
    waterloggingSensitivity: 'high',
    salinityTolerance: 'sensitive',
    salinityEcThresholdDsm: 1.7,
    suitableSoilTextures: ['sandy', 'sandy_loam', 'loam', 'silt_loam'],
  },
  {
    id: 'tomato',
    name: 'Tomato',
    scientificName: 'Solanum lycopersicum',
    commonAliases: ['Field Tomato', 'Tamatar'],
    category: 'Horticulture',
    botanicalFamily: 'Solanaceae',
    nitrogenFixing: false,
    typicalWaterProfile: 'Moderate',
    supportedByRotationEngine: true,
    durationMonths: 4,
    cycleDaysMin: 90,
    cycleDaysMax: 135,
    tempMinC: 18,
    tempMaxC: 30,
    phMin: 6.0,
    phMax: 7.0,
    seasonalRainMinMm: 350,
    seasonalRainMaxMm: 950,
    residueProfile: 'low',
    rootingDepthClass: 'medium',
    waterloggingSensitivity: 'high',
    salinityTolerance: 'moderate',
    salinityEcThresholdDsm: 2.5,
    suitableSoilTextures: ['sandy_loam', 'loam', 'silt_loam', 'clay_loam'],
  },
  // Additional global crops (not yet in the 14-crop rotation engine catalog)
  {
    id: 'barley',
    name: 'Barley',
    commonAliases: ['Spring Barley', 'Winter Barley', 'Jau'],
    category: 'Cereal',
    botanicalFamily: 'Poaceae',
    nitrogenFixing: false,
    typicalWaterProfile: 'Low',
    supportedByRotationEngine: false,
  },
  {
    id: 'groundnut',
    name: 'Groundnut (Peanut)',
    commonAliases: ['Peanut', 'Mungphali'],
    category: 'Legume',
    botanicalFamily: 'Fabaceae',
    nitrogenFixing: true,
    typicalWaterProfile: 'Moderate',
    supportedByRotationEngine: false,
  },
  {
    id: 'cassava',
    name: 'Cassava',
    commonAliases: ['Manioc', 'Yuca'],
    category: 'Root & Tuber',
    botanicalFamily: 'Euphorbiaceae',
    nitrogenFixing: false,
    typicalWaterProfile: 'Low',
    supportedByRotationEngine: false,
  },
  {
    id: 'alfalfa',
    name: 'Alfalfa (Lucerne)',
    commonAliases: ['Lucerne', 'Forage Legume'],
    category: 'Forage & Cover',
    botanicalFamily: 'Fabaceae',
    nitrogenFixing: true,
    typicalWaterProfile: 'Moderate',
    supportedByRotationEngine: false,
  },
  {
    id: 'fallow',
    name: 'Fallow / Unplanted',
    commonAliases: ['Rest Period'],
    category: 'Forage & Cover',
    botanicalFamily: 'N/A',
    nitrogenFixing: false,
    typicalWaterProfile: 'Low',
    supportedByRotationEngine: false,
  },
];

const LOCAL_METADATA_BY_ID = new Map(GLOBAL_CROPS.map((c) => [c.id, c]));

const FAMILY_TO_CATEGORY: Record<string, CropCatalogItem['category']> = {
  poaceae: 'Cereal',
  fabaceae: 'Legume',
  malvaceae: 'Oilseed & Fiber',
  brassicaceae: 'Oilseed & Fiber',
  asteraceae: 'Oilseed & Fiber',
  solanaceae: 'Horticulture',
};

const WATER_DISPLAY: Record<'low' | 'medium' | 'high', 'Low' | 'Moderate' | 'High'> = {
  low: 'Low',
  medium: 'Moderate',
  high: 'High',
};

/**
 * Merges live backend crops (/api/v1/rotation/crops) with local common aliases
 * and appends non-engine global history crops (such as Fallow or Barley) clearly flagged.
 */
export function buildCropCatalog(
  backendCrops: RotationCatalogCrop[] | null | undefined,
  includeExtendedHistoryOptions = true
): CropCatalogItem[] {
  if (!backendCrops || backendCrops.length === 0) {
    return includeExtendedHistoryOptions
      ? GLOBAL_CROPS
      : GLOBAL_CROPS.filter((c) => c.supportedByRotationEngine);
  }

  const fromBackend: CropCatalogItem[] = backendCrops.map((bc) => {
    const local = LOCAL_METADATA_BY_ID.get(bc.id);
    const familyLower = bc.family.toLowerCase();
    const formattedFamily =
      bc.family.charAt(0).toUpperCase() + bc.family.slice(1).toLowerCase();

    return {
      id: bc.id,
      name: bc.name,
      commonAliases: local?.commonAliases ?? [],
      category:
        local?.category ?? FAMILY_TO_CATEGORY[familyLower] ?? 'Horticulture',
      botanicalFamily: formattedFamily,
      nitrogenFixing: bc.is_legume ?? local?.nitrogenFixing ?? familyLower === 'fabaceae',
      typicalWaterProfile: WATER_DISPLAY[bc.water_demand] ?? 'Moderate',
      supportedByRotationEngine: true,
      durationMonths: bc.duration_months,
      scientificName: bc.scientific_name ?? local?.scientificName,
      cycleDaysMin: bc.cycle_days_min ?? local?.cycleDaysMin,
      cycleDaysMax: bc.cycle_days_max ?? local?.cycleDaysMax,
      cycleVariabilityNote: bc.cycle_variability_note ?? local?.cycleVariabilityNote,
      tempMinC: bc.temp_min_c ?? local?.tempMinC,
      tempMaxC: bc.temp_max_c ?? local?.tempMaxC,
      tempTolMinC: bc.temp_tol_min_c ?? local?.tempTolMinC,
      tempTolMaxC: bc.temp_tol_max_c ?? local?.tempTolMaxC,
      heatStressThresholdC: bc.heat_stress_threshold_c ?? local?.heatStressThresholdC ?? null,
      frostSensitivity: bc.frost_sensitivity ?? local?.frostSensitivity,
      phMin: bc.ph_min ?? local?.phMin,
      phMax: bc.ph_max ?? local?.phMax,
      seasonalRainMinMm: bc.seasonal_rain_min_mm ?? local?.seasonalRainMinMm,
      seasonalRainMaxMm: bc.seasonal_rain_max_mm ?? local?.seasonalRainMaxMm,
      residueProfile: bc.residue_profile ?? local?.residueProfile,
      rootingDepthClass: bc.rooting_depth_class ?? local?.rootingDepthClass,
      waterloggingSensitivity: bc.waterlogging_sensitivity ?? local?.waterloggingSensitivity,
      salinityTolerance: bc.salinity_tolerance ?? local?.salinityTolerance,
      salinityEcThresholdDsm: bc.salinity_ec_threshold_dsm ?? local?.salinityEcThresholdDsm ?? null,
      suitableSoilTextures: bc.suitable_soil_textures ?? local?.suitableSoilTextures,
      legumeBnfNotes: bc.legume_bnf_notes ?? local?.legumeBnfNotes ?? null,
      residueManagementNotes: bc.residue_management_notes ?? local?.residueManagementNotes,
      successionCautions: bc.succession_cautions ?? local?.successionCautions,
      rotationAdvantages: bc.rotation_advantages ?? local?.rotationAdvantages,
      knownUnknowns: bc.known_unknowns ?? local?.knownUnknowns,
      parameterSources: bc.parameter_sources ?? local?.parameterSources,
    };
  });

  if (!includeExtendedHistoryOptions) {
    return fromBackend;
  }

  const backendIds = new Set(fromBackend.map((c) => c.id));
  const extraHistoryCrops = GLOBAL_CROPS.filter((c) => !backendIds.has(c.id));
  return [...fromBackend, ...extraHistoryCrops];
}

export function normalizeCropIdForBackend(cropId: string): string {
  if (cropId === 'pearl_millet') return 'millet';
  return cropId;
}

export function isEngineSupportedCropId(cropId: string): boolean {
  return BACKEND_SUPPORTED_CROP_IDS.has(normalizeCropIdForBackend(cropId));
}
