import Link from 'next/link';
import JsonLd from '../../components/JsonLd';
import Legal from '../../components/Legal';
import { SITE, arcContractUrl, arcSampleTxUrl, articleLd, pageMeta } from '../../lib/seo';

const path = '/arc';
const title = 'Verifiable learning credentials on Arc';
const description = 'How RecallMap uses the Arc blockchain: mastery badges are anchored as privacy-preserving hashes in a smart contract on Arc mainnet, and anyone can verify them on a public page. Why Arc fits, what goes on-chain, and how to check it yourself.';
export const metadata = pageMeta(path, 'Verifiable learning credentials on Arc', 'How RecallMap anchors mastery badges as privacy-preserving hashes on Arc mainnet, why Arc fits, and how anyone can verify a credential.');

const faq = [
  { q: 'Why does RecallMap use the Arc blockchain?', a: 'Arc gives RecallMap a public, tamper-evident place to anchor proof of learning. Fees are paid in USDC and are a fraction of a cent per credential, transactions confirm in under a second, and Arc is EVM-compatible, so standard Solidity tooling and block explorers work. Verification does not depend on RecallMap staying online or honest.' },
  { q: 'Do learners need a crypto wallet?', a: 'No. RecallMap submits the transaction for you from its issuer wallet and pays the gas. A learner only clicks Issue credential.' },
  { q: 'What does RecallMap put on the blockchain?', a: 'Only a keccak256 hash of the credential, plus an id, the issuer address and a timestamp. No name, email, notes, flashcards or answers are ever written on-chain.' },
  { q: 'How can I check a credential is real?', a: 'Open its public verification page. It recomputes the credential’s fingerprint, reads the CredentialRegistry contract on Arc mainnet and runs four checks. Developers can also call the contract’s verify function directly.' },
  { q: 'Is an Arc credential permanent?', a: 'Yes. Records on a blockchain cannot be deleted. RecallMap can mark a credential revoked, and verification then fails, but the original record remains visible on-chain.' },
];

