export type GameCommand = {
    type: 'flight:restart';
};

export const gameCommandTarget = new EventTarget();

export function emitGameCommand(command: GameCommand): void {
    gameCommandTarget.dispatchEvent(new CustomEvent('game:command', { detail: command }));
}

