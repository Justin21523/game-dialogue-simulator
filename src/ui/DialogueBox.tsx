import React from 'react';

import { getDialogue, getNpc } from '../shared/data/gameData';
import { eventBus } from '../shared/eventBus';
import { EVENTS } from '../shared/eventNames';
import { missionManager } from '../shared/quests/missionManager';
import { startQuestFromTemplate } from '../shared/quests/questRuntime';
import type { DialogueAction, DialogueDefinition, DialogueLine, DialogueSession } from '../shared/types/Dialogue';

type DialogueOpenPayload = {
    npcId: string;
    actorId: string;
    dialogueId?: string;
};

function findDialogueNode(def: DialogueDefinition, nodeId: string) {
    return def.nodes.find((n) => n.nodeId === nodeId) ?? null;
}

function getLineText(line: DialogueLine): string {
    return typeof line === 'string' ? line : line.text;
}

function pickDialogueId(payload: DialogueOpenPayload): string | null {
    if (payload.dialogueId) return payload.dialogueId;
    const npc = getNpc(payload.npcId);
    if (!npc) return null;

    const active = missionManager.getActiveMainQuest();
    if (active && npc.dialogueIdActive) return npc.dialogueIdActive;

    const hasAnyCompleted = Array.from(missionManager.quests.values()).some((q) => q.status === 'completed');
    if (!active && hasAnyCompleted && npc.dialogueIdRepeat) return npc.dialogueIdRepeat;

    return npc.dialogueId;
}

export function DialogueBox() {
    const [session, setSession] = React.useState<DialogueSession | null>(null);
    const [definition, setDefinition] = React.useState<DialogueDefinition | null>(null);
    const [isBusy, setIsBusy] = React.useState(false);

    const closeDialogue = React.useCallback(() => {
        if (!session) return;
        eventBus.emit(EVENTS.NPC_INTERACTION, { npcId: session.npcId, npc: { npcId: session.npcId }, actorId: session.actorId });
        eventBus.emit(EVENTS.DIALOGUE_END, { npcId: session.npcId, actorId: session.actorId });
        eventBus.emit(EVENTS.DIALOGUE_UI_CLOSED, { npcId: session.npcId });
        setSession(null);
        setDefinition(null);
        setIsBusy(false);
    }, [session]);

    React.useEffect(() => {
        const onOpen = (payload: unknown) => {
            if (!payload || typeof payload !== 'object') return;
            const data = payload as Partial<DialogueOpenPayload>;
            const npcId = typeof data.npcId === 'string' ? data.npcId : null;
            const actorId = typeof data.actorId === 'string' ? data.actorId : null;
            if (!npcId || !actorId) return;

            void missionManager.initialize({ mainCharacter: actorId }).catch(() => {
                // Ignore init failures (storage).
            });

            const npc = getNpc(npcId);
            const npcName = npc?.displayName ?? npcId;
            const dialogueId = pickDialogueId({ npcId, actorId, dialogueId: data.dialogueId });
            if (!dialogueId) return;

            const def = getDialogue(dialogueId);
            if (!def) return;

            setDefinition(def);
            setSession({
                dialogueId,
                npcId,
                npcName,
                actorId,
                nodeId: def.startNodeId
            });
            setIsBusy(false);
            eventBus.emit(EVENTS.DIALOGUE_UI_OPENED, { npcId });
        };

        eventBus.on(EVENTS.DIALOGUE_OPEN, onOpen);
        return () => {
            eventBus.off(EVENTS.DIALOGUE_OPEN, onOpen);
        };
    }, []);

    React.useEffect(() => {
        if (!session) return;
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                closeDialogue();
            }
        };
        window.addEventListener('keydown', onKeyDown);
        return () => {
            window.removeEventListener('keydown', onKeyDown);
        };
    }, [closeDialogue, session]);

    const node = React.useMemo(() => {
        if (!session || !definition) return null;
        return findDialogueNode(definition, session.nodeId);
    }, [definition, session]);

    const runActions = React.useCallback(
        async (actions: DialogueAction[] | undefined): Promise<'closed' | 'continue'> => {
            if (!actions || actions.length === 0) return 'continue';
            if (!session) return 'continue';
            if (isBusy) return 'continue';
            setIsBusy(true);

            try {
                for (const action of actions) {
                    if (action.type === 'quest_start') {
                        await startQuestFromTemplate(action.questTemplateId, { actorId: session.actorId, type: 'main' });
                        continue;
                    }
                    if (action.type === 'emit_event') {
                        eventBus.emit(action.event, action.payload ?? {});
                        continue;
                    }
                    if (action.type === 'close_dialogue') {
                        closeDialogue();
                        return 'closed';
                    }
                }
                return 'continue';
            } finally {
                setIsBusy(false);
            }
        },
        [closeDialogue, isBusy, session]
    );

    const runChoice = React.useCallback(
        async (choice: { nextNodeId?: string | null; actions?: DialogueAction[] }) => {
            const result = await runActions(choice.actions);
            if (result === 'closed') return;
            if (!session || !definition) return;

            if (choice.nextNodeId) {
                const next = findDialogueNode(definition, choice.nextNodeId);
                if (next) {
                    setSession({ ...session, nodeId: choice.nextNodeId });
                }
            }
        },
        [definition, runActions, session]
    );

    if (!session || !definition || !node) return null;

    return (
        <div className="dialogue-overlay" role="dialog" aria-modal="true">
            <div className="dialogue-box dialogue-box--exploration" onClick={(e) => e.stopPropagation()}>
                <div className="dialogue-box__header">
                    <div className="dialogue-box__name">{node.speakerName || session.npcName}</div>
                    <button className="btn btn-secondary btn-sm" type="button" onClick={closeDialogue} disabled={isBusy}>
                        Close (Esc)
                    </button>
                </div>

                <div className="text-area">
                    {node.lines.map((line, idx) => (
                        <p key={`${session.nodeId}-${idx}`} className="dialogue-line">
                            {getLineText(line)}
                        </p>
                    ))}
                </div>

                {node.choices && node.choices.length > 0 ? (
                    <div className="dialogue-choice-grid">
                        {node.choices.map((choice) => (
                            <button
                                key={choice.choiceId}
                                className="btn btn-primary"
                                type="button"
                                disabled={isBusy}
                                onClick={() => void runChoice(choice)}
                            >
                                {choice.text}
                            </button>
                        ))}
                    </div>
                ) : (
                    <div className="dialogue-actions">
                        <button className="btn btn-primary" type="button" onClick={closeDialogue} disabled={isBusy}>
                            Continue
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
