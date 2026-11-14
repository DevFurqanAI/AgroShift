import { useState } from 'react';
import {
  ArrowRight,
  BookmarkPlus,
  Calendar,
  ChevronDown,
  ChevronUp,
  CloudSun,
  Droplets,
  Info,
  Sprout,
} from 'lucide-react';
import { ScoreProgressBar } from '../common/MetricPrimitives';
import type { RotationPlanOption } from '../../types/api';
import type { TemperatureUnit } from '../../types/farm';
import { formatProvenanceLabel } from '../../utils/provenance';
import { formatTemperature } from '../../utils/units';

interface RotationComparisonCardProps {
  plan: RotationPlanOption;
  rank: number;
  temperatureUnit: TemperatureUnit;
  topScore?: number;
  onSavePlan?: (plan: RotationPlanOption) => void;
  onInspectCrop?: (cropId: string) => void;
  rankLabelOverride?: string;
}

const MONTH_NAMES = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

function formatMonthName(monthNum: number): string {
  return MONTH_NAMES[(monthNum - 1) % 12] || `Month ${monthNum}`;
}

function getBandBadgeClass(band: string | undefined): string {
  if (!band) return 'as-badge-success';
  const lower = band.toLowerCase();
  if (lower.includes('conflict') || lower.includes('limited')) return 'as-badge-danger';
  if (lower.includes('unverified') || lower.includes('conditional')) return 'as-badge-warning';
  if (lower.includes('strong') || lower.includes('good')) return 'as-badge-success';
  if (lower.includes('moderate')) return 'as-badge-warning';
  return 'as-badge-danger';
}

function formatFitWord(score: number | null | undefined): string | undefined {
  if (score === null || score === undefined || !Number.isFinite(score)) return undefined;
  if (score >= 85) return 'Strong fit';
  if (score >= 70) return 'Good fit';
  if (score >= 55) return 'Moderate fit';
  return 'Constrained';
}

function formatResilienceLabel(cls: string | undefined): string {
  if (cls === 'consistent') return 'Consistent historical fit';
  if (cls === 'moderate_variability') return 'Moderate year-to-year exposure';
  if (cls === 'high_exposure') return 'High historical outlier exposure';
  return 'Limited historical sample';
}

