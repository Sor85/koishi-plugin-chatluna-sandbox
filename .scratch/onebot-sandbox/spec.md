# OneBot Sandbox 插件规格

Status: ready-for-agent

## Problem Statement

Koishi 原版 sandbox 适合快速发送消息和观察插件回复，但不足以验证依赖真实 QQ 关系、群权限、OneBot 私有 action、实现差异和多机器人环境的插件。插件开发者目前缺少一个可控、可观察、可重复的模拟 QQ 环境，难以在不连接真实 QQ 账号的情况下验证以下行为：

- 用户以普通成员、管理员或群主身份执行不同操作时，插件是否收到正确事件
- 用户戳一戳机器人、申请好友、邀请入群、踢人或修改群名片后，插件是否按预期响应
- 插件通过标准 Koishi API、OneBot 原始事件、`bot.internal` 或底层 action 调用时是否兼容
- NapCat 与 LLBot 对同一能力的参数、返回值和扩展 action 差异是否得到正确处理
- 一个 Koishi 实例中同时存在多个机器人时，插件是否正确区分机器人、会话和状态
- 插件修改机器人自身昵称或头像后，新的机器人资料是否真实反映在后续环境中
- ChatLuna 的思考状态和 Token 用量是否与正确的机器人及会话关联
- 外部 AI 是否可以自主准备测试用户、执行交互并读取结构化结果，而不获得不必要的完整环境管理权限

现有 `koishi-plugin-onebot-webqq` 提供了接近 QQ 的 WebQQ 视觉和交互形式，但其界面入口、Vue 实现、胶囊运行方式和真实 OneBot 运行时耦合，不适合作为本插件的直接实现。用户需要保留该界面的视觉与使用习惯，同时把它改造成从 Koishi 左侧导航进入、铺满内容区域的独立沙盒工作台。

## Solution

创建 `onebot-sandbox` Koishi 插件，在一个服务端持有的沙盒场景中模拟用户、虚拟 OneBot 机器人、好友关系、群组、成员角色、消息、申请、通知、媒体和权限。插件同时提供：

- 一个以 `onebot-webqq` 当前界面为视觉基线、使用 React、Tailwind CSS 和 shadcn/ui 重写的 WebQQ 工作台
- 一个兼容标准 Koishi 行为、OneBot 原始事件、`bot.internal` 和底层 action 调用的虚拟 OneBot 机器人层
- 可分别选择 NapCat 或 LLBot 实现配置的多机器人目录，以及按机器人禁用能力的能力覆盖
- 默认以内存为唯一真实状态，并可选择 Koishi Database 进行场景持久化的状态层
- 用于观察 OneBot 调用、原始事件、错误、ChatLuna 思考状态和 Token 用量的调试能力
- 默认关闭、独立监听、安全受控的 MCP Streamable HTTP 测试控制端点，供外部 AI 读取环境、创建测试用户、执行真实用户交互并等待结果

WebQQ 与 MCP 共用同一个传输无关的测试控制服务。该服务是主要测试接缝，也是用户交互、环境管理、权限校验、事件生成和状态变更的唯一领域入口。WebQQ RPC 与 MCP 只负责输入输出适配，不复制业务规则。

## User Stories

