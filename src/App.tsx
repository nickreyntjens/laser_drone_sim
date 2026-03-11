import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BuildPromptPanel } from "./components/BuildPromptPanel";
import { ControlPanel } from "./components/ControlPanel";
import {
  AimingLabPanel,
  createDefaultAimingLabParameters
} from "./components/AimingLabPanel";
import { GuideAvatar } from "./components/GuideAvatar";
import { GuideSetupPanel } from "./components/GuideSetupPanel";
import { LiveMetrics } from "./components/LiveMetrics";
import { MethodologyPanel } from "./components/MethodologyPanel";
import {
  deriveSafetyZoneEditorView,
  SafetyZoneEditorDraft,
  SafetyZonePanel
} from "./components/SafetyZonePanel";
import { SceneHud } from "./components/SceneHud";
import { SafetyEditorPreviewState, SimulationScene } from "./components/SimulationScene";
import { SummaryPanel } from "./components/SummaryPanel";
import { useMissionAudio } from "./hooks/useMissionAudio";
import { useMissionController } from "./hooks/useMissionController";
import { useMissionGuide } from "./hooks/useMissionGuide";
import { useResponsiveUi } from "./hooks/useResponsiveUi";
import { formatDuration } from "./lib/format";
import { fieldReferenceImageFor } from "./content/fieldReferenceImages";
import { buildBeamDiagramIntroLines } from "./content/guideScript";
import {
  DEFAULT_SEED,
  PLAYBACK_SPEED,
  PLAYBACK_SPEED_OPTIONS,
  clamp,
  defaultParameters
} from "./sim/defaults";
import { applyFieldTypePreset } from "./sim/fieldProfiles";
import { calculateSafetyMetrics, safetyInputFromParameters } from "./sim/safety";
import { FieldType, MissionLogEvent, SimulationParameters } from "./sim/types";

type CameraMode = "follow" | "followSide" | "overview" | "dock" | "manual";
type OverlayScreen =
  | "setup"
  | "telemetry"
  | "report"
  | "notes"
  | "guideSetup"
  | "aiming"
  | "buildPrompt"
  | "safetyZone"
  | null;
type ParentViewportMessage =
  | {
      source: "photonic-laser-drone-sim";
      type: "make-big" | "shrink";
    }
  | {
      source: "photonic-parent-page";
      type: "make-big" | "shrink";
    };
interface FarmerSafetyToast {
  message: string;
  blockingDistanceM: number | null;
  nominalSafetyZoneRadiusM: number | null;
}

function notifyParentViewportMode(type: "make-big" | "shrink"): void {
  if (typeof window === "undefined" || window.parent === window) {
    return;
  }

  const message: ParentViewportMessage = {
    source: "photonic-laser-drone-sim",
    type
  };

  window.parent.postMessage(message, "*");
}

function readRuntimeConfig(): {
  startRunning: boolean;
  initialCameraMode: CameraMode;
  startExpanded: boolean;
  startSafetyEditor: boolean;
  markerModeOverride: "selected" | "all" | null;
} {
  const search =
    typeof window !== "undefined"
      ? new URLSearchParams(window.location.search)
      : new URLSearchParams();
  const requestedCamera = search.get("camera");
  const initialCameraMode: CameraMode =
    requestedCamera === "overview" ||
    requestedCamera === "dock" ||
    requestedCamera === "manual" ||
    requestedCamera === "followSide" ||
    requestedCamera === "follow"
      ? requestedCamera
      : "follow";

  return {
    startRunning: search.get("autoplay") !== "0",
    initialCameraMode,
    startExpanded: search.get("expanded") === "1",
    startSafetyEditor: search.get("safetyEditor") === "1",
    markerModeOverride:
      search.get("markers") === "all"
        ? "all"
        : search.get("markers") === "selected"
          ? "selected"
          : null
  };
}

function parametersDiffer(a: SimulationParameters, b: SimulationParameters): boolean {
  const keys = Object.keys(a) as Array<keyof SimulationParameters>;
  for (let index = 0; index < keys.length; index += 1) {
    const key = keys[index];
    if (a[key] !== b[key]) {
      return true;
    }
  }

  return false;
}

