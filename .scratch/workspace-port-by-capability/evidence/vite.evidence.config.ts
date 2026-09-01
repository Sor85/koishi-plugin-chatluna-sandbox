import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

/**
 * 证据脚本专用配置。默认配置会把 reka-ui 预打包成一份自带 vue 副本的 chunk，SSR 时
 * 与 Node 侧的 vue 运行时分裂成两个实例，`renderSlot` 读不到当前渲染实例。
 * 关掉预打包并去重 vue 之后，整棵树只有一份运行时。
 */
export default defineConfig({
  plugins: [vue()],
  resolve: { dedupe: ['vue'] },
  optimizeDeps: { noDiscovery: true, include: [] },
  ssr: { noExternal: true },
})
