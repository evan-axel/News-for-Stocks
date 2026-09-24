import Viewer from './Viewer';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Filing' };

export default function FilingPage({ params }) {
  return <Viewer cik={params.cik} accession={params.accession} />;
}
