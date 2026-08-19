import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseFile } from '@axiapps/axilog';
import type { ReportV1 } from '@axiapps/axilog/types';
import type { EiJson } from '../../src/shared/types';

const FIXTURES = join(__dirname, '..', 'fixtures');

/** The exact options this app parses with in production. Keep in sync
 *  with src/main/axilogParser.ts — the coverage test guards the drift. */
export const PARSE_OPTS = {
    replay: true,
    skillDamage: true,
    timeseries: true,
    rotation: true,
} as const;

let cachedNative: ReportV1 | null = null;

/** The frozen Elite Insights output — the equality oracle's left-hand side. */
export function loadEiFixture(): EiJson {
    return JSON.parse(readFileSync(join(FIXTURES, 'wvw.ei.json'), 'utf8')) as EiJson;
}

/** The native document for the same log — the oracle's right-hand side.
 *  Parsed once per test *file* — vitest's forked pool gives each file its
 *  own module graph, so the ~0.3s parse is paid once per importing file. */
export function loadNativeFixture(): ReportV1 {
    if (!cachedNative) {
        cachedNative = parseFile(join(FIXTURES, 'wvw.zevtc'), PARSE_OPTS) as ReportV1;
    }
    return cachedNative;
}
