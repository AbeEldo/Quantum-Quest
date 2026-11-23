import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';

export type Vec3 = [number, number, number];

export interface BlochVector {
  v: Vec3;
  color?: string;
  label?: string;
  /** Draw a fading trail behind this vector. */
  trail?: boolean;
}

export interface BlochSphereProps {
  /** Main state vector (Bloch coordinates x,y,z; length ≤ 1). */
  vector?: Vec3;
  /** Extra vectors (e.g. target state, ensemble members). */
  vectors?: BlochVector[];
  /** If set, the user can drag the main vector tip; receives new Bloch coords (unit length). */
  onDrag?: (v: Vec3) => void;
  /** Show a rotation axis through the origin. */
  axis?: Vec3 | null;
  /** Show trail behind main vector. */
  trail?: boolean;
  /** Clear trail when this key changes. */
  trailKey?: unknown;
  height?: number;
  showLabels?: boolean;
  /** Colour of main vector. */
  color?: string;
  /** Points to scatter on the sphere (e.g. measured ensemble). */
  points?: { v: Vec3; color?: string }[];
  /** Highlight a target region (unit vector) with a glowing marker. */
  target?: Vec3 | null;
  /** Show the sphere as a solid "Bloch ball" (for mixed states). */
  ball?: boolean;
}

/** Bloch (x,y,z) → three.js coordinates: x→Z (towards viewer), y→X (right), z→Y (up). */
const toThree = (v: Vec3) => new THREE.Vector3(v[1], v[2], v[0]);
const fromThree = (p: THREE.Vector3): Vec3 => [p.z, p.x, p.y];

/**
 * Interactive 3D Bloch sphere (drag to orbit, drag the tip to set the state when onDrag is given).
 */
