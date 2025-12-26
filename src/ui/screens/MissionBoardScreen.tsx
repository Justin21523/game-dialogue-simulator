import React from 'react';

import type { HttpError } from '../../shared/api/http';
import {
    bestForMissionType,
    fetchTutorialHint,
    fetchMissionTypeGuide,
    generateAssetPackage,
    generateMissionEvent,
    recommendDispatch,
    type BestForMissionType,
    type DispatchRecommendation
} from '../../shared/api/missionBoardApi';
import { GAME_CONFIG } from '../../shared/gameConfig';
import { getCharacterGridPortraitSrc } from '../../shared/characterAssets';
import type { CharacterState, Mission, Resources } from '../../shared/types/Game';
import { Modal } from '../components/Modal';
import { useToast } from '../components/ToastProvider';

type MissionRecommendation = DispatchRecommendation & {
    ranking?: BestForMissionType['ranking'];
    best_character?: string;
    mission_type?: string;
};

export type MissionBoardScreenProps = {
    missions: Mission[];
    characters: CharacterState[];
    selectedCharacterId: string;
    resources: Resources;
    onBackToHangar: () => void;
    onRefreshBoard: () => void;
    onAiGenerateMissions: () => void | Promise<void>;
    onDispatch: (missionId: string, charId: string) => boolean;
};

