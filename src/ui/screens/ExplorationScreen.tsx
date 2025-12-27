import React from 'react';

import { DialogueBox } from '../DialogueBox';
import { CompanionPanel } from '../CompanionPanel';
import { MapPanel } from '../MapPanel';
import { QuestJournal } from '../QuestJournal';
import { QuestTracker } from '../QuestTracker';
import { SkillsPanel } from '../SkillsPanel';
import { getLocation } from '../../shared/data/gameData';
import { eventBus } from '../../shared/eventBus';
import { EVENTS } from '../../shared/eventNames';
import { missionManager } from '../../shared/quests/missionManager';
import type { MissionResult } from '../../shared/types/Game';
import { Modal } from '../components/Modal';

export type ExplorationScreenProps = {
    actorId: string;
    debriefResult: MissionResult | null;
    onCloseDebrief: () => void;
    onBackToHangar: () => void;
};

export function ExplorationScreen(props: ExplorationScreenProps) {
    const { actorId, debriefResult, onCloseDebrief, onBackToHangar } = props;

    const [locationId, setLocationId] = React.useState<string>('base_airport');
    const [companionOpen, setCompanionOpen] = React.useState(false);
    const [journalOpen, setJournalOpen] = React.useState(false);
    const [skillsOpen, setSkillsOpen] = React.useState(false);
    const [mapOpen, setMapOpen] = React.useState(false);

    React.useEffect(() => {
        void missionManager.initialize({ mainCharacter: actorId });

        const onLocation = (payload: unknown) => {
            if (!payload || typeof payload !== 'object') return;
            const data = payload as Partial<{ locationId: string }>;
            if (typeof data.locationId !== 'string') return;
            setLocationId(data.locationId);
        };

        const onToggleCompanions = (payload: unknown) => {
            if (!payload || typeof payload !== 'object') return;
            const data = payload as Partial<{ actorId: string }>;
            if (data.actorId && data.actorId !== actorId) return;
            setCompanionOpen((v) => !v);
        };

        eventBus.on(EVENTS.LOCATION_CHANGED, onLocation);
        eventBus.on(EVENTS.UI_TOGGLE_COMPANION_PANEL, onToggleCompanions);
        return () => {
            eventBus.off(EVENTS.LOCATION_CHANGED, onLocation);
            eventBus.off(EVENTS.UI_TOGGLE_COMPANION_PANEL, onToggleCompanions);
        };
    }, [actorId]);

    React.useEffect(() => {
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key.toLowerCase() === 'j') {
                e.preventDefault();
                setJournalOpen((v) => !v);
            }
            if (e.key.toLowerCase() === 'k') {
                e.preventDefault();
                setSkillsOpen((v) => !v);
            }
            if (e.key.toLowerCase() === 'm') {
                e.preventDefault();
                setMapOpen((v) => !v);
            }
        };
        window.addEventListener('keydown', onKeyDown);
        return () => {
            window.removeEventListener('keydown', onKeyDown);
        };
    }, []);

    const locationName = getLocation(locationId)?.displayName ?? locationId;

    return (
        <div className="screen exploration-screen">
            <QuestTracker />

            <div className="exploration-top-left">
                <div className="location-badge">
                    <span className="location-icon">📍</span>
                    <span>{locationName}</span>
                </div>
                <button className="btn btn-outline" type="button" onClick={() => setCompanionOpen(true)}>
                    📞 Call Companion (C)
                </button>
                <button className="btn btn-outline" type="button" onClick={() => setJournalOpen(true)}>
                    📖 Journal (J)
                </button>
                <button className="btn btn-outline" type="button" onClick={() => setSkillsOpen(true)}>
                    🧩 Skills (K)
                </button>
                <button className="btn btn-outline" type="button" onClick={() => setMapOpen(true)}>
                    🗺️ Map (M)
                </button>
                <button className="btn btn-secondary" type="button" onClick={onBackToHangar}>
                    ◀ Back to Hangar
                </button>
            </div>

            <CompanionPanel open={companionOpen} actorId={actorId} onClose={() => setCompanionOpen(false)} />
            <QuestJournal open={journalOpen} onClose={() => setJournalOpen(false)} />
            <SkillsPanel open={skillsOpen} onClose={() => setSkillsOpen(false)} />
            <MapPanel open={mapOpen} currentLocationId={locationId} onClose={() => setMapOpen(false)} />
            <DialogueBox />

            <Modal
                open={Boolean(debriefResult)}
                title={debriefResult ? `Quest Complete: ${debriefResult.mission.title}` : 'Quest Complete'}
                onClose={onCloseDebrief}
                footer={
                    <div className="exploration-debrief__footer">
                        <button className="btn btn-secondary" type="button" onClick={onBackToHangar}>
                            Back to Hangar
                        </button>
                        <button className="btn btn-primary" type="button" onClick={onCloseDebrief}>
                            Continue Exploring
                        </button>
                    </div>
                }
            >
                {debriefResult ? (
                    <div className="exploration-debrief">
                        <p className="muted exploration-debrief__text">
                            Rewards have been applied to your resources and character progression.
                        </p>
                        <div className="exploration-debrief__grid">
                            <div className="exploration-debrief__card">
                                <div className="exploration-debrief__label">Money</div>
                                <div className="exploration-debrief__value">💰 +{debriefResult.rewards.money}</div>
                            </div>
                            <div className="exploration-debrief__card">
                                <div className="exploration-debrief__label">Experience</div>
                                <div className="exploration-debrief__value">⭐ +{debriefResult.rewards.exp}</div>
                            </div>
                        </div>
                        <p className="muted exploration-debrief__text">
                            Tip: Talk to the dispatcher for another mission.
                        </p>
                    </div>
                ) : null}
            </Modal>
        </div>
    );
}
