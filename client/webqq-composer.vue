<template>
  <div ref="composerLayoutRef" class="webqq-composer-layout-root">
    <form ref="composerFormRef" class="webqq-composer" :style="composerStyle" @submit.prevent="sendController.submit()">
      <span v-if="displayError" class="webqq-composer-error" role="alert">{{ displayError }}</span>
      <div
        v-if="model.replyingTo || sendFiles.length"
        ref="composerContextRef"
        class="webqq-composer-context"
      >
        <div v-if="model.replyingTo" class="webqq-composer-reply">
          <span>回复 {{ model.replyingTo.authorName }}：{{ model.replyingTo.content }}</span>
          <button type="button" aria-label="清除回复" @click="clearComposerContext">
            <IconX :size="15" aria-hidden="true" />
          </button>
        </div>
        <template v-for="file in sendFiles" :key="file.id">
          <span v-if="!file.previewUrl" class="webqq-composer-attachment-file">
            <IconFile :size="14" stroke-width="2" aria-hidden="true" />
            <span class="webqq-composer-attachment-name">
              <span class="webqq-composer-attachment-base">{{ file.baseName }}</span><span>{{ file.extension }}</span>
            </span>
            <button type="button" :aria-label="`移除 ${file.file.name}`" @click="attachments.remove(file.id)">
              <IconX :size="14" aria-hidden="true" />
            </button>
          </span>
          <span v-else class="webqq-composer-attachment-image">
            <button type="button" class="webqq-composer-attachment-preview" :aria-label="`预览 ${file.file.name}`" @click="previewImageUrl = file.previewUrl">
              <img :src="file.previewUrl" :alt="file.file.name">
            </button>
            <button type="button" class="webqq-composer-attachment-remove" :aria-label="`移除 ${file.file.name}`" @click="attachments.remove(file.id)">
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
                      'is-overlapped': index > 0,
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
                          <WebqqMenuExtensionMark />
                        </ContextMenuItem>
                        <ContextMenuItem class="text-red-600 focus:bg-red-50 focus:text-red-700 dark:focus:bg-red-950/40" @select="emit('deleteParticipant', { type: sender.type, id: sender.id })">
                          <IconTrash :size="16" aria-hidden="true" /> 删除{{ sender.type === 'bot' ? '机器人' : '用户' }}
                          <WebqqMenuExtensionMark />
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
              :color-mode="model.colorMode"
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
        <label class="sr-only" for="chatluna-sandbox-input">消息内容</label>
        <span v-if="isDraftEmpty" class="webqq-composer-placeholder" aria-hidden="true">发送消息</span>
        <div
          id="chatluna-sandbox-input"
          ref="inputRef"
          v-webqq-scrollbar="{ tone: 'accent' }"
          class="webqq-composer-editor"
          role="textbox"
          aria-multiline="true"
          :aria-label="'消息内容'"
          :aria-disabled="sending || !model.conversationId ? 'true' : undefined"
          :contenteditable="sending || !model.conversationId ? 'false' : 'true'"
          data-placeholder="发送消息"
          :data-empty="isDraftEmpty ? 'true' : undefined"
          @keydown="handleEditorKeydown"
          @input="draftHost.handleInput()"
          @compositionstart="draftHost.startComposition()"
          @compositionend="draftHost.endComposition()"
          @paste="handleSendPaste"
          @mouseup="draftHost.syncCaretFromHost()"
          @keyup="draftHost.syncCaretFromHost()"
        />
        <WebqqMentionMenu
          v-if="mentionMenuOpen"
          class="chatluna-sandbox-composer-mention-menu"
          :candidates="filteredMentionCandidates"
          :active-index="mentionMenuIndex"
          aria-label="提及成员"
          @select="draftHost.selectMentionCandidate"
          @hover="draftHost.setMentionSelection"
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
      <button class="webqq-composer-action is-primary" type="submit" aria-label="发送" :disabled="sending || (isDraftEmpty && !sendFiles.length) || !model.conversationId">
        <IconSend :size="19" stroke-width="2" aria-hidden="true" />
      </button>
    </form>
    <WebqqImagePreview v-if="previewImageUrl" :url="previewImageUrl" @close="previewImageUrl = ''" />
  </div>
</template>

