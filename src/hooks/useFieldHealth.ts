import { useMutation } from '@tanstack/react-query';
import { useAgroShift } from '../context/AgroShiftContext';
import { analyzeFieldHealth } from '../services/api/agroshiftApi';
import type { FieldAnalyzeResponse } from '../types/api';
import type { FarmProfile } from '../types/farm';
import { hectaresToAcres } from '../utils/units';

export function useFieldHealthAnalysis(farm: FarmProfile | null) {
  const { backendStatus, settings, recordFieldHealthObservation } = useAgroShift();
  const baseUrl = backendStatus.connection.baseUrl;

  return useMutation<FieldAnalyzeResponse, Error, void>({
    mutationFn: async () => {
      if (!farm) {
        throw new Error('Select a farm before running field analysis.');
      }
      const acreage = Math.max(0.01, hectaresToAcres(farm.details.areaHectares));
      const data = await analyzeFieldHealth(baseUrl, {
        latitude: farm.location.latitude,
        longitude: farm.location.longitude,
        acreage,
        polygon_geojson: farm.location.polygonGeoJSON,
        language: settings.language,
      });
      recordFieldHealthObservation(farm.id, data);
      return data;
    },
  });
}
