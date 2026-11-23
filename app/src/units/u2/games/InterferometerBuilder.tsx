import React, { useEffect, useMemo, useRef, useState } from 'react';
import { RichText, ProgressBar, Tex } from '../../../components/ui';
import { useGame, GameOverlay, HowToPlay } from '../../../components/game';
import { abs, arg, fmt, phaseColor, type C } from '../../../engine/complex';
import { PhaseLegend, PhasorClock } from '../../../widgets/AmplitudeView';
import {
  LEVELS,
  DX,
  DY,
  canPlace,
  checkLevel,
  parseLayout,
  phaseOf,
  starsFor,
  key,
  type LevelDef,
  type PieceKind,
  type PlacedPiece,
  type Piece,
  type SimResult,
} from './interferometerEngine';

const GAME_ID = 'interferometer-builder';
const CS = 64; // cell size in SVG units
const PAD = 14;

type Tool = PieceKind | 'erase';

const PHASE_LABEL = ['0', 'π/2', 'π', '3π/2'];
const KIND_NAME: Record<PieceKind, string> = { mirror: 'Mirror', bs: 'Beam splitter', phase: 'Phase shifter' };

const CSS = `
@keyframes qqib-flow { to { stroke-dashoffset: -28; } }
@keyframes qqib-ring { from { r: 20px; opacity: .95; } to { r: 46px; opacity: 0; } }
@keyframes qqib-boom { 0% { opacity: .0 } 15% { opacity: .55 } 100% { opacity: 0 } }
@keyframes qqib-place { from { transform: scale(.4); opacity: .2 } to { transform: scale(1); opacity: 1 } }
@keyframes qqib-glowpulse { 0%,100% { opacity: .55 } 50% { opacity: 1 } }
.qqib-flow { animation: qqib-flow .55s linear infinite; }
.qqib-ring { animation: qqib-ring .7s ease-out forwards; }
.qqib-boom { animation: qqib-boom .8s ease-out forwards; }
.qqib-place { animation: qqib-place .22s cubic-bezier(.2,.9,.3,1.3); transform-box: fill-box; transform-origin: center; }
.qqib-cell:hover .qqib-hover { opacity: 1; }
.qqib-target { animation: qqib-glowpulse 1.6s ease-in-out infinite; }
`;

/* ------------------------------- piece glyphs ------------------------------ */

function PieceGlyph({ p, cx, cy, ghost = false, s = 1 }: { p: Piece; cx: number; cy: number; ghost?: boolean; s?: number }) {
  const r = 22 * s;
  const op = ghost ? 0.4 : 1;
  if (p.kind === 'mirror') {
    const [x1, y1, x2, y2] = p.o === 0 ? [cx - r, cy + r, cx + r, cy - r] : [cx - r, cy - r, cx + r, cy + r];
    // backing offset (silvered side)
    const nx = p.o === 0 ? 3 : -3;
    return (
      <g opacity={op}>
        <line x1={x1 + nx * s} y1={y1 + 3 * s} x2={x2 + nx * s} y2={y2 + 3 * s} stroke="#56607a" strokeWidth={5 * s} strokeLinecap="round" />
        <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#eef3fa" strokeWidth={4.5 * s} strokeLinecap="round" />
        {p.fixed && <circle cx={cx} cy={cy} r={3 * s} fill="#56607a" />}
      </g>
    );
  }
  if (p.kind === 'bs') {
    const rot = p.o === 0 ? -45 : 45;
    return (
      <g opacity={op} transform={`rotate(${rot} ${cx} ${cy})`}>
        <rect x={cx - r * 1.38} y={cy - 4 * s} width={r * 2.76} height={8 * s} rx={2 * s} fill="rgba(88,196,221,0.28)" stroke="#9fe3f2" strokeWidth={1.6 * s} />
        <line x1={cx - r * 1.3} y1={cy} x2={cx + r * 1.3} y2={cy} stroke="#d9f6ff" strokeWidth={1 * s} strokeDasharray={`${3 * s} ${3 * s}`} />
        {p.fixed && <circle cx={cx} cy={cy} r={3 * s} fill="#56607a" />}
      </g>
    );
  }
  const phi = phaseOf(p);
  const col = phaseColor(phi);
  return (
    <g opacity={op}>
      <rect x={cx - 19 * s} y={cy - 15 * s} width={38 * s} height={30 * s} rx={8 * s} fill={col} fillOpacity={0.22} stroke={col} strokeWidth={2 * s} strokeDasharray={p.fixed ? `${4 * s} ${2 * s}` : undefined} />
      <text x={cx} y={cy + 5 * s} textAnchor="middle" fontSize={13 * s} fontWeight={700} fill={col} style={{ fontFamily: 'var(--serif)' }}>
        {PHASE_LABEL[p.o]}
      </text>
    </g>
  );
}

