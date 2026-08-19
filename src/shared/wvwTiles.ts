import { WvwMap } from './wvwLandmarks';

interface WvwMapTileData {
    continentRect: [[number, number], [number, number]];
    pixelSize: [number, number];
    pixelOffset: [number, number];
}

const CONTINENT_ID = 2;
const FLOOR_ID = 3;
const MAX_TILE_ZOOM = 7;
const TILE_SIZE = 256;

// pixelOffset: shift applied to tile positions to align with EI's pixel coordinate space.
// Derived from the difference between GW2 API-computed landmark positions and
// manually calibrated EI-aligned positions.
const WVW_TILE_DATA: Record<WvwMap, WvwMapTileData> = {
    [WvwMap.EternalBattlegrounds]: {
        continentRect: [[8958, 12798], [12030, 15870]],
        pixelSize: [716, 750],
        pixelOffset: [-14, 20],
    },
    [WvwMap.GreenBorderlands]: {
        continentRect: [[5630, 11518], [8190, 15102]],
        pixelSize: [523, 750],
        pixelOffset: [0, 0],
    },
    [WvwMap.BlueBorderlands]: {
        continentRect: [[12798, 10878], [15358, 14462]],
        pixelSize: [523, 750],
        pixelOffset: [0, 0],
    },
    [WvwMap.RedBorderlands]: {
        continentRect: [[9214, 8958], [12286, 12030]],
        pixelSize: [750, 750],
        pixelOffset: [0, 0],
    },
};

export interface TileInfo {
    url: string;
    x: number;
    y: number;
    width: number;
    height: number;
}

/**
 * Tile rects for one WvW map, in the same squeezed combat-replay pixel space
 * `SquadMemberMovement.positions` and `WVW_LANDMARKS` use.
 *
 * `pixelSize` overrides the table entry when the caller has the log's
 * `blocks.replay.tracks.arena` -- run it through `arenaPixelSize` in
 * `extract/movement.ts`. The document is the better source: the table's
 * per-map sizes were transcribed by hand, while `arena` travels with the
 * positions being plotted, so an override guarantees the tiles and the
 * markers cannot disagree even if the two ever drift apart.
 *
 * They do not disagree today, and `tests/shared/extract/movement.test.ts`
 * pins that FOR GREEN ALPINE, the only map with an `arena` in the fixture:
 * 697x1000 squeezed to a 750px maximum dimension is 522.75x750, which rounds
 * to the table's [523, 750]. The other three entries are unpinned against an
 * arena and remain hand-transcribed. `continentRect` has no counterpart in
 * `arena` (it is GW2 continent space, not world space) and stays tabular --
 * every one of the four rects is verified against that map's
 * `continent_rect` from `https://api.guildwars2.com/v2/maps/<id>`.
 */
export function getMapTiles(
    map: WvwMap,
    tileZoom: number,
    pixelSize?: [number, number],
): TileInfo[] {
    const data = WVW_TILE_DATA[map];
    if (!data) return [];

    const [[cx1, cy1], [cx2, cy2]] = data.continentRect;
    const [pw, ph] = pixelSize ?? data.pixelSize;
    const [ox, oy] = data.pixelOffset;
    const cw = cx2 - cx1;
    const ch = cy2 - cy1;

    const tileSpan = TILE_SIZE * Math.pow(2, MAX_TILE_ZOOM - tileZoom);

    const txMin = Math.floor(cx1 / tileSpan);
    const tyMin = Math.floor(cy1 / tileSpan);
    const txMax = Math.floor((cx2 - 1) / tileSpan);
    const tyMax = Math.floor((cy2 - 1) / tileSpan);

    const tiles: TileInfo[] = [];
    for (let ty = tyMin; ty <= tyMax; ty++) {
        for (let tx = txMin; tx <= txMax; tx++) {
            const tileCx = tx * tileSpan;
            const tileCy = ty * tileSpan;

            const px = (tileCx - cx1) / cw * pw + ox;
            const py = (tileCy - cy1) / ch * ph + oy;
            const tileW = tileSpan / cw * pw;
            const tileH = tileSpan / ch * ph;

            tiles.push({
                url: `https://tiles.guildwars2.com/${CONTINENT_ID}/${FLOOR_ID}/${tileZoom}/${tx}/${ty}.jpg`,
                x: px,
                y: py,
                width: tileW,
                height: tileH,
            });
        }
    }

    return tiles;
}

/**
 * The hand-transcribed combat-replay pixel size for a map, for a log whose
 * `blocks.replay.tracks.arena` is absent (no positions to plot, but the
 * landmark overlay still has a coordinate space).
 *
 * Prefer `arenaPixelSize(arena)` -- `PlayerFightData.mapSize` -- whenever it
 * is available: it travels with the positions being plotted. This exists so
 * the renderer stops carrying bare `?? 523` / `?? 750` literals, which were
 * Alpine's numbers applied to every map including EBG (716x750) and Red
 * Desert (750x750).
 */
export function getMapPixelSize(map: WvwMap): [number, number] {
    return WVW_TILE_DATA[map].pixelSize;
}

export function hasTileData(map: WvwMap): boolean {
    return map in WVW_TILE_DATA;
}