1. As a Koishi plugin developer, I want to install one sandbox plugin, so that I can test OneBot-dependent plugins without connecting a real QQ account.
2. As a Koishi administrator, I want to open the sandbox from the left navigation, so that it behaves like a normal full-page Koishi WebUI feature instead of a floating capsule.
3. As a WebQQ user, I want the workspace to visually reproduce the existing onebot-webqq interface, so that familiar navigation, conversations and controls remain recognizable.
4. As a WebQQ user, I want the workspace to fill the available Koishi content area, so that the QQ-style three-column interface has enough usable space.
5. As a Koishi administrator, I want appearance options to be global plugin configuration, so that all operators see one consistent WebQQ theme.
6. As a WebQQ user, I want my selected current user and current view to remain browser-local, so that another browser can independently operate a different user without changing the shared environment.
7. As a WebQQ user, I want to switch between ordinary users freely, so that I can reproduce interactions from different QQ identities.
8. As a test environment administrator, I want to create, edit and delete ordinary users, so that I can prepare the exact participants required by a plugin test.
9. As a test environment administrator, I want to create, enable, disable and delete virtual OneBot robots freely, so that I am not limited to fixed NapCat and LLBot slots.
10. As a test environment administrator, I want each virtual robot to select NapCat or LLBot independently, so that both implementations can coexist in one scene.
11. As a plugin developer, I want each robot to expose its implementation baseline and snapshot date, so that I know which upstream behavior is being simulated.
12. As a plugin developer, I want to disable individual supported capabilities on a robot, so that I can verify capability detection and graceful degradation.
13. As a plugin developer, I want unsupported actions to return an explicit unsupported result, so that the sandbox never hides a missing capability by pretending success.
14. As a WebQQ user, I want every manual action to originate from the selected current user, so that the workspace behaves like a user-side QQ client.
15. As a plugin developer, I want operators to be unable to act directly as a robot, so that tests cannot bypass the plugin behavior being validated.
16. As a WebQQ user, I want to send private messages to friends and robots, so that I can test normal direct-message handling.
17. As a WebQQ user, I want to send messages to groups I belong to, so that I can test group message handling.
18. As a WebQQ user, I want to send text, images, files, voice and video references, so that plugins handling common QQ message elements can be tested.
19. As a WebQQ user, I want to reply to and reference existing messages, so that plugins depending on reply context can be tested.
20. As a WebQQ user, I want to view conversation history, so that I can inspect the complete interaction around a plugin response.
21. As a WebQQ user, I want to right-click another user or robot, so that I can access QQ-style contextual actions without leaving the conversation.
22. As a WebQQ user, I want context actions to open through nested menus, so that the interaction remains consistent with the WebQQ visual baseline.
23. As a WebQQ user, I want to poke a friend or robot, so that I can verify whether the plugin receives the notice and responds with the expected tone.
24. As a WebQQ user, I want to set a local friend remark, so that I can distinguish local naming from public profile nicknames.
25. As a WebQQ user, I want to send a friend request, so that I can test request creation and approval behavior.
26. As a WebQQ user, I want to approve or reject requests addressed to me, so that user-side relationship changes require explicit decisions.
27. As a plugin developer, I want friend requests addressed to a robot to remain pending until the plugin calls the appropriate action, so that robot approval logic is genuinely tested.
28. As a WebQQ user, I want to request group membership, so that I can test group request handling.
29. As a WebQQ user, I want to invite another user or robot into a group, so that I can test invitation handling.
30. As a plugin developer, I want invitations or applications addressed to a robot to be handled by the plugin through OneBot actions, so that the operator cannot silently approve them on the robot's behalf.
31. As a group member, I want to leave a group, so that plugins can observe a real departure event.
32. As a group administrator, I want to remove an ordinary member, so that plugins can observe a real kick event.
33. As a group administrator, I want unauthorized removal attempts to fail, so that permission-sensitive plugin behavior is tested accurately.
34. As a group owner, I want to grant or revoke administrator status, so that role-change events and permission transitions can be tested.
35. As a group member, I want to change my own group card, so that plugins can receive the appropriate member update.
36. As an authorized group manager, I want to change another member's group card, so that management actions follow QQ role rules.
37. As an authorized group manager, I want to change the group name, so that plugins can observe group metadata changes.
38. As a WebQQ user, I want profile nickname, friend remark, group card and group name to remain distinct, so that tests do not conflate different QQ naming concepts.
39. As a plugin developer, I want robot-generated actions to modify the same scene used by WebQQ, so that plugin calls and user observations never diverge.
40. As a plugin developer, I want a robot to modify its own nickname and avatar through supported actions, so that self-profile capabilities can be validated end to end.
41. As a plugin developer, I want standard Koishi sessions and events, so that plugins written only against Koishi APIs can run in the sandbox.
42. As a plugin developer, I want OneBot raw event payloads, so that plugins inspecting protocol-specific fields can run in the sandbox.
43. As a plugin developer, I want `bot.internal` methods and low-level action requests, so that plugins relying on OneBot private interfaces can be tested.
44. As a plugin developer, I want NapCat and LLBot aliases and response differences to remain separate, so that compatibility bugs are not hidden behind a merged action superset.
45. As a plugin developer, I want stable responses for common runtime and status actions, so that ordinary plugin initialization succeeds without a real client.
46. As a plugin developer, I want host-only capabilities such as cookies, device state, OCR and AI voice to be explicitly out of scope initially, so that unsupported results remain honest.
47. As a ChatLuna user, I want to see the thinking state for the active robot and conversation, so that I can verify the response lifecycle.
48. As a ChatLuna user, I want to see Token usage for the active robot and conversation, so that I can inspect model consumption without mixing data from other chats.
49. As a multi-robot tester, I want simultaneous ChatLuna states to remain isolated by robot and conversation, so that concurrent responses do not overwrite each other.
50. As a Koishi administrator, I want the default scene to contain useful robots, users, groups and relationships, so that the sandbox is immediately usable after installation.
51. As a Koishi administrator, I want scene changes to live only in server memory by default, so that the sandbox remains disposable and predictable.
52. As a Koishi administrator, I want to enable Koishi Database persistence optionally, so that long-running test environments can survive plugin restarts.
53. As a Koishi administrator, I want media binaries stored outside scene state and database rows, so that large payloads do not bloat structured persistence.
54. As a Koishi administrator, I want orphaned sandbox media cleaned according to the selected persistence mode, so that storage does not grow indefinitely.
55. As a test environment administrator, I want to silently prepare users, robots, groups and relationships, so that test setup does not generate runtime events.
56. As a plugin developer, I want environment management and participant interactions to be separate, so that setup activity cannot be mistaken for the behavior under test.
57. As a plugin developer, I want recent OneBot actions, raw events and errors visible as debug records, so that I can trace failures without replaying them.
58. As a plugin developer, I want debug records separated from message history, so that diagnostic data cannot alter QQ conversations.
59. As an external AI, I want a documented MCP endpoint, so that I can automate sandbox testing through a standard tool protocol.
60. As a Koishi administrator, I want the MCP endpoint disabled by default, so that installing the plugin does not expose a remote control surface.
61. As a Koishi administrator, I want MCP to bind to `127.0.0.1` by default, so that local automation works without exposing the endpoint to the network.
62. As a Koishi administrator, I want to bind MCP to `0.0.0.0` or a specific address, so that I can intentionally allow remote test controllers.
63. As a Koishi administrator, I want an IP and CIDR allowlist based on the real TCP peer address, so that only explicitly allowed sources can connect.
64. As a Koishi administrator, I want proxy forwarding headers ignored, so that a client cannot spoof its allowed source address.
65. As a Koishi administrator, I want exact Origin validation when Origin is present, so that browser-origin requests cannot use wildcard or ambiguous matching.
66. As a Koishi administrator, I want TLS required for non-loopback MCP listeners, so that Bearer credentials and test data are protected in transit.
67. As a Koishi administrator, I want an explicit insecure-remote escape hatch with persistent warnings, so that temporary development needs do not silently become production defaults.
68. As a Koishi administrator, I want multiple named Bearer credentials, so that different test controllers can be identified and revoked independently.
69. As a Koishi administrator, I want generated credential tokens displayed only once and stored only as digests, so that plaintext secrets cannot be recovered from configuration or logs.
70. As a Koishi administrator, I want credentials scoped to read, interact, provision, manage and debug capabilities, so that each controller receives only the access it needs.
71. As an external AI with read access, I want to inspect the scene, roles, capabilities, conversations and requests, so that I can understand the current test conditions.
72. As an external AI with interact access, I want to act as an explicitly selected ordinary user, so that my actions obey the same QQ permissions as WebQQ interactions.
73. As an external AI, I want every interactive tool to require `actorUserId`, so that there is no hidden or session-global identity.
74. As an external AI, I want to create a test user with the required profile, relationships and group role, so that I can autonomously prepare missing test identities.
75. As an external AI, I want to create a new group owned by my test user when group-owner behavior is required, so that I can test owner-only actions without taking over an existing group.
76. As a Koishi administrator, I want provision access separated from full environment management, so that an AI can create its own test users without modifying unrelated existing entities.
77. As an external AI, I want test users tied to my credential and optional test run, so that I cannot alter or release another controller's users.
78. As an external AI, I want test users to expire automatically, so that abandoned automation runs do not permanently pollute the scene.
79. As an external AI, I want to release my own test user without a destructive confirmation flow, so that normal cleanup remains simple.
80. As an external AI, I want to upload media once and reference it by ID, so that message tools do not carry large Base64 payloads repeatedly.
81. As a Koishi administrator, I want external HTTPS media references not to be fetched by the server, so that the MCP surface cannot be used for SSRF.
82. As an external AI, I want mutating calls to require idempotency keys, so that retries cannot duplicate messages, users or management operations.
83. As an external AI, I want scene-management calls to use expected scene revisions, so that concurrent changes cannot be overwritten silently.
84. As a Koishi administrator, I want destructive management operations to require a short-lived confirmation token, so that reset, clear, import and deletion require deliberate two-step execution.
85. As an external AI, I want mutating commands to return immediately with identifiers and an event cursor, so that I can wait for resulting behavior separately.
86. As an external AI, I want to wait for events, messages or ChatLuna state from a known cursor, so that old activity cannot be mistaken for the current test result.
87. As an external AI, I want wait timeouts returned as structured results, so that I can decide whether to retry without parsing transport errors.
88. As an external AI, I want expired cursors reported explicitly after restart, reset, import or buffer rollover, so that I can refresh my baseline safely.
89. As an external AI, I want an optional test-run identifier propagated only through sandbox observations, so that related calls can be correlated without revealing test metadata to the plugin.
90. As an external AI, I want stable structured error codes, retryability and recovery suggestions, so that automation does not depend on changing Chinese error text.
91. As a Koishi administrator, I want per-credential query, mutation, wait and upload limits, so that one controller cannot exhaust the sandbox.
92. As a Koishi administrator, I want MCP call records stored separately and redacted, so that I can audit automation without exposing tokens or media contents.
93. As an external AI with debug access, I want to read OneBot and MCP debug records, so that I can diagnose a failed test using structured facts.
94. As an external AI, I want read-only MCP resources describing the guide, scene schema, profiles, errors and examples, so that I can discover the contract without external documentation.
95. As an external AI, I want tools outside my scopes omitted from discovery, so that the advertised interface accurately reflects my available actions.
96. As an external AI, I want to export a versioned JSON scene, so that I can preserve reproducible test fixtures without copying credentials or media binaries.
97. As an authorized environment manager, I want scene imports to validate all references before replacing the current state, so that an invalid fixture cannot partially corrupt the environment.
98. As an external AI, I want the test-control API version independent from the plugin and MCP protocol versions, so that I can reject incompatible tool contracts at connection time.
99. As a WebQQ user, I want the interface to work in both Chrome and Firefox, so that the sandbox is not tied to one browser engine.
100. As a keyboard and assistive-technology user, I want menus, dialogs, navigation and forms to retain accessible semantics, so that the QQ-style visual design does not remove standard interaction support.

