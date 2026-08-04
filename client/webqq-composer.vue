<template>
  <div ref="composerLayoutRef" class="webqq-composer-layout-root">
    <form ref="composerFormRef" class="webqq-composer" :style="composerStyle" @submit.prevent="sendMessage">
      <span v-if="displayError" class="webqq-composer-error" role="alert">{{ displayError }}</span>
      <div v-if="model.replyingTo || mentions.length" class="webqq-composer-reply">
        <span>
          <template v-if="model.replyingTo">回复 {{ model.replyingTo.authorName }}：{{ model.replyingTo.content }}</template>
          <template v-if="model.replyingTo && mentions.length"> · </template>
          <template v-if="mentions.length">提及 {{ mentions.map(({ name }) => `@${name}`).join('、') }}</template>
        </span>
        <button type="button" aria-label="清除回复与提及" @click="clearComposerContext">
          <IconX :size="15" aria-hidden="true" />
        </button>
      </div>
      <div v-if="sendFiles.length" :class="['webqq-composer-attachments', { 'has-reply': model.replyingTo || mentions.length }]">
        <template v-for="file in sendFiles" :key="file.id">
          <span v-if="!file.previewUrl" class="webqq-composer-attachment-file">
            <IconFile :size="14" stroke-width="2" aria-hidden="true" />
            <span class="webqq-composer-attachment-name">
              <span class="webqq-composer-attachment-base">{{ file.baseName }}</span><span>{{ file.extension }}</span>
            </span>
            <button type="button" :aria-label="`移除 ${file.file.name}`" @click="removeSendFile(file.id)">
              <IconX :size="14" aria-hidden="true" />
            </button>
          </span>
          <span v-else class="webqq-composer-attachment-image">
            <button type="button" class="webqq-composer-attachment-preview" :aria-label="`预览 ${file.file.name}`" @click="previewImageUrl = file.previewUrl">
              <img :src="file.previewUrl" :alt="file.file.name">
            </button>
            <button type="button" class="webqq-composer-attachment-remove" :aria-label="`移除 ${file.file.name}`" @click="removeSendFile(file.id)">
              <IconX :size="12" aria-hidden="true" />
            </button>
          </span>
        </template>
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
          ref="inputRef"
          v-webqq-scrollbar="{ tone: 'accent' }"
          v-model="input"
          rows="1"
          placeholder="发送消息"
          :disabled="sending || !model.conversationId"
          @keydown.enter.exact.prevent="sendMessage"
          @paste="handleSendPaste"
        />
      </div>
      <input
        ref="mediaInputRef"
        class="sr-only"
        type="file"
        multiple
        accept="image/png,image/jpeg,image/gif,image/webp,audio/*,video/mp4,video/webm,video/quicktime,.txt,.csv,.json,.pdf,.zip,.doc,.docx,.xls,.xlsx,.ppt,.pptx"
        @change="handleSendFileSelect"
      >
      <button class="webqq-composer-action" type="button" aria-label="选择文件" :disabled="sending || !model.conversationId" @click="mediaInputRef?.click()">
        <IconPaperclip :size="19" stroke-width="2" aria-hidden="true" />
      </button>
      <button class="webqq-composer-action is-primary" type="submit" aria-label="发送" :disabled="sending || (!input.trim() && !mentions.length && !sendFiles.length) || !model.conversationId">
        <IconSend :size="19" stroke-width="2" aria-hidden="true" />
      </button>
    </form>
    <WebqqImagePreview v-if="previewImageUrl" :url="previewImageUrl" @close="previewImageUrl = ''" />
  </div>
</template>

<script setup lang="ts">
import { createLayout, type AutoLayout } from 'animejs'
import { IconEdit, IconFile, IconPaperclip, IconPlus, IconSend, IconTrash, IconX } from '@tabler/icons-vue'
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger } from './components/ui/context-menu'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './components/ui/tooltip'
import EnvironmentCreatePopover from './environment-create-popover.vue'
import WebqqAvatar from './webqq-avatar.vue'
import WebqqImagePreview from './webqq-image-preview.vue'
import { vWebqqScrollbar } from './webqq-scrollbar'
import { shouldRestoreComposerFocus } from './webqq/composer-focus'
import { addComposerMention, buildMentionContent, type ComposerMention } from './webqq/mention'
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
  replyingTo?: { id: string, authorName: string, content: string }
  mentionRequest?: ComposerMention & { requestId: number }
  accentColor: string
  externalError?: string
}

export interface WebqqComposerSendIntent {
  conversationId: string
  content: string
  replyToMessageId?: string
  media?: Array<{ fileName: string, mimeType: string, dataBase64: string }>
}

