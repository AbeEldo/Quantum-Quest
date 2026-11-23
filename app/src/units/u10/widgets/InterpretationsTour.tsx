import React, { useState } from 'react';
import { Widget, Segmented } from '../../../components/ui';

type Key = 'cph' | 'mwi' | 'bohm' | 'grw' | 'qbism';
type QKey = 'state' | 'collapse' | 'determinism' | 'extra' | 'predictions' | 'decoherence' | 'critique';

const INTERPS: Record<Key, { name: string; icon: string; color: string; who: string; gist: string }> = {
  cph: {
    name: 'Copenhagen',
    icon: '🏛',
    color: '#58c4dd',
    who: 'Bohr, Heisenberg, Born (1920s). Really a family of views rather than one doctrine.',
    gist: 'Quantum theory is a tool for predicting the outcomes of experiments, which must be described in classical terms. The wavefunction encodes what we can say about a system, and "collapse" is the rule for updating it when a measurement gives a result.',
  },
  mwi: {
    name: 'Many-Worlds (Everett)',
    icon: '🌳',
    color: '#83c167',
    who: 'Hugh Everett III (1957, "relative-state" formulation); popularised by Bryce DeWitt in the 1970s; developed by Deutsch, Wallace, Saunders and others.',
    gist: 'The universal wavefunction is all there is, and it always evolves by the Schrödinger equation. Nothing collapses. A measurement entangles observer and system, and decoherence splits the wavefunction into non-interfering branches, each containing an observer who sees one definite outcome.',
  },
  bohm: {
    name: 'Bohmian mechanics (pilot wave)',
    icon: '🧭',
    color: '#fcd34d',
    who: 'Louis de Broglie (1927); David Bohm (1952); championed by John Bell.',
    gist: 'Particles always have definite positions. The wavefunction is a real field that guides them along deterministic trajectories. Apparent randomness comes from not knowing the initial positions, which are distributed as |ψ|². Collapse is effective: once branches separate, only the one containing the particles matters.',
  },
  grw: {
    name: 'Objective collapse',
    icon: '💥',
    color: '#fc6255',
    who: 'Ghirardi, Rimini & Weber (GRW, 1986); Pearle (CSL); Diósi and Penrose (gravity-related collapse).',
    gist: 'The Schrödinger equation is not exactly right. Wavefunctions spontaneously and randomly localise, very rarely for one particle (in GRW about once per 10¹⁶ s) but almost instantly for anything macroscopic, because a trillion trillion particles amplify the effect. Collapse is a real physical process.',
  },
  qbism: {
    name: 'QBism',
    icon: '🎲',
    color: '#e07ab6',
    who: 'Christopher Fuchs, Rüdiger Schack, Carlton Caves (2000s); related to other "epistemic" views.',
    gist: 'A quantum state is an agent\'s personal degrees of belief about the consequences of their actions on the world, in the subjective Bayesian sense. The Born rule is a consistency requirement on those beliefs. Collapse is just the agent updating on new experience.',
  },
};

const QUESTIONS: Record<QKey, string> = {
  state: 'Is the wavefunction a real physical thing?',
  collapse: 'Does collapse physically happen?',
  determinism: 'Is nature fundamentally random?',
  extra: 'What does it add to (or change in) the bare formalism?',
  predictions: 'Does it predict anything different from standard QM?',
  decoherence: 'What role does decoherence play?',
  critique: 'Main criticisms',
};

