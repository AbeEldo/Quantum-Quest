# Quantum Quest

An interactive, game-like course that builds quantum computing up from the first principles of quantum mechanics.

It's written for someone with a computer science background, calculus (through multivariable), linear algebra and basic probability, but **no modern physics**. You start with complex numbers and the experiments that broke classical physics. You finish by running Shor's algorithm, decoding a surface code, and understanding where real quantum hardware stands today.

Everything runs in your browser, offline, from a single HTML file.

## How to run it

**You don't need to install anything.** The whole app is the single file `QuantumQuest.html`.

1. Get the file:
   - **Download just the app:** open `QuantumQuest.html` in this repository and click the **Download raw file** button.
   - **Or clone the whole repo:** `git clone <this repo's URL>`.
2. Open it:
   - **Windows:** double-click `Open Quantum Quest.bat`, or double-click `QuantumQuest.html`.
   - **Mac / Linux:** open `QuantumQuest.html` in your browser.

It works best in a recent Chrome, Edge or Firefox.

If your browser won't run the file directly (some lock down local files), use `Open Quantum Quest (local server).bat`. It serves the same file at `http://localhost:8765` and needs Python installed. On Mac or Linux, the equivalent is `python3 -m http.server 8765` in the folder, then open `http://localhost:8765/QuantumQuest.html`.

### Your progress

Progress is saved automatically in your browser's local storage: XP, finished lessons, flashcards and achievements. It stays on your computer and is tied to that browser.

- **Profile → Export progress** saves a backup file.
- **Import** restores a backup, or moves your progress to another browser.

## What you can do

- **Lessons.** Each lesson reveals one step at a time: click **Continue** or press **Enter**. Along the way you'll find:
  - interactive simulations;
  - "predict, then reveal" experiments, where you commit to a guess before seeing the result;
  - checkpoint quizzes, which you must pass to move on.
- **Interactive visuals.** Examples include:
  - a 3D Bloch sphere where gates animate as rotations;
  - a real-time Schrödinger equation simulator, where you can draw your own potentials;
  - a ripple tank and a photoelectric-effect lab;
  - Grover's algorithm shown as a rotation;
  - the quantum Fourier transform drawn as clocks;
  - a noisy-circuit lab.
- **Games.** 22 games, at least one per world: CHSH Tournament, Bomb Tester, BB84 Spy vs Spy, Teleport Relay, Grover Timing, Shor Walkthrough, Surface Code Decoder and more.
- **Boss battles.** Each world ends with a boss: a harder mixed quiz with HP and hearts. Beating a boss also unlocks the next world, so experienced learners can skip ahead.
- **Circuit Lab.** A sandbox quantum computer with up to 6 qubits. You get every standard gate, step-by-step playback, measurement histograms and text import/export.
- **Circuit Puzzles.** 41 star-rated challenges where you prepare a target state or build a target operation using as few gates as possible.
- **Review.** Flashcards from each lesson you finish join a spaced-repetition deck. It shows you each card again just before you'd forget it.
- **Progression.** You earn XP and climb 10 ranks, with streaks, achievements and a daily challenge.
- **Surprise journal.** It records predictions you made that the experiment proved wrong.
- **Library and Glossary.** The Library lists the textbooks, videos and papers each lesson draws on, and the Glossary lets you search the course's terms.

Worlds 0 and 1 are open from the start. Each later world unlocks when you finish the previous one, or when you beat its boss. To open everything at once, turn on **Profile → Settings → Free roam**.

## Curriculum

The course has 13 worlds and 69 lessons.

| World | Topic | Lessons |
|---|---|---|
| **0 · Math Toolkit** | The language of quantum mechanics | Complex numbers as rotations · Phasors and interference · Vectors in ℂⁿ and Dirac notation · Linear operators · Tensor products · Fourier intuition |
| **1 · When Classical Physics Broke** | The birth of the quantum | Waves · The ultraviolet catastrophe · The photoelectric effect · Atomic spectra and the Bohr model · Matter waves |
| **2 · Wave–Particle Duality** | Interference and measurement | The double-slit experiment · Which-path information · Polarization · The Mach–Zehnder interferometer · Interaction-free measurement (the bomb tester) |
| **3 · Spin and the Qubit** | The simplest quantum system | The Stern–Gerlach experiment · Sequential Stern–Gerlach devices · States as vectors and the Born rule · The Bloch sphere · Global vs relative phase |
| **4 · The Rules of the Game** | The postulates | Observables as Hermitian operators · Measurement, collapse and expectation values · Commutators and uncertainty · Time evolution · Spin precession and Rabi oscillations |
| **5 · Wavefunctions in Space** | Continuous systems | The wavefunction ψ(x) · Free particles and wave packets · Particle in a box · Harmonic oscillator and superconducting qubits · Quantum tunnelling · Position, momentum and Fourier duality |
| **6 · Entanglement** | Composite systems and Bell's theorem | Two qubits · Entanglement and the Bell states · Measuring part of a system · The no-cloning theorem · EPR, hidden variables and Bell's theorem · The CHSH game · Testing nature (loophole-free Bell tests) |
| **7 · Quantum Circuits** | Gates and universality | Single-qubit gates in depth · Multi-qubit gates · Circuit identities · Phase kickback · Universality · Classical computing inside quantum circuits |
| **8 · Quantum Protocols** | Communication and cryptography | Superdense coding · Quantum teleportation · Quantum key distribution (BB84) · Entanglement-based QKD and quantum networks |
| **9 · Quantum Algorithms** | Deutsch–Jozsa to Grover to Shor | Oracles and query complexity · Deutsch–Jozsa and Bernstein–Vazirani · Simon's algorithm · Grover's search · The quantum Fourier transform · Phase estimation · Shor's algorithm · What quantum computers can't (yet) do · Near-term variational algorithms (VQE, QAOA) |
| **10 · Noise and Decoherence** | Why qubits are fragile | Density matrices · Decoherence: T₁, T₂ and the spin echo · Quantum channels and gate errors · Why measurement looks like collapse |
| **11 · Error Correction and Real Hardware** | Making quantum computing work | Why quantum error correction seems impossible · Bit-flip and phase-flip codes · Shor's 9-qubit code and stabilizers · The surface code and the threshold theorem · Hardware platforms · The state of the field (late 2026) |
| **12 · Capstone** | Put it all together | Where to go next, plus the final boss |

## Credits and sources

The visual style takes inspiration from 3Blue1Brown (phase as colour, amplitudes as arrows, geometric pictures). The teaching style takes inspiration from Veritasium (experiment first, predict then reveal). Every visual in the app is original.

The content draws on:
- **Textbooks:** Nielsen & Chuang, Griffiths, Susskind & Friedman, Mermin, Aaronson.
- **Course materials:** the Feynman Lectures, Preskill's lecture notes, Quantum Country and MIT OpenCourseWare.
- **Original papers:** each lesson cites its sources in a "Go deeper" section, and the in-app Library collects them all.

## Building from source

You only need this to change the app. The source lives in `app/`. It's built with Vite, React, TypeScript and MDX, and the lessons are `.mdx` files in `app/src/units/`.

You need [Node.js](https://nodejs.org/) 22 or newer. From the `app` folder:

```
npm install        # first time only
npm run dev        # live-reload dev server at http://localhost:5173
npm test           # unit tests for the physics engines and game logic
npm run release    # typecheck, build, and write ../QuantumQuest.html
```

On Windows, `Dev Server.bat` installs dependencies and starts the dev server for you.

`app/AUTHORING.md` explains how lessons, widgets and games are written.
