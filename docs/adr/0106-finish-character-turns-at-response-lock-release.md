# 在响应锁释放边界结束 Character 回合

`chatluna-character` 的 `after-chat` 只代表成功完成；请求报错、校验提前返回和其他异常路径都会跳过它，但最外层 `finally` 仍会调用公开的 `releaseResponseLock(session)`。因此 Sandbox 把这次调用视为 Character 回合的真实终态：观察器透明包装当前 `chatluna_character` 服务的方法，在原方法之前同步通知各记录域的 ChatLuna 状态和运行时预设快照完成收尾。原方法的 `this`、全部参数、返回值或 Promise 身份及同步异常保持不变，Sandbox 通知自身的异常被隔离，不能改变 Character 行为。

回合登记只发生在 `chatluna_character/message_collect`，不同时从 `before-chat` 再登记。Character 可能在 `before-chat` 之前退出，而 Sandbox 的等待态也正是从 `message_collect` 开始；这让没有预设阶段的回合仍有一对开始与结束。状态监听器和终态观察器都以前置监听安装，使它们即使晚于 Character 消费者注册，也会在消费者于首次 `await` 前立即释放响应锁时先完成登记与状态开始。终态通知必须早于原 `releaseResponseLock`，因为原实现会在返回前唤醒同 Session 的下一位等待者，新轮不能在旧轮收尾之前开始。

Cordis 会按监听器 Context 给同一个 Koishi Session 建立不同的透明 Proxy，跨事件直接以 Proxy 对象作为 `WeakMap` 键无法关联。Sandbox 在底层 Session 上保存一个不可枚举 Symbol 身份对象；各层透明 Proxy 都解析到同一个身份，而对象展开产生的克隆不会继承它。无法携带隐藏身份的非标准冻结 Session 保守退回对象本身：同一个对象仍可关联，不跨不同 Proxy 猜测。状态和预设快照都按这个身份记录精确代次；过期、克隆或无关 Session 不得按相同机器人和会话兜底清掉后继轮。

Sandbox 保留自己的多记录域模型。终态通知使用记录域目录的 `listScenes()` 遍历主模拟 QQ 环境与全部 AI 测试空间，并只调用各控制服务的窄收尾入口；未归属记录库没有场景状态，不参与。每个状态库只会消费自己在 `message_collect` 见过的 Session，因此遍历不会改变 ADR-0083 的记录域所有权，也不会放宽模型请求的保守归属规则。

状态开始与收尾都按 Session 代次关联。同一 Session 已由 Core `before-chat` 建立状态时，随后到达的 Character `message_collect` 是同轮补充，必须保留 Core 内部会话映射、已累计用量和模型请求引用；只有原 Session 身份相同才合并，不同 Character Session 接管同一机器人和会话时仍重建瞬时状态，不能继承前轮证据。成功路径先收到 `after-chat`，随后 `releaseResponseLock` 的第二次收尾成为 no-op，不能重复归档或抹掉已经保存的思考、Token 用量和模型请求引用。异常 release 没有权威响应载荷：本轮没有明确捕获的机器人回复标识时，不使用“同机器人、同会话的最后一条消息”兼容回退，以免把失败证据写到上一轮回复；异常前已有部分回复时，只向本轮明确捕获的回复标识归档。成功 `after-chat` 仍保留原有兼容回退。

运行时预设快照也按原 Session 身份收尾。一个 Session 身份只对应唯一 Character 快照时才能删除；同一身份出现多个并发 `before-chat` 而无法证明 release 对应哪一轮时继续保留，不猜测。模型请求附加快照时仍遵循原规则：同类活动快照恰好一个、记录域归属恰好唯一才提供证据。

Studio 与 Sandbox 可以同时安装并包装同一个公开方法。Sandbox 按 Character 服务实例稳定复用自己的运行时包装状态，不因当前方法又被 Studio 包在外层就重复包装；否则两边每轮都会互相再包一层。多个 Sandbox 观察者共享同一层包装并各自消费登记，任意卸载只移除自己的绑定。最后一个绑定卸载时，只有 Sandbox 包装仍位于最外层才恢复捕获的原方法；若另一插件位于外层则不覆盖它，已失活的 Sandbox 层留在调用链中但不再通知。

本决定不修改上游 `chatluna-character`，不伪造 `after-chat`，不增加超时清理，也不因单次模型请求失败直接清除回合。模型请求 HTTP 记录、预设运行时证据和多记录域归属继续分别遵循 ADR-0054、ADR-0055、ADR-0064 与 ADR-0083。
