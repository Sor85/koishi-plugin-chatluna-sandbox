import { send } from '@koishijs/client'
import type { PresetPort } from './preset-port'

export function createKoishiPresetPort(): PresetPort {
  return {
    // 预设文件是全局 ChatLuna 资源；仅定位表达式的 input 自身携带明确 scope，均不注入当前工作区 spaceId。
    getPresetCatalog: (input = {}) => send('chatluna-sandbox/preset-catalog', input),
    readPreset: (input) => send('chatluna-sandbox/preset-read', input),
    createPreset: (input) => send('chatluna-sandbox/preset-create', input),
    savePreset: (input) => send('chatluna-sandbox/preset-save', input),
    renamePreset: (input) => send('chatluna-sandbox/preset-rename', input),
    deletePreset: (input) => send('chatluna-sandbox/preset-delete', input),
    locatePresetExpression: (input) => send('chatluna-sandbox/preset-locate-expression', input),
  }
}
