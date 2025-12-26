import React from 'react';

import { getQuestTemplate } from '../shared/data/gameData';
import { companionManager } from '../shared/systems/companionManager';
import type { CompanionAbility } from '../shared/types/Companion';
import type { CompanionCategory, CompanionDefinition } from '../shared/types/Companion';
import { Modal } from './components/Modal';
import { getCharacterGridPortraitSrc } from '../shared/characterAssets';

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

type CategoryFilter = 'ALL' | CompanionCategory;

const CATEGORY_TABS: Array<{ id: CategoryFilter; label: string }> = [
    { id: 'ALL', label: 'All' },
    { id: 'ENGINEERING', label: 'Engineering' },
    { id: 'POLICE', label: 'Police' },
    { id: 'ESPIONAGE', label: 'Espionage' },
    { id: 'DIGGING', label: 'Digging' },
    { id: 'ANIMAL_RESCUE', label: 'Animal Rescue' },
    { id: 'SUPPORT', label: 'Support' }
];

function normalizeCategory(value: CompanionDefinition['category'] | undefined): CompanionCategory {
    if (!value) return 'SUPPORT';
    return value;
}

function formatUnlockHint(companion: CompanionDefinition): string | null {
    const unlock = companion.unlock;
    if (!unlock || unlock.type === 'default') return null;
    if (unlock.type === 'world_flag') return `Unlock by discovering: ${unlock.flag}`;
    if (unlock.type === 'quest_completed') {
        const tpl = getQuestTemplate(unlock.templateId);
        return `Unlock by completing: ${tpl?.title ?? unlock.templateId}`;
    }
    return null;
}

export function CompanionPanel(props: CompanionPanelProps) {
    const { open, actorId, onClose } = props;
    const [called, setCalled] = React.useState<string[]>(() => companionManager.getCalledCompanionIds());
    const [selected, setSelected] = React.useState<string | null>(() => companionManager.getSelectedCompanionId());
    const [tab, setTab] = React.useState<CategoryFilter>('ALL');
    const [query, setQuery] = React.useState('');

    React.useEffect(() => {
        if (!open) return;
        companionManager.refreshUnlockedFromWorld();
        setCalled(companionManager.getCalledCompanionIds());
        setSelected(companionManager.getSelectedCompanionId());
    }, [open]);

    const companions = React.useMemo(() => companionManager.listAllCompanions(), []);

    const onCall = (companionId: string) => {
        if (companionManager.callCompanion(companionId, actorId)) {
            setCalled(companionManager.getCalledCompanionIds());
            if (!companionManager.getSelectedCompanionId()) {
                companionManager.selectCompanion(companionId);
                setSelected(companionId);
            }
        }
    };

    const onSelect = (companionId: string) => {
        companionManager.selectCompanion(companionId);
        setSelected(companionId);
    };

    const unlocked = React.useMemo(() => new Set(companionManager.getUnlockedCompanionIds()), [open]);

    const filtered = React.useMemo(() => {
        const q = query.trim().toLowerCase();
        return companions
            .filter((c) => {
                const category = normalizeCategory(c.category);
                if (tab !== 'ALL' && category !== tab) return false;
                if (!q) return true;
                return c.displayName.toLowerCase().includes(q) || c.companionId.toLowerCase().includes(q);
            })
            .sort((a, b) => {
                const aUnlocked = unlocked.has(a.companionId);
                const bUnlocked = unlocked.has(b.companionId);
                if (aUnlocked !== bUnlocked) return aUnlocked ? -1 : 1;
                return a.displayName.localeCompare(b.displayName);
            });
    }, [companions, query, tab, unlocked]);

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
                <div className="companion-panel__controls">
                    <div className="companion-tabs" role="tablist" aria-label="Companion categories">
                        {CATEGORY_TABS.map((item) => (
                            <button
                                key={item.id}
                                type="button"
                                className={`btn btn-sm ${tab === item.id ? 'btn-primary' : 'btn-outline'}`}
                                onClick={() => setTab(item.id)}
                            >
                                {item.label}
                            </button>
                        ))}
                    </div>
                    <input
                        className="companion-search"
                        type="search"
                        value={query}
                        placeholder="Search companions..."
                        onChange={(e) => setQuery(e.target.value)}
                    />
                </div>
                <div className="companion-grid">
                    {filtered.map((c) => {
                        const isCalled = called.includes(c.companionId);
                        const isUnlocked = unlocked.has(c.companionId);
                        const isSelected = selected === c.companionId;
                        const hint = formatUnlockHint(c);
                        const portrait = getCharacterGridPortraitSrc(c.characterId);
                        return (
                            <div
                                key={c.companionId}
                                className={`companion-card ${isCalled ? 'called' : ''} ${!isUnlocked ? 'locked' : ''}`}
                            >
                                <div className="companion-card__header">
                                    <div className="companion-card__identity">
                                        <img className="companion-portrait" src={portrait} alt={c.displayName} />
                                        <div className="companion-name">{c.displayName}</div>
                                    </div>
                                    <div className="companion-card__tags">
                                        {isSelected ? <span className="tag badge">ACTIVE</span> : null}
                                        {!isUnlocked ? <span className="tag cost">LOCKED</span> : isCalled ? <span className="tag reward">CALLED</span> : <span className="tag cost">READY</span>}
                                    </div>
                                </div>
                                {!isUnlocked && hint ? <div className="muted companion-unlock-hint">{hint}</div> : null}
                                <div className="companion-abilities">
                                    {c.abilities.map((ability) => (
                                        <span key={ability} className="tag badge">
                                            {formatAbility(ability)}
                                        </span>
                                    ))}
                                </div>
                                <div className="companion-card__actions">
                                    <button
                                        className="btn btn-outline btn-sm"
                                        type="button"
                                        onClick={() => onSelect(c.companionId)}
                                        disabled={!isUnlocked || isSelected}
                                    >
                                        {isSelected ? 'Active' : 'Set Active'}
                                    </button>
                                    <button
                                        className="btn btn-outline btn-sm"
                                        type="button"
                                        onClick={() => onCall(c.companionId)}
                                        disabled={!isUnlocked || isCalled}
                                    >
                                        {!isUnlocked ? 'Locked' : isCalled ? 'Already Called' : 'Call'}
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </Modal>
    );
}
