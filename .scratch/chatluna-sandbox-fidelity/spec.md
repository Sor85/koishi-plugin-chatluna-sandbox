# OneBot Sandbox 协议保真度与 WebQQ 交互完整性规格

Status: ready-for-agent

## Problem Statement

OneBot Sandbox 已经能够模拟 NapCat 与 LLOneBot 的主要消息、关系和群管理行为，并通过 MCP 创建隔离测试空间、驱动插件交互和观察 OneBot action。然而，当前实现仍有多处事实存在但不可稳定复盘、协议能力存在但 WebQQ 不可见、数据已经持久化但表现为丢失的问题。

AI 测试空间目前按创建它的测试凭证隔离。凭证失效或轮换后，数据库中的空间仍然存在，但新凭证无法发现和控制，表现为“测试空间消失”。机器人头像 action 会把外部 URL 或 `base64://` 字符串直接写入场景；数据虽然仍在数据库中，WebQQ 却无法把它稳定显示为图片，且大块 Base64 会膨胀场景 JSON。普通用户和群组也没有统一的持久化头像图片模型。

OneBot 调试记录当前只保存在有限内存中，插件重启后无法继续复盘已完成测试空间的 action 证据；记录列表没有稳定分页，action 的原始请求名和解析后名字分散在旧字段中，客户端需要自行处理别名、成功失败结构和大块 Base64。自动化测试能够等待 action，却仍需要从通用事件包装中解包不同形状的数据。

消息撤回仍使用系统事件灰条改写原消息，尚未落实结构化生命周期状态。撤回机器人消息后，ChatLuna 思考可能继续脱离消息显示，甚至在晚到归档时错误关联到更早消息。用户需要默认保留被撤回的 WebQQ 消息并显示撤回线，也需要在关闭该展示偏好时只看到撤回事件，同时不能让 UI 设置改变 OneBot 协议可见性或永久销毁测试数据。

消息表情回应已经进入场景并可通过 `set_msg_emoji_like` 修改，但 WebQQ 不展示回应，也没有当前操作者主动贴表情的入口。账号资料模型只包含昵称和头像，`set_qq_profile` 会忽略个性签名，OneBot 查询无法返回真实基线已有的资料字段；所有用户和机器人也缺少统一的个人信息卡。消息发送控件在发送时禁用 textarea，浏览器强制移除焦点，请求结束后不恢复，用户无法连续使用键盘发送；禁用控件还使用不需要的禁止光标。

这些问题使插件开发者无法把 Sandbox 当作稳定、可复盘、跨协议一致但仍保留实现差异的 OneBot 测试环境，也使 WebQQ 无法完整投影沙盒已经拥有的领域事实。

## Solution

将 AI 测试空间改为当前 Sandbox 实例的共享测试资源。所有有效测试凭证都能发现全部空间，但每次调用继续受凭证自身的 `read`、`interact`、`manage` 和 `debug` 能力范围限制；用户接管空间时暂停所有 MCP 修改。凭证轮换不再改变空间可见性，已有数据库空间继续保留。

把头像统一建模为受 Sandbox 管理的持久化图片。普通用户、虚拟 OneBot 机器人和群组创建后都必须关联头像图片；没有自定义头像时，根据实体种类和稳定 ID 生成默认图片。外部 URL、Data URL、`base64://` 和上传文件在写入前导入媒体存储，场景只保存媒体引用。媒体按内容去重，并在头像替换、场景删除或其他引用消失后进行引用感知回收。

将 OneBot 调试记录作为独立于沙盒场景的持久化测试证据。记录按测试空间保存，使用单调序列游标稳定分页，并同时限制条数和容量。统一机器人动作记录结构，明确区分插件实际请求名、规范 action 和命中的别名，使用判别联合表示成功或错误。列表、等待和 WebUI 使用同一记录类型；超过阈值的 Base64 默认折叠，只有单条记录详情可以显式展开。

将消息撤回建模为消息生命周期状态。权威场景始终保留撤回前正文、媒体、回复关系、表情回应和 ChatLuna 思考，用于 WebQQ 展示和测试复盘；普通 OneBot 查询按真实撤回语义拒绝读取原文。默认开启“保留被撤回的 WebQQ 消息并显示撤回线”，关闭时隐藏原消息及其思考和回应，只显示撤回事件。配置只控制 WebQQ 呈现，不改变底层保存或 OneBot 行为。

