import fs from 'node:fs'
import path from 'node:path'
import { trimText } from '../utils/rocom.js'

/**
 * 当天远行商人实时价格记录。
 *
 * 实时接口只返回**当前轮次**的商品价格，轮次一过就拿不到了；旧接口
 * `random_goods[].price` 恒为 0，所以历史轮次的商品在「今日远行商人」里
 * 只能显示价格 0。这里把每轮观察到的实时价格按 goods_id + 轮次记下来，
 * 供当天后续轮次补价。
 *
 * 按游戏内自然日（Asia/Shanghai）分桶，跨过 00:00 自动清空。
 */

const DATA_DIR = path.join(process.cwd(), 'data', 'wegame-plugin')
const DATA_PATH = path.join(DATA_DIR, 'rocom_merchant_price_log.json')

const chinaDateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Shanghai',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit'
})

function getChinaDateKey (date = new Date()) {
  return chinaDateFormatter.format(date)
}

function toPositiveNumber (value) {
  const num = Number(value)
  return Number.isFinite(num) && num > 0 ? num : 0
}

function emptyState () {
  return { date: '', updated_at: '', items: {} }
}

class MerchantPriceLog {
  constructor (filePath = DATA_PATH) {
    this.filePath = filePath
    this.state = null
  }

  ensureDir () {
    const dir = path.dirname(this.filePath)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }
  }

  /** 读盘；日期不是今天就当作已清空 */
  load (now = new Date()) {
    const today = getChinaDateKey(now)

    if (this.state && this.state.date === today) {
      return this.state
    }

    let raw = null
    try {
      if (fs.existsSync(this.filePath)) {
        raw = JSON.parse(fs.readFileSync(this.filePath, 'utf8'))
      }
    } catch (error) {
      logger?.warn?.(`[WeGame-plugin][rocom] 读取远行商人价格记录失败：${error?.message || error}`)
    }

    if (!raw || typeof raw !== 'object' || raw.date !== today) {
      this.state = { ...emptyState(), date: today }
      if (raw && raw.date !== today) {
        this.save(now)
      }
      return this.state
    }

    this.state = {
      date: today,
      updated_at: trimText(raw.updated_at),
      items: raw.items && typeof raw.items === 'object' ? raw.items : {}
    }
    return this.state
  }

  save (now = new Date()) {
    try {
      this.ensureDir()
      const payload = {
        date: this.state?.date || getChinaDateKey(now),
        updated_at: new Date().toISOString(),
        items: this.state?.items || {}
      }
      this.state = payload
      const tempPath = `${this.filePath}.tmp`
      fs.writeFileSync(tempPath, JSON.stringify(payload, null, 2), 'utf8')
      fs.renameSync(tempPath, this.filePath)
    } catch (error) {
      logger?.warn?.(`[WeGame-plugin][rocom] 写入远行商人价格记录失败：${error?.message || error}`)
    }
  }

  /** 记录一批实时商品（价格 <= 0 的跳过，避免把无效值写进去） */
  record (goods = [], options = {}) {
    const now = options?.now instanceof Date ? options.now : new Date()
    const state = this.load(now)
    const round = Number(options?.round) || 0
    let changed = false

    for (const item of Array.isArray(goods) ? goods : []) {
      const goodsId = Number(item?.goods_id)
      const price = toPositiveNumber(item?.price)
      if (!Number.isFinite(goodsId) || goodsId <= 0 || price <= 0) continue

      const key = String(goodsId)
      const entry = state.items[key] || {
        goods_id: goodsId,
        name: trimText(item?.goods_name),
        item_id: Number(item?.item_id) || 0,
        item_num: Number(item?.item_num) || 1,
        buy_limit_num: Number(item?.buy_limit_num) || 0,
        by_round: {},
        price: 0,
        origin_price: 0,
        round: 0
      }

      if (!entry.name && item?.goods_name) entry.name = trimText(item.goods_name)
      if (!entry.item_id && item?.item_id) entry.item_id = Number(item.item_id)
      if (!entry.item_num && item?.item_num) entry.item_num = Number(item.item_num)
      if (!entry.buy_limit_num && item?.buy_limit_num) entry.buy_limit_num = Number(item.buy_limit_num)

      const snapshot = {
        price,
        origin_price: toPositiveNumber(item?.origin_price) || price,
        buy_limit_num: Number(item?.buy_limit_num) || entry.buy_limit_num || 0,
        at: now.toISOString()
      }

      entry.by_round[String(round || 0)] = snapshot
      // 顶层存最近一次观察到的价格，供没有轮次命中的商品兜底
      entry.price = snapshot.price
      entry.origin_price = snapshot.origin_price
      entry.round = round || entry.round
      state.items[key] = entry
      changed = true
    }

    if (changed) this.save(now)
    return changed
  }

  /** 按 goods_id（优先同名轮次）查当天记录，查不到再退回商品名 */
  lookup (goodsId, name = '', round = 0) {
    const state = this.load()
    const items = state.items || {}

    const fromEntry = (entry) => {
      if (!entry) return null
      const byRound = entry.by_round || {}
      const matched = byRound[String(Number(round) || 0)]
      const source = matched || { price: entry.price, origin_price: entry.origin_price, buy_limit_num: entry.buy_limit_num }
      const price = toPositiveNumber(source?.price)
      if (price <= 0) return null

      return {
        goods_id: Number(entry.goods_id) || 0,
        name: trimText(entry.name),
        price,
        origin_price: toPositiveNumber(source?.origin_price) || price,
        buy_limit_num: Number(source?.buy_limit_num) || Number(entry.buy_limit_num) || 0,
        item_id: Number(entry.item_id) || 0,
        item_num: Number(entry.item_num) || 1,
        round: Number(round) || Number(entry.round) || 0,
        source: 'log'
      }
    }

    const normalizedId = Number(goodsId)
    if (Number.isFinite(normalizedId) && normalizedId > 0) {
      const direct = fromEntry(items[String(normalizedId)])
      if (direct) return direct
    }

    const normalizedName = trimText(name)
    if (!normalizedName) return null

    for (const entry of Object.values(items)) {
      if (trimText(entry?.name) === normalizedName) {
        const found = fromEntry(entry)
        if (found) return found
      }
    }

    return null
  }

  /** 调试 / 测试用：当前记录快照 */
  snapshot () {
    return JSON.parse(JSON.stringify(this.load()))
  }

  clear (now = new Date()) {
    this.state = { ...emptyState(), date: getChinaDateKey(now) }
    this.save(now)
  }
}

const merchantPriceLog = new MerchantPriceLog()

export {
  MerchantPriceLog,
  getChinaDateKey
}

export default merchantPriceLog
