# WebQQ 工作台模块化规格

Status: ready-for-agent

## Problem Statement

WebQQ 工作台已经能够覆盖当前 OneBot Sandbox 的主要测试交互，但主页面同时承担工作区状态、Koishi RPC、当前操作者和会话选择、左侧目录、消息渲染、发送控件、头像动画、右侧信息栏、群公告、关系操作、环境管理与跨区域弹窗。页面模板和脚本集中在一个大型 Vue 文件中，全部 WebQQ 样式也集中在一个大型全局 CSS 文件中。

用户持续要求对 WebQQ 界面进行精确的 1:1 调整，这种集中结构使修改成本和回归风险不断升高：一个响应式侧栏修复需要同时理解根网格、聊天顶栏、右侧栏和媒体查询；一个发送者头像修改可能影响动画、Tooltip、ContextMenu、当前操作者切换和发送身份；共享头像在不同区域重复实现时容易产生缩放、颜色和 Bot 徽标位置差异。大型文件本身不是唯一问题，真正的问题是多个不同职责、不同状态生命周期和不同测试 seam 被压在同一个实现中。

用户需要在完全保持现有视觉、DOM、动画、响应式和模拟 QQ 环境行为不变的前提下，将 WebQQ 工作台重构为职责清晰、接口窄、可独立验证且便于后续 Agent 定位和修改的模块结构。

## Solution

对 WebQQ 工作台实施纯结构性模块化。Vue 视图按实际 UI 布局拆分为左侧栏、聊天区域、消息列表、发送控件、右侧信息栏、共享头像和跨区域 Dialog 覆盖层；状态与行为按工作区控制、工作区布局、覆盖层、参与者切换和消息交互拆分。主页面最终只负责初始化这些模块并装配工作台根布局。

所有服务端工作区状态和领域命令由一个 Vue 组合式工作区控制模块持有。控制模块通过类型明确的 WorkspacePort 访问 Koishi 生产适配器，只向各 UI 区域暴露只读视图模型和领域命令。UI 区域不得直接访问完整 snapshot，也不得直接调用 Koishi RPC。输入、loading、错误提示、搜索、动画和局部浮层等临时 UI 状态由所属模块本地持有。

Vue 与逻辑模块先完成迁移并验证，现有全局 CSS 在这一阶段保持不动。Vue 结构稳定后再单独按样式所有权拆分 CSS，并保持现有选择器、DOM、cascade 和响应式行为不变。整个工作按依赖顺序分票、独立提交、独立验证，并保留可逐步回滚的 Git 历史。

## User Stories

