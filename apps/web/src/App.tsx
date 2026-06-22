import { DataContextProvider } from './data/DataContext';
import { UiStateProvider } from './state/UiState';
import { RoleProvider } from './state/Role';
import { ToastProvider } from './components/Toast';
import { AppRoutes } from './AppRoutes';
import './theme.css';

// App = data context + UI state (filters, RAG thresholds) + routed tree. The
// Router is mounted in main.tsx (or by tests), so this stays router-agnostic.
export default function App() {
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
