<template>
  <k-layout main="onebot-sandbox-page">
    <k-content>
      <div
        class="webqq-workspace"
        :class="{
          'is-frosted': workspace.appearance.enableWebQQFrostedGlass,
          'has-tim-tail': workspace.appearance.webQQTimBubbleTail,
        }"
        :data-chat-style="workspace.appearance.webQQChatStyle"
        :data-color-mode="workspace.appearance.webQQColorMode"
        :data-mobile-view="currentView"
        :style="{ '--webqq-accent': workspace.appearance.webQQAccentColor }"
      >
        <nav class="webqq-rail" aria-label="WebQQ 主导航">
          <div class="webqq-brand" aria-label="OneBot Sandbox">Q</div>
          <button
            v-for="item in navigationItems"
            :key="item.id"
            type="button"
            class="webqq-rail-button"
            :class="{ 'is-active': currentView === item.id }"
            :aria-label="item.label"
            :aria-current="currentView === item.id ? 'page' : undefined"
            @click="currentView = item.id"
          >
            <component :is="item.icon" :size="22" stroke-width="1.8" aria-hidden="true" />
          </button>
          <span class="webqq-rail-spacer" />
          <ContextMenu>
            <ContextMenuTrigger as-child>
              <button
                type="button"
                class="webqq-current-user"
                :aria-label="`当前用户：${currentUser?.name ?? '未选择'}，右键或按 Shift+F10 切换用户`"
                @click="currentView = 'profile'"
                @keydown="openUserMenuFromKeyboard"
              >
                {{ getInitial(currentUser?.name) }}
              </button>
            </ContextMenuTrigger>
            <ContextMenuContent aria-label="切换当前用户">
              <ContextMenuItem
                v-for="user in snapshot.users"
                :key="user.id"
                :aria-current="user.id === currentUserId ? 'true' : undefined"
                @select="selectUser(user.id)"
              >
                <span class="webqq-menu-avatar">{{ getInitial(user.name) }}</span>
                <span class="min-w-0 flex-1">
                  <strong class="block truncate font-medium">{{ user.name }}</strong>
                  <small class="block text-xs text-slate-500">{{ user.id }}</small>
                </span>
                <IconCheck v-if="user.id === currentUserId" :size="16" aria-hidden="true" />
              </ContextMenuItem>
            </ContextMenuContent>
          </ContextMenu>
        </nav>

        <aside class="webqq-conversations" aria-label="会话列表">
          <header class="webqq-pane-header">
            <div>
              <p>当前用户</p>
              <h1>{{ currentUser?.name ?? '未选择用户' }}</h1>
            </div>
            <button type="button" class="webqq-icon-button" aria-label="新建会话" disabled>
              <IconEdit :size="20" aria-hidden="true" />
            </button>
          </header>
          <label class="webqq-search">
            <IconSearch :size="18" aria-hidden="true" />
            <span class="sr-only">搜索会话</span>
            <input v-model="searchQuery" type="search" placeholder="搜索" autocomplete="off">
          </label>
          <div class="webqq-list-tabs" aria-label="目录分类">
            <button type="button" class="is-active">最近</button>
            <button type="button" @click="currentView = 'contacts'">联系人</button>
          </div>
          <div class="webqq-session-list">
            <button
              v-for="conversation in filteredConversations"
              :key="conversation.id"
              type="button"
              class="webqq-session"
              :class="{ 'is-active': conversation.id === activeConversationId }"
              @click="selectConversation(conversation.id)"
            >
              <span class="webqq-avatar webqq-avatar-bot">{{ getInitial(getBot(conversation.botId)?.name) }}</span>
              <span class="webqq-session-copy">
                <strong>{{ getBot(conversation.botId)?.name }}</strong>
                <small>{{ getConversationPreview(conversation.id) }}</small>
              </span>
              <time>{{ getConversationTime(conversation.id) }}</time>
            </button>
            <p v-if="!filteredConversations.length" class="webqq-empty">没有匹配的会话</p>
          </div>
        </aside>

        <main class="webqq-chat">
          <header class="webqq-chat-header">
            <div class="webqq-chat-title">
              <span class="webqq-avatar webqq-avatar-bot">{{ getInitial(currentBot?.name) }}</span>
              <div>
                <strong>{{ currentBot?.name ?? '选择一个会话' }}</strong>
                <span>{{ currentBot ? '在线 · 虚拟 OneBot 机器人' : '暂无会话' }}</span>
              </div>
            </div>
            <button type="button" class="webqq-icon-button" aria-label="会话详情" @click="currentView = 'profile'">
              <IconDots :size="22" aria-hidden="true" />
            </button>
          </header>

          <section class="webqq-messages" aria-label="消息记录">
            <div v-if="!messages.length" class="webqq-welcome">
              <span class="webqq-avatar webqq-avatar-large webqq-avatar-bot">{{ getInitial(currentBot?.name) }}</span>
              <strong>{{ currentBot?.name ?? 'OneBot Sandbox' }}</strong>
              <p>发送消息，验证插件在模拟 QQ 环境中的响应</p>
            </div>
            <ol v-else>
              <li
                v-for="message in messages"
                :key="message.id"
                class="webqq-message-row"
                :class="message.authorId === currentUser?.id ? 'is-outgoing' : 'is-incoming'"
              >
                <span class="webqq-avatar">
                  {{ getInitial(getParticipantName(message.authorId)) }}
                </span>
                <div>
                  <span class="webqq-message-author">{{ getParticipantName(message.authorId) }}</span>
                  <p class="webqq-message-bubble">{{ message.content }}</p>
                </div>
              </li>
            </ol>
          </section>

          <form class="webqq-composer" @submit.prevent="sendMessage">
            <div class="webqq-composer-tools" aria-label="消息工具">
              <button type="button" aria-label="表情" disabled><IconMoodSmile :size="20" /></button>
              <button type="button" aria-label="图片" disabled><IconPhoto :size="20" /></button>
              <button type="button" aria-label="文件" disabled><IconPaperclip :size="20" /></button>
            </div>
            <label class="sr-only" for="onebot-sandbox-input">消息内容</label>
            <textarea
              id="onebot-sandbox-input"
              v-model="input"
              rows="3"
              placeholder="输入消息，Enter 发送"
              :disabled="sending || !currentConversation"
              @keydown.enter.exact.prevent="sendMessage"
            />
            <div class="webqq-composer-footer">
              <span>{{ errorMessage }}</span>
              <button type="submit" :disabled="sending || !input.trim() || !currentConversation">
                {{ sending ? '发送中' : '发送' }}
              </button>
            </div>
          </form>
        </main>

        <aside class="webqq-profile" aria-label="资料区域">
          <div class="webqq-profile-hero">
            <span class="webqq-avatar webqq-avatar-profile webqq-avatar-bot">{{ getInitial(currentBot?.name) }}</span>
            <h2>{{ currentBot?.name ?? 'OneBot Sandbox' }}</h2>
            <p>{{ currentBot?.id ?? '未选择机器人' }}</p>
            <span class="webqq-online"><i /> 在线</span>
          </div>
          <dl class="webqq-profile-details">
            <div><dt>平台</dt><dd>OneBot</dd></div>
            <div><dt>会话类型</dt><dd>私聊</dd></div>
            <div><dt>模拟环境</dt><dd>服务端内存</dd></div>
          </dl>
          <section class="webqq-user-directory" aria-labelledby="user-directory-title">
            <div class="webqq-section-title">
              <h3 id="user-directory-title">切换当前用户</h3>
              <span>仅此浏览器</span>
            </div>
            <button
              v-for="user in snapshot.users"
              :key="user.id"
              type="button"
              :class="{ 'is-active': user.id === currentUserId }"
              @click="selectUser(user.id)"
            >
              <span class="webqq-menu-avatar">{{ getInitial(user.name) }}</span>
              <span><strong>{{ user.name }}</strong><small>{{ user.id }}</small></span>
              <IconCheck v-if="user.id === currentUserId" :size="16" aria-hidden="true" />
            </button>
          </section>
        </aside>
      </div>
    </k-content>
  </k-layout>
