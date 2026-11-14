import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useAgroShift } from '../context/AgroShiftContext';
import { fetchClimateHistory } from '../services/api/agroshiftApi';
import type { ClimateHistoryResponse } from '../types/api';

interface UseClimateHistoryParams {
  farmId: string | undefined;
  latitude: number | undefined;
  longitude: number | undefined;
  startYear: number;
  endYear: number;
  enabled: boolean;
}

export function useClimateHistory({
  farmId,
  latitude,
  longitude,
  startYear,
  endYear,
  enabled,
}: UseClimateHistoryParams) {
  const { backendStatus, recordClimateObservation } = useAgroShift();
  const baseUrl = backendStatus.connection.baseUrl;
  const canQuery =
    enabled &&
    backendStatus.connection.configured &&
    Boolean(farmId) &&
    typeof latitude === 'number' &&
    typeof longitude === 'number';

  const query = useQuery<ClimateHistoryResponse, Error>({
    queryKey: ['climate-history', baseUrl, farmId, latitude, longitude, startYear, endYear],
    queryFn: ({ signal }) => {
      if (latitude === undefined || longitude === undefined) {
        throw new Error('Farm coordinates are required.');
      }
      return fetchClimateHistory(
        baseUrl,
        { latitude, longitude, startYear, endYear },
        signal
      );
    },
    enabled: canQuery,
    staleTime: 1000 * 60 * 15,
    retry: 1,
  });

  useEffect(() => {
    if (farmId && query.data) {
      recordClimateObservation(farmId, query.data);
    }
  }, [farmId, query.data, recordClimateObservation]);

  return query;
}
