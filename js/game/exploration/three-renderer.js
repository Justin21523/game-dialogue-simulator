/**
 * ThreeRenderer - THREE.js 3D 渲染層
 * 負責將 3D 角色模型疊加在 2D Canvas 上
 */

// THREE.js 將從 CDN 載入（在 index.html 中）
// 這裡使用全域變數 THREE

export class ThreeRenderer {
    constructor(canvas2D, options = {}) {
        console.log('[ThreeRenderer] ===== CONSTRUCTOR START =====');
        console.log('[ThreeRenderer] canvas2D:', canvas2D);
        console.log('[ThreeRenderer] options:', options);

        this.canvas2D = canvas2D;
        this.width = canvas2D.width;
        this.height = canvas2D.height;

        console.log('[ThreeRenderer] Canvas dimensions:', this.width, 'x', this.height);

        // 配置選項
        this.options = {
            enableShadows: options.enableShadows ?? false,
            enableLighting: options.enableLighting ?? true,
            debug: options.debug ?? false
        };

        // 建立 3D Canvas
        this.canvas3D = document.createElement('canvas');
        this.canvas3D.width = this.width;
        this.canvas3D.height = this.height;
        this.canvas3D.style.position = 'absolute';
        this.canvas3D.style.top = canvas2D.style.top || '0';
        this.canvas3D.style.left = canvas2D.style.left || '0';
        this.canvas3D.style.pointerEvents = 'none';  // 不攔截滑鼠事件
        this.canvas3D.style.zIndex = '2';            // 在 2D Canvas 上層

        // 插入到 DOM（在 2D Canvas 之後）
        canvas2D.parentElement.appendChild(this.canvas3D);

        // THREE.js 場景、相機、渲染器
        this.scene = null;
        this.camera = null;
        this.renderer = null;

        // 角色 mesh 管理：characterId/npcId → THREE.Mesh
        this.characterMeshes = new Map();

        // Placeholder 材質
        this.placeholderMaterial = null;

        // 初始化 THREE.js
        console.log('[ThreeRenderer] 調用 _initThreeJS()...');
        this._initThreeJS();
        console.log('[ThreeRenderer] _initThreeJS() 完成');

        console.log(`[ThreeRenderer] ✅ Initialized with ${this.width}x${this.height} canvas`);
        console.log('[ThreeRenderer] ===== CONSTRUCTOR END =====');
    }

    /**
     * 初始化 THREE.js 場景
     */
    _initThreeJS() {
        console.log('[ThreeRenderer] _initThreeJS START');

        // 檢查 THREE 是否可用
        console.log('[ThreeRenderer] 檢查 THREE 全域變數:', typeof THREE);
        if (typeof THREE === 'undefined') {
            console.error('[ThreeRenderer] ❌ THREE.js not loaded! Please include THREE.js before this script.');
            return;
        }

        // 建立場景
        console.log('[ThreeRenderer] 建立 THREE.Scene...');
        this.scene = new THREE.Scene();
        console.log('[ThreeRenderer] ✅ Scene created:', this.scene);

        // 建立正交相機（與 2D 遊戲座標系統一致）
        const aspect = this.width / this.height;
        const frustumSize = this.height;
        this.camera = new THREE.OrthographicCamera(
            -frustumSize * aspect / 2,  // left
            frustumSize * aspect / 2,   // right
            frustumSize / 2,             // top
            -frustumSize / 2,            // bottom
            0.1,                         // near
            1000                         // far
        );
        this.camera.position.z = 10;

        // 建立渲染器
        this.renderer = new THREE.WebGLRenderer({
            canvas: this.canvas3D,
            alpha: true,       // 透明背景
            antialias: true,   // 抗鋸齒
            preserveDrawingBuffer: false
        });
        this.renderer.setSize(this.width, this.height);
        this.renderer.setClearColor(0x000000, 0);  // 完全透明

        // 陰影（可選）
        if (this.options.enableShadows) {
            this.renderer.shadowMap.enabled = true;
            this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        }

        // 光源
        if (this.options.enableLighting) {
            this._setupLighting();
        }

        // Placeholder 材質
        this.placeholderMaterial = new THREE.MeshStandardMaterial({
            color: 0xff6b6b,
            metalness: 0.3,
            roughness: 0.7
        });

        console.log('[ThreeRenderer] THREE.js scene initialized');
    }

