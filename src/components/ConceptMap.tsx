'use client';

import type { ConceptStat } from '../store/selectors';
import Icon from './Icon';
import './ConceptMap.css';

/** Percent coordinates around a hub at (50, 46). */
const slots: [number, number][] = [[24, 20], [74, 22], [23, 64], [76, 66], [50, 87], [89, 44], [10, 44], [50, 7]];
const HUB: [number, number] = [50, 46];

const edge = ([x, y]: [number, number]) => {
  const mx = (HUB[0] + x) / 2, my = (HUB[1] + y) / 2;
  const cx = mx + (y - HUB[1]) * 0.1, cy = my - (x - HUB[0]) * 0.1;
  return `M${HUB[0]} ${HUB[1]} Q${cx.toFixed(1)} ${cy.toFixed(1)} ${x} ${y}`;
};

/** Up to 8 nodes use the hand-tuned slots; beyond that, two rings so nothing is silently dropped. */
export function positions(n: number): [number, number][] {
  if (n <= slots.length) return slots.slice(0, n);
  const inner = Math.ceil(n / 2);
  const outer = n - inner;
  const pts: [number, number][] = [];
  for (let i = 0; i < inner; i++) {
    const a = ((-90 + (i * 360) / inner) * Math.PI) / 180;
    pts.push([50 + 22 * Math.cos(a), 46 + 22 * Math.sin(a)]);
  }
  for (let i = 0; i < outer; i++) {
    const a = ((-90 + 180 / outer + (i * 360) / outer) * Math.PI) / 180;
    pts.push([50 + 35 * Math.cos(a), 46 + 38 * Math.sin(a)]);
  }
  return pts.map(([x, y]) => [+x.toFixed(1), +y.toFixed(1)] as [number, number]);
}

export const MAX_NODES = 16;

interface Props {
  hubLabel: string;
  hubSub?: string;
  concepts: ConceptStat[];
  selected?: string;
  onSelect?: (name: string) => void;
  /** Compact version for previews. */
  small?: boolean;
  animate?: boolean;
  /** Names to fade out (filters / search). */
  dimmed?: Set<string>;
  /** Real connections between concepts, by name. Nothing is drawn between nodes unless it's in this list. */
  links?: { a: string; b: string }[];
}

export default function ConceptMap({ hubLabel, hubSub, concepts, selected, onSelect, small, animate = true, dimmed, links }: Props) {
  const list = concepts.slice(0, MAX_NODES);
  const pos = positions(list.length);
  const hubSelected = selected === '__hub';
  return (
    <>
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="cm-lines" aria-hidden="true">
        {pos.map((p, i) => (
          <path key={list[i].name} d={edge(p)} fill="none" stroke="#6AA6DA" strokeOpacity={dimmed?.has(list[i].name) ? 0.1 : list[i].state === 'unexplored' ? 0.28 : 0.5} strokeWidth="1.5" vectorEffect="non-scaling-stroke"
            strokeDasharray={animate ? 200 : undefined} strokeDashoffset={animate ? 200 : undefined} style={animate ? { animation: `rm-draw 1.2s ease ${0.15 + i * 0.15}s forwards` } : undefined} />
        ))}
        {(links ?? []).map((l) => {
          const i = list.findIndex((c) => c.name === l.a), j = list.findIndex((c) => c.name === l.b);
          if (i < 0 || j < 0 || i === j) return null;
          const [x1, y1] = pos[i], [x2, y2] = pos[j];
          // bow the line toward the hub so connections read as a web, not a straight grid
          const cx = (x1 + x2) / 2 + (HUB[0] - (x1 + x2) / 2) * 0.35, cy = (y1 + y2) / 2 + (HUB[1] - (y1 + y2) / 2) * 0.35;
          const faded = dimmed?.has(l.a) || dimmed?.has(l.b);
          return <path key={`${l.a}-${l.b}`} d={`M${x1} ${y1} Q${cx.toFixed(1)} ${cy.toFixed(1)} ${x2} ${y2}`} fill="none" stroke="#8a7be0" strokeOpacity={faded ? 0.08 : 0.38} strokeWidth="1.3" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />;
        })}
      </svg>

      <button type="button" data-node="__hub" className={`cm-hub${small ? ' sm' : ''}${hubSelected ? ' sel' : ''}`} style={{ left: `${HUB[0]}%`, top: `${HUB[1]}%` }}
        onClick={onSelect ? () => onSelect('__hub') : undefined} tabIndex={onSelect ? 0 : -1} aria-label={`${hubLabel} hub`}>
        <span style={{ fontSize: hubLabel.length > 9 ? (small ? 9 : 10.5) : hubLabel.length > 6 ? (small ? 10 : 12) : undefined }}>{hubLabel}</span>{hubSub && <em>{hubSub}</em>}
      </button>

      {list.map((c, i) => (
        <button type="button" key={c.name} data-node={c.name} tabIndex={onSelect ? 0 : -1}
          className={`cm-node ${c.state}${small ? ' sm' : ''}${selected === c.name ? ' sel' : ''}${dimmed?.has(c.name) ? ' dim' : ''}`}
          style={{ left: `${pos[i][0]}%`, top: `${pos[i][1]}%` }} onClick={onSelect ? () => onSelect(c.name) : undefined}
          aria-label={`${c.name}, ${c.state}`}>
          {c.state === 'mastered' && <Icon name="check" size={small ? 11 : 13} stroke={3} />}
          {c.state === 'strong' && <i className="dot w" />}
          {c.state === 'learning' && <i className="dot" />}
          {c.state === 'due' && <><i className="dot pulse" /><i className="dot solid" /></>}
          {c.state === 'unexplored' && <i className="dot hollow" />}
          {c.name}
        </button>
      ))}
    </>
  );
}
