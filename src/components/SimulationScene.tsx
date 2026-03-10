import { MutableRefObject, useLayoutEffect, useMemo, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import { OrbitControls } from "@react-three/drei/core/OrbitControls";
import { Line } from "@react-three/drei/core/Line";
import { Sky } from "@react-three/drei/core/Sky";
import * as THREE from "three";
import { clamp } from "../sim/defaults";
import { MissionEngine } from "../sim/engine";
import { getBeetleIntroVisualState } from "../sim/intro";
import {
  estimatedDroneLengthM,
  metersToSceneUnits,
  nominalDroneModelScale,
  NOMINAL_TARGET_MARKER_HEIGHT_M
} from "../sim/rendering";
import { FarmerState, SimulationSnapshot, TargetState, Vec3 } from "../sim/types";
import { shouldRenderMarkerForTarget } from "../sim/visuals";

export type CameraMode = "follow" | "overview" | "dock" | "manual";
export interface SafetyEditorPreviewState {
  previewFarmerDistanceM: number;
  nominalSafetyZoneRadiusM: number;
  farmerSelected: boolean;
  onToggleFarmerSelection: () => void;
}

interface SimulationSceneProps {
  engineRef: MutableRefObject<MissionEngine>;
  snapshot: SimulationSnapshot;
  introProgress: number;
  isIntroActive: boolean;
  isExpanded: boolean;
  controlsHidden: boolean;
  isMobileUi: boolean;
  mobileMenuOpen: boolean;
  playbackSpeed: number;
  playbackSpeedOptions: number[];
  onPlaybackSpeedChange: (value: number) => void;
  cameraMode: CameraMode;
  onCameraModeChange: (mode: CameraMode) => void;
  safetyEditorPreview: SafetyEditorPreviewState | null;
}

const DENSE_TARGET_RENDER_THRESHOLD = 900;
const NOMINAL_SAFETY_ZONE_PERSIST_SECONDS = 0.55;
const SAFETY_EDITOR_FLOOR_SIZE_UNITS = 8;

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
  const fieldLength = snapshot.params.fieldLengthM / snapshot.renderScaleMPerUnit;
  const fieldWidth = snapshot.params.fieldWidthM / snapshot.renderScaleMPerUnit;
  const halfDiagonal = Math.sqrt(fieldLength * fieldLength + fieldWidth * fieldWidth) * 0.5;
  const followDroneLength = metersToSceneUnits(
    estimatedDroneLengthM(snapshot.params.droneMassKg),
    snapshot.renderScaleMPerUnit
  );
  const manualMinDistance = Math.max(followDroneLength * 2.2, 0.45);
  const manualMaxDistance = Math.max(halfDiagonal * 2.35, 65);
  const manualPanSpeed = clamp(halfDiagonal / 18, 1.2, 3.2);
  const manualZoomSpeed = 1.1;
  const manualRotateSpeed = 0.7;

  useFrame((_state, delta) => {
    const engine = engineRef.current;
    const dronePoint = toScenePosition(engine.drone.position, snapshot);
    const dockPoint = toScenePosition(snapshot.dockPosition, snapshot);

    if (cameraMode === "follow") {
      const heading = engine.drone.headingRad;
      const back = new THREE.Vector3(-Math.cos(heading), 0, -Math.sin(heading));
      const followDistance = clamp(followDroneLength * 8.4, 1.45, 2.5);
      const followHeight = clamp(followDroneLength * 4.6, 0.8, 1.28);
      const lateralOffset = clamp(followDroneLength * 2.6, 0.42, 0.72);
      desiredTarget.current.copy(dronePoint).add(new THREE.Vector3(0, followDroneLength * 0.9, 0));
      desiredPosition.current
        .copy(dronePoint)
        .add(back.multiplyScalar(followDistance))
        .add(new THREE.Vector3(0, followHeight, lateralOffset));
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
      enableDamping
      dampingFactor={0.08}
      screenSpacePanning
      zoomSpeed={manualZoomSpeed}
      panSpeed={manualPanSpeed}
      rotateSpeed={manualRotateSpeed}
      maxPolarAngle={Math.PI * 0.48}
      minPolarAngle={0.1}
      minDistance={manualMinDistance}
      maxDistance={manualMaxDistance}
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
          scale: [0.04 + n1 * 0.035, 0.022 + n2 * 0.02, 0.05 + n2 * 0.04],
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
  const padRadius = metersToSceneUnits(0.95, snapshot.renderScaleMPerUnit);
  const padThickness = metersToSceneUnits(0.08, snapshot.renderScaleMPerUnit);
  const ringInnerRadius = metersToSceneUnits(0.55, snapshot.renderScaleMPerUnit);
  const ringOuterRadius = metersToSceneUnits(0.75, snapshot.renderScaleMPerUnit);
  const cabinetSize: [number, number, number] = [
    metersToSceneUnits(0.55, snapshot.renderScaleMPerUnit),
    metersToSceneUnits(0.7, snapshot.renderScaleMPerUnit),
    metersToSceneUnits(0.46, snapshot.renderScaleMPerUnit)
  ];
  const mastSize: [number, number, number] = [
    metersToSceneUnits(0.16, snapshot.renderScaleMPerUnit),
    metersToSceneUnits(0.45, snapshot.renderScaleMPerUnit),
    metersToSceneUnits(0.16, snapshot.renderScaleMPerUnit)
  ];
  const statusLightSize: [number, number, number] = [
    metersToSceneUnits(0.08, snapshot.renderScaleMPerUnit),
    metersToSceneUnits(0.08, snapshot.renderScaleMPerUnit),
    metersToSceneUnits(0.05, snapshot.renderScaleMPerUnit)
  ];

  return (
    <group position={[dock.x, dock.y, dock.z]}>
      <mesh receiveShadow castShadow position={[0, 0.04, 0]}>
        <cylinderGeometry args={[padRadius, padRadius * 1.08, padThickness, 32]} />
        <meshStandardMaterial color="#2b3638" metalness={0.45} roughness={0.5} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.08, 0]}>
        <ringGeometry args={[ringInnerRadius, ringOuterRadius, 32]} />
        <meshBasicMaterial color={glow} transparent opacity={0.75} />
      </mesh>
      <mesh castShadow receiveShadow position={[-padRadius - cabinetSize[0] * 0.9, cabinetSize[1] * 0.5, 0]}>
        <boxGeometry args={cabinetSize} />
        <meshStandardMaterial color="#424d52" metalness={0.35} roughness={0.52} />
      </mesh>
      <mesh castShadow position={[-padRadius - cabinetSize[0] * 0.9, cabinetSize[1] + mastSize[1] * 0.5, 0]}>
        <boxGeometry args={mastSize} />
        <meshStandardMaterial color="#5d6c74" metalness={0.4} roughness={0.38} />
      </mesh>
      <mesh
        position={[
          -padRadius - cabinetSize[0] * 0.9,
          cabinetSize[1] + mastSize[1] * 0.5,
          statusLightSize[2] * 0.55 + mastSize[2] * 0.5
        ]}
      >
        <boxGeometry args={statusLightSize} />
        <meshBasicMaterial color={glow} />
      </mesh>
    </group>
  );
}

function ReferenceActors({ snapshot }: { snapshot: SimulationSnapshot }): JSX.Element {
  const serviceLaneCenter = toScenePosition(
    {
      x: -5.5,
      y: 0.01,
      z: snapshot.params.fieldWidthM * 0.5
    },
    snapshot
  );
  const carPoint = toScenePosition(
    {
      x: -4.2,
      y: 0.02,
      z: snapshot.params.fieldWidthM * 0.5 - 8.5
    },
    snapshot
  );
  const laneSize: [number, number, number] = [
    metersToSceneUnits(9.5, snapshot.renderScaleMPerUnit),
    metersToSceneUnits(0.03, snapshot.renderScaleMPerUnit),
    metersToSceneUnits(22, snapshot.renderScaleMPerUnit)
  ];
  const carLength = metersToSceneUnits(4.6, snapshot.renderScaleMPerUnit);
  const carWidth = metersToSceneUnits(1.82, snapshot.renderScaleMPerUnit);
  const carHeight = metersToSceneUnits(1.58, snapshot.renderScaleMPerUnit);
  const wheelRadius = metersToSceneUnits(0.33, snapshot.renderScaleMPerUnit);
  const wheelThickness = metersToSceneUnits(0.18, snapshot.renderScaleMPerUnit);

  return (
    <group>
      <mesh position={[serviceLaneCenter.x, 0, serviceLaneCenter.z]} receiveShadow>
        <boxGeometry args={laneSize} />
        <meshStandardMaterial color="#5d615e" roughness={0.94} />
      </mesh>

      <group position={[carPoint.x, 0, carPoint.z]} rotation={[0, Math.PI / 2, 0]}>
        <mesh castShadow receiveShadow position={[0, wheelRadius + carHeight * 0.28, 0]}>
          <boxGeometry args={[carLength, carHeight * 0.52, carWidth]} />
          <meshStandardMaterial color="#c9d2d7" metalness={0.42} roughness={0.34} />
        </mesh>
        <mesh castShadow receiveShadow position={[0, wheelRadius + carHeight * 0.62, 0]}>
          <boxGeometry args={[carLength * 0.48, carHeight * 0.44, carWidth * 0.86]} />
          <meshStandardMaterial color="#dfe6ea" metalness={0.38} roughness={0.3} />
        </mesh>
        {[
          [carLength * 0.32, wheelRadius, carWidth * 0.42],
          [-carLength * 0.32, wheelRadius, carWidth * 0.42],
          [carLength * 0.32, wheelRadius, -carWidth * 0.42],
          [-carLength * 0.32, wheelRadius, -carWidth * 0.42]
        ].map((position, index) => (
          <mesh
            key={index}
            castShadow
            receiveShadow
            rotation={[Math.PI / 2, 0, 0]}
            position={position as [number, number, number]}
          >
            <cylinderGeometry args={[wheelRadius, wheelRadius, wheelThickness, 18]} />
            <meshStandardMaterial color="#1f2427" roughness={0.82} />
          </mesh>
        ))}
      </group>
    </group>
  );
}

function FarmerActor({
  farmer,
  snapshot,
  shirtColor = "#506f8d",
  legColor = "#3c464c"
}: {
  farmer: FarmerState;
  snapshot: SimulationSnapshot;
  shirtColor?: string;
  legColor?: string;
}): JSX.Element {
  const point = toScenePosition(farmer.position, snapshot);
  const farmerHeight = metersToSceneUnits(farmer.heightM, snapshot.renderScaleMPerUnit);
  const farmerShoulderWidth = metersToSceneUnits(farmer.shoulderWidthM, snapshot.renderScaleMPerUnit);

  return (
    <group position={[point.x, point.y, point.z]} rotation={[0, -farmer.headingRad + Math.PI * 0.5, 0]}>
      <mesh castShadow position={[0, farmerHeight * 0.5, 0]}>
        <cylinderGeometry
          args={[
            farmerShoulderWidth * 0.24,
            farmerShoulderWidth * 0.28,
            farmerHeight * 0.36,
            12
          ]}
        />
        <meshStandardMaterial color={shirtColor} roughness={0.78} />
      </mesh>
      <mesh castShadow position={[0, farmerHeight * 0.84, 0]}>
        <sphereGeometry args={[farmerHeight * 0.09, 12, 12]} />
        <meshStandardMaterial color="#d0b191" roughness={0.92} />
      </mesh>
      {[-1, 1].map((side) => (
        <mesh key={side} castShadow position={[farmerShoulderWidth * 0.12 * side, farmerHeight * 0.2, 0]}>
          <cylinderGeometry args={[farmerShoulderWidth * 0.06, farmerShoulderWidth * 0.07, farmerHeight * 0.42, 10]} />
          <meshStandardMaterial color={legColor} roughness={0.84} />
        </mesh>
      ))}
    </group>
  );
}

function WalkingFarmers({ snapshot }: { snapshot: SimulationSnapshot }): JSX.Element {
  return (
    <group>
      {snapshot.farmers.map((farmer) => (
        <FarmerActor key={farmer.id} farmer={farmer} snapshot={snapshot} />
      ))}
    </group>
  );
}

function DroneVisual({
  droneScale,
  rotorSpinScale = 1,
  bodyColor = "#d8e0e3"
}: {
  droneScale: number;
  rotorSpinScale?: number;
  bodyColor?: string;
}): JSX.Element {
  const rotorsRef = useRef<Array<THREE.Mesh | null>>([]);

  useFrame((_state, delta) => {
    for (let index = 0; index < rotorsRef.current.length; index += 1) {
      const rotor = rotorsRef.current[index];
      if (rotor) {
        rotor.rotation.y += delta * 35 * rotorSpinScale;
      }
    }
  });

  return (
    <group scale={[droneScale, droneScale, droneScale]}>
      <mesh castShadow receiveShadow position={[0, 0.18, 0]}>
        <boxGeometry args={[0.46, 0.1, 0.28]} />
        <meshStandardMaterial color={bodyColor} metalness={0.72} roughness={0.28} />
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

function SafetyEditorPreview({
  snapshot,
  preview
}: {
  snapshot: SimulationSnapshot;
  preview: SafetyEditorPreviewState;
}): JSX.Element {
  const { camera, size } = useThree();
  const droneScale = nominalDroneModelScale(
    snapshot.params.droneMassKg,
    snapshot.renderScaleMPerUnit
  );
  const droneHoverHeight = metersToSceneUnits(snapshot.params.engageAltitudeM, snapshot.renderScaleMPerUnit);
  const farmerDistanceUnits = metersToSceneUnits(
    preview.previewFarmerDistanceM,
    snapshot.renderScaleMPerUnit
  );
  const actualDistanceM = preview.previewFarmerDistanceM;
  const insideNominalSafetyZone = actualDistanceM <= preview.nominalSafetyZoneRadiusM;
  const groundInnerRadius = metersToSceneUnits(0.18, snapshot.renderScaleMPerUnit);
  const groundOuterRadius = metersToSceneUnits(0.3, snapshot.renderScaleMPerUnit);
  const farmerPosition: [number, number, number] = [farmerDistanceUnits, 0, 0];
  const lineY = droneHoverHeight * 0.56;
  const nominalRadiusSceneUnits = metersToSceneUnits(
    preview.nominalSafetyZoneRadiusM,
    snapshot.renderScaleMPerUnit
  );
  const farmerHeight = metersToSceneUnits(1.78, snapshot.renderScaleMPerUnit);
  const farmerShoulderWidth = metersToSceneUnits(0.48, snapshot.renderScaleMPerUnit);
  const farmerWarningMessage = insideNominalSafetyZone
    ? `Farmer in NSZ: ${actualDistanceM.toFixed(1)} m from the beam, inside the ${preview.nominalSafetyZoneRadiusM.toFixed(1)} m nominal safety zone.`
    : `Farmer clear: ${actualDistanceM.toFixed(1)} m from the beam, outside the ${preview.nominalSafetyZoneRadiusM.toFixed(1)} m nominal safety zone.`;

  useFrame(() => {
    if (!shouldExposeVisualTestState() || typeof window === "undefined") {
      return;
    }

    const projected = new THREE.Vector3(
      farmerPosition[0],
      farmerHeight * 0.5,
      farmerPosition[2]
    ).project(camera);

    (window as Window & { __PHOTONIC_SAFETY_PREVIEW__?: Record<string, number> }).__PHOTONIC_SAFETY_PREVIEW__ =
      {
        farmerScreenX: ((projected.x + 1) * 0.5) * size.width,
        farmerScreenY: ((1 - projected.y) * 0.5) * size.height
      };
  });

  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.015, 0]} receiveShadow>
        <planeGeometry args={[SAFETY_EDITOR_FLOOR_SIZE_UNITS, SAFETY_EDITOR_FLOOR_SIZE_UNITS]} />
        <meshStandardMaterial color="#071311" roughness={0.98} metalness={0.08} />
      </mesh>
      <gridHelper
        args={[SAFETY_EDITOR_FLOOR_SIZE_UNITS, 32, "#3bd4a0", "#12392f"]}
        position={[0, 0.001, 0]}
      />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.002, 0]}>
        <ringGeometry args={[nominalRadiusSceneUnits * 0.98, nominalRadiusSceneUnits, 96]} />
        <meshBasicMaterial color="#ff8a61" transparent opacity={0.78} depthWrite={false} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.001, 0]}>
        <circleGeometry args={[nominalRadiusSceneUnits, 96]} />
        <meshBasicMaterial color="#ff7b5c" transparent opacity={0.08} depthWrite={false} />
      </mesh>
      <Line
        points={[
          [0, lineY, 0],
          [farmerPosition[0], lineY, farmerPosition[2]]
        ]}
        color={insideNominalSafetyZone ? "#ff8a61" : "#7ad7b1"}
        transparent
        opacity={0.78}
        lineWidth={1.5}
      />
      <group position={[0, droneHoverHeight, 0]} rotation={[0, Math.PI * 0.35, 0]}>
        <DroneVisual
          droneScale={droneScale}
          rotorSpinScale={0.75}
          bodyColor={insideNominalSafetyZone ? "#d7dde1" : "#d4ece4"}
        />
      </group>
      <group position={farmerPosition} rotation={[0, Math.PI, 0]}>
        <mesh position={[0, farmerHeight * 0.46, 0]}>
          <cylinderGeometry
            args={[
              farmerShoulderWidth * 0.42,
              farmerShoulderWidth * 0.46,
              farmerHeight * 1.05,
              16
            ]}
          />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
        <Html
          position={[0, farmerHeight * 0.56, 0]}
          center
          transform={false}
          occlude={false}
        >
          <div className="safety-farmer-hitbox" />
        </Html>
        <mesh castShadow position={[0, farmerHeight * 0.5, 0]}>
          <cylinderGeometry
            args={[
              farmerShoulderWidth * 0.24,
              farmerShoulderWidth * 0.28,
              farmerHeight * 0.36,
              12
            ]}
          />
          <meshStandardMaterial
            color={insideNominalSafetyZone ? "#8b4a3e" : "#3f725b"}
            roughness={0.78}
          />
        </mesh>
        <mesh castShadow position={[0, farmerHeight * 0.84, 0]}>
          <sphereGeometry args={[farmerHeight * 0.09, 12, 12]} />
          <meshStandardMaterial color="#d0b191" roughness={0.92} />
        </mesh>
        {[-1, 1].map((side) => (
          <mesh
            key={side}
            castShadow
            position={[farmerShoulderWidth * 0.12 * side, farmerHeight * 0.2, 0]}
          >
            <cylinderGeometry
              args={[
                farmerShoulderWidth * 0.06,
                farmerShoulderWidth * 0.07,
                farmerHeight * 0.42,
                10
              ]}
            />
            <meshStandardMaterial
              color={insideNominalSafetyZone ? "#3d2620" : "#263630"}
              roughness={0.84}
            />
          </mesh>
        ))}
        <Html
          position={[0, farmerHeight + metersToSceneUnits(0.38, snapshot.renderScaleMPerUnit), 0]}
          center
          transform={false}
          occlude={false}
        >
          <div
            className={`safety-farmer-bubble${
              insideNominalSafetyZone ? " safety-farmer-bubble-warn" : " safety-farmer-bubble-clear"
            }`}
          >
            <strong>{insideNominalSafetyZone ? "Farmer in NSZ" : "Farmer clear"}</strong>
            <span>{farmerWarningMessage}</span>
            <em>Farmer metrics remain visible at right.</em>
          </div>
        </Html>
      </group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[farmerPosition[0], 0.02, farmerPosition[2]]}>
        <ringGeometry args={[groundInnerRadius, groundOuterRadius, 32]} />
        <meshBasicMaterial
          color={insideNominalSafetyZone ? "#ff8a61" : "#7ad7b1"}
          transparent
          opacity={0.88}
          depthWrite={false}
        />
      </mesh>
      {[-1.8, -0.8, 0.9, 1.9].map((x, index) => (
        <mesh key={index} position={[x, 0.8 + index * 0.12, -2.2 + index * 0.4]}>
          <boxGeometry args={[0.03, 1.6 + index * 0.2, 0.03]} />
          <meshBasicMaterial color={index % 2 === 0 ? "#2ce29f" : "#0d8b67"} transparent opacity={0.38} />
        </mesh>
      ))}
    </group>
  );
}