<script setup lang="ts">
import { createLayout, type AutoLayout } from 'animejs'
import { IconEdit, IconFile, IconPaperclip, IconPlus, IconSend, IconTrash, IconX } from '@tabler/icons-vue'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger } from '#client/components/ui/context-menu'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '#client/components/ui/tooltip'
import EnvironmentCreatePopover from './environment-create-popover.vue'
import WebqqAvatar from './webqq-avatar.vue'
import WebqqImagePreview from './webqq-image-preview.vue'
import WebqqMentionMenu from './webqq-mention-menu.vue'
import WebqqMenuExtensionMark from './webqq-menu-extension-mark.vue'
import { vWebqqScrollbar } from './webqq-scrollbar'
import type { MentionCandidate } from '#client/webqq/composer-draft'
import { createComposerAttachments } from '#client/webqq/composer-attachments'
import {
  createComposerDraftHost,
  type ComposerHostCaretReading,
  type ComposerHostCaretTarget,
  type ComposerHostNodePlan,
  type ComposerHostNodeReading,
} from '#client/webqq/composer-draft-host'
import { shouldRestoreComposerFocus } from '#client/webqq/composer-focus'
import { createComposerSendController } from '#client/webqq/composer-send'
import {
  getUserStackLayoutMetrics,
  getUserStackMetrics,
  orderUsersByActive,
  USER_AVATAR_SIZE,
  USER_STACK_COLLAPSED_STEP,
  USER_STACK_EXPANDED_STEP,
} from '#client/webqq/user-stack'
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
  mentionRequest?: { id: string, name: string, requestId: number }
  mentionCandidates?: MentionCandidate[]
  accentColor: string
  colorMode: 'light' | 'dark'
  externalError?: string
}

export interface WebqqComposerSendIntent {
  conversationId: string
  content: string
  replyToMessageId?: string
  media?: Array<{ fileName: string, mimeType: string, dataBase64: string }>
}

const props = defineProps<{ model: WebqqComposerModel; preview?: boolean }>()
const preview = computed(() => !!props.preview)
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

const inputRef = ref<HTMLElement>()
const mediaInputRef = ref<HTMLInputElement>()
const previewImageUrl = ref('')
const composerLayoutRef = ref<HTMLElement>()
const composerFormRef = ref<HTMLFormElement>()
const composerContextRef = ref<HTMLElement>()
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

/**
 * 草稿宿主的注入点。这里只做 DOM 映射：把编辑器子节点与 Selection 换成朴素结构读数，
 * 再把节点计划与光标落点写回去。所有判定与时序都在 `composer-draft-host` 里（ADR 0075）。
 */
function readEditorNodes(): ComposerHostNodeReading[] | undefined {
  const editor = inputRef.value
  if (!editor) return undefined
  const map = (node: Node): ComposerHostNodeReading => {
    if (node.nodeType === Node.TEXT_NODE) return { kind: 'text', text: node.textContent ?? '' }
    if (!(node instanceof HTMLElement)) return { kind: 'container', children: [] }
    if (node.dataset.mentionId) {
      return {
        kind: 'mention',
        id: node.dataset.mentionId,
        name: node.dataset.mentionName || node.textContent?.replace(/^@/, '') || node.dataset.mentionId,
      }
    }
    if (node.tagName === 'BR') return { kind: 'line-break' }
    return { kind: 'container', children: Array.from(node.childNodes).map(map) }
  }
  return Array.from(editor.childNodes).map(map)
}

function renderEditorNodes(plan: readonly ComposerHostNodePlan[]) {
  const editor = inputRef.value
  if (!editor) return
  editor.replaceChildren()
  for (const node of plan) {
    if (node.kind === 'text') {
      editor.appendChild(document.createTextNode(node.text))
      continue
    }
    const chip = document.createElement('span')
    chip.className = 'chatluna-sandbox-composer-mention'
    chip.contentEditable = 'false'
    chip.dataset.mentionId = node.id
    chip.dataset.mentionName = node.name
    chip.textContent = `@${node.name}`
    editor.appendChild(chip)
  }
}

/** 子节点序号只数 token 节点（文本与提及芯片），与草稿 token 一一对应。 */
function isTokenNode(node: Node) {
  return node.nodeType === Node.TEXT_NODE || (node instanceof HTMLElement && !!node.dataset.mentionId)
}

