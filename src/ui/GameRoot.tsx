import React from 'react';

import { DebugPanel } from './DebugPanel';
import { GameHUD } from './GameHUD';
import { ToastProvider, useToast } from './components/ToastProvider';
import { createInitialCharacters } from '../shared/characterFactory';
import { audioManager, type BgmTrack } from '../shared/audio/audioManager';
import { eventBus } from '../shared/eventBus';
import { EVENTS } from '../shared/eventNames';
import { flightEventTarget, type FlightResult } from '../shared/flightEvents';
import { GAME_CONFIG } from '../shared/gameConfig';
import { getLocation } from '../shared/data/gameData';
import { worldStateManager } from '../shared/systems/worldStateManager';
import { generateDialogue } from '../shared/api/dialogueApi';
import { generateMission } from '../shared/api/missionsApi';
import { endMissionSession, startMissionSession } from '../shared/api/missionSessionsApi';
import { generateMissionEvent } from '../shared/api/missionBoardApi';
import { generateNarration } from '../shared/api/narrationApi';
import { resolveMissionQuestBridge } from '../shared/missions/missionBridge';
import { applyMissionPhaseHooks } from '../shared/missions/missionPhaseHooks';
import { generateScriptMissions } from '../shared/missions/missionScriptGenerator';
import { getMissionScript } from '../shared/missions/missionScripts';
import { checkForNewUnlocks, createDefaultAchievementState, getAllAchievementDefinitions } from '../shared/progress/achievements';
import {
    createDefaultStatistics,
    recordLevelUp,
    recordMissionCompleted,
    recordMissionFailed,
    recordMoneyBalance,
    recordMoneySpent,
    startSession,
    tickPlayTime
} from '../shared/progress/statistics';
import type { CharacterState, FlightParams, Mission, MissionResult, Resources, ScreenId } from '../shared/types/Game';
import type { AchievementState, StatisticsState } from '../shared/types/Progress';
import type { SaveSnapshot } from '../shared/types/Save';
import type { MissionOutcome, MissionSessionPhaseId } from '../shared/types/World';
import { missionManager } from '../shared/quests/missionManager';
import type { Quest } from '../shared/quests/quest';
import { startQuestFromTemplate } from '../shared/quests/questRuntime';
import { HangarScreen } from './screens/HangarScreen';
import { AchievementsScreen } from './screens/AchievementsScreen';
import { ExplorationScreen } from './screens/ExplorationScreen';
import { MainMenuScreen } from './screens/MainMenuScreen';
import { MissionBriefingScreen } from './screens/MissionBriefingScreen';
import { MissionBoardScreen } from './screens/MissionBoardScreen';
import { MissionStoryScreen } from './screens/MissionStoryScreen';
import { ResultsScreen } from './screens/ResultsScreen';
import { SaveLoadScreen } from './screens/SaveLoadScreen';
import { StatisticsScreen } from './screens/StatisticsScreen';
import { useHudState } from './useHudState';
import { usePhaserGame } from './usePhaserGame';

export function GameRoot() {
    return (
        <ToastProvider>
            <GameRootInner />
        </ToastProvider>
    );
}

type GameState = {
    screen: ScreenId;
    resources: Resources;
    characters: CharacterState[];
    selectedCharacterId: string;
    missions: Mission[];
	flightParams: FlightParams | null;
	activeMission: Mission | null;
	activeSessionId: string | null;
	flightPhaseOverride: MissionSessionPhaseId | null;
	flightResumePhase: MissionSessionPhaseId | null;
	lastResult: MissionResult | null;
	explorationDebrief: MissionResult | null;
	inboundFlight: FlightResult | null;
	pendingExplorationQuestTemplateId: string | null;
	explorationStartLocationId: string | null;
	explorationSpawnPoint: string | null;
	pendingMissionOutcome: MissionOutcome | null;
	statistics: StatisticsState;
	achievements: AchievementState;
};

type GameAction =
    | { type: 'NAVIGATE'; screen: ScreenId }
    | { type: 'SELECT_CHARACTER'; characterId: string }
    | { type: 'SET_RESOURCES'; resources: Resources; spending?: { amount: number; reason: string } }
    | { type: 'SET_MISSIONS'; missions: Mission[] }
    | { type: 'START_FLIGHT'; mission: Mission; charId: string; fuelCost: number }
    | { type: 'SET_ACTIVE_SESSION'; missionId: string; sessionId: string }
    | { type: 'CLEAR_ACTIVE_SESSION' }
    | { type: 'SET_FLIGHT_PHASE_OVERRIDE'; phaseId: MissionSessionPhaseId }
    | { type: 'CANCEL_MISSION'; screen: ScreenId }
    | { type: 'ABORT_FLIGHT'; screen: ScreenId }
    | { type: 'ABORT_ACTIVE_MISSION'; screen: ScreenId; reason?: 'abort' | 'timeout' }
    | { type: 'FLIGHT_COMPLETE'; result: FlightResult; bridge?: { questTemplateId: string; startLocationId: string; spawnPoint: string } }
    | { type: 'MISSION_COMPLETE_FROM_EXPLORATION'; mission: Mission; actorId: string }
    | { type: 'QUEST_COMPLETE'; questId: string; title: string; description: string; location: string; actorId: string; rewards: { money: number; exp: number } }
    | { type: 'GRANT_REWARD'; actorId: string; money: number; exp: number; reason: string }
    | { type: 'CLOSE_EXPLORATION_DEBRIEF' }
    | { type: 'CLEAR_PENDING_EXPLORATION_QUEST' }
    | { type: 'CLEAR_PENDING_MISSION_OUTCOME' }
    | { type: 'TICK_PLAYTIME'; nowIso: string; deltaSeconds: number }
    | { type: 'LOAD_SNAPSHOT'; snapshot: LoadedSnapshot; nowIso: string; nowMs: number }
    | { type: 'RESET_PROGRESS'; nowIso: string; nowMs: number }
    | { type: 'EXIT_RESULTS'; screen: ScreenId };

const STORAGE_KEY = 'sws:save:v1';
const SAVE_VERSION = 2 as const;

type LoadedSnapshot = {
    resources: Resources;
    characters: CharacterState[];
    missions: Mission[];
    selectedCharacterId: string;
    statistics: StatisticsState;
    achievements: AchievementState;
};

function deriveMissionPhaseId(screen: ScreenId, fallbackPhaseId: MissionSessionPhaseId = 'dispatch'): MissionSessionPhaseId {
    if (screen === 'briefing') return 'dispatch';
    if (screen === 'exploration') {
        if (fallbackPhaseId === 'return' || fallbackPhaseId === 'debrief') {
            return fallbackPhaseId;
        }
        return 'solve';
    }
    if (screen === 'story' || screen === 'results') return 'debrief';
    return fallbackPhaseId;
}

const MISSION_PHASE_IDS: MissionSessionPhaseId[] = [
    'dispatch',
    'launch',
    'flight',
    'arrival',
    'transform',
    'landing',
    'solve',
    'return',
    'debrief'
];

const FLIGHT_PHASE_IDS = new Set<MissionSessionPhaseId>(['launch', 'flight', 'arrival', 'transform', 'landing']);

function coerceMissionPhaseId(value: unknown): MissionSessionPhaseId | null {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    if (!trimmed) return null;
    return (MISSION_PHASE_IDS as string[]).includes(trimmed) ? (trimmed as MissionSessionPhaseId) : null;
}

function resolveMissionPhaseId(params: {
    screen: ScreenId;
    flightPhaseOverride: MissionSessionPhaseId | null;
    fallbackPhaseId: MissionSessionPhaseId;
}): MissionSessionPhaseId {
    if (params.screen === 'flight') {
        if (params.flightPhaseOverride && FLIGHT_PHASE_IDS.has(params.flightPhaseOverride)) {
            return params.flightPhaseOverride;
        }
        return params.fallbackPhaseId;
    }
    return deriveMissionPhaseId(params.screen, params.fallbackPhaseId);
}

