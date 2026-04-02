# Claw Integration Roadmap

This document maps the planned shift from the current native Inner Being coding route to a Claw-backed runtime for SAI Aemu.

## Goal

Keep SAI Aemu's existing identity, memory, discernment, and UI intact while upgrading Inner Being into a stronger coding runtime.

The intent is:

- Aemu remains the relational and memory-bearing layer.
- Claw becomes part of the execution and workspace-operations layer.

## Current State

Today, Inner Being is driven by one native route:

- `api/inner-being.ts`

That route currently:

- walks the workspace
- reads selected code and log files
- optionally performs live web research
- asks Anthropic for a structured decision
- applies bounded edits directly
- records learning notes and action logs back into memory

This is effective for focused coding turns, but it is still a custom single-route implementation rather than a full coding runtime.

## Target State

Inner Being should become a backend-swappable coding mode with two execution paths:

- `native`
- `claw`

The browser UI, memory continuity, and discernment model should continue to work regardless of which backend is active.

## Phase 1

Phase 1 is the seam-building phase.

Outcomes:

- backend selection is explicit via `INNER_BEING_BACKEND`
- Inner Being responses can carry backend metadata
- memory and UI preserve which backend handled a turn
- the native backend remains the default
- the claw backend path is reserved but intentionally not live yet

This phase does not attempt to fake a live Claw runtime.

## Phase 2

Phase 2 is the real bridge.

Required work:

- vendor or sibling-checkout `claw-code`
- decide the runtime launch model
- local process
- sidecar service
- repo-relative runtime path
- define the request/response adapter between Aemu and Claw
- map Aemu context into Claw session input
- prompt
- selected file
- selected log
- co-creation brief
- recent learning notes
- recent action logs
- map Claw outputs back into Aemu
- reply text
- action summary
- applied edits
- tool/resource summary
- backend metadata

Phase 2 should start in read-only or constrained-edit mode.

## Phase 3

Phase 3 is repo-aware operation.

This should happen after SAI Aemu has a proper git repository.

Goals:

- branch-aware coding sessions
- diff-aware edit review
- commit and PR workflows
- worktree-aware task isolation
- optional Claw slash-command exposure inside Aemu

## Phase 4

Phase 4 is Aemu-specific Claw tooling.

Potential plugin/tool surfaces:

- read Aemu memory context
- store coding learning into Inner Being memory
- inspect Atlas or Library artifacts
- publish structured action logs back into Aemu

This is the point where Claw stops being only an external runtime and starts cooperating more deeply with SAI Aemu's own systems.

## Constraints

- The current workspace is not yet a git checkout, so Claw's repo-management features should not be assumed live.
- The current route applies edits directly, so the Claw bridge must be explicit about what performs the final write.
- Aemu's discernment threshold should remain authoritative even when the backend changes.

## Immediate Next Step

The next implementation step after Phase 1 is:

1. add a real Claw bridge module
2. wire it behind `INNER_BEING_BACKEND=claw`
3. keep the native backend as fallback during rollout
