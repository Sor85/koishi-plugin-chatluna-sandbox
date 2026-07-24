# 09 — 实现 NapCat、LLBot 私有接口与能力覆盖

**What to build:** 为每个虚拟 OneBot 机器人提供独立的 NapCat 或 LLBot 兼容基线，使依赖原始字段、`bot.internal`、底层 action、方法别名和实现扩展的插件可以在多机器人场景中验证，同时允许逐机器人禁用已有能力。

**Blocked by:** 08 — 打通标准 Koishi 与 OneBot 机器人闭环

**Status:** ready-for-human

- [x] NapCat 与 LLBot 分别维护一个明确的兼容基线和文档快照日期
- [x] 两种实现配置可以在同一沙盒场景中同时启用多个机器人
- [x] 原始事件字段、action 参数、返回结构和方法别名按机器人实现配置生成
- [x] `bot.internal` 与底层 action 请求可调用实现配置支持的能力
- [x] 能力矩阵能够解释标准能力、原生扩展、禁用能力和不支持原因
- [x] 管理员可以为单个机器人禁用基线中已有的能力
- [x] 能力覆盖只影响目标机器人，不改变同配置的其他机器人
- [x] 宿主专属且未实现的 action 明确返回不支持，不伪造成功

## Answer

- 新增 NapCat 与 LLBot 独立基线、来源版本、快照日期和能力矩阵
- OneBot action、`bot.internal` 具名方法和方法别名统一经过逐机器人能力门禁
- 消息原始字段与 `get_version_info` 按接收机器人实现配置生成
- 机器人编辑 Dialog 可以查看基线并禁用单项能力
- 基线维护说明见 `docs/onebot-profiles.md`
