"""
Asset Manifest System - 資產清單管理器

掃描檔案系統中實際存在的資產，提供給 AI 使用，
確保 AI 只能選擇真實存在的資產。
"""

import os
import glob
import json
import logging
from pathlib import Path
from typing import Dict, List, Optional
from collections import defaultdict

logger = logging.getLogger(__name__)


class AssetManifest:
    """資產清單管理器 - 掃描並管理所有遊戲資產"""

    def __init__(self, asset_root: str = "assets"):
        self.asset_root = Path(asset_root)
        self.backgrounds = defaultdict(list)  # destination → [keys]
        self.buildings = defaultdict(list)     # type → [keys]
        self.npcs = defaultdict(list)         # archetype → [keys]
        self.items = defaultdict(list)        # type → [keys]
        self.models_3d = defaultdict(list)    # category → [keys]

        # 統計資訊
        self.stats = {
            'total_backgrounds': 0,
            'total_buildings': 0,
            'total_npcs': 0,
            'total_items': 0,
            'total_3d_models': 0,
            'scan_time': 0
        }

    def scan_assets(self, verbose: bool = True) -> Dict:
        """掃描所有資產目錄"""
        import time
        start_time = time.time()

        if verbose:
            logger.info("[AssetManifest] 🔍 開始掃描資產...")

        # 掃描各類資產
        self._scan_backgrounds()
        self._scan_buildings()
        self._scan_npcs()
        self._scan_items()
        self._scan_3d_models()

        # 更新統計
        self.stats['total_backgrounds'] = sum(len(v) for v in self.backgrounds.values())
        self.stats['total_buildings'] = sum(len(v) for v in self.buildings.values())
        self.stats['total_npcs'] = sum(len(v) for v in self.npcs.values())
        self.stats['total_items'] = sum(len(v) for v in self.items.values())
        self.stats['total_3d_models'] = sum(len(v) for v in self.models_3d.values())
        self.stats['scan_time'] = time.time() - start_time

        if verbose:
            logger.info(f"[AssetManifest] ✅ 掃描完成 ({self.stats['scan_time']:.2f}s)")
            logger.info(f"  📸 背景: {self.stats['total_backgrounds']}")
            logger.info(f"  🏠 建築: {self.stats['total_buildings']}")
            logger.info(f"  👥 NPC: {self.stats['total_npcs']}")
            logger.info(f"  💎 物品: {self.stats['total_items']}")
            logger.info(f"  🎨 3D模型: {self.stats['total_3d_models']}")

        return self.stats

    def _scan_backgrounds(self):
        """掃描背景圖片"""
        bg_path = self.asset_root / 'images' / 'backgrounds'

        # 掃描天空圖層
        sky_path = bg_path / 'sky'
        if sky_path.exists():
            for img_file in sky_path.glob('*.png'):
                key = img_file.stem  # 不含副檔名的檔名
                self.backgrounds['sky'].append(key)

        # 掃描雲朵圖層
        clouds_path = bg_path / 'clouds'
        if clouds_path.exists():
            for img_file in clouds_path.glob('*.png'):
                key = img_file.stem
                self.backgrounds['clouds'].append(key)

        # 掃描目的地特定背景
        dest_path = bg_path / 'destinations'
        if dest_path.exists():
            for dest_dir in dest_path.iterdir():
                if dest_dir.is_dir():
                    destination = dest_dir.name
                    for img_file in dest_dir.glob('*.png'):
                        key = img_file.stem
                        # 構建完整的 assetKey: destination_layer_variant
                        full_key = f"{destination}_{key}" if not key.startswith(destination) else key
                        self.backgrounds[destination].append(full_key)

    def _scan_buildings(self):
        """掃描建築物/物件圖片"""
        objects_path = self.asset_root / 'images' / 'objects'

        if objects_path.exists():
            for category_dir in objects_path.iterdir():
                if category_dir.is_dir():
                    category = category_dir.name  # cafe, shop, landmark, etc.
                    for img_file in category_dir.glob('*.png'):
                        key = img_file.stem
                        full_key = f"{category}_{key}" if not key.startswith(category) else key
                        self.buildings[category].append(full_key)

        # 也掃描 interiors（可進入的建築）
        interiors_path = self.asset_root / 'images' / 'interiors'
        if interiors_path.exists():
            for interior_dir in interiors_path.iterdir():
                if interior_dir.is_dir():
                    interior_type = interior_dir.name
                    for img_file in interior_dir.glob('*.png'):
                        key = img_file.stem
                        full_key = f"interior_{interior_type}_{key}"
                        self.buildings['interior'].append(full_key)

    def _scan_npcs(self):
        """掃描 NPC 圖片"""
        npcs_path = self.asset_root / 'images' / 'npcs'

        if npcs_path.exists():
            for npc_dir in npcs_path.iterdir():
                if npc_dir.is_dir():
                    archetype = npc_dir.name  # citizen, shopkeeper, guard, etc.
                    for img_file in npc_dir.glob('*.png'):
                        key = img_file.stem
                        full_key = f"npc_{archetype}_{key}"
                        self.npcs[archetype].append(full_key)

    def _scan_items(self):
        """掃描物品圖片"""
        items_path = self.asset_root / 'images' / 'items'

        if items_path.exists():
            for item_dir in items_path.iterdir():
                if item_dir.is_dir():
                    item_type = item_dir.name  # collectible, consumable, etc.
                    for img_file in item_dir.glob('*.png'):
                        key = img_file.stem
                        full_key = f"item_{item_type}_{key}"
                        self.items[item_type].append(full_key)

    def _scan_3d_models(self):
        """掃描 3D 模型（GLB/GLTF）"""
        models_path = self.asset_root / 'models'

        if models_path.exists():
            for model_dir in models_path.iterdir():
                if model_dir.is_dir():
                    category = model_dir.name  # characters, npcs, objects
                    for model_file in model_dir.glob('*.glb'):
                        key = model_file.stem
                        full_key = f"model_{category}_{key}"
                        self.models_3d[category].append(full_key)

                    # 也支援 .gltf
                    for model_file in model_dir.glob('*.gltf'):
                        key = model_file.stem
                        full_key = f"model_{category}_{key}"
                        self.models_3d[category].append(full_key)

    # ===== 查詢方法 =====

    def get_available_backgrounds(self, destination: Optional[str] = None) -> List[str]:
        """
        取得可用的背景 keys

        Args:
            destination: 目的地名稱（例如 'paris'）。如果為 None，返回所有背景。

        Returns:
            背景 key 列表
        """
        if destination:
            return self.backgrounds.get(destination, [])

        # 返回所有目的地的背景
        all_backgrounds = []
        for dest, keys in self.backgrounds.items():
            if dest not in ['sky', 'clouds']:  # 排除通用圖層
                all_backgrounds.extend(keys)
        return all_backgrounds

    def get_available_building_types(self) -> List[str]:
        """取得可用的建築類型"""
        return list(self.buildings.keys())

    def get_available_buildings(self, building_type: Optional[str] = None) -> List[str]:
        """
        取得可用的建築 keys

        Args:
            building_type: 建築類型（例如 'cafe', 'shop'）
        """
        if building_type:
            return self.buildings.get(building_type, [])

        # 返回所有建築
        all_buildings = []
        for keys in self.buildings.values():
            all_buildings.extend(keys)
        return all_buildings

    def get_available_npc_archetypes(self) -> List[str]:
        """取得可用的 NPC 類型"""
        return list(self.npcs.keys())

    def get_available_npcs(self, archetype: Optional[str] = None) -> List[str]:
        """取得可用的 NPC keys"""
        if archetype:
            return self.npcs.get(archetype, [])

        all_npcs = []
        for keys in self.npcs.values():
            all_npcs.extend(keys)
        return all_npcs

    def get_available_items(self, item_type: Optional[str] = None) -> List[str]:
        """取得可用的物品 keys"""
        if item_type:
            return self.items.get(item_type, [])

        all_items = []
        for keys in self.items.values():
            all_items.extend(keys)
        return all_items

    def get_random_background(self, destination: str) -> Optional[str]:
        """隨機選擇一個背景（用於 fallback）"""
        import random
        backgrounds = self.get_available_backgrounds(destination)
        return random.choice(backgrounds) if backgrounds else None

    def validate_asset_key(self, key: str, category: str) -> bool:
        """
        驗證 assetKey 是否存在

        Args:
            key: 資產 key
            category: 資產類別 ('backgrounds', 'buildings', 'npcs', 'items')

        Returns:
            True 如果資產存在
        """
        if category == 'backgrounds':
            # 檢查所有目的地
            for dest_backgrounds in self.backgrounds.values():
                if key in dest_backgrounds:
                    return True
            return False

        elif category == 'buildings':
            for building_list in self.buildings.values():
                if key in building_list:
                    return True
            return False

        elif category == 'npcs':
            for npc_list in self.npcs.values():
                if key in npc_list:
                    return True
            return False

        elif category == 'items':
            for item_list in self.items.values():
                if key in item_list:
                    return True
            return False

        return False

    def get_stats(self) -> Dict:
        """取得統計資訊"""
        return self.stats

    def export_to_json(self, output_path: str):
        """匯出資產清單到 JSON 文件（用於快取）"""
        data = {
            'backgrounds': dict(self.backgrounds),
            'buildings': dict(self.buildings),
            'npcs': dict(self.npcs),
            'items': dict(self.items),
            'models_3d': dict(self.models_3d),
            'stats': self.stats
        }

        with open(output_path, 'w', encoding='utf-8') as f:
            json.dump(data, f, indent=2, ensure_ascii=False)

        logger.info(f"[AssetManifest] 📝 已匯出到 {output_path}")

    def load_from_json(self, input_path: str):
        """從 JSON 文件載入資產清單（快取）"""
        if not os.path.exists(input_path):
            logger.warning(f"[AssetManifest] ⚠️ 快取文件不存在: {input_path}")
            return False

        with open(input_path, 'r', encoding='utf-8') as f:
            data = json.load(f)

        self.backgrounds = defaultdict(list, data.get('backgrounds', {}))
        self.buildings = defaultdict(list, data.get('buildings', {}))
        self.npcs = defaultdict(list, data.get('npcs', {}))
        self.items = defaultdict(list, data.get('items', {}))
        self.models_3d = defaultdict(list, data.get('models_3d', {}))
        self.stats = data.get('stats', {})

        logger.info(f"[AssetManifest] ✅ 已從快取載入")
        return True


