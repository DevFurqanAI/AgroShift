import React from 'react';
import { AlertCircle, CheckCircle2, Info, AlertTriangle } from 'lucide-react';

type BannerTone = 'info' | 'warning' | 'error' | 'success';

interface StatusBannerProps {
  tone: BannerTone;
  title: string;
  description: string;
  action?: React.ReactNode;
}

const TONE_STYLES: Record<
  BannerTone,
  { container: string; iconColor: string; Icon: React.ComponentType<{ className?: string }> }
> = {
  info: {
    container:
      'border-[#D9E2EC] bg-white text-[#172B22] dark:border-[#23362D] dark:bg-[#111D18] dark:text-[#E8F1EC]',
    iconColor: 'as-text-accent',
    Icon: Info,
  },
  success: {
    container:
      'border-[#15803D]/35 bg-[#15803D]/8 text-[#172B22] dark:border-[#34D399]/35 dark:bg-[#10B981]/12 dark:text-[#E8F1EC]',
    iconColor: 'as-text-accent',
    Icon: CheckCircle2,
  },
  warning: {
    container:
      'border-[#B45309]/35 bg-[#D97706]/8 text-[#172B22] dark:border-[#FBBF24]/40 dark:bg-[#F59E0B]/12 dark:text-[#E8F1EC]',
    iconColor: 'as-text-warning',
    Icon: AlertTriangle,
  },
  error: {
    container:
      'border-[#B91C1C]/35 bg-[#DC2626]/7 text-[#172B22] dark:border-[#F87171]/45 dark:bg-[#DC2626]/14 dark:text-[#E8F1EC]',
    iconColor: 'as-text-danger',
    Icon: AlertCircle,
  },
};

export function StatusBanner({ tone, title, description, action }: StatusBannerProps) {
  const { container, iconColor, Icon } = TONE_STYLES[tone];

  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={`rounded-xl border p-4 sm:p-5 ${container}`}
    >
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div className="flex items-start gap-3 min-w-0">
          <Icon className={`w-5 h-5 shrink-0 mt-0.5 ${iconColor}`} />
          <div className="space-y-1 min-w-0">
            <h3 className="text-sm font-semibold">{title}</h3>
            <p className="text-sm text-[var(--as-text-muted)] leading-relaxed">
              {description}
            </p>
          </div>
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
    </div>
  );
}
