import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  buildChargingCompleteLine,
  buildChargingStartLine,
  buildBeamDiagramIntroLines,
  buildFarmerNszMeaningLine,
  buildFieldSwitchLine,
  buildFieldModesReminderLine,
  buildGuideIntroLines,
  buildMissionCompleteLine,
  buildNeutralizationReminderLine,
  buildNominalSafetyZoneEditLine,
  buildNominalSafetyZoneRingLine,
  buildPlaybackReminderLine,
  buildSafetyEditorIntroLines,
  buildSafetyHoldLine
} from "../content/guideScript";
import { GuideLineDefinitionId } from "../content/guideCatalog";
import { SimulationSnapshot, SimulationParameters } from "../sim/types";

const GUIDE_SENTENCE_GAP_MS = 7000;
const GUIDE_DISABLED_LINES_STORAGE_KEY = "photonic-laser-drone-sim.disabledGuideLines";

interface GuideQueueItem {
  id: string;
  definitionId: GuideLineDefinitionId;
  text: string;
  stillRelevant?: () => boolean;
}

interface MissionGuideState {
  guideEnabled: boolean;
  toggleGuide: () => void;
  silenceGuide: () => void;
  currentDefinitionId: GuideLineDefinitionId | null;
  disableLine: (definitionId: GuideLineDefinitionId) => void;
  disabledLineIds: GuideLineDefinitionId[];
  setLineEnabled: (definitionId: GuideLineDefinitionId, enabled: boolean) => void;
  announce: (
    definitionId: GuideLineDefinitionId,
    text: string,
    stillRelevant?: () => boolean
  ) => void;
  currentCaption: string | null;
  isSpeaking: boolean;
}