function readEditorCaret(): ComposerHostCaretReading | undefined {
  const editor = inputRef.value
  const selection = window.getSelection()
  if (!editor || !selection || selection.rangeCount === 0) return undefined
  const range = selection.getRangeAt(0)
  if (!editor.contains(range.startContainer)) return undefined
  if (range.startContainer === editor) return { kind: 'editor', childOffset: range.startOffset }

  let childIndex = 0
  for (const child of Array.from(editor.childNodes)) {
    if (child === range.startContainer || child.contains(range.startContainer)) {
      return { kind: 'child', childIndex, offset: range.startOffset }
    }
    if (isTokenNode(child)) childIndex += 1
  }
  return { kind: 'editor', childOffset: editor.childNodes.length }
}

function writeEditorCaret(target: ComposerHostCaretTarget) {
  const editor = inputRef.value
  const selection = window.getSelection()
  if (!editor || !selection) return
  let node: Node = editor
  let offset = editor.childNodes.length
  if (target.kind === 'child') {
    const child = editor.childNodes[target.childIndex]
    if (child) {
      node = child
      // 空文本 token 在宿主里是一个零宽字符节点，长度是 1 而不是 0；上限只有这里知道。
      offset = Math.min(target.offset, child.textContent?.length ?? 0)
    }
  }

  const range = document.createRange()
  try {
    range.setStart(node, offset)
    range.collapse(true)
    selection.removeAllRanges()
    selection.addRange(range)
  } catch {
    // 某些浏览器在节点刚替换时可能拒绝 setStart；忽略即可，下次输入会重新同步。
  }
}

const draftHost = createComposerDraftHost({
  readNodes: readEditorNodes,
  renderNodes: renderEditorNodes,
  readCaret: readEditorCaret,
  writeCaret: writeEditorCaret,
  nextTick: () => nextTick(),
  focus: () => inputRef.value?.focus(),
  readMentionCandidates: () => props.model.mentionCandidates ?? [],
})
const isDraftEmpty = draftHost.isEmpty
const mentionMenuOpen = draftHost.mentionMenuOpen
const filteredMentionCandidates = draftHost.mentionCandidates
const mentionMenuIndex = draftHost.mentionMenuIndex

/**
 * 附件采集的注入点。只做宿主动作：临时预览地址与 `FileReader`。
 *
 * 读到的 data URL 交给模块去取逗号之后的内容——读不出前缀时报错的口径在那里有断言。
 */
const attachments = createComposerAttachments<File>({
  createObjectUrl: (file) => URL.createObjectURL(file),
  revokeObjectUrl: (url) => URL.revokeObjectURL(url),
  readDataUrl: (file) => new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.addEventListener('load', () => resolve(typeof reader.result === 'string' ? reader.result : ''))
    reader.addEventListener('error', () => reject(reader.error ?? new Error('无法读取媒体内容')))
    reader.readAsDataURL(file)
  }),
})
const sendFiles = attachments.attachments

/**
 * 发送编排的注入点。锁、错误文案与动作顺序都在 `composer-send` 里；
 * 焦点该不该还回去仍由 `composer-focus` 判定，这里只把发起那一刻的读数交给它。
 */
const sendController = createComposerSendController({
  readRequest: () => ({
    content: draftHost.serialize(),
    attachmentCount: sendFiles.value.length,
    conversationId: props.model.conversationId,
    operatorId: props.model.currentOperatorId,
    replyToMessageId: props.model.replyingTo?.id,
    composing: draftHost.composing.value,
  }),
  closeMentionMenu: () => draftHost.closeMentionMenu(),
  captureFocus: ({ conversationId, operatorId }) => {
    // 始终使用发送开始时捕获的原节点；当前 ref 即使指向新节点，也不能代替旧 composer 恢复焦点。
    const requestInput = inputRef.value
    return {
      shouldRestore: () => shouldRestoreComposerFocus({
        requestConversationId: conversationId,
        requestOperatorId: operatorId,
        requestComposerId: composerInstanceId,
        activeConversationId: props.model.conversationId,
        activeOperatorId: props.model.currentOperatorId,
        activeComposerId: activeComposerInstanceId,
        inputElement: requestInput,
      }),
      restore: () => requestInput?.focus(),
    }
  },
  readMedia: () => attachments.readMedia(),
  deliver: (intent) => new Promise<void>((resolve, reject) => emit('send', {
    conversationId: intent.conversationId,
    content: intent.content,
    replyToMessageId: intent.replyToMessageId,
    media: intent.media,
  }, resolve, reject)),
  clearDraft: () => draftHost.reset(),
  clearAttachments: () => attachments.clear(),
  clearReply: () => emit('clearReply'),
  nextTick: () => nextTick(),
})
const sending = sendController.sending
const localError = sendController.error

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
  draftHost.insertMention({ id: mention.id, name: mention.name })
})

