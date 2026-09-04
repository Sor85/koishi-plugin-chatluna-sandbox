<template>
  <section v-webqq-scrollbar class="http-capability-catalog">
    <div v-if="loading" class="http-capability-state">正在读取 HTTP 能力…</div>
    <div v-else-if="error" class="http-capability-state is-error">
      <p>{{ error }}</p>
      <Button size="sm" variant="outline" @click="$emit('retry')">重试</Button>
    </div>
    <template v-else-if="catalog">
      <p v-if="!catalog.enabled" class="http-capability-notice">
        HTTP 测试接口当前已关闭，下面的路由与状态码只作参考。在插件配置的「HTTP 测试端点」分组里打开总开关即可启用，MCP 表述不受影响。
      </p>

      <div class="http-capability-summary" aria-label="HTTP 能力摘要">
        <article><strong>{{ catalog.routes.length }}</strong><span>路由</span></article>
        <article><strong>{{ catalog.errorStatuses.length }}</strong><span>错误码映射</span></article>
        <article><strong>{{ bodyLimit }}</strong><span>请求体上限</span></article>
      </div>

      <div class="http-capability-protocol">
        <span>协议表述</span>
        <Badge :variant="catalog.enabled ? 'secondary' : 'outline'">{{ catalog.enabled ? '已启用' : '已关闭' }}</Badge>
        <Badge variant="outline">路径前缀 {{ catalog.basePath }}</Badge>
        <Badge variant="outline">版本段 {{ catalog.version }}</Badge>
      </div>

      <div class="http-capability-block">
        <span>基址与鉴权</span>
        <p>
          请求发往 <code>{{ catalog.baseUrl }}</code>，并在 <code>Authorization</code> 头里携带
          <code>Bearer &lt;测试凭证 Token&gt;</code>。凭证在「测试凭证」页创建，与 MCP 客户端用的是同一个。
        </p>
        <pre>{{ example }}</pre>
      </div>

      <div class="http-capability-block">
        <span>路由</span>
        <article v-for="route in catalog.routes" :key="route.kind" class="http-capability-route">
          <p class="http-capability-request"><Badge variant="secondary">{{ route.method }}</Badge><code>{{ route.target }}</code></p>
          <small>{{ route.summary }}</small>
        </article>
      </div>

      <div class="http-capability-block">
        <span>错误码到 HTTP 状态码</span>
        <p>失败响应的信封与 MCP 表述逐字一致，只是额外把错误码翻译成状态码。限流与并发超限还会带 <code>Retry-After</code>。</p>
        <div class="http-capability-search">
          <IconSearch aria-hidden="true" />
          <Input v-model="query" placeholder="搜索错误码或状态码" aria-label="搜索 HTTP 错误码映射" />
        </div>
        <article v-for="group in statusGroups" :key="group.status" class="http-capability-status">
          <Badge :variant="group.status >= 500 ? 'destructive' : 'outline'">{{ group.status }}</Badge>
          <span><code v-for="code in group.codes" :key="code">{{ code }}</code></span>
        </article>
        <p v-if="!statusGroups.length" class="http-capability-empty">没有匹配的错误码</p>
      </div>
    </template>
    <div v-else class="http-capability-state">HTTP 测试接口不可用</div>
  </section>
</template>

<script setup lang="ts">
import { IconSearch } from '@tabler/icons-vue'
import { computed, ref } from 'vue'
import { Badge } from '#client/components/ui/badge'
import { Button } from '#client/components/ui/button'
import { Input } from '#client/components/ui/input'
import { vWebqqScrollbar } from '#client/shared/scrollbar'
import type { SandboxHttpApiCapabilityCatalog } from '../../src/mcp/http-api'

defineEmits<{ retry: [] }>()
const props = defineProps<{
  catalog?: SandboxHttpApiCapabilityCatalog
  loading?: boolean
  error?: string
}>()

const query = ref('')

/** 上限只用 MiB 一档：这个值的量级由服务端固定，换算成 KiB 或 GiB 都读不出信息。 */
const bodyLimit = computed(() => {
  const mib = (props.catalog?.maxBodyBytes ?? 0) / (1024 * 1024)
  return `${Number.isInteger(mib) ? mib : mib.toFixed(1)} MiB`
})

/**
 * 可直接粘进终端的两条命令。
 *
 * 路径不在这里拼：`list-tools` 那条路由的请求目标已经是 `<前缀>/tools`，调用示例只在它后面
 * 接一个工具名。前缀由服务端的自述给出，因此改了端点路径或版本段，示例跟着变。
 */
