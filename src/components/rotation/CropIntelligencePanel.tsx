import { useMemo, useState } from 'react';
import { BookOpen, ExternalLink, HelpCircle, X } from 'lucide-react';
import type { CropCatalogItem } from '../../data/crops';
import type {
  AgronomicSourceItem,
  RegionalCalendarContext,
  RotationPlanOption,
} from '../../types/api';
import type { FarmProfile, TemperatureUnit } from '../../types/farm';
import { formatProvenanceLabel } from '../../utils/provenance';
import { formatTemperature } from '../../utils/units';

interface CropIntelligencePanelProps {
  crops: CropCatalogItem[];
  selectedCropId: string;
  onSelectCrop: (cropId: string) => void;
  onClose?: () => void;
  farm: FarmProfile;
  temperatureUnit: TemperatureUnit;
  sources?: AgronomicSourceItem[];
  regionalContext?: RegionalCalendarContext | null;
  activePlans?: RotationPlanOption[];
  isLiveCatalogLoaded?: boolean;
}

const TERM_GLOSSARY = [
  {
    term: 'Soil pH (pH in H2O)',
    meaning:
      'Measures topsoil acidity or alkalinity (0–14 scale). Values outside a crop’s preferred range can limit root nutrient uptake or legume nodulation.',
  },
  {
    term: 'ECe Salinity (dS/m)',
    meaning:
      'Electrical conductivity of saturated soil paste extract. Higher ECe indicates dissolved salts that make it harder for roots to absorb water (Maas-Hoffman reference).',
  },
  {
    term: 'Botanical Family Break',
    meaning:
      'Planting crops from different plant families (for example Fabaceae pulses after Poaceae cereals) to disrupt crop-specific pests, weeds, and soil-borne diseases.',
  },
  {
    term: 'Biological Nitrogen Fixation (BNF)',
    meaning:
      'Symbiosis between legumes and rhizobia bacteria that converts air nitrogen into plant nitrogen. Depends on compatible rhizobia, soil moisture, phosphorus, and pH; grain harvests still export nitrogen.',
  },
  {
    term: 'Surface Residue',
    meaning:
      'Stalks and straw left on the field after harvest. Retaining higher-residue cereal straw shields topsoil from rain splash and heat, whereas low-residue pulses/tubers leave soil more exposed.',
  },
  {
    term: 'NASA GWETTOP / GWETROOT (0–1)',
    meaning:
      'Coarse 0.5° modeled regional soil wetness context (surface 0–5 cm and root zone 0–100 cm). Useful for broad regional trends only — never a field-level moisture sensor.',
  },
];

function formatTempBand(
  minC: number | undefined,
  maxC: number | undefined,
  unit: TemperatureUnit
): string {
  if (minC === undefined || maxC === undefined) return 'Unknown / unverified';
  return `${formatTemperature(minC, unit)} – ${formatTemperature(maxC, unit)}`;
}

