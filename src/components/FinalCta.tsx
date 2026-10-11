'use client';

import { Link } from '../lib/router';
import Icon from './Icon';
import Mori from './Mori';
import './FinalCta.css';

/** Closing block: one headline, one primary action, and three honest ways in. */
export default function FinalCta() {
  return (
    <section className="fc" aria-labelledby="fc-title">
      <div className="mesh" aria-hidden="true"><i /><i /><i /><b /></div>

      <div className="inner">
        <div className="mori"><Mori size={84} float label="Mori the moth" /></div>
        <p className="quote">“Your progress is becoming a pattern.”</p>
        <h2 id="fc-title" className="h2">Your next breakthrough starts with <span className="grad-text-anim">one session.</span></h2>
        <p className="sub">Pick the way in that suits you. Each takes about a minute.</p>

        <div className="paths">
          <a href="#demo" className="path">
            <span className="ico a"><Icon name="map" size={22} /></span>
            <b>Try the live map</b>
            <small>Tap a concept and answer a card — no sign-up, no data saved.</small>
            <em>Back to the demo<Icon name="arrow" size={15} stroke={2.5} /></em>
          </a>

          <Link to="/auth?mode=signup" className="path main">
            <span className="ico b"><Icon name="upload" size={22} /></span>
            <b>Start with your own notes</b>
            <small>Create an account, add a PDF or text, and get a study kit to review.</small>
            <em>Start learning<Icon name="arrow" size={15} stroke={2.5} /></em>
          </Link>

          <a href="#faq" className="path">
            <span className="ico c"><Icon name="shield" size={22} /></span>
            <b>Read the fine print</b>
            <small>What happens to your notes, your data, and what “verified” really means.</small>
            <em>Open the FAQ<Icon name="arrow" size={15} stroke={2.5} /></em>
          </a>
        </div>

        <p className="note"><Icon name="lock" size={14} stroke={2.4} />Your notes are private by default. You choose what, if anything, is public.</p>
      </div>
    </section>
  );
}
