import RocomApi from './api.js'
import { trimText } from '../utils/rocom.js'

const CHINA_TIMEZONE = 'Asia/Shanghai'

const chinaDateFormatter = new Intl.DateTimeFormat('zh-CN', {
  timeZone: CHINA_TIMEZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit'
})

const chinaDateTimeFormatter = new Intl.DateTimeFormat('zh-CN', {
  timeZone: CHINA_TIMEZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false
})

function padNumber (value) {
  return String(value).padStart(2, '0')
}

function getChinaParts (date = new Date()) {
  const parts = {}

  for (const item of chinaDateTimeFormatter.formatToParts(date)) {
    if (item.type !== 'literal') {
      parts[item.type] = item.value
    }
  }

  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second)
  }
}

function formatChinaDate (date = new Date()) {
  const [year, month, day] = chinaDateFormatter.format(date).split('/').map((item) => Number(item))
  return `${year}-${padNumber(month)}-${padNumber(day)}`
}

function formatCountdown (milliseconds = 0) {
  const totalSeconds = Math.max(0, Math.floor(Number(milliseconds) / 1000))
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)

  if (hours > 0 && minutes > 0) {
    return `${hours}小时${minutes}分钟`
  }

  if (hours > 0) {
    return `${hours}小时`
  }

  return `${minutes}分钟`
}

function formatMerchantTime (timestampMs) {
  const numeric = Number(timestampMs)
  if (numeric == 0) return '--'

  const parts = getChinaParts(new Date(numeric))
  return `${padNumber(parts.month)}-${padNumber(parts.day)} ${padNumber(parts.hour)}:${padNumber(parts.minute)}`
}

function formatMerchantWindow (item = {}) {
  const startLabel = formatMerchantTime(item?.start_time)
  const endLabel = formatMerchantTime(item?.end_time)

  if (startLabel === '--' || endLabel === '--') {
	const parts = getChinaParts(Date.now())
    return `${padNumber(parts.month)}-${padNumber(parts.day)} ` + '08:00 - 23:59'
  }

  return startLabel.slice(0, 5) === endLabel.slice(0, 5)
    ? `${startLabel} - ${endLabel.slice(6)}`
    : `${startLabel} - ${endLabel}`
}

function isMerchantItemActive (item = {}) {
  const startTime = Number(item?.start_time)
  const endTime = Number(item?.end_time)
  if (startTime == 0 || endTime == 0) {
    return true
  }

  const now = Date.now()
  return startTime <= now && now < endTime
}

function getTodayRangeMs (date = new Date()) {
  const parts = getChinaParts(date)
  const startOfDay = new Date(`${parts.year}-${padNumber(parts.month)}-${padNumber(parts.day)}T00:00:00+08:00`).getTime()
  const endOfDay = startOfDay + 24 * 60 * 60 * 1000
  return { startOfDay, endOfDay }
}

function isMerchantItemToday (item = {}, date = new Date()) {
  const startTime = Number(item?.start_time)
  const endTime = Number(item?.end_time)
  if (startTime == 0 || endTime == 0) {
    return true
  }

  const { startOfDay, endOfDay } = getTodayRangeMs(date)
  return startTime < endOfDay && endTime > startOfDay
}

const ROUND_WINDOWS = [
  { id: 1, label: '08:00 - 12:00', startHour: 8, endHour: 12 },
  { id: 2, label: '12:00 - 16:00', startHour: 12, endHour: 16 },
  { id: 3, label: '16:00 - 20:00', startHour: 16, endHour: 20 },
  { id: 4, label: '20:00 - 24:00', startHour: 20, endHour: 24 }
]

function classifyMerchantItem (item) {
  const startTime = Number(item?.start_time)
  const endTime = Number(item?.end_time)
  if (startTime == 0 || endTime == 0) return 'normal'

  const durationHours = (endTime - startTime) / (1000 * 60 * 60)
  const durationDays = durationHours / 24

  if (durationDays >= 2) return 'weekend'

  const startParts = getChinaParts(new Date(startTime))
  const endParts = getChinaParts(new Date(endTime))
  const startHour = startParts.hour + startParts.minute / 60
  const endHour = endParts.hour + endParts.minute / 60

  if (startHour <= 8 && endHour >= 23.5) return 'normal'

  return 'round'
}

