import { useState } from 'react';
import { ChevronDown, ChevronUp, ExternalLink, Info } from 'lucide-react';
import type { AgronomicSourceItem } from '../../types/api';

interface ScreeningLimitationsDisclosureProps {
  method?: string;
  catalogWarning?: string;
  limitations?: string[];
  extraNotes?: string[];
  sources?: AgronomicSourceItem[];
}

export function ScreeningLimitationsDisclosure({
  method,
  catalogWarning,
  limitations = [],
  extraNotes = [],
  sources = [],
}: ScreeningLimitationsDisclosureProps) {
  const [expanded, setExpanded] = useState(false);

  const hasDetails = Boolean(
    method ||
      catalogWarning ||
      limitations.length > 0 ||
      extraNotes.length > 0 ||
      sources.length > 0
  );

  return (
    <section
      aria-label="How crop plans were compared"
      className="rounded-xl border border-[#D9E2EC] dark:border-[#23362D] bg-[var(--as-bg-surface)] p-4 sm:p-5 space-y-3"
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-start gap-2.5 text-xs sm:text-sm text-[#172B22] dark:text-[#E8F1EC]">
          <Info className="w-4 h-4 as-text-accent shrink-0 mt-0.5" />
          <p className="leading-relaxed">
            These crop plans are preliminary comparisons based on available climate information and your farm details. Check local growing seasons and conditions before planting.
          </p>
        </div>

        {hasDetails && (
          <button
            type="button"
            aria-expanded={expanded}
            onClick={() => setExpanded((prev) => !prev)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-[#D9E2EC] dark:border-[#23362D] bg-[#F8FAF7] dark:bg-[#0B1310] text-[#172B22] dark:text-[#E8F1EC] hover:border-[var(--as-accent-text)] transition-colors whitespace-nowrap shrink-0 self-start sm:self-center"
          >
            <span>How were these plans compared?</span>
            {expanded ? (
              <ChevronUp className="w-3.5 h-3.5" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5" />
            )}
          </button>
        )}
      </div>

      {expanded && hasDetails && (
        <div className="pt-3 border-t border-[#D9E2EC] dark:border-[#23362D] space-y-3 text-xs text-[var(--as-text-muted)] leading-relaxed">
          {method && (
            <p>
              <strong className="text-[#172B22] dark:text-[#E8F1EC]">Comparison method: </strong>
              {method}
            </p>
          )}
          {catalogWarning && (
            <p>
              <strong className="text-[#172B22] dark:text-[#E8F1EC]">Crop parameters: </strong>
              {catalogWarning}
            </p>
          )}
          {extraNotes.map((note, idx) => (
            <p key={`extra-${idx}`}>{note}</p>
          ))}
          {limitations.length > 0 && (
            <div className="space-y-1">
              <p className="font-semibold text-[#172B22] dark:text-[#E8F1EC]">
                Key limitations to keep in mind:
              </p>
              <ul className="list-disc pl-5 space-y-1">
                {limitations.map((item, idx) => (
                  <li key={idx}>{item}</li>
                ))}
              </ul>
            </div>
          )}
          {sources.length > 0 && (
            <div className="space-y-2 pt-1">
              <p className="font-semibold text-[#172B22] dark:text-[#E8F1EC]">
                Agronomic &amp; Earth Observation References:
              </p>
              <ul className="space-y-2">
                {sources.map((src) => (
                  <li
                    key={src.id}
                    className="p-2.5 rounded-lg border border-[var(--as-border)] bg-[var(--as-bg-subtle)] space-y-1"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-semibold text-[#172B22] dark:text-[#E8F1EC]">
                        {src.title}
                      </span>
                      <a
                        href={src.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 as-text-accent underline hover:opacity-80"
                      >
                        {src.organization}
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                    <p>
                      <strong className="text-[#172B22] dark:text-[#E8F1EC]">Scope: </strong>
                      {src.geographic_applicability} · {src.crop_applicability}
                    </p>
                    <p>
                      <strong className="text-[#172B22] dark:text-[#E8F1EC]">Limits: </strong>
                      {src.limitations} (Reviewed {src.last_reviewed})
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
