import React, { createContext, useContext, useEffect } from 'react';

/** Each lesson step provides a gate registry; interactive checkpoints must be resolved before "Continue". */
export interface GateCtx {
  set: (id: string, resolved: boolean) => void;
  remove: (id: string) => void;
  lessonId: string;
}

export const StepGateContext = createContext<GateCtx | null>(null);

export function useStepGate(id: string, resolved: boolean) {
  const ctx = useContext(StepGateContext);
  useEffect(() => {
    if (!ctx) return;
    ctx.set(id, resolved);
  }, [ctx, id, resolved]);
  useEffect(() => {
    if (!ctx) return;
    return () => ctx.remove(id);
  }, [ctx, id]);
}

export function useLessonId(): string {
  return useContext(StepGateContext)?.lessonId ?? 'sandbox';
}

/** Lets a widget-based challenge gate the step: call `useChallenge(id)` and then `done()` when solved. */
export function useChallengeGate(id: string, solved: boolean) {
  useStepGate(`challenge:${id}`, solved);
}

export const GateNoop: React.FC = () => null;
