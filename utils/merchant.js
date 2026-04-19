function padNumber (value) {
  return String(value).padStart(2, '0')
}

function formatDateTime (value) {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return '--'

  return `${padNumber(date.getMonth() + 1)}-${padNumber(date.getDate())} ${padNumber(date.getHours())}:${padNumber(date.getMinutes())}`
}

function formatCountdown (diffMs = 0) {
  const totalSeconds = Math.max(0, Math.floor(diffMs / 1000))
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)

  if (hours > 0 && minutes > 0) return `${hours}小时${minutes}分钟`
  if (hours > 0) return `${hours}小时`
  return `${minutes}分钟`
}

function getCurrentMerchantRound (now = new Date()) {
  const current = now instanceof Date ? now : new Date(now)
  const start = new Date(current)
  start.setHours(8, 0, 0, 0)

  const roundWindowMs = 4 * 60 * 60 * 1000
  const marketEnd = new Date(start.getTime() + (4 * roundWindowMs))
  let roundIndex = null
  let roundStart = null
  let roundEnd = null

  if (current >= start && current < marketEnd) {
    roundIndex = Math.floor((current.getTime() - start.getTime()) / roundWindowMs) + 1
    roundStart = new Date(start.getTime() + ((roundIndex - 1) * roundWindowMs))
    roundEnd = new Date(roundStart.getTime() + roundWindowMs)
  }

  const dateLabel = `${current.getFullYear()}-${padNumber(current.getMonth() + 1)}-${padNumber(current.getDate())}`
  return {
    date: dateLabel,
    current: roundIndex,
    total: 4,
    round_id: `${dateLabel}-${roundIndex || 'closed'}`,
    is_open: roundIndex !== null,
    countdown: roundEnd ? formatCountdown(roundEnd.getTime() - current.getTime()) : '未开市',
    start_time: roundStart,
    end_time: roundEnd
  }
}

function formatMerchantWindow (item = {}) {
  const startTime = Number(item?.start_time)
  const endTime = Number(item?.end_time)

  if (!Number.isFinite(startTime) || !Number.isFinite(endTime)) {
    return '当前轮次'
  }

  const startLabel = formatDateTime(startTime)
  const endLabel = formatDateTime(endTime)

  if (startLabel === '--' || endLabel === '--') {
    return '当前轮次'
  }

  if (startLabel.slice(0, 5) === endLabel.slice(0, 5)) {
    return `${startLabel} - ${endLabel.slice(6)}`
  }

  return `${startLabel} - ${endLabel}`
}

function isMerchantItemActive (item = {}, nowMs = Date.now()) {
  const startTime = item?.start_time
  const endTime = item?.end_time

  if (startTime === undefined || endTime === undefined) {
    return true
  }

  const start = Number(startTime)
  const end = Number(endTime)
  if (!Number.isFinite(start) || !Number.isFinite(end)) {
    return true
  }

  return start <= nowMs && nowMs < end
}

function normalizeMerchantActivities (payload = {}) {
  const merchantActivities = Array.isArray(payload?.merchantActivities)
    ? payload.merchantActivities
    : Array.isArray(payload?.merchant_activities)
        ? payload.merchant_activities
        : []

  const otherActivities = Array.isArray(payload?.otherActivities)
    ? payload.otherActivities
    : Array.isArray(payload?.other_activities)
        ? payload.other_activities
        : []

  return {
    merchantActivities,
    otherActivities
  }
}

function extractMerchantProducts (payload = {}, options = {}) {
  const { fallbackImage = '' } = options
  const nowMs = Number(options?.nowMs) || Date.now()
  const { merchantActivities, otherActivities } = normalizeMerchantActivities(payload)
  const activity = merchantActivities[0] || {}
  const props = Array.isArray(activity?.get_props) ? activity.get_props : []
  const pets = Array.isArray(activity?.get_pets) ? activity.get_pets : []
  const extraProps = Array.isArray(activity?.get_extra_props) ? activity.get_extra_props : []
  const products = []

  const pushProduct = (item = {}, type = '商品') => {
    if (!isMerchantItemActive(item, nowMs)) return

    products.push({
      name: String(item?.name || `未知${type}`).trim() || `未知${type}`,
      image: String(item?.icon_url || fallbackImage || '').trim(),
      time_label: formatMerchantWindow(item),
      type
    })
  }

  props.forEach((item) => pushProduct(item, '商品'))
  extraProps.forEach((item) => pushProduct(item, '额外道具'))
  pets.forEach((item) => pushProduct(item, '精灵'))

  return {
    activity,
    merchantActivities,
    otherActivities,
    products
  }
}

function splitMerchantSubscriptionItems (rawText = '') {
  const parts = String(rawText || '').trim().split(/[\s,，、/|；;]+/)
  const items = []
  const seen = new Set()

  for (const part of parts) {
    const name = String(part || '').trim()
    if (!name || seen.has(name)) continue
    seen.add(name)
    items.push(name)
  }

  return items
}

function parseMerchantSubscriptionArgs (rawText = '') {
  const text = String(rawText || '').trim()
  if (!text) {
    return {
      mentionAll: false,
      items: null
    }
  }

  const tokens = text.split(/\s+/, 2)
  let mentionAll = false
  let itemsText = text

  if (tokens[0] === '0' || tokens[0] === '1') {
    mentionAll = tokens[0] === '1'
    itemsText = text.slice(tokens[0].length).trim()
  }

  const items = itemsText ? splitMerchantSubscriptionItems(itemsText) : null
  return {
    mentionAll,
    items: items && items.length > 0 ? items : null
  }
}

function buildMerchantRenderData (payload = {}, options = {}) {
  const { activity, products } = extractMerchantProducts(payload, {
    fallbackImage: options?.fallbackImage || ''
  })
  const roundInfo = getCurrentMerchantRound(options?.now || new Date())

  return {
    background: options?.background || '',
    titleIcon: options?.titleIcon !== false,
    title: String(activity?.name || '远行商人'),
    subtitle: String(activity?.start_date || '每日 08:00 / 12:00 / 16:00 / 20:00 刷新'),
    product_count: products.length,
    round_info: roundInfo,
    products
  }
}

function buildMerchantText (payload = {}, options = {}) {
  const { activity, products } = extractMerchantProducts(payload, {
    fallbackImage: options?.fallbackImage || ''
  })
  const roundInfo = getCurrentMerchantRound(options?.now || new Date())
  const lines = [
    activity?.name || '远行商人',
    `当前轮次：${roundInfo.current || '未开放'} / ${roundInfo.total}`,
    `剩余时间：${roundInfo.countdown}`
  ]

  if (products.length === 0) {
    lines.push('')
    lines.push('当前没有读取到可展示的商品。')
    return lines.join('\n')
  }

  lines.push('')
  products.forEach((item, index) => {
    lines.push(`${index + 1}. ${item.name}`)
    lines.push(`类型：${item.type}`)
    lines.push(`时间：${item.time_label}`)
  })

  return lines.join('\n')
}

export {
  buildMerchantRenderData,
  buildMerchantText,
  extractMerchantProducts,
  formatMerchantWindow,
  getCurrentMerchantRound,
  normalizeMerchantActivities,
  parseMerchantSubscriptionArgs,
  splitMerchantSubscriptionItems
}
