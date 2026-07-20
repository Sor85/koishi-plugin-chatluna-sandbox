<template>
  <k-layout main="onebot-sandbox-page">
    <k-content>
      <main class="mx-auto flex h-full max-w-4xl flex-col gap-4 p-4 sm:p-6">
        <header class="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p class="text-sm font-medium text-blue-600">模拟 QQ 环境</p>
          <h1 class="mt-1 text-2xl font-semibold text-slate-900">OneBot Sandbox</h1>
          <p class="mt-2 text-sm text-slate-500">
            当前用户：{{ currentUser?.name }} · 当前机器人：{{ currentBot?.name }}
          </p>
        </header>

        <section class="min-h-0 flex-1 overflow-y-auto rounded-2xl border border-slate-200 bg-slate-50 p-4 shadow-sm">
          <p v-if="!messages.length" class="py-10 text-center text-sm text-slate-400">
            发送一条消息，验证插件回复
          </p>
          <ol v-else class="space-y-3" aria-label="消息记录">
            <li
              v-for="message in messages"
              :key="message.id"
              class="flex"
              :class="message.authorId === currentUser?.id ? 'justify-end' : 'justify-start'"
            >
              <div
                class="max-w-[80%] rounded-2xl px-4 py-2 text-sm leading-6 shadow-sm"
                :class="message.authorId === currentUser?.id
                  ? 'rounded-br-md bg-blue-600 text-white'
                  : 'rounded-bl-md border border-slate-200 bg-white text-slate-800'"
              >
                {{ message.content }}
              </div>
            </li>
          </ol>
        </section>

        <form class="flex gap-2" @submit.prevent="sendMessage">
          <label class="sr-only" for="onebot-sandbox-input">消息内容</label>
          <input
            id="onebot-sandbox-input"
            v-model="input"
            class="min-w-0 flex-1 rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            placeholder="输入消息"
            autocomplete="off"
            :disabled="sending"
          >
          <button
            type="submit"
            class="rounded-xl bg-blue-600 px-5 py-3 text-sm font-medium text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            :disabled="sending || !input.trim()"
          >
            {{ sending ? '发送中' : '发送' }}
          </button>
        </form>
      </main>
    </k-content>
  </k-layout>
</template>

<script setup lang="ts">
import { send } from '@koishijs/client'
import { computed, onMounted, ref } from 'vue'
import type { SandboxSnapshot } from '../src/types'

const snapshot = ref<SandboxSnapshot>({
  revision: 0,
  users: [],
  bots: [],
  conversations: [],
  messages: [],
})
const input = ref('')
const sending = ref(false)

const currentUser = computed(() => snapshot.value.users[0])
const currentBot = computed(() => snapshot.value.bots[0])
const currentConversation = computed(() => snapshot.value.conversations[0])
const messages = computed(() => snapshot.value.messages)

onMounted(async () => {
  snapshot.value = await send('onebot-sandbox/snapshot')
})

async function sendMessage() {
  const content = input.value.trim()
  const user = currentUser.value
  const bot = currentBot.value
  const conversation = currentConversation.value
  if (!content || !user || !bot || !conversation) return

  sending.value = true
  try {
    snapshot.value = await send('onebot-sandbox/send-message', {
      actorUserId: user.id,
      botId: bot.id,
      conversationId: conversation.id,
      content,
    })
    input.value = ''
  } finally {
    sending.value = false
  }
}
</script>
