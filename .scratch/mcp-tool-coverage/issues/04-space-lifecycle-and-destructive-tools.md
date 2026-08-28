# 04 — 空间生命周期与破坏性场景六个工具及其约束

**What to build:** 标记测试空间失败、重新激活测试空间、删除测试空间、恢复初始场景、清空场景、导入版本化场景六个工具被真正调用,而且它们的领域约束第一次被断言。

这六个工具的价值主要在约束里,不在「能调用」这件事上。只断言调用成功是最弱的覆盖形式,那正是本条工作在消灭的模式。要断言的约束:

标记失败只允许作用于运行中的空间。重新激活只允许作用于已完成或失败的空间;对运行中的空间调用它必须被明确拒绝。经测试控制端点重新激活后,控制权归还原 AI 控制者而不是变成用户接管——这条区别目前只写在实现注释里,而注释的措辞表明它来自一次真实缺陷的修复,修复没有留下测试。删除后的空间不再出现在空间列表里。三个破坏性场景操作在缺少确认令牌时被拒绝,携带有效令牌时执行成功。

破坏性操作的两步确认已有先例:现有测试取得过一次确认令牌,可循同一路径。三个空间生命周期工具共用同一个幂等包装,三个破坏性操作共用同一个破坏性执行包装,因此场景搭建可复用。

删除测试空间那条「除非用户明确要求,否则测试完成后应默认保留」的说明不纳入验证。它是写在工具描述里给外部测试控制器的指引,代码没有任何强制,调用即删除;断言描述文本包含该约定属于伪覆盖。

**Blocked by:** None — can start immediately

**Status:** ready-for-human

- [x] 标记测试空间失败的工具被真正调用,空间状态变为失败且机器人停止
- [x] 标记失败只允许作用于运行中的空间,对其他状态的调用被明确拒绝
- [x] 重新激活测试空间的工具被真正调用,空间恢复可修改
- [x] 重新激活只允许作用于已完成或失败的空间,对运行中空间的调用被明确拒绝
- [x] 经测试控制端点重新激活后控制权归还原 AI 控制者,而不是变成用户接管
- [x] 删除测试空间的工具被真正调用,删除后该空间不再出现在空间列表里
- [x] 恢复初始场景的工具被真正调用,主场景恢复为默认场景、测试空间恢复为创建时的空白场景
- [x] 清空场景的工具被真正调用,场景确实为空
- [x] 导入版本化场景的工具被真正调用,导入结果与导出的场景一致
- [x] 三个破坏性场景操作在缺少确认令牌时被拒绝
- [x] 三个破坏性场景操作携带有效确认令牌时执行成功
- [x] 「测试完成后默认保留」不纳入验证,它是文档性约定而非可执行约束
- [x] 全部调用经测试控制服务的工具调用入口
- [x] 过程中若发现生产缺陷,在本票内修复并逐条记录改了什么行为
- [x] 单元测试、类型检查与构建全绿
- [x] 仅当某个缺陷修复触及 WebQQ 可见的空间控制状态时,补一次浏览器验证:在 AI 测试空间总览上确认状态显示正确

## Comments

六个工具的用例都在 `tests/mcp-tool-coverage.test.ts`，全部经 `service.callTool`。

空间生命周期的约束断言：

- `fail_test_space`：状态变为 failed；「机器人停止」用运行时机器人注册表观察——空间运行时 `assertAvailable` 会因 ID 被活动场景占用而抛错，标记失败后不再抛错，说明空间内机器人确实被释放；随后对该空间的修改按 `space_unavailable` 拒绝。对已结束空间再次标记失败被拒（`domain_error`，消息为「空间当前不可修改：failed」）。
- `reactivate_test_space`：对运行中空间调用被拒（「只有已完成或失败的空间可以重新激活」）。已完成空间重新激活后状态是 `running` 而不是 `taken-over`，并且紧随其后的 `apply_environment_changes` 成功——`requireAiControl` 只接受 `running`，因此这条断言直接证明控制权归还了原 AI 控制者，而不是变成用户接管。这条规则此前只写在 `src/test-spaces.ts` 的实现注释里。
- `delete_test_space`：删除后 `list_test_spaces` 只剩另一个空间，且 `get_test_space` 对已删空间报错。

