import { describe, it, expect } from 'vitest';
import { parseCircuit, circuitToText, parseAngle } from './parse';
import { runCircuit } from './circuit';
import { parseNumber } from '../components/lesson/Quiz';

describe('circuit text format', () => {
  it('parses columns, controls and params', () => {
    const c = parseCircuit('H 0, X 1; CNOT 0 1; Rx(pi/2) 2; CCX 0 1 2; M 0 1');
    expect(c.n).toBe(3);
    expect(c.columns.length).toBe(5);
    expect(c.columns[0].length).toBe(2);
    expect(c.columns[1][0]).toEqual({ gate: 'CNOT', controls: [0], targets: [1], param: undefined });
    expect(c.columns[2][0].param).toBeCloseTo(Math.PI / 2);
    expect(c.columns[3][0].controls).toEqual([0, 1]);
    expect(c.columns[4][0].targets).toEqual([0, 1]);
  });
  it('round-trips through text', () => {
    const t = 'H 0; CNOT 0 1; CP(pi/4) 1 0; SWAP 0 1';
    expect(circuitToText(parseCircuit(t))).toBe(t);
  });
  it('angles', () => {
    expect(parseAngle('pi')).toBeCloseTo(Math.PI);
    expect(parseAngle('-pi/4')).toBeCloseTo(-Math.PI / 4);
    expect(parseAngle('2pi/3')).toBeCloseTo((2 * Math.PI) / 3);
    expect(parseAngle('0.5')).toBeCloseTo(0.5);
  });
  it('Bell circuit from text gives Bell state', () => {
    const { state } = runCircuit(parseCircuit('H 0; CNOT 0 1'));
    expect(state.probabilities()[0]).toBeCloseTo(0.5);
    expect(state.probabilities()[3]).toBeCloseTo(0.5);
  });
});

describe('numeric answer parsing', () => {
  it('accepts common forms', () => {
    expect(parseNumber('0.5')).toBeCloseTo(0.5);
    expect(parseNumber('1/2')).toBeCloseTo(0.5);
    expect(parseNumber('50%')).toBeCloseTo(0.5);
    expect(parseNumber('sqrt(2)/2')).toBeCloseTo(Math.SQRT1_2);
    expect(parseNumber('pi/4')).toBeCloseTo(Math.PI / 4);
    expect(parseNumber('2^-3')).toBeCloseTo(0.125);
    expect(parseNumber('6.6e-34')).toBeCloseTo(6.6e-34);
    expect(parseNumber('10,000')).toBe(10000);
    expect(parseNumber('0,5')).toBeCloseTo(0.5);
    expect(parseNumber('cos(pi/8)^2')).toBeCloseTo(Math.cos(Math.PI / 8) ** 2);
  });
  it('rejects junk', () => {
    expect(parseNumber('')).toBeNull();
    expect(parseNumber('alert(1)')).toBeNull();
    expect(parseNumber('hello')).toBeNull();
  });
});
