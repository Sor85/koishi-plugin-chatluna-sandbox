import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { SandboxModelRequestStore } from '../src/model-request'
import { SandboxPresetService } from '../src/presets'

const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})

async function createService() {
  const baseDir = await mkdtemp(join(tmpdir(), 'chatluna-sandbox-preset-service-'))
  temporaryDirectories.push(baseDir)
  const coreRoot = join(baseDir, 'data/chathub/presets')
  const characterRoot = join(baseDir, 'data/chathub/character/presets')
  await mkdir(coreRoot, { recursive: true })
  await mkdir(characterRoot, { recursive: true })
  const main = new SandboxModelRequestStore()
  const spaces = new Map<string, SandboxModelRequestStore>()
  const service = new SandboxPresetService({
    baseDir,
    mainModelRequests: main,
    getTestSpaceModelRequests(spaceId) {
      return spaces.get(spaceId)
    },
  })
  return { baseDir, coreRoot, characterRoot, main, spaces, service }
}

describe('预设应用服务', () => {
  it('以 YAML 展示身份返回核心与 Character 目录、源码、revision、表达式和诊断', async () => {
    const { coreRoot, characterRoot, service } = await createService()
    await writeFile(join(coreRoot, 'file-name-is-not-identity.yml'), `keywords:\n  - runtime-core-name\nprompts:\n  - role: system\n    content: "Hello {name}."\n`)
    await writeFile(join(coreRoot, 'legacy.txt'), 'ignored')
    await writeFile(join(characterRoot, 'alice.yml'), `name: Alice\nsystem: "You are {name}."\ninput: "Say {prompt}."\n`)

    const catalog = await service.catalog()

    expect(catalog).toHaveLength(2)
    expect(catalog).toContainEqual(expect.objectContaining({
      kind: 'core',
      fileName: 'file-name-is-not-identity.yml',
      displayName: 'runtime-core-name',
      source: expect.stringContaining('keywords:'),
      revision: expect.stringMatching(/^[a-f0-9]{64}$/),
      expressions: [expect.objectContaining({ content: 'name', stableId: expect.any(String) })],
      diagnostics: [],
    }))
    expect(catalog).toContainEqual(expect.objectContaining({
      kind: 'character',
      fileName: 'alice.yml',
      displayName: 'Alice',
      expressions: [
        expect.objectContaining({ content: 'name' }),
        expect.objectContaining({ content: 'prompt' }),
      ],
    }))
    await expect(service.read({ kind: 'core', fileName: 'file-name-is-not-identity.yml' })).resolves.toMatchObject({
      displayName: 'runtime-core-name',
    })
  })

  it('通过仓库执行创建、保存、重命名和删除，并保留显式确认语义', async () => {
    const { service } = await createService()
    const created = await service.create({
      kind: 'character',
      fileName: 'draft.yml',
      source: 'name: Draft\nsystem: Hi\ninput: "{prompt}"\n',
    })
    expect(created).toMatchObject({ displayName: 'Draft', fileName: 'draft.yml' })

    const saved = await service.save({
      kind: 'character',
      fileName: 'draft.yml',
      expectedRevision: created.revision,
      source: 'name: Published\nsystem: Hi\ninput: "Ask {prompt}"\n',
    })
    expect(saved.displayName).toBe('Published')

    await expect(service.rename({
      kind: 'character', fileName: 'draft.yml', newFileName: 'published.yml',
      expectedRevision: saved.revision, confirmed: false,
    })).rejects.toMatchObject({ code: 'confirmation-required' })
    const renamed = await service.rename({
      kind: 'character', fileName: 'draft.yml', newFileName: 'published.yml',
      expectedRevision: saved.revision, confirmed: true,
    })
    expect(renamed).toMatchObject({ fileName: 'published.yml', displayName: 'Published' })

    await expect(service.delete({
      kind: 'character', fileName: 'published.yml', expectedRevision: renamed.revision, confirmed: false,
    })).rejects.toMatchObject({ code: 'confirmation-required' })
    await expect(service.delete({
      kind: 'character', fileName: 'published.yml', expectedRevision: renamed.revision, confirmed: true,
    })).resolves.toEqual({ deleted: true })
  })

  it('按显式主环境范围、展示身份和当前模板选择最新可证明请求并返回精确证据范围', async () => {
    const { coreRoot, main, service } = await createService()
    const source = `keywords:\n  - runtime-core-name\nprompts:\n  - role: system\n    content: "Hello {name}."\n`
    await writeFile(join(coreRoot, 'different-file-name.yml'), source)
    const document = await service.read({ kind: 'core', fileName: 'different-file-name.yml' })
    const expression = document.expressions[0]!

    const matching = main.append({
      status: 'success', durationMs: 10, attribution: 'attributed',
      entities: { scopeId: 'main', botId: '20001', conversationId: 'private:10001:20001' },
      requestBodyAvailable: true,
      requestBody: { messages: [{ role: 'system', content: 'Hello Alice.' }] },
      presetSnapshots: [{
        kind: 'core', presetName: 'runtime-core-name', capturedAt: '2026-01-01T00:00:00.000Z', source,
        templates: [{ path: ['prompts', 0, 'content'], role: 'system', template: 'Hello {name}.' }],
      }],
    })
    main.append({
      status: 'success', durationMs: 5, attribution: 'attributed',
      entities: { scopeId: 'main', botId: '20001', conversationId: 'private:10001:20001' },
      requestBodyAvailable: true,
      requestBody: { messages: [{ role: 'system', content: 'Hello Newer.' }] },
      presetSnapshots: [{
        kind: 'core', presetName: 'runtime-core-name', capturedAt: '2026-01-02T00:00:00.000Z',
        source: source.replace('Hello {name}.', 'Changed {name}.'),
        templates: [{ path: ['prompts', 0, 'content'], role: 'system', template: 'Changed {name}.' }],
      }],
    })

    await expect(service.locateExpression({
      document: { kind: 'core', fileName: 'different-file-name.yml', revision: document.revision },
      expression: { stableId: expression.stableId },
      scope: { scope: 'main' },
      botId: '20001',
      conversationId: 'private:10001:20001',
    })).resolves.toEqual({
      status: 'matched',
      recordId: matching.id,
      evidenceId: 'req:message:messages.0',
      range: { start: 6, end: 11 },
      scope: { scope: 'main' },
    })
  })

  it('只解析一个明确测试空间 store，并对非法范围、过期文档和无匹配返回结构化失败', async () => {
    const { characterRoot, spaces, service } = await createService()
    const source = 'name: Alice\nsystem: "Hello {name}."\ninput: "{prompt}"\n'
    await writeFile(join(characterRoot, 'alice.yml'), source)
    const document = await service.read({ kind: 'character', fileName: 'alice.yml' })
    const spaceStore = new SandboxModelRequestStore()
    spaces.set('space-a', spaceStore)
    spaceStore.append({
      status: 'success', durationMs: 1, attribution: 'attributed',
      entities: { scopeId: 'space-a', botId: '20001', conversationId: 'group:30001' },
      requestBodyAvailable: true,
      requestBody: { messages: [{ role: 'system', content: 'Hello Alice.' }] },
      presetSnapshots: [{
        kind: 'character', presetName: 'Alice', capturedAt: '2026-01-01T00:00:00.000Z',
        templates: [
          { path: ['system'], role: 'system', template: 'Hello {name}.' },
          { path: ['input'], role: 'user', template: '{prompt}' },
        ],
      }],
    })

    await expect(service.locateExpression({
      document: { kind: 'character', fileName: 'alice.yml', revision: document.revision },
      expression: { range: document.expressions[0]!.range, occurrence: 0, path: ['system'] },
      scope: { scope: 'space', spaceId: 'space-a' },
      botId: '20001', conversationId: 'group:30001',
    })).resolves.toMatchObject({ status: 'matched', scope: { scope: 'space', spaceId: 'space-a' } })

    await expect(service.locateExpression({
      document: { kind: 'character', fileName: 'alice.yml', revision: 'stale' },
      expression: { stableId: document.expressions[0]!.stableId },
      scope: { scope: 'space', spaceId: 'space-a' },
      botId: '20001', conversationId: 'group:30001',
    })).resolves.toMatchObject({ status: 'failed', code: 'document-stale' })

    await expect(service.locateExpression({
      document: { kind: 'character', fileName: 'alice.yml', revision: document.revision },
      expression: { stableId: document.expressions[0]!.stableId },
      scope: { scope: 'all' } as never,
      botId: '20001', conversationId: 'group:30001',
    })).resolves.toMatchObject({ status: 'failed', code: 'invalid-scope' })

    await expect(service.locateExpression({
      document: { kind: 'character', fileName: 'alice.yml', revision: document.revision },
      expression: { stableId: document.expressions[0]!.stableId },
      scope: { scope: 'space', spaceId: 'missing' },
      botId: '20001', conversationId: 'group:30001',
    })).resolves.toMatchObject({ status: 'failed', code: 'scope-unavailable' })
  })
})
