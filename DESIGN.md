# WebUI 设计规范

本文档记录 chatluna-sandbox WebUI 的稳定视觉约定。新增或调整界面时，应优先复用本文术语、主题令牌和已有语义类，避免为单个页面定义近似但不一致的样式。

## 二级面

“二级面”指从主工作区之上打开、用于完成局部查看或操作的页面与浮层，例如添加用户、日期选择、查看资料、通知、下拉选择、贴表情和转发页面。

二级面分为两类：**实体二级面**和**雾化二级面**。

### 实体二级面（Solid Secondary Surface）

实体二级面使用不透明或接近不透明的纯色背景，不通过 `backdrop-filter` 模糊其后方内容。典型场景包括：

- 关闭毛玻璃外观时的全部二级面：表单对话框、下拉选择器、右键菜单、查看资料、贴表情和通知面板。

实现约定：

- 容器使用 `.chatluna-sandbox-solid-secondary-surface`；
- 不得启用背景模糊，使用 `backdrop-filter: none`；
- 使用 `--webqq-secondary-outline` 作为轻描边；
- 使用 `--webqq-secondary-shadow` 作为统一阴影；
- 不得为单个实体二级面另写近似阴影或描边参数。

深色模式下的标准参数为：

```css
--webqq-secondary-outline: color-mix(in srgb, var(--webqq-border) 72%, transparent);
--webqq-secondary-shadow: 0 18px 42px rgb(9 9 11 / 42%);
```

轻描边用于分隔相邻的中性灰层级，阴影用于表达浮层高度；两者必须同时使用，不能用高对比实线边框替代。

### 雾化二级面（Frosted Secondary Surface）

雾化二级面使用半透明背景，并通过 `backdrop-filter` 模糊其后方内容。启用毛玻璃外观（`enableSandboxFrostedGlass`）时，全部二级面（表单对话框、下拉选择器、右键菜单、查看资料、贴表情和通知面板）都应切换为雾化态。

实现约定：

- 毛玻璃开关由 `useFrostedSurfaceFlag` 统一写入 `body[data-sandbox-frosted]`；teleport 到 body 的面板一律用该属性驱动双态，不为单个浮层组件传递 frosted prop。工作区内元素可使用 `.webqq-workspace.is-frosted` 后代选择器；通知面板沿用组件内 `is-frosted`/`is-plain` 状态类。
- 保留半透明背景（面板色 92%）、饱和度和模糊效果；轻描边使用 `--webqq-secondary-outline` 的 64% 淡化值，阴影沿用统一阴影。
- 同一容器不得同时表达实体和雾化两种视觉语义；实体覆盖必须同时覆写背景色，只关闭 `backdrop-filter` 会穿帮成"半透明但不模糊"的中间态。
- 工作区本体与一级区域禁止声明 `backdrop-filter`，模糊只出现在浮层与控件层，否则浮层毛玻璃会被 Backdrop Root 边界静默杀死（见 ADR 0060）。

## 二级面滚动

所有实体二级面和雾化二级面都遵循相同的滚动规则：

- 内容超出容器时必须仍可通过鼠标滚轮、触控板、触摸和键盘滚动；
- 不显示浏览器原生滚动条；
- 不显示 `v-webqq-scrollbar` 创建的自定义滚动轨道和滑块；
- 使用滚动条指令时传入 `{ showOverlay: false }`，只复用其原生滚动条隐藏能力；
- 未使用滚动条指令的容器必须同时提供 Firefox 的 `scrollbar-width: none` 和 Chrome 的 `::-webkit-scrollbar` 隐藏规则；
- 不得通过 `overflow: hidden` 达成隐藏效果，以免截断内容或破坏键盘访问。

主工作区中的消息列表、会话列表、详情栏等一级区域不属于本规则范围，仍可显示项目自定义滚动条。

## 新增二级面的检查清单

1. 判断页面是实体二级面还是雾化二级面。
2. 复用对应语义类和主题令牌，不写页面专属的近似描边或阴影。
3. 验证深色模式下背景、轻描边和阴影层级清晰。
4. 验证内容溢出时可以滚动，但 Chrome 和 Firefox 均不显示滚动条。
5. 确认 Portal/Teleport 页面可以取得完整主题令牌，不依赖工作区 DOM 继承。
