import { useMutation, useQuery } from '@tanstack/react-query';
import { useAgroShift } from '../context/AgroShiftContext';
import {
  fetchRotationCrops,
  fetchRotationPlan,
  resolveApiBaseUrl,
} from '../services/api/agroshiftApi';
import type {
  RotationCropsResponse,
  RotationPlanRequest,
  RotationPlanResponse,
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
