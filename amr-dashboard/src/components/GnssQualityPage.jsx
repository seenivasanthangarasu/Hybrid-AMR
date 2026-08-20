import Dialog from './ui/Dialog.jsx';
import ErrorBoundary from './ErrorBoundary.jsx';
import GnssQualityPanel from './GnssQualityPanel.jsx';

/**
 * Full-view overlay for GNSS Quality (opened from the Sidebar), same
 * Dialog-based structure as ErrorReference/DataHandlingPage. Moved out of
 * the scrollable dashboard grid — it's an occasional-use diagnostic an
 * operator checks when a fix looks wrong, not a panel that needs to be
 * visible at a glance alongside the live views.
 */
export default function GnssQualityPage({ open, onClose }) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="2xl"
      title="GNSS QUALITY"
      subtitle="Fix-quality diagnostics — DOP, per-satellite C/N0, accuracy radii, RF front-end health"
    >
      <ErrorBoundary label="GNSS QUALITY">
        <GnssQualityPanel />
      </ErrorBoundary>
    </Dialog>
  );
}