    /**
     * 設置光源
     */
    _setupLighting() {
        // 環境光
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
        this.scene.add(ambientLight);

        // 方向光
        const directionalLight = new THREE.DirectionalLight(0xffffff, 0.5);
        directionalLight.position.set(5, 10, 7.5);
        if (this.options.enableShadows) {
            directionalLight.castShadow = true;
            directionalLight.shadow.camera.left = -10;
            directionalLight.shadow.camera.right = 10;
            directionalLight.shadow.camera.top = 10;
            directionalLight.shadow.camera.bottom = -10;
        }
        this.scene.add(directionalLight);
    }

    /**
     * 同步相機與 2D 世界
     * @param {Object} camera2D - 2D 相機（含 x, y 屬性）
     */
    syncCamera(camera2D) {
        if (!this.camera) return;

        // 將 2D 相機座標轉換為 THREE.js 座標
        // 2D: (0,0) 在左上角，X 向右，Y 向下
        // THREE.js: (0,0,0) 在中心，X 向右，Y 向上，Z 向外
        this.camera.position.x = camera2D.x - this.width / 2;
        this.camera.position.y = -(camera2D.y - this.height / 2);  // Y 軸翻轉
    }

    /**
     * 添加或更新角色 3D 模型
     * @param {string} id - 角色/NPC ID
     * @param {Object} character - 角色物件（含 x, y, width, height 屬性）
     * @param {THREE.Object3D} model - 3D 模型（可選，null 則使用 placeholder）
     */
    addOrUpdateCharacter(id, character, model = null) {
        // 如果已存在，先移除
        if (this.characterMeshes.has(id)) {
            this.removeCharacter(id);
        }

        let mesh;

        if (model) {
            // 使用提供的 3D 模型
            mesh = model;
        } else {
            // 使用 placeholder（3D 膠囊）
            mesh = this._createPlaceholder(character);
        }

        // 設定位置（2D 世界座標 → 3D 場景座標）
        this._updateMeshPosition(mesh, character);

        // 加入場景
        this.scene.add(mesh);
        this.characterMeshes.set(id, mesh);

        if (this.options.debug) {
            console.log(`[ThreeRenderer] Added character: ${id}`, model ? '(3D model)' : '(placeholder)');
        }
    }

    /**
     * 建立 3D placeholder
     * @param {Object} character - 角色物件
     * @returns {THREE.Mesh}
     */
    _createPlaceholder(character) {
        const width = character.width || 80;
        const height = character.height || 100;

        // 使用膠囊形狀（CapsuleGeometry 在 THREE.js r128+ 可用，否則用組合）
        let geometry;

        if (THREE.CapsuleGeometry) {
            // 使用膠囊幾何體
            geometry = new THREE.CapsuleGeometry(width / 3, height / 2, 4, 8);
        } else {
            // 降級：使用圓柱體
            geometry = new THREE.CylinderGeometry(width / 3, width / 3, height, 8);
        }

        const material = this.placeholderMaterial.clone();

        // 根據角色類型調整顏色
        if (character.type === 'npc') {
            material.color.setHex(0x4a90d9);  // 藍色
        } else {
            material.color.setHex(0xff6b6b);  // 紅色（玩家）
        }

        const mesh = new THREE.Mesh(geometry, material);
        mesh.castShadow = true;
        mesh.receiveShadow = true;

        return mesh;
    }