function createSafetyEditorDraft(
  params: SimulationParameters,
  initialPreviewDistanceM?: number | null
): SafetyZoneEditorDraft {
  const metrics = calculateSafetyMetrics(safetyInputFromParameters(params));
  const shotEnergyJ = params.laserPowerW * params.engagementDwellS;
  const presetShotEnergyJ = [0.5, 1, 3, 5].reduce(
    (best, candidate) =>
      Math.abs(candidate - shotEnergyJ) < Math.abs(best - shotEnergyJ)
        ? candidate
        : best,
    0.5
  );
  return {
    safetyFocalDistanceM: params.safetyFocalDistanceM,
    safetyStartingApertureMm: params.safetyStartingApertureMm,
    laserPowerW: params.laserPowerW,
    requiredShotEnergyJ: presetShotEnergyJ,
    previewFarmerDistanceM: clamp(
      initialPreviewDistanceM ?? metrics.nominalSafetyZoneRadiusM * 0.7,
      0.5,
      Math.max(metrics.nominalSafetyZoneRadiusM * 1.6, 4)
    )
  };
}

export default function App(): JSX.Element {
  const runtimeConfig = useMemo(() => readRuntimeConfig(), []);
  const isEmbedded = typeof window !== "undefined" && window.parent !== window;
  const initialParams = useMemo<SimulationParameters>(
    () => ({
      ...defaultParameters,
      showOnlySelectedTargetMarkers:
        runtimeConfig.markerModeOverride === "all"
          ? false
          : runtimeConfig.markerModeOverride === "selected"
            ? true
            : defaultParameters.showOnlySelectedTargetMarkers
    }),
    [runtimeConfig]
  );
  const [activeParams, setActiveParams] = useState<SimulationParameters>(initialParams);
  const [draftParams, setDraftParams] = useState<SimulationParameters>(initialParams);
  const [seed, setSeed] = useState(DEFAULT_SEED);
  const [scenarioVersion, setScenarioVersion] = useState(0);
  const [cameraMode, setCameraMode] = useState<CameraMode>(runtimeConfig.initialCameraMode);
  const [activeOverlay, setActiveOverlay] = useState<OverlayScreen>(
    runtimeConfig.startSafetyEditor ? "safetyZone" : null
  );
  const [isExpanded, setIsExpanded] = useState(
    !isEmbedded || runtimeConfig.startExpanded || runtimeConfig.startSafetyEditor
  );
  const [controlsHidden, setControlsHidden] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(PLAYBACK_SPEED);
  const [showBuildToast, setShowBuildToast] = useState(false);
  const [showMissionCompleteToast, setShowMissionCompleteToast] = useState(false);
  const [farmerSafetyToast, setFarmerSafetyToast] = useState<FarmerSafetyToast | null>(null);
  const [fieldReferenceVisible, setFieldReferenceVisible] = useState(false);
  const [pendingFieldReferenceFieldType, setPendingFieldReferenceFieldType] = useState<FieldType | null>(null);
  const [suppressFarmerSafetyToast, setSuppressFarmerSafetyToast] = useState(false);
  const [safetyEditorDraft, setSafetyEditorDraft] = useState<SafetyZoneEditorDraft | null>(
    runtimeConfig.startSafetyEditor ? createSafetyEditorDraft(initialParams) : null
  );
  const [actionMenuOpen, setActionMenuOpen] = useState(false);
  const [aimingLabParams, setAimingLabParams] = useState(createDefaultAimingLabParameters);
  const watchSecondsRef = useRef(0);
  const buildToastTriggeredRef = useRef(false);
  const fieldReferenceShownForRef = useRef<FieldType | null>(null);
  const fieldReferenceTimerRef = useRef<number | null>(null);
  const previousSummaryRef = useRef(false);
  const safetyEditorResumeRef = useRef(false);
  const suppressFarmerSafetyToastRef = useRef(false);
  const { isMobileUi } = useResponsiveUi();
  const isStandalonePage = typeof window !== "undefined" && window.parent === window;

  useEffect(() => {
    suppressFarmerSafetyToastRef.current = suppressFarmerSafetyToast;
  }, [suppressFarmerSafetyToast]);

  const handleMissionLog = useCallback((entry: MissionLogEvent): void => {
    if (entry.event !== "safety-hold") {
      return;
    }

    if (suppressFarmerSafetyToastRef.current) {
      return;
    }

    const blockingDistanceM =
      typeof entry.data?.blockingDistanceM === "number" ? entry.data.blockingDistanceM : null;
    const nominalSafetyZoneRadiusM =
      typeof entry.data?.nominalSafetyZoneRadiusM === "number"
        ? entry.data.nominalSafetyZoneRadiusM
        : null;
    const distanceMessage =
      blockingDistanceM !== null && nominalSafetyZoneRadiusM !== null
        ? `${blockingDistanceM.toFixed(1)} m from the firing axis is inside the current ${nominalSafetyZoneRadiusM.toFixed(1)} m nominal safety zone.`
        : "The shot is deferred and the target will be revisited after the zone clears.";

    setFarmerSafetyToast({
      message: distanceMessage,
      blockingDistanceM,
      nominalSafetyZoneRadiusM
    });
  }, []);

  const {
    engineRef,
    isRunning,
    setIsRunning,
    skipCharging,
    snapshot,
    introProgress,
    isIntroActive
  } = useMissionController(
    activeParams,
    seed,
    scenarioVersion,
    playbackSpeed,
    runtimeConfig.startRunning,
    handleMissionLog
  );
  const interactiveButtonsVisible = isExpanded && !controlsHidden;
  const { soundEnabled, toggleSound } = useMissionAudio(snapshot);
  const hasPendingChanges = useMemo(
    () => parametersDiffer(activeParams, draftParams),
    [activeParams, draftParams]
  );
  const safetyEditorActive = activeOverlay === "safetyZone" && safetyEditorDraft !== null;
  const {
    guideEnabled,
    toggleGuide,
    silenceGuide,
    currentDefinitionId,
    disableLine,
    disabledLineIds,
    setLineEnabled,
    announce,
    currentCaption,
    isSpeaking: guideSpeaking
  } = useMissionGuide(snapshot, activeParams, {
    isExpanded,
    controlsHidden,
    safetyEditorActive,
    farmerSafetyToastVisible: farmerSafetyToast !== null,
    nominalSafetyZoneRadiusM: farmerSafetyToast?.nominalSafetyZoneRadiusM ?? null
  });
  const safetyEditorPreview = useMemo<SafetyEditorPreviewState | null>(() => {
    if (!safetyEditorDraft) {
      return null;
    }

    const { metrics, previewFarmerDistanceM } = deriveSafetyZoneEditorView(
      safetyEditorDraft
    );
    return {
      previewFarmerDistanceM,
      nominalSafetyZoneRadiusM: metrics.nominalSafetyZoneRadiusM,
      farmerSelected: true,
      onToggleFarmerSelection: () => undefined
    };
  }, [safetyEditorDraft]);
  const activeFieldReference = fieldReferenceVisible ? fieldReferenceImageFor(activeParams.fieldType) : null;

  const setViewportExpanded = (nextValue: boolean, syncParent = false): void => {
    setIsExpanded(nextValue);
    if (syncParent) {
      notifyParentViewportMode(nextValue ? "make-big" : "shrink");
    }
  };

  const applyDraft = (): void => {
    setActiveParams(draftParams);
    setScenarioVersion((value) => value + 1);
  };

  const restartMission = (): void => {
    setScenarioVersion((value) => value + 1);
  };

  const randomizeScenario = (): void => {
    setSeed((value) => value + 1);
    setScenarioVersion((value) => value + 1);
  };

  const updateParam = <K extends keyof SimulationParameters>(
    key: K,
    value: SimulationParameters[K]
  ): void => {
    setDraftParams((current) =>
      key === "fieldType"
        ? applyFieldTypePreset(current, value as SimulationParameters["fieldType"])
        : {
            ...current,
            [key]: value
          }
    );
  };

  const applyFieldTypeSelection = (fieldType: FieldType): void => {
    const nextParams = applyFieldTypePreset(activeParams, fieldType);
    setActiveParams(nextParams);
    setDraftParams(nextParams);
    setFarmerSafetyToast(null);
    setScenarioVersion((value) => value + 1);
  };

  const closeSafetyZoneEditor = (resumeMission = safetyEditorResumeRef.current): void => {
    setSafetyEditorDraft(null);
    setActiveOverlay(null);
    if (resumeMission) {
      setIsRunning(true);
    }
    safetyEditorResumeRef.current = false;
  };

  const closeOverlay = (): void => {
    if (activeOverlay === "safetyZone") {
      closeSafetyZoneEditor();
      return;
    }
    setActiveOverlay(null);
  };

  const openSafetyZoneEditor = (initialPreviewDistanceM?: number | null): void => {
    setViewportExpanded(true, true);
    setControlsHidden(false);
    setFarmerSafetyToast(null);
    setSafetyEditorDraft(createSafetyEditorDraft(activeParams, initialPreviewDistanceM));
    setActionMenuOpen(false);
    safetyEditorResumeRef.current = isRunning;
    setIsRunning(false);
    setActiveOverlay("safetyZone");
  };

  const applySafetyZoneChanges = (): void => {
    if (!safetyEditorDraft) {
      return;
    }

    const { derivedDwellS } = deriveSafetyZoneEditorView(safetyEditorDraft);
    const patchedFields = {
      laserPowerW: safetyEditorDraft.laserPowerW,
      engagementDwellS: derivedDwellS,
      safetyFocalDistanceM: safetyEditorDraft.safetyFocalDistanceM,
      safetyStartingApertureMm: safetyEditorDraft.safetyStartingApertureMm
    };
    const nextParams = {
      ...activeParams,
      ...patchedFields
    };

    setActiveParams(nextParams);
    setDraftParams((current) => ({
      ...current,
      ...patchedFields
    }));
    setFarmerSafetyToast(null);
    setSafetyEditorDraft(null);
    setActiveOverlay(null);
    setActionMenuOpen(false);
    safetyEditorResumeRef.current = false;
    setScenarioVersion((value) => value + 1);
  };

  const toggleOverlay = (screen: Exclude<OverlayScreen, null>): void => {
    setActiveOverlay((current) => {
      if (current === screen) {
        return null;
      }
      return screen;
    });
  };

  const openOverlay = (screen: Exclude<OverlayScreen, null>): void => {
    setViewportExpanded(true);
    setControlsHidden(false);
    setActiveOverlay(screen);
  };

  const overlayContent =
    activeOverlay === "setup" ? (
      <ControlPanel
        activeParams={activeParams}
        draftParams={draftParams}
        hasPendingChanges={hasPendingChanges}
        isRunning={isRunning}
        seed={seed}
        onApply={applyDraft}
        onEditSafetyZone={() => openSafetyZoneEditor()}
        onRandomize={randomizeScenario}
        onRestart={restartMission}
        onToggleRun={() => setIsRunning(!isRunning)}
        onParamChange={updateParam}
      />
    ) : activeOverlay === "telemetry" ? (
      <LiveMetrics snapshot={snapshot} isIntroActive={isIntroActive} />
    ) : activeOverlay === "report" ? (
      <SummaryPanel summary={snapshot.summary} />
    ) : activeOverlay === "notes" ? (
      <MethodologyPanel snapshot={snapshot} onOpenBuildPrompt={() => openOverlay("buildPrompt")} />
    ) : activeOverlay === "guideSetup" ? (
      <GuideSetupPanel
        disabledLineIds={disabledLineIds}
        onToggleLine={setLineEnabled}
      />
    ) : activeOverlay === "aiming" ? (
      <AimingLabPanel
        params={aimingLabParams}
        onChange={(patch) =>
          setAimingLabParams((current) => ({
            ...current,
            ...patch
          }))
        }
        onReset={() => setAimingLabParams(createDefaultAimingLabParameters())}
      />
    ) : activeOverlay === "buildPrompt" ? (
      <BuildPromptPanel />
    ) : activeOverlay === "safetyZone" && safetyEditorDraft ? (
      <SafetyZonePanel
        draft={safetyEditorDraft}
        onChange={(patch) =>
          setSafetyEditorDraft((current) => (current ? { ...current, ...patch } : current))
        }
        onApply={applySafetyZoneChanges}
        onClose={() => closeSafetyZoneEditor()}
        onBeamDiagramOpen={() => {
          const lines = buildBeamDiagramIntroLines();
          lines.forEach((line, index) => {
            announce(
              index === 0 ? "beam-diagram-overview" : "beam-diagram-focus",
              line,
              () => activeOverlay === "safetyZone"
            );
          });
        }}
      />
    ) : null;

  useEffect(() => {
    fieldReferenceShownForRef.current = null;
    setFieldReferenceVisible(false);
    setPendingFieldReferenceFieldType(null);
    if (fieldReferenceTimerRef.current !== null && typeof window !== "undefined") {
      window.clearTimeout(fieldReferenceTimerRef.current);
      fieldReferenceTimerRef.current = null;
    }
  }, [activeParams.fieldType]);

  useEffect(() => {
    if (
      isIntroActive ||
      safetyEditorActive ||
      fieldReferenceVisible ||
      fieldReferenceShownForRef.current === activeParams.fieldType ||
      snapshot.metrics.missionElapsedS < 16
    ) {
      return;
    }

    fieldReferenceShownForRef.current = activeParams.fieldType;
    setPendingFieldReferenceFieldType(activeParams.fieldType);
    announce(
      "real-image-context",
      fieldReferenceImageFor(activeParams.fieldType).guideLine,
      () => !safetyEditorActive
    );
  }, [
    activeParams.fieldType,
    announce,
    fieldReferenceVisible,
    isIntroActive,
    safetyEditorActive,
    snapshot.metrics.missionElapsedS
  ]);

  useEffect(() => {
    if (
      pendingFieldReferenceFieldType === null ||
      currentDefinitionId !== "real-image-context" ||
      fieldReferenceVisible
    ) {
      return;
    }

    setFieldReferenceVisible(true);
    setPendingFieldReferenceFieldType(null);
    if (typeof window !== "undefined") {
      fieldReferenceTimerRef.current = window.setTimeout(() => {
        setFieldReferenceVisible(false);
        fieldReferenceTimerRef.current = null;
      }, 10_000);
    }
  }, [
    currentDefinitionId,
    fieldReferenceVisible,
    pendingFieldReferenceFieldType
  ]);

  useEffect(() => {
    return () => {
      if (fieldReferenceTimerRef.current !== null && typeof window !== "undefined") {
        window.clearTimeout(fieldReferenceTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!runtimeConfig.startSafetyEditor || safetyEditorDraft || activeOverlay === "safetyZone") {
      return;
    }

    openSafetyZoneEditor();
  }, [activeOverlay, runtimeConfig.startSafetyEditor, safetyEditorDraft]);

  useEffect(() => {
    if (typeof document === "undefined") {
      return;
    }

    document.body.classList.toggle("page-locked", isExpanded);
    return () => document.body.classList.remove("page-locked");
  }, [isExpanded]);

  useEffect(() => {
    if (!isExpanded || typeof window === "undefined") {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        if (activeOverlay !== null) {
          closeOverlay();
          return;
        }
        setViewportExpanded(false, true);
        return;
      }

      if (event.key.toLowerCase() === "h") {
        setControlsHidden((value) => {
          const nextValue = !value;
          if (nextValue) {
            closeOverlay();
          }
          return nextValue;
        });
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeOverlay, isExpanded]);

  useEffect(() => {
    if (!isExpanded) {
      if (activeOverlay === "safetyZone" && safetyEditorResumeRef.current) {
        setIsRunning(true);
        safetyEditorResumeRef.current = false;
      }
      setControlsHidden(false);
      setActiveOverlay(null);
      setSafetyEditorDraft(null);
      setActionMenuOpen(false);
    }
  }, [activeOverlay, isExpanded, setIsRunning]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const handleParentMessage = (event: MessageEvent<ParentViewportMessage>): void => {
      const message = event.data;
      if (!message || message.source !== "photonic-parent-page") {
        return;
      }

      if (message.type === "make-big") {
        setViewportExpanded(true);
      }

      if (message.type === "shrink") {
        setViewportExpanded(false);
      }
    };

    window.addEventListener("message", handleParentMessage);
    return () => window.removeEventListener("message", handleParentMessage);
  }, []);

  useEffect(() => {
    if (buildToastTriggeredRef.current || typeof window === "undefined" || !isRunning) {
      return;
    }

    const timer = window.setInterval(() => {
      watchSecondsRef.current += 1;
      if (watchSecondsRef.current >= 60) {
        buildToastTriggeredRef.current = true;
        setShowBuildToast(true);
        window.clearInterval(timer);
      }
    }, 1000);

    return () => window.clearInterval(timer);
  }, [isRunning]);

  useEffect(() => {
    const missionComplete = snapshot.summary !== null;
    if (missionComplete && !previousSummaryRef.current) {
      setShowMissionCompleteToast(true);
    }
    if (!missionComplete) {
      setShowMissionCompleteToast(false);
    }
    previousSummaryRef.current = missionComplete;
  }, [snapshot.summary]);

  return (
    <div className="app-shell app-shell-embed">
      {!isEmbedded && !isExpanded ? (
        <a
          className="company-link"
          href="https://www.photonicinsecticides.com"
          target="_blank"
          rel="noreferrer"
        >
          Photonic insecticides
        </a>
      ) : null}
      <main className="main-grid">
        <section
          className={isExpanded ? "scene-stage scene-stage-expanded" : "scene-stage"}
          onDoubleClick={isExpanded && controlsHidden ? () => setControlsHidden(false) : undefined}
        >
          <SimulationScene
            engineRef={engineRef}
            snapshot={snapshot}
            introProgress={introProgress}
            isIntroActive={isIntroActive}
            isExpanded={isExpanded}
            controlsHidden={controlsHidden || safetyEditorActive}
            isMobileUi={isMobileUi}
            mobileMenuOpen={actionMenuOpen}
            playbackSpeed={playbackSpeed}
            playbackSpeedOptions={[...PLAYBACK_SPEED_OPTIONS]}
            onPlaybackSpeedChange={setPlaybackSpeed}
            fieldType={activeParams.fieldType}
            onFieldTypeChange={applyFieldTypeSelection}
            cameraMode={cameraMode}
            onCameraModeChange={setCameraMode}
            safetyEditorPreview={safetyEditorActive ? safetyEditorPreview : null}
          />
          {!safetyEditorActive ? (
            <SceneHud
              snapshot={snapshot}
              isIntroActive={isIntroActive}
              isExpanded={isExpanded}
              controlsHidden={controlsHidden}
              isMobileUi={isMobileUi}
            />
          ) : null}

          {!controlsHidden && !safetyEditorActive ? (
            <div className={isExpanded ? "scene-toast-stack scene-toast-stack-expanded" : "scene-toast-stack"}>
              {snapshot.chargeStatus ? (
              <div className="scene-toast">
                <div>
                  <strong>Charging dock</strong>
                  <p>Recharging for {formatDuration(snapshot.chargeStatus.remainingS)}.</p>
                </div>
                {interactiveButtonsVisible ? (
                  <div className="scene-toast-actions">
                    <button className="secondary-button" onClick={skipCharging}>
                      Skip recharging
                    </button>
                  </div>
                ) : null}
              </div>
              ) : null}

              {farmerSafetyToast ? (
              <div className="scene-toast">
                <div>
                  <strong>Farmer in NSZ</strong>
                  <p>{farmerSafetyToast.message}</p>
                </div>
                {!controlsHidden ? (
                  <div className="scene-toast-actions">
                    <button
                      className="primary-button"
                      onClick={() => openSafetyZoneEditor(farmerSafetyToast.blockingDistanceM)}
                    >
                      Edit nominal safety zone
                    </button>
                    <button className="secondary-button" onClick={() => setFarmerSafetyToast(null)}>
                      Dismiss
                    </button>
                    <button
                      className="secondary-button"
                      onClick={() => {
                        setSuppressFarmerSafetyToast(true);
                        setFarmerSafetyToast(null);
                      }}
                    >
                      Dismiss and don&apos;t show again
                    </button>
                  </div>
                ) : null}
              </div>
              ) : null}

              {showBuildToast ? (
              <div className="scene-toast">
                <div>
                  <strong>Build it yourself</strong>
                  <p>Open the full Codex prompt and rebuild the simulation in a fresh session.</p>
                </div>
                {interactiveButtonsVisible ? (
                  <div className="scene-toast-actions">
                    <button className="primary-button" onClick={() => openOverlay("buildPrompt")}>
                      Build it yourself
                    </button>
                    <button className="secondary-button" onClick={() => setShowBuildToast(false)}>
                      Dismiss
                    </button>
                  </div>
                ) : null}
              </div>
              ) : null}

              {showMissionCompleteToast ? (
              <div className="scene-toast scene-toast-emphasis">
                <div>
                  <strong>Mission complete</strong>
                  <p>The drone cleared the current infestation and closed the energy ledger.</p>
                </div>
                {interactiveButtonsVisible ? (
                  <div className="scene-toast-actions">
                    <button className="primary-button" onClick={() => openOverlay("report")}>
                      Open mission report
                    </button>
                    <button className="secondary-button" onClick={() => setShowMissionCompleteToast(false)}>
                      Close
                    </button>
                  </div>
                ) : null}
              </div>
              ) : null}
            </div>
          ) : null}

          <GuideAvatar
            caption={currentCaption}
            isSpeaking={guideSpeaking}
            onSilence={silenceGuide}
            onDisableLine={() => {
              if (currentDefinitionId) {
                disableLine(currentDefinitionId);
              }
            }}
          />

          {!safetyEditorActive ? (
          <div className="scene-action-dock">
            {isExpanded ? (
              controlsHidden ? (
                <div className="scene-action-row">
                  <button
                    className="secondary-button"
                    onClick={() => setControlsHidden(false)}
                  >
                    Show buttons
                  </button>
                </div>
              ) : (
                <>
                  <div className="scene-action-row scene-action-row-mobile-toggle">
                    <button
                      className="secondary-button"
                      onClick={() => setActionMenuOpen((value) => !value)}
                    >
                      {actionMenuOpen ? "Close menu" : "Menu"}
                    </button>
                    <button
                      className="secondary-button"
                      onClick={() => {
                        setControlsHidden((value) => {
                          const nextValue = !value;
                          if (nextValue) {
                            closeOverlay();
                            setActionMenuOpen(false);
                          }
                          return nextValue;
                        });
                      }}
                    >
                      Hide buttons
                    </button>
                  </div>
                  {actionMenuOpen ? (
                    <div className="scene-action-menu">
                      <div className="scene-action-row">
                        <button
                          className={activeOverlay === "setup" ? "camera-button active" : "camera-button"}
                          onClick={() => {
                            toggleOverlay("setup");
                            setActionMenuOpen(false);
                          }}
                        >
                          Setup
                        </button>
                        <button
                          className={activeOverlay === "telemetry" ? "camera-button active" : "camera-button"}
                          onClick={() => {
                            toggleOverlay("telemetry");
                            setActionMenuOpen(false);
                          }}
                        >
                          {isMobileUi ? "Stats" : "Telemetry"}
                        </button>
                        <button
                          className={activeOverlay === "report" ? "camera-button active" : "camera-button"}
                          onClick={() => {
                            toggleOverlay("report");
                            setActionMenuOpen(false);
                          }}
                        >
                          {isMobileUi ? "Report" : "Mission report"}
                        </button>
                        <button
                          className={activeOverlay === "notes" ? "camera-button active" : "camera-button"}
                          onClick={() => {
                            toggleOverlay("notes");
                            setActionMenuOpen(false);
                          }}
                        >
                          {isMobileUi ? "Notes" : "Model notes"}
                        </button>
                      </div>
                      <div className="scene-action-row">
                        <button className="secondary-button" onClick={toggleSound}>
                          {soundEnabled ? "Sound on" : "Sound off"}
                        </button>
                        <button
                          className="secondary-button"
                          onClick={guideEnabled ? silenceGuide : toggleGuide}
                        >
                          {guideEnabled ? "Be silent" : "Guide on"}
                        </button>
                        <button
                          className={activeOverlay === "guideSetup" ? "camera-button active" : "camera-button"}
                          onClick={() => {
                            toggleOverlay("guideSetup");
                            setActionMenuOpen(false);
                          }}
                        >
                          Guide setup
                        </button>
                        <button
                          className={activeOverlay === "aiming" ? "camera-button active" : "camera-button"}
                          onClick={() => {
                            toggleOverlay("aiming");
                            setActionMenuOpen(false);
                          }}
                        >
                          Aiming
                        </button>
                        <button className="secondary-button" onClick={restartMission}>
                          Restart
                        </button>
                        <button className="secondary-button" onClick={() => setIsRunning(!isRunning)}>
                          {isRunning ? "Pause" : "Resume"}
                        </button>
                        <button
                          className="secondary-button"
                          onClick={() => {
                            setActionMenuOpen(false);
                            setViewportExpanded(false, true);
                          }}
                        >
                          Shrink
                        </button>
                        {!isEmbedded ? (
                          <a
                            className="secondary-button company-link-button"
                            href="https://www.photonicinsecticides.com"
                            target="_blank"
                            rel="noreferrer"
                          >
                            Photonic insecticides
                          </a>
                        ) : null}
                      </div>
                    </div>
                  ) : null}
                </>
              )
            ) : (
                <div className="scene-action-row">
                  <button className="secondary-button" onClick={() => setViewportExpanded(true, true)}>
                    Get big and configure
                  </button>
                </div>
            )}
          </div>
          ) : null}

          {activeFieldReference && !safetyEditorActive ? (
            <div className="scene-reference-card">
              <img
                className="scene-reference-card-image"
                src={activeFieldReference.imageUrl}
                alt={activeFieldReference.title}
              />
              <div className="scene-reference-card-body">
                <span className="eyebrow">Real image context</span>
                <strong>{activeFieldReference.title}</strong>
                <p>{activeFieldReference.caption}</p>
                <span className="scene-reference-card-source">{activeFieldReference.sourceLabel}</span>
              </div>
            </div>
          ) : null}

          {overlayContent ? (
            <div
              className={
                activeOverlay === "safetyZone"
                  ? "scene-overlay-backdrop scene-overlay-backdrop-safety"
                  : "scene-overlay-backdrop"
              }
              onClick={closeOverlay}
            >
                <div
                  className={
                    activeOverlay === "safetyZone"
                      ? "scene-overlay-frame scene-overlay-frame-safety"
                      : activeOverlay === "aiming"
                        ? "scene-overlay-frame scene-overlay-frame-wide"
                      : "scene-overlay-frame"
                  }
                  onClick={(event) => event.stopPropagation()}
                >
                <button className="overlay-close" onClick={closeOverlay}>
                  Close
                </button>
                {overlayContent}
              </div>
            </div>
          ) : null}
        </section>

        {isStandalonePage ? (
          <div className="standalone-company-link">
            <span>Built for</span>
            <a href="https://www.photonicinsecticides.com" target="_blank" rel="noreferrer">
              Photonic insecticides
            </a>
          </div>
        ) : null}
      </main>
    </div>
  );
}
