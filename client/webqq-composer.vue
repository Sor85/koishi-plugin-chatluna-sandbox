<template>
  <div ref="composerLayoutRef" class="webqq-composer-layout-root">
    <form class="webqq-composer" :style="composerStyle" @submit.prevent="sendMessage">
      <span v-if="displayError" class="webqq-composer-error" role="alert">{{ displayError }}</span>
      <div v-if="model.replyingTo" class="webqq-composer-reply">
        <span>回复 {{ model.replyingTo.authorName }}：{{ model.replyingTo.content }}</span>
        <button type="button" aria-label="取消回复" @click="emit('clearReply')">
          <IconX :size="15" aria-hidden="true" />
        </button>
      </div>
      <div v-if="selectedMediaFile" :class="['webqq-composer-media', { 'has-reply': model.replyingTo }]">
        <IconPaperclip :size="16" aria-hidden="true" />
        <span>{{ selectedMediaFile.name }} · {{ formatMediaSize(selectedMediaFile.size) }}</span>
        <button type="button" aria-label="移除待发送媒体" @click="clearSelectedMedia">
          <IconX :size="15" aria-hidden="true" />
        </button>
      </div>
      <div ref="userStackLayoutRef" class="webqq-composer-user-layout-root" :style="userLayoutStyle">
        <div
          :class="['webqq-composer-user-capsule', { 'is-expanded': userStackVisualExpanded }]"
          :style="userCapsuleStyle"
          @pointerenter="expandUserStack"
          @pointerleave="collapseUserStack"
          @focusin="focusUserStack"
          @focusout="blurUserStack"
        >
          <div
            :class="['webqq-composer-user-stack', {
              'is-expanded': userStackVisualExpanded,
              'is-overflow-expanding': userStackOverflowMotion === 'expanding',
              'is-overflow-collapsing': userStackOverflowMotion === 'collapsing',
            }]"
            :style="userStackStyle"
          >
            <TooltipProvider :delay-duration="300">
              <Tooltip v-for="(sender, index) in orderedSenders" :key="sender.id">
                <!-- Tooltip 使用外层定位节点，ContextMenu 直接绑定内部按钮；否则 reka-ui 会把右键菜单定位到 (0, 0)。 -->
                <TooltipTrigger as-child>
                  <span
                    :class="['webqq-composer-user-switch', {
                      'is-active': sender.id === model.currentOperatorId,
                      'is-bot': sender.type === 'bot',
                      'is-collapsed-extra': isUserCollapsedExtra(index),
                    }]"
                    :aria-hidden="isUserCollapsedHidden(index) ? 'true' : undefined"
                    :style="getUserSwitchStyle(index)"
                  >
                    <ContextMenu>
                      <ContextMenuTrigger as-child>
                        <button
                          type="button"
                          class="webqq-composer-user-button"
                          :aria-label="sender.id === model.currentOperatorId
                            ? `当前发送者：${sender.name}${sender.type === 'bot' ? '（机器人）' : ''}`
                            : `切换发送者：${sender.name}${sender.type === 'bot' ? '（机器人）' : ''}`"
                          :aria-pressed="sender.id === model.currentOperatorId"
                          :tabindex="isUserCollapsedHidden(index) ? -1 : undefined"
                          @click="selectComposerUser(sender)"
                        >
                          <WebqqAvatar
                            class="webqq-composer-user-avatar"
                            :kind="sender.type"
                            :name="sender.name"
                            :avatar="sender.avatar"
                            :show-bot-badge="sender.id === model.currentOperatorId"
                          />
                        </button>
                      </ContextMenuTrigger>
                      <ContextMenuContent class="webqq-composer-user-menu" style="z-index: 160">
                        <ContextMenuItem @select="emit('editParticipant', { type: sender.type, id: sender.id })">
                          <IconEdit :size="16" aria-hidden="true" /> 编辑{{ sender.type === 'bot' ? '机器人' : '用户' }}
                        </ContextMenuItem>
                        <ContextMenuItem class="text-red-600 focus:bg-red-50 focus:text-red-700 dark:focus:bg-red-950/40" @select="emit('deleteParticipant', { type: sender.type, id: sender.id })">
                          <IconTrash :size="16" aria-hidden="true" /> 删除{{ sender.type === 'bot' ? '机器人' : '用户' }}
                        </ContextMenuItem>
                      </ContextMenuContent>
                    </ContextMenu>
                  </span>
                </TooltipTrigger>
                <TooltipContent side="top">{{ sender.name }}</TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <span
              v-if="userStackMetrics.overflowCount"
              class="webqq-composer-user-overflow"
              :style="userOverflowStyle"
              aria-hidden="true"
            >
              <WebqqAvatar
                v-if="userOverflowPreview"
                class="webqq-composer-user-overflow-avatar"
                :kind="userOverflowPreview.type"
                :name="userOverflowPreview.name"
                :avatar="userOverflowPreview.avatar"
                :show-bot-badge="userOverflowPreview.id === model.currentOperatorId"
              />
              <span class="webqq-composer-user-overflow-label">
                <span class="webqq-composer-user-overflow-plus">+</span>
                <span class="webqq-composer-user-overflow-count">{{ userStackMetrics.overflowCount }}</span>
              </span>
            </span>
            <EnvironmentCreatePopover
              type="participant"
              side="top"
              :accent-color="model.accentColor"
              @submit="forwardManageEnvironment"
              @open-change="handleCreateParticipantOpen"
            >
              <template #trigger>
                <button
                  type="button"
                  :class="['webqq-composer-user-add', { 'is-collapsed-hidden': hasUserStackOverflow && !userStackVisualExpanded }]"
                  :style="userAddStyle"
                  aria-label="添加测试账号"
                >
                  <IconPlus :size="18" stroke-width="2" aria-hidden="true" />
                </button>
              </template>
            </EnvironmentCreatePopover>
          </div>
        </div>
      </div>
      <div class="webqq-composer-main">
        <label class="sr-only" for="onebot-sandbox-input">消息内容</label>
        <textarea
          id="onebot-sandbox-input"
          v-webqq-scrollbar="{ tone: 'accent' }"
          v-model="input"
          rows="1"
          placeholder="发送消息"
          :disabled="sending || !model.conversationId"
          @keydown.enter.exact.prevent="sendMessage"
        />
      </div>
      <input
        ref="mediaInputRef"
        class="sr-only"
        type="file"
        accept="image/png,image/jpeg,image/gif,image/webp,audio/*,video/mp4,video/webm,video/quicktime,.txt,.csv,.json,.pdf,.zip,.doc,.docx,.xls,.xlsx,.ppt,.pptx"
        @change="selectMediaFile"
      >
      <button class="webqq-composer-action" type="button" aria-label="选择文件" :disabled="sending || !model.conversationId" @click="mediaInputRef?.click()">
        <IconPaperclip :size="19" stroke-width="2" aria-hidden="true" />
      </button>
      <button class="webqq-composer-action is-primary" type="submit" aria-label="发送" :disabled="sending || (!input.trim() && !selectedMediaFile) || !model.conversationId">
        <IconSend :size="19" stroke-width="2" aria-hidden="true" />
      </button>
    </form>
  </div>
