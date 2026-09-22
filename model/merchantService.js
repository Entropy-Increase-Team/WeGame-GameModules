import RocomApi from './api.js'
import { trimText } from '../utils/rocom.js'

const CHINA_TIMEZONE = 'Asia/Shanghai'
const MERCHANT_CARD_SOURCE_WIDTH = 1080
const MERCHANT_CARD_LAYOUT_SCALE = 0.25
const MERCHANT_CARD_OUTPUT_WIDTH = 3840
const MERCHANT_CARD_DEVICE_SCALE_FACTOR = 4
const MERCHANT_CARD_RENDER_SCALE = MERCHANT_CARD_LAYOUT_SCALE
const MERCHANT_CARD_RENDER_WIDTH = Math.ceil(MERCHANT_CARD_OUTPUT_WIDTH / MERCHANT_CARD_DEVICE_SCALE_FACTOR)
const MERCHANT_CARD_OUTPUT_SCALE = MERCHANT_CARD_RENDER_WIDTH / MERCHANT_CARD_SOURCE_WIDTH
const MERCHANT_CARD_RENDER_BASE_WIDTH = MERCHANT_CARD_SOURCE_WIDTH * MERCHANT_CARD_LAYOUT_SCALE
const MERCHANT_CARD_RENDER_ZOOM = MERCHANT_CARD_RENDER_WIDTH / MERCHANT_CARD_RENDER_BASE_WIDTH
const MERCHANT_CARD_STROKE_11 = 11 * MERCHANT_CARD_RENDER_SCALE
const MERCHANT_CARD_STROKE_10 = 10 * MERCHANT_CARD_RENDER_SCALE
const MERCHANT_CARD_OFFSET_3 = 3 * MERCHANT_CARD_RENDER_SCALE

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

/** 旧接口只用来补图标与当天档期，缓存期内不再重复请求 */
const MERCHANT_ENRICH_CACHE_TTL_MS = 10 * 60 * 1000

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

function getRoundWindowMs (roundId, date = new Date()) {
  const win = ROUND_WINDOWS.find((item) => item.id === Number(roundId))
  if (!win) return null

  const { startOfDay } = getTodayRangeMs(date)
  return {
    start_time: startOfDay + (win.startHour * 60 * 60 * 1000),
    end_time: startOfDay + (win.endHour * 60 * 60 * 1000)
  }
}

function isPlainObject (value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

/** 秒级/毫秒级时间戳统一成毫秒 */
function toTimestampMs (value) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric) || numeric <= 0) return 0
  return numeric < 1e12 ? numeric * 1000 : numeric
}

/** 实时接口的价格可能是数字，也可能是 { amount } 结构 */
function resolveRealtimePrice (goods = {}, key = 'real') {
  const price = goods?.price

  if (isPlainObject(price)) {
    const target = price[key] ?? price.origin ?? price.real
    if (isPlainObject(target)) return Number(target.amount) || 0
    return Number(target) || 0
  }

  return Number(price) || 0
}

class MerchantService {
  constructor () {
    this.api = new RocomApi()
    // 旧接口只用于补齐图标 / 当天档期，做短缓存避免订阅轮询翻倍调用
    this.legacyCache = { at: 0, payload: null }
  }

  /** 实时商店信息（ingame/merchant/info），失败时抛错由 getInfo 回退 */
  async getRealtimeInfo (options = {}) {
    const payload = await this.api.getIngameMerchantInfoRealtime(undefined, {
      waitMs: 5000,
      httpTimeoutMs: 15000,
      ...options
    })

    if (!isPlainObject(payload)) return null

    const goods = Array.isArray(payload.goods) ? payload.goods : []

    // 查询被拒时 HTTP/code/message 仍是 200/0/ok，只有 meta.status/ret_code 能看出来。
    // 商品为空即视为不可用，交给旧接口兜底，避免渲染成空商店。
    if (goods.length === 0) {
      const meta = isPlainObject(payload.meta) ? payload.meta : {}
      const status = trimText(meta.status)
      if (status && status !== 'ok') {
        logger.warn(`[WeGame-plugin][rocom] 实时商店查询未成功（status=${status} ret_code=${meta.ret_code ?? '-'}），回退旧接口`)
      }
      return null
    }

    return payload
  }

