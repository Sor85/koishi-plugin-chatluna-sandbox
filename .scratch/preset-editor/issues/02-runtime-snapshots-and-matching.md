# Correlate runtime presets with requests

Status: resolved

## Goal

从 ChatLuna/Character 公共事件捕获运行时预设模板，并在模型请求记录中保存快照，支持表达式到请求文本范围的可信匹配。

## Acceptance

- 快照按空间、机器人、逻辑会话和回合隔离。
- 模型请求详情保留快照，列表仅保留摘要。
- 最新请求严格按当前机器人与逻辑会话及预设快照选择。
- 歧义不猜测。

## Comments

- Implemented public-event runtime correlation for core and Character presets with immediate snapshot copies, unique scope/bot/logical-conversation resolution, per-turn lifetime, and request-dispatch attachment.
- Model-request lists expose snapshot summaries only; details and persistence retain full sources/templates.
- Added pure role/anchor/ordinal evidence matching with exact UTF-16 ranges and explicit stale/not-observed/ambiguous/unsupported outcomes.
- 后续修正核心与 Character 重叠回合、同种回合歧义和按 Session 精确结束；控制结构中的值表达式按实际观察分支/循环保守匹配，无法唯一证明时仍不猜测。
