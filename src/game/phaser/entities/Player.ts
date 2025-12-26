import Phaser from 'phaser';

import { GAME_HEIGHT, GAME_WIDTH } from '../../../shared/constants';

export type Axis = {
    x: -1 | 0 | 1;
    y: -1 | 0 | 1;
};

export class Player {
    public readonly sprite: Phaser.Physics.Arcade.Sprite;

    constructor(scene: Phaser.Scene, x: number, y: number) {
        this.sprite = scene.physics.add.sprite(x, y, 'player');
        this.sprite.setDepth(30);
        this.sprite.setCollideWorldBounds(true);
        this.sprite.setOrigin(0.5, 0.5);
        const body = this.sprite.body as Phaser.Physics.Arcade.Body;
        const targetWidth = Math.max(1, this.sprite.displayWidth - 40);
        const targetHeight = Math.max(1, this.sprite.displayHeight - 40);
        body.setSize(targetWidth, targetHeight, true);
    }

    update(axis: Axis, dt: number) {
        const moveSpeed = 400;

        const nextX = Phaser.Math.Clamp(
            this.sprite.x + axis.x * moveSpeed * dt,
            this.sprite.displayWidth / 2,
            GAME_WIDTH - this.sprite.displayWidth / 2
        );
        const nextY = Phaser.Math.Clamp(
            this.sprite.y + axis.y * moveSpeed * dt,
            this.sprite.displayHeight / 2,
            GAME_HEIGHT - this.sprite.displayHeight / 2
        );

        this.sprite.setPosition(nextX, nextY);
        this.sprite.rotation = axis.y * 0.1;
    }
}