  async getLegacyInfo (refresh = false, options = {}) {
    const cachedAt = Number(this.legacyCache?.at) || 0
    if (this.legacyCache?.payload && Date.now() - cachedAt < MERCHANT_ENRICH_CACHE_TTL_MS) {
      return this.legacyCache.payload
    }

    const payload = await this.api.getMerchantInfo({ refresh }, options)
    this.legacyCache = { at: Date.now(), payload }
    return payload
  }

  async getInfo (refresh = false, options = {}) {
    let realtime = null

    try {
      realtime = await this.getRealtimeInfo(options)
    } catch (error) {
      logger.warn(`[WeGame-plugin][rocom] 实时远行商人接口不可用，回退旧接口：${error?.message || error}`)
    }

    if (!realtime) {
      return this.api.getMerchantInfo({ refresh }, options)
    }

    const legacy = await this.getLegacyInfo(refresh, options).catch((error) => {
      logger.warn(`[WeGame-plugin][rocom] 远行商人旧接口补充数据失败：${error?.message || error}`)
      return null
    })

    return this.buildRealtimePayload(realtime, {
      legacy,
      now: options?.now
    })
  }

  /** 旧接口的商品索引：按 goods_id / 名称命中图标、档期与价格 */
  buildLegacyGoodsIndex (legacy = {}) {
    const merchantActivities = Array.isArray(legacy?.merchantActivities)
      ? legacy.merchantActivities
      : Array.isArray(legacy?.merchant_activities)
          ? legacy.merchant_activities
          : []
    const activity = merchantActivities[0] || {}
    const randomGoods = Array.isArray(legacy?.random_goods) ? legacy.random_goods : []

    const byGoodsId = new Map()
    const byName = new Map()
    const items = []

    for (const item of randomGoods) {
      const goodsId = Number(item?.id)
      const name = trimText(item?.goods_name)
      const entry = {
        goods_id: Number.isFinite(goodsId) ? goodsId : 0,
        name,
        icon_url: '',
        item_id: Number(item?.item_id) || 0,
        item_num: Number(item?.item_num) || 1,
        price: Number(item?.price) || 0,
        origin_price: Number(item?.origin_price) || 0,
        buy_limit_num: Number(item?.buy_limit_num) || 0
      }

      if (entry.goods_id) byGoodsId.set(entry.goods_id, entry)
      if (name) byName.set(name, entry)
    }

    const collectItems = (list = [], kind = 'prop') => {
      for (const item of Array.isArray(list) ? list : []) {
        const name = trimText(item?.name)
        if (!name) continue

        const linked = byName.get(name) || {}
        const entry = {
          goods_id: Number(linked.goods_id) || 0,
          name,
          icon_url: trimText(item?.icon_url),
          start_time: Number(item?.start_time) || 0,
          end_time: Number(item?.end_time) || 0,
          round: Number(item?.round) || 0,
          item_id: Number(linked.item_id) || 0,
          item_num: Number(linked.item_num) || 1,
          price: Number(linked.price) || 0,
          origin_price: Number(linked.origin_price) || 0,
          buy_limit_num: Number(linked.buy_limit_num) || 0,
          kind
        }

        items.push(entry)
        byName.set(name, entry)
        if (entry.goods_id) byGoodsId.set(entry.goods_id, entry)
      }
    }

    collectItems(activity?.get_props, 'prop')
    collectItems(activity?.get_extra_props, 'extra_prop')
    collectItems(activity?.get_pets, 'pet')

    return { activity, items, byGoodsId, byName, randomGoods }
  }

  /**
   * 实时商品只带 next_refresh_time，没有档期；按「当前轮次窗口」还原，
   * 这样既有卡片分类逻辑（热销 / 常规 / 周末）无需改动。
   */
  resolveRealtimeWindow (item = {}, now = new Date()) {
    const nowMs = now.getTime()
    const currentRound = this.getCurrentRound(now)
    const roundWindow = getRoundWindowMs(currentRound.current, now)
    const nextRefreshMs = toTimestampMs(item?.next_refresh_time)

    if (nextRefreshMs > nowMs) {
      return {
        start_time: roundWindow ? roundWindow.start_time : nowMs,
        end_time: nextRefreshMs,
        round: currentRound.current || 0
      }
    }

    // 没有刷新时间：视为全天在架，走「热销商品」
    if (!nextRefreshMs) {
      const { startOfDay, endOfDay } = getTodayRangeMs(now)
      return {
        start_time: startOfDay + (8 * 60 * 60 * 1000),
        end_time: endOfDay,
        round: 0
      }
    }

    return roundWindow
      ? { ...roundWindow, round: currentRound.current || 0 }
      : { start_time: nowMs, end_time: nowMs + (4 * 60 * 60 * 1000), round: currentRound.current || 0 }
  }

