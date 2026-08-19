import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import { parseInProcess } from '../../src/main/axilogParser';

describe('parseInProcess', () => {
    it('parses the fixture to a native report', async () => {
        const r = await parseInProcess(join(__dirname, '..', 'fixtures', 'wvw.zevtc'));
        expect(r.axilog).toBeDefined();
        expect(r.entities.length).toBeGreaterThan(0);
        expect(r.coverage.series).toBe('present');

        // The three assertions above would pass on a report parsed from ANY
        // log, which is exactly the failure a parse path wired to the wrong
        // input produces. These identify THIS log: axilog stamps the source
        // filename into the document, and the roster is frozen.
        expect(r.axilog.generated_from).toBe('wvw.zevtc');
        expect(r.entities.length).toBe(129);
        const accounts = r.entities.map(e => e.account).filter(a => a !== undefined);
        expect(accounts.length).toBe(47);
        expect(accounts).toContain('Anon151.6587');
    });

    it('rejects with a message naming the parser and the path', async () => {
        // Anchored on `parseInProcess:` and the path. axilog's own message is
        // "No such file or directory (os error 2)" -- it names neither the
        // file nor the caller, so a bare `rejects.toThrow()` here would pass
        // on any rejection from anywhere in the module.
        await expect(parseInProcess('/nonexistent.zevtc')).rejects.toThrow(
            /parseInProcess: axilog failed to parse \/nonexistent\.zevtc/,
        );
    });
});
