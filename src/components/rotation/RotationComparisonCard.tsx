import { ArrowRight, BookmarkPlus, Info } from 'lucide-react';
import type { RotationPlanOption } from '../../types/api';
import type { TemperatureUnit } from '../../types/farm';
import { formatTemperature } from '../../utils/units';

interface RotationComparisonCardProps {
  plan: RotationPlanOption;
  rank: number;
  temperatureUnit: TemperatureUnit;
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
  if (lower.includes('strong') || lower.includes('good')) return 'as-badge-success';
  if (lower.includes('moderate')) return 'as-badge-warning';
  return 'as-badge-danger';
}

export function RotationComparisonCard({
  plan,
  rank,
  temperatureUnit,
  onSavePlan,
}: RotationComparisonCardProps) {
  const diag = plan.diagnostics;

  return (
    <article className="rounded-xl border border-[var(--as-border)] bg-[var(--as-bg-surface)] p-5 sm:p-6 flex flex-col justify-between gap-5">
      <div className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
              <span className="as-text-accent">Option #{rank}</span>
              <span aria-hidden="true" className="text-[var(--as-text-muted)]">
                ·
              </span>
              <span className="tabular-nums font-mono text-[var(--as-text-primary)]">
                Score: {plan.score.toFixed(1)} / 100
              </span>
              {plan.compatibility_band && (
                <span
                  className={`px-2 py-0.5 rounded-md text-[11px] font-semibold ${getBandBadgeClass(
                    plan.compatibility_band
                  )}`}
                >
                  {plan.compatibility_band}
                </span>
              )}
            </div>
            <h3 className="text-lg font-semibold text-[var(--as-text-primary)]">
              {plan.seasons.map((s) => s.name).join(' → ')}
            </h3>
          </div>

          {onSavePlan && (
            <button
              type="button"
              onClick={() => onSavePlan(plan)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-[var(--as-border)] text-[var(--as-text-primary)] hover:border-[var(--as-accent-text)] transition-colors"
            >
              <BookmarkPlus className="w-3.5 h-3.5 as-text-accent" />
              Save This Option
            </button>
          )}
        </div>

        {/* Multi-Dimensional Plan Diagnostics */}
        {diag && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 p-3 rounded-lg bg-[var(--as-bg-subtle)] border border-[var(--as-border)] text-[11px]">
            <div>
              <span className="text-[var(--as-text-muted)]">Climate Fit</span>
              <p className="font-mono tabular-nums font-semibold text-[var(--as-text-primary)]">
                {diag.climate_compatibility.toFixed(1)}/100
              </p>
            </div>
            <div>
              <span className="text-[var(--as-text-muted)]">Water Fit</span>
              <p className="font-mono tabular-nums font-semibold text-[var(--as-text-primary)]">
                {diag.water_compatibility.toFixed(1)}/100
              </p>
            </div>
            <div>
              <span className="text-[var(--as-text-muted)]">Family Rotation</span>
              <p className="font-mono tabular-nums font-semibold text-[var(--as-text-primary)]">
                {diag.family_rotation.toFixed(1)}/100
              </p>
            </div>
            <div>
              <span className="text-[var(--as-text-muted)]">Soil pH Fit</span>
              <p className="font-mono tabular-nums font-semibold text-[var(--as-text-primary)]">
                {diag.soil_evaluated && diag.soil_compatibility !== null
                  ? `${diag.soil_compatibility.toFixed(1)}/100`
                  : 'Not evaluated'}
              </p>
            </div>
          </div>
        )}

        {diag?.tie_note && (
          <p className="text-[11px] as-text-warning leading-relaxed">
            {diag.tie_note}
          </p>
        )}

        {/* Season-by-Season Sequence */}
        <div className="space-y-2.5">
          <h4 className="text-xs font-semibold text-[var(--as-text-muted)]">
            Season-by-Season Screening Breakdown
          </h4>
          <div className="grid grid-cols-1 gap-2.5">
            {plan.seasons.map((season, index) => (
              <div
                key={`${season.crop_id}-${index}`}
                className="p-3.5 rounded-lg bg-[var(--as-bg-subtle)] border border-[var(--as-border)] space-y-2"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="tabular-nums font-mono text-xs font-semibold as-text-accent">
                      Season {index + 1}
                    </span>
                    <span aria-hidden="true" className="text-[var(--as-text-muted)]">
                      ·
                    </span>
                    <span className="text-sm font-semibold text-[var(--as-text-primary)]">
                      {season.name}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-[var(--as-text-muted)]">
                    <span>
                      Starts {formatMonthName(season.planting_month)} ({season.duration_months} mo)
                    </span>
                    {index < plan.seasons.length - 1 && (
                      <ArrowRight className="w-3.5 h-3.5 hidden sm:inline as-text-accent" />
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 text-[11px] border-t border-[var(--as-border)]">
                  <div>
                    <span className="text-[var(--as-text-muted)]">Hist. Avg Temp</span>
                    <p className="font-mono tabular-nums font-medium text-[var(--as-text-primary)]">
                      {formatTemperature(season.avg_historical_temperature_c, temperatureUnit)} ({season.temperature_fit_score}/100)
                    </p>
                  </div>
                  <div>
                    <span className="text-[var(--as-text-muted)]">Water Fit</span>
                    <p className="font-mono tabular-nums font-medium text-[var(--as-text-primary)] capitalize">
                      {season.water_category} ({season.water_compatibility_score}/100)
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
      </div>

      <div className="border-t border-[var(--as-border)] pt-3 flex items-start gap-2 text-xs text-[var(--as-text-muted)]">
        <Info className="w-3.5 h-3.5 as-text-warning shrink-0 mt-0.5" />
        <span>{plan.explanation}</span>
      </div>
    </article>
  );
}
