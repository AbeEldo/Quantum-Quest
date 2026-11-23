# Quantum Quest — Authoring Guide (read fully before writing anything)

Quantum Quest is a local, game-like course that teaches quantum mechanics → quantum computing from first principles.
Stack: Vite + React 19 + TypeScript + MDX (lessons) + KaTeX + three.js. Everything runs offline in the browser.

**Learner profile:** BS in Computer Science. Math: calculus through multivariable (Calc 3), linear algebra, probability & statistics.
Physics: only intro mechanics and intro E&M. Never assume modern physics. Do assume they're smart, comfortable with code, matrices, and probability.

**Tone & pedagogy (very important):**
- Experiment/paradox first (Veritasium-style hook) → learner *predicts* (`<Predict>`) → interactive exploration → explanation *visual first, then math* (3Blue1Brown-style) → checkpoints.
- Conversational, vivid, precise. Short paragraphs. Bold the key terms. Use concrete numbers.
- Derive things rather than assert them where feasible; put heavy derivations in `<DeepDive>`.
- Use `<CSCorner>` for honest CS analogies (and say where analogies break). Use `<Warning>` for misconceptions (e.g. "measurement = disturbance by a clumsy probe", "entanglement allows FTL signalling", "QCs try all answers in parallel").
- Use `<History>` for the human story (who, when, what they saw) — briefly.
- Every lesson: **5–8 steps**, **≥1 interactive widget**, **≥2 checkpoints** (Quiz/NumQuiz/Predict/challenge), ending with a "Summary" step. ~1500–3000 words.
- Facts must be correct. Cross-check numbers, dates and claims (use web search when unsure). Cite 2–4 sources per lesson in `sources` (real URLs only if you are confident they exist — e.g. Wikipedia, arXiv abstracts, quantum.country, MIT OCW, YouTube channel URLs like `https://www.youtube.com/@3blue1brown`; otherwise omit `url` and give book/section).

---

## Where files go

```
src/units/uN/index.ts            ← unit definition (lessons, games, boss, achievements, flashcards). YOU OWN THIS.
src/units/uN/lK-slug.mdx         ← lesson K content
src/units/uN/widgets/*.tsx       ← unit-specific interactive widgets
src/units/uN/games/*.tsx         ← games (default export a React component)
src/units/uN/*.test.ts           ← optional vitest tests for any engine code you write
```
**Only create/edit files inside your assigned unit folder(s).** Do not edit shared files (`src/components`, `src/widgets`, `src/engine`, `src/pages`, `src/content`, configs). If you need a shared change, build a local version inside your unit folder, and mention the request in your final report.

Lesson ids: `uN-lK` (e.g. `u6-l3`). Checkpoint ids must be **globally unique**: prefix with the lesson, e.g. `u6l3-chsh-limit`. Flashcard ids e.g. `u6l3-c-bell`.

## Unit definition (`index.ts`)

```ts
import type { UnitDef } from '../../content/types';
export const unit: UnitDef = {
  id: 'u6', number: 6, title: 'Entanglement', tagline: '…', color: '#e07ab6', icon: '🔗',   // keep the existing id/number/title/color/icon
  lessons: [
    { id: 'u6-l1', title: 'Two Qubits', subtitle: '…', minutes: 20, xp: 100,
      load: () => import('./l1-two-qubits.mdx'),
      cards: [{ id: 'u6l1-c-tensor', front: 'Question with $math$', back: 'Answer with **bold** and $math$' }],
      sources: [{ title: '…', by: 'Nielsen & Chuang', kind: 'book', note: '§2.2.8' }, { title: '…', by: '3Blue1Brown', url: 'https://…', kind: 'video' }] },
  ],
  games: [
    { id: 'chsh-tournament', title: 'CHSH Tournament', description: 'one line', icon: '🎲', unlockAfter: 'u6-l6', xp: 200,
      load: () => import('./games/ChshTournament') },
  ],
  boss: { id: 'u6-boss', name: 'The Local Realist', taunt: '…', avatar: '🎩', hp: 6, hearts: 3, xp: 300, questions: [ /* 9–12 */ ] },
  achievements: [{ id: 'spooky-action', title: 'Spooky Action', description: 'Beat 80% in the CHSH game', icon: '👻', xp: 50 }],
};
```
Strings in TS data (cards, boss questions, achievements) support `$inline$`, `$$display$$`, `**bold**`, `*italic*`, `` `code` ``. In TS string literals backslashes must be doubled: `'$\\frac{1}{\\sqrt2}$'`.