补齐 WebQQ 对消息表情回应、账号资料和个人信息卡的投影。群消息回应使用 TIM 风格 chip 展示表情、回应者头像和数量；当前操作者可以从右键菜单打开完整本地表情目录并切换自己的回应。账号资料使用类型化可选字段覆盖当前 NapCat 与 LLOneBot 基线可表达的资料全集，同时保持账号资料、好友备注、群成员资料和机器人运行资料的语义分离。所有参与者头像入口都可以打开个人信息卡，私聊右侧信息面板显示个性签名。

保持消息发送的一次单请求锁，在发送成功或失败后可靠恢复原输入控件焦点，并从整个发送区域移除禁止光标。不得为此引入消息发送队列，也不得让晚返回的旧请求抢夺其他会话或页面的焦点。

## User Stories

1. As an MCP test controller, I want previously created AI test spaces to remain visible after credential rotation, so that replacing a leaked or expired token does not hide historical work.
2. As an MCP test controller, I want every valid credential to discover all AI test spaces, so that spaces belong to the Sandbox instance rather than a disposable token.
3. As a Sandbox administrator, I want credential capability scopes to remain enforced, so that shared visibility does not grant unintended mutation or debug access.
4. As a WebQQ user, I want taking over a test space to pause every MCP controller, so that human inspection and AI mutation cannot race.
5. As a test maintainer, I want existing persisted test-space rows to remain available during the ownership-model change, so that current evidence is not discarded.
6. As a test maintainer, I want completed and failed spaces to survive restart, so that I can inspect prior runs.
7. As a user, I want every ordinary user, virtual OneBot robot and group to have an actual avatar image, so that avatars are not ambiguous strings or temporary placeholders.
8. As a user, I want entities without custom avatars to receive stable generated images, so that each entity remains visually recognizable.
9. As a user, I want changing a nickname or group name not to replace the generated avatar, so that identity remains visually stable.
10. As a plugin developer, I want `set_qq_avatar` to persist a displayable image, so that the avatar remains correct after refresh and restart.
11. As a plugin developer, I want URL, Data URL and `base64://` avatar inputs to produce the same managed-media result, so that protocol input form does not change persistence semantics.
12. As a database operator, I want scenes to store media references instead of image bodies, so that scene JSON remains bounded.
13. As a storage operator, I want identical avatar images deduplicated, so that repeated tests do not waste storage.
14. As a storage operator, I want replaced avatars reclaimed only when no remaining reference exists, so that shared media does not break.
15. As a test maintainer, I want existing persisted avatar strings normalized once into managed media, so that current development data is not silently lost.
16. As an environment manager, I want to set ordinary-user and group avatars without inventing nonstandard OneBot actions, so that test preparation remains separate from robot behaviour.
17. As a test controller, I want OneBot debug records to survive plugin restart, so that completed spaces retain action evidence.
18. As a test controller, I want debug records stored independently from scene snapshots, so that scene import and export do not include operational history.
19. As a test controller, I want debug records paged with a stable sequence cursor, so that new actions do not cause duplicates or omissions between pages.
20. As a test controller, I want a default page size of 50 and maximum page size of 200, so that responses remain manageable.
21. As a storage operator, I want each space limited to 5000 records and 50 MiB, so that persistent debug evidence cannot grow without bound.
22. As a test controller, I want an expired debug cursor to return a structured error and the earliest available cursor, so that clients can recover deliberately.
23. As a plugin developer, I want each action record to retain the action name my plugin actually requested, so that I can audit protocol usage.
24. As a cross-protocol tester, I want the same record to expose the normalized action name, so that NapCat and LLOneBot assertions use one vocabulary.
25. As a test controller, I want alias matches recorded explicitly, so that I can distinguish canonical calls from compatibility aliases.
26. As a test controller, I want successful action records to always contain a result, so that success is not inferred from missing errors.
27. As a test controller, I want failed action records to always contain a structured error, so that failures expose a stable code, retryability and trace identifier.
28. As a WebQQ user, I want the debug workspace and MCP to display the same action-record shape, so that I do not learn two contracts.
29. As a test controller, I want `action` filters to match canonical actions and all aliases, so that cross-protocol queries are concise.
30. As a plugin maintainer, I want `requestedAction` filters to match only the actual request name, so that exact compatibility behaviour remains testable.
31. As a test controller, I want both filters to combine with AND semantics, so that canonical and exact-name assertions can be composed.
32. As a test controller, I want `wait_for_onebot_action` to return the action record at the top level, so that wait and list results use the same model.
33. As a test controller, I want large Base64 values hidden by default, so that action inspection does not flood the MCP context.
34. As a test controller, I want Base64 values larger than 8 KiB represented by encoding, MIME, length and SHA-256 metadata, so that I can identify content without downloading it.
35. As an authorized debugger, I want to expand large values for one record explicitly, so that detailed diagnosis remains possible without expanding an entire page.
36. As a storage operator, I want capacity accounting based on complete stored values, so that hidden output does not hide storage growth.
37. As a WebQQ user, I want existing group-message reactions visible, so that the UI reflects the same state as snapshots and `get_msg`.
38. As a WebQQ user, I want reaction chips to show the emoji, known responders and total count, so that group feedback is understandable.
39. As a WebQQ user, I want to right-click a group message and choose “贴表情”, so that I can add the first reaction.
40. As a WebQQ user, I want a complete local OneBot/QFace catalog with common reactions and search, so that the picker is useful without a remote index.
41. As a WebQQ user, I want clicking an existing reaction chip to toggle my own reaction, so that following and undoing a reaction is fast.
42. As an ordinary-user operator, I want reaction changes to use the user-interaction path, so that my actions are not misreported as robot actions.
43. As a robot operator, I want reaction changes to use `set_msg_emoji_like`, so that implementation support and debug evidence are preserved.
44. As a protocol tester, I want reaction controls limited to group messages, so that the Sandbox does not invent private-message support absent from the baselines.
45. As a WebQQ user, I want reactions already present when a message is recalled to remain visible in marked mode, so that historical state is not erased.
46. As a protocol tester, I want recalled messages to reject new or removed reactions, so that their lifecycle is immutable.
47. As a plugin developer, I want `set_qq_profile` to persist `personal_note`, so that toolbox signature changes are observable.
48. As a plugin developer, I want account-profile reads to return the fields represented by the selected implementation baseline, so that profile tools can be tested realistically.
49. As a cross-protocol tester, I want typed profile fields rather than raw implementation JSON, so that shared semantics remain stable.
50. As a NapCat tester, I want supported profile writes such as sex changes represented accurately, so that NapCat-specific branches are testable.
51. As an LLOneBot tester, I want unsupported sex mutation not to be silently simulated, so that the Sandbox does not hide protocol differences.
52. As an environment manager, I want to prepare optional account, friendship and group-member profile fields, so that profile-card scenarios can be constructed deliberately.
53. As a WebQQ user, I want every participant avatar to offer “查看资料”, so that profile access is consistent across messages, contacts and member lists.
54. As a WebQQ user, I want the personal information card to show all scene data available for that participant, so that it serves as a complete test observer.
55. As a WebQQ user, I want each field labelled as account, friendship, group-member or robot-runtime information, so that similarly named values are not confused.
56. As a private-chat user, I want the right information panel to show the participant signature, so that personal context is visible without opening the card.
57. As a WebQQ user, I want the chat-header subtitle to remain uncluttered, so that signature information is not duplicated.
58. As a message author, I want recall to change the lifecycle state of my existing message, so that its identity and conversation position remain stable.
59. As a WebQQ user, I want recalled text and media retained by default with a clear recall line, so that I can inspect what a tested plugin removed.
60. As a WebQQ user, I want recalled messages visually weakened and labelled, so that retained content cannot be mistaken for active content.
61. As a ChatLuna tester, I want archived thought content to remain associated with the recalled robot message, so that reasoning does not float beside an unrelated event.
62. As a ChatLuna tester, I want thought content readable in marked mode, so that recall does not destroy diagnostic context.
63. As a WebQQ user, I want disabling marked recall to hide the original bubble, thought and reactions and show a recall event, so that the UI can resemble normal QQ behaviour.
64. As a WebQQ user, I want re-enabling marked recall to restore the retained message and diagnostic context, so that the setting is a presentation preference rather than destructive mutation.
65. As a plugin developer, I want `get_msg` to reject access to recalled original content, so that WebQQ diagnostics do not weaken OneBot recall semantics.
66. As a test controller, I want MCP and environment management to read the recalled authority record, so that recall remains verifiable.
67. As a test controller, I want a dedicated `message.recalled` event, so that recall can be awaited without polling snapshots.
68. As a test controller, I want `scene.changed` to continue alongside the recall event, so that generic scene observers remain correct.
69. As a ChatLuna tester, I want a late thought archive not to attach to an earlier robot message after recall, so that correlation remains trustworthy.
70. As a user, I want the recalled-message display preference enabled by default, so that test evidence is visible without configuration.
71. As a keyboard user, I want the message input focused again after a successful send, so that I can type and press Enter repeatedly.
72. As a keyboard user, I want the input focused again after a failed send, so that correcting and retrying does not require a mouse.
73. As a user, I want sending to remain single-flight, so that focus repair does not introduce duplicate or queued messages.
74. As a user switching conversations, I want an older send request not to steal focus from my new conversation, so that asynchronous completion does not disrupt navigation.
75. As a user switching operators, I want focus restoration to respect the current operator and current input, so that stale work does not alter another identity's composer.
76. As a WebQQ user, I want disabled composer controls to use normal pointer or text cursors, so that the interface does not show an unnecessary prohibition icon.
77. As a WebQQ user, I want disabled opacity and control state to remain visible, so that removing the cursor does not hide whether sending is available.
78. As a Chrome user, I want reaction pickers, profile cards, recall presentation and focus behaviour to work reliably, so that the primary browser remains supported.
79. As a Firefox user, I want the same interactions and layouts to work without browser-specific APIs, so that the project meets its compatibility contract.
80. As a narrow-screen user, I want pickers and profile cards to remain usable without overflowing or resizing dialogs unexpectedly, so that WebQQ remains operable on small viewports.
81. As a maintainer, I want all new floating controls to inherit explicit light and dark theme variables, so that Portal content does not fall back to black borders or transparent buttons.
82. As a maintainer, I want these behaviours divided into dependency-aware tickets, so that each implementation session can complete and verify one tracer-bullet slice.
83. As a reviewer, I want every ticket to prove external behaviour through the highest existing seam, so that tests do not couple to internal file layout.
84. As a maintainer, I want obsolete pre-release fields and fallback paths removed rather than preserved in parallel, so that the codebase keeps one authoritative model.

