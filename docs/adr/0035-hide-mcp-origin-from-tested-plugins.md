# 被测插件不能区分 MCP 与 WebQQ 用户操作

MCP 和 WebQQ 必须复用同一用户交互执行链并生成相同的 Koishi Session、OneBot 原始事件和消息元素。`testRunId`、测试凭证及调用来源只用于沙盒内部关联和观测，不得进入被测插件可见的数据，避免插件针对测试入口改变行为。
