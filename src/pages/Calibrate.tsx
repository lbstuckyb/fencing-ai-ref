import ComingSoon from '../components/ComingSoon';
import PageHeader from '../components/PageHeader';

export default function Calibrate() {
  return (
    <>
      <PageHeader
        title="Calibrate"
        lede="Live numeric readouts of every joint angle the signal specs reference. Perform a signal correctly, read the true numbers, and tune the thresholds against them."
      />
      <ComingSoon stage="8">
        The readouts need the geometry primitives and the hand-shape classifier.
      </ComingSoon>
    </>
  );
}
