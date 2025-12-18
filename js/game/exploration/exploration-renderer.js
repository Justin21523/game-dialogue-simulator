/**
 * ExplorationRenderer - 探索模式分層渲染器
 * 處理背景、實體、HUD 的分層繪製
 */

import { CONFIG } from '../../config.js';

export class ExplorationRenderer {
    constructor(ctx, width, height) {
        this.ctx = ctx;
        this.width = width;
        this.height = height;

        // 渲染設定
        this.debug = true;           // 開啟除錯模式以便觀察實體
        this.showHitboxes = true;    // 顯示碰撞框
        this.showGrid = false;
        this.debugLogModulo = 30;    // 每 30 幀打印一次詳細除錯

        // AI 選擇的背景圖片
        this.backgroundImage = null;
        this.backgroundLoaded = false;

        // 顏色主題
        this.theme = {
            interactHighlight: '#FFD700',
            interactRange: 'rgba(255, 215, 0, 0.2)',
            playerName: '#FFFFFF',
            npcName: '#87CEEB',
            itemGlow: '#00FF00',
            buildingGlow: '#FFA500',
            blockerGlow: '#FF6B6B'
        };

        // 字體設定
        this.fonts = {
            entityName: 'bold 12px Arial',
            hintText: 'bold 14px Arial',
            dialogueName: 'bold 16px Arial',
            dialogueText: '14px Arial',
            hudLarge: 'bold 18px Arial',
            hudSmall: '12px Arial'
        };

        // 圖片快取
        this.imageCache = new Map();
    }

    /**
     * 清除畫面
     */
    clear() {
        this.ctx.clearRect(0, 0, this.width, this.height);
    }

    /**
     * 高階渲染入口
     * @param {Object} world - 探索世界
     * @param {Camera} camera - 攝影機
     * @param {Object} options - 附加選項
     */
    render(world, camera, options = {}) {
        this.clear();

        // 背景（傳入 camera 以實現視差捲動）
        this.drawFallbackBackground(camera);

        // 地面
        const groundY = world?.groundY ?? this.height - 100;
        this.drawGround(groundY, camera);

        // 實體
        const entities = world?.getAllVisibleEntities ? world.getAllVisibleEntities() : [];

        // 🐛 Debug: Log entity counts every 60 frames (once per second)
        if (!this._frameCount) this._frameCount = 0;
        this._frameCount++;
        if (this._frameCount % this.debugLogModulo === 0) {
            const entityTypes = {};
            entities.forEach(e => {
                entityTypes[e.type] = (entityTypes[e.type] || 0) + 1;
            });
            console.log(`[Renderer] Frame ${this._frameCount}: Rendering ${entities.length} entities:`, entityTypes);
        }

        const activeTarget = options.interactionSystem?.getCurrentTarget?.() || null;
        this.drawEntities(entities, camera, activeTarget);

        // 互動提示/高亮
        if (options.interactionSystem) {
            options.interactionSystem.drawHighlights(this.ctx, camera);
            options.interactionSystem.drawInteractionHint(this.ctx, camera);
        }

        // 除錯格線
        if (this.debug && camera) {
            this.drawDebugGrid(camera);
        }
    }

