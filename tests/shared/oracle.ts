import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseFile } from '@axiapps/axilog';
import type { ReportV1, EntityOut } from '@axiapps/axilog/types';
import type { EiJson } from './ei/types';
import { PARSE_OPTS } from '../../src/main/axilogParser';

const FIXTURES = join(__dirname, '..', 'fixtures');

// PARSE_OPTS is production's, imported rather than restated: a copy here
// could drift from src/main/axilogParser.ts and every oracle would keep
// passing against options the app no longer uses.
export { PARSE_OPTS };

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

/**
 * An entity's account name, or a throw.
 *
 * `EntityOut.account` is `string | undefined` ("present exactly for player
 * roles"), and every oracle in this tree that collects a mismatch list
 * pushes it as the failure label. Pushing `undefined` would print
 * `[undefined]` in a diff and lose the very identity the list exists to
 * report -- and, worse, `find(p => p.account === e.account)` against an
 * undefined would match nothing and silently skip the entity, which is a
 * vacuous pass rather than a failure.
 *
 * Added by Task 11 with `tsconfig.tests.json`, the first typecheck this test
 * tree has ever been under. Until then these were 21 unchecked
 * `string | undefined`s.
 */
export function accountOf(e: EntityOut): string {
    if (e.account === undefined) {
        throw new Error(`oracle: entity ${e.id} (role ${e.role}) has no account name`);
    }
    return e.account;
}
