import { useMutation, useQuery } from '@tanstack/react-query';
import { useAgroShift } from '../context/AgroShiftContext';
import {
  compareRotationWater,
  fetchRotationCrops,
  fetchRotationPlan,
  fetchScenarioComparison,
  resolveApiBaseUrl,
} from '../services/api/agroshiftApi';
import type {
  RotationCropsResponse,
  RotationPlanRequest,
  RotationPlanResponse,
  ScenarioComparisonResponse,
  ScenarioRotationRequest,
  WaterCompareRequest,
  WaterCompareResponse,
} from '../types/api';

export function useRotationCrops() {
  const baseUrl = resolveApiBaseUrl();
  return useQuery<RotationCropsResponse, Error>({
    queryKey: ['rotation-crops', baseUrl],
    queryFn: ({ signal }) => fetchRotationCrops(signal, baseUrl),
    staleTime: 1000 * 60 * 60,
    retry: 1,
  });
}

export function useRotationPlanMutation(farmId: string | undefined) {
  const { recordRotationResult } = useAgroShift();

  return useMutation<RotationPlanResponse, Error, RotationPlanRequest>({
    mutationFn: async (request) => {
      const result = await fetchRotationPlan(request, undefined, resolveApiBaseUrl());
      if (farmId) {
        recordRotationResult(farmId, result);
      }
      return result;
    },
  });
}

export function useScenarioComparisonMutation() {
  return useMutation<ScenarioComparisonResponse, Error, ScenarioRotationRequest>({
    mutationFn: async (request) =>
      fetchScenarioComparison(request, undefined, resolveApiBaseUrl()),
  });
}

export function useWaterComparisonMutation(farmId: string | undefined) {
  const { recordWaterResult } = useAgroShift();

  return useMutation<WaterCompareResponse, Error, WaterCompareRequest>({
    mutationFn: async (request) => {
      const result = await compareRotationWater(request, undefined, resolveApiBaseUrl());
      if (farmId) {
        recordWaterResult(farmId, result);
      }
      return result;
    },
  });
}
