import { MutableRefObject, useLayoutEffect, useMemo, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei/core/OrbitControls";
import { Line } from "@react-three/drei/core/Line";
import { Sky } from "@react-three/drei/core/Sky";
import * as THREE from "three";
import { clamp } from "../sim/defaults";
import { MissionEngine } from "../sim/engine";
import { getBeetleIntroVisualState } from "../sim/intro";
import { SimulationSnapshot, TargetState, Vec3 } from "../sim/types";

export type CameraMode = "follow" | "overview" | "dock" | "manual";

interface SimulationSceneProps {
  engineRef: MutableRefObject<MissionEngine>;
  snapshot: SimulationSnapshot;
  introProgress: number;
  isIntroActive: boolean;
  isExpanded: boolean;
  controlsHidden: boolean;
  playbackSpeed: number;
  playbackSpeedOptions: number[];
  onPlaybackSpeedChange: (value: number) => void;
  cameraMode: CameraMode;
  onCameraModeChange: (mode: CameraMode) => void;
}

const DENSE_TARGET_RENDER_THRESHOLD = 900;

function toScenePosition(point: Vec3, snapshot: SimulationSnapshot): THREE.Vector3 {
  const scale = snapshot.renderScaleMPerUnit;
  const halfLength = snapshot.params.fieldLengthM / (2 * scale);
  const halfWidth = snapshot.params.fieldWidthM / (2 * scale);

  return new THREE.Vector3(
    point.x / scale - halfLength,
    point.y / scale,
    point.z / scale - halfWidth
  );
}

function toSceneTuple(point: Vec3, snapshot: SimulationSnapshot): [number, number, number] {
  const scenePoint = toScenePosition(point, snapshot);
  return [scenePoint.x, scenePoint.y, scenePoint.z];
}

function shouldExposeVisualTestState(): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  return new URLSearchParams(window.location.search).get("visualTest") === "1";
}

function sceneNoise(a: number, b: number): number {
  const value = Math.sin(a * 127.1 + b * 311.7) * 43758.5453123;
  return value - Math.floor(value);
}

function SceneCameraRig({
  engineRef,
  snapshot,
  cameraMode,
  isIntroActive
}: {
  engineRef: MutableRefObject<MissionEngine>;
  snapshot: SimulationSnapshot;
  cameraMode: CameraMode;
  isIntroActive: boolean;
}): JSX.Element {
  const controlsRef = useRef<any>(null);
  const desiredPosition = useRef(new THREE.Vector3(10, 8, 10));
  const desiredTarget = useRef(new THREE.Vector3());
  const { camera } = useThree();

  useFrame((_state, delta) => {
    const engine = engineRef.current;
    const dronePoint = toScenePosition(engine.drone.position, snapshot);
    const dockPoint = toScenePosition(snapshot.dockPosition, snapshot);
    const fieldLength = snapshot.params.fieldLengthM / snapshot.renderScaleMPerUnit;
    const fieldWidth = snapshot.params.fieldWidthM / snapshot.renderScaleMPerUnit;
    const halfDiagonal = Math.sqrt(fieldLength * fieldLength + fieldWidth * fieldWidth) * 0.5;

    if (cameraMode === "follow") {
      const heading = engine.drone.headingRad;
      const back = new THREE.Vector3(-Math.cos(heading), 0, -Math.sin(heading));
      desiredTarget.current.copy(dronePoint).add(new THREE.Vector3(0, 0.35, 0));
      desiredPosition.current
        .copy(dronePoint)
        .add(back.multiplyScalar(3.6))
        .add(new THREE.Vector3(0, 2.15, 2.25));
    } else if (cameraMode === "dock") {
      desiredTarget.current.set(0, 0.5, 0);
      desiredPosition.current.copy(dockPoint).add(new THREE.Vector3(-2.2, 3.1, 6.2));
    } else if (cameraMode === "overview") {
      if (isIntroActive) {
        // During the pre-roll, bias the overview toward the invasion edge so seeded beetles are readable.
        desiredTarget.current.set(-fieldLength * 0.24, 0.42, 0);
        desiredPosition.current.set(-fieldLength * 0.46, 9.2, halfDiagonal * 0.46);
      } else {
        desiredTarget.current.set(0, 0.4, 0);
        desiredPosition.current.set(halfDiagonal * 0.5, 7.6, halfDiagonal * 0.88);
      }
    }

    if (cameraMode !== "manual") {
      const easing = 1 - Math.exp(-delta * 2.3);
      camera.position.lerp(desiredPosition.current, easing);
      if (controlsRef.current) {
        controlsRef.current.target.lerp(desiredTarget.current, easing);
        controlsRef.current.update();
      } else {
        camera.lookAt(desiredTarget.current);
      }
    } else if (controlsRef.current) {
      controlsRef.current.update();
    }
  });

  return (
    <OrbitControls
      ref={controlsRef}
      enablePan={cameraMode === "manual"}
      enableRotate
      enableZoom
      maxPolarAngle={Math.PI * 0.48}
      minDistance={4}
      maxDistance={30}
      target={[0, 0.4, 0]}
    />
  );
}