function GameRootInner() {
    const phaserParentRef = React.useRef<HTMLDivElement | null>(null);
    const toast = useToast();

    const [state, dispatch] = React.useReducer(gameReducer, undefined, initGameState);
    const stateRef = React.useRef<GameState>(state);
    const bgmTrackRef = React.useRef<BgmTrack | null>(null);
    const [audioUnlocked, setAudioUnlocked] = React.useState(false);
    const [flightNarration, setFlightNarration] = React.useState<string | null>(null);
    const missionTimeoutHandledRef = React.useRef<string | null>(null);

    React.useEffect(() => {
        stateRef.current = state;
    }, [state]);

    React.useEffect(() => {
        const onPhaseChanged = (payload: unknown) => {
            if (!payload || typeof payload !== 'object') return;
            const data = payload as Partial<{ phaseId: unknown; missionId: unknown }>;
            const phaseId = coerceMissionPhaseId(data.phaseId);
            if (!phaseId) return;

            const current = stateRef.current;
            if (!current.activeMission) return;
            if (current.screen !== 'flight') return;
            if (typeof data.missionId === 'string' && data.missionId && current.activeMission.id !== data.missionId) return;

            dispatch({ type: 'SET_FLIGHT_PHASE_OVERRIDE', phaseId });
        };

        eventBus.on(EVENTS.MISSION_PHASE_CHANGED, onPhaseChanged);
        return () => {
            eventBus.off(EVENTS.MISSION_PHASE_CHANGED, onPhaseChanged);
        };
    }, [dispatch]);

    const missionSessionSyncKeyRef = React.useRef<string | null>(null);
    React.useEffect(() => {
        worldStateManager.initialize();

	        const mission = state.activeMission;
	        if (!mission) {
		            const session = worldStateManager.getActiveMissionSession();
		            if (session) {
		                const outcome: MissionOutcome = state.pendingMissionOutcome ?? 'aborted';
		                const missionQuestId = session.missionQuestId;
		                if (outcome !== 'completed' && missionQuestId) {
		                    void missionManager.initialize({ mainCharacter: session.actorId }).then(() => {
		                        missionManager.abandonQuest(missionQuestId);
		                    });
		                }
		                worldStateManager.archiveActiveMissionSession(outcome);
		            }
	            if (state.pendingMissionOutcome) {
	                dispatch({ type: 'CLEAR_PENDING_MISSION_OUTCOME' });
	            }
	            missionSessionSyncKeyRef.current = null;
	            return;
	        }

        const actorId = state.flightParams?.charId ?? state.selectedCharacterId;
        const lastPlayer = worldStateManager.getLastPlayerState();
        const locationId = lastPlayer?.locationId ?? null;
        const prev = worldStateManager.getActiveMissionSession();
        const phaseId = resolveMissionPhaseId({
            screen: state.screen,
            flightPhaseOverride: state.flightPhaseOverride,
            fallbackPhaseId: prev?.phaseId ?? 'dispatch'
        });
	        const inboundFlight = state.inboundFlight;
	        const sessionId = state.activeSessionId;
	        const missionQuestId = prev?.missionQuestId ?? null;
	        const spawnedInteractables = prev?.spawnedInteractables ?? [];

	        const syncKey = [sessionId ?? '', actorId, phaseId, locationId ?? '', mission.id, inboundFlight?.score ?? 0, missionQuestId ?? ''].join('|');
	        if (missionSessionSyncKeyRef.current === syncKey) return;
	        missionSessionSyncKeyRef.current = syncKey;

        const now = Date.now();
        const startedAt = prev?.startedAt ?? now;
        const phaseStartedAt = prev && prev.phaseId === phaseId ? prev.phaseStartedAt : now;

	        worldStateManager.setActiveMissionSession({
	            sessionId,
	            actorId,
	            missionQuestId,
	            spawnedInteractables,
	            phaseId,
	            phaseStartedAt,
	            locationId,
	            mission,
            inboundFlight,
            startedAt,
            updatedAt: now,
            log: prev?.log ?? []
        });
	    }, [
	        state.activeMission,
	        state.activeSessionId,
	        state.flightParams?.charId,
	        state.flightPhaseOverride,
	        state.inboundFlight,
	        state.pendingMissionOutcome,
	        state.screen,
	        state.selectedCharacterId
	    ]);

	    const missionTimelineKeyRef = React.useRef<string | null>(null);
	    React.useEffect(() => {
        const mission = state.activeMission;
        if (!mission) {
            missionTimelineKeyRef.current = null;
            return;
        }

        worldStateManager.initialize();
        const session = worldStateManager.getActiveMissionSession();
        if (!session) return;

        const actorId = state.flightParams?.charId ?? state.selectedCharacterId;
        const phaseId = resolveMissionPhaseId({
            screen: state.screen,
            flightPhaseOverride: state.flightPhaseOverride,
            fallbackPhaseId: session.phaseId
        });
	        const key = `${mission.id}:${phaseId}`;
	        if (missionTimelineKeyRef.current === key) return;
	        missionTimelineKeyRef.current = key;

	        applyMissionPhaseHooks({ mission, phaseId });

	        const hasLogKind = (kind: string) => session.log.some((e) => e.phaseId === phaseId && e.kind === kind);

        if (phaseId === 'dispatch') {
            if (!hasLogKind('system')) {
                worldStateManager.appendMissionLog({
                    phaseId,
                    kind: 'system',
                    title: 'Dispatch',
                    text: `Mission accepted: ${mission.title}`
                });
            }
            if (!hasLogKind('dialogue')) {
                void generateDialogue({
                    characterId: actorId,
                    dialogueType: 'dispatch',
                    situation: `Starting mission: ${mission.title}`,
                    missionPhase: phaseId,
                    emotion: 'happy',
                    speakingTo: 'child',
                    location: mission.location,
                    problem: mission.description
                })
                    .then((res) => {
                        worldStateManager.appendMissionLog({
                            phaseId,
                            kind: 'dialogue',
                            title: 'Dispatch Call',
                            text: res.dialogue
                        });
                    })
                    .catch(() => {
                        // Ignore dialogue failures (offline backend).
                    });
            }
            return;
        }

        if (phaseId === 'launch') {
            if (!hasLogKind('system')) {
                worldStateManager.appendMissionLog({
                    phaseId,
                    kind: 'system',
                    title: 'Launch',
                    text: 'Engines armed. Hold SPACE to build thrust and take off.'
                });
            }
            return;
        }

        if (phaseId === 'flight') {
            if (!hasLogKind('narration')) {
                void generateNarration({
                    characterId: actorId,
                    phase: 'flying',
                    location: mission.location,
                    problem: mission.description,
                    result: 'en_route'
                })
                    .then((res) => {
                        worldStateManager.appendMissionLog({
                            phaseId,
                            kind: 'narration',
                            title: 'In Flight',
                            text: res.narration
                        });
                    })
                    .catch(() => {
                        // Ignore narration failures (offline backend).
                    });
            }
            return;
        }

        if (phaseId === 'arrival') {
            if (!hasLogKind('system')) {
                worldStateManager.appendMissionLog({
                    phaseId,
                    kind: 'system',
                    title: 'Arrival',
                    text: `Arrival confirmed near ${mission.location}. Preparing for the next sequence.`
                });
            }
            return;
        }

        if (phaseId === 'transform') {
            if (!hasLogKind('system')) {
                worldStateManager.appendMissionLog({
                    phaseId,
                    kind: 'system',
                    title: 'Transformation',
                    text: 'Transformation initiated. Stay sharp.'
                });
            }
            return;
        }

        if (phaseId === 'landing') {
            if (!hasLogKind('system')) {
                worldStateManager.appendMissionLog({
                    phaseId,
                    kind: 'system',
                    title: 'Landing',
                    text: 'Landing sequence engaged. Maintain altitude control and follow the guidance.'
                });
            }
            return;
        }

        if (phaseId === 'solve') {
            if (!hasLogKind('narration')) {
                void generateNarration({
                    characterId: actorId,
                    phase: 'arrival',
                    location: mission.location,
                    problem: mission.description,
                    result: 'arrived'
                })
                    .then((res) => {
                        worldStateManager.appendMissionLog({
                            phaseId,
                            kind: 'narration',
                            title: 'Arrival',
                            text: res.narration
                        });
                    })
                    .catch(() => {
                        // Ignore narration failures (offline backend).
                    });
            }

            if (!hasLogKind('event')) {
                void generateMissionEvent({
                    characterId: actorId,
                    location: mission.location,
                    missionPhase: phaseId,
                    originalProblem: mission.description
                })
                    .then((event) => {
                        worldStateManager.appendMissionLog({
                            phaseId,
                            kind: 'event',
                            title: event.name,
                            text: `${event.description}\n\n${event.challenge}`,
                            eventId: event.event_id,
                            choices: event.choices.map((choice, idx) => ({
                                id: `choice_${idx}`,
                                text: choice.option
                            }))
                        });
                    })
                    .catch(() => {
                        // Ignore event failures (offline backend).
                    });
            }
        }

        if (phaseId === 'return') {
            if (!hasLogKind('system')) {
                worldStateManager.appendMissionLog({
                    phaseId,
                    kind: 'system',
                    title: 'Return',
                    text: 'Objective complete. Returning to base.'
                });
            }
            return;
        }

        if (phaseId === 'debrief') {
            if (!hasLogKind('system')) {
                worldStateManager.appendMissionLog({
                    phaseId,
                    kind: 'system',
                    title: 'Debrief',
                    text: 'Debrief in progress.'
                });
            }
        }
	    }, [state.activeMission, state.flightParams?.charId, state.flightPhaseOverride, state.screen, state.selectedCharacterId]);

	    const missionReturnHandledRef = React.useRef<string | null>(null);
	    React.useEffect(() => {
	        const onLocationChanged = (payload: unknown) => {
	            if (!payload || typeof payload !== 'object') return;
	            const data = payload as Partial<{ locationId: string }>;
	            if (data.locationId !== 'base_airport') return;

	            const current = stateRef.current;
	            const mission = current.activeMission;
	            if (!mission) return;

	            worldStateManager.initialize();
	            const session = worldStateManager.getActiveMissionSession();
	            if (!session) return;
	            if (session.mission.id !== mission.id) return;
	            if (session.phaseId !== 'return') return;
	            if (missionReturnHandledRef.current === mission.id) return;

	            missionReturnHandledRef.current = mission.id;
	            worldStateManager.updateActiveMissionSession({ phaseId: 'debrief', phaseStartedAt: Date.now() });
	        };

	        eventBus.on(EVENTS.LOCATION_CHANGED, onLocationChanged);
	        return () => {
	            eventBus.off(EVENTS.LOCATION_CHANGED, onLocationChanged);
	        };
	    }, []);

	    React.useEffect(() => {
	        const unlock = () => {
	            void audioManager.resume().finally(() => setAudioUnlocked(true));
	        };

        window.addEventListener('pointerdown', unlock, { once: true });
        window.addEventListener('keydown', unlock, { once: true });
        return () => {
            window.removeEventListener('pointerdown', unlock);
            window.removeEventListener('keydown', unlock);
        };
    }, []);

    React.useEffect(() => {
        if (!audioUnlocked) return;

        const nextTrack: BgmTrack =
            state.screen === 'flight' || state.screen === 'briefing'
                ? 'flight'
                : state.screen === 'story' || state.screen === 'results'
                  ? 'results'
                  : state.screen === 'mainMenu'
                    ? 'menu'
                    : 'hangar';

        const prev = bgmTrackRef.current;
        if (prev === nextTrack) return;

        if (prev === null) {
            audioManager.startBGM(nextTrack);
        } else {
            audioManager.crossfadeBGM(nextTrack, 800);
        }
        bgmTrackRef.current = nextTrack;
    }, [audioUnlocked, state.screen]);

    React.useEffect(() => {
        if (state.screen !== 'flight') {
            setFlightNarration(null);
            return;
        }

        const mission = state.activeMission;
        const charId = state.flightParams?.charId;
        if (!mission || !charId) return;

        let cancelled = false;
        setFlightNarration(null);

        generateNarration({
            characterId: charId,
            phase: 'flying',
            location: mission.location,
            problem: mission.description,
            result: 'en_route'
        })
            .then((res) => {
                if (cancelled) return;
                setFlightNarration(res.narration || null);
            })
            .catch(() => {
                // Ignore narration failures (offline backend).
            });

        return () => {
            cancelled = true;
        };
    }, [state.activeMission, state.flightParams?.charId, state.flightParams?.missionId, state.screen]);

    const isPhaserActive = state.screen === 'flight' || state.screen === 'exploration';

    usePhaserGame(
        phaserParentRef,
        isPhaserActive,
	        state.screen === 'flight' && state.flightParams
	            ? {
	                  mode: 'flight',
	                  flight: {
	                      missionType: state.flightParams.missionType,
	                      charId: state.flightParams.charId,
	                      missionId: state.flightParams.missionId,
	                      location: state.activeMission?.location ?? 'world_airport',
	                      resumePhaseId: state.flightResumePhase ?? undefined
	                  }
	              }
              : state.screen === 'exploration'
              ? {
                    mode: 'exploration',
                    exploration: {
                        charId: state.selectedCharacterId,
                        startLocationId: state.explorationStartLocationId ?? undefined,
                        spawnPoint: state.explorationSpawnPoint ?? undefined
                    }
                }
              : undefined
    );

    const hudState = useHudState(state.screen === 'flight');
    const showFlightOverlay = hudState.status !== 'ready';

    React.useEffect(() => {
        const onFlightComplete = (event: Event) => {
            const detail = (event as CustomEvent<FlightResult>).detail;
            const mission = stateRef.current.activeMission;
            if (detail?.success) {
                const bridge = resolveMissionQuestBridge(stateRef.current.activeMission);
                const location = getLocation(bridge.startLocationId);
                const spawn = location?.spawnPoints?.[bridge.spawnPoint] ?? location?.spawnPoints?.default ?? { x: 320, y: 760 };
                worldStateManager.setLastPlayerState({
                    locationId: bridge.startLocationId,
                    spawnPoint: bridge.spawnPoint,
                    x: spawn.x,
                    y: spawn.y,
                    movementMode: 'walk'
                });
                dispatch({ type: 'FLIGHT_COMPLETE', result: detail, bridge });
                return;
            }

            dispatch({ type: 'FLIGHT_COMPLETE', result: detail });

            if (mission && detail) {
                const bonus = Math.max(0, Math.floor(detail.score));
                const money = Math.max(0, Math.floor(mission.rewardMoney + bonus));
                const exp = Math.max(0, Math.floor(mission.rewardExp));
                eventBus.emit(EVENTS.REWARD_GRANTED, {
                    actorId: detail.charId,
                    money,
                    exp,
                    source: 'mission_reward'
                });
            }
        };

        flightEventTarget.addEventListener('flight:complete', onFlightComplete);
        return () => {
            flightEventTarget.removeEventListener('flight:complete', onFlightComplete);
        };
    }, []);

	    React.useEffect(() => {
	        const onQuestCompleted = (payload: unknown) => {
	            const current = stateRef.current;
	            if (current.screen !== 'exploration') return;
	            if (!payload || typeof payload !== 'object') return;

            const data = payload as Partial<{
                quest: Quest;
                rewards: { money: number; exp: number };
            }>;

            const quest = data.quest;
            const rewards = data.rewards;
            if (!quest || !rewards) return;
            if (typeof rewards.money !== 'number' || typeof rewards.exp !== 'number') return;

            const questId = quest.questId || quest.id;
            const title = quest.title || 'Quest';
            const description = quest.description || '';
            const location = typeof quest.destination === 'string' && quest.destination ? quest.destination : 'world_airport';

            const leader = quest.participants?.find((p) => p.role === 'leader')?.characterId;
	            const actorId = leader || current.selectedCharacterId;

	            audioManager.playSound('mission_complete');

	            worldStateManager.initialize();
	            const session = worldStateManager.getActiveMissionSession();
	            const missionQuestId = session?.missionQuestId ?? null;
	            const questMatchesMission =
	                Boolean(current.activeMission) &&
	                (missionQuestId ? missionQuestId === questId : quest.templateId && quest.templateId === current.activeMission?.questTemplateId);

	            if (questMatchesMission && current.activeMission) {
	                worldStateManager.updateActiveMissionSession({ phaseId: 'return', phaseStartedAt: Date.now() });
	                worldStateManager.appendMissionLog({
	                    phaseId: 'return',
	                    kind: 'system',
	                    title: 'Return',
	                    text: 'Objective complete. Returning to base.'
	                });
	                eventBus.emit(EVENTS.UI_TRAVEL_REQUESTED, {
	                    actorId: null,
	                    locationId: 'base_airport',
	                    spawnPoint: 'default',
	                    via: 'mission'
	                });

	                const inbound = current.inboundFlight;
	                const bonus = inbound ? Math.max(0, Math.floor(inbound.score)) : 0;
	                const money = Math.max(0, Math.floor(current.activeMission.rewardMoney + bonus));
	                const exp = Math.max(0, Math.floor(current.activeMission.rewardExp));

	                dispatch({ type: 'MISSION_COMPLETE_FROM_EXPLORATION', mission: current.activeMission, actorId });
	                eventBus.emit(EVENTS.REWARD_GRANTED, { actorId, money, exp, source: 'mission_reward' });
	                return;
	            }

            const money = Math.max(0, Math.floor(rewards.money));
            const exp = Math.max(0, Math.floor(rewards.exp));

            dispatch({
                type: 'QUEST_COMPLETE',
                questId,
                title,
                description,
                location,
                actorId,
                rewards: { money, exp }
            });
            eventBus.emit(EVENTS.REWARD_GRANTED, { actorId, money, exp, source: 'quest_reward' });
        };

        eventBus.on(EVENTS.QUEST_COMPLETED, onQuestCompleted);
        return () => {
            eventBus.off(EVENTS.QUEST_COMPLETED, onQuestCompleted);
        };
    }, []);

    React.useEffect(() => {
        const onRewardGranted = (payload: unknown) => {
            if (!payload || typeof payload !== 'object') return;
            const data = payload as Partial<{
                actorId: string;
                money: number;
                exp: number;
                itemId: string | null;
                itemQty: number;
                message: string;
                source: string;
            }>;

            const actorId = typeof data.actorId === 'string' && data.actorId ? data.actorId : stateRef.current.selectedCharacterId;
            const money = typeof data.money === 'number' && Number.isFinite(data.money) ? Math.max(0, Math.floor(data.money)) : 0;
            const exp = typeof data.exp === 'number' && Number.isFinite(data.exp) ? Math.max(0, Math.floor(data.exp)) : 0;
            const itemId = typeof data.itemId === 'string' && data.itemId ? data.itemId : null;
            const itemQty = typeof data.itemQty === 'number' && Number.isFinite(data.itemQty) ? Math.max(0, Math.floor(data.itemQty)) : 0;
            const message = typeof data.message === 'string' && data.message ? data.message : null;
            const source = typeof data.source === 'string' && data.source ? data.source : 'reward';

            if (money > 0 || exp > 0) {
                dispatch({ type: 'GRANT_REWARD', actorId, money, exp, reason: source });
            }

            if (money > 0) audioManager.playSound('coin');
            if (exp > 0) audioManager.playSound('success');

            if (message) {
                toast.show(message, 'success', 6500);
            } else if (money > 0 || exp > 0 || itemId) {
                const parts: string[] = [];
                if (money > 0) parts.push(`💰 +${money}`);
                if (exp > 0) parts.push(`⭐ +${exp}`);
                if (itemId) parts.push(itemQty > 1 ? `📦 ${itemId} x${itemQty}` : `📦 ${itemId}`);
                toast.show(`Reward granted: ${parts.join(' · ')}`, 'success', 6500);
            }
        };

        eventBus.on(EVENTS.REWARD_GRANTED, onRewardGranted);
        return () => {
            eventBus.off(EVENTS.REWARD_GRANTED, onRewardGranted);
        };
    }, [dispatch, toast]);

	    React.useEffect(() => {
	        if (state.screen !== 'exploration') return;
	        const templateId = state.pendingExplorationQuestTemplateId;
	        if (!templateId) return;

	        dispatch({ type: 'CLEAR_PENDING_EXPLORATION_QUEST' });
	        startQuestFromTemplate(templateId, { actorId: state.selectedCharacterId, type: state.activeMission ? 'sub' : 'main' })
	            .then((questId) => {
	                if (!stateRef.current.activeMission) return;
	                worldStateManager.updateActiveMissionSession({ missionQuestId: questId });
	            })
	            .catch((err: unknown) => {
	                console.warn('[exploration] auto-start quest failed', err);
	            });
	    }, [dispatch, state.pendingExplorationQuestTemplateId, state.screen, state.selectedCharacterId]);

    React.useEffect(() => {
        persistSnapshot(state);
    }, [state.achievements, state.characters, state.missions, state.resources, state.selectedCharacterId, state.statistics]);

    React.useEffect(() => {
        let lastTickMs = Date.now();
        const timer = window.setInterval(() => {
            const nowMs = Date.now();
            const deltaSeconds = (nowMs - lastTickMs) / 1000;
            lastTickMs = nowMs;

            const current = stateRef.current;
            if (!current.activeMission) {
                missionTimeoutHandledRef.current = null;
            } else if (current.activeMission.missionScriptId) {
                const script = getMissionScript(current.activeMission.missionScriptId);
                const session = worldStateManager.getActiveMissionSession();
                const phaseId = resolveMissionPhaseId({
                    screen: current.screen,
                    flightPhaseOverride: current.flightPhaseOverride,
                    fallbackPhaseId: session?.phaseId ?? 'dispatch'
                });
                const limitMs = script?.phases.find((p) => p.phaseId === phaseId)?.timeLimitMs;
                const phaseStartedAt = session?.phaseStartedAt ?? session?.startedAt;

                if (
                    typeof limitMs === 'number' &&
                    limitMs > 0 &&
                    typeof phaseStartedAt === 'number' &&
                    Number.isFinite(phaseStartedAt) &&
                    nowMs - phaseStartedAt > limitMs &&
                    missionTimeoutHandledRef.current !== current.activeMission.id
                ) {
                    missionTimeoutHandledRef.current = current.activeMission.id;
                    toast.show('Mission failed: time limit exceeded.', 'error', 7000);
                    dispatch({ type: 'ABORT_ACTIVE_MISSION', screen: 'hangar', reason: 'timeout' });
                }
            }

            dispatch({ type: 'TICK_PLAYTIME', nowIso: new Date().toISOString(), deltaSeconds });
        }, 1000);

        return () => {
            window.clearInterval(timer);
        };
    }, [dispatch, toast]);

    const prevAchievementIdsRef = React.useRef<string[]>(state.achievements.unlocked);
    React.useEffect(() => {
        const prev = prevAchievementIdsRef.current;
        const next = state.achievements.unlocked;
        prevAchievementIdsRef.current = next;
        if (next.length <= prev.length) return;

        const newIds = next.filter((id) => !prev.includes(id));
        if (newIds.length === 0) return;

        const defs = getAllAchievementDefinitions(state.achievements);
        for (const id of newIds) {
            const def = defs[id];
            const name = def?.name ?? id;
            toast.show(`🏆 Achievement unlocked: ${name}`, 'success', 7000);
        }
        audioManager.playSound('achievement');
    }, [state.achievements.customDefinitions, state.achievements.unlocked, toast]);

    React.useEffect(() => {
        if (!state.activeSessionId) return;
        if (state.activeMission) return;

        void endMissionSession(state.activeSessionId)
            .catch((err: unknown) => {
                console.warn('[mission-session] end failed', err);
            })
            .finally(() => {
                dispatch({ type: 'CLEAR_ACTIVE_SESSION' });
            });
    }, [dispatch, state.activeMission, state.activeSessionId]);

    const handleRefuelAll = React.useCallback(() => {
        const missing = GAME_CONFIG.MAX_FUEL - state.resources.fuel;
        if (missing <= 0) {
            toast.show('Fuel is already full.', 'info');
            return;
        }

        const cost = Math.ceil(missing * GAME_CONFIG.REFUEL_COST_PER_UNIT);
        if (state.resources.money < cost) {
            toast.show('Cannot refuel (Insufficient Funds).', 'error');
            return;
        }

        dispatch({
            type: 'SET_RESOURCES',
            resources: {
                money: state.resources.money - cost,
                fuel: GAME_CONFIG.MAX_FUEL
            },
            spending: { amount: cost, reason: 'refuel_all' }
        });
        toast.show(`Refueled to ${GAME_CONFIG.MAX_FUEL} (-${cost}💰)`, 'success');
    }, [dispatch, state.resources.fuel, state.resources.money, toast]);

    const handleRefreshBoard = React.useCallback(() => {
        if (state.resources.money < 50) {
            toast.show('Not enough money!', 'error');
            return;
        }

            dispatch({
                type: 'SET_RESOURCES',
                resources: { ...state.resources, money: state.resources.money - 50 },
                spending: { amount: 50, reason: 'refresh_mission_board' }
            });
            dispatch({ type: 'SET_MISSIONS', missions: generateScriptMissions(15, 1) });
            toast.show('Missions Refreshed!', 'success');
        }, [dispatch, state.resources, toast]);

    const handleAiGenerateMissions = React.useCallback(async (): Promise<void> => {
        const level = 1;
        const targetCount = 15;
        const concurrency = 3;

        toast.show('Generating missions via backend...', 'info', 6000);

        try {
            const results: Array<Mission | undefined> = new Array(targetCount).fill(undefined);
            let cursor = 0;

            const workers = Array.from({ length: concurrency }, async () => {
                while (true) {
                    const index = cursor;
                    cursor += 1;
                    if (index >= targetCount) return;
                    results[index] = await generateMission({ level });
                }
            });

            await Promise.all(workers);

            const generated = results.filter((m): m is Mission => Boolean(m));
            if (generated.length === 0) {
                throw new Error('No missions were generated.');
            }

            dispatch({ type: 'SET_MISSIONS', missions: generated });
            toast.show(`Generated ${generated.length} missions via backend.`, 'success');
        } catch (err: unknown) {
            console.error(err);
            dispatch({ type: 'SET_MISSIONS', missions: generateScriptMissions(15, 1) });
            toast.show('Backend mission generation failed; using local mission scripts.', 'warning');
        }
    }, [dispatch, toast]);

    const handleDispatch = React.useCallback(
        (missionId: string, charId: string): boolean => {
            if (state.activeMission) {
                toast.show('A mission is already in progress. Finish or cancel it before dispatching a new one.', 'warning');
                return false;
            }

            const mission = state.missions.find((m) => m.id === missionId);
            if (!mission) {
                toast.show('Mission not found.', 'error');
                return false;
            }

            const actualFuelCost = Math.ceil(mission.fuelCost * GAME_CONFIG.FUEL_COST_MULTIPLIER);
            if (state.resources.fuel < actualFuelCost) {
                toast.show('Not enough fuel! Refuel at Hangar.', 'warning');
                return false;
            }

            dispatch({ type: 'START_FLIGHT', mission, charId, fuelCost: actualFuelCost });

            void startMissionSession({
                missionType: mission.type,
                location: mission.location,
                problemDescription: mission.description,
                characterId: charId,
                npcName: null
            })
                .then((res) => {
                    const current = stateRef.current;
                    if (current.activeMission?.id === mission.id) {
                        dispatch({ type: 'SET_ACTIVE_SESSION', missionId: mission.id, sessionId: res.session_id });
                        return;
                    }

                    void endMissionSession(res.session_id).catch((err: unknown) => {
                        console.warn('[mission-session] cleanup orphan failed', err);
                    });
                })
                .catch((err: unknown) => {
                    console.warn('[mission-session] start failed', err);
                });

            toast.show(`Mission started: ${mission.type} (-${actualFuelCost}⛽)`, 'success');
            return true;
        },
        [dispatch, state.missions, state.resources.fuel, toast]
    );

    const handleLoadSnapshot = React.useCallback(
        (rawJson: string) => {
            let parsed: unknown;
            try {
                parsed = JSON.parse(rawJson) as unknown;
            } catch {
                toast.show('Invalid save file (JSON parse failed).', 'error');
                return;
            }

            const loaded = coerceLoadedSnapshot(parsed);
            if (!loaded) {
                toast.show('Invalid save file.', 'error');
                return;
            }

            dispatch({ type: 'LOAD_SNAPSHOT', snapshot: loaded, nowIso: new Date().toISOString(), nowMs: Date.now() });
            toast.show('Save loaded.', 'success');
        },
        [dispatch, toast]
    );

    const handleResetProgress = React.useCallback(() => {
        try {
            localStorage.removeItem(STORAGE_KEY);
        } catch {
            // ignore
        }
        dispatch({ type: 'RESET_PROGRESS', nowIso: new Date().toISOString(), nowMs: Date.now() });
        toast.show('Progress reset.', 'success');
    }, [dispatch, toast]);

    return (
        <div id="game-container">
            <div id="phaser-container" ref={phaserParentRef} className={isPhaserActive ? '' : 'hidden'} />
            <div id="ui-layer">
                {state.screen === 'mainMenu' ? (
                    <MainMenuScreen
                        onStart={() => dispatch({ type: 'NAVIGATE', screen: 'hangar' })}
                        onExplore={() => dispatch({ type: 'NAVIGATE', screen: 'exploration' })}
                    />
                ) : null}

	                {state.screen === 'hangar' ? (
	                    <HangarScreen
	                        resources={state.resources}
	                        characters={state.characters}
	                        selectedCharacterId={state.selectedCharacterId}
	                        onSelectCharacter={(characterId) => dispatch({ type: 'SELECT_CHARACTER', characterId })}
	                        onRefuelAll={handleRefuelAll}
	                        onGoMissionBoard={() => dispatch({ type: 'NAVIGATE', screen: 'missionBoard' })}
	                        onGoStatistics={() => dispatch({ type: 'NAVIGATE', screen: 'statistics' })}
	                        onGoAchievements={() => dispatch({ type: 'NAVIGATE', screen: 'achievements' })}
	                        onGoSaveLoad={() => dispatch({ type: 'NAVIGATE', screen: 'saveLoad' })}
	                        onBackToMainMenu={() => dispatch({ type: 'NAVIGATE', screen: 'mainMenu' })}
	                    />
	                ) : null}

                {state.screen === 'exploration' ? (
                    <ExplorationScreen
                        actorId={state.selectedCharacterId}
                        activeMission={state.activeMission}
                        debriefResult={state.explorationDebrief}
                        onCloseDebrief={() => dispatch({ type: 'CLOSE_EXPLORATION_DEBRIEF' })}
                        onAbortMission={() => dispatch({ type: 'ABORT_ACTIVE_MISSION', screen: 'hangar', reason: 'abort' })}
                        onBackToHangar={() => {
                            if (stateRef.current.explorationDebrief) {
                                dispatch({ type: 'CLOSE_EXPLORATION_DEBRIEF' });
                            }
                            dispatch({ type: 'NAVIGATE', screen: 'hangar' });
                        }}
                    />
                ) : null}

                {state.screen === 'statistics' ? (
                    <StatisticsScreen
                        statistics={state.statistics}
                        onBack={() => dispatch({ type: 'NAVIGATE', screen: 'hangar' })}
	                        onGoAchievements={() => dispatch({ type: 'NAVIGATE', screen: 'achievements' })}
	                        onGoSaveLoad={() => dispatch({ type: 'NAVIGATE', screen: 'saveLoad' })}
	                    />
	                ) : null}

	                {state.screen === 'achievements' ? (
	                    <AchievementsScreen
	                        achievements={state.achievements}
	                        statistics={state.statistics}
	                        onBack={() => dispatch({ type: 'NAVIGATE', screen: 'hangar' })}
	                        onGoStatistics={() => dispatch({ type: 'NAVIGATE', screen: 'statistics' })}
	                        onGoSaveLoad={() => dispatch({ type: 'NAVIGATE', screen: 'saveLoad' })}
	                    />
	                ) : null}

	                {state.screen === 'saveLoad' ? (
	                    <SaveLoadScreen
	                        currentSnapshot={buildSnapshot(state)}
	                        onBack={() => dispatch({ type: 'NAVIGATE', screen: 'hangar' })}
	                        onLoadSnapshot={handleLoadSnapshot}
	                        onResetProgress={handleResetProgress}
	                    />
	                ) : null}

                {state.screen === 'missionBoard' ? (
                    <MissionBoardScreen
                        missions={state.missions}
                        characters={state.characters}
                        selectedCharacterId={state.selectedCharacterId}
                        resources={state.resources}
                        onBackToHangar={() => dispatch({ type: 'NAVIGATE', screen: 'hangar' })}
                        onRefreshBoard={handleRefreshBoard}
                        onAiGenerateMissions={handleAiGenerateMissions}
                        onDispatch={handleDispatch}
                    />
                ) : null}

                {state.screen === 'briefing' && state.activeMission && state.flightParams ? (
                    <MissionBriefingScreen
                        mission={state.activeMission}
                        character={state.characters.find((c) => c.id === state.flightParams?.charId) ?? state.characters[0]}
                        onStartFlight={() => dispatch({ type: 'NAVIGATE', screen: 'flight' })}
                        onCancel={() => dispatch({ type: 'CANCEL_MISSION', screen: 'missionBoard' })}
                    />
                ) : null}

                {state.screen === 'flight' ? (
                    <>
                        {showFlightOverlay ? <GameHUD hudState={hudState} narration={flightNarration} /> : null}
                        {showFlightOverlay ? (
                            <DebugPanel hudState={hudState} onBackToHangar={() => dispatch({ type: 'ABORT_FLIGHT', screen: 'hangar' })} />
                        ) : null}
                    </>
                ) : null}

                {state.screen === 'story' && state.lastResult ? (
                    <MissionStoryScreen result={state.lastResult} onContinue={() => dispatch({ type: 'NAVIGATE', screen: 'results' })} />
                ) : null}

                {state.screen === 'results' && state.lastResult ? (
                    <ResultsScreen
                        result={state.lastResult}
                        onBackToHangar={() => dispatch({ type: 'EXIT_RESULTS', screen: 'hangar' })}
                        onBackToMissionBoard={() => dispatch({ type: 'EXIT_RESULTS', screen: 'missionBoard' })}
                    />
                ) : null}
            </div>
            <div id="overlay-layer" />
        </div>
    );
}