## Implementation Decisions

### Product Boundary

- The plugin models one shared simulated QQ environment per Koishi instance.
- A sandbox scene contains virtual OneBot robots, ordinary users, test users, friendships, groups, memberships, roles, requests, conversations, messages, media references, notifications and capability settings.
- Virtual OneBot robots do not accept external OneBot HTTP or WebSocket connections.
- The first release prioritizes capabilities that query or modify the simulated QQ environment and the common runtime status calls required by plugins.
- Host-only capabilities such as cookies, login credentials, device control, cache manipulation, OCR and AI voice are not simulated in the first release.

### WebQQ Workspace

- The current `onebot-webqq` interface is the visual baseline and should be reproduced at one-to-one fidelity unless a difference is explicitly discussed and approved.
- The theme framework and page structure are rewritten with React and Tailwind CSS rather than reusing the existing Vue components.
- shadcn/ui is preferred for generic accessible interactions such as context menus, nested menus, dialogs, dropdowns, tooltips and forms.
- Custom React components are used only where the WebQQ-specific visual structure cannot be represented cleanly by existing shadcn primitives.
- The Koishi console boundary remains a thin Vue shell that mounts the React application.
- The workspace is registered in the Koishi left navigation and fills the content area rather than opening through a capsule.
- Layout and interactions use an 8 px spacing system, avoid arbitrary colors and gradients, and use SVG icons with Tabler Icons as the first choice.
- Global appearance options live in Koishi plugin configuration. Browser-local storage is limited to the selected current user, active conversation and other view state.
- The WebUI must support current Chrome and Firefox releases without browser-specific experimental APIs that lack a compatible fallback.