function SceneVisualTestProbe({
  snapshot,
  introProgress,
  isIntroActive,
  enabled,
  effectiveCameraMode
}: {
  snapshot: SimulationSnapshot;
  introProgress: number;
  isIntroActive: boolean;
  enabled: boolean;
  effectiveCameraMode: CameraMode;
}): JSX.Element | null {
  const { camera, size } = useThree();

  useFrame(() => {
    if (!enabled || typeof window === "undefined") {
      return;
    }

    const visibleBeetles = snapshot.targets
      .filter((target) => target.alive)
      .map((target) => {
        const introState = getBeetleIntroVisualState(target, introProgress);
        const point = toScenePosition(target.position, snapshot).add(
          new THREE.Vector3(0, 0.01 + introState.spawnLiftSceneUnits, 0)
        );
        const projected = point.project(camera);
        const screenX = ((projected.x + 1) * 0.5) * size.width;
        const screenY = ((1 - projected.y) * 0.5) * size.height;
        const insideViewport =
          projected.z >= -1 &&
          projected.z <= 1 &&
          screenX >= 0 &&
          screenX <= size.width &&
          screenY >= 0 &&
          screenY <= size.height;

        return {
          id: target.id,
          screenX,
          screenY,
          settleProgress: introState.settleProgress,
          opacityFactor: introState.opacityFactor,
          visible: insideViewport && introState.opacityFactor > 0.6
        };
      })
      .filter((entry) => entry.visible);

    (window as Window & {
      __PHOTONIC_TEST_STATE__?: Record<string, unknown>;
    }).__PHOTONIC_TEST_STATE__ = {
      canvasWidth: size.width,
      canvasHeight: size.height,
      introProgress,
      isIntroActive,
      cameraMode: effectiveCameraMode,
      visibleBeetles
    };
  });

  return null;
}

function CropCanopy({ snapshot }: { snapshot: SimulationSnapshot }): JSX.Element {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const instances = useMemo(() => {
    const rowCount = Math.max(1, Math.round(snapshot.params.fieldWidthM / snapshot.params.rowSpacingM));
    const spacingM = 3.4;
    const columns = Math.max(6, Math.floor(snapshot.params.fieldLengthM / spacingM));
    const points: Array<{
      position: [number, number, number];
      scale: [number, number, number];
      rotationY: number;
    }> = [];

    for (let row = 0; row < rowCount; row += 1) {
      const rowZ = row * snapshot.params.rowSpacingM + snapshot.params.rowSpacingM * 0.5;
      for (let column = 0; column < columns; column += 1) {
        const x = 1.7 + column * spacingM;
        if (x > snapshot.params.fieldLengthM - 1.2) {
          continue;
        }

        const n1 = sceneNoise(row * 0.31, column * 0.71);
        const n2 = sceneNoise(row * 0.62 + 3, column * 0.19 + 7);
        const point = toScenePosition(
          {
            x,
            y: 0.16 + n1 * 0.06,
            z: rowZ + (n1 - 0.5) * snapshot.params.rowSpacingM * 0.24
          },
          snapshot
        );

        points.push({
          position: [point.x, point.y, point.z],
          scale: [0.11 + n1 * 0.12, 0.06 + n2 * 0.05, 0.13 + n2 * 0.09],
          rotationY: n2 * Math.PI
        });
      }
    }

    return points;
  }, [snapshot]);

  useLayoutEffect(() => {
    if (!meshRef.current) {
      return;
    }

    for (let index = 0; index < instances.length; index += 1) {
      const instance = instances[index];
      dummy.position.set(instance.position[0], instance.position[1], instance.position[2]);
      dummy.rotation.set(0, instance.rotationY, 0);
      dummy.scale.set(instance.scale[0], instance.scale[1], instance.scale[2]);
      dummy.updateMatrix();
      meshRef.current.setMatrixAt(index, dummy.matrix);
    }

    meshRef.current.instanceMatrix.needsUpdate = true;
  }, [dummy, instances]);

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, instances.length]} castShadow receiveShadow>
      <sphereGeometry args={[1, 7, 7]} />
      <meshStandardMaterial color="#5d8e56" roughness={0.93} />
    </instancedMesh>
  );
}

