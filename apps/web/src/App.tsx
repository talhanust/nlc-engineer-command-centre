import { DataContextProvider } from './data/DataContext';
import { UiStateProvider } from './state/UiState';
import { RoleProvider } from './state/Role';
import { ToastProvider } from './components/Toast';
import { AppRoutes } from './AppRoutes';
import { useMoneyFormat } from './state/useMoneyFormat';
import './theme.css';

// App = data context + UI state (filters, RAG thresholds) + routed tree. The
// Router is mounted in main.tsx (or by tests), so this stays router-agnostic.
export default function App() {
  // Subscribe to the currency unit at the root so a change in Settings re-renders
  // the entire tree — every formatMoney()/formatAxis() call then reflects the new
  // unit at once (tables, KPIs, charts), not just the components that subscribe.
  useMoneyFormat();
  return (
    <DataContextProvider>
      <UiStateProvider>
        <RoleProvider>
          <ToastProvider>
            <AppRoutes />
          </ToastProvider>
        </RoleProvider>
      </UiStateProvider>
    </DataContextProvider>
  );
}
