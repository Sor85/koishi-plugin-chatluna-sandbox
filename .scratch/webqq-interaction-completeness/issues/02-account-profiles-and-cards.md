# 02 — 建模账号资料并增加个人信息卡

**What to build:** 扩展普通用户和虚拟 OneBot 机器人的类型化账号资料，补齐个性签名读写和 OneBot 回读，并为所有参与者头像提供统一个人信息卡。

**Blocked by:** 无

**Status:** resolved

- [x] 账号资料、好友备注、群成员资料和机器人运行资料使用独立类型
- [x] 覆盖当前 NapCat/LLOneBot 基线可表达的类型化可选字段，不保存 raw JSON
- [x] `set_qq_profile` 支持昵称和个性签名，并严格保留性别写入差异
- [x] 对应 OneBot 查询返回已建模资料，字段名按实现配置映射
- [x] 环境管理、MCP 场景准备、导入导出和数据库持久化支持新增资料
- [x] 私聊右侧信息面板显示个性签名
- [x] 消息、私聊头部、好友列表和群成员列表头像右键可打开个人信息卡
- [x] 卡片显示场景全部资料并标明账号、好友、群成员和机器人范围
- [x] 使用真实浏览器验证 Chrome、Firefox、窄屏和 Portal 主题样式

## Answer

已按 ADR-0050 建立类型化账号资料闭环，并补齐 WebQQ 个人信息卡与私聊个性签名展示。

### 实现摘要

- 领域类型：`SandboxAccountProfile` 独立于好友备注（`friendship.remarks`）、群成员资料（`SandboxGroupMember` 扩展字段）和机器人运行资料（`implementation/enabled/disabledCapabilities`）。
- OneBot：`set_qq_profile` 支持 `nickname` + `personal_note`；性别仅 NapCat 可写，LLOneBot 明确拒绝；`get_login_info` / `get_stranger_info` / `get_friend_list` / `get_group_member_info` 返回已建模字段。
- 环境管理 / MCP / 导入导出 / 持久化：创建与更新用户/机器人可携带 `profile`，场景快照整体往返保留。
- WebQQ：消息头像、私聊头部、好友列表、群成员菜单提供“查看资料”；只读资料卡按范围分组；私聊右侧面板显示个性签名。

### 验证

- `yarn vitest run tests/account-profiles.test.ts tests/webqq-profile-card.test.ts tests/webqq-details-panel.test.ts tests/onebot-bridge.test.ts tests/environment-directory.test.ts tests/friendship.test.ts tests/webqq-message-list.test.ts tests/webqq-sidebar.test.ts tests/webqq-chat-pane.test.ts tests/group-menu.test.ts tests/mcp-service.test.ts tests/database-persistence.test.ts tests/onebot-profiles.test.ts` 通过
- `yarn typecheck` 通过
- `yarn build` 通过

### 浏览器验证

- Ego Browser（Chrome）：从消息头像、好友列表和群成员列表右键打开个人信息卡；确认字段按范围分组，Portal 内关闭按钮边框、背景和文字色正常。
- Playwright CLI（Firefox）：验证消息头像资料入口、个人信息卡打开与 390px 窄屏无横向溢出。

## Comments

- 2026-08-02：agent 完成 issue 02 垂直切片；未提交 git。