function FieldSurface({ snapshot }: { snapshot: SimulationSnapshot }): JSX.Element {
  const fieldLength = snapshot.params.fieldLengthM / snapshot.renderScaleMPerUnit;
  const fieldWidth = snapshot.params.fieldWidthM / snapshot.renderScaleMPerUnit;
  const rowCount = Math.max(1, Math.round(snapshot.params.fieldWidthM / snapshot.params.rowSpacingM));
  const rowWidth = (snapshot.params.rowSpacingM / snapshot.renderScaleMPerUnit) * 0.68;

  return (
    <group>
      <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.025, 0]}>
        <planeGeometry args={[fieldLength + 12, fieldWidth + 12]} />
        <meshStandardMaterial color="#241d18" roughness={1} />
      </mesh>

      <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.004, 0]}>
        <planeGeometry args={[fieldLength + 1, fieldWidth + 1]} />
        <meshStandardMaterial color="#3b2d23" roughness={1} />
      </mesh>

      {Array.from({ length: rowCount }).map((_, rowIndex) => {
        const rowCenter = rowIndex * snapshot.params.rowSpacingM + snapshot.params.rowSpacingM * 0.5;
        const sceneRow = toScenePosition({ x: snapshot.params.fieldLengthM * 0.5, y: 0.05, z: rowCenter }, snapshot);

        return (
          <mesh key={rowIndex} position={[0, 0.01, sceneRow.z]} receiveShadow>
            <boxGeometry args={[fieldLength, 0.025, rowWidth]} />
            <meshStandardMaterial color="#6e5735" roughness={0.96} />
          </mesh>
        );
      })}

      <CropCanopy snapshot={snapshot} />
    </group>
  );
}

function DockActor({
  snapshot,
  charging
}: {
  snapshot: SimulationSnapshot;
  charging: boolean;
}): JSX.Element {
  const dock = toScenePosition(snapshot.dockPosition, snapshot);
  const glow = charging ? "#79dcb4" : "#f2bf6d";

  return (
    <group position={[dock.x, dock.y, dock.z]}>
      <mesh receiveShadow castShadow position={[0, 0.04, 0]}>
        <cylinderGeometry args={[0.72, 0.82, 0.08, 32]} />
        <meshStandardMaterial color="#2b3638" metalness={0.45} roughness={0.5} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.08, 0]}>
        <ringGeometry args={[0.45, 0.66, 32]} />
        <meshBasicMaterial color={glow} transparent opacity={0.75} />
      </mesh>
      <mesh castShadow receiveShadow position={[-0.95, 0.36, 0]}>
        <boxGeometry args={[0.48, 0.62, 0.42]} />
        <meshStandardMaterial color="#424d52" metalness={0.35} roughness={0.52} />
      </mesh>
      <mesh castShadow position={[-0.95, 0.83, 0]}>
        <boxGeometry args={[0.18, 0.38, 0.18]} />
        <meshStandardMaterial color="#5d6c74" metalness={0.4} roughness={0.38} />
      </mesh>
      <mesh position={[-0.95, 0.83, 0.11]}>
        <boxGeometry args={[0.08, 0.08, 0.05]} />
        <meshBasicMaterial color={glow} />
      </mesh>
    </group>
  );
}

function SearchFootprint({
  engineRef,
  snapshot
}: {
  engineRef: MutableRefObject<MissionEngine>;
  snapshot: SimulationSnapshot;
}): JSX.Element {
  const ringRef = useRef<THREE.Mesh>(null);

  useFrame(({ clock }) => {
    if (!ringRef.current) {
      return;
    }

    const engine = engineRef.current;
    const point = toScenePosition(engine.drone.position, snapshot);
    ringRef.current.visible = engine.drone.mode === "searching";
    ringRef.current.position.set(point.x, 0.025, point.z);
    const pulse = 1 + Math.sin(clock.elapsedTime * 2.8) * 0.04;
    ringRef.current.scale.setScalar(pulse);
  });

  return (
    <mesh ref={ringRef} rotation={[-Math.PI / 2, 0, 0]}>
      <ringGeometry
        args={[
          snapshot.params.detectionRadiusM / snapshot.renderScaleMPerUnit * 0.82,
          snapshot.params.detectionRadiusM / snapshot.renderScaleMPerUnit,
          48
        ]}
      />
      <meshBasicMaterial color="#8eddb6" transparent opacity={0.24} depthWrite={false} />
    </mesh>
  );
}

