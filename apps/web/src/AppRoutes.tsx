import { Routes, Route, Navigate } from 'react-router-dom';
import { AppLayout } from './components/AppLayout';
import { NodeScreen } from './screens/NodeScreen';
import { Settings } from './screens/Settings';
import { useUiState } from './state/UiState';

/** Open at the last visited node (remembered across sessions), else HQ NLC. */
function HomeRedirect() {
  const { lastNode } = useUiState();
  return <Navigate to={`/node/${lastNode ?? 'hq-nlc'}`} replace />;
}

export function AppRoutes() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route index element={<HomeRedirect />} />
        <Route path="node/:nodeId" element={<NodeScreen />} />
        <Route path="node/:nodeId/:tab" element={<NodeScreen />} />
        <Route path="settings" element={<Settings />} />
        <Route path="*" element={<HomeRedirect />} />
      </Route>
    </Routes>
  );
}
