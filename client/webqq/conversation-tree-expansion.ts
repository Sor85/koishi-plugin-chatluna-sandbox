import { ref } from 'vue'
import type { ConversationTreeNode } from './conversation-tree'

/**
 * 侧栏会话树的展开态：哪几行会话展开着，以及「选中一个会话实例时展开它所属那一行」这条规则。
 *
 * 形态是反应式 module 而不是组件里的一个 ref 加一个 watcher，先例是 `composer-draft.ts`、
 * `scroll-restore.ts` 与 `evidence-navigation.ts`（ADR-0065）：有状态但与 DOM 无关的行为住在
 * module 里，因此展开、收起与自动补齐三条行为各自可以在没有组件的环境里驱动。
 *
 * 展开态是侧栏本地状态：不进工作区状态、不持久化，刷新后回到全部收起。它与选中哪个会话不是
 * 同一件事，本 module 因此不持有也不改变选中——折叠一行不改变选中。
 */
export function createConversationTreeExpansion() {
  const expandedConversationIds = ref<Record<string, true>>({})
  /**
   * 上一次补齐时的选中会话。补齐只在选中真的变化时发生：否则用户手动收起父行后，下一次
   * 重新求值就会把它强行展开回去，而「之后仍可手动收起」正是这条规则写进展开态而不是叠加
   * 进判定条件的理由。
   */
  let revealedConversationId: string | undefined

  function isConversationExpanded(conversationId: string): boolean {
    return !!expandedConversationIds.value[conversationId]
  }

  function toggleConversationExpanded(conversationId: string): void {
    expandedConversationIds.value = isConversationExpanded(conversationId)
      ? Object.fromEntries(Object.entries(expandedConversationIds.value).filter(([id]) => id !== conversationId))
      : { ...expandedConversationIds.value, [conversationId]: true }
  }

  /**
   * 按当前选中的会话补齐展开态。选中一个会话实例时展开它所属的那一行：新建与分叉完成后新实例
   * 会被自动选中，父行还收着的话侧栏一行都不会高亮，用户会以为什么都没选中。
   *
   * 选中根会话、选中不在树里的会话、以及没有选中任何会话时，展开态一律不动。
   */
  function revealConversation(
    conversationId: string | undefined,
    tree: readonly ConversationTreeNode[],
  ): void {
    if (conversationId === revealedConversationId) return
    revealedConversationId = conversationId
    if (!conversationId) return
    const parent = tree.find(({ children }) => children.some(({ id }) => id === conversationId))
    if (parent && !isConversationExpanded(parent.id)) toggleConversationExpanded(parent.id)
  }

  return { isConversationExpanded, toggleConversationExpanded, revealConversation }
}