## Implementation Decisions

- AI test spaces are instance-owned shared resources. Credential identity is removed from space ownership and visibility checks; credential capability scopes remain mandatory for every tool.
- User takeover remains a space control state. While taken over, all MCP mutation is rejected regardless of credential.
- Existing persisted spaces must remain readable during the schema change. Obsolete ownership data is removed from the authoritative model rather than retained as a compatibility path.
- Every ordinary user, virtual OneBot robot and group has a managed avatar-image reference. A deterministic default image is generated from entity kind and stable ID when no custom image exists.
- Avatar inputs are normalized into managed media at write time. The scene never stores external avatar URLs, Data URLs, `base64://` bodies or raw binary after normalization.
- Existing persisted string avatars are imported once into managed media; after normalization, only the media-reference representation is supported.
- Avatar media is content-addressed or otherwise content-deduplicated. Cleanup is reference-aware and never deletes media still referenced by another entity or scene.
- Robot self-avatar changes continue to use the real `set_qq_avatar` action. Ordinary-user and group avatars are modified only through environment management, MCP scene preparation and scene import.
- OneBot debug records use an independent persistence interface with database and in-memory adapters. They are not embedded in the scene, scene export or MCP event buffer.
- Each space has a monotonically increasing debug-record sequence. Pagination is newest-first with default 50, maximum 200, `nextCursor` and `hasMore`.
- Record retention uses both a 5000-record limit and a 50 MiB full-content limit per space. Oldest records are removed first.
- A cursor pointing before retained history returns structured `cursor_expired` information including the earliest available cursor.
- A robot action record contains the plugin's `requestedAction`, normalized `action`, optional `matchedAlias`, implementation, bot identity, sanitized parameters, affected-entity indexes, duration and a discriminated result.
- Successful action records contain `status: success` and `result`. Failed records contain `status: error` and a structured error with stable code, message, retryability and trace identifier.
- Old `type` and `resolvedType` action-record fields are removed. Internal storage, WebQQ, Console RPC, MCP list, MCP wait and tests use the same record model.
- `action` filtering uses the normalized action and includes all declared aliases. `requestedAction` filtering is exact. Supplying both applies AND semantics.
- `wait_for_onebot_action` returns `{ matched, record, cursor }` on success rather than requiring callers to read the record from a generic event payload.
- Debug storage retains complete action parameters and results. Base64-like values larger than 8 KiB are folded in normal output into metadata containing encoding, MIME when known, character count, estimated byte length and SHA-256.
- List and wait interfaces never expand folded large values. A single-record detail interface can expand one record only when `includeLargeValues` is explicitly enabled.
- Account profiles use typed optional fields representing the current NapCat and LLOneBot baseline superset. Implementation adapters map real field names into the shared domain meanings.
- Account profile, friendship-local data, group-member data and robot-runtime data remain separate models. The personal information card composes them for observation without flattening their ownership.
- `set_qq_profile` follows the selected implementation: both baselines support nickname and personal note, while NapCat alone supports sex mutation. Unsupported writes must not be silently accepted.
- Personal information cards are read-only observation views. They display all available scene information, grouped and labelled by semantic source.
- All participant-avatar contexts offer a right-click “查看资料” action while preserving existing friend, poke and group-management actions.
- The private-chat right information panel displays the participant's personal note. The chat-header subtitle is unchanged.
- Message reactions remain state on the message and are supported only for group messages. The WebQQ projection uses TIM-style chips with emoji, participant-avatar stacking and total count.
- The reaction picker uses a bundled, maintainable OneBot/QFace catalog with a common section and search; core use does not depend on a runtime remote catalog.
- Ordinary-user reaction intent uses the user-interaction path. Robot reaction intent invokes `set_msg_emoji_like` and therefore observes implementation capability, errors and action debugging.
- A recalled message retains existing reactions but rejects all later reaction mutation.
- Recall uses a discriminated message lifecycle state independent from poke and other system-event messages. The state records operator and recall time.
- Authority state retains original message content, media, reply relationships, reactions and archived ChatLuna information. These are not duplicated into a secondary recall cache.
- Ordinary OneBot reads treat a recalled message as unavailable. MCP and environment-management reads can inspect the retained authority record and lifecycle state.
- `webQQMarkRecalledMessages` is a global WebQQ presentation setting, defaults to true and never changes authority state or OneBot behaviour.
- Marked mode keeps the original message position, strikes text, draws a recall line across media, lowers visual emphasis and labels the message as recalled. Archived thought remains readable in its normal style within the weakened message context. Reactions remain visible and read-only.
- Event mode hides the original bubble, thought and reactions and renders a recall event. Switching back to marked mode restores the retained projection immediately.
- Recall emits both a dedicated `message.recalled` MCP event and the generic scene-change event.
- ChatLuna archival uses the exact response-message identity. It must not search backward to an earlier robot message when the intended message has been recalled before archival completes.
- The composer keeps its existing single-flight send behaviour. It may disable input during the request, but restores focus after success or failure on the next render tick.
- Focus restoration is conditional on the same composer instance, conversation and operator still being active. Stale requests never steal focus.
- Disabled textarea, attachment, emoji and send controls do not use a `not-allowed` cursor. Disabled semantics, accessibility attributes and opacity remain.
- Existing unreleased model fields, aliases, fallbacks and dual representations are removed once their replacement is implemented. One-time normalization of actively used development data does not become a permanent compatibility layer.

