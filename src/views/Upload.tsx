'use client';

import { useEffect, useRef, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from '../lib/router';
import Icon from '../components/Icon';
import { api, messageOf } from '../lib/api';
import { refresh, toast, useApp } from '../store/store';
import { findTopic } from '../store/selectors';
import './Upload.css';

type State = 'uploading' | 'extracting' | 'done' | 'error';
type Item = { id: number; name: string; ext: string; state: State; progress: number; note?: string; resourceId?: string };
type Tab = 'file' | 'text';

const MAX_MB = 15;
const MAX = MAX_MB * 1024 * 1024;
const allowed: Record<string, string> = { pdf: 'PDF', txt: 'TXT', md: 'MD', markdown: 'MD', docx: 'DOCX' };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** PUT with progress events (fetch can't report upload progress). */
const put = (url: string, file: Blob, headers: Record<string, string>, onProgress: (pct: number) => void) =>
  new Promise<void>((resolve, reject) => {
    const x = new XMLHttpRequest();
    x.open('PUT', url);
    for (const [k, v] of Object.entries(headers)) x.setRequestHeader(k, v);
    x.upload.onprogress = (e) => { if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100)); };
    x.onload = () => (x.status >= 200 && x.status < 300 ? resolve() : reject(new Error(x.status === 403 ? 'The upload link expired. Please try again.' : 'The upload failed. Please try again.')));
    x.onerror = () => reject(new Error('The upload failed — check your connection.'));
    x.send(file);
  });

