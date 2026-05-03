"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";

type ThemeMode = "light" | "dark";

interface LandingFlowSceneProps {
  theme: ThemeMode;
}

function clamp01(value: number): number {
  if (value <= 0) {
    return 0;
  }

  if (value >= 1) {
    return 1;
  }

  return value;
}

function easeInOutSine(value: number): number {
  return -(Math.cos(Math.PI * value) - 1) / 2;
}

function quadraticBezierPoint(t: number, start: THREE.Vector3, control: THREE.Vector3, end: THREE.Vector3): THREE.Vector3 {
  const inv = 1 - t;
  return new THREE.Vector3(
    inv * inv * start.x + 2 * inv * t * control.x + t * t * end.x,
    inv * inv * start.y + 2 * inv * t * control.y + t * t * end.y,
    inv * inv * start.z + 2 * inv * t * control.z + t * t * end.z
  );
}

function TransferFlow({ theme }: { theme: ThemeMode }) {
  const worldRef = useRef<THREE.Group | null>(null);
  const packetRef = useRef<THREE.Group | null>(null);
  const emitterPulseRef = useRef<THREE.Mesh | null>(null);
  const receiverPulseRef = useRef<THREE.Mesh | null>(null);
  const streamRefs = useRef<Array<THREE.Mesh | null>>([]);

  const start = useMemo(() => new THREE.Vector3(-1.76, 0.04, 0.03), []);
  const control = useMemo(() => new THREE.Vector3(-0.06, 0.94, -0.14), []);
  const end = useMemo(() => new THREE.Vector3(1.76, -0.06, -0.14), []);

  const pathSegmentGeometry = useMemo(() => {
    const points = Array.from({ length: 56 }, (_, index) => {
      const t = index / 55;
      return quadraticBezierPoint(t, start, control, end);
    });

    const positions = new Float32Array((points.length - 1) * 6);

    for (let index = 0; index < points.length - 1; index += 1) {
      const from = points[index];
      const to = points[index + 1];
      const cursor = index * 6;

      positions[cursor] = from.x;
      positions[cursor + 1] = from.y;
      positions[cursor + 2] = from.z;
      positions[cursor + 3] = to.x;
      positions[cursor + 4] = to.y;
      positions[cursor + 5] = to.z;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    return geometry;
  }, [control, end, start]);

  const colors =
    theme === "dark"
      ? {
          source: "#a3abb3",
          destination: "#c1c8cf",
          fileShell: "#dde3e8",
          fileFold: "#f3f6f8",
          fileLine: "#9aa3ab",
          fileBadge: "#7f878f",
          stream: "#a1a9b1",
          path: "#868f98"
        }
      : {
          source: "#6f9fce",
          destination: "#8eb2d8",
          fileShell: "#f7fbff",
          fileFold: "#ffffff",
          fileLine: "#7ea4cc",
          fileBadge: "#5f92c4",
          stream: "#76a8d8",
          path: "#8ab0d9"
        };

  useFrame((state) => {
    const elapsed = state.clock.elapsedTime;
    const cycleDuration = 4.6;
    const cycle = (elapsed % cycleDuration) / cycleDuration;
    const progress = easeInOutSine(cycle);
    const position = quadraticBezierPoint(progress, start, control, end);

    const born = clamp01(cycle / 0.18);
    const absorbed = clamp01((1 - cycle) / 0.16);
    const visibility = Math.min(born, absorbed);

    if (packetRef.current) {
      packetRef.current.position.copy(position);
      packetRef.current.scale.setScalar(0.14 + visibility * 1.28);
      packetRef.current.rotation.z = 0.08 + Math.sin(progress * Math.PI) * 0.12;
      packetRef.current.rotation.y = state.pointer.x * 0.26;
    }

    const sourcePulse = clamp01(1 - cycle / 0.22);
    if (emitterPulseRef.current) {
      emitterPulseRef.current.scale.setScalar(0.3 + sourcePulse * 1.25);
      const material = emitterPulseRef.current.material as THREE.MeshBasicMaterial;
      material.opacity = 0.05 + sourcePulse * 0.46;
    }

    const receivePhase = clamp01((cycle - 0.78) / 0.22);
    const receiverEnergy = Math.sin(receivePhase * Math.PI);
    if (receiverPulseRef.current) {
      receiverPulseRef.current.scale.setScalar(0.34 + receiverEnergy * 1.4);
      const material = receiverPulseRef.current.material as THREE.MeshBasicMaterial;
      material.opacity = 0.04 + receiverEnergy * 0.5;
    }

    const streamCount = streamRefs.current.length;
    streamRefs.current.forEach((mesh, index) => {
      if (!mesh) {
        return;
      }

      const offset = (index + 1) / (streamCount + 2);
      const streamCycle = (cycle - offset * 0.28 + 1) % 1;
      const streamProgress = easeInOutSine(streamCycle);
      const streamPoint = quadraticBezierPoint(streamProgress, start, control, end);

      const streamBorn = clamp01(streamCycle / 0.1);
      const streamAbsorbed = clamp01((1 - streamCycle) / 0.12);
      const streamVisibility = Math.min(streamBorn, streamAbsorbed);

      mesh.position.copy(streamPoint);
      mesh.scale.setScalar(0.18 + streamVisibility * 0.55);

      const material = mesh.material as THREE.MeshBasicMaterial;
      material.opacity = 0.03 + streamVisibility * 0.24;
    });

    if (worldRef.current) {
      worldRef.current.rotation.y = THREE.MathUtils.lerp(worldRef.current.rotation.y, state.pointer.x * 0.11, 0.045);
      worldRef.current.rotation.x = THREE.MathUtils.lerp(worldRef.current.rotation.x, -state.pointer.y * 0.055, 0.045);
      worldRef.current.position.x = THREE.MathUtils.lerp(worldRef.current.position.x, state.pointer.x * 0.12, 0.04);
      worldRef.current.position.y = THREE.MathUtils.lerp(worldRef.current.position.y, state.pointer.y * 0.08, 0.04);
    }

    state.camera.position.x = THREE.MathUtils.lerp(state.camera.position.x, state.pointer.x * 0.2, 0.05);
    state.camera.position.y = THREE.MathUtils.lerp(state.camera.position.y, state.pointer.y * 0.12, 0.05);
    state.camera.lookAt(0, 0, 0);
  });

  return (
    <group ref={worldRef} scale={[0.88, 0.88, 0.88]}>
      <mesh position={start}>
        <sphereGeometry args={[0.12, 24, 24]} />
        <meshBasicMaterial color={colors.source} />
      </mesh>

      <mesh ref={emitterPulseRef} position={start}>
        <ringGeometry args={[0.18, 0.32, 40]} />
        <meshBasicMaterial color={colors.source} transparent opacity={0.12} side={THREE.DoubleSide} />
      </mesh>

      <mesh position={end}>
        <sphereGeometry args={[0.12, 24, 24]} />
        <meshBasicMaterial color={colors.destination} />
      </mesh>

      <mesh ref={receiverPulseRef} position={end}>
        <ringGeometry args={[0.2, 0.34, 40]} />
        <meshBasicMaterial color={colors.destination} transparent opacity={0.08} side={THREE.DoubleSide} />
      </mesh>

      <lineSegments geometry={pathSegmentGeometry}>
        <lineBasicMaterial color={colors.path} transparent opacity={theme === "dark" ? 0.26 : 0.2} />
      </lineSegments>

      {Array.from({ length: 9 }, (_, index) => (
        <mesh
          key={`stream-node-${index}`}
          ref={(mesh) => {
            streamRefs.current[index] = mesh;
          }}
        >
          <sphereGeometry args={[0.045, 14, 14]} />
          <meshBasicMaterial color={colors.stream} transparent opacity={0.18} blending={THREE.AdditiveBlending} />
        </mesh>
      ))}

      <group ref={packetRef}>
        <mesh>
          <boxGeometry args={[0.52, 0.68, 0.05]} />
          <meshStandardMaterial color={colors.fileShell} roughness={0.26} metalness={0.08} transparent opacity={0.96} />
        </mesh>

        <mesh position={[0.17, 0.24, 0.028]} rotation={[0, 0, Math.PI / 4]}>
          <planeGeometry args={[0.135, 0.135]} />
          <meshBasicMaterial color={colors.fileFold} transparent opacity={0.92} />
        </mesh>

        <mesh position={[0.02, 0.33, 0.03]}>
          <boxGeometry args={[0.22, 0.04, 0.012]} />
          <meshBasicMaterial color={colors.fileBadge} transparent opacity={0.88} />
        </mesh>

        <mesh position={[0, 0.08, 0.03]}>
          <boxGeometry args={[0.28, 0.03, 0.01]} />
          <meshBasicMaterial color={colors.fileLine} transparent opacity={0.82} />
        </mesh>

        <mesh position={[0, 0.02, 0.03]}>
          <boxGeometry args={[0.32, 0.03, 0.01]} />
          <meshBasicMaterial color={colors.fileLine} transparent opacity={0.78} />
        </mesh>

        <mesh position={[-0.03, -0.04, 0.03]}>
          <boxGeometry args={[0.26, 0.03, 0.01]} />
          <meshBasicMaterial color={colors.fileLine} transparent opacity={0.72} />
        </mesh>

        <mesh position={[0, -0.17, 0.03]}>
          <circleGeometry args={[0.056, 30]} />
          <meshBasicMaterial color={colors.fileBadge} transparent opacity={0.92} />
        </mesh>

        <mesh position={[0.012, -0.17, 0.04]} rotation={[0, 0, -Math.PI / 2]} scale={[0.072, 0.072, 0.072]}>
          <coneGeometry args={[0.5, 1, 3]} />
          <meshBasicMaterial color={colors.fileShell} transparent opacity={0.98} />
        </mesh>
      </group>
    </group>
  );
}

export function LandingFlowScene({ theme }: LandingFlowSceneProps) {
  const cameraPosition: [number, number, number] = theme === "dark" ? [0, 0.02, 5.86] : [0, 0.02, 5.72];

  return (
    <div className="landing-flow-orb relative mx-auto aspect-[7.5/5] w-full max-w-[42rem] overflow-hidden md:aspect-[15/9]">
      <div className="landing-flow-canvas-shell absolute inset-0 overflow-hidden">
        <Canvas dpr={[1, 1.5]} camera={{ position: cameraPosition, fov: 45 }} gl={{ antialias: true, alpha: true, stencil: true }}>
          <ambientLight intensity={theme === "dark" ? 0.55 : 0.66} />
          <pointLight position={[2.8, 2.8, 3.2]} intensity={theme === "dark" ? 1.12 : 0.95} color={theme === "dark" ? "#aeb6bf" : "#859eb9"} />
          <pointLight position={[-3.1, -2.1, 2.8]} intensity={theme === "dark" ? 0.8 : 0.66} color={theme === "dark" ? "#8f979f" : "#9ab2c8"} />
          <TransferFlow theme={theme} />
        </Canvas>
      </div>

      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_30%,rgb(255_255_255_/_0.09),transparent_60%)] dark:bg-[radial-gradient(circle_at_50%_30%,rgb(255_255_255_/_0.03),transparent_60%)]" />
    </div>
  );
}