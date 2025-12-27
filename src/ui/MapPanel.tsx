import React from 'react';

import { getLocation, listLocations } from '../shared/data/gameData';
import { eventBus } from '../shared/eventBus';
import { EVENTS } from '../shared/eventNames';
import { missionManager } from '../shared/quests/missionManager';
import { getObjectiveTargetHint } from '../shared/quests/objectiveTargets';
import { worldStateManager } from '../shared/systems/worldStateManager';
import { Modal } from './components/Modal';

type MapPanelProps = {
    open: boolean;
    currentLocationId: string;
    onClose: () => void;
};

function titleCaseId(raw: string): string {
    return raw
        .replace(/^item_/, '')
        .replace(/_/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .replace(/\b\w/g, (m) => m.toUpperCase());
}

export function MapPanel(props: MapPanelProps) {
    const { open, currentLocationId, onClose } = props;

    const [tick, setTick] = React.useState(0);

    React.useEffect(() => {
        if (!open) return;
        const refresh = () => setTick((v) => v + 1);
        eventBus.on(EVENTS.WORLD_STATE_CHANGED, refresh);
        eventBus.on(EVENTS.MISSION_STATE_CHANGED, refresh);
        eventBus.on(EVENTS.QUEST_PROGRESS_UPDATED, refresh);
        return () => {
            eventBus.off(EVENTS.WORLD_STATE_CHANGED, refresh);
            eventBus.off(EVENTS.MISSION_STATE_CHANGED, refresh);
            eventBus.off(EVENTS.QUEST_PROGRESS_UPDATED, refresh);
        };
    }, [open]);

    void tick;
    worldStateManager.initialize();

    const world = worldStateManager.getState();
    const unlocked = new Set(world.unlockedLocations);
    const discovered = new Set(world.discoveredLocations);

    const locations = React.useMemo(() => listLocations().slice().sort((a, b) => a.displayName.localeCompare(b.displayName)), []);
    const current = getLocation(currentLocationId);

    const activeMain = missionManager.getActiveMainQuest();
    const activeObjective = activeMain?.objectives?.find((o) => o.status === 'active') ?? null;
    const targetHint = activeObjective ? getObjectiveTargetHint(activeObjective) : null;

    const travelOptions = React.useMemo(() => {
        if (!current) return { exits: [], doors: [] };
        const exits = current.exits.map((ex) => {
            const target = getLocation(ex.targetLocationId);
            const isUnlocked = unlocked.has(ex.targetLocationId);
            return {
                id: ex.exitId,
                type: 'exit' as const,
                label: `Exit: ${target?.displayName ?? ex.targetLocationId}`,
                lockedReason: isUnlocked ? null : 'Location locked'
            };
        });

        const doors = (current.doors ?? []).map((door) => {
            const target = getLocation(door.targetLocationId);
            const needsFlag = door.requiredWorldFlag && !worldStateManager.hasWorldFlag(door.requiredWorldFlag);
            const needsItem = door.requiredItemId && !worldStateManager.hasItem(door.requiredItemId, door.requiredItemQty ?? 1);
            const lockedReason = needsFlag
                ? 'World flag required'
                : needsItem
                  ? `Key required: ${titleCaseId(door.requiredItemId ?? '')}`
                  : null;

            return {
                id: door.doorId,
                type: 'door' as const,
                label: `Door: ${door.label} → ${target?.displayName ?? door.targetLocationId}`,
                lockedReason
            };
        });

        return { exits, doors };
    }, [current, unlocked]);

    const footer = (
        <button className="btn btn-primary" type="button" onClick={onClose}>
            Close (M)
        </button>
    );

    return (
        <Modal open={open} title="Map" onClose={onClose} footer={footer}>
            <div className="map-panel">
                <section className="map-panel__section">
                    <h4>Current Location</h4>
                    <div className="map-panel__current">
                        <strong>{current?.displayName ?? currentLocationId}</strong> <span className="muted">({currentLocationId})</span>
                    </div>
                </section>

                <section className="map-panel__section">
                    <h4>Active Objective</h4>
                    {activeMain && activeObjective ? (
                        <div className="map-panel__objective">
                            <div className="map-panel__objective-title">
                                <strong>{activeObjective.title}</strong> <span className="muted">({activeMain.title})</span>
                            </div>
                            <div className="muted map-panel__objective-detail">
                                {targetHint?.locationId ? (
                                    <>
                                        Target location: <strong>{getLocation(targetHint.locationId)?.displayName ?? targetHint.locationId}</strong>
                                    </>
                                ) : targetHint?.npcId ? (
                                    <>Target NPC: <strong>{targetHint.npcId}</strong></>
                                ) : targetHint?.itemId ? (
                                    <>Target item: <strong>{titleCaseId(targetHint.itemId)}</strong></>
                                ) : targetHint?.targetId ? (
                                    <>Target: <strong>{targetHint.targetId}</strong></>
                                ) : (
                                    <>Explore and interact to advance the quest.</>
                                )}
                                {targetHint?.requiredAbility ? <> · Requires: {targetHint.requiredAbility}</> : null}
                            </div>
                        </div>
                    ) : (
                        <div className="muted">No active main quest.</div>
                    )}
                </section>

                <section className="map-panel__section">
                    <h4>Travel Options</h4>
                    {current ? (
                        <ul className="map-panel__list">
                            {travelOptions.doors.map((opt) => (
                                <li key={opt.id} className={opt.lockedReason ? 'muted' : ''}>
                                    {opt.label}
                                    {opt.lockedReason ? <span className="map-panel__locked"> — {opt.lockedReason}</span> : null}
                                </li>
                            ))}
                            {travelOptions.exits.map((opt) => (
                                <li key={opt.id} className={opt.lockedReason ? 'muted' : ''}>
                                    {opt.label}
                                    {opt.lockedReason ? <span className="map-panel__locked"> — {opt.lockedReason}</span> : null}
                                </li>
                            ))}
                            {travelOptions.doors.length === 0 && travelOptions.exits.length === 0 ? <li className="muted">No exits here.</li> : null}
                        </ul>
                    ) : (
                        <div className="muted">Unknown location.</div>
                    )}
                </section>

                <section className="map-panel__section">
                    <h4>World Locations</h4>
                    <ul className="map-panel__grid">
                        {locations.map((loc) => {
                            const isUnlocked = unlocked.has(loc.locationId);
                            const isDiscovered = discovered.has(loc.locationId);
                            const isHere = loc.locationId === currentLocationId;

                            const status = isHere ? 'HERE' : isUnlocked ? (isDiscovered ? 'DISCOVERED' : 'UNSEEN') : 'LOCKED';
                            const className = isHere ? 'map-panel__loc map-panel__loc--here' : isUnlocked ? 'map-panel__loc' : 'map-panel__loc map-panel__loc--locked';

                            return (
                                <li key={loc.locationId} className={className}>
                                    <div className="map-panel__loc-name">{loc.displayName}</div>
                                    <div className="map-panel__loc-meta">
                                        <span className="tag badge">{status}</span>
                                        <span className="muted">{loc.locationId}</span>
                                    </div>
                                </li>
                            );
                        })}
                    </ul>
                </section>
            </div>
        </Modal>
    );
}