破坏性场景操作：`reset_scene` 分别验证主场景恢复为默认场景（四名参与者与默认群回归）和测试空间恢复为创建时的空白场景；`clear_scene` 验证场景各集合确实为空；`import_scene` 走「导出 → 清空 → 导入」回路，断言除服务端单调递增的 `revision` 外导入结果与导出场景逐字段一致，并断言不支持的 `testApiVersion` 被 `unsupported_scene_version` 拒绝。三个工具在缺少 `confirmationToken` 时按 `invalid_arguments` 拒绝、持有伪造令牌时按 `confirmation_required` 拒绝，且六次拒绝之后场景仍是创建时的空白场景，说明拒绝没有副作用。

「测试完成后默认保留」按规格不纳入验证。

### 发现并修复的缺陷（一条）

`import_scene` 的 `document` 参数描述写着「scene.revision 须与当前 revision 一致」，但实现里 `SandboxControlService.replaceScene` 从不校验传入的 `revision`，而是无条件把场景版本置为当前值 +1。这条约束对外部测试控制器是误导：按描述做「导出 → 清空 → 导入」会以为必须先把 revision 改回去，而实际上清空之后 revision 已经变了，照描述操作反而无从下手。

改动的行为：只改这句参数描述，改为说明 `scene.revision` 会被忽略、导入后版本由服务端在当前值上递增，版本绑定由 `prepare_destructive_action` 的 `expectedRevision` 负责。工具的可执行行为未改变，对外契约形状与错误码不变。

未选择反向修法（让 `import_scene` 真的校验 revision）：那会让此前能成功的导入开始失败，属于对外契约的行为变更，超出本条工作范围。

### 浏览器验证

未做。本票唯一的修复只触及一句参数描述，没有触及 WebQQ 可见的空间控制状态；重新激活的身份归属经断言确认实现本来就正确，无需修改，因此该条件判据不成立。

### 与 ADR-0021 / 0022 / 0023 的冲突（已单独修订）

补覆盖时发现：`reset_scene`、`clear_scene`、`import_scene` 都不接受 `idempotencyKey`，调用即执行。同样情况还有 `apply_environment_changes`、`prepare_destructive_action` 与 `delete_environment_entity`——六个 `manage` 工具全都没有幂等键。

与 ADR-0021「MCP 状态修改必须幂等」冲突：该决策写的是「所有 `interact` 和 `manage` MCP 工具必须携带 `idempotencyKey`」，实现里只有五个测试空间生命周期工具（`create`/`complete`/`fail`/`reactivate`/`delete_test_space`）以及消息与关系类 `interact` 工具真的走了 `withIdempotency`。`upload_media` 属 `interact` 也没有幂等键。

进一步核对后发现冲突不止一条：ADR-0023 自己也写着破坏性操作要「携带令牌、`expectedSceneRevision` 与 `idempotencyKey` 执行」，而 ADR-0022 写着所有 `manage` 工具必须提交 `expectedSceneRevision`——实现里破坏性工具执行时两者都不带，改由确认令牌统一承担；且实现的参数名是 `expectedRevision`，与三条 ADR 的写法不一致。

按 `docs/agents/domain.md` 的要求显式指出而不静默覆盖：本票的测试如实断言了现状（三个破坏性工具不带幂等键即可执行），没有把冲突固化成「已验证的正确行为」。

已按下述结论处理（用户确认）：ADR-0021、ADR-0022、ADR-0023 三条决策一并修订，并为唯一的真缺口补齐实现。

- 事件等待、`upload_media`（内容寻址天然幂等）与 `prepare_destructive_action`（只签发令牌）写入 ADR-0021 的豁免，附各自理由。
- 四个破坏性工具由 ADR-0023 的一次性、版本绑定令牌覆盖，不叠加幂等键；ADR-0023 有意让它们无法盲目重试，与 ADR-0021「重试返回首次结果」的语义本就冲突，实现选对了。同时从 ADR-0023 句中删去 `expectedSceneRevision 与 idempotencyKey`——令牌已把两者包进去；ADR-0022 补记破坏性操作在执行时不重复提交场景版本。
- 三条 ADR 里的 `expectedSceneRevision` 统一改为实现中的参数名 `expectedRevision`。
- `apply_environment_changes` 是唯一的真缺口：它此前接受 `idempotencyKey` 却默默忽略，而 ADR-0021 正教消费者传它。已改为必填并真正经 `withIdempotency`，同时更新工具调用示例资源。详见该票之外的提交说明。