## Testing Decisions

- Tests use four high-level seams: the sandbox-domain module, the test-space module, the MCP module and the WebQQ workspace module. No feature-specific production test interface is added.
- The sandbox-domain seam verifies avatar and profile state, reaction mutation, recall lifecycle, ChatLuna association and OneBot read visibility through public domain commands and runtime bot actions.
- The test-space seam verifies shared credential access, scope enforcement, user takeover, completion, restart recovery and preservation of existing spaces through in-memory and database adapters.
- The MCP seam verifies persistent debug paging, cursor expiry, retention limits, normalized action records, alias filters, Base64 folding, single-record expansion, wait return shape and recall events.
- The WebQQ workspace seam verifies observable reaction controls, personal information cards, signature placement, recall presentation modes and composer focus through the existing WorkspacePort and mounted region views.
- Media and persistence adapters are replaced with in-memory fakes in fast tests and exercised with their real filesystem/database adapters in integration tests. Tests do not assert private paths, SQL statements or internal array layouts.
- Good tests assert external state, returned records, emitted events, visible UI and protocol errors. They do not assert helper invocation counts or private implementation details unless those calls are the adapter contract itself.
- Space-sharing tests create spaces under one credential, rotate or replace the credential, and prove another valid credential can discover and operate them according to scope.
- Avatar tests cover deterministic defaults, rename stability, URL/Data URL/base64/upload normalization, restart persistence, deduplication, shared references and final-reference cleanup.
- Existing development-avatar normalization is tested as a one-time conversion with no ongoing dual-format read path.
- Debug paging tests interleave new records between pages and prove no duplicate or skipped sequence; retention tests prove old cursors expire predictably under both count and byte limits.
- Action-record contract tests run representative canonical and aliased actions under both NapCat and LLOneBot, including success and error results.
- Base64 tests cover values hidden by content rather than field name, ensure pages and waits remain folded, and verify explicit expansion only for one requested record.
- Reaction tests cover ordinary-user interaction, robot action, adding, removing, multiple participants, count rendering, capability disabled errors, private-message rejection and recalled-message immutability.
- Profile tests cover typed round-trips through environment management, persistence and OneBot reads, plus NapCat/LLOneBot `set_qq_profile` differences.
- Personal-card view tests cover every avatar entry point, grouping of similarly named fields, complete-scene visibility and signature rendering in private details.
- Recall tests cover both presentation modes against the same retained authority state, OneBot read rejection, MCP read visibility, reaction lock, thought visibility rules and configuration toggling without data loss.
- ChatLuna race tests reproduce recall before archival completion and prove thought attaches only to the intended message or remains pending rather than moving to an earlier message.
- Composer tests cover success, failure, repeated keyboard sending after completion, conversation switching, operator switching and component unmount before request completion.
- Browser validation uses Ego Browser and covers Chrome and Firefox at desktop and narrow widths. Floating pickers and cards are checked for Portal placement, theme variables, border colors, trigger-width alignment, pointer hit testing and unchanged dialog height.
- Existing prior art includes scene persistence tests, OneBot bridge tests, MCP service wait tests, message delivery and recall tests, workspace-controller tests, message-list tests, composer tests and the existing WebQQ modularization browser evidence pattern.
- Every implementation ticket must run targeted red-green tests first, then the project test suite, typecheck and build. WebUI tickets additionally require real-browser verification and cleanup of browser-generated temporary files.