function SafetyEditorCameraRig({
  snapshot,
  preview
}: {
  snapshot: SimulationSnapshot;
  preview: SafetyEditorPreviewState;
}): JSX.Element {
  const controlsRef = useRef<any>(null);
  const { camera } = useThree();
  const safetyRadiusSceneUnits = metersToSceneUnits(
    preview.nominalSafetyZoneRadiusM,
    snapshot.renderScaleMPerUnit
  );

  useLayoutEffect(() => {
    const target = new THREE.Vector3(
      Math.min(safetyRadiusSceneUnits * 0.28, 0.35),
      metersToSceneUnits(snapshot.params.engageAltitudeM, snapshot.renderScaleMPerUnit) * 0.62,
      0
    );
    const position = new THREE.Vector3(
      Math.max(1.9, safetyRadiusSceneUnits * 1.25),
      Math.max(1.35, safetyRadiusSceneUnits * 1.1),
      Math.max(2.3, safetyRadiusSceneUnits * 1.9)
    );
    camera.position.copy(position);
    camera.lookAt(target);
    if (controlsRef.current) {
      controlsRef.current.target.copy(target);
      controlsRef.current.update();
    }
  }, [camera, safetyRadiusSceneUnits, snapshot.params.engageAltitudeM, snapshot.renderScaleMPerUnit]);

  return (
    <OrbitControls
      ref={controlsRef}
      enablePan
      enableRotate
      enableZoom
      enableDamping
      dampingFactor={0.08}
      screenSpacePanning
      rotateSpeed={0.8}
      panSpeed={1.2}
      zoomSpeed={1}
      minPolarAngle={0.15}
      maxPolarAngle={Math.PI * 0.48}
      minDistance={1.2}
      maxDistance={8}
      target={[
        Math.min(safetyRadiusSceneUnits * 0.28, 0.35),
        metersToSceneUnits(snapshot.params.engageAltitudeM, snapshot.renderScaleMPerUnit) * 0.62,
        0
      ]}
    />
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

  useFrame(({ clock }, delta) => {
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
  const beamInnerRadius = metersToSceneUnits(0.012, snapshot.renderScaleMPerUnit);
  const beamOuterRadius = metersToSceneUnits(0.022, snapshot.renderScaleMPerUnit);
  const impactRadius = metersToSceneUnits(0.09, snapshot.renderScaleMPerUnit);

  useFrame(({ clock }, delta) => {
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
        <cylinderGeometry args={[beamInnerRadius, beamOuterRadius, 1, 12, 1, true]} />
        <meshBasicMaterial color="#ff6a4d" transparent opacity={0.78} depthWrite={false} />
      </mesh>
      <mesh ref={impactRef} visible={false}>
        <sphereGeometry args={[impactRadius, 18, 18]} />
        <meshBasicMaterial color="#ffd08a" transparent opacity={0.95} depthWrite={false} />
      </mesh>
    </>
  );
}

function LaserSafetyZone({
  engineRef,
  snapshot,
  safetyEditorPreview
}: {
  engineRef: MutableRefObject<MissionEngine>;
  snapshot: SimulationSnapshot;
  safetyEditorPreview: SafetyEditorPreviewState | null;
}): JSX.Element {
  const groupRef = useRef<THREE.Group>(null);
  const shellRef = useRef<THREE.Mesh>(null);
  const ringRef = useRef<THREE.Mesh>(null);
  const pulseRef = useRef<THREE.Mesh>(null);
  const fillRef = useRef<THREE.Mesh>(null);
  const groundPoint = useRef(new THREE.Vector3());
  const tempPoint = useMemo(() => new THREE.Vector3(), []);
  const lastActiveTimeRef = useRef<number>(-NOMINAL_SAFETY_ZONE_PERSIST_SECONDS);
  const nominalRadiusSceneUnits = metersToSceneUnits(
    safetyEditorPreview?.nominalSafetyZoneRadiusM ?? snapshot.nominalSafetyZoneRadiusM,
    snapshot.renderScaleMPerUnit
  );

  useFrame(({ clock }, delta) => {
    if (!groupRef.current || !shellRef.current || !ringRef.current || !pulseRef.current || !fillRef.current) {
      return;
    }

    const engine = engineRef.current;
    const showingEditorPreview = safetyEditorPreview !== null;
    const isFiring = engine.drone.mode === "firing" && engine.drone.activeTargetId !== null;
    const now = clock.elapsedTime;

    if (showingEditorPreview || isFiring) {
      tempPoint.copy(toScenePosition(engine.drone.position, snapshot));
      groundPoint.current.set(tempPoint.x, 0.03, tempPoint.z);
      if (isFiring) {
        lastActiveTimeRef.current = now;
      }
    }

    const secondsSinceActive = now - lastActiveTimeRef.current;
    const tailFade = 1 - clamp(secondsSinceActive / NOMINAL_SAFETY_ZONE_PERSIST_SECONDS, 0, 1);
    const visible = showingEditorPreview || isFiring || tailFade > 0.01;

    groupRef.current.visible = visible;
    if (!visible) {
      return;
    }

    groupRef.current.position.copy(groundPoint.current);
    groupRef.current.rotation.y += delta * 0.7;

    const firingPulse = 0.5 + 0.5 * Math.sin(now * 7.5);
    const pulseStrength = showingEditorPreview
      ? 0.66 + firingPulse * 0.18
      : isFiring
        ? 0.72 + firingPulse * 0.28
        : tailFade;
    const shellOpacity = 0.06 + pulseStrength * 0.08;
    const ringOpacity = 0.16 + pulseStrength * 0.28;
    const fillOpacity = 0.045 + pulseStrength * 0.06;
    const pulseScale =
      showingEditorPreview || isFiring
        ? 0.92 + firingPulse * 0.12
        : 1 + (1 - tailFade) * 0.18;

    shellRef.current.scale.setScalar(1 + pulseStrength * 0.02);
    ringRef.current.scale.setScalar(1);
    pulseRef.current.scale.setScalar(pulseScale);

    (shellRef.current.material as THREE.MeshBasicMaterial).opacity = shellOpacity;
    (ringRef.current.material as THREE.MeshBasicMaterial).opacity = ringOpacity;
    (pulseRef.current.material as THREE.MeshBasicMaterial).opacity = ringOpacity * 0.72 * tailFade;
    (fillRef.current.material as THREE.MeshBasicMaterial).opacity = fillOpacity;
  });

  return (
    <group ref={groupRef} visible={false}>
      {/* Nominal visual keep-out radius for reflected beam hazard; this is not a full eye-safety model. */}
      <mesh ref={fillRef} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.004, 0]}>
        <circleGeometry args={[nominalRadiusSceneUnits, 48]} />
        <meshBasicMaterial color="#ff7b5c" transparent opacity={0.08} depthWrite={false} />
      </mesh>
      <mesh ref={shellRef} position={[0, 0.2, 0]}>
        <cylinderGeometry args={[nominalRadiusSceneUnits, nominalRadiusSceneUnits, 0.4, 64, 1, true]} />
        <meshBasicMaterial color="#ff8657" transparent opacity={0.12} depthWrite={false} side={THREE.DoubleSide} />
      </mesh>
      <mesh ref={ringRef} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.015, 0]}>
        <ringGeometry args={[nominalRadiusSceneUnits * 0.95, nominalRadiusSceneUnits, 64]} />
        <meshBasicMaterial color="#ffb086" transparent opacity={0.34} depthWrite={false} />
      </mesh>
      <mesh ref={pulseRef} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
        <ringGeometry args={[nominalRadiusSceneUnits * 0.78, nominalRadiusSceneUnits * 0.88, 64]} />
        <meshBasicMaterial color="#ffd8a8" transparent opacity={0.26} depthWrite={false} />
      </mesh>
    </group>
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
  const targetPosition = useMemo(() => new THREE.Vector3(), []);
  const droneScale = nominalDroneModelScale(
    snapshot.params.droneMassKg,
    snapshot.renderScaleMPerUnit
  );

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
  });

  return (
    <group ref={groupRef}>
      <DroneVisual droneScale={droneScale} />
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
  const markerBoost = clamp(0.64 + visibilityBoost * 0.28, 0.92, 1.55);
  const beaconHeight = metersToSceneUnits(
    (active ? NOMINAL_TARGET_MARKER_HEIGHT_M : 0.18) * markerBoost,
    snapshot.renderScaleMPerUnit
  );
  const beaconRadius = metersToSceneUnits(
    (active ? 0.045 : 0.035) * markerBoost,
    snapshot.renderScaleMPerUnit
  );
  const beaconStemRadius = metersToSceneUnits(
    (active ? 0.012 : 0.009) * markerBoost,
    snapshot.renderScaleMPerUnit
  );
  const haloInnerRadius = metersToSceneUnits((active ? 0.085 : 0.06) * markerBoost, snapshot.renderScaleMPerUnit);
  const haloOuterRadius = metersToSceneUnits((active ? 0.15 : 0.1) * markerBoost, snapshot.renderScaleMPerUnit);
  const groundInnerRadius = metersToSceneUnits((active ? 0.05 : 0.04) * markerBoost, snapshot.renderScaleMPerUnit);
  const groundOuterRadius = metersToSceneUnits((active ? 0.09 : 0.07) * markerBoost, snapshot.renderScaleMPerUnit);
  const activeOuterInnerRadius = metersToSceneUnits(0.14 * markerBoost, snapshot.renderScaleMPerUnit);
  const activeOuterOuterRadius = metersToSceneUnits(0.19 * markerBoost, snapshot.renderScaleMPerUnit);
  const showMarker = shouldRenderMarkerForTarget(
    target,
    active,
    snapshot.params.showOnlySelectedTargetMarkers
  );

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
      {showMarker ? (
        <>
          {/* Marker beacon is deliberately non-physical; it can be hidden for non-selected targets to reduce clutter. */}
          <mesh position={[0, beaconHeight * 0.48, 0]}>
            <cylinderGeometry args={[beaconStemRadius, beaconStemRadius, beaconHeight, 12]} />
            <meshBasicMaterial color={haloColor} transparent opacity={haloOpacity * 0.42} depthWrite={false} />
          </mesh>
          <mesh position={[0, beaconHeight, 0]}>
            <sphereGeometry args={[beaconRadius, 12, 12]} />
            <meshBasicMaterial color={haloColor} transparent opacity={haloOpacity} depthWrite={false} />
          </mesh>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, beaconHeight * 0.72, 0]}>
            <ringGeometry args={[haloInnerRadius, haloOuterRadius, 28]} />
            <meshBasicMaterial color={haloColor} transparent opacity={haloOpacity * 0.9} depthWrite={false} />
          </mesh>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]}>
            <ringGeometry args={[groundInnerRadius, groundOuterRadius, 24]} />
            <meshBasicMaterial color={haloColor} transparent opacity={haloOpacity * 0.62} depthWrite={false} />
          </mesh>
        </>
      ) : null}
      {target.alive && active ? (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, beaconHeight * 0.72, 0]}>
          <ringGeometry args={[activeOuterInnerRadius, activeOuterOuterRadius, 28]} />
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
  useDenseTargetRendering,
  safetyEditorPreview
}: {
  engineRef: MutableRefObject<MissionEngine>;
  snapshot: SimulationSnapshot;
  introProgress: number;
  isIntroActive: boolean;
  effectiveCameraMode: CameraMode;
  exposeVisualTestState: boolean;
  useDenseTargetRendering: boolean;
  safetyEditorPreview: SafetyEditorPreviewState | null;
}): JSX.Element {
  const fieldLength = snapshot.params.fieldLengthM / snapshot.renderScaleMPerUnit;
  const fieldWidth = snapshot.params.fieldWidthM / snapshot.renderScaleMPerUnit;

  if (safetyEditorPreview) {
    return (
      <>
        <fog attach="fog" args={["#041110", 4, 16]} />
        <color attach="background" args={["#020a09"]} />
        <ambientLight intensity={0.42} color="#7ef0c2" />
        <hemisphereLight color="#6fe3c6" groundColor="#041513" intensity={0.56} />
        <directionalLight
          position={[2.2, 4.8, 3.5]}
          intensity={1.7}
          color="#d7fff1"
          castShadow
          shadow-mapSize-width={1024}
          shadow-mapSize-height={1024}
        />
        <pointLight position={[-2.8, 2.4, -1.7]} intensity={18} distance={10} color="#0ed18f" />
        <pointLight position={[2.6, 1.8, 2.4]} intensity={14} distance={9} color="#ff8d63" />
        <SafetyEditorPreview snapshot={snapshot} preview={safetyEditorPreview} />
        <SafetyEditorCameraRig snapshot={snapshot} preview={safetyEditorPreview} />
      </>
    );
  }

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
      <ReferenceActors snapshot={snapshot} />
      <WalkingFarmers snapshot={snapshot} />
      {safetyEditorPreview ? (
        <SafetyEditorPreview snapshot={snapshot} preview={safetyEditorPreview} />
      ) : null}
      <MissionLines snapshot={snapshot} />
      <SearchFootprint engineRef={engineRef} snapshot={snapshot} />
      <BeetleTargets snapshot={snapshot} introProgress={introProgress} />
      <DroneActor engineRef={engineRef} snapshot={snapshot} />
      <LaserBeam engineRef={engineRef} snapshot={snapshot} />
      <LaserSafetyZone
        engineRef={engineRef}
        snapshot={snapshot}
        safetyEditorPreview={safetyEditorPreview}
      />
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
  isMobileUi,
  mobileMenuOpen,
  playbackSpeed,
  playbackSpeedOptions,
  onPlaybackSpeedChange,
  cameraMode,
  onCameraModeChange,
  safetyEditorPreview
}: SimulationSceneProps): JSX.Element {
  const effectiveCameraMode = isIntroActive ? "overview" : cameraMode;
  const exposeVisualTestState = useMemo(() => shouldExposeVisualTestState(), []);
  const useDenseTargetRendering = snapshot.targets.length >= DENSE_TARGET_RENDER_THRESHOLD;
  const canvasDpr: [number, number] = useDenseTargetRendering
    ? [1, isExpanded ? 1.2 : 1.1]
    : [1, isExpanded ? 1.6 : 1.2];

  return (
    <div className="scene-shell">
      {isExpanded && !controlsHidden && (!isMobileUi || mobileMenuOpen) ? (
        <div className="scene-toolbar">
          <div className="scene-toolbar-copy">
            <label className="scene-select" data-tutorial-id="playback-control">
              <span className="inline-label">
                {isMobileUi ? "Speed" : "Playback"}
                <span
                  className="info-hint"
                  title="Speeds up playback without using a coarser mission timestep, so the simulation stays smooth and physically consistent."
                  aria-label="Playback speed help"
                >
                  i
                </span>
              </span>
              <select
                value={String(playbackSpeed)}
                aria-label="Playback speed"
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
                {isMobileUi
                  ? {
                      follow: "Follow",
                      overview: "Field",
                      dock: "Dock",
                      manual: "Free"
                    }[mode]
                  : mode}
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
        safetyEditorPreview={safetyEditorPreview}
      />
      </Canvas>
    </div>
  );
}
