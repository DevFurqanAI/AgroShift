import React from 'react';

interface EmptyStateProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  primaryAction?: React.ReactNode;
  secondaryAction?: React.ReactNode;
}

export function EmptyState({
  icon,
  title,
  description,
  primaryAction,
  secondaryAction,
}: EmptyStateProps) {
  return (
    <div className="rounded-xl border border-[#D9E2EC] dark:border-[#23362D] bg-white dark:bg-[#111D18] p-8 sm:p-12 text-center">
      <div className="mx-auto w-12 h-12 rounded-xl as-icon-badge flex items-center justify-center mb-4">
        {icon}
      </div>
      <h2 className="text-xl font-semibold text-[#172B22] dark:text-[#E8F1EC] text-balance">
        {title}
      </h2>
      <p className="mt-2 max-w-md mx-auto text-sm text-[var(--as-text-muted)] leading-relaxed">
        {description}
      </p>
      {(primaryAction || secondaryAction) && (
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          {primaryAction}
          {secondaryAction}
        </div>
      )}
    </div>
  );
}
