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
  checkBackendHealth,
  resolveApiConnection,
} from '../services/api/agroshiftApi';
import {
  activityRepository,
  farmRepository,
  rotationPlanRepository,
  settingsRepository,
} from '../services/farms/farmRepository';
import type {
  ApiConnectionInfo,
  BackendHealthResponse,
  ClimateHistoryResponse,
  FieldAnalyzeResponse,
} from '../types/api';
import type {
  AppSettings,
  FarmActivityItem,
  FarmProfile,
} from '../types/farm';
import type { RotationPlanDraft } from '../types/planner';

interface BackendStatusState {
  connection: ApiConnectionInfo;
  state: 'not_configured' | 'checking' | 'connected' | 'unreachable';
  healthData: BackendHealthResponse | null;
  errorMessage: string | null;
  checkedAt: string | null;
}

interface AgroShiftContextValue {
  farms: FarmProfile[];
  activeFarm: FarmProfile | null;
  activeFarmId: string | null;
  storageError: string | null;
  plans: RotationPlanDraft[];
  activities: FarmActivityItem[];
  settings: AppSettings;
  backendStatus: BackendStatusState;
  latestClimateByFarm: Record<string, ClimateHistoryResponse>;
  latestFieldHealthByFarm: Record<string, FieldAnalyzeResponse>;
  selectFarm: (farmId: string | null) => void;
  saveFarm: (farm: FarmProfile, isEdit?: boolean) => boolean;
  deleteFarm: (farmId: string) => void;
  saveRotationPlan: (plan: RotationPlanDraft) => boolean;
  deleteRotationPlan: (planId: string) => void;
  updateSettings: (partial: Partial<AppSettings>) => void;
  clearLocalData: () => void;
  refreshBackendHealth: () => Promise<void>;
  recordClimateObservation: (farmId: string, data: ClimateHistoryResponse) => void;
  recordFieldHealthObservation: (farmId: string, data: FieldAnalyzeResponse) => void;
}

const AgroShiftContext = createContext<AgroShiftContextValue | null>(null);

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
  const [latestClimateByFarm, setLatestClimateByFarm] = useState<
    Record<string, ClimateHistoryResponse>
  >({});
  const [latestFieldHealthByFarm, setLatestFieldHealthByFarm] = useState<
    Record<string, FieldAnalyzeResponse>
  >({});

  const connection = useMemo(
    () => resolveApiConnection(settings.customApiBaseUrl),
    [settings.customApiBaseUrl]
  );

  const [backendStatus, setBackendStatus] = useState<BackendStatusState>({
    connection,
    state: connection.configured ? 'checking' : 'not_configured',
    healthData: null,
    errorMessage: null,
    checkedAt: null,
  });

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

  const refreshBackendHealth = useCallback(async () => {
    const conn = resolveApiConnection(settings.customApiBaseUrl);
    if (!conn.configured) {
      setBackendStatus({
        connection: conn,
        state: 'not_configured',
        healthData: null,
        errorMessage:
          'FastAPI backend URL is not configured (VITE_API_BASE_URL is unset).',
        checkedAt: new Date().toISOString(),
      });
      return;
    }

    setBackendStatus((prev) => ({
      ...prev,
      connection: conn,
      state: 'checking',
      errorMessage: null,
    }));

    try {
      const data = await checkBackendHealth(conn.baseUrl);
      setBackendStatus({
        connection: conn,
        state: 'connected',
        healthData: data,
        errorMessage: null,
        checkedAt: new Date().toISOString(),
      });
    } catch (err) {
      setBackendStatus({
        connection: conn,
        state: 'unreachable',
        healthData: null,
        errorMessage:
          err instanceof Error ? err.message : 'Unable to reach FastAPI backend.',
        checkedAt: new Date().toISOString(),
      });
    }
  }, [settings.customApiBaseUrl]);

  useEffect(() => {
    refreshBackendHealth();
  }, [refreshBackendHealth]);

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
      action: `Saved rotation planning draft: ${plan.title}`,
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
  }, []);

  const recordClimateObservation = useCallback(
    (farmId: string, data: ClimateHistoryResponse) => {
      setLatestClimateByFarm((prev) => ({ ...prev, [farmId]: data }));
    },
    []
  );

  const recordFieldHealthObservation = useCallback(
    (farmId: string, data: FieldAnalyzeResponse) => {
      setLatestFieldHealthByFarm((prev) => ({ ...prev, [farmId]: data }));
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
    backendStatus,
    latestClimateByFarm,
    latestFieldHealthByFarm,
    selectFarm,
    saveFarm,
    deleteFarm,
    saveRotationPlan,
    deleteRotationPlan,
    updateSettings,
    clearLocalData,
    refreshBackendHealth,
    recordClimateObservation,
    recordFieldHealthObservation,
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