const props = defineProps<{ model: WebqqComposerModel }>()
const emit = defineEmits<{
  send: [input: WebqqComposerSendIntent, resolve: () => void, reject: (error: unknown) => void]
  selectOperator: [participantId: string, resolve: () => void, reject: (error: unknown) => void]
  manageEnvironment: [input: ManageSandboxEnvironmentInput, resolve: () => void, reject: (error: unknown) => void]
  editParticipant: [entity: { type: 'user' | 'bot', id: string }]
  deleteParticipant: [entity: { type: 'user' | 'bot', id: string }]
  clearReply: []
  spaceChange: [space: number]
}>()

type UserStackOverflowMotion = 'idle' | 'expanding' | 'collapsing'

// 与 onebot-webqq 一致的附件结构：图片带 objectURL 缩略图，文件名拆 baseName/extension 便于截断。
interface ComposerSendFile {
  id: string
  file: File
  previewUrl?: string
  baseName: string
  extension: string
}

const input = ref('')
const mentions = ref<ComposerMention[]>([])
const inputRef = ref<HTMLTextAreaElement>()
const mediaInputRef = ref<HTMLInputElement>()
const sendFiles = ref<ComposerSendFile[]>([])
const previewImageUrl = ref('')
const sending = ref(false)
const localError = ref('')
const composerLayoutRef = ref<HTMLElement>()
const composerFormRef = ref<HTMLFormElement>()
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
const composerInstanceId = Symbol('webqq-composer')
let activeComposerInstanceId: symbol | undefined = composerInstanceId

const displayError = computed(() => localError.value || props.model.externalError || '')
const compactUserStack = ref(false)
const orderedSenders = computed(() => orderUsersByActive(props.model.senders, props.model.currentOperatorId))
const userStackMetrics = computed(() => getUserStackMetrics(orderedSenders.value.length, compactUserStack.value))
const userStackLayoutMetrics = computed(() => getUserStackLayoutMetrics(orderedSenders.value.length, compactUserStack.value))
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

watch(() => props.model.mentionRequest?.requestId, () => {
  const mention = props.model.mentionRequest
  if (!mention) return
  mentions.value = addComposerMention(mentions.value, mention)
})

