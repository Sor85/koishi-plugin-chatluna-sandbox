# 08 — 提取发送消息控件

**What to build:** 将发送者选择、头像动画、输入、引用、附件和发送反馈迁移为独立发送控件，使该区域可以单独修改和验证而不影响其他页面实现。

**Blocked by:** 07 — 统一 WebQQ 头像渲染

**Status:** ready-for-human

- [x] 发送控件只接收 composer 只读模型并通过明确事件表达领域意图
- [x] 输入文本、选中附件、发送 loading、错误提示和表单清理由发送控件本地管理
- [x] 当前操作者头像、候选头像、折叠数量和添加参与者按钮保持原有尺寸与顺序
- [x] 展开、折叠和切换动画保持原有方向、时序和不跳动行为
- [x] Tooltip 显示位置、右键菜单位置和层级保持不变
- [x] 创建普通用户或虚拟 OneBot 机器人的 Popover 保留在发送控件中并通过控制模块提交
- [x] 切换操作者时现有输入和本地状态重置语义保持不变
- [x] 头像堆叠单元测试、完整验证命令和 Ego Browser 动画验证通过

## Answer

新增 `WebqqComposer`，通过单一 `WebqqComposerModel` 接收发送者、会话、引用、创建账号上下文和外部错误，只通过发送、切换操作者、环境管理、编辑/删除参与者和取消引用事件表达领域意图。输入、附件读取、大小校验、发送状态、发送错误和成功清理由组件本地管理。

头像堆叠、折叠数量、添加账号 Popover、Tooltip、ContextMenu 和 Anime.js FLIP 切换动画完整迁入组件。Ego Browser 验证展开时头像只向左移动，发送控件根节点横坐标始终为 436px，切换到 Koishi 后输入为空，右键菜单显示且 Tooltip 隐藏，发送消息后输入清空。验证记录位于 `.scratch/webqq-modularization/evidence/08-composer/verification.json`，PNG 仅保存在本地。
