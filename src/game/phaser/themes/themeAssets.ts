import type { LocationTheme, PropType } from '../../../shared/types/World';

export type ParallaxAssetLayer = {
    id: string;
    textureKey: string;
    path: string;
    speed: number;
    alpha?: number;
};

export type ThemedPropAsset = {
    textureKey: string;
    path: string;
    defaultHeight?: number;
};

export type ThemedBackdropAsset = {
    textureKey: string;
    path: string;
};

function hashString32(input: string): number {
    // FNV-1a 32-bit
    let hash = 0x811c9dc5;
    for (let i = 0; i < input.length; i += 1) {
        hash ^= input.charCodeAt(i);
        hash = Math.imul(hash, 0x01000193);
        hash >>>= 0;
    }
    return hash >>> 0;
}

function sanitizeKey(value: string): string {
    return value.replace(/[^a-z0-9]+/gi, '-').replace(/(^-+|-+$)/g, '').toLowerCase();
}

export function textureKeyForPath(path: string): string {
    return `asset-${sanitizeKey(path)}`;
}

function pickIndex(seed: number, length: number): number {
    if (length <= 0) return 0;
    return seed % length;
}

function pickAsset(seedKey: string, paths: string[], defaultHeight?: number): ThemedPropAsset | null {
    if (paths.length === 0) return null;
    const seed = hashString32(seedKey);
    const idx = pickIndex(seed, paths.length);
    const path = paths[idx] ?? paths[0]!;
    return {
        textureKey: textureKeyForPath(path),
        path,
        defaultHeight
    };
}

function buildLayer(id: string, path: string, speed: number, alpha?: number): ParallaxAssetLayer {
    return {
        id,
        textureKey: textureKeyForPath(path),
        path,
        speed,
        alpha
    };
}

export function getThemeParallaxLayers(theme: LocationTheme | undefined): ParallaxAssetLayer[] | null {
    switch (theme) {
        case 'airport_base':
            return [
                buildLayer('sky', 'assets/images/backgrounds/sky/sky_blue_gradient_v3.png', 0),
                buildLayer('far', 'assets/images/backgrounds/base/world_airport_far_v2.png', 0.04, 0.9),
                buildLayer('mid', 'assets/images/backgrounds/base/world_airport_mid_v2.png', 0.1, 0.9),
                buildLayer('near', 'assets/images/backgrounds/base/world_airport_near_v2.png', 0.2, 0.9)
            ];
        case 'warehouse':
            return [
                buildLayer('sky', 'assets/images/backgrounds/destinations/moscow/moscow_sky_v2.png', 0.01),
                buildLayer('buildings', 'assets/images/backgrounds/destinations/moscow/moscow_buildings_v2.png', 0.06, 0.85),
                buildLayer('landmark', 'assets/images/backgrounds/destinations/moscow/moscow_landmark_v2.png', 0.12, 0.85),
                buildLayer('ground', 'assets/images/backgrounds/destinations/moscow/moscow_ground_v2.png', 0.22, 0.9)
            ];
        case 'town_outdoor':
            return [
                buildLayer('sky', 'assets/images/backgrounds/destinations/london/london_sky_v2.png', 0.01),
                buildLayer('buildings', 'assets/images/backgrounds/destinations/london/london_buildings_v2.png', 0.06, 0.85),
                buildLayer('landmark', 'assets/images/backgrounds/destinations/london/london_landmark_v2.png', 0.12, 0.85),
                buildLayer('ground', 'assets/images/backgrounds/destinations/london/london_ground_v2.png', 0.22, 0.9)
            ];
        case 'park_outdoor':
            return [
                buildLayer('sky', 'assets/images/backgrounds/destinations/nairobi/nairobi_sky_v2.png', 0.01),
                buildLayer('buildings', 'assets/images/backgrounds/destinations/nairobi/nairobi_buildings_v2.png', 0.06, 0.85),
                buildLayer('landmark', 'assets/images/backgrounds/destinations/nairobi/nairobi_landmark_v2.png', 0.12, 0.85),
                buildLayer('ground', 'assets/images/backgrounds/destinations/nairobi/nairobi_ground_v2.png', 0.22, 0.9)
            ];
        default:
            return null;
    }
}

export function getThemeInteriorBackdrop(theme: LocationTheme | undefined): ThemedBackdropAsset | null {
    if (!theme || !theme.startsWith('interior_')) return null;

    const path =
        theme === 'interior_shop'
            ? 'assets/images/interiors/shop/bookstore_bg.png'
            : theme === 'interior_house'
              ? 'assets/images/interiors/public_building/library_bg.png'
              : theme === 'interior_garage'
                ? 'assets/images/interiors/special/control_room_bg.png'
                : theme === 'interior_secret'
                  ? 'assets/images/interiors/special/cave_bg.png'
                  : null;

    if (!path) return null;
    return { textureKey: textureKeyForPath(path), path };
}

type DecorKeywordRule = {
    keywords: string[];
    paths: string[];
    defaultHeight?: number;
};

const STREET_LAMPS = [
    'assets/images/objects/street_furniture/lamp_street_v1.png',
    'assets/images/objects/street_furniture/lamp_street_v2.png',
    'assets/images/objects/street_furniture/lamp_street_v3.png'
];

const PARK_BENCHES = [
    'assets/images/objects/street_furniture/bench_park_v1.png',
    'assets/images/objects/street_furniture/bench_park_v2.png',
    'assets/images/objects/street_furniture/bench_park_v3.png'
];

const STREET_TRASH = [
    'assets/images/objects/street_furniture/trash_bin_v1.png',
    'assets/images/objects/street_furniture/trash_bin_v2.png',
    'assets/images/objects/street_furniture/trash_bin_v3.png'
];