export function BlochSphere({
  vector = [0, 0, 1],
  vectors = [],
  onDrag,
  axis = null,
  trail = false,
  trailKey,
  height = 320,
  showLabels = true,
  color = '#fcd34d',
  points = [],
  target = null,
  ball = false,
}: BlochSphereProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const props = useRef({ vector, vectors, onDrag, axis, trail, color, points, target, ball });
  props.current = { vector, vectors, onDrag, axis, trail, color, points, target, ball };
  const trailRef = useRef<THREE.Vector3[]>([]);

  useEffect(() => {
    trailRef.current = [];
  }, [trailKey]);

  useEffect(() => {
    const mount = mountRef.current!;
    const width = mount.clientWidth || 400;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(32, width / height, 0.1, 100);
    camera.position.set(2.3, 1.75, 5.1);
    camera.lookAt(0, 0, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height);
    mount.appendChild(renderer.domElement);

    const labelRenderer = new CSS2DRenderer();
    labelRenderer.setSize(width, height);
    labelRenderer.domElement.style.position = 'absolute';
    labelRenderer.domElement.style.top = '0';
    labelRenderer.domElement.style.left = '0';
    labelRenderer.domElement.style.pointerEvents = 'none';
    mount.appendChild(labelRenderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enablePan = false;
    controls.enableZoom = false;
    controls.rotateSpeed = 0.7;
    controls.enableDamping = true;

    scene.add(new THREE.AmbientLight(0xffffff, 0.6));
    const dl = new THREE.DirectionalLight(0xffffff, 0.9);
    dl.position.set(3, 4, 5);
    scene.add(dl);

    // sphere surface
    const sphereGeo = new THREE.SphereGeometry(1, 48, 32);
    const sphereMat = new THREE.MeshPhongMaterial({ color: 0x3a6f8f, transparent: true, opacity: 0.12, depthWrite: false, shininess: 60 });
    const sphere = new THREE.Mesh(sphereGeo, sphereMat);
    scene.add(sphere);

    // wireframe circles
    const lineMat = new THREE.LineBasicMaterial({ color: 0x58c4dd, transparent: true, opacity: 0.22 });
    const eqMat = new THREE.LineBasicMaterial({ color: 0x58c4dd, transparent: true, opacity: 0.55 });
    const circle = (r: number, y: number, mat: THREE.LineBasicMaterial, rotX = 0, rotZ = 0) => {
      const pts: THREE.Vector3[] = [];
      for (let i = 0; i <= 96; i++) {
        const a = (i / 96) * Math.PI * 2;
        pts.push(new THREE.Vector3(r * Math.cos(a), y, r * Math.sin(a)));
      }
      const g = new THREE.BufferGeometry().setFromPoints(pts);
      const l = new THREE.Line(g, mat);
      l.rotation.x = rotX;
      l.rotation.z = rotZ;
      scene.add(l);
    };
    for (const lat of [-60, -30, 30, 60]) {
      const t = (lat * Math.PI) / 180;
      circle(Math.cos(t), Math.sin(t), lineMat);
    }
    circle(1, 0, eqMat);
    circle(1, 0, lineMat, Math.PI / 2);
    circle(1, 0, lineMat, Math.PI / 2, Math.PI / 2);

    // axes
    const axisMat = new THREE.LineBasicMaterial({ color: 0x9aa3b5, transparent: true, opacity: 0.5 });
    const mkAxis = (v: Vec3) => {
      const g = new THREE.BufferGeometry().setFromPoints([toThree([-v[0] * 1.25, -v[1] * 1.25, -v[2] * 1.25]), toThree([v[0] * 1.25, v[1] * 1.25, v[2] * 1.25])]);
      scene.add(new THREE.Line(g, axisMat));
    };
    mkAxis([1, 0, 0]);
    mkAxis([0, 1, 0]);
    mkAxis([0, 0, 1]);

    const labels: CSS2DObject[] = [];
    const addLabel = (text: string, v: Vec3, cls = '') => {
      const div = document.createElement('div');
      div.className = 'bloch-label ' + cls;
      div.innerHTML = text;
      div.style.cssText = 'color:#cfd6e4;font:600 13px Cambria,Georgia,serif;text-shadow:0 0 4px #000;white-space:nowrap;';
      const o = new CSS2DObject(div);
      o.position.copy(toThree(v));
      scene.add(o);
      labels.push(o);
    };
    if (showLabels) {
      addLabel('|0⟩', [0, 0, 1.38]);
      addLabel('|1⟩', [0, 0, -1.38]);
      addLabel('|+⟩', [1.42, 0, 0]);
      addLabel('|−⟩', [-1.4, 0, 0]);
      addLabel('|+i⟩', [0, 1.42, 0]);
      addLabel('|−i⟩', [0, -1.42, 0]);
      addLabel('<span style="color:#7d8699;font-size:11px">x</span>', [1.25, 0.08, 0.08]);
      addLabel('<span style="color:#7d8699;font-size:11px">y</span>', [0.08, 1.25, 0.08]);
      addLabel('<span style="color:#7d8699;font-size:11px">z</span>', [0.08, 0.08, 1.25]);
    }

    // main arrow
    const mkArrow = (col: string) => {
      const group = new THREE.Group();
      const mat = new THREE.MeshPhongMaterial({ color: col, emissive: col, emissiveIntensity: 0.35 });
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 1, 12), mat);
      const head = new THREE.Mesh(new THREE.ConeGeometry(0.065, 0.16, 16), mat);
      const tip = new THREE.Mesh(new THREE.SphereGeometry(0.06, 16, 12), new THREE.MeshPhongMaterial({ color: col, emissive: col, emissiveIntensity: 0.8 }));
      group.add(shaft, head, tip);
      scene.add(group);
      return { group, shaft, head, tip, mat };
    };
    const setArrow = (a: ReturnType<typeof mkArrow>, v: Vec3, col: string) => {
      const p = toThree(v);
      const len = p.length();
      a.group.visible = len > 1e-4;
      if (len < 1e-4) return;
      const dir = p.clone().normalize();
      const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
      const shaftLen = Math.max(0.001, len - 0.14);
      a.shaft.scale.set(1, shaftLen, 1);
      a.shaft.position.copy(dir.clone().multiplyScalar(shaftLen / 2));
      a.shaft.quaternion.copy(q);
      a.head.position.copy(dir.clone().multiplyScalar(len - 0.08));
      a.head.quaternion.copy(q);
      a.tip.position.copy(p);
      a.tip.visible = len > 0.98 && !!props.current.onDrag;
      (a.mat as THREE.MeshPhongMaterial).color.set(col);
      (a.mat as THREE.MeshPhongMaterial).emissive.set(col);
    };
    const main = mkArrow(props.current.color);
    const extras: ReturnType<typeof mkArrow>[] = [];

    // projection lines (dashed) from tip to equator plane
    const projMat = new THREE.LineDashedMaterial({ color: 0xfcd34d, dashSize: 0.04, gapSize: 0.03, transparent: true, opacity: 0.6 });
    const projGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()]);
    const proj = new THREE.Line(projGeo, projMat);
    scene.add(proj);

    // rotation axis
    const axisLineMat = new THREE.LineBasicMaterial({ color: 0xff8c42 });
    const axisGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
    const axisLine = new THREE.Line(axisGeo, axisLineMat);
    scene.add(axisLine);

    // trail
    const TRAIL_MAX = 600;
    const trailGeo = new THREE.BufferGeometry();
    const trailPos = new Float32Array(TRAIL_MAX * 3);
    trailGeo.setAttribute('position', new THREE.BufferAttribute(trailPos, 3));
    trailGeo.setDrawRange(0, 0);
    const trailMat = new THREE.LineBasicMaterial({ color: 0xfcd34d, transparent: true, opacity: 0.7 });
    const trailLine = new THREE.Line(trailGeo, trailMat);
    trailLine.frustumCulled = false;
    scene.add(trailLine);

    // points cloud
    const pointsGroup = new THREE.Group();
    scene.add(pointsGroup);
    let lastPointsKey = '';

    // target marker
    const targetMesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.075, 16, 12),
      new THREE.MeshBasicMaterial({ color: 0x83c167, transparent: true, opacity: 0.85 }),
    );
    const targetRing = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.012, 8, 32), new THREE.MeshBasicMaterial({ color: 0x83c167 }));
    scene.add(targetMesh, targetRing);

    // dragging
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    let dragging = false;
    const hitSphere = (e: PointerEvent) => {
      const r = renderer.domElement.getBoundingClientRect();
      pointer.x = ((e.clientX - r.left) / r.width) * 2 - 1;
      pointer.y = -((e.clientY - r.top) / r.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      return raycaster;
    };
    const onDown = (e: PointerEvent) => {
      if (!props.current.onDrag) return;
      const rc = hitSphere(e);
      const hits = rc.intersectObjects([main.tip, main.head, sphere]);
      const tipHit = hits.find((h) => h.object === main.tip || h.object === main.head);
      const sphereHit = hits.find((h) => h.object === sphere);
      // grab if near the tip
      if (tipHit || (sphereHit && sphereHit.point.distanceTo(toThree(props.current.vector)) < 0.25)) {
        dragging = true;
        controls.enabled = false;
        renderer.domElement.setPointerCapture(e.pointerId);
        e.stopPropagation();
      }
    };
    const onMove = (e: PointerEvent) => {
      if (!dragging || !props.current.onDrag) {
        if (props.current.onDrag) {
          const rc = hitSphere(e);
          const h = rc.intersectObject(sphere)[0];
          const near = h && h.point.distanceTo(toThree(props.current.vector)) < 0.25;
          renderer.domElement.style.cursor = near ? 'grab' : 'default';
        }
        return;
      }
      const rc = hitSphere(e);
      const h = rc.intersectObject(sphere)[0];
      let p: THREE.Vector3;
      if (h) p = h.point.clone().normalize();
      else {
        // project onto silhouette: closest point on ray to origin, then normalise
        const ray = rc.ray;
        const t = -ray.origin.dot(ray.direction);
        p = ray.origin.clone().add(ray.direction.clone().multiplyScalar(t)).normalize();
      }
      props.current.onDrag(fromThree(p));
    };
    const onUp = () => {
      dragging = false;
      controls.enabled = true;
    };
    renderer.domElement.addEventListener('pointerdown', onDown, { capture: true });
    renderer.domElement.addEventListener('pointermove', onMove);
    renderer.domElement.addEventListener('pointerup', onUp);
    renderer.domElement.addEventListener('pointerleave', onUp);

    let raf = 0;
    let t = 0;
    // pause rendering while scrolled out of view (saves GPU when a lesson has many spheres)
    let visible = true;
    const io = new IntersectionObserver(([e]) => (visible = e.isIntersecting), { rootMargin: '100px' });
    io.observe(mount);
    const render = () => {
      if (!visible) {
        raf = requestAnimationFrame(render);
        return;
      }
      t += 0.016;
      const P = props.current;
      setArrow(main, P.vector, P.color);
      // extras
      while (extras.length < P.vectors.length) extras.push(mkArrow('#fff'));
      extras.forEach((a, i) => {
        if (i < P.vectors.length) {
          a.group.visible = true;
          setArrow(a, P.vectors[i].v, P.vectors[i].color ?? '#e07ab6');
          a.tip.visible = false;
        } else a.group.visible = false;
      });
      // projection
      const pv = toThree(P.vector);
      const foot = new THREE.Vector3(pv.x, 0, pv.z);
      projGeo.setFromPoints([pv, foot, new THREE.Vector3(0, 0, 0)]);
      proj.computeLineDistances();
      proj.visible = pv.length() > 0.05;
      // axis
      if (P.axis) {
        const a = toThree(P.axis).normalize().multiplyScalar(1.35);
        axisGeo.setFromPoints([a.clone().negate(), a]);
        axisLine.visible = true;
      } else axisLine.visible = false;
      // trail
      if (P.trail) {
        const tr = trailRef.current;
        const last = tr[tr.length - 1];
        if (!last || last.distanceTo(pv) > 0.01) {
          tr.push(pv.clone());
          if (tr.length > TRAIL_MAX) tr.shift();
        }
        for (let k = 0; k < tr.length; k++) {
          trailPos[3 * k] = tr[k].x;
          trailPos[3 * k + 1] = tr[k].y;
          trailPos[3 * k + 2] = tr[k].z;
        }
        (trailGeo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
        trailGeo.setDrawRange(0, tr.length);
        trailLine.visible = tr.length > 1;
      } else trailLine.visible = false;
      // points
      const key = JSON.stringify(P.points.map((p) => p.v.map((x) => x.toFixed(3)).join(',') + (p.color ?? '')));
      if (key !== lastPointsKey) {
        lastPointsKey = key;
        pointsGroup.children.forEach((ch) => {
          const m = ch as THREE.Mesh;
          m.geometry.dispose();
          (m.material as THREE.Material).dispose();
        });
        pointsGroup.clear();
        for (const p of P.points) {
          const m = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 6), new THREE.MeshBasicMaterial({ color: p.color ?? '#e07ab6' }));
          m.position.copy(toThree(p.v));
          pointsGroup.add(m);
        }
      }
      // target
      if (P.target) {
        const tp = toThree(P.target);
        targetMesh.position.copy(tp);
        targetRing.position.copy(tp);
        targetRing.lookAt(tp.clone().multiplyScalar(2));
        const s = 1 + 0.15 * Math.sin(t * 4);
        targetRing.scale.set(s, s, s);
        targetMesh.visible = targetRing.visible = true;
      } else targetMesh.visible = targetRing.visible = false;
      sphereMat.opacity = P.ball ? 0.22 : 0.12;

      controls.update();
      renderer.render(scene, camera);
      labelRenderer.render(scene, camera);
      raf = requestAnimationFrame(render);
    };
    render();

    const ro = new ResizeObserver(() => {
      const w = mount.clientWidth;
      if (!w) return;
      camera.aspect = w / height;
      camera.updateProjectionMatrix();
      renderer.setSize(w, height);
      labelRenderer.setSize(w, height);
    });
    ro.observe(mount);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      controls.dispose();
      renderer.domElement.removeEventListener('pointerdown', onDown, { capture: true } as any);
      renderer.domElement.removeEventListener('pointermove', onMove);
      renderer.domElement.removeEventListener('pointerup', onUp);
      renderer.domElement.removeEventListener('pointerleave', onUp);
      scene.traverse((o) => {
        const m = o as THREE.Mesh;
        m.geometry?.dispose?.();
        const mat = m.material as THREE.Material | THREE.Material[] | undefined;
        if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
        else mat?.dispose?.();
      });
      renderer.dispose();
      renderer.forceContextLoss();
      mount.innerHTML = '';
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [height, showLabels]);

  return <div ref={mountRef} style={{ position: 'relative', width: '100%', height, touchAction: 'none' }} />;
}

