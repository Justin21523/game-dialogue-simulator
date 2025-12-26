import Phaser from 'phaser';

import { GAME_HEIGHT, GAME_WIDTH } from '../../../shared/constants';

export class UIScene extends Phaser.Scene {
    private hintText?: Phaser.GameObjects.Text;

    constructor() {
        super({ key: 'UIScene' });
    }

    create() {
        this.hintText = this.add
            .text(16, GAME_HEIGHT - 44, '', {
                fontFamily: 'Segoe UI, system-ui, sans-serif',
                fontSize: '18px',
                color: '#ffffff',
                stroke: '#000000',
                strokeThickness: 4
            })
            .setScrollFactor(0);

        this.add
            .text(GAME_WIDTH - 16, GAME_HEIGHT - 44, 'Phaser 3 (React-mounted)', {
                fontFamily: 'Segoe UI, system-ui, sans-serif',
                fontSize: '18px',
                color: '#ffffff',
                stroke: '#000000',
                strokeThickness: 4
            })
            .setOrigin(1, 0)
            .setScrollFactor(0);
    }

    update() {
        if (!this.hintText) return;
        const inFlight = this.scene.isActive('FlightScene');
        const inLaunch = this.scene.isActive('LaunchScene');
        const inExplore =
            this.scene.isActive('BaseLocationScene') || this.scene.isActive('WarehouseLocationScene') || this.scene.isActive('ExplorationScene');

        if (inLaunch) {
            this.hintText.setText('Launch: Hold Space  |  Release to cool down');
            this.hintText.setVisible(true);
            return;
        }

        if (inFlight) {
            this.hintText.setText('Move: WASD / Arrows  |  Boost: Shift / Space');
            this.hintText.setVisible(true);
            return;
        }

        if (inExplore) {
            this.hintText.setText('Explore: Move WASD  |  Interact E  |  Call Companion C');
            this.hintText.setVisible(true);
            return;
        }

        this.hintText.setVisible(false);
    }
}
