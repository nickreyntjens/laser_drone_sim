import { MutableRefObject, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import { Text } from "@react-three/drei/core/Text";
import { OrbitControls } from "@react-three/drei/core/OrbitControls";
import { Line } from "@react-three/drei/core/Line";
import { Sky } from "@react-three/drei/core/Sky";
import * as THREE from "three";
import { clamp } from "../sim/defaults";
import { MissionEngine } from "../sim/engine";
import { activeFarmerChatterState, activeFarmerDinnerState, activeFarmerPlacardState } from "../sim/farmers";
import { getFieldProfile } from "../sim/fieldProfiles";
import { distance } from "../sim/math";
import {
  greenhouseAisleCenters,
  greenhouseColumnCenters,
  greenhouseSupportLineCenters,
  GREENHOUSE_BAY_LENGTH_M,
  GREENHOUSE_COLUMN_RADIUS_M,
  GREENHOUSE_GUTTER_HEIGHT_M,
  GREENHOUSE_RIDGE_HEIGHT_M
} from "../sim/greenhouse";
import { orchardTreeCenter } from "../sim/orchard";
import { getBeetleIntroVisualState } from "../sim/intro";
import {
  estimatedDroneLengthM,
  metersToSceneUnits,
  nominalDroneModelScale,
  NOMINAL_TARGET_MARKER_HEIGHT_M
} from "../sim/rendering";
import { FarmerState, FieldType, SimulationSnapshot, TargetState, Vec3 } from "../sim/types";
import { shouldRenderMarkerForTarget } from "../sim/visuals";

export type CameraMode = "follow" | "followSide" | "overview" | "dock" | "manual";
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
  fieldType: FieldType;
  onFieldTypeChange: (value: FieldType) => void;
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

function TargetIcon({ fieldType }: { fieldType: FieldType }): JSX.Element {
  if (fieldType === "potatoColoradoBeetle") {
    return (
      <span className="target-icon target-icon-beetle" aria-hidden="true">
        <span />
        <span />
        <span />
      </span>
    );
  }

  if (fieldType === "riceYellowStemBorerEgg") {
    return (
      <span className="target-icon target-icon-egg" aria-hidden="true">
        <span />
        <span />
        <span />
      </span>
    );
  }

  if (fieldType === "greenhouseTulipCaterpillar") {
    return (
      <span className="target-icon target-icon-caterpillar" aria-hidden="true">
        <span />
        <span />
        <span />
      </span>
    );
  }

  return (
    <span className="target-icon target-icon-stinkbug" aria-hidden="true">
      <span />
      <span />
      <span />
    </span>
  );
}

function FieldTypeDropdown({
  fieldType,
  onChange
}: {
  fieldType: FieldType;
  onChange: (value: FieldType) => void;
}): JSX.Element {
  const [open, setOpen] = useState(false);
  const shellRef = useRef<HTMLDivElement | null>(null);
  const currentProfile = getFieldProfile(fieldType);

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent): void => {
      if (!shellRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    window.addEventListener("pointerdown", handlePointerDown);
    return () => window.removeEventListener("pointerdown", handlePointerDown);
  }, []);

  return (
    <div className="field-type-dropdown" ref={shellRef}>
      <button
        type="button"
        className="field-type-trigger"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        aria-label="Choose field type"
      >
        <TargetIcon fieldType={fieldType} />
        <span className="field-type-copy">
          <strong>Field mode</strong>
          <span>{currentProfile.label}</span>
        </span>
        <span className="field-type-chevron" aria-hidden="true">
          {open ? "\u25b2" : "\u25be"}
        </span>
      </button>
      {open ? (
        <div className="field-type-menu">
          {([
            "potatoColoradoBeetle",
            "riceYellowStemBorerEgg",
            "orchardMarmoratedStinkBug",
            "greenhouseTulipCaterpillar"
          ] as FieldType[]).map((value) => {
            const profile = getFieldProfile(value);
            return (
              <button
                key={value}
                type="button"
                className={value === fieldType ? "field-type-option active" : "field-type-option"}
                onClick={() => {
                  onChange(value);
                  setOpen(false);
                }}
              >
                <TargetIcon fieldType={value} />
                <span>
                  <strong>{profile.cropLabel}</strong>
                  <span>{profile.targetLabelPlural}</span>
                </span>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function getVisualRowMetrics(snapshot: SimulationSnapshot): {
  rowCount: number;
  rowSpacingM: number;
  alongRowPitchM: number;
} {
  const fieldProfile = getFieldProfile(snapshot.params.fieldType);
  if (fieldProfile.cropVisualStyle === "rice") {
    // One rendered tuft stands in for multiple real plants so the paddy stays dense
    // without exploding draw cost on large embedded fields.
    const representedPlantsPerVisualTuft = 40;
    const samplingPitchM = clamp(
      Math.sqrt(representedPlantsPerVisualTuft / fieldProfile.representativePlantDensityPerM2),
      0.72,
      0.9
    );
    const rowCount = clamp(
      Math.round(snapshot.params.fieldWidthM / samplingPitchM),
      40,
      260
    );
    return {
      rowCount,
      rowSpacingM: snapshot.params.fieldWidthM / rowCount,
      alongRowPitchM: samplingPitchM
    };
  }

  const rowCount = Math.max(1, Math.round(snapshot.params.fieldWidthM / snapshot.params.rowSpacingM));
  return {
    rowCount,
    rowSpacingM: snapshot.params.rowSpacingM,
    alongRowPitchM:
      fieldProfile.cropVisualStyle === "orchard"
        ? fieldProfile.inRowPlantSpacingM
        : fieldProfile.cropVisualStyle === "greenhouse"
          ? Math.max(fieldProfile.inRowPlantSpacingM * 2, 0.55)
          : 3.4
  };
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
  const manualMinDistance = 0.02;
  const manualMaxDistance = Number.POSITIVE_INFINITY;
  const manualPanSpeed = clamp(halfDiagonal / 12, 1.8, 4.8);
  const manualZoomSpeed = 1.3;
  const manualRotateSpeed = 0.82;
  const hasActiveFarmerChatter =
    activeFarmerChatterState(
      snapshot.farmers as any,
      snapshot.params.fieldType,
      snapshot.drone.position,
      snapshot.metrics.missionElapsedS
    ).farmerId !== null;

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
    } else if (cameraMode === "followSide") {
      const heading = engine.drone.headingRad;
      const side = new THREE.Vector3(-Math.sin(heading), 0, Math.cos(heading));
      const back = new THREE.Vector3(-Math.cos(heading), 0, -Math.sin(heading));
      const sideDistance = clamp(followDroneLength * 7.1, 1.18, 2.1);
      const backDistance = clamp(followDroneLength * 1.9, 0.24, 0.56);
      const followHeight = clamp(followDroneLength * 3.6, 0.64, 1.02);
      desiredTarget.current.copy(dronePoint).add(new THREE.Vector3(0, followDroneLength * 0.72, 0));
      desiredPosition.current
        .copy(dronePoint)
        .add(side.multiplyScalar(sideDistance))
        .add(back.multiplyScalar(backDistance))
        .add(new THREE.Vector3(0, followHeight, 0));
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
      const easing = 1 - Math.exp(-delta * (hasActiveFarmerChatter ? 0.18 : 2.3));
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
      dampingFactor={hasActiveFarmerChatter ? 0.26 : 0.08}
      screenSpacePanning
      zoomSpeed={hasActiveFarmerChatter ? manualZoomSpeed * 0.13 : manualZoomSpeed}
      panSpeed={hasActiveFarmerChatter ? manualPanSpeed * 0.14 : manualPanSpeed}
      rotateSpeed={hasActiveFarmerChatter ? manualRotateSpeed * 0.15 : manualRotateSpeed}
      zoomToCursor={cameraMode === "manual"}
      maxPolarAngle={Math.PI * 0.495}
      minPolarAngle={0.04}
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

function CropCanopy({ snapshot }: { snapshot: SimulationSnapshot }): JSX.Element | null {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const instances = useMemo(() => {
    const fieldProfile = getFieldProfile(snapshot.params.fieldType);
    if (fieldProfile.cropVisualStyle === "orchard") {
      return [];
    }

    const { rowCount, rowSpacingM, alongRowPitchM } = getVisualRowMetrics(snapshot);
    const spacingM = fieldProfile.cropVisualStyle === "rice" ? alongRowPitchM : 3.4;
    const columns = Math.max(6, Math.floor(snapshot.params.fieldLengthM / spacingM));
    const points: Array<{
      position: [number, number, number];
      scale: [number, number, number];
      rotation: [number, number, number];
    }> = [];

    for (let row = 0; row < rowCount; row += 1) {
      const rowZ = row * rowSpacingM + rowSpacingM * 0.5;
      for (let column = 0; column < columns; column += 1) {
        const x = (fieldProfile.cropVisualStyle === "rice" ? 1.4 : 1.7) + column * spacingM;
        if (x > snapshot.params.fieldLengthM - 1.2) {
          continue;
        }

        const n1 = sceneNoise(row * 0.31, column * 0.71);
        const n2 = sceneNoise(row * 0.62 + 3, column * 0.19 + 7);
        const point = toScenePosition(
          {
            x,
            y:
              fieldProfile.cropVisualStyle === "rice"
                ? fieldProfile.maturePlantHeightM * (0.54 + n1 * 0.14)
                : 0.16 + n1 * 0.06,
            z:
              rowZ +
              (n1 - 0.5) *
                (fieldProfile.cropVisualStyle === "rice" ? rowSpacingM * 0.16 : rowSpacingM * 0.24)
          },
          snapshot
        );

        points.push({
          position: [point.x, point.y, point.z],
          scale:
            fieldProfile.cropVisualStyle === "rice"
              ? [
                  0.005 + n1 * 0.003,
                  metersToSceneUnits(fieldProfile.maturePlantHeightM * (0.74 + n2 * 0.16), snapshot.renderScaleMPerUnit),
                  0.018 + n2 * 0.01
                ]
              : [0.04 + n1 * 0.035, 0.022 + n2 * 0.02, 0.05 + n2 * 0.04],
          rotation:
            fieldProfile.cropVisualStyle === "rice"
              ? [0, n2 * Math.PI, (n1 - 0.5) * 0.45]
              : [0, n2 * Math.PI, 0]
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
      dummy.rotation.set(instance.rotation[0], instance.rotation[1], instance.rotation[2]);
      dummy.scale.set(instance.scale[0], instance.scale[1], instance.scale[2]);
      dummy.updateMatrix();
      meshRef.current.setMatrixAt(index, dummy.matrix);
    }

    meshRef.current.instanceMatrix.needsUpdate = true;
  }, [dummy, instances]);

  if (instances.length === 0) {
    return null;
  }

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, instances.length]} castShadow receiveShadow>
      {getFieldProfile(snapshot.params.fieldType).cropVisualStyle === "rice" ? (
        <boxGeometry args={[1, 1, 1]} />
      ) : (
        <sphereGeometry args={[1, 7, 7]} />
      )}
      <meshStandardMaterial
        color={getFieldProfile(snapshot.params.fieldType).cropVisualStyle === "rice" ? "#7bb86a" : "#5d8e56"}
        roughness={0.93}
      />
    </instancedMesh>
  );
}

function OrchardTrees({ snapshot }: { snapshot: SimulationSnapshot }): JSX.Element | null {
  const fieldProfile = getFieldProfile(snapshot.params.fieldType);
  const trunkRef = useRef<THREE.InstancedMesh>(null);
  const canopyRef = useRef<THREE.InstancedMesh>(null);
  const canopyLobeRef = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const { trees, canopyLobes } = useMemo(() => {
    if (fieldProfile.cropVisualStyle !== "orchard") {
      return { trees: [], canopyLobes: [] };
    }

    const rowCount = Math.max(1, Math.round(snapshot.params.fieldWidthM / snapshot.params.rowSpacingM));
    const trees: Array<{
      trunkPosition: [number, number, number];
      trunkScale: [number, number, number];
      trunkRotation: [number, number, number];
      canopyPosition: [number, number, number];
      canopyScale: [number, number, number];
      canopyRotation: [number, number, number];
    }> = [];
    const canopyLobes: Array<{
      position: [number, number, number];
      scale: [number, number, number];
      rotation: [number, number, number];
    }> = [];

    for (let rowIndex = 0; rowIndex < rowCount; rowIndex += 1) {
      for (
        let x = Math.max(1.4, fieldProfile.canopyRadiusM + 0.7);
        x < snapshot.params.fieldLengthM - Math.max(1.4, fieldProfile.canopyRadiusM + 0.7);
        x += fieldProfile.inRowPlantSpacingM
      ) {
        const treeCenter = orchardTreeCenter(rowIndex, x, snapshot.params, fieldProfile);
        const n1 = sceneNoise(rowIndex * 0.37, x * 0.11);
        const n2 = sceneNoise(rowIndex * 0.21 + 7, x * 0.07 + 13);
        const n3 = sceneNoise(rowIndex * 0.49 + 4, x * 0.17 + 2);
        const n4 = sceneNoise(rowIndex * 0.28 + 11, x * 0.13 + 19);
        const trunkBase = toScenePosition({ x: treeCenter.x, y: 0, z: treeCenter.z }, snapshot);
        const canopyCenter = toScenePosition(
          {
            x: treeCenter.x + (n3 - 0.5) * fieldProfile.canopyRadiusM * 0.18,
            y: fieldProfile.trunkHeightM + (fieldProfile.maturePlantHeightM - fieldProfile.trunkHeightM) * (0.4 + n4 * 0.07),
            z: treeCenter.z + (n4 - 0.5) * fieldProfile.canopyRadiusM * 0.14
          },
          snapshot
        );
        const trunkHeightUnits = metersToSceneUnits(fieldProfile.trunkHeightM, snapshot.renderScaleMPerUnit);
        const canopyHeightUnits = metersToSceneUnits(
          (fieldProfile.maturePlantHeightM - fieldProfile.trunkHeightM) * (0.95 + n1 * 0.08),
          snapshot.renderScaleMPerUnit
        );
        const canopyRadiusUnits = metersToSceneUnits(
          fieldProfile.canopyRadiusM * (0.92 + n2 * 0.14),
          snapshot.renderScaleMPerUnit
        );
        const canopyRadiusXUnits = canopyRadiusUnits * (1.04 + (n3 - 0.5) * 0.22);
        const canopyRadiusZUnits = canopyRadiusUnits * (0.96 + (n4 - 0.5) * 0.26);

        trees.push({
          trunkPosition: [trunkBase.x, trunkHeightUnits * 0.5, trunkBase.z],
          trunkScale: [
            metersToSceneUnits(0.11, snapshot.renderScaleMPerUnit),
            trunkHeightUnits,
            metersToSceneUnits(0.11, snapshot.renderScaleMPerUnit)
          ],
          trunkRotation: [
            (n3 - 0.5) * 0.05,
            n2 * Math.PI,
            (n4 - 0.5) * 0.06
          ],
          canopyPosition: [canopyCenter.x, canopyCenter.y, canopyCenter.z],
          canopyScale: [canopyRadiusXUnits * 1.14, canopyHeightUnits, canopyRadiusZUnits],
          canopyRotation: [
            (n1 - 0.5) * 0.12,
            n2 * Math.PI,
            (n3 - 0.5) * 0.1
          ]
        });

        const lobeCount = 3;
        for (let lobeIndex = 0; lobeIndex < lobeCount; lobeIndex += 1) {
          const lobeNoise = sceneNoise(rowIndex * 0.63 + lobeIndex * 2.7, x * 0.19 + lobeIndex * 5.1);
          const angle = n2 * Math.PI * 2 + lobeIndex * ((Math.PI * 2) / lobeCount) + (lobeNoise - 0.5) * 0.7;
          const radialOffsetUnits =
            Math.min(canopyRadiusXUnits, canopyRadiusZUnits) * (0.35 + lobeNoise * 0.18);
          const heightOffsetUnits =
            canopyHeightUnits * (-0.08 + lobeIndex * 0.11 + (lobeNoise - 0.5) * 0.18);
          const lobeWidthUnits =
            canopyRadiusUnits * (0.38 + lobeNoise * 0.16);
          const lobeHeightUnits =
            canopyHeightUnits * (0.3 + lobeNoise * 0.16);

          canopyLobes.push({
            position: [
              canopyCenter.x + Math.cos(angle) * radialOffsetUnits,
              canopyCenter.y + heightOffsetUnits,
              canopyCenter.z + Math.sin(angle) * radialOffsetUnits
            ],
            scale: [
              lobeWidthUnits * (1.06 + (lobeNoise - 0.5) * 0.18),
              lobeHeightUnits,
              lobeWidthUnits * (0.94 + (0.5 - lobeNoise) * 0.16)
            ],
            rotation: [
              (lobeNoise - 0.5) * 0.18,
              angle,
              (n4 - 0.5) * 0.14
            ]
          });
        }
      }
    }

    return { trees, canopyLobes };
  }, [fieldProfile, snapshot]);

  useLayoutEffect(() => {
    if (!trunkRef.current || !canopyRef.current || !canopyLobeRef.current) {
      return;
    }

    for (let index = 0; index < trees.length; index += 1) {
      const instance = trees[index];
      dummy.position.set(instance.trunkPosition[0], instance.trunkPosition[1], instance.trunkPosition[2]);
      dummy.rotation.set(
        instance.trunkRotation[0],
        instance.trunkRotation[1],
        instance.trunkRotation[2]
      );
      dummy.scale.set(instance.trunkScale[0], instance.trunkScale[1], instance.trunkScale[2]);
      dummy.updateMatrix();
      trunkRef.current.setMatrixAt(index, dummy.matrix);

      dummy.position.set(instance.canopyPosition[0], instance.canopyPosition[1], instance.canopyPosition[2]);
      dummy.rotation.set(
        instance.canopyRotation[0],
        instance.canopyRotation[1],
        instance.canopyRotation[2]
      );
      dummy.scale.set(instance.canopyScale[0], instance.canopyScale[1], instance.canopyScale[2]);
      dummy.updateMatrix();
      canopyRef.current.setMatrixAt(index, dummy.matrix);
    }

    for (let index = 0; index < canopyLobes.length; index += 1) {
      const lobe = canopyLobes[index];
      dummy.position.set(lobe.position[0], lobe.position[1], lobe.position[2]);
      dummy.rotation.set(lobe.rotation[0], lobe.rotation[1], lobe.rotation[2]);
      dummy.scale.set(lobe.scale[0], lobe.scale[1], lobe.scale[2]);
      dummy.updateMatrix();
      canopyLobeRef.current.setMatrixAt(index, dummy.matrix);
    }

    trunkRef.current.instanceMatrix.needsUpdate = true;
    canopyRef.current.instanceMatrix.needsUpdate = true;
    canopyLobeRef.current.instanceMatrix.needsUpdate = true;
  }, [canopyLobes, dummy, trees]);

  if (trees.length === 0) {
    return null;
  }

  return (
    <group>
      <instancedMesh ref={trunkRef} args={[undefined, undefined, trees.length]} castShadow receiveShadow>
        <cylinderGeometry args={[0.45, 0.68, 1, 7]} />
        <meshStandardMaterial color="#6a4e35" roughness={0.95} />
      </instancedMesh>
      <instancedMesh ref={canopyRef} args={[undefined, undefined, trees.length]} castShadow receiveShadow>
        <icosahedronGeometry args={[0.52, 1]} />
        <meshStandardMaterial color="#5c8f4f" roughness={0.84} />
      </instancedMesh>
      <instancedMesh ref={canopyLobeRef} args={[undefined, undefined, canopyLobes.length]} castShadow receiveShadow>
        <icosahedronGeometry args={[0.36, 0]} />
        <meshStandardMaterial color="#649755" roughness={0.88} />
      </instancedMesh>
    </group>
  );
}

function GreenhouseTulips({ snapshot }: { snapshot: SimulationSnapshot }): JSX.Element | null {
  const fieldProfile = getFieldProfile(snapshot.params.fieldType);
  const stemRef = useRef<THREE.InstancedMesh>(null);
  const bloomRef = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const { stems, blooms } = useMemo(() => {
    if (fieldProfile.cropVisualStyle !== "greenhouse") {
      return { stems: [], blooms: [] };
    }

    const { rowCount, rowSpacingM, alongRowPitchM } = getVisualRowMetrics(snapshot);
    const columns = Math.max(8, Math.floor(snapshot.params.fieldLengthM / alongRowPitchM));
    const stems: Array<{
      position: [number, number, number];
      scale: [number, number, number];
      rotation: [number, number, number];
    }> = [];
    const blooms: Array<{
      position: [number, number, number];
      scale: [number, number, number];
      rotation: [number, number, number];
      color: THREE.Color;
    }> = [];
    const bloomPalette = ["#f05b78", "#f6cc56", "#f2f1ed", "#f18a31", "#d85ba6"];

    for (let rowIndex = 0; rowIndex < rowCount; rowIndex += 1) {
      const rowCenterZ = rowIndex * rowSpacingM + rowSpacingM * 0.5;
      for (let column = 0; column < columns; column += 1) {
        const x = 0.9 + column * alongRowPitchM;
        if (x > snapshot.params.fieldLengthM - 0.8) {
          continue;
        }

        const n1 = sceneNoise(rowIndex * 0.27 + 2, column * 0.57 + 4);
        const n2 = sceneNoise(rowIndex * 0.51 + 7, column * 0.29 + 10);
        const stemHeightM = fieldProfile.maturePlantHeightM * (0.82 + n1 * 0.16);
        const stemBase = toScenePosition(
          {
            x,
            y: stemHeightM * 0.5,
            z: rowCenterZ + (n1 - 0.5) * rowSpacingM * 0.18
          },
          snapshot
        );
        const bloomPoint = toScenePosition(
          {
            x: x + (n2 - 0.5) * 0.04,
            y: stemHeightM * (0.92 + n2 * 0.05),
            z: rowCenterZ + (n1 - 0.5) * rowSpacingM * 0.18
          },
          snapshot
        );

        stems.push({
          position: [stemBase.x, stemBase.y, stemBase.z],
          scale: [
            metersToSceneUnits(0.012, snapshot.renderScaleMPerUnit),
            metersToSceneUnits(stemHeightM, snapshot.renderScaleMPerUnit),
            metersToSceneUnits(0.012, snapshot.renderScaleMPerUnit)
          ],
          rotation: [(n1 - 0.5) * 0.14, n2 * Math.PI, (n2 - 0.5) * 0.08]
        });
        blooms.push({
          position: [bloomPoint.x, bloomPoint.y, bloomPoint.z],
          scale: [
            metersToSceneUnits(0.06, snapshot.renderScaleMPerUnit),
            metersToSceneUnits(0.1 + n2 * 0.02, snapshot.renderScaleMPerUnit),
            metersToSceneUnits(0.06, snapshot.renderScaleMPerUnit)
          ],
          rotation: [(n2 - 0.5) * 0.3, n1 * Math.PI, 0],
          color: new THREE.Color(bloomPalette[Math.floor(n1 * bloomPalette.length) % bloomPalette.length])
        });
      }
    }

    return { stems, blooms };
  }, [fieldProfile, snapshot]);

  useLayoutEffect(() => {
    if (!stemRef.current || !bloomRef.current) {
      return;
    }

    for (let index = 0; index < stems.length; index += 1) {
      const stem = stems[index];
      dummy.position.set(stem.position[0], stem.position[1], stem.position[2]);
      dummy.rotation.set(stem.rotation[0], stem.rotation[1], stem.rotation[2]);
      dummy.scale.set(stem.scale[0], stem.scale[1], stem.scale[2]);
      dummy.updateMatrix();
      stemRef.current.setMatrixAt(index, dummy.matrix);
    }

    for (let index = 0; index < blooms.length; index += 1) {
      const bloom = blooms[index];
      dummy.position.set(bloom.position[0], bloom.position[1], bloom.position[2]);
      dummy.rotation.set(bloom.rotation[0], bloom.rotation[1], bloom.rotation[2]);
      dummy.scale.set(bloom.scale[0], bloom.scale[1], bloom.scale[2]);
      dummy.updateMatrix();
      bloomRef.current.setMatrixAt(index, dummy.matrix);
      bloomRef.current.setColorAt(index, bloom.color);
    }

    stemRef.current.instanceMatrix.needsUpdate = true;
    bloomRef.current.instanceMatrix.needsUpdate = true;
    if (bloomRef.current.instanceColor) {
      bloomRef.current.instanceColor.needsUpdate = true;
    }
  }, [blooms, dummy, stems]);

  if (stems.length === 0) {
    return null;
  }

  return (
    <group>
      <instancedMesh ref={stemRef} args={[undefined, undefined, stems.length]} castShadow receiveShadow>
        <cylinderGeometry args={[0.5, 0.7, 1, 5]} />
        <meshStandardMaterial color="#6ea85f" roughness={0.88} />
      </instancedMesh>
      <instancedMesh ref={bloomRef} args={[undefined, undefined, blooms.length]} castShadow receiveShadow>
        <capsuleGeometry args={[0.5, 0.9, 3, 6]} />
        <meshStandardMaterial roughness={0.7} />
      </instancedMesh>
    </group>
  );
}

function GreenhouseStructure({ snapshot }: { snapshot: SimulationSnapshot }): JSX.Element | null {
  const fieldProfile = getFieldProfile(snapshot.params.fieldType);
  const columnRef = useRef<THREE.InstancedMesh>(null);
  const beamRef = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const columns = useMemo(() => {
    if (fieldProfile.cropVisualStyle !== "greenhouse") {
      return [];
    }

    return greenhouseColumnCenters(snapshot.params).map((column) => {
      const scenePoint = toScenePosition(
        { x: column.x, y: GREENHOUSE_GUTTER_HEIGHT_M * 0.5, z: column.z },
        snapshot
      );
      return {
        position: [scenePoint.x, scenePoint.y, scenePoint.z] as [number, number, number],
        scale: [
          metersToSceneUnits(GREENHOUSE_COLUMN_RADIUS_M * 1.05, snapshot.renderScaleMPerUnit),
          metersToSceneUnits(GREENHOUSE_GUTTER_HEIGHT_M, snapshot.renderScaleMPerUnit),
          metersToSceneUnits(GREENHOUSE_COLUMN_RADIUS_M * 1.05, snapshot.renderScaleMPerUnit)
        ] as [number, number, number]
      };
    });
  }, [fieldProfile, snapshot]);
  const beams = useMemo(() => {
    if (fieldProfile.cropVisualStyle !== "greenhouse") {
      return [];
    }

    const supportLines = greenhouseSupportLineCenters(snapshot.params);
    const beamEntries: Array<{
      position: [number, number, number];
      scale: [number, number, number];
      rotation: [number, number, number];
    }> = [];
    const fieldCenterX = snapshot.params.fieldLengthM * 0.5;
    const fieldCenterZ = snapshot.params.fieldWidthM * 0.5;
    const beamY = GREENHOUSE_GUTTER_HEIGHT_M;

    for (let index = 0; index < supportLines.length; index += 1) {
      const z = supportLines[index];
      const linePoint = toScenePosition({ x: fieldCenterX, y: beamY, z }, snapshot);
      beamEntries.push({
        position: [linePoint.x, linePoint.y, linePoint.z],
        scale: [
          metersToSceneUnits(snapshot.params.fieldLengthM - 3.2, snapshot.renderScaleMPerUnit),
          metersToSceneUnits(0.06, snapshot.renderScaleMPerUnit),
          metersToSceneUnits(0.08, snapshot.renderScaleMPerUnit)
        ],
        rotation: [0, 0, 0]
      });
    }

    for (
      let x = GREENHOUSE_BAY_LENGTH_M * 0.5;
      x < snapshot.params.fieldLengthM - GREENHOUSE_BAY_LENGTH_M * 0.25;
      x += GREENHOUSE_BAY_LENGTH_M
    ) {
      const ridgePoint = toScenePosition({ x, y: GREENHOUSE_RIDGE_HEIGHT_M, z: fieldCenterZ }, snapshot);
      beamEntries.push({
        position: [ridgePoint.x, ridgePoint.y, ridgePoint.z],
        scale: [
          metersToSceneUnits(0.06, snapshot.renderScaleMPerUnit),
          metersToSceneUnits(0.08, snapshot.renderScaleMPerUnit),
          metersToSceneUnits(snapshot.params.fieldWidthM - 1.2, snapshot.renderScaleMPerUnit)
        ],
        rotation: [0, 0, 0]
      });
    }

    return beamEntries;
  }, [fieldProfile, snapshot]);

  useLayoutEffect(() => {
    if (!columnRef.current || !beamRef.current) {
      return;
    }

    for (let index = 0; index < columns.length; index += 1) {
      const column = columns[index];
      dummy.position.set(column.position[0], column.position[1], column.position[2]);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(column.scale[0], column.scale[1], column.scale[2]);
      dummy.updateMatrix();
      columnRef.current.setMatrixAt(index, dummy.matrix);
    }

    for (let index = 0; index < beams.length; index += 1) {
      const beam = beams[index];
      dummy.position.set(beam.position[0], beam.position[1], beam.position[2]);
      dummy.rotation.set(beam.rotation[0], beam.rotation[1], beam.rotation[2]);
      dummy.scale.set(beam.scale[0], beam.scale[1], beam.scale[2]);
      dummy.updateMatrix();
      beamRef.current.setMatrixAt(index, dummy.matrix);
    }

    columnRef.current.instanceMatrix.needsUpdate = true;
    beamRef.current.instanceMatrix.needsUpdate = true;
  }, [beams, columns, dummy]);

  if (fieldProfile.cropVisualStyle !== "greenhouse") {
    return null;
  }

  const roofLength = snapshot.params.fieldLengthM / snapshot.renderScaleMPerUnit;
  const roofWidth = snapshot.params.fieldWidthM / snapshot.renderScaleMPerUnit;
  const gutterY = metersToSceneUnits(GREENHOUSE_GUTTER_HEIGHT_M, snapshot.renderScaleMPerUnit);
  const ridgeY = metersToSceneUnits(GREENHOUSE_RIDGE_HEIGHT_M, snapshot.renderScaleMPerUnit);

  return (
    <group>
      <instancedMesh ref={columnRef} args={[undefined, undefined, columns.length]} castShadow receiveShadow>
        <cylinderGeometry args={[0.5, 0.58, 1, 6]} />
        <meshStandardMaterial color="#9ca7ae" roughness={0.48} metalness={0.32} />
      </instancedMesh>
      <instancedMesh ref={beamRef} args={[undefined, undefined, beams.length]} castShadow receiveShadow>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color="#8a959d" roughness={0.42} metalness={0.28} />
      </instancedMesh>
      <mesh position={[0, gutterY + (ridgeY - gutterY) * 0.5, 0]} rotation={[0.18, 0, 0]}>
        <planeGeometry args={[roofLength + 0.6, roofWidth + 0.6]} />
        <meshStandardMaterial color="#d8edf0" transparent opacity={0.16} roughness={0.14} metalness={0.08} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}

function FieldSurface({ snapshot }: { snapshot: SimulationSnapshot }): JSX.Element {
  const fieldLength = snapshot.params.fieldLengthM / snapshot.renderScaleMPerUnit;
  const fieldWidth = snapshot.params.fieldWidthM / snapshot.renderScaleMPerUnit;
  const fieldProfile = getFieldProfile(snapshot.params.fieldType);
  const { rowCount, rowSpacingM } = getVisualRowMetrics(snapshot);
  const rowWidth =
    fieldProfile.cropVisualStyle === "orchard"
      ? metersToSceneUnits(fieldProfile.canopyRadiusM * 2.6, snapshot.renderScaleMPerUnit)
      : fieldProfile.cropVisualStyle === "greenhouse"
        ? (rowSpacingM / snapshot.renderScaleMPerUnit) * 0.54
      : (rowSpacingM / snapshot.renderScaleMPerUnit) *
        (fieldProfile.cropVisualStyle === "rice" ? 0.42 : 0.68);

  return (
    <group>
      <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.025, 0]}>
        <planeGeometry args={[fieldLength + 12, fieldWidth + 12]} />
        <meshStandardMaterial
          color={
            fieldProfile.cropVisualStyle === "rice"
              ? "#1f2e26"
              : fieldProfile.cropVisualStyle === "orchard"
                ? "#223126"
                : fieldProfile.cropVisualStyle === "greenhouse"
                  ? "#1f2522"
                : "#241d18"
          }
          roughness={1}
        />
      </mesh>

      <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.004, 0]}>
        <planeGeometry args={[fieldLength + 1, fieldWidth + 1]} />
        <meshStandardMaterial
          color={
            fieldProfile.cropVisualStyle === "rice"
              ? "#3f5a47"
              : fieldProfile.cropVisualStyle === "orchard"
                ? "#4f6d49"
                : fieldProfile.cropVisualStyle === "greenhouse"
                  ? "#454c41"
                : "#3b2d23"
          }
          roughness={1}
        />
      </mesh>

      {fieldProfile.cropVisualStyle === "rice" ? (
        <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.002, 0]}>
          <planeGeometry args={[fieldLength, fieldWidth]} />
          <meshStandardMaterial color="#355e5d" transparent opacity={0.42} roughness={0.18} metalness={0.08} />
        </mesh>
      ) : fieldProfile.cropVisualStyle === "greenhouse" ? (
        <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.001, 0]}>
          <planeGeometry args={[fieldLength, fieldWidth]} />
          <meshStandardMaterial color="#2e3a2d" roughness={0.92} />
        </mesh>
      ) : null}

      {Array.from({ length: rowCount }).map((_, rowIndex) => {
        const rowCenter = rowIndex * rowSpacingM + rowSpacingM * 0.5;
        const sceneRow = toScenePosition({ x: snapshot.params.fieldLengthM * 0.5, y: 0.05, z: rowCenter }, snapshot);

        return (
          <mesh key={rowIndex} position={[0, 0.01, sceneRow.z]} receiveShadow>
            <boxGeometry args={[fieldLength, 0.025, rowWidth]} />
            <meshStandardMaterial
              color={
                fieldProfile.cropVisualStyle === "rice"
                  ? "#61895f"
                  : fieldProfile.cropVisualStyle === "orchard"
                    ? "#715c40"
                    : fieldProfile.cropVisualStyle === "greenhouse"
                      ? "#4c5a3e"
                    : "#6e5735"
              }
              roughness={0.96}
            />
          </mesh>
        );
      })}

      {fieldProfile.cropVisualStyle === "orchard" ? <OrchardTrees snapshot={snapshot} /> : null}
      {fieldProfile.cropVisualStyle === "greenhouse" ? <GreenhouseStructure snapshot={snapshot} /> : null}
      {fieldProfile.cropVisualStyle === "greenhouse" ? <GreenhouseTulips snapshot={snapshot} /> : <CropCanopy snapshot={snapshot} />}
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
    <group position={[dock.x, dock.y - padThickness, dock.z]}>
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

function BirdActor({
  snapshot,
  cycleOffsetS,
  perchSeed
}: {
  snapshot: SimulationSnapshot;
  cycleOffsetS: number;
  perchSeed: number;
}): JSX.Element | null {
  const fieldProfile = getFieldProfile(snapshot.params.fieldType);
  const cycleS = 32;
  const activeWindowS = 24;
  const localTimeS = (snapshot.metrics.missionElapsedS + cycleOffsetS) % cycleS;
  const visible = fieldProfile.cropVisualStyle !== "greenhouse" && localTimeS <= activeWindowS;
  const cycleIndex = Math.floor((snapshot.metrics.missionElapsedS + cycleOffsetS) / cycleS);
  const phase = localTimeS < 7 ? "arriving" : localTimeS < 14 ? "perched" : "departing";
  const sideSign = cycleIndex % 2 === 0 ? 1 : -1;
  const fieldHalfLengthUnits = snapshot.params.fieldLengthM / snapshot.renderScaleMPerUnit / 2;
  const fieldHalfWidthUnits = snapshot.params.fieldWidthM / snapshot.renderScaleMPerUnit / 2;
  const perchPoint = new THREE.Vector3(
    -fieldHalfLengthUnits + 1.2 + ((cycleIndex + perchSeed) % 4) * 0.8,
    metersToSceneUnits(fieldProfile.cropVisualStyle === "orchard" ? 2.6 : 0.7, snapshot.renderScaleMPerUnit),
    sideSign * Math.min(fieldHalfWidthUnits - 0.55, 1.5 + ((cycleIndex + perchSeed) % 3) * 0.55)
  );
  const startPoint = perchPoint.clone().add(new THREE.Vector3(-1.2, 1.15, -sideSign * 0.9));
  const exitPoint = perchPoint.clone().add(new THREE.Vector3(1.7, 1.35, sideSign * 1.05));

  const position = useMemo(() => new THREE.Vector3(), []);
  const groupRef = useRef<THREE.Group>(null);
  const leftWingRef = useRef<THREE.Group>(null);
  const rightWingRef = useRef<THREE.Group>(null);
  const tailRef = useRef<THREE.Mesh>(null);

  useFrame(({ clock }) => {
    if (!groupRef.current) {
      return;
    }

    groupRef.current.visible = visible;
    if (!visible) {
      return;
    }

    if (phase === "arriving") {
      const t = clamp(localTimeS / 7, 0, 1);
      position.lerpVectors(startPoint, perchPoint, t);
      position.y += Math.sin(t * Math.PI) * 0.22;
    } else if (phase === "perched") {
      position.copy(perchPoint);
      position.y += Math.sin(clock.elapsedTime * 5.6) * 0.01;
    } else {
      const t = clamp((localTimeS - 14) / 6, 0, 1);
      position.lerpVectors(perchPoint, exitPoint, t);
      position.y += Math.sin(t * Math.PI) * 0.3;
    }

    groupRef.current.position.copy(position);
    groupRef.current.rotation.y = phase === "departing" ? -0.8 * sideSign : 2.4 - 0.35 * sideSign;

    const flapStrength = phase === "perched" ? 0.12 : 0.95;
    const flapRate = phase === "perched" ? 4.5 : 16;
    const flapAngle = Math.sin(clock.elapsedTime * flapRate + cycleOffsetS * 0.4) * flapStrength;
    if (leftWingRef.current) {
      leftWingRef.current.rotation.z = flapAngle + 0.12;
      leftWingRef.current.rotation.y = 0.16;
    }
    if (rightWingRef.current) {
      rightWingRef.current.rotation.z = -flapAngle - 0.12;
      rightWingRef.current.rotation.y = -0.16;
    }
    if (tailRef.current) {
      tailRef.current.rotation.y = Math.sin(clock.elapsedTime * 2.3 + perchSeed) * 0.08;
    }
  });

  const birdScale = metersToSceneUnits(0.32, snapshot.renderScaleMPerUnit);

  return (
    <group ref={groupRef} visible={visible}>
      <mesh castShadow position={[-birdScale * 0.04, birdScale * 0.44, 0]} rotation={[0, 0, Math.PI / 2]}>
        <capsuleGeometry args={[birdScale * 0.2, birdScale * 0.72, 5, 12]} />
        <meshStandardMaterial color="#5f6870" roughness={0.82} />
      </mesh>
      <mesh castShadow position={[birdScale * 0.5, birdScale * 0.52, 0]} scale={[0.72, 0.58, 0.52]}>
        <sphereGeometry args={[birdScale * 0.45, 12, 12]} />
        <meshStandardMaterial color="#909aa2" roughness={0.72} />
      </mesh>
      <mesh castShadow position={[birdScale * 0.6, birdScale * 0.54, birdScale * 0.12]} scale={[0.16, 0.14, 0.1]}>
        <sphereGeometry args={[birdScale * 0.16, 8, 8]} />
        <meshStandardMaterial color="#12161a" roughness={0.55} />
      </mesh>
      <mesh castShadow position={[birdScale * 0.6, birdScale * 0.54, -birdScale * 0.12]} scale={[0.16, 0.14, 0.1]}>
        <sphereGeometry args={[birdScale * 0.16, 8, 8]} />
        <meshStandardMaterial color="#12161a" roughness={0.55} />
      </mesh>
      <group ref={leftWingRef} position={[-birdScale * 0.06, birdScale * 0.5, birdScale * 0.15]}>
        <mesh castShadow position={[-birdScale * 0.18, 0, birdScale * 0.2]} rotation={[0.12, 0.08, -0.22]}>
          <coneGeometry args={[birdScale * 0.22, birdScale * 1.08, 3]} />
          <meshStandardMaterial color="#5b646c" roughness={0.86} />
        </mesh>
      </group>
      <group ref={rightWingRef} position={[-birdScale * 0.06, birdScale * 0.5, -birdScale * 0.15]}>
        <mesh castShadow position={[-birdScale * 0.18, 0, -birdScale * 0.2]} rotation={[-0.12, -0.08, 0.22]}>
          <coneGeometry args={[birdScale * 0.22, birdScale * 1.08, 3]} />
          <meshStandardMaterial color="#5b646c" roughness={0.86} />
        </mesh>
      </group>
      <mesh
        ref={tailRef}
        castShadow
        position={[-birdScale * 0.86, birdScale * 0.4, 0]}
        rotation={[0, 0, -Math.PI / 2]}
      >
        <coneGeometry args={[birdScale * 0.2, birdScale * 0.42, 3]} />
        <meshStandardMaterial color="#4f5961" roughness={0.88} />
      </mesh>
      <mesh castShadow position={[birdScale * 0.9, birdScale * 0.44, 0]} rotation={[0, 0, Math.PI / 2]}>
        <coneGeometry args={[birdScale * 0.08, birdScale * 0.24, 8]} />
        <meshStandardMaterial color="#d59d57" roughness={0.78} />
      </mesh>
      <mesh castShadow position={[-birdScale * 0.02, birdScale * 0.18, birdScale * 0.08]} rotation={[0.08, 0, 0]}>
        <boxGeometry args={[birdScale * 0.05, birdScale * 0.34, birdScale * 0.018]} />
        <meshStandardMaterial color="#b9803e" roughness={0.86} />
      </mesh>
      <mesh castShadow position={[-birdScale * 0.02, birdScale * 0.18, -birdScale * 0.08]} rotation={[-0.08, 0, 0]}>
        <boxGeometry args={[birdScale * 0.05, birdScale * 0.34, birdScale * 0.018]} />
        <meshStandardMaterial color="#b9803e" roughness={0.86} />
      </mesh>
    </group>
  );
}

function Birds({ snapshot }: { snapshot: SimulationSnapshot }): JSX.Element {
  return (
    <group>
      <BirdActor snapshot={snapshot} cycleOffsetS={0} perchSeed={0} />
      <BirdActor snapshot={snapshot} cycleOffsetS={9} perchSeed={1} />
      <BirdActor snapshot={snapshot} cycleOffsetS={18} perchSeed={2} />
    </group>
  );
}

function FarmerActor({
  farmer,
  snapshot,
  chatterLine = null,
  placardLabel = null,
  shirtColor = farmer.gender === "female" ? "#8c4f72" : "#506f8d",
  legColor = farmer.gender === "female" ? "#4f3e54" : "#3c464c"
}: {
  farmer: FarmerState;
  snapshot: SimulationSnapshot;
  chatterLine?: string | null;
  placardLabel?: string | null;
  shirtColor?: string;
  legColor?: string;
}): JSX.Element {
  const point = toScenePosition(farmer.position, snapshot);
  const farmerHeight = metersToSceneUnits(farmer.heightM, snapshot.renderScaleMPerUnit);
  const farmerShoulderWidth = metersToSceneUnits(farmer.shoulderWidthM, snapshot.renderScaleMPerUnit);
  const { camera, size } = useThree();
  const [showChatter, setShowChatter] = useState(false);
  const showChatterRef = useRef(false);

  useFrame(() => {
    if (!chatterLine) {
      if (showChatterRef.current) {
        showChatterRef.current = false;
        setShowChatter(false);
      }
      return;
    }

    const bubbleAnchor = new THREE.Vector3(point.x, point.y + farmerHeight * 1.24, point.z).project(camera);
    const screenX = ((bubbleAnchor.x + 1) * 0.5) * size.width;
    const screenY = ((1 - bubbleAnchor.y) * 0.5) * size.height;
    const bubbleHalfWidthPx = 72;
    const bubbleHalfHeightPx = 64;
    const fullyVisible =
      bubbleAnchor.z >= -1 &&
      bubbleAnchor.z <= 1 &&
      screenX >= bubbleHalfWidthPx + 10 &&
      screenX <= size.width - bubbleHalfWidthPx - 10 &&
      screenY >= bubbleHalfHeightPx + 10 &&
      screenY <= size.height - bubbleHalfHeightPx - 10;

    if (fullyVisible !== showChatterRef.current) {
      showChatterRef.current = fullyVisible;
      setShowChatter(fullyVisible);
    }
  });

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
      {farmer.gender === "female" ? (
        <mesh castShadow position={[0, farmerHeight * 0.9, -farmerShoulderWidth * 0.05]}>
          <sphereGeometry args={[farmerHeight * 0.05, 10, 10]} />
          <meshStandardMaterial color="#4a3224" roughness={0.9} />
        </mesh>
      ) : (
        <mesh castShadow position={[0, farmerHeight * 0.9, 0]}>
          <sphereGeometry args={[farmerHeight * 0.1, 12, 12, 0, Math.PI * 2, 0, Math.PI * 0.55]} />
          <meshStandardMaterial color="#5a4331" roughness={0.88} />
        </mesh>
      )}
      {[-1, 1].map((side) => (
        <mesh key={side} castShadow position={[farmerShoulderWidth * 0.12 * side, farmerHeight * 0.2, 0]}>
          <cylinderGeometry args={[farmerShoulderWidth * 0.06, farmerShoulderWidth * 0.07, farmerHeight * 0.42, 10]} />
          <meshStandardMaterial color={legColor} roughness={0.84} />
        </mesh>
      ))}
      {placardLabel ? (
        <group position={[farmerShoulderWidth * 0.78, farmerHeight * 0.72, farmerShoulderWidth * 0.26]} rotation={[0, 0, -0.18]}>
          <mesh castShadow position={[0, -farmerHeight * 0.18, 0]}>
            <cylinderGeometry
              args={[farmerShoulderWidth * 0.035, farmerShoulderWidth * 0.035, farmerHeight * 0.92, 10]}
            />
            <meshStandardMaterial color="#b89254" roughness={0.88} />
          </mesh>
          <mesh castShadow position={[0, farmerHeight * 0.14, 0]}>
            <boxGeometry args={[farmerHeight * 0.82, farmerHeight * 0.36, farmerShoulderWidth * 0.06]} />
            <meshStandardMaterial color="#e9e2cf" roughness={0.92} />
          </mesh>
          <Text
            position={[0, farmerHeight * 0.14, farmerShoulderWidth * 0.034]}
            fontSize={farmerHeight * 0.085}
            maxWidth={farmerHeight * 0.68}
            textAlign="center"
            anchorX="center"
            anchorY="middle"
            color="#1e2421"
          >
            {placardLabel}
          </Text>
        </group>
      ) : null}
      {chatterLine && showChatter ? (
        <Html
          position={[0, farmerHeight * 1.24, 0]}
          center
          transform
          sprite
          occlude={false}
          distanceFactor={1.45}
        >
          <div className="farmer-chatter-bubble">{chatterLine}</div>
        </Html>
      ) : null}
    </group>
  );
}

function WalkingFarmers({ snapshot }: { snapshot: SimulationSnapshot }): JSX.Element {
  const activeChatter = useMemo(
    () =>
      activeFarmerChatterState(
        snapshot.farmers as any,
        snapshot.params.fieldType,
        snapshot.drone.position,
        snapshot.metrics.missionElapsedS
      ),
    [snapshot]
  );
  const activePlacard = useMemo(
    () => activeFarmerPlacardState(snapshot.farmers as any, snapshot.drone.position, snapshot.metrics.missionElapsedS),
    [snapshot]
  );
  const activeDinner = useMemo(
    () => activeFarmerDinnerState(snapshot.farmers as any, snapshot.drone.position, snapshot.metrics.missionElapsedS),
    [snapshot]
  );

  return (
    <group>
      {snapshot.farmers.map((farmer) => (
        <FarmerActor
          key={farmer.id}
          farmer={farmer}
          snapshot={snapshot}
          chatterLine={
            activeDinner.callerId === farmer.id
              ? activeDinner.callerLine
              : activeDinner.responderId === farmer.id
                ? activeDinner.responderLine
                : activePlacard.farmerId === farmer.id
              ? null
                : activeChatter.farmerId === farmer.id
                  ? activeChatter.line
                  : null
          }
          placardLabel={
            activeDinner.callerId === farmer.id || activeDinner.responderId === farmer.id
              ? null
              : activePlacard.farmerId === farmer.id
                ? activePlacard.label
                : null
          }
        />
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
      zoomToCursor
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
    const fieldProfile = getFieldProfile(snapshot.params.fieldType);
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
    const knownColor = new THREE.Color(fieldProfile.denseKnownColor);
    const seededColor = new THREE.Color(fieldProfile.denseSeededColor);
    const beaconLift = 0.035 * visibilityBoost;
    const pointSize = clamp(
      (fieldProfile.targetVisualStyle === "eggMass" ? 4.4 : 4.8) + visibilityBoost * 1.6,
      4.4,
      9.2
    );

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
  const fieldProfile = getFieldProfile(snapshot.params.fieldType);
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
  const color = target.alive
    ? (target.discovered ? fieldProfile.targetAliveColor : fieldProfile.targetSeededColor)
    : fieldProfile.targetNeutralizedColor;
  const shadowScale =
    scale * (1.1 + (1 - introState.settleProgress) * 0.55);
  const haloColor = active ? "#ff8a61" : fieldProfile.targetHaloColor;
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
  const riceLeafLengthUnits = metersToSceneUnits(
    fieldProfile.representativeLeafLengthM * 0.72,
    snapshot.renderScaleMPerUnit
  );
  const leafSupportOffset =
    (fieldProfile.targetVisualStyle === "eggMass" || fieldProfile.targetVisualStyle === "caterpillar") &&
    target.supportPosition
      ? [
          metersToSceneUnits(
            target.supportPosition.x - target.position.x,
            snapshot.renderScaleMPerUnit
          ),
          metersToSceneUnits(
            target.supportPosition.y - target.position.y,
            snapshot.renderScaleMPerUnit
          ),
          metersToSceneUnits(
            target.supportPosition.z - target.position.z,
            snapshot.renderScaleMPerUnit
          )
        ]
      : null;
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
      {fieldProfile.targetVisualStyle === "eggMass" ? (
        <>
          {leafSupportOffset ? (
            <>
              <Line
                points={[
                  [leafSupportOffset[0], leafSupportOffset[1], leafSupportOffset[2]],
                  [0, 0, 0]
                ]}
                color="#96d985"
                lineWidth={2.2}
                transparent
                opacity={0.96}
              />
              <mesh
                position={[
                  leafSupportOffset[0] * 0.55,
                  leafSupportOffset[1] * 0.55,
                  leafSupportOffset[2] * 0.55
                ]}
                rotation={[0, Math.atan2(leafSupportOffset[2], leafSupportOffset[0]), -0.22]}
              >
                <boxGeometry args={[
                  riceLeafLengthUnits * 0.52,
                  metersToSceneUnits(0.01, snapshot.renderScaleMPerUnit),
                  metersToSceneUnits(0.045, snapshot.renderScaleMPerUnit)
                ]} />
                <meshStandardMaterial color="#83c973" roughness={0.72} transparent opacity={0.82} />
              </mesh>
            </>
          ) : null}
          <group scale={[scale * 0.68, scale * 0.68 * introState.landingSquash, scale * 0.68]}>
            {[
              [-0.22, 0.04, 0],
              [0, 0.14, 0.08],
              [0.22, 0.02, -0.06],
              [0.08, -0.08, -0.14]
            ].map((offset, index) => (
              <mesh key={index} castShadow position={offset as [number, number, number]}>
                <sphereGeometry args={[0.34, 10, 10]} />
                <meshStandardMaterial
                  color={color}
                  emissive={target.alive ? haloColor : "#1d201d"}
                  emissiveIntensity={target.alive ? 0.18 : 0.06}
                  transparent
                  opacity={animatedOpacity}
                  roughness={0.5}
                />
              </mesh>
            ))}
          </group>
        </>
      ) : fieldProfile.targetVisualStyle === "caterpillar" ? (
        <>
          {leafSupportOffset ? (
            <Line
              points={[
                [leafSupportOffset[0], leafSupportOffset[1], leafSupportOffset[2]],
                [0, 0, 0]
              ]}
              color="#8fbc6d"
              lineWidth={2}
              transparent
              opacity={0.88}
            />
          ) : null}
          <group scale={[scale * 0.74, scale * 0.62 * introState.landingSquash, scale * 0.66]}>
            {[-0.42, -0.18, 0.08, 0.28].map((segmentX, index) => (
              <mesh
                key={index}
                castShadow
                position={[segmentX, Math.sin(index * 0.7) * 0.08, 0]}
                scale={[0.28 - index * 0.02, 0.24, 0.22]}
              >
                <sphereGeometry args={[0.7, 10, 10]} />
                <meshStandardMaterial
                  color={index === 0 ? "#6a8545" : color}
                  emissive={target.alive ? haloColor : "#1d201d"}
                  emissiveIntensity={target.alive ? 0.14 : 0.05}
                  transparent
                  opacity={animatedOpacity}
                  roughness={0.68}
                />
              </mesh>
            ))}
            {[-0.26, -0.04, 0.18].map((legX, index) => (
              <group key={index}>
                <mesh position={[legX, -0.08, -0.12]} rotation={[0, 0, 0.8]}>
                  <cylinderGeometry args={[0.02, 0.02, 0.22, 6]} />
                  <meshStandardMaterial color="#617346" roughness={0.84} transparent opacity={animatedOpacity} />
                </mesh>
                <mesh position={[legX, -0.08, 0.12]} rotation={[0, 0, -0.8]}>
                  <cylinderGeometry args={[0.02, 0.02, 0.22, 6]} />
                  <meshStandardMaterial color="#617346" roughness={0.84} transparent opacity={animatedOpacity} />
                </mesh>
              </group>
            ))}
          </group>
        </>
      ) : fieldProfile.targetVisualStyle === "stinkBug" ? (
        <group scale={[scale * 0.78, scale * 0.62 * introState.landingSquash, scale * 0.88]}>
          <mesh castShadow>
            <sphereGeometry args={[0.8, 12, 12]} />
            <meshStandardMaterial
              color={color}
              emissive={target.alive ? haloColor : "#1d201d"}
              emissiveIntensity={target.alive ? 0.2 : 0.07}
              transparent
              opacity={animatedOpacity}
              roughness={0.62}
            />
          </mesh>
          <mesh castShadow position={[0, 0.42, 0]} scale={[0.58, 0.34, 0.68]}>
            <sphereGeometry args={[0.9, 10, 10]} />
            <meshStandardMaterial color="#8c6b48" roughness={0.72} transparent opacity={animatedOpacity} />
          </mesh>
          {[-0.48, -0.26, 0.12, 0.44].map((legX, index) => (
            <mesh key={index} position={[legX, -0.06, index < 2 ? -0.34 : 0.34]} rotation={[0, 0, index < 2 ? 0.58 : -0.58]}>
              <cylinderGeometry args={[0.03, 0.03, 0.78, 6]} />
              <meshStandardMaterial color="#684d35" roughness={0.84} transparent opacity={animatedOpacity} />
            </mesh>
          ))}
          <mesh position={[0, 0.78, 0.24]} scale={[0.2, 0.2, 0.2]}>
            <sphereGeometry args={[0.9, 8, 8]} />
            <meshStandardMaterial color="#5b412e" roughness={0.8} transparent opacity={animatedOpacity} />
          </mesh>
        </group>
      ) : (
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
      )}
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
      <Birds snapshot={snapshot} />
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
  fieldType,
  onFieldTypeChange,
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
      {!controlsHidden && !safetyEditorPreview ? (
        <div className="scene-field-type-anchor">
          <FieldTypeDropdown fieldType={fieldType} onChange={onFieldTypeChange} />
        </div>
      ) : null}
      {isExpanded && !controlsHidden && (!isMobileUi || mobileMenuOpen) ? (
        <div className="scene-toolbar">
          <div className="scene-toolbar-copy">
            <label className="scene-select">
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
            {(["follow", "followSide", "overview", "dock", "manual"] as CameraMode[]).map((mode) => (
              <button
                key={mode}
                className={cameraMode === mode ? "camera-button active" : "camera-button"}
                onClick={() => onCameraModeChange(mode)}
              >
                {isMobileUi
                  ? {
                      follow: "Follow",
                      followSide: "Side",
                      overview: "Field",
                      dock: "Dock",
                      manual: "Free"
                    }[mode]
                  : {
                      follow: "follow",
                      followSide: "side follow",
                      overview: "overview",
                      dock: "dock",
                      manual: "manual"
                    }[mode]}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <Canvas
        shadows
        dpr={canvasDpr}
        camera={{ position: [8, 7, 9], fov: 42, near: 0.01, far: 200 }}
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
