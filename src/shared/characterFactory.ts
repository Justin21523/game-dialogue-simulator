import charactersJson from '../../data/characters.json';

import { GAME_CONFIG, type CharacterId } from './gameConfig';
import type { CharacterState } from './types/Game';

type CharactersJson = {
    characters: Record<
        string,
        {
            id: string;
            name: string;
            stats?: {
                speed?: number;
                reliability?: number;
            };
        }
    >;
};

const typedCharactersJson = charactersJson as unknown as CharactersJson;

export function createInitialCharacters(): CharacterState[] {
    const characters: CharacterState[] = [];

    for (const characterId of Object.keys(GAME_CONFIG.CHARACTERS) as CharacterId[]) {
        const configEntry = GAME_CONFIG.CHARACTERS[characterId];
        const jsonEntry = typedCharactersJson.characters?.[characterId];
        const speed = jsonEntry?.stats?.speed ?? 5;
        const reliability = jsonEntry?.stats?.reliability ?? 80;

        characters.push({
            id: characterId,
            name: configEntry.name,
            type: configEntry.type,
            color: configEntry.color,
            level: 1,
            exp: 0,
            energy: 100,
            speed,
            reliability,
            status: 'IDLE'
        });
    }

    return characters;
}
