<template>
  <k-layout container="onebot-sandbox-layout" main="onebot-sandbox-page">
    <k-content>
      <div
        class="webqq-workspace"
        :class="{
          'is-frosted': appearance.enableWebQQFrostedGlass,
          'has-tim-tail': appearance.webQQTimBubbleTail,
          'is-details-open': detailsVisible && isWebqqView,
          'is-details-closed': !detailsVisible || !isWebqqView,
          'is-standalone-view': !isWebqqView,
        }"
        :data-chat-style="appearance.webQQChatStyle"
        :data-color-mode="resolvedColorMode"
        :data-mobile-view="currentView"
        :style="{ '--webqq-accent': appearance.webQQAccentColor }"
      >
        <WebqqSidebar
          :model="sidebarModel"
          @select-view="selectNavigation"
          @select-conversation="selectConversation"
          @manage-environment="manageEnvironment"
          @friend-action="performFriendAction"
          @group-action="performGroupAction"
          @handle-notification="handleSidebarNotification"
          @open-entity-dialog="openEntityDialog"
          @open-group-action-dialog="openGroupActionDialog"
          @open-remark-dialog="openRemarkDialog"
        />

        <AiTestSpaceOverview
          v-if="currentView === 'spaces'"
          :spaces="testSpaces"
          :main-snapshot="mainSnapshot"
          @enter="enterTestSpace"
          @create="createTestSpace"
          @action="handleTestSpaceAction"
        />
        <main v-else-if="currentView === 'profile'" class="webqq-chat is-environment">
          <EnvironmentManager :snapshot="environmentModel" />
        </main>
        <OneBotDebugWorkspace
          v-else-if="currentView === 'debug'"
          :records="debugWorkspaceModel.records"
          :bots="debugWorkspaceModel.bots"
          :loading="debugWorkspaceModel.loading"
          :error="debugWorkspaceModel.error"
          @query="loadOneBotDebugRecords"
          @clear="clearOneBotDebugRecords"
        />
        <WebqqChatPane
          v-else
          :model="chatPaneModel"
          @back="selectNavigation('contacts')"
          @toggle-details="toggleDetails"
          @send="sendComposerMessage"
          @select-operator="selectComposerOperator"
          @manage-environment="manageEnvironment"
          @edit-participant="openComposerParticipantDialog('edit', $event)"
          @delete-participant="openComposerParticipantDialog('delete', $event)"
          @load-history="loadEarlierMessages"
          @recall-message="recallMessage"
          @request-friend="requestFriend"
          @poke-friend="pokeFriend"
          @set-remark="openRemarkDialog"
          @delete-friend="deleteFriend"
          @poke-group-member="pokeGroupMember"
          @set-group-card="openGroupActionDialog('card', $event)"
          @set-group-admin="setGroupAdmin"
          @transfer-group-owner="transferGroupOwner"
          @kick-group-member="kickGroupMember"
        />

        <WebqqDetailsPanel
          v-if="isWebqqView"
          :model="detailsPanelModel"
          @close="closeDetails"
          @publish-announcement="publishAnnouncement"
          @delete-announcement="deleteAnnouncement"
          @poke-group-member="pokeGroupMember"
          @set-group-card="openGroupActionDialog('card', $event)"
          @set-group-admin="setGroupAdmin"
          @transfer-group-owner="transferGroupOwner"
          @kick-group-member="kickGroupMember"
        />
        <WorkspaceOverlayHost
          ref="overlayHostRef"
          :users="overlayModel.users"
          :bots="overlayModel.bots"
          :groups="overlayModel.groups"
          :accent-color="overlayModel.accentColor"
          @manage-environment="manageEnvironment"
          @save-remark="saveFriendRemark"
          @save-group-action="saveGroupAction"
        />
        <AgentObserveOverlay
          v-if="observingSpace"
          :space-name="observingSpace.name"
          @take-over="handleTestSpaceAction('take-over', observingSpace.id)"
          @terminate="handleTestSpaceAction('terminate', observingSpace.id)"
        />
      </div>
    </k-content>
  </k-layout>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'
import AgentObserveOverlay from './agent-observe-overlay.vue'
import AiTestSpaceOverview from './ai-test-space-overview.vue'
import EnvironmentManager from './environment-manager.vue'
import OneBotDebugWorkspace from './onebot-debug-workspace.vue'
import WebqqChatPane from './webqq-chat-pane.vue'
import WebqqDetailsPanel from './webqq-details-panel.vue'
import WebqqSidebar from './webqq-sidebar.vue'
import WorkspaceOverlayHost from './workspace-overlay-host.vue'
import { useResolvedColorMode } from './webqq/color-scheme'
import { createKoishiWorkspacePort } from './webqq/koishi-workspace-port'
import { createSceneMutationSync } from './webqq/scene-sync'
import { createWorkspaceController } from './webqq/workspace-controller'
import { createWorkspaceLayout } from './webqq/workspace-layout'
import { createWebqqWorkspaceShell } from './webqq/workspace-shell'
import { createAiTestSpaceShell } from './webqq/test-space-shell'

const activeSpaceId = ref<string>()
const workspaceController = createWorkspaceController(createKoishiWorkspacePort(() => activeSpaceId.value), window.localStorage)
const workspaceLayout = createWorkspaceLayout()
const overlayHostRef = ref<InstanceType<typeof WorkspaceOverlayHost>>()
const {
  appearance,
  chatPaneModel,
  clearOneBotDebugRecords,
  closeDetails,
  currentView,
  deleteAnnouncement,
  deleteFriend,
  detailsPanelModel,
  detailsVisible,
  debugWorkspaceModel,
  environmentModel,
  handleSidebarNotification,
  kickGroupMember,
  loadEarlierMessages,
  loadOneBotDebugRecords,
  manageEnvironment,
  openComposerParticipantDialog,
  openEntityDialog,
  openGroupActionDialog,
  openRemarkDialog,
  overlayModel,
  performFriendAction,
  performGroupAction,
  pokeFriend,
  pokeGroupMember,
  publishAnnouncement,
  recallMessage,
  requestFriend,
  saveFriendRemark,
  saveGroupAction,
  selectComposerOperator,
  selectConversation,
  selectNavigation: selectWorkspaceNavigation,
  sendComposerMessage,
  setGroupAdmin,
  sidebarModel,
  toggleDetails,
  transferGroupOwner,
} = createWebqqWorkspaceShell(workspaceController, workspaceLayout, () => overlayHostRef.value)

const { createTestSpace, enterTestSpace, handleTestSpaceAction, mainSnapshot, selectNavigation, testSpaces } = createAiTestSpaceShell(
  workspaceController,
  activeSpaceId,
  currentView,
  selectWorkspaceNavigation,
)
const isWebqqView = computed(() => currentView.value === 'messages' || currentView.value === 'contacts')
const resolvedColorMode = useResolvedColorMode(appearance)
const disposeSceneMutationSync = createSceneMutationSync(workspaceController, () => activeSpaceId.value)
onBeforeUnmount(disposeSceneMutationSync)
// 正在观察一个仍由 AI 控制的测试空间时，叠加 ego 式被控覆盖层（发光边缘 + 控制条 + agent 光标）。
const observingSpace = computed(() => isWebqqView.value
  ? testSpaces.value.find((space) => space.id === activeSpaceId.value && space.status === 'running')
  : undefined)
</script>