function ToolIcon({ tool }: { tool: Tool }) {
  return (
    <svg width={30} height={30} viewBox="0 0 64 64">
      {tool === 'erase' ? (
        <g stroke="var(--red)" strokeWidth={6} strokeLinecap="round">
          <line x1={18} y1={18} x2={46} y2={46} />
          <line x1={46} y1={18} x2={18} y2={46} />
        </g>
      ) : (
        <PieceGlyph p={{ kind: tool, o: tool === 'phase' ? 2 : 0 }} cx={32} cy={32} s={0.95} />
      )}
    </svg>
  );
}

/* --------------------------------- board ---------------------------------- */

function Board({
  level,
  pieces,
  res,
  tool,
  onCell,
  onRemove,
  flash,
  boom,
}: {
  level: LevelDef;
  pieces: PlacedPiece[];
  res: SimResult;
  tool: Tool;
  onCell: (x: number, y: number) => void;
  onRemove: (x: number, y: number) => void;
  flash: { label: string; n: number } | null;
  boom: number;
}) {
  const { W, H, cells } = useMemo(() => parseLayout(level.layout), [level]);
  const [hover, setHover] = useState<[number, number] | null>(null);
  const vbW = W * CS + PAD * 2, vbH = H * CS + PAD * 2;
  const cx = (x: number) => PAD + x * CS + CS / 2;
  const cy = (y: number) => PAD + y * CS + CS / 2;
  const playerAt = new Map(pieces.map((p) => [key(p.x, p.y), p]));
  const fixedAt = new Map((level.fixed ?? []).map((p) => [key(p.x, p.y), p]));
  const segKeys = new Set(res.segments.map((s) => `${s.x},${s.y},${s.dir}`));

  // beam segments
  const beams = res.segments
    .filter((s) => abs(s.amp) > 2e-3)
    .map((s, i) => {
      const a = abs(s.amp);
      const col = phaseColor(arg(s.amp));
      let x1 = cx(s.x), y1 = cy(s.y);
      let x2 = x1 + DX[s.dir] * CS, y2 = y1 + DY[s.dir] * CS;
      if (s.exits) {
        x2 = x1 + DX[s.dir] * (CS / 2 + PAD);
        y2 = y1 + DY[s.dir] * (CS / 2 + PAD);
      }
      // counter-propagating beam on same edge → offset both sideways
      const nx = s.x + DX[s.dir], ny = s.y + DY[s.dir];
      if (segKeys.has(`${nx},${ny},${(s.dir + 2) % 4}`)) {
        const ox = -DY[s.dir] * 4, oy = DX[s.dir] * 4;
        x1 += ox; x2 += ox; y1 += oy; y2 += oy;
      }
      const w = 2 + 8 * a;
      return (
        <g key={i}>
          <title>{`amplitude ${fmt(s.amp)}   |amp|² = ${(a * a).toFixed(3)}   phase ${((arg(s.amp) * 180) / Math.PI).toFixed(0)}°`}</title>
          <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={col} strokeWidth={w * 2.6} strokeOpacity={0.13 * a + 0.04} strokeLinecap="round" />
          <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={col} strokeWidth={w} strokeOpacity={0.35 + 0.65 * a} strokeLinecap="round" />
          <line
            className="qqib-flow"
            x1={x1}
            y1={y1}
            x2={x2}
            y2={y2}
            stroke="#fff"
            strokeWidth={Math.max(1.2, w * 0.45)}
            strokeOpacity={0.25 + 0.55 * a}
            strokeDasharray="5 23"
            strokeLinecap="round"
          />
        </g>
      );
    });

  const cellEls: React.ReactNode[] = [];
  const overEls: React.ReactNode[] = [];
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const cell = cells[y][x];
      const k = key(x, y);
      const X = PAD + x * CS, Y = PAD + y * CS;
      const pp = playerAt.get(k);
      const fp = fixedAt.get(k);
      const placeable = canPlace(level, x, y);
      const interactive = placeable || !!pp;
      let bg = 'rgba(255,255,255,0.025)';
      if (cell.type === 'void') bg = 'rgba(0,0,0,0.25)';
      cellEls.push(
        <g
          key={`c${k}`}
          className="qqib-cell"
          style={{ cursor: interactive ? 'pointer' : 'default' }}
          onClick={() => interactive && onCell(x, y)}
          onContextMenu={(e) => {
            e.preventDefault();
            if (pp) onRemove(x, y);
          }}
          onMouseEnter={() => setHover([x, y])}
          onMouseLeave={() => setHover(null)}
        >
          <rect x={X + 1.5} y={Y + 1.5} width={CS - 3} height={CS - 3} rx={8} fill={bg} stroke="rgba(255,255,255,0.05)" />
          {interactive && <rect className="qqib-hover" x={X + 1.5} y={Y + 1.5} width={CS - 3} height={CS - 3} rx={8} fill="rgba(88,196,221,0.08)" stroke="rgba(88,196,221,0.45)" opacity={0} style={{ transition: 'opacity .12s' }} />}
          {cell.type === 'wall' && (
            <g>
              <rect x={X + 4} y={Y + 4} width={CS - 8} height={CS - 8} rx={6} fill="#262c3b" stroke="#3a4256" />
              {[0, 1, 2, 3].map((i) => (
                <line key={i} x1={X + 8 + i * 14} y1={Y + CS - 8} x2={X + 8 + i * 14 + 12} y2={Y + 8} stroke="#3a4256" strokeWidth={2} />
              ))}
            </g>
          )}
        </g>,
      );
      // static objects drawn above beams
      if (cell.type === 'source') {
        overEls.push(
          <g key={`s${k}`} pointerEvents="none">
            <rect x={X + 6} y={Y + 16} width={CS - 18} height={CS - 32} rx={6} fill="#2b2f3d" stroke="#fc6255" strokeWidth={2} />
            <circle cx={X + CS - 12} cy={Y + CS / 2} r={6} fill="#fc6255" className="qqib-target" />
            <text x={X + 22} y={Y + CS / 2 + 4} textAnchor="middle" fontSize={11} fill="#fca5a0" fontWeight={700}>
              γ
            </text>
          </g>,
        );
      }
      if (cell.type === 'mirror') overEls.push(<PieceGlyph key={`m${k}`} p={{ kind: 'mirror', o: cell.o!, fixed: true }} cx={cx(x)} cy={cy(y)} />);
      if (cell.type === 'bomb') {
        const pb = res.bomb;
        overEls.push(
          <g key={`b${k}`} pointerEvents="none">
            <circle cx={cx(x)} cy={cy(y) + 3} r={17} fill="#151821" stroke={pb > 1e-3 ? '#fc6255' : '#555'} strokeWidth={2} />
            <path d={`M ${cx(x) + 9} ${cy(y) - 9} q 6 -8 12 -6`} stroke="#c49a6c" strokeWidth={2.5} fill="none" />
            <circle cx={cx(x) + 21} cy={cy(y) - 15} r={3} fill="#fcd34d" className="qqib-target" />
            <text x={cx(x)} y={cy(y) + 8} textAnchor="middle" fontSize={12} fill="#fc6255" fontWeight={700}>
              {(pb * 100).toFixed(0)}%
            </text>
          </g>,
        );
      }
      if (cell.type === 'detector') {
        const L = cell.label!;
        const P = res.det[L] ?? 0;
        const tgt = level.target[L];
        const ok = tgt !== undefined && Math.abs(P - tgt) < 0.005;
        const col = tgt === undefined ? '#9aa3b5' : ok ? '#83c167' : '#fcd34d';
        overEls.push(
          <g key={`d${k}`} pointerEvents="none">
            <circle cx={cx(x)} cy={cy(y)} r={24} fill="#11141c" stroke={col} strokeWidth={2.5} />
            <circle cx={cx(x)} cy={cy(y)} r={22 * Math.sqrt(P)} fill={col} fillOpacity={0.35} style={{ transition: 'r .3s' }} />
            <text x={cx(x)} y={cy(y) - 3} textAnchor="middle" fontSize={15} fontWeight={800} fill="#e9ecf2">
              {L}
            </text>
            <text x={cx(x)} y={cy(y) + 12} textAnchor="middle" fontSize={10} fill="#e9ecf2">
              {(P * 100).toFixed(P > 0.999 || P < 0.001 ? 0 : 1)}%
            </text>
            {flash && flash.label === L && <circle key={flash.n} className="qqib-ring" cx={cx(x)} cy={cy(y)} r={20} fill="none" stroke="#fff" strokeWidth={3} />}
          </g>,
        );
      }
      if (fp) overEls.push(<PieceGlyph key={`f${k}`} p={{ ...fp, fixed: true }} cx={cx(x)} cy={cy(y)} />);
      if (pp)
        overEls.push(
          <g key={`p${k}-${pp.kind}`} pointerEvents="none" className="qqib-place">
            <PieceGlyph p={pp} cx={cx(x)} cy={cy(y)} />
          </g>,
        );
    }

  const ghost =
    hover && tool !== 'erase' && canPlace(level, hover[0], hover[1]) && !playerAt.has(key(hover[0], hover[1])) ? (
      <g pointerEvents="none">
        <PieceGlyph p={{ kind: tool, o: tool === 'phase' ? 1 : 0 }} cx={cx(hover[0])} cy={cy(hover[1])} ghost />
      </g>
    ) : null;

  return (
    <svg viewBox={`0 0 ${vbW} ${vbH}`} style={{ width: '100%', maxHeight: 460, display: 'block', userSelect: 'none' }}>
      <defs>
        <radialGradient id="qqib-bg" cx="50%" cy="40%" r="75%">
          <stop offset="0%" stopColor="#151a26" />
          <stop offset="100%" stopColor="#0b0d12" />
        </radialGradient>
      </defs>
      <rect x={0} y={0} width={vbW} height={vbH} rx={14} fill="url(#qqib-bg)" stroke="var(--border)" />
      {cellEls}
      <g pointerEvents="none">{beams}</g>
      {overEls}
      {ghost}
      {boom > 0 && <rect key={boom} className="qqib-boom" x={0} y={0} width={vbW} height={vbH} rx={14} fill="#fc6255" pointerEvents="none" />}
    </svg>
  );
}

