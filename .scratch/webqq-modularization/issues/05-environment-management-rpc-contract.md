# 05 — 迁移环境管理并关闭旧 RPC 入口

**What to build:** 让用户、虚拟 OneBot 机器人和群组的创建、编辑与删除也使用统一工作区控制模块，从而完成 WebQQ UI 与 Koishi RPC 的单一传输 seam。

**Blocked by:** 04 — 迁移消息、媒体、历史与公告命令

**Status:** ready-for-human

- [x] 环境创建表单只负责输入、校验、loading、错误和结构化提交事件
- [x] 实体编辑与删除表单不再直接调用 Koishi RPC
- [x] 用户、虚拟 OneBot 机器人和群组管理通过工作区控制模块执行
- [x] 环境管理成功后当前操作者、会话和四个区域模型使用现有 fallback 规则同步更新
- [x] 环境管理失败时旧工作区状态和表单内容符合现有行为
- [x] 除 Koishi 生产适配器外，WebQQ UI 不再直接调用控制台 send 函数或保存 RPC 路由字符串
- [x] 环境管理测试和 Ego Browser 创建、编辑、删除流程通过
- [x] 完整类型检查、测试和构建通过

## Answer

环境创建与实体编辑/删除组件已移除 Koishi `send` 依赖，改为提交结构化环境命令并通过 resolve/reject 回调保留组件本地的 loading、错误和关闭语义。页面只负责把命令交给工作区控制模块；所有 WebQQ UI 的 RPC 路由字符串现仅存在于 Koishi 生产适配器中。

控制模块测试覆盖删除当前用户后的操作者、会话和四区域 fallback，以及失败时保留旧工作区。现有环境目录测试继续覆盖用户、机器人和群组的创建、编辑与删除。Ego Browser 已完成临时用户创建、改名和删除闭环，验证记录位于 `.scratch/webqq-modularization/evidence/05-environment-management-rpc-contract/verification.json`，PNG 仅保存在本地。
