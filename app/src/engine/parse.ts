import { Circuit, GateName, Op } from './circuit';

const ALIASES: Record<string, GateName> = {
  CX: 'CNOT', CNOT: 'CNOT', CZ: 'CZ', SWAP: 'SWAP', CCX: 'CCX', TOFFOLI: 'CCX', CCNOT: 'CCX', CP: 'CP', CPHASE: 'CP',
  H: 'H', X: 'X', Y: 'Y', Z: 'Z', S: 'S', SDG: 'Sdg', 'S†': 'Sdg', T: 'T', TDG: 'Tdg', 'T†': 'Tdg', SX: 'SX',
  RX: 'Rx', RY: 'Ry', RZ: 'Rz', P: 'P', PHASE: 'P', M: 'M', MEASURE: 'M', I: 'I',
};

/** Parse an angle expression like "pi/4", "-pi/2", "0.3", "2pi/3", "π". */
export function parseAngle(s: string): number {
  const t = s.trim().toLowerCase().replace(/π/g, 'pi');
  const m = t.match(/^(-?\d*\.?\d*)\s*\*?\s*pi\s*(?:\/\s*(\d+\.?\d*))?$/);
  if (m) {
    const k = m[1] === '' || m[1] === '-' ? (m[1] === '-' ? -1 : 1) : parseFloat(m[1]);
    const d = m[2] ? parseFloat(m[2]) : 1;
    return (k * Math.PI) / d;
  }
  const v = parseFloat(t);
  if (isNaN(v)) throw new Error(`bad angle: ${s}`);
  return v;
}

/**
 * Compact circuit text format:
 *   columns separated by ";", ops within a column by ","
 *   "H 0"            single-qubit gate on qubit 0
 *   "CNOT 0 1"       control 0, target 1   (also CZ, CP(θ) c t, SWAP a b)
 *   "CCX 0 1 2"      controls 0,1 target 2
 *   "Rx(pi/2) 0"     parameterised gate
 *   "M 0 1"          measure qubits 0 and 1
 *   "H 0 1 2"        same single-qubit gate on several qubits (one column)
 * Example: "H 0; CNOT 0 1; M 0 1"
 */
export function parseCircuit(text: string, n?: number): Circuit {
  const columns: Op[][] = [];
  let maxQ = -1;
  for (const colText of text.split(';')) {
    const col: Op[] = [];
    for (const opText of colText.split(',')) {
      const t = opText.trim();
      if (!t) continue;
      const m = t.match(/^([A-Za-z†]+)\s*(?:\(([^)]*)\))?\s*(.*)$/);
      if (!m) throw new Error(`bad op: ${t}`);
      const g = ALIASES[m[1].toUpperCase()] ?? ALIASES[m[1]];
      if (!g) throw new Error(`unknown gate: ${m[1]}`);
      const param = m[2] !== undefined ? parseAngle(m[2]) : undefined;
      const qs = m[3].trim() ? m[3].trim().split(/\s+/).map((x) => parseInt(x, 10)) : [];
      qs.forEach((q) => (maxQ = Math.max(maxQ, q)));
      switch (g) {
        case 'CNOT': case 'CZ': case 'CP':
          col.push({ gate: g, controls: [qs[0]], targets: [qs[1]], param });
          break;
        case 'CCX':
          col.push({ gate: g, controls: [qs[0], qs[1]], targets: [qs[2]] });
          break;
        case 'SWAP':
          col.push({ gate: g, targets: [qs[0], qs[1]] });
          break;
        case 'M':
          col.push({ gate: 'M', targets: qs });
          break;
        default:
          for (const q of qs) col.push({ gate: g, targets: [q], param });
      }
    }
    columns.push(col);
  }
  return { n: n ?? maxQ + 1, columns };
}

export function circuitToText(c: Circuit): string {
  const fmtA = (p?: number) => {
    if (p === undefined) return '';
    const r = p / Math.PI;
    for (const d of [1, 2, 3, 4, 6, 8, 16]) {
      const k = r * d;
      if (Math.abs(k - Math.round(k)) < 1e-6) {
        const kk = Math.round(k);
        const num = kk === 1 ? '' : kk === -1 ? '-' : String(kk);
        return `(${num}pi${d === 1 ? '' : '/' + d})`;
      }
    }
    return `(${p.toFixed(4)})`;
  };
  return c.columns
    .filter((col) => col.length)
    .map((col) =>
      col
        .map((o) => {
          const qs = [...(o.controls ?? []), ...o.targets].join(' ');
          return `${o.gate}${fmtA(o.param)} ${qs}`;
        })
        .join(', '),
    )
    .join('; ');
}
