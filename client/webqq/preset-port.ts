import type {
  CreatePresetInput,
  DeletePresetInput,
  LocateSandboxPresetExpressionInput,
  LocateSandboxPresetExpressionResult,
  PresetDocumentKind,
  ReadSandboxPresetInput,
  RenamePresetInput,
  SandboxPresetDocument,
  SavePresetInput,
} from '../../src/presets'

/**
 * 预设文件的客户端 seam。与工作区端口分开：预设是全局 ChatLuna 资源，输入里只有文档种类、
 * 文件名与修订，没有任何场景概念。
 *
 * 它的适配器不注入当前观察空间：预设文件是全局的，仅定位表达式那一个方法的输入自身携带
 * 明确的 scope，由调用方给出。
 */
export interface PresetPort {
  getPresetCatalog(input?: { kind?: PresetDocumentKind }): Promise<SandboxPresetDocument[]>
  readPreset(input: ReadSandboxPresetInput): Promise<SandboxPresetDocument>
  createPreset(input: CreatePresetInput): Promise<SandboxPresetDocument>
  savePreset(input: SavePresetInput): Promise<SandboxPresetDocument>
  renamePreset(input: RenamePresetInput): Promise<SandboxPresetDocument>
  deletePreset(input: DeletePresetInput): Promise<{ deleted: true }>
  locatePresetExpression(input: LocateSandboxPresetExpressionInput): Promise<LocateSandboxPresetExpressionResult>
}

export type PresetPortOperation = keyof PresetPort