  /** 把实时商店 + 旧接口补充数据整成下游渲染/订阅沿用的结构 */
  buildRealtimePayload (realtime = {}, options = {}) {
    const now = options?.now instanceof Date ? options.now : new Date()
    const legacyIndex = this.buildLegacyGoodsIndex(options?.legacy)
    const shop = isPlainObject(realtime?.shop) ? realtime.shop : {}
    const goods = Array.isArray(realtime?.goods) ? realtime.goods : []
    const mapping = Array.isArray(realtime?.goods_mapping) ? realtime.goods_mapping : []

    const mappingById = new Map()
    for (const item of mapping) {
      const goodsId = Number(item?.goods_id)
      if (Number.isFinite(goodsId)) mappingById.set(goodsId, item)
    }

    const getProps = []
    const randomGoods = []
    // 实时数据只对「当前轮次」是权威的，所以按 名称+轮次 去重：
    // 同一件商品在不同轮次各上一次（实测魔力果第 2、3 轮都在售）必须都保留，
    // 只跳过与实时商品同轮次的那条旧档期。
    const realtimeRoundKeys = new Set()
    const legacyRoundKeys = new Set()
    // 只记录实时接口已覆盖的商品，用于判断旧接口 random_goods 是否重复
    const realtimeNames = new Set()
    const realtimeGoodsIds = new Set()

    for (const item of goods) {
      const goodsId = Number(item?.goods_id)
      const mapped = mappingById.get(goodsId) || {}
      const legacyItem = legacyIndex.byGoodsId.get(goodsId) || null
      const name = trimText(item?.goods_name) ||
        trimText(mapped.goods_name) ||
        trimText(legacyItem?.name) ||
        (Number.isFinite(goodsId) ? `商品 ${goodsId}` : '未知商品')
      const price = resolveRealtimePrice(item, 'real')
      const originPrice = resolveRealtimePrice(item, 'origin')
      const buyLimit = Number(item?.limit_buy_num) || 0
      const itemId = Number(mapped.item_id) || Number(legacyItem?.item_id) || 0
      const itemNum = Number(mapped.item_num) || Number(legacyItem?.item_num) || 1
      const window = this.resolveRealtimeWindow(item, now)

      getProps.push({
        name,
        icon_url: trimText(legacyItem?.icon_url),
        start_time: window.start_time,
        end_time: window.end_time,
        round: window.round,
        goods_id: Number.isFinite(goodsId) ? goodsId : 0,
        item_id: itemId,
        item_num: itemNum,
        price,
        origin_price: originPrice,
        buy_limit_num: buyLimit,
        buy_num: Number(item?.buy_num) || 0,
        source: 'realtime'
      })

      randomGoods.push({
        id: Number.isFinite(goodsId) ? goodsId : 0,
        goods_name: name,
        item_id: itemId,
        item_num: itemNum,
        price,
        origin_price: originPrice,
        buy_limit_num: buyLimit,
        enable: true
      })

      realtimeRoundKeys.add(`${name}@${Number(window.round) || 0}`)
      realtimeNames.add(name)
      if (Number.isFinite(goodsId)) realtimeGoodsIds.add(goodsId)
    }

    // 旧接口里还有、本轮实时商店没上的商品（当天其它轮次）保留下来，
    // 供「今日远行商人」和图标使用
    for (const entry of legacyIndex.items) {
      const roundKey = `${entry.name}@${Number(entry.round) || 0}`
      if (realtimeRoundKeys.has(roundKey)) continue
      if (legacyRoundKeys.has(roundKey)) continue
      legacyRoundKeys.add(roundKey)
      getProps.push({ ...entry })
    }

    for (const item of legacyIndex.randomGoods) {
      const goodsId = Number(item?.id)
      const name = trimText(item?.goods_name)
      if (name && realtimeNames.has(name)) continue
      if (Number.isFinite(goodsId) && realtimeGoodsIds.has(goodsId)) continue
      randomGoods.push({ ...item })
    }

    const legacyActivity = legacyIndex.activity || {}
    const activity = {
      name: trimText(legacyActivity?.name) || '远行商人',
      start_date: trimText(legacyActivity?.start_date) || formatChinaDate(now),
      start_time: Number(legacyActivity?.start_time) || 0,
      end_time: Number(legacyActivity?.end_time) || 0,
      get_props: getProps,
      get_extra_props: [],
      get_pets: [],
      source: 'realtime'
    }

    return {
      merchantActivities: [activity],
      random_goods: randomGoods,
      realtime: {
        shop,
        goods,
        goods_mapping: mapping,
        source: trimText(realtime?.meta?.source),
        round: this.getCurrentRound(now)
      }
    }
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
          roundGroups[0].products.push(product)
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

    const categoryOrder = ['normal', 'round', 'weekend']
    const categoryLabels = { normal: '热销商品', round: '常规商品', weekend: '周末限定' }
    const categoryMap = {}
    for (const cat of categoryOrder) {
      categoryMap[cat] = []
    }
    for (const group of roundGroups) {
      for (const product of group.products) {
        const cat = product.category || 'round'
        if (!categoryMap[cat]) categoryMap[cat] = []
        let catGroup = categoryMap[cat].find((g) => g.round_id === group.round_id)
        if (!catGroup) {
          catGroup = { round_id: group.round_id, label: group.label, is_current: group.is_current, products: [] }
          categoryMap[cat].push(catGroup)
        }
        catGroup.products.push(product)
      }
    }

    const categories = categoryOrder
      .filter((key) => categoryMap[key].length > 0)
      .map((key) => ({
        key,
        label: categoryLabels[key],
        roundGroups: categoryMap[key],
        product_count: categoryMap[key].reduce((sum, g) => sum + g.products.length, 0)
      }))

    return {
      background: options?.background || '',
      title: '今日远行商人',
      subtitle: `${todayDate} · 每日 08:00 / 12:00 / 16:00 / 20:00 刷新`,
      categories,
      roundGroups,
      total_products: roundGroups.reduce((sum, g) => sum + g.products.length, 0)
    }
  }

