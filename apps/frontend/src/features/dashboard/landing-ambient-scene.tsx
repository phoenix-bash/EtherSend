"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";

type ThemeMode = "light" | "dark";

interface LandingAmbientSceneProps {
  theme: ThemeMode;
}

interface MeshNode {
  base: THREE.Vector3;
  driftAmplitude: number;
  driftSpeed: number;
  phase: number;
}

interface EdgeLink {
  from: number;
  to: number;
}

function createSeededRandom(seed: number): () => number {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let t = Math.imul(value ^ (value >>> 15), 1 | value);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function buildNodeField(columns: number, rows: number, seed: number): MeshNode[] {
  const random = createSeededRandom(seed);
  const nodes: MeshNode[] = [];
  const spanX = 13.6;
  const spanY = 7.9;

  for (let row = 0; row < rows; row += 1) {
    const rowFactor = rows === 1 ? 0 : row / (rows - 1);
    const y = spanY / 2 - rowFactor * spanY;

    for (let column = 0; column < columns; column += 1) {
      const columnFactor = columns === 1 ? 0 : column / (columns - 1);
      const x = -spanX / 2 + columnFactor * spanX;

      nodes.push({
        base: new THREE.Vector3(x + (random() - 0.5) * 0.24, y + (random() - 0.5) * 0.22, (random() - 0.5) * 1.2),
        driftAmplitude: 0.045 + random() * 0.07,
        driftSpeed: 0.25 + random() * 0.24,
        phase: random() * Math.PI * 2
      });
    }
  }

  return nodes;
}

function buildEdgeLinks(nodes: MeshNode[]): EdgeLink[] {
  const pairMap = new Set<string>();
  const links: EdgeLink[] = [];

  for (let index = 0; index < nodes.length; index += 1) {
    const source = nodes[index];
    const nearest = nodes
      .map((target, targetIndex) => {
        if (targetIndex === index) {
          return { targetIndex, distance: Number.POSITIVE_INFINITY };
        }

        return { targetIndex, distance: source.base.distanceTo(target.base) };
      })
      .sort((left, right) => left.distance - right.distance)
      .slice(0, 5)
      .filter((entry) => entry.distance < 1.42);

    nearest.forEach(({ targetIndex }) => {
      const from = Math.min(index, targetIndex);
      const to = Math.max(index, targetIndex);
      const key = `${from}:${to}`;

      if (pairMap.has(key)) {
        return;
      }

      pairMap.add(key);
      links.push({ from, to });
    });
  }

  return links;
}

function AstralMesh({ theme }: { theme: ThemeMode }) {
  const rootRef = useRef<THREE.Group | null>(null);
  const pointerRef = useRef(new THREE.Vector2(0, 0));

  const pointGeometry = useMemo(() => new THREE.BufferGeometry(), []);
  const lineGeometry = useMemo(() => new THREE.BufferGeometry(), []);
  const starGeometry = useMemo(() => new THREE.BufferGeometry(), []);

  const nodes = useMemo(() => buildNodeField(20, 12, 1407), []);
  const links = useMemo(() => buildEdgeLinks(nodes), [nodes]);

  const nodePositions = useMemo(() => new Float32Array(nodes.length * 3), [nodes.length]);
  const linePositions = useMemo(() => new Float32Array(links.length * 6), [links.length]);

  const starPositions = useMemo(() => {
    const random = createSeededRandom(2701);
    const count = 320;
    const data = new Float32Array(count * 3);

    for (let index = 0; index < count; index += 1) {
      const radius = 5.5 + random() * 4.6;
      const angle = random() * Math.PI * 2;
      const y = (random() - 0.5) * 7;

      data[index * 3] = Math.cos(angle) * radius;
      data[index * 3 + 1] = y;
      data[index * 3 + 2] = -3 + random() * 3.2;
    }

    return data;
  }, []);

  useEffect(() => {
    function onPointerMove(event: PointerEvent): void {
      pointerRef.current.x = (event.clientX / window.innerWidth) * 2 - 1;
      pointerRef.current.y = -((event.clientY / window.innerHeight) * 2 - 1);
    }

    function onPointerLeave(): void {
      pointerRef.current.x = 0;
      pointerRef.current.y = 0;
    }

    window.addEventListener("pointermove", onPointerMove, { passive: true });
    window.addEventListener("pointerleave", onPointerLeave, { passive: true });

    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerleave", onPointerLeave);
    };
  }, []);

  useMemo(() => {
    pointGeometry.setAttribute("position", new THREE.BufferAttribute(nodePositions, 3));
    lineGeometry.setAttribute("position", new THREE.BufferAttribute(linePositions, 3));
    starGeometry.setAttribute("position", new THREE.BufferAttribute(starPositions, 3));
  }, [lineGeometry, linePositions, nodePositions, pointGeometry, starGeometry, starPositions]);

  useFrame((state) => {
    const elapsed = state.clock.elapsedTime;
    const pointerX = pointerRef.current.x;
    const pointerY = pointerRef.current.y;
    const pointerWorld = new THREE.Vector3(pointerX * 6.1, pointerY * 3.6, -0.28);

    for (let index = 0; index < nodes.length; index += 1) {
      const node = nodes[index];
      const motion = elapsed * node.driftSpeed + node.phase;
      const secondary = elapsed * (node.driftSpeed * 0.57 + 0.09) + node.phase * 1.63;
      const tertiary = elapsed * (node.driftSpeed * 1.41 + 0.17) + (index % 11) * 0.42;
      const collective = Math.sin(elapsed * 0.33 + node.base.x * 0.25 + node.base.y * 0.18);
      const burst = Math.sin(elapsed * 0.92 + index * 0.31) * Math.cos(elapsed * 0.47 + index * 0.17);

      let x =
        node.base.x +
        Math.sin(motion) * node.driftAmplitude +
        Math.cos(secondary) * node.driftAmplitude * 0.52 +
        Math.sin(tertiary) * node.driftAmplitude * 0.31 +
        collective * 0.03 +
        burst * 0.015;

      let y =
        node.base.y +
        Math.cos(motion * 0.86) * node.driftAmplitude * 0.82 +
        Math.sin(secondary * 1.11) * node.driftAmplitude * 0.48 +
        Math.cos(elapsed * 0.27 + node.base.x * 0.21) * 0.02 +
        burst * 0.012;

      let z =
        node.base.z +
        Math.sin(motion * 1.18) * node.driftAmplitude * 0.58 +
        Math.cos(tertiary * 0.74) * node.driftAmplitude * 0.42 +
        burst * 0.01;

      const dx = x - pointerWorld.x;
      const dy = y - pointerWorld.y;
      const dz = z - pointerWorld.z;
      const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
      const reactionRadius = 0.92;

      if (distance < reactionRadius) {
        const safeDistance = Math.max(distance, 0.001);
        const push = (1 - safeDistance / reactionRadius) * 0.22;

        x += (dx / safeDistance) * push;
        y += (dy / safeDistance) * push;
        z += (dz / safeDistance) * push * 0.6;
      }

      const cursorOffset = index * 3;
      nodePositions[cursorOffset] = x;
      nodePositions[cursorOffset + 1] = y;
      nodePositions[cursorOffset + 2] = z;
    }

    for (let index = 0; index < links.length; index += 1) {
      const { from, to } = links[index];
      const lineCursor = index * 6;
      const fromCursor = from * 3;
      const toCursor = to * 3;

      linePositions[lineCursor] = nodePositions[fromCursor];
      linePositions[lineCursor + 1] = nodePositions[fromCursor + 1];
      linePositions[lineCursor + 2] = nodePositions[fromCursor + 2];

      linePositions[lineCursor + 3] = nodePositions[toCursor];
      linePositions[lineCursor + 4] = nodePositions[toCursor + 1];
      linePositions[lineCursor + 5] = nodePositions[toCursor + 2];
    }

    const nodeAttribute = pointGeometry.getAttribute("position") as THREE.BufferAttribute;
    const lineAttribute = lineGeometry.getAttribute("position") as THREE.BufferAttribute;
    nodeAttribute.needsUpdate = true;
    lineAttribute.needsUpdate = true;

    if (rootRef.current) {
      rootRef.current.rotation.y = THREE.MathUtils.lerp(rootRef.current.rotation.y, pointerX * 0.052, 0.026);
      rootRef.current.rotation.x = THREE.MathUtils.lerp(rootRef.current.rotation.x, -pointerY * 0.032, 0.026);
      rootRef.current.position.x = THREE.MathUtils.lerp(rootRef.current.position.x, pointerX * 0.075, 0.022);
      rootRef.current.position.y = THREE.MathUtils.lerp(rootRef.current.position.y, pointerY * 0.06, 0.022);
    }

    state.camera.position.x = THREE.MathUtils.lerp(state.camera.position.x, pointerX * 0.16, 0.022);
    state.camera.position.y = THREE.MathUtils.lerp(state.camera.position.y, pointerY * 0.11, 0.022);
    state.camera.lookAt(0, 0, -0.2);
  });

  const colors =
    theme === "dark"
      ? {
          stars: "#a2aab2",
          links: "#98a1aa",
          nodes: "#d6dde4",
          glow: "#b5bcc4"
        }
      : {
          stars: "#7289a1",
          links: "#667e97",
          nodes: "#4f6882",
          glow: "#869cb3"
        };

  return (
    <group ref={rootRef}>
      <points geometry={starGeometry}>
        <pointsMaterial
          color={colors.stars}
          size={0.03}
          transparent
          opacity={theme === "dark" ? 0.36 : 0.34}
          sizeAttenuation
          depthWrite={false}
        />
      </points>

      <lineSegments geometry={lineGeometry}>
        <lineBasicMaterial color={colors.links} transparent opacity={theme === "dark" ? 0.28 : 0.25} blending={THREE.AdditiveBlending} />
      </lineSegments>

      <points geometry={pointGeometry}>
        <pointsMaterial color={colors.nodes} size={0.043} transparent opacity={0.62} sizeAttenuation depthWrite={false} />
      </points>

      <points geometry={pointGeometry}>
        <pointsMaterial
          color={colors.glow}
          size={0.09}
          transparent
          opacity={theme === "dark" ? 0.21 : 0.19}
          sizeAttenuation
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </points>
    </group>
  );
}

export function LandingAmbientScene({ theme }: LandingAmbientSceneProps) {
  return (
    <div className="landing-ambient-scene pointer-events-none absolute inset-0 z-[1] overflow-hidden" aria-hidden="true">
      <Canvas dpr={[1, 1.45]} camera={{ position: [0, 0, 8.6], fov: 50 }} gl={{ antialias: true, alpha: true }}>
        <AstralMesh theme={theme} />
      </Canvas>
    </div>
  );
}