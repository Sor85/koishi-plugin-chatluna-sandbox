# CSS 命名空间收敛到一套，`webqq-` 只减不增

新增顶层块一律写 `chatluna-sandbox-`。给既有块补子元素时跟随该块已有的前缀（`webqq-composer` 下写 `webqq-composer-quote`）。`sandbox-` 只属于 `client/components/ui/` 里 shadcn-vue 封装写死的类名，不是可供业务代码选择的第三套。

**边界不是概念上的，是历史地层。** 仓库里同时存在三套前缀：`webqq-`（39 个顶层块，2026-07-20「复刻 WebQQ 主工作台」时引入）、`chatluna-sandbox-`（21 个，2026-08-15 项目改名时从 `onebot-sandbox-` 改过来）、`sandbox-`（14 个封装类名，2026-07-25 统一二级菜单间距时引入）。前两套之间没有任何可陈述的判据：`composer`、`group`、`profile`、`secondary`、`workspace` 这五个第一段在两套里都有，而 `.chatluna-sandbox-message-row`、`.chatluna-sandbox-emoji-picker` 这些深在模拟 QQ 界面内部的东西用了后一套，`.webqq-model-request-*` 这些与 QQ 界面无关的东西用了前一套。因此这条决策不是「把既有边界写下来」——那条边界不存在，事后也补不出来；它是宣布一个终态并让新代码只走一个方向。

**终态是 `chatluna-sandbox-`。** 它与包名一致；更重要的是页面根 `.chatluna-sandbox-page` 与全部 teleport／Portal 浮层根已经是这一套（`scripts/sandbox-style-roots.mjs`），排版基准字号令牌（[ADR-0067](./0067-replace-hardcoded-font-sizes-with-one-scale.md)）与 Tailwind preflight 的作用域（[ADR-0068](./0068-scope-tailwind-preflight-in-the-build-output.md)）都挂在这些选择器上。选另一套会要求把那两处一起搬走，而它们的失效形态都是静默退回浏览器默认值。

**守卫冻结 `webqq-` 的顶层块集合，清单只允许删行。** 冻结粒度是类名第一段而不是完整类名：给既有块补子元素是维护既有区域，不该被拦；新开一个块（`.webqq-brandnew`）会立刻红灯。这与架构守卫那条「未治理文件数只减不增」（[ADR-0073](./0073-assert-interfaces-and-guard-by-rule.md)）是同一个棘轮形状——把某个块改名成 `chatluna-sandbox-` 后从清单删掉对应行，删行是唯一应当被接受的改动方向。另有一条断言钉住 `sandbox-` 声明必须能在封装源码里找到，只登记 AI 控制图标那一族历史例外。

**不现在一次改完。** 全量重命名要动 447 个 `webqq-` 类名、582 处模板用法，以及二十多个按类名断言的测试文件；而 [ADR-0040](./0040-modularize-webqq-by-layout-and-behavior.md) 明确要求「保留现有选择器和 cascade」，一次性重命名会把级联风险和搬迁风险叠在同一个提交里，出问题的形态是某处颜色或间距静默不对。棘轮式收敛让每次区域改动顺手带走一个块。

代价是过渡期两套并存会持续更久，读代码的人仍然要面对两种前缀，而且「哪套是新的」这件事只能从本决策和守卫清单里读到，看代码本身读不出来。换来的是「新增样式该写哪个前缀」这个每次加组件都要回答一遍的问题今天就有了唯一答案——这是三个问题里唯一会随时间继续变坏的那个。