/* --------------------------- Bloch maths helpers -------------------------- */

export const vecFromAngles = (theta: number, phi: number): Vec3 => [Math.sin(theta) * Math.cos(phi), Math.sin(theta) * Math.sin(phi), Math.cos(theta)];

export const anglesFromVec = (v: Vec3): { theta: number; phi: number } => {
  const r = Math.hypot(...v) || 1;
  const theta = Math.acos(Math.max(-1, Math.min(1, v[2] / r)));
  let phi = Math.atan2(v[1], v[0]);
  if (phi < 0) phi += 2 * Math.PI;
  return { theta, phi };
};

/** Rodrigues rotation of v about unit axis n by angle a. */
export function rotateVec(v: Vec3, n: Vec3, a: number): Vec3 {
  const len = Math.hypot(...n) || 1;
  const k: Vec3 = [n[0] / len, n[1] / len, n[2] / len];
  const c = Math.cos(a), s = Math.sin(a);
  const dot = k[0] * v[0] + k[1] * v[1] + k[2] * v[2];
  const cross: Vec3 = [k[1] * v[2] - k[2] * v[1], k[2] * v[0] - k[0] * v[2], k[0] * v[1] - k[1] * v[0]];
  return [0, 1, 2].map((i) => v[i] * c + cross[i] * s + k[i] * dot * (1 - c)) as Vec3;
}

/** Rotation axis & angle on the Bloch sphere for named single-qubit gates. */
export const GATE_ROTATIONS: Record<string, { axis: Vec3; angle: number }> = {
  X: { axis: [1, 0, 0], angle: Math.PI },
  Y: { axis: [0, 1, 0], angle: Math.PI },
  Z: { axis: [0, 0, 1], angle: Math.PI },
  H: { axis: [Math.SQRT1_2, 0, Math.SQRT1_2], angle: Math.PI },
  S: { axis: [0, 0, 1], angle: Math.PI / 2 },
  Sdg: { axis: [0, 0, 1], angle: -Math.PI / 2 },
  T: { axis: [0, 0, 1], angle: Math.PI / 4 },
  Tdg: { axis: [0, 0, 1], angle: -Math.PI / 4 },
  SX: { axis: [1, 0, 0], angle: Math.PI / 2 },
};
