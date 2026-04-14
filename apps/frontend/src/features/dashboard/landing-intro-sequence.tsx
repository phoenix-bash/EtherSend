"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";

type IntroPhase = "idle" | "crack" | "blast";

interface LandingIntroSequenceProps {
  onComplete: () => void;
}

interface AsteroidCoreProps {
  phase: IntroPhase;
}

function AsteroidCore({ phase }: AsteroidCoreProps) {
  const coreRef = useRef<THREE.Mesh | null>(null);
  const crackRef = useRef<THREE.Mesh | null>(null);
  const glowRef = useRef<THREE.Mesh | null>(null);
  const shardRefs = useRef<Array<THREE.Mesh | null>>([]);

  const crackStartRef = useRef<number | null>(null);
  const blastStartRef = useRef<number | null>(null);

  const shards = useMemo(() => {
    return Array.from({ length: 24 }, (_, index) => {
      const phi = Math.acos(1 - (2 * (index + 0.5)) / 24);
      const theta = Math.PI * (1 + Math.sqrt(5)) * index;
      const direction = new THREE.Vector3(Math.cos(theta) * Math.sin(phi), Math.sin(theta) * Math.sin(phi), Math.cos(phi)).normalize();
      const radius = 0.86 + (index % 3) * 0.08;

      return {
        base: direction.clone().multiplyScalar(radius),
        drift: direction.clone().multiplyScalar(3.2 + (index % 5) * 0.3)
      };
    });
  }, []);

  useFrame((state, delta) => {
    const elapsed = state.clock.elapsedTime;

    if (phase === "crack" && crackStartRef.current === null) {
      crackStartRef.current = elapsed;
    }

    if (phase === "blast" && blastStartRef.current === null) {
      blastStartRef.current = elapsed;
    }

    const crackProgress =
      phase === "idle"
        ? 0
        : phase === "crack"
          ? Math.min(1, (elapsed - (crackStartRef.current ?? elapsed)) / 0.9)
          : 1;

    const blastProgress =
      phase === "blast"
        ? Math.min(1, (elapsed - (blastStartRef.current ?? elapsed)) / 0.5)
        : 0;

    if (coreRef.current) {
      coreRef.current.rotation.x += delta * 0.28;
      coreRef.current.rotation.y += delta * 0.34;
      coreRef.current.scale.setScalar(1 + crackProgress * 0.08 + blastProgress * 1.45);
    }

    if (crackRef.current) {
      crackRef.current.rotation.x -= delta * 0.18;
      crackRef.current.rotation.y += delta * 0.22;

      const crackMaterial = crackRef.current.material as THREE.MeshStandardMaterial;
      crackMaterial.emissiveIntensity = 0.08 + crackProgress * 1.25 + blastProgress * 0.8;
      crackMaterial.opacity = 0.35 + crackProgress * 0.55 - blastProgress * 0.32;
    }

    if (glowRef.current) {
      glowRef.current.scale.setScalar(1.05 + crackProgress * 0.55 + blastProgress * 2.8);
      const glowMaterial = glowRef.current.material as THREE.MeshBasicMaterial;
      glowMaterial.opacity = 0.1 + crackProgress * 0.2 + blastProgress * 0.42;
    }

    shardRefs.current.forEach((shard, index) => {
      if (!shard) {
        return;
      }

      const config = shards[index];
      const blastOffset = config.drift.clone().multiplyScalar(blastProgress);
      const position = config.base.clone().add(blastOffset);

      shard.position.set(position.x, position.y, position.z);
      shard.rotation.x += delta * (0.65 + index * 0.01);
      shard.rotation.y += delta * (0.55 + index * 0.013);
      shard.rotation.z += delta * (0.46 + index * 0.009);

      const shardMaterial = shard.material as THREE.MeshStandardMaterial;
      shardMaterial.opacity = 0.25 + crackProgress * 0.55 - blastProgress * 0.45;
    });
  });

  return (
    <group>
      <mesh ref={coreRef}>
        <icosahedronGeometry args={[0.64, 2]} />
        <meshStandardMaterial color="#727881" roughness={0.78} metalness={0.18} />
      </mesh>

      <mesh ref={crackRef}>
        <icosahedronGeometry args={[0.665, 2]} />
        <meshStandardMaterial color="#14171c" emissive="#d5e2ff" emissiveIntensity={0.08} wireframe transparent opacity={0.4} />
      </mesh>

      <mesh ref={glowRef}>
        <sphereGeometry args={[0.68, 32, 32]} />
        <meshBasicMaterial color="#f5f8ff" transparent opacity={0.12} />
      </mesh>

      {shards.map((shard, index) => (
        <mesh
          key={`asteroid-shard-${index}`}
          ref={(mesh) => {
            shardRefs.current[index] = mesh;
          }}
          position={shard.base.toArray() as [number, number, number]}
          scale={0.08 + (index % 3) * 0.015}
        >
          <icosahedronGeometry args={[1, 0]} />
          <meshStandardMaterial color="#aab6c8" roughness={0.6} metalness={0.16} transparent opacity={0.28} />
        </mesh>
      ))}
    </group>
  );
}

export function LandingIntroSequence({ onComplete }: LandingIntroSequenceProps) {
  const [phase, setPhase] = useState<IntroPhase>("idle");
  const [flashActive, setFlashActive] = useState(false);

  useEffect(() => {
    document.documentElement.classList.add("landing-intro-lock");

    const crackTimer = window.setTimeout(() => {
      setPhase("crack");
    }, 1300);

    const blastTimer = window.setTimeout(() => {
      setPhase("blast");
    }, 2500);

    const flashTimer = window.setTimeout(() => {
      setFlashActive(true);
    }, 2780);

    const completeTimer = window.setTimeout(() => {
      document.documentElement.classList.remove("landing-intro-lock");
      onComplete();
    }, 3400);

    return () => {
      window.clearTimeout(crackTimer);
      window.clearTimeout(blastTimer);
      window.clearTimeout(flashTimer);
      window.clearTimeout(completeTimer);
      document.documentElement.classList.remove("landing-intro-lock");
    };
  }, [onComplete]);

  return (
    <div className={`landing-intro-overlay ${phase === "blast" ? "phase-blast" : ""}`} aria-hidden="true">
      <Canvas dpr={[1, 1.3]} camera={{ position: [0, 0, 3.2], fov: 50 }} gl={{ antialias: true, alpha: true }}>
        <ambientLight intensity={0.25} />
        <pointLight position={[2.1, 1.4, 2.5]} intensity={1.15} color="#b2c2db" />
        <pointLight position={[-1.8, -1.4, 1.8]} intensity={0.65} color="#91a8c8" />
        <AsteroidCore phase={phase} />
      </Canvas>

      <div className={`landing-intro-flash ${flashActive ? "is-active" : ""}`} />
    </div>
  );
}
