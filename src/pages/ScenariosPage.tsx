import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowDownRight,
  ArrowUpRight,
  CloudRain,
  Flame,
  History,
  Loader2,
  Minus,
  PlusCircle,
  RefreshCw,
  SlidersHorizontal,
  Sun,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { EmptyState } from '../components/common/EmptyState';
import { StatusBanner } from '../components/common/StatusBanner';
import { ScreeningLimitationsDisclosure } from '../components/rotation/ScreeningLimitationsDisclosure';
import { useAgroShift } from '../context/AgroShiftContext';
import { isEngineSupportedCropId, normalizeCropIdForBackend } from '../data/crops';
import { useRotationCrops, useScenarioComparisonMutation } from '../hooks/useRotationPlanner';
import { FARMER_ERROR_MESSAGES } from '../services/api/agroshiftApi';
import type { BackendRotationGoal } from '../types/api';
import {
  mapPrioritiesToBackendGoal,
  mapWaterAvailabilityToBackend,
  type ClimateScenarioAssumption,
  type ClimateScenarioId,
} from '../types/planner';
import { formatProvenanceLabel } from '../utils/provenance';
import {
  celsiusDeltaToFahrenheit,
  formatTemperature,
  formatTemperatureDelta,
} from '../utils/units';

const BACKEND_GOAL_LABELS: Record<BackendRotationGoal, string> = {
  water: 'Reduce water demand',
  soil: 'Soil & pH compatibility',
  climate: 'Climate resilience',
  diversity: 'Crop family diversity',
};

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

const SCENARIO_PRESETS: ClimateScenarioAssumption[] = [
  {
    id: 'baseline',
    label: 'Baseline Historical Conditions',
    description: 'Reference period grounded in historical NASA POWER observations without shifts.',
    temperatureDeltaC: 0,
    precipitationShiftPercent: 0,
  },
  {
    id: 'warmer',
    label: 'Warmer Conditions',
    description: 'Stress-test rotation suitability under +1.5 °C higher seasonal temperatures.',
    temperatureDeltaC: 1.5,
    precipitationShiftPercent: 0,
  },
  {
    id: 'drier',
    label: 'Drier Conditions',
    description: 'Explore drought-resilient crop sequences under +1.0 °C and -20% rainfall.',
    temperatureDeltaC: 1.0,
    precipitationShiftPercent: -20,
  },
  {
    id: 'wetter',
    label: 'Wetter Conditions',
    description: 'Compare sequences under +0.5 °C and +20% rainfall (check local drainage too).',
    temperatureDeltaC: 0.5,
    precipitationShiftPercent: 20,
  },
];

