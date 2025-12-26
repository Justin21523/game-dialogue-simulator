import { LocationScene } from './LocationScene';

export class BaseLocationScene extends LocationScene {
    constructor() {
        super({ key: 'BaseLocationScene' });
    }

    protected getDefaultLocationId(): string {
        return 'base_airport';
    }
}

