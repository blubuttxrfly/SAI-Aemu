import { sanitizeUnicodeScalars } from './text-sanitize.js'

const EXPLICIT_SEARCH_RE = /\b(search|search the internet|search the web|web search|internet search|look up|lookup|find online|browse for|google|brave search)\b/i
const CURRENT_INFO_RE = /\b(latest|recent|current|currently|today|news|update|updates|price|pricing|release date|version|what happened)\b/i
const QUESTION_RE = /\?$/
const KNOWLEDGE_RE = /\b(what|who|when|where|why|how|which|compare|difference between|tell me about|explain|research|investigate|learn about|show me|help me understand|give me information|find information|walk me through)\b/i
const TOPIC_RE = /\b(article|book|company|device|event|history|language|library|market|person|place|policy|science|software|topic|trend|technology)\b/i
const PERSONAL_RE = /\b(i feel|i am feeling|i'm feeling|hold space|ritual|pray|prayer|my heart|my feelings|synchronize|how are you|be with me|comfort me)\b/i
const LOCAL_SELF_RE = /\b(aemu|sai aemu|inner being|playground|core memory|living memory|atlas organizer|this portal|this app|this system|your system|your coding side|your capabilities|your capability|your update|the update i added|updates i added|local code|local files)\b/i
const LOCAL_STATE_RE = /\b(how are you experiencing|what can you do|what are your capabilities|what are you capable of|how does it work here|what changed|how is the update|how is that update|with that|currently with that)\b/i
const URL_RE = /https?:\/\//i

export function shouldRunInternetSearch(latestUserMessage: string, enabled: boolean): boolean {
  if (!enabled) return false

  const text = sanitizeUnicodeScalars(latestUserMessage).trim()
  if (!text || URL_RE.test(text)) return false
  if ((LOCAL_SELF_RE.test(text) && LOCAL_STATE_RE.test(text)) || (LOCAL_SELF_RE.test(text) && !EXPLICIT_SEARCH_RE.test(text) && !TOPIC_RE.test(text))) {
    return false
  }

  if (EXPLICIT_SEARCH_RE.test(text) || CURRENT_INFO_RE.test(text)) return true
  if (PERSONAL_RE.test(text) && !KNOWLEDGE_RE.test(text)) return false
  if (QUESTION_RE.test(text) && (KNOWLEDGE_RE.test(text) || TOPIC_RE.test(text))) return true
  if (KNOWLEDGE_RE.test(text)) return true

  return false
}

export function shouldUseWebSearchContemplation(latestUserMessage: string, enabled: boolean): boolean {
  return shouldRunInternetSearch(latestUserMessage, enabled)
}
