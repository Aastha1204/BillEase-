'use client';
import { Canvas, useFrame } from '@react-three/fiber';
import { ContactShadows, Environment, Float, Lightformer, RoundedBox } from '@react-three/drei';
import { Component, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import * as THREE from 'three';
import type { HeroData } from '@/lib/heroData';
import { drawMiniInvoice, drawQr, drawRupeeCoin } from './textures';

function canvasTexture(draw: (c: HTMLCanvasElement) => void) {
  const c = document.createElement('canvas');
  draw(c);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

const glass = { transmission: 0.92, thickness: 0.45, roughness: 0.12, ior: 1.35, color: '#bcd0ff', metalness: 0, clearcoat: 1, clearcoatRoughness: 0.1, envMapIntensity: 1.1 } as const;
const CARDS: { p: [number, number, number]; r: [number, number, number] }[] = [
  { p: [-0.45, 0.3, -0.95], r: [0, 0.2, -0.07] },
  { p: [0.2, 0.12, -0.48], r: [0, 0.11, -0.035] },
  { p: [0, 0, 0], r: [0, -0.05, 0.02] },
];

function Scene({ data }: { data: HeroData }) {
  const group = useRef<THREE.Group>(null);
  const coin = useRef<THREE.Group>(null);
  const tex = useMemo(() => ({
    invoice: canvasTexture((c) => drawMiniInvoice(c, data)),
    coin: canvasTexture(drawRupeeCoin),
    qr: canvasTexture((c) => drawQr(c, data.upiUri)),
  }), [data]);
  useEffect(() => () => { Object.values(tex).forEach((t) => t.dispose()); }, [tex]);

  useFrame((state, dt) => {
    // gentle mouse parallax on the whole composition
    if (group.current) {
      group.current.rotation.y = THREE.MathUtils.damp(group.current.rotation.y, state.pointer.x * 0.35, 3, dt);
      group.current.rotation.x = THREE.MathUtils.damp(group.current.rotation.x, -state.pointer.y * 0.18, 3, dt);
    }
    if (coin.current) coin.current.rotation.y += dt * 0.9;
  });

  return (
    <>
      <ambientLight intensity={0.5} />
      <directionalLight position={[3, 4, 5]} intensity={1.6} />
      <Environment resolution={256}>
        {/* Built from light panels, so the scene needs no network HDR download. */}
        <Lightformer form="rect" intensity={3} position={[0, 4, 3]} scale={[8, 2, 1]} />
        <Lightformer form="rect" intensity={2} position={[-5, 0, 2]} scale={[2, 6, 1]} color="#F5B544" />
        <Lightformer form="rect" intensity={2} position={[5, 1, 2]} scale={[2, 6, 1]} color="#6366F1" />
        <Lightformer form="ring" intensity={1.5} position={[0, -2, 5]} scale={4} />
      </Environment>

      <group ref={group} position={[0.2, 0.1, 0]}>
        <Float speed={1.4} rotationIntensity={0.35} floatIntensity={0.7}>
          {CARDS.map((c, i) => (
            <group key={i} position={c.p} rotation={c.r}>
              <RoundedBox args={[2.5, 3.4, 0.07]} radius={0.1} smoothness={4}><meshPhysicalMaterial {...glass} /></RoundedBox>
              {i === 2 && (
                <mesh position={[0, 0, 0.045]}>
                  <planeGeometry args={[2.3, 3.14]} />
                  <meshBasicMaterial map={tex.invoice} toneMapped={false} />
                </mesh>
              )}
            </group>
          ))}
        </Float>

        <Float speed={2} rotationIntensity={0.5} floatIntensity={1.2}>
          <group ref={coin} position={[1.35, -1.05, 0.9]}>
            <mesh rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[0.5, 0.5, 0.09, 48]} /><meshStandardMaterial color="#F5B544" metalness={1} roughness={0.28} /></mesh>
            {[0.046, -0.046].map((z, i) => (
              <mesh key={i} position={[0, 0, z]} rotation={[0, i ? Math.PI : 0, 0]}><circleGeometry args={[0.42, 48]} /><meshBasicMaterial map={tex.coin} toneMapped={false} /></mesh>
            ))}
          </group>
        </Float>

        <Float speed={1.6} rotationIntensity={0.3} floatIntensity={0.8}>
          <group position={[-1.55, -1.3, 0.8]} rotation={[0, 0.25, 0.06]}>
            <mesh><boxGeometry args={[0.95, 0.95, 0.05]} /><meshStandardMaterial color="#ffffff" roughness={0.4} /></mesh>
            <mesh position={[0, 0, 0.03]}><planeGeometry args={[0.88, 0.88]} /><meshBasicMaterial map={tex.qr} toneMapped={false} /></mesh>
          </group>
        </Float>
      </group>
      <ContactShadows position={[0, -2.2, 0]} opacity={0.5} scale={9} blur={2.6} far={4.5} />
    </>
  );
}

class Boundary extends Component<{ onError: () => void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch() { this.props.onError(); }
  render() { return this.state.failed ? null : this.props.children; }
}

/** Renders only while visible: pauses when the tab is hidden or the hero is scrolled out of view. */
export default function HeroScene({ data, onFail }: { data: HeroData; onFail: () => void }) {
  const wrap = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(true);
  const [tabVisible, setTabVisible] = useState(true);
  useEffect(() => {
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting), { threshold: 0.05 });
    if (wrap.current) io.observe(wrap.current);
    const vis = () => setTabVisible(!document.hidden);
    document.addEventListener('visibilitychange', vis);
    return () => { io.disconnect(); document.removeEventListener('visibilitychange', vis); };
  }, []);
  return (
    <div ref={wrap} className="h-full w-full" data-testid="hero-3d" aria-hidden="true">
      <Boundary onError={onFail}>
        <Canvas dpr={[1, 1.75]} frameloop={visible && tabVisible ? 'always' : 'never'} camera={{ position: [0, 0, 6.4], fov: 34 }} gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
          onCreated={({ gl }) => gl.domElement.addEventListener('webglcontextlost', (e) => { e.preventDefault(); onFail(); })}>
          <Scene data={data} />
        </Canvas>
      </Boundary>
    </div>
  );
}
