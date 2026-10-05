import fs from 'node:fs'
import path from 'node:path'
import { trimText } from '../utils/rocom.js'
import { isAllAlias } from './merchantCatalogService.js'

const DATA_DIR = path.join(process.cwd(), 'data', 'wegame-plugin')
const DATA_PATH = path.join(DATA_DIR, 'rocom_merchant_subscriptions.json')

function deepClone (payload) {
  return payload === undefined ? undefined : JSON.parse(JSON.stringify(payload))
}

function ensureDataDir () {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true })
  }
}

const TARGET_GROUP = 'group'
const TARGET_PRIVATE = 'private'

const MODE_ITEMS = 'items'
const MODE_ALL = 'all'

function normalizeTargetType (value = '') {
  const text = trimText(value).toLowerCase()
  if (text === TARGET_PRIVATE || text === 'user' || text === 'friend') return TARGET_PRIVATE
  return TARGET_GROUP
}

function normalizeMode (value = '') {
  return trimText(value).toLowerCase() === MODE_ALL ? MODE_ALL : MODE_ITEMS
}

/**
 * 订阅键：群订阅保持旧的 `bot:群号` 不变（兼容已有数据），
 * 私聊订阅用 `bot:private:用户号` 区分。
 */
function buildMerchantSubscriptionKey (botId, targetId, targetType = TARGET_GROUP) {
  const normalizedBotId = trimText(botId) || 'bot'
  const normalizedTargetId = trimText(targetId)
  const normalizedType = normalizeTargetType(targetType)

  if (!normalizedTargetId) {
    throw new Error(normalizedType === TARGET_PRIVATE
      ? '缺少用户号，无法生成远行商人订阅键'
      : '缺少群号，无法生成远行商人订阅键')
  }

  return normalizedType === TARGET_PRIVATE
    ? `${normalizedBotId}:${TARGET_PRIVATE}:${normalizedTargetId}`
    : `${normalizedBotId}:${normalizedTargetId}`
}

function normalizeItems (items = []) {
  const output = []
  const seen = new Set()

  for (const item of Array.isArray(items) ? items : []) {
    const text = trimText(item)
    if (!text || seen.has(text)) continue
    output.push(text)
    seen.add(text)
  }

  return output
}

function normalizeSubscription (key = '', payload = {}) {
  const targetType = normalizeTargetType(payload?.target_type || payload?.targetType)

  return {
    key: trimText(key),
    target_type: targetType,
    bot_id: trimText(payload?.bot_id || payload?.botId),
    group_id: targetType === TARGET_GROUP ? trimText(payload?.group_id || payload?.groupId) : '',
    user_id: trimText(payload?.user_id || payload?.userId),
    mode: normalizeMode(payload?.mode),
    mention_all: payload?.mention_all === true || payload?.mentionAll === true,
    items: normalizeItems(payload?.items),
    last_push_round: trimText(payload?.last_push_round || payload?.lastPushRound),
    last_matched_items: normalizeItems(payload?.last_matched_items || payload?.lastMatchedItems),
    updated_by: trimText(payload?.updated_by || payload?.updatedBy),
    updated_at: trimText(payload?.updated_at || payload?.updatedAt) || new Date().toISOString()
  }
}

function splitMerchantSubscriptionTokens (rawText = '') {
  return String(rawText || '')
    .split(/[\s,，、/|；;]+/)
    .map((item) => trimText(item))
    .filter(Boolean)
}

function splitMerchantSubscriptionItems (rawText = '') {
  return normalizeItems(splitMerchantSubscriptionTokens(rawText))
}

// 「命中后 @全体」的写法；纯数字留给商品序号
const MENTION_ALL_ALIASES = new Set(['@全体', '全体', '@所有人', 'at全体', 'at所有人'])

/**
 * 解析订阅参数。
 *
 * 支持：`1 3 5`（商品序号）、`国王球 棱镜球`（商品名）、`全部`（全物品订阅）、
 * `@全体`（命中后尝试 @全体）。开头的 `0` 仍按旧写法理解为「关闭 @全体」——
 * 序号从 1 开始，0 不会是有效序号。
 */
function parseMerchantSubscriptionArgs (rawText = '') {
  const text = trimText(rawText)
  if (!text) {
    return {
      mentionAll: null,
      all: false,
      tokens: [],
      customItems: null
    }
  }

  const tokens = splitMerchantSubscriptionTokens(text)
  let mentionAll = null
  let all = false
  const items = []

  for (const token of tokens) {
    const lowered = token.toLowerCase()

    if (MENTION_ALL_ALIASES.has(lowered)) {
      mentionAll = true
      continue
    }

    if (isAllAlias(token)) {
      all = true
      continue
    }

    if (token === '0' && mentionAll === null && items.length === 0) {
      mentionAll = false
      continue
    }

    items.push(token)
  }

  return {
    mentionAll,
    all,
    tokens: items,
    customItems: items.length > 0 ? items : null
  }
}

class MerchantSubscriptionService {
  constructor (filePath = DATA_PATH) {
    this.filePath = filePath
    this.cache = null
  }

  ensureFile () {
    ensureDataDir()
    if (!fs.existsSync(this.filePath)) {
      fs.writeFileSync(this.filePath, '{}', 'utf8')
    }
  }

  loadAll () {
    this.ensureFile()

    if (this.cache) {
      return deepClone(this.cache)
    }

    try {
      const raw = JSON.parse(fs.readFileSync(this.filePath, 'utf8'))
      const output = {}

      for (const [key, value] of Object.entries(raw || {})) {
        output[key] = normalizeSubscription(key, value)
      }

      this.cache = output
      return deepClone(output)
    } catch (error) {
      logger.error('[WeGame-plugin][rocom] 读取远行商人订阅数据失败', error)
      this.cache = {}
      return {}
    }
  }

  saveAll (payload = {}) {
    this.ensureFile()

    const normalized = {}
    for (const [key, value] of Object.entries(payload || {})) {
      normalized[key] = normalizeSubscription(key, value)
    }

    const tempPath = `${this.filePath}.tmp`
    fs.writeFileSync(tempPath, JSON.stringify(normalized, null, 2), 'utf8')
    fs.renameSync(tempPath, this.filePath)
    this.cache = normalized
    return deepClone(normalized)
  }

  async getAllSubscriptions () {
    return this.loadAll()
  }

  async getSubscription (key = '') {
    const all = this.loadAll()
    const normalizedKey = trimText(key)
    return normalizedKey ? (all[normalizedKey] || null) : null
  }

  async upsertSubscription (key = '', payload = {}) {
    const normalizedKey = trimText(key)
    if (!normalizedKey) {
      throw new Error('缺少订阅键')
    }

    const all = this.loadAll()
    all[normalizedKey] = normalizeSubscription(normalizedKey, payload)
    this.saveAll(all)
    return deepClone(all[normalizedKey])
  }

  async deleteSubscription (key = '') {
    const normalizedKey = trimText(key)
    if (!normalizedKey) return false

    const all = this.loadAll()
    if (!all[normalizedKey]) return false

    delete all[normalizedKey]
    this.saveAll(all)
    return true
  }
}

const merchantSubscriptionService = new MerchantSubscriptionService()

export {
  MODE_ALL,
  MODE_ITEMS,
  MerchantSubscriptionService,
  TARGET_GROUP,
  TARGET_PRIVATE,
  buildMerchantSubscriptionKey,
  normalizeMode,
  normalizeTargetType,
  parseMerchantSubscriptionArgs,
  splitMerchantSubscriptionItems,
  splitMerchantSubscriptionTokens
}

export default merchantSubscriptionService
