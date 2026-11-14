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
      className="rounded-xl border border-[var(--as-border)] bg-[var(--as-bg-surface)] p-5 sm:p-6 space-y-4 text-sm"
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <Droplets className="w-5 h-5 as-text-accent shrink-0" />
            <h4 className="text-[17px] sm:text-lg font-semibold text-[var(--as-text-primary)]">
              NASA Water Comparison (Crop Water Use &amp; Rain Balance)
            </h4>
          </div>
          <p className="text-sm text-[var(--as-text-muted)] leading-[1.55]">
            Compares daily NASA weather drying power (ET₀), estimated crop water use (ETc), and past rainfall across these crop plans. This historical check sits alongside your plans and does not change rotation scores.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {isExpanded && (
            <button
              type="button"
              onClick={runAnalysis}
              disabled={waterMutation.isPending}
              className="inline-flex items-center gap-1.5 min-h-[40px] px-3.5 py-2 text-sm font-medium rounded-lg border border-[var(--as-border)] bg-[var(--as-bg-subtle)] text-[var(--as-text-primary)] hover:border-[var(--as-accent-text)] disabled:opacity-60 whitespace-nowrap"
            >
              <RefreshCw
                className={`w-4 h-4 ${waterMutation.isPending ? 'animate-spin' : ''}`}
              />
              Refresh
            </button>
          )}
          <button
            type="button"
            onClick={() => setIsExpanded((prev) => !prev)}
            aria-expanded={isExpanded}
            className="inline-flex items-center gap-1.5 min-h-[42px] px-4 py-2 text-sm font-semibold rounded-lg as-btn-primary transition-colors whitespace-nowrap"
          >
            {isExpanded ? (
              <>
                <ChevronUp className="w-4 h-4" />
                Hide Water Analysis
              </>
            ) : (
              <>
                <ChevronDown className="w-4 h-4" />
                Compare Crop Water Balance
              </>
            )}
          </button>
        </div>
      </div>

      {isExpanded && (
        <div className="space-y-5 pt-3 border-t border-[var(--as-border)]">
          {/* Cultivated Area & Volume Toggle */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-lg bg-[var(--as-bg-subtle)] border border-[var(--as-border)]">
            <div className="space-y-1">
              <span className="font-semibold text-[var(--as-text-primary)]">
                Field Volume Conversion (1 mm = 10 m³/ha)
              </span>
              <p className="text-[13px] text-[var(--as-text-muted)] leading-[1.5]">
                {hasFarmArea
                  ? `Saved area: ${formatArea(farm.details.areaHectares, areaUnit)} (${
                      isBoundaryArea
                        ? 'estimated from farm boundary polygon — uncheck if planted area differs'
                        : 'farmer-entered area'
                    }).`
                  : 'Farm area is missing or zero; water depths stay in mm and total m³ volumes are omitted.'}
              </p>
            </div>

            {hasFarmArea && (
              <label className="inline-flex items-center gap-2.5 min-h-[40px] cursor-pointer font-medium text-[var(--as-text-primary)] shrink-0">
                <input
                  type="checkbox"
                  checked={includeAreaVolume}
                  onChange={(e) => setIncludeAreaVolume(e.target.checked)}
                  className="w-4 h-4 rounded border-[var(--as-border)] accent-[#14532D]"
                />
                <span>Show volume for my field size (m³)</span>
              </label>
            )}
          </div>

          {/* Loading State */}
          {waterMutation.isPending && (
            <div className="flex items-center gap-2.5 p-4 rounded-lg border border-[var(--as-border)] bg-[var(--as-bg-subtle)] text-[var(--as-text-muted)]">
              <Loader2 className="w-4 h-4 animate-spin as-text-accent shrink-0" />
              <span>
                Loading daily NASA weather records ({startYear}–{endYear}) and calculating FAO-56 water balances...
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
                  className="inline-flex items-center gap-1.5 min-h-[40px] px-3.5 py-2 text-sm font-semibold rounded-lg bg-[#B91C1C] text-white whitespace-nowrap"
                >
                  <RefreshCw className="w-4 h-4" />
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
                    ? 'NASA Daily Weather Records Temporarily Unavailable'
                    : 'Not Enough Comparable Past Years for Water Comparison'
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
                    className="inline-flex items-center gap-1.5 min-h-[40px] px-3.5 py-2 text-sm font-semibold rounded-lg border border-[var(--as-warning-border)] as-text-warning whitespace-nowrap"
                  >
                    <RefreshCw className="w-4 h-4" />
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
                  title="Crop Water Need vs. Your Actual Water Supply"
                  description={activeData.farm_water_context.water_availability_note}
                />

                {/* Headline Lowest-Deficit Snapshot Distinguishing All 5 Quantitative Metrics */}
                {lowestDeficitPlan?.totals_mean_mm && (
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <p className="text-[15px] font-semibold text-[var(--as-text-primary)]">
                        Lowest Historical Water Shortfall Option:{' '}
                        <span className="as-text-accent">{lowestDeficitPlan.label}</span>
                      </p>
                      <span className="tabular-nums text-[13px] text-[var(--as-text-muted)]">
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

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                      <div className="p-3.5 rounded-lg border border-[var(--as-border)] bg-[var(--as-bg-subtle)] space-y-1">
                        <span className="block text-[13px] font-medium text-[var(--as-text-muted)]">
                          Reference water demand (ET₀)
                        </span>
                        <span className="block tabular-nums text-[22px] leading-tight font-bold text-[var(--as-text-primary)]">
                          {formatWaterDepthMm(lowestDeficitPlan.totals_mean_mm.et0_mm)}
                        </span>
                      </div>
                      <div className="p-3.5 rounded-lg border border-[var(--as-border)] bg-[var(--as-bg-subtle)] space-y-1">
                        <span className="block text-[13px] font-medium text-[var(--as-text-muted)]">
                          Estimated crop water use (ETc)
                        </span>
                        <span className="block tabular-nums text-[22px] leading-tight font-bold text-[var(--as-text-primary)]">
                          {formatWaterDepthMm(lowestDeficitPlan.totals_mean_mm.etc_mm)}
                        </span>
                        {lowestDeficitPlan.volumes_mean_m3?.etc_m3 != null && (
                          <span className="block tabular-nums text-[13px] text-[var(--as-text-muted)]">
                            {formatWaterVolumeM3(lowestDeficitPlan.volumes_mean_m3.etc_m3)}
                          </span>
                        )}
                      </div>
                      <div className="p-3.5 rounded-lg border border-[var(--as-border)] bg-[var(--as-bg-subtle)] space-y-1">
                        <span className="block text-[13px] font-medium text-[var(--as-text-muted)]">
                          Past rainfall (NASA)
                        </span>
                        <span className="block tabular-nums text-[22px] leading-tight font-bold text-[var(--as-text-primary)]">
                          {formatWaterDepthMm(lowestDeficitPlan.totals_mean_mm.precip_mm)}
                        </span>
                      </div>
                      <div className="p-3.5 rounded-lg border border-[var(--as-border)] bg-[var(--as-bg-subtle)] space-y-1">
                        <span className="block text-[13px] font-medium text-[var(--as-text-muted)]">
                          Estimated effective rainfall
                        </span>
                        <span className="block tabular-nums text-[22px] leading-tight font-bold as-text-accent">
                          {formatWaterDepthMm(
                            lowestDeficitPlan.totals_mean_mm.effective_rainfall_mm
                          )}
                        </span>
                      </div>
                      <div className="sm:col-span-2 lg:col-span-1 p-3.5 rounded-lg border border-[var(--as-border)] bg-[var(--as-bg-subtle)] space-y-1">
                        <span className="block text-[13px] font-medium text-[var(--as-text-muted)]">
                          Estimated water shortfall (preliminary)
                        </span>
                        <span className="block tabular-nums text-[22px] leading-tight font-bold as-text-warning">
                          {formatWaterDepthMm(
                            lowestDeficitPlan.totals_mean_mm.preliminary_deficit_mm
                          )}
                        </span>
                        {lowestDeficitPlan.volumes_mean_m3?.preliminary_deficit_m3 != null && (
                          <span className="block tabular-nums text-[13px] text-[var(--as-text-muted)]">
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
                  <p className="text-sm text-[var(--as-text-primary)] p-3.5 rounded-lg border border-[var(--as-border)] bg-[var(--as-bg-subtle)] leading-[1.55]">
                    <strong>Vs. Your Current Rotation ({activeData.comparison.baseline_comparison.current_plan_label}):</strong>{' '}
                    {activeData.comparison.baseline_comparison.compared_plan_label} shows{' '}
                    <span className="tabular-nums font-semibold">
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
                    preliminary historical water shortfall
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
                  <div className="flex items-start gap-2.5 p-3.5 rounded-lg border border-[var(--as-warning-border)] bg-[var(--as-warning-surface)]">
                    <AlertTriangle className="w-4 h-4 as-text-warning shrink-0 mt-0.5" />
                    <p className="text-[13px] text-[var(--as-text-primary)] leading-[1.55]">
                      <strong>Paddy Rice Water Caveat:</strong> {activeData.paddy_rice_caveat}
                    </p>
                  </div>
                )}

                {/* Recharts Comparison Bar Chart */}
                {chartData.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-[15px] font-semibold text-[var(--as-text-primary)]">
                      Estimated Crop Water Use vs. Effective Rainfall &amp; Water Shortfall (mm)
                    </p>
                    <div
                      role="img"
                      aria-label={`Bar chart comparing estimated crop water use (ETc), estimated effective rainfall, and preliminary water shortfall across ${chartData.length} rotation plans`}
                      className="h-[250px] w-full"
                    >
                      <p className="sr-only">
                        {chartData
                          .map(
                            (d) =>
                              `${d.plan}: crop water use ${Math.round(d.ETc)} mm, effective rainfall ${Math.round(d.EffectiveRain)} mm, preliminary shortfall ${Math.round(d.Deficit)} mm`
                          )
                          .join('; ')}
                      </p>
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
                            height={52}
                            tick={{ fontSize: 12, fill: 'var(--as-chart-axis)' }}
                            stroke="var(--as-chart-grid)"
                          />
                          <YAxis
                            unit=" mm"
                            tick={{ fontSize: 12, fill: 'var(--as-chart-axis)' }}
                            stroke="var(--as-chart-grid)"
                            width={62}
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
                          <Legend
                            wrapperStyle={{ fontSize: '13px', color: 'var(--as-text-primary)' }}
                          />
                          <Bar
                            dataKey="ETc"
                            name="Estimated crop water use (ETc)"
                            fill="var(--as-chart-temp)"
                            radius={[4, 4, 0, 0]}
                          />
                          <Bar
                            dataKey="EffectiveRain"
                            name="Estimated effective rain (Peff)"
                            fill="var(--as-chart-rain)"
                            radius={[4, 4, 0, 0]}
                          />
                          <Bar
                            dataKey="Deficit"
                            name="Estimated water shortfall (preliminary)"
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
                  <table className="w-full text-left text-[13px]">
                    <thead className="border-b border-[var(--as-border)] bg-[var(--as-bg-subtle)]">
                      <tr>
                        <th className="px-3 py-2.5 font-semibold">Rotation Plan</th>
                        <th className="px-3 py-2.5 font-semibold">Crop Coefficient Data</th>
                        <th className="px-3 py-2.5 font-semibold text-right">Ref. Demand (ET₀)</th>
                        <th className="px-3 py-2.5 font-semibold text-right">Crop Use (ETc)</th>
                        <th className="px-3 py-2.5 font-semibold text-right">Past Rain</th>
                        <th className="px-3 py-2.5 font-semibold text-right">Eff. Rain</th>
                        <th className="px-3 py-2.5 font-semibold text-right">Water Shortfall</th>
                        <th className="px-3 py-2.5 font-semibold text-right">Shortfall Vol.</th>
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
                            <td className="px-3 py-2.5 font-semibold">
                              <button
                                type="button"
                                onClick={() => setSelectedPlanId(p.plan_id)}
                                disabled={!p.available}
                                className="min-h-[36px] text-left hover:underline disabled:no-underline"
                              >
                                {p.label}
                                {p.has_paddy_rice_caveat ? ' *' : ''}
                              </button>
                            </td>
                            <td className="px-3 py-2.5 text-[var(--as-text-muted)] whitespace-nowrap">
                              {formatEvidenceLabel(p.evidence_status)}
                            </td>
                            <td className="px-3 py-2.5 tabular-nums text-right whitespace-nowrap">
                              {p.totals_mean_mm ? formatWaterDepthMm(p.totals_mean_mm.et0_mm) : '—'}
                            </td>
                            <td className="px-3 py-2.5 tabular-nums text-right whitespace-nowrap">
                              {p.totals_mean_mm ? formatWaterDepthMm(p.totals_mean_mm.etc_mm) : '—'}
                            </td>
                            <td className="px-3 py-2.5 tabular-nums text-right whitespace-nowrap">
                              {p.totals_mean_mm ? formatWaterDepthMm(p.totals_mean_mm.precip_mm) : '—'}
                            </td>
                            <td className="px-3 py-2.5 tabular-nums text-right whitespace-nowrap">
                              {p.totals_mean_mm
                                ? formatWaterDepthMm(p.totals_mean_mm.effective_rainfall_mm)
                                : '—'}
                            </td>
                            <td className="px-3 py-2.5 tabular-nums font-semibold text-right whitespace-nowrap">
                              {p.totals_mean_mm
                                ? formatWaterDepthMm(p.totals_mean_mm.preliminary_deficit_mm)
                                : 'Unavailable'}
                            </td>
                            <td className="px-3 py-2.5 tabular-nums text-right text-[var(--as-text-muted)] whitespace-nowrap">
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
                  <div className="space-y-2.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-[15px] font-semibold text-[var(--as-text-primary)]">
                        Season-by-Season Crop Breakdown: {inspectedPlan.label}
                      </p>
                      <span className="text-[13px] tabular-nums text-[var(--as-text-muted)]">
                        Shortfall range across past years:{' '}
                        {inspectedPlan.ranges_mm?.deficit_min}–
                        {inspectedPlan.ranges_mm?.deficit_max} mm
                      </span>
                    </div>
                    <div className="overflow-x-auto rounded-lg border border-[var(--as-border)]">
                      <table className="w-full text-left text-[13px]">
                        <thead className="border-b border-[var(--as-border)] bg-[var(--as-bg-subtle)]">
                          <tr>
                            <th className="px-3 py-2.5 font-semibold">Season &amp; Crop</th>
                            <th className="px-3 py-2.5 font-semibold">Cycle</th>
                            <th className="px-3 py-2.5 font-semibold">Crop Factors (Kc)</th>
                            <th className="px-3 py-2.5 font-semibold text-right">Ref. Demand (ET₀)</th>
                            <th className="px-3 py-2.5 font-semibold text-right">Crop Use (ETc)</th>
                            <th className="px-3 py-2.5 font-semibold text-right">Eff. Rain</th>
                            <th className="px-3 py-2.5 font-semibold text-right">Water Shortfall</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[var(--as-border)]">
                          {inspectedPlan.seasons.map((s) => (
                            <tr key={`ws-${s.season_index}-${s.crop_id}`}>
                              <td className="px-3 py-2.5 font-medium">
                                Season {s.season_index}: {s.crop_name}
                                {s.evidence_status === 'preliminary' && (
                                  <span className="block text-[13px] as-text-warning">
                                    Preliminary stage proxy ({s.crop_id})
                                  </span>
                                )}
                              </td>
                              <td className="px-3 py-2.5 tabular-nums text-[var(--as-text-muted)]">
                                {s.cycle_days} days
                              </td>
                              <td className="px-3 py-2.5 tabular-nums text-[var(--as-text-muted)]">
                                {s.kc_ini.toFixed(2)} / {s.kc_mid_mean_used.toFixed(2)} /{' '}
                                {s.kc_end_mean_used.toFixed(2)}
                              </td>
                              <td className="px-3 py-2.5 tabular-nums text-right">
                                {formatWaterDepthMm(s.mean_et0_mm)}
                              </td>
                              <td className="px-3 py-2.5 tabular-nums text-right">
                                {formatWaterDepthMm(s.mean_etc_mm)}
                              </td>
                              <td className="px-3 py-2.5 tabular-nums text-right">
                                {formatWaterDepthMm(s.mean_effective_rainfall_mm)}
                              </td>
                              <td className="px-3 py-2.5 tabular-nums font-semibold text-right">
                                {formatWaterDepthMm(s.mean_preliminary_deficit_mm)}
                                <span className="block text-[13px] font-normal text-[var(--as-text-muted)]">
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
                <details className="rounded-lg border border-[var(--as-border)] bg-[var(--as-bg-subtle)] p-4">
                  <summary className="cursor-pointer font-semibold text-sm text-[var(--as-text-primary)] inline-flex items-center gap-2 min-h-[36px]">
                    <Info className="w-4 h-4 as-text-accent" />
                    Plain-Language Definitions, Equations &amp; Limitations
                  </summary>
                  <div className="mt-3 space-y-2.5 text-[13px] text-[var(--as-text-muted)] leading-[1.55]">
                    <p>
                      <strong className="text-[var(--as-text-primary)]">
                        1. Atmospheric Demand (ET₀) — Reference water demand (ET₀):
                      </strong>{' '}
                      How strongly sun, temperature, humidity, and wind pull moisture from a well-watered reference field (FAO-56 Penman-Monteith daily method).
                    </p>
                    <p>
                      <strong className="text-[var(--as-text-primary)]">
                        2. Estimated crop water use (ETc):
                      </strong>{' '}
                      Estimated crop evapotranspiration (Kc × ET₀) across early, mid-season, and late canopy stages under standard well-managed field conditions.
                    </p>
                    <p>
                      <strong className="text-[var(--as-text-primary)]">
                        5. Prelim. Net Deficit — Estimated water shortfall (preliminary):
                      </strong>{' '}
                      Monthly crop water use minus estimated USDA-SCS effective rainfall (summed month by month as{' '}
                      <span className="font-semibold text-[var(--as-text-primary)]">max(0, ETc − Peff)</span>), so heavy monsoon rain does not hide dry-month water needs. This does not confirm your farm&apos;s irrigation supply or guarantee water savings.
                    </p>
                    {activeData.limitations.length > 0 && (
                      <ul className="list-disc pl-5 space-y-1">
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