### State Ownership

- The server is the authoritative owner of the sandbox scene.
- Memory is the default and only authoritative storage in the default mode. A plugin restart restores the default scene.
- Koishi Database persistence is optional. When enabled, the database persists structured scene state and media metadata across restarts.
- WebQQ, OneBot action handlers and MCP never maintain independent authoritative copies of the scene.
- State mutations are serialized through the shared test control service and produce a new scene revision.
- The default scene provides enough robots, users, groups, relationships and requests to test messaging, relationship approval and group permissions immediately.

### Shared Test Control Service

- A single transport-independent test control service is the primary domain and testing seam.
- WebQQ RPC, virtual OneBot adapters and MCP call the same service or its explicit domain-facing operations instead of duplicating state transitions.
- Environment management operations silently prepare state and never emit QQ participant events.
- User interactions enforce current relationships, group roles and capability availability, mutate the scene and emit the corresponding Koishi and OneBot events.
- Robot actions originate only from plugin calls through the virtual bot surface and mutate the same scene.
- The service distinguishes participant actions from environment management in its public operation model.

### Identity and Permission Model

- WebQQ always operates as the selected current user.
- MCP interactive operations always require an explicit `actorUserId`; there is no server-side current-user session.
- Operators and external test controllers cannot impersonate a virtual OneBot robot.
- Friend, group and management actions follow QQ-style permission rules at execution time.
- User nickname, friend remark, group card, group name and robot profile are separate fields with separate mutation rules.
- Group owner, administrator and member roles determine actions such as member removal, administrator changes, group-name changes and member-card changes.
- Existing group ownership cannot be silently transferred merely to prepare a test. A new test group may instead be created with the test user as owner.