function getRoundForItem (item, todayDate) {
  const startTime = Number(item?.start_time)
  if (startTime == 0) return null

  const parts = getChinaParts(new Date(startTime))
  const todayParts = getChinaParts(todayDate)
  if (parts.year !== todayParts.year || parts.month !== todayParts.month || parts.day !== todayParts.day) {
    return null
  }

  const hour = parts.hour
  for (const win of ROUND_WINDOWS) {
    if (hour >= win.startHour && hour < win.endHour) {
      return win.id
    }
  }
  return null
}

class MerchantService {
  constructor () {
    this.api = new RocomApi()
  }

  async getInfo (refresh = false, options = {}) {
    return this.api.getMerchantInfo({ refresh }, options)
  }

  getCurrentRound (date = new Date()) {
    const parts = getChinaParts(date)
    const todayText = `${parts.year}-${padNumber(parts.month)}-${padNumber(parts.day)}`
    const secondsOfDay = (parts.hour * 3600) + (parts.minute * 60) + parts.second
    const marketStartSeconds = 8 * 3600
    const marketEndSeconds = 24 * 3600

    if (secondsOfDay < marketStartSeconds || secondsOfDay >= marketEndSeconds) {
      return {
        date: todayText,
        current: null,
        total: 4,
        round_id: `${todayText}-closed`,
        is_open: false,
        countdown: '未开市',
        start_time: null,
        end_time: null
      }
    }

    const roundWindowSeconds = 4 * 3600
    const elapsed = secondsOfDay - marketStartSeconds
    const roundIndex = Math.floor(elapsed / roundWindowSeconds) + 1
    const roundStartSeconds = marketStartSeconds + ((roundIndex - 1) * roundWindowSeconds)
    const roundEndSeconds = roundStartSeconds + roundWindowSeconds

    return {
      date: todayText,
      current: roundIndex,
      total: 4,
      round_id: `${todayText}-${roundIndex}`,
      is_open: true,
      countdown: formatCountdown((roundEndSeconds - secondsOfDay) * 1000),
      start_time: `${padNumber(Math.floor(roundStartSeconds / 3600))}:00`,
      end_time: `${padNumber(Math.floor(roundEndSeconds / 3600))}:00`
    }
  }

  extractProducts (payload = {}) {
    const merchantActivities = Array.isArray(payload?.merchantActivities)
      ? payload.merchantActivities
      : Array.isArray(payload?.merchant_activities)
          ? payload.merchant_activities
          : []
    const activity = merchantActivities[0] || {}
    const props = Array.isArray(activity?.get_props) ? activity.get_props : []
    const extraProps = Array.isArray(activity?.get_extra_props) ? activity.get_extra_props : []
    const pets = Array.isArray(activity?.get_pets) ? activity.get_pets : []
    const products = []

    const collectItems = (items = [], kind = 'prop') => {
      for (const item of items) {
        if (!isMerchantItemActive(item)) continue
        products.push({
          kind,
          category: classifyMerchantItem(item),
          name: trimText(item?.name) || '未知商品',
          image: trimText(item?.icon_url),
          time_label: formatMerchantWindow(item)
        })
      }
    }

    collectItems(props, 'prop')
    collectItems(extraProps, 'extra_prop')
    collectItems(pets, 'pet')

    return {
      activity,
      products,
      merchantActivities,
      otherActivities: Array.isArray(payload?.otherActivities)
        ? payload.otherActivities
        : Array.isArray(payload?.other_activities)
            ? payload.other_activities
            : []
    }
  }

  buildRenderData (payload = {}, options = {}) {
    const { activity, products } = this.extractProducts(payload)
    const roundInfo = this.getCurrentRound(options?.now)

    const categories = [
      { key: 'normal', label: '热销商品', products: [] },
      { key: 'round', label: '常规商品', products: [] },
      { key: 'weekend', label: '周末限定', products: [] }
    ]
    for (const product of products) {
      const group = categories.find((c) => c.key === product.category)
      if (group) group.products.push(product)
    }

    return {
      background: options?.background || '',
      titleIcon: options?.titleIcon !== false,
      title: trimText(activity?.name) || '远行商人',
      subtitle: trimText(activity?.start_date) || '每日 08:00 / 12:00 / 16:00 / 20:00 刷新',
      product_count: products.length,
      round_info: roundInfo,
      categories: categories.filter((c) => c.products.length > 0),
      products
    }
  }

