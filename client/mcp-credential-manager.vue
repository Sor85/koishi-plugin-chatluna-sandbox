<template>
  <section v-webqq-scrollbar class="credential-list">
    <header class="credential-toolbar">
      <p>已创建的凭证可以再次查看 Token，并修改名称和权限。调用记录和日志不会输出明文。</p>
      <Button size="sm" @click="openCreate"><IconPlus />创建凭证</Button>
    </header>
    <article v-for="credential in credentials" :key="credential.id" class="credential-card">
      <button type="button" class="credential-summary" @click="openEdit(credential)">
        <strong>{{ credential.name }}</strong>
        <small>{{ formatScopes(credential.scopes) }} · {{ credential.enabled ? '已启用' : '已停用' }} · {{ formatTime(credential.createdAt) }}</small>
      </button>
      <div class="credential-actions">
        <Button size="sm" variant="outline" @click="openEdit(credential)">查看</Button>
        <Button size="sm" variant="outline" @click="toggleCredential(credential)">{{ credential.enabled ? '停用' : '启用' }}</Button>
        <Button size="sm" variant="destructive" @click="revokeCredential(credential.id)">撤销</Button>
      </div>
    </article>
    <p v-if="!credentials.length" class="credential-empty">尚未创建 MCP 测试凭证。</p>
  </section>

  <Dialog v-model:open="formOpen">
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{{ editing ? '查看 MCP 凭证' : '创建 MCP 凭证' }}</DialogTitle>
        <DialogDescription>{{ editing ? '可查看 Token，并修改名称和权限范围。' : '选择最小必要权限。创建后仍可再次查看 Token。' }}</DialogDescription>
      </DialogHeader>
      <Label for="mcp-credential-name">凭证名称</Label>
      <Input id="mcp-credential-name" v-model="name" autocomplete="off" />
      <fieldset class="scope-grid">
        <legend>权限范围</legend>
        <label v-for="scope in allScopes" :key="scope.value"><Checkbox :model-value="scopes.includes(scope.value)" @update:model-value="toggleScope(scope.value, $event === true)" />{{ scope.label }}</label>
      </fieldset>
      <template v-if="editing">
        <div class="credential-token-field">
          <Label>Token</Label>
          <code v-if="editing.token" class="credential-token">{{ editing.token }}</code>
          <p v-else class="credential-meta">此凭证创建时未保存明文，无法再次查看。重新生成后可查看，旧 Token 会立即失效。</p>
          <Button size="sm" variant="outline" :disabled="saving" @click="rotateToken">{{ editing.token ? '重新生成 Token' : '生成可查看的 Token' }}</Button>
        </div>
        <p class="credential-meta">创建于 {{ formatTime(editing.createdAt) }} · {{ editing.enabled ? '已启用' : '已停用' }}</p>
      </template>
      <p v-if="error" class="credential-error">{{ error }}</p>
      <DialogFooter>
        <Button variant="outline" @click="formOpen = false">取消</Button>
        <Button :disabled="saving" @click="submitForm">{{ editing ? '保存' : '创建' }}</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>

  <Dialog v-model:open="tokenOpen">
    <DialogContent>
      <DialogHeader><DialogTitle>保存 MCP Token</DialogTitle><DialogDescription>请复制到测试控制器。之后仍可在凭证详情中再次查看。</DialogDescription></DialogHeader>
      <Input :model-value="createdToken" readonly />
      <DialogFooter><Button @click="tokenOpen = false">我已保存</Button></DialogFooter>
    </DialogContent>
  </Dialog>
</template>

<script setup lang="ts">
import { IconPlus } from '@tabler/icons-vue'
import { onMounted } from 'vue'
import { Button } from '#client/components/ui/button'
import { Checkbox } from '#client/components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '#client/components/ui/dialog'
import { Input } from '#client/components/ui/input'
import { Label } from '#client/components/ui/label'
import { createMcpCredentialAdmin, formatMcpScopes, MCP_SCOPE_OPTIONS } from '#client/webqq/mcp-admin-shell'
import type { McpAdminPort } from '#client/webqq/mcp-admin-port'
import { vWebqqScrollbar } from './webqq-scrollbar'

const props = defineProps<{ port: McpAdminPort }>()
const allScopes = MCP_SCOPE_OPTIONS
const formatScopes = formatMcpScopes
const {
  createdToken,
  credentials,
  editing,
  error,
  formOpen,
  name,
  openCreate,
  openEdit,
  refresh,
  revokeCredential,
  rotateToken,
  saving,
  scopes,
  submitForm,
  toggleCredential,
  toggleScope,
  tokenOpen,
} = createMcpCredentialAdmin(props.port)

function formatTime(value: string) {
  return new Intl.DateTimeFormat('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(value))
}
onMounted(() => void refresh())
</script>

<style scoped>
.credential-list { min-height: 0; overflow: auto; padding: 20px 28px 28px; }
.credential-toolbar, .credential-card, .credential-actions { display: flex; align-items: center; }
.credential-toolbar { justify-content: space-between; gap: 16px; margin-bottom: 12px; }
.credential-toolbar p, .credential-card small, .credential-empty, .credential-meta { margin: 0; color: var(--webqq-muted); font-size: var(--webqq-font-sm); }
.credential-card { justify-content: space-between; gap: 16px; padding: 12px; border: 1px solid var(--webqq-border); border-radius: 12px; }
.credential-card + .credential-card { margin-top: 8px; }
.credential-summary { display: grid; gap: 4px; min-width: 0; padding: 0; border: 0; background: transparent; text-align: left; }
.credential-card strong, .credential-card small { display: block; }
.credential-actions { gap: 8px; flex-shrink: 0; }
.scope-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; margin: 0; padding: 0; border: 0; }
.scope-grid legend { margin-bottom: 8px; font-weight: 600; }
.scope-grid label { display: flex; align-items: center; gap: 8px; }
.credential-token-field { display: grid; gap: 8px; }
.credential-token { display: block; overflow-wrap: anywhere; padding: 8px 12px; border: 1px solid var(--webqq-border); border-radius: 8px; background: var(--webqq-surface-muted, transparent); font-size: var(--webqq-font-sm); }
.credential-error { color: #dc2626; font-size: var(--webqq-font-sm); }
@media (max-width: 560px) { .credential-list { padding-right: 14px; padding-left: 14px; } .credential-toolbar, .credential-card { align-items: flex-start; flex-direction: column; } }
</style>
