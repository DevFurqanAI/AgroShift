import type {
  AppSettings,
  FarmActivityItem,
  FarmProfile,
} from '../../types/farm';
import type { RotationPlanDraft } from '../../types/planner';

const FARMS_STORAGE_KEY = 'agroshift.farms.v1';
const ACTIVE_FARM_KEY = 'agroshift.activeFarmId.v1';
const PLANS_STORAGE_KEY = 'agroshift.rotationPlans.v1';
const ACTIVITY_STORAGE_KEY = 'agroshift.activity.v1';
const SETTINGS_STORAGE_KEY = 'agroshift.settings.v1';

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
    return result;
  },

  saveFarm(farm: FarmProfile) {
    const current = this.listFarms();
    const exists = current.data.some((item) => item.id === farm.id);
    const updated = exists
      ? current.data.map((item) => (item.id === farm.id ? farm : item))
      : [farm, ...current.data];
    const err = safeWriteJson(FARMS_STORAGE_KEY, updated);
    return { data: updated, storageError: err };
  },

  deleteFarm(farmId: string) {
    const current = this.listFarms();
    const updated = current.data.filter((item) => item.id !== farmId);
    const err = safeWriteJson(FARMS_STORAGE_KEY, updated);
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
      return null;
    } catch (err) {
      return err instanceof Error ? err.message : 'Unable to clear local storage.';
    }
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
  customApiBaseUrl: '',
};

export const settingsRepository = {
  load(): AppSettings {
    const res = safeReadJson<Partial<AppSettings>>(SETTINGS_STORAGE_KEY, {});
    return {
      ...DEFAULT_SETTINGS,
      ...res.data,
    };
  },

  save(settings: AppSettings): string | null {
    return safeWriteJson(SETTINGS_STORAGE_KEY, settings);
  },
};
