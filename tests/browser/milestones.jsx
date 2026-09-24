import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ItemColumn } from '../../src/components/ItemColumn';
import { QuickAddPanel } from '../../src/components/WorkspacePanels';
import '../../src/index.css';
import '../../src/App.css';
const initial = [
  { title: 'Prep and paint walls', kind: 'task' },
  { title: 'Clean windows', kind: 'task' },
  { title: 'TAKE PICTURES', kind: 'milestone', milestone_date: '2026-10-10' },
  { title: 'Install smart keyless lock', kind: 'task' },
  { title: 'HAND KEYS TO RENTER', kind: 'milestone' },
  { title: 'Touch up blue exterior paint', kind: 'task' },
].map((item, index) => ({ ...item, id: String(index), sort_order: index + 1, status: 'approved', note: '', attachments: [] }));
const empty = { kind: 'task', title: '', note: '', milestone_date: '' };
export function Harness() {
  const [items, setItems] = useState(initial), [adding, setAdding] = useState(false), [draft, setDraft] = useState(empty);
  function save(item, patch) { setItems(current => current.map(row => row.id === item.id ? { ...row, ...patch } : row)); return true; }
  return <main style={{ maxWidth: '850px', margin: '2rem auto', padding: '0 1rem' }}><h1>Milestone preview</h1><p>Sample data only. Changes here do not affect Carthage and reset when you reload.</p><ItemColumn title="Tasks" tone="task" items={items} itemCount={items.filter(item => item.kind === 'task' && item.status !== 'done').length} forceOpen reorderable mediaUrls={{}} onItemChange={save} onStatus={(item, status) => save(item, { status })} onDelete={item => setItems(current => current.filter(row => row.id !== item.id))} onReorder={ids => setItems(current => current.map(item => ids.includes(item.id) ? { ...item, sort_order: ids.indexOf(item.id) + 1 } : item))} onQuickAdd={() => setAdding(!adding)} quickAddOpen={adding} quickAddPanel={adding && <QuickAddPanel inline presetKind="task" draft={draft} onDraftChange={patch => setDraft({ ...draft, ...patch })} isOpen onClose={() => setAdding(false)} onSubmit={event => { event.preventDefault(); setItems(current => [...current, { ...draft, id: crypto.randomUUID(), attachments: [], status: 'approved', sort_order: Math.min(0, ...current.map(item => item.sort_order)) - 1 }]); setDraft(empty); return true; }} />} /></main>;
}
createRoot(document.getElementById('root')).render(<Harness />);
