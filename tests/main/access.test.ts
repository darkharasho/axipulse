import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createConfig, hashIdentity, type AxiConfig } from '@axiapps/axi-config'
import { startAccess, recorderIdentities } from '../../src/main/access'

const quiet = { warn: () => {} }
const GUILD = 'AAAAAAAA-1111-2222-3333-BBBBBBBBBBBB'

function report(entities: unknown[], recordedBy: number | null = 1): any {
    return { encounter: recordedBy === null ? {} : { recorded_by: recordedBy }, entities }
}
const me = { id: 1, account: 'Recorder.1234', guild_id: GUILD }
const other = { id: 2, account: 'Bystander.9999', guild_id: 'CCCCCCCC-1111-2222-3333-DDDDDDDDDDDD' }
const fixture = () => report([other, me])

const body = (denylist: string[]) =>
    new Response(JSON.stringify({ version: 1, flags: {}, minVersion: null, notice: null, denylist }), { status: 200, headers: { etag: '"v1"' } })

let dir: string
let configs: AxiConfig[] = []
beforeEach(async () => { dir = await mkdtemp(join(tmpdir(), 'axipulse-access-')) })
afterEach(async () => {
    for (const c of configs) c.close()
    configs = []
    await rm(dir, { recursive: true, force: true })
})

function make(denylist: string[] | 'offline') {
    const fetchFn = (async () => {
        if (denylist === 'offline') throw new Error('offline')
        return body(denylist)
    }) as typeof fetch
    const c = createConfig({ appId: 'axipulse', cacheDir: dir, url: 'https://cfg.test', fetch: fetchFn, logger: quiet })
    configs.push(c)
    return c
}

class FakeWindow {
    static all: FakeWindow[] = []
    destroyed = false
    url = ''
    constructor() { FakeWindow.all.push(this) }
    isDestroyed() { return this.destroyed }
    destroy() { this.destroyed = true }
    removeMenu() {}
    async loadURL(url: string) { this.url = url }
    on() { return this }
    webContents = { setWindowOpenHandler() {}, on() { return this.webContents } }
}
function fakeElectron() {
    return {
        app: { quit: vi.fn(), relaunch: vi.fn(), exit: vi.fn(), on: vi.fn(), getPath: () => dir },
        BrowserWindow: Object.assign(FakeWindow, { getAllWindows: () => FakeWindow.all.filter(w => !w.destroyed) }),
        shell: { openExternal: vi.fn(async () => {}) },
    } as any
}

describe('recorderIdentities', () => {
    it('returns the recorder account and guild', () => {
        expect(recorderIdentities(fixture())).toEqual([
            { kind: 'gw2_account', value: 'Recorder.1234' },
            { kind: 'gw2_guild', value: GUILD },
        ])
    })
    it('never matches another player\'s account', () => {
        const ids = recorderIdentities(fixture())
        expect(ids.some(i => i.value.toLowerCase().includes('bystander'))).toBe(false)
    })
    it('gives the account only when guild_id is missing', () => {
        expect(recorderIdentities(report([{ id: 1, account: 'Recorder.1234' }]))).toEqual([
            { kind: 'gw2_account', value: 'Recorder.1234' },
        ])
    })
    it('gives [] when the recorder entity is missing', () => {
        expect(recorderIdentities(report([other]))).toEqual([])
        expect(recorderIdentities(report([me], null))).toEqual([])
        expect(recorderIdentities({} as any)).toEqual([])
    })
})

describe('startAccess', () => {
    it('blocks at runtime when the recorder is listed, once', async () => {
        const h = await hashIdentity('gw2_account', 'Recorder.1234')
        const config = make([h])
        const onBlocked = vi.fn()
        const boot = await startAccess({ electron: fakeElectron(), config, onBlocked })
        expect(boot.blocked).toBe(false)
        if (boot.blocked) return
        await config.refresh()
        expect(await boot.gate.checkIdentities(recorderIdentities(fixture()))).toBe(true)
        await boot.gate.checkIdentities(recorderIdentities(fixture()))
        expect(onBlocked).toHaveBeenCalledTimes(1)
        expect(onBlocked).toHaveBeenCalledWith({ persisted: true })
    })

    it('blocks on a listed recorder guild', async () => {
        const config = make([await hashIdentity('gw2_guild', GUILD)])
        const onBlocked = vi.fn()
        const boot = await startAccess({ electron: fakeElectron(), config, onBlocked })
        if (boot.blocked) throw new Error('unexpected')
        await config.refresh()
        await boot.gate.checkIdentities(recorderIdentities(fixture()))
        expect(onBlocked).toHaveBeenCalledTimes(1)
    })

    it('does not block when a listed account is only another player', async () => {
        const config = make([await hashIdentity('gw2_account', 'Bystander.9999')])
        const onBlocked = vi.fn()
        const boot = await startAccess({ electron: fakeElectron(), config, onBlocked })
        if (boot.blocked) throw new Error('unexpected')
        await config.refresh()
        await boot.gate.checkIdentities(recorderIdentities(fixture()))
        expect(onBlocked).not.toHaveBeenCalled()
    })

    it('does not block clean identities', async () => {
        const config = make([await hashIdentity('gw2_account', 'Someone.0001')])
        const onBlocked = vi.fn()
        const boot = await startAccess({ electron: fakeElectron(), config, onBlocked })
        if (boot.blocked) throw new Error('unexpected')
        await config.refresh()
        await boot.gate.checkIdentities(recorderIdentities(fixture()))
        await boot.gate.recheck()
        expect(onBlocked).not.toHaveBeenCalled()
    })

    it('boots into the block screen when the sticky trip is set', async () => {
        const h = await hashIdentity('gw2_account', 'Recorder.1234')
        const first = make([h])
        await first.ready()
        await first.refresh()
        expect((await first.check(recorderIdentities(fixture()))).persisted).toBe(true)

        const electron = fakeElectron()
        const second = make([h])
        const boot = await startAccess({ electron, config: second })
        expect(boot.blocked).toBe(true)
        expect(FakeWindow.all.length).toBe(1)
    })

    it('fails open when offline with no cache', async () => {
        const config = make('offline')
        const onBlocked = vi.fn()
        const boot = await startAccess({ electron: fakeElectron(), config, onBlocked })
        expect(boot.blocked).toBe(false)
        if (boot.blocked) return
        await boot.gate.checkIdentities(recorderIdentities(fixture()))
        await boot.gate.recheck()
        expect(onBlocked).not.toHaveBeenCalled()
    })
})