export function MissionBoardScreen(props: MissionBoardScreenProps) {
    const { missions, characters, selectedCharacterId, resources, onBackToHangar, onRefreshBoard, onAiGenerateMissions, onDispatch } = props;

    const toast = useToast();

    const [selectedMissionId, setSelectedMissionId] = React.useState<string | null>(null);
    const selectedMission = selectedMissionId ? missions.find((m) => m.id === selectedMissionId) : undefined;

    const [guideMission, setGuideMission] = React.useState<Mission | null>(null);
    const [guideLoading, setGuideLoading] = React.useState(false);
    const [guideError, setGuideError] = React.useState<string | null>(null);
    const [guideContent, setGuideContent] = React.useState<string | null>(null);
    const [guideTips, setGuideTips] = React.useState<string[]>([]);

    const [hintLoading, setHintLoading] = React.useState(false);
    const [exportLoading, setExportLoading] = React.useState(false);
    const [aiGenerateLoading, setAiGenerateLoading] = React.useState(false);
    const [recommendLoadingByMissionId, setRecommendLoadingByMissionId] = React.useState<Record<string, boolean>>({});
    const [eventLoadingByMissionId, setEventLoadingByMissionId] = React.useState<Record<string, boolean>>({});
    const [recommendationsByMissionId, setRecommendationsByMissionId] = React.useState<Record<string, MissionRecommendation>>({});

    const availableCharacterIds = React.useMemo(() => characters.map((c) => c.id), [characters]);

    const formatErrorMessage = React.useCallback((err: unknown): string => {
        if (typeof err === 'string') return err;
        if (err && typeof err === 'object') {
            const maybeHttp = err as Partial<HttpError>;
            if (typeof maybeHttp.message === 'string') return maybeHttp.message;

            if ('name' in err && (err as { name?: unknown }).name === 'AbortError') {
                return 'Request timed out. Please try again.';
            }
        }
        return 'Request failed. Please try again.';
    }, []);

    const preferredLanguage = React.useMemo<'en' | 'zh'>(() => {
        const lang = typeof navigator !== 'undefined' ? navigator.language : 'en';
        return lang.toLowerCase().startsWith('zh') ? 'zh' : 'en';
    }, []);

    const loadGuide = React.useCallback(
        async (mission: Mission) => {
            if (guideLoading) return;
            setGuideLoading(true);
            setGuideError(null);
            setGuideContent(null);
            setGuideTips([]);

            try {
                const guide = await fetchMissionTypeGuide({ missionType: mission.type, language: preferredLanguage });
                setGuideContent(guide.content || '');
                setGuideTips(guide.tips ?? []);
            } catch (err) {
                setGuideError(formatErrorMessage(err));
            } finally {
                setGuideLoading(false);
            }
        },
        [formatErrorMessage, guideLoading, preferredLanguage]
    );

    const handleGuide = React.useCallback(
        (mission: Mission) => {
            setGuideMission(mission);
            void loadGuide(mission);
        },
        [loadGuide]
    );

    const handleAiHint = React.useCallback(async () => {
        if (hintLoading) return;
        setHintLoading(true);
        try {
            const mission = missions[0];
            const hint = await fetchTutorialHint({
                currentSituation: 'mission_board',
                characterId: selectedCharacterId || null,
                missionType: mission?.type ?? null
            });
            toast.show(hint.content || "Here's a tip for you!", 'info', 8000);
        } catch (err) {
            toast.show(formatErrorMessage(err), 'error');
        } finally {
            setHintLoading(false);
        }
    }, [formatErrorMessage, hintLoading, missions, selectedCharacterId, toast]);

    const handleAiRecommend = React.useCallback(
        async (mission: Mission) => {
            if (recommendLoadingByMissionId[mission.id]) return;

            setRecommendLoadingByMissionId((prev) => ({ ...prev, [mission.id]: true }));
            try {
                const [detailedRec, bestForRec] = await Promise.all([
                    recommendDispatch({
                        missionType: mission.type,
                        location: mission.location,
                        problemDescription: mission.description,
                        urgency: 'normal',
                        availableCharacters: availableCharacterIds
                    }),
                    bestForMissionType({ missionType: mission.type, availableCharacters: availableCharacterIds })
                ]);

                const merged: MissionRecommendation = {
                    ...detailedRec,
                    ranking: bestForRec.ranking,
                    best_character: bestForRec.best_character,
                    mission_type: bestForRec.mission_type
                };

                setRecommendationsByMissionId((prev) => ({ ...prev, [mission.id]: merged }));
                toast.show(`AI Pick: ${merged.recommended_character} (${Math.round(merged.confidence * 100)}%)`, 'success');
            } catch (err) {
                toast.show(formatErrorMessage(err), 'error');
            } finally {
                setRecommendLoadingByMissionId((prev) => ({ ...prev, [mission.id]: false }));
            }
        },
        [availableCharacterIds, formatErrorMessage, recommendLoadingByMissionId, toast]
    );

    const handleAiEvent = React.useCallback(
        async (mission: Mission) => {
            if (eventLoadingByMissionId[mission.id]) return;
            setEventLoadingByMissionId((prev) => ({ ...prev, [mission.id]: true }));
            try {
                const rec = recommendationsByMissionId[mission.id];
                const characterId = rec?.recommended_character ?? selectedCharacterId ?? characters[0]?.id ?? 'jett';
                const event = await generateMissionEvent({
                    characterId,
                    location: mission.location,
                    missionPhase: 'active',
                    originalProblem: mission.description
                });
                toast.show(`${event.name}: ${event.description}`, 'info', 9000);
            } catch (err) {
                toast.show(formatErrorMessage(err), 'error');
            } finally {
                setEventLoadingByMissionId((prev) => ({ ...prev, [mission.id]: false }));
            }
        },
        [characters, eventLoadingByMissionId, formatErrorMessage, recommendationsByMissionId, selectedCharacterId, toast]
    );

    const handleExportAssets = React.useCallback(async () => {
        if (exportLoading) return;
        const mission = missions[0];
        if (!mission) {
            toast.show('No missions available to package.', 'warning');
            return;
        }

        setExportLoading(true);
        try {
            const rec = recommendationsByMissionId[mission.id];
            const mainCharacterId = rec?.recommended_character ?? selectedCharacterId ?? characters[0]?.id ?? 'jett';

            const result = await generateAssetPackage({
                missionName: mission.title,
                mainCharacterId,
                location: mission.location,
                missionType: mission.type,
                quality: 'medium'
            });

            if (!result.success) {
                toast.show(result.error_message || 'Asset packaging failed.', 'error');
                return;
            }

            toast.show(`Package generated: ${result.package_id}`, 'success', 9000);
        } catch (err) {
            toast.show(formatErrorMessage(err), 'error');
        } finally {
            setExportLoading(false);
        }
    }, [characters, exportLoading, formatErrorMessage, missions, recommendationsByMissionId, selectedCharacterId, toast]);

    const selectedMissionRec = selectedMission ? recommendationsByMissionId[selectedMission.id] : undefined;

    return (
        <div className="screen mission-board-screen anim-slide-up">
            <header className="screen-header">
                <h2>
                    <span className="icon">🌍</span> GLOBAL MISSIONS
                </h2>
                <div className="resources-display">
                    <span className="res-item">💰 {Math.floor(resources.money)}</span>
                    <span className="res-item">⛽ {Math.floor(resources.fuel)}</span>
                    <button
                        id="btn-ai-tip"
                        className="btn btn-outline btn-sm"
                        type="button"
                        disabled={hintLoading}
                        onClick={() => void handleAiHint()}
                    >
                        {hintLoading ? '💡 Generating...' : '💡 AI Hint'}
                    </button>
                </div>
            </header>

            <div className="mission-list-container">
                {missions.length > 0 ? (
                    missions.map((mission) => (
                        <div key={mission.id} className="mission-card panel" data-id={mission.id}>
                            <div className="mission-left">
                                <div className={`mission-icon icon-${mission.type.toLowerCase()}`}>{mission.type[0]}</div>
                            </div>

                            <div className="mission-center">
                                <div className="mission-header-text">
                                    <h3>{mission.title}</h3>
                                    <span className="mission-location">
                                        📍 {mission.location}
                                        {mission.campaignTheme ? ` · ${mission.campaignTheme}` : ''}
                                    </span>
                                </div>
                                <p className="mission-desc-short">{mission.description}</p>
                                {mission.campaignId ? <span className="tag badge">Campaign</span> : null}
                            </div>

                            <div className="mission-right">
                                <div className="rewards">
                                    <span className="tag reward">💰 {mission.rewardMoney}</span>
                                    <span className="tag cost">⛽ {mission.fuelCost}</span>
                                </div>
                                <button
                                    className="btn btn-outline btn-sm btn-mission-tutorial"
                                    type="button"
                                    onClick={() => handleGuide(mission)}
                                >
                                    📚 Guide
                                </button>
                                <button
                                    className="btn btn-outline btn-sm btn-ai"
                                    type="button"
                                    disabled={Boolean(recommendLoadingByMissionId[mission.id])}
                                    onClick={() => void handleAiRecommend(mission)}
                                >
                                    {recommendLoadingByMissionId[mission.id] ? '🤖 Loading...' : '🤖 AI Recommend'}
                                </button>
                                <button
                                    className="btn btn-outline btn-sm btn-event"
                                    type="button"
                                    disabled={Boolean(eventLoadingByMissionId[mission.id])}
                                    onClick={() => void handleAiEvent(mission)}
                                >
                                    {eventLoadingByMissionId[mission.id] ? '🎲 Loading...' : '🎲 AI Event'}
                                </button>
                                <button className="btn btn-primary btn-sm btn-accept" type="button" onClick={() => setSelectedMissionId(mission.id)}>
                                    SELECT
                                </button>
                            </div>
                        </div>
                    ))
                ) : (
                    <div className="empty-state">No missions available. Refresh to find new jobs!</div>
                )}
            </div>

            <div className="action-bar">
                <button id="btn-back-hangar" className="btn btn-secondary" type="button" onClick={onBackToHangar}>
                    ◀ Back to Hangar
                </button>
                <button id="btn-refresh" className="btn btn-warning" type="button" onClick={onRefreshBoard}>
                    🔄 Refresh Board (-50💰)
                </button>
                <button
                    id="btn-ai-refresh"
                    className="btn btn-primary"
                    type="button"
                    disabled={aiGenerateLoading}
                    onClick={() => {
                        if (aiGenerateLoading) return;
                        setAiGenerateLoading(true);
                        Promise.resolve(onAiGenerateMissions())
                            .catch((err) => toast.show(formatErrorMessage(err), 'error'))
                            .finally(() => setAiGenerateLoading(false));
                    }}
                >
                    {aiGenerateLoading ? '🤖 Generating...' : '🤖 AI Generate Missions'}
                </button>
                <button id="btn-package" className="btn btn-outline" type="button" disabled={exportLoading} onClick={() => void handleExportAssets()}>
                    {exportLoading ? '📦 Packaging...' : '📦 Export Assets'}
                </button>
            </div>

            <Modal
                open={Boolean(selectedMission)}
                title="Select Super Wing"
                onClose={() => setSelectedMissionId(null)}
                footer={
                    <button className="btn btn-secondary modal-cancel" type="button" onClick={() => setSelectedMissionId(null)}>
                        Cancel
                    </button>
                }
            >
                {selectedMission ? (
                    <>
                        <div className="modal-mission-summary">
                            <h4>Mission: {selectedMission.title}</h4>
                            <div className="reqs">
                                <span>⛽ Fuel Cost: {Math.ceil(selectedMission.fuelCost * GAME_CONFIG.FUEL_COST_MULTIPLIER)}</span>
                                <span>⭐ Type: {selectedMission.type}</span>
                            </div>
                        </div>
                        <div className="char-grid-selector">
                            {characters.map((char) => {
                                const isBonus = char.type === selectedMission.type;
                                const isRecommended = selectedMissionRec?.recommended_character === char.id;
                                const scoreEntry = selectedMissionRec?.ranking?.find((entry) => entry.character_id === char.id);
                                return (
                                    <div
                                        key={char.id}
                                        className={`char-choice-card ${isBonus ? 'bonus' : ''} ${isRecommended ? 'ai-recommended' : ''}`}
                                        role="button"
                                        tabIndex={0}
                                        onClick={() => {
                                            const ok = onDispatch(selectedMission.id, char.id);
                                            if (ok) setSelectedMissionId(null);
                                        }}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter' || e.key === ' ') {
                                                const ok = onDispatch(selectedMission.id, char.id);
                                                if (ok) setSelectedMissionId(null);
                                            }
                                        }}
                                    >
                                        <div className="char-choice-img">
                                            <img
                                                src={getCharacterGridPortraitSrc(char.id)}
                                                loading="lazy"
                                                onError={(e) => {
                                                    e.currentTarget.src = getCharacterGridPortraitSrc('jett');
                                                }}
                                            />
                                        </div>
                                        <div className="char-choice-name">{char.name}</div>
                                        {scoreEntry ? <div className="char-score">⭐ {scoreEntry.score}</div> : null}
                                        {isBonus ? <div className="match-badge">Type Match</div> : null}
                                        {isRecommended ? <div className="match-badge ai">AI Pick</div> : null}
                                    </div>
                                );
                            })}
                        </div>
                        {selectedMissionRec ? (
                            <div className="ai-reasoning">
                                <strong>AI Recommendation:</strong> {selectedMissionRec.recommended_character} (confidence{' '}
                                {Math.round(selectedMissionRec.confidence * 100)}%)
                                <br />
                                <em>{selectedMissionRec.reasoning || selectedMissionRec.explanation || ''}</em>
                            </div>
                        ) : (
                            <div className="ai-reasoning muted">No AI recommendation yet. Click “🤖 AI Recommend”.</div>
                        )}
                    </>
                ) : null}
            </Modal>

            <Modal
                open={Boolean(guideMission)}
                title={guideMission ? `Guide: ${guideMission.type}` : 'Guide'}
                onClose={() => {
                    setGuideMission(null);
                    setGuideLoading(false);
                    setGuideError(null);
                    setGuideContent(null);
                    setGuideTips([]);
                }}
                footer={
                    <button
                        className="btn btn-secondary modal-cancel"
                        type="button"
                        onClick={() => {
                            setGuideMission(null);
                            setGuideLoading(false);
                            setGuideError(null);
                            setGuideContent(null);
                            setGuideTips([]);
                        }}
                    >
                        Close
                    </button>
                }
            >
                <div className="guide-content">
                    {guideLoading ? <div className="guide-loading">Loading guide...</div> : null}
                    {!guideLoading && guideError ? (
                        <div className="guide-error">
                            <div>{guideError}</div>
                            {guideMission ? (
                                <button className="btn btn-primary btn-sm" type="button" onClick={() => void loadGuide(guideMission)}>
                                    Retry
                                </button>
                            ) : null}
                        </div>
                    ) : null}
                    {!guideLoading && !guideError && guideContent ? <div className="guide-text">{guideContent}</div> : null}
                    {!guideLoading && !guideError && guideTips.length > 0 ? (
                        <ul className="guide-tips">
                            {guideTips.map((tip) => (
                                <li key={tip}>{tip}</li>
                            ))}
                        </ul>
                    ) : null}
                </div>
            </Modal>
        </div>
    );
}
