<template>
  <section v-webqq-scrollbar class="credential-list">
    <header class="credential-toolbar">
      <p>Token 仅在创建成功后展示一次，服务端只保存 SHA-256 摘要。</p>
      <Button size="sm" @click="createOpen = true"><IconPlus />创建凭证</Button>
    </header>
    <article v-for="credential in credentials" :key="credential.id" class="credential-card">
      <div>
        <strong>{{ credential.name }}</strong>
        <small>{{ credential.scopes.join(' · ') }} · {{ credential.enabled ? '已启用' : '已停用' }}</small>
      </div>
      <div class="credential-actions">
        <Button size="sm" variant="outline" @click="toggleCredential(credential)">{{ credential.enabled ? '停用' : '启用' }}</Button>
        <Button size="sm" variant="destructive" @click="revokeCredential(credential.id)">撤销</Button>
      </div>
    </article>
    <p v-if="!credentials.length" class="credential-empty">尚未创建 MCP 测试凭证。</p>
  </section>

  <Dialog v-model:open="createOpen">
    <DialogContent>
      <DialogHeader><DialogTitle>创建 MCP 凭证</DialogTitle><DialogDescription>选择最小必要权限。Token 关闭后无法再次查看。</DialogDescription></DialogHeader>
      <Label for="mcp-credential-name">凭证名称</Label>
      <Input id="mcp-credential-name" v-model="name" autocomplete="off" />
      <fieldset class="scope-grid">
        <legend>权限范围</legend>
        <label v-for="scope in allScopes" :key="scope.value"><Checkbox :model-value="scopes.includes(scope.value)" @update:model-value="toggleScope(scope.value, $event === true)" />{{ scope.label }}</label>
      </fieldset>
      <p v-if="error" class="credential-error">{{ error }}</p>
      <DialogFooter><Button variant="outline" @click="createOpen = false">取消</Button><Button :disabled="creating" @click="createCredential">创建</Button></DialogFooter>
    </DialogContent>
  </Dialog>

  <Dialog v-model:open="tokenOpen">
    <DialogContent>
      <DialogHeader><DialogTitle>保存 MCP Token</DialogTitle><DialogDescription>这是唯一一次明文展示，请立即复制到测试控制器。</DialogDescription></DialogHeader>
      <Input :model-value="createdToken" readonly />
      <DialogFooter><Button @click="tokenOpen = false">我已保存</Button></DialogFooter>
    </DialogContent>
  </Dialog>
</template>

<script setup lang="ts">
import { send } from '@koishijs/client'
import { IconPlus } from '@tabler/icons-vue'
import { onMounted, ref } from 'vue'
import { Button } from './components/ui/button'
import { Checkbox } from './components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from './components/ui/dialog'
import { Input } from './components/ui/input'
import { Label } from './components/ui/label'
import { vWebqqScrollbar } from './webqq-scrollbar'
import type { SandboxMcpScope } from '../src/mcp/types'

type Credential = { id: string; name: string; scopes: SandboxMcpScope[]; enabled: boolean; createdAt: string }
const credentials = ref<Credential[]>([])
const createOpen = ref(false)
const tokenOpen = ref(false)
const creating = ref(false)
const name = ref('')
const scopes = ref<SandboxMcpScope[]>(['read'])
const createdToken = ref('')
const error = ref('')
const allScopes = [
  { value: 'read' as const, label: '读取' },
  { value: 'interact' as const, label: '交互' },
  { value: 'manage' as const, label: '环境管理' },
  { value: 'debug' as const, label: '调试' },
]

async function refresh() { credentials.value = await send('chatluna-sandbox/mcp-credentials') }
function toggleScope(scope: SandboxMcpScope, enabled: boolean) { scopes.value = enabled ? [...new Set([...scopes.value, scope])] : scopes.value.filter((item) => item !== scope) }
async function createCredential() {
  error.value = ''
  if (!name.value.trim() || !scopes.value.length) { error.value = '请填写名称并至少选择一项权限。'; return }
  creating.value = true
  try {
    const result = await send('chatluna-sandbox/create-mcp-credential', { name: name.value, scopes: scopes.value })
    createdToken.value = result.token
    name.value = ''
    scopes.value = ['read']
    createOpen.value = false
    tokenOpen.value = true
    await refresh()
  } catch (cause) { error.value = cause instanceof Error ? cause.message : '创建凭证失败' } finally { creating.value = false }
}
async function toggleCredential(credential: Credential) { await send('chatluna-sandbox/set-mcp-credential-enabled', { id: credential.id, enabled: !credential.enabled }); await refresh() }
async function revokeCredential(id: string) { await send('chatluna-sandbox/revoke-mcp-credential', { id }); await refresh() }
onMounted(() => void refresh())
</script>

<style scoped>
.credential-list { min-height: 0; overflow: auto; padding: 20px 28px 28px; }
.credential-toolbar, .credential-card, .credential-actions { display: flex; align-items: center; }
.credential-toolbar { justify-content: space-between; gap: 16px; margin-bottom: 12px; }
.credential-toolbar p, .credential-card small, .credential-empty { margin: 0; color: var(--webqq-muted); font-size: 12px; }
.credential-card { justify-content: space-between; gap: 16px; padding: 12px; border: 1px solid var(--webqq-border); border-radius: 12px; }
.credential-card + .credential-card { margin-top: 8px; }
.credential-card strong, .credential-card small { display: block; }
.credential-card small { margin-top: 4px; }
.credential-actions { gap: 8px; }
.scope-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; margin: 0; padding: 0; border: 0; }
.scope-grid legend { margin-bottom: 8px; font-weight: 600; }
.scope-grid label { display: flex; align-items: center; gap: 8px; }
.credential-error { color: #dc2626; font-size: 12px; }
@media (max-width: 560px) { .credential-list { padding-right: 14px; padding-left: 14px; } .credential-toolbar, .credential-card { align-items: flex-start; flex-direction: column; } }
</style>
