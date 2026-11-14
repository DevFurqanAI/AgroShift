import { useRef } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useAgroShift } from '../context/AgroShiftContext';
import { analyzeFieldHealth, resolveApiBaseUrl } from '../services/api/agroshiftApi';
import type { FieldAnalyzeResponse } from '../types/api';
import type { FarmProfile } from '../types/farm';
import { hectaresToAcres } from '../utils/units';

const RATE_LIMIT_COOLDOWN_MS = 30_000;
const MIN_SUCCESS_REFETCH_GAP_MS = 5_000;

export function isRateLimitedSatelliteMessage(message: string | null | undefined): boolean {
  if (!message) return false;
  const lower = message.toLowerCase();
  return lower.includes('rate limit') || lower.includes('temporarily busy');
}

export function useFieldHealthAnalysis(farm: FarmProfile | null) {
  const { settings, recordFieldHealthObservation } = useAgroShift();
  const lastAttemptByFarmRef = useRef<Record<string, { at: number; rateLimited: boolean }>>({});

  return useMutation<FieldAnalyzeResponse, Error, void>({
    mutationFn: async () => {
      if (!farm) {
        throw new Error('Select a farm before running field analysis.');
      }

      const now = Date.now();
      const prev = lastAttemptByFarmRef.current[farm.id];
      if (prev) {
        const elapsed = now - prev.at;
        if (prev.rateLimited && elapsed < RATE_LIMIT_COOLDOWN_MS) {
          const waitSec = Math.max(1, Math.ceil((RATE_LIMIT_COOLDOWN_MS - elapsed) / 1000));
          throw new Error(
            `Satellite imagery is cooling down after a busy provider limit. Please wait about ${waitSec} seconds before refreshing.`
          );
        }
        if (elapsed < MIN_SUCCESS_REFETCH_GAP_MS) {
          throw new Error('Field analysis just ran. Please wait a few seconds before refreshing again.');
        }
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

      lastAttemptByFarmRef.current[farm.id] = {
        at: Date.now(),
        rateLimited:
          !data.satellite_available && isRateLimitedSatelliteMessage(data.satellite_message),
      };
      recordFieldHealthObservation(farm.id, data);
      return data;
    },
  });
}
