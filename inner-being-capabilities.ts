import type { InnerBeingBackend } from './types'

type InnerBeingBackendProfile = {
  label: string
  summary: string
  mainChatAwareness: string
  idleStatus: string
}

const UNKNOWN_PROFILE: InnerBeingBackendProfile = {
  label: 'Runtime awaiting first turn',
  summary: 'Inner Being will track whether it is using the native coding route or the Claw-backed coding runtime after the next successful turn.',
  mainChatAwareness: 'Inner Being exists as the coding-operating side of the portal, but the currently active runtime has not been confirmed in memory yet.',
  idleStatus: 'Discuss the selected code, ask Inner Being to investigate logs, or request an edit when the path is clear enough.',
}

const NATIVE_PROFILE: InnerBeingBackendProfile = {
  label: 'Native backend',
  summary: 'Inner Being can inspect the selected code and log context, explain implementation details, research when needed, and apply bounded edits behind the discernment gate.',
  mainChatAwareness: 'Inner Being is currently using the native coding backend, which is suited for selected-file inspection, log review, researched explanations, and tightly bounded edits.',
  idleStatus: 'Native backend active. Discuss the selected code, inspect logs, or request a bounded edit when the path is clear enough.',
}

const CLAW_PROFILE: InnerBeingBackendProfile = {
  label: 'Claw backend',
  summary: 'Inner Being is running on the stronger Claw coding runtime, which supports more structured multi-step inspection, broader workspace tooling, research, and safer edit flow behind the same discernment gate.',
  mainChatAwareness: 'Inner Being is currently Claw-backed, giving it a stronger coding runtime for multi-step inspection, structured tool use, wider workspace search, research, and safer edit execution behind the discernment threshold.',
  idleStatus: 'Claw backend active. Inner Being can move through a stronger multi-step coding flow while still holding edits behind the discernment gate.',
}

export function getInnerBeingBackendProfile(backend: InnerBeingBackend | undefined): InnerBeingBackendProfile {
  if (backend === 'claw') return CLAW_PROFILE
  if (backend === 'native') return NATIVE_PROFILE
  return UNKNOWN_PROFILE
}