const example = computed(() => {
  const catalog = props.catalog
  const tools = catalog?.routes.find((route) => route.kind === 'list-tools')
  if (!catalog || !tools) return ''
  const target = `${catalog.baseUrl}${tools.target}`
  return [
    'TOKEN=<测试凭证 Token>',
    '',
    '# 发现工具与参数契约',
    `curl -s -H "authorization: Bearer $TOKEN" "${target}"`,
    '',
    '# 调用工具：请求体就是参数，无参工具连 -d 都不需要',
    `curl -s -X POST -H "authorization: Bearer $TOKEN" "${target}/get_server_info"`,
  ].join('\n')
})

/**
 * 按状态码归并而不是按声明顺序平铺：HTTP 消费者手里先有状态码，要问的是「这个 429 可能是
 * 哪几种原因」。搜索同时匹配错误码与状态码，因此输入 `429` 与输入 `rate` 都能定位到同一组。
 */
const statusGroups = computed(() => {
  const keyword = query.value.trim().toLocaleLowerCase()
  const groups = new Map<number, string[]>()
  for (const { code, status } of props.catalog?.errorStatuses ?? []) {
    if (keyword && !code.includes(keyword) && !String(status).includes(keyword)) continue
    const codes = groups.get(status)
    if (codes) codes.push(code)
    else groups.set(status, [code])
  }
  return [...groups].sort(([left], [right]) => left - right).map(([status, codes]) => ({ status, codes }))
})
</script>

<style scoped>
.http-capability-catalog {
  display: grid;
  min-height: 0;
  align-content: start;
  gap: 16px;
  overflow: auto;
  padding: 20px 28px 28px;
}

.http-capability-notice {
  margin: 0;
  padding: 12px 16px;
  border: 1px solid var(--webqq-border);
  border-radius: 12px;
  background: var(--webqq-surface-muted);
  font-size: var(--webqq-font-sm);
}

.http-capability-summary {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
}

.http-capability-summary article {
  display: grid;
  gap: 4px;
  padding: 12px 16px;
  border: 1px solid var(--webqq-border);
  border-radius: 12px;
  background: var(--webqq-surface-muted);
}

.http-capability-summary strong { font-size: var(--webqq-font-2xl); }

.http-capability-summary span,
.http-capability-protocol > span,
.http-capability-block > span,
.http-capability-block > p,
.http-capability-route small,
.http-capability-empty,
.http-capability-state { color: var(--webqq-muted); font-size: var(--webqq-font-sm); }

.http-capability-protocol,
.http-capability-request,
.http-capability-status {
  display: flex;
  align-items: center;
  gap: 8px;
}

.http-capability-protocol { flex-wrap: wrap; }

.http-capability-block {
  display: grid;
  gap: 8px;
  padding: 16px;
  border: 1px solid var(--webqq-border);
  border-radius: 12px;
  background: var(--webqq-surface);
}

.http-capability-block > span { font-weight: 600; }
.http-capability-block > p { margin: 0; }

.http-capability-block code {
  padding: 1px 6px;
  border-radius: 6px;
  background: var(--webqq-surface-muted);
  font-family: var(--webqq-font-mono);
  font-size: var(--webqq-font-xs);
  overflow-wrap: anywhere;
}

.http-capability-block pre {
  max-height: 240px;
  margin: 0;
  overflow: auto;
  padding: 12px;
  border-radius: 8px;
  color: var(--webqq-text);
  background: var(--webqq-surface-muted);
  font-family: var(--webqq-font-mono);
  font-size: var(--webqq-font-xs);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.http-capability-route { display: grid; gap: 4px; }
.http-capability-route + .http-capability-route { padding-top: 8px; border-top: 1px solid var(--webqq-border); }
.http-capability-request { margin: 0; }
.http-capability-status > span { display: flex; min-width: 0; flex-wrap: wrap; gap: 6px; }

.http-capability-search { position: relative; }
.http-capability-search > svg { position: absolute; top: 50%; left: 12px; z-index: 1; width: 16px; height: 16px; color: var(--webqq-muted); transform: translateY(-50%); }
.http-capability-search [data-slot="input"] { padding-left: 36px; }

.http-capability-state,
.http-capability-empty { padding: 32px 16px; text-align: center; }
.http-capability-state p { margin: 0 0 12px; }
.http-capability-state.is-error { color: #dc2626; }

@media (max-width: 640px) {
  .http-capability-catalog { padding-right: 14px; padding-left: 14px; }
  .http-capability-summary { grid-template-columns: 1fr; }
  .http-capability-request { align-items: flex-start; flex-direction: column; }
  .http-capability-status { align-items: flex-start; flex-direction: column; }
}
</style>
