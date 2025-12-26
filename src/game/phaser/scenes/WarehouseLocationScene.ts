import { LocationScene } from './LocationScene';

export class WarehouseLocationScene extends LocationScene {
    constructor() {
        super({ key: 'WarehouseLocationScene' });
    }

    protected getDefaultLocationId(): string {
        return 'warehouse_district';
    }
}