function gameReducer(state: GameState, action: GameAction): GameState {
    switch (action.type) {
        case 'NAVIGATE': {
            if (state.screen === action.screen) return state;
            const flightPhaseOverride = action.screen === 'flight' ? null : null;
            return { ...state, screen: action.screen, flightPhaseOverride };
        }

        case 'SELECT_CHARACTER':
            return { ...state, selectedCharacterId: action.characterId };

        case 'SET_RESOURCES':
            return {
                ...state,
                resources: action.resources,
                statistics: recordMoneyBalance(
                    action.spending ? recordMoneySpent(state.statistics, action.spending.amount, action.spending.reason) : state.statistics,
                    action.resources.money
                )
            };

        case 'SET_MISSIONS':
            return { ...state, missions: action.missions };

        case 'START_FLIGHT': {
            const nextResources: Resources = { ...state.resources, fuel: state.resources.fuel - action.fuelCost };
            const nextMissions = state.missions.filter((m) => m.id !== action.mission.id);
            const nextCharacters = state.characters.map((c): CharacterState => (c.id === action.charId ? { ...c, status: 'MISSION' } : c));

            return {
                ...state,
                screen: 'briefing',
                resources: nextResources,
                missions: nextMissions,
                selectedCharacterId: action.charId,
                characters: nextCharacters,
                activeMission: action.mission,
                activeSessionId: null,
                flightPhaseOverride: null,
                flightResumePhase: null,
                lastResult: null,
                explorationDebrief: null,
                inboundFlight: null,
                pendingExplorationQuestTemplateId: null,
                explorationStartLocationId: null,
                explorationSpawnPoint: null,
                pendingMissionOutcome: null,
                flightParams: { missionId: action.mission.id, missionType: action.mission.type, charId: action.charId }
            };
        }

        case 'SET_ACTIVE_SESSION':
            if (state.activeMission?.id !== action.missionId) return state;
            return { ...state, activeSessionId: action.sessionId };

        case 'CLEAR_ACTIVE_SESSION':
            if (!state.activeSessionId) return state;
            return { ...state, activeSessionId: null };

        case 'SET_FLIGHT_PHASE_OVERRIDE':
            if (state.screen !== 'flight') return state;
            if (state.flightPhaseOverride === action.phaseId) return state;
            return { ...state, flightPhaseOverride: action.phaseId };

        case 'CANCEL_MISSION': {
            const mission = state.activeMission;
            const flightParams = state.flightParams;
            if (!mission || !flightParams) {
                return {
                    ...state,
                    screen: action.screen,
                    activeMission: null,
                    flightParams: null,
                    inboundFlight: null,
                    pendingExplorationQuestTemplateId: null,
                    explorationStartLocationId: null,
                    explorationSpawnPoint: null,
                    flightPhaseOverride: null,
                    flightResumePhase: null,
                    pendingMissionOutcome: mission ? 'canceled' : state.pendingMissionOutcome
                };
            }

            const refundFuel = Math.ceil(mission.fuelCost * GAME_CONFIG.FUEL_COST_MULTIPLIER);
            const nextResources: Resources = { ...state.resources, fuel: state.resources.fuel + refundFuel };
            const nextMissions = [mission, ...state.missions];
            const nextCharacters = state.characters.map((c): CharacterState => (c.id === flightParams.charId ? { ...c, status: 'IDLE' } : c));

            return {
                ...state,
                screen: action.screen,
                resources: nextResources,
                missions: nextMissions,
                characters: nextCharacters,
                activeMission: null,
                flightParams: null,
                lastResult: null,
                inboundFlight: null,
                pendingExplorationQuestTemplateId: null,
                explorationStartLocationId: null,
                explorationSpawnPoint: null,
                flightPhaseOverride: null,
                flightResumePhase: null,
                pendingMissionOutcome: 'canceled'
            };
        }

        case 'ABORT_FLIGHT': {
            const charId = state.flightParams?.charId;
            const nextCharacters = charId
                ? state.characters.map((c): CharacterState => (c.id === charId ? { ...c, status: 'IDLE' } : c))
                : state.characters;

            return {
                ...state,
                screen: action.screen,
                characters: nextCharacters,
                activeMission: null,
                flightParams: null,
                inboundFlight: null,
                lastResult: null,
                explorationDebrief: null,
                pendingExplorationQuestTemplateId: null,
                explorationStartLocationId: null,
                explorationSpawnPoint: null,
                flightPhaseOverride: null,
                flightResumePhase: null,
                pendingMissionOutcome: state.activeMission ? 'aborted' : state.pendingMissionOutcome
            };
        }

        case 'ABORT_ACTIVE_MISSION': {
            const mission = state.activeMission;
            const actorId = state.flightParams?.charId ?? state.selectedCharacterId;
            const nextCharacters = state.characters.map((c): CharacterState => (c.id === actorId ? { ...c, status: 'IDLE' } : c));
            const nextStatistics = mission ? recordMissionFailed(state.statistics) : state.statistics;
            const outcome: MissionOutcome | null =
                mission ? (action.reason === 'timeout' ? 'failed' : action.reason === 'abort' ? 'aborted' : 'aborted') : null;

            return {
                ...state,
                screen: action.screen,
                characters: nextCharacters,
                statistics: nextStatistics,
                activeMission: null,
                flightParams: null,
                inboundFlight: null,
                lastResult: null,
                explorationDebrief: null,
                pendingExplorationQuestTemplateId: null,
                explorationStartLocationId: null,
                explorationSpawnPoint: null,
                flightPhaseOverride: null,
                flightResumePhase: null,
                pendingMissionOutcome: outcome
            };
        }

        case 'FLIGHT_COMPLETE': {
            const mission = state.activeMission;
            if (!mission) {
                return {
                    ...state,
                    screen: 'hangar',
                    activeMission: null,
                    flightParams: null,
                    flightPhaseOverride: null,
                    flightResumePhase: null
                };
            }

            const char = state.characters.find((c) => c.id === action.result.charId);
            if (!char) {
                return {
                    ...state,
                    screen: 'hangar',
                    activeMission: null,
                    flightParams: null,
                    flightPhaseOverride: null,
                    flightResumePhase: null
                };
            }

            if (action.result.success) {
                return {
                    ...state,
                    screen: 'exploration',
                    flightParams: null,
                    flightPhaseOverride: null,
                    flightResumePhase: null,
                    lastResult: null,
                    explorationDebrief: null,
                    inboundFlight: action.result,
                    pendingExplorationQuestTemplateId: action.bridge?.questTemplateId ?? 'qt_repair_relay_field',
                    explorationStartLocationId: action.bridge?.startLocationId ?? 'warehouse_district',
                    explorationSpawnPoint: action.bridge?.spawnPoint ?? 'entry',
                    pendingMissionOutcome: null
                };
            }

            const bonus = Math.max(0, Math.floor(action.result.score));
            const expGain = Math.max(0, Math.floor(mission.rewardExp));
            const totalMoney = Math.max(0, Math.floor(mission.rewardMoney + bonus));

            const nextStatistics = recordMissionFailed(state.statistics);

            const baseChar: CharacterState = { ...char, status: 'IDLE' };
            const previewChar = applyExp(baseChar, expGain);
            const nextCharacters = state.characters.map((c) => (c.id === baseChar.id ? baseChar : c));

            const nextResult: MissionResult = {
                mission,
                character: previewChar,
                success: false,
                score: bonus,
                rewards: { money: totalMoney, exp: expGain, bonus }
            };

            return {
                ...state,
                screen: 'results',
                characters: nextCharacters,
                lastResult: nextResult,
                statistics: nextStatistics,
                activeMission: null,
                flightParams: null,
                flightPhaseOverride: null,
                flightResumePhase: null,
                inboundFlight: null,
                pendingExplorationQuestTemplateId: null,
                explorationStartLocationId: null,
                explorationSpawnPoint: null,
                pendingMissionOutcome: 'failed'
            };
        }

        case 'MISSION_COMPLETE_FROM_EXPLORATION': {
            const mission = action.mission;
            const char = state.characters.find((c) => c.id === action.actorId) ?? state.characters[0];
            if (!char) return { ...state, screen: 'hangar' };

            const inbound = state.inboundFlight;
            const bonus = inbound ? Math.max(0, Math.floor(inbound.score)) : 0;
            const expGain = Math.max(0, Math.floor(mission.rewardExp));
            const totalMoney = Math.max(0, Math.floor(mission.rewardMoney + bonus));
            const nextStatistics = recordMissionCompleted(state.statistics, {
                missionType: mission.type.toLowerCase(),
                characterId: char.id,
                location: mission.location,
                rewardsMoney: totalMoney,
                flightStats: inbound?.flightStats
            });

            const rewards = { money: totalMoney, exp: expGain, bonus };

            const baseChar: CharacterState = { ...char, status: 'IDLE' };
            const previewChar = applyExp(baseChar, expGain);
            const nextCharacters = state.characters.map((c) => (c.id === baseChar.id ? baseChar : c));

            const progressKey = `${char.id}_${mission.type.toLowerCase()}`;
            const currentCount = state.achievements.progress[progressKey] ?? 0;
            const nextAchievements: AchievementState = {
                ...state.achievements,
                progress: { ...state.achievements.progress, [progressKey]: currentCount + 1 }
            };

            const nextResult: MissionResult = {
                mission,
                character: previewChar,
                success: true,
                score: bonus,
                rewards
            };

            if (state.screen === 'exploration') {
                return {
                    ...state,
                    explorationDebrief: nextResult,
                    characters: nextCharacters,
                    statistics: nextStatistics,
                    achievements: nextAchievements,
                    flightParams: null,
                    pendingExplorationQuestTemplateId: null
                };
            }

            return {
                ...state,
                screen: 'results',
                characters: nextCharacters,
                lastResult: nextResult,
                statistics: nextStatistics,
                achievements: nextAchievements,
                activeMission: null,
                flightParams: null,
                inboundFlight: null,
                pendingExplorationQuestTemplateId: null
            };
        }

        case 'QUEST_COMPLETE': {
            const char = state.characters.find((c) => c.id === action.actorId) ?? state.characters[0];
            if (!char) return { ...state, screen: 'hangar' };

            const mission: Mission = {
                id: action.questId,
                title: action.title,
                type: 'Exploration',
                description: action.description,
                location: action.location,
                fuelCost: 0,
                rewardMoney: action.rewards.money,
                rewardExp: action.rewards.exp,
                campaignId: null,
                campaignTheme: null
            };

            const nextStatistics = recordMissionCompleted(state.statistics, {
                missionType: mission.type.toLowerCase(),
                characterId: char.id,
                location: mission.location,
                rewardsMoney: action.rewards.money
            });
            const baseChar: CharacterState = { ...char, status: 'IDLE' };
            const previewChar = applyExp(baseChar, action.rewards.exp);
            const nextCharacters = state.characters.map((c) => (c.id === baseChar.id ? baseChar : c));

            const progressKey = `${char.id}_${mission.type.toLowerCase()}`;
            const currentCount = state.achievements.progress[progressKey] ?? 0;
            const nextAchievements: AchievementState = {
                ...state.achievements,
                progress: { ...state.achievements.progress, [progressKey]: currentCount + 1 }
            };

            const nextResult: MissionResult = {
                mission,
                character: previewChar,
                success: true,
                score: 0,
                rewards: { money: action.rewards.money, exp: action.rewards.exp, bonus: 0 }
            };

            if (state.screen === 'exploration') {
                return {
                    ...state,
                    explorationDebrief: nextResult,
                    characters: nextCharacters,
                    statistics: nextStatistics,
                    achievements: nextAchievements
                };
            }

            return {
                ...state,
                screen: 'results',
                characters: nextCharacters,
                lastResult: nextResult,
                statistics: nextStatistics,
                achievements: nextAchievements,
                activeMission: null,
                flightParams: null
            };
        }

        case 'GRANT_REWARD': {
            const moneyGain = Math.max(0, Math.floor(action.money));
            const expGain = Math.max(0, Math.floor(action.exp));
            if (moneyGain <= 0 && expGain <= 0) return state;

            let nextResources = state.resources;
            let nextStatistics = state.statistics;
            if (moneyGain > 0) {
                nextResources = { ...state.resources, money: state.resources.money + moneyGain };
                nextStatistics = recordMoneyBalance(nextStatistics, nextResources.money);
            }

            let nextCharacters = state.characters;
            if (expGain > 0) {
                const char = state.characters.find((c) => c.id === action.actorId);
                if (char) {
                    const baseChar: CharacterState = { ...char };
                    const nextChar = applyExp(baseChar, expGain);
                    const levelUps = Math.max(0, nextChar.level - baseChar.level);
                    for (let i = 0; i < levelUps; i += 1) {
                        nextStatistics = recordLevelUp(nextStatistics, nextChar.level);
                    }
                    nextCharacters = state.characters.map((c) => (c.id === nextChar.id ? nextChar : c));
                }
            }

            let nextAchievements: AchievementState = state.achievements;

            for (let guard = 0; guard < 6; guard += 1) {
                const { next, unlocked } = checkForNewUnlocks(nextAchievements, nextStatistics);
                nextAchievements = next;
                if (unlocked.length === 0) break;

                let bonusMoney = 0;
                let bonusExp = 0;
                for (const item of unlocked) {
                    bonusMoney += Math.max(0, item.definition.reward?.money ?? 0);
                    bonusExp += Math.max(0, item.definition.reward?.experience ?? 0);
                }

                if (bonusMoney > 0) {
                    nextResources = { ...nextResources, money: nextResources.money + bonusMoney };
                    nextStatistics = recordMoneyBalance(nextStatistics, nextResources.money);
                }

                if (bonusExp > 0) {
                    const before = nextCharacters.find((c) => c.id === action.actorId) ?? null;
                    if (before) {
                        const nextChar = applyExp({ ...before }, bonusExp);
                        const levelUps = Math.max(0, nextChar.level - before.level);
                        for (let i = 0; i < levelUps; i += 1) {
                            nextStatistics = recordLevelUp(nextStatistics, nextChar.level);
                        }
                        nextCharacters = nextCharacters.map((c) => (c.id === nextChar.id ? nextChar : c));
                    }
                }
            }

            nextStatistics = {
                ...nextStatistics,
                achievementsUnlocked: nextAchievements.unlocked.length,
                achievementPoints: nextAchievements.totalPoints
            };

            return { ...state, resources: nextResources, characters: nextCharacters, statistics: nextStatistics, achievements: nextAchievements };
        }

        case 'CLOSE_EXPLORATION_DEBRIEF': {
            const isMissionDebrief =
                Boolean(state.activeMission) &&
                Boolean(state.explorationDebrief) &&
                state.explorationDebrief?.mission.id === state.activeMission?.id;

            if (!isMissionDebrief) {
                return { ...state, explorationDebrief: null };
            }

            const actorId = state.flightParams?.charId ?? state.selectedCharacterId;
            const nextCharacters = state.characters.map((c): CharacterState => (c.id === actorId ? { ...c, status: 'IDLE' } : c));

            return {
                ...state,
                explorationDebrief: null,
                characters: nextCharacters,
                activeMission: null,
                flightParams: null,
                inboundFlight: null,
                pendingExplorationQuestTemplateId: null,
                explorationStartLocationId: null,
                explorationSpawnPoint: null,
                flightPhaseOverride: null,
                flightResumePhase: null,
                pendingMissionOutcome: 'completed'
            };
        }

	        case 'CLEAR_PENDING_EXPLORATION_QUEST':
	            return { ...state, pendingExplorationQuestTemplateId: null };

	        case 'CLEAR_PENDING_MISSION_OUTCOME':
	            return { ...state, pendingMissionOutcome: null };

	        case 'TICK_PLAYTIME': {
            const nextStatistics = tickPlayTime(state.statistics, action.deltaSeconds, action.nowIso);
            if (nextStatistics === state.statistics) return state;
            return { ...state, statistics: nextStatistics };
        }

        case 'LOAD_SNAPSHOT': {
            const base = createDefaultState();
            const snapshot = action.snapshot;

            const selected = snapshot.selectedCharacterId;
            const selectedCharacterId = snapshot.characters.some((c) => c.id === selected) ? selected : base.selectedCharacterId;
            const missions = snapshot.missions.length > 0 ? snapshot.missions : base.missions;
            const statistics = recordMoneyBalance(startSession(snapshot.statistics, action.nowIso, action.nowMs), snapshot.resources.money);

            return {
                ...base,
                screen: 'hangar',
                resources: snapshot.resources,
                characters: snapshot.characters,
                selectedCharacterId,
                missions,
                statistics,
                achievements: snapshot.achievements,
                flightParams: null,
                activeMission: null,
                activeSessionId: null,
                lastResult: null,
                explorationDebrief: null
            };
        }

        case 'RESET_PROGRESS': {
            const base = createDefaultState();
            const statistics = recordMoneyBalance(startSession(base.statistics, action.nowIso, action.nowMs), base.resources.money);
            return { ...base, screen: 'mainMenu', statistics };
        }

        case 'EXIT_RESULTS':
            return { ...state, screen: action.screen, lastResult: null };

        default:
            return state;
    }
}

