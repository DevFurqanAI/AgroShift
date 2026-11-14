import type { BackendRotationGoal, BackendWaterLevel, RotationPlanOption } from './api';
import type { FarmerPriorityId, WaterAvailability } from './farm';

export type PlanningHorizonSeasons = 2 | 3;

export interface RotationPlanDraft {
  id: string;
  farmId: string;
  farmName: string;
  title: string;
  horizonSeasons: PlanningHorizonSeasons;
  plantingMonth: number;
  localSeasonLabel: string;
  waterConstraint: WaterAvailability;
  previousCropId: string;
  previousCropName: string;
  goals: FarmerPriorityId[];
  activeBackendGoal: BackendRotationGoal;
  notes: string;
  topPlanSnapshot?: RotationPlanOption | null;
  createdAt: string;
  updatedAt: string;
}

export type ClimateScenarioId = 'baseline' | 'warmer' | 'drier' | 'wetter';

export interface ClimateScenarioAssumption {
  id: ClimateScenarioId;
  label: string;
  description: string;
  temperatureDeltaC: number;
  precipitationShiftPercent: number;
}

export interface PriorityMappingResult {
  activeGoal: BackendRotationGoal;
  activePriority: FarmerPriorityId;
  topPriority: FarmerPriorityId;
  usesFallbackFromUnsupported: boolean;
  unsupportedTopNotice: string | null;
}

const PRIORITY_TO_BACKEND_GOAL: Partial<Record<FarmerPriorityId, BackendRotationGoal>> = {
  reduce_water_demand: 'water',
  support_soil_health: 'soil',
  climate_resilience: 'climate',
  diversify_crops: 'diversity',
};

export function mapPrioritiesToBackendGoal(
  priorities: FarmerPriorityId[]
): PriorityMappingResult {
  const ordered = priorities.length > 0 ? priorities : (['support_soil_health'] as FarmerPriorityId[]);
  const topPriority = ordered[0];

  for (const priority of ordered) {
    const mapped = PRIORITY_TO_BACKEND_GOAL[priority];
    if (mapped) {
      const usesFallbackFromUnsupported = priority !== topPriority;
      return {
        activeGoal: mapped,
        activePriority: priority,
        topPriority,
        usesFallbackFromUnsupported,
        unsupportedTopNotice: usesFallbackFromUnsupported
          ? 'Your #1 priority ("Maintain productivity") is saved in your farm profile, while the rotation screening engine uses your next supported priority.'
          : null,
      };
    }
  }

  return {
    activeGoal: 'soil',
    activePriority: 'support_soil_health',
    topPriority,
    usesFallbackFromUnsupported: true,
    unsupportedTopNotice:
      '"Maintain productivity" is saved in your farm profile, while the rotation screening engine defaults to soil compatibility because yield modeling is not yet active.',
  };
}

export function mapWaterAvailabilityToBackend(
  water: WaterAvailability
): BackendWaterLevel {
  if (water === 'abundant') return 'high';
  if (water === 'limited' || water === 'scarce') return 'low';
  return 'medium';
}
