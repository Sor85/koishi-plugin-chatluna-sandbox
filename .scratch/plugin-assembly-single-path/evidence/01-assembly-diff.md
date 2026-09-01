# 01 证据：两份装配的逐行差异清单

对象是 `92f4162`（本轮开工前的 HEAD）的 `src/index.ts`：主路径装配在 `try` 里（第 307–350 行），降级路径装配在 `catch` 里（第 351–367 行）。

## 采集方式

把两段各自去掉一层缩进后逐行比对，命令可重放：

```sh
git show 92f4162:src/index.ts > /tmp/head-index.ts
sed -n '308,350p' /tmp/head-index.ts | sed 's/^      //' > /tmp/a.txt   # try 内，两次构造之后
sed -n '353,366p' /tmp/head-index.ts | sed 's/^      //' > /tmp/b.txt   # catch 内，那条 error 日志之后
diff -u /tmp/a.txt /tmp/b.txt
```

## 原始差异

```diff
-const mcp = new SandboxMcpService(inner, control, { ... })                 # 两次构造，只在主路径
-const testEndpointServer = new SandboxTestEndpointServer(inner, mcp, { ... })
-// chatluna-usage 位于另一个 loader group，Cordis 会为服务建立隔离映射；复用 usage 插件的 Context 才能解析到同一实例。
 const getChatLunaUsage = () => findChatLunaUsage(inner)
-registerConsole(inner.console, control, config, mcp, testSpaces, unattributedModelRequests, getChatLunaUsage, presetService)
+registerConsole(inner.console, control, config, undefined, testSpaces, unattributedModelRequests, getChatLunaUsage, presetService)
 inner.on('ready', async () => {
   await control.waitForSceneReady()
   const seeded = await seedDevelopmentModelRequestErrors(control.getModelRequestStore())
   if (seeded) inner.logger('chatluna-sandbox').info(`已生成 ${seeded} 条开发环境 ChatLuna 错误预览记录。`)
-  await testEndpointServer.start().catch((error) => inner.logger('chatluna-sandbox').error('测试控制端点监听器启动失败；WebQQ 仍可继续使用。', error))
 })
 inner.on('dispose', () => {
   disposeModelRequestCollector()
   presetSnapshots.dispose()
-  // Koishi 的 dispose 不可等待（cordis scope.reset 不 await disposer），
-  // 这里只保证收尾写入的失败进日志，而不是被静默丢弃。
   void unattributedModelRequests.waitForPersistence().catch((error) => {
     inner.logger('chatluna-sandbox').error('未归属模型请求关机收尾持久化失败。', error)
   })
-  testEndpointServer.stop()
 })
```

（两次构造按定义只属于主路径，不属于「被抄了两遍的装配」，上面列出只为交代切片边界。重复区间从 `const getChatLunaUsage` 起算，共 15 行。）

## 差异集合

重复区间内的全部差异恰好是 6 项，实质 3 项 + 注释 3 行：

| # | 位置 | 差异 | 性质 |
| --- | --- | --- | --- |
| 1 | `registerConsole` 第 4 实参 | `mcp` / `undefined` | 实质 |
| 2 | `ready` 钩子末行 | 一次 `testEndpointServer.start()`（带失败日志） | 实质 |
| 3 | `dispose` 钩子末行 | 一次 `testEndpointServer.stop()` | 实质 |
| 4 | `dispose` 钩子内 | 「Koishi 的 dispose 不可等待」2 行注释只在主路径 | 注释 |
| 5 | `getChatLunaUsage` 上方 | 「chatluna-usage 位于另一个 loader group」1 行注释只在主路径 | 注释 |

票上写的是「三项实质 + 两行注释」。实测多出第 5 项：`getChatLunaUsage` 上方那行 loader group 注释同样只存在于主路径。它和第 4 项性质相同——两份拷贝之间已经长出的差异，且都是注释先掉队。**已长出差异的注释共 3 行，不是 2 行。**

## 收拢后

单路装配之后重复区间只剩一份（`src/index.ts:345`–`364`），上表 5 项差异全部消失：

- 第 1 项变成 `endpoint?.mcp`——「有没有 MCP 服务」由数据表达。
- 第 2、3 项变成 `endpoint?.server.start()` / `endpoint?.server.stop()`，各一次可选调用。
- 第 4、5 项的 3 行注释各只剩一份，必然覆盖两条路。

`try` 之前那一段装配（记录域目录、预设服务、模型请求采集器、用量关联）一行未改，`git diff -U0 src/index.ts` 的全部 hunk 都落在旧文件第 306 行之后。
