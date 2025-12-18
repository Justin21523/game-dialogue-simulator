/**
 * Interior System for Exploration Mode
 * 室內場景系統 - 支援進入建築物的室內場景
 *
 * Features:
 * - 渲染室內背景
 * - 室內 NPCs 管理
 * - 室內物品管理
 * - 場景切換（戶外 ↔ 室內）
 */

import { eventBus } from '../../core/event-bus.js';

/**
 * 室內場景類別
 */
export class InteriorScene {
    constructor(buildingData) {
        this.buildingId = buildingData.id;
        this.buildingName = buildingData.name;
        this.buildingType = buildingData.type;

        // 室內尺寸（固定大小，模擬房間）
        this.width = 1200;
        this.height = 600;

        // 室內背景色（根據建築類型）
        this.backgroundColor = this.getBackgroundColor(buildingData.type);
        this.floorColor = this.getFloorColor(buildingData.type);
        this.wallColor = this.getWallColor(buildingData.type);

        // 出口門位置（左側）
        this.exitDoor = {
            x: 50,
            y: this.height - 100,
            width: 60,
            height: 80
        };

        // 室內 NPCs（如果有）
        this.npcs = buildingData.interiorData?.npcs || [];

        // 室內物品（如果有）
        this.items = buildingData.interiorData?.items || [];

        // 室內傢俱（裝飾性）
        this.furniture = this.generateFurniture(buildingData.type);

        console.log(`[InteriorScene] Created interior for ${this.buildingName}`);
    }

    /**
     * 根據建築類型獲取背景色
     */
    getBackgroundColor(type) {
        const colors = {
            'house': '#F5E6D3',      // 溫暖米色
            'shop': '#E8F4F8',       // 淡藍色
            'cafe': '#FFF8DC',       // 淡黃色
            'library': '#F0E6DC',    // 書卷色
            'town_hall': '#E6E6FA',  // 淡紫色
            'hospital': '#F0FFF0',   // 淡綠色
            'school': '#FFF5E1',     // 淡橙色
            'warehouse': '#D3D3D3'   // 灰色
        };
        return colors[type] || '#F5F5DC';
    }

    /**
     * 根據建築類型獲取地板色
     */
    getFloorColor(type) {
        const colors = {
            'house': '#D2691E',
            'shop': '#8B7355',
            'cafe': '#CD853F',
            'library': '#8B4513',
            'town_hall': '#A0522D',
            'hospital': '#C0C0C0',
            'school': '#DEB887',
            'warehouse': '#696969'
        };
        return colors[type] || '#8B7355';
    }

    /**
     * 根據建築類型獲取牆壁色
     */
    getWallColor(type) {
        const colors = {
            'house': '#DEB887',
            'shop': '#B0C4DE',
            'cafe': '#FFE4B5',
            'library': '#D2B48C',
            'town_hall': '#D8BFD8',
            'hospital': '#E0F0E0',
            'school': '#FFDAB9',
            'warehouse': '#A9A9A9'
        };
        return colors[type] || '#D2B48C';
    }

    /**
     * 生成傢俱（裝飾性）
     */
    generateFurniture(type) {
        const furniture = [];

        switch (type) {
            case 'house':
                // 沙發
                furniture.push({
                    type: 'sofa',
                    x: 400,
                    y: 300,
                    width: 150,
                    height: 80,
                    color: '#8B4513'
                });
                // 桌子
                furniture.push({
                    type: 'table',
                    x: 700,
                    y: 350,
                    width: 120,
                    height: 80,
                    color: '#A0522D'
                });
                break;

            case 'shop':
                // 櫃台
                furniture.push({
                    type: 'counter',
                    x: 800,
                    y: 400,
                    width: 200,
                    height: 100,
                    color: '#8B7355'
                });
                // 貨架
                furniture.push({
                    type: 'shelf',
                    x: 300,
                    y: 200,
                    width: 100,
                    height: 200,
                    color: '#A0522D'
                });
                break;

            case 'cafe':
                // 吧台
                furniture.push({
                    type: 'bar',
                    x: 900,
                    y: 380,
                    width: 180,
                    height: 120,
                    color: '#8B4513'
                });
                // 桌子
                furniture.push({
                    type: 'table',
                    x: 400,
                    y: 350,
                    width: 100,
                    height: 100,
                    color: '#D2691E'
                });
                break;

            case 'library':
                // 書架
                furniture.push({
                    type: 'bookshelf',
                    x: 300,
                    y: 150,
                    width: 120,
                    height: 250,
                    color: '#8B4513'
                });
                furniture.push({
                    type: 'bookshelf',
                    x: 600,
                    y: 150,
                    width: 120,
                    height: 250,
                    color: '#8B4513'
                });
                // 閱讀桌
                furniture.push({
                    type: 'desk',
                    x: 850,
                    y: 350,
                    width: 140,
                    height: 90,
                    color: '#A0522D'
                });
                break;

            default:
                // 預設：簡單桌椅
                furniture.push({
                    type: 'table',
                    x: 600,
                    y: 350,
                    width: 120,
                    height: 80,
                    color: '#A0522D'
                });
                break;
        }

        return furniture;
    }

