import fs from 'node:fs'
import path from 'node:path'
import { trimText } from '../utils/rocom.js'

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

function buildMerchantSubscriptionKey (botId, groupId) {
  const normalizedBotId = trimText(botId) || 'bot'
  const normalizedGroupId = trimText(groupId)
  if (!normalizedGroupId) {
    throw new Error('缺少群号，无法生成远行商人订阅键')
  }
  return `${normalizedBotId}:${normalizedGroupId}`
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
  return {
    key: trimText(key),
    group_id: trimText(payload?.group_id || payload?.groupId),
    bot_id: trimText(payload?.bot_id || payload?.botId),
    mention_all: payload?.mention_all === true || payload?.mentionAll === true,
    items: normalizeItems(payload?.items),
    last_push_round: trimText(payload?.last_push_round || payload?.lastPushRound),
    last_matched_items: normalizeItems(payload?.last_matched_items || payload?.lastMatchedItems),
    updated_by: trimText(payload?.updated_by || payload?.updatedBy),
    updated_at: trimText(payload?.updated_at || payload?.updatedAt) || new Date().toISOString()
  }
}

function splitMerchantSubscriptionItems (rawText = '') {
  const parts = String(rawText || '').split(/[\s,，、/|；;]+/)
  return normalizeItems(parts)
}

function parseMerchantSubscriptionArgs (rawText = '') {
  const text = trimText(rawText)
  if (!text) {
    return {
      mentionAll: false,
      customItems: null
    }
  }

  const tokens = text.split(/\s+/, 2)
  let mentionAll = false
  let itemsText = text

  if (tokens[0] === '0' || tokens[0] === '1') {
    mentionAll = tokens[0] === '1'
    itemsText = text.slice(tokens[0].length).trim()
  }

  const customItems = splitMerchantSubscriptionItems(itemsText)
  return {
    mentionAll,
    customItems: customItems.length > 0 ? customItems : null
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
  MerchantSubscriptionService,
  buildMerchantSubscriptionKey,
  parseMerchantSubscriptionArgs,
  splitMerchantSubscriptionItems
}

export default merchantSubscriptionService