    /**
     * 更新 mesh 位置（2D 座標 → 3D 座標）
     * @param {THREE.Mesh} mesh - 3D mesh
     * @param {Object} character - 角色物件（含 x, y 屬性）
     */
    _updateMeshPosition(mesh, character) {
        // 2D 世界座標 (x, y) → THREE.js 場景座標
        // 注意：Y 軸翻轉，且需要以畫面中心為原點
        mesh.position.x = character.x - this.width / 2;
        mesh.position.y = -(character.y - this.height / 2 + (character.height || 100) / 2);  // Y 軸翻轉，並調整至腳底
        mesh.position.z = 0;  // 2D 遊戲，Z 座標固定為 0
    }

    /**
     * 同步所有角色位置
     * @param {Map|Object} characters - 角色 Map 或物件（players, npcs）
     */
    syncCharacters(characters) {
        if (!characters) return;

        // 處理 Map
        if (characters instanceof Map) {
            for (const [id, character] of characters.entries()) {
                const mesh = this.characterMeshes.get(id);
                if (mesh && character.isVisible !== false) {
                    this._updateMeshPosition(mesh, character);
                    mesh.visible = true;

                    // 面向方向（facingRight）
                    if (character.facingRight !== undefined) {
                        mesh.rotation.y = character.facingRight ? 0 : Math.PI;
                    }
                } else if (mesh) {
                    mesh.visible = false;
                }
            }
        }
        // 處理物件（例如 {players: Map, npcs: Map}）
        else if (typeof characters === 'object') {
            if (characters.players) {
                this.syncCharacters(characters.players);
            }
            if (characters.npcs) {
                this.syncCharacters(characters.npcs);
            }
        }
    }

    /**
     * 移除角色
     * @param {string} id - 角色/NPC ID
     */
    removeCharacter(id) {
        const mesh = this.characterMeshes.get(id);
        if (mesh) {
            this.scene.remove(mesh);
            mesh.geometry.dispose();
            mesh.material.dispose();
            this.characterMeshes.delete(id);

            if (this.options.debug) {
                console.log(`[ThreeRenderer] Removed character: ${id}`);
            }
        }
    }

    /**
     * 渲染 3D 場景
     */
    render() {
        if (!this.renderer || !this.scene || !this.camera) {
            return;
        }

        this.renderer.render(this.scene, this.camera);
    }

    /**
     * 調整大小
     * @param {number} width - 新寬度
     * @param {number} height - 新高度
     */
    resize(width, height) {
        this.width = width;
        this.height = height;

        if (this.canvas3D) {
            this.canvas3D.width = width;
            this.canvas3D.height = height;
        }

        if (this.camera) {
            const aspect = width / height;
            const frustumSize = height;
            this.camera.left = -frustumSize * aspect / 2;
            this.camera.right = frustumSize * aspect / 2;
            this.camera.top = frustumSize / 2;
            this.camera.bottom = -frustumSize / 2;
            this.camera.updateProjectionMatrix();
        }

        if (this.renderer) {
            this.renderer.setSize(width, height);
        }

        console.log(`[ThreeRenderer] Resized to ${width}x${height}`);
    }

    /**
     * 取得統計資訊
     * @returns {Object}
     */
    getStats() {
        return {
            characters: this.characterMeshes.size,
            triangles: this.renderer ? this.renderer.info.render.triangles : 0,
            calls: this.renderer ? this.renderer.info.render.calls : 0
        };
    }

    /**
     * 銷毀渲染器
     */
    dispose() {
        // 移除所有 mesh
        for (const id of this.characterMeshes.keys()) {
            this.removeCharacter(id);
        }

        // 銷毀渲染器
        if (this.renderer) {
            this.renderer.dispose();
        }

        // 移除 canvas
        if (this.canvas3D && this.canvas3D.parentElement) {
            this.canvas3D.parentElement.removeChild(this.canvas3D);
        }

        console.log('[ThreeRenderer] Disposed');
    }
}
