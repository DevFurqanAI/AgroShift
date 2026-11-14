import React from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends React.Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      message: error?.message || 'An unexpected rendering error occurred.',
    };
  }

  handleReset = () => {
    this.setState({ hasError: false, message: '' });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-[320px] flex items-center justify-center p-6">
          <div className="max-w-lg w-full rounded-xl border border-[#DC2626]/30 bg-white dark:bg-[#111D18] p-6">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-[#DC2626] shrink-0 mt-0.5" />
              <div className="space-y-3">
                <h2 className="text-lg font-semibold text-[#172B22] dark:text-[#E8F1EC]">
                  Something went wrong displaying this view
                </h2>
                <p className="text-sm text-[#64748B] dark:text-[#94A3B8]">
                  Your saved farm profiles remain intact. You can reset this section or return to the overview.
                </p>
                <p className="text-xs font-mono text-[#DC2626] bg-[#DC2626]/5 px-3 py-2 rounded-lg">
                  {this.state.message}
                </p>
                <button
                  type="button"
                  onClick={this.handleReset}
                  className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-[#14532D] text-white hover:bg-[#166534] transition-colors whitespace-nowrap"
                >
                  <RotateCcw className="w-4 h-4" />
                  Reload View
                </button>
              </div>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
