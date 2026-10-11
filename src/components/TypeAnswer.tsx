'use client';

import { useRef } from 'react';
import type { Match } from '../lib/grade';
import { matchLabel } from '../lib/grade';
import Icon from './Icon';
import './TypeAnswer.css';

/** Compact "type before you flip" row used by the landing-page demos. */
export function AnswerInput({ value, onChange, onCheck }: { value: string; onChange: (v: string) => void; onCheck: () => void }) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <form className="ta" onSubmit={(e) => { e.preventDefault(); onCheck(); }}>
      <div className="ta-in">
        <Icon name="edit" size={15} stroke={2.3} />
        <input ref={ref} value={value} onChange={(e) => onChange(e.target.value)} placeholder="Type your answer…" aria-label="Your answer" maxLength={200} autoComplete="off" />
      </div>
      <div className="ta-row">
        <button type="button" className="idk" onClick={onCheck}>I don’t know</button>
        <button type="submit" className="btn btn-primary btn-sm" disabled={!value.trim()}>Check<Icon name="arrow" size={14} stroke={2.6} /></button>
      </div>
    </form>
  );
}

export function YouWrote({ typed, match }: { typed: string; match: Match }) {
  return (
    <div className="you-wrote">
      <span className={`mt ${match.level}`}>{matchLabel[match.level]}</span>
      <span className="txt">{typed.trim() ? <>You wrote: <i>{typed.trim()}</i></> : 'No answer — now you’ve seen it.'}</span>
    </div>
  );
}