function LaserBeam({
  engineRef,
  snapshot
}: {
  engineRef: MutableRefObject<MissionEngine>;
  snapshot: SimulationSnapshot;
}): JSX.Element {
  const beamRef = useRef<THREE.Mesh>(null);
  const impactRef = useRef<THREE.Mesh>(null);
  const start = useMemo(() => new THREE.Vector3(), []);
  const end = useMemo(() => new THREE.Vector3(), []);
  const direction = useMemo(() => new THREE.Vector3(), []);
  const midpoint = useMemo(() => new THREE.Vector3(), []);

  useFrame(({ clock }) => {
    if (!beamRef.current || !impactRef.current) {
      return;
    }

    const engine = engineRef.current;
    const targetId = engine.drone.activeTargetId;
    const target = targetId !== null ? engine.targets[targetId] : null;
    const visible = engine.drone.mode === "firing" && !!target && target.alive;

    beamRef.current.visible = visible;
    impactRef.current.visible = visible;

    if (!visible || !target) {
      return;
    }

    start.copy(toScenePosition(engine.drone.position, snapshot)).add(new THREE.Vector3(0, 0.02, 0));
    end.copy(toScenePosition(target.position, snapshot)).add(new THREE.Vector3(0, 0.03, 0));
    direction.subVectors(end, start);
    const length = direction.length();
    midpoint.copy(start).addScaledVector(direction, 0.5);

    beamRef.current.position.copy(midpoint);
    beamRef.current.scale.set(1, length, 1);
    beamRef.current.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      direction.normalize()
    );

    impactRef.current.position.copy(end);
    const pulse = 0.8 + Math.sin(clock.elapsedTime * 24) * 0.15;
    impactRef.current.scale.setScalar(pulse);
  });

  return (
    <>
      <mesh ref={beamRef} visible={false}>
        <cylinderGeometry args={[0.014, 0.026, 1, 12, 1, true]} />
        <meshBasicMaterial color="#ff6a4d" transparent opacity={0.78} depthWrite={false} />
      </mesh>
      <mesh ref={impactRef} visible={false}>
        <sphereGeometry args={[0.06, 18, 18]} />
        <meshBasicMaterial color="#ffd08a" transparent opacity={0.95} depthWrite={false} />
      </mesh>
    </>
  );
}

