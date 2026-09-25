import { useEffect, useRef, useState } from 'react';
import './onboarding.css';

const environments = [
  ['indoor', 'Indoor', 'For rooms, corridors, and enclosed spaces.', 'ENCLOSED SPACES'],
  ['outdoor', 'Outdoor', 'For open spaces, grounds, and outdoor paths.', 'OPEN SPACES'],
  ['hybrid', 'Hybrid', 'For journeys that move between inside and out.', 'CONNECTED SPACES'],
];
const modes = [
  ['manual', 'Manual Mode', 'A workspace for direct robot operation.', 'DIRECT OPERATION'],
  ['mapping', 'Mapping Mode', 'A workspace for scanning and map building.', 'SPATIAL EXPLORATION'],
  ['navigation', 'Navigation Mode', 'A workspace for routes and destinations.', 'ROUTE PLANNING'],
];

function Illustration({ kind }) {
  return (
    <svg viewBox="0 0 300 200" aria-hidden="true" focusable="false" className="setup-illustration">
      <path d="M25 167H275M45 183H255" stroke="currentColor" opacity=".16" />
      {(kind === 'indoor' || kind === 'hybrid') && (
        <g fill="none" stroke="currentColor" strokeWidth="2.5" opacity=".65">
          <path
            d={
              kind === 'hybrid'
                ? 'M35 163V47H153V163M55 163V73H108V163'
                : 'M40 163V44H260V163M61 163V70H116V163M145 67H237V106H145Z'
            }
          />
          <path d="M75 47V35H129" />
        </g>
      )}
      {(kind === 'outdoor' || kind === 'hybrid') && (
        <g stroke="currentColor" strokeWidth="2.5" fill="none">
          <circle cx="226" cy="42" r="14" opacity=".55" />
          <path d="M235 156V101M214 118L235 78L256 118ZM45 160Q72 125 97 148" opacity=".7" />
          {kind === 'outdoor' && (
            <path d="M32 117L75 67L116 118M53 91L75 103L88 84M149 69Q171 50 190 69" opacity=".35" />
          )}
        </g>
      )}
      {kind === 'hybrid' && (
        <path d="M100 177H210L201 170M210 177L201 184" stroke="currentColor" strokeWidth="2.5" fill="none" />
      )}
      {kind === 'manual' && (
        <g stroke="#9fb0c6" strokeWidth="3" fill="none">
          <circle cx="76" cy="64" r="14" fill="#263245" />
          <path d="M58 156L64 107M91 155L83 108M61 110V92Q76 78 91 92L109 111" />
          <rect x="93" y="105" width="31" height="18" rx="5" fill="#263245" />
          <path d="M100 114H109M105 110V118M124 87Q150 83 157 104" strokeDasharray="4 5" />
        </g>
      )}
      {kind === 'mapping' && (
        <g stroke="currentColor" fill="none">
          <path d="M40 146V61H99V40H250V146H216M57 73H111V55H233V103H197V155" strokeWidth="3" opacity=".5" />
          <circle cx="150" cy="128" r="54" opacity=".3" />
          <circle cx="150" cy="128" r="76" opacity=".15" />
          <path d="M150 127L110 65M150 127L226 91M150 127L50 107" strokeDasharray="4 5" />
        </g>
      )}
      {kind === 'navigation' && (
        <g fill="none" stroke="currentColor" strokeWidth="3">
          <path d="M75 163H176Q207 163 207 137V111Q207 88 239 88" strokeDasharray="6 6" />
          <path d="M239 89S219 67 219 56A20 20 0 0 1 259 56C259 67 239 89 239 89Z" fill="#26213b" />
          <circle cx="239" cy="56" r="6" />
          <path d="M42 79H120V102M163 50V80" opacity=".25" />
        </g>
      )}
      <g transform={`translate(${kind === 'manual' ? 192 : kind === 'navigation' ? 87 : 150} 112)`}>
        <ellipse cx="0" cy="48" rx="43" ry="9" fill="currentColor" opacity=".1" />
        <rect x="-33" y="22" width="12" height="24" rx="5" fill="#8292aa" />
        <rect x="21" y="22" width="12" height="24" rx="5" fill="#8292aa" />
        <rect
          x="-31"
          y="3"
          width="62"
          height="34"
          rx="12"
          fill="#263245"
          stroke="#8292aa"
          strokeWidth="2.5"
        />
        <rect x="-24" y="10" width="48" height="15" rx="7" fill="#8292aa" />
        <circle cx="-12" cy="17" r="3" fill="#71e0c5" />
        <circle cx="12" cy="17" r="3" fill="#71e0c5" />
        <path d="M0 3V-6" stroke="#8292aa" strokeWidth="3" />
        <rect x="-10" y="-11" width="20" height="7" rx="3" fill="currentColor" />
      </g>
    </svg>
  );
}

