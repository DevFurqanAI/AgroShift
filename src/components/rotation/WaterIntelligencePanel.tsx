import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Droplets,
  Info,
  Loader2,
  RefreshCw,
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
import { StatusBanner } from '../common/StatusBanner';
import { useWaterComparisonMutation } from '../../hooks/useRotationPlanner';
import { FARMER_ERROR_MESSAGES } from '../../services/api/agroshiftApi';
import type {
  BackendWaterLevel,
  CurrentPracticeComparison,
  RotationPlanOption,
  WaterCompareRequest,
  WaterCompareResponse,
  WaterPlanComparison,
  WaterPlanInput,
} from '../../types/api';
import type { AreaUnit, FarmProfile } from '../../types/farm';
import { formatArea } from '../../utils/units';

interface WaterIntelligencePanelProps {
  farm: FarmProfile;
  rankedPlans: RotationPlanOption[];
  baselineComparison?: CurrentPracticeComparison | null;
  startYear: number;
  endYear: number;
  waterLevel: BackendWaterLevel;
  areaUnit: AreaUnit;
  persistedWater?: WaterCompareResponse | null;
}

export function buildWaterPlanInputs(
  rankedPlans: RotationPlanOption[],
  baselineComparison?: CurrentPracticeComparison | null
): WaterPlanInput[] {
  const inputs: WaterPlanInput[] = rankedPlans.slice(0, 4).map((plan, idx) => ({
    plan_id: `option_${idx + 1}_${plan.crop_ids.join('_')}`,
    label: `#${idx + 1} ${plan.seasons.map((s) => s.name).join(' → ')}`,
    is_current_practice: false,
    seasons: plan.seasons.map((s) => ({
      crop_id: s.crop_id,
      planting_month: s.planting_month,
      duration_months: s.duration_months,
    })),
  }));

  if (
    baselineComparison?.status === 'ok' &&
    baselineComparison.evaluated_plan &&
    baselineComparison.evaluated_plan.seasons.length > 0
  ) {
    const bp = baselineComparison.evaluated_plan;
    inputs.push({
      plan_id: `baseline_${bp.crop_ids.join('_')}`,
      label: `Current: ${bp.seasons.map((s) => s.name).join(' → ')}`,
      is_current_practice: true,
      seasons: bp.seasons.map((s) => ({
        crop_id: s.crop_id,
        planting_month: s.planting_month,
        duration_months: s.duration_months,
      })),
    });
  }

  return inputs;
}

export function buildWaterCompareRequest(params: {
  farm: FarmProfile;
  rankedPlans: RotationPlanOption[];
  baselineComparison?: CurrentPracticeComparison | null;
  startYear: number;
  endYear: number;
  waterLevel: BackendWaterLevel;
  includeCultivatedArea: boolean;
}): WaterCompareRequest {
  const {
    farm,
    rankedPlans,
    baselineComparison,
    startYear,
    endYear,
    waterLevel,
    includeCultivatedArea,
  } = params;

  const hasPositiveArea =
    Number.isFinite(farm.details.areaHectares) && farm.details.areaHectares > 0;

  return {
    latitude: farm.location.latitude,
    longitude: farm.location.longitude,
    start_year: startYear,
    end_year: endYear,
    plans: buildWaterPlanInputs(rankedPlans, baselineComparison),
    cultivated_area_ha:
      includeCultivatedArea && hasPositiveArea ? farm.details.areaHectares : null,
    irrigation_method: farm.details.irrigationMethod || null,
    water_availability: waterLevel,
    apply_fao56_climate_kc_adjustment: true,
  };
}

export function formatWaterDepthMm(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return 'Unavailable';
  return `${new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(Math.round(value))} mm`;
}

export function formatWaterVolumeM3(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return 'Omitted (area unconfirmed)';
  }
  return `${new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(Math.round(value))} m³`;
}

export function formatEvidenceLabel(status: string): string {
  if (status === 'verified') return 'Verified FAO-56';
  if (status === 'preliminary') return 'Preliminary Kc';
  return 'Unavailable';
}

export function buildWaterChartData(plans: WaterPlanComparison[]) {
  return plans
    .filter((p) => p.available && p.totals_mean_mm !== null)
    .map((p) => ({
      plan: p.label,
      ETc: p.totals_mean_mm?.etc_mm ?? 0,
      EffectiveRain: p.totals_mean_mm?.effective_rainfall_mm ?? 0,
      Deficit: p.totals_mean_mm?.preliminary_deficit_mm ?? 0,
    }));
}