function applyExp(character: CharacterState, expGain: number): CharacterState {
    let level = character.level;
    let exp = character.exp + expGain;

    while (exp >= level * 100) {
        exp -= level * 100;
        level += 1;
    }

    return { ...character, level, exp };
}

function createDefaultState(): GameState {
    const characters = createInitialCharacters();
    const selectedCharacterId = characters[0]?.id ?? 'jett';

    return {
        screen: 'mainMenu',
        resources: {
            money: GAME_CONFIG.INITIAL_MONEY,
            fuel: GAME_CONFIG.INITIAL_FUEL
        },
        characters,
        selectedCharacterId,
        missions: generateScriptMissions(15, 1),
        flightParams: null,
        activeMission: null,
        activeSessionId: null,
        flightPhaseOverride: null,
        flightResumePhase: null,
        lastResult: null,
        explorationDebrief: null,
        inboundFlight: null,
        pendingExplorationQuestTemplateId: null,
        explorationStartLocationId: null,
        explorationSpawnPoint: null,
        pendingMissionOutcome: null,
        statistics: createDefaultStatistics(),
        achievements: createDefaultAchievementState()
    };
}

function initGameState(): GameState {
    const base = createDefaultState();
    const snapshot = loadSnapshot();
    const nowIso = new Date().toISOString();
    const nowMs = Date.now();

    worldStateManager.initialize();
    const activeSession = worldStateManager.getActiveMissionSession();
    if (activeSession) {
        const mission = coerceMission(activeSession.mission);
        const actorId = activeSession.actorId;
        const phaseId = activeSession.phaseId;

        if (mission && actorId) {
            const resources = snapshot?.resources ?? base.resources;
            const missions = snapshot && snapshot.missions.length > 0 ? snapshot.missions : base.missions;
            const achievements = snapshot?.achievements ?? base.achievements;
            const statistics = startSession(snapshot?.statistics ?? base.statistics, nowIso, nowMs);
            const restoreCharacters = snapshot?.characters ?? base.characters;

            const snapshotSelected = snapshot?.selectedCharacterId ?? base.selectedCharacterId;
            const selectedCharacterId = restoreCharacters.some((c) => c.id === actorId)
                ? actorId
                : restoreCharacters.some((c) => c.id === snapshotSelected)
                  ? snapshotSelected
                  : base.selectedCharacterId;

            const shouldShowMissionStatus = phaseId !== 'return' && phaseId !== 'debrief';
            const characters = restoreCharacters.map((c): CharacterState =>
                c.id === selectedCharacterId ? { ...c, status: shouldShowMissionStatus ? 'MISSION' : 'IDLE' } : c
            );

            const lastPlayerState = worldStateManager.getLastPlayerState();
            const explorationStartLocationId = lastPlayerState?.locationId ? null : mission.explorationStartLocationId ?? null;
            const explorationSpawnPoint = lastPlayerState?.locationId ? null : mission.explorationSpawnPoint ?? null;

            const screen: ScreenId =
                phaseId === 'dispatch'
                    ? 'briefing'
                    : FLIGHT_PHASE_IDS.has(phaseId)
                      ? 'flight'
                      : 'exploration';

            const pendingExplorationQuestTemplateId =
                screen === 'exploration' ? mission.questTemplateId ?? null : null;

            return {
                ...base,
                screen,
                resources,
                characters,
                selectedCharacterId,
                missions,
                activeMission: mission,
                activeSessionId: activeSession.sessionId,
                inboundFlight: activeSession.inboundFlight,
                pendingExplorationQuestTemplateId,
                explorationStartLocationId,
                explorationSpawnPoint,
                flightParams:
                    screen === 'briefing' || screen === 'flight'
                        ? { missionId: mission.id, missionType: mission.type, charId: selectedCharacterId }
                        : null,
                flightPhaseOverride: screen === 'flight' && FLIGHT_PHASE_IDS.has(phaseId) ? phaseId : null,
                flightResumePhase: screen === 'flight' && FLIGHT_PHASE_IDS.has(phaseId) ? phaseId : null,
                statistics: recordMoneyBalance(statistics, resources.money),
                achievements,
                pendingMissionOutcome: null
            };
        }

        worldStateManager.clearActiveMissionSession();
    }

    if (!snapshot) {
        const started = startSession(base.statistics, nowIso, nowMs);
        return { ...base, statistics: recordMoneyBalance(started, base.resources.money) };
    }

    const selected = snapshot.selectedCharacterId;
    const selectedCharacterId = snapshot.characters.some((c) => c.id === selected) ? selected : base.selectedCharacterId;
    const missions = snapshot.missions.length > 0 ? snapshot.missions : base.missions;
    const statistics = startSession(snapshot.statistics, nowIso, nowMs);

    return {
        ...base,
        resources: snapshot.resources,
        characters: snapshot.characters,
        selectedCharacterId,
        missions,
        statistics: recordMoneyBalance(statistics, snapshot.resources.money),
        achievements: snapshot.achievements,
        explorationDebrief: null
    };
}

