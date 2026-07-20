import type { SandboxUser } from '../src/types'

export const USER_AVATAR_SIZE = 36
export const USER_STACK_COLLAPSED_STEP = 21
export const USER_STACK_EXPANDED_STEP = 27

export interface UserStackMetrics {
  collapsedVisibleCount: number
  overflowCount: number
  collapsedWidth: number
  expandedWidth: number
}

export interface UserStackLayoutMetrics {
  collapsedWidth: number
  expandedWidth: number
  addCollapsedRight: number
  addExpandedRight: number
}

export function orderUsersByActive(users: SandboxUser[], activeUserId?: string): SandboxUser[] {
  const activeIndex = users.findIndex(({ id }) => id === activeUserId)
  return activeIndex > 0
    ? [users[activeIndex], ...users.slice(0, activeIndex), ...users.slice(activeIndex + 1)]
    : users
}

export function getUserStackMetrics(userCount: number): UserStackMetrics {
  const collapsedVisibleCount = Math.min(userCount, 3)
  const overflowCount = Math.max(0, userCount - collapsedVisibleCount)
  return {
    collapsedVisibleCount,
    overflowCount,
    collapsedWidth: USER_AVATAR_SIZE
      + Math.max(0, collapsedVisibleCount - 1) * USER_STACK_COLLAPSED_STEP
      + (overflowCount ? USER_STACK_COLLAPSED_STEP : 0),
    expandedWidth: USER_AVATAR_SIZE + Math.max(0, userCount - 1) * USER_STACK_EXPANDED_STEP,
  }
}

export function getUserStackLayoutMetrics(userCount: number): UserStackLayoutMetrics {
  const metrics = getUserStackMetrics(userCount)
  const addCollapsedRight = metrics.overflowCount
    ? metrics.collapsedWidth - USER_AVATAR_SIZE
    : userCount * USER_STACK_COLLAPSED_STEP
  const addExpandedRight = userCount * USER_STACK_EXPANDED_STEP
  return {
    collapsedWidth: metrics.overflowCount ? metrics.collapsedWidth : USER_AVATAR_SIZE + addCollapsedRight,
    expandedWidth: USER_AVATAR_SIZE + addExpandedRight,
    addCollapsedRight,
    addExpandedRight,
  }
}