  buildTodayCardRenderData (payload = {}, options = {}) {
    const now = options?.now || new Date()
    const merchantActivities = Array.isArray(payload?.merchantActivities)
      ? payload.merchantActivities
      : Array.isArray(payload?.merchant_activities)
          ? payload.merchant_activities
          : []
    const activity = merchantActivities[0] || {}
    const randomGoods = Array.isArray(payload?.random_goods) ? payload.random_goods : []
    const props = Array.isArray(activity?.get_props) ? activity.get_props : []
    const extraProps = Array.isArray(activity?.get_extra_props) ? activity.get_extra_props : []
    const pets = Array.isArray(activity?.get_pets) ? activity.get_pets : []

    // Merge all items
    const allItems = [...props, ...extraProps, ...pets]

    // Build icon map and price map
    const iconMap = {}
    const priceMap = {}
    const limitMap = {}
    for (const p of allItems) {
      if (p.name && p.icon_url) iconMap[p.name] = p.icon_url
    }
    for (const item of randomGoods) {
      priceMap[item.goods_name] = item.price
      limitMap[item.goods_name] = item.buy_limit_num
    }

    // Format date (MM.DD)
    const startDate = new Date(activity.start_time || now)
    const dateStr = `${startDate.getMonth() + 1}.${startDate.getDate()}`

    const startY = 592
    const cardHeight = 308
    const gap = 43

    const goodsAll = []
    for (const p of allItems) {
      const startTime = Number(p.start_time || 0)
      const endTime = Number(p.end_time || 0)
      const category = classifyMerchantItem(p)
      const limit = limitMap[p.name] || 0

      const isEnded = now.getTime() >= endTime || now.getTime() < startTime

      // 热销 (normal)：全天在架
      if (category === 'normal') {
        goodsAll.push({
          goods_name: p.name,
          iconUrl: p.icon_url || iconMap[p.name] || '',
          price: priceMap[p.name] || 0,
          num: '',
          category: 'normal',
          roundId: 0,
          isHot: true,
          isEnded: false,
          remainingStr: `本日限购${limit}个`,
          top: 0
        })
        continue
      }

      const roundId = getRoundForItem(p, now)
      if (!roundId) continue

      // 周末限定 (weekend)：跨天商品，热销
      if (category === 'weekend') {
        goodsAll.push({
          goods_name: p.name,
          iconUrl: p.icon_url || iconMap[p.name] || '',
          price: priceMap[p.name] || 0,
          num: '',
          category: 'weekend',
          roundId: 0,
          isHot: true,
          isEnded,
          remainingStr: isEnded ? `第${roundId}轮·本轮限购${limit}个` : `活动期间限购${limit}个`,
          top: 0
        })
        continue
      }

      // 常规商品 (round)
      goodsAll.push({
        goods_name: p.name,
        iconUrl: p.icon_url || iconMap[p.name] || '',
        price: priceMap[p.name] || 0,
        num: '',
        category: 'round',
        roundId,
        isHot: false,
        isEnded,
        remainingStr: isEnded ? `第${roundId}轮·本轮限购${limit}个` : `本轮限购${limit}个`,
        top: 0
      })
    }

    // Sort: 在架优先 → round→normal→weekend → price desc → 不在架在后
    const catOrder = { round: 0, normal: 1, weekend: 2 }
    goodsAll.sort((a, b) => {
      if (a.isEnded !== b.isEnded) return a.isEnded ? 1 : -1
      if (a.category !== b.category) return catOrder[a.category] - catOrder[b.category]
      return (b.price || 0) - (a.price || 0)
    })

    // Assign position and num
    const goods = goodsAll.map((item, i) => ({
      ...item,
      num: String(i + 1).padStart(2, '0'),
      top: startY + i * (cardHeight + gap)
    }))

    const lastCardTop = goods.length > 0 ? goods[goods.length - 1].top : startY
    const bottomFrameTop = lastCardTop + 287
    const pageHeight = bottomFrameTop + 160
    const renderHeight = Math.ceil(pageHeight * MERCHANT_CARD_OUTPUT_SCALE)
    const renderBaseHeight = pageHeight * MERCHANT_CARD_LAYOUT_SCALE

    return {
      dateStr,
      goods,
      bottomFrameTop,
      pageHeight,
      renderWidth: MERCHANT_CARD_RENDER_WIDTH,
      renderHeight,
      renderBaseWidth: MERCHANT_CARD_RENDER_BASE_WIDTH,
      renderBaseHeight,
      renderScale: MERCHANT_CARD_RENDER_SCALE,
      renderZoom: MERCHANT_CARD_RENDER_ZOOM,
      renderDeviceScaleFactor: MERCHANT_CARD_DEVICE_SCALE_FACTOR,
      renderStroke11: MERCHANT_CARD_STROKE_11,
      renderStroke10: MERCHANT_CARD_STROKE_10,
      renderOffset3: MERCHANT_CARD_OFFSET_3
    }
  }