function DroneActor({
  engineRef,
  snapshot
}: {
  engineRef: MutableRefObject<MissionEngine>;
  snapshot: SimulationSnapshot;
}): JSX.Element {
  const groupRef = useRef<THREE.Group>(null);
  const rotorsRef = useRef<Array<THREE.Mesh | null>>([]);
  const targetPosition = useMemo(() => new THREE.Vector3(), []);

  useFrame(({ clock }, delta) => {
    if (!groupRef.current) {
      return;
    }

    const engine = engineRef.current;
    const drone = engine.drone;
    const scenePoint = toScenePosition(drone.position, snapshot);
    targetPosition.copy(scenePoint);
    targetPosition.y += Math.sin(clock.elapsedTime * 7.4) * 0.004;
    groupRef.current.position.lerp(targetPosition, 1 - Math.exp(-delta * 12));
    groupRef.current.rotation.order = "YXZ";
    groupRef.current.rotation.y = -drone.headingRad + Math.PI * 0.5;
    groupRef.current.rotation.x = drone.pitchRad;
    groupRef.current.rotation.z = drone.rollRad;

    for (let index = 0; index < rotorsRef.current.length; index += 1) {
      const rotor = rotorsRef.current[index];
      if (rotor) {
        rotor.rotation.y += delta * 35;
      }
    }
  });

  return (
    <group ref={groupRef}>
      <mesh castShadow receiveShadow position={[0, 0.18, 0]}>
        <boxGeometry args={[0.46, 0.1, 0.28]} />
        <meshStandardMaterial color="#d8e0e3" metalness={0.72} roughness={0.28} />
      </mesh>
      <mesh castShadow receiveShadow position={[0, 0.09, 0]}>
        <cylinderGeometry args={[0.12, 0.16, 0.18, 24]} />
        <meshStandardMaterial color="#49565f" metalness={0.6} roughness={0.35} />
      </mesh>
      <mesh castShadow receiveShadow position={[0, 0.18, 0]} rotation={[0, 0, Math.PI / 4]}>
        <boxGeometry args={[1.08, 0.035, 0.05]} />
        <meshStandardMaterial color="#596971" metalness={0.48} roughness={0.34} />
      </mesh>
      <mesh castShadow receiveShadow position={[0, 0.18, 0]} rotation={[0, 0, -Math.PI / 4]}>
        <boxGeometry args={[1.08, 0.035, 0.05]} />
        <meshStandardMaterial color="#596971" metalness={0.48} roughness={0.34} />
      </mesh>
      <mesh castShadow position={[0, 0.16, 0.23]}>
        <boxGeometry args={[0.12, 0.08, 0.12]} />
        <meshStandardMaterial color="#1f2427" metalness={0.35} roughness={0.4} />
      </mesh>
      <mesh castShadow position={[0, 0.02, 0]}>
        <boxGeometry args={[0.1, 0.06, 0.1]} />
        <meshStandardMaterial color="#1b2022" metalness={0.25} roughness={0.42} />
      </mesh>

      {[
        [0.37, 0.19, 0.37],
        [-0.37, 0.19, 0.37],
        [0.37, 0.19, -0.37],
        [-0.37, 0.19, -0.37]
      ].map((position, index) => (
        <group key={index} position={position as [number, number, number]}>
          <mesh castShadow receiveShadow position={[0, -0.03, 0]}>
            <cylinderGeometry args={[0.06, 0.08, 0.09, 18]} />
            <meshStandardMaterial color="#2f3940" metalness={0.45} roughness={0.32} />
          </mesh>
          <mesh ref={(element) => (rotorsRef.current[index] = element)} position={[0, 0.02, 0]}>
            <cylinderGeometry args={[0.02, 0.02, 0.02, 10]} />
            <meshBasicMaterial color="#f4fbff" transparent opacity={0.65} />
          </mesh>
          <mesh position={[0, 0.02, 0]}>
            <cylinderGeometry args={[0.26, 0.26, 0.012, 32]} />
            <meshBasicMaterial color="#dfe7ea" transparent opacity={0.25} depthWrite={false} />
          </mesh>
        </group>
      ))}

      <mesh castShadow position={[0.12, -0.02, 0.18]}>
        <cylinderGeometry args={[0.012, 0.012, 0.48, 12]} />
        <meshStandardMaterial color="#44525b" metalness={0.38} roughness={0.46} />
      </mesh>
      <mesh castShadow position={[-0.12, -0.02, 0.18]}>
        <cylinderGeometry args={[0.012, 0.012, 0.48, 12]} />
        <meshStandardMaterial color="#44525b" metalness={0.38} roughness={0.46} />
      </mesh>
      <mesh castShadow position={[0.12, -0.02, -0.18]}>
        <cylinderGeometry args={[0.012, 0.012, 0.48, 12]} />
        <meshStandardMaterial color="#44525b" metalness={0.38} roughness={0.46} />
      </mesh>
      <mesh castShadow position={[-0.12, -0.02, -0.18]}>
        <cylinderGeometry args={[0.012, 0.012, 0.48, 12]} />
        <meshStandardMaterial color="#44525b" metalness={0.38} roughness={0.46} />
      </mesh>
    </group>
  );
}

