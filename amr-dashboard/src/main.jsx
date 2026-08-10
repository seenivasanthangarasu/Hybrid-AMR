import React from 'react';
import ReactDOM from 'react-dom/client';
import { MotionConfig } from 'framer-motion';
import App from './App.jsx';
import './index.css';

import { MissionProvider } from './context/MissionContext.jsx';

// reducedMotion="user" makes every framer-motion animation honour the OS
// `prefers-reduced-motion` setting automatically (spec REQ-16/17), so motion
// stays decorative and never forced.
ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <MotionConfig reducedMotion="user">
      <MissionProvider>
        <App />
      </MissionProvider>
    </MotionConfig>
  </React.StrictMode>,
);
