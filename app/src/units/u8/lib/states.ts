/** Fixed states used by World 8 lessons (so MDX can import ready-made arrays). */
import { C, c, expi, scale } from '../../../engine/complex';

/** The "mystery" state Alice teleports in the Circuit Lab demo: θ = π/3, φ = π/4. */
export const PSI_THETA = Math.PI / 3;
export const PSI_PHI = Math.PI / 4;
export const PSI: [C, C] = [c(Math.cos(PSI_THETA / 2)), scale(expi(PSI_PHI), Math.sin(PSI_THETA / 2))];

/** |ψ⟩ ⊗ |0⟩ ⊗ |0⟩ (q0 = ψ, q1 = Alice’s half, q2 = Bob’s half). */
export const TELEPORT_INIT: C[] = Array.from({ length: 8 }, (_, i) => (i === 0 ? PSI[0] : i === 4 ? PSI[1] : c(0)));
export const TELEPORT_INIT_PAIRS: [number, number][] = TELEPORT_INIT.map((z) => [z.re, z.im]);

/** After deferred-measurement teleportation: |+⟩|+⟩|ψ⟩. */
export const TELEPORT_GOAL: C[] = Array.from({ length: 8 }, (_, i) => scale(PSI[i & 1], 0.5));

/** Bloch vector of ψ (for checking that q2 ends up there). */
export const teleportedBloch = (): [number, number, number] => [Math.sin(PSI_THETA) * Math.cos(PSI_PHI), Math.sin(PSI_THETA) * Math.sin(PSI_PHI), Math.cos(PSI_THETA)];

/** |Φ+⟩ on q0,q3 with q1, q2 in |+⟩ — the result of the deferred entanglement-swapping circuit. */
export const SWAP_GOAL: C[] = Array.from({ length: 16 }, (_, i) => (((i >> 3) & 1) === (i & 1) ? c(Math.SQRT1_2 * 0.5) : c(0)));
