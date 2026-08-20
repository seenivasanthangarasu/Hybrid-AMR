import Dialog from './ui/Dialog.jsx';
import ErrorBoundary from './ErrorBoundary.jsx';
import Nav2ThresholdPanel from './Nav2ThresholdPanel.jsx';

/**
 * Full-view overlay for Nav2 threshold tuning (opened from the Sidebar),
 * same Dialog-based structure as ErrorReference/DataHandlingPage. Moved out
 * of the scrollable dashboard grid — tuning thresholds is an occasional
 * action, not something that needs a permanently-visible grid tile.
 */
export default function Nav2ThresholdPage({ open, onClose, connectionStatus }) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="xl"
      title="NAV2 THRESHOLD TUNING"
      subtitle="Tune Nav2 costmap/controller thresholds live, over the existing rosbridge link"
    >
      <ErrorBoundary label="NAV2 THRESHOLD TUNING">
        <Nav2ThresholdPanel connectionStatus={connectionStatus} />
      </ErrorBoundary>
    </Dialog>
  );
}
