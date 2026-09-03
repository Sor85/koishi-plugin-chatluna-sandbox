# 投递前把 Koishi channel 受理人对齐到虚拟机器人

入站投递在派发群消息之前，先把该会话的 Koishi `channel.assignee` 写成收件虚拟机器人（`src/channel-assignee.ts`，经投递模块的第八个注入协作者调用）。它补的是 Koishi 核心里一道在任何中间件之前生效的门（`@koishijs/core` 的 `Processor.attach`）：群聊会话的 `channel.assignee` 不等于收到这条消息的机器人、且这条消息不是字面 `@` 时直接 `return`——不抛错、不记日志、被测插件一行都收不到，而沙盒这侧 `bot.dispatch()` 照样返回成功、[ADR-0048](./0048-standardize-onebot-action-records.md) 那条调试记录照样是 `success`。

这不是替用户改配置，是清沙盒自己的垃圾状态。`group:*` 这些 channelId 完全由沙盒生成，而 Koishi 的 `autoAssign` 只在 channel 行**不存在**时把接收者写成受理人，已经存在的过期受理人永远不会被纠正：上一次场景里的机器人号、被删掉重加的插件实例、跨部署复用的同一个数据库都会在表里留下一个再也对不上的值。它的故障形态是整条会话稳定地「只有 @ 能唤醒」，而昵称、引用、随机回复全部失效——因为那道门读的是 `stripped.atSelf`（正文开头指向本 bot 的 at 元素）而不是 `appel`，昵称唤醒绕不过去。三处无痕加上「新建的群和新建的会话实例都正常」（新 channelId 会被 `autoAssign` 认领），把排查引向唤醒判定和沙盒投递，实测要读 Koishi 源码或查 channel 表才能定位。

四处取舍写明。**只对齐 `assignee`，不动 `flag`**：那道门里的 `Channel.Flag.ignore` 会连 `@` 一起挡掉，是用户显式设下的语义，沙盒替他清就成了越权。**只对齐群聊**：那道门只在 `!session.isDirect` 时生效，私聊上写 channel 行是凭空造状态。**每个（机器人，频道）只写一次**：受理人对上之后不会自己漂走，而每条消息都打一次数据库会把投递成本抬到与消息量同阶；写失败不记账，下一条消息再试，插件重载时随实例丢弃缓存正好让重载后再对齐一次。**对齐失败只写日志不中断投递**：对不上的后果是这条消息被 Koishi 丢掉，与不做对齐时的现状一样，而因为一次数据库写失败就中断投递，会把「可能收不到」升级成「一定收不到」——与 ADR-0085 里 ChatLuna 角色上下文跟随那条同口径。

没有 `database` 服务时写入口返回 `false` 而不是报错：那种部署下 Koishi 那道门本身不生效（它整段包在 `if (this.ctx.database)` 里），没有可对齐的状态，把「没有数据库」当成失败会在内存模式下刷出无意义的日志。平台名由 `SANDBOX_CHANNEL_PLATFORM` 单点持有，与机器人适配器注册时用的必须是同一个值，否则对齐会写进另一张命名空间而症状完全不变。[ADR-0085](./0085-own-inbound-delivery-in-one-module.md) 列出的那三条静默规则因此变成五条，全部可以不开 Koishi 运行时驱动；[ADR-0076](./0076-support-multiple-conversation-instances-per-contact.md) 的写入偏离不受影响——受理人是按 channelId 对齐的，根会话与它的每个实例各有一条，与「回复仍然只落到根会话」不冲突。