function DenseBeetleCloud({
  snapshot,
  introProgress,
  excludedTargetIds
}: {
  snapshot: SimulationSnapshot;
  introProgress: number;
  excludedTargetIds: Set<number>;
}): JSX.Element | null {
  const payload = useMemo(() => {
    const fieldAreaHectares = (snapshot.params.fieldLengthM * snapshot.params.fieldWidthM) / 10_000;
    const visibilityBoost = clamp(Math.sqrt(fieldAreaHectares), 1, 3.2);
    const aliveTargets = snapshot.targets.filter(
      (target) => target.alive && !excludedTargetIds.has(target.id)
    );

    if (aliveTargets.length === 0) {
      return {
        count: 0,
        positions: new Float32Array(),
        colors: new Float32Array(),
        pointSize: 6
      };
    }

    const positions = new Float32Array(aliveTargets.length * 3);
    const colors = new Float32Array(aliveTargets.length * 3);
    const knownColor = new THREE.Color("#ffd48d");
    const seededColor = new THREE.Color("#e0ae66");
    const beaconLift = 0.035 * visibilityBoost;
    const pointSize = clamp(4.8 + visibilityBoost * 1.6, 4.8, 9.2);

    for (let index = 0; index < aliveTargets.length; index += 1) {
      const target = aliveTargets[index];
      const point = toScenePosition(target.position, snapshot);
      const introState = getBeetleIntroVisualState(target, introProgress);
      const color = target.discovered ? knownColor : seededColor;
      const offset = index * 3;

      positions[offset] = point.x;
      positions[offset + 1] = point.y + beaconLift + introState.spawnLiftSceneUnits;
      positions[offset + 2] = point.z;
      colors[offset] = color.r;
      colors[offset + 1] = color.g;
      colors[offset + 2] = color.b;
    }

    return {
      count: aliveTargets.length,
      positions,
      colors,
      pointSize
    };
  }, [excludedTargetIds, introProgress, snapshot]);

  if (payload.count === 0) {
    return null;
  }

  return (
    <points frustumCulled={false} renderOrder={4}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[payload.positions, 3]} />
        <bufferAttribute attach="attributes-color" args={[payload.colors, 3]} />
      </bufferGeometry>
      <pointsMaterial
        size={payload.pointSize}
        sizeAttenuation={false}
        vertexColors
        transparent
        opacity={0.96}
        depthWrite={false}
      />
    </points>
  );
}

function BeetleMarker({
  snapshot,
  target,
  active,
  introProgress
}: {
  snapshot: SimulationSnapshot;
  target: TargetState;
  active: boolean;
  introProgress: number;
}): JSX.Element {
  const point = toScenePosition(target.position, snapshot);
  const introState = getBeetleIntroVisualState(target, introProgress);
  const fieldAreaHectares = (snapshot.params.fieldLengthM * snapshot.params.fieldWidthM) / 10_000;
  const visibilityBoost = clamp(Math.sqrt(fieldAreaHectares), 1, 3.2);
  const aliveScale = 0.062 + target.detectionPulse * 0.02 + (active ? 0.024 : 0);
  const neutralizedScale = 0.03 + target.neutralizationPulse * 0.016;
  const scale =
    (target.alive ? aliveScale : neutralizedScale) * introState.scaleFactor;
  const opacity = target.alive
    ? target.discovered
      ? 0.96
      : 0.84
    : Math.max(0.12, target.neutralizationPulse * 0.6);
  const animatedOpacity = opacity * introState.opacityFactor;
  const color = target.alive ? (target.discovered ? "#ffd178" : "#e0ae66") : "#666963";
  const shadowScale =
    scale * (1.1 + (1 - introState.settleProgress) * 0.55);
  const haloColor = active ? "#ff8a61" : target.discovered ? "#ffd48d" : "#f0bd74";
  const haloOpacity = animatedOpacity * (active ? 0.95 : target.discovered ? 0.82 : 0.74);
  const beaconHeight = scale * 2.9 * visibilityBoost;
  const beaconRadius = scale * (active ? 0.72 : 0.58) * visibilityBoost;
  const beaconStemRadius = scale * 0.11 * Math.sqrt(visibilityBoost);

  return (
    <group
      position={[
        point.x,
        point.y + 0.01 + introState.spawnLiftSceneUnits,
        point.z
      ]}
    >
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, -introState.spawnLiftSceneUnits - 0.004, 0]}
      >
        <ringGeometry args={[shadowScale * 0.52, shadowScale * 1.16, 20]} />
        <meshBasicMaterial
          color="#120e0a"
          transparent
          opacity={animatedOpacity * 0.22}
          depthWrite={false}
        />
      </mesh>
      <mesh
        castShadow
        scale={[
          scale * 0.8,
          scale * 0.56 * introState.landingSquash,
          scale
        ]}
      >
        <sphereGeometry args={[1, 12, 12]} />
        <meshStandardMaterial
          color={color}
          emissive={target.alive ? haloColor : "#1d201d"}
          emissiveIntensity={target.alive ? 0.24 : 0.08}
          transparent
          opacity={animatedOpacity}
          roughness={0.46}
        />
      </mesh>
      {target.alive ? (
        <>
          {/* Visual beacon is deliberately non-physical so all seeded beetles remain legible from the intro overview. */}
          <mesh position={[0, beaconHeight * 0.48, 0]}>
            <cylinderGeometry args={[beaconStemRadius, beaconStemRadius, beaconHeight, 12]} />
            <meshBasicMaterial color={haloColor} transparent opacity={haloOpacity * 0.42} depthWrite={false} />
          </mesh>
          <mesh position={[0, beaconHeight, 0]}>
            <sphereGeometry args={[beaconRadius, 12, 12]} />
            <meshBasicMaterial color={haloColor} transparent opacity={haloOpacity} depthWrite={false} />
          </mesh>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, beaconHeight * 0.72, 0]}>
            <ringGeometry args={[scale * 1.4 * visibilityBoost, scale * 2.5 * visibilityBoost, 28]} />
            <meshBasicMaterial color={haloColor} transparent opacity={haloOpacity * 0.9} depthWrite={false} />
          </mesh>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]}>
            <ringGeometry args={[scale * 1.05, scale * 1.8, 24]} />
            <meshBasicMaterial color={haloColor} transparent opacity={haloOpacity * 0.62} depthWrite={false} />
          </mesh>
        </>
      ) : null}
      {target.alive && active ? (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, beaconHeight * 0.72, 0]}>
          <ringGeometry args={[scale * 2.12, scale * 2.72, 28]} />
          <meshBasicMaterial color="#ff8a61" transparent opacity={0.48} depthWrite={false} />
        </mesh>
      ) : null}
    </group>
  );
}