Boss question types (`src/content/types.ts`):
```ts
{ type: 'mc', prompt, options: string[], answer: number /*index*/, explain }
{ type: 'numeric', prompt, answer: number, tolerance: number, unit?, explain }
{ type: 'circuit', prompt, n, target: [re, im][] /* 2^n amplitudes */, gates: string[] /* e.g. ['H','CNOT'] */, maxGates?, explain }
```
Boss questions should be *harder* than lesson quizzes, mixing concepts. hp ≈ 6, hearts 3, 9–12 questions (shuffled; boss is defeated when hp correct answers given before hearts run out).

## Lesson MDX

- The lesson title comes from `index.ts` — **do not** put an `# H1` at the top. Use `##` for section headings.
- `---` on its own line splits the lesson into **steps** revealed one at a time. "Continue" is blocked until all checkpoints/challenges in the current step are done. So put a checkpoint near the end of most steps.
- Math: `$…$` inline, `$$…$$` display (on their own lines). Braces inside math are fine.
- **MDX gotchas:** outside math, `{` and `}` start JS expressions and `<` starts JSX. Write `\{`, `\}`, `&lt;` in prose, or put it in math. Don't indent markdown by 4+ spaces. Markdown tables: inside math in a table cell, write `\lvert` / `\rvert` instead of `|`. JSX attribute string values (`title="…"`) are literal (no escapes needed; `\rangle` works); inside `{…}` JS expressions, backslashes must be doubled.
- Unit widgets: `import { MyWidget } from './widgets/MyWidget';` at the top of the .mdx file.
- Verify syntax with: `node scripts/check-mdx.mjs src/units/uN` (also catches duplicate checkpoint ids).

### Global components (no import needed)

**Checkpoints**
```mdx
<Quiz id="u3l4-where">
  <Q>Question text with $math$?</Q>
  <Opt>Wrong option</Opt>
  <Opt correct>Right option</Opt>               {/* several `correct` ⇒ "select all that apply" */}
  <Opt why="optional targeted feedback when this wrong option is picked">Another wrong</Opt>
  <Hint>optional hint (shown after a wrong try)</Hint>
  <Explain>Shown once answered (or revealed after 2 wrong tries).</Explain>
</Quiz>

<NumQuiz id="u3l4-prob" answer={0.5} tol={0.01}>
  <Q>…</Q><Hint>…</Hint><Explain>…</Explain>
</NumQuiz>
{/* learner may type 0.5, 1/2, 50%, sqrt(2)/2, pi/4, 2^-3 … */}

<Predict id="u2l1-electrons">
  <Q>What will the screen show?</Q>
  <Opt>Two bands</Opt>
  <Opt correct>Interference fringes</Opt>       {/* omit `correct` everywhere for an opinion poll */}
  <Explain>(optional) text shown right after choosing</Explain>
  <Reveal>
  Content (widget/experiment/explanation) shown only after the learner commits.
  </Reveal>
</Predict>
```
Keep each `<Opt>`, `<Q>` on its own line (inline markdown/math works inside).

**Callouts:** `<KeyIdea>`, `<Note title="…">`, `<Warning>`, `<History>`, `<CSCorner>`, `<Try>`, `<Definition term="…">`, `<DeepDive title="…">` (collapsible), `<Watch title="…" by="3Blue1Brown" url="https://…" note="…" kind="video" />` (external link card), `<Columns ratio="1fr 1fr">`.