const MAILBOXES = [
    'assets/images/objects/street_furniture/mailbox_blue_v1.png',
    'assets/images/objects/street_furniture/mailbox_blue_v2.png',
    'assets/images/objects/street_furniture/mailbox_blue_v3.png'
];

const STOP_SIGNS = [
    'assets/images/objects/street_furniture/stop_sign_v1.png',
    'assets/images/objects/street_furniture/stop_sign_v2.png',
    'assets/images/objects/street_furniture/stop_sign_v3.png'
];

const TRAFFIC_LIGHTS = [
    'assets/images/objects/street_furniture/traffic_light_v1.png',
    'assets/images/objects/street_furniture/traffic_light_v2.png',
    'assets/images/objects/street_furniture/traffic_light_v3.png'
];

const CARS = [
    'assets/images/objects/vehicles/cars/car_red_v1.png',
    'assets/images/objects/vehicles/cars/car_red_v2.png',
    'assets/images/objects/vehicles/cars/car_red_v3.png',
    'assets/images/objects/vehicles/cars/car_blue_v1.png',
    'assets/images/objects/vehicles/cars/car_blue_v2.png',
    'assets/images/objects/vehicles/cars/car_blue_v3.png',
    'assets/images/objects/vehicles/cars/car_yellow_taxi_v1.png',
    'assets/images/objects/vehicles/cars/car_yellow_taxi_v2.png',
    'assets/images/objects/vehicles/cars/car_yellow_taxi_v3.png',
    'assets/images/objects/vehicles/cars/car_police_v1.png',
    'assets/images/objects/vehicles/cars/car_police_v2.png',
    'assets/images/objects/vehicles/cars/car_police_v3.png'
];

const BUSES = [
    'assets/images/objects/vehicles/buses/bus_red_double_v1.png',
    'assets/images/objects/vehicles/buses/bus_red_double_v2.png',
    'assets/images/objects/vehicles/buses/bus_red_double_v3.png',
    'assets/images/objects/vehicles/buses/bus_school_v1.png',
    'assets/images/objects/vehicles/buses/bus_school_v2.png',
    'assets/images/objects/vehicles/buses/bus_school_v3.png'
];

const TREES = [
    'assets/images/objects/nature/trees/tree_evergreen_v1.png',
    'assets/images/objects/nature/trees/tree_evergreen_v2.png',
    'assets/images/objects/nature/trees/tree_evergreen_v3.png',
    'assets/images/objects/nature/trees/tree_autumn_v1.png',
    'assets/images/objects/nature/trees/tree_autumn_v2.png',
    'assets/images/objects/nature/trees/tree_autumn_v3.png',
    'assets/images/objects/nature/trees/tree_cherry_blossom_v1.png',
    'assets/images/objects/nature/trees/tree_cherry_blossom_v2.png',
    'assets/images/objects/nature/trees/tree_cherry_blossom_v3.png'
];

const CAFE_TABLES = [
    'assets/images/objects/landmarks/paris/paris_cafe_table_v1.png',
    'assets/images/objects/landmarks/paris/paris_cafe_table_v2.png',
    'assets/images/objects/landmarks/paris/paris_cafe_table_v3.png'
];

const DEFAULT_DECOR_RULES: DecorKeywordRule[] = [
    { keywords: ['trash', 'bin'], paths: STREET_TRASH, defaultHeight: 140 },
    { keywords: ['mail', 'mailbox'], paths: MAILBOXES, defaultHeight: 200 },
    { keywords: ['stop'], paths: STOP_SIGNS, defaultHeight: 250 },
    { keywords: ['traffic'], paths: TRAFFIC_LIGHTS, defaultHeight: 330 },
    { keywords: ['bus'], paths: BUSES, defaultHeight: 240 },
    { keywords: ['car', 'taxi', 'police_car'], paths: CARS, defaultHeight: 190 },
    { keywords: ['tree'], paths: TREES, defaultHeight: 320 },
    { keywords: ['table', 'cafe_table'], paths: CAFE_TABLES, defaultHeight: 170 }
];

function pickDecor(theme: LocationTheme | undefined, propId: string): ThemedPropAsset | null {
    const id = propId.toLowerCase();
    for (const rule of DEFAULT_DECOR_RULES) {
        if (rule.keywords.some((keyword) => id.includes(keyword))) {
            return pickAsset(`${theme ?? 'default'}|decor|${propId}|${rule.keywords[0]}`, rule.paths, rule.defaultHeight);
        }
    }

    // Theme-driven fallbacks.
    if (theme === 'park_outdoor') {
        return pickAsset(`${theme}|decor|${propId}|trees`, TREES, 320);
    }
    if (theme === 'warehouse') {
        return pickAsset(`${theme}|decor|${propId}|vehicles`, [...BUSES, ...CARS], 220);
    }
    return pickAsset(`${theme ?? 'default'}|decor|${propId}|street`, [...STREET_TRASH, ...MAILBOXES, ...STOP_SIGNS], 170);
}

export function resolveThemedPropAsset(theme: LocationTheme | undefined, type: PropType, propId: string): ThemedPropAsset | null {
    if (!propId) return null;

    switch (type) {
        case 'lamp':
            return pickAsset(`${theme ?? 'default'}|lamp|${propId}`, STREET_LAMPS, 280);
        case 'bench':
            return pickAsset(`${theme ?? 'default'}|bench|${propId}`, PARK_BENCHES, 160);
        case 'decor':
            return pickDecor(theme, propId);
        default:
            return null;
    }
}