1. As a OneBot Sandbox maintainer, I want the WebQQ root page to contain only workspace assembly, so that I can understand the top-level page without reading every interaction implementation.
2. As a OneBot Sandbox maintainer, I want server workspace state to have one owner, so that all WebQQ regions observe the same revision after an operation.
3. As a OneBot Sandbox maintainer, I want Koishi RPC route details hidden behind a typed port, so that UI modules do not depend on transport strings and payload formats.
4. As a OneBot Sandbox maintainer, I want a production Koishi adapter and a fake test adapter at the same seam, so that workspace behavior can be tested without mounting the full page.
5. As a OneBot Sandbox maintainer, I want each UI region to receive only the model it needs, so that changing one region does not expose unrelated workspace data.
6. As a OneBot Sandbox maintainer, I want UI regions to express user intent through explicit events, so that dependencies remain visible and testable.
7. As a OneBot Sandbox maintainer, I want temporary UI state to remain local to its visual region, so that the workspace control module does not become a global collection of input and dialog flags.
8. As a OneBot Sandbox maintainer, I want left navigation and directory rendering isolated from chat implementation, so that sidebar changes do not require editing message code.
9. As a OneBot Sandbox maintainer, I want message rendering isolated from the sending control, so that TIM message clustering and composer animation can evolve independently.
10. As a OneBot Sandbox maintainer, I want the sending control to own participant stack animation and input state, so that avatar animation fixes stay local.
11. As a OneBot Sandbox maintainer, I want the right information region isolated from the message region, so that group announcements and member lists can be changed without touching message rendering.
12. As a OneBot Sandbox maintainer, I want cross-region Dialog state centralized in one overlay host, so that the same editor is not duplicated in multiple regions.
13. As a OneBot Sandbox maintainer, I want ContextMenu, Tooltip and Popover to remain beside their trigger elements, so that positioning and pointer behavior remain unchanged.
14. As a OneBot Sandbox maintainer, I want workspace layout state owned by the smallest common owner, so that the chat header, root grid and right information region stay synchronized.
15. As a OneBot Sandbox maintainer, I want user, virtual OneBot robot and group avatars rendered through one shared module, so that colors, fallback initials and Bot badges remain consistent.
16. As a WebQQ user, I want the interface to look exactly the same after modularization, so that the refactor does not interrupt my testing workflow.
17. As a WebQQ user, I want the current operator to remain unchanged across the refactor, so that messages and actions continue to use the expected participant identity.
18. As a WebQQ user, I want the selected conversation and current view to remain browser-local, so that multiple browsers can still test independently.
19. As a WebQQ user, I want invalid saved selections to retain the existing fallback behavior, so that deleted participants or conversations do not leave the workspace unusable.
20. As a WebQQ user, I want recent conversations, friends, groups and notifications to display the same entries and relation markers, so that relationship testing remains trustworthy.
21. As a WebQQ user, I want the current operator excluded or included in directories exactly as before, so that the refactor does not change directory semantics.
22. As a WebQQ user, I want ordinary users and virtual OneBot robots to retain their current visual distinction, so that I can identify who is acting.
23. As a WebQQ user, I want group avatars to retain their distinct color, so that groups are not confused with participants.
24. As a WebQQ user, I want the participant avatar stack to keep its current collapsed spacing, expanded spacing and add-participant position, so that the WebQQ capsule remains familiar.
25. As a WebQQ user, I want participant switching animation to remain unchanged, so that the sending control does not jump or lose transition feedback.
26. As a WebQQ user, I want participant Tooltip and ContextMenu layering to remain unchanged, so that right-click actions cover the Tooltip and open above the sending control.
27. As a WebQQ user, I want creating an ordinary user or virtual OneBot robot from the sending control to behave exactly as before, so that environment preparation remains available.
28. As a WebQQ user, I want editing and deleting participants or groups to use the same Dialogs and validation, so that environment management behavior remains stable.
29. As a WebQQ user, I want Select, Checkbox, Dialog, ContextMenu, Popover and Tooltip to continue using shadcn-vue behavior, so that controls remain consistent.
30. As a WebQQ user, I want TIM message clusters to retain the same first, middle and last bubble shapes, so that consecutive messages remain visually grouped.
31. As a WebQQ user, I want QQ message mode to remain unmerged, so that changing the chat appearance does not alter its current behavior.
32. As a WebQQ user, I want quoted messages to retain their current appearance and scroll target behavior, so that reply context remains usable.
33. As a WebQQ user, I want text, images and other media to retain their current rendering and fallback behavior, so that media plugin tests remain valid.
34. As a WebQQ user, I want earlier message history loading to retain its current ordering and scroll behavior, so that long conversation testing remains stable.
35. As a WebQQ user, I want poke events to retain their current system-event appearance and message-cluster interruption behavior, so that OneBot interaction events remain recognizable.
36. As a WebQQ user, I want ChatLuna thinking state and Token display to remain associated with the same virtual OneBot robot and conversation, so that ChatLuna compatibility is not affected.
37. As a WebQQ user, I want message input, attachment selection, reply preview and send loading state to behave exactly as before, so that sending tests remain reliable.
38. As a WebQQ user, I want successful sends to clear only the same local composer state as before, so that the refactor does not introduce unexpected resets.
39. As a WebQQ user, I want failed operations to retain the previous workspace state and show errors in the same region, so that failures remain understandable.
40. As a WebQQ user, I want switching conversations or current operators to reset only the same local UI state as before, so that unrelated state is not lost.
41. As a WebQQ user, I want the right information region to close automatically when the browser becomes narrow and reopen automatically when it becomes wide, so that the current responsive contract remains unchanged.
42. As a WebQQ user, I want the top-right button to keep opening and closing the right information region, so that manual control remains available.
43. As a WebQQ user, I want group information, private information, announcements and member lists to display the same content, so that conversation context remains accurate.
44. As a WebQQ user, I want group member search and announcement editing to retain their current local state and reset rules, so that changing conversations behaves predictably.
45. As a WebQQ user, I want friend, group and member right-click actions to retain the same permission rules and menu placement, so that OneBot behavior validation remains valid.
46. As a WebQQ user, I want current operator changes to keep all regions synchronized, so that a user or virtual OneBot robot never sees mixed state from another participant.
47. As a WebQQ user, I want light mode, dark mode, frosted glass, chat style, accent color and custom scrollbars to remain unchanged, so that global appearance configuration still applies consistently.
48. As a Chrome user, I want the modularized workspace to preserve all current layout and interaction behavior, so that my existing browser remains supported.
49. As a Firefox user, I want the modularized workspace to preserve layout, overflow and interaction behavior, so that the refactor does not introduce engine-specific failures.
50. As a contributor, I want each modularization step to be independently testable and revertible, so that regressions can be isolated to one change.
51. As a contributor, I want Vue extraction and CSS extraction in separate commits, so that visual regressions have a smaller search space.
52. As a contributor, I want existing helper logic moved only after behavior modules are stable, so that path churn does not obscure functional changes.
53. As a reviewer, I want each module to have a small interface and clear ownership, so that review focuses on observable behavior rather than wiring noise.
54. As a reviewer, I want line counts treated as a warning rather than a hard limit, so that the refactor does not replace deep modules with many shallow pass-through files.
55. As a reviewer, I want the Git history to retain each migration step, so that a broken region can be traced and reverted without discarding the entire effort.
56. As a future Agent, I want WebQQ-specific files grouped in one feature directory, so that relevant implementation can be found without scanning the entire client root.
57. As a future Agent, I want shared visual primitives separated from region styles, so that avatar and status styling is changed once rather than copied.
58. As a future Agent, I want responsive rules loaded after region styles, so that cascade ownership is predictable.
59. As a future Agent, I want the module contracts and architectural reasons recorded, so that the workspace is not recombined into one large page later.
60. As a plugin developer, I want this refactor to leave simulation behavior untouched, so that existing tests of participants, relationships, permissions, messages and virtual OneBot robots remain trustworthy.

