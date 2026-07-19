# 同时兼容 Koishi 与 OneBot 私有接口

虚拟 OneBot 机器人同时提供标准 Koishi Session 和事件、OneBot 原始事件数据，以及 `bot.internal` 方法和 `_request(action, params)` action 调用。NapCat 与 LLBot 实现配置分别决定原始字段、方法别名和扩展 action，确保使用标准 Koishi API 与直接依赖 OneBot 私有接口的插件都能在同一沙盒中验证。
