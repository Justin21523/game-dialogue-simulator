export type CharacterProfileVariant = 'heroic' | 'ready' | 'flying' | 'smile';

const VARIANT_FILENAME: Record<CharacterProfileVariant, string> = {
    heroic: 'heroic_pose_v1.png',
    ready: 'ready_stance_v1.png',
    flying: 'flying_pose_v1.png',
    smile: 'happy_v2.png'
};

export function getCharacterGridPortraitSrc(charId: string): string {
    return `assets/images/characters/${charId}/all/action_pose_v1.png`;
}

export function getCharacterProfileSrc(charId: string, variant: CharacterProfileVariant): string {
    return `assets/images/characters/${charId}/all/${VARIANT_FILENAME[variant]}`;
}

export type SequenceManifest = {
    total_images?: number;
    images?: Array<{ index: number; path: string }>;
};

export async function loadCharacterSequenceFrames(charId: string): Promise<string[]> {
    const manifestPath = `assets/images/characters/${charId}/animation_sequence/sequence_manifest.json`;
    const res = await fetch(manifestPath);
    if (!res.ok) return [];
    const manifest = (await res.json()) as SequenceManifest;
    const frames = (manifest.images || []).map((img) => `assets/images/characters/${charId}/animation_sequence/${img.path}`);
    return frames;
}

