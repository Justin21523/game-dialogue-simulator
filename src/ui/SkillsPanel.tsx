import React from 'react';

import { audioManager } from '../shared/audio/audioManager';
import { eventBus } from '../shared/eventBus';
import { EVENTS } from '../shared/eventNames';
import { SKILLS } from '../shared/skills/skillsCatalog';
import { worldStateManager } from '../shared/systems/worldStateManager';
import { Modal } from './components/Modal';

export type SkillsPanelProps = {
    open: boolean;
    onClose: () => void;
};

export function SkillsPanel(props: SkillsPanelProps) {
    const { open, onClose } = props;

    const [tick, setTick] = React.useState(0);

    React.useEffect(() => {
        if (!open) return;
        const refresh = () => setTick((v) => v + 1);
        eventBus.on(EVENTS.WORLD_STATE_CHANGED, refresh);
        return () => {
            eventBus.off(EVENTS.WORLD_STATE_CHANGED, refresh);
        };
    }, [open]);

    void tick;
    worldStateManager.initialize();
    const unlocked = new Set(worldStateManager.getState().unlockedSkills);

    const footer = (
        <button className="btn btn-primary" type="button" onClick={onClose}>
            Close
        </button>
    );

    return (
        <Modal open={open} title="Skills" onClose={onClose} footer={footer}>
            <div className="skills-panel">
                <p className="muted skills-panel__hint">
                    Skills are persistent and unlock new exploration abilities. (MVP: unlocks are local only and do not consume currency yet.)
                </p>
                <div className="skills-grid">
                    {SKILLS.map((skill) => {
                        const isUnlocked = unlocked.has(skill.skillId);
                        return (
                            <div key={skill.skillId} className={`skills-card ${isUnlocked ? 'unlocked' : ''}`}>
                                <div className="skills-card__header">
                                    <div className="skills-name">{skill.name}</div>
                                    {isUnlocked ? <span className="tag reward">UNLOCKED</span> : <span className="tag cost">LOCKED</span>}
                                </div>
                                <div className="muted skills-desc">{skill.description}</div>
                                <button
                                    className="btn btn-outline btn-sm"
                                    type="button"
                                    disabled={isUnlocked}
                                    onClick={() => {
                                        worldStateManager.unlockSkill(skill.skillId);
                                        audioManager.playSound('success');
                                    }}
                                >
                                    {isUnlocked ? 'Unlocked' : 'Unlock'}
                                </button>
                            </div>
                        );
                    })}
                </div>
                <div className="muted skills-panel__footer-hint">Tip: When Exploration Flight is unlocked, press F in town to take off / land.</div>
            </div>
        </Modal>
    );
}
