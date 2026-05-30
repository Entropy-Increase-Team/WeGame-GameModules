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

    return {
      background: options?.background || '',
      titleIcon: options?.titleIcon !== false,
      title: trimText(activity?.name) || '远行商人',
      subtitle: trimText(activity?.start_date) || '每日 08:00 / 12:00 / 16:00 / 20:00 刷新',
      product_count: products.length,
      round_info: roundInfo,
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

    const lines = [
      trimText(activity?.name) || '远行商人',
      `轮次：第 ${roundInfo.current || '未开放'} / ${roundInfo.total} 轮`,
      `剩余：${roundInfo.countdown}`,
      ''
    ]

    products.forEach((product, index) => {
      lines.push(`${index + 1}. ${product.name}`)
      lines.push(`时间：${product.time_label}`)
      if (product.image) {
        lines.push(`图片：${product.image}`)
      }
      if (index !== products.length - 1) {
        lines.push('')
      }
    })

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
