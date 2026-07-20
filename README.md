# koishi-plugin-onebot-sandbox

在 Koishi 控制台中提供可验证 OneBot 插件行为的模拟 QQ 环境。

当前版本实现最小沙盒闭环：使用预置普通用户向虚拟 OneBot 机器人发送文本，并在同一会话中观察被测插件回复。

## 开发

```bash
yarn install
yarn test
yarn typecheck
yarn build
```