    /**
     * 繪製室內場景
     */
    draw(ctx, camera) {
        // 繪製背景
        ctx.fillStyle = this.backgroundColor;
        ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);

        // 繪製地板
        ctx.fillStyle = this.floorColor;
        ctx.fillRect(0, this.height - 100, this.width, 100);

        // 繪製牆壁線條（裝飾）
        ctx.strokeStyle = this.wallColor;
        ctx.lineWidth = 4;
        ctx.strokeRect(20, 20, this.width - 40, this.height - 120);

        // 繪製天花板細節
        ctx.fillStyle = 'rgba(0, 0, 0, 0.05)';
        ctx.fillRect(0, 0, this.width, 30);

        // 繪製傢俱
        this.drawFurniture(ctx);

        // 繪製出口門
        this.drawExitDoor(ctx);

        // 繪製室內標題
        this.drawTitle(ctx);
    }

    /**
     * 繪製傢俱
     */
    drawFurniture(ctx) {
        this.furniture.forEach(item => {
            ctx.fillStyle = item.color;
            ctx.fillRect(item.x, item.y, item.width, item.height);

            // 添加陰影效果
            ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
            ctx.fillRect(item.x + 5, item.y + item.height, item.width, 10);

            // 根據類型添加細節
            if (item.type === 'bookshelf') {
                // 繪製書架層板
                ctx.strokeStyle = '#654321';
                ctx.lineWidth = 2;
                for (let i = 1; i <= 4; i++) {
                    const y = item.y + (item.height / 5) * i;
                    ctx.beginPath();
                    ctx.moveTo(item.x, y);
                    ctx.lineTo(item.x + item.width, y);
                    ctx.stroke();
                }
            } else if (item.type === 'counter' || item.type === 'bar') {
                // 繪製櫃台/吧台頂部
                ctx.fillStyle = '#CD853F';
                ctx.fillRect(item.x, item.y - 10, item.width, 10);
            }
        });
    }

    /**
     * 繪製出口門
     */
    drawExitDoor(ctx) {
        const door = this.exitDoor;

        // 門框
        ctx.fillStyle = '#654321';
        ctx.fillRect(door.x - 5, door.y - 5, door.width + 10, door.height + 10);

        // 門
        ctx.fillStyle = '#8B4513';
        ctx.fillRect(door.x, door.y, door.width, door.height);

        // 門把
        ctx.fillStyle = '#FFD700';
        ctx.beginPath();
        ctx.arc(door.x + door.width - 15, door.y + door.height / 2, 5, 0, Math.PI * 2);
        ctx.fill();

        // 出口標示
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.fillRect(door.x - 20, door.y - 35, 100, 25);

        ctx.fillStyle = '#00FF00';
        ctx.font = 'bold 14px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('EXIT', door.x + 30, door.y - 17);
    }

    /**
     * 繪製室內標題
     */
    drawTitle(ctx) {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
        ctx.fillRect(ctx.canvas.width / 2 - 150, 40, 300, 40);

        ctx.fillStyle = '#FFF';
        ctx.font = 'bold 20px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(this.buildingName, ctx.canvas.width / 2, 60);
    }

    /**
     * 檢查玩家是否靠近出口門
     */
    isPlayerNearExit(playerX, playerY, range = 80) {
        const doorCenterX = this.exitDoor.x + this.exitDoor.width / 2;
        const doorCenterY = this.exitDoor.y + this.exitDoor.height / 2;

        const dx = playerX - doorCenterX;
        const dy = playerY - doorCenterY;
        const distance = Math.sqrt(dx * dx + dy * dy);

        return distance < range;
    }

    /**
     * 獲取玩家初始位置（進入室內時）
     */
    getPlayerSpawnPosition() {
        return {
            x: this.width / 2,
            y: this.height - 150
        };
    }
}

/**
 * 室內系統管理器
 */