</template>

<script setup lang="ts">
import { createLayout, type AutoLayout } from 'animejs'
import { IconEdit, IconPaperclip, IconPlus, IconSend, IconTrash, IconX } from '@tabler/icons-vue'
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger } from './components/ui/context-menu'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './components/ui/tooltip'
import EnvironmentCreatePopover from './environment-create-popover.vue'
import WebqqAvatar from './webqq-avatar.vue'
import { vWebqqScrollbar } from './webqq-scrollbar'
import {
  getUserStackLayoutMetrics,
  getUserStackMetrics,
  orderUsersByActive,
  USER_AVATAR_SIZE,
  USER_STACK_COLLAPSED_STEP,
  USER_STACK_EXPANDED_STEP,
} from './webqq/user-stack'
import type { ManageSandboxEnvironmentInput } from '../src/types'

export interface WebqqComposerSender {
  id: string
  name: string
  avatar?: string
  type: 'user' | 'bot'
}

export interface WebqqComposerModel {
  senders: WebqqComposerSender[]
  currentOperatorId?: string
  conversationId?: string
  botId?: string
  replyingTo?: { id: string, authorName: string, content: string }
  accentColor: string
  externalError?: string
}

export interface WebqqComposerSendIntent {
  conversationId: string
  content: string
  replyToMessageId?: string
  media?: { fileName: string, mimeType: string, dataBase64: string }
}