**Shared widgets** (see source in `src/widgets/` for all props):
- `<BlochSphere vector={[x,y,z]} vectors={[{v:[..], color:'#e07ab6', label:'target'}]} onDrag={(v)=>…} axis={[x,y,z]} trail points={[{v:[..]}]} target={[x,y,z]} ball height={320} />` — 3D, drag to orbit.
- `<BlochPlayground title="…" gates={['X','Y','Z','H','S','T','Sdg','Tdg','SX']} rotations draggable initial={[theta,phi]} target={[theta,phi]} challengeId="u3l4-c1" par={3} />` — gate buttons animate rotations; with `target`+`challengeId` it's a gated challenge.
- `<CircuitLab n={2} circuit="H 0; CNOT 0 1" gates={['H','X','CNOT','M']} editable showAmplitudes showBloch showHistogram stepper maxQubits={4} goal={{kind:'state', amps:[...C]}} challengeId="…" maxGates={4} initialState={[[re,im],…]} qubitLabels={['Alice','Bob']} title="…" />`
  - circuit text: columns separated by `;`, ops in a column by `,`: `H 0`, `CNOT 0 1` (control 0 → target 1), `CZ 0 1`, `CP(pi/4) 1 0`, `SWAP 0 1`, `CCX 0 1 2`, `Rx(pi/2) 0`, `M 0 1`, `H 0 1 2` (H on each).
  - For goals in MDX you can build amplitude arrays with `import { c } from '../../engine/complex'` → `goal={{kind:'state', amps:[c(Math.SQRT1_2), c(0), c(0), c(Math.SQRT1_2)]}}`.
  - Convention: **q0 is the top wire and the LEFT-most bit of a ket** (Nielsen & Chuang). |q0 q1⟩.
  - gate names: `I X Y Z H S Sdg T Tdg SX Rx Ry Rz P CNOT CZ SWAP CCX CP M`.
- `<AmplitudeView amps={C[]} n={2} mode="both|bars|clocks" hideZero highlight={[3]} compact />` — phasor "clocks" + probability bars, colour = phase.
- `<PhasorClock z={c(0.6,0.3)} size={34} />`, `<PhaseLegend />`, `<MiniBloch v={[x,y,z]} size={70} label="q0" />`.
- `<Plot series={[{f:(x)=>Math.sin(x), color:'#58c4dd', label:'sin', fill, dashed}]} xRange={[0,10]} yRange={[-1,1]} xLabel="x" yLabel="y" vlines={[{x:2,label:'a'}]} height={260} />`
- `<ParamPlot title="…" params={[{name:'k', label:'k', min:0, max:5, value:1, pi?:true}]} series={(p)=>[{f:(x)=>Math.sin(p.k*x)}]} xRange={[..]} yRange={[..]} readout={(p)=><span>…</span>} />` — fastest way to make an explorable formula.
- Primitives: `<Tex>{'\\frac{a}{b}'}</Tex>`, `<RichText text="…$x$…"/>`, `<Slider label value min max step onChange format/>`, `<Toggle/>`, `<Widget title="…">…</Widget>` (standard frame).

## Writing widgets & games (TSX)