export default function Upload() {
  const { id = '' } = useParams();
  const s = useApp();
  const nav = useNavigate();
  const topic = findTopic(s, id);
  const [tab, setTab] = useState<Tab>('file');
  const [items, setItems] = useState<Item[]>([]);
  const [text, setText] = useState('');
  const [err, setErr] = useState('');
  const [over, setOver] = useState(false);
  const seq = useRef(1);
  const alive = useRef(true);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  // Dropping a file slightly outside the box would make the browser open it and leave the page — stop that.
  useEffect(() => {
    const stop = (e: DragEvent) => { if (e.dataTransfer?.types.includes('Files')) e.preventDefault(); };
    window.addEventListener('dragover', stop); window.addEventListener('drop', stop);
    return () => { window.removeEventListener('dragover', stop); window.removeEventListener('drop', stop); };
  }, []);
  if (!topic) return <Navigate to="/app/map" replace />;

  const patch = (itemId: number, p: Partial<Item>) => { if (alive.current) setItems((l) => l.map((x) => (x.id === itemId ? { ...x, ...p } : x))); };

  /** upload → register → wait for the server to extract the text. */
  const process = async (itemId: number, file: File) => {
    try {
      const mime = file.type || '';
      const req = await api<{ storageKey: string; upload: { url: string; headers: Record<string, string> } }>('POST', `/api/topics/${id}/resources/upload-url`, { filename: file.name, mimeType: mime, size: file.size });
      await put(req.upload.url, file, req.upload.headers, (progress) => patch(itemId, { progress }));
      patch(itemId, { progress: 100, state: 'extracting' });
      const { resource } = await api<{ resource: { id: string } }>('POST', `/api/topics/${id}/resources`, { storageKey: req.storageKey, filename: file.name, mimeType: mime, size: file.size });
      patch(itemId, { resourceId: resource.id });
      for (let n = 0; n < 120 && alive.current; n++) {
        await sleep(n < 4 ? 900 : 2000);
        const r = await api<{ resource: { status: string; error: string | null } }>('GET', `/api/resources/${resource.id}`);
        if (r.resource.status === 'ready') { patch(itemId, { state: 'done' }); void refresh(); return; }
        if (r.resource.status === 'failed') { patch(itemId, { state: 'error', note: r.resource.error ?? 'We couldn’t process this file.' }); void refresh(); return; }
      }
      patch(itemId, { state: 'error', note: 'Processing is taking longer than expected. Check the Material tab in a moment.' });
    } catch (e) {
      patch(itemId, { state: 'error', note: messageOf(e) });
      toast({ kind: 'error', title: 'Upload failed', body: messageOf(e) });
    }
  };

  const enqueue = (file: File, ext: string) => {
    const itemId = seq.current++;
    setItems((l) => [...l, { id: itemId, name: file.name, ext, state: 'uploading', progress: 0 }]);
    void process(itemId, file);
  };

  const addFiles = (list: FileList | File[]) => {
    setErr('');
    Array.from(list).forEach((f) => {
      const ext = allowed[f.name.split('.').pop()?.toLowerCase() ?? ''];
      if (!ext) { setItems((l) => [...l, { id: seq.current++, name: f.name, ext: 'TXT', state: 'error', progress: 0, note: 'Unsupported file type — use PDF, TXT, Markdown or DOCX.' }]); return; }
      if (f.size > MAX) { setItems((l) => [...l, { id: seq.current++, name: f.name, ext, state: 'error', progress: 0, note: `Larger than ${MAX_MB} MB` }]); return; }
      if (f.size === 0) { setItems((l) => [...l, { id: seq.current++, name: f.name, ext, state: 'error', progress: 0, note: 'This file is empty.' }]); return; }
      enqueue(f, ext);
    });
  };

  /** Pasted text goes through exactly the same pipeline, as a Markdown file. */
  const addText = () => {
    if (text.trim().length < 40) { setErr('Paste at least a couple of sentences.'); return; }
    setErr('');
    const label = text.trim().replace(/\s+/g, ' ').slice(0, 24).replace(/[^\w ]/g, '');
    enqueue(new File([text.trim()], `Pasted notes - ${label || 'notes'}.md`, { type: 'text/markdown' }), 'MD');
    setText('');
  };

  const remove = async (item: Item) => {
    setItems((l) => l.filter((x) => x.id !== item.id));
    if (item.resourceId) { try { await api('DELETE', `/api/resources/${item.resourceId}`); void refresh(); } catch { /* already gone */ } }
  };
  const done = items.filter((x) => x.state === 'done');
  const busy = items.some((x) => x.state === 'uploading' || x.state === 'extracting');
  const ready = topic.resources.filter((r) => r.status === 'ready').length;

  const generate = () => {
    toast({ kind: 'info', title: `${done.length || ready} ${(done.length || ready) === 1 ? 'resource' : 'resources'} ready`, body: 'Building your study kit…' });
    nav(`/app/topics/${id}?tab=material&generate=1`);
  };

  return (
    <div className="up">
      <div className="up-card">
        <div className="up-head">
          <div><small>{topic.name}</small><b>Add learning material</b></div>
          <Link to={`/app/topics/${id}`} aria-label="Close" className="x"><Icon name="x" size={18} /></Link>
        </div>

        <div className="up-body">
          <div className="seg" role="tablist">
            {(['file', 'text'] as Tab[]).map((t) => (
              <button key={t} role="tab" aria-selected={tab === t} className={tab === t ? 'on' : ''} onClick={() => { setTab(t); setErr(''); }}>
                {{ file: 'Upload file', text: 'Paste text' }[t]}
              </button>
            ))}
          </div>

          {tab === 'file' && (
            <label className={`drop${over ? ' over' : ''}`} htmlFor="up-file"
              onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
              onDrop={(e) => { e.preventDefault(); setOver(false); addFiles(e.dataTransfer.files); }}>
              <span className="ico"><Icon name="upload" size={26} stroke={2.3} /></span>
              <b>Click to add a file <span>or drag it here</span></b>
              <small>PDF, TXT, Markdown, DOCX · up to {MAX_MB} MB each · text-based documents only (no scans)</small>
              {/* A real, focusable input inside a label: the browser opens the picker natively, no scripted click needed. */}
              <input id="up-file" ref={fileRef} className="sr-only" type="file" multiple accept=".pdf,.txt,.md,.markdown,.docx,application/pdf,text/plain,text/markdown"
                onChange={(e) => { if (e.target.files) addFiles(e.target.files); e.target.value = ''; }} />
            </label>
          )}

          {tab === 'text' && (
            <div>
              <textarea className="input" rows={7} placeholder="Paste your notes, a chapter, or any text to turn into flashcards and quizzes…" value={text} onChange={(e) => setText(e.target.value)} />
              <div className="row"><span>Plain text or Markdown</span><button className="btn btn-primary btn-sm" onClick={addText}>Add text</button></div>
            </div>
          )}

          {err && <div className="field-err" role="alert" style={{ marginTop: 10 }}>{err}</div>}

          <div className="files" aria-live="polite">
            {items.map((f) => (
              <div key={f.id} className="file">
                <span className={`ext ${f.ext === 'PDF' ? 'pdf' : ''}`}>{f.ext}</span>
                <div>
                  <b>{f.name}</b>
                  <small className={f.state}>{f.state === 'uploading' ? `Uploading… ${f.progress}%` : f.state === 'extracting' ? 'Extracting text…' : f.state === 'error' ? `${f.note}` : 'Ready · text extracted'}</small>
                  {f.state === 'uploading' && <div className="bar bar-sm" style={{ marginTop: 7 }}><i style={{ width: `${f.progress}%` }} /></div>}
                </div>
                {f.state === 'done' && <span className="pill pill-lime"><Icon name="check" size={12} stroke={3} />Processed</span>}
                {(f.state === 'uploading' || f.state === 'extracting') && <Icon name="refresh" size={17} stroke={2.4} className="spin" style={{ color: 'var(--blue)' }} />}
                {f.state === 'error' && <span className="pill pill-clay">Error</span>}
                <button onClick={() => void remove(f)} aria-label={`Remove ${f.name}`} className="rm"><Icon name="trash" size={17} stroke={2.2} /></button>
              </div>
            ))}
            {topic.resources.length > 0 && items.length === 0 && (
              <p className="existing">{topic.resources.length} {topic.resources.length === 1 ? 'resource is' : 'resources are'} already in this topic ({ready} ready).</p>
            )}
          </div>

          <div className="up-foot">
            <span>{items.length === 0 ? (ready ? 'Or generate from what’s already here' : 'Add something to begin') : busy ? 'Waiting for processing to finish…' : `${done.length} ${done.length === 1 ? 'resource' : 'resources'} ready`}</span>
            <Link to={`/app/topics/${id}`} className="btn btn-outline btn-sm">Cancel</Link>
            <button className="btn btn-dark btn-sm" disabled={busy || (done.length === 0 && ready === 0)} onClick={generate}>Generate study kit<Icon name="spark" size={16} stroke={2.5} /></button>
          </div>
        </div>
      </div>
    </div>
  );
}
