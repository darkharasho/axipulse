// Self-contained module — no AxiPulse-specific dependencies.
// Designed for portability to axibridge or a shared package.

export enum WvwMap {
    EternalBattlegrounds = 'EternalBattlegrounds',
    GreenBorderlands = 'GreenBorderlands',
    BlueBorderlands = 'BlueBorderlands',
    RedBorderlands = 'RedBorderlands',
}

export interface WvwLandmark {
    name: string;
    x: number;
    y: number;
    type: 'keep' | 'tower' | 'camp' | 'ruins' | 'named';
}

// Coordinates are in EI combatReplayData pixel space.
export const WVW_LANDMARKS: Record<WvwMap, WvwLandmark[]> = {
    [WvwMap.EternalBattlegrounds]: [
        { name: 'Stonemist Castle', x: 12288, y: 12288, type: 'keep' },
        { name: 'Green Keep', x: 9000, y: 16000, type: 'keep' },
        { name: 'Blue Keep', x: 16000, y: 16000, type: 'keep' },
        { name: 'Red Keep', x: 12288, y: 8500, type: 'keep' },
        { name: 'Speldan Clearcut', x: 8500, y: 10000, type: 'tower' },
        { name: 'Danelon Passage', x: 10000, y: 8500, type: 'tower' },
        { name: 'Umberglade Woods', x: 14500, y: 8500, type: 'tower' },
        { name: 'Durios Gulch', x: 16000, y: 10000, type: 'tower' },
        { name: 'Bravost Escarpment', x: 16000, y: 14500, type: 'tower' },
        { name: 'Langor Gulch', x: 14500, y: 16000, type: 'tower' },
        { name: 'Quentin Lake', x: 10000, y: 16000, type: 'tower' },
        { name: 'Mendons Gap', x: 8500, y: 14500, type: 'tower' },
        { name: 'Golanta Clearing', x: 7500, y: 12000, type: 'camp' },
        { name: 'Pangloss Rise', x: 10000, y: 7500, type: 'camp' },
        { name: 'Valley of Ogrewatch', x: 14500, y: 7500, type: 'camp' },
        { name: 'Duerfield Valley', x: 17000, y: 12000, type: 'camp' },
        { name: 'Anzalias Pass', x: 14500, y: 17000, type: 'camp' },
        { name: 'Ogrewatch Cut', x: 10000, y: 17000, type: 'camp' },
        { name: 'Temple of Lost Prayers', x: 12288, y: 10500, type: 'ruins' },
        { name: 'Battle Hollow', x: 10500, y: 13000, type: 'ruins' },
        { name: 'Carvers Ascent', x: 14000, y: 13000, type: 'ruins' },
    ],
    [WvwMap.GreenBorderlands]: [
        { name: 'Garrison', x: 12288, y: 12288, type: 'keep' },
        { name: 'Bay', x: 8500, y: 9500, type: 'keep' },
        { name: 'Hills', x: 16000, y: 9500, type: 'keep' },
        { name: 'Ascension Bay Tower', x: 9500, y: 7500, type: 'tower' },
        { name: 'Woodhaven Tower', x: 15000, y: 7500, type: 'tower' },
        { name: 'Dawns Eyrie Tower', x: 10000, y: 15000, type: 'tower' },
        { name: 'Redvale Refuge Tower', x: 14500, y: 15000, type: 'tower' },
        { name: 'Faithleap Camp', x: 12288, y: 7000, type: 'camp' },
        { name: 'Bluevale Refuge Camp', x: 7500, y: 12288, type: 'camp' },
        { name: 'Greenwater Lowlands Camp', x: 17000, y: 12288, type: 'camp' },
        { name: 'Gods Eye Camp', x: 12288, y: 17000, type: 'camp' },
    ],
    [WvwMap.BlueBorderlands]: [
        { name: 'Garrison', x: 12288, y: 12288, type: 'keep' },
        { name: 'Bay', x: 8500, y: 9500, type: 'keep' },
        { name: 'Hills', x: 16000, y: 9500, type: 'keep' },
        { name: 'Ascension Bay Tower', x: 9500, y: 7500, type: 'tower' },
        { name: 'Woodhaven Tower', x: 15000, y: 7500, type: 'tower' },
        { name: 'Dawns Eyrie Tower', x: 10000, y: 15000, type: 'tower' },
        { name: 'Redvale Refuge Tower', x: 14500, y: 15000, type: 'tower' },
        { name: 'Faithleap Camp', x: 12288, y: 7000, type: 'camp' },
        { name: 'Bluevale Refuge Camp', x: 7500, y: 12288, type: 'camp' },
        { name: 'Greenwater Lowlands Camp', x: 17000, y: 12288, type: 'camp' },
        { name: 'Gods Eye Camp', x: 12288, y: 17000, type: 'camp' },
    ],
    [WvwMap.RedBorderlands]: [
        { name: 'Garrison', x: 12288, y: 12288, type: 'keep' },
        { name: 'Bay', x: 8500, y: 9500, type: 'keep' },
        { name: 'Hills', x: 16000, y: 9500, type: 'keep' },
        { name: 'Ascension Bay Tower', x: 9500, y: 7500, type: 'tower' },
        { name: 'Woodhaven Tower', x: 15000, y: 7500, type: 'tower' },
        { name: 'Dawns Eyrie Tower', x: 10000, y: 15000, type: 'tower' },
        { name: 'Redvale Refuge Tower', x: 14500, y: 15000, type: 'tower' },
        { name: 'Faithleap Camp', x: 12288, y: 7000, type: 'camp' },
        { name: 'Bluevale Refuge Camp', x: 7500, y: 12288, type: 'camp' },
        { name: 'Greenwater Lowlands Camp', x: 17000, y: 12288, type: 'camp' },
        { name: 'Gods Eye Camp', x: 12288, y: 17000, type: 'camp' },
    ],
};

export function findNearestLandmark(map: WvwMap, x: number, y: number): WvwLandmark | null {
    const landmarks = WVW_LANDMARKS[map];
    if (!landmarks || landmarks.length === 0) return null;

    let nearest = landmarks[0];
    let minDist = Math.hypot(x - nearest.x, y - nearest.y);

    for (let i = 1; i < landmarks.length; i++) {
        const d = Math.hypot(x - landmarks[i].x, y - landmarks[i].y);
        if (d < minDist) {
            minDist = d;
            nearest = landmarks[i];
        }
    }

    return nearest;
}
