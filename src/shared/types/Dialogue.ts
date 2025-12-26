export type DialogueAction =
    | { type: 'quest_start'; questTemplateId: string }
    | { type: 'emit_event'; event: string; payload?: Record<string, unknown> }
    | { type: 'close_dialogue' };

export type DialogueChoice = {
    choiceId: string;
    text: string;
    nextNodeId?: string | null;
    actions?: DialogueAction[];
};

export type DialogueNode = {
    nodeId: string;
    speakerName: string;
    lines: string[];
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