export function RotationComparisonCard({
  plan,
  rank,
  temperatureUnit,
  topScore,
  onSavePlan,
  onInspectCrop,
  rankLabelOverride,
}: RotationComparisonCardProps) {
  const [showDetails, setShowDetails] = useState(false);
  const diag = plan.diagnostics;
  const soilSummary = plan.soil_health_summary;
  const feasibility = plan.feasibility;
  const resilience = plan.historical_resilience;
  const deltaFromTop =
    topScore !== undefined && Number.isFinite(topScore)
      ? Number((plan.score - topScore).toFixed(1))
      : null;

  return (
    <article className="rounded-xl border border-[var(--as-border)] bg-[var(--as-bg-surface)] p-5 sm:p-6 flex flex-col justify-between gap-5">
      <div className="space-y-4">
        {/* Card Header: Option Rank, Sequence Title, Overall Score & Evidence Completeness */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-2 min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5 text-sm font-semibold">
              <span className="as-text-accent">{rankLabelOverride || `Option #${rank}`}</span>
              <span aria-hidden="true" className="text-[var(--as-text-muted)]">
                ·
              </span>
              <span className="tabular-nums text-[22px] leading-tight font-bold text-[var(--as-text-primary)]">
                {plan.score.toFixed(1)} / 100
              </span>
              {deltaFromTop !== null && rank > 1 && (
                <span className="tabular-nums text-[13px] font-medium text-[var(--as-text-muted)]">
                  ({deltaFromTop > 0 ? `+${deltaFromTop.toFixed(1)}` : deltaFromTop.toFixed(1)} vs #1)
                </span>
              )}
              {plan.compatibility_band && (
                <span
                  className={`px-2.5 py-0.5 rounded-md text-[13px] font-semibold ${getBandBadgeClass(
                    plan.compatibility_band
                  )}`}
                >
                  {plan.compatibility_band}
                </span>
              )}
              {diag?.data_completeness && (
                <span className="text-[13px] font-medium text-[var(--as-text-muted)]">
                  Evidence: {diag.data_completeness.label} ({diag.data_completeness.evaluated_count}/{diag.data_completeness.total_count})
                </span>
              )}
            </div>

            <h3 className="text-lg font-semibold text-[var(--as-text-primary)] text-balance">
              {plan.seasons.map((s) => s.name).join(' → ')}
            </h3>

            {feasibility?.timeline_summary && (
              <p className="flex items-center gap-2 text-sm text-[var(--as-text-muted)]">
                <Calendar className="w-4 h-4 as-text-accent shrink-0" />
                <span>
                  {feasibility.timeline_summary}
                  {feasibility.total_cycle_months
                    ? ` · ${feasibility.total_cycle_months} month cycle`
                    : ''}
                </span>
              </p>
            )}
          </div>

          {onSavePlan && (
            <button
              type="button"
              onClick={() => onSavePlan(plan)}
              className="inline-flex items-center gap-1.5 min-h-[40px] px-3.5 py-2 text-sm font-semibold rounded-lg border border-[var(--as-border)] text-[var(--as-text-primary)] hover:border-[var(--as-accent-text)] transition-colors whitespace-nowrap shrink-0"
            >
              <BookmarkPlus className="w-4 h-4 as-text-accent" />
              Save This Option
            </button>
          )}
        </div>

        {/* Multi-Dimensional Factor Breakdown with Progress Bars & Drivers */}
        {diag && (
          <div className="p-4 rounded-lg bg-[var(--as-bg-subtle)] border border-[var(--as-border)] space-y-3.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h4 className="text-sm font-semibold text-[var(--as-text-primary)]">
                What Shaped This Score
              </h4>
              <span className="text-[13px] font-medium tabular-nums text-[var(--as-text-muted)]">
                {diag.distinct_families} {diag.distinct_families === 1 ? 'plant family' : 'plant families'} ·{' '}
                {diag.distinct_crops} {diag.distinct_crops === 1 ? 'crop' : 'crops'}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-3.5">
              <ScoreProgressBar
                label="Climate Fit"
                score={diag.climate_compatibility}
                interpretation={formatFitWord(diag.climate_compatibility)}
                driverHint="NASA past temperatures compared with this crop's preferred range"
              />
              <ScoreProgressBar
                label="Water & Rainfall"
                score={diag.water_compatibility}
                interpretation={formatFitWord(diag.water_compatibility)}
                driverHint="Your farm water supply and seasonal rainfall compared with crop need"
              />
              <ScoreProgressBar
                label="Planting Calendar"
                score={
                  diag.regional_calendar_evaluated && diag.regional_calendar_score != null
                    ? diag.regional_calendar_score
                    : null
                }
                interpretation={formatFitWord(diag.regional_calendar_score)}
                driverHint={
                  diag.regional_calendar_evaluated
                    ? 'Sowing and harvest timing matched against local seasonal calendars'
                    : (feasibility?.regional_timing_evidence || diag.regional_timing_evidence) === 'conditional'
                      ? `Partial planting calendar (${feasibility?.verified_calendar_seasons ?? diag.verified_calendar_seasons ?? 0}/${feasibility?.total_seasons ?? diag.total_seasons ?? plan.seasons.length} seasons verified) — planting season needs local confirmation`
                      : 'Planting season needs local confirmation (No verified regional calendar for this crop/location)'
                }
                unavailableLabel={
                  (feasibility?.regional_timing_evidence || diag.regional_timing_evidence) === 'conditional'
                    ? 'Conditional'
                    : 'Unverified'
                }
              />
              <ScoreProgressBar
                label="Crop Family Diversity"
                score={diag.family_rotation}
                interpretation={formatFitWord(diag.family_rotation)}
                driverHint="Avoids planting related crops back-to-back to reduce pests and disease"
              />
              <ScoreProgressBar
                label="Soil-Health Screening"
                score={diag.soil_health_score ?? null}
                interpretation={formatFitWord(diag.soil_health_score)}
                driverHint={
                  soilSummary?.has_legume
                    ? `Includes nitrogen-fixing legume (${soilSummary.legume_crops.join(', ')}) + residue checks`
                    : 'Checks crop residue cover, drainage, and salinity tolerance'
                }
                unavailableLabel="Evaluated"
              />
              <ScoreProgressBar
                label="Soil pH Fit"
                score={
                  diag.soil_evaluated && diag.soil_compatibility !== null
                    ? diag.soil_compatibility
                    : null
                }
                interpretation={formatFitWord(diag.soil_compatibility)}
                driverHint={
                  diag.soil_evaluated
                    ? `Fit vs. ${
                        soilSummary?.soil_ph_provenance && soilSummary.soil_ph_provenance !== 'unspecified'
                          ? formatProvenanceLabel(soilSummary.soil_ph_provenance)
                          : 'recorded farm pH'
                      }`
                    : 'Not scored because soil pH was not provided for this farm'
                }
                unavailableLabel="Not evaluated"
              />
            </div>

            {diag.ranking_drivers && diag.ranking_drivers.length > 0 && (
              <p className="text-[13px] text-[var(--as-text-muted)] pt-2 border-t border-[var(--as-border)] leading-[1.55]">
                {diag.ranking_drivers.join(' ')}
              </p>
            )}
          </div>
        )}

        {diag?.tie_note && (
          <p className="text-[13px] as-text-warning leading-[1.55]">{diag.tie_note}</p>
        )}

        {feasibility?.warnings && feasibility.warnings.length > 0 && (
          <div className="p-3.5 rounded-lg border border-[var(--as-warning-border)] bg-[var(--as-bg-subtle)] text-sm as-text-warning space-y-1.5">
            {feasibility.warnings.map((w, idx) => (
              <p key={idx}>{w}</p>
            ))}
          </div>
        )}

        {/* Visual Cropping Sequence Timeline */}
        <div className="space-y-3">
          <h4 className="text-sm font-semibold text-[var(--as-text-muted)]">
            Season-by-Season Crop Sequence &amp; Fit Breakdown
          </h4>

          <div
            aria-label="Seasonal crop succession timeline"
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5"
          >
            {plan.seasons.map((season, index) => (
              <div
                key={`tl-${season.crop_id}-${index}`}
                className="flex items-center justify-between gap-2 px-3 py-2.5 rounded-lg bg-[var(--as-bg-subtle)] border border-[var(--as-border)] text-sm"
              >
                <div className="min-w-0">
                  <p className="tabular-nums text-[13px] font-semibold as-text-accent">
                    Season {index + 1} ·{' '}
                    {season.window_label ||
                      `${formatMonthName(season.planting_month)} (${season.duration_months} mo)`}
                  </p>
                  <p className="font-semibold text-[var(--as-text-primary)] truncate">
                    {season.name}
                    {season.family ? (
                      <span className="font-normal text-[var(--as-text-muted)]">
                        {' '}
                        ({season.family})
                      </span>
                    ) : null}
                  </p>
                </div>
                <span className="tabular-nums text-sm font-bold text-[var(--as-text-primary)] shrink-0">
                  {season.screening_score.toFixed(0)}/100
                </span>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 gap-3">
            {plan.seasons.map((season, index) => (
              <div
                key={`${season.crop_id}-${index}`}
                className="p-3.5 rounded-lg bg-[var(--as-bg-subtle)] border border-[var(--as-border)] space-y-2.5"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="tabular-nums text-sm font-semibold as-text-accent">
                      Season {index + 1}
                    </span>
                    <span aria-hidden="true" className="text-[var(--as-text-muted)]">
                      ·
                    </span>
                    {onInspectCrop ? (
                      <button
                        type="button"
                        onClick={() => onInspectCrop(season.crop_id)}
                        className="text-[15px] font-semibold text-[var(--as-text-primary)] hover:as-text-accent hover:underline text-left"
                      >
                        {season.name}
                      </button>
                    ) : (
                      <span className="text-[15px] font-semibold text-[var(--as-text-primary)]">
                        {season.name}
                      </span>
                    )}
                    {season.is_legume && (
                      <span className="px-2 py-0.5 rounded text-[13px] font-semibold as-badge-success">
                        Legume
                      </span>
                    )}
                    {season.local_season_name && (
                      <span className="text-[13px] text-[var(--as-text-muted)]">
                        ({season.local_season_name})
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-[13px] text-[var(--as-text-muted)]">
                    <span className="tabular-nums font-medium">
                      {season.window_label ||
                        `Starts ${formatMonthName(season.planting_month)} (${season.duration_months} mo)`}
                    </span>
                    {index < plan.seasons.length - 1 && (
                      <ArrowRight className="w-3.5 h-3.5 hidden sm:inline as-text-accent" />
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2.5 text-[13px] border-t border-[var(--as-border)]">
                  <div>
                    <span className="text-[var(--as-text-muted)]">NASA Avg Temp → Fit</span>
                    <p className="tabular-nums font-semibold text-[var(--as-text-primary)]">
                      {formatTemperature(season.avg_historical_temperature_c, temperatureUnit)} →{' '}
                      {season.temperature_fit_score}/100
                    </p>
                  </div>
                  <div>
                    <span className="text-[var(--as-text-muted)]">Water &amp; Rain → Fit</span>
                    <p className="tabular-nums font-semibold text-[var(--as-text-primary)] capitalize">
                      {season.water_category} ({season.water_compatibility_score}/100)
                      {season.season_rainfall_mm != null
                        ? ` · ~${season.season_rainfall_mm} mm`
                        : ''}
                    </p>
                  </div>
                  <div>
                    <span className="text-[var(--as-text-muted)]">Soil pH Fit</span>
                    <p className="tabular-nums font-semibold text-[var(--as-text-primary)]">
                      {season.soil_ph_compatibility_score !== null
                        ? `${season.soil_ph_compatibility_score}/100`
                        : 'Not evaluated'}
                    </p>
                  </div>
                  <div>
                    <span className="text-[var(--as-text-muted)]">Family Break</span>
                    <p className="tabular-nums font-semibold text-[var(--as-text-primary)]">
                      {season.family_diversity_score}/100
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Concise Soil-Health & Rainfall Summary */}
        {soilSummary && (
          <div className="p-3.5 rounded-lg border border-[var(--as-border)] bg-[var(--as-bg-subtle)] space-y-1.5 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 font-semibold text-[var(--as-text-primary)]">
                <Sprout className="w-4 h-4 as-text-accent" />
                <span>Soil-Health Considerations</span>
              </div>
              <span className="tabular-nums text-[13px] font-medium text-[var(--as-text-muted)]">
                Soil-health score: {soilSummary.soil_health_score.toFixed(1)}/100
              </span>
            </div>
            {soilSummary.strengths.slice(0, 2).map((item, idx) => (
              <p key={`s-${idx}`} className="text-[var(--as-text-muted)] leading-[1.5]">
                • {item}
              </p>
            ))}
            {soilSummary.cautions.slice(0, 2).map((item, idx) => (
              <p key={`c-${idx}`} className="as-text-warning leading-[1.5]">
                • {item}
              </p>
            ))}
          </div>
        )}

        {/* Concise Historical Climate Resilience Line */}
        {resilience?.available && (
          <div className="p-3.5 rounded-lg border border-[var(--as-border)] bg-[var(--as-bg-subtle)] text-sm space-y-1.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1.5 font-semibold text-[var(--as-text-primary)]">
                <CloudSun className="w-4 h-4 as-text-accent" />
                <span>How This Crop Plan Handled Past Weather Patterns (Historical Year-to-Year Resilience)</span>
              </span>
              <span className="tabular-nums text-[13px] font-medium text-[var(--as-text-muted)]">
                {formatResilienceLabel(resilience.resilience_class)} · {resilience.years_evaluated} yr(s)
              </span>
            </div>
            <p className="text-[var(--as-text-muted)] leading-[1.55]">{resilience.summary}</p>
          </div>
        )}

        {/* Expandable Deep-Dive Calculation & Technical Breakdown */}
        <button
          type="button"
          aria-expanded={showDetails}
          onClick={() => setShowDetails((prev) => !prev)}
          className="inline-flex items-center gap-1.5 min-h-[40px] py-1.5 text-sm font-semibold as-text-accent hover:underline"
        >
          <span>
            {showDetails
              ? 'Hide Detailed Climate, Soil & Scoring Notes'
              : 'Show Detailed Climate, Soil & Scoring Notes'}
          </span>
          {showDetails ? (
            <ChevronUp className="w-4 h-4" />
          ) : (
            <ChevronDown className="w-4 h-4" />
          )}
        </button>

        {showDetails && (
          <div className="p-4 rounded-lg border border-[var(--as-border)] bg-[var(--as-bg-subtle)] space-y-3.5 text-sm text-[var(--as-text-muted)] leading-[1.55]">
            {diag?.goal_weights_applied && (
              <div className="space-y-2">
                <p className="font-semibold text-[var(--as-text-primary)]">
                  Priority Weights Used ({diag.goal_applied}):
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {Object.entries(diag.goal_weights_applied).map(([k, v]) => (
                    <div
                      key={k}
                      className="flex items-center justify-between gap-2 rounded border border-[var(--as-border)] bg-[var(--as-bg-surface)] px-3 py-2 text-[13px]"
                    >
                      <span className="capitalize">{k.replace('_', ' ')}</span>
                      <span className="tabular-nums font-semibold text-[var(--as-text-primary)]">
                        {(v * 100).toFixed(0)}%
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {resilience?.available && (
              <div className="space-y-2 border-t border-[var(--as-border)] pt-3">
                <p className="font-semibold text-[var(--as-text-primary)]">
                  Year-by-Year Historical Weather Exposure ({resilience.year_span_label || 'NASA series'})
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 tabular-nums text-[13px]">
                  <div className="rounded border border-[var(--as-border)] bg-[var(--as-bg-surface)] px-3 py-2">
                    <span className="block text-[13px] text-[var(--as-text-muted)]">Driest Cycle</span>
                    <span className="font-semibold text-[var(--as-text-primary)]">
                      {resilience.driest_cycle_mm != null
                        ? `${resilience.driest_cycle_mm} mm (${resilience.driest_cycle_year})`
                        : 'N/A'}
                    </span>
                  </div>
                  <div className="rounded border border-[var(--as-border)] bg-[var(--as-bg-surface)] px-3 py-2">
                    <span className="block text-[13px] text-[var(--as-text-muted)]">Wettest Cycle</span>
                    <span className="font-semibold text-[var(--as-text-primary)]">
                      {resilience.wettest_cycle_mm != null
                        ? `${resilience.wettest_cycle_mm} mm (${resilience.wettest_cycle_year})`
                        : 'N/A'}
                    </span>
                  </div>
                  <div className="rounded border border-[var(--as-border)] bg-[var(--as-bg-surface)] px-3 py-2">
                    <span className="block text-[13px] text-[var(--as-text-muted)]">Warm / Cool Seasons</span>
                    <span className="font-semibold text-[var(--as-text-primary)]">
                      {resilience.warm_stress_seasons_count} / {resilience.cool_stress_seasons_count}
                    </span>
                  </div>
                  <div className="rounded border border-[var(--as-border)] bg-[var(--as-bg-surface)] px-3 py-2">
                    <span className="block text-[13px] text-[var(--as-text-muted)]">Dry / Excess Rain</span>
                    <span className="font-semibold text-[var(--as-text-primary)]">
                      {resilience.dry_deficit_seasons_count} / {resilience.excess_rain_seasons_count}
                    </span>
                  </div>
                </div>
                <p className="text-[13px]">{resilience.caveat}</p>
              </div>
            )}

            {plan.seasons.some((s) => s.rainfall_note || s.calendar_note) && (
              <div className="space-y-1.5 border-t border-[var(--as-border)] pt-3">
                <p className="font-semibold text-[var(--as-text-primary)] flex items-center gap-1.5">
                  <Droplets className="w-4 h-4 as-text-accent" />
                  <span>Season Rainfall &amp; Calendar Details</span>
                </p>
                {plan.seasons.map((s, idx) => (
                  <p key={`det-${idx}`}>
                    <strong className="text-[var(--as-text-primary)]">
                      Season {idx + 1} ({s.name}):{' '}
                    </strong>
                    {s.calendar_note} {s.rainfall_note}
                  </p>
                ))}
              </div>
            )}

            {soilSummary?.legume_tradeoff_note && (
              <p>
                <strong className="text-[var(--as-text-primary)]">
                  Legume biology &amp; trade-offs:{' '}
                </strong>
                {soilSummary.legume_tradeoff_note}
              </p>
            )}

            {soilSummary?.soc_reference_note && <p>{soilSummary.soc_reference_note}</p>}

            {soilSummary?.evaluated_factors && soilSummary.evaluated_factors.length > 0 && (
              <p>
                <strong className="text-[var(--as-text-primary)]">
                  Soil factors checked:{' '}
                </strong>
                {soilSummary.evaluated_factors.map((f) => f.replace(/_/g, ' ')).join(', ')}
                {soilSummary.missing_factors && soilSummary.missing_factors.length > 0
                  ? ` · Missing/unspecified: ${soilSummary.missing_factors
                      .map((f) => f.replace(/_/g, ' '))
                      .join(', ')}`
                  : ''}
              </p>
            )}

            {soilSummary?.evidence_caveat && <p>{soilSummary.evidence_caveat}</p>}

            {diag?.unevaluated_dimensions && diag.unevaluated_dimensions.length > 0 && (
              <p>
                <strong className="text-[var(--as-text-primary)]">
                  Not scored due to missing or unverified local information:{' '}
                </strong>
                {diag.unevaluated_dimensions.map((d) => d.replace(/_/g, ' ')).join(', ')}
              </p>
            )}
          </div>
        )}
      </div>

      <div className="border-t border-[var(--as-border)] pt-3.5 flex items-start gap-2 text-sm text-[var(--as-text-muted)] leading-[1.55]">
        <Info className="w-4 h-4 as-text-warning shrink-0 mt-0.5" />
        <span>{plan.explanation}</span>
      </div>
    </article>
  );
}
