import type { FarmerPriorityId, WaterAvailability } from './farm';

export type PlanningHorizonSeasons = 2 | 3 | 4;

export interface RotationPlanDraft {
  id: string;
  farmId: string;
  farmName: string;
  title: string;
  horizonSeasons: PlanningHorizonSeasons;
  localSeasonLabel: string;
  waterConstraint: WaterAvailability;
  previousCropName: string;
  goals: FarmerPriorityId[];
  notes: string;
  status: 'draft_awaiting_engine';
  createdAt: string;
  updatedAt: string;
}

export interface RotationSequenceStep {
  seasonIndex: number;
  seasonLabel: string;
  cropName: string;
  cropFamily: string;
  roleInRotation: string;
}

export interface RotationOptionComparison {
  id: string;
  name: string;
  isIllustrativeDemo: boolean;
  sequence: RotationSequenceStep[];
  climateSuitability: string;
  soilHealthConsiderations: string;
  waterDemandConsiderations: string;
  potentialBenefits: string[];
  limitations: string[];
  supportingInformation: string;
  dataConfidence: 'high' | 'moderate' | 'low' | 'illustrative_only';
}

export type ClimateScenarioId = 'baseline' | 'warmer' | 'drier' | 'wetter';

export interface ClimateScenarioAssumption {
  id: ClimateScenarioId;
  label: string;
  description: string;
  temperatureDeltaC: number;
  precipitationShiftPercent: number;
}