const props = defineProps<{ model: WebqqComposerModel }>()
const emit = defineEmits<{
  send: [input: WebqqComposerSendIntent, resolve: () => void, reject: (error: unknown) => void]
  selectOperator: [participantId: string, resolve: () => void, reject: (error: unknown) => void]
  manageEnvironment: [input: ManageSandboxEnvironmentInput, resolve: () => void, reject: (error: unknown) => void]
  editParticipant: [entity: { type: 'user' | 'bot', id: string }]
  deleteParticipant: [entity: { type: 'user' | 'bot', id: string }]
  clearReply: []
}>()

type UserStackOverflowMotion = 'idle' | 'expanding' | 'collapsing'
const input = ref('')
const mediaInputRef = ref<HTMLInputElement>()
const selectedMediaFile = ref<File>()
const sending = ref(false)
const localError = ref('')
const composerLayoutRef = ref<HTMLElement>()
const userStackLayoutRef = ref<HTMLElement>()
const userStackExpanded = ref(false)
const userStackHovered = ref(false)
const userStackFocused = ref(false)
const createParticipantOpen = ref(false)
const userStackOverflowMotion = ref<UserStackOverflowMotion>('idle')
let suppressUserStackCollapse = false
let suppressUserStackCollapseTimer: ReturnType<typeof setTimeout> | undefined
let userStackOverflowMotionTimer: ReturnType<typeof setTimeout> | undefined
let userStackLayout: AutoLayout | undefined
let userStackTransitionUntil = 0

const displayError = computed(() => localError.value || props.model.externalError || '')
const orderedSenders = computed(() => orderUsersByActive(props.model.senders, props.model.currentOperatorId))
const userStackMetrics = computed(() => getUserStackMetrics(orderedSenders.value.length))
const userStackLayoutMetrics = computed(() => getUserStackLayoutMetrics(orderedSenders.value.length))
const hasUserStackOverflow = computed(() => userStackMetrics.value.overflowCount > 0)
const userStackVisualExpanded = computed(() => userStackExpanded.value || !hasUserStackOverflow.value)
const userOverflowPreview = computed(() => orderedSenders.value[userStackMetrics.value.collapsedVisibleCount])
const composerStyle = computed(() => {
  const extraWidth = Math.max(0, userStackLayoutMetrics.value.collapsedWidth - USER_AVATAR_SIZE)
  const visualExtension = userStackVisualExpanded.value
    ? Math.max(0, userStackLayoutMetrics.value.expandedWidth - userStackLayoutMetrics.value.collapsedWidth)
    : 0
  return { width: `${460 + extraWidth}px`, '--webqq-composer-visual-extension': `${visualExtension}px` }
})
const userLayoutStyle = computed(() => ({ '--webqq-user-layout-width': `${userStackLayoutMetrics.value.collapsedWidth}px` }))
const userCapsuleStyle = computed(() => ({
  '--webqq-user-capsule-collapsed-width': `${userStackLayoutMetrics.value.collapsedWidth}px`,
  '--webqq-user-capsule-expanded-width': `${userStackLayoutMetrics.value.expandedWidth}px`,
}))
const userStackStyle = computed(() => ({
  '--webqq-user-stack-collapsed-width': `${userStackLayoutMetrics.value.collapsedWidth}px`,
  '--webqq-user-stack-expanded-width': `${userStackLayoutMetrics.value.expandedWidth}px`,
}))
const userAddStyle = computed(() => ({
  '--webqq-user-add-collapsed-right': `${userStackLayoutMetrics.value.addCollapsedRight}px`,
  '--webqq-user-add-expanded-right': `${userStackLayoutMetrics.value.addExpandedRight}px`,
}))
const userOverflowStyle = computed(() => {
  const collapsedRight = userStackMetrics.value.collapsedVisibleCount * USER_STACK_COLLAPSED_STEP
  const expandedRight = userStackMetrics.value.collapsedVisibleCount * USER_STACK_EXPANDED_STEP
  const coveredByExpandedAvatar = userStackExpanded.value || userStackOverflowMotion.value === 'expanding'
  return {
    '--webqq-user-overflow-right': `${collapsedRight}px`,
    '--webqq-user-overflow-expanded-right': `${expandedRight}px`,
    '--webqq-user-overflow-z-index': `${orderedSenders.value.length - userStackMetrics.value.collapsedVisibleCount - (coveredByExpandedAvatar ? 1 : 0)}`,
  }
})

