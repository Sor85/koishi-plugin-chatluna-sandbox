# koishi-plugin-onebot-sandbox

在 Koishi 控制台中提供可验证 OneBot 插件行为的模拟 QQ 环境。

当前版本提供 WebQQ 风格的全页工作台。用户可以在浏览器内将普通用户或虚拟 OneBot 机器人切换为当前操作者，统一使用该参与者的视图、权限和发送身份，并在同一会话中观察被测插件回复；共享场景仍由服务端统一持有。

WebQQ 的毛玻璃、聊天样式、气泡尾部、颜色模式和强调色由 Koishi 插件全局配置统一控制。

## AI 测试空间

启用 MCP 后，外部测试控制器可以创建空白且隔离的 AI 测试空间，自主准备用户、机器人、群组和关系，再通过真实 OneBot 交互验证插件行为。MCP 修改操作必须显式携带 `spaceId`，不会写入主模拟 QQ 环境。

WebQQ 最左侧导航提供测试空间总览：主环境固定在首位，AI 空间按创建时间从旧到新排列。用户可以实时观察空间、接管或归还控制权、复盘已完成空间，以及按需重新激活或删除。数据库持久化模式会同时保存主环境和测试空间场景。

完整权限的 MCP 凭证可发现 32 个工具，其中 7 个用于测试空间生命周期：`list_test_spaces`、`get_test_space`、`create_test_space`、`complete_test_space`、`fail_test_space`、`reactivate_test_space` 和 `delete_test_space`。

## OneBot 基线

| 实现配置 | 文档快照日期 | 上游来源版本 | `get_version_info.app_name` |
| --- | --- | --- | --- |
| NapCat | 2026-07-24 | `NapNeko/NapCatQQ@33546b936e008c017b2b9c1c41a0bb4f9e86c5be` | `NapCat.Onebot` |
| LLBot | 2026-07-24 | `LLOneBot/LuckyLilliaBot@d6e2f485b8164597d04a2907d307739ecfcf4a55` | `LLOneBot` |

能力覆盖支持按 action、别名和作用说明搜索；各能力的 API 兼容性说明见 `docs/onebot-profiles.md`。

## 开发

```bash
yarn install
yarn test
yarn typecheck
yarn build
```