export function WaterIntelligencePanel({
  farm,
  rankedPlans,
  baselineComparison,
  startYear,
  endYear,
  waterLevel,
  areaUnit,
  persistedWater,
}: WaterIntelligencePanelProps) {
  const hasFarmArea =
    Number.isFinite(farm.details.areaHectares) && farm.details.areaHectares > 0;
  const isBoundaryArea = farm.details.areaSource === 'calculated_from_boundary';

  const [isExpanded, setIsExpanded] = useState(false);
  const [includeAreaVolume, setIncludeAreaVolume] = useState<boolean>(hasFarmArea);
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [lastFetchedSig, setLastFetchedSig] = useState<string>('');

  const waterMutation = useWaterComparisonMutation(farm.id);

  useEffect(() => {
    setIncludeAreaVolume(hasFarmArea);
    setSelectedPlanId(null);
    setLastFetchedSig('');
  }, [farm.id, hasFarmArea]);

  const requestPayload = useMemo(
    () =>
      buildWaterCompareRequest({
        farm,
        rankedPlans,
        baselineComparison,
        startYear,
        endYear,
        waterLevel,
        includeCultivatedArea: includeAreaVolume,
      }),
    [
      farm,
      rankedPlans,
      baselineComparison,
      startYear,
      endYear,
      waterLevel,
      includeAreaVolume,
    ]
  );

  const requestSig = useMemo(
    () =>
      JSON.stringify({
        farmId: farm.id,
        lat: Number(farm.location.latitude.toFixed(4)),
        lon: Number(farm.location.longitude.toFixed(4)),
        startYear,
        endYear,
        area: requestPayload.cultivated_area_ha ?? null,
        plans: requestPayload.plans.map((p) => ({
          id: p.plan_id,
          s: p.seasons,
        })),
      }),
    [farm.id, farm.location.latitude, farm.location.longitude, startYear, endYear, requestPayload]
  );

  const runAnalysis = () => {
    setLastFetchedSig(requestSig);
    waterMutation.mutate(requestPayload);
  };

  useEffect(() => {
    if (isExpanded && requestSig !== lastFetchedSig && !waterMutation.isPending) {
      setLastFetchedSig(requestSig);
      waterMutation.mutate(requestPayload);
    }
  }, [isExpanded, requestSig, lastFetchedSig, waterMutation, requestPayload]);

  const activeData: WaterCompareResponse | null =
    waterMutation.data ?? persistedWater ?? null;

  const availablePlans = useMemo(
    () => (activeData?.plans ?? []).filter((p) => p.available && p.totals_mean_mm !== null),
    [activeData]
  );

  const inspectedPlan = useMemo(() => {
    if (availablePlans.length === 0) return null;
    return (
      availablePlans.find((p) => p.plan_id === selectedPlanId) ?? availablePlans[0]
    );
  }, [availablePlans, selectedPlanId]);

  const chartData = useMemo(
    () => (activeData ? buildWaterChartData(activeData.plans) : []),
    [activeData]
  );

  const lowestDeficitPlan = useMemo(() => {
    if (!activeData?.comparison.lowest_deficit_plan_id) return availablePlans[0] ?? null;
    return (
      availablePlans.find(
        (p) => p.plan_id === activeData.comparison.lowest_deficit_plan_id
      ) ??
      availablePlans[0] ??
      null
    );
  }, [activeData, availablePlans]);

  return (
    <section
      aria-label="NASA Water Intelligence and Crop Water Requirements"
      className="rounded-xl border border-[var(--as-border)] bg-[var(--as-bg-surface)] p-4 sm:p-5 space-y-4 text-xs"
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Droplets className="w-4 h-4 as-text-accent shrink-0" />
            <h4 className="text-sm font-semibold text-[var(--as-text-primary)]">
              NASA Water Intelligence (FAO-56 ET₀, Crop ETc &amp; Effective Rainfall)
            </h4>
          </div>
          <p className="text-[11px] text-[var(--as-text-muted)]">
            Compares daily NASA POWER atmospheric demand, FAO-56 crop water requirement, USDA-SCS effective rainfall, and monthly-step preliminary irrigation deficit across these plans (historical baseline only; existing rotation ranking unchanged).
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {isExpanded && (
            <button
              type="button"
              onClick={runAnalysis}
              disabled={waterMutation.isPending}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-[var(--as-border)] bg-[var(--as-bg-subtle)] text-[var(--as-text-primary)] hover:border-[var(--as-accent-text)] disabled:opacity-60 whitespace-nowrap"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 ${waterMutation.isPending ? 'animate-spin' : ''}`}
              />
              Refresh
            </button>
          )}
          <button
            type="button"
            onClick={() => setIsExpanded((prev) => !prev)}
            aria-expanded={isExpanded}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg as-btn-primary transition-colors whitespace-nowrap"
          >
            {isExpanded ? (
              <>
                <ChevronUp className="w-3.5 h-3.5" />
                Hide Water Analysis
              </>
            ) : (
              <>
                <ChevronDown className="w-3.5 h-3.5" />
                Compare Crop Water Balance
              </>
            )}
          </button>
        </div>
      </div>

      {isExpanded && (
        <div className="space-y-4 pt-2 border-t border-[var(--as-border)]">
          {/* Cultivated Area & Volume Toggle */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 rounded-lg bg-[var(--as-bg-subtle)] border border-[var(--as-border)]">
            <div className="space-y-0.5">
              <span className="font-semibold text-[var(--as-text-primary)]">
                Volume Conversion Basis (1 mm = 10 m³/ha)
              </span>
              <p className="text-[11px] text-[var(--as-text-muted)]">
                {hasFarmArea
                  ? `Saved area: ${formatArea(farm.details.areaHectares, areaUnit)} (${
                      isBoundaryArea
                        ? 'estimated from farm boundary polygon — uncheck if cultivated area differs'
                        : 'farmer-entered area'
                    }).`
                  : 'Cultivated farm area is missing or zero; depths remain in mm and m³ volumes are omitted.'}
              </p>
            </div>

            {hasFarmArea && (
              <label className="inline-flex items-center gap-2 cursor-pointer font-medium text-[var(--as-text-primary)] shrink-0">
                <input
                  type="checkbox"
                  checked={includeAreaVolume}
                  onChange={(e) => setIncludeAreaVolume(e.target.checked)}
                  className="rounded border-[var(--as-border)] accent-[#14532D]"
                />
                <span>Convert mm to field volume (m³)</span>
              </label>
            )}
          </div>

          {/* Loading State */}
          {waterMutation.isPending && (
            <div className="flex items-center gap-2.5 p-4 rounded-lg border border-[var(--as-border)] bg-[var(--as-bg-subtle)] text-[var(--as-text-muted)]">
              <Loader2 className="w-4 h-4 animate-spin as-text-accent shrink-0" />
              <span>
                Retrieving NASA POWER daily meteorology ({startYear}–{endYear}) and computing FAO-56 Penman-Monteith water balances...
              </span>
            </div>
          )}

          {/* HTTP / Network Error */}
          {waterMutation.isError && !waterMutation.isPending && (
            <StatusBanner
              tone="error"
              title="Water Balance Calculation Unavailable"
              description={FARMER_ERROR_MESSAGES.water}
              action={
                <button
                  type="button"
                  onClick={runAnalysis}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-[#B91C1C] text-white whitespace-nowrap"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  Retry
                </button>
              }
            />
          )}

          {/* Backend Data Unavailable or Insufficient Common Years */}
          {!waterMutation.isPending &&
            !waterMutation.isError &&
            activeData &&
            activeData.status !== 'ok' && (
              <StatusBanner
                tone="warning"
                title={
                  activeData.status === 'data_unavailable'
                    ? 'NASA Daily Meteorology Temporarily Unavailable'
                    : 'Insufficient Comparable Historical Water Years'
                }
                description={
                  activeData.message ||
                  activeData.comparison?.message ||
                  'Water balance figures were not generated because required historical daily observations were incomplete.'
                }
                action={
                  <button
                    type="button"
                    onClick={runAnalysis}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-[var(--as-warning-border)] as-text-warning whitespace-nowrap"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    Retry
                  </button>
                }
              />
            )}

          {/* Main Results */}
          {!waterMutation.isPending &&
            !waterMutation.isError &&
            activeData &&
            activeData.status === 'ok' && (
              <div className="space-y-4">
                {/* Explicit Water Availability Distinction */}
                <StatusBanner
                  tone="info"
                  title="Historical Water Demand vs. Actual Farm Water Supply"
                  description={activeData.farm_water_context.water_availability_note}
                />

                {/* Headline Lowest-Deficit Snapshot Distinguishing All 5 Quantitative Metrics */}
                {lowestDeficitPlan?.totals_mean_mm && (
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <p className="font-semibold text-[var(--as-text-primary)]">
                        Lowest Historical Net Irrigation Deficit Option:{' '}
                        <span className="as-text-accent">{lowestDeficitPlan.label}</span>
                      </p>
                      <span className="font-mono tabular-nums text-[11px] text-[var(--as-text-muted)]">
                        Aligned cycles: {activeData.comparison.common_comparable_years_count} yrs (
                        {activeData.comparison.common_comparable_years[0]}–
                        {
                          activeData.comparison.common_comparable_years[
                            activeData.comparison.common_comparable_years.length - 1
                          ]
                        }
                        ) · NASA grid elev:{' '}
                        {activeData.meteorology?.location.elevation_m != null
                          ? `${activeData.meteorology.location.elevation_m} m`
                          : 'PS observed'}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 lg:grid-cols-5 gap-2.5">
                      <div className="p-3 rounded-lg border border-[var(--as-border)] bg-[var(--as-bg-subtle)]">
                        <span className="block text-[11px] text-[var(--as-text-muted)]">
                          1. Atmospheric Demand (ET₀)
                        </span>
                        <span className="font-mono tabular-nums text-sm font-semibold text-[var(--as-text-primary)]">
                          {formatWaterDepthMm(lowestDeficitPlan.totals_mean_mm.et0_mm)}
                        </span>
                      </div>
                      <div className="p-3 rounded-lg border border-[var(--as-border)] bg-[var(--as-bg-subtle)]">
                        <span className="block text-[11px] text-[var(--as-text-muted)]">
                          2. Crop Demand (ETc)
                        </span>
                        <span className="font-mono tabular-nums text-sm font-semibold text-[var(--as-text-primary)]">
                          {formatWaterDepthMm(lowestDeficitPlan.totals_mean_mm.etc_mm)}
                        </span>
                        {lowestDeficitPlan.volumes_mean_m3?.etc_m3 != null && (
                          <span className="block font-mono tabular-nums text-[11px] text-[var(--as-text-muted)]">
                            {formatWaterVolumeM3(lowestDeficitPlan.volumes_mean_m3.etc_m3)}
                          </span>
                        )}
                      </div>
                      <div className="p-3 rounded-lg border border-[var(--as-border)] bg-[var(--as-bg-subtle)]">
                        <span className="block text-[11px] text-[var(--as-text-muted)]">
                          3. Hist. Rainfall (PRECTOTCORR)
                        </span>
                        <span className="font-mono tabular-nums text-sm font-semibold text-[var(--as-text-primary)]">
                          {formatWaterDepthMm(lowestDeficitPlan.totals_mean_mm.precip_mm)}
                        </span>
                      </div>
                      <div className="p-3 rounded-lg border border-[var(--as-border)] bg-[var(--as-bg-subtle)]">
                        <span className="block text-[11px] text-[var(--as-text-muted)]">
                          4. Est. Effective Rain (Peff)
                        </span>
                        <span className="font-mono tabular-nums text-sm font-semibold as-text-accent">
                          {formatWaterDepthMm(
                            lowestDeficitPlan.totals_mean_mm.effective_rainfall_mm
                          )}
                        </span>
                      </div>
                      <div className="col-span-2 lg:col-span-1 p-3 rounded-lg border border-[var(--as-border)] bg-[var(--as-bg-subtle)]">
                        <span className="block text-[11px] text-[var(--as-text-muted)]">
                          5. Prelim. Net Deficit
                        </span>
                        <span className="font-mono tabular-nums text-sm font-semibold as-text-warning">
                          {formatWaterDepthMm(
                            lowestDeficitPlan.totals_mean_mm.preliminary_deficit_mm
                          )}
                        </span>
                        {lowestDeficitPlan.volumes_mean_m3?.preliminary_deficit_m3 != null && (
                          <span className="block font-mono tabular-nums text-[11px] text-[var(--as-text-muted)]">
                            {formatWaterVolumeM3(
                              lowestDeficitPlan.volumes_mean_m3.preliminary_deficit_m3
                            )}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* Baseline Difference Note */}
                {activeData.comparison.baseline_comparison && (
                  <p className="text-xs text-[var(--as-text-primary)] p-3 rounded-lg border border-[var(--as-border)] bg-[var(--as-bg-subtle)]">
                    <strong>Vs. Your Current Rotation ({activeData.comparison.baseline_comparison.current_plan_label}):</strong>{' '}
                    {activeData.comparison.baseline_comparison.compared_plan_label} shows{' '}
                    <span className="font-mono tabular-nums font-semibold">
                      {activeData.comparison.baseline_comparison.deficit_delta_mm > 0 ? '+' : ''}
                      {activeData.comparison.baseline_comparison.deficit_delta_mm} mm
                      {activeData.comparison.baseline_comparison.deficit_delta_percent != null
                        ? ` (${
                            activeData.comparison.baseline_comparison.deficit_delta_percent > 0
                              ? '+'
                              : ''
                          }${activeData.comparison.baseline_comparison.deficit_delta_percent}%)`
                        : ''}
                    </span>{' '}
                    historical preliminary deficit
                    {activeData.comparison.baseline_comparison.deficit_delta_m3 != null
                      ? ` (${
                          activeData.comparison.baseline_comparison.deficit_delta_m3 > 0
                            ? '+'
                            : ''
                        }${Math.round(
                          activeData.comparison.baseline_comparison.deficit_delta_m3
                        ).toLocaleString('en-US')} m³)`
                      : ''}
                    . {activeData.comparison.baseline_comparison.note}
                  </p>
                )}

                {/* Paddy Rice Explicit Caveat */}
                {activeData.paddy_rice_caveat && (
                  <div className="flex items-start gap-2.5 p-3 rounded-lg border border-[var(--as-warning-border)] bg-[var(--as-warning-surface)]">
                    <AlertTriangle className="w-4 h-4 as-text-warning shrink-0 mt-0.5" />
                    <p className="text-[11px] text-[var(--as-text-primary)] leading-relaxed">
                      <strong>Paddy Rice Water Caveat:</strong> {activeData.paddy_rice_caveat}
                    </p>
                  </div>
                )}

                {/* Recharts Comparison Bar Chart */}
                {chartData.length > 0 && (
                  <div className="space-y-2">
                    <p className="font-semibold text-[var(--as-text-primary)]">
                      Cycle Mean Crop Water Demand vs. Effective Rainfall &amp; Preliminary Deficit (mm)
                    </p>
                    <div className="h-[235px] w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                          data={chartData}
                          margin={{ top: 6, right: 12, left: 0, bottom: 24 }}
                        >
                          <CartesianGrid
                            strokeDasharray="3 3"
                            stroke="var(--as-chart-grid)"
                            opacity={0.7}
                          />
                          <XAxis
                            dataKey="plan"
                            interval={0}
                            angle={chartData.length > 2 ? -8 : 0}
                            textAnchor={chartData.length > 2 ? 'end' : 'middle'}
                            height={48}
                            tick={{ fontSize: 10.5, fill: 'var(--as-chart-axis)' }}
                            stroke="var(--as-chart-grid)"
                          />
                          <YAxis
                            unit=" mm"
                            tick={{ fontSize: 10.5, fill: 'var(--as-chart-axis)' }}
                            stroke="var(--as-chart-grid)"
                            width={56}
                          />
                          <Tooltip
                            contentStyle={{
                              backgroundColor: '#111D18',
                              borderColor: '#23362D',
                              borderRadius: '8px',
                              color: '#E8F1EC',
                              fontSize: '12px',
                            }}
                          />
                          <Legend
                            wrapperStyle={{ fontSize: '11px', color: 'var(--as-text-primary)' }}
                          />
                          <Bar
                            dataKey="ETc"
                            name="Crop Demand (ETc)"
                            fill="var(--as-chart-temp)"
                            radius={[4, 4, 0, 0]}
                          />
                          <Bar
                            dataKey="EffectiveRain"
                            name="Est. Effective Rain (Peff)"
                            fill="var(--as-chart-rain)"
                            radius={[4, 4, 0, 0]}
                          />
                          <Bar
                            dataKey="Deficit"
                            name="Prelim. Net Deficit"
                            fill="#D97706"
                            radius={[4, 4, 0, 0]}
                          />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                )}

                {/* Plan Comparison Table */}
                <div className="overflow-x-auto rounded-lg border border-[var(--as-border)]">
                  <table className="w-full text-left text-xs">
                    <thead className="border-b border-[var(--as-border)] bg-[var(--as-bg-subtle)]">
                      <tr>
                        <th className="px-3 py-2 font-semibold">Rotation Plan</th>
                        <th className="px-3 py-2 font-semibold">Kc Evidence</th>
                        <th className="px-3 py-2 font-semibold text-right">ET₀</th>
                        <th className="px-3 py-2 font-semibold text-right">Crop ETc</th>
                        <th className="px-3 py-2 font-semibold text-right">Hist. Rain</th>
                        <th className="px-3 py-2 font-semibold text-right">Eff. Rain</th>
                        <th className="px-3 py-2 font-semibold text-right">Prelim. Deficit</th>
                        <th className="px-3 py-2 font-semibold text-right">Deficit Vol.</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--as-border)]">
                      {activeData.plans.map((p) => {
                        const selected = inspectedPlan?.plan_id === p.plan_id;
                        return (
                          <tr
                            key={p.plan_id}
                            className={`${
                              selected ? 'bg-[var(--as-accent-surface)]' : 'hover:bg-[var(--as-bg-subtle)]/60'
                            }`}
                          >
                            <td className="px-3 py-2 font-medium">
                              <button
                                type="button"
                                onClick={() => setSelectedPlanId(p.plan_id)}
                                disabled={!p.available}
                                className="text-left hover:underline disabled:no-underline"
                              >
                                {p.label}
                                {p.has_paddy_rice_caveat ? ' *' : ''}
                              </button>
                            </td>
                            <td className="px-3 py-2 text-[var(--as-text-muted)] whitespace-nowrap">
                              {formatEvidenceLabel(p.evidence_status)}
                            </td>
                            <td className="px-3 py-2 font-mono tabular-nums text-right whitespace-nowrap">
                              {p.totals_mean_mm ? formatWaterDepthMm(p.totals_mean_mm.et0_mm) : '—'}
                            </td>
                            <td className="px-3 py-2 font-mono tabular-nums text-right whitespace-nowrap">
                              {p.totals_mean_mm ? formatWaterDepthMm(p.totals_mean_mm.etc_mm) : '—'}
                            </td>
                            <td className="px-3 py-2 font-mono tabular-nums text-right whitespace-nowrap">
                              {p.totals_mean_mm ? formatWaterDepthMm(p.totals_mean_mm.precip_mm) : '—'}
                            </td>
                            <td className="px-3 py-2 font-mono tabular-nums text-right whitespace-nowrap">
                              {p.totals_mean_mm
                                ? formatWaterDepthMm(p.totals_mean_mm.effective_rainfall_mm)
                                : '—'}
                            </td>
                            <td className="px-3 py-2 font-mono tabular-nums font-semibold text-right whitespace-nowrap">
                              {p.totals_mean_mm
                                ? formatWaterDepthMm(p.totals_mean_mm.preliminary_deficit_mm)
                                : 'Unavailable'}
                            </td>
                            <td className="px-3 py-2 font-mono tabular-nums text-right text-[var(--as-text-muted)] whitespace-nowrap">
                              {p.volumes_mean_m3?.preliminary_deficit_m3 != null
                                ? formatWaterVolumeM3(p.volumes_mean_m3.preliminary_deficit_m3)
                                : '—'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Selected Plan Season-by-Season Crop Water Breakdown */}
                {inspectedPlan && inspectedPlan.seasons.length > 0 && (
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-semibold text-[var(--as-text-primary)]">
                        Season-by-Season Crop Breakdown: {inspectedPlan.label}
                      </p>
                      <span className="text-[11px] font-mono tabular-nums text-[var(--as-text-muted)]">
                        Cycle range across aligned years: Deficit{' '}
                        {inspectedPlan.ranges_mm?.deficit_min}–
                        {inspectedPlan.ranges_mm?.deficit_max} mm
                      </span>
                    </div>
                    <div className="overflow-x-auto rounded-lg border border-[var(--as-border)]">
                      <table className="w-full text-left text-xs">
                        <thead className="border-b border-[var(--as-border)] bg-[var(--as-bg-subtle)]">
                          <tr>
                            <th className="px-3 py-2 font-semibold">Season &amp; Crop</th>
                            <th className="px-3 py-2 font-semibold">Cycle</th>
                            <th className="px-3 py-2 font-semibold">Kc (Ini/Mid/End)</th>
                            <th className="px-3 py-2 font-semibold text-right">ET₀</th>
                            <th className="px-3 py-2 font-semibold text-right">ETc</th>
                            <th className="px-3 py-2 font-semibold text-right">Eff. Rain</th>
                            <th className="px-3 py-2 font-semibold text-right">Prelim. Deficit</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[var(--as-border)]">
                          {inspectedPlan.seasons.map((s) => (
                            <tr key={`ws-${s.season_index}-${s.crop_id}`}>
                              <td className="px-3 py-2 font-medium">
                                S{s.season_index}: {s.crop_name}
                                {s.evidence_status === 'preliminary' && (
                                  <span className="block text-[11px] as-text-warning">
                                    Preliminary stage proxy ({s.crop_id})
                                  </span>
                                )}
                              </td>
                              <td className="px-3 py-2 font-mono tabular-nums text-[var(--as-text-muted)]">
                                {s.cycle_days} d
                              </td>
                              <td className="px-3 py-2 font-mono tabular-nums text-[var(--as-text-muted)]">
                                {s.kc_ini.toFixed(2)} / {s.kc_mid_mean_used.toFixed(2)} /{' '}
                                {s.kc_end_mean_used.toFixed(2)}
                              </td>
                              <td className="px-3 py-2 font-mono tabular-nums text-right">
                                {formatWaterDepthMm(s.mean_et0_mm)}
                              </td>
                              <td className="px-3 py-2 font-mono tabular-nums text-right">
                                {formatWaterDepthMm(s.mean_etc_mm)}
                              </td>
                              <td className="px-3 py-2 font-mono tabular-nums text-right">
                                {formatWaterDepthMm(s.mean_effective_rainfall_mm)}
                              </td>
                              <td className="px-3 py-2 font-mono tabular-nums font-semibold text-right">
                                {formatWaterDepthMm(s.mean_preliminary_deficit_mm)}
                                <span className="block text-[10px] font-normal text-[var(--as-text-muted)]">
                                  ({s.deficit_range_mm.min}–{s.deficit_range_mm.max} mm)
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Collapsible Methodology, Plain-Language Definitions & Sources */}
                <details className="rounded-lg border border-[var(--as-border)] bg-[var(--as-bg-subtle)] p-3">
                  <summary className="cursor-pointer font-semibold text-[var(--as-text-primary)] inline-flex items-center gap-1.5">
                    <Info className="w-3.5 h-3.5 as-text-accent" />
                    Plain-Language Definitions, Equations &amp; Limitations
                  </summary>
                  <div className="mt-2.5 space-y-2 text-[11px] text-[var(--as-text-muted)] leading-relaxed">
                    <p>
                      <strong className="text-[var(--as-text-primary)]">ET₀ (Atmospheric Water Demand):</strong>{' '}
                      How strongly sun, temperature, humidity, and wind pull moisture from a well-watered grass surface (FAO-56 Penman-Monteith daily Eq. 6).
                    </p>
                    <p>
                      <strong className="text-[var(--as-text-primary)]">ETc (Crop Water Demand):</strong>{' '}
                      Estimated crop evapotranspiration (Kc × ET₀) across FAO-56 Initial, Development, Mid, and Late canopy stages under standard non-stressed field management.
                    </p>
                    <p>
                      <strong className="text-[var(--as-text-primary)]">Effective Rainfall (USDA-SCS):</strong>{' '}
                      Share of historical NASA POWER rainfall estimated to infiltrate for crop use after deep percolation and runoff. Monthly net deficit sums <span className="font-mono">max(0, ETc − Peff)</span> month by month so wet-season floods never mask dry-month irrigation shortfalls.
                    </p>
                    {activeData.limitations.length > 0 && (
                      <ul className="list-disc pl-4 space-y-1">
                        {activeData.limitations.map((lim, idx) => (
                          <li key={`w-lim-${idx}`}>{lim}</li>
                        ))}
                      </ul>
                    )}
                    {activeData.sources && activeData.sources.length > 0 && (
                      <div className="pt-1">
                        <span className="font-semibold text-[var(--as-text-primary)]">Sources: </span>
                        {activeData.sources.map((src, idx) => (
                          <span key={src.id}>
                            {idx > 0 ? ' · ' : ''}
                            <a
                              href={src.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="as-text-accent underline hover:opacity-80"
                            >
                              {src.title.split('—')[0].trim()}
                            </a>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </details>
              </div>
            )}
        </div>
      )}
    </section>
  );
}