watch(() => props.model.conversationId, () => {
  draftHost.reset()
})

watch(hasUserStackOverflow, (hasOverflow) => {
  if (!hasOverflow) userStackExpanded.value = false
})

onMounted(() => {
  if (preview.value) return
  draftHost.render()
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
  emit('clearReply')
}

/**
 * 按键分流全部交给草稿宿主：菜单相关的动作由它就地执行，返回值同时回答「这次按键有没有被
 * 候选菜单消费」。组件只按返回值决定要不要阻止宿主的默认行为，以及要不要走发送。
 */
function handleEditorKeydown(event: KeyboardEvent) {
  const action = draftHost.routeKey({
    key: event.key,
    shiftKey: event.shiftKey,
    disabled: sending.value || !props.model.conversationId,
  })
  if (action.kind !== 'none') event.preventDefault()
  if (action.kind === 'submit') void sendController.submit()
}

async function selectComposerUser(sender: WebqqComposerSender) {
  if (sender.id === props.model.currentOperatorId) return
  suppressUserStackCollapse = true
  if (suppressUserStackCollapseTimer) clearTimeout(suppressUserStackCollapseTimer)
  await waitForUserStackTransition()
  const layout = recordUserStackLayout()
  try {
    await new Promise<void>((resolve, reject) => emit('selectOperator', sender.id, resolve, reject))
    draftHost.reset()
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

function handleSendFileSelect(event: Event) {
  const input = event.currentTarget as HTMLInputElement
  if (input.files) reportAttachmentError(attachments.add(input.files))
  input.value = ''
}

function handleSendPaste(event: ClipboardEvent) {
  const result = attachments.addFromPaste(event.clipboardData?.files ?? [])
  if (!result.consumed) return
  event.preventDefault()
  reportAttachmentError(result)
}

function reportAttachmentError(result: { error: string }) {
  if (result.error) localError.value = result.error
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

// 回复与附件共用一个浮动包络；消息区底部留白按包络真实高度计算，不能分别累加同一行中的子项。
let composerSpaceObserver: ResizeObserver | undefined
function updateComposerSpace() {
  const form = composerFormRef.value
  if (!form) return
  updateCompactUserStack(form)
  const formHeight = Math.ceil(form.getBoundingClientRect().height)
  const context = composerContextRef.value
  const overlayHeight = context ? Math.ceil(context.getBoundingClientRect().height) + 8 : 0
  // 常量 28 = 胶囊底部偏移 20px + 置底时末条消息与输入区的可视间隙 8px，与 onebot-webqq 一致；
  // 上下文包络与胶囊之间的 8px 间隔已计入 overlayHeight，这里不再重复计入。
  emit('spaceChange', formHeight + overlayHeight + 28)
}

function bindComposerSpaceObserver() {
  composerSpaceObserver?.disconnect()
  if (preview.value) return
  const form = composerFormRef.value
  if (!form) return
  composerSpaceObserver = new ResizeObserver(() => updateComposerSpace())
  composerSpaceObserver.observe(form)
  const context = composerContextRef.value
  if (context) composerSpaceObserver.observe(context)
  updateComposerSpace()
}

watch(composerFormRef, () => {
  bindComposerSpaceObserver()
}, { immediate: true })

watch([() => props.model.replyingTo?.id, () => sendFiles.value.length], () => {
  // context 会随回复和附件挂载或卸载；等待 DOM 更新后重绑，才能观察换行造成的真实高度变化。
  void nextTick(() => bindComposerSpaceObserver())
})

// 人数变化会改变 compact 阈值，但胶囊被 max-width 钳住时宽度不变、ResizeObserver 不触发，需主动重判。
watch(() => orderedSenders.value.length, () => {
  if (composerFormRef.value) updateCompactUserStack(composerFormRef.value)
})

onBeforeUnmount(() => {
  // 请求可能晚于组件卸载完成；先使实例令牌失效，finally 就不会触碰旧输入控件。
  activeComposerInstanceId = undefined
  attachments.clear()
  composerSpaceObserver?.disconnect()
  userStackLayout?.revert()
  if (suppressUserStackCollapseTimer) clearTimeout(suppressUserStackCollapseTimer)
  if (userStackOverflowMotionTimer) clearTimeout(userStackOverflowMotionTimer)
})
</script>
