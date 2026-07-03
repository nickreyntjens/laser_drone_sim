import { useCallback, useEffect, useRef, useState } from "react";
import { SimulationSnapshot } from "../sim/types";

type AudioContextLike = AudioContext;

interface MissionAudioState {
  mode: SimulationSnapshot["drone"]["mode"];
  charging: boolean;
  missionComplete: boolean;
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

  return {
    soundEnabled,
    toggleSound: () => setSoundEnabled((value) => !value)
  };
}
