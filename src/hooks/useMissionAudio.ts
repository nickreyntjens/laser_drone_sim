import { useCallback, useEffect, useRef, useState } from "react";
import { SimulationSnapshot } from "../sim/types";

type AudioContextLike = AudioContext;

interface MissionAudioState {
  mode: SimulationSnapshot["drone"]["mode"];
  charging: boolean;
  missionComplete: boolean;
}

interface HumGraph {
  context: AudioContextLike;
  masterGain: GainNode;
  lowOscillator: OscillatorNode;
  highOscillator: OscillatorNode;
  filter: BiquadFilterNode;
}

const STORAGE_KEY = "photonic-laser-drone-sim.soundEnabled";

function createAudioContext(): AudioContextLike | null {
  if (typeof window === "undefined") {
    return null;
  }

  const AudioContextCtor =
    window.AudioContext ||
    (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;

  return AudioContextCtor ? new AudioContextCtor() : null;
}

function envelopeGain(context: AudioContextLike, volume: number): GainNode {
  const gain = context.createGain();
  gain.gain.setValueAtTime(0.0001, context.currentTime);
  gain.connect(context.destination);
  gain.gain.exponentialRampToValueAtTime(volume, context.currentTime + 0.012);
  return gain;
}

function createHumGraph(context: AudioContextLike): HumGraph {
  const filter = context.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.setValueAtTime(440, context.currentTime);
  filter.Q.setValueAtTime(0.8, context.currentTime);

  const masterGain = context.createGain();
  masterGain.gain.setValueAtTime(0.0001, context.currentTime);

  const lowOscillator = context.createOscillator();
  lowOscillator.type = "sawtooth";
  lowOscillator.frequency.setValueAtTime(86, context.currentTime);

  const highOscillator = context.createOscillator();
  highOscillator.type = "triangle";
  highOscillator.frequency.setValueAtTime(172, context.currentTime);

  lowOscillator.connect(filter);
  highOscillator.connect(filter);
  filter.connect(masterGain);
  masterGain.connect(context.destination);

  lowOscillator.start();
  highOscillator.start();

  return {
    context,
    masterGain,
    lowOscillator,
    highOscillator,
    filter
  };
}

export function useMissionAudio(snapshot: SimulationSnapshot): {
  soundEnabled: boolean;
  toggleSound: () => void;
} {
  const [soundEnabled, setSoundEnabled] = useState<boolean>(() => {
    if (typeof window === "undefined") {
      return true;
    }

    const stored = window.localStorage.getItem(STORAGE_KEY);
    return stored === null ? true : stored === "1";
  });
  const audioContextRef = useRef<AudioContextLike | null>(null);
  const humGraphRef = useRef<HumGraph | null>(null);
  const previousStateRef = useRef<MissionAudioState>({
    mode: snapshot.drone.mode,
    charging: snapshot.chargeStatus !== null,
    missionComplete: snapshot.summary !== null
  });
  const lastLaserCueRef = useRef(0);

  const ensureAudioContext = useCallback(async (): Promise<AudioContextLike | null> => {
    if (!audioContextRef.current) {
      audioContextRef.current = createAudioContext();
    }

    if (!audioContextRef.current) {
      return null;
    }

    if (audioContextRef.current.state === "suspended") {
      try {
        await audioContextRef.current.resume();
      } catch {
        return null;
      }
    }

    return audioContextRef.current;
  }, []);

  const ensureHumGraph = useCallback(async (): Promise<HumGraph | null> => {
    const context = await ensureAudioContext();
    if (!context) {
      return null;
    }

    if (!humGraphRef.current || humGraphRef.current.context !== context) {
      humGraphRef.current = createHumGraph(context);
    }

    return humGraphRef.current;
  }, [ensureAudioContext]);

  const playLaserCue = useCallback(async () => {
    const context = await ensureAudioContext();
    if (!context) {
      return;
    }

    const now = performance.now();
    if (now - lastLaserCueRef.current < 140) {
      return;
    }
    lastLaserCueRef.current = now;

    const gain = envelopeGain(context, 0.028);
    const oscillator = context.createOscillator();
    oscillator.type = "triangle";
    oscillator.frequency.setValueAtTime(920, context.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(1480, context.currentTime + 0.055);
    oscillator.connect(gain);
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.09);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.1);
  }, [ensureAudioContext]);

  const playChargeCompleteCue = useCallback(async () => {
    const context = await ensureAudioContext();
    if (!context) {
      return;
    }

    const notes = [523.25, 659.25];
    notes.forEach((frequency, index) => {
      const startTime = context.currentTime + index * 0.08;
      const gain = context.createGain();
      gain.gain.setValueAtTime(0.0001, startTime);
      gain.gain.exponentialRampToValueAtTime(0.035, startTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.22);
      gain.connect(context.destination);

      const oscillator = context.createOscillator();
      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(frequency, startTime);
      oscillator.connect(gain);
      oscillator.start(startTime);
      oscillator.stop(startTime + 0.24);
    });
  }, [ensureAudioContext]);

  const playMissionCompleteCue = useCallback(async () => {
    const context = await ensureAudioContext();
    if (!context) {
      return;
    }

    const notes = [392, 523.25, 659.25];
    notes.forEach((frequency, index) => {
      const startTime = context.currentTime + index * 0.11;
      const gain = context.createGain();
      gain.gain.setValueAtTime(0.0001, startTime);
      gain.gain.exponentialRampToValueAtTime(0.04, startTime + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.34);
      gain.connect(context.destination);

      const oscillator = context.createOscillator();
      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(frequency, startTime);
      oscillator.connect(gain);
      oscillator.start(startTime);
      oscillator.stop(startTime + 0.36);
    });
  }, [ensureAudioContext]);

  useEffect(() => {
    if (typeof window === "undefined" || !soundEnabled) {
      return;
    }

    const unlock = (): void => {
      void ensureAudioContext();
    };

    window.addEventListener("pointerdown", unlock, { passive: true });
    window.addEventListener("keydown", unlock);

    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, [ensureAudioContext, soundEnabled]);

  useEffect(() => {
    let cancelled = false;

    const updateHum = async (): Promise<void> => {
      const graph = await ensureHumGraph();
      if (!graph || cancelled) {
        return;
      }

      const speedMps = Math.sqrt(
        snapshot.drone.velocity.x * snapshot.drone.velocity.x +
          snapshot.drone.velocity.y * snapshot.drone.velocity.y +
          snapshot.drone.velocity.z * snapshot.drone.velocity.z
      );
      const airborne =
        snapshot.drone.mode !== "idle" &&
        snapshot.drone.mode !== "charging" &&
        snapshot.drone.mode !== "complete";
      const targetGain = soundEnabled && airborne ? 0.012 + Math.min(speedMps / 90, 0.018) : 0.0001;
      const lowFrequency = 84 + Math.min(speedMps * 4.5, 38);
      const highFrequency = lowFrequency * 2.05;
      const filterFrequency = 320 + Math.min(speedMps * 24, 260);
      const now = graph.context.currentTime;

      graph.masterGain.gain.cancelScheduledValues(now);
      graph.masterGain.gain.setValueAtTime(graph.masterGain.gain.value, now);
      graph.masterGain.gain.exponentialRampToValueAtTime(targetGain, now + 0.18);
      graph.lowOscillator.frequency.setTargetAtTime(lowFrequency, now, 0.12);
      graph.highOscillator.frequency.setTargetAtTime(highFrequency, now, 0.12);
      graph.filter.frequency.setTargetAtTime(filterFrequency, now, 0.16);
    };

    void updateHum();

    return () => {
      cancelled = true;
    };
  }, [ensureHumGraph, snapshot.drone.mode, snapshot.drone.velocity.x, snapshot.drone.velocity.y, snapshot.drone.velocity.z, soundEnabled]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(STORAGE_KEY, soundEnabled ? "1" : "0");
  }, [soundEnabled]);

  useEffect(() => {
    const nextState: MissionAudioState = {
      mode: snapshot.drone.mode,
      charging: snapshot.chargeStatus !== null,
      missionComplete: snapshot.summary !== null
    };
    const previousState = previousStateRef.current;

    if (soundEnabled) {
      if (nextState.mode === "firing" && previousState.mode !== "firing") {
        void playLaserCue();
      }

      if (previousState.charging && !nextState.charging && nextState.mode !== "charging") {
        void playChargeCompleteCue();
      }

      if (nextState.missionComplete && !previousState.missionComplete) {
        void playMissionCompleteCue();
      }
    }

    previousStateRef.current = nextState;
  }, [playChargeCompleteCue, playLaserCue, playMissionCompleteCue, snapshot, soundEnabled]);

  useEffect(() => {
    return () => {
      humGraphRef.current?.lowOscillator.stop();
      humGraphRef.current?.highOscillator.stop();
      humGraphRef.current = null;
    };
  }, []);

  return {
    soundEnabled,
    toggleSound: () => setSoundEnabled((value) => !value)
  };
}