function persistSnapshot(state: GameState): void {
    const payload = buildSnapshot(state);

    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch {
        // Ignore write errors (private mode / quota).
    }
}

function buildSnapshot(state: GameState): SaveSnapshot {
    return {
        version: SAVE_VERSION,
        resources: state.resources,
        selectedCharacterId: state.selectedCharacterId,
        missions: state.missions,
        characters: state.characters.map((c) => (c.status === 'MISSION' ? { ...c, status: 'IDLE' } : c)),
        statistics: state.statistics,
        achievements: state.achievements
    };
}

function loadSnapshot(): LoadedSnapshot | null {
    const raw = (() => {
        try {
            return localStorage.getItem(STORAGE_KEY);
        } catch {
            return null;
        }
    })();
    if (!raw) return null;

    let parsed: unknown;
    try {
        parsed = JSON.parse(raw) as unknown;
    } catch {
        return null;
    }
    return coerceLoadedSnapshot(parsed);
}

function coerceLoadedSnapshot(value: unknown): LoadedSnapshot | null {
    if (!isRecord(value)) return null;
    const version = coerceNumber(value.version) ?? 1;
    if (version !== 1 && version !== 2) return null;

    const base = createInitialCharacters();

    const resources = coerceResources(value.resources) ?? {
        money: GAME_CONFIG.INITIAL_MONEY,
        fuel: GAME_CONFIG.INITIAL_FUEL
    };

    const overrides = extractCharacterOverrides(value.characters);
    const characters = base.map((c): CharacterState => {
        const override = overrides.get(c.id);
        if (!override) return c;
        return {
            ...c,
            level: override.level ?? c.level,
            exp: override.exp ?? c.exp,
            energy: override.energy ?? c.energy,
            speed: override.speed ?? c.speed,
            reliability: override.reliability ?? c.reliability,
            status: 'IDLE'
        };
    });

    const missionsRaw = Array.isArray(value.missions) ? value.missions : [];
    const missions = missionsRaw.map(coerceMission).filter((m): m is Mission => Boolean(m));

    const selectedCharacterId =
        typeof value.selectedCharacterId === 'string' && value.selectedCharacterId ? value.selectedCharacterId : base[0]?.id ?? 'jett';

    const statistics = coerceStatistics(value.statistics) ?? createDefaultStatistics();
    const achievements = coerceAchievementState(value.achievements) ?? createDefaultAchievementState();

    return { resources, characters, missions, selectedCharacterId, statistics, achievements };
}

