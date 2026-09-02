# WebQQ 按布局与行为分层模块化

WebQQ 工作台采用纯结构性重构，保持现有 DOM、CSS class、视觉、动画、响应式断点和领域行为不变。Vue 视图按左侧栏、聊天区域、发送控件、右侧信息栏和跨区域 Dialog 覆盖层拆分，逻辑则按工作区状态、布局状态、覆盖层状态、参与者切换和消息交互拆分；`page.vue` 最终只负责工作台装配（[ADR-0090](./0090-group-client-files-by-capability.md) 后位于 `client/workspace/page.vue`）。

服务端工作区状态和领域命令统一收敛到 Vue 组合式工作区控制模块，通过类型明确的 `WorkspacePort` 和 Koishi 生产适配器访问 RPC。控制模块只向各区域暴露只读视图模型和领域命令，UI 模块不得访问完整 snapshot 或直接调用 RPC；区域内的输入、loading、错误、搜索、动画和浮层状态由所属模块本地持有，并通过窄 props 与 emits 交互。

Vue 与逻辑拆分完成并验证后再单独拆分 CSS，保留现有选择器和 cascade，由统一入口按 tokens、workspace、primitives、各布局区域、overlays、responsive 的顺序加载。跨区域复用的头像、Bot 徽标和状态标签进入共享视觉模块，跨区域布局规则仍由工作台持有，避免按文件行数机械拆出浅模块。

模块化在独立分支按依赖顺序逐票实施，每张票独立提交并通过类型检查、完整测试、构建和 Ego Browser 基准对照；Vue 阶段和 CSS 阶段完成时额外验证 Firefox，最终通过 merge commit 合并且不 squash。本轮不包含 UI 重设计、功能新增、依赖升级、状态管理替换、选择器重命名或服务端行为调整。
