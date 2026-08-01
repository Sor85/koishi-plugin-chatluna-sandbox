import tailwindcss from '@tailwindcss/vite'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [vue(), tailwindcss()],
  // lib 模式下 Vite 会保留 process.env.NODE_ENV 交给下游打包器替换，
  // 但本产物直接由控制台浏览器加载（无下游构建），reka-ui 等依赖中的
  // process 引用会抛 ReferenceError（表现为 Dialog 弹窗渲染失败），必须显式替换。
  define: {
    'process.env.NODE_ENV': JSON.stringify('production'),
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    lib: {
      entry: 'client/index.ts',
      formats: ['es'],
      fileName: () => 'index.js',
    },
    rollupOptions: {
      external: ['vue', '@koishijs/client'],
      output: {
        assetFileNames: 'style.css',
      },
    },
    cssCodeSplit: false,
  },
})
