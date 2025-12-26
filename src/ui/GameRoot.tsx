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
import { generateMission } from '../shared/api/missionsApi';
import { endMissionSession, startMissionSession } from '../shared/api/missionSessionsApi';
import { generateNarration } from '../shared/api/narrationApi';
import { generateLocalMissions } from '../shared/missionGenerator';
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
    lastResult: MissionResult | null;
    explorationDebrief: MissionResult | null;
    inboundFlight: FlightResult | null;
    pendingExplorationQuestTemplateId: string | null;
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
    | { type: 'CANCEL_MISSION'; screen: ScreenId }
    | { type: 'ABORT_FLIGHT'; screen: ScreenId }
    | { type: 'FLIGHT_COMPLETE'; result: FlightResult }
    | { type: 'MISSION_COMPLETE_FROM_EXPLORATION'; mission: Mission; actorId: string }
    | { type: 'QUEST_COMPLETE'; questId: string; title: string; description: string; location: string; actorId: string; rewards: { money: number; exp: number } }
    | { type: 'CLOSE_EXPLORATION_DEBRIEF' }
    | { type: 'CLEAR_PENDING_EXPLORATION_QUEST' }
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

function GameRootInner() {
    const phaserParentRef = React.useRef<HTMLDivElement | null>(null);
    const toast = useToast();

    const [state, dispatch] = React.useReducer(gameReducer, undefined, initGameState);
    const stateRef = React.useRef<GameState>(state);
    const bgmTrackRef = React.useRef<BgmTrack | null>(null);
    const [audioUnlocked, setAudioUnlocked] = React.useState(false);
    const [flightNarration, setFlightNarration] = React.useState<string | null>(null);

    React.useEffect(() => {
        stateRef.current = state;
    }, [state]);

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
                      location: state.activeMission?.location ?? 'world_airport'
                  }
              }
              : state.screen === 'exploration'
              ? {
                    mode: 'exploration',
                    exploration: {
                        charId: state.selectedCharacterId
                    }
                }
              : undefined
    );

    const hudState = useHudState(state.screen === 'flight');
    const showFlightOverlay = hudState.status !== 'ready';

    React.useEffect(() => {
        const onFlightComplete = (event: Event) => {
            const detail = (event as CustomEvent<FlightResult>).detail;
            if (detail?.success) {
                const locationId = 'warehouse_district';
                const spawnPoint = 'entry';
                const location = getLocation(locationId);
                const spawn = location?.spawnPoints?.[spawnPoint] ?? location?.spawnPoints?.default ?? { x: 320, y: 760 };
                worldStateManager.setLastPlayerState({ locationId, spawnPoint, x: spawn.x, y: spawn.y, movementMode: 'walk' });
            }
            dispatch({ type: 'FLIGHT_COMPLETE', result: detail });
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

            if (current.activeMission && current.inboundFlight && quest.type === 'main') {
                dispatch({ type: 'MISSION_COMPLETE_FROM_EXPLORATION', mission: current.activeMission, actorId });
                return;
            }

            dispatch({
                type: 'QUEST_COMPLETE',
                questId,
                title,
                description,
                location,
                actorId,
                rewards: { money: Math.max(0, Math.floor(rewards.money)), exp: Math.max(0, Math.floor(rewards.exp)) }
            });
        };

        eventBus.on(EVENTS.QUEST_COMPLETED, onQuestCompleted);
        return () => {
            eventBus.off(EVENTS.QUEST_COMPLETED, onQuestCompleted);
        };
    }, []);

    React.useEffect(() => {
        if (state.screen !== 'exploration') return;
        const templateId = state.pendingExplorationQuestTemplateId;
        if (!templateId) return;

        dispatch({ type: 'CLEAR_PENDING_EXPLORATION_QUEST' });
        startQuestFromTemplate(templateId, { actorId: state.selectedCharacterId, type: 'main' }).catch((err: unknown) => {
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
            dispatch({ type: 'TICK_PLAYTIME', nowIso: new Date().toISOString(), deltaSeconds });
        }, 1000);

        return () => {
            window.clearInterval(timer);
        };
    }, [dispatch]);

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
        if (state.screen === 'flight' || state.screen === 'briefing') return;

        void endMissionSession(state.activeSessionId)
            .catch((err: unknown) => {
                console.warn('[mission-session] end failed', err);
            })
            .finally(() => {
                dispatch({ type: 'CLEAR_ACTIVE_SESSION' });
            });
    }, [dispatch, state.activeSessionId, state.screen]);

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
        dispatch({ type: 'SET_MISSIONS', missions: generateLocalMissions(15, 1) });
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
            dispatch({ type: 'SET_MISSIONS', missions: generateLocalMissions(15, 1) });
            toast.show('Backend mission generation failed; using local missions.', 'warning');
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
                    if ((current.screen === 'flight' || current.screen === 'briefing') && current.activeMission?.id === mission.id) {
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
                        debriefResult={state.explorationDebrief}
                        onCloseDebrief={() => dispatch({ type: 'CLOSE_EXPLORATION_DEBRIEF' })}
                        onBackToHangar={() => dispatch({ type: 'NAVIGATE', screen: 'hangar' })}
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
        case 'NAVIGATE':
            return { ...state, screen: action.screen };

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
                lastResult: null,
                explorationDebrief: null,
                inboundFlight: null,
                pendingExplorationQuestTemplateId: null,
                flightParams: { missionId: action.mission.id, missionType: action.mission.type, charId: action.charId }
            };
        }

        case 'SET_ACTIVE_SESSION':
            if (state.screen !== 'flight' && state.screen !== 'briefing') return state;
            if (state.activeMission?.id !== action.missionId) return state;
            return { ...state, activeSessionId: action.sessionId };

        case 'CLEAR_ACTIVE_SESSION':
            if (!state.activeSessionId) return state;
            return { ...state, activeSessionId: null };

        case 'CANCEL_MISSION': {
            const mission = state.activeMission;
            const flightParams = state.flightParams;
            if (!mission || !flightParams) {
                return { ...state, screen: action.screen, activeMission: null, flightParams: null, inboundFlight: null, pendingExplorationQuestTemplateId: null };
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
                pendingExplorationQuestTemplateId: null
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
                pendingExplorationQuestTemplateId: null
            };
        }

        case 'FLIGHT_COMPLETE': {
            const mission = state.activeMission;
            if (!mission) {
                return { ...state, screen: 'hangar', activeMission: null, flightParams: null };
            }

            const char = state.characters.find((c) => c.id === action.result.charId);
            if (!char) {
                return { ...state, screen: 'hangar', activeMission: null, flightParams: null };
            }

            if (action.result.success) {
                return {
                    ...state,
                    screen: 'exploration',
                    flightParams: null,
                    lastResult: null,
                    explorationDebrief: null,
                    inboundFlight: action.result,
                    pendingExplorationQuestTemplateId: 'qt_repair_relay_field'
                };
            }

            const bonus = Math.max(0, Math.floor(action.result.score));
            const expGain = Math.max(0, Math.floor(mission.rewardExp));
            const totalMoney = Math.max(0, Math.floor(mission.rewardMoney + bonus));

            let nextResources: Resources = { ...state.resources, money: state.resources.money + totalMoney };

            let nextStatistics = state.statistics;
            const missionTypeKey = mission.type.toLowerCase();

            if (action.result.success) {
                nextStatistics = recordMissionCompleted(nextStatistics, {
                    missionType: missionTypeKey,
                    characterId: action.result.charId,
                    location: mission.location,
                    rewardsMoney: totalMoney,
                    flightStats: action.result.flightStats
                });
            } else {
                nextStatistics = recordMissionFailed(nextStatistics);
            }

            nextStatistics = recordMoneyBalance(nextStatistics, nextResources.money);

            const baseChar: CharacterState = { ...char, status: 'IDLE' };
            let nextChar = applyExp(baseChar, expGain);

            const missionLevelUps = Math.max(0, nextChar.level - baseChar.level);
            for (let i = 0; i < missionLevelUps; i += 1) {
                nextStatistics = recordLevelUp(nextStatistics, nextChar.level);
            }

            let nextCharacters = state.characters.map((c) => (c.id === nextChar.id ? nextChar : c));

            let nextAchievements: AchievementState = state.achievements;
            if (action.result.success) {
                const progressKey = `${action.result.charId}_${missionTypeKey}`;
                const current = nextAchievements.progress[progressKey] ?? 0;
                nextAchievements = { ...nextAchievements, progress: { ...nextAchievements.progress, [progressKey]: current + 1 } };
            }

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
                    const before = nextChar;
                    nextChar = applyExp(nextChar, bonusExp);
                    const levelUps = Math.max(0, nextChar.level - before.level);
                    for (let i = 0; i < levelUps; i += 1) {
                        nextStatistics = recordLevelUp(nextStatistics, nextChar.level);
                    }
                    nextCharacters = nextCharacters.map((c) => (c.id === nextChar.id ? nextChar : c));
                }
            }

            nextStatistics = {
                ...nextStatistics,
                achievementsUnlocked: nextAchievements.unlocked.length,
                achievementPoints: nextAchievements.totalPoints
            };

            const rewards = { money: totalMoney, exp: expGain, bonus };

            const nextResult: MissionResult = {
                mission,
                character: nextChar,
                success: action.result.success,
                score: bonus,
                rewards
            };

            return {
                ...state,
                screen: 'results',
                resources: nextResources,
                characters: nextCharacters,
                lastResult: nextResult,
                statistics: nextStatistics,
                achievements: nextAchievements,
                activeMission: null,
                flightParams: null
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

            let nextResources: Resources = { ...state.resources, money: state.resources.money + totalMoney };

            let nextStatistics = recordMissionCompleted(state.statistics, {
                missionType: mission.type.toLowerCase(),
                characterId: char.id,
                location: mission.location,
                rewardsMoney: totalMoney,
                flightStats: inbound?.flightStats
            });
            nextStatistics = recordMoneyBalance(nextStatistics, nextResources.money);

            const baseChar: CharacterState = { ...char, status: 'IDLE' };
            let nextChar = applyExp(baseChar, expGain);

            const missionLevelUps = Math.max(0, nextChar.level - baseChar.level);
            for (let i = 0; i < missionLevelUps; i += 1) {
                nextStatistics = recordLevelUp(nextStatistics, nextChar.level);
            }

            let nextCharacters = state.characters.map((c) => (c.id === nextChar.id ? nextChar : c));

            let nextAchievements: AchievementState = state.achievements;
            const progressKey = `${nextChar.id}_${mission.type.toLowerCase()}`;
            const currentCount = nextAchievements.progress[progressKey] ?? 0;
            nextAchievements = { ...nextAchievements, progress: { ...nextAchievements.progress, [progressKey]: currentCount + 1 } };

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
                    const before = nextChar;
                    nextChar = applyExp(nextChar, bonusExp);
                    const levelUps = Math.max(0, nextChar.level - before.level);
                    for (let i = 0; i < levelUps; i += 1) {
                        nextStatistics = recordLevelUp(nextStatistics, nextChar.level);
                    }
                    nextCharacters = nextCharacters.map((c) => (c.id === nextChar.id ? nextChar : c));
                }
            }

            nextStatistics = {
                ...nextStatistics,
                achievementsUnlocked: nextAchievements.unlocked.length,
                achievementPoints: nextAchievements.totalPoints
            };

            const rewards = { money: totalMoney, exp: expGain, bonus };

            const nextResult: MissionResult = {
                mission,
                character: nextChar,
                success: true,
                score: bonus,
                rewards
            };

            if (state.screen === 'exploration') {
                return {
                    ...state,
                    explorationDebrief: nextResult,
                    resources: nextResources,
                    characters: nextCharacters,
                    statistics: nextStatistics,
                    achievements: nextAchievements,
                    activeMission: null,
                    flightParams: null,
                    inboundFlight: null,
                    pendingExplorationQuestTemplateId: null
                };
            }

            return {
                ...state,
                screen: 'results',
                resources: nextResources,
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

            let nextResources: Resources = { ...state.resources, money: state.resources.money + action.rewards.money };
            let nextStatistics = recordMissionCompleted(state.statistics, {
                missionType: mission.type.toLowerCase(),
                characterId: char.id,
                location: mission.location,
                rewardsMoney: action.rewards.money
            });
            nextStatistics = recordMoneyBalance(nextStatistics, nextResources.money);

            const baseChar: CharacterState = { ...char, status: 'IDLE' };
            let nextChar = applyExp(baseChar, action.rewards.exp);

            const missionLevelUps = Math.max(0, nextChar.level - baseChar.level);
            for (let i = 0; i < missionLevelUps; i += 1) {
                nextStatistics = recordLevelUp(nextStatistics, nextChar.level);
            }

            let nextCharacters = state.characters.map((c) => (c.id === nextChar.id ? nextChar : c));

            let nextAchievements: AchievementState = state.achievements;
            const progressKey = `${nextChar.id}_${mission.type.toLowerCase()}`;
            const currentCount = nextAchievements.progress[progressKey] ?? 0;
            nextAchievements = { ...nextAchievements, progress: { ...nextAchievements.progress, [progressKey]: currentCount + 1 } };

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
                    const before = nextChar;
                    nextChar = applyExp(nextChar, bonusExp);
                    const levelUps = Math.max(0, nextChar.level - before.level);
                    for (let i = 0; i < levelUps; i += 1) {
                        nextStatistics = recordLevelUp(nextStatistics, nextChar.level);
                    }
                    nextCharacters = nextCharacters.map((c) => (c.id === nextChar.id ? nextChar : c));
                }
            }

            nextStatistics = {
                ...nextStatistics,
                achievementsUnlocked: nextAchievements.unlocked.length,
                achievementPoints: nextAchievements.totalPoints
            };

            const nextResult: MissionResult = {
                mission,
                character: nextChar,
                success: true,
                score: 0,
                rewards: { money: action.rewards.money, exp: action.rewards.exp, bonus: 0 }
            };

            if (state.screen === 'exploration') {
                return {
                    ...state,
                    explorationDebrief: nextResult,
                    resources: nextResources,
                    characters: nextCharacters,
                    statistics: nextStatistics,
                    achievements: nextAchievements
                };
            }

            return {
                ...state,
                screen: 'results',
                resources: nextResources,
                characters: nextCharacters,
                lastResult: nextResult,
                statistics: nextStatistics,
                achievements: nextAchievements,
                activeMission: null,
                flightParams: null
            };
        }

        case 'CLOSE_EXPLORATION_DEBRIEF':
            return { ...state, explorationDebrief: null };

        case 'CLEAR_PENDING_EXPLORATION_QUEST':
            return { ...state, pendingExplorationQuestTemplateId: null };

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
        missions: generateLocalMissions(15, 1),
        flightParams: null,
        activeMission: null,
        activeSessionId: null,
        lastResult: null,
        explorationDebrief: null,
        inboundFlight: null,
        pendingExplorationQuestTemplateId: null,
        statistics: createDefaultStatistics(),
        achievements: createDefaultAchievementState()
    };
}

function initGameState(): GameState {
    const base = createDefaultState();
    const snapshot = loadSnapshot();
    const nowIso = new Date().toISOString();
    const nowMs = Date.now();
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
        campaignTheme
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
