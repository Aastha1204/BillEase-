'use client';
import { Building2, Plus } from 'lucide-react';
import { useState } from 'react';
import { workspacesOf, useApp } from '@/lib/store';
import { Button, Chip, Modal } from '../ui';
import { AddBusinessModal } from './AddBusinessModal';

/** Landing page: choose which business to open as its owner, or add a new one. */
export function BusinessPicker({ open, onClose, onPick }: { open: boolean; onClose: () => void; onPick: (id: string) => void }) {
  const state = useApp();
  const [adding, setAdding] = useState(false);
  const list = workspacesOf(state).map((w) => w.business);
  return (
    <>
      <Modal open={open && !adding} onClose={onClose} title="Which business are you opening?"
        footer={<Button variant="primary" onClick={() => setAdding(true)} data-testid="bp-add"><Plus size={16} /> Add a new business</Button>}>
        <ul className="space-y-2" data-testid="business-list">
          {list.map((b) => (
            <li key={b.id}>
              <button onClick={() => onPick(b.id)} data-testid={`pick-${b.id}`}
                className="flex w-full items-center gap-3 rounded-xl border border-mute/25 p-3 text-left hover:border-gold hover:bg-gold/10">
                <Building2 size={20} className="shrink-0 text-gold" />
                <span className="min-w-0 flex-1"><span className="block truncate font-medium">{b.tradeName}</span><span className="block truncate text-xs text-mute">{b.city} · <span className="font-mono">{b.gstin}</span></span></span>
                {b.kind && <Chip tone="mute">{b.kind}</Chip>}
              </button>
            </li>
          ))}
        </ul>
      </Modal>
      <AddBusinessModal open={open && adding} onClose={() => setAdding(false)} onCreated={(id) => { setAdding(false); onPick(id); }} />
    </>
  );
}
