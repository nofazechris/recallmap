import type { Metadata } from 'next';
import Link from 'next/link';
import Icon from '../../../components/Icon';
import Logo from '../../../components/Logo';
import { getDb } from '../../../server/db';
import { verifyPublic, type VerifyResult } from '../../../server/services/credentials';
import { HttpError } from '../../../server/lib/errors';
import '../../../views/Verify.css';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Verify a credential', robots: { index: false, follow: false } };

/** Public page: no account needed. Recomputes the fingerprint and reads the Arc contract on every visit. */
export default async function VerifyPage({ params }: { params: Promise<{ credentialId: string }> }) {
  const { credentialId } = await params;
  let result: VerifyResult | null = null;
  try { result = await verifyPublic(await getDb(), credentialId); } catch (e) { if (!(e instanceof HttpError)) throw e; }

  return (
    <div className="vf">
      <header><Logo to="/" size={26} /><Link href="/" className="btn btn-outline btn-sm">What is RecallMap?</Link></header>
      <main>
        {!result ? (
          <section className="card vf-card">
            <span className="vf-ic no"><Icon name="x" size={28} stroke={2.6} /></span>
            <h1 className="serif">Credential not found</h1>
            <p className="muted">There is no issued credential with this id. Check the link and try again.</p>
          </section>
        ) : (
          <section className="card vf-card">
            <span className={`vf-ic ${result.valid ? 'ok' : result.mode === 'unavailable' ? 'wait' : 'no'}`}>
              <Icon name={result.valid ? 'check' : result.mode === 'unavailable' ? 'clock' : 'x'} size={30} stroke={2.8} />
            </span>
            <div className="eyebrow">{result.valid ? 'Verified on Arc' : result.mode === 'unavailable' ? 'Could not check right now' : 'Not verified'}</div>
            <h1 className="serif">{result.credential.achievementName}</h1>
            <p className="lead">{result.message}</p>

            <dl className="vf-facts">
              {result.credential.holder && <div><dt>Holder</dt><dd>@{result.credential.holder}</dd></div>}
              {result.credential.topic && <div><dt>Topic</dt><dd>{result.credential.topic}</dd></div>}
              <div><dt>Issued</dt><dd>{result.credential.issuedOn}</dd></div>
              <div><dt>Issuer</dt><dd>RecallMap</dd></div>
              <div><dt>Credential id</dt><dd className="mono">{result.credential.id}</dd></div>
              {result.chain.chainId && <div><dt>Chain id</dt><dd className="mono">{result.chain.chainId}</dd></div>}
              {result.chain.contract && <div><dt>Contract</dt><dd className="mono">{result.chain.contract}</dd></div>}
              {result.chain.txHash && <div><dt>Transaction</dt><dd className="mono">{result.chain.txUrl ? <a href={result.chain.txUrl} target="_blank" rel="noreferrer">{result.chain.txHash}</a> : result.chain.txHash}</dd></div>}
            </dl>

            <h2>Checks we just ran</h2>
            <ul className="vf-checks">
              {result.checks.map((c) => (
                <li key={c.key} className={c.ok ? 'ok' : 'no'}><Icon name={c.ok ? 'check' : 'x'} size={15} stroke={3} />{c.label}</li>
              ))}
              {result.mode === 'unavailable' && <li className="wait"><Icon name="clock" size={15} stroke={2.6} />The Arc contract could not be read</li>}
            </ul>

            <details className="vf-how">
              <summary>Verify it yourself</summary>
              <p>Only a fingerprint is on-chain. Hash the exact text below with keccak-256 and compare it with the <code>payloadHash</code> returned by the contract’s <code>get(id)</code> function, where <code>id = keccak256("recallmap:credential:{'{credential id}'}")</code>.</p>
              <pre>{result.canonicalPayload}</pre>
              <p className="mono">keccak256 → {result.payloadHash}</p>
              <p className="muted">Nothing about this person’s notes, answers or study sessions is in that text or on-chain.</p>
            </details>
          </section>
        )}
      </main>
    </div>
  );
}
