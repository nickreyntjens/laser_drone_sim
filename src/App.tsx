import { useEffect, useMemo, useRef, useState } from "react";
import { BuildPromptPanel } from "./components/BuildPromptPanel";
import { ControlPanel } from "./components/ControlPanel";
import { LiveMetrics } from "./components/LiveMetrics";
import { MethodologyPanel } from "./components/MethodologyPanel";
import { SceneHud } from "./components/SceneHud";
import { SimulationScene } from "./components/SimulationScene";
import { SummaryPanel } from "./components/SummaryPanel";
import { useMissionController } from "./hooks/useMissionController";
import { useResponsiveUi } from "./hooks/useResponsiveUi";
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
type TutorialStep = {
  id: string;
  selector: string;
  title: string;
  body: string;
};
type ParentViewportMessage =
  | {
      source: "photonic-laser-drone-sim";
      type: "make-big" | "shrink";
    }
  | {
      source: "photonic-parent-page";
      type: "make-big" | "shrink";
    };

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

const TUTORIAL_STEPS: TutorialStep[] = [
  {
    id: "setup",
    selector: '[data-tutorial-id="setup-button"]',
    title: "Setup",
    body: "Configure beetle pressure, field size, drone properties, firing limits, and recharge assumptions."
  },
  {
    id: "telemetry",
    selector: '[data-tutorial-id="telemetry-button"]',
    title: "Telemetry",
    body: "Check battery state, energy use, cost per hectare, and the live mission mode while the sortie runs."
  },
  {
    id: "playback",
    selector: '[data-tutorial-id="playback-control"]',
    title: "Playback",
    body: "Speed the simulation up when you want to skip ahead and inspect the end of the mission faster."
  }
];

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
  const [hasAutoShownTutorial, setHasAutoShownTutorial] = useState(false);
  const [tutorialStepIndex, setTutorialStepIndex] = useState<number | null>(null);
  const [tutorialRect, setTutorialRect] = useState<DOMRect | null>(null);
  const watchSecondsRef = useRef(0);
  const buildToastTriggeredRef = useRef(false);
  const previousSummaryRef = useRef(false);
  const { isMobileUi } = useResponsiveUi();

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
  const tutorialStep = tutorialStepIndex === null ? null : TUTORIAL_STEPS[tutorialStepIndex];
  const tutorialVisible = isExpanded && !controlsHidden && tutorialStep !== null;

  const setViewportExpanded = (nextValue: boolean, syncParent = false): void => {
    setIsExpanded(nextValue);
    if (syncParent) {
      notifyParentViewportMode(nextValue ? "make-big" : "shrink");
    }
  };

  const finishTutorial = (): void => {
    setTutorialStepIndex(null);
    setTutorialRect(null);
  };

  const startTutorial = (): void => {
    setControlsHidden(false);
    setActiveOverlay(null);
    setTutorialStepIndex(0);
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
    setDraftParams((current) => ({
      ...current,
      [key]: value
    }));
  };

  const toggleOverlay = (screen: Exclude<OverlayScreen, null>): void => {
    setActiveOverlay((current) => (current === screen ? null : screen));
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
        setViewportExpanded(false, true);
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
      setTutorialStepIndex(null);
      setTutorialRect(null);
    }
  }, [isExpanded]);

  useEffect(() => {
    if (isExpanded && !hasAutoShownTutorial && tutorialStepIndex === null && !controlsHidden) {
      setHasAutoShownTutorial(true);
      startTutorial();
    }
  }, [controlsHidden, hasAutoShownTutorial, isExpanded, tutorialStepIndex]);

  useEffect(() => {
    if (!tutorialVisible || !tutorialStep || typeof window === "undefined") {
      return;
    }

    const updateRect = (): void => {
      const element = document.querySelector(tutorialStep.selector);
      if (!(element instanceof HTMLElement)) {
        return;
      }
      setTutorialRect(element.getBoundingClientRect());
    };

    updateRect();
    window.addEventListener("resize", updateRect);

    const currentStepIndex = tutorialStepIndex;
    const timer = window.setTimeout(() => {
      if (currentStepIndex === null) {
        return;
      }

      if (currentStepIndex >= TUTORIAL_STEPS.length - 1) {
        finishTutorial();
        return;
      }

      setTutorialStepIndex(currentStepIndex + 1);
    }, 4200);

    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("resize", updateRect);
    };
  }, [tutorialStep, tutorialStepIndex, tutorialVisible]);

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
            isMobileUi={isMobileUi}
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
            isMobileUi={isMobileUi}
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
                      data-tutorial-id="setup-button"
                      onClick={() => toggleOverlay("setup")}
                    >
                      Setup
                    </button>
                    <button
                      className={activeOverlay === "telemetry" ? "camera-button active" : "camera-button"}
                      data-tutorial-id="telemetry-button"
                      onClick={() => toggleOverlay("telemetry")}
                    >
                      {isMobileUi ? "Stats" : "Telemetry"}
                    </button>
                    <button
                      className={activeOverlay === "report" ? "camera-button active" : "camera-button"}
                      onClick={() => toggleOverlay("report")}
                    >
                      {isMobileUi ? "Report" : "Mission report"}
                    </button>
                    <button
                      className={activeOverlay === "notes" ? "camera-button active" : "camera-button"}
                      onClick={() => toggleOverlay("notes")}
                    >
                      {isMobileUi ? "Notes" : "Model notes"}
                    </button>
                  </div>
                  <div className="scene-action-row">
                    <button className="secondary-button" onClick={tutorialVisible ? finishTutorial : startTutorial}>
                      {tutorialVisible ? "Skip tutorial" : "Tutorial"}
                    </button>
                    <button className="secondary-button" onClick={restartMission}>
                      Restart
                    </button>
                    <button className="secondary-button" onClick={() => setIsRunning(!isRunning)}>
                      {isRunning ? "Pause" : "Resume"}
                    </button>
                    <button className="secondary-button" onClick={() => setViewportExpanded(false, true)}>
                      Shrink
                    </button>
                  </div>
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

          {tutorialVisible && tutorialRect ? (
            <div
              className={isMobileUi ? "tutorial-callout tutorial-callout-mobile" : "tutorial-callout"}
              style={{
                ...(isMobileUi
                  ? {
                      left: 12,
                      right: 12,
                      bottom: 14
                    }
                  : {
                      top:
                        tutorialRect.top > 180
                          ? Math.max(18, tutorialRect.top - 150)
                          : Math.min(tutorialRect.bottom + 14, window.innerHeight - 164),
                      left: Math.min(
                        Math.max(tutorialRect.left, 18),
                        Math.max(18, window.innerWidth - 330)
                      )
                    })
              }}
            >
              <span className="eyebrow">Quick tour</span>
              <strong>{tutorialStep.title}</strong>
              <p>{tutorialStep.body}</p>
              <div className="tutorial-progress">
                {TUTORIAL_STEPS.map((step, index) => (
                  <span
                    key={step.id}
                    className={index === tutorialStepIndex ? "tutorial-dot active" : "tutorial-dot"}
                  />
                ))}
              </div>
            </div>
          ) : null}

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
