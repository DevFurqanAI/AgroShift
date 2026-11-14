import React, { useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  Sprout,
  PlusCircle,
  Repeat,
  CloudSun,
  Satellite,
  SlidersHorizontal,
  MessageSquare,
  FileText,
  Settings,
  Menu,
  X,
  Sun,
  Moon,
} from 'lucide-react';
import { useAgroShift } from '../../context/AgroShiftContext';
import { LogoMark } from './LogoMark';

const NAV_ITEMS = [
  { to: '/dashboard', label: 'Overview', icon: LayoutDashboard, end: true },
  { to: '/dashboard/farms', label: 'My Farms', icon: Sprout, end: true },
  { to: '/dashboard/farms/new', label: 'Add Farm', icon: PlusCircle, end: true },
  { to: '/dashboard/planner', label: 'Crop Rotation Planner', icon: Repeat, end: false },
  { to: '/dashboard/climate', label: 'Climate Intelligence', icon: CloudSun, end: false },
  { to: '/dashboard/field-health', label: 'Field Health', icon: Satellite, end: false },
  { to: '/dashboard/scenarios', label: 'Compare Scenarios', icon: SlidersHorizontal, end: false },
  { to: '/dashboard/assistant', label: 'AI Assistant', icon: MessageSquare, end: false },
  { to: '/dashboard/reports', label: 'Reports', icon: FileText, end: false },
  { to: '/dashboard/settings', label: 'Settings', icon: Settings, end: false },
];

function getPageTitle(pathname: string): string {
  if (pathname === '/dashboard') return 'Farm Overview';
  if (pathname === '/dashboard/farms') return 'My Farms';
  if (pathname === '/dashboard/farms/new') return 'Add New Farm';
  if (pathname.includes('/edit')) return 'Edit Farm Profile';
  if (pathname.startsWith('/dashboard/planner')) return 'Crop Rotation Planner';
  if (pathname.startsWith('/dashboard/climate')) return 'Climate Intelligence';
  if (pathname.startsWith('/dashboard/field-health')) return 'Field Health';
  if (pathname.startsWith('/dashboard/scenarios')) return 'Compare Scenarios';
  if (pathname.startsWith('/dashboard/assistant')) return 'Ask AgroShift';
  if (pathname.startsWith('/dashboard/reports')) return 'Farm Reports';
  if (pathname.startsWith('/dashboard/settings')) return 'Settings';
  return 'Dashboard';
}