### Relationship Requests

- User-side friend requests, group applications and invitations create pending requests rather than immediate relationships.
- Ordinary users process requests from the WebQQ notification surface or equivalent user interaction tools.
- Requests addressed to virtual robots remain pending until a tested plugin invokes the corresponding OneBot action.
- Environment management may create pre-existing relationships silently for fixture preparation.

### Virtual OneBot Robots

- The robot directory permits unrestricted creation, deletion, enabling and disabling of robots.
- Each robot independently selects exactly one implementation profile: NapCat or LLBot.
- Both profile types can be active in the same scene.
- Each implementation profile maintains one documented compatibility baseline rather than a historical-version selector.
- The profile controls raw event fields, method aliases, action names, parameters, responses and native extensions.
- Per-robot capability overrides can disable capabilities present in the selected baseline but cannot invent arbitrary new actions.
- Unsupported or disabled actions return explicit failures rather than fabricated success.
- The virtual bot exposes standard Koishi sessions and events, OneBot raw event data, internal methods and low-level action requests.
- Robot self-profile actions can modify the robot's nickname and avatar when supported by the selected profile and capability overrides.

### Messages and Media

- The message model supports the common elements needed by QQ plugin tests, including text, image, file, voice, video, mentions, replies and structured references supported by the compatibility baseline.
- Media binaries live in a plugin-controlled file-system directory; scene state contains safe identifiers and metadata only.
- Memory-mode temporary media is cleaned when the disposable scene is reset or restarted.
- Database-mode media remains while referenced and is removed when it becomes orphaned according to the configured cleanup policy.
- MCP uploads accept Base64 content with MIME, file name and optional digest, then return a reusable media identifier.
- MCP message tools accept existing media identifiers or external HTTPS references. The server does not fetch the external URL.
- Local paths and `file://` references are rejected at the MCP boundary.

### ChatLuna Compatibility

- ChatLuna compatibility is intentionally limited to the thinking state and model Token usage requested by the user.
- State is correlated by robot self ID, conversation type, peer or group ID and conversation ID.
- Concurrent states from different robots or conversations remain isolated.
- Events whose ownership cannot be determined are not displayed as a global fallback.
- Both WebQQ and MCP can observe the correlated state, but it is not injected into ordinary OneBot events unless ChatLuna already exposes it there.

### MCP Transport

- The public automation interface is MCP Streamable HTTP only. No parallel REST or CLI contract is introduced initially.
- MCP runs on an independent Node.js HTTP listener and does not reuse the Koishi main HTTP server.
- The transport is stateless and does not maintain server-side MCP sessions.
- The endpoint is disabled by default.
- The default listener is `127.0.0.1`, port `61901`, path `/mcp`.
- Host, port and allowed sources are configurable. Port conflicts fail visibly and do not trigger an automatic port change.
- MCP startup and runtime failures do not disable WebQQ or the sandbox scene.

### MCP Network Security

- Source filtering uses the real TCP remote address and supports IPv4, IPv6 and CIDR rules.
- Forwarding headers are ignored.
- A missing Origin is accepted for non-browser clients. A present Origin must exactly match an explicit scheme, host and port entry.
- Wildcard origins, suffix matching and `null` origins are rejected.
- Loopback listeners may use HTTP.
- Non-loopback listeners require configured TLS certificate and key by default.
- An explicit insecure-remote option may allow non-loopback HTTP, but the logger and management UI continuously show a security warning while it is active.

