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
      'border-[#E2E8F0] bg-white text-[#172B22] dark:border-[#1E2E26] dark:bg-[#111D18] dark:text-[#E8F1EC]',
    iconColor: 'text-[#16A34A]',
    Icon: Info,
  },
  success: {
    container:
      'border-[#16A34A]/30 bg-[#16A34A]/5 text-[#172B22] dark:border-[#10B981]/30 dark:bg-[#10B981]/10 dark:text-[#E8F1EC]',
    iconColor: 'text-[#16A34A] dark:text-[#10B981]',
    Icon: CheckCircle2,
  },
  warning: {
    container:
      'border-[#D97706]/35 bg-[#D97706]/5 text-[#172B22] dark:border-[#D97706]/40 dark:bg-[#D97706]/10 dark:text-[#E8F1EC]',
    iconColor: 'text-[#D97706]',
    Icon: AlertTriangle,
  },
  error: {
    container:
      'border-[#DC2626]/35 bg-[#DC2626]/5 text-[#172B22] dark:border-[#DC2626]/40 dark:bg-[#DC2626]/10 dark:text-[#E8F1EC]',
    iconColor: 'text-[#DC2626]',
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
            <p className="text-sm text-[#64748B] dark:text-[#94A3B8] leading-relaxed">
              {description}
            </p>
          </div>
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
    </div>
  );
}
