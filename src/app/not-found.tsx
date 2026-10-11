import Link from 'next/link';
import { MoriMark } from '../components/Mori';

export default function NotFound() {
  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', textAlign: 'center', padding: 24 }}>
      <div>
        <MoriMark size={72} />
        <h1 className="h1" style={{ margin: '18px 0 8px' }}>This page flew away.</h1>
        <p className="muted" style={{ marginBottom: 22 }}>The link may be old, or the page never existed.</p>
        <Link href="/" className="btn btn-primary">Back to RecallMap</Link>
      </div>
    </div>
  );
}
