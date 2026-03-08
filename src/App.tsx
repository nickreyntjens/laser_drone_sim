import { useEffect, useMemo, useRef, useState } from "react";
import { BuildPromptPanel } from "./components/BuildPromptPanel";
import { ControlPanel } from "./components/ControlPanel";
import { LiveMetrics } from "./components/LiveMetrics";
import { MethodologyPanel } from "./components/MethodologyPanel";
import { SceneHud } from "./components/SceneHud";
import { SimulationScene } from "./components/SimulationScene";
import { SummaryPanel } from "./components/SummaryPanel";
import { useMissionController } from "./hooks/useMissionController";
import { formatDuration } from "./lib/format";
import {
  DEFAULT_SEED,
  PLAYBACK_SPEED,
  PLAYBACK_SPEED_OPTIONS,
  defaultParameters
} from "./sim/defaults";
import { SimulationParameters } from "./sim/types";

type CameraMode = "follow" | "overview" | "dock" | "manual";
type OverlayScreen = "setup" | "telemetry" | "report" | "notes" | "buildPrompt" | null;

function readRuntimeConfig(): {
  startRunning: boolean;
  initialCameraMode: CameraMode;
  startExpanded: boolean;
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
    requestedCamera === "follow"
      ? requestedCamera
      : "follow";

  return {
    startRunning: search.get("autoplay") !== "0",
    initialCameraMode,
    startExpanded: search.get("expanded") === "1",
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

export default function App(): JSX.Element {
  const runtimeConfig = useMemo(() => readRuntimeConfig(), []);
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
  const [activeOverlay, setActiveOverlay] = useState<OverlayScreen>(null);
  const [isExpanded, setIsExpanded] = useState(runtimeConfig.startExpanded);
  const [controlsHidden, setControlsHidden] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(PLAYBACK_SPEED);
  const [showBuildToast, setShowBuildToast] = useState(false);
  const [showMissionCompleteToast, setShowMissionCompleteToast] = useState(false);
  const watchSecondsRef = useRef(0);
  const buildToastTriggeredRef = useRef(false);
  const previousSummaryRef = useRef(false);

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
    runtimeConfig.startRunning
  );
  const interactiveButtonsVisible = isExpanded && !controlsHidden;

  const hasPendingChanges = useMemo(
    () => parametersDiffer(activeParams, draftParams),
    [activeParams, draftParams]
  );

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
    setDraftParams((current) => ({
      ...current,
      [key]: value
    }));
  };

  const toggleOverlay = (screen: Exclude<OverlayScreen, null>): void => {
    setActiveOverlay((current) => (current === screen ? null : screen));
  };

  const openOverlay = (screen: Exclude<OverlayScreen, null>): void => {
    setIsExpanded(true);
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
    ) : activeOverlay === "buildPrompt" ? (
      <BuildPromptPanel />
    ) : null;

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
        setIsExpanded(false);
        return;
      }

      if (event.key.toLowerCase() === "h") {
        setControlsHidden((value) => {
          const nextValue = !value;
          if (nextValue) {
            setActiveOverlay(null);
          }
          return nextValue;
        });
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isExpanded]);

  useEffect(() => {
    if (!isExpanded) {
      setControlsHidden(false);
      setActiveOverlay(null);
    }
  }, [isExpanded]);

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
            controlsHidden={controlsHidden}
            playbackSpeed={playbackSpeed}
            playbackSpeedOptions={[...PLAYBACK_SPEED_OPTIONS]}
            onPlaybackSpeedChange={setPlaybackSpeed}
            cameraMode={cameraMode}
            onCameraModeChange={setCameraMode}
          />
          <SceneHud
            snapshot={snapshot}
            isIntroActive={isIntroActive}
            isExpanded={isExpanded}
            controlsHidden={controlsHidden}
          />

          {!controlsHidden ? (
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
                  <div className="scene-action-row">
                    <button
                      className="secondary-button"
                      onClick={() => {
                        setControlsHidden((value) => {
                          const nextValue = !value;
                          if (nextValue) {
                            setActiveOverlay(null);
                          }
                          return nextValue;
                        });
                      }}
                    >
                      Hide buttons
                    </button>
                  </div>
                  <div className="scene-action-row">
                    <button
                      className={activeOverlay === "setup" ? "camera-button active" : "camera-button"}
                      onClick={() => toggleOverlay("setup")}
                    >
                      Setup
                    </button>
                    <button
                      className={activeOverlay === "telemetry" ? "camera-button active" : "camera-button"}
                      onClick={() => toggleOverlay("telemetry")}
                    >
                      Telemetry
                    </button>
                    <button
                      className={activeOverlay === "report" ? "camera-button active" : "camera-button"}
                      onClick={() => toggleOverlay("report")}
                    >
                      Mission report
                    </button>
                    <button
                      className={activeOverlay === "notes" ? "camera-button active" : "camera-button"}
                      onClick={() => toggleOverlay("notes")}
                    >
                      Model notes
                    </button>
                  </div>
                  <div className="scene-action-row">
                    <button className="secondary-button" onClick={restartMission}>
                      Restart
                    </button>
                    <button className="secondary-button" onClick={() => setIsRunning(!isRunning)}>
                      {isRunning ? "Pause" : "Resume"}
                    </button>
                    <button className="secondary-button" onClick={() => setIsExpanded(false)}>
                      Shrink
                    </button>
                  </div>
                </>
              )
            ) : (
                <div className="scene-action-row">
                  <button className="secondary-button" onClick={() => setIsExpanded(true)}>
                    Get big
                  </button>
                </div>
            )}
          </div>

          {overlayContent ? (
            <div className="scene-overlay-backdrop" onClick={() => setActiveOverlay(null)}>
              <div className="scene-overlay-frame" onClick={(event) => event.stopPropagation()}>
                <button className="overlay-close" onClick={() => setActiveOverlay(null)}>
                  Close
                </button>
                {overlayContent}
              </div>
            </div>
          ) : null}
        </section>
      </main>
    </div>
  );
}
