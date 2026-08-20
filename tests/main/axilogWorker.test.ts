import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import { handleParseRequest } from '../../src/main/axilogWorker';

const FIXTURE = join(__dirname, '..', 'fixtures', 'wvw.zevtc');

// The worker module is imported here in plain Node -- no utilityProcess, no
// `process.parentPort`. That it imports at all is part of what this file
// asserts: the transport binding is guarded, so the parse logic can be run
// for real rather than through a stand-in.
describe('handleParseRequest', () => {
    it('answers a request with the report, echoing the id it was given', () => {
        const response = handleParseRequest({ id: 7, path: FIXTURE });

        expect(response.id).toBe(7);
        expect(response.ok).toBe(true);
        if (!response.ok) throw new Error('unreachable: asserted ok above');
        expect(response.report.axilog.generated_from).toBe('wvw.zevtc');
        expect(response.report.entities.length).toBe(129);
    });

    it('parses with production PARSE_OPTS, not axilog defaults', () => {
        const response = handleParseRequest({ id: 1, path: FIXTURE });
        if (!response.ok) throw new Error(`expected a report, got: ${response.error}`);

        // One witness per option, each MEASURED to flip when that option is
        // turned off -- not assumed from its name. `coverage.replay` is
        // deliberately NOT used: it reads `present` either way, so asserting
        // it would have proved nothing about the `replay` option.
        //   skillDamage -> coverage.minions     present -> not_computed
        //   timeseries  -> coverage.conditions  present -> not_computed
        //   rotation    -> coverage.rotation    present -> empty
        //   replay      -> replay block keeps dist_to_com / stack_dist, the
        //                  numbers the Map and distance-to-tag views need
        expect(response.report.coverage.minions).toBe('present');
        expect(response.report.coverage.conditions).toBe('present');
        expect(response.report.coverage.rotation).toBe('present');
        const selfReplay = response.report.blocks.replay?.by_entity['0'];
        expect(typeof selfReplay?.dist_to_com).toBe('number');
        expect(typeof selfReplay?.stack_dist).toBe('number');

        // The control: this app does NOT request damage modifiers, and a
        // blanket "turn everything on" would flip this to `present`.
        expect(response.report.coverage.damage_mods).toBe('not_computed');
    });

    it('reports a parse failure as a reply rather than throwing', () => {
        // A throw here would escape into the utilityProcess message listener
        // and kill the worker, turning one bad log into a dead parse path.
        const response = handleParseRequest({ id: 42, path: '/nonexistent.zevtc' });

        expect(response.id).toBe(42);
        expect(response.ok).toBe(false);
        if (response.ok) throw new Error('unreachable: asserted not ok above');
        expect(response.error).toMatch(/No such file or directory/);
    });
});
