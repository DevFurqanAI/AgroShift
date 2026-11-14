import { normalizeCropIdForBackend } from '../../data/crops';
import type {
  ClimateHistoryResponse,
  FieldAnalyzeResponse,
  RotationPlanResponse,
  WaterCompareResponse,
} from '../../types/api';
import type {
  AppSettings,
  FarmActivityItem,
  FarmProfile,
  SeasonCropEntry,
} from '../../types/farm';
import type { RotationPlanDraft } from '../../types/planner';

const FARMS_STORAGE_KEY = 'agroshift.farms.v1';
const ACTIVE_FARM_KEY = 'agroshift.activeFarmId.v1';
const PLANS_STORAGE_KEY = 'agroshift.rotationPlans.v1';
const ACTIVITY_STORAGE_KEY = 'agroshift.activity.v1';
const SETTINGS_STORAGE_KEY = 'agroshift.settings.v1';
const OBSERVATIONS_STORAGE_KEY = 'agroshift.observations.v1';
const OBSERVATIONS_SCHEMA_VERSION = 1;

export interface PersistedFarmObservations {
  schemaVersion?: number;
  climate?: ClimateHistoryResponse;
  climateFetchedAt?: string;
  fieldHealth?: FieldAnalyzeResponse;
  fieldHealthFetchedAt?: string;
  rotation?: RotationPlanResponse;
  rotationScreenedAt?: string;
  water?: WaterCompareResponse;
  waterAnalyzedAt?: string;
}

export interface StorageResult<T> {
  data: T;
  storageError: string | null;
}

function safeReadJson<T>(key: string, fallback: T): StorageResult<T> {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return { data: fallback, storageError: null };
    return { data: JSON.parse(raw) as T, storageError: null };
  } catch (err) {
    return {
      data: fallback,
      storageError:
        err instanceof Error ? err.message : 'Unable to read from browser local storage.',
    };
  }
}

function safeWriteJson<T>(key: string, value: T): string | null {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
    return null;
  } catch (err) {
    return err instanceof Error
      ? err.message
      : 'Unable to save to browser local storage (storage may be full or restricted).';
  }
}

function normalizeFarmProfile(farm: FarmProfile): FarmProfile {
  const normalizedPrevId = normalizeCropIdForBackend(farm.history?.previousCropId || 'custom');
  const existingSeasons = farm.history?.seasons;

  const seasons: SeasonCropEntry[] =
    Array.isArray(existingSeasons) && existingSeasons.length > 0
      ? existingSeasons.map((s) => ({
          ...s,
          cropId: normalizeCropIdForBackend(s.cropId),
        }))
      : [
          {
            id: 'season-1',
            cropId: normalizedPrevId,
            cropName: farm.history?.previousCropName || 'Unknown',
            isCustomOther: normalizedPrevId === 'custom',
            plantingDate: farm.history?.typicalPlantingWindow || undefined,
            harvestDate: farm.history?.typicalHarvestWindow || undefined,
          },
          ...(farm.history?.earlierCrops || []).map((name, idx) => ({
            id: `season-legacy-${idx + 2}`,
            cropId: 'custom',
            cropName: name,
            isCustomOther: true,
          })),
        ];

  return {
    ...farm,
    location: {
      ...farm.location,
      resolutionStatus:
        farm.location.resolutionStatus ??
        (farm.location.country ? 'resolved' : 'unresolved'),
    },
    details: {
      ...farm.details,
      areaSource: farm.details.areaSource ?? 'manual',
      rainfallReliability: farm.details.rainfallReliability ?? 'unknown',
    },
    soil: {
      ...farm.soil,
      knowledgeLevel:
        farm.soil.knowledgeLevel ??
        (farm.soil.hasLabSoilTest
          ? 'lab_test'
          : farm.soil.texture !== 'unknown' ||
              farm.soil.drainage !== 'unknown' ||
              farm.soil.ph !== null ||
              Boolean(farm.soil.observations)
            ? 'some_details'
            : 'unsure'),
      salinityConcern: farm.soil.salinityConcern ?? 'unknown',
    },
    history: {
      ...farm.history,
      previousCropId: normalizedPrevId,
      seasons,
    },
  };
}

export interface FarmRepository {
  listFarms(): StorageResult<FarmProfile[]>;
  saveFarm(farm: FarmProfile): StorageResult<FarmProfile[]>;
  deleteFarm(farmId: string): StorageResult<FarmProfile[]>;
  getActiveFarmId(): string | null;
  setActiveFarmId(farmId: string | null): string | null;
  clearAll(): string | null;
}

export const farmRepository: FarmRepository = {
  listFarms() {
    const result = safeReadJson<FarmProfile[]>(FARMS_STORAGE_KEY, []);
    if (!Array.isArray(result.data)) {
      return { data: [], storageError: result.storageError };
    }
    return {
      data: result.data.map(normalizeFarmProfile),
      storageError: result.storageError,
    };
  },

  saveFarm(farm: FarmProfile) {
    const normalized = normalizeFarmProfile(farm);
    const current = this.listFarms();
    const exists = current.data.some((item) => item.id === normalized.id);
    const updated = exists
      ? current.data.map((item) => (item.id === normalized.id ? normalized : item))
      : [normalized, ...current.data];
    const err = safeWriteJson(FARMS_STORAGE_KEY, updated);
    return { data: updated, storageError: err };
  },

  deleteFarm(farmId: string) {
    const current = this.listFarms();
    const updated = current.data.filter((item) => item.id !== farmId);
    const err = safeWriteJson(FARMS_STORAGE_KEY, updated);
    observationRepository.deleteFarmObservations(farmId);
    if (this.getActiveFarmId() === farmId) {
      this.setActiveFarmId(updated[0]?.id ?? null);
    }
    return { data: updated, storageError: err };
  },

  getActiveFarmId() {
    try {
      return window.localStorage.getItem(ACTIVE_FARM_KEY);
    } catch {
      return null;
    }
  },

  setActiveFarmId(farmId: string | null) {
    try {
      if (farmId) {
        window.localStorage.setItem(ACTIVE_FARM_KEY, farmId);
      } else {
        window.localStorage.removeItem(ACTIVE_FARM_KEY);
      }
      return null;
    } catch (err) {
      return err instanceof Error ? err.message : 'Storage write failed';
    }
  },

  clearAll() {
    try {
      window.localStorage.removeItem(FARMS_STORAGE_KEY);
      window.localStorage.removeItem(ACTIVE_FARM_KEY);
      window.localStorage.removeItem(PLANS_STORAGE_KEY);
      window.localStorage.removeItem(ACTIVITY_STORAGE_KEY);
      window.localStorage.removeItem(OBSERVATIONS_STORAGE_KEY);
      return null;
    } catch (err) {
      return err instanceof Error ? err.message : 'Unable to clear local storage.';
    }
  },
};

