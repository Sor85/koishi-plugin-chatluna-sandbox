# 声明工具返回形状，等待结果用判别式

工具注册表条目上新增可选 `outputSchema`，先覆盖四个 `wait_for_*`、两个发送工具、四个破坏性工具与 `get_server_info`；同时把等待类结果里的 `matched: boolean` 换成 `outcome: 'matched' | 'timeout'`。

对外声明这一轮之前只有参数侧收拾干净了（取值集合、取值组合与必填关系都写进 `inputSchema`，集合之外的输入一律显式失败）。返回形状没有任何机器可读的声明，消费者对返回值的了解全靠「调一次看看」。

等待类最需要声明，因为它们的成功载荷键各不相同：`wait_for_event` 给 `event`，`wait_for_message` 给 `event`、传了 `settleSeconds` 时另给 `events`，`wait_for_onebot_action` 给 `record`，`wait_for_chatluna_state` 给 `state`。这四种形状此前只能靠读源码或试调一次学到，而它们是编排里调用最频繁的一族。

`matched: boolean` 加可选载荷让「匹配到了但没有事件」在类型上合法，因此执行体要靠 `!matched || !event` 防守一个不该存在的状态（静默期收集、等待 OneBot 调用、等待 ChatLuna 状态各一处）。换成 `outcome` 判别式之后 `matched` 分支必带该工具自己的载荷键、`timeout` 分支必带 `reason`，防守退成一次判别。`matched` 从返回值消失而不是与 `outcome` 并存：同时给两个字段等于让消费者面对两个真值来源，而它们一旦不一致就是纯粹的 bug 来源。ADR-0102 里那句「错过的表现是 `matched: false`」按本决定读作 `outcome: 'timeout'`，那条决定本身不变。

判别式在声明里写成扁平 `properties` 加两个 `oneOf` 分支，与参数侧的取值组合（ADR-0099）同一个写法：只读 `properties` 的客户端看得见全部字段，读得懂 `oneOf` 的客户端多知道哪个分支带哪个字段；分支各自用 `const` 钉住 `outcome`，因此一次返回恰好匹配一个分支。`events` 在声明里但不在任何分支的必填项里——它只在传了 `settleSeconds` 时出现。

声明 `outputSchema` 有一条协议义务：按 MCP 规范，声明了它的工具必须返回符合它的 `structuredContent`。因此只给结果是对象的工具声明（这是 ADR-0104 必须先落地的原因），而 SDK 用的是低层 `Server` 而不是 `McpServer.registerTool`，不会自动校验——声明与实际返回是否一致靠测试钉住：测试侧独立书写「哪些工具声明了 outputSchema、每份声明的顶层字段是什么」，另有用例真的调用这些工具，把返回值的顶层字段与声明逐条比对（不多、不少、判别式分支互不携带对方的字段）。只断言声明存在等于只证明了实现等于自己。

覆盖范围先小后大，判据是「返回形状能不能从工具名与参数推断出来」：`get_scene_snapshot` 能，`wait_for_message` 不能。两个发送工具进来是因为 `cursorBefore` 与 `cursor` 最容易被搞混（ADR-0102）；四个破坏性工具共用一份 `{ revision, cursor }` 声明；`get_server_info` 是消费者的第一个调用。其余工具当前不声明，也不给一个空对象——空声明按协议同样要求兑现 `structuredContent`，而「没有声明」才是那些工具的真实状态。

两种协议表述都把声明带出去：`tools/list` 与 `GET /v1/tools` 读的是同一个 `service.listTools`，各有断言，避免下一次改动只顾 MCP 那一侧。

不引入运行时校验：协议不要求服务端自校，加了反而多一条失败路径。

这是一次破坏性返回变更，与 ADR-0103、ADR-0104 同批发生。