function coerceResources(value: unknown): Resources | null {
    if (!isRecord(value)) return null;
    const money = coerceNumber(value.money);
    const fuel = coerceNumber(value.fuel);
    if (money === null || fuel === null) return null;
    return { money, fuel };
}

function coerceMission(value: unknown): Mission | null {
    if (!isRecord(value)) return null;
    const id = coerceString(value.id);
    const title = coerceString(value.title);
    const type = coerceString(value.type);
    const description = coerceString(value.description);
    const location = coerceString(value.location);
    if (!id || !title || !type || !description || !location) return null;

    const fuelCost = coerceNumber(value.fuelCost) ?? coerceNumber((value as Record<string, unknown>).fuel_cost);
    const rewardMoney = coerceNumber(value.rewardMoney) ?? coerceNumber((value as Record<string, unknown>).reward_money);
    if (fuelCost === null || rewardMoney === null) return null;

    const rewardExp = coerceNumber(value.rewardExp) ?? coerceNumber((value as Record<string, unknown>).reward_exp) ?? Math.floor(rewardMoney * 0.5);

    const campaignId = typeof value.campaignId === 'string' || value.campaignId === null ? value.campaignId : undefined;
    const campaignTheme = typeof value.campaignTheme === 'string' || value.campaignTheme === null ? value.campaignTheme : undefined;

    const missionScriptId = typeof value.missionScriptId === 'string' ? value.missionScriptId : undefined;
    const questTemplateId = typeof value.questTemplateId === 'string' ? value.questTemplateId : undefined;
    const explorationStartLocationId = typeof value.explorationStartLocationId === 'string' ? value.explorationStartLocationId : undefined;
    const explorationSpawnPoint = typeof value.explorationSpawnPoint === 'string' ? value.explorationSpawnPoint : undefined;

    return {
        id,
        title,
        type,
        description,
        location,
        fuelCost,
        rewardMoney,
        rewardExp,
        campaignId,
        campaignTheme,
        missionScriptId,
        questTemplateId,
        explorationStartLocationId,
        explorationSpawnPoint
    };
}

