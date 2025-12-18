/**
 * Building System for Exploration Mode
 * 建築物系統 - 支援可進入的建築物
 *
 * Features:
 * - 渲染建築物
 * - 進入/離開建築物
 * - 建築物內部場景
 */

import { eventBus } from '../../core/event-bus.js';

/**
 * 建築物類型
 */
export const BuildingType = {
    HOUSE: 'house',           // 住宅
    SHOP: 'shop',             // 商店
    CAFE: 'cafe',             // 咖啡廳
    LIBRARY: 'library',       // 圖書館
    TOWN_HALL: 'town_hall',   // 市政廳
    HOSPITAL: 'hospital',     // 醫院
    SCHOOL: 'school',         // 學校
    WAREHOUSE: 'warehouse',   // 倉庫
    CUSTOM: 'custom'          // 自定義
};

/**
 * 建築物類別
 */
export class Building {
    constructor(data) {
        this.id = data.id || `building_${Date.now()}`;
        this.type = data.type || BuildingType.HOUSE;
        this.name = data.name || 'Unknown Building';

        // 位置和尺寸
        this.x = data.x || 0;
        this.y = data.y || 0;
        this.width = data.width || 200;
        this.height = data.height || 250;

        // 外觀
        this.color = data.color || '#8B7355';
        this.roofColor = data.roofColor || '#DC143C';
        this.doorColor = data.doorColor || '#654321';
        this.windowColor = data.windowColor || '#87CEEB';

        // 互動屬性
        this.canEnter = data.canEnter !== false;  // 預設可進入
        this.doorX = this.x + this.width / 2 - 20;  // 門的 X 座標
        this.doorY = this.y + this.height - 50;    // 門的 Y 座標
        this.doorWidth = 40;
        this.doorHeight = 50;

        // 室內場景數據
        this.interiorData = data.interiorData || null;

        // AI 生成的數據
        this.aiGenerated = data.aiGenerated || false;
        this.description = data.description || '';

        console.log(`[Building] Created: ${this.name} at (${this.x}, ${this.y})`);
    }

    /**
     * 檢查玩家是否靠近門口
     */
    isPlayerNearDoor(playerX, playerY, range = 80) {
        const doorCenterX = this.doorX + this.doorWidth / 2;
        const doorCenterY = this.doorY + this.doorHeight / 2;

        const dx = playerX - doorCenterX;
        const dy = playerY - doorCenterY;
        const distance = Math.sqrt(dx * dx + dy * dy);

        return distance < range;
    }

    /**
     * 繪製建築物
     */
    draw(ctx, camera) {
        const screenX = this.x - camera.x;
        const screenY = this.y - camera.y;

        // 繪製建築物主體
        ctx.fillStyle = this.color;
        ctx.fillRect(screenX, screenY, this.width, this.height);

        // 繪製屋頂（三角形）
        ctx.fillStyle = this.roofColor;
        ctx.beginPath();
        ctx.moveTo(screenX - 10, screenY);  // 左下
        ctx.lineTo(screenX + this.width / 2, screenY - 40);  // 頂點
        ctx.lineTo(screenX + this.width + 10, screenY);  // 右下
        ctx.closePath();
        ctx.fill();

        // 繪製窗戶
        const windowW = 30;
        const windowH = 35;
        const windowY = screenY + 40;

        ctx.fillStyle = this.windowColor;

        // 左窗
        ctx.fillRect(screenX + 30, windowY, windowW, windowH);
        ctx.strokeStyle = '#333';
        ctx.lineWidth = 2;
        ctx.strokeRect(screenX + 30, windowY, windowW, windowH);

        // 右窗
        ctx.fillRect(screenX + this.width - 60, windowY, windowW, windowH);
        ctx.strokeRect(screenX + this.width - 60, windowY, windowW, windowH);

        // 繪製門
        const doorScreenX = this.doorX - camera.x;
        const doorScreenY = this.doorY - camera.y;

        ctx.fillStyle = this.doorColor;
        ctx.fillRect(doorScreenX, doorScreenY, this.doorWidth, this.doorHeight);
        ctx.strokeStyle = '#333';
        ctx.lineWidth = 2;
        ctx.strokeRect(doorScreenX, doorScreenY, this.doorWidth, this.doorHeight);

        // 繪製門把
        ctx.fillStyle = '#FFD700';
        ctx.beginPath();
        ctx.arc(doorScreenX + 10, doorScreenY + this.doorHeight / 2, 4, 0, Math.PI * 2);
        ctx.fill();

        // 繪製建築物名稱（如果靠近）
        if (this.showLabel) {
            ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
            ctx.fillRect(screenX + this.width / 2 - 60, screenY - 30, 120, 25);

            ctx.fillStyle = '#FFF';
            ctx.font = '14px Arial';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(this.name, screenX + this.width / 2, screenY - 17);
        }
    }

