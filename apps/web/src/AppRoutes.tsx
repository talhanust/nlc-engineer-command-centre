import { Routes, Route, Navigate } from 'react-router-dom';
import { AppLayout } from './components/AppLayout';
import { NodeScreen } from './screens/NodeScreen';
import { Settings } from './screens/Settings';

export function AppRoutes() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route index element={<Navigate to="/node/hq-nlc" replace />} />
        <Route path="node/:nodeId" element={<NodeScreen />} />
        <Route path="node/:nodeId/:tab" element={<NodeScreen />} />
        <Route path="settings" element={<Settings />} />
        <Route path="*" element={<Navigate to="/node/hq-nlc" replace />} />
      </Route>
    </Routes>
  );
}