### MCP Credentials and Scopes

- MCP uses multiple named Bearer credentials managed only from the Koishi authority-4 WebUI.
- Tokens are generated by the server with at least 32 bytes of entropy and are displayed in plaintext once.
- Only a SHA-256 token digest and credential metadata are persisted in the plugin data directory.
- Credentials are not stored in Koishi Database and are not affected by scene reset or import.
- MCP cannot create, edit or revoke credentials or alter endpoint configuration.
- The five capability scopes are `read`, `interact`, `provision`, `manage` and `debug`.
- New credentials default to `read` only.
- Scopes apply to the shared scene rather than individual users, robots or groups.
- Tools unavailable to the authenticated credential are omitted from MCP discovery.

### MCP Tool Contract

- The first test-control API version exposes 27 high-level domain tools and no raw arbitrary OneBot action tool.
- Read tools are `get_server_info`, `get_scene_snapshot`, `list_conversations`, `get_conversation`, `list_pending_requests`, `get_capability_matrix` and `export_scene`.
- Interact tools are `upload_media`, `send_message`, `perform_friend_action`, `perform_group_action`, `handle_request`, `wait_for_event`, `wait_for_message` and `wait_for_chatluna_state`.
- Provision tools are `provision_test_user` and `release_test_user`.
- Manage tools are `apply_environment_changes`, `prepare_destructive_action`, `delete_environment_entity`, `reset_scene`, `clear_scene` and `import_scene`.
- Debug tools are `list_onebot_debug_records`, `clear_onebot_debug_records`, `list_mcp_call_records` and `clear_mcp_call_records`.
- All IDs are strings. Generated QQ IDs are decimal numeric strings, and requested IDs must be unused decimal numeric strings.
- Growing collections use cursor pagination with a default page size of 50 and maximum of 200.
- Mutating commands return affected identifiers, the resulting scene revision and an event cursor immediately; observation uses separate wait tools.
- The server returns structured facts and never decides whether an external AI's test has passed.

### Test Users

- The `provision` scope creates ordinary test users without granting full management access.
- A provision request can configure profile fields, friendships, memberships, administrator roles and an optional newly created owned group.
- Test users record the creating credential, optional test-run identifier and expiry.
- The default lifetime is 60 minutes, configurable per request from 5 to 1440 minutes.
- A provisioned test user behaves exactly like any other ordinary user during interactions.
- A credential can modify or release only its own test users through provision operations.
- Releasing an owned test user is silent and does not require destructive two-step confirmation.
- Expired test users are cleaned silently and increment the scene revision.
- Tests that need observable leave, kick or relationship-removal events must perform real interactions before cleanup.

### Concurrency and Safety

- Every interact, provision and manage mutation requires an idempotency key.
- Idempotency is scoped by credential, tool, key and current event epoch.
- A repeated call with identical normalized arguments replays the original result without executing again.
- Reusing a key with different arguments returns an idempotency-conflict error.
- Provision and manage operations require an expected scene revision.
- Interact operations do not require a revision and instead perform current-time QQ permission and relationship checks.
- Deleting an existing entity, resetting, clearing or importing the scene requires a short-lived confirmation token prepared for the exact credential, action, arguments and revision.
- Confirmation tokens expire after 60 seconds, are single-use and become invalid when parameters or scene revision change.
- Releasing a credential-owned test user is excluded from destructive confirmation.

### Events and Waiting

- The event stream uses an epoch plus monotonically increasing sequence cursor.
- Events are stored only in an in-memory ring buffer.
- Restart, reset, clear, import or buffer rollover can expire a cursor and must return an explicit cursor-expired result.
- Wait calls accept a timeout from 1 to 120 seconds, defaulting to 30 seconds.
- A wait timeout is a structured expected result rather than a protocol failure.
- An optional client-supplied test-run identifier correlates commands and observations inside the sandbox only.
- Test-run identifiers, credentials and MCP origin data never enter tested-plugin-visible sessions, raw events or message elements.

### Errors, Limits and Records

