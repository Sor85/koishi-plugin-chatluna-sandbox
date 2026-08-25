import { stringify } from 'yaml'
import { projectModelEvidence } from './model-evidence'
import { matchPresetExpressionEvidence } from './presets/evidence-match'
import { parsePresetSourceDocument } from './presets/source-document'
import type { PresetSourceDocument } from './presets/types'
import type {
  SandboxModelRequestRecord,
  SandboxModelRequestVariable,
  SandboxPresetRuntimeSnapshot,
} from './types'

export function deriveModelRequestVariables(
  record: Pick<SandboxModelRequestRecord, 'requestBody' | 'responseBodyRaw' | 'responseBodyFormat' | 'presetSnapshots'>,
): SandboxModelRequestVariable[] {
  if (!record.presetSnapshots?.length || record.requestBody === undefined) return []
  const evidence = projectModelEvidence({
    requestBody: record.requestBody,
    responseBodyRaw: record.responseBodyRaw,
    responseBodyFormat: record.responseBodyFormat,
  })
  const messages = new Map(evidence.requestMessages.map((message) => [message.evidenceId, message]))

  return record.presetSnapshots.flatMap((snapshot, snapshotIndex) => {
    const document = documentFromRuntimeSnapshot(snapshot)
    return document.expressions
      .filter((expression) => expression.kind === 'value')
      .map((expression): SandboxModelRequestVariable => {
        const matched = matchPresetExpressionEvidence({ document, expression, snapshot, evidence })
        const base = {
          id: `${snapshot.kind}:${snapshotIndex}:${JSON.stringify(expression.path)}#${expression.occurrence}`,
          name: expression.content.trim(),
          presetKind: snapshot.kind,
          presetName: snapshot.presetName,
          path: expression.path,
          occurrence: expression.occurrence,
        }
        if (matched.status !== 'matched') return { ...base, status: matched.status }
        const message = messages.get(matched.evidenceId)
        if (!message || matched.range.start < 0 || matched.range.end < matched.range.start
          || matched.range.end > message.text.length) {
          return { ...base, status: 'not-observed' }
        }
        return {
          ...base,
          status: 'observed',
          value: message.text.slice(matched.range.start, matched.range.end),
          evidenceId: matched.evidenceId,
          range: matched.range,
        }
      })
  })
}

function documentFromRuntimeSnapshot(snapshot: SandboxPresetRuntimeSnapshot): PresetSourceDocument {
  if (snapshot.kind === 'character') {
    const fields = Object.fromEntries(snapshot.templates.flatMap((template) => (
      (template.path[0] === 'system' || template.path[0] === 'input')
        ? [[template.path[0], template.template]]
        : []
    )))
    return parsePresetSourceDocument('character', stringify(fields))
  }

  const prompts: Array<{ role: string, content: string } | undefined> = []
  let formatUserPrompt: string | undefined
  for (const template of snapshot.templates) {
    if (template.path[0] === 'format_user_prompt') {
      formatUserPrompt = template.template
      continue
    }
    const index = template.path[0] === 'prompts' && typeof template.path[1] === 'number'
      ? template.path[1]
      : undefined
    if (index !== undefined) prompts[index] = { role: template.role, content: template.template }
  }
  return parsePresetSourceDocument('core', stringify({
    prompts: prompts.map((prompt) => prompt ?? {}),
    ...(formatUserPrompt !== undefined ? { format_user_prompt: formatUserPrompt } : {}),
  }))
}
