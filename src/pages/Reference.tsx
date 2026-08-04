import ComingSoon from '../components/ComingSoon';
import PageHeader from '../components/PageHeader';

export default function Reference() {
  return (
    <>
      <PageHeader
        title="Signal reference"
        lede="Every signal in FIE Technical Rules Article t.63, with its official description, the geometry in plain words, and a way into the practice drill."
      />
      <ComingSoon stage="14">
        The signal library is built from the spec data authored in stages 11 and 12.
      </ComingSoon>
    </>
  );
}