</template>

<script setup lang="ts">
import { send } from '@koishijs/client'
import {
  IconAddressBook,
  IconCheck,
  IconDots,
  IconEdit,
  IconMessageCircle,
  IconMoodSmile,
  IconPaperclip,
  IconPhoto,
  IconSearch,
  IconUserCircle,
} from '@tabler/icons-vue'
import { computed, onMounted, ref, watch } from 'vue'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from './components/ui/context-menu'
import {
  loadWorkspacePreferences,
  resolveWorkspaceSelection,
  saveWorkspacePreferences,
  type SandboxWorkspaceView,
} from './workspace-state'
import type {
  SandboxAppearance,
  SandboxConversation,
  SandboxSnapshot,
  SandboxWorkspaceState,
} from '../src/types'

const defaultAppearance: SandboxAppearance = {
  enableWebQQFrostedGlass: true,
  webQQChatStyle: 'tim',
  webQQTimBubbleTail: true,
  webQQColorMode: 'auto',
  webQQAccentColor: '#2563eb',
}
const emptySnapshot: SandboxSnapshot = {
  revision: 0,
  users: [],
  bots: [],
  conversations: [],
  messages: [],
}
const workspace = ref<SandboxWorkspaceState>({
  snapshot: emptySnapshot,
  appearance: defaultAppearance,
})
const currentUserId = ref<string>()
const activeConversationId = ref<string>()
const currentView = ref<SandboxWorkspaceView>('messages')
const searchQuery = ref('')
const input = ref('')
const sending = ref(false)
const errorMessage = ref('')
const hydrated = ref(false)