function BeetleTargets({
  snapshot,
  introProgress
}: {
  snapshot: SimulationSnapshot;
  introProgress: number;
}): JSX.Element {
  const useDenseMode = snapshot.targets.length >= DENSE_TARGET_RENDER_THRESHOLD;

  if (useDenseMode) {
    const highlightTargets = snapshot.targets.filter(
      (target) =>
        target.id === snapshot.drone.activeTargetId ||
        target.neutralizationPulse > 0.05
    );
    const excludedTargetIds = new Set(highlightTargets.map((target) => target.id));

    return (
      <group>
        <DenseBeetleCloud
          snapshot={snapshot}
          introProgress={introProgress}
          excludedTargetIds={excludedTargetIds}
        />
        {highlightTargets.map((target) => (
          <BeetleMarker
            key={target.id}
            snapshot={snapshot}
            target={target}
            active={snapshot.drone.activeTargetId === target.id}
            introProgress={introProgress}
          />
        ))}
      </group>
    );
  }

  return (
    <group>
      {snapshot.targets.map((target) => (
        <BeetleMarker
          key={target.id}
          snapshot={snapshot}
          target={target}
          active={snapshot.drone.activeTargetId === target.id}
          introProgress={introProgress}
        />
      ))}
    </group>
  );
}

function MissionLines({ snapshot }: { snapshot: SimulationSnapshot }): JSX.Element {
  const sweepPoints = useMemo(
    () => snapshot.sweepPath.map((point) => toSceneTuple(point, snapshot)),
    [snapshot]
  );
  const trailPoints = useMemo(
    () => snapshot.pathHistory.map((point) => toSceneTuple(point, snapshot)),
    [snapshot]
  );

  return (
    <>
      {snapshot.params.targetingMode === "search" && sweepPoints.length > 1 ? (
        <Line
          points={sweepPoints}
          color="#416a63"
          transparent
          opacity={0.24}
          lineWidth={1}
          dashed
          dashSize={0.35}
          gapSize={0.22}
        />
      ) : null}
      {trailPoints.length > 1 ? (
        <Line
          points={trailPoints}
          color="#91e6d4"
          transparent
          opacity={0.7}
          lineWidth={2.1}
        />
      ) : null}
    </>
  );
}