/* ---------------------------------- game ---------------------------------- */

function Stars({ n, size = 16 }: { n: number; size?: number }) {
  return (
    <span style={{ fontSize: size, letterSpacing: 1 }}>
      {[0, 1, 2].map((i) => (
        <span key={i} style={{ color: i < n ? 'var(--yellow)' : 'var(--border)' }}>
          ★
        </span>
      ))}
    </span>
  );
}

export default function InterferometerBuilder() {
  const g = useGame(GAME_ID);
  const [stars, setStars] = useState<Record<string, number>>(() => ({ ...((g.data.stars as Record<string, number>) ?? {}) }));
  const firstOpen = LEVELS.findIndex((l) => !stars[l.id]);
  const [li, setLi] = useState(firstOpen < 0 ? 0 : firstOpen);
  const level = LEVELS[li];
  const [pieces, setPieces] = useState<PlacedPiece[]>([]);
  const [tool, setTool] = useState<Tool>('mirror');
  const [overlay, setOverlay] = useState<null | { stars: number; improved: boolean }>(null);
  const [solvedSig, setSolvedSig] = useState<string | null>(null);
  const [showHint, setShowHint] = useState(false);
  const [dudView, setDudView] = useState(false);
  const [tally, setTally] = useState<Record<string, number>>({});
  const [flash, setFlash] = useState<{ label: string; n: number } | null>(null);
  const [boom, setBoom] = useState(0);
  const flashN = useRef(0);
  const timer = useRef<number | undefined>(undefined);

  const res = useMemo(() => checkLevel(level, pieces), [level, pieces]);
  const shown = dudView && res.dud ? res.dud : res.main;
  const sig = JSON.stringify(pieces);

  const goLevel = (i: number) => {
    setPieces([]);
    setLi(i);
  };

  // reset on level change
  useEffect(() => {
    window.clearTimeout(timer.current);
    setOverlay(null);
    setSolvedSig(null);
    setShowHint(false);
    setDudView(false);
    setTally({});
    const inv = Object.keys(level.inventory) as PieceKind[];
    setTool(inv[0] ?? 'mirror');
  }, [li]);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  // win detection
  useEffect(() => {
    if (!res.ok || solvedSig === sig) return;
    setSolvedSig(sig);
    const s = starsFor(level, pieces.length);
    const prev = stars[level.id] ?? 0;
    const next = { ...stars, [level.id]: Math.max(prev, s) };
    setStars(next);
    const total = Object.values(next).reduce((a, b) => a + b, 0);
    const solvedCount = LEVELS.filter((l) => next[l.id]).length;
    g.finish(total, solvedCount >= LEVELS.length - 2, { stars: next });
    if (LEVELS.every((l) => next[l.id] === 3)) g.unlock('u2-photon-router');
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setOverlay({ stars: s, improved: s > prev }), 900);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [res.ok, sig]);

  const used = (k: PieceKind) => pieces.filter((p) => p.kind === k).length;
  const left = (k: PieceKind) => (level.inventory[k] ?? 0) - used(k);

  const onCell = (x: number, y: number) => {
    const i = pieces.findIndex((p) => p.x === x && p.y === y);
    if (i >= 0) {
      if (tool === 'erase') setPieces(pieces.filter((_, j) => j !== i));
      else {
        const p = pieces[i];
        const o = p.kind === 'phase' ? (p.o % 3) + 1 : 1 - p.o;
        setPieces(pieces.map((q, j) => (j === i ? { ...q, o } : q)));
      }
      return;
    }
    if (tool === 'erase' || !canPlace(level, x, y) || left(tool) <= 0) return;
    setPieces([...pieces, { x, y, kind: tool, o: tool === 'phase' ? 1 : 0 }]);
  };
  const onRemove = (x: number, y: number) => setPieces(pieces.filter((p) => !(p.x === x && p.y === y)));

  const fire = (n: number) => {
    const r = shown;
    const outcomes: [string, number][] = [...Object.entries(r.det), ['bomb', r.bomb], ['lost', r.blocked + r.escaped]];
    const t = { ...tally };
    let last = '';
    for (let i = 0; i < n; i++) {
      let u = Math.random();
      let pick = 'lost';
      for (const [L, p] of outcomes) {
        if (u < p) {
          pick = L;
          break;
        }
        u -= p;
      }
      t[pick] = (t[pick] ?? 0) + 1;
      last = pick;
    }
    setTally(t);
    if (n === 1) {
      if (last === 'bomb') setBoom((b) => b + 1);
      else setFlash({ label: last, n: ++flashN.current });
    } else if (t.bomb && !tally.bomb) setBoom((b) => b + 1);
  };
  const tallyTotal = Object.values(tally).reduce((a, b) => a + b, 0);

  const labels = Object.keys(res.main.det).sort();
  const totalStars = Object.values(stars).reduce((a, b) => a + b, 0);
  const unlocked = (i: number) => i === 0 || !!stars[LEVELS[i - 1].id] || !!stars[LEVELS[i].id];
  const hasBomb = level.layout.some((r) => r.includes('*'));

  return (
    <div>
      <style>{CSS}</style>
      <HowToPlay defaultOpen={g.plays === 0}>
        <p style={{ marginTop: 0 }}>
          A laser on the left emits <b>one photon at a time</b>. Pick a piece from the tray and click an empty square to place it.
          <b> Click a placed piece to rotate it</b> (or change a phase shifter's value). <b>Right-click</b> or use ✕ to remove it.
        </p>
        <p>
          Each beam's <b>thickness</b> shows the size of the amplitude, and its <b>colour</b> shows the phase (see the wheel). Beam splitters
          transmit with amplitude <Tex>{'\\tfrac{1}{\\sqrt2}'}</Tex> and reflect with <Tex>{'\\tfrac{i}{\\sqrt2}'}</Tex>. Phase shifters multiply by{' '}
          <Tex>{'e^{i\\varphi}'}</Tex>. When several paths lead to the same detector, their amplitudes <b>add</b>, and the probability is{' '}
          <Tex>{'|\\text{sum}|^2'}</Tex>.
        </p>
        <p style={{ marginBottom: 0 }}>
          Hit every detector's target. Using no more pieces than <b>par</b> earns ★★★. Hover a beam to read its exact amplitude.
        </p>
      </HowToPlay>

      {/* level select */}
      <div className="row" style={{ gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
        {LEVELS.map((l, i) => (
          <button
            key={l.id}
            className={`btn small ${i === li ? 'active' : 'ghost'}`}
            disabled={!unlocked(i)}
            onClick={() => goLevel(i)}
            title={l.title}
            style={{ minWidth: 58, flexDirection: 'column', gap: 0, lineHeight: 1.1 }}
          >
            <span>{unlocked(i) ? i + 1 : '🔒'}</span>
            <Stars n={stars[l.id] ?? 0} size={10} />
          </button>
        ))}
        <span className="faint" style={{ marginLeft: 'auto', fontSize: '0.9rem' }}>
          ★ {totalStars} / {LEVELS.length * 3}
        </span>
      </div>

      <div className="panel" style={{ marginBottom: 12, padding: '12px 16px' }}>
        <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
          <h3 style={{ margin: 0 }}>
            <span className="faint">Level {li + 1} ·</span> {level.title}
          </h3>
          <span className="dim" style={{ fontSize: '0.9rem' }}>
            pieces used <b style={{ color: pieces.length <= level.par ? 'var(--green)' : 'var(--yellow)' }}>{pieces.length}</b> · par {level.par} ·{' '}
            <Stars n={starsFor(level, pieces.length)} size={13} />
          </span>
        </div>
        <div style={{ marginTop: 6 }}>
          <RichText text={level.brief} />
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 250px', gap: 14, alignItems: 'start' }}>
        <div>
          <Board level={level} pieces={pieces} res={shown} tool={tool} onCell={onCell} onRemove={onRemove} flash={flash} boom={boom} />
          {/* tray */}
          <div className="row" style={{ gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
            {(Object.keys(level.inventory) as PieceKind[]).map((k) => (
              <button
                key={k}
                className={`btn small ${tool === k ? 'active' : ''}`}
                onClick={() => setTool(k)}
                title={KIND_NAME[k]}
                style={{ display: 'flex', alignItems: 'center', gap: 6, opacity: left(k) > 0 || tool === k ? 1 : 0.5 }}
              >
                <ToolIcon tool={k} />
                <span>
                  {KIND_NAME[k]} <b>×{left(k)}</b>
                </span>
              </button>
            ))}
            <button className={`btn small ${tool === 'erase' ? 'active' : ''}`} onClick={() => setTool('erase')} title="Remove pieces" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <ToolIcon tool="erase" /> Remove
            </button>
            <button className="btn small ghost" onClick={() => setPieces([])} disabled={!pieces.length}>
              Clear
            </button>
            {level.hint && (
              <button className="btn small ghost" onClick={() => setShowHint((h) => !h)}>
                💡 Hint
              </button>
            )}
          </div>
          {showHint && level.hint && (
            <div className="pop" style={{ marginTop: 8, color: 'var(--yellow)' }}>
              💡 <RichText text={level.hint} />
            </div>
          )}
        </div>

        {/* side panel */}
        <div className="col" style={{ gap: 10 }}>
          <div className="panel" style={{ padding: 12 }}>
            <div className="faint" style={{ fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>
              {dudView ? 'Detectors (if the bomb were a dud)' : 'Detectors'}
            </div>
            {labels.map((L) => {
              const P = shown.det[L];
              const tgt = dudView ? level.dudCheck?.[L] : level.target[L];
              const ok = tgt !== undefined && Math.abs(P - tgt) < 0.005;
              const amps = shown.detAmps[L].filter((z: C) => abs(z) > 1e-3);
              return (
                <div key={L} style={{ marginBottom: 8 }}>
                  <div className="row" style={{ justifyContent: 'space-between', fontSize: '0.9rem' }}>
                    <span className="row" style={{ gap: 6 }}>
                      <b>{L}</b>
                      {amps.map((z, i) => (
                        <PhasorClock key={i} z={z} size={22} />
                      ))}
                    </span>
                    <span>
                      <b>{(P * 100).toFixed(1)}%</b>
                      {tgt !== undefined && (
                        <span style={{ color: ok ? 'var(--green)' : 'var(--text-faint)', marginLeft: 6 }}>
                          {ok ? '✓' : '→'} {(tgt * 100).toFixed(0)}%
                        </span>
                      )}
                    </span>
                  </div>
                  <ProgressBar value={P} color={tgt === undefined ? 'var(--text-faint)' : ok ? 'var(--green)' : 'var(--yellow)'} height={7} />
                </div>
              );
            })}
            {hasBomb && !dudView && (
              <div className="row" style={{ justifyContent: 'space-between', fontSize: '0.85rem', color: 'var(--red)' }}>
                <span>💥 Bomb</span>
                <b>{(shown.bomb * 100).toFixed(1)}%</b>
              </div>
            )}
            <div className="row faint" style={{ justifyContent: 'space-between', fontSize: '0.85rem' }}>
              <span>Lost (walls / off-board)</span>
              <span>{((shown.blocked + shown.escaped) * 100).toFixed(1)}%</span>
            </div>
            {level.dudCheck && (
              <div style={{ marginTop: 10 }}>
                <button className={`btn small ${dudView ? 'active' : 'ghost'}`} onClick={() => setDudView((d) => !d)} style={{ width: '100%' }}>
                  {dudView ? '← Back to live bomb' : 'Show the dud-bomb world'}
                </button>
                {res.dud && (
                  <div style={{ fontSize: '0.82rem', marginTop: 6 }} className="dim">
                    Dud check:{' '}
                    {Object.entries(level.dudCheck).map(([L, t]) => {
                      const ok = Math.abs((res.dud!.det[L] ?? 0) - t) < 0.005;
                      return (
                        <span key={L} style={{ color: ok ? 'var(--green)' : 'var(--red)' }}>
                          {L} = {((res.dud!.det[L] ?? 0) * 100).toFixed(1)}% (need {(t * 100).toFixed(0)}%) {ok ? '✓' : '✗'}
                        </span>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="panel" style={{ padding: 12 }}>
            <div className="faint" style={{ fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>
              Fire single photons
            </div>
            <div className="row" style={{ gap: 6 }}>
              <button className="btn small primary" onClick={() => fire(1)}>
                Fire 1
              </button>
              <button className="btn small" onClick={() => fire(100)}>
                Fire 100
              </button>
              <button className="btn small ghost" onClick={() => setTally({})} disabled={!tallyTotal}>
                Reset
              </button>
            </div>
            {tallyTotal > 0 && (
              <div className="mono" style={{ fontSize: '0.82rem', marginTop: 8 }}>
                {[...labels, 'bomb', 'lost']
                  .filter((L) => tally[L])
                  .map((L) => (
                    <div key={L} className="row" style={{ justifyContent: 'space-between' }}>
                      <span style={{ color: L === 'bomb' ? 'var(--red)' : undefined }}>{L === 'bomb' ? '💥 bomb' : L}</span>
                      <span>
                        {tally[L]} <span className="faint">({((tally[L] / tallyTotal) * 100).toFixed(0)}%)</span>
                      </span>
                    </div>
                  ))}
                <div className="faint" style={{ marginTop: 4 }}>
                  {tallyTotal} photons. Each one lands in exactly one place.
                </div>
              </div>
            )}
          </div>
          <div className="row" style={{ justifyContent: 'center' }}>
            <PhaseLegend size={46} />
          </div>
        </div>
      </div>

      {overlay && (
        <GameOverlay title={<>Level {li + 1} solved!</>} tone="win">
          <div style={{ fontSize: 34, margin: '4px 0 8px' }}>
            <Stars n={overlay.stars} size={34} />
          </div>
          <div style={{ marginBottom: 6, fontSize: '0.9rem' }}>
            {pieces.length} piece{pieces.length === 1 ? '' : 's'} (par {level.par})
            {overlay.stars < 3 && ' · try again with fewer pieces for ★★★'}
          </div>
          <div style={{ textAlign: 'left', fontSize: '0.95rem', lineHeight: 1.5, color: 'var(--text)' }}>
            <RichText text={level.explain} />
          </div>
          <div className="row" style={{ justifyContent: 'center', gap: 10, marginTop: 16 }}>
            <button className="btn ghost" onClick={() => setOverlay(null)}>
              Keep tinkering
            </button>
            {li < LEVELS.length - 1 ? (
              <button className="btn primary" onClick={() => goLevel(li + 1)}>
                Next level →
              </button>
            ) : (
              <button className="btn gold" onClick={() => setOverlay(null)}>
                🏆 All levels done
              </button>
            )}
          </div>
        </GameOverlay>
      )}
    </div>
  );
}
