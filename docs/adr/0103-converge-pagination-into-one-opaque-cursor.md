# 分页收成一个不透明游标

四个 list 工具（`list_conversations`、`list_onebot_debug_records`、`list_model_request_records`、`list_test_call_records`）对外只保留 `limit` 与 `pageCursor` 两个分页参数，结果只给 `items` 与 `nextPageCursor`；没有更多页时 `nextPageCursor` 不出现。游标是服务端编码的不透明字符串（base64url 的 JSON，载荷是该族记录今天的续页字段加一个记录种类标记），消费者原样传回即可续页。

三族记录的排序键真的不一样，因此收敛的不是内部实现而是对外声明。OneBot 调试记录只有每个记录域各自独立的 `sequence`；模型请求记录在单记录域用 `sequence`、跨记录域用 `createdAt` + `id`；会话列表与测试调用记录整份在内存里，只有偏移。把这些差异写进对外声明就一定会出现「哪个参数有效取决于另一个参数的取值」，而那是收敛前最坏的一处：`list_model_request_records` 在 `scope: 'all'` 时把 `beforeSequence` 静默置空，此时只有 `beforeCreatedAt` + `beforeId` 有效，而三个游标在声明里并列、都不标条件。翻页翻不动不报错，只会一直拿到同一页——消费者据此得出的是错的结论，而不是一次可重试的失败。

游标里带记录种类标记，因此「把调试记录的游标传给模型请求工具」被认出来并报 `invalid_arguments`，而不是当成一个碰巧能解析的游标。同一族记录内部的两种载荷（模型请求的序号与时间）也互相不通：单记录域的游标传给 `scope: 'all'` 显式失败，反之亦然。伪造与截断的游标一律报参数错误，不当成「从头开始」——后者的失败形态与收敛前那个静默置空一模一样。

退役的四个参数名（`offset`、`beforeSequence`、`beforeCreatedAt`、`beforeId`）显式传了要拒绝，不无声忽略：照着旧契约写的调用是最可能发生的事，而被忽略的游标参数会让调用方以为自己在续页。这与 `list_onebot_debug_records` 拒绝 `includeLargeValues`、`clear_model_request_records` 拒绝 `scope` 是同一条口径。

游标里刻意不藏可长期使用的语义：纪元或表结构变化时它就该失效。游标过期时的恢复建议直接给出一个编码好的 `pageCursor`，而不是「请使用 `earliestCursor=123` 恢复分页」——后者让消费者自己把数值拼回参数名，而恢复本来可以直接给一个能用的值。`earliestCursor` 仍留在结果里，它是容量信息。

`capacity` 与 `hasMore` 都保留。`nextPageCursor` 的有无与 `hasMore` 多数时候表达同一件事，但同时给出不算冗余：联邦读取在第二排序键跨记录域不可比时给不出续页游标（见 ADR-0095 与词汇表「联邦读取」），此时 `hasMore: true` 而没有游标是一种真实状态，消费者必须能看出「还有更多但翻不过去」，而不是以为到底了。

记录页类型不改。`SandboxOneBotDebugRecordsPage`、`SandboxModelRequestRecordsPage` 与 `SandboxTestCallRecordsPage` 同时被 Console 契约与 WebQQ 三个记录页读取，客户端直接读 `hasMore`／`nextCursor`／`nextCreatedAt`。翻译写在测试控制端点自己这一侧，按 ADR-0095 的口径由翻译它的模块自述。测试调用记录的分页因此也切在工具执行体里而不是下推到记录库——它整份在内存里，切页不多读一次。

集合键统一成 `items` 而不是 `records`：`items` 与「裸数组结果包一层」那一批（ADR-0104）给数组用的键同名，端点上因此只剩一个集合键。

这是一次破坏性返回变更，与 ADR-0104、ADR-0105 同批发生，不留过渡期：三者都在改同一批工具的返回形状，分批发布等于让消费者连改三次。