## Out of Scope

- Adding OAuth or changing Bearer-token authentication.
- Allowing MCP tools to create, modify or revoke credentials.
- Restoring per-token ownership or private test spaces.
- Persisting the short-lived MCP event-wait buffer across restart.
- Embedding debug records or media binaries in scene export documents.
- Inventing OneBot actions for changing ordinary-user or group avatars.
- Inventing private-message support for `set_msg_emoji_like`.
- Reproducing every undocumented or unstable field from raw NapCat and LLOneBot responses.
- Showing a privacy-filtered personal card from the current operator's perspective; the card is an explicit full-scene test observer.
- Adding profile editing controls to the personal information card.
- Adding a message-send queue or allowing multiple concurrent sends from one composer.
- Changing ChatLuna model behaviour, prompts, tool selection or token accounting semantics beyond correct message association.
- Preserving unreleased legacy fields, aliases or dual data models after replacement.
- Rebuilding the overall WebQQ layout or introducing a new visual design system.
- Copying `koishi-plugin-onebot-webqq` raw WebSocket interception, storage tables or implementation-specific event cache.

## Further Notes

- The earlier “撤回后不保留原文” decision is superseded. Authority state now retains original content, while OneBot visibility and WebQQ presentation are separate concerns.
- Existing database inspection confirmed historical AI test spaces remain stored; the apparent loss is caused by credential ownership filtering.
- Existing database inspection also confirmed robot avatars remain stored as `base64://` strings; the apparent reset is a rendering and media-normalization failure rather than absent persistence.
- The reference `koishi-plugin-onebot-webqq` provides useful reaction and marked-recall visual prior art, but it does not provide an active reaction picker, personal information card or composer focus repair.
- The current project is unreleased. Replacement models should be applied directly, with only narrow one-time normalization for actively used development data rather than permanent compatibility branches.
- This specification is the source for `/to-tickets`. Earlier feature-specific specs and issue drafts remain research inputs and must not produce duplicate tickets.
