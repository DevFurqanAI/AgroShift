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
    commonAliases: ['Winter Wheat', 'Spring Wheat', 'Durum', 'Gandum'],
    category: 'Cereal',
    botanicalFamily: 'Poaceae',
    nitrogenFixing: false,
    typicalWaterProfile: 'Moderate',
    supportedByRotationEngine: true,
    durationMonths: 5,
  },
  {
    id: 'maize',
    name: 'Maize',
    commonAliases: ['Corn', 'Field Corn', 'Sweet Corn', 'Makai'],
    category: 'Cereal',
    botanicalFamily: 'Poaceae',
    nitrogenFixing: false,
    typicalWaterProfile: 'Moderate',
    supportedByRotationEngine: true,
    durationMonths: 4,
  },
  {
    id: 'rice',
    name: 'Rice',
    commonAliases: ['Paddy', 'Upland Rice', 'Chawal'],
    category: 'Cereal',
    botanicalFamily: 'Poaceae',
    nitrogenFixing: false,
    typicalWaterProfile: 'High',
    supportedByRotationEngine: true,
    durationMonths: 5,
  },
  {
    id: 'sorghum',
    name: 'Sorghum',
    commonAliases: ['Jowar', 'Milo', 'Guinea Corn'],
    category: 'Cereal',
    botanicalFamily: 'Poaceae',
    nitrogenFixing: false,
    typicalWaterProfile: 'Low',
    supportedByRotationEngine: true,
    durationMonths: 4,
  },
  {
    id: 'millet',
    name: 'Pearl millet',
    commonAliases: ['Bajra', 'Millet', 'Pearl Millet'],
    category: 'Cereal',
    botanicalFamily: 'Poaceae',
    nitrogenFixing: false,
    typicalWaterProfile: 'Low',
    supportedByRotationEngine: true,
    durationMonths: 4,
  },
  {
    id: 'soybean',
    name: 'Soybean',
    commonAliases: ['Soya', 'Soya Bean'],
    category: 'Legume',
    botanicalFamily: 'Fabaceae',
    nitrogenFixing: true,
    typicalWaterProfile: 'Moderate',
    supportedByRotationEngine: true,
    durationMonths: 4,
  },
  {
    id: 'chickpea',
    name: 'Chickpea',
    commonAliases: ['Garbanzo', 'Chana', 'Gram'],
    category: 'Legume',
    botanicalFamily: 'Fabaceae',
    nitrogenFixing: true,
    typicalWaterProfile: 'Low',
    supportedByRotationEngine: true,
    durationMonths: 4,
  },
  {
    id: 'lentil',
    name: 'Lentil',
    commonAliases: ['Masoor', 'Red Lentil'],
    category: 'Legume',
    botanicalFamily: 'Fabaceae',
    nitrogenFixing: true,
    typicalWaterProfile: 'Low',
    supportedByRotationEngine: true,
    durationMonths: 4,
  },
  {
    id: 'cowpea',
    name: 'Cowpea',
    commonAliases: ['Black-eyed Pea', 'Niebe', 'Lobia'],
    category: 'Legume',
    botanicalFamily: 'Fabaceae',
    nitrogenFixing: true,
    typicalWaterProfile: 'Low',
    supportedByRotationEngine: true,
    durationMonths: 3,
  },
  {
    id: 'cotton',
    name: 'Cotton',
    commonAliases: ['Upland Cotton', 'Kapas'],
    category: 'Oilseed & Fiber',
    botanicalFamily: 'Malvaceae',
    nitrogenFixing: false,
    typicalWaterProfile: 'High',
    supportedByRotationEngine: true,
    durationMonths: 6,
  },
  {
    id: 'canola',
    name: 'Canola',
    commonAliases: ['Rapeseed', 'Mustard Oilseed', 'Sarson'],
    category: 'Oilseed & Fiber',
    botanicalFamily: 'Brassicaceae',
    nitrogenFixing: false,
    typicalWaterProfile: 'Moderate',
    supportedByRotationEngine: true,
    durationMonths: 4,
  },
  {
    id: 'sunflower',
    name: 'Sunflower',
    commonAliases: ['Oil Sunflower', 'Surajmukhi'],
    category: 'Oilseed & Fiber',
    botanicalFamily: 'Asteraceae',
    nitrogenFixing: false,
    typicalWaterProfile: 'Moderate',
    supportedByRotationEngine: true,
    durationMonths: 4,
  },
  {
    id: 'potato',
    name: 'Potato',
    commonAliases: ['Irish Potato', 'Aloo'],
    category: 'Root & Tuber',
    botanicalFamily: 'Solanaceae',
    nitrogenFixing: false,
    typicalWaterProfile: 'Moderate',
    supportedByRotationEngine: true,
    durationMonths: 4,
  },
  {
    id: 'tomato',
    name: 'Tomato',
    commonAliases: ['Field Tomato', 'Tamatar'],
    category: 'Horticulture',
    botanicalFamily: 'Solanaceae',
    nitrogenFixing: false,
    typicalWaterProfile: 'Moderate',
    supportedByRotationEngine: true,
    durationMonths: 4,
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
      nitrogenFixing: local?.nitrogenFixing ?? familyLower === 'fabaceae',
      typicalWaterProfile: WATER_DISPLAY[bc.water_demand] ?? 'Moderate',
      supportedByRotationEngine: true,
      durationMonths: bc.duration_months,
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
