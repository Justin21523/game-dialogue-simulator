import React from 'react';

import { hudEventTarget } from '../shared/hudEvents';
import type { HudState } from '../shared/types/Scene';

const DEFAULT_HUD_STATE: HudState = {
    score: 0,
    distance: 0,
    speed: 0,
    missionType: 'Delivery',
    status: 'ready'
};

export function useHudState(active = true): HudState {
    const [hudState, setHudState] = React.useState<HudState>(DEFAULT_HUD_STATE);

    React.useEffect(() => {
        if (!active) {
            setHudState(DEFAULT_HUD_STATE);
        }
    }, [active]);

    React.useEffect(() => {
        const onHudUpdate = (event: Event) => {
            const customEvent = event as CustomEvent<HudState>;
            setHudState(customEvent.detail);
        };

        hudEventTarget.addEventListener('hud:update', onHudUpdate);
        return () => {
            hudEventTarget.removeEventListener('hud:update', onHudUpdate);
        };
    }, []);

    return hudState;
}
