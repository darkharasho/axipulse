// Access check: blocks the app when the account or guild that recorded a log
// is on the Axi denylist. See README "Access".
import { createAccessGate, createConfig, gw2GuildIdentity, type AccessGate, type AxiConfig, type Identity } from '@axiapps/axi-config'
import { blockIfTripped, handleBlocked, type ElectronLike, type RelaunchableApp } from '@axiapps/axi-config/electron'
import type { ReportV1 } from '../shared/report'

export interface AccessDeps {
    electron: ElectronLike & { app: RelaunchableApp & { getPath(name: 'userData'): string } }
    config?: AxiConfig // tests inject one; production creates it
    onBlocked?: (info: { persisted: boolean }) => void // tests inject a spy
}

export type AccessBoot = { blocked: true } | { blocked: false; gate: AccessGate; config: AxiConfig }

export async function startAccess(deps: AccessDeps): Promise<AccessBoot> {
    const config = deps.config ?? createConfig({ appId: 'axipulse', cacheDir: deps.electron.app.getPath('userData') })
    await config.ready()
    if (blockIfTripped(deps.electron, config)) return { blocked: true }
    const gate = createAccessGate({
        config,
        onBlocked: deps.onBlocked ?? ((info) => handleBlocked(deps.electron, config, info)),
    })
    // No settings-based sources: identities come from each parsed log's recorder.
    config.onChange(() => void gate.recheck())
    void gate.recheck()
    return { blocked: false, gate, config }
}

/**
 * The recording player's account and guild only, never any other entity.
 * Returns [] when the recorder is absent (does not throw).
 */
export function recorderIdentities(report: ReportV1): Identity[] {
    const recordedBy = report?.encounter?.recorded_by as unknown
    if (typeof recordedBy !== 'number' || !Array.isArray(report.entities)) return []
    const entity = report.entities.find(e => e.id === recordedBy)
    if (!entity) return []
    const out: Identity[] = []
    if (typeof entity.account === 'string' && entity.account) out.push({ kind: 'gw2_account', value: entity.account })
    out.push(...gw2GuildIdentity(entity.guild_id))
    return out
}
