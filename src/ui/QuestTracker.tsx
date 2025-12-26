import React from 'react';

import { eventBus } from '../shared/eventBus';
import { EVENTS } from '../shared/eventNames';
import { missionManager } from '../shared/quests/missionManager';
import type { Quest } from '../shared/quests/quest';

function getActiveQuest(): Quest | null {
    return missionManager.getActiveMainQuest();
}

export function QuestTracker() {
    const [quest, setQuest] = React.useState<Quest | null>(() => getActiveQuest());

    React.useEffect(() => {
        const refresh = () => setQuest(getActiveQuest());

        eventBus.on(EVENTS.MISSION_MANAGER_READY, refresh);
        eventBus.on(EVENTS.QUEST_PROGRESS_UPDATED, refresh);
        eventBus.on(EVENTS.MISSION_STATE_CHANGED, refresh);
        eventBus.on(EVENTS.QUEST_ACCEPTED, refresh);
        eventBus.on(EVENTS.QUEST_COMPLETED, refresh);
        eventBus.on(EVENTS.QUEST_ABANDONED, refresh);
        return () => {
            eventBus.off(EVENTS.MISSION_MANAGER_READY, refresh);
            eventBus.off(EVENTS.QUEST_PROGRESS_UPDATED, refresh);
            eventBus.off(EVENTS.MISSION_STATE_CHANGED, refresh);
            eventBus.off(EVENTS.QUEST_ACCEPTED, refresh);
            eventBus.off(EVENTS.QUEST_COMPLETED, refresh);
            eventBus.off(EVENTS.QUEST_ABANDONED, refresh);
        };
    }, []);

    if (!quest) {
        return (
            <div className="mission-tracker">
                <div className="tracker-header">
                    <div className="header-left">
                        <span className="tracker-icon">🧭</span>
                        <span className="tracker-title">QUEST</span>
                    </div>
                </div>
                <div className="tracker-body">
                    <div className="mission-info">
                        <h3 className="mission-title">No active quest</h3>
                        <p className="mission-description">Talk to an NPC to get started.</p>
                    </div>
                </div>
            </div>
        );
    }

    const objectives = quest.objectives ?? [];
    const required = objectives.filter((o) => !o.optional);
    const completedCount = required.filter((o) => o.status === 'completed').length;
    const pct = required.length > 0 ? Math.round((completedCount / required.length) * 100) : 0;

    return (
        <div className="mission-tracker">
            <div className="tracker-header">
                <div className="header-left">
                    <span className="tracker-icon">🧭</span>
                    <span className="tracker-title">QUEST</span>
                </div>
                <div className="header-right">
                    <span className="timer-display">
                        <span className="timer-icon">✓</span>
                        <span className="timer-text">{pct}%</span>
                    </span>
                </div>
            </div>

            <div className="tracker-body">
                <div className="mission-info">
                    <h3 className="mission-title">{quest.title}</h3>
                    <p className="mission-description">{quest.description}</p>
                </div>

                <div className="progress-section">
                    <div className="progress-bar-container">
                        <div className="progress-bar-fill" style={{ width: `${pct}%` }} />
                    </div>
                    <div className="progress-text">{pct}%</div>
                </div>

                <div className="task-list">
                    {objectives.map((o) => {
                        const isCompleted = o.status === 'completed';
                        const isActive = o.status === 'active';
                        return (
                            <div key={o.id} className={`task-item ${isCompleted ? 'completed' : ''} ${isActive ? 'highlighted' : ''}`}>
                                <div className="task-checkbox">{isCompleted ? '✅' : isActive ? '➡️' : '⬜'}</div>
                                <div className="task-content">
                                    <div className="task-header">
                                        <div className="task-title">{o.title}</div>
                                    </div>
                                    <div className="task-progress">
                                        <div className="task-progress-bar">
                                            <div className="task-progress-fill" style={{ width: `${Math.round(o.progress * 100)}%` }} />
                                        </div>
                                        <div className="task-progress-text">{o.getProgressText()}</div>
                                    </div>
                                    {o.hint ? <div className="task-hint">{o.hint}</div> : null}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
