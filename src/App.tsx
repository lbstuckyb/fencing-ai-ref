import { Route, Routes } from 'react-router-dom';
import Layout from './components/Layout';
import Calibrate from './pages/Calibrate';
import Home from './pages/Home';
import NotFound from './pages/NotFound';
import PracticeSignals from './pages/PracticeSignals';
import Reference from './pages/Reference';
import Scenarios from './pages/Scenarios';

/**
 * Routes only — the router itself lives in main.tsx so tests can mount this
 * under a MemoryRouter. Route paths are mirrored by NAV_ITEMS in src/nav.ts.
 */
export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Home />} />
        <Route path="reference" element={<Reference />} />
        <Route path="practice" element={<PracticeSignals />} />
        <Route path="scenarios" element={<Scenarios />} />
        <Route path="calibrate" element={<Calibrate />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
