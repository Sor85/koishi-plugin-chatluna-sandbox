<template>
  <Dialog :open="open" @update:open="emit('update:open', $event)">
    <DialogContent class="webqq-forward-target-dialog" :style="{ '--webqq-accent': accentColor }">
      <DialogHeader>
        <DialogTitle>选择转发目标</DialogTitle>
        <DialogDescription>将已选消息合并转发到一个最近会话、好友或群组。</DialogDescription>
      </DialogHeader>

      <label class="webqq-forward-target-search">
        <IconSearch :size="18" aria-hidden="true" />
        <input
          v-model="searchQuery"
          type="search"
          aria-label="搜索目标会话"
          placeholder="搜索最近、好友或群组..."
          autocomplete="off"
        >
      </label>

      <div class="webqq-forward-target-tabs" role="tablist" aria-label="目标分类">
        <button
          v-for="tab in tabs"
          :key="tab.id"
          type="button"
          role="tab"
          class="webqq-forward-target-tab"
          :class="{ 'is-active': activeTab === tab.id }"
          :aria-selected="activeTab === tab.id"
          @click="activeTab = tab.id"
        >
          {{ tab.label }}
        </button>
      </div>

      <div
        v-webqq-scrollbar="{ tone: 'accent' }"
        class="webqq-forward-target-list"
        role="listbox"
        aria-label="目标会话"
      >
        <button
          v-for="target in visibleTargets"
          :key="target.conversationId"
          type="button"
          role="option"
          class="webqq-forward-target-item"
          :class="{ 'is-active': selectedConversationId === target.conversationId }"
          :aria-selected="selectedConversationId === target.conversationId"
          @click="selectedConversationId = target.conversationId"
        >
          <WebqqAvatar
            class="webqq-avatar"
            :kind="target.avatarKind"
            :name="target.title"
            :avatar="target.avatar"
          />
          <span class="webqq-forward-target-copy">
            <strong>{{ target.title }}</strong>
            <small>{{ target.subtitle || target.conversationId }}</small>
          </span>
          <span class="webqq-forward-target-radio" aria-hidden="true" />
        </button>
        <div v-if="!visibleTargets.length" class="webqq-forward-target-empty">
          {{ emptyText }}
        </div>
      </div>

      <p v-if="errorMessage" class="webqq-form-error m-0 rounded-lg px-3 py-2 text-xs" role="alert">
        {{ errorMessage }}
      </p>

      <DialogFooter>
        <Button variant="outline" :disabled="submitting" @click="emit('update:open', false)">取消</Button>
        <Button :disabled="!selectedConversationId || submitting" @click="confirm">
          {{ submitting ? '转发中...' : '合并转发' }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>

<script setup lang="ts">
import { IconSearch } from '@tabler/icons-vue'
import { computed, ref, watch } from 'vue'
import { Button } from './components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from './components/ui/dialog'
import WebqqAvatar from './webqq-avatar.vue'
import { vWebqqScrollbar } from './webqq-scrollbar'

export type WebqqForwardTargetTab = 'recent' | 'friends' | 'groups'

export interface WebqqForwardTargetOption {
  conversationId: string
  title: string
  subtitle?: string
  avatar?: string
  avatarKind: 'user' | 'bot' | 'group'
}

export interface WebqqForwardTargetModel {
  recent: WebqqForwardTargetOption[]
  friends: WebqqForwardTargetOption[]
  groups: WebqqForwardTargetOption[]
}

const props = defineProps<{
  open: boolean
  model: WebqqForwardTargetModel
  accentColor: string
}>()

const emit = defineEmits<{
  'update:open': [open: boolean]
  confirm: [conversationId: string, resolve: () => void, reject: (error: unknown) => void]
}>()

const tabs: Array<{ id: WebqqForwardTargetTab, label: string }> = [
  { id: 'recent', label: '最近' },
  { id: 'friends', label: '好友' },
  { id: 'groups', label: '群组' },
]

const activeTab = ref<WebqqForwardTargetTab>('recent')
const searchQuery = ref('')
const selectedConversationId = ref('')
const submitting = ref(false)
// 多选期间 composer 被隐藏，shell 的 externalError 用户看不到；错误必须留在本对话框。
const errorMessage = ref('')

const visibleTargets = computed(() => {
  const query = searchQuery.value.trim().toLowerCase()
  const source = props.model[activeTab.value]
  if (!query) return source
  return source.filter((target) => (
    target.title.toLowerCase().includes(query)
    || target.conversationId.toLowerCase().includes(query)
    || (target.subtitle?.toLowerCase().includes(query) ?? false)
  ))
})

const emptyText = computed(() => {
  if (searchQuery.value.trim()) return '没有匹配的目标会话'
  if (activeTab.value === 'friends') return '暂无已添加好友会话'
  if (activeTab.value === 'groups') return '暂无已加入群组'
  return '暂无最近会话'
})

watch(() => props.open, (open) => {
  if (!open) return
  activeTab.value = 'recent'
  searchQuery.value = ''
  selectedConversationId.value = props.model.recent[0]?.conversationId
    ?? props.model.friends[0]?.conversationId
    ?? props.model.groups[0]?.conversationId
    ?? ''
  submitting.value = false
  errorMessage.value = ''
})

watch(activeTab, () => {
  if (!visibleTargets.value.some(({ conversationId }) => conversationId === selectedConversationId.value)) {
    selectedConversationId.value = visibleTargets.value[0]?.conversationId ?? ''
  }
})

watch(searchQuery, () => {
  if (!visibleTargets.value.some(({ conversationId }) => conversationId === selectedConversationId.value)) {
    selectedConversationId.value = visibleTargets.value[0]?.conversationId ?? ''
  }
})

async function confirm() {
  const conversationId = selectedConversationId.value
  if (!conversationId || submitting.value) return
  submitting.value = true
  errorMessage.value = ''
  try {
    await new Promise<void>((resolve, reject) => emit('confirm', conversationId, resolve, reject))
    emit('update:open', false)
  } catch (error) {
    // shell 仍会写 externalError，但多选态 composer 不可见，这里直接展示可重试错误。
    errorMessage.value = error instanceof Error ? error.message : '合并转发失败'
  } finally {
    submitting.value = false
  }
}
</script>
