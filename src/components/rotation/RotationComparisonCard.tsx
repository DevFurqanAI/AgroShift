import { useState } from 'react';
import {
  ArrowRight,
  BookmarkPlus,
  Calendar,
  ChevronDown,
  ChevronUp,
  Droplets,
  Info,
  Sprout,
} from 'lucide-react';
import { ScoreProgressBar } from '../common/MetricPrimitives';
import type { RotationPlanOption } from '../../types/api';
import type { TemperatureUnit } from '../../types/farm';
import { formatTemperature } from '../../utils/units';

interface RotationComparisonCardProps {
  plan: RotationPlanOption;
  rank: number;
  temperatureUnit: TemperatureUnit;
  topScore?: number;
  onSavePlan?: (plan: RotationPlanOption) => void;
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

export function RotationComparisonCard({
  plan,
  rank,
  temperatureUnit,
  topScore,
  onSavePlan,
}: RotationComparisonCardProps) {
  const [showDetails, setShowDetails] = useState(false);
  const diag = plan.diagnostics;
  const soilSummary = plan.soil_health_summary;
  const feasibility = plan.feasibility;
  const deltaFromTop =
    topScore !== undefined && Number.isFinite(topScore)
      ? Number((plan.score - topScore).toFixed(1))
      : null;

  return (
    <article className="rounded-xl border border-[var(--as-border)] bg-[var(--as-bg-surface)] p-5 sm:p-6 flex flex-col justify-between gap-5">
      <div className="space-y-4">
        {/* Card Header: Option Rank, Sequence Title, Overall Score & Evidence Completeness */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1.5 min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs font-semibold">
              <span className="as-text-accent">Option #{rank}</span>
              <span aria-hidden="true" className="text-[var(--as-text-muted)]">
                ·
              </span>
              <span className="tabular-nums font-mono text-[var(--as-text-primary)]">
                Score: {plan.score.toFixed(1)} / 100
              </span>
              {deltaFromTop !== null && rank > 1 && (
                <span className="font-mono tabular-nums text-[11px] font-medium text-[var(--as-text-muted)]">
                  ({deltaFromTop > 0 ? `+${deltaFromTop.toFixed(1)}` : deltaFromTop.toFixed(1)} vs #1)
                </span>
              )}
              {plan.compatibility_band && (
                <span
                  className={`px-2 py-0.5 rounded-md text-[11px] font-semibold ${getBandBadgeClass(
                    plan.compatibility_band
                  )}`}
                >
                  {plan.compatibility_band}
                </span>
              )}
              {diag?.data_completeness && (
                <span className="text-[11px] font-medium text-[var(--as-text-muted)]">
                  Evidence: {diag.data_completeness.label} ({diag.data_completeness.evaluated_count}/{diag.data_completeness.total_count})
                </span>
              )}
            </div>

            <h3 className="text-lg font-semibold text-[var(--as-text-primary)] text-balance">
              {plan.seasons.map((s) => s.name).join(' → ')}
            </h3>

            {feasibility?.timeline_summary && (
              <p className="flex items-center gap-1.5 text-xs text-[var(--as-text-muted)]">
                <Calendar className="w-3.5 h-3.5 as-text-accent shrink-0" />
                <span>
                  {feasibility.timeline_summary}
                  {feasibility.total_cycle_months
                    ? ` · ${feasibility.total_cycle_months} mo cycle`
                    : ''}
                </span>
              </p>
            )}
          </div>

          {onSavePlan && (
            <button
              type="button"
              onClick={() => onSavePlan(plan)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-[var(--as-border)] text-[var(--as-text-primary)] hover:border-[var(--as-accent-text)] transition-colors whitespace-nowrap shrink-0"
            >
              <BookmarkPlus className="w-3.5 h-3.5 as-text-accent" />
              Save This Option
            </button>
          )}
        </div>

        {/* Multi-Dimensional Factor Breakdown with Progress Bars & Drivers */}
        {diag && (
          <div className="p-3.5 rounded-lg bg-[var(--as-bg-subtle)] border border-[var(--as-border)] space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h4 className="text-xs font-semibold text-[var(--as-text-primary)]">
                Score Drivers &amp; Connected Factors
              </h4>
              <span className="text-[11px] font-mono tabular-nums text-[var(--as-text-muted)]">
                {diag.distinct_families} {diag.distinct_families === 1 ? 'family' : 'families'} ·{' '}
                {diag.distinct_crops} {diag.distinct_crops === 1 ? 'crop' : 'crops'}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-3">
              <ScoreProgressBar
                label="Climate Fit"
                score={diag.climate_compatibility}
                interpretation={formatFitWord(diag.climate_compatibility)}
                driverHint="NASA historical temp → crop thermal range"
              />
              <ScoreProgressBar
                label="Water & Rainfall"
                score={diag.water_compatibility}
                interpretation={formatFitWord(diag.water_compatibility)}
                driverHint="Farm supply + seasonal rain → crop demand"
              />
              <ScoreProgressBar
                label="Regional Calendar"
                score={
                  diag.regional_calendar_evaluated && diag.regional_calendar_score != null
                    ? diag.regional_calendar_score
                    : null
                }
                interpretation={formatFitWord(diag.regional_calendar_score)}
                driverHint={
                  diag.regional_calendar_evaluated
                    ? 'Sowing/harvest alignment with local windows'
                    : (feasibility?.regional_timing_evidence || diag.regional_timing_evidence) === 'conditional'
                      ? `Partial regional calendar (${feasibility?.verified_calendar_seasons ?? diag.verified_calendar_seasons ?? 0}/${feasibility?.total_seasons ?? diag.total_seasons ?? plan.seasons.length} seasons verified) — confirm locally`
                      : 'No verified regional calendar for this crop/location'
                }
                unavailableLabel={
                  (feasibility?.regional_timing_evidence || diag.regional_timing_evidence) === 'conditional'
                    ? 'Conditional'
                    : 'Unverified'
                }
              />
              <ScoreProgressBar
                label="Family Rotation"
                score={diag.family_rotation}
                interpretation={formatFitWord(diag.family_rotation)}
                driverHint="Botanical family diversity across succession"
              />
              <ScoreProgressBar
                label="Soil-Health Screening"
                score={diag.soil_health_score ?? null}
                interpretation={formatFitWord(diag.soil_health_score)}
                driverHint={
                  soilSummary?.has_legume
                    ? `Includes legume (${soilSummary.legume_crops.join(', ')}) + succession checks`
                    : 'Residue diversity, drainage & salinity checks'
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
                    ? 'Saved farm pH vs. crop pH tolerance range'
                    : 'Omitted from score because soil pH was not provided'
                }
                unavailableLabel="Not evaluated"
              />
            </div>
          </div>
        )}

        {diag?.tie_note && (
          <p className="text-[11px] as-text-warning leading-relaxed">{diag.tie_note}</p>
        )}

        {feasibility?.warnings && feasibility.warnings.length > 0 && (
          <div className="p-3 rounded-lg border border-[var(--as-warning-border)] bg-[var(--as-bg-subtle)] text-xs as-text-warning space-y-1">
            {feasibility.warnings.map((w, idx) => (
              <p key={idx}>{w}</p>
            ))}
          </div>
        )}

        {/* Visual Cropping Sequence Timeline */}
        <div className="space-y-2.5">
          <h4 className="text-xs font-semibold text-[var(--as-text-muted)]">
            Season-by-Season Growing Timeline &amp; Screening Breakdown
          </h4>

          <div
            aria-label="Seasonal crop succession timeline"
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2"
          >
            {plan.seasons.map((season, index) => (
              <div
                key={`tl-${season.crop_id}-${index}`}
                className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-[var(--as-bg-subtle)] border border-[var(--as-border)] text-xs"
              >
                <div className="min-w-0">
                  <p className="font-mono tabular-nums text-[10px] font-semibold as-text-accent">
                    S{index + 1} ·{' '}
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
                <span className="font-mono tabular-nums text-xs font-semibold text-[var(--as-text-primary)] shrink-0">
                  {season.screening_score.toFixed(0)}/100
                </span>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 gap-2.5">
            {plan.seasons.map((season, index) => (
              <div
                key={`${season.crop_id}-${index}`}
                className="p-3.5 rounded-lg bg-[var(--as-bg-subtle)] border border-[var(--as-border)] space-y-2"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="tabular-nums font-mono text-xs font-semibold as-text-accent">
                      Season {index + 1}
                    </span>
                    <span aria-hidden="true" className="text-[var(--as-text-muted)]">
                      ·
                    </span>
                    <span className="text-sm font-semibold text-[var(--as-text-primary)]">
                      {season.name}
                    </span>
                    {season.is_legume && (
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold as-badge-success">
                        Legume
                      </span>
                    )}
                    {season.local_season_name && (
                      <span className="text-[11px] text-[var(--as-text-muted)]">
                        ({season.local_season_name})
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-xs text-[var(--as-text-muted)]">
                    <span className="font-mono tabular-nums">
                      {season.window_label ||
                        `Starts ${formatMonthName(season.planting_month)} (${season.duration_months} mo)`}
                    </span>
                    {index < plan.seasons.length - 1 && (
                      <ArrowRight className="w-3.5 h-3.5 hidden sm:inline as-text-accent" />
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-2 text-[11px] border-t border-[var(--as-border)]">
                  <div>
                    <span className="text-[var(--as-text-muted)]">NASA Temp → Thermal Fit</span>
                    <p className="font-mono tabular-nums font-medium text-[var(--as-text-primary)]">
                      {formatTemperature(season.avg_historical_temperature_c, temperatureUnit)} →{' '}
                      {season.temperature_fit_score}/100
                    </p>
                  </div>
                  <div>
                    <span className="text-[var(--as-text-muted)]">Water &amp; Rain → Fit</span>
                    <p className="font-mono tabular-nums font-medium text-[var(--as-text-primary)] capitalize">
                      {season.water_category} ({season.water_compatibility_score}/100)
                      {season.season_rainfall_mm != null
                        ? ` · ~${season.season_rainfall_mm} mm`
                        : ''}
                    </p>
                  </div>
                  <div>
                    <span className="text-[var(--as-text-muted)]">Soil pH Fit</span>
                    <p className="font-mono tabular-nums font-medium text-[var(--as-text-primary)]">
                      {season.soil_ph_compatibility_score !== null
                        ? `${season.soil_ph_compatibility_score}/100`
                        : 'Not evaluated'}
                    </p>
                  </div>
                  <div>
                    <span className="text-[var(--as-text-muted)]">Family Diversity</span>
                    <p className="font-mono tabular-nums font-medium text-[var(--as-text-primary)]">
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
          <div className="p-3.5 rounded-lg border border-[var(--as-border)] bg-[var(--as-bg-subtle)] space-y-1.5 text-xs">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 font-semibold text-[var(--as-text-primary)]">
                <Sprout className="w-3.5 h-3.5 as-text-accent" />
                <span>Soil-Health Considerations</span>
              </div>
              <span className="font-mono tabular-nums text-[11px] text-[var(--as-text-muted)]">
                Soil-health score: {soilSummary.soil_health_score.toFixed(1)}/100
              </span>
            </div>
            {soilSummary.strengths.slice(0, 2).map((item, idx) => (
              <p key={`s-${idx}`} className="text-[var(--as-text-muted)]">
                • {item}
              </p>
            ))}
            {soilSummary.cautions.slice(0, 2).map((item, idx) => (
              <p key={`c-${idx}`} className="as-text-warning">
                • {item}
              </p>
            ))}
          </div>
        )}

        {/* Expandable Deep-Dive Calculation & Technical Breakdown */}
        <button
          type="button"
          aria-expanded={showDetails}
          onClick={() => setShowDetails((prev) => !prev)}
          className="inline-flex items-center gap-1.5 text-xs font-semibold as-text-accent hover:underline"
        >
          <span>
            {showDetails
              ? 'Hide Detailed Agronomic & Calculation Breakdown'
              : 'Show Detailed Agronomic & Weight Breakdown'}
          </span>
          {showDetails ? (
            <ChevronUp className="w-3.5 h-3.5" />
          ) : (
            <ChevronDown className="w-3.5 h-3.5" />
          )}
        </button>

        {showDetails && (
          <div className="p-3.5 rounded-lg border border-[var(--as-border)] bg-[var(--as-bg-subtle)] space-y-3 text-xs text-[var(--as-text-muted)]">
            {diag?.goal_weights_applied && (
              <div className="space-y-1.5">
                <p className="font-semibold text-[var(--as-text-primary)]">
                  Applied Priority Weights ({diag.goal_applied}):
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {Object.entries(diag.goal_weights_applied).map(([k, v]) => (
                    <div
                      key={k}
                      className="flex items-center justify-between gap-2 rounded border border-[var(--as-border)] bg-[var(--as-bg-surface)] px-2.5 py-1.5"
                    >
                      <span className="capitalize">{k.replace('_', ' ')}</span>
                      <span className="font-mono tabular-nums font-semibold text-[var(--as-text-primary)]">
                        {(v * 100).toFixed(0)}%
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {plan.seasons.some((s) => s.rainfall_note || s.calendar_note) && (
              <div className="space-y-1.5">
                <p className="font-semibold text-[var(--as-text-primary)] flex items-center gap-1.5">
                  <Droplets className="w-3.5 h-3.5 as-text-accent" />
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

            {soilSummary?.evaluated_factors && soilSummary.evaluated_factors.length > 0 && (
              <p>
                <strong className="text-[var(--as-text-primary)]">
                  Soil factors evaluated:{' '}
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
                  Not evaluated due to missing/unverified data:{' '}
                </strong>
                {diag.unevaluated_dimensions.map((d) => d.replace(/_/g, ' ')).join(', ')}
              </p>
            )}
          </div>
        )}
      </div>

      <div className="border-t border-[var(--as-border)] pt-3 flex items-start gap-2 text-xs text-[var(--as-text-muted)]">
        <Info className="w-3.5 h-3.5 as-text-warning shrink-0 mt-0.5" />
        <span>{plan.explanation}</span>
      </div>
    </article>
  );
}