Import paths from `src/units/uN/widgets/X.tsx`:
```ts
import { Widget, Slider, Toggle, Segmented, Stat, ProgressBar, Tex, RichText, useCanvas, useAnimationFrame, fmtPi, shuffle } from '../../../components/ui';
import { c, add, mul, scale, conj, abs, abs2, arg, expi, phaseColor, phaseRGB, fmt, matMul, kron, dagger, type C, type Mat } from '../../../engine/complex';
import { StateVector, DensityMatrix, GATES, Rx, Ry, Rz, Rn, Phase, U3, Noise, mulberry32, ampsToBloch, blochToAmps, blochFromRho, type Mat2 } from '../../../engine/qsim';
import { runCircuit, circuitUnitary, unitaryOverlap, runNoisy, stateToKetString, type Circuit, type Op } from '../../../engine/circuit';
import { parseCircuit } from '../../../engine/parse';
import { Wave1D, boundStates, rectBarrierTransmission, box, oscillator, fft } from '../../../engine/wave1d';
import { BlochSphere, vecFromAngles, anglesFromVec, rotateVec, GATE_ROTATIONS, type Vec3 } from '../../../widgets/BlochSphere';
import { CircuitLab } from '../../../widgets/CircuitLab';
import { AmplitudeView, PhasorClock, PhaseLegend } from '../../../widgets/AmplitudeView';
import { MiniBloch } from '../../../widgets/MiniBloch';
import { Plot } from '../../../widgets/Plot';
import { useChallengeGate } from '../../../components/lesson/gates';   // useChallengeGate(id, solved) gates "Continue" inside lessons
import { useProgress } from '../../../state/progress';                 // e.g. useProgress(s=>s.recordQuiz)(id, true, 20) to award XP once
import { useGame, GameOverlay, HowToPlay } from '../../../components/game';
```
**Engine cheat-sheet**
- `new StateVector(n)`; `.h(q) .x(q) .cx(c,t) .cz .ccx .apply(mat2, target, controls?) .applyMatrix(U, targets) .applyPermutation(f, targets) .swap(a,b)`; `.probabilities() .prob1(q) .measure(q, rng) .collapse(q, bit) .measureAll(rng) .sample(shots, rng) .bloch(q) .entropy1(q) .fidelity(other) .amplitudes() .clone() .canonicalPhase()`; `StateVector.fromAmplitudes(C[])`, `StateVector.fromBloch([[θ,φ],…])`.
- `DensityMatrix.fromState(sv)`; `.apply(mat2,t,controls) .channel(Noise.depolarizing(p)|bitFlip|phaseFlip|amplitudeDamping(γ)|phaseDamping(λ), q) .bloch(q) .purity() .fidelityPure(sv) .probabilities() .measure(q,rng)`.
- `runCircuit(circuit, {upTo, measure:'collapse'|'skip', rng, initial})` → `{state, measurements}`; `parseCircuit("H 0; CNOT 0 1")`.
- `Wave1D({N, xmin, xmax, dt, absorb})`: `.setPotential(fn) .setGaussian(x0, sigma, k0) .step(n) .density() .re/.im/.x/.V .probIn(a,b) .expectX() .uncertainties() .momentumDensity() .energy()`; units ħ = m = 1. `boundStates(V, dx, count)` → `{E, psi}` (hard walls). `rectBarrierTransmission(E, V0, a)`.
- Seeded randomness: `mulberry32(seed)`.

**Visual style:** dark background, 3B1B palette via CSS variables: `var(--blue) #58c4dd`, `var(--yellow) #fcd34d`, `var(--teal)`, `var(--green) #83c167`, `var(--red) #fc6255`, `var(--pink) #e07ab6`, `var(--purple)`, `var(--gold)`, `var(--brown)`, text `var(--text) / var(--text-dim) / var(--text-faint)`, panels `var(--panel) / var(--panel-2)`, `var(--border)`. **Phase is always shown as colour via `phaseColor(theta)`** and amplitudes as arrows. Prefer SVG for diagrams and `<canvas>` (via `useCanvas` / `useAnimationFrame`) for simulations. Smooth eased animation. Class names available: `btn`, `btn primary|gold|danger|ghost|small|active`, `panel`, `pill good|bad|warn`, `row`, `col`, `dim`, `faint`, `mono`, `center`. Wrap lesson widgets in `<Widget title="…">`.
Widgets must be responsive to container width (~850px in lessons) and must clean up animation frames/listeners on unmount.

**Games** (default export a component, no props). Use `const g = useGame('<game-id>')`; call `g.finish(score, beaten, data?)` at the end of a round (first time `beaten` is true awards the game's XP); `g.unlock('<achievement-id>')` for unit achievements (define them in index.ts). Use `<HowToPlay>` at the top, levels/rounds, a score, a clear win condition, juicy feedback (animations, colour flashes), and an explanation of the physics after each round. Original designs only (no copies of existing commercial games). The game page renders your component inside a `position:relative` container, so `<GameOverlay>` (absolute) works.

## Checks before you finish
1. `npx tsc --noEmit 2>&1 | grep "src/units/uN"` → no errors in your folders (ignore others; other people are working in parallel).
2. `node scripts/check-mdx.mjs src/units/uN` → all OK.
3. If you wrote engine code, add `*.test.ts` in your unit folder and run `npx vitest run src/units/uN`.
4. Do **not** start the dev server (one is already running on port 5173) and do not run `npm install` (ask in your report if you need a package).
Node is at `../tools/node` — in Git Bash run `source "/c/Users/abrah/Documents/Quantum Mechanics/tools/env.sh"` first (sets PATH and cd's into `app/`).

Final report: list lessons/games/bosses created, anything unfinished, and any shared-code change requests. Keep it brief.
