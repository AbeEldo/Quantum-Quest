import { create } from 'zustand';
import { sfx } from './sfx';

export interface Toast {
  id: number;
  kind: 'xp' | 'achievement' | 'rank' | 'info';
  title: string;
  detail?: string;
  icon?: string;
}

interface ToastState {
  toasts: Toast[];
  push: (t: Omit<Toast, 'id'>) => void;
  dismiss: (id: number) => void;
}

let nextId = 1;

export const useToasts = create<ToastState>()((set) => ({
  toasts: [],
  push: (t) => {
    const id = nextId++;
    set((s) => ({ toasts: [...s.toasts.slice(-4), { ...t, id }] }));
    const ttl = t.kind === 'xp' ? 1800 : 4500;
    setTimeout(() => set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) })), ttl);
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) })),
}));

export const toast = {
  xp: (amount: number, reason?: string) => useToasts.getState().push({ kind: 'xp', title: `+${amount} XP`, detail: reason }),
  achievement: (title: string, icon: string) =>
    (sfx.achievement(), useToasts.getState().push({ kind: 'achievement', title: 'Achievement unlocked!', detail: title, icon })),
  rank: (title: string, icon: string) => (sfx.levelUp(), useToasts.getState().push({ kind: 'rank', title: 'Rank up!', detail: title, icon })),
  info: (title: string, detail?: string, icon?: string) => useToasts.getState().push({ kind: 'info', title, detail, icon }),
};