  buildCurrentRoundCardRenderData (payload = {}, options = {}) {
    const now = options?.now || new Date()
    const merchantActivities = Array.isArray(payload?.merchantActivities)
      ? payload.merchantActivities
      : Array.isArray(payload?.merchant_activities)
          ? payload.merchant_activities
          : []
    const activity = merchantActivities[0] || {}
    const randomGoods = Array.isArray(payload?.random_goods) ? payload.random_goods : []
    const props = Array.isArray(activity?.get_props) ? activity.get_props : []
    const extraProps = Array.isArray(activity?.get_extra_props) ? activity.get_extra_props : []
    const pets = Array.isArray(activity?.get_pets) ? activity.get_pets : []

    // Merge all items
    const allItems = [...props, ...extraProps, ...pets]

    // Build icon map and price map
    const iconMap = {}
    const priceMap = {}
    const limitMap = {}
    for (const p of allItems) {
      if (p.name && p.icon_url) iconMap[p.name] = p.icon_url
    }
    for (const item of randomGoods) {
      priceMap[item.goods_name] = item.price
      limitMap[item.goods_name] = item.buy_limit_num
    }

    // Get current round
    const currentRound = this.getCurrentRound(now)
    const currentRoundId = currentRound.current

    // Format current round time range
    const pad = (n) => String(n).padStart(2, '0')
    const dateStr = `${now.getMonth() + 1}.${now.getDate()}`
    let timeRange = '--:--~--:--'
    if (currentRoundId) {
      const win = ROUND_WINDOWS.find(w => w.id === currentRoundId)
      if (win) {
        timeRange = `${pad(win.startHour)}:00-${pad(win.endHour)}:00`
      }
    }

    // Build goods array for current round only
    const startY = 592
    const cardHeight = 308
    const gap = 43

    const goodsAll = []
    for (const p of allItems) {
      const category = classifyMerchantItem(p)
      const limit = limitMap[p.name] || 0

      // 热销 (normal)：全天在架，始终显示
      if (category === 'normal') {
        goodsAll.push({
          goods_name: p.name,
          iconUrl: p.icon_url || iconMap[p.name] || '',
          price: priceMap[p.name] || 0,
          num: '',
          category: 'normal',
          isHot: true,
          isEnded: false,
          remainingStr: `本日限购${limit}个`,
          top: 0
        })
        continue
      }

      // 周末限定 (weekend)：跨天商品，也标记热销
      if (category === 'weekend') {
        goodsAll.push({
          goods_name: p.name,
          iconUrl: p.icon_url || iconMap[p.name] || '',
          price: priceMap[p.name] || 0,
          num: '',
          category: 'weekend',
          isHot: true,
          isEnded: false,
          remainingStr: `活动期间限购${limit}个`,
          top: 0
        })
        continue
      }

      // 常规商品 (round)：仅显示当前轮次
      const roundId = getRoundForItem(p, now)
      if (roundId !== currentRoundId) continue

      const endTime = Number(p.end_time || 0)
      const isEnded = now.getTime() >= endTime || now.getTime() < Number(p.start_time || 0)

      goodsAll.push({
        goods_name: p.name,
        iconUrl: p.icon_url || iconMap[p.name] || '',
        price: priceMap[p.name] || 0,
        num: '',
        category: 'round',
        isHot: false,
        isEnded,
        remainingStr: `本轮限购${limit}个`,
        top: 0
      })
    }

    // Sort: round → normal → weekend → price desc
    const catOrder = { round: 0, normal: 1, weekend: 2 }
    goodsAll.sort((a, b) => {
      if (a.category !== b.category) return catOrder[a.category] - catOrder[b.category]
      return (b.price || 0) - (a.price || 0)
    })

    // Assign position and num
    const goods = goodsAll.map((item, i) => ({
      ...item,
      num: String(i + 1).padStart(2, '0'),
      top: startY + i * (cardHeight + gap)
    }))

    const lastCardTop = goods.length > 0 ? goods[goods.length - 1].top : startY
    const bottomFrameTop = lastCardTop + 287
    const pageHeight = bottomFrameTop + 160
    const renderHeight = Math.ceil(pageHeight * MERCHANT_CARD_OUTPUT_SCALE)
    const renderBaseHeight = pageHeight * MERCHANT_CARD_LAYOUT_SCALE

    return {
      dateStr,
      timeRange,
      goods,
      bottomFrameTop,
      pageHeight,
      renderWidth: MERCHANT_CARD_RENDER_WIDTH,
      renderHeight,
      renderBaseWidth: MERCHANT_CARD_RENDER_BASE_WIDTH,
      renderBaseHeight,
      renderScale: MERCHANT_CARD_RENDER_SCALE,
      renderZoom: MERCHANT_CARD_RENDER_ZOOM,
      renderDeviceScaleFactor: MERCHANT_CARD_DEVICE_SCALE_FACTOR,
      renderStroke11: MERCHANT_CARD_STROKE_11,
      renderStroke10: MERCHANT_CARD_STROKE_10,
      renderOffset3: MERCHANT_CARD_OFFSET_3
    }
  }

