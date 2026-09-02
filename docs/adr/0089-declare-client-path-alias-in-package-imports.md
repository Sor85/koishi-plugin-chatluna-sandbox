# 客户端路径别名放在 package.json 的 imports 字段

客户端跨目录导入统一写 `#client/<相对 client 的路径>`，由 `package.json` 的 `imports` 字段声明 `"#client/*": "./client/*"`。同目录导入仍写 `./x`：它本来就不随目录深度变化，改成别名只会让相邻文件之间多绕一层。

**不能用 `vite.config.ts` 的 `resolve.alias`。** 控制台 devMode 用宿主自己的 vite 直接加载本插件的 `client/` 源码（同 [ADR-0053](./0053-precompile-tailwind-utilities-for-host-console.md)），宿主 vite 的 root 指向 `@koishijs/client/app`，本仓库的 `vite.config.ts` 根本不会被读取。写在那里的别名只在 `yarn build:client` 的产物构建里生效，devMode 下同一份源码会解析失败——这个仓库此前就配了一份 `@/` → `client/`，一处未用，因为一旦真用起来 devMode 就打不开页面。`imports` 字段是包自带的声明，解析发生在导入方所属包的 package.json 上，宿主 vite、产物构建、vitest 与 `vue-tsc` 四处都认，不需要任何一方配合。别名前缀因此必须以 `#` 开头，这是 Node 对 `imports` 键的硬性要求，`@/` 这种写法无法搬进该字段。

`tsconfig.json` 里保留一份等价的 `paths`。TypeScript 在 `moduleResolution: Bundler` 下能直接读 `imports` 字段，这份 `paths` 是给不读 package.json 的 TS 周边工具用的——`components.json` 的 shadcn-vue 别名指向 `#client/*`，CLI 添加组件时按 `paths` 反解目录。两处声明指向同一个目标，改动时必须同步。

代价是导入语句比相对路径长，且 `#` 前缀在生态里不如 `@/`常见。换来的是导入与文件深度解耦：客户端按能力分目录（[ADR-0090](./0090-group-source-files-by-capability.md)）时，移动文件不需要重算任何跨目录导入，`git mv` 之外的改动只剩真正换了归属的那几处。
