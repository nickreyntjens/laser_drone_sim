import { MutableRefObject, useEffect, useRef, useState } from "react";
import { MissionEngine } from "../sim/engine";
import { MissionLogEvent, SimulationParameters, SimulationSnapshot } from "../sim/types";

interface UseMissionControllerResult {
  engineRef: MutableRefObject<MissionEngine>;
  isRunning: boolean;
  setIsRunning: (value: boolean) => void;
  skipCharging: () => void;
  snapshot: SimulationSnapshot;
  introProgress: number;
  isIntroActive: boolean;
}

const FIELD_POPULATION_INTRO_S = 2.4;
const SIMULATION_STEP_S = 0.02;
const MAX_SIM_STEPS_PER_FRAME = 120;

export function useMissionController(
  params: SimulationParameters,
  seed: number,
  scenarioVersion: number,
  playbackSpeed: number,
  startRunning = true,
  onLogEvent?: (entry: MissionLogEvent) => void
): UseMissionControllerResult {
  const emitLogEvent = (entry: MissionLogEvent): void => {
    if (import.meta.env.DEV) {
      console.debug("[mission]", entry);
    }
    onLogEvent?.(entry);
  };

  const engineRef = useRef<MissionEngine>(
    new MissionEngine(params, seed, playbackSpeed, {
      enableDebugLogging: import.meta.env.DEV || !!onLogEvent,
      onLogEvent: import.meta.env.DEV || onLogEvent ? emitLogEvent : undefined
    })
  );
  const [snapshot, setSnapshot] = useState<SimulationSnapshot>(engineRef.current.getSnapshot());
  const [isRunning, setIsRunning] = useState(startRunning);
  const [introElapsedS, setIntroElapsedS] = useState(0);
  const introElapsedRef = useRef(0);

  useEffect(() => {
    engineRef.current = new MissionEngine(params, seed, playbackSpeed, {
      enableDebugLogging: import.meta.env.DEV || !!onLogEvent,
      onLogEvent: import.meta.env.DEV || onLogEvent ? emitLogEvent : undefined
    });
    introElapsedRef.current = 0;
    setIntroElapsedS(0);
    setSnapshot(engineRef.current.getSnapshot());
    setIsRunning(startRunning);
  }, [onLogEvent, params, scenarioVersion, seed, startRunning]);

  useEffect(() => {
    engineRef.current.playbackSpeed = playbackSpeed;
    setSnapshot(engineRef.current.getSnapshot());
  }, [playbackSpeed]);

  useEffect(() => {
    let frameHandle = 0;
    let previous = performance.now();
    let uiAccumulator = 0;

    const tick = (now: number): void => {
      const dt = Math.min((now - previous) / 1000, 0.05);
      previous = now;
      let introElapsed = introElapsedRef.current;
      let introAdvanced = false;

      if (isRunning) {
        if (introElapsed < FIELD_POPULATION_INTRO_S) {
          introElapsed = Math.min(introElapsed + dt, FIELD_POPULATION_INTRO_S);
          introElapsedRef.current = introElapsed;
          introAdvanced = true;
        } else {
          const targetSimBudgetS = Math.min(
            dt * playbackSpeed,
            SIMULATION_STEP_S * MAX_SIM_STEPS_PER_FRAME
          );
          let remainingBudgetS = targetSimBudgetS;
          while (remainingBudgetS > 1e-6) {
            const simStepS = Math.min(SIMULATION_STEP_S, remainingBudgetS);
            engineRef.current.step(simStepS);
            remainingBudgetS -= simStepS;
          }
        }
      }

      uiAccumulator += dt;
      if (
        uiAccumulator >= 0.09 ||
        engineRef.current.summary ||
        introAdvanced
      ) {
        uiAccumulator = 0;
        setSnapshot(engineRef.current.getSnapshot());
        setIntroElapsedS(introElapsed);
      }

      frameHandle = window.requestAnimationFrame(tick);
    };

    frameHandle = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frameHandle);
  }, [isRunning, params, seed, scenarioVersion, playbackSpeed]);

  return {
    engineRef,
    isRunning,
    setIsRunning,
    skipCharging: () => {
      engineRef.current.skipCharging();
      setSnapshot(engineRef.current.getSnapshot());
    },
    snapshot,
    introProgress: Math.min(introElapsedS / FIELD_POPULATION_INTRO_S, 1),
    isIntroActive: introElapsedS < FIELD_POPULATION_INTRO_S
  };
}
