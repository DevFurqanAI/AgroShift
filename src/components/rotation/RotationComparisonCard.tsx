import { ArrowRight, AlertTriangle, Check, Info } from 'lucide-react';
import type { RotationOptionComparison } from '../../types/planner';

interface RotationComparisonCardProps {
  option: RotationOptionComparison;
}

export function RotationComparisonCard({ option }: RotationComparisonCardProps) {
  return (
    <article className="rounded-xl border border-[#E2E8F0] dark:border-[#1E2E26] bg-white dark:bg-[#111D18] p-5 sm:p-6 flex flex-col justify-between gap-5">
      <div className="space-y-5">
        <div className="space-y-1.5">
          {option.isIllustrativeDemo && (
            <p className="text-xs font-semibold text-[#D97706] flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
              Illustrative — Not Agricultural Advice
            </p>
          )}
          <h3 className="text-lg font-semibold text-[#172B22] dark:text-[#E8F1EC]">
            {option.name}
          </h3>
          <p className="text-xs text-[#64748B] dark:text-[#94A3B8]">
            Data confidence:{' '}
            <span className="font-medium text-[#172B22] dark:text-[#E8F1EC]">
              {option.dataConfidence === 'illustrative_only'
                ? 'Illustrative UI Preview Only'
                : option.dataConfidence}
            </span>
          </p>
        </div>

        {/* Crop Sequence Timeline */}
        <div className="space-y-2.5">
          <h4 className="text-xs font-semibold text-[#64748B] dark:text-[#94A3B8]">
            Planned Crop Sequence
          </h4>
          <div className="grid grid-cols-1 gap-2">
            {option.sequence.map((step, index) => (
              <div
                key={step.seasonIndex}
                className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 rounded-lg bg-[#F8FAF7] dark:bg-[#0B1310] border border-[#E2E8F0] dark:border-[#1E2E26]"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-xs text-[#64748B] dark:text-[#94A3B8]">
                    <span className="tabular-nums font-mono font-medium text-[#14532D] dark:text-[#10B981]">
                      0{step.seasonIndex}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>{step.seasonLabel}</span>
                  </div>
                  <p className="text-sm font-semibold text-[#172B22] dark:text-[#E8F1EC] mt-0.5">
                    {step.cropName}
                  </p>
                </div>
                <div className="flex items-center gap-2 text-xs text-[#64748B] dark:text-[#94A3B8]">
                  <span>{step.cropFamily}</span>
                  {index < option.sequence.length - 1 && (
                    <ArrowRight className="w-3.5 h-3.5 hidden sm:inline text-[#16A34A]" />
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Considerations */}
        <dl className="space-y-3 text-sm border-t border-[#E2E8F0] dark:border-[#1E2E26] pt-4">
          <div>
            <dt className="text-xs font-semibold text-[#172B22] dark:text-[#E8F1EC]">
              Climate Suitability
            </dt>
            <dd className="text-xs text-[#64748B] dark:text-[#94A3B8] mt-0.5 leading-relaxed">
              {option.climateSuitability}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-semibold text-[#172B22] dark:text-[#E8F1EC]">
              Soil-Health Considerations
            </dt>
            <dd className="text-xs text-[#64748B] dark:text-[#94A3B8] mt-0.5 leading-relaxed">
              {option.soilHealthConsiderations}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-semibold text-[#172B22] dark:text-[#E8F1EC]">
              Water-Demand Considerations
            </dt>
            <dd className="text-xs text-[#64748B] dark:text-[#94A3B8] mt-0.5 leading-relaxed">
              {option.waterDemandConsiderations}
            </dd>
          </div>
        </dl>

        {/* Benefits & Limitations */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 border-t border-[#E2E8F0] dark:border-[#1E2E26] pt-4">
          <div>
            <h4 className="text-xs font-semibold text-[#14532D] dark:text-[#10B981] mb-2">
              Potential Benefits
            </h4>
            <ul className="space-y-1.5">
              {option.potentialBenefits.map((b, i) => (
                <li
                  key={i}
                  className="flex items-start gap-2 text-xs text-[#64748B] dark:text-[#94A3B8]"
                >
                  <Check className="w-3.5 h-3.5 text-[#16A34A] shrink-0 mt-0.5" />
                  <span>{b}</span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h4 className="text-xs font-semibold text-[#D97706] mb-2">
              Limitations
            </h4>
            <ul className="space-y-1.5">
              {option.limitations.map((lim, i) => (
                <li
                  key={i}
                  className="flex items-start gap-2 text-xs text-[#64748B] dark:text-[#94A3B8]"
                >
                  <Info className="w-3.5 h-3.5 text-[#D97706] shrink-0 mt-0.5" />
                  <span>{lim}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      <div className="border-t border-[#E2E8F0] dark:border-[#1E2E26] pt-3 text-xs text-[#64748B] dark:text-[#94A3B8]">
        <span className="font-medium text-[#172B22] dark:text-[#E8F1EC]">Supporting notes: </span>
        {option.supportingInformation}
      </div>
    </article>
  );
}
