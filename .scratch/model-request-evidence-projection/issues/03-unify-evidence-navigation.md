# 03 — 统一跨视图证据身份与导航

**What to build:** 让请求组成分段、模型请求轨迹行和模型请求对话视图的分析目标共同使用模型证据投影提供的 evidenceId，使用户从任一轨迹或组成入口都能稳定定位同一条原始模型证据，并在刷新、检查关联请求和返回轨迹后保持正确状态。

**Blocked by:** 01 — 统一请求消息与工具定义证据；02 — 统一模型响应证据

**Status:** done

- [x] 请求组成分段、模型请求轨迹行、分析导航项和分析卡片目标均携带或映射同一 evidenceId
- [x] System、user、assistant、工具定义、工具调用、工具结果和模型响应均可通过 evidenceId 跨视图定位
- [x] 轨迹与分析导航不再使用角色内 indexInKind、目标排序或重复协议判断作为跨视图契约
- [x] 同一原始父节点内存在多个语义项时，每项仍具有不冲突的确定性身份
- [x] 由多个 SSE 来源合并的响应事件能够定位到格式化响应事实，并继续提供全部原始来源
- [x] 请求模式与会话模式的组成分段点击均定位到正确分析目标
- [x] 轨迹检查器选择同会话其他模型请求时，详情加载后仍定位到所选证据
- [x] 打开原始请求并返回轨迹后，选中行、详情页签、分析目标和滚动位置按现有行为恢复
- [x] pending 请求自动刷新后，仍存在的证据身份保持稳定；已变化或消失的证据不会错误定位到其他内容
- [x] 搜索、折叠、自动展开和短暂高亮继续作用于 evidenceId 对应的内容
- [x] 原始模型证据路径与 evidenceId 保持不同职责：路径用于核对来源，evidenceId 用于视图关联
- [x] 删除旧 indexInKind、角色内重算、targetOrder 及其他重复定位契约和兼容 fallback
- [x] 协议行为测试不再依赖读取 Vue 或 TypeScript 源码字符串；有价值的视觉与 CSS 契约测试继续保留
- [x] 增加跨视图契约测试，证明相同 evidenceId 在轨迹、组成图和分析视图中表示同一事实
- [x] 工作台集成测试覆盖搜索、定位、检查器、关联请求、返回状态、自动刷新和滚动恢复
- [x] 验证下游轨迹、模型请求对话视图和分析导航不再直接解释原始协议字段
- [x] 模型请求工作台不发生视觉重设计，现有原始证据查看、会话轨迹和分析交互继续可用
- [ ] Chrome 与 Firefox 均验证请求、响应、工具事件、搜索、定位和 pending 自动刷新
- [x] 完整测试、类型检查和生产构建全部通过，依赖警告单独记录

## Comments

- 实现完成：共享模型证据投影位于 `src/model-evidence/`，唯一入口 `projectModelEvidence`。
  模型请求轨迹（`src/model-request-trajectory.ts`）、模型请求对话视图
  （`client/webqq/model-request-conversation.ts`）与分析导航
  （`client/webqq/model-request-analysis.ts`）全部改为消费该投影，旧协议解析已删除。
- 浏览器验证仍未完成：本仓库内没有可运行的 Koishi 控制台开发环境（无 `koishi.yml`，
  也没有启动脚本），无法在 Chrome 与 Firefox 中打开模型请求工作台。需要在宿主 Koishi
  实例中加载本插件后再补做这项验证。
- 已知的跨视图差异（有意保留）：只含工具调用、没有可见正文的 assistant 角色请求消息在分析页仍有卡片，
  但在轨迹账本里不单独占行——它的 TOOL CALL 行才是该证据的入口，否则同一次调用会在
  ASSISTANT 与 TOOL CALL 两行重复出现。`tests/model-evidence-cross-view.test.ts` 断言了这条契约。
- 代码评审（Standards + Spec 双轴）已执行。Standards 轴的发现全部修正：删除 adapter 里残留的
  `body.model` 读取、把轨迹与分析卡片的字符数统一到 `src/model-evidence/metrics.ts`、fixture 去掉局域网 IP、
  移除对私有函数名的脆弱断言。Spec 轴确认的三项已修正（见 01 的 Comments）；其余两项判为非缺陷：
  工作台原始视图用 `typeof raw === 'string'` 而非 `responseBodyFormat` 判别 JSON 树，
  分析导航项的 `id` 是列表键而非证据身份（响应分组头部不带 `evidenceId`，不进入 `targets`）。