function extractCharacterOverrides(value: unknown): Map<string, Partial<CharacterState>> {
    const overrides = new Map<string, Partial<CharacterState>>();
    if (!Array.isArray(value)) return overrides;

    for (const entry of value) {
        if (!isRecord(entry)) continue;
        const id = coerceString(entry.id);
        if (!id) continue;

        overrides.set(id, {
            level: coerceNumber(entry.level) ?? undefined,
            exp: coerceNumber(entry.exp) ?? undefined,
            energy: coerceNumber(entry.energy) ?? undefined,
            speed: coerceNumber(entry.speed) ?? undefined,
            reliability: coerceNumber(entry.reliability) ?? undefined
        });
    }

    return overrides;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === 'object';
}

function coerceString(value: unknown): string | null {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
}

function coerceNumber(value: unknown): number | null {
    if (typeof value !== 'number') return null;
    if (!Number.isFinite(value)) return null;
    return value;
}

function coerceNullableString(value: unknown): string | null {
    if (typeof value === 'string') return value;
    if (value === null) return null;
    return null;
}

function coerceStringArray(value: unknown): string[] | null {
    if (!Array.isArray(value)) return null;
    const items: string[] = [];
    for (const entry of value) {
        if (typeof entry === 'string') items.push(entry);
    }
    return items;
}

