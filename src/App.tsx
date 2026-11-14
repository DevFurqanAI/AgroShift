import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from './components/common/ErrorBoundary';
import { DashboardLayout } from './components/layout/DashboardLayout';
import { AgroShiftProvider } from './context/AgroShiftContext';
import { AssistantPage } from './pages/AssistantPage';
import { ClimatePage } from './pages/ClimatePage';
import { FarmFormPage } from './pages/FarmFormPage';
import { FarmsPage } from './pages/FarmsPage';
import { FieldHealthPage } from './pages/FieldHealthPage';
import { LandingPage } from './pages/LandingPage';
import { OverviewPage } from './pages/OverviewPage';
import { PlannerPage } from './pages/PlannerPage';
import { ReportsPage } from './pages/ReportsPage';
import { ScenariosPage } from './pages/ScenariosPage';
import { SettingsPage } from './pages/SettingsPage';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

export default function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <AgroShiftProvider>
          <BrowserRouter>
            <Routes>
              <Route path="/" element={<LandingPage />} />
              <Route path="/dashboard" element={<DashboardLayout />}>
                <Route index element={<OverviewPage />} />
                <Route path="farms" element={<FarmsPage />} />
                <Route path="farms/new" element={<FarmFormPage />} />
                <Route path="farms/:id/edit" element={<FarmFormPage />} />
                <Route path="planner" element={<PlannerPage />} />
                <Route path="climate" element={<ClimatePage />} />
                <Route path="field-health" element={<FieldHealthPage />} />
                <Route path="scenarios" element={<ScenariosPage />} />
                <Route path="assistant" element={<AssistantPage />} />
                <Route path="reports" element={<ReportsPage />} />
                <Route path="settings" element={<SettingsPage />} />
              </Route>
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </BrowserRouter>
        </AgroShiftProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
