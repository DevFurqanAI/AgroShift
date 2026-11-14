import type { RotationOptionComparison } from '../types/planner';

/**
 * ISOLATED UI PREVIEW DATA ONLY.
 * Never mix these illustrative examples with live scientific outputs.
 */
export const ILLUSTRATIVE_ROTATION_EXAMPLES: RotationOptionComparison[] = [
  {
    id: 'demo-legume-cereal',
    name: 'Example A: Cereal + Nitrogen-Fixing Legume Sequence',
    isIllustrativeDemo: true,
    sequence: [
      {
        seasonIndex: 1,
        seasonLabel: 'Season 1 (Main Rains)',
        cropName: 'Maize',
        cropFamily: 'Poaceae (Cereal)',
        roleInRotation: 'Primary carbohydrate / cash staple',
      },
      {
        seasonIndex: 2,
        seasonLabel: 'Season 2 (Post-Harvest / Short Rains)',
        cropName: 'Cowpea or Chickpea',
        cropFamily: 'Fabaceae (Legume)',
        roleInRotation: 'Breaks cereal pest cycles and supports biological nitrogen fixation',
      },
      {
        seasonIndex: 3,
        seasonLabel: 'Season 3 (Next Main Season)',
        cropName: 'Sorghum or Wheat',
        cropFamily: 'Poaceae (Cereal)',
        roleInRotation: 'Utilizes residual soil structure and lower moisture demand option',
      },
    ],
    climateSuitability:
      'Illustrative placeholder: Intended to show how seasonal temperature and rainfall windows align with crop maturity.',
    soilHealthConsiderations:
      'Alternating Poaceae cereals with Fabaceae legumes disrupts host-specific root pathogens and diversifies residue C:N ratios.',
    waterDemandConsiderations:
      'Lower-water legume and drought-tolerant cereal steps reduce cumulative irrigation pressure across the 3-season cycle.',
    potentialBenefits: [
      'Reduces continuous cereal monoculture disease carryover',
      'Adds botanical family diversity across successive seasons',
      'Includes a shorter-duration pulse crop option',
    ],
    limitations: [
      'Illustrative interface example only — not calibrated to your field soil test or local climate record',
      'Legume nitrogen contribution depends on nodulation and residue management',
    ],
    supportingInformation:
      'Awaiting scientific rotation engine integration with NASA POWER seasonal baselines and local soil parameters.',
    dataConfidence: 'illustrative_only',
  },
  {
    id: 'demo-oilseed-cover',
    name: 'Example B: Broadleaf Oilseed + Cover Crop Sequence',
    isIllustrativeDemo: true,
    sequence: [
      {
        seasonIndex: 1,
        seasonLabel: 'Season 1 (Main Season)',
        cropName: 'Wheat',
        cropFamily: 'Poaceae (Cereal)',
        roleInRotation: 'Primary grain production',
      },
      {
        seasonIndex: 2,
        seasonLabel: 'Season 2 (Shoulder Window)',
        cropName: 'Clover Cover Crop',
        cropFamily: 'Fabaceae (Cover)',
        roleInRotation: 'Ground cover to protect topsoil from wind and heavy rain erosion',
      },
      {
        seasonIndex: 3,
        seasonLabel: 'Season 3 (Main Season)',
        cropName: 'Sunflower',
        cropFamily: 'Asteraceae (Oilseed)',
        roleInRotation: 'Deep taproot scavenges deeper moisture and breaks shallow compaction',
      },
    ],
    climateSuitability:
      'Illustrative placeholder: Shows how deep-rooted oilseeds can pair with ground cover in variable rainfall zones.',
    soilHealthConsiderations:
      'Living cover reduces bare-soil evaporation while deep taproots explore lower soil horizons.',
    waterDemandConsiderations:
      'Cover crop termination timing must be managed carefully in water-limited regions so moisture is conserved for Season 3.',
    potentialBenefits: [
      'Improves ground cover and erosion protection between grain harvests',
      'Introduces a third botanical family (Asteraceae)',
    ],
    limitations: [
      'Illustrative interface example only — not agricultural advice',
      'Cover crops can consume residual soil moisture in arid climates if terminated late',
    ],
    supportingInformation:
      'Awaiting scientific rotation engine integration.',
    dataConfidence: 'illustrative_only',
  },
];