export function useMissionGuide(
  snapshot: SimulationSnapshot,
  activeParams: SimulationParameters,
  options: {
    isExpanded: boolean;
    controlsHidden: boolean;
    safetyEditorActive: boolean;
    farmerSafetyToastVisible: boolean;
    nominalSafetyZoneRadiusM: number | null;
  }
): MissionGuideState {
  const [guideEnabled, setGuideEnabled] = useState(true);
  const [currentCaption, setCurrentCaption] = useState<string | null>(null);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [currentDefinitionId, setCurrentDefinitionId] = useState<GuideLineDefinitionId | null>(null);
  const [disabledLineIds, setDisabledLineIds] = useState<GuideLineDefinitionId[]>(() => {
    if (typeof window === "undefined") {
      return [];
    }

    try {
      const raw = window.localStorage.getItem(GUIDE_DISABLED_LINES_STORAGE_KEY);
      return raw ? (JSON.parse(raw) as GuideLineDefinitionId[]) : [];
    } catch {
      return [];
    }
  });
  const queueRef = useRef<GuideQueueItem[]>([]);
  const currentCaptionRef = useRef<string | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const introQueuedRef = useRef(false);
  const spokenIdsRef = useRef<Set<string>>(new Set());
  const previousFieldTypeRef = useRef(activeParams.fieldType);
  const previousTargetingModeRef = useRef(activeParams.targetingMode);
  const previousNeutralizedRef = useRef(snapshot.metrics.beetlesNeutralized);
  const previousChargeRef = useRef(snapshot.chargeStatus !== null);
  const previousSummaryRef = useRef(snapshot.summary !== null);
  const previousSafetyToastRef = useRef(options.farmerSafetyToastVisible);
  const previousSafetyEditorActiveRef = useRef(options.safetyEditorActive);
  const previousModeRef = useRef(snapshot.drone.mode);
  const disabledLineIdsRef = useRef<Set<GuideLineDefinitionId>>(new Set(disabledLineIds));
  const reminderStateRef = useRef({
    nextPlaybackReminderS: 35,
    nextFieldModeReminderS: 18,
    nextNeutralizationReminderCount: 16,
    nszRingExplained: false,
    nszEditExplained: false,
    nszFarmerMeaningExplained: false
  });

  const canDisplayGuide =
    guideEnabled && options.isExpanded && !options.controlsHidden;

  const optionsRef = useRef(options);
  useEffect(() => {
    optionsRef.current = options;
  }, [options]);

  useEffect(() => {
    disabledLineIdsRef.current = new Set(disabledLineIds);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(
        GUIDE_DISABLED_LINES_STORAGE_KEY,
        JSON.stringify(disabledLineIds)
      );
    }
  }, [disabledLineIds]);

  const clearPendingSpeech = useCallback(() => {
    if (timeoutRef.current !== null) {
      globalThis.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }

    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }

    utteranceRef.current = null;
    currentCaptionRef.current = null;
    setCurrentDefinitionId(null);
    setCurrentCaption(null);
    setIsSpeaking(false);
  }, []);

  const flushGuideQueue = useCallback(() => {
    clearPendingSpeech();
    queueRef.current = [];
  }, [clearPendingSpeech]);

  const playNext = useCallback(() => {
    if (!canDisplayGuide) {
      currentCaptionRef.current = null;
      setCurrentCaption(null);
      setIsSpeaking(false);
      return;
    }

    let next = queueRef.current.shift();
    while (next && next.stillRelevant && !next.stillRelevant()) {
      next = queueRef.current.shift();
    }
    if (!next) {
      currentCaptionRef.current = null;
      setCurrentCaption(null);
      setIsSpeaking(false);
      return;
    }

    setCurrentDefinitionId(next.definitionId);
    currentCaptionRef.current = next.text;
    setCurrentCaption(next.text);
    const fallbackDurationMs = Math.max(3200, Math.min(9200, next.text.length * 42));

    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      const utterance = new SpeechSynthesisUtterance(next.text);
      utterance.rate = 1;
      utterance.pitch = 1;
      utterance.volume = 1;
      utteranceRef.current = utterance;
      setIsSpeaking(true);
      utterance.onend = () => {
        utteranceRef.current = null;
        currentCaptionRef.current = null;
        setCurrentDefinitionId(null);
        setIsSpeaking(false);
        setCurrentCaption(null);
        scheduleNextAfterGap();
      };
      utterance.onerror = utterance.onend;
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(utterance);
      return;
    }

    setIsSpeaking(false);
    if (typeof window !== "undefined") {
      timeoutRef.current = globalThis.setTimeout(() => {
        timeoutRef.current = null;
        currentCaptionRef.current = null;
        setCurrentDefinitionId(null);
        setCurrentCaption(null);
        scheduleNextAfterGap(0);
      }, fallbackDurationMs);
    }
  }, [canDisplayGuide]);

  const scheduleNextAfterGap = useCallback((gapMs = GUIDE_SENTENCE_GAP_MS) => {
    if (timeoutRef.current !== null) {
      globalThis.clearTimeout(timeoutRef.current);
    }

    timeoutRef.current = globalThis.setTimeout(() => {
      timeoutRef.current = null;
      playNext();
    }, gapMs);
  }, [playNext]);

  const enqueue = useCallback(
    (
      id: string,
      definitionId: GuideLineDefinitionId,
      text: string,
      once = true,
      stillRelevant?: () => boolean
    ) => {
      if (!guideEnabled) {
        return;
      }
      if (disabledLineIdsRef.current.has(definitionId)) {
        return;
      }
      if (once && spokenIdsRef.current.has(id)) {
        return;
      }
      if (once) {
        spokenIdsRef.current.add(id);
      }
      queueRef.current.push({ id, definitionId, text, stillRelevant });
      if (!currentCaptionRef.current && !utteranceRef.current && timeoutRef.current === null) {
        playNext();
      }
    },
    [guideEnabled, playNext]
  );

  useEffect(() => {
    if (!canDisplayGuide) {
      clearPendingSpeech();
      return;
    }
    if (
      !currentCaption &&
      queueRef.current.length > 0 &&
      timeoutRef.current === null &&
      utteranceRef.current === null
    ) {
      playNext();
    }
  }, [canDisplayGuide, clearPendingSpeech, currentCaption, playNext]);

  useEffect(() => {
    if (!options.isExpanded || introQueuedRef.current) {
      return;
    }

    introQueuedRef.current = true;
    const introLines = buildGuideIntroLines(activeParams);
    for (let index = 0; index < introLines.length; index += 1) {
      const definitionId = ([
        "intro-welcome",
        "intro-field-context",
        "intro-field-biology",
        "intro-mission-mode",
        "intro-visible-targets",
        "intro-selected-target",
        "intro-desktop",
        "intro-farmers-setting",
        "intro-next-target",
        "intro-energy-budget",
        "intro-setup"
      ] as GuideLineDefinitionId[])[index];
      enqueue(
        `intro-${index}-${activeParams.fieldType}-${activeParams.targetingMode}`,
        definitionId,
        introLines[index],
        true
      );
    }
  }, [activeParams, enqueue, options.isExpanded]);

  useEffect(() => {
    if (previousFieldTypeRef.current !== activeParams.fieldType) {
      flushGuideQueue();
      enqueue(`field-${activeParams.fieldType}`, "field-switch", buildFieldSwitchLine(activeParams.fieldType), false);
      previousFieldTypeRef.current = activeParams.fieldType;
    }
    if (previousTargetingModeRef.current !== activeParams.targetingMode) {
      const modeLine = buildGuideIntroLines(activeParams)[3];
      enqueue(`mode-${activeParams.targetingMode}-${activeParams.fieldType}`, "intro-mission-mode", modeLine, false);
      previousTargetingModeRef.current = activeParams.targetingMode;
    }
  }, [activeParams, enqueue, flushGuideQueue]);

  useEffect(() => {
    if (
      snapshot.metrics.beetlesNeutralized > 0 &&
      previousNeutralizedRef.current === 0
    ) {
      enqueue(
        `first-neutralization-${activeParams.fieldType}`,
        "first-neutralization",
        "Target neutralized. The route planner immediately advances to the next remaining target.",
        true
      );
    }
    if (
      snapshot.metrics.beetlesNeutralized >=
      reminderStateRef.current.nextNeutralizationReminderCount
    ) {
      enqueue(
        `neutralization-reminder-${reminderStateRef.current.nextNeutralizationReminderCount}`,
        "neutralization-reminder",
        buildNeutralizationReminderLine(),
        false
      );
      reminderStateRef.current.nextNeutralizationReminderCount += 16;
    }
    previousNeutralizedRef.current = snapshot.metrics.beetlesNeutralized;
  }, [activeParams.fieldType, enqueue, snapshot.metrics.beetlesNeutralized]);

  useEffect(() => {
    const charging = snapshot.chargeStatus !== null;
    if (charging && !previousChargeRef.current) {
      enqueue(`charging-start-${snapshot.metrics.rechargeCycles}`, "charging-start", buildChargingStartLine(), false);
    } else if (!charging && previousChargeRef.current) {
      enqueue(`charging-complete-${snapshot.metrics.rechargeCycles}`, "charging-complete", buildChargingCompleteLine(), false);
    }
    previousChargeRef.current = charging;
  }, [enqueue, snapshot.chargeStatus, snapshot.metrics.rechargeCycles]);

  useEffect(() => {
    if (options.farmerSafetyToastVisible && !previousSafetyToastRef.current) {
      enqueue(
        `safety-hold-${snapshot.metrics.beetlesNeutralized}-${snapshot.metrics.rechargeCycles}`,
        "safety-hold",
        buildSafetyHoldLine(options.nominalSafetyZoneRadiusM),
        false,
        () => optionsRef.current.farmerSafetyToastVisible
      );
      if (!reminderStateRef.current.nszFarmerMeaningExplained) {
        enqueue(
          "farmer-nsz-meaning",
          "nsz-farmer-meaning",
          buildFarmerNszMeaningLine(),
          true,
          () => optionsRef.current.farmerSafetyToastVisible
        );
        reminderStateRef.current.nszFarmerMeaningExplained = true;
      }
      if (!reminderStateRef.current.nszEditExplained) {
        enqueue("nsz-edit-after-safety-hold", "nsz-edit", buildNominalSafetyZoneEditLine(), true);
        reminderStateRef.current.nszEditExplained = true;
      }
    }
    previousSafetyToastRef.current = options.farmerSafetyToastVisible;
  }, [
    enqueue,
    options.farmerSafetyToastVisible,
    options.nominalSafetyZoneRadiusM,
    snapshot.metrics.beetlesNeutralized,
    snapshot.metrics.rechargeCycles
  ]);

  useEffect(() => {
    if (options.safetyEditorActive && !previousSafetyEditorActiveRef.current) {
      flushGuideQueue();
      const introLines = buildSafetyEditorIntroLines();
      for (let index = 0; index < introLines.length; index += 1) {
        const definitionId = ([
          "safety-editor-intro",
          "safety-editor-focal-distance",
          "safety-editor-aperture",
          "safety-editor-target-energy",
          "safety-editor-beam-diagram"
        ] as GuideLineDefinitionId[])[index];
        enqueue(
          `safety-editor-${index}`,
          definitionId,
          introLines[index],
          false,
          () => optionsRef.current.safetyEditorActive
        );
      }
    }
    previousSafetyEditorActiveRef.current = options.safetyEditorActive;
  }, [enqueue, flushGuideQueue, options.safetyEditorActive]);

  useEffect(() => {
    const complete = snapshot.summary !== null;
    if (complete && !previousSummaryRef.current && snapshot.summary) {
      enqueue(
        `mission-complete-${snapshot.summary.beetlesNeutralized}`,
        "mission-complete",
        buildMissionCompleteLine(snapshot.summary.beetlesNeutralized),
        false
      );
    }
    previousSummaryRef.current = complete;
  }, [enqueue, snapshot.summary]);

  useEffect(() => {
    const missionElapsedS = snapshot.metrics.missionElapsedS;
    if (missionElapsedS >= reminderStateRef.current.nextFieldModeReminderS) {
      enqueue(
        `field-modes-reminder-${reminderStateRef.current.nextFieldModeReminderS}`,
        "field-modes-reminder",
        buildFieldModesReminderLine(),
        false
      );
      reminderStateRef.current.nextFieldModeReminderS += 120;
    }

    if (missionElapsedS >= reminderStateRef.current.nextPlaybackReminderS) {
      enqueue(
        `playback-reminder-${reminderStateRef.current.nextPlaybackReminderS}`,
        "playback-reminder",
        buildPlaybackReminderLine(),
        false
      );
      reminderStateRef.current.nextPlaybackReminderS += 90;
    }
  }, [enqueue, snapshot.metrics.missionElapsedS]);

  useEffect(() => {
    if (
      snapshot.drone.mode === "firing" &&
      previousModeRef.current !== "firing" &&
      !reminderStateRef.current.nszRingExplained
    ) {
      enqueue("nsz-ring-explainer", "nsz-ring", buildNominalSafetyZoneRingLine(), true);
      reminderStateRef.current.nszRingExplained = true;
    }
    previousModeRef.current = snapshot.drone.mode;
  }, [enqueue, snapshot.drone.mode]);

  useEffect(() => {
    if (
      snapshot.metrics.missionElapsedS >= 50 &&
      !reminderStateRef.current.nszEditExplained
    ) {
      enqueue("nsz-edit-explainer", "nsz-edit", buildNominalSafetyZoneEditLine(), true);
      reminderStateRef.current.nszEditExplained = true;
    }
  }, [enqueue, snapshot.metrics.missionElapsedS]);

  useEffect(() => {
    return () => clearPendingSpeech();
  }, [clearPendingSpeech]);

  const toggleGuide = useCallback(() => {
    setGuideEnabled((value) => !value);
  }, []);

  const silenceGuide = useCallback(() => {
    clearPendingSpeech();
    queueRef.current = [];
    setGuideEnabled(false);
  }, [clearPendingSpeech]);

  const disableLine = useCallback(
    (definitionId: GuideLineDefinitionId) => {
      setDisabledLineIds((current) =>
        current.includes(definitionId) ? current : [...current, definitionId]
      );
      queueRef.current = queueRef.current.filter((item) => item.definitionId !== definitionId);
      if (currentDefinitionId === definitionId) {
        clearPendingSpeech();
        if (queueRef.current.length > 0 && canDisplayGuide) {
          scheduleNextAfterGap(0);
        }
      }
    },
    [canDisplayGuide, clearPendingSpeech, currentDefinitionId, scheduleNextAfterGap]
  );

  const setLineEnabled = useCallback((definitionId: GuideLineDefinitionId, enabled: boolean) => {
    setDisabledLineIds((current) => {
      const exists = current.includes(definitionId);
      if (enabled) {
        return exists ? current.filter((entry) => entry !== definitionId) : current;
      }
      return exists ? current : [...current, definitionId];
    });
  }, []);

  const announce = useCallback(
    (
      definitionId: GuideLineDefinitionId,
      text: string,
      stillRelevant?: () => boolean
    ) => {
      const dynamicId = `${definitionId}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      enqueue(dynamicId, definitionId, text, false, stillRelevant);
    },
    [enqueue]
  );

  return useMemo(
    () => ({
      guideEnabled,
      toggleGuide,
      silenceGuide,
      currentDefinitionId: canDisplayGuide ? currentDefinitionId : null,
      disableLine,
      disabledLineIds,
      setLineEnabled,
      announce,
      currentCaption: canDisplayGuide ? currentCaption : null,
      isSpeaking: canDisplayGuide && isSpeaking
    }),
    [
      announce,
      canDisplayGuide,
      currentCaption,
      currentDefinitionId,
      disableLine,
      disabledLineIds,
      guideEnabled,
      isSpeaking,
      setLineEnabled,
      silenceGuide,
      toggleGuide
    ]
  );
}
