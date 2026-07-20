# 使用 Vue 重写 WebQQ 界面

本插件以 `koishi-plugin-onebot-webqq` 的当前界面作为视觉基线，但不直接复用其现有页面组件。WebQQ 工作台使用 Vue 和 Tailwind CSS 重写主题与页面结构，右键菜单等通用交互优先采用 shadcn-vue，以便贴合 Koishi 控制台原生 Vue 技术栈，同时独立扩展沙盒操作并避免与胶囊和真实 OneBot 运行时耦合。
