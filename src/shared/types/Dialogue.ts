export type DialogueCondition = {
    flags_all?: string[];
    flags_any?: string[];
    flags_none?: string[];
    has_items?: string[];
    missing_items?: string[];
    quest_active?: string;
    quest_completed?: string;
};

export type DialogueAction =
    | { type: 'quest_start'; questTemplateId: string }
    | { type: 'emit_event'; event: string; payload?: Record<string, unknown> }
    | { type: 'set_flag'; flag: string }
    | { type: 'give_item'; itemId: string; quantity?: number }
    | { type: 'take_item'; itemId: string; quantity?: number }
    | { type: 'unlock_companion'; companionId: string }
    | { type: 'unlock_skill'; skillId: string }
    | { type: 'close_dialogue' };

export type DialogueChoice = {
    choiceId: string;
    text: string;
    nextNodeId?: string | null;
    actions?: DialogueAction[];
    if?: DialogueCondition;
    disabledText?: string;
    hideIfUnavailable?: boolean;
};

export type DialogueLine = string | { text: string; if?: DialogueCondition };

export type DialogueNode = {
    nodeId: string;
    speakerName: string;
    lines: DialogueLine[];
    choices?: DialogueChoice[];
};

export type DialogueDefinition = {
    dialogueId: string;
    npcId: string;
    startNodeId: string;
    nodes: DialogueNode[];
};

export type DialogueSession = {
    dialogueId: string;
    npcId: string;
    npcName: string;
    actorId: string;
    nodeId: string;
};
