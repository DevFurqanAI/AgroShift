import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { getLanguageMeta } from '../i18n/languages';
import {
  activityRepository,
  farmRepository,
  observationRepository,
  rotationPlanRepository,
  settingsRepository,
} from '../services/farms/farmRepository';
import type {
  ClimateHistoryResponse,
  FieldAnalyzeResponse,
  RotationPlanResponse,
  WaterCompareResponse,
} from '../types/api';
import type {
  AppSettings,
  FarmActivityItem,
  FarmProfile,
} from '../types/farm';
import type { RotationPlanDraft } from '../types/planner';

export interface FarmObservationTimestamps {
  climateFetchedAt?: string;
  fieldHealthFetchedAt?: string;
  rotationScreenedAt?: string;
  waterAnalyzedAt?: string;
}

export interface FarmObservationFreshFlags {
  climate?: boolean;
  fieldHealth?: boolean;
  rotation?: boolean;
  water?: boolean;
}

interface AgroShiftContextValue {
  farms: FarmProfile[];
  activeFarm: FarmProfile | null;
  activeFarmId: string | null;
  storageError: string | null;
  plans: RotationPlanDraft[];
  activities: FarmActivityItem[];
  settings: AppSettings;
  latestClimateByFarm: Record<string, ClimateHistoryResponse>;
  latestFieldHealthByFarm: Record<string, FieldAnalyzeResponse>;
  latestRotationByFarm: Record<string, RotationPlanResponse>;
  latestWaterByFarm: Record<string, WaterCompareResponse>;
  observationTimestampsByFarm: Record<string, FarmObservationTimestamps>;
  observationFreshFlagsByFarm: Record<string, FarmObservationFreshFlags>;
  selectFarm: (farmId: string | null) => void;
  saveFarm: (farm: FarmProfile, isEdit?: boolean) => boolean;
  deleteFarm: (farmId: string) => void;
  saveRotationPlan: (plan: RotationPlanDraft) => boolean;
  deleteRotationPlan: (planId: string) => void;
  updateSettings: (partial: Partial<AppSettings>) => void;
  clearLocalData: () => void;
  recordClimateObservation: (farmId: string, data: ClimateHistoryResponse) => void;
  recordFieldHealthObservation: (farmId: string, data: FieldAnalyzeResponse) => void;
  recordRotationResult: (farmId: string, data: RotationPlanResponse) => void;
  recordWaterResult: (farmId: string, data: WaterCompareResponse) => void;
}

const AgroShiftContext = createContext<AgroShiftContextValue | null>(null);

function extractInitialObservations() {
  const persisted = observationRepository.loadByFarm().data;
  const climate: Record<string, ClimateHistoryResponse> = {};
  const fieldHealth: Record<string, FieldAnalyzeResponse> = {};
  const rotation: Record<string, RotationPlanResponse> = {};
  const water: Record<string, WaterCompareResponse> = {};
  const timestamps: Record<string, FarmObservationTimestamps> = {};

  for (const [farmId, entry] of Object.entries(persisted)) {
    if (!entry || typeof entry !== 'object') continue;
    if (entry.climate) climate[farmId] = entry.climate;
    if (entry.fieldHealth) fieldHealth[farmId] = entry.fieldHealth;
    if (entry.rotation) rotation[farmId] = entry.rotation;
    if (entry.water) water[farmId] = entry.water;
    if (
      entry.climateFetchedAt ||
      entry.fieldHealthFetchedAt ||
      entry.rotationScreenedAt ||
      entry.waterAnalyzedAt
    ) {
      timestamps[farmId] = {
        climateFetchedAt: entry.climateFetchedAt,
        fieldHealthFetchedAt: entry.fieldHealthFetchedAt,
        rotationScreenedAt: entry.rotationScreenedAt,
        waterAnalyzedAt: entry.waterAnalyzedAt,
      };
    }
  }
  return { climate, fieldHealth, rotation, water, timestamps };
}