interface PersistedObservationsEnvelope {
  version: number;
  byFarm: Record<string, PersistedFarmObservations>;
}

export const observationRepository = {
  loadByFarm(): StorageResult<Record<string, PersistedFarmObservations>> {
    const res = safeReadJson<Partial<PersistedObservationsEnvelope> | null>(
      OBSERVATIONS_STORAGE_KEY,
      null
    );
    if (
      !res.data ||
      typeof res.data !== 'object' ||
      res.data.version !== OBSERVATIONS_SCHEMA_VERSION ||
      !res.data.byFarm ||
      typeof res.data.byFarm !== 'object'
    ) {
      return { data: {}, storageError: res.storageError };
    }
    return {
      data: res.data.byFarm,
      storageError: res.storageError,
    };
  },

  saveEntry(
    farmId: string,
    patch: Partial<PersistedFarmObservations>
  ): StorageResult<Record<string, PersistedFarmObservations>> {
    const current = this.loadByFarm().data;
    const updated: Record<string, PersistedFarmObservations> = {
      ...current,
      [farmId]: {
        ...current[farmId],
        ...patch,
        schemaVersion: OBSERVATIONS_SCHEMA_VERSION,
      },
    };
    const err = safeWriteJson<PersistedObservationsEnvelope>(OBSERVATIONS_STORAGE_KEY, {
      version: OBSERVATIONS_SCHEMA_VERSION,
      byFarm: updated,
    });
    return { data: updated, storageError: err };
  },

  deleteFarmObservations(farmId: string): string | null {
    const current = this.loadByFarm().data;
    if (!(farmId in current)) return null;
    const next = { ...current };
    delete next[farmId];
    return safeWriteJson<PersistedObservationsEnvelope>(OBSERVATIONS_STORAGE_KEY, {
      version: OBSERVATIONS_SCHEMA_VERSION,
      byFarm: next,
    });
  },
};

export const rotationPlanRepository = {
  listPlans(): StorageResult<RotationPlanDraft[]> {
    const res = safeReadJson<RotationPlanDraft[]>(PLANS_STORAGE_KEY, []);
    return {
      data: Array.isArray(res.data) ? res.data : [],
      storageError: res.storageError,
    };
  },

  savePlan(plan: RotationPlanDraft): StorageResult<RotationPlanDraft[]> {
    const current = this.listPlans();
    const exists = current.data.some((p) => p.id === plan.id);
    const updated = exists
      ? current.data.map((p) => (p.id === plan.id ? plan : p))
      : [plan, ...current.data];
    const err = safeWriteJson(PLANS_STORAGE_KEY, updated);
    return { data: updated, storageError: err };
  },

  deletePlan(planId: string): StorageResult<RotationPlanDraft[]> {
    const current = this.listPlans();
    const updated = current.data.filter((p) => p.id !== planId);
    const err = safeWriteJson(PLANS_STORAGE_KEY, updated);
    return { data: updated, storageError: err };
  },
};

export const activityRepository = {
  listActivity(): StorageResult<FarmActivityItem[]> {
    const res = safeReadJson<FarmActivityItem[]>(ACTIVITY_STORAGE_KEY, []);
    return {
      data: Array.isArray(res.data) ? res.data : [],
      storageError: res.storageError,
    };
  },

  logActivity(item: Omit<FarmActivityItem, 'id' | 'timestamp'>): void {
    const current = this.listActivity();
    const entry: FarmActivityItem = {
      ...item,
      id: `act-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      timestamp: new Date().toISOString(),
    };
    const updated = [entry, ...current.data].slice(0, 25);
    safeWriteJson(ACTIVITY_STORAGE_KEY, updated);
  },
};

export const DEFAULT_SETTINGS: AppSettings = {
  language: 'en',
  areaUnit: 'hectares',
  temperatureUnit: 'celsius',
  theme: 'light',
};

export const settingsRepository = {
  load(): AppSettings {
    const res = safeReadJson<Partial<AppSettings & { customApiBaseUrl?: string }>>(
      SETTINGS_STORAGE_KEY,
      {}
    );
    const merged = {
      ...DEFAULT_SETTINGS,
      ...res.data,
    };
    return {
      language: merged.language,
      areaUnit: merged.areaUnit,
      temperatureUnit: merged.temperatureUnit,
      theme: merged.theme,
    };
  },

  save(settings: AppSettings): string | null {
    return safeWriteJson(SETTINGS_STORAGE_KEY, {
      language: settings.language,
      areaUnit: settings.areaUnit,
      temperatureUnit: settings.temperatureUnit,
      theme: settings.theme,
    });
  },
};
