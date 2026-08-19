// src/shared/movementFrame.ts
//
// The consumer half of `SquadMemberMovement.positionsStartMs`.
//
// These live in `src/shared/` rather than inside `MovementView.tsx` for one
// reason: they are the code that turns an absolute fight time into an index
// into ONE member's own position array, and getting that wrong is the most
// expensive recurring bug in this migration -- an index join has now been
// found four separate times. Pure functions in a renderer file are untestable
// in practice (nothing under `tests/` imports a `.tsx`), and an untested join
// is exactly how the previous three survived.
//
// `tests/shared/extract/movement.test.ts` exercises all three against the
// real fixture. That claim was false for `lerpPos` until this round: only
// `memberFrame`/`memberPosAt` were covered, and the consumer's oracle called
// `memberPosAt` on BOTH sides of its comparison, so `lerpPos` returning `a`
// unconditionally -- never interpolating at all -- survived the whole suite.
// It now has its own describe block with a real midpoint assertion.
import type { SquadMemberMovement } from './types';

/** Linear interpolation between `positions[index]` and its successor. */
export function lerpPos(
    positions: [number, number][],
    index: number,
    frac: number,
): [number, number] {
    const a = positions[index];
    if (frac === 0 || index >= positions.length - 1) return a;
    const b = positions[index + 1];
    return [a[0] + (b[0] - a[0]) * frac, a[1] + (b[1] - a[1]) * frac];
}

/**
 * Where a member's own position array sits at absolute fight time `timeMs`.
 *
 * Tracks do NOT share a start tick -- see `SquadMemberMovement.positionsStartMs`,
 * and measured on this app's fixture: 93 tracks with ten distinct start
 * instants, one at t=0, 82 at t=300 and ten between t=30000 and t=100800. So
 * index `i` means `positionsStartMs + i * pollingRate`, which is a DIFFERENT
 * instant for different members, and the offset has to be subtracted before
 * the division. Dropping it draws the member with the latest start 100.8
 * seconds ahead of themselves.
 *
 * `null` means the log has no position for this member yet -- they had not
 * joined the fight -- and the caller draws nothing rather than pinning them
 * to wherever they first appeared, which would put a phantom marker on the
 * map for the whole pre-join window. After a member's last sample the frame
 * clamps to it.
 */
export function memberFrame(
    m: SquadMemberMovement,
    timeMs: number,
    pollingRate: number,
): { idx: number; frac: number } | null {
    const maxIdx = m.positions.length - 1;
    if (maxIdx < 0) return null;
    const rel = (timeMs - m.positionsStartMs) / pollingRate;
    if (rel < 0) return null;
    const clamped = Math.min(rel, maxIdx);
    const idx = Math.min(Math.floor(clamped), maxIdx);
    return { idx, frac: idx < maxIdx ? clamped - idx : 0 };
}

/** The member's interpolated position at `timeMs`, or `null` before their
 *  track begins. */
export function memberPosAt(
    m: SquadMemberMovement,
    timeMs: number,
    pollingRate: number,
): [number, number] | null {
    const f = memberFrame(m, timeMs, pollingRate);
    return f ? lerpPos(m.positions, f.idx, f.frac) : null;
}