const ANSWERS: Record<Key, Record<QKey, string>> = {
  cph: {
    state: 'Usually no. It is a tool for predictions (opinions within the family vary).',
    collapse: 'It is a rule of the theory. Whether it is "physical" is often treated as a question physics need not answer.',
    determinism: 'Yes. Individual outcomes are irreducibly random.',
    extra: 'A division between the quantum system and a classically described measuring apparatus.',
    predictions: 'No. It is the default textbook practice.',
    decoherence: 'Explains why the classical/quantum cut can be placed almost anywhere without changing predictions.',
    critique: 'Vague about where the "cut" lies and what counts as a measurement. Critics say it postpones the measurement problem rather than solving it.',
  },
  mwi: {
    state: 'Yes. The universal wavefunction is the whole of reality.',
    collapse: 'No. There is only unitary evolution.',
    determinism: 'No. Evolution is deterministic. Randomness is the subjective experience of not knowing which branch "you" are in.',
    extra: 'Nothing. It takes the Schrödinger equation literally, everywhere.',
    predictions: 'No.',
    decoherence: 'Central: decoherence defines the branches and explains why they don\'t interfere.',
    critique: 'Deriving the Born rule (why |amplitude|² is a probability when every outcome occurs) is contested. Many find the proliferation of worlds extravagant.',
  },
  bohm: {
    state: 'Yes, as a guiding field, together with real particle positions.',
    collapse: 'No fundamental collapse. Empty branches just stop affecting the particles.',
    determinism: 'No. It is deterministic. Randomness reflects ignorance of initial positions.',
    extra: 'Particle positions (hidden variables) plus a guidance equation.',
    predictions: 'No, for all non-relativistic experiments.',
    decoherence: 'Explains why the empty branches can be ignored in practice.',
    critique: 'Explicitly non-local (allowed by Bell\'s theorem, but uncomfortable with relativity). Extending it to quantum field theory is awkward. It singles out position.',
  },
  grw: {
    state: 'Yes.',
    collapse: 'Yes, as a real, random physical process.',
    determinism: 'Yes. The collapses are fundamentally random.',
    extra: 'New non-linear, stochastic terms in the dynamics, with new constants of nature (collapse rate and width).',
    predictions: 'Yes! E.g. tiny spontaneous heating, and loss of interference for large enough objects. Experiments keep tightening the bounds. An underground test in 2020 ruled out the simplest Diósi–Penrose model.',
    decoherence: 'Distinct from collapse, and a major experimental headache: decoherence must be suppressed to see the predicted collapse.',
    critique: 'The parameters are chosen by hand. Relativistic versions are hard. Energy is not exactly conserved.',
  },
  qbism: {
    state: 'No. It is an agent\'s belief, not a property of the system.',
    collapse: 'Only as belief updating, like conditioning a probability on new data.',
    determinism: 'Yes, in the sense that outcomes are genuinely unforeseeable. QBists stress that measurement outcomes are creative acts.',
    extra: 'A subjective Bayesian reading of probability, and a reformulation of the Born rule as a coherence condition.',
    predictions: 'No.',
    decoherence: 'A useful tool for an agent\'s reasoning about what they should expect, not a resolution in itself.',
    critique: 'Critics argue it gives up on describing an observer-independent reality, or slides toward instrumentalism or solipsism (charges QBists reject).',
  },
};

/** Even-handed comparison of interpretations of quantum mechanics. */
export function InterpretationsTour() {
  const [view, setView] = useState<'cards' | 'compare'>('cards');
  const [sel, setSel] = useState<Key>('cph');
  const [q, setQ] = useState<QKey>('collapse');
  const I = INTERPS[sel];
  return (
    <Widget title="A tour of interpretations (no advocacy)">
      <div className="row" style={{ marginBottom: 10 }}>
        <Segmented value={view} onChange={setView} options={[{ value: 'cards', label: 'One at a time' }, { value: 'compare', label: 'Compare on a question' }]} />
      </div>
      {view === 'cards' ? (
        <div>
          <div className="row" style={{ gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
            {(Object.keys(INTERPS) as Key[]).map((k) => (
              <button
                key={k}
                className={`btn small ${sel === k ? 'active' : ''}`}
                onClick={() => setSel(k)}
                style={{ borderColor: INTERPS[k].color, color: sel === k ? undefined : INTERPS[k].color }}
              >
                {INTERPS[k].icon} {INTERPS[k].name}
              </button>
            ))}
          </div>
          <div className="panel pop" key={sel} style={{ borderColor: I.color, padding: 14 }}>
            <div style={{ fontSize: '1.15rem', fontWeight: 700, color: I.color }}>
              {I.icon} {I.name}
            </div>
            <div className="faint" style={{ fontSize: '0.82rem', margin: '2px 0 8px' }}>{I.who}</div>
            <div style={{ marginBottom: 10 }}>{I.gist}</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(160px, 0.8fr) 2fr', gap: '6px 14px', fontSize: '0.9rem' }}>
              {(Object.keys(QUESTIONS) as QKey[]).map((qk) => (
                <React.Fragment key={qk}>
                  <div className="dim">{QUESTIONS[qk]}</div>
                  <div>{ANSWERS[sel][qk]}</div>
                </React.Fragment>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div>
          <div className="row" style={{ gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
            {(Object.keys(QUESTIONS) as QKey[]).map((qk) => (
              <button key={qk} className={`btn small ${q === qk ? 'active' : ''}`} onClick={() => setQ(qk)}>
                {QUESTIONS[qk]}
              </button>
            ))}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 8 }}>
            {(Object.keys(INTERPS) as Key[]).map((k) => (
              <div key={k + q} className="panel pop" style={{ borderColor: INTERPS[k].color, padding: 10, fontSize: '0.88rem' }}>
                <div style={{ color: INTERPS[k].color, fontWeight: 700, marginBottom: 4 }}>
                  {INTERPS[k].icon} {INTERPS[k].name}
                </div>
                {ANSWERS[k][q]}
              </div>
            ))}
          </div>
        </div>
      )}
      <div className="faint" style={{ fontSize: '0.8rem', marginTop: 10 }}>
        Copenhagen, Many-Worlds, Bohmian mechanics and QBism make identical predictions for every experiment done so far. Objective-collapse models
        change the equations and predict tiny deviations that experiments are actively hunting for. Physicists remain divided, and "shut up and
        calculate" is a popular sixth option.
      </div>
    </Widget>
  );
}