## Implementation Decisions

- The work is a pure structural refactor. User-visible behavior, visual output, DOM relationships, animation timing, responsive breakpoints and simulation semantics must remain unchanged.
- Vue views are divided by UI layout while state and behavior are divided by function. Cross-region workspace layout remains owned by the top-level workspace.
- The top-level view tree consists of a sidebar region, a chat region and a right information region, plus a cross-region Dialog overlay host.
- The sidebar region renders both the narrow navigation rail and the conversation or relationship directory without adding a wrapper element that changes the current grid.
- The chat region owns the chat header and internally composes the message list and sending control.
- The message list owns message rows, TIM clustering presentation, quotes, media presentation, poke events, history scrolling and message-local ContextMenu triggers.
- The sending control owns message input, selected media, reply preview presentation, send loading and error state, participant avatar stack, participant switching animation, participant Tooltip and participant ContextMenu triggers.
- The right information region owns private information, group information, announcements, group members, member search and their local interaction state.
- Cross-region Dialogs are rendered by one overlay host. Entity edit and deletion, friend remark, group name and group card editors are not duplicated in individual regions.
- ContextMenu, Tooltip and Popover remain in the region containing their trigger element. They emit structured intent instead of calling server operations directly.
- A shared avatar module renders ordinary users, virtual OneBot robots and groups while preserving current class names, image fallback, colors, circular clipping and proportional Bot badge placement.
- A Vue composition module is the single owner of server workspace state, current operator, current conversation and all domain commands used by the WebQQ workspace.
- The workspace control module exposes four readonly region models for sidebar, chat, composer and details. UI regions do not receive the complete snapshot.
- The workspace control module exposes domain commands for selection, messaging, relationships, group actions, announcements, history, media and environment management.
- UI regions use narrow props and emits. The complete controller is not passed through props and is not provided through global injection.
- Temporary UI state remains local to the closest UI region. Loading indicators, error presentation, form cleanup, search state, animations and local floating controls are not stored in the workspace control module.
- Commands update the workspace state atomically after successful adapter calls. Failed commands preserve the previous state and reject with a normalized error for the calling region to display.
- Local state reset behavior is reproduced through explicit watchers on stable operator and conversation identities. Regions are not force-remounted through dynamic keys.
- A typed WorkspacePort is the transport seam between workspace behavior and Koishi RPC.
- A Koishi production adapter maps WorkspacePort operations to the existing console RPC routes.
- Tests use a fake WorkspacePort. The port exists because production and test adapters are both required; it is not a speculative abstraction.
- Existing environment creation and entity editing views stop calling Koishi RPC directly. They become controlled forms that emit environment management commands through the workspace control module.
- Workspace layout state owns browser width detection and right information visibility because those values affect the root grid, chat header and right information region together.
- Existing browser-local preference keys and fallback behavior remain unchanged.
- Existing CSS class names, aria labels, data attributes, element types, trigger nodes and parent-child relationships remain unchanged during Vue extraction.
- Vue and behavior modules are extracted before any CSS file movement. The original global stylesheet remains intact until the Vue structure passes all regression checks.
- CSS is later divided by ownership into design tokens, workspace layout, shared WebQQ primitives, sidebar, chat, messages, composer, details, overlays and responsive rules.
- The stylesheet entry point controls import order. Responsive rules load last, and module files do not independently import global styles.
- Shared WebQQ primitives contain only styles used by two or more regions, including shared avatar, Bot badge and status-label behavior. They do not become a replacement design system.
- shadcn-vue remains the source for supported controls. Existing Dialog, Select, Checkbox, ContextMenu, Popover and Tooltip usage is not replaced with custom controls.
- The modularization uses a dedicated feature directory with a flat initial structure. Additional components, composables, models and utility subdirectories are not introduced until file count justifies them.
- Existing WebQQ helper files move into the feature directory only after Vue and CSS behavior is stable, in a separate path-only migration step.
- Completion is judged by clear ownership, narrow interfaces and observable behavior rather than strict file-length limits. The root page should become a small assembly module, while a deep logic module may remain several hundred lines if its interface stays small.
- Work proceeds on a dedicated feature branch. WebQQ feature and visual changes are frozen during the migration except for urgent fixes applied and verified separately.
- Each migration ticket produces an independent commit that passes verification and can be reverted without reverting the entire modularization.
- Vue extraction and CSS extraction never share a commit. Final integration uses a merge commit and preserves the ticket commits without squashing.
- The dependency order is: establish baseline evidence; add the port and workspace control module; extract workspace layout and overlay state; extract composer; extract message list and chat region; extract right information; extract sidebar; finalize overlay host and root assembly; split CSS; move existing helpers.