  buildFallbackText (payload = {}, options = {}) {
    const { activity, products } = this.extractProducts(payload)
    const roundInfo = this.getCurrentRound(options?.now)

    if (products.length === 0) {
      return [
        trimText(activity?.name) || '远行商人',
        `轮次：第 ${roundInfo.current || '未开放'} / ${roundInfo.total} 轮`,
        `剩余：${roundInfo.countdown}`,
        '当前轮次暂无商品。'
      ].join('\n')
    }

    const categoryLabels = { weekend: '周末限定', normal: '热销商品', round: '常规商品' }
    const categories = [
      { key: 'normal', products: [] },
      { key: 'round', products: [] },
      { key: 'weekend', products: [] }
    ]
    for (const product of products) {
      const group = categories.find((c) => c.key === product.category)
      if (group) group.products.push(product)
    }

    const lines = [
      trimText(activity?.name) || '远行商人',
      `轮次：第 ${roundInfo.current || '未开放'} / ${roundInfo.total} 轮`,
      `剩余：${roundInfo.countdown}`,
      ''
    ]

    for (const group of categories) {
      if (group.products.length === 0) continue
      lines.push(`【${categoryLabels[group.key]}】`)
      group.products.forEach((product, index) => {
        lines.push(`  ${index + 1}. ${product.name}  (${product.time_label})`)
      })
      lines.push('')
    }

    return lines.join('\n').trimEnd()
  }

  extractTodayProducts (payload = {}, date = new Date()) {
    const merchantActivities = Array.isArray(payload?.merchantActivities)
      ? payload.merchantActivities
      : Array.isArray(payload?.merchant_activities)
          ? payload.merchant_activities
          : []
    const activity = merchantActivities[0] || {}
    const props = Array.isArray(activity?.get_props) ? activity.get_props : []
    const extraProps = Array.isArray(activity?.get_extra_props) ? activity.get_extra_props : []
    const pets = Array.isArray(activity?.get_pets) ? activity.get_pets : []

    const roundGroups = ROUND_WINDOWS.map((win) => ({
      round_id: win.id,
      label: win.label,
      is_current: false,
      products: []
    }))

    const currentRound = this.getCurrentRound(date)
    if (currentRound.is_open && currentRound.current) {
      const idx = currentRound.current - 1
      if (idx >= 0 && idx < roundGroups.length) {
        roundGroups[idx].is_current = true
      }
    }

    const collectItems = (items = [], kind = 'prop') => {
      for (const item of items) {
        if (!isMerchantItemToday(item, date)) continue
        const product = {
          kind,
          category: classifyMerchantItem(item),
          name: trimText(item?.name) || '未知商品',
          image: trimText(item?.icon_url),
          time_label: formatMerchantWindow(item)
        }
        const roundId = getRoundForItem(item, date)
        if (roundId) {
          const group = roundGroups.find((g) => g.round_id === roundId)
          if (group) group.products.push(product)
        } else {
          for (const group of roundGroups) {
            group.products.push(product)
          }
        }
      }
    }

    collectItems(props, 'prop')
    collectItems(extraProps, 'extra_prop')
    collectItems(pets, 'pet')

    return {
      activity,
      roundGroups,
      todayDate: formatChinaDate(date)
    }
  }

  buildTodayRenderData (payload = {}, options = {}) {
    const now = options?.now || new Date()
    const { activity, roundGroups, todayDate } = this.extractTodayProducts(payload, now)

    return {
      background: options?.background || '',
      title: '今日远行商人',
      subtitle: `${todayDate} · 每日 08:00 / 12:00 / 16:00 / 20:00 刷新`,
      roundGroups,
      total_products: roundGroups.reduce((sum, g) => sum + g.products.length, 0)
    }
  }

  buildTodayFallbackText (payload = {}, options = {}) {
    const now = options?.now || new Date()
    const { activity, roundGroups, todayDate } = this.extractTodayProducts(payload, now)

    const lines = [
      `今日远行商人 (${todayDate})`,
      ''
    ]

    let hasAny = false
    for (const group of roundGroups) {
      lines.push(`【第${group.round_id}轮 ${group.label}】${group.is_current ? ' ◀ 当前' : ''}`)
      if (group.products.length === 0) {
        lines.push('  暂无商品')
      } else {
        hasAny = true
        group.products.forEach((product, i) => {
          lines.push(`  ${i + 1}. ${product.name}  (${product.time_label})`)
        })
      }
      lines.push('')
    }

    if (!hasAny) {
      lines.push('今日暂无已公布的远行商人商品。')
    }

    return lines.join('\n')
  }
}

const merchantService = new MerchantService()

export {
  MerchantService,
  formatChinaDate,
  formatCountdown,
  formatMerchantTime,
  formatMerchantWindow
}

export default merchantService
