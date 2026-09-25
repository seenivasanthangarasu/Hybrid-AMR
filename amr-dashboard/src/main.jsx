import React from 'react';
import ReactDOM from 'react-dom/client';
import Onboarding from './components/onboarding/Onboarding.jsx';
import './index.css';

// The legacy dashboard loads its robot services only when explicitly requested.
if (new URLSearchParams(window.location.search).get('view') === 'dashboard') {
  import('./dashboard-entry.jsx');
} else {
  ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
      <Onboarding />
    </React.StrictMode>,
  );
}
