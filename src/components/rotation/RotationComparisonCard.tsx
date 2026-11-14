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

export function RotationComparisonCard({
  plan,
  rank,
  temperatureUnit,
  onSavePlan,
}: RotationComparisonCardProps) {
  return (
    <article className="rounded-xl border border-[#E2E8F0] dark:border-[#1E2E26] bg-white dark:bg-[#111D18] p-5 sm:p-6 flex flex-col justify-between gap-5">
      <div className="space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-xs font-semibold text-[#14532D] dark:text-[#10B981]">
              <span>Option #{rank}</span>
              <span aria-hidden="true">·</span>
              <span className="tabular-nums font-mono">
                Screening score: {plan.score.toFixed(1)} / 100
              </span>
            </div>
            <h3 className="text-lg font-semibold text-[#172B22] dark:text-[#E8F1EC]">
              {plan.seasons.map((s) => s.name).join(' → ')}
            </h3>
          </div>

          {onSavePlan && (
            <button
              type="button"
              onClick={() => onSavePlan(plan)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-[#E2E8F0] dark:border-[#1E2E26] hover:border-[#16A34A] transition-colors"
            >
              <BookmarkPlus className="w-3.5 h-3.5 text-[#16A34A]" />
              Save This Option
            </button>
          )}
        </div>

        {/* Season-by-Season Sequence */}
        <div className="space-y-2.5">
          <h4 className="text-xs font-semibold text-[#64748B] dark:text-[#94A3B8]">
            Season-by-Season Screening Breakdown
          </h4>
          <div className="grid grid-cols-1 gap-2.5">
            {plan.seasons.map((season, index) => (
              <div
                key={`${season.crop_id}-${index}`}
                className="p-3.5 rounded-lg bg-[#F8FAF7] dark:bg-[#0B1310] border border-[#E2E8F0] dark:border-[#1E2E26] space-y-2"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="tabular-nums font-mono text-xs font-semibold text-[#14532D] dark:text-[#10B981]">
                      Season {index + 1}
                    </span>
                    <span aria-hidden="true" className="text-[#64748B]">
                      ·
                    </span>
                    <span className="text-sm font-semibold text-[#172B22] dark:text-[#E8F1EC]">
                      {season.name}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-[#64748B] dark:text-[#94A3B8]">
                    <span>
                      Starts {formatMonthName(season.planting_month)} ({season.duration_months} mo)
                    </span>
                    {index < plan.seasons.length - 1 && (
                      <ArrowRight className="w-3.5 h-3.5 hidden sm:inline text-[#16A34A]" />
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 text-[11px] border-t border-[#E2E8F0] dark:border-[#1E2E26]">
                  <div>
                    <span className="text-[#64748B] dark:text-[#94A3B8]">Hist. Avg Temp</span>
                    <p className="font-mono tabular-nums font-medium text-[#172B22] dark:text-[#E8F1EC]">
                      {formatTemperature(season.avg_historical_temperature_c, temperatureUnit)} ({season.temperature_fit_score}/100)
                    </p>
                  </div>
                  <div>
                    <span className="text-[#64748B] dark:text-[#94A3B8]">Water Fit</span>
                    <p className="font-mono tabular-nums font-medium text-[#172B22] dark:text-[#E8F1EC] capitalize">
                      {season.water_category} ({season.water_compatibility_score}/100)
                    </p>
                  </div>
                  <div>
                    <span className="text-[#64748B] dark:text-[#94A3B8]">Soil pH Fit</span>
                    <p className="font-mono tabular-nums font-medium text-[#172B22] dark:text-[#E8F1EC]">
                      {season.soil_ph_compatibility_score !== null
                        ? `${season.soil_ph_compatibility_score}/100`
                        : 'Not evaluated'}
                    </p>
                  </div>
                  <div>
                    <span className="text-[#64748B] dark:text-[#94A3B8]">Family Diversity</span>
                    <p className="font-mono tabular-nums font-medium text-[#172B22] dark:text-[#E8F1EC]">
                      {season.family_diversity_score}/100
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="border-t border-[#E2E8F0] dark:border-[#1E2E26] pt-3 flex items-start gap-2 text-xs text-[#64748B] dark:text-[#94A3B8]">
        <Info className="w-3.5 h-3.5 text-[#D97706] shrink-0 mt-0.5" />
        <span>{plan.explanation}</span>
      </div>
    </article>
  );
}