export function AgroShiftProvider({ children }: { children: React.ReactNode }) {
  const [farms, setFarms] = useState<FarmProfile[]>(() => farmRepository.listFarms().data);
  const [storageError, setStorageError] = useState<string | null>(
    () => farmRepository.listFarms().storageError
  );
  const [activeFarmId, setActiveFarmId] = useState<string | null>(() => {
    const saved = farmRepository.getActiveFarmId();
    const list = farmRepository.listFarms().data;
    if (saved && list.some((f) => f.id === saved)) return saved;
    return list[0]?.id ?? null;
  });
  const [plans, setPlans] = useState<RotationPlanDraft[]>(
    () => rotationPlanRepository.listPlans().data
  );
  const [activities, setActivities] = useState<FarmActivityItem[]>(
    () => activityRepository.listActivity().data
  );
  const [settings, setSettings] = useState<AppSettings>(() => settingsRepository.load());

  const initialObs = useMemo(() => extractInitialObservations(), []);
  const [latestClimateByFarm, setLatestClimateByFarm] = useState<
    Record<string, ClimateHistoryResponse>
  >(initialObs.climate);
  const [latestFieldHealthByFarm, setLatestFieldHealthByFarm] = useState<
    Record<string, FieldAnalyzeResponse>
  >(initialObs.fieldHealth);
  const [latestRotationByFarm, setLatestRotationByFarm] = useState<
    Record<string, RotationPlanResponse>
  >(initialObs.rotation);
  const [latestWaterByFarm, setLatestWaterByFarm] = useState<
    Record<string, WaterCompareResponse>
  >(initialObs.water);
  const [observationTimestampsByFarm, setObservationTimestampsByFarm] = useState<
    Record<string, FarmObservationTimestamps>
  >(initialObs.timestamps);
  const [observationFreshFlagsByFarm, setObservationFreshFlagsByFarm] = useState<
    Record<string, FarmObservationFreshFlags>
  >({});

  // Sync light/dark class and language direction on document.documentElement
  useEffect(() => {
    const root = document.documentElement;
    if (settings.theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    const langMeta = getLanguageMeta(settings.language);
    root.lang = langMeta.code;
    root.dir = langMeta.dir;
  }, [settings.theme, settings.language]);

  const activeFarm = useMemo(
    () => farms.find((f) => f.id === activeFarmId) ?? farms[0] ?? null,
    [farms, activeFarmId]
  );

  const selectFarm = useCallback((farmId: string | null) => {
    setActiveFarmId(farmId);
    const err = farmRepository.setActiveFarmId(farmId);
    if (err) setStorageError(err);
  }, []);

  const saveFarm = useCallback((farm: FarmProfile, isEdit = false) => {
    const res = farmRepository.saveFarm(farm);
    setFarms(res.data);
    setStorageError(res.storageError);
    setActiveFarmId(farm.id);
    farmRepository.setActiveFarmId(farm.id);

    activityRepository.logActivity({
      farmId: farm.id,
      farmName: farm.details.name,
      action: isEdit ? 'Updated farm profile' : 'Created farm profile',
    });
    setActivities(activityRepository.listActivity().data);

    return !res.storageError;
  }, []);

  const deleteFarm = useCallback(
    (farmId: string) => {
      const target = farms.find((f) => f.id === farmId);
      const res = farmRepository.deleteFarm(farmId);
      setFarms(res.data);
      setStorageError(res.storageError);
      const nextActive = farmRepository.getActiveFarmId();
      setActiveFarmId(nextActive);

      setLatestClimateByFarm((prev) => {
        const copy = { ...prev };
        delete copy[farmId];
        return copy;
      });
      setLatestFieldHealthByFarm((prev) => {
        const copy = { ...prev };
        delete copy[farmId];
        return copy;
      });
      setLatestRotationByFarm((prev) => {
        const copy = { ...prev };
        delete copy[farmId];
        return copy;
      });
      setLatestWaterByFarm((prev) => {
        const copy = { ...prev };
        delete copy[farmId];
        return copy;
      });
      setObservationTimestampsByFarm((prev) => {
        const copy = { ...prev };
        delete copy[farmId];
        return copy;
      });
      setObservationFreshFlagsByFarm((prev) => {
        const copy = { ...prev };
        delete copy[farmId];
        return copy;
      });

      if (target) {
        activityRepository.logActivity({
          farmId,
          farmName: target.details.name,
          action: 'Removed farm profile',
        });
        setActivities(activityRepository.listActivity().data);
      }
    },
    [farms]
  );

  const saveRotationPlan = useCallback((plan: RotationPlanDraft) => {
    const res = rotationPlanRepository.savePlan(plan);
    setPlans(res.data);
    setStorageError(res.storageError);
    activityRepository.logActivity({
      farmId: plan.farmId,
      farmName: plan.farmName,
      action: `Saved rotation plan: ${plan.title}`,
    });
    setActivities(activityRepository.listActivity().data);
    return !res.storageError;
  }, []);

  const deleteRotationPlan = useCallback((planId: string) => {
    const res = rotationPlanRepository.deletePlan(planId);
    setPlans(res.data);
    setStorageError(res.storageError);
  }, []);

  const updateSettings = useCallback((partial: Partial<AppSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...partial };
      const err = settingsRepository.save(next);
      if (err) setStorageError(err);
      return next;
    });
  }, []);

  const clearLocalData = useCallback(() => {
    const err = farmRepository.clearAll();
    setStorageError(err);
    setFarms([]);
    setActiveFarmId(null);
    setPlans([]);
    setActivities([]);
    setLatestClimateByFarm({});
    setLatestFieldHealthByFarm({});
    setLatestRotationByFarm({});
    setLatestWaterByFarm({});
    setObservationTimestampsByFarm({});
    setObservationFreshFlagsByFarm({});
  }, []);

  const recordClimateObservation = useCallback(
    (farmId: string, data: ClimateHistoryResponse) => {
      const now = new Date().toISOString();
      observationRepository.saveEntry(farmId, { climate: data, climateFetchedAt: now });
      setLatestClimateByFarm((prev) => ({ ...prev, [farmId]: data }));
      setObservationTimestampsByFarm((prev) => ({
        ...prev,
        [farmId]: { ...prev[farmId], climateFetchedAt: now },
      }));
      setObservationFreshFlagsByFarm((prev) => ({
        ...prev,
        [farmId]: { ...prev[farmId], climate: true },
      }));
    },
    []
  );

  const recordFieldHealthObservation = useCallback(
    (farmId: string, data: FieldAnalyzeResponse) => {
      const now = new Date().toISOString();
      observationRepository.saveEntry(farmId, { fieldHealth: data, fieldHealthFetchedAt: now });
      setLatestFieldHealthByFarm((prev) => ({ ...prev, [farmId]: data }));
      setObservationTimestampsByFarm((prev) => ({
        ...prev,
        [farmId]: { ...prev[farmId], fieldHealthFetchedAt: now },
      }));
      setObservationFreshFlagsByFarm((prev) => ({
        ...prev,
        [farmId]: { ...prev[farmId], fieldHealth: true },
      }));
    },
    []
  );

  const recordRotationResult = useCallback(
    (farmId: string, data: RotationPlanResponse) => {
      const now = new Date().toISOString();
      observationRepository.saveEntry(farmId, { rotation: data, rotationScreenedAt: now });
      setLatestRotationByFarm((prev) => ({ ...prev, [farmId]: data }));
      setObservationTimestampsByFarm((prev) => ({
        ...prev,
        [farmId]: { ...prev[farmId], rotationScreenedAt: now },
      }));
      setObservationFreshFlagsByFarm((prev) => ({
        ...prev,
        [farmId]: { ...prev[farmId], rotation: true },
      }));
    },
    []
  );

  const recordWaterResult = useCallback(
    (farmId: string, data: WaterCompareResponse) => {
      const now = new Date().toISOString();
      observationRepository.saveEntry(farmId, { water: data, waterAnalyzedAt: now });
      setLatestWaterByFarm((prev) => ({ ...prev, [farmId]: data }));
      setObservationTimestampsByFarm((prev) => ({
        ...prev,
        [farmId]: { ...prev[farmId], waterAnalyzedAt: now },
      }));
      setObservationFreshFlagsByFarm((prev) => ({
        ...prev,
        [farmId]: { ...prev[farmId], water: true },
      }));
    },
    []
  );

  const value: AgroShiftContextValue = {
    farms,
    activeFarm,
    activeFarmId: activeFarm?.id ?? null,
    storageError,
    plans,
    activities,
    settings,
    latestClimateByFarm,
    latestFieldHealthByFarm,
    latestRotationByFarm,
    latestWaterByFarm,
    observationTimestampsByFarm,
    observationFreshFlagsByFarm,
    selectFarm,
    saveFarm,
    deleteFarm,
    saveRotationPlan,
    deleteRotationPlan,
    updateSettings,
    clearLocalData,
    recordClimateObservation,
    recordFieldHealthObservation,
    recordRotationResult,
    recordWaterResult,
  };

  return (
    <AgroShiftContext.Provider value={value}>{children}</AgroShiftContext.Provider>
  );
}

export function useAgroShift(): AgroShiftContextValue {
  const ctx = useContext(AgroShiftContext);
  if (!ctx) {
    throw new Error('useAgroShift must be used inside AgroShiftProvider');
  }
  return ctx;
}