export function CropIntelligencePanel({
  crops,
  selectedCropId,
  onSelectCrop,
  onClose,
  farm,
  temperatureUnit,
  sources = [],
  regionalContext,
  activePlans = [],
  isLiveCatalogLoaded = false,
}: CropIntelligencePanelProps) {
  const [showGlossary, setShowGlossary] = useState(false);

  const selectedCrop = useMemo(
    () => crops.find((c) => c.id === selectedCropId) ?? crops[0],
    [crops, selectedCropId]
  );

  const sourceMap = useMemo(
    () => new Map(sources.map((s) => [s.id, s])),
    [sources]
  );

  if (!selectedCrop) return null;

  // Check if the selected crop appeared in any returned rotation season for location-specific climate insight
  const matchedSeasonFromPlan = activePlans
    .flatMap((p) => p.seasons)
    .find((s) => s.crop_id === selectedCrop.id);

  // Farm pH comparison
  const farmPh =
    farm.soil.ph !== null && Number.isFinite(farm.soil.ph) ? farm.soil.ph : null;
  let phAssessment = 'Soil pH is not recorded on your farm profile; pH fit is not scored.';
  if (
    farmPh !== null &&
    selectedCrop.phMin !== undefined &&
    selectedCrop.phMax !== undefined
  ) {
    const provLabel = formatProvenanceLabel(farm.soil.phProvenance);
    if (farmPh >= selectedCrop.phMin && farmPh <= selectedCrop.phMax) {
      phAssessment = `Your ${provLabel} (${farmPh}) lies within this crop’s general range (${selectedCrop.phMin}–${selectedCrop.phMax}).`;
    } else {
      phAssessment = `Your ${provLabel} (${farmPh}) sits outside this crop’s typical optimal band (${selectedCrop.phMin}–${selectedCrop.phMax}); confirm locally.`;
    }
  }

  // Farm texture comparison
  const farmTexture = farm.soil.texture;
  let textureAssessment = 'Soil texture is marked unknown on your farm profile.';
  if (farmTexture && farmTexture !== 'unknown') {
    const texLabel = farmTexture.replace(/_/g, ' ');
    const texProv = formatProvenanceLabel(farm.soil.textureProvenance);
    if (selectedCrop.suitableSoilTextures?.length) {
      const fits = selectedCrop.suitableSoilTextures.includes(farmTexture);
      textureAssessment = fits
        ? `Your ${texProv} (${texLabel}) matches documented suitable textures (${selectedCrop.suitableSoilTextures.map((t) => t.replace(/_/g, ' ')).join(', ')}).`
        : `Your ${texProv} (${texLabel}) falls outside preferred textures (${selectedCrop.suitableSoilTextures.map((t) => t.replace(/_/g, ' ')).join(', ')}); field drainage/tillage checks advised.`;
    } else {
      textureAssessment = `Your ${texProv}: ${texLabel}.`;
    }
  }

  // Drainage & salinity farm comparison
  const drainageFlag =
    (farm.soil.drainage === 'poorly_drained' ||
      farm.soil.drainage === 'waterlogging_prone') &&
    selectedCrop.waterloggingSensitivity === 'high';
  const salinityFlag =
    (farm.soil.salinityConcern === 'suspected' ||
      farm.soil.salinityConcern === 'confirmed') &&
    selectedCrop.salinityTolerance === 'sensitive';

  // Temperature comparison
  const farmAnnualMeanTemp =
    farm.environmentalContext?.climateSummary?.airTemperatureC ?? null;

  // Parameter-level sources attached to this crop
  const cropSourceIds = Array.from(
    new Set(
      Object.values(selectedCrop.parameterSources ?? {}).flat()
    )
  );
  const resolvedSources = cropSourceIds
    .map((id) => sourceMap.get(id))
    .filter((s): s is AgronomicSourceItem => Boolean(s));

  return (
    <section
      aria-label="Crop Intelligence Guide"
      className="rounded-xl border border-[var(--as-border)] bg-[var(--as-bg-surface)] p-5 sm:p-6 space-y-5 text-sm"
    >
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--as-border)] pb-4">
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-2 text-[13px] text-[var(--as-text-muted)]">
            <BookOpen className="w-4 h-4 as-text-accent shrink-0" />
            <span>Crop Guide</span>
            <span aria-hidden="true">·</span>
            <span>
              {isLiveCatalogLoaded
                ? 'Synced with backend agronomic catalog'
                : 'Showing bundled screening metadata'}
            </span>
          </div>
          <h3 className="font-display text-lg sm:text-xl font-bold text-[var(--as-text-primary)]">
            {selectedCrop.name}
            {selectedCrop.scientificName ? (
              <span className="ml-2 text-sm font-normal italic text-[var(--as-text-muted)]">
                ({selectedCrop.scientificName})
              </span>
            ) : null}
          </h3>
          <p className="text-[13px] sm:text-sm text-[var(--as-text-muted)]">
            {selectedCrop.botanicalFamily} · {selectedCrop.category} · Water profile:{' '}
            {selectedCrop.typicalWaterProfile}
            {selectedCrop.nitrogenFixing ? ' · Nitrogen-fixing legume' : ''}
            {selectedCrop.commonAliases.length > 0
              ? ` · Also called: ${selectedCrop.commonAliases.join(', ')}`
              : ''}
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setShowGlossary((prev) => !prev)}
            className="inline-flex items-center gap-1.5 min-h-[40px] px-3.5 py-2 text-sm font-semibold rounded-lg border border-[var(--as-border)] bg-[var(--as-bg-subtle)] text-[var(--as-text-primary)] hover:border-[var(--as-accent-text)] whitespace-nowrap"
          >
            <HelpCircle className="w-4 h-4 as-text-accent" />
            {showGlossary ? 'Hide Term Glossary' : 'Explain Terms'}
          </button>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Close crop guide"
              className="min-w-[40px] min-h-[40px] inline-flex items-center justify-center rounded-lg border border-[var(--as-border)] text-[var(--as-text-muted)] hover:text-[var(--as-text-primary)]"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Crop Switcher Strip */}
      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Select crop to inspect">
        {crops.map((crop) => {
          const active = crop.id === selectedCrop.id;
          return (
            <button
              key={crop.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onSelectCrop(crop.id)}
              className={`min-h-[40px] px-3 py-1.5 text-sm font-medium rounded-md border transition-colors whitespace-nowrap shrink-0 ${
                active
                  ? 'as-chip-selected'
                  : 'border-[var(--as-border)] bg-[var(--as-bg-subtle)] text-[var(--as-text-primary)] hover:border-[var(--as-accent-text)]'
              }`}
            >
              {crop.name}
            </button>
          );
        })}
      </div>

      {showGlossary && (
        <div className="rounded-lg border border-[var(--as-border)] bg-[var(--as-bg-subtle)] p-4 space-y-3 text-sm">
          <p className="font-semibold text-[var(--as-text-primary)]">
            Plain-Language Farming Terms
          </p>
          <dl className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            {TERM_GLOSSARY.map((item) => (
              <div key={item.term} className="space-y-1">
                <dt className="font-semibold text-[var(--as-text-primary)]">{item.term}</dt>
                <dd className="text-[13px] text-[var(--as-text-muted)] leading-[1.55]">{item.meaning}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}

      {/* Key Numeric Reference Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5 text-sm">
        <div className="rounded-lg border border-[var(--as-border)] bg-[var(--as-bg-subtle)] p-4 space-y-1.5">
          <span className="text-[13px] font-medium text-[var(--as-text-muted)]">Typical Growing Time</span>
          <p className="tabular-nums font-bold text-base text-[var(--as-text-primary)]">
            {selectedCrop.cycleDaysMin && selectedCrop.cycleDaysMax
              ? `${selectedCrop.cycleDaysMin}–${selectedCrop.cycleDaysMax} days`
              : 'Unknown'}
            {selectedCrop.durationMonths ? ` (${selectedCrop.durationMonths} mo slot)` : ''}
          </p>
          <p className="text-[13px] text-[var(--as-text-muted)] leading-[1.5]">
            {selectedCrop.cycleVariabilityNote || 'Cultivar maturity varies by local variety and sowing date.'}
          </p>
        </div>

        <div className="rounded-lg border border-[var(--as-border)] bg-[var(--as-bg-subtle)] p-4 space-y-1.5">
          <span className="text-[13px] font-medium text-[var(--as-text-muted)]">Preferred Temperature Range</span>
          <p className="tabular-nums font-bold text-base text-[var(--as-text-primary)]">
            {formatTempBand(selectedCrop.tempMinC, selectedCrop.tempMaxC, temperatureUnit)}
          </p>
          <p className="text-[13px] text-[var(--as-text-muted)] leading-[1.5]">
            {selectedCrop.tempTolMinC !== undefined && selectedCrop.tempTolMaxC !== undefined
              ? `Broader tolerance: ${formatTempBand(selectedCrop.tempTolMinC, selectedCrop.tempTolMaxC, temperatureUnit)}`
              : 'Broader survival bounds not listed.'}
            {selectedCrop.heatStressThresholdC != null
              ? ` · Heat caution above ${formatTemperature(selectedCrop.heatStressThresholdC, temperatureUnit)}`
              : ''}
            {selectedCrop.frostSensitivity
              ? ` · Frost sensitivity: ${selectedCrop.frostSensitivity.replace(/_/g, ' ')}`
              : ''}
          </p>
        </div>

        <div className="rounded-lg border border-[var(--as-border)] bg-[var(--as-bg-subtle)] p-4 space-y-1.5">
          <span className="text-[13px] font-medium text-[var(--as-text-muted)]">Seasonal Rain Guide</span>
          <p className="tabular-nums font-bold text-base text-[var(--as-text-primary)]">
            {selectedCrop.seasonalRainMinMm && selectedCrop.seasonalRainMaxMm
              ? `${selectedCrop.seasonalRainMinMm}–${selectedCrop.seasonalRainMaxMm} mm/cycle`
              : 'Unverified range'}
          </p>
          <p className="text-[13px] text-[var(--as-text-muted)] leading-[1.5]">
            Standing water sensitivity:{' '}
            <strong className="text-[var(--as-text-primary)]">
              {(selectedCrop.waterloggingSensitivity || 'unknown').replace(/_/g, ' ')}
            </strong>{' '}
            · Broad seasonal rain guide only (check NASA Water Comparison for crop ETc).
          </p>
        </div>

        <div className="rounded-lg border border-[var(--as-border)] bg-[var(--as-bg-subtle)] p-4 space-y-1.5">
          <span className="text-[13px] font-medium text-[var(--as-text-muted)]">Soil pH &amp; Salt Tolerance</span>
          <p className="tabular-nums font-bold text-base text-[var(--as-text-primary)]">
            {selectedCrop.phMin !== undefined && selectedCrop.phMax !== undefined
              ? `pH ${selectedCrop.phMin}–${selectedCrop.phMax}`
              : 'pH range unknown'}
          </p>
          <p className="text-[13px] text-[var(--as-text-muted)] leading-[1.5]">
            Salinity class:{' '}
            <strong className="text-[var(--as-text-primary)]">
              {selectedCrop.salinityTolerance || 'unknown'}
            </strong>
            {selectedCrop.salinityEcThresholdDsm != null
              ? ` (ECe threshold ~${selectedCrop.salinityEcThresholdDsm} dS/m)`
              : ' (no single global salt threshold specified)'}
          </p>
        </div>
      </div>

      {/* Fit Against Active Farm Context */}
      <div className="rounded-lg border border-[var(--as-border)] bg-[var(--as-bg-subtle)] p-4 space-y-2 text-sm leading-[1.55]">
        <p className="font-semibold text-[var(--as-text-primary)]">
          How {selectedCrop.name} Compares to {farm.details.name}
        </p>
        <ul className="space-y-1.5 text-[var(--as-text-muted)] list-disc pl-5">
          <li>{phAssessment}</li>
          <li>{textureAssessment}</li>
          {drainageFlag && (
            <li className="as-text-warning">
              Drainage alert: your farm reports {farm.soil.drainage.replace(/_/g, ' ')}, while{' '}
              {selectedCrop.name} has high waterlogging sensitivity.
            </li>
          )}
          {salinityFlag && (
            <li className="as-text-warning">
              Salinity alert: your farm indicates {farm.soil.salinityConcern} salinity concern, while{' '}
              {selectedCrop.name} is classified as salt-sensitive.
            </li>
          )}
          {matchedSeasonFromPlan ? (
            <li>
              In your active plan ({matchedSeasonFromPlan.window_label || `Month ${matchedSeasonFromPlan.planting_month}`}),
              historical NASA temperature averaged{' '}
              <span className="tabular-nums font-semibold text-[var(--as-text-primary)]">
                {formatTemperature(matchedSeasonFromPlan.avg_historical_temperature_c, temperatureUnit)}
              </span>{' '}
              (temperature fit {matchedSeasonFromPlan.temperature_fit_score}/100)
              {matchedSeasonFromPlan.local_season_name
                ? ` · ${matchedSeasonFromPlan.local_season_name}`
                : ''}.
              {matchedSeasonFromPlan.calendar_note ? ` ${matchedSeasonFromPlan.calendar_note}` : ''}
            </li>
          ) : farmAnnualMeanTemp !== null ? (
            <li>
              Your saved NASA annual mean air temperature is{' '}
              <span className="tabular-nums font-semibold text-[var(--as-text-primary)]">
                {formatTemperature(farmAnnualMeanTemp, temperatureUnit)}
              </span>{' '}
              — run rotation screening above to evaluate exact seasonal planting months.
            </li>
          ) : (
            <li>Run rotation screening above to check seasonal NASA POWER climate fit for your planting month.</li>
          )}
          {regionalContext && (
            <li>
              Planting calendar status ({regionalContext.country_name || 'your location'}):{' '}
              {regionalContext.verified
                ? matchedSeasonFromPlan?.calendar_status === 'crop_not_in_regional_calendar'
                  ? `Planting season needs local confirmation for ${selectedCrop.name} in this country.`
                  : 'Regional cropping calendar coverage checked during screening.'
                : 'Planting season needs local confirmation (location outside verified regional calendars).'}
            </li>
          )}
        </ul>
      </div>

      {/* Advantages, Cautions, Legume/Residue Traits & Explicit Unknowns */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5 text-sm leading-[1.55]">
        <div className="space-y-3.5">
          <div>
            <p className="font-semibold text-[var(--as-text-primary)] mb-1">
              Rotation Advantages
            </p>
            {selectedCrop.rotationAdvantages && selectedCrop.rotationAdvantages.length > 0 ? (
              <ul className="space-y-1 text-[var(--as-text-muted)] list-disc pl-5">
                {selectedCrop.rotationAdvantages.map((adv, idx) => (
                  <li key={idx}>{adv}</li>
                ))}
              </ul>
            ) : (
              <p className="text-[var(--as-text-muted)]">
                Rooting depth: {selectedCrop.rootingDepthClass || 'medium'} · Residue cover:{' '}
                {selectedCrop.residueProfile || 'moderate'}.
              </p>
            )}
          </div>

          {selectedCrop.legumeBnfNotes && (
            <div>
              <p className="font-semibold text-[var(--as-text-primary)] mb-1">
                Legume &amp; Nitrogen Fixation Notes
              </p>
              <p className="text-[var(--as-text-muted)]">
                {selectedCrop.legumeBnfNotes}
              </p>
            </div>
          )}

          {selectedCrop.residueManagementNotes && (
            <div>
              <p className="font-semibold text-[var(--as-text-primary)] mb-1">
                Residue &amp; Soil-Cover Considerations
              </p>
              <p className="text-[var(--as-text-muted)]">
                {selectedCrop.residueManagementNotes}
              </p>
            </div>
          )}
        </div>

        <div className="space-y-3.5">
          {selectedCrop.successionCautions && selectedCrop.successionCautions.length > 0 && (
            <div>
              <p className="font-semibold as-text-warning mb-1">
                Succession &amp; Disease Cautions
              </p>
              <ul className="space-y-1 text-[var(--as-text-muted)] list-disc pl-5">
                {selectedCrop.successionCautions.map((caut, idx) => (
                  <li key={idx}>{caut}</li>
                ))}
              </ul>
            </div>
          )}

          <div>
            <p className="font-semibold text-[var(--as-text-primary)] mb-1">
              What Cannot Be Confirmed Globally (Verify Locally)
            </p>
            <ul className="space-y-1 text-[var(--as-text-muted)] list-disc pl-5">
              {(selectedCrop.knownUnknowns && selectedCrop.knownUnknowns.length > 0
                ? selectedCrop.knownUnknowns
                : [
                    'Local cultivar maturity group, disease-resistance race, and exact field microclimate.',
                    'Soil N/P/K nutrient levels and local market/input economics.',
                  ]
              ).map((unk, idx) => (
                <li key={idx}>{unk}</li>
              ))}
            </ul>
          </div>

          {resolvedSources.length > 0 && (
            <div className="pt-2 border-t border-[var(--as-border)]">
              <p className="font-semibold text-[var(--as-text-primary)] mb-1.5">
                Reference Sources
              </p>
              <ul className="space-y-1.5 text-[13px] text-[var(--as-text-muted)]">
                {resolvedSources.map((src) => (
                  <li key={src.id}>
                    <a
                      href={src.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 as-text-accent hover:underline font-medium"
                    >
                      <span>{src.title}</span>
                      <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
