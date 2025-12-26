import Phaser from 'phaser';

import type { Axis } from '../entities/Player';

export class InputSystem {
    private readonly cursors: Phaser.Types.Input.Keyboard.CursorKeys;
    private readonly keys: {
        w: Phaser.Input.Keyboard.Key;
        a: Phaser.Input.Keyboard.Key;
        s: Phaser.Input.Keyboard.Key;
        d: Phaser.Input.Keyboard.Key;
        shift: Phaser.Input.Keyboard.Key;
        space: Phaser.Input.Keyboard.Key;
    };

    constructor(scene: Phaser.Scene) {
        if (!scene.input.keyboard) {
            throw new Error('Keyboard input is not available (missing Phaser KeyboardPlugin)');
        }

        this.cursors = scene.input.keyboard.createCursorKeys();
        this.keys = {
            w: scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.W),
            a: scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A),
            s: scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.S),
            d: scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D),
            shift: scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SHIFT),
            space: scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE)
        };
    }

    get axis(): Axis {
        const left = this.cursors.left?.isDown || this.keys.a.isDown;
        const right = this.cursors.right?.isDown || this.keys.d.isDown;
        const up = this.cursors.up?.isDown || this.keys.w.isDown;
        const down = this.cursors.down?.isDown || this.keys.s.isDown;

        const x: Axis['x'] = right ? 1 : left ? -1 : 0;
        const y: Axis['y'] = down ? 1 : up ? -1 : 0;
        return { x, y };
    }

    get isBoosting(): boolean {
        return this.keys.shift.isDown || this.keys.space.isDown;
    }
}