## Testing Decisions

- Good tests assert behavior visible through a module interface or through the rendered WebQQ workspace. Tests do not assert internal ref names, implementation ordering or arbitrary template snapshots.
- The highest programmatic test seam is the workspace control module. Its tests use a fake WorkspacePort and observe readonly region models, command results and retained state after failures.
- Workspace control tests cover initial loading, browser selection restoration, invalid-selection fallback, current operator switching, conversation switching, atomic workspace replacement, relationship actions, group actions, messaging, media, history, announcements and environment management.
- Controller tests verify that all four region models are derived from the same updated workspace revision after a successful command.
- Controller tests verify that a rejected adapter operation preserves the previous region models and returns a normalized error.
- Existing pure-logic tests remain prior art for message clustering, participant stack geometry, relationship directories, notification visibility, menu permissions and browser workspace preferences.
- Pure logic remains framework independent where practical and continues to be tested directly with Vitest.
- Vue composition modules are tested with Vue reactivity and Vitest without mounting the full page.
- No Vue template snapshot framework or Vue Test Utils dependency is introduced for this refactor.
- The highest UI seam is the actual WebQQ route in a running Koishi development environment.
- Before implementation, Ego Browser captures fixed baseline screenshots and relevant DOM state for wide, medium and mobile viewport widths in light and dark appearance modes.
- Every migration ticket runs targeted tests first, followed by the full test suite, type checking and the production build.
- Every migration ticket uses Ego Browser to verify the region changed by the ticket, the browser console and the relevant interactions.
- Browser verification covers recent, friend, group and notification navigation; participant switching; sending and replying; media selection; relationship and group ContextMenus; Dialogs and Select controls; right information responsiveness; announcements; and member lists.
- The wide viewport baseline uses 1400 pixels, the medium viewport baseline uses 1000 pixels and the mobile viewport baseline uses 700 pixels.
- Chromium is verified through Ego Browser on every ticket.
- Firefox is verified after all Vue modules have been extracted and again after CSS has been split. Firefox checks layout, overflow, controls, animation completion and console errors but is not compared pixel-for-pixel with Chromium.
- Baseline and after-change evidence is stored with the local feature tracker and is not included in the published plugin package.
- Visual comparisons preserve the same default scene, current operator, active conversation, viewport, theme and appearance configuration.
- Existing build warnings from dependencies are reported separately and do not count as modularization failures unless the warning changes because of the refactor.

