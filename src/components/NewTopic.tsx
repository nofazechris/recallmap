'use client';

import { useState, type ReactNode } from 'react';
import { useNavigate } from '../lib/router';
import { actions, toast } from '../store/store';
import Dialog from './Dialog';
import Icon from './Icon';

/** Button + dialog that creates a topic and drops the user on its page. */
export default function NewTopic({ children, className = 'btn btn-primary btn-sm', style }: { children?: ReactNode; className?: string; style?: React.CSSProperties }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [goal, setGoal] = useState('');
  const [err, setErr] = useState('');
  const nav = useNavigate();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) { setErr('Give your topic a name.'); return; }
    const id = actions.createTopic(name, goal);
    toast({ kind: 'info', title: 'Topic created', body: `${name.trim()} is ready for material.` });
    setOpen(false); setName(''); setGoal(''); setErr('');
    nav(`/app/topics/${id}`);
  };

  return (
    <>
      <button className={className} style={style} onClick={() => setOpen(true)}>
        {children ?? (<><Icon name="plus" size={16} stroke={2.6} />New topic</>)}
      </button>
      {open && (
        <Dialog title="New topic" sub="Name what you’re learning — you can add material right after." onClose={() => setOpen(false)}>
          <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }} noValidate>
            <div className="field">
              <label htmlFor="nt-name">Topic</label>
              <input id="nt-name" className={`input${err ? ' err' : ''}`} value={name} onChange={(e) => { setName(e.target.value); setErr(''); }} placeholder="e.g. Organic Chemistry" maxLength={60} />
              {err && <div className="field-err">{err}</div>}
            </div>
            <div className="field">
              <label htmlFor="nt-goal">Goal <span className="muted" style={{ fontWeight: 400 }}>(optional)</span></label>
              <input id="nt-goal" className="input" value={goal} onChange={(e) => setGoal(e.target.value)} placeholder="e.g. Pass my midterm by December" maxLength={90} />
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 6 }}>
              <button type="button" className="btn btn-outline btn-sm" onClick={() => setOpen(false)}>Cancel</button>
              <button type="submit" className="btn btn-primary btn-sm">Create topic</button>
            </div>
          </form>
        </Dialog>
      )}
    </>
  );
}