- Expected validation, permission, capability, concurrency, waiting and media failures return stable error codes, a retryable flag, optional details, a recovery suggestion and a trace identifier.
- MCP protocol parsing and unknown-method errors remain MCP protocol errors.
- Unexpected exceptions return only an internal-error code and trace identifier; full stacks remain in Koishi Logger.
- Limits are applied per credential with configurable finite values.
- Recommended defaults are 120 read calls per minute, 60 mutation calls per minute, four concurrent mutations, eight concurrent waits, two concurrent uploads and a 120-second maximum wait.
- OneBot debug records and MCP call records are separate in-memory ring buffers.
- MCP call records default to 500 entries and contain credential identity, real source IP, tool, test-run identifier, idempotency digest, duration, outcome, affected IDs and trace identifier.
- Tokens, uploaded Base64 content and private keys are never logged.
- Message text is summarized by default and is included in full only when a global detailed-debug option is explicitly enabled.
- Authentication failures are written to Koishi Logger and are not exposed through debug tools to unauthenticated clients.

### MCP Resources and Versioning

- Read-only resources describe the usage guide, scene schema, NapCat baseline, LLBot baseline, stable errors and tool examples.
- Resource content is filtered so that it cannot bypass credential scopes.
- The test-control contract starts at `testApiVersion = 1`, independent from MCP protocol, plugin package and compatibility-profile versions.
- Compatible additions remain within the current test API version.
- Breaking changes use a new MCP route version, while the previous API is retained for at least one plugin major version.
- Server information and the guide resource expose the plugin version, MCP SDK version, test API version and profile baselines.

### Scene Import and Export

- Scene export is available with `read` access and produces independently versioned JSON.
- Export contains simulated environment state and media references but not media binaries, credentials, endpoint configuration or debug records.
- Scene import requires `manage`, an idempotency key, expected scene revision and destructive confirmation.
- Import validates format, version, unique IDs, relationships, roles, profile references and media references before changing state.
- Import is atomic and starts a new event epoch after success.

## Testing Decisions

### Primary Test Seam

- The single primary test seam is the shared transport-independent test control service.
- Domain tests invoke public service operations and assert observable scene state, emitted Koishi sessions, OneBot raw events, robot action results and event-stream output.
- WebQQ RPC and MCP adapters receive thin contract tests proving they validate, authorize and translate input correctly, then delegate to the same service.
- Tests must not assert private helper calls, internal class layout or incidental serialization steps.
- New lower-level seams should be introduced only when an external protocol boundary cannot be tested reliably through the shared service.

### Domain Behavior Tests

- Test user identity selection and verify WebQQ and MCP interactions produce equivalent plugin-visible events.
- Test friend requests, approvals, rejections, removal and remarks as externally visible state transitions.
- Test group applications, invitations, departures, kicks, role changes, group cards and group names across member, administrator and owner roles.
- Test that unauthorized actions fail without partially changing state.
- Test that environment management prepares state silently while participant interactions emit events.
- Test robot self-profile changes through supported OneBot actions.
- Test multiple robots sharing one environment without leaking identities or conversation state.
- Test capability overrides and explicit unsupported results.
- Test request handling differences between ordinary users and virtual robots.
- Test scene revisions, atomic changes and conflict rejection.

### OneBot Compatibility Tests

- Maintain profile-specific contract fixtures for the chosen NapCat and LLBot baselines.
- Verify standard Koishi session fields and events used by plugins.
- Verify OneBot raw event payloads, action names, aliases, parameters and response shapes for each profile.
- Verify the internal-method and low-level action surfaces delegate to the same robot behavior.
- Verify unsupported host-only actions fail explicitly.
- Verify each robot's capability override affects only that robot.
- Treat the upstream baseline identifier and documentation snapshot date as part of each compatibility fixture.

### ChatLuna Tests

- Test thinking-state and Token updates for one conversation.
- Test simultaneous conversations on one robot.
- Test simultaneous conversations across multiple robots.
- Verify an uncorrelated event is not displayed as global state.
- Verify WebQQ and MCP observations refer to the same correlated state.

### Persistence and Media Tests

- Test that memory mode restores the default scene after restart.
- Test that Database mode restores structured scene state and media metadata.
- Test that event buffers, idempotency records, confirmation tokens and debug records are not restored from Database.
- Test media upload validation, safe references, missing references and orphan cleanup.
- Test that scene export excludes media binary data and security configuration.
- Test that invalid scene imports leave the previous scene untouched.

### MCP Contract Tests

