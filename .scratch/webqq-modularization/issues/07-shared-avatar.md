# 07 — 统一 WebQQ 头像渲染

**What to build:** 使用一个共享头像模块渲染所有普通用户、虚拟 OneBot 机器人和群组，使不同区域继续保持完全一致的身份颜色、fallback 和徽标比例。

**Blocked by:** 06 — 提取工作区布局与跨区域覆盖层

**Status:** ready-for-human

- [x] 共享头像模块支持普通用户、虚拟 OneBot 机器人和群组三种身份
- [x] 图片、首字母 fallback、圆形裁切和加载失败行为与基准一致
- [x] 虚拟 OneBot 机器人颜色和机器人头部徽标在所有区域按同一比例渲染
- [x] 群头像颜色继续区别于普通用户和虚拟 OneBot 机器人
- [x] 最近、好友、群组、聊天顶栏、消息、发送控件、群成员和私聊信息全部迁移到共享头像模块
- [x] ContextMenu 和 Tooltip 仍由外层区域控制，不进入头像模块
- [x] 不增加改变现有网格或定位的额外 DOM 包裹层
- [x] Ego Browser 对照所有头像尺寸和状态，Chrome 与当前基准一致

## Answer

新增 `WebqqAvatar` 作为普通用户、虚拟 OneBot 机器人和群组的唯一身份头像渲染入口。组件根节点就是原头像元素，不接管 ContextMenu、Tooltip 或布局包裹；图片加载失败时回退到名称首字母，机器人徽标继续使用与头像尺寸成比例的 CSS 变量。

最近、好友、群组、聊天顶栏、消息、发送控件、群成员、私聊信息、通知和环境目录均已迁移。Ego Browser 验证普通用户、机器人和群组颜色分别保持主题色、灰蓝色和墨绿色，38px、36px、32px、30px 与 76px 头像的徽标比例一致。验证记录位于 `.scratch/webqq-modularization/evidence/07-shared-avatar/verification.json`，PNG 仅保存在本地。