export default function ArcPage() {
  const ld = {
    ...articleLd(path, title, description, 'TechArticle'),
  };
  const faqLd = { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: faq.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })) };
  return (
    <>
      <JsonLd data={ld} />
      <JsonLd data={faqLd} />
      <Legal eyebrow="Arc" title={title} showUpdated={false} showContact={false}
        intro="RecallMap is an active-recall study app. When you earn a mastery badge, you can publish proof of it on the Arc blockchain, so anyone can verify your achievement without trusting RecallMap and without seeing a single note or answer.">
        <section>
          <h2>What is Arc?</h2>
          <p>Arc is an EVM-compatible Layer-1 blockchain built by Circle. It uses USDC as its native gas token, so transaction fees are priced in dollars, and it confirms transactions in under a second. RecallMap runs on Arc mainnet (chain ID {SITE.arc.chainId}).</p>
        </section>

        <section>
          <h2>Why Arc is a good fit for learning credentials</h2>
          <ul>
            <li><strong>Fees are tiny and predictable.</strong> Gas is paid in USDC. Issuing a RecallMap credential cost about $0.0014 in our live transaction, which makes it practical to anchor every earned badge.</li>
            <li><strong>Confirmation is fast.</strong> Our real credential transaction showed “confirmed within ≤ 0.51 secs” on the explorer, so a learner sees Pending turn to Verified almost immediately.</li>
            <li><strong>It is EVM-compatible.</strong> The credential registry is ordinary Solidity, and RecallMap talks to it with standard tools (viem, JSON-RPC, a block explorer). Anyone can inspect it with the tools they already know.</li>
            <li><strong>Verification is public and independent.</strong> The record lives on-chain, so a credential can be checked without RecallMap’s database, login or goodwill.</li>
            <li><strong>No wallet needed.</strong> Learners never handle keys, tokens or gas. RecallMap submits the transaction and pays the fee.</li>
          </ul>
        </section>

        <section>
          <h2>How RecallMap uses Arc</h2>
          <ol style={{ margin: '10px 0 0', paddingLeft: 22, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <li><strong>Earn it honestly.</strong> Only mastery badges can be anchored. Recall Ready needs two separate quiz attempts at 80% or higher and Topic Master needs 90% or higher, at least 30 minutes apart, so cramming can’t fake it.</li>
            <li><strong>Build a canonical payload.</strong> The credential (badge, holder, date, optional topic name, and a random nonce) is serialised with sorted keys so it always produces the same bytes.</li>
            <li><strong>Hash it.</strong> RecallMap computes the keccak256 hash of that payload. The nonce means the hash can’t be guessed from the badge details.</li>
            <li><strong>Anchor it.</strong> The issuer wallet calls <code>issue(credentialId, payloadHash)</code> on the CredentialRegistry contract on Arc mainnet.</li>
            <li><strong>Confirm it.</strong> A background job waits for the receipt. A credential is marked verified only after the transaction succeeds and the hash stored on-chain matches RecallMap’s own.</li>
            <li><strong>Verify it publicly.</strong> Every credential gets a public page that re-reads the contract on each visit and runs four checks: the data matches its fingerprint, it is recorded on Arc, the on-chain fingerprint matches, and it was issued by the authorised issuer and is not revoked.</li>
          </ol>
        </section>

        <section>
          <h2>What goes on-chain and what never does</h2>
          <table>
            <thead><tr><th>On Arc (public)</th><th>Never on Arc</th></tr></thead>
            <tbody>
              <tr><td>keccak256 hash of the credential</td><td>Your name or email</td></tr>
              <tr><td>An id derived from the credential id</td><td>Notes, uploads, flashcards or quiz answers</td></tr>
              <tr><td>The issuer address and a timestamp</td><td>Scores, study history or your topic list</td></tr>
              <tr><td>A revoked flag</td><td>Anything that identifies what you studied (unless you opt to include the topic name in the credential you share)</td></tr>
            </tbody>
          </table>
        </section>

        <section>
          <h2>The contract</h2>
          <p>RecallMap’s <code>CredentialRegistry</code> is a small Solidity contract with an owner and authorised issuers. It exposes <code>issue</code>, <code>revoke</code>, <code>get</code>, <code>verify</code> and <code>setIssuer</code>. A credential exists once an issuer is recorded for its id, an id can only be issued once, and only the issuing wallet or the owner can revoke it. The issuer wallet’s balance is checked before issuing and issuance is capped per day.</p>
          <p>Contract address (Arc mainnet): <a href={arcContractUrl} rel="noopener"><span className="mono">{SITE.arc.contract}</span></a></p>
          <p>A real credential transaction: <a href={arcSampleTxUrl} rel="noopener"><span className="mono">{SITE.arc.sampleTx}</span></a> (method <code>issue</code>, status Success).</p>
        </section>

        <section>
          <h2>Check it yourself</h2>
          <ul>
            <li>Open the contract address above on the Arc explorer and look at its transactions.</li>
            <li>Open the sample transaction and confirm the method is <code>issue</code>, the status is Success and the sender is RecallMap’s issuer wallet.</li>
            <li>Developers: call <code>verify(credentialId, expectedHash)</code> on the contract. It returns true only if the credential exists, is not revoked and the stored hash matches.</li>
          </ul>
        </section>

        <section>
          <h2>Common questions</h2>
          {faq.map((f) => (
            <div key={f.q} style={{ marginTop: 14 }}>
              <h3 style={{ fontSize: 16, fontWeight: 650, marginBottom: 4 }}>{f.q}</h3>
              <p>{f.a}</p>
            </div>
          ))}
        </section>

        <section>
          <h2>Try it</h2>
          <p>Create a free account, upload something you’re learning, study it, and earn a badge. Then publish it to Arc and open the public verification page yourself.</p>
          <div className="cta-row">
            <Link href="/auth?mode=signup" className="btn btn-primary">Get started free</Link>
            <Link href="/how-it-works" className="btn btn-outline">How RecallMap works</Link>
          </div>
        </section>
      </Legal>
    </>
  );
}