watch(hasUserStackOverflow, (hasOverflow) => {
  if (!hasOverflow) userStackExpanded.value = false
})

function getUserSwitchStyle(index: number) {
  const collapsedRight = isUserCollapsedExtra(index)
    ? userStackMetrics.value.collapsedVisibleCount * USER_STACK_COLLAPSED_STEP
    : index * USER_STACK_COLLAPSED_STEP
  return {
    '--webqq-user-collapsed-right': `${collapsedRight}px`,
    '--webqq-user-expanded-right': `${index * USER_STACK_EXPANDED_STEP}px`,
    zIndex: String(orderedSenders.value.length - index),
  }
}

function isUserCollapsedExtra(index: number) {
  return userStackMetrics.value.overflowCount > 0 && index >= userStackMetrics.value.collapsedVisibleCount
}

function isUserCollapsedHidden(index: number) {
  return !userStackExpanded.value && isUserCollapsedExtra(index)
}

function ensureUserStackLayout() {
  if (userStackLayout || !userStackLayoutRef.value) return userStackLayout
  // 只记录头像区；把发送框正文加入 FLIP 会让整个控件在切换发送者时横向跳动。
  userStackLayout = createLayout(userStackLayoutRef.value, {
    children: ['.webqq-composer-user-capsule', '.webqq-composer-user-stack', '.webqq-composer-user-switch', '.webqq-composer-user-overflow', '.webqq-composer-user-add'],
  })
  return userStackLayout
}

function recordUserStackLayout() {
  const layout = ensureUserStackLayout()
  layout?.record()
  return layout
}

async function animateUserStackLayout(layout?: AutoLayout) {
  if (!layout) return
  await nextTick()
  await layout.animate({ duration: 260, ease: 'out(3)' })
}

async function waitForUserStackTransition() {
  const remaining = userStackTransitionUntil - performance.now()
  if (remaining > 0) await new Promise((resolve) => setTimeout(resolve, remaining))
}

function setUserStackExpanded(expanded: boolean) {
  if (!hasUserStackOverflow.value || userStackExpanded.value === expanded) return
  userStackOverflowMotion.value = expanded ? 'expanding' : 'collapsing'
  if (userStackOverflowMotionTimer) clearTimeout(userStackOverflowMotionTimer)
  userStackOverflowMotionTimer = setTimeout(() => {
    userStackOverflowMotion.value = 'idle'
    userStackOverflowMotionTimer = undefined
  }, 280)
  userStackExpanded.value = expanded
  userStackTransitionUntil = performance.now() + 180
}

// Chrome 会在 keyed 按钮重排时短暂触发 focusout，切换动画完成前不能据此折叠头像堆叠。
function syncUserStackExpanded() {
  if (suppressUserStackCollapse) return
  setUserStackExpanded(userStackHovered.value || userStackFocused.value || createParticipantOpen.value)
}

