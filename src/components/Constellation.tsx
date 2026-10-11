'use client';

import type { ConceptState } from '../store/types';
import { positions } from './ConceptMap';
import './Constellation.css';

export interface TopicStat {
  id: string;
  name: string;
  category: string;
  cards: number;
  due: number;
  concepts: number;
  recall: number;
  state: ConceptState;
}

const HUB: [number, number] = [50, 46];

/** Every topic as a node around "you" — size follows how much material it holds. */
export default function Constellation({ items, selected, onSelect, onOpen, hubLabel, hubSub, dimmed }: {
  items: TopicStat[];
  selected?: string;
  onSelect: (id: string) => void;
  onOpen: (id: string) => void;
  hubLabel: string;
  hubSub?: string;
  dimmed?: Set<string>;
}) {
  const pos = positions(items.length);
  const edge = ([x, y]: [number, number]) => {
    const mx = (HUB[0] + x) / 2, my = (HUB[1] + y) / 2;
    return `M${HUB[0]} ${HUB[1]} Q${(mx + (y - HUB[1]) * 0.1).toFixed(1)} ${(my - (x - HUB[0]) * 0.1).toFixed(1)} ${x} ${y}`;
  };
  // Topics that share a category are linked with a faint dashed line.
  const links: [number, number][] = [];
  items.forEach((a, i) => items.forEach((b, j) => { if (j > i && a.category === b.category && a.category !== 'General') links.push([i, j]); }));

  return (
    <>
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="cs-lines" aria-hidden="true">
        {pos.map((p, i) => (
          <path key={items[i].id} d={edge(p)} fill="none" stroke="#6AA6DA" strokeWidth="1.5" vectorEffect="non-scaling-stroke"
            strokeOpacity={dimmed?.has(items[i].id) ? 0.08 : 0.45} />
        ))}
        {links.map(([a, b]) => (
          <path key={`${a}-${b}`} d={`M${pos[a][0]} ${pos[a][1]} L${pos[b][0]} ${pos[b][1]}`} stroke="#8a7be0" strokeWidth="1.2" strokeDasharray="4 5" strokeOpacity=".4" vectorEffect="non-scaling-stroke" fill="none" />
        ))}
      </svg>

      <div className="cs-hub" style={{ left: `${HUB[0]}%`, top: `${HUB[1]}%` }}><b>{hubLabel}</b>{hubSub && <small>{hubSub}</small>}</div>

      {items.map((t, i) => {
        const size = Math.round(62 + Math.min(44, t.cards * 3.2));
        return (
          <button key={t.id} type="button" className={`cs-node ${t.state}${selected === t.id ? ' sel' : ''}${dimmed?.has(t.id) ? ' dim' : ''}`}
            style={{ left: `${pos[i][0]}%`, top: `${pos[i][1]}%`, ['--s' as string]: `${size}px` }}
            data-node={t.id} onClick={() => onSelect(t.id)} onDoubleClick={() => onOpen(t.id)}
            aria-label={`${t.name}, ${t.recall}% recall${t.due ? `, ${t.due} due` : ''}`}>
            <span className="orb">
              <b className="tnum">{t.cards ? `${t.recall}%` : '—'}</b>
              {t.due > 0 && <i className="badge tnum">{t.due}</i>}
            </span>
            <span className="lbl">{t.name}</span>
          </button>
        );
      })}
    </>
  );
}
