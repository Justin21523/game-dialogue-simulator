import React from 'react';
import ReactDOM from 'react-dom/client';

import '../css/animations.css';
import '../css/components.css';
import '../css/main.css';
import '../css/components/event-notification.css';

import '../css/screens/main-menu.css';
import '../css/screens/hangar.css';
import '../css/screens/mission-board.css';
import '../css/screens/launch.css';
import '../css/screens/in-flight.css';
import '../css/screens/transformation.css';
import '../css/screens/dialogue.css';
import '../css/screens/task.css';
import '../css/screens/exploration.css';
import '../css/screens/exploration-hud.css';
import '../css/screens/exploration-mvp.css';
import '../css/screens/results.css';
import '../css/screens/statistics.css';
import '../css/screens/achievements.css';
import '../css/screens/save-load.css';
import '../css/screens/return-base.css';
import '../css/screens/landing.css';

import { GameRoot } from './ui/GameRoot';

const rootElement = document.getElementById('root');
if (!rootElement) {
    throw new Error('Missing #root element');
}

ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
        <GameRoot />
    </React.StrictMode>
);