function handleCreateParticipantOpen(open: boolean) {
  createParticipantOpen.value = open
  syncUserStackExpanded()
}

function expandUserStack() {
  userStackHovered.value = true
  syncUserStackExpanded()
}

function collapseUserStack() {
  userStackHovered.value = false
  syncUserStackExpanded()
}

function focusUserStack() {
  userStackFocused.value = true
  syncUserStackExpanded()
}

function blurUserStack(event: FocusEvent) {
  const nextTarget = event.relatedTarget
  const currentTarget = event.currentTarget
  userStackFocused.value = nextTarget instanceof Node && currentTarget instanceof Node && currentTarget.contains(nextTarget)
  syncUserStackExpanded()
}

async function selectComposerUser(sender: WebqqComposerSender) {
  if (sender.id === props.model.currentOperatorId) return
  suppressUserStackCollapse = true
  if (suppressUserStackCollapseTimer) clearTimeout(suppressUserStackCollapseTimer)
  await waitForUserStackTransition()
  const layout = recordUserStackLayout()
  try {
    await new Promise<void>((resolve, reject) => emit('selectOperator', sender.id, resolve, reject))
    input.value = ''
    localError.value = ''
    await animateUserStackLayout(layout)
  } catch (error) {
    localError.value = error instanceof Error ? error.message : '切换发送者失败'
  } finally {
    suppressUserStackCollapseTimer = setTimeout(() => {
      suppressUserStackCollapse = false
      suppressUserStackCollapseTimer = undefined
      userStackFocused.value = !!composerLayoutRef.value?.contains(document.activeElement)
      syncUserStackExpanded()
    }, 280)
  }
}

function forwardManageEnvironment(input: ManageSandboxEnvironmentInput, resolve: () => void, reject: (error: unknown) => void) {
  emit('manageEnvironment', input, resolve, reject)
}

function selectMediaFile(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file) return
  if (file.size > 10 * 1024 * 1024) {
    localError.value = '媒体大小不能超过 10 MB'
    clearSelectedMedia()
    return
  }
  selectedMediaFile.value = file
  localError.value = ''
}

function clearSelectedMedia() {
  selectedMediaFile.value = undefined
  if (mediaInputRef.value) mediaInputRef.value.value = ''
}

function readFileBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.addEventListener('load', () => {
      const result = typeof reader.result === 'string' ? reader.result : ''
      const separator = result.indexOf(',')
      if (separator < 0) return reject(new Error('无法读取媒体内容'))
      resolve(result.slice(separator + 1))
    })
    reader.addEventListener('error', () => reject(reader.error ?? new Error('无法读取媒体内容')))
    reader.readAsDataURL(file)
  })
}

function formatMediaSize(size: number) {
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / 1024 / 1024).toFixed(1)} MB`
}

async function sendMessage() {
  const content = input.value.trim()
  const mediaFile = selectedMediaFile.value
  const { currentOperatorId, conversationId } = props.model
  if ((!content && !mediaFile) || !currentOperatorId || !conversationId || sending.value) return

  sending.value = true
  localError.value = ''
  try {
    const media = mediaFile
      ? { fileName: mediaFile.name, mimeType: mediaFile.type, dataBase64: await readFileBase64(mediaFile) }
      : undefined
    await new Promise<void>((resolve, reject) => emit('send', {
      conversationId,
      content,
      replyToMessageId: props.model.replyingTo?.id,
      media,
    }, resolve, reject))
    input.value = ''
    clearSelectedMedia()
    emit('clearReply')
  } catch (error) {
    localError.value = error instanceof Error ? error.message : '发送失败'
  } finally {
    sending.value = false
  }
}

onBeforeUnmount(() => {
  userStackLayout?.revert()
  if (suppressUserStackCollapseTimer) clearTimeout(suppressUserStackCollapseTimer)
  if (userStackOverflowMotionTimer) clearTimeout(userStackOverflowMotionTimer)
})
</script>
