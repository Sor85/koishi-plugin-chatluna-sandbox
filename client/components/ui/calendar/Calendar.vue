<script lang="ts" setup>
import type { CalendarRootEmits, CalendarRootProps, DateValue } from "reka-ui"
import type { HTMLAttributes, Ref } from "vue"
import type { LayoutTypes } from "."
import { getLocalTimeZone, today } from "@internationalized/date"
import { createReusableTemplate, reactiveOmit, useVModel } from "@vueuse/core"
import { CalendarRoot, useDateFormatter, useForwardPropsEmits } from "reka-ui"
import { createYear, createYearRange, toDate } from "reka-ui/date"
import { computed, ref, toRaw } from "vue"
import { cn } from "../../../lib/utils"
import { Select, SelectContent, SelectItem, SelectTrigger } from '../select'
import { CalendarCell, CalendarCellTrigger, CalendarGrid, CalendarGridBody, CalendarGridHead, CalendarGridRow, CalendarHeadCell, CalendarHeader, CalendarHeading, CalendarNextButton, CalendarPrevButton } from "."

const props = withDefaults(defineProps<CalendarRootProps & { class?: HTMLAttributes["class"], layout?: LayoutTypes, yearRange?: DateValue[] }>(), {
  modelValue: undefined,
  layout: undefined,
})
const emits = defineEmits<CalendarRootEmits>()

const delegatedProps = reactiveOmit(props, "class", "layout", "placeholder")

const placeholder = useVModel(props, "placeholder", emits, {
  passive: true,
  defaultValue: props.defaultPlaceholder ?? today(getLocalTimeZone()),
}) as Ref<DateValue>

const formatter = useDateFormatter(props.locale ?? "en")

const yearRange = computed(() => {
  return props.yearRange ?? createYearRange({
    start: props?.minValue ?? (toRaw(props.placeholder) ?? props.defaultPlaceholder ?? today(getLocalTimeZone()))
      .cycle("year", -100),

    end: props?.maxValue ?? (toRaw(props.placeholder) ?? props.defaultPlaceholder ?? today(getLocalTimeZone()))
      .cycle("year", 10),
  })
})

const [DefineMonthTemplate, ReuseMonthTemplate] = createReusableTemplate<{ date: DateValue }>()
const [DefineYearTemplate, ReuseYearTemplate] = createReusableTemplate<{ date: DateValue }>()
const monthSelectOpen = ref(false)
const yearSelectOpen = ref(false)

function handleMonthSelectOpen(open: boolean) {
  monthSelectOpen.value = open
  if (open) yearSelectOpen.value = false
}

function handleYearSelectOpen(open: boolean) {
  yearSelectOpen.value = open
  if (open) monthSelectOpen.value = false
}

const forwarded = useForwardPropsEmits(delegatedProps, emits)
</script>

<template>
  <!-- 月/年选择使用 shadcn-vue Select 而不是原生 <select>：原生下拉菜单无法定制
       （样式随系统走、无法隐藏滚动条），且"透明 select + 文字覆盖层"的宽度对不齐
       会让下拉箭头叠在文字上。SelectTrigger 自身是 flex 布局，文字与箭头天然分列。 -->
  <DefineMonthTemplate v-slot="{ date }">
    <Select
      :open="monthSelectOpen"
      :model-value="date.month"
      @update:open="handleMonthSelectOpen"
      @update:model-value="(value) => {
        if (typeof value === 'number') placeholder = placeholder.set({ month: value })
      }"
    >
      <SelectTrigger
        size="sm"
        class="relative h-8 gap-1 px-2 font-medium"
        @pointerdown.capture="yearSelectOpen = false"
      >
        {{ formatter.custom(toDate(date), { month: 'short' }) }}
      </SelectTrigger>
      <SelectContent class="min-w-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <SelectItem v-for="month in createYear({ dateObj: date })" :key="month.toString()" :value="month.month" class="whitespace-nowrap">
          {{ formatter.custom(toDate(month), { month: 'short' }) }}
        </SelectItem>
      </SelectContent>
    </Select>
  </DefineMonthTemplate>

  <DefineYearTemplate v-slot="{ date }">
    <Select
      :open="yearSelectOpen"
      :model-value="date.year"
      @update:open="handleYearSelectOpen"
      @update:model-value="(value) => {
        if (typeof value === 'number') placeholder = placeholder.set({ year: value })
      }"
    >
      <SelectTrigger
        size="sm"
        class="relative h-8 gap-1 px-2 font-medium"
        @pointerdown.capture="monthSelectOpen = false"
      >
        {{ formatter.custom(toDate(date), { year: 'numeric' }) }}
      </SelectTrigger>
      <SelectContent class="min-w-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <SelectItem v-for="year in yearRange" :key="year.toString()" :value="year.year" class="whitespace-nowrap">
          {{ formatter.custom(toDate(year), { year: 'numeric' }) }}
        </SelectItem>
      </SelectContent>
    </Select>
  </DefineYearTemplate>

  <CalendarRoot
    v-slot="{ grid, weekDays, date }"
    v-bind="forwarded"
    v-model:placeholder="placeholder"
    data-slot="calendar"
    :class="cn('p-3', props.class)"
  >
    <CalendarHeader class="pt-0">
      <nav class="flex items-center gap-1 absolute top-0 inset-x-0 justify-between">
        <CalendarPrevButton>
          <slot name="calendar-prev-icon" />
        </CalendarPrevButton>
        <CalendarNextButton>
          <slot name="calendar-next-icon" />
        </CalendarNextButton>
      </nav>

      <slot name="calendar-heading" :date="date" :month="ReuseMonthTemplate" :year="ReuseYearTemplate">
        <template v-if="layout === 'month-and-year'">
          <div class="flex items-center justify-center gap-1">
            <ReuseMonthTemplate :date="date" />
            <ReuseYearTemplate :date="date" />
          </div>
        </template>
        <template v-else-if="layout === 'month-only'">
          <div class="flex items-center justify-center gap-1">
            <ReuseMonthTemplate :date="date" />
            {{ formatter.custom(toDate(date), { year: 'numeric' }) }}
          </div>
        </template>
        <template v-else-if="layout === 'year-only'">
          <div class="flex items-center justify-center gap-1">
            {{ formatter.custom(toDate(date), { month: 'short' }) }}
            <ReuseYearTemplate :date="date" />
          </div>
        </template>
        <template v-else>
          <CalendarHeading />
        </template>
      </slot>
    </CalendarHeader>

    <div class="flex flex-col gap-y-4 mt-4 sm:flex-row sm:gap-x-4 sm:gap-y-0">
      <CalendarGrid v-for="month in grid" :key="month.value.toString()">
        <CalendarGridHead>
          <CalendarGridRow>
            <CalendarHeadCell
              v-for="day in weekDays" :key="day"
            >
              {{ day }}
            </CalendarHeadCell>
          </CalendarGridRow>
        </CalendarGridHead>
        <CalendarGridBody>
          <CalendarGridRow v-for="(weekDates, index) in month.rows" :key="`weekDate-${index}`" class="mt-2 w-full">
            <CalendarCell
              v-for="weekDate in weekDates"
              :key="weekDate.toString()"
              :date="weekDate"
            >
              <CalendarCellTrigger
                :day="weekDate"
                :month="month.value"
              />
            </CalendarCell>
          </CalendarGridRow>
        </CalendarGridBody>
      </CalendarGrid>
    </div>
  </CalendarRoot>
</template>