- Test endpoint-disabled behavior and independent listener lifecycle.
- Test real source-IP and CIDR filtering without trusting forwarded headers.
- Test exact Origin handling for absent, valid and invalid values.
- Test TLS requirements and the explicit insecure-remote warning state.
- Test Bearer authentication, disabled credentials, expired credentials and digest-only persistence.
- Test tool discovery for every scope combination.
- Test all 27 tool schemas and their stable success and failure result shapes.
- Test test-user ownership, TTL cleanup, requested numeric IDs and owned-group creation.
- Test idempotent replay and idempotency conflicts.
- Test scene-revision conflicts.
- Test destructive confirmation binding, expiry and single use.
- Test pagination, wait timeouts, event cursor progression and cursor expiry.
- Test per-credential rate and concurrency limits.
- Test that MCP metadata is absent from plugin-visible sessions and OneBot events.
- Test log redaction for tokens, media Base64 and sensitive configuration.
- Test that MCP listener failure leaves WebQQ and the sandbox service operational.

### WebUI Tests

- Use component tests for context-menu actions, dialogs, forms, state selectors and role-sensitive controls.
- Use browser tests for the full left-navigation entry, active-user switching, conversations, nested context menus, requests, environment management and debug views.
- Compare the implemented visual structure against the existing onebot-webqq interface at agreed desktop viewport sizes.
- Assert the root application begins after the Koishi activity bar, fills the available content area and does not create horizontal document overflow.
- Run critical browser flows in both Chrome and Firefox.
- Verify keyboard navigation, focus restoration, accessible names and disabled-action explanations.
- Verify ChatLuna thinking and Token displays remain attached to the correct conversation during rapid navigation.

### Prior Art

- Koishi's original sandbox is the behavioral reference for basic plugin loading, message dispatch and reply observation.
- The existing onebot-webqq project is the visual and interaction reference for the WebQQ workspace.
- The current repository contains architectural decisions and domain vocabulary but no implementation or existing test suite; the first implementation must establish the testing structure rather than imitate nonexistent local tests.
- Tests should use public behavior and profile fixtures rather than snapshotting private implementation details.

### Required Validation

- Every implementation change must run the repository's focused tests, type checking and build commands.
- WebUI changes additionally require a production frontend build and real-browser verification of the specific sandbox route.
- Browser verification must check console errors, Chrome behavior, Firefox behavior, activity-bar overlap and horizontal overflow.
- Profile-baseline changes must update capability fixtures, compatibility tests and user-visible baseline documentation together.

## Out of Scope

- Acting as a real externally accessible OneBot server for third-party OneBot clients
- Allowing operators or MCP clients to impersonate virtual OneBot robots
- Reusing onebot-webqq's Vue components or capsule integration directly
- Historical NapCat or LLBot version selection in the first release
- Automatically tracking the latest upstream NapCat or LLBot release without an explicit baseline update
- Arbitrary user-defined OneBot actions or scriptable mock handlers
- Cookies, login credentials, device information, cache manipulation, OCR and AI voice capabilities in the first release
- Complete ChatLuna feature integration beyond thinking state and Token usage
- Server-side test assertions, test-suite orchestration or pass/fail reports
- A public REST API, CLI control plane or MCP Prompts in the first release
- Raw arbitrary OneBot action tools exposed through MCP
- OAuth or Koishi-login authentication for MCP
- Entity-level MCP ACLs for individual users, robots or groups
- Trusting reverse-proxy headers for MCP source authorization
- Fetching arbitrary external media URLs on behalf of MCP callers
- Persisting event streams, wait subscriptions, idempotency caches or confirmation tokens
- Exporting media binaries, credentials, MCP configuration or debug records in scene packages
- Automatically accepting friend requests, group applications or invitations addressed to a virtual robot
- Silently transferring ownership of an existing group to a provisioned test user

## Further Notes

- The canonical product term is “模拟 QQ 环境”, not “模拟 QQ 世界”.
- The canonical automation actor is “外部测试控制器”. It is not an external Bot, AI user or OneBot client.
- The canonical managed automation identity is “测试用户”. It remains an ordinary QQ user inside the scene.
- The visual one-to-one requirement applies to the main WebQQ appearance and interaction language. Deliberate differences, including the left-navigation full-page entry and sandbox-specific management surfaces, should be reviewed separately before implementation.
- The implementation should remain minimal and avoid speculative extension points beyond the confirmed NapCat, LLBot, WebQQ, ChatLuna and MCP requirements.
- The architectural decisions already recorded for this feature remain normative background for implementation trade-offs.
