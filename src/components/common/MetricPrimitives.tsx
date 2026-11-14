import { useState } from 'react';
import { HelpCircle } from 'lucide-react';

interface ScoreProgressBarProps {
  label: string;
  score: number | null | undefined;
  interpretation?: string;
  driverHint?: string;
  max?: number;
  unavailableLabel?: string;
}

export function getScoreToneColor(score: number): string {
  if (score >= 80) return 'bg-[#15803D] dark:bg-[#34D399]';
  if (score >= 60) return 'bg-[#0D9488] dark:bg-[#2DD4BF]';
  if (score >= 45) return 'bg-[#D97706] dark:bg-[#FBBF24]';
  return 'bg-[#DC2626] dark:bg-[#F87171]';
}

export function ScoreProgressBar({
  label,
  score,
  interpretation,
  driverHint,
  max = 100,
  unavailableLabel = 'Not evaluated',
}: ScoreProgressBarProps) {
  const valid = score !== null && score !== undefined && Number.isFinite(score);
  const clampedPct = valid ? Math.max(0, Math.min(100, (score / max) * 100)) : 0;

  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-2 text-xs">
        <span className="font-medium text-[var(--as-text-primary)]">{label}</span>
        {valid ? (
          <span className="font-mono tabular-nums font-semibold text-[var(--as-text-primary)] shrink-0">
            {score.toFixed(1)}/{max}
            {interpretation ? (
              <span className="font-sans font-normal text-[var(--as-text-muted)]">
                {' '}
                — {interpretation}
              </span>
            ) : null}
          </span>
        ) : (
          <span className="font-mono text-[11px] text-[var(--as-text-muted)] shrink-0">
            {unavailableLabel}
          </span>
        )}
      </div>

      <div
        role="progressbar"
        aria-label={label}
        aria-valuenow={valid ? Number(score.toFixed(1)) : undefined}
        aria-valuemin={0}
        aria-valuemax={max}
        className="h-1.5 w-full rounded-full bg-[var(--as-border)] overflow-hidden"
      >
        {valid && (
          <div
            className={`h-full rounded-full transition-all duration-200 ${getScoreToneColor(
              (score / max) * 100
            )}`}
            style={{ width: `${clampedPct}%` }}
          />
        )}
      </div>

      {driverHint && (
        <p className="text-[11px] text-[var(--as-text-muted)] leading-snug">{driverHint}</p>
      )}
    </div>
  );
}

interface IndexRangeMeterProps {
  label: string;
  value: number | null | undefined;
  min: number;
  max: number;
  thresholdValue?: number;
  thresholdLabel?: string;
  lowLabel: string;
  highLabel: string;
}

export function IndexRangeMeter({
  label,
  value,
  min,
  max,
  thresholdValue,
  thresholdLabel,
  lowLabel,
  highLabel,
}: IndexRangeMeterProps) {
  const numericValue =
    value !== null && value !== undefined && Number.isFinite(value) ? value : null;
  const span = max - min || 1;
  const pct =
    numericValue !== null
      ? Math.max(0, Math.min(100, ((numericValue - min) / span) * 100))
      : null;
  const thresholdPct =
    thresholdValue !== undefined
      ? Math.max(0, Math.min(100, ((thresholdValue - min) / span) * 100))
      : null;

  return (
    <div className="space-y-1.5 pt-1">
      <div className="relative h-2 w-full rounded-full bg-[var(--as-bg-subtle)] border border-[var(--as-border)]">
        {thresholdPct !== null && (
          <div
            title={thresholdLabel}
            className="absolute top-[-3px] bottom-[-3px] w-px bg-[var(--as-warning-text)] opacity-80"
            style={{ left: `${thresholdPct}%` }}
          />
        )}
        {pct !== null && numericValue !== null && (
          <div
            role="meter"
            aria-label={label}
            aria-valuenow={Number(numericValue.toFixed(3))}
            aria-valuemin={min}
            aria-valuemax={max}
            className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3 h-3 rounded-full bg-[var(--as-primary)] ring-2 ring-[var(--as-bg-surface)]"
            style={{ left: `${pct}%` }}
          />
        )}
      </div>
      <div className="flex items-center justify-between text-[10px] font-mono tabular-nums text-[var(--as-text-muted)]">
        <span>
          {min.toFixed(1)} ({lowLabel})
        </span>
        {thresholdLabel && (
          <span className="text-[var(--as-warning-text)]">{thresholdLabel}</span>
        )}
        <span>
          +{max.toFixed(1)} ({highLabel})
        </span>
      </div>
    </div>
  );
}

interface InfoTooltipHintProps {
  label: string;
  explanation: string;
}

export function InfoTooltipHint({ label, explanation }: InfoTooltipHintProps) {
  const [open, setOpen] = useState(false);

  return (
    <span className="inline-flex flex-col">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        aria-label={label}
        title={explanation}
        className="inline-flex items-center gap-1 text-[11px] font-medium text-[var(--as-accent-text)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--as-focus-ring)] rounded"
      >
        <HelpCircle className="w-3.5 h-3.5 shrink-0" />
        <span>{open ? 'Hide context' : 'Why this matters'}</span>
      </button>
      {open && (
        <span className="mt-1.5 block rounded-lg border border-[var(--as-border)] bg-[var(--as-bg-subtle)] p-2.5 text-[11px] leading-relaxed text-[var(--as-text-muted)]">
          {explanation}
        </span>
      )}
    </span>
  );
}
