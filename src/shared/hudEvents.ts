import type { HudState } from './types/Scene';

export const hudEventTarget = new EventTarget();

export function emitHudUpdate(state: HudState): void {
    hudEventTarget.dispatchEvent(new CustomEvent('hud:update', { detail: state }));
}