    /**
     * 設置 AI 選擇的背景圖片
     * @param {string} imagePath - 背景圖片路徑
     */
    async setBackgroundImage(imagePath) {
        if (!imagePath) {
            this.backgroundImage = null;
            this.backgroundLoaded = false;
            return;
        }

        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => {
                this.backgroundImage = img;
                this.backgroundLoaded = true;
                console.log('[ExplorationRenderer] Background image loaded:', imagePath);
                resolve();
            };
            img.onerror = (e) => {
                console.warn('[ExplorationRenderer] Failed to load background:', imagePath, e);
                this.backgroundImage = null;
                this.backgroundLoaded = false;
                reject(e);
            };
            img.src = imagePath;
        });
    }

    /**
     * 繪製背景（優先使用 AI 圖片，否則用漸層）
     */
    drawFallbackBackground(camera) {
        // 如果有 AI 選擇的背景圖片，使用圖片並添加視差效果
        if (this.backgroundLoaded && this.backgroundImage) {
            if (camera) {
                // 背景慢速視差 (0.3x)
                const bgParallax = 0.3;
                const bgOffsetX = -camera.offsetX * bgParallax;
                const bgOffsetY = -camera.offsetY * bgParallax;

                // 繪製多次背景圖以填滿螢幕並產生捲動效果
                const imgWidth = this.width;
                const imgHeight = this.height;
                const startX = Math.floor(bgOffsetX / imgWidth) * imgWidth;

                for (let x = startX - imgWidth; x < this.width + imgWidth; x += imgWidth) {
                    this.ctx.drawImage(this.backgroundImage, x, bgOffsetY, imgWidth, imgHeight);
                }
            } else {
                // 沒有相機時填滿整個 canvas
                this.ctx.drawImage(this.backgroundImage, 0, 0, this.width, this.height);
            }
            return;
        }

        // 否則使用漸層 fallback 並添加視差捲動的雲朵和地面
        // ✅ 天空層 - 固定不動（最遠）
        const gradient = this.ctx.createLinearGradient(0, 0, 0, this.height);
        gradient.addColorStop(0, '#87CEEB');  // 天空藍
        gradient.addColorStop(0.6, '#E0F7FA');
        gradient.addColorStop(1, '#90EE90');  // 淺草地綠

        this.ctx.fillStyle = gradient;
        this.ctx.fillRect(0, 0, this.width, this.height);

        // ✅ 遠景雲層 - 慢速視差 (0.2x)
        if (camera) {
            const cloudParallax = 0.2;
            const cloudOffsetX = -camera.offsetX * cloudParallax;
            const cloudOffsetY = -camera.offsetY * cloudParallax;

            this.ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
            for (let i = 0; i < 5; i++) {
                const baseX = (i * 300);
                const baseY = 50 + (i * 80) % 200;
                const x = (baseX + cloudOffsetX) % (this.width + 400) - 200;
                const y = baseY + cloudOffsetY;

                // 畫雲朵
                this.ctx.beginPath();
                this.ctx.arc(x, y, 40, 0, Math.PI * 2);
                this.ctx.arc(x + 30, y, 35, 0, Math.PI * 2);
                this.ctx.arc(x + 15, y - 15, 30, 0, Math.PI * 2);
                this.ctx.fill();
            }

            // ✅ 中景地面 - 中速視差 (0.5x)
            const groundParallax = 0.5;
            const groundOffsetX = -camera.offsetX * groundParallax;

            this.ctx.fillStyle = '#228B22';  // 草地綠
            const groundY = this.height - 100;
            this.ctx.fillRect(groundOffsetX % this.width - this.width, groundY,
                             this.width * 3, 100);
        }
    }

    /**
     * 繪製地面線
     * @param {number} groundY - 地面 Y 座標
     * @param {Camera} camera - 攝影機
     */
    drawGround(groundY, camera) {
        const screenY = groundY - (camera ? camera.y : 0);

        this.ctx.fillStyle = '#228B22';
        this.ctx.fillRect(0, screenY, this.width, this.height - screenY);

        // 地面邊緣線
        this.ctx.strokeStyle = '#1B5E20';
        this.ctx.lineWidth = 3;
        this.ctx.beginPath();
        this.ctx.moveTo(0, screenY);
        this.ctx.lineTo(this.width, screenY);
        this.ctx.stroke();
    }

    /**
     * 繪製所有實體
     * @param {Array} entities - 實體列表
     * @param {Camera} camera - 攝影機
     * @param {Object} activeInteractable - 當前可互動對象
     */
    drawEntities(entities, camera, activeInteractable = null) {
        // 按 Y 座標排序 (深度排序)
        const sorted = [...entities].sort((a, b) => {
            // 先按類型優先級排序
            const priority = { building: 0, blocker: 1, item: 2, npc: 3, player: 4 };
            const pa = priority[a.type] ?? 3;
            const pb = priority[b.type] ?? 3;
            if (pa !== pb) return pa - pb;

            // 再按 Y 座標排序
            return (a.y + (a.height || 0)) - (b.y + (b.height || 0));
        });

        sorted.forEach(entity => {
            this.drawEntity(entity, camera, entity === activeInteractable);
        });

        // 在左上角顯示即時統計
        if (this.debug) {
            const counts = sorted.reduce((acc, e) => {
                acc[e.type] = (acc[e.type] || 0) + 1;
                return acc;
            }, {});
            this.ctx.save();
            this.ctx.fillStyle = 'rgba(0,0,0,0.4)';
            this.ctx.fillRect(8, 8, 220, 80);
            this.ctx.fillStyle = '#fff';
            this.ctx.font = '12px Arial';
            this.ctx.fillText(`Entities: ${sorted.length} (player ${counts.player || 0}, npc ${counts.npc || 0}, item ${counts.item || 0}, building ${counts.building || 0}, blocker ${counts.blocker || 0})`, 12, 26);
            this.ctx.restore();
        }
    }

    /**
     * 繪製單個實體
     * @param {Object} entity - 實體
     * @param {Camera} camera - 攝影機
     * @param {boolean} isHighlighted - 是否高亮
     */
    drawEntity(entity, camera, isHighlighted = false) {
        if (!entity.isVisible) return;

        // 計算螢幕座標（使用統一的 worldToScreen 方法）
        let screenX = entity.x;
        let screenY = entity.y;

        if (camera) {
            const screenPos = camera.worldToScreen(entity.x, entity.y);
            screenX = screenPos.x;
            screenY = screenPos.y;
        }

        // 防呆：如果座標或尺寸出現 NaN，強制設為可見區
        const safeWidth = entity.width || 64;
        const safeHeight = entity.height || 64;
        if (!Number.isFinite(screenX) || !Number.isFinite(screenY)) {
            console.warn('[Renderer] entity has invalid coords', {
                id: entity.id,
                type: entity.type,
                x: entity.x,
                y: entity.y,
                screenX,
                screenY
            });
            screenX = 0;
            screenY = this.height / 2;
        }

        // 可見性檢查（X 和 Y 軸）
        const cullMargin = 200;
        if (screenX + safeWidth < -cullMargin || screenX > this.width + cullMargin ||
            screenY + safeHeight < -cullMargin || screenY > this.height + cullMargin) {
            if (this.debug && this._frameCount % this.debugLogModulo === 0) {
                console.log('[Renderer] Cull entity', entity.id, 'type', entity.type,
                            'screen', {x: screenX, y: screenY},
                            'viewport', {w: this.width, h: this.height});
            }
            return;
        }

        this.ctx.save();

        // 高亮效果
        if (isHighlighted) {
            this.drawEntityHighlight(screenX, screenY, entity);
        }

        // 根據類型繪製
        switch (entity.type) {
            case 'player':
                this.drawPlayer(entity, screenX, screenY);
                break;
            case 'npc':
                this.drawNPC(entity, screenX, screenY);
                break;
            case 'item':
                this.drawItem(entity, screenX, screenY);
                break;
            case 'building':
                this.drawBuilding(entity, screenX, screenY);
                break;
            case 'blocker':
                this.drawBlocker(entity, screenX, screenY);
                break;
            default:
                this.drawGenericEntity(entity, screenX, screenY);
        }

        // 除錯模式顯示碰撞框
        if (this.showHitboxes) {
            this.drawHitbox(screenX, screenY, safeWidth, safeHeight);
        }

        // 額外除錯資訊
        if (this.debug && this._frameCount % this.debugLogModulo === 0) {
            this.ctx.fillStyle = 'rgba(0,0,0,0.5)';
            this.ctx.fillRect(screenX, screenY - 16, safeWidth, 16);
            this.ctx.fillStyle = '#FFD700';
            this.ctx.font = '10px Arial';
            this.ctx.fillText(
                `${entity.id || entity.type}@${Math.round(entity.x)},${Math.round(entity.y)} → ${Math.round(screenX)},${Math.round(screenY)}`,
                screenX + 2,
                screenY - 4
            );
            console.log('[Renderer] draw', {
                id: entity.id,
                type: entity.type,
                world: { x: entity.x, y: entity.y, w: safeWidth, h: safeHeight },
                screen: { x: screenX, y: screenY },
                image: !!entity.image
            });
        }

        this.ctx.restore();
    }

    /**
     * 繪製實體高亮
     */
    drawEntityHighlight(x, y, entity) {
        const w = entity.width || 64;
        const h = entity.height || 64;
        const padding = 8;

        // 發光效果
        this.ctx.shadowColor = this.theme.interactHighlight;
        this.ctx.shadowBlur = 15;
        this.ctx.shadowOffsetX = 0;
        this.ctx.shadowOffsetY = 0;

        // 高亮邊框
        this.ctx.strokeStyle = this.theme.interactHighlight;
        this.ctx.lineWidth = 3;
        this.ctx.strokeRect(x - padding, y - padding, w + padding * 2, h + padding * 2);

        // 重置陰影
        this.ctx.shadowBlur = 0;
    }

    /**
     * 繪製玩家角色
     */
    drawPlayer(player, x, y) {
        const w = player.width || 120;
        const h = player.height || 120;

        // 嘗試繪製圖片
        if (player.image && player.imageLoaded) {
            this.ctx.save();

            // 翻轉處理
            if (!player.facingRight) {
                this.ctx.translate(x + w, y);
                this.ctx.scale(-1, 1);
                this.ctx.drawImage(player.image, 0, 0, w, h);
            } else {
                this.ctx.drawImage(player.image, x, y, w, h);
            }

            this.ctx.restore();
        } else {
            // 佔位符 - 圖片加載中，使用友好的藍色圓形
            this.ctx.fillStyle = '#446DFF';
            this.ctx.beginPath();
            this.ctx.arc(x + w/2, y + h/2, w/2, 0, Math.PI * 2);
            this.ctx.fill();

            // 顯示加載提示
            this.ctx.fillStyle = 'white';
            this.ctx.font = '14px Arial';
            this.ctx.textAlign = 'center';
            this.ctx.textBaseline = 'middle';
            this.ctx.fillText('Loading...', x + w / 2, y + h / 2);

            // 角色名稱在下方
            this.ctx.font = 'bold 12px Arial';
            this.ctx.fillText(
                player.name || player.characterId || '???',
                x + w / 2,
                y + h / 2 + 20
            );
        }

        // 繪製名稱標籤
        this.drawNameTag(player.name || player.characterId, x, y - 25, w, this.theme.playerName);

        // 飛行模式指示
        if (player.isFlying) {
            this.drawFlyingIndicator(x, y, w);
        }
    }

    /**
     * 繪製 NPC
     */
    drawNPC(npc, x, y) {
        const w = npc.width || 80;
        const h = npc.height || 100;

        // 嘗試繪製圖片
        if (npc.image && npc.image.complete) {
            this.ctx.drawImage(npc.image, x, y, w, h);
        } else {
            // 佔位符
            this.ctx.fillStyle = '#4A90D9';
            this.ctx.fillRect(x, y, w, h);

            // NPC 圖示
            this.ctx.fillStyle = 'white';
            this.ctx.font = 'bold 20px Arial';
            this.ctx.textAlign = 'center';
            this.ctx.fillText('?', x + w / 2, y + h / 2);
        }

        // 繪製名稱標籤
        this.drawNameTag(npc.name || 'NPC', x, y - 25, w, this.theme.npcName);

        // 任務標記
        if (npc.hasQuest) {
            this.drawQuestMarker(x + w / 2, y - 40, npc.questType);
        }
    }

    /**
     * 繪製物品
     */
    drawItem(item, x, y) {
        const w = item.width || 40;
        const h = item.height || 40;

        // 物品發光動畫
        const time = Date.now() / 500;
        const glow = Math.sin(time) * 0.3 + 0.7;

        this.ctx.save();
        this.ctx.shadowColor = this.theme.itemGlow;
        this.ctx.shadowBlur = 10 * glow;

        // 嘗試繪製圖片
        if (item.image && item.image.complete) {
            this.ctx.drawImage(item.image, x, y, w, h);
        } else {
            // 佔位符 - 金幣形狀
            this.ctx.fillStyle = '#FFD700';
            this.ctx.beginPath();
            this.ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
            this.ctx.fill();

            // 物品圖示
            this.ctx.fillStyle = '#B8860B';
            this.ctx.font = 'bold 18px Arial';
            this.ctx.textAlign = 'center';
            this.ctx.textBaseline = 'middle';
            this.ctx.fillText(item.icon || '★', x + w / 2, y + h / 2);
        }

        this.ctx.restore();

        // 如果需要特定能力，顯示能力圖示
        if (item.requiredAbility) {
            this.drawAbilityRequirement(x + w, y, item.requiredAbility);
        }
    }

    /**
     * 繪製建築
     */
    drawBuilding(building, x, y) {
        const w = building.width || 150;
        const h = building.height || 150;

        // 嘗試繪製圖片
        if (building.image && building.image.complete) {
            this.ctx.drawImage(building.image, x, y, w, h);
        } else {
            // 佔位符 - 建築形狀
            this.ctx.fillStyle = '#8B4513';
            this.ctx.fillRect(x, y, w, h);

            // 門
            this.ctx.fillStyle = '#4A2C0A';
            this.ctx.fillRect(x + w * 0.35, y + h * 0.5, w * 0.3, h * 0.5);

            // 窗戶
            this.ctx.fillStyle = '#87CEEB';
            this.ctx.fillRect(x + w * 0.1, y + h * 0.15, w * 0.25, h * 0.2);
            this.ctx.fillRect(x + w * 0.65, y + h * 0.15, w * 0.25, h * 0.2);

            // 屋頂
            this.ctx.fillStyle = '#654321';
            this.ctx.beginPath();
            this.ctx.moveTo(x - 10, y);
            this.ctx.lineTo(x + w / 2, y - 40);
            this.ctx.lineTo(x + w + 10, y);
            this.ctx.closePath();
            this.ctx.fill();
        }

        // 建築名稱
        this.drawNameTag(building.name || '建築', x, y - 50, w, this.theme.buildingGlow);

        // 入口指示
        const entranceX = building.entranceX || (x + w / 2);
        this.drawEntranceMarker(entranceX - x, y + h - 20, w);
    }

    /**
     * 繪製能力障礙物
     */
    drawBlocker(blocker, x, y) {
        const w = blocker.width || 100;
        const h = blocker.height || 50;

        // 發光效果
        const time = Date.now() / 800;
        const pulse = Math.sin(time) * 0.5 + 0.5;

        this.ctx.save();
        this.ctx.shadowColor = this.theme.blockerGlow;
        this.ctx.shadowBlur = 10 * pulse;

        // 根據障礙物類型繪製
        const blockerColors = {
            gap: '#FFD700',           // Donnie 黃色
            soft_ground: '#8B4513',   // Todd 棕色
            blocked_path: '#8B4513',
            animal: '#FFFFFF',         // Bello 白色
            traffic: '#1E90FF'         // Paul 藍色
        };

        const color = blockerColors[blocker.blockerType] || '#FF6B6B';

        this.ctx.fillStyle = color;
        this.ctx.globalAlpha = 0.6;
        this.ctx.fillRect(x, y, w, h);

        // 問號指示
        this.ctx.globalAlpha = 1;
        this.ctx.fillStyle = 'white';
        this.ctx.font = 'bold 20px Arial';
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        this.ctx.fillText('?', x + w / 2, y + h / 2);

        this.ctx.restore();

        // 提示文字
        if (blocker.hintText) {
            this.ctx.fillStyle = 'rgba(0,0,0,0.7)';
            this.ctx.fillRect(x, y - 30, w, 25);
            this.ctx.fillStyle = 'white';
            this.ctx.font = '12px Arial';
            this.ctx.textAlign = 'center';
            this.ctx.fillText(blocker.hintText, x + w / 2, y - 15);
        }
    }

    /**
     * 繪製通用實體
     */
    drawGenericEntity(entity, x, y) {
        const w = entity.width || 64;
        const h = entity.height || 64;

        this.ctx.fillStyle = entity.color || '#888888';
        this.ctx.fillRect(x, y, w, h);
    }

    /**
     * 繪製名稱標籤
     */
    drawNameTag(name, x, y, width, color = '#FFFFFF') {
        const tagHeight = 20;

        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
        this.ctx.fillRect(x, y, width, tagHeight);

        this.ctx.fillStyle = color;
        this.ctx.font = this.fonts.entityName;
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        this.ctx.fillText(name, x + width / 2, y + tagHeight / 2);
    }

    /**
     * 繪製任務標記
     */
    drawQuestMarker(x, y, questType = 'main') {
        const markerColors = {
            main: '#FFD700',
            side: '#87CEEB',
            completed: '#00FF00'
        };

        const color = markerColors[questType] || markerColors.main;

        this.ctx.fillStyle = color;
        this.ctx.beginPath();
        this.ctx.moveTo(x, y - 15);
        this.ctx.lineTo(x - 8, y + 5);
        this.ctx.lineTo(x + 8, y + 5);
        this.ctx.closePath();
        this.ctx.fill();

        this.ctx.fillStyle = 'white';
        this.ctx.font = 'bold 12px Arial';
        this.ctx.textAlign = 'center';
        this.ctx.fillText('!', x, y);
    }

    /**
     * 繪製飛行模式指示
     */
    drawFlyingIndicator(x, y, width) {
        this.ctx.fillStyle = '#00BFFF';
        this.ctx.font = '16px Arial';
        this.ctx.textAlign = 'center';
        this.ctx.fillText('✈', x + width / 2, y - 35);
    }

    /**
     * 繪製能力需求標記
     */
    drawAbilityRequirement(x, y, abilityId) {
        const icons = {
            build_bridge: '🔧',
            drill: '⛏️',
            animal_talk: '🐾',
            traffic_control: '🚦'
        };

        const icon = icons[abilityId] || '⚡';

        this.ctx.fillStyle = 'rgba(255, 0, 0, 0.8)';
        this.ctx.beginPath();
        this.ctx.arc(x, y, 15, 0, Math.PI * 2);
        this.ctx.fill();

        this.ctx.font = '14px Arial';
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        this.ctx.fillText(icon, x, y);
    }

    /**
     * 繪製入口標記
     */
    drawEntranceMarker(x, y, width) {
        this.ctx.fillStyle = 'rgba(0, 255, 0, 0.5)';
        this.ctx.fillRect(x + width * 0.35, y, width * 0.3, 5);

        this.ctx.fillStyle = 'white';
        this.ctx.font = '10px Arial';
        this.ctx.textAlign = 'center';
        this.ctx.fillText('▼ 進入', x + width / 2, y + 15);
    }

    /**
     * 繪製互動提示
     * @param {Object} target - 目標實體
     * @param {string} key - 按鍵提示
     */
    drawInteractionHint(target, key = 'E') {
        if (!target) return;

        const text = this.getInteractionText(target);

        // 提示框
        const padding = 15;
        this.ctx.font = this.fonts.hintText;
        const textWidth = this.ctx.measureText(`按 ${key} ${text}`).width;

        const boxWidth = textWidth + padding * 2;
        const boxHeight = 35;
        const boxX = (this.width - boxWidth) / 2;
        const boxY = this.height - 100;

        // 背景
        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
        this.roundRect(boxX, boxY, boxWidth, boxHeight, 5);
        this.ctx.fill();

        // 邊框
        this.ctx.strokeStyle = this.theme.interactHighlight;
        this.ctx.lineWidth = 2;
        this.roundRect(boxX, boxY, boxWidth, boxHeight, 5);
        this.ctx.stroke();

        // 文字
        this.ctx.fillStyle = 'white';
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        this.ctx.fillText(`按 ${key} ${text}`, this.width / 2, boxY + boxHeight / 2);
    }

    /**
     * 取得互動文字
     */
    getInteractionText(target) {
        switch (target.type) {
            case 'npc':
                return `與 ${target.name || 'NPC'} 對話`;
            case 'item':
                return `撿取 ${target.name || '物品'}`;
            case 'building':
                return `進入 ${target.name || '建築'}`;
            case 'blocker':
                return `使用能力`;
            default:
                return '互動';
        }
    }

    /**
     * 繪製碰撞框 (除錯用)
     */
    drawHitbox(x, y, w, h) {
        this.ctx.strokeStyle = '#FF00FF';
        this.ctx.lineWidth = 1;
        this.ctx.strokeRect(x, y, w, h);
    }

    /**
     * 繪製除錯網格
     */
    drawDebugGrid(camera, cellSize = 64) {
        if (!this.showGrid) return;

        const startX = camera ? Math.floor(camera.x / cellSize) * cellSize : 0;
        const startY = camera ? Math.floor(camera.y / cellSize) * cellSize : 0;

        this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
        this.ctx.lineWidth = 1;

        for (let x = 0; x <= this.width; x += cellSize) {
            const worldX = startX + x;
            const screenX = camera ? camera.getRelativeX(worldX) : worldX;

            this.ctx.beginPath();
            this.ctx.moveTo(screenX, 0);
            this.ctx.lineTo(screenX, this.height);
            this.ctx.stroke();
        }

        for (let y = 0; y <= this.height; y += cellSize) {
            this.ctx.beginPath();
            this.ctx.moveTo(0, y);
            this.ctx.lineTo(this.width, y);
            this.ctx.stroke();
        }
    }

    /**
     * 圓角矩形輔助方法
     */
    roundRect(x, y, w, h, r) {
        this.ctx.beginPath();
        this.ctx.moveTo(x + r, y);
        this.ctx.lineTo(x + w - r, y);
        this.ctx.quadraticCurveTo(x + w, y, x + w, y + r);
        this.ctx.lineTo(x + w, y + h - r);
        this.ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
        this.ctx.lineTo(x + r, y + h);
        this.ctx.quadraticCurveTo(x, y + h, x, y + h - r);
        this.ctx.lineTo(x, y + r);
        this.ctx.quadraticCurveTo(x, y, x + r, y);
        this.ctx.closePath();
    }

    /**
     * 調整大小
     */
    resize(width, height) {
        this.width = width;
        this.height = height;
    }

    /**
     * 設定除錯模式
     */
    setDebug(enabled) {
        this.debug = enabled;
        this.showHitboxes = enabled;
        this.showGrid = enabled;
    }
}