export function DashboardLayout() {
  const {
    farms,
    activeFarm,
    selectFarm,
    settings,
    updateSettings,
    storageError,
  } = useAgroShift();
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();
  const pageTitle = getPageTitle(location.pathname);

  const toggleTheme = () => {
    updateSettings({ theme: settings.theme === 'dark' ? 'light' : 'dark' });
  };

  const SidebarContent = (
    <div className="flex flex-col h-full">
      <div className="px-5 py-4 border-b border-[#E2E8F0] dark:border-[#1E2E26] flex items-center justify-between">
        <Link
          to="/"
          className="inline-flex items-center gap-2.5 font-display text-lg font-bold tracking-tight text-[#14532D] dark:text-[#E8F1EC] whitespace-nowrap"
        >
          <LogoMark className="w-7 h-7 shrink-0" />
          <span>AgroShift</span>
        </Link>
        <button
          type="button"
          onClick={() => setMobileOpen(false)}
          className="lg:hidden p-1.5 rounded-lg text-[#64748B] hover:text-[#172B22] dark:hover:text-[#E8F1EC]"
          aria-label="Close navigation menu"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <nav aria-label="Dashboard navigation" className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
        {NAV_ITEMS.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            onClick={() => setMobileOpen(false)}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                isActive
                  ? 'as-nav-active shadow-xs'
                  : 'text-[var(--as-text-muted)] hover:bg-[#14532D]/8 dark:hover:bg-[#182821] hover:text-[#172B22] dark:hover:text-[#E8F1EC]'
              }`
            }
          >
            <Icon className="w-4 h-4 shrink-0" />
            <span className="truncate">{label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );

  return (
    <div className="min-h-screen flex bg-[#F8FAF7] dark:bg-[#0B1310] text-[#172B22] dark:text-[#E8F1EC]">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex lg:flex-col lg:w-[260px] lg:shrink-0 border-r border-[#E2E8F0] dark:border-[#1E2E26] bg-white dark:bg-[#111D18] sticky top-0 h-screen">
        {SidebarContent}
      </aside>

      {/* Mobile Drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-black/40"
            onClick={() => setMobileOpen(false)}
            aria-hidden="true"
          />
          <aside className="relative z-10 w-[272px] max-w-[85vw] h-full bg-white dark:bg-[#111D18] border-r border-[#E2E8F0] dark:border-[#1E2E26]">
            {SidebarContent}
          </aside>
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="sticky top-0 z-30 h-14 px-4 sm:px-6 border-b border-[#E2E8F0] dark:border-[#1E2E26] bg-white/95 dark:bg-[#111D18]/95 backdrop-blur-sm flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              className="lg:hidden p-2 -ml-2 rounded-lg text-[#172B22] dark:text-[#E8F1EC] hover:bg-[#F8FAF7] dark:hover:bg-[#182821]"
              aria-label="Open navigation menu"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2 min-w-0 text-sm">
              <span className="hidden sm:inline text-[#64748B] dark:text-[#94A3B8]">
                AgroShift
              </span>
              <span className="hidden sm:inline text-[#64748B] dark:text-[#94A3B8]" aria-hidden="true">
                /
              </span>
              <h1 className="font-display font-semibold text-[#172B22] dark:text-[#E8F1EC] truncate">
                {pageTitle}
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            {farms.length > 0 && (
              <div className="flex items-center gap-2">
                <label htmlFor="active-farm-select" className="sr-only">
                  Active Farm
                </label>
                <select
                  id="active-farm-select"
                  value={activeFarm?.id || ''}
                  onChange={(e) => selectFarm(e.target.value)}
                  className="max-w-[160px] sm:max-w-[220px] px-2.5 py-1.5 text-xs sm:text-sm font-medium rounded-lg border border-[#E2E8F0] dark:border-[#1E2E26] bg-[#F8FAF7] dark:bg-[#0B1310] text-[#172B22] dark:text-[#E8F1EC] focus:outline-none focus:ring-2 focus:ring-[#16A34A]"
                >
                  {farms.map((farm) => (
                    <option key={farm.id} value={farm.id}>
                      {farm.details.name}
                      {farm.location.country ? ` (${farm.location.country})` : ''}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <button
              type="button"
              onClick={toggleTheme}
              aria-label={
                settings.theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'
              }
              className="p-2 rounded-lg border border-[#E2E8F0] dark:border-[#1E2E26] text-[#64748B] dark:text-[#94A3B8] hover:text-[#172B22] dark:hover:text-[#E8F1EC] transition-colors"
            >
              {settings.theme === 'dark' ? (
                <Sun className="w-4 h-4" />
              ) : (
                <Moon className="w-4 h-4" />
              )}
            </button>

            <Link
              to="/dashboard/farms/new"
              className="hidden sm:inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold rounded-lg as-btn-primary transition-colors whitespace-nowrap shrink-0"
            >
              <PlusCircle className="w-3.5 h-3.5" />
              Add Farm
            </Link>
          </div>
        </header>

        {storageError && (
          <div className="px-4 sm:px-6 pt-4">
            <div
              role="alert"
              className="rounded-lg border border-[#D97706]/40 bg-[#D97706]/10 px-4 py-2.5 text-xs text-[#172B22] dark:text-[#E8F1EC]"
            >
              Browser storage notice: {storageError}
            </div>
          </div>
        )}

        <main className="flex-1 px-4 sm:px-6 lg:px-8 py-6 max-w-[1240px] w-full mx-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
