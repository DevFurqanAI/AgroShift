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
import { EmptyState } from '../components/common/EmptyState';
import { StatusBanner } from '../components/common/StatusBanner';
import { ScreeningLimitationsDisclosure } from '../components/rotation/ScreeningLimitationsDisclosure';
import { useAgroShift } from '../context/AgroShiftContext';
import { isEngineSupportedCropId, normalizeCropIdForBackend } from '../data/crops';
import { useRotationCrops, useScenarioComparisonMutation } from '../hooks/useRotationPlanner';
import { FARMER_ERROR_MESSAGES } from '../services/api/agroshiftApi';
import {
  mapPrioritiesToBackendGoal,
  mapWaterAvailabilityToBackend,
  type ClimateScenarioAssumption,
  type ClimateScenarioId,
} from '../types/planner';
import { formatTemperature } from '../utils/units';

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
    return `Custom (${customTempDelta >= 0 ? `+${customTempDelta.toFixed(1)}` : customTempDelta.toFixed(1)} °C, ${customPrecipShift >= 0 ? `+${customPrecipShift}` : customPrecipShift}%)`;
  }, [selectedId, customTempDelta, customPrecipShift]);

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

  const priorityMapping = mapPrioritiesToBackendGoal(activeFarm.priorities);
  const waterLevel = mapWaterAvailabilityToBackend(activeFarm.details.waterAvailability);

  const runComparison = (tempDelta = customTempDelta, precipShift = customPrecipShift, label = selectedLabel) => {
    const prevCrop = supportedPrevCrop || 'wheat';
    scenarioMutation.mutate({
      latitude: activeFarm.location.latitude,
      longitude: activeFarm.location.longitude,
      previous_crop: prevCrop,
      soil_ph: validSoilPh,
      water_availability: waterLevel,
      goal: priorityMapping.activeGoal,
      planting_month: new Date().getMonth() + 1,
      seasons: 2,
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
          <h2 className="font-display text-xl font-bold">
            Compare Climate Scenarios — {activeFarm.details.name}
          </h2>
          <p className="text-sm text-[var(--as-text-muted)] mt-1">
            Compare how your top crop sequences respond under warmer, drier, or wetter hypothetical shifts against NASA POWER historical climate averages.
          </p>
        </div>

        <button
          type="button"
          onClick={() => runComparison()}
          disabled={scenarioMutation.isPending}
          className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold rounded-lg as-btn-primary transition-colors disabled:opacity-60 whitespace-nowrap self-start"
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
        <div className="rounded-xl border border-[var(--as-border)] bg-[var(--as-bg-surface)] p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
          <span className="text-[var(--as-text-muted)]">
            Saved previous crop &ldquo;{activeFarm.history.previousCropName}&rdquo; is outside the 14-crop screening catalog; choose a reference crop for sensitivity comparisons:
          </span>
          <select
            aria-label="Reference previous crop for scenario comparison"
            value={referencePrevCropId}
            onChange={(e) => setReferencePrevCropId(e.target.value)}
            className="px-3 py-1.5 text-xs rounded-lg border border-[var(--as-border)] bg-[var(--as-bg-subtle)] text-[var(--as-text-primary)]"
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
          return (
            <button
              key={preset.id}
              type="button"
              onClick={() => handleSelectScenario(preset)}
              className={`text-left rounded-xl border p-5 space-y-2.5 transition-colors ${
                active
                  ? 'border-[var(--as-primary)] bg-[var(--as-accent-surface)]'
                  : 'border-[var(--as-border)] bg-[var(--as-bg-surface)] hover:border-[var(--as-accent-text)]'
              }`}
            >
              <div className="w-9 h-9 rounded-lg as-icon-badge flex items-center justify-center">
                <Icon className="w-4 h-4" />
              </div>
              <h3 className="text-sm font-semibold text-[var(--as-text-primary)]">
                {preset.label}
              </h3>
              <p className="text-xs text-[var(--as-text-muted)] leading-relaxed">
                {preset.description}
              </p>
            </button>
          );
        })}
      </div>

      {/* Interactive Scenario Assumption Controls */}
      <section className="rounded-xl border border-[var(--as-border)] bg-[var(--as-bg-surface)] p-5 sm:p-6 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <h3 className="text-base font-semibold">Custom Sensitivity Parameters</h3>
          <span className="text-xs as-text-accent font-medium">
            Active: {selectedLabel}
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <div className="flex justify-between text-xs">
              <label htmlFor="temp-delta" className="font-semibold">
                Seasonal Temperature Shift Assumption
              </label>
              <span className="font-mono tabular-nums font-semibold as-text-accent">
                {customTempDelta >= 0 ? `+${customTempDelta.toFixed(1)}` : customTempDelta.toFixed(1)} °C
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
              className="w-full accent-[var(--as-primary)]"
            />
            <div className="flex justify-between text-[11px] text-[var(--as-text-muted)]">
              <span>-2.0 °C</span>
              <span>Baseline (0 °C)</span>
              <span>+5.0 °C</span>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex justify-between text-xs">
              <label htmlFor="precip-shift" className="font-semibold">
                Seasonal Precipitation Shift Assumption
              </label>
              <span className="font-mono tabular-nums font-semibold as-text-accent">
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
              className="w-full accent-[var(--as-primary)]"
            />
            <div className="flex justify-between text-[11px] text-[var(--as-text-muted)]">
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
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg as-btn-primary"
            >
              <RefreshCw className="w-3.5 h-3.5" />
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

      {comparisonResult && comparisonResult.status === 'ok' && (
        <div className="space-y-5">
          {/* Baseline vs Scenario Climate Summary */}
          {comparisonResult.climate_metrics && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="rounded-xl border border-[var(--as-border)] bg-[var(--as-bg-surface)] p-4 space-y-1">
                <p className="text-xs text-[var(--as-text-muted)]">Mean Historical vs Shifted Temp</p>
                <p className="text-base font-mono font-semibold tabular-nums text-[var(--as-text-primary)]">
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
              </div>
              <div className="rounded-xl border border-[var(--as-border)] bg-[var(--as-bg-surface)] p-4 space-y-1">
                <p className="text-xs text-[var(--as-text-muted)]">Mean Monthly Precip Shift</p>
                <p className="text-base font-mono font-semibold tabular-nums text-[var(--as-text-primary)]">
                  {comparisonResult.climate_metrics.baseline_avg_monthly_precip_mm !== null
                    ? `${comparisonResult.climate_metrics.baseline_avg_monthly_precip_mm} mm`
                    : 'N/A'}{' '}
                  →{' '}
                  {comparisonResult.climate_metrics.scenario_avg_monthly_precip_mm !== null
                    ? `${comparisonResult.climate_metrics.scenario_avg_monthly_precip_mm} mm`
                    : 'N/A'}
                </p>
              </div>
              <div className="rounded-xl border border-[var(--as-border)] bg-[var(--as-bg-surface)] p-4 space-y-1">
                <p className="text-xs text-[var(--as-text-muted)]">Qualitative Water Tier</p>
                <p className="text-base font-semibold capitalize text-[var(--as-text-primary)]">
                  {comparisonResult.assumptions.baseline_water_availability} →{' '}
                  {comparisonResult.assumptions.scenario_water_availability}
                </p>
                <p className="text-[11px] text-[var(--as-text-muted)]">
                  {comparisonResult.assumptions.water_shift_note}
                </p>
              </div>
            </div>
          )}

          {/* Side-by-Side Comparison Table */}
          <div className="overflow-x-auto rounded-xl border border-[var(--as-border)] bg-[var(--as-bg-surface)]">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-[var(--as-border)] bg-[var(--as-bg-subtle)]">
                <tr>
                  <th className="px-4 py-3 font-semibold">Crop Sequence</th>
                  <th className="px-4 py-3 font-semibold">Baseline</th>
                  <th className="px-4 py-3 font-semibold">{comparisonResult.scenario_label}</th>
                  <th className="px-4 py-3 font-semibold">Score Change</th>
                  <th className="px-4 py-3 font-semibold">Rank Shift</th>
                  <th className="px-4 py-3 font-semibold">Why It Changed</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--as-border)]">
                {comparisonResult.comparisons.map((row) => (
                  <tr key={row.crop_ids.join('-')}>
                    <td className="px-4 py-3 font-semibold text-[var(--as-text-primary)]">
                      {row.crop_names.join(' → ')}
                    </td>
                    <td className="px-4 py-3 font-mono tabular-nums text-[var(--as-text-muted)]">
                      {row.baseline_score !== null
                        ? `${row.baseline_score.toFixed(1)} (#${row.baseline_rank})`
                        : 'Outside top list'}
                    </td>
                    <td className="px-4 py-3 font-mono tabular-nums font-semibold text-[var(--as-text-primary)]">
                      {row.scenario_score !== null
                        ? `${row.scenario_score.toFixed(1)} (#${row.scenario_rank})`
                        : 'Outside top list'}
                    </td>
                    <td className="px-4 py-3 font-mono tabular-nums">
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
                          {row.score_delta > 0 ? `+${row.score_delta.toFixed(1)}` : row.score_delta.toFixed(1)}
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {row.rank_change !== null ? (
                        row.rank_change > 0 ? (
                          <span className="inline-flex items-center gap-1 as-text-accent font-semibold">
                            <ArrowUpRight className="w-3.5 h-3.5" />
                            Up {row.rank_change}
                          </span>
                        ) : row.rank_change < 0 ? (
                          <span className="inline-flex items-center gap-1 as-text-danger font-semibold">
                            <ArrowDownRight className="w-3.5 h-3.5" />
                            Down {Math.abs(row.rank_change)}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[var(--as-text-muted)]">
                            <Minus className="w-3.5 h-3.5" />
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
      )}
    </div>
  );
}
