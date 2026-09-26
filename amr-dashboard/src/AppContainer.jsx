import { useEffect } from 'react';
import { MotionConfig } from 'framer-motion';
import App from './App.jsx';
import Onboarding from './components/onboarding/Onboarding.jsx';
import { WorkspaceProvider, useWorkspace } from './context/WorkspaceContext.jsx';
import { MissionProvider } from './context/MissionContext.jsx';
import bridge from './services/WorkspaceBridge.js';
import amrSession from './services/AmrSessionService.js';

function DashboardRouter() {
  const { isConfigured, setWorkspace } = useWorkspace();

  if (!isConfigured) {
    return <Onboarding onComplete={setWorkspace} />;
  }

  return <App />;
}

export default function AppContainer({ initialWorkspace = null }) {
  useEffect(() => {
    amrSession.start();
    bridge.start();
    return () => bridge.stop();
  }, []);

  return (
    <MotionConfig reducedMotion="user">
      <WorkspaceProvider initialConfig={initialWorkspace}>
        <MissionProvider>
          <DashboardRouter />
        </MissionProvider>
      </WorkspaceProvider>
    </MotionConfig>
  );
}
