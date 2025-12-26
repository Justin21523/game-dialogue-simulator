import React from 'react';

import { getQuestTemplate } from '../shared/data/gameData';
import { eventBus } from '../shared/eventBus';
import { EVENTS } from '../shared/eventNames';
import { missionManager } from '../shared/quests/missionManager';
import type { Quest } from '../shared/quests/quest';
import { worldStateManager } from '../shared/systems/worldStateManager';
import { Modal } from './components/Modal';

type QuestJournalProps = {
    open: boolean;
    onClose: () => void;
};

function getQuestLabel(quest: Quest): string {
    const status = quest.status.toUpperCase();
    return `${status}: ${quest.title}`;
}

export function QuestJournal(props: QuestJournalProps) {
    const { open, onClose } = props;

    const [tick, setTick] = React.useState(0);

    React.useEffect(() => {
        if (!open) return;
        const refresh = () => setTick((v) => v + 1);
        eventBus.on(EVENTS.MISSION_MANAGER_READY, refresh);
        eventBus.on(EVENTS.QUEST_PROGRESS_UPDATED, refresh);
        eventBus.on(EVENTS.MISSION_STATE_CHANGED, refresh);
        eventBus.on(EVENTS.QUEST_ACCEPTED, refresh);
        eventBus.on(EVENTS.QUEST_COMPLETED, refresh);
        eventBus.on(EVENTS.QUEST_ABANDONED, refresh);
        eventBus.on(EVENTS.WORLD_STATE_CHANGED, refresh);
        return () => {
            eventBus.off(EVENTS.MISSION_MANAGER_READY, refresh);
            eventBus.off(EVENTS.QUEST_PROGRESS_UPDATED, refresh);
            eventBus.off(EVENTS.MISSION_STATE_CHANGED, refresh);
            eventBus.off(EVENTS.QUEST_ACCEPTED, refresh);
            eventBus.off(EVENTS.QUEST_COMPLETED, refresh);
            eventBus.off(EVENTS.QUEST_ABANDONED, refresh);
            eventBus.off(EVENTS.WORLD_STATE_CHANGED, refresh);
        };
    }, [open]);

    void tick;
    worldStateManager.initialize();

    const activeMain = missionManager.getActiveMainQuest();
    const activeSubs = missionManager.getActiveSubQuests();
    const allQuests = Array.from(missionManager.quests.values());
    const completedTemplates = worldStateManager.getState().completedQuestTemplates;
    const inventory = worldStateManager.getState().inventory;

    const completed = allQuests.filter((q) => q.status === 'completed');
    const abandoned = allQuests.filter((q) => q.status === 'abandoned');

    const footer = (
        <button className="btn btn-primary" type="button" onClick={onClose}>
            Close
        </button>
    );

    return (
        <Modal open={open} title="Quest Journal" onClose={onClose} footer={footer}>
            <div className="quest-journal">
                <section className="quest-journal__section">
                    <h4>Active Main Quest</h4>
                    {activeMain ? (
                        <div className="quest-journal__quest">
                            <div className="quest-journal__title">{getQuestLabel(activeMain)}</div>
                            <div className="muted">{activeMain.description}</div>
                            <ul className="quest-journal__objectives">
                                {(activeMain.objectives ?? []).map((o) => (
                                    <li key={o.id}>
                                        <strong>{o.status.toUpperCase()}</strong> — {o.title} <span className="muted">({o.getProgressText()})</span>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    ) : (
                        <div className="muted">No active main quest. Talk to NPCs in town to get started.</div>
                    )}
                </section>

                <section className="quest-journal__section">
                    <h4>Active Side Quests</h4>
                    {activeSubs.length > 0 ? (
                        <ul className="quest-journal__list">
                            {activeSubs.map((q) => (
                                <li key={q.questId}>
                                    <strong>{q.title}</strong> <span className="muted">({q.status})</span>
                                </li>
                            ))}
                        </ul>
                    ) : (
                        <div className="muted">No active side quests.</div>
                    )}
                </section>

                <section className="quest-journal__section">
                    <h4>Completed Templates</h4>
                    {completedTemplates.length > 0 ? (
                        <ul className="quest-journal__list">
                            {completedTemplates.map((id) => {
                                const tpl = getQuestTemplate(id);
                                return (
                                    <li key={id}>
                                        <strong>{tpl?.title ?? id}</strong> <span className="muted">({id})</span>
                                    </li>
                                );
                            })}
                        </ul>
                    ) : (
                        <div className="muted">No completed quest templates yet.</div>
                    )}
                </section>

                <section className="quest-journal__section">
                    <h4>Inventory</h4>
                    {Object.keys(inventory).length > 0 ? (
                        <ul className="quest-journal__list">
                            {Object.entries(inventory).map(([itemId, qty]) => (
                                <li key={itemId}>
                                    <strong>{itemId}</strong> <span className="muted">×{qty}</span>
                                </li>
                            ))}
                        </ul>
                    ) : (
                        <div className="muted">No items collected yet.</div>
                    )}
                </section>

                {completed.length > 0 ? (
                    <section className="quest-journal__section">
                        <h4>Completed Quest Instances</h4>
                        <ul className="quest-journal__list">
                            {completed.slice(-8).map((q) => (
                                <li key={q.questId}>
                                    <strong>{q.title}</strong> <span className="muted">({q.templateId})</span>
                                </li>
                            ))}
                        </ul>
                    </section>
                ) : null}

                {abandoned.length > 0 ? (
                    <section className="quest-journal__section">
                        <h4>Abandoned</h4>
                        <ul className="quest-journal__list">
                            {abandoned.slice(-8).map((q) => (
                                <li key={q.questId}>
                                    <strong>{q.title}</strong> <span className="muted">({q.templateId})</span>
                                </li>
                            ))}
                        </ul>
                    </section>
                ) : null}
            </div>
        </Modal>
    );
}

