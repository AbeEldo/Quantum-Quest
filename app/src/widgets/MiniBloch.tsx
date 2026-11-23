import React from 'react';

/** Lightweight SVG Bloch sphere (orthographic projection) for showing many qubits at once. */
export function MiniBloch({ v, size = 70, label, color = '#fcd34d' }: { v: [number, number, number]; size?: number; label?: string; color?: string }) {
  const R = size / 2 - 6;
  // view: azimuth -35°, elevation 20°
  const az = (-55 * Math.PI) / 180, el = (18 * Math.PI) / 180;
  const proj = (x: number, y: number, z: number): [number, number, number] => {
    // rotate around z by az, then tilt by el
    const x1 = x * Math.cos(az) - y * Math.sin(az);
    const y1 = x * Math.sin(az) + y * Math.cos(az);
    const z1 = z;
    // camera looks along -y1 axis after tilt; screen X = y1? choose: screenX = -x1... keep simple
    const sx = y1;
    const sy = z1 * Math.cos(el) - x1 * Math.sin(el);
    const depth = x1 * Math.cos(el) + z1 * Math.sin(el);
    return [sx * R, -sy * R, depth];
  };
  const eq = Array.from({ length: 49 }, (_, i) => {
    const a = (i / 48) * 2 * Math.PI;
    const [x, y] = proj(Math.cos(a), Math.sin(a), 0);
    return `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`;
  }).join(' ');
  const [tx, ty] = proj(v[0], v[1], v[2]);
  const len = Math.hypot(v[0], v[1], v[2]);
  const [zx, zy] = proj(0, 0, 1.15);
  const [xx, xy] = proj(1.15, 0, 0);
  const [yx, yy] = proj(0, 1.15, 0);
  return (
    <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center' }}>
      <svg width={size} height={size} viewBox={`${-size / 2} ${-size / 2} ${size} ${size}`}>
        <circle r={R} fill="rgba(88,196,221,0.07)" stroke="#3b5566" />
        <path d={eq} fill="none" stroke="#58c4dd" strokeOpacity={0.45} />
        <line x1={0} y1={0} x2={zx} y2={zy} stroke="#666" strokeWidth={0.8} />
        <line x1={0} y1={0} x2={xx} y2={xy} stroke="#666" strokeWidth={0.8} />
        <line x1={0} y1={0} x2={yx} y2={yy} stroke="#666" strokeWidth={0.8} />
        <text x={zx} y={zy - 2} fontSize={8} fill="#888" textAnchor="middle">
          0
        </text>
        {len > 0.02 && (
          <>
            <line x1={0} y1={0} x2={tx} y2={ty} stroke={color} strokeWidth={2.2} strokeLinecap="round" />
            <circle cx={tx} cy={ty} r={2.8} fill={color} />
          </>
        )}
        {len < 0.02 && <circle r={3} fill={color} opacity={0.7} />}
      </svg>
      {label && (
        <span className="mono" style={{ fontSize: '0.72rem', color: 'var(--text-faint)' }}>
          {label}
        </span>
      )}
    </div>
  );
}
