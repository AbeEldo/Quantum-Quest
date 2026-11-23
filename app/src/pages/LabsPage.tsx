import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ALL_GAMES } from '../content/curriculum';
import { useProgress } from '../state/progress';
import { isGameUnlocked } from '../content/unlocks';
import { BlochPlayground } from '../widgets/BlochPlayground';

export function LabsPage() {
  const p = useProgress();
  const nav = useNavigate();
  const [bloch, setBloch] = useState(false);
  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '24px 20px 80px' }}>
      <h1 style={{ marginBottom: 4 }}>🔬 Labs & Arcade</h1>
      <p className="dim" style={{ marginTop: 0 }}>
        Sandboxes for free experimentation, plus every game you've unlocked.
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 12 }}>
        <div className="panel" style={{ cursor: 'pointer', borderColor: '#3b4560' }} onClick={() => nav('/labs/circuit')}>
          <div style={{ fontSize: '1.8rem' }}>⚡</div>
          <div style={{ fontWeight: 700 }}>Circuit Lab</div>
          <div className="dim" style={{ fontSize: '0.88rem' }}>
            Up to 6 qubits, every gate, step-through, shots histogram, presets, and text import/export.
          </div>
        </div>
        <div className="panel" style={{ cursor: 'pointer', borderColor: '#3b4560' }} onClick={() => setBloch((b) => !b)}>
          <div style={{ fontSize: '1.8rem' }}>🧭</div>
          <div style={{ fontWeight: 700 }}>Bloch Sphere Playground</div>
          <div className="dim" style={{ fontSize: '0.88rem' }}>
            Apply gates and arbitrary rotations to one qubit and watch them as rotations. Drag the state anywhere.
          </div>
        </div>
        <div className="panel" style={{ cursor: 'pointer', borderColor: '#3b4560' }} onClick={() => nav('/puzzles')}>
          <div style={{ fontSize: '1.8rem' }}>🧩</div>
          <div style={{ fontWeight: 700 }}>Circuit Puzzles</div>
          <div className="dim" style={{ fontSize: '0.88rem' }}>
            Star-rated challenges: reach the target state with as few gates as possible.
          </div>
        </div>
      </div>
      {bloch && (
        <BlochPlayground title="Bloch sphere playground" gates={['X', 'Y', 'Z', 'H', 'S', 'Sdg', 'T', 'Tdg', 'SX']} rotations draggable height={380} />
      )}
      <h2>Arcade</h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12 }}>
        {ALL_GAMES.map((g) => {
          const open = isGameUnlocked(g, p);
          const rec = p.games[g.id];
          return (
            <div
              key={g.id}
              className="panel"
              onClick={() => open && nav(`/game/${g.id}`)}
              style={{ cursor: open ? 'pointer' : 'not-allowed', opacity: open ? 1 : 0.45, borderColor: rec?.completed ? '#3c5c33' : 'var(--border)' }}
            >
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <span style={{ fontSize: '1.6rem' }}>{open ? g.icon : '🔒'}</span>
                <span className="faint" style={{ fontSize: '0.75rem' }}>
                  World {g.unit.number}
                </span>
              </div>
              <div style={{ fontWeight: 700 }}>{g.title}</div>
              <div className="dim" style={{ fontSize: '0.85rem' }}>{g.description}</div>
              {rec?.completed && <span className="pill good" style={{ marginTop: 6 }}>beaten</span>}
            </div>
          );
        })}
        {ALL_GAMES.length === 0 && <div className="faint">Games appear here as you unlock them.</div>}
      </div>
      <p className="faint" style={{ marginTop: 30, fontSize: '0.85rem' }}>
        Tip: turn on <Link to="/profile">free roam</Link> to open everything at once.
      </p>
    </div>
  );
}