export class InteriorManager {
    constructor(explorationScreen) {
        this.explorationScreen = explorationScreen;
        this.currentInterior = null;
        this.isInInterior = false;

        console.log('[InteriorManager] Initialized');
    }

    /**
     * 進入建築物室內
     */
    async enterBuilding(building) {
        console.log(`[InteriorManager] Entering building: ${building.name}`);

        // 保存戶外狀態
        this.saveOutdoorState();

        // 創建室內場景
        this.currentInterior = new InteriorScene(building);
        this.isInInterior = true;

        // 設置玩家位置到室內入口
        const spawnPos = this.currentInterior.getPlayerSpawnPosition();
        const player = this.explorationScreen.getCurrentControlledCharacter();
        if (player) {
            player.x = spawnPos.x;
            player.y = spawnPos.y;
        }

        // 發送進入事件
        eventBus.emit('INTERIOR_ENTERED', {
            building: building,
            interior: this.currentInterior
        });

        console.log('[InteriorManager] Interior scene created');
    }

    /**
     * 離開建築物（返回戶外）
     */
    exitBuilding() {
        console.log('[InteriorManager] Exiting building');

        if (!this.isInInterior) {
            console.warn('[InteriorManager] Not in interior!');
            return;
        }

        // 恢復戶外狀態
        this.restoreOutdoorState();

        // 清除室內場景
        this.currentInterior = null;
        this.isInInterior = false;

        // 發送離開事件
        eventBus.emit('INTERIOR_EXITED', {});

        console.log('[InteriorManager] Returned to outdoor');
    }

    /**
     * 保存戶外狀態
     */
    saveOutdoorState() {
        const player = this.explorationScreen.getCurrentControlledCharacter();

        this.outdoorState = {
            playerPosition: {
                x: player?.x,
                y: player?.y
            },
            cameraPosition: {
                x: this.explorationScreen.camera?.x,
                y: this.explorationScreen.camera?.y
            }
        };

        console.log('[InteriorManager] Outdoor state saved:', this.outdoorState);
    }

    /**
     * 恢復戶外狀態
     */
    restoreOutdoorState() {
        if (!this.outdoorState) {
            console.warn('[InteriorManager] No outdoor state to restore!');
            return;
        }

        const player = this.explorationScreen.getCurrentControlledCharacter();
        if (player && this.outdoorState.playerPosition) {
            player.x = this.outdoorState.playerPosition.x;
            player.y = this.outdoorState.playerPosition.y;
        }

        if (this.explorationScreen.camera && this.outdoorState.cameraPosition) {
            this.explorationScreen.camera.x = this.outdoorState.cameraPosition.x;
            this.explorationScreen.camera.y = this.outdoorState.cameraPosition.y;
        }

        console.log('[InteriorManager] Outdoor state restored');
    }

    /**
     * 更新（每幀調用）
     */
    update(dt) {
        if (!this.isInInterior || !this.currentInterior) return;

        // 檢查玩家是否靠近出口
        const player = this.explorationScreen.getCurrentControlledCharacter();
        if (player) {
            const playerCenterX = player.x + player.width / 2;
            const playerCenterY = player.y + player.height / 2;

            const nearExit = this.currentInterior.isPlayerNearExit(playerCenterX, playerCenterY);

            // 更新互動提示
            this.updateExitPrompt(nearExit);
        }
    }

    /**
     * 渲染室內場景
     */
    render(ctx, camera) {
        if (!this.isInInterior || !this.currentInterior) return;

        this.currentInterior.draw(ctx, camera);
    }

    /**
     * 更新出口提示
     */
    updateExitPrompt(nearExit) {
        const promptElement = document.getElementById('interaction-prompt');
        const npcNameElement = document.getElementById('npc-name');

        if (promptElement && npcNameElement) {
            if (nearExit) {
                npcNameElement.textContent = 'Exit Building';
                promptElement.style.display = 'flex';
            } else {
                promptElement.style.display = 'none';
            }
        }
    }

    /**
     * 處理 E 鍵互動
     */
    handleInteraction() {
        if (!this.isInInterior || !this.currentInterior) return false;

        const player = this.explorationScreen.getCurrentControlledCharacter();
        if (!player) return false;

        const playerCenterX = player.x + player.width / 2;
        const playerCenterY = player.y + player.height / 2;

        // 檢查是否靠近出口
        if (this.currentInterior.isPlayerNearExit(playerCenterX, playerCenterY)) {
            this.exitBuilding();
            return true;
        }

        return false;
    }

    /**
     * 清除
     */
    cleanup() {
        this.currentInterior = null;
        this.isInInterior = false;
        this.outdoorState = null;
    }
}