## Out of Scope

- Any visual redesign or departure from the existing WebQQ 1:1 appearance.
- Any new OneBot capability, user interaction, environment management action or test-control capability.
- Any change to participants, virtual OneBot robots, relationships, group roles, permissions, messages, requests or event semantics.
- Any change to ChatLuna thinking state or Token accounting behavior.
- Any server-side state, persistence, OneBot bridge or MCP behavior change.
- Any Vue, Tailwind CSS, shadcn-vue, Anime.js, Koishi or other dependency upgrade.
- Introducing Pinia or another global state-management library.
- Replacing Vue composition modules with a framework-independent controller class.
- Renaming existing CSS classes, DOM data attributes, aria labels or test selectors.
- Converting the global WebQQ stylesheet to scoped CSS, CSS Modules or CSS-in-JS.
- Replacing existing shadcn-vue controls with custom native controls.
- Performance optimization unless required to correct a regression introduced by modularization.
- Opportunistic cleanup, naming changes or unrelated refactoring adjacent to migrated code.
- Reorganizing server files or changing Koishi WebUI route registration and plugin configuration.
- Adding component template snapshot tests or a new browser-test dependency to the project.
- Squashing the implementation history into one commit.

## Further Notes

- ADR-0040 is the architectural source of truth for this modularization.
- This effort should be converted into dependency-aware implementation tickets before code changes begin.
- File length is a diagnostic signal, not the design objective. The objective is a small interface with high leverage and strong locality.
- If implementation reveals that an agreed seam requires user-visible behavior changes, stop that ticket and record the behavior change as a separate issue rather than silently expanding this specification.
- If an urgent WebQQ bug is discovered during the feature freeze, fix it against the current structure first, validate it independently, and then carry the verified behavior into the modularization branch.
