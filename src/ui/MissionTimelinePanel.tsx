import React from 'react';

import { resolveMissionEvent } from '../shared/api/missionBoardApi';
import { eventBus } from '../shared/eventBus';
import { EVENTS } from '../shared/eventNames';
import { getMissionScript } from '../shared/missions/missionScripts';
import { worldStateManager } from '../shared/systems/worldStateManager';
import type { ActiveMissionSession, MissionHistoryEntry, MissionLogEntry } from '../shared/types/World';
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
        case 'system':
            return 'System';
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

    const [session, setSession] = React.useState<ActiveMissionSession | null>(() => worldStateManager.getActiveMissionSession());
    const [history, setHistory] = React.useState<MissionHistoryEntry[]>(() => worldStateManager.getMissionHistory());
    const [source, setSource] = React.useState<{ kind: 'active' } | { kind: 'history'; id: string }>(() => ({ kind: 'active' }));
    const [resolvingEventId, setResolvingEventId] = React.useState<string | null>(null);
    const [resolvedEventIds, setResolvedEventIds] = React.useState(() => new Set<string>());

    React.useEffect(() => {
        if (!open) return;

        const sync = () => {
            setSession(worldStateManager.getActiveMissionSession());
            setHistory(worldStateManager.getMissionHistory());
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
        if (session && source.kind !== 'active') return;
        if (!session && history.length > 0) {
            setSource({ kind: 'history', id: history[history.length - 1]!.id });
        }
    }, [history, open, session, source.kind]);

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

    const activeHistoryEntry = source.kind === 'history' ? history.find((h) => h.id === source.id) ?? null : null;
    const viewingHistory = Boolean(activeHistoryEntry);
    const viewSession = viewingHistory ? activeHistoryEntry!.session : session;
    const missionTitle = viewSession?.mission.title ?? 'Mission Timeline';
    const script = viewSession?.mission.missionScriptId ? getMissionScript(viewSession.mission.missionScriptId) : null;
    const phases = script?.phases ?? [];
    const entries = viewSession?.log ?? [];

    const handleResolveChoice = async (entry: MissionLogEntry, choiceIndex: number) => {
        if (!session || viewingHistory || !entry.eventId) return;
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
            {!viewSession ? (
                <p className="muted">No mission timeline available yet. Start a mission to populate the timeline.</p>
            ) : (
                <>
                    <div className="mission-timeline__header">
                        <label className="mission-timeline__select">
                            <span className="muted">Session</span>
                            <select
                                value={source.kind === 'active' ? 'active' : `history:${source.id}`}
                                onChange={(e) => {
                                    const value = e.target.value;
                                    if (value === 'active') {
                                        setSource({ kind: 'active' });
                                        return;
                                    }
                                    if (value.startsWith('history:')) {
                                        setSource({ kind: 'history', id: value.slice('history:'.length) });
                                    }
                                }}
                            >
                                {session ? <option value="active">Active: {session.mission.title}</option> : null}
                                {history
                                    .slice()
                                    .reverse()
                                    .map((entry) => (
                                        <option key={entry.id} value={`history:${entry.id}`}>
                                            {entry.outcome.toUpperCase()} · {entry.session.mission.title}
                                        </option>
                                    ))}
                            </select>
                        </label>
                        {activeHistoryEntry ? (
                            <div className="mission-timeline__meta muted">
                                {activeHistoryEntry.outcome.toUpperCase()} · {formatTime(activeHistoryEntry.endedAt)}
                            </div>
                        ) : null}
                    </div>

                    {phases.length > 0 ? (
                        <div className="mission-timeline__phases">
                            {phases.map((phase) => (
                                <span
                                    key={phase.phaseId}
                                    className={`mission-timeline__phase ${viewSession && phase.phaseId === viewSession.phaseId ? 'active' : ''}`}
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
                                                    disabled={viewingHistory || Boolean(resolvingEventId) || resolvedEventIds.has(eventId)}
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
