# 证据：发送控件的 DOM 快照与光标快照

`caret-snapshot.mjs` 与 `compare.mjs` 是本 feature 的确定性回归脚本，逐票各跑一次。
运行环境是仓库外的完整 Koishi 开发环境（`http://127.0.0.1:5140/chatluna-sandbox`），
脚本依赖 Playwright，放在仓库外的临时目录里跑（`node caret.mjs <输出>`；`BROWSER=firefox` 切引擎）。

## 为什么要读光标

DOM 快照证明可见部分不变，但**光标位置在 DOM 快照里看不见**，而本 feature 一半的行为就是
光标落在哪。因此每个采样点同时读 `Selection` 的 anchorNode 与 anchorOffset：落在编辑器的第几个
子节点、节点类型、节点文本与偏移。

## 确定性

固定入口、按名字选会话（不按序号，避免会话排序变化）、固定操作序列、固定等待；全程不发送消息，
结束时切回私聊把草稿清空，因此可以反复运行、反复比对。

## 采样点（15 个）

群会话空态 → 点入输入框 → 输入两个字符 → 输入 `@` 打开候选 → 方向键移动候选 →
Enter 选中候选 → 退格一次 → 退格两次 → 左移一次 → 左移两次 → 右移一次 →
组字中「中文」 → 上屏后「中文」 → Escape → 切换会话后清空。

输入法那两个采样点派发 `compositionstart` ＋ `insertCompositionText` ＋ `compositionend`，
而不是用普通输入接口——普通接口走不到组字路径。

## 基线取法

`git stash push -u` 把工作区回到基线提交，等开发环境的 Vite 重新提供旧源码（用
`curl` 确认服务端返回的模块里已经没有新符号），跑同一个脚本，然后 `git stash pop`。

## 逐票结果

| 票 | Chromium | Firefox |
| --- | --- | --- |
| 01 草稿宿主 | 15 个采样点逐字一致，控制台无错误 | 15 个采样点逐字一致，控制台无错误 |

各票的原始读数保存在 `NN-*.json`（含基线与当前两份，已去掉整段 root HTML，只留长度用于比对）。

## 顺带测出的浏览器口径差异（不是回归）

同一次操作在两个引擎里 `Selection` 的表示形式不同，视觉位置相同：

- 「退格两次」删掉整块提及后，Chromium 把 anchor 留在文本节点上（`#text`, offset 3），
  Firefox 留在编辑器元素上（`DIV`, offset 1）。
- 提及芯片的原子删除两个引擎一致：一次退格删掉整块，从不留下半截 `@张` 文本。
  这条规则由 `contentEditable = 'false'` 提供，两个引擎都实测过。