export function ScenariosPage() {
  const { activeFarm, settings } = useAgroShift();
  const [selectedId, setSelectedId] = useState<ClimateScenarioId>('warmer');
  const [customTempDelta, setCustomTempDelta] = useState(1.5);
  const [customPrecipShift, setCustomPrecipShift] = useState(0);
  const [plantingMonth, setPlantingMonth] = useState<number>(new Date().getMonth() + 1);
  const [seasons, setSeasons] = useState<2 | 3>(2);
  const [goalOverride, setGoalOverride] = useState<'saved' | BackendRotationGoal>('saved');
  const [referencePrevCropId, setReferencePrevCropId] = useState('');

  const cropsQuery = useRotationCrops();
  const scenarioMutation = useScenarioComparisonMutation();

  const supportedPrevCrop = activeFarm
    ? isEngineSupportedCropId(activeFarm.history.previousCropId)
      ? normalizeCropIdForBackend(activeFarm.history.previousCropId)
      : referencePrevCropId
    : '';

  useEffect(() => {
    if (!activeFarm) return;
    setGoalOverride('saved');
    if (isEngineSupportedCropId(activeFarm.history.previousCropId)) {
      setReferencePrevCropId(normalizeCropIdForBackend(activeFarm.history.previousCropId));
    } else {
      setReferencePrevCropId('wheat');
    }
  }, [activeFarm]);

  const currentYear = new Date().getFullYear();
  const endYear = Math.max(1985, currentYear - 1);
  const startYear = Math.max(1981, endYear - 9);

  const selectedLabel = useMemo(() => {
    const preset = SCENARIO_PRESETS.find((p) => p.id === selectedId);
    if (
      preset &&
      preset.temperatureDeltaC === customTempDelta &&
      preset.precipitationShiftPercent === customPrecipShift
    ) {
      return preset.label;
    }
    const tempDisplay = formatTemperatureDelta(customTempDelta, settings.temperatureUnit);
    const rainDisplay = `${customPrecipShift >= 0 ? `+${customPrecipShift}` : customPrecipShift}%`;
    return `Custom (${tempDisplay}, ${rainDisplay})`;
  }, [selectedId, customTempDelta, customPrecipShift, settings.temperatureUnit]);

  if (!activeFarm) {
    return (
      <EmptyState
        icon={<SlidersHorizontal className="w-6 h-6" />}
        title="Select or Add a Farm to Explore Climate Scenarios"
        description="Scenario sensitivity comparisons pair with your farm's historical NASA POWER climate baseline and water profile."
        primaryAction={
          <Link
            to="/dashboard/farms/new"
            className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold rounded-lg as-btn-primary"
          >
            <PlusCircle className="w-4 h-4" />
            Add Farm
          </Link>
        }
      />
    );
  }

  const validSoilPh =
    activeFarm.soil.ph !== null &&
    Number.isFinite(activeFarm.soil.ph) &&
    activeFarm.soil.ph >= 3 &&
    activeFarm.soil.ph <= 10
      ? activeFarm.soil.ph
      : null;

  const socReferenceGKg =
    activeFarm.environmentalContext?.soilReference?.socGKg !== undefined &&
    activeFarm.environmentalContext?.soilReference?.socGKg !== null
      ? activeFarm.environmentalContext.soilReference.socGKg
      : null;

  const priorityMapping = mapPrioritiesToBackendGoal(activeFarm.priorities);
  const effectiveGoal: BackendRotationGoal =
    goalOverride === 'saved' ? priorityMapping.activeGoal : goalOverride;
  const waterLevel = mapWaterAvailabilityToBackend(activeFarm.details.waterAvailability);

  const runComparison = (
    tempDelta = customTempDelta,
    precipShift = customPrecipShift,
    label = selectedLabel,
    monthOverride = plantingMonth,
    seasonsOverride = seasons,
    goalToRun: BackendRotationGoal = effectiveGoal
  ) => {
    const prevCrop = supportedPrevCrop || 'wheat';
    scenarioMutation.mutate({
      latitude: activeFarm.location.latitude,
      longitude: activeFarm.location.longitude,
      previous_crop: prevCrop,
      soil_ph: validSoilPh,
      water_availability: waterLevel,
      goal: goalToRun,
      planting_month: monthOverride,
      seasons: seasonsOverride,
      start_year: startYear,
      end_year: endYear,
      max_results: 4,
      country: activeFarm.location.country || null,
      country_code: activeFarm.location.countryCode || null,
      region: activeFarm.location.region || null,
      soil_texture: activeFarm.soil.texture || null,
      drainage: activeFarm.soil.drainage || null,
      salinity_concern: activeFarm.soil.salinityConcern || null,
      irrigation_method: activeFarm.details.irrigationMethod || null,
      soil_ph_provenance: validSoilPh !== null ? activeFarm.soil.phProvenance : null,
      soil_texture_provenance:
        activeFarm.soil.texture && activeFarm.soil.texture !== 'unknown'
          ? activeFarm.soil.textureProvenance
          : null,
      soil_organic_carbon_g_kg: socReferenceGKg,
      scenario_label: label,
      temperature_delta_c: tempDelta,
      precipitation_shift_percent: precipShift,
    });
  };

  const handleSelectScenario = (preset: ClimateScenarioAssumption) => {
    setSelectedId(preset.id);
    setCustomTempDelta(preset.temperatureDeltaC);
    setCustomPrecipShift(preset.precipitationShiftPercent);
    runComparison(preset.temperatureDeltaC, preset.precipitationShiftPercent, preset.label);
  };

  const getScenarioIcon = (id: ClimateScenarioId) => {
    if (id === 'baseline') return History;
    if (id === 'warmer') return Flame;
    if (id === 'drier') return Sun;
    return CloudRain;
  };

  const comparisonResult = scenarioMutation.data;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-[26px] sm:text-[28px] font-bold tracking-tight">
            Compare Climate Scenarios — {activeFarm.details.name}
          </h2>
          <p className="text-[15px] text-[var(--as-text-muted)] mt-1 leading-[1.55]">
            Test how your top crop sequences respond under warmer, drier, or wetter hypothetical shifts against NASA POWER historical climate averages.
          </p>
        </div>

        <button
          type="button"
          onClick={() => runComparison()}
          disabled={scenarioMutation.isPending}
          className="inline-flex items-center gap-2 min-h-[44px] px-5 py-2.5 text-[15px] font-semibold rounded-lg as-btn-primary transition-colors disabled:opacity-60 whitespace-nowrap self-start"
        >
          {scenarioMutation.isPending ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Comparing Scenarios...
            </>
          ) : (
            <>
              <RefreshCw className="w-4 h-4" />
              Compare Against Baseline
            </>
          )}
        </button>
      </div>

      <StatusBanner
        tone="info"
        title="Sensitivity Screening Only — Not a Weather Forecast or Yield Prediction"
        description="Baseline values come from historical NASA POWER records. Adjusted temperatures and rainfall percentages are user-selected hypothetical sensitivity tests to explore crop resilience before checking local seasons."
      />

      {!isEngineSupportedCropId(activeFarm.history.previousCropId) && (
        <div className="rounded-xl border border-[var(--as-border)] bg-[var(--as-bg-surface)] p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-[14px]">
          <span className="text-[var(--as-text-muted)]">
            Saved previous crop &ldquo;{activeFarm.history.previousCropName}&rdquo; is outside the 14-crop screening catalog; choose a reference crop for sensitivity comparisons:
          </span>
          <select
            aria-label="Reference previous crop for scenario comparison"
            value={referencePrevCropId}
            onChange={(e) => setReferencePrevCropId(e.target.value)}
            className="min-h-[44px] px-3.5 py-2 text-[15px] rounded-lg border border-[var(--as-border)] bg-[var(--as-bg-subtle)] text-[var(--as-text-primary)]"
          >
            {(cropsQuery.data?.crops ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
            {(!cropsQuery.data?.crops || cropsQuery.data.crops.length === 0) && (
              <option value="wheat">Wheat</option>
            )}
          </select>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {SCENARIO_PRESETS.map((preset) => {
          const active = preset.id === selectedId;
          const Icon = getScenarioIcon(preset.id);
          const presetTempDeltaLabel = formatTemperatureDelta(
            preset.temperatureDeltaC,
            settings.temperatureUnit
          );
          const presetDescription =
            preset.id === 'warmer'
              ? `Stress-test rotation suitability under ${presetTempDeltaLabel} higher seasonal temperatures.`
              : preset.id === 'drier'
              ? `Explore drought-resilient crop sequences under ${presetTempDeltaLabel} and -20% rainfall.`
              : preset.id === 'wetter'
              ? `Compare sequences under ${presetTempDeltaLabel} and +20% rainfall (check local drainage too).`
              : preset.description;

          return (
            <button
              key={preset.id}
              type="button"
              onClick={() => handleSelectScenario(preset)}
              className={`text-left rounded-xl border p-5 space-y-2.5 transition-colors min-h-[44px] ${
                active
                  ? 'border-[var(--as-primary)] bg-[var(--as-accent-surface)]'
                  : 'border-[var(--as-border)] bg-[var(--as-bg-surface)] hover:border-[var(--as-accent-text)]'
              }`}
            >
              <div className="w-10 h-10 rounded-lg as-icon-badge flex items-center justify-center">
                <Icon className="w-5 h-5" />
              </div>
              <h3 className="text-[16px] font-semibold text-[var(--as-text-primary)]">
                {preset.label}
              </h3>
              <p className="text-[14px] text-[var(--as-text-muted)] leading-[1.5]">
                {presetDescription}
              </p>
            </button>
          );
        })}
      </div>

      {/* Interactive Scenario Assumption Controls */}
      <section className="rounded-xl border border-[var(--as-border)] bg-[var(--as-bg-surface)] p-5 sm:p-6 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <h3 className="text-[18px] font-semibold">Custom Sensitivity Parameters</h3>
          <span className="text-[14px] as-text-accent font-medium">
            Active: {selectedLabel} · {MONTH_NAMES[plantingMonth - 1]} · {seasons} Seasons · {BACKEND_GOAL_LABELS[effectiveGoal]}
          </span>
        </div>

        <div className="rounded-lg border border-[var(--as-border)] bg-[var(--as-bg-subtle)] px-4 py-3 text-[14px] text-[var(--as-text-muted)] flex flex-wrap items-center justify-between gap-2">
          <span>
            <strong className="text-[var(--as-text-primary)]">Soil &amp; Provenance:</strong>{' '}
            {activeFarm.soil.texture.replace(/_/g, ' ')}
            {activeFarm.soil.texture !== 'unknown'
              ? ` (${formatProvenanceLabel(activeFarm.soil.textureProvenance)})`
              : ''}{' '}
            ·{' '}
            {validSoilPh !== null
              ? `pH ${validSoilPh} (${formatProvenanceLabel(activeFarm.soil.phProvenance)})`
              : 'pH not recorded (not scored)'}
            {socReferenceGKg !== null ? ` · SoilGrids SOC ${socReferenceGKg} g/kg (context only)` : ''}
          </span>
          {goalOverride === 'saved' && priorityMapping.unsupportedTopNotice && (
            <span className="text-[13px] as-text-accent">
              Saved priority fallback active: {BACKEND_GOAL_LABELS[effectiveGoal]}
            </span>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          <div className="space-y-1.5">
            <label htmlFor="scenario-planting-month" className="block text-[14px] font-semibold">
              Planting Month
            </label>
            <select
              id="scenario-planting-month"
              value={plantingMonth}
              onChange={(e) => setPlantingMonth(Number(e.target.value))}
              className="w-full min-h-[44px] px-3.5 py-2.5 text-[15px] rounded-lg border border-[var(--as-border)] bg-[var(--as-bg-subtle)] text-[var(--as-text-primary)]"
            >
              {MONTH_NAMES.map((name, idx) => (
                <option key={name} value={idx + 1}>
                  {name} (Month {idx + 1})
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <span className="block text-[14px] font-semibold">Planning Horizon</span>
            <div className="grid grid-cols-2 gap-2.5">
              {([2, 3] as const).map((count) => (
                <button
                  key={count}
                  type="button"
                  onClick={() => setSeasons(count)}
                  className={`min-h-[44px] px-3.5 py-2.5 text-[15px] font-medium rounded-lg border transition-colors ${
                    seasons === count
                      ? 'border-[var(--as-primary)] bg-[var(--as-accent-surface)] as-text-accent'
                      : 'border-[var(--as-border)] bg-[var(--as-bg-subtle)] text-[var(--as-text-muted)]'
                  }`}
                >
                  {count} Seasons
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="scenario-priority-focus" className="block text-[14px] font-semibold">
              Screening Priority Focus
            </label>
            <select
              id="scenario-priority-focus"
              value={goalOverride}
              onChange={(e) => {
                const nextGoal = e.target.value as 'saved' | BackendRotationGoal;
                setGoalOverride(nextGoal);
              }}
              className="w-full min-h-[44px] px-3.5 py-2.5 text-[15px] rounded-lg border border-[var(--as-border)] bg-[var(--as-bg-subtle)] text-[var(--as-text-primary)]"
            >
              <option value="saved">
                Follow Saved Order ({BACKEND_GOAL_LABELS[priorityMapping.activeGoal]})
              </option>
              <option value="water">Reduce water demand (Water priority)</option>
              <option value="soil">Support soil health &amp; pH (Soil priority)</option>
              <option value="climate">Climate resilience (Temperature priority)</option>
              <option value="diversity">Crop family diversity (Break priority)</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <div className="flex justify-between text-[14px]">
              <label htmlFor="temp-delta" className="font-semibold">
                Seasonal Temperature Shift Assumption
              </label>
              <span className="tabular-nums font-semibold as-text-accent">
                {formatTemperatureDelta(customTempDelta, settings.temperatureUnit)}
                {settings.temperatureUnit === 'fahrenheit' && (
                  <span className="text-[13px] font-normal text-[var(--as-text-muted)] ml-1.5">
                    ({customTempDelta > 0 ? `+${customTempDelta.toFixed(1)}` : customTempDelta.toFixed(1)} °C)
                  </span>
                )}
              </span>
            </div>
            <input
              id="temp-delta"
              type="range"
              min={-2}
              max={5}
              step={0.5}
              value={customTempDelta}
              onChange={(e) => setCustomTempDelta(Number(e.target.value))}
              className="w-full min-h-[36px] accent-[var(--as-primary)]"
            />
            <div className="flex justify-between text-[13px] text-[var(--as-text-muted)]">
              <span>{formatTemperatureDelta(-2, settings.temperatureUnit)}</span>
              <span>
                Baseline ({settings.temperatureUnit === 'fahrenheit' ? `${celsiusDeltaToFahrenheit(0).toFixed(1)} °F` : '0.0 °C'})
              </span>
              <span>{formatTemperatureDelta(5, settings.temperatureUnit)}</span>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex justify-between text-[14px]">
              <label htmlFor="precip-shift" className="font-semibold">
                Seasonal Precipitation Shift Assumption
              </label>
              <span className="tabular-nums font-semibold as-text-accent">
                {customPrecipShift > 0 ? `+${customPrecipShift}` : customPrecipShift}%
              </span>
            </div>
            <input
              id="precip-shift"
              type="range"
              min={-40}
              max={40}
              step={5}
              value={customPrecipShift}
              onChange={(e) => setCustomPrecipShift(Number(e.target.value))}
              className="w-full min-h-[36px] accent-[var(--as-primary)]"
            />
            <div className="flex justify-between text-[13px] text-[var(--as-text-muted)]">
              <span>-40% (Drier)</span>
              <span>Baseline (0%)</span>
              <span>+40% (Wetter)</span>
            </div>
          </div>
        </div>
      </section>

      {scenarioMutation.isError && (
        <StatusBanner
          tone="error"
          title="Could Not Compute Climate Scenario Comparison"
          description={FARMER_ERROR_MESSAGES.rotation}
          action={
            <button
              type="button"
              onClick={() => runComparison()}
              className="inline-flex items-center gap-1.5 min-h-[40px] px-4 py-2 text-sm font-semibold rounded-lg as-btn-primary"
            >
              <RefreshCw className="w-4 h-4" />
              Retry
            </button>
          }
        />
      )}

      {!comparisonResult && !scenarioMutation.isPending && !scenarioMutation.isError && (
        <EmptyState
          icon={<SlidersHorizontal className="w-6 h-6" />}
          title="Select a Scenario or Click Compare Against Baseline"
          description="Pick one of the presets above or adjust the sliders and click Compare Against Baseline to see how rotation scores and rankings shift."
        />
      )}

      {comparisonResult && comparisonResult.status !== 'ok' && (
        <StatusBanner
          tone="warning"
          title="Baseline Historical Data Unavailable for Comparison"
          description={
            comparisonResult.message ||
            'Scenario comparisons require valid historical NASA POWER observations at your farm coordinates.'
          }
        />
      )}

      {comparisonResult && comparisonResult.status === 'ok' && (() => {
        const scenarioChartData = comparisonResult.comparisons.map((row) => ({
          name: row.crop_names.join(' → '),
          Baseline: row.baseline_score !== null ? Number(row.baseline_score.toFixed(1)) : null,
          Scenario: row.scenario_score !== null ? Number(row.scenario_score.toFixed(1)) : null,
        }));
        const tempShiftStr = formatTemperatureDelta(
          comparisonResult.assumptions.temperature_delta_c,
          settings.temperatureUnit
        );
        const rainShiftStr = `${comparisonResult.assumptions.precipitation_shift_percent >= 0 ? '+' : ''}${comparisonResult.assumptions.precipitation_shift_percent}%`;

        return (
          <div className="space-y-5">
            {/* Causal Linkage Summary: Climate Assumption -> Mean Shift -> Water Tier */}
            <div className="rounded-xl border border-[var(--as-border)] bg-[var(--as-bg-surface)] p-4 sm:p-5 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-[17px] font-semibold text-[var(--as-text-primary)]">
                  Scenario Shift Chain: {comparisonResult.scenario_label} ({tempShiftStr}, {rainShiftStr} rainfall)
                </h3>
                <span className="text-[13px] tabular-nums text-[var(--as-text-muted)]">
                  {comparisonResult.climate_source || 'NASA POWER historical baseline'}
                </span>
              </div>

              {comparisonResult.climate_metrics && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="rounded-lg border border-[var(--as-border)] bg-[var(--as-bg-subtle)] p-4 space-y-1.5">
                    <p className="text-[13px] text-[var(--as-text-muted)]">
                      1. Temperature Assumption ({tempShiftStr})
                    </p>
                    <p className="text-[17px] font-semibold tabular-nums text-[var(--as-text-primary)]">
                      {comparisonResult.climate_metrics.baseline_avg_temp_c !== null
                        ? formatTemperature(
                            comparisonResult.climate_metrics.baseline_avg_temp_c,
                            settings.temperatureUnit
                          )
                        : 'N/A'}{' '}
                      →{' '}
                      {comparisonResult.climate_metrics.scenario_avg_temp_c !== null
                        ? formatTemperature(
                            comparisonResult.climate_metrics.scenario_avg_temp_c,
                            settings.temperatureUnit
                          )
                        : 'N/A'}
                    </p>
                    <p className="text-[13px] text-[var(--as-text-muted)]">
                      Shifts seasonal crop temperature fit across all seasons
                    </p>
                  </div>

                  <div className="rounded-lg border border-[var(--as-border)] bg-[var(--as-bg-subtle)] p-4 space-y-1.5">
                    <p className="text-[13px] text-[var(--as-text-muted)]">
                      2. Monthly Precip Shift ({rainShiftStr})
                    </p>
                    <p className="text-[17px] font-semibold tabular-nums text-[var(--as-text-primary)]">
                      {comparisonResult.climate_metrics.baseline_avg_monthly_precip_mm !== null
                        ? `${comparisonResult.climate_metrics.baseline_avg_monthly_precip_mm} mm`
                        : 'N/A'}{' '}
                      →{' '}
                      {comparisonResult.climate_metrics.scenario_avg_monthly_precip_mm !== null
                        ? `${comparisonResult.climate_metrics.scenario_avg_monthly_precip_mm} mm`
                        : 'N/A'}
                    </p>
                    <p className="text-[13px] text-[var(--as-text-muted)]">
                      Adjusts seasonal rain screening where records exist
                    </p>
                  </div>

                  <div className="rounded-lg border border-[var(--as-border)] bg-[var(--as-bg-subtle)] p-4 space-y-1.5">
                    <p className="text-[13px] text-[var(--as-text-muted)]">3. Qualitative Water Tier</p>
                    <p className="text-[17px] font-semibold capitalize text-[var(--as-text-primary)]">
                      {comparisonResult.assumptions.baseline_water_availability} →{' '}
                      {comparisonResult.assumptions.scenario_water_availability}
                    </p>
                    <p className="text-[13px] text-[var(--as-text-muted)]">
                      {comparisonResult.assumptions.water_shift_note}
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Distinct Historical Year-to-Year Climate Context (Past NASA POWER Archive, NOT Hypothetical Forecast) */}
            {comparisonResult.baseline_plans?.[0]?.historical_resilience && (() => {
              const hr = comparisonResult.baseline_plans[0].historical_resilience!;
              return (
                <div className="rounded-xl border border-[var(--as-border)] bg-[var(--as-bg-surface)] p-4 sm:p-5 space-y-2 text-[14px]">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-[16px] font-semibold text-[var(--as-text-primary)]">
                      How This Crop Plan Handled Past Weather Patterns ({comparisonResult.baseline_plans[0].seasons.map((s) => s.name).join(' → ')})
                    </h3>
                    <span className="px-2.5 py-1 rounded text-[13px] font-semibold border border-[var(--as-border)] bg-[var(--as-bg-subtle)] text-[var(--as-text-primary)]">
                      Historical baseline ({hr.resilience_class.replace(/_/g, ' ')})
                    </span>
                  </div>
                  <p className="text-[var(--as-text-muted)] leading-[1.55]">
                    {hr.summary}
                  </p>
                  <div className="flex flex-wrap gap-4 tabular-nums text-[13px] text-[var(--as-text-muted)]">
                    {hr.driest_cycle_mm !== null && hr.driest_cycle_year && (
                      <span>
                        Driest historical cycle: {hr.driest_cycle_year} ({hr.driest_cycle_mm} mm)
                      </span>
                    )}
                    {hr.wettest_cycle_mm !== null && hr.wettest_cycle_year && (
                      <span>
                        Wettest historical cycle: {hr.wettest_cycle_year} ({hr.wettest_cycle_mm} mm)
                      </span>
                    )}
                    <span>
                      Complete cycles: {hr.years_evaluated} ({hr.warm_stress_seasons_count} warm, {hr.dry_deficit_seasons_count} dry-deficit seasons)
                    </span>
                  </div>
                  <p className="text-[13px] text-[var(--as-text-muted)]">
                    {hr.caveat} Distinct from the hypothetical {comparisonResult.scenario_label} sensitivity test above.
                  </p>
                </div>
              );
            })()}

            {/* Baseline vs Scenario Compatibility Chart */}
            {scenarioChartData.length > 0 && (
              <div className="rounded-xl border border-[var(--as-border)] bg-[var(--as-bg-surface)] p-5 space-y-3">
                <div>
                  <h3 className="text-[17px] font-semibold text-[var(--as-text-primary)]">
                    Baseline vs. {comparisonResult.scenario_label} Compatibility Scores (0–100)
                  </h3>
                  <p className="text-sm text-[var(--as-text-muted)]">
                    Direct comparison of crop sequence scores before and after applying {tempShiftStr} and {rainShiftStr} rainfall.
                  </p>
                </div>
                <div
                  role="img"
                  aria-label={`Grouped bar chart comparing baseline and ${comparisonResult.scenario_label} scores across ${scenarioChartData.length} crop sequences.`}
                  className="h-[240px] w-full"
                >
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={scenarioChartData} margin={{ top: 8, right: 12, left: 0, bottom: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--as-chart-grid)" opacity={0.7} />
                      <XAxis
                        dataKey="name"
                        tick={{ fontSize: 12, fill: 'var(--as-chart-axis)' }}
                        stroke="var(--as-chart-grid)"
                      />
                      <YAxis
                        domain={[0, 100]}
                        tick={{ fontSize: 12, fill: 'var(--as-chart-axis)' }}
                        stroke="var(--as-chart-grid)"
                        width={36}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: '#111D18',
                          borderColor: '#23362D',
                          borderRadius: '8px',
                          color: '#E8F1EC',
                          fontSize: '13px',
                        }}
                      />
                      <Legend wrapperStyle={{ fontSize: '13px', color: 'var(--as-text-primary)' }} />
                      <Bar dataKey="Baseline" name="Baseline Score" fill="var(--as-chart-rain)" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="Scenario" name={comparisonResult.scenario_label} fill="var(--as-chart-temp)" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <p className="sr-only">
                  {scenarioChartData
                    .map((d) => `${d.name}: baseline ${d.Baseline ?? 'N/A'}, scenario ${d.Scenario ?? 'N/A'}`)
                    .join('; ')}
                </p>
              </div>
            )}

            {/* Side-by-Side Comparison Table */}
            <div className="overflow-x-auto rounded-xl border border-[var(--as-border)] bg-[var(--as-bg-surface)]">
              <table className="w-full text-left text-[14px]">
                <thead className="border-b border-[var(--as-border)] bg-[var(--as-bg-subtle)]">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Crop Sequence</th>
                    <th className="px-4 py-3 font-semibold text-right">Baseline</th>
                    <th className="px-4 py-3 font-semibold text-right">{comparisonResult.scenario_label}</th>
                    <th className="px-4 py-3 font-semibold text-right">Score Change</th>
                    <th className="px-4 py-3 font-semibold">Band Shift</th>
                    <th className="px-4 py-3 font-semibold">Rank Shift</th>
                    <th className="px-4 py-3 font-semibold">Why It Changed</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--as-border)]">
                  {comparisonResult.comparisons.map((row) => (
                    <tr key={row.crop_ids.join('-')} className="hover:bg-[var(--as-bg-subtle)]/60">
                      <td className="px-4 py-3 font-semibold text-[var(--as-text-primary)]">
                        {row.crop_names.join(' → ')}
                      </td>
                      <td className="px-4 py-3 tabular-nums text-[var(--as-text-muted)] text-right whitespace-nowrap">
                        {row.baseline_score !== null
                          ? `${row.baseline_score.toFixed(1)} (#${row.baseline_rank})`
                          : 'Outside top list'}
                      </td>
                      <td className="px-4 py-3 tabular-nums font-semibold text-[var(--as-text-primary)] text-right whitespace-nowrap">
                        {row.scenario_score !== null
                          ? `${row.scenario_score.toFixed(1)} (#${row.scenario_rank})`
                          : 'Outside top list'}
                      </td>
                      <td className="px-4 py-3 tabular-nums text-right whitespace-nowrap">
                        {row.score_delta !== null ? (
                          <span
                            className={
                              row.score_delta > 0.2
                                ? 'as-text-accent font-semibold'
                                : row.score_delta < -0.2
                                ? 'as-text-danger font-semibold'
                                : 'text-[var(--as-text-muted)]'
                            }
                          >
                            {row.score_delta > 0 ? `+${row.score_delta.toFixed(1)}` : row.score_delta.toFixed(1)} pts
                          </span>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="px-4 py-3 text-[var(--as-text-muted)]">
                        {row.baseline_band && row.scenario_band
                          ? row.baseline_band === row.scenario_band
                            ? row.scenario_band
                            : `${row.baseline_band} → ${row.scenario_band}`
                          : row.scenario_band || row.baseline_band || '—'}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {row.rank_change !== null ? (
                          row.rank_change > 0 ? (
                            <span className="inline-flex items-center gap-1 as-text-accent font-semibold">
                              <ArrowUpRight className="w-4 h-4" />
                              Up {row.rank_change}
                            </span>
                          ) : row.rank_change < 0 ? (
                            <span className="inline-flex items-center gap-1 as-text-danger font-semibold">
                              <ArrowDownRight className="w-4 h-4" />
                              Down {Math.abs(row.rank_change)}
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[var(--as-text-muted)]">
                              <Minus className="w-4 h-4" />
                              Unchanged
                            </span>
                          )
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="px-4 py-3 text-[var(--as-text-muted)] max-w-xs">
                        {row.reason}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Expandable Baseline vs Scenario Component Breakdown */}
            {(comparisonResult.baseline_plans?.length > 0 || comparisonResult.scenario_plans?.length > 0) && (
              <details className="rounded-xl border border-[var(--as-border)] bg-[var(--as-bg-surface)] p-4 text-[14px]">
                <summary className="cursor-pointer font-semibold text-[var(--as-text-primary)] min-h-[36px] flex items-center">
                  Technical Factor Breakdown: Baseline vs. {comparisonResult.scenario_label}
                </summary>
                <div className="mt-3 grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <p className="font-semibold text-[var(--as-text-primary)]">
                      Baseline Top Plans ({comparisonResult.baseline_plans.length})
                    </p>
                    {comparisonResult.baseline_plans.map((bp, idx) => (
                      <div
                        key={`bp-${idx}`}
                        className="rounded-lg border border-[var(--as-border)] bg-[var(--as-bg-subtle)] p-3 space-y-1"
                      >
                        <div className="flex justify-between gap-2 font-semibold text-[var(--as-text-primary)]">
                          <span>#{idx + 1} {bp.seasons.map((s) => s.name).join(' → ')}</span>
                          <span className="tabular-nums">{bp.score.toFixed(1)}/100</span>
                        </div>
                        {bp.diagnostics && (
                          <p className="tabular-nums text-[13px] text-[var(--as-text-muted)]">
                            Climate {bp.diagnostics.climate_compatibility.toFixed(1)} · Water {bp.diagnostics.water_compatibility.toFixed(1)} · Soil {bp.diagnostics.soil_health_score?.toFixed(1) ?? '—'} · Diversity {bp.diagnostics.family_rotation.toFixed(1)}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                  <div className="space-y-2">
                    <p className="font-semibold text-[var(--as-text-primary)]">
                      Scenario Top Plans ({comparisonResult.scenario_plans.length})
                    </p>
                    {comparisonResult.scenario_plans.map((sp, idx) => (
                      <div
                        key={`sp-${idx}`}
                        className="rounded-lg border border-[var(--as-border)] bg-[var(--as-bg-subtle)] p-3 space-y-1"
                      >
                        <div className="flex justify-between gap-2 font-semibold text-[var(--as-text-primary)]">
                          <span>#{idx + 1} {sp.seasons.map((s) => s.name).join(' → ')}</span>
                          <span className="tabular-nums">{sp.score.toFixed(1)}/100</span>
                        </div>
                        {sp.diagnostics && (
                          <p className="tabular-nums text-[13px] text-[var(--as-text-muted)]">
                            Climate {sp.diagnostics.climate_compatibility.toFixed(1)} · Water {sp.diagnostics.water_compatibility.toFixed(1)} · Soil {sp.diagnostics.soil_health_score?.toFixed(1) ?? '—'} · Diversity {sp.diagnostics.family_rotation.toFixed(1)}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </details>
            )}

            <ScreeningLimitationsDisclosure
              method={comparisonResult.method}
              catalogWarning={comparisonResult.catalog_warning}
              limitations={comparisonResult.limitations}
              extraNotes={[
                comparisonResult.disclaimer,
                ...(comparisonResult.regional_context?.warning
                  ? [comparisonResult.regional_context.warning]
                  : []),
              ]}
              sources={comparisonResult.sources ?? []}
            />
          </div>
        );
      })()}
    </div>
  );
}