function SceneContents({
  engineRef,
  snapshot,
  introProgress,
  isIntroActive,
  effectiveCameraMode,
  exposeVisualTestState,
  useDenseTargetRendering
}: {
  engineRef: MutableRefObject<MissionEngine>;
  snapshot: SimulationSnapshot;
  introProgress: number;
  isIntroActive: boolean;
  effectiveCameraMode: CameraMode;
  exposeVisualTestState: boolean;
  useDenseTargetRendering: boolean;
}): JSX.Element {
  const fieldLength = snapshot.params.fieldLengthM / snapshot.renderScaleMPerUnit;
  const fieldWidth = snapshot.params.fieldWidthM / snapshot.renderScaleMPerUnit;

  return (
    <>
      <fog attach="fog" args={["#10231d", 10, 30]} />
      <hemisphereLight color="#d8f4de" groundColor="#2d2016" intensity={0.88} />
      <ambientLight intensity={0.35} />
      <directionalLight
        castShadow
        position={[7.5, 10.5, 4.2]}
        intensity={2.2}
        color="#fff4d6"
        shadow-mapSize-width={useDenseTargetRendering ? 1024 : 2048}
        shadow-mapSize-height={useDenseTargetRendering ? 1024 : 2048}
        shadow-camera-near={0.5}
        shadow-camera-far={28}
        shadow-camera-left={-14}
        shadow-camera-right={14}
        shadow-camera-top={14}
        shadow-camera-bottom={-14}
      />
      <Sky
        distance={450000}
        sunPosition={[12, 3.2, 8]}
        inclination={0.32}
        azimuth={0.18}
        turbidity={8}
        rayleigh={0.85}
        mieCoefficient={0.018}
        mieDirectionalG={0.78}
      />

      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.08, 0]} receiveShadow>
        <planeGeometry args={[fieldLength + 18, fieldWidth + 18]} />
        <meshStandardMaterial color="#18231c" roughness={1} />
      </mesh>

      <FieldSurface snapshot={snapshot} />
      <DockActor snapshot={snapshot} charging={snapshot.drone.mode === "charging"} />
      <MissionLines snapshot={snapshot} />
      <SearchFootprint engineRef={engineRef} snapshot={snapshot} />
      <BeetleTargets snapshot={snapshot} introProgress={introProgress} />
      <DroneActor engineRef={engineRef} snapshot={snapshot} />
      <LaserBeam engineRef={engineRef} snapshot={snapshot} />
      <SceneCameraRig
        engineRef={engineRef}
        snapshot={snapshot}
        cameraMode={effectiveCameraMode}
        isIntroActive={isIntroActive}
      />
      <SceneVisualTestProbe
        snapshot={snapshot}
        introProgress={introProgress}
        isIntroActive={isIntroActive}
        enabled={exposeVisualTestState}
        effectiveCameraMode={effectiveCameraMode}
      />
    </>
  );
}

export function SimulationScene({
  engineRef,
  snapshot,
  introProgress,
  isIntroActive,
  isExpanded,
  controlsHidden,
  playbackSpeed,
  playbackSpeedOptions,
  onPlaybackSpeedChange,
  cameraMode,
  onCameraModeChange
}: SimulationSceneProps): JSX.Element {
  const effectiveCameraMode = isIntroActive ? "overview" : cameraMode;
  const exposeVisualTestState = useMemo(() => shouldExposeVisualTestState(), []);
  const useDenseTargetRendering = snapshot.targets.length >= DENSE_TARGET_RENDER_THRESHOLD;
  const canvasDpr: [number, number] = useDenseTargetRendering
    ? [1, isExpanded ? 1.2 : 1.1]
    : [1, isExpanded ? 1.6 : 1.2];

  return (
    <div className="scene-shell">
      {isExpanded && !controlsHidden ? (
        <div className="scene-toolbar">
          <div className="scene-toolbar-copy">
            <label className="scene-select">
              <span>Playback</span>
              <select
                value={String(playbackSpeed)}
                onChange={(event) => onPlaybackSpeedChange(Number(event.target.value))}
              >
                {playbackSpeedOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}x
                  </option>
                ))}
              </select>
            </label>
            <span className="small-pill">Visual scale 1:{snapshot.renderScaleMPerUnit}</span>
            {isIntroActive ? <span className="small-pill">Seeding infestation</span> : null}
            {isIntroActive ? <span className="small-pill">Intro camera: overview</span> : null}
            {useDenseTargetRendering ? <span className="small-pill">Dense render mode</span> : null}
          </div>
          <div className="camera-switcher">
            {(["follow", "overview", "dock", "manual"] as CameraMode[]).map((mode) => (
              <button
                key={mode}
                className={cameraMode === mode ? "camera-button active" : "camera-button"}
                onClick={() => onCameraModeChange(mode)}
              >
                {mode}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <Canvas
        shadows
        dpr={canvasDpr}
        camera={{ position: [8, 7, 9], fov: 42 }}
        gl={{ antialias: !useDenseTargetRendering }}
      >
        <SceneContents
          engineRef={engineRef}
          snapshot={snapshot}
          introProgress={introProgress}
          isIntroActive={isIntroActive}
          effectiveCameraMode={effectiveCameraMode}
          exposeVisualTestState={exposeVisualTestState}
          useDenseTargetRendering={useDenseTargetRendering}
        />
      </Canvas>
    </div>
  );
}