# ===== 全域單例 =====

_asset_manifest: Optional[AssetManifest] = None
_cache_file = 'backend/.asset_manifest_cache.json'


def get_asset_manifest(force_scan: bool = False) -> AssetManifest:
    """
    取得全域 AssetManifest 單例

    Args:
        force_scan: 強制重新掃描（忽略快取）
    """
    global _asset_manifest

    if _asset_manifest is None or force_scan:
        _asset_manifest = AssetManifest()

        # 嘗試從快取載入（開發模式下跳過）
        if not force_scan and os.path.exists(_cache_file):
            if _asset_manifest.load_from_json(_cache_file):
                return _asset_manifest

        # 重新掃描
        _asset_manifest.scan_assets()

        # 儲存快取
        try:
            _asset_manifest.export_to_json(_cache_file)
        except Exception as e:
            logger.warning(f"[AssetManifest] ⚠️ 無法儲存快取: {e}")

    return _asset_manifest


def invalidate_cache():
    """清除快取，強制下次重新掃描"""
    global _asset_manifest
    _asset_manifest = None

    if os.path.exists(_cache_file):
        os.remove(_cache_file)
        logger.info("[AssetManifest] 🗑️ 快取已清除")


# ===== CLI 工具（用於測試）=====

if __name__ == '__main__':
    import sys

    logging.basicConfig(level=logging.INFO)

    if len(sys.argv) > 1 and sys.argv[1] == '--invalidate':
        invalidate_cache()
        print("✅ 快取已清除")
        sys.exit(0)

    # 測試掃描
    manifest = get_asset_manifest(force_scan=True)

    print("\n" + "="*50)
    print("📊 資產清單統計")
    print("="*50)
    print(f"背景總數: {manifest.stats['total_backgrounds']}")
    print(f"建築總數: {manifest.stats['total_buildings']}")
    print(f"NPC 總數: {manifest.stats['total_npcs']}")
    print(f"物品總數: {manifest.stats['total_items']}")
    print(f"3D 模型: {manifest.stats['total_3d_models']}")
    print(f"掃描時間: {manifest.stats['scan_time']:.2f}s")

    print("\n目的地背景範例 (paris):")
    paris_bgs = manifest.get_available_backgrounds('paris')
    for bg in paris_bgs[:5]:
        print(f"  - {bg}")
    if len(paris_bgs) > 5:
        print(f"  ... 共 {len(paris_bgs)} 個")

    print("\n建築類型:")
    for building_type in manifest.get_available_building_types()[:10]:
        count = len(manifest.buildings[building_type])
        print(f"  - {building_type}: {count} 個")
