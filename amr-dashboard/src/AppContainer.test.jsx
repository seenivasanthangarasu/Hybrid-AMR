import { render, screen } from '@testing-library/react';
import { describe, it, expect, beforeEach } from 'vitest';
import AppContainer from './AppContainer.jsx';

describe('AppContainer single React root routing', () => {
  beforeEach(() => {
    localStorage.clear();
    window.history.replaceState({}, '', '/?skipWelcome=1');
  });

  it('renders Onboarding when unconfigured', () => {
    render(<AppContainer />);
    expect(screen.getByRole('heading', { name: 'Where will you use Xtrmbly?' })).toBeInTheDocument();
  });

  it('renders App when initial workspace is provided', () => {
    render(
      <AppContainer
        initialWorkspace={{ environment: 'indoor', mode: 'manual' }}
      />,
    );
    expect(screen.getByText(/XTRMBLY/i)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /XTRMBLY|COMMAND CENTER/i })).toBeInTheDocument();
  });
});
