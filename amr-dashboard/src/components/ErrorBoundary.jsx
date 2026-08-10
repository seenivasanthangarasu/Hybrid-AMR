import { Component } from 'react';

/**
 * Catches render/lifecycle errors in its subtree so one crashed panel
 * (e.g. a malformed ROS message reaching a canvas view) can't unmount
 * sibling panels — most importantly ControlPanel/emergency stop, which
 * must stay interactive even if another widget throws.
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    console.error('[ErrorBoundary]', this.props.label ?? 'panel', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex h-full w-full flex-col items-center justify-center gap-1 bg-deck-900">
          <div className="h-1.5 w-1.5 rounded-full bg-signal-red" />
          <span className="no-data text-[11px] text-signal-red">
            {this.props.label ? `${this.props.label} CRASHED` : 'PANEL CRASHED'}
          </span>
        </div>
      );
    }
    return this.props.children;
  }
}