function coerceNumberArray(value: unknown): number[] | null {
    if (!Array.isArray(value)) return null;
    const items: number[] = [];
    for (const entry of value) {
        if (typeof entry === 'number' && Number.isFinite(entry)) items.push(entry);
    }
    return items;
}

function coerceNumberRecord(value: unknown): Record<string, number> | null {
    if (!isRecord(value)) return null;
    const next: Record<string, number> = {};
    for (const [key, entry] of Object.entries(value)) {
        if (typeof entry === 'number' && Number.isFinite(entry)) {
            next[key] = entry;
        }
    }
    return next;
}

function coerceStatistics(value: unknown): StatisticsState | null {
    if (!isRecord(value)) return null;
    const defaults = createDefaultStatistics();

    const sessionStats = isRecord(value.sessionStats)
        ? {
              ...defaults.sessionStats,
              currentSessionStart:
                  typeof value.sessionStats.currentSessionStart === 'number' && Number.isFinite(value.sessionStats.currentSessionStart)
                      ? value.sessionStats.currentSessionStart
                      : value.sessionStats.currentSessionStart === null
                        ? null
                        : defaults.sessionStats.currentSessionStart,
              currentSessionDuration: coerceNumber(value.sessionStats.currentSessionDuration) ?? defaults.sessionStats.currentSessionDuration,
              longestSession: coerceNumber(value.sessionStats.longestSession) ?? defaults.sessionStats.longestSession,
              averageSessionDuration: coerceNumber(value.sessionStats.averageSessionDuration) ?? defaults.sessionStats.averageSessionDuration,
              totalSessionCount: coerceNumber(value.sessionStats.totalSessionCount) ?? defaults.sessionStats.totalSessionCount,
              missionsThisSession: coerceNumber(value.sessionStats.missionsThisSession) ?? defaults.sessionStats.missionsThisSession
          }
        : defaults.sessionStats;

    const performanceMetrics = isRecord(value.performanceMetrics)
        ? {
              ...defaults.performanceMetrics,
              missionTimes: coerceNumberArray(value.performanceMetrics.missionTimes) ?? defaults.performanceMetrics.missionTimes,
              averageMissionTime: coerceNumber(value.performanceMetrics.averageMissionTime) ?? defaults.performanceMetrics.averageMissionTime,
              fastestMissionTime:
                  coerceNumber(value.performanceMetrics.fastestMissionTime) ??
                  (value.performanceMetrics.fastestMissionTime === null ? null : defaults.performanceMetrics.fastestMissionTime),
              slowestMissionTime:
                  coerceNumber(value.performanceMetrics.slowestMissionTime) ??
                  (value.performanceMetrics.slowestMissionTime === null ? null : defaults.performanceMetrics.slowestMissionTime),
              successRate: coerceNumber(value.performanceMetrics.successRate) ?? defaults.performanceMetrics.successRate,
              averageScore: coerceNumber(value.performanceMetrics.averageScore) ?? defaults.performanceMetrics.averageScore
          }
        : defaults.performanceMetrics;

    const economyStats = isRecord(value.economyStats)
        ? {
              ...defaults.economyStats,
              moneyFlow: Array.isArray(value.economyStats.moneyFlow)
                  ? value.economyStats.moneyFlow
                        .map((entry) => {
                            if (!isRecord(entry)) return null;
                            const timestamp = coerceNumber(entry.timestamp);
                            const amount = coerceNumber(entry.amount);
                            const reason = typeof entry.reason === 'string' ? entry.reason : null;
                            if (timestamp === null || amount === null || !reason) return null;
                            return { timestamp, amount, reason };
                        })
                        .filter((entry): entry is { timestamp: number; amount: number; reason: string } => Boolean(entry))
                  : defaults.economyStats.moneyFlow,
              netWorth: coerceNumber(value.economyStats.netWorth) ?? defaults.economyStats.netWorth,
              peakNetWorth: coerceNumber(value.economyStats.peakNetWorth) ?? defaults.economyStats.peakNetWorth,
              totalEarnings: coerceNumber(value.economyStats.totalEarnings) ?? defaults.economyStats.totalEarnings,
              totalSpendings: coerceNumber(value.economyStats.totalSpendings) ?? defaults.economyStats.totalSpendings,
              averageRewardPerMission: coerceNumber(value.economyStats.averageRewardPerMission) ?? defaults.economyStats.averageRewardPerMission
          }
        : defaults.economyStats;

    const explorationStats = isRecord(value.explorationStats)
        ? {
              ...defaults.explorationStats,
              totalFlightDistance: coerceNumber(value.explorationStats.totalFlightDistance) ?? defaults.explorationStats.totalFlightDistance,
              longestFlight: coerceNumber(value.explorationStats.longestFlight) ?? defaults.explorationStats.longestFlight,
              averageFlightDistance: coerceNumber(value.explorationStats.averageFlightDistance) ?? defaults.explorationStats.averageFlightDistance,
              collectiblesFound: isRecord(value.explorationStats.collectiblesFound)
                  ? {
                        ...defaults.explorationStats.collectiblesFound,
                        coins: coerceNumber(value.explorationStats.collectiblesFound.coins) ?? defaults.explorationStats.collectiblesFound.coins,
                        powerups:
                            coerceNumber(value.explorationStats.collectiblesFound.powerups) ??
                            defaults.explorationStats.collectiblesFound.powerups,
                        treasures:
                            coerceNumber(value.explorationStats.collectiblesFound.treasures) ??
                            defaults.explorationStats.collectiblesFound.treasures
                    }
                  : defaults.explorationStats.collectiblesFound,
              countriesVisited: coerceStringArray(value.explorationStats.countriesVisited) ?? defaults.explorationStats.countriesVisited,
              continentsVisited: coerceStringArray(value.explorationStats.continentsVisited) ?? defaults.explorationStats.continentsVisited
          }
        : defaults.explorationStats;

    return {
        ...defaults,
        missionsCompleted: coerceNumber(value.missionsCompleted) ?? defaults.missionsCompleted,
        missionsFailed: coerceNumber(value.missionsFailed) ?? defaults.missionsFailed,
        missionsByType: coerceNumberRecord(value.missionsByType) ?? defaults.missionsByType,
        missionsByCharacter: coerceNumberRecord(value.missionsByCharacter) ?? defaults.missionsByCharacter,
        locationsVisited: coerceStringArray(value.locationsVisited) ?? defaults.locationsVisited,
        uniqueNPCsHelped: coerceStringArray(value.uniqueNPCsHelped) ?? defaults.uniqueNPCsHelped,
        totalMoneyEarned: coerceNumber(value.totalMoneyEarned) ?? defaults.totalMoneyEarned,
        totalMoneySpent: coerceNumber(value.totalMoneySpent) ?? defaults.totalMoneySpent,
        highestMoney: coerceNumber(value.highestMoney) ?? defaults.highestMoney,
        totalFlightTime: coerceNumber(value.totalFlightTime) ?? defaults.totalFlightTime,
        coinsCollected: coerceNumber(value.coinsCollected) ?? defaults.coinsCollected,
        obstaclesHit: coerceNumber(value.obstaclesHit) ?? defaults.obstaclesHit,
        totalDistance: coerceNumber(value.totalDistance) ?? defaults.totalDistance,
        boostsUsed: coerceNumber(value.boostsUsed) ?? defaults.boostsUsed,
        currentStreak: coerceNumber(value.currentStreak) ?? defaults.currentStreak,
        bestStreak: coerceNumber(value.bestStreak) ?? defaults.bestStreak,
        perfectMissions: coerceNumber(value.perfectMissions) ?? defaults.perfectMissions,
        fastCompletions: coerceNumber(value.fastCompletions) ?? defaults.fastCompletions,
        charactersUsed: coerceStringArray(value.charactersUsed) ?? defaults.charactersUsed,
        characterLevelUps: coerceNumber(value.characterLevelUps) ?? defaults.characterLevelUps,
        highestCharacterLevel: coerceNumber(value.highestCharacterLevel) ?? defaults.highestCharacterLevel,
        totalPlayTime: coerceNumber(value.totalPlayTime) ?? defaults.totalPlayTime,
        firstPlayDate: coerceNullableString(value.firstPlayDate) ?? defaults.firstPlayDate,
        lastPlayDate: coerceNullableString(value.lastPlayDate) ?? defaults.lastPlayDate,
        totalSessions: coerceNumber(value.totalSessions) ?? defaults.totalSessions,
        achievementPoints: coerceNumber(value.achievementPoints) ?? defaults.achievementPoints,
        achievementsUnlocked: coerceNumber(value.achievementsUnlocked) ?? defaults.achievementsUnlocked,
        sessionStats,
        performanceMetrics,
        economyStats,
        explorationStats
    };
}

function coerceAchievementState(value: unknown): AchievementState | null {
    if (!isRecord(value)) return null;
    const defaults = createDefaultAchievementState();

    const unlocked = Array.isArray(value.unlocked) ? value.unlocked.filter((id): id is string => typeof id === 'string') : defaults.unlocked;
    const progress = coerceNumberRecord(value.progress) ?? defaults.progress;
    const totalPoints = coerceNumber(value.totalPoints) ?? defaults.totalPoints;
    const customDefinitions = isRecord(value.customDefinitions)
        ? (value.customDefinitions as AchievementState['customDefinitions'])
        : defaults.customDefinitions;

    return { unlocked, progress, totalPoints, customDefinitions };
}
