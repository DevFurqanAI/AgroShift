import { useMutation } from '@tanstack/react-query';
import { useAgroShift } from '../context/AgroShiftContext';
import { analyzeFieldHealth, resolveApiBaseUrl } from '../services/api/agroshiftApi';
import type { FieldAnalyzeResponse } from '../types/api';
import type { FarmProfile } from '../types/farm';
import { hectaresToAcres } from '../utils/units';

export function useFieldHealthAnalysis(farm: FarmProfile | null) {
  const { settings, recordFieldHealthObservation } = useAgroShift();

  return useMutation<FieldAnalyzeResponse, Error, void>({
    mutationFn: async () => {
      if (!farm) {
        throw new Error('Select a farm before running field analysis.');
      }
      const acres = Math.max(0.01, hectaresToAcres(farm.details.areaHectares));
      const data = await analyzeFieldHealth(
        {
          latitude: farm.location.latitude,
          longitude: farm.location.longitude,
          acres,
          polygon_geojson: farm.location.polygonGeoJSON,
          language: settings.language === 'ur' ? 'ur' : 'en',
        },
        undefined,
        resolveApiBaseUrl()
      );
      recordFieldHealthObservation(farm.id, data);
      return data;
    },
  });
}
