import React from 'react';

import { resolveMissionEvent } from '../shared/api/missionBoardApi';
import { eventBus } from '../shared/eventBus';
import { EVENTS } from '../shared/eventNames';
import { getMissionScript } from '../shared/missions/missionScripts';
import { worldStateManager } from '../shared/systems/worldStateManager';
import type { MissionLogEntry } from '../shared/types/World';
import { Modal } from './components/Modal';

export type MissionTimelinePanelProps = {
    open: boolean;
    onClose: () => void;
};

function formatTime(timestamp: number): string {
    try {
        return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
        return '';
    }
}

function kindLabel(kind: MissionLogEntry['kind']): string {
    switch (kind) {
        case 'dialogue':
            return 'Dialogue';
        case 'narration':
            return 'Narration';
        case 'event':
            return 'Event';
        default:
            return 'Log';
    }
}

function normalizeLines(text: string): string[] {
    return text
        .split('\n')
        .map((line) => line.trimEnd())
        .filter((line, idx, arr) => !(line === '' && arr[idx - 1] === ''));
}

export function MissionTimelinePanel(props: MissionTimelinePanelProps) {
    const { open, onClose } = props;

    const [session, setSession] = React.useState(() => worldStateManager.getActiveMissionSession());
    const [resolvingEventId, setResolvingEventId] = React.useState<string | null>(null);
    const [resolvedEventIds, setResolvedEventIds] = React.useState(() => new Set<string>());

    React.useEffect(() => {
        if (!open) return;

        const sync = () => {
            setSession(worldStateManager.getActiveMissionSession());
        };
        sync();

        const onWorldStateChanged = () => sync();
        eventBus.on(EVENTS.WORLD_STATE_CHANGED, onWorldStateChanged);
        return () => {
            eventBus.off(EVENTS.WORLD_STATE_CHANGED, onWorldStateChanged);
        };
    }, [open]);

    React.useEffect(() => {
        if (!open) return;
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                onClose();
            }
        };
        window.addEventListener('keydown', onKeyDown);
        return () => {
            window.removeEventListener('keydown', onKeyDown);
        };
    }, [onClose, open]);

    if (!open) return null;

    const missionTitle = session?.mission.title ?? 'Mission Timeline';
    const script = session?.mission.missionScriptId ? getMissionScript(session.mission.missionScriptId) : null;
    const phases = script?.phases ?? [];
    const entries = session?.log ?? [];

    const handleResolveChoice = async (entry: MissionLogEntry, choiceIndex: number) => {
        if (!session || !entry.eventId) return;
        if (resolvingEventId) return;
        if (resolvedEventIds.has(entry.eventId)) return;

        setResolvingEventId(entry.eventId);
        try {
            const res = await resolveMissionEvent({ eventId: entry.eventId, choiceIndex });
            setResolvedEventIds((prev) => new Set(prev).add(entry.eventId!));
            worldStateManager.appendMissionLog({
                phaseId: entry.phaseId,
                kind: 'event',
                title: res.success ? 'Outcome (Success)' : 'Outcome (Failed)',
                text: res.outcome
            });
        } catch (err) {
            worldStateManager.appendMissionLog({
                phaseId: entry.phaseId,
                kind: 'system',
                title: 'Event',
                text: `Failed to resolve event. Try again.`
            });
            void err;
        } finally {
            setResolvingEventId(null);
        }
    };

    return (
        <Modal open={open} title={missionTitle} onClose={onClose}>
            {!session ? (
                <p className="muted">No active mission session. Start a mission to populate the timeline.</p>
            ) : (
                <>
                    {phases.length > 0 ? (
                        <div className="mission-timeline__phases">
                            {phases.map((phase) => (
                                <span
                                    key={phase.phaseId}
                                    className={`mission-timeline__phase ${phase.phaseId === session.phaseId ? 'active' : ''}`}
                                >
                                    {phase.label}
                                </span>
                            ))}
                        </div>
                    ) : null}

                    <div className="mission-timeline__entries">
                        {entries.length === 0 ? <p className="muted">Timeline entries will appear as the mission progresses.</p> : null}

                        {entries.map((entry) => (
                            <div key={entry.id} className={`mission-timeline__entry mission-timeline__entry--${entry.kind}`}>
                                <div className="mission-timeline__entry-meta">
                                    <span className="mission-timeline__time">{formatTime(entry.timestamp)}</span>
                                    <span className="mission-timeline__kind">{kindLabel(entry.kind)}</span>
                                    {entry.title ? <span className="mission-timeline__title">{entry.title}</span> : null}
                                </div>
                                <div className="mission-timeline__text">
                                    {normalizeLines(entry.text).map((line, idx) => (
                                        <p key={`${entry.id}:${idx}`}>{line}</p>
                                    ))}
                                </div>

                                {entry.kind === 'event' && entry.eventId && entry.choices && entry.choices.length > 0 ? (
                                    <div className="mission-timeline__choices">
                                        {entry.choices.map((choice, idx) => {
                                            const eventId = entry.eventId;
                                            if (!eventId) return null;

                                            return (
                                                <button
                                                    key={choice.id}
                                                    className="btn btn-outline"
                                                    type="button"
                                                    disabled={Boolean(resolvingEventId) || resolvedEventIds.has(eventId)}
                                                    onClick={() => void handleResolveChoice(entry, idx)}
                                                >
                                                    {choice.text}
                                                </button>
                                            );
                                        })}
                                    </div>
                                ) : null}
                            </div>
                        ))}
                    </div>
                </>
            )}
        </Modal>
    );
}