watch(() => props.model.conversationId, () => {
  mentions.value = []
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

function clearComposerContext() {
  mentions.value = []
  emit('clearReply')
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
    mentions.value = []
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

function getSendFileNameParts(name: string) {
  const dotIndex = name.lastIndexOf('.')
  if (dotIndex <= 0) return { baseName: name, extension: '' }
  return { baseName: name.slice(0, dotIndex), extension: name.slice(dotIndex) }
}

function addSendFiles(files: Iterable<File>) {
  for (const file of files) {
    // 服务端 MAX_MEDIA_SIZE 硬校验 10 MB，前端预检避免白传大文件后才报错。
    if (file.size > 10 * 1024 * 1024) {
      localError.value = '媒体大小不能超过 10 MB'
      continue
    }
    sendFiles.value.push({
      id: `${file.name}:${file.size}:${file.lastModified}:${sendFiles.value.length}`,
      file,
      previewUrl: file.type.startsWith('image/') ? URL.createObjectURL(file) : undefined,
      ...getSendFileNameParts(file.name),
    })
  }
}

function removeSendFile(id: string) {
  const file = sendFiles.value.find((file) => file.id === id)
  if (file?.previewUrl) URL.revokeObjectURL(file.previewUrl)
  sendFiles.value = sendFiles.value.filter((file) => file.id !== id)
}

function clearSendFiles() {
  for (const file of sendFiles.value) {
    if (file.previewUrl) URL.revokeObjectURL(file.previewUrl)
  }
  sendFiles.value = []
}

function handleSendFileSelect(event: Event) {
  const input = event.currentTarget as HTMLInputElement
  if (input.files) addSendFiles(input.files)
  input.value = ''
}

function handleSendPaste(event: ClipboardEvent) {
  const files = Array.from(event.clipboardData?.files ?? [])
  if (!files.length) return
  event.preventDefault()
  addSendFiles(files)
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

async function sendMessage() {
  const content = buildMentionContent(mentions.value, input.value)
  const { currentOperatorId, conversationId } = props.model
  if ((!content && !sendFiles.value.length) || !currentOperatorId || !conversationId || sending.value) return

  // 捕获发起时的会话、操作者和 textarea，避免异步完成后读到切换后的状态。
  const requestConversationId = conversationId
  const requestOperatorId = currentOperatorId
  const requestInput = inputRef.value

  sending.value = true
  localError.value = ''
  try {
    const media = sendFiles.value.length
      ? await Promise.all(sendFiles.value.map(async ({ file }) => ({
          fileName: file.name,
          mimeType: file.type,
          dataBase64: await readFileBase64(file),
        })))
      : undefined
    await new Promise<void>((resolve, reject) => emit('send', {
      conversationId,
      content,
      replyToMessageId: props.model.replyingTo?.id,
      media,
    }, resolve, reject))
    input.value = ''
    mentions.value = []
    clearSendFiles()
    emit('clearReply')
  } catch (error) {
    localError.value = error instanceof Error ? error.message : '发送失败'
  } finally {
    sending.value = false
    // 等 disabled 解除后再 focus，否则浏览器会忽略对 disabled 控件的焦点请求。
    await nextTick()
    // 始终使用发送开始时捕获的原节点；当前 ref 即使指向新节点，也不能代替旧 composer 恢复焦点。
    if (shouldRestoreComposerFocus({
      requestConversationId,
      requestOperatorId,
      requestComposerId: composerInstanceId,
      activeConversationId: props.model.conversationId,
      activeOperatorId: props.model.currentOperatorId,
      activeComposerId: activeComposerInstanceId,
      inputElement: requestInput,
    })) {
      requestInput?.focus()
    }
  }
}

// 胶囊内 padding(8) + 三个 gap(12) + 附件按钮(32) + 发送按钮(36)。
const COMPOSER_FIXED_WIDTH = 88
// 输入区可压缩到 0（min-width: 0），低于这个宽度就该省略头像而不是压扁输入框。
const COMPOSER_MIN_INPUT_WIDTH = 100

// 极限窄屏：胶囊被 max-width 钳住后头像堆叠（flex: none）会把附件、发送图标挤出胶囊背景，
// 宽度不足时折叠态只留当前操作者 + "+N" 省略。判定阈值恒按完整（非 compact）堆叠宽度计算，
// 且胶囊内联宽度（460 + 堆叠附加宽）恒大于该阈值，因此 compact 与否不影响判定结果，无反馈循环。
function updateCompactUserStack(form: HTMLElement) {
  const fullWidth = getUserStackLayoutMetrics(orderedSenders.value.length).collapsedWidth
  compactUserStack.value = form.clientWidth < fullWidth + COMPOSER_FIXED_WIDTH + COMPOSER_MIN_INPUT_WIDTH
}

// 回复/附件浮条挂在输入胶囊上方、多行输入会撑高胶囊，消息区底部留白必须跟随实际高度，
// 否则窄屏或浮条出现时最后几条消息会被输入区盖住。
let composerSpaceObserver: ResizeObserver | undefined
function updateComposerSpace() {
  const form = composerFormRef.value
  if (!form) return
  updateCompactUserStack(form)
  const formHeight = Math.ceil(form.getBoundingClientRect().height)
  const overlays = form.querySelectorAll('.webqq-composer-reply, .webqq-composer-attachments')
  let overlayHeight = 0
  overlays.forEach((overlay) => {
    overlayHeight += Math.ceil(overlay.getBoundingClientRect().height) + 8
  })
  // 常量 28 = 胶囊底部偏移 20px + 置底时末条消息与输入区的可视间隙 8px，与 onebot-webqq 一致；
  // 浮条自身的 8px 间隔已在上面按条累加，这里不再重复计入。
  emit('spaceChange', formHeight + overlayHeight + 28)
}

watch(composerFormRef, (form) => {
  composerSpaceObserver?.disconnect()
  if (!form) return
  composerSpaceObserver = new ResizeObserver(() => updateComposerSpace())
  composerSpaceObserver.observe(form)
  updateComposerSpace()
}, { immediate: true })

watch([() => props.model.replyingTo?.id, () => mentions.value.length, () => sendFiles.value.length], () => {
  void nextTick(() => updateComposerSpace())
})

// 人数变化会改变 compact 阈值，但胶囊被 max-width 钳住时宽度不变、ResizeObserver 不触发，需主动重判。
watch(() => orderedSenders.value.length, () => {
  if (composerFormRef.value) updateCompactUserStack(composerFormRef.value)
})

onBeforeUnmount(() => {
  // 请求可能晚于组件卸载完成；先使实例令牌失效，finally 就不会触碰旧 textarea。
  activeComposerInstanceId = undefined
  clearSendFiles()
  composerSpaceObserver?.disconnect()
  userStackLayout?.revert()
  if (suppressUserStackCollapseTimer) clearTimeout(suppressUserStackCollapseTimer)
  if (userStackOverflowMotionTimer) clearTimeout(userStackOverflowMotionTimer)
})
</script>