const navigationItems = [
  { id: 'messages' as const, label: '消息', icon: IconMessageCircle },
  { id: 'contacts' as const, label: '联系人', icon: IconAddressBook },
  { id: 'profile' as const, label: '资料', icon: IconUserCircle },
]
const snapshot = computed(() => workspace.value.snapshot)
const currentUser = computed(() => snapshot.value.users.find(({ id }) => id === currentUserId.value))
const visibleConversations = computed(() => snapshot.value.conversations.filter(({ userId }) => userId === currentUserId.value))
const filteredConversations = computed(() => {
  const query = searchQuery.value.trim().toLowerCase()
  if (!query) return visibleConversations.value
  return visibleConversations.value.filter(({ botId }) => {
    const bot = getBot(botId)
    return bot?.name.toLowerCase().includes(query) || botId.includes(query)
  })
})
const currentConversation = computed(() => visibleConversations.value.find(({ id }) => id === activeConversationId.value))
const currentBot = computed(() => getBot(currentConversation.value?.botId))
const messages = computed(() => {
  const ids = new Set(currentConversation.value?.messageIds ?? [])
  return snapshot.value.messages.filter(({ id }) => ids.has(id))
})

onMounted(async () => {
  workspace.value = await send('onebot-sandbox/workspace')
  applySelection(resolveWorkspaceSelection(snapshot.value, loadWorkspacePreferences(window.localStorage)))
  hydrated.value = true
})

watch([currentUserId, activeConversationId, currentView], () => {
  if (!hydrated.value) return
  saveWorkspacePreferences(window.localStorage, {
    currentUserId: currentUserId.value,
    activeConversationId: activeConversationId.value,
    currentView: currentView.value,
  })
})

function applySelection(selection: ReturnType<typeof resolveWorkspaceSelection>) {
  currentUserId.value = selection.currentUserId
  activeConversationId.value = selection.activeConversationId
  currentView.value = selection.currentView
}

function selectUser(userId: string) {
  applySelection(resolveWorkspaceSelection(snapshot.value, {
    currentUserId: userId,
    currentView: 'messages',
  }))
  input.value = ''
}

function selectConversation(conversationId: string) {
  activeConversationId.value = conversationId
  currentView.value = 'messages'
}

function openUserMenuFromKeyboard(event: KeyboardEvent) {
  if (event.key !== 'ContextMenu' && !(event.shiftKey && event.key === 'F10')) return
  event.preventDefault()
  const target = event.currentTarget as HTMLElement
  const bounds = target.getBoundingClientRect()

  // Reka UI 的 Context Menu 在部分桌面浏览器不会自行处理菜单键；
  // 转为标准 contextmenu 事件后仍由组件负责定位、焦点恢复和无障碍语义。
  target.dispatchEvent(new MouseEvent('contextmenu', {
    bubbles: true,
    cancelable: true,
    clientX: bounds.left + bounds.width / 2,
    clientY: bounds.top + bounds.height / 2,
  }))
}

function getBot(botId?: string) {
  return snapshot.value.bots.find(({ id }) => id === botId)
}

function getParticipantName(id: string) {
  return snapshot.value.users.find((user) => user.id === id)?.name
    ?? snapshot.value.bots.find((bot) => bot.id === id)?.name
    ?? id
}

function getInitial(name?: string) {
  return name?.trim().slice(0, 1).toUpperCase() || '?'
}

function getConversationMessages(conversationId: string) {
  const conversation = snapshot.value.conversations.find(({ id }) => id === conversationId)
  const ids = new Set(conversation?.messageIds ?? [])
  return snapshot.value.messages.filter(({ id }) => ids.has(id))
}

function getConversationPreview(conversationId: string) {
  return getConversationMessages(conversationId).at(-1)?.content ?? '开始一段新对话'
}

function getConversationTime(conversationId: string) {
  const value = getConversationMessages(conversationId).at(-1)?.createdAt
  if (!value) return ''
  return new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit' }).format(new Date(value))
}

async function sendMessage() {
  const content = input.value.trim()
  const user = currentUser.value
  const bot = currentBot.value
  const conversation = currentConversation.value
  if (!content || !user || !bot || !conversation || sending.value) return

  sending.value = true
  errorMessage.value = ''
  try {
    workspace.value = await send('onebot-sandbox/send-message', {
      actorUserId: user.id,
      botId: bot.id,
      conversationId: conversation.id,
      content,
    })
    applySelection(resolveWorkspaceSelection(snapshot.value, {
      currentUserId: user.id,
      activeConversationId: conversation.id,
      currentView: currentView.value,
    }))
    input.value = ''
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '发送失败'
  } finally {
    sending.value = false
  }
}
</script>