    /**
     * 設置是否顯示標籤
     */
    setShowLabel(show) {
        this.showLabel = show;
    }
}

/**
 * 建築物管理器
 */
export class BuildingManager {
    constructor(world) {
        this.world = world;
        this.buildings = [];
        this.nearbyBuilding = null;
        this.interactRange = 80;

        console.log('[BuildingManager] Initialized');
    }

    /**
     * 添加建築物
     */
    addBuilding(buildingData) {
        const building = new Building(buildingData);
        this.buildings.push(building);
        console.log(`[BuildingManager] Added building: ${building.name}`);
        return building;
    }

    /**
     * 生成預設建築物（測試用）
     */
    generateDefaultBuildings(groundY) {
        const defaultBuildings = [
            {
                id: 'house_1',
                type: BuildingType.HOUSE,
                name: 'Red House',
                x: 800,
                y: groundY - 250,
                color: '#D2691E',
                roofColor: '#DC143C'
            },
            {
                id: 'shop_1',
                type: BuildingType.SHOP,
                name: 'General Store',
                x: 1400,
                y: groundY - 250,
                color: '#8FBC8F',
                roofColor: '#228B22',
                interiorData: {
                    npcs: ['shopkeeper_1'],
                    items: ['item_1', 'item_2']
                }
            },
            {
                id: 'cafe_1',
                type: BuildingType.CAFE,
                name: 'Cozy Cafe',
                x: 2000,
                y: groundY - 250,
                color: '#F5DEB3',
                roofColor: '#8B4513'
            },
            {
                id: 'library_1',
                type: BuildingType.LIBRARY,
                name: 'Town Library',
                x: 2600,
                y: groundY - 280,
                width: 250,
                height: 280,
                color: '#A0522D',
                roofColor: '#800000'
            }
        ];

        defaultBuildings.forEach(data => this.addBuilding(data));

        console.log(`[BuildingManager] Generated ${this.buildings.length} default buildings`);
    }

    /**
     * 檢查玩家附近的建築物
     */
    checkNearbyBuilding(playerX, playerY) {
        let closest = null;
        let minDistance = Infinity;

        this.buildings.forEach(building => {
            if (!building.canEnter) {
                building.setShowLabel(false);
                return;
            }

            const isNear = building.isPlayerNearDoor(playerX, playerY, this.interactRange);

            if (isNear) {
                const dx = playerX - (building.doorX + building.doorWidth / 2);
                const dy = playerY - (building.doorY + building.doorHeight / 2);
                const distance = Math.sqrt(dx * dx + dy * dy);

                if (distance < minDistance) {
                    minDistance = distance;
                    closest = building;
                }
            }

            building.setShowLabel(isNear);
        });

        const previousNearby = this.nearbyBuilding;
        this.nearbyBuilding = closest;

        // 發送事件
        if (closest && closest !== previousNearby) {
            eventBus.emit('BUILDING_NEARBY', { building: closest });
        } else if (!closest && previousNearby) {
            eventBus.emit('BUILDING_LEFT', { building: previousNearby });
        }

        return closest;
    }

    /**
     * 進入建築物
     */
    enterBuilding(building) {
        console.log(`[BuildingManager] Entering building: ${building.name}`);

        eventBus.emit('BUILDING_ENTER', {
            building: building,
            interiorData: building.interiorData
        });

        return true;
    }

    /**
     * 更新（每幀調用）
     */
    update(dt) {
        // 建築物動畫（如果需要）
    }

    /**
     * 渲染所有建築物
     */
    render(ctx, camera) {
        this.buildings.forEach(building => {
            building.draw(ctx, camera);
        });
    }

    /**
     * 清除所有建築物
     */
    clear() {
        this.buildings = [];
        this.nearbyBuilding = null;
        console.log('[BuildingManager] Cleared all buildings');
    }

    /**
     * 獲取建築物數量
     */
    getBuildingCount() {
        return this.buildings.length;
    }
}