  buildTodayFallbackText (payload = {}, options = {}) {
    const now = options?.now || new Date()
    const { activity, roundGroups, todayDate } = this.extractTodayProducts(payload, now)

    const categoryOrder = ['normal', 'round', 'weekend']
    const categoryLabels = { normal: '热销商品', round: '常规商品', weekend: '周末限定' }
    const categoryMap = {}
    for (const cat of categoryOrder) {
      categoryMap[cat] = []
    }
    for (const group of roundGroups) {
      for (const product of group.products) {
        const cat = product.category || 'round'
        if (!categoryMap[cat]) categoryMap[cat] = []
        let catGroup = categoryMap[cat].find((g) => g.round_id === group.round_id)
        if (!catGroup) {
          catGroup = { round_id: group.round_id, label: group.label, is_current: group.is_current, products: [] }
          categoryMap[cat].push(catGroup)
        }
        catGroup.products.push(product)
      }
    }

    const lines = [
      `今日远行商人 (${todayDate})`,
      ''
    ]

    let hasAny = false
    for (const cat of categoryOrder) {
      const groups = categoryMap[cat]
      if (groups.length === 0) continue
      hasAny = true
      lines.push(`【${categoryLabels[cat]}】`)
      for (const group of groups) {
        group.products.forEach((product, i) => {
          lines.push(`  ${i + 1}. ${product.name}  (${product.time_label})`)
        })
      }
      lines.push('')
    }

    if (!hasAny) {
      lines.push('今日暂无已公布的远行商人商品。')
    }

    return lines.join('\n').trimEnd()
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
