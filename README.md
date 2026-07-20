# koishi-plugin-onebot-sandbox

在 Koishi 控制台中提供可验证 OneBot 插件行为的模拟 QQ 环境。

当前版本提供 WebQQ 风格的全页工作台。用户可以在浏览器内切换当前用户和视图，向虚拟 OneBot 机器人发送文本，并在同一会话中观察被测插件回复；共享场景仍由服务端统一持有。

WebQQ 的毛玻璃、聊天样式、气泡尾部、颜色模式和强调色由 Koishi 插件全局配置统一控制。

## 开发

```bash
yarn install
yarn test
yarn typecheck
yarn build
```