export default function Onboarding() {
  const [step, setStep] = useState(() =>
    new URLSearchParams(window.location.search).has('skipWelcome') ? 'environment' : 'welcome',
  );
  const [environment, setEnvironment] = useState(null);
  const [mode, setMode] = useState(null);
  const heading = useRef(null);
  useEffect(() => {
    if (step !== 'welcome') return;
    const timer = setTimeout(() => setStep('environment'), 2600);
    return () => clearTimeout(timer);
  }, [step]);
  useEffect(() => {
    heading.current?.focus();
  }, [step]);
  const environmentLabel = environments.find((item) => item[0] === environment)?.[1];
  const modeLabel = modes.find((item) => item[0] === mode)?.[1];
  return (
    <div className="setup-shell">
      <header className="setup-header">
        <span>WORKSPACE SETUP</span>
        <span className="setup-header-label">ENVIRONMENT / MODE</span>
      </header>
      <main className={`setup-main ${step === 'welcome' ? 'setup-welcome' : ''}`}>
        {step === 'welcome' ? (
          <section className="setup-welcome-content">
            <div className="setup-welcome-orbit">
              <Illustration kind="hybrid" />
            </div>
            <p className="setup-eyebrow">WORKSPACE SETUP</p>
            <h1 ref={heading} tabIndex={-1}>
              Welcome to <span>Xtrmbly</span>
            </h1>
            <p className="setup-intro">Select an environment and operating mode to get started.</p>
            <div className="setup-progress" aria-hidden="true">
              <span />
            </div>
            <button className="setup-text-button" onClick={() => setStep('environment')}>
              Skip introduction →
            </button>
          </section>
        ) : (
          <>
            <nav className="setup-steps" aria-label="Setup progress">
              {['environment', 'mode', 'ready'].map((value, index) => (
                <span
                  key={value}
                  className={step === value ? 'active' : ''}
                  aria-current={step === value ? 'step' : undefined}
                >
                  <b>{index + 1}</b>
                  {['Environment', 'Mode', 'Workspace'][index]}
                </span>
              ))}
            </nav>
            <section className="setup-content" key={step}>
              <div className="setup-heading-row">
                <p className="setup-eyebrow">{step === 'ready' ? 'SETUP COMPLETE' : 'CONFIGURE WORKSPACE'}</p>
                {environment && step !== 'environment' && (
                  <button className="setup-environment-chip" onClick={() => setStep('environment')}>
                    {environmentLabel} <span>· Change</span>
                  </button>
                )}
              </div>
              <h1 ref={heading} tabIndex={-1}>
                {step === 'environment'
                  ? 'Where will you use Xtrmbly?'
                  : step === 'mode'
                    ? 'Choose an operating mode'
                    : `${environmentLabel} · ${modeLabel}`}
              </h1>
              <p className="setup-intro">
                {step === 'environment'
                  ? 'Select the environment where the robot will operate.'
                  : step === 'mode'
                    ? 'Select a mode for this workspace.'
                    : 'Environment and mode selected.'}
              </p>
              {step !== 'ready' ? (
                <div
                  className="setup-cards"
                  role="group"
                  aria-label={step === 'environment' ? 'Choose an environment' : 'Choose a mode'}
                >
                  {(step === 'environment' ? environments : modes).map(([id, title, detail, tag], index) => {
                    const selected = (step === 'environment' ? environment : mode) === id;
                    return (
                      <button
                        key={id}
                        className={`setup-card tone-${id}`}
                        aria-pressed={selected}
                        onClick={() => {
                          if (step === 'environment') {
                            setEnvironment(id);
                            setStep('mode');
                          } else {
                            setMode(id);
                            setStep('ready');
                          }
                        }}
                      >
                        <span className="setup-card-top">
                          <span>0{index + 1}</span>
                          <span className="setup-check">{selected ? '✓' : '↗'}</span>
                        </span>
                        <Illustration kind={id} />
                        <span className="setup-tag">{tag}</span>
                        <span className="setup-card-title">{title}</span>
                        <span className="setup-card-detail">{detail}</span>
                        <span className="setup-card-action">
                          {selected ? 'Selected' : `Choose ${title.toLowerCase()}`}{' '}
                          <span aria-hidden="true">→</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <section className={`setup-workspace tone-${mode}`} aria-label="Mode features placeholder">
                  <Illustration kind={mode} />
                  <div>
                    <span className="setup-tag">WORKSPACE PREVIEW</span>
                    <h2>{modeLabel} features</h2>
                    <p>
                      Features for {environmentLabel.toLowerCase()} {modeLabel.toLowerCase()} will appear
                      here.
                    </p>
                    <span className="setup-coming">Coming soon</span>
                  </div>
                </section>
              )}
              <div className="setup-bottom">
                <span>
                  {step === 'environment'
                    ? '01 / ENVIRONMENT'
                    : step === 'mode'
                      ? '02 / OPERATING MODE'
                      : '03 / WORKSPACE'}
                </span>
                {step !== 'environment' ? (
                  <button
                    className="setup-text-button"
                    onClick={() => setStep(step === 'mode' ? 'environment' : 'mode')}
                  >
                    ← {step === 'mode' ? 'Back to environments' : 'Change mode'}
                  </button>
                ) : (
                  <span>You can change this in the next step.</span>
                )}
              </div>
            </section>
          </>
        )}
      </main>
    </div>
  );
}
