import React from 'react';

import { companionManager } from '../shared/systems/companionManager';
import type { CompanionAbility } from '../shared/types/Companion';
import { Modal } from './components/Modal';

function formatAbility(ability: CompanionAbility): string {
    switch (ability) {
        case 'ENGINEERING':
            return 'Engineering';
        case 'POLICE':
            return 'Police';
        case 'ESPIONAGE':
            return 'Espionage';
        case 'DIGGING':
            return 'Digging';
        case 'ANIMAL_RESCUE':
            return 'Animal Rescue';
        default:
            return ability;
    }
}

export type CompanionPanelProps = {
    open: boolean;
    actorId: string;
    onClose: () => void;
};

export function CompanionPanel(props: CompanionPanelProps) {
    const { open, actorId, onClose } = props;
    const [called, setCalled] = React.useState<string[]>(() => companionManager.getCalledCompanionIds());

    React.useEffect(() => {
        if (!open) return;
        setCalled(companionManager.getCalledCompanionIds());
    }, [open]);

    const companions = React.useMemo(() => companionManager.listAllCompanions(), []);

    const onCall = (companionId: string) => {
        if (companionManager.callCompanion(companionId, actorId)) {
            setCalled(companionManager.getCalledCompanionIds());
        }
    };

    const footer = (
        <div className="companion-panel__footer">
            <button
                className="btn btn-secondary"
                type="button"
                onClick={() => {
                    companionManager.resetCalled();
                    setCalled([]);
                }}
            >
                Reset Called
            </button>
            <button className="btn btn-primary" type="button" onClick={onClose}>
                Done
            </button>
        </div>
    );

    return (
        <Modal open={open} title="Call Companion" onClose={onClose} footer={footer}>
            <div className="companion-panel">
                <p className="muted companion-panel__hint">
                    Calling a companion unlocks their ability for quest interactions. (MVP: companions do not spawn physically yet.)
                </p>
                <div className="companion-grid">
                    {companions.map((c) => {
                        const isCalled = called.includes(c.companionId);
                        return (
                            <div key={c.companionId} className={`companion-card ${isCalled ? 'called' : ''}`}>
                                <div className="companion-card__header">
                                    <div className="companion-name">{c.displayName}</div>
                                    {isCalled ? <span className="tag reward">CALLED</span> : <span className="tag cost">READY</span>}
                                </div>
                                <div className="companion-abilities">
                                    {c.abilities.map((ability) => (
                                        <span key={ability} className="tag badge">
                                            {formatAbility(ability)}
                                        </span>
                                    ))}
                                </div>
                                <button className="btn btn-outline btn-sm" type="button" onClick={() => onCall(c.companionId)} disabled={isCalled}>
                                    {isCalled ? 'Already Called' : 'Call'}
                                </button>
                            </div>
                        );
                    })}
                </div>
            </div>
        </Modal>
    );
}
