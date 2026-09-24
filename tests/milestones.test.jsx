// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ItemColumn } from '../src/components/ItemColumn';
import { QuickAddPanel } from '../src/components/WorkspacePanels';
let root, container;
const task = { id: 'a', kind: 'task', title: 'Paint', status: 'approved', sort_order: 1, attachments: [] };
const milestone = { id: 'b', kind: 'milestone', title: 'Take pictures', status: 'done', sort_order: 2, milestone_date: '2026-10-10', attachments: [] };
beforeEach(() => { globalThis.IS_REACT_ACT_ENVIRONMENT = true; container = document.createElement('div'); document.body.append(container); root = createRoot(container); });
afterEach(async () => { await act(async () => root.unmount()); container.remove(); });
async function renderColumn(extra = {}) { await act(async () => root.render(<ItemColumn title="Tasks" items={[{ ...task, id: 'done', title: 'Finished task', status: 'done', sort_order: 0 }, task, milestone, { ...task, id: 'c', title: 'Install lock', sort_order: 3 }]} forceOpen reorderable mediaUrls={{}} {...extra} />)); }
it('keeps reached milestones between active tasks and completed tasks at the bottom', async () => {
  await renderColumn();
  const rows = [...container.querySelectorAll('.item-list > li')];
  expect(rows.map(row => row.textContent)).toEqual([expect.stringContaining('Paint'), expect.stringContaining('Take pictures'), expect.stringContaining('Install lock'), expect.stringContaining('Finished task')]);
  expect(rows[1].querySelector('.milestone-reached').textContent).toContain('Reached');
  expect(rows[1].querySelector('input[type=checkbox]')).toBeNull();
  expect(rows[1].querySelector('.status-select')).toBeNull();
  expect(rows[1].querySelector('time').dateTime).toBe('2026-10-10');
});
it('moves a reached milestone without including completed tasks', async () => {
  const onReorder = vi.fn(); await renderColumn({ onReorder });
  await act(async () => container.querySelector('[aria-label="Move Take pictures up"]').click());
  expect(onReorder).toHaveBeenCalledWith(['b', 'a', 'c']);
});
it('marks milestones unreached and deletes only the selected milestone', async () => {
  const onStatus = vi.fn(), onDelete = vi.fn(); await renderColumn({ onStatus, onDelete });
  const buttons = [...container.querySelectorAll('.milestone-menu button')];
  await act(async () => buttons.find(button => button.textContent === 'Mark not reached').click());
  expect(onStatus).toHaveBeenCalledWith(milestone, 'approved');
  await act(async () => buttons.find(button => button.textContent === 'Delete milestone').click());
  expect(onDelete).toHaveBeenCalledWith(milestone);
});
it('retains edit form on failed save, then closes on successful retry', async () => {
  const onItemChange = vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true); await renderColumn({ onItemChange });
  await act(async () => [...container.querySelectorAll('button')].find(button => button.textContent === 'Edit milestone').click());
  const submit = () => act(async () => container.querySelector('.milestone-editor').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
  await submit(); expect(container.querySelector('.milestone-editor')).not.toBeNull();
  await submit(); expect(container.querySelector('.milestone-editor')).toBeNull();
  expect(onItemChange.mock.calls[1][1]).toMatchObject({ title: 'Take pictures', milestone_date: '2026-10-10' });
});
it('offers a new milestone without attachment or conversion controls', async () => {
  const onDraftChange = vi.fn();
  await act(async () => root.render(<QuickAddPanel inline presetKind="task" draft={{ kind: 'milestone', title: '', note: '', milestone_date: '' }} onDraftChange={onDraftChange} isOpen />));
  expect(container.querySelector('[value=milestone]').checked).toBe(true);
  expect(container.querySelector('input[type=file]')).toBeNull();
  expect(container.querySelector('input[type=date]')).not.toBeNull();
  expect(container.textContent).not.toContain('Convert');
  expect(container.querySelector('[name=milestone_color]')).toBeNull();
  expect(container.textContent).not.toContain('Change color');
});
