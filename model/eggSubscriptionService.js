import fs from 'node:fs'
import path from 'node:path'
import { trimText } from '../utils/rocom.js'

const DATA_DIR = path.join(process.cwd(), 'data', 'wegame-plugin')
const DATA_PATH = path.join(DATA_DIR, 'rocom_egg_subscriptions.json')

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

function normalizeTargetType (value = '') {
  const text = trimText(value).toLowerCase()
  if (text === TARGET_PRIVATE || text === 'user' || text === 'friend') return TARGET_PRIVATE
  return TARGET_GROUP
}

/**
 * 订阅键：群订阅 `bot:group:群号:UID`，私聊订阅 `bot:private:用户号:UID`。
 * 和远行商人订阅不同，这里必须带 UID，因为一个用户/群可能同时监控多个家园。
 */
function buildEggSubscriptionKey (botId, targetId, targetType = TARGET_GROUP, uid = '') {
  const normalizedBotId = trimText(botId) || 'bot'
  const normalizedTargetId = trimText(targetId)
  const normalizedUid = trimText(uid)
  const normalizedType = normalizeTargetType(targetType)

  if (!normalizedTargetId) {
    throw new Error(normalizedType === TARGET_PRIVATE
      ? '缺少用户号，无法生成蛋订阅键'
      : '缺少群号，无法生成蛋订阅键')
  }

  if (!normalizedUid) {
    throw new Error('缺少目标 UID，无法生成蛋订阅键')
  }

  return normalizedType === TARGET_PRIVATE
    ? `${normalizedBotId}:${TARGET_PRIVATE}:${normalizedTargetId}:${normalizedUid}`
    : `${normalizedBotId}:${TARGET_GROUP}:${normalizedTargetId}:${normalizedUid}`
}

function normalizeSubscription (key = '', payload = {}) {
  const targetType = normalizeTargetType(payload?.target_type || payload?.targetType)

  return {
    key: trimText(key),
    target_type: targetType,
    bot_id: trimText(payload?.bot_id || payload?.botId),
    group_id: targetType === TARGET_GROUP ? trimText(payload?.group_id || payload?.groupId) : '',
    user_id: trimText(payload?.user_id || payload?.userId),
    target_uid: trimText(payload?.target_uid || payload?.targetUid),
    mention_all: payload?.mention_all === true || payload?.mentionAll === true,
    last_egg_count: Number(payload?.last_egg_count ?? payload?.lastEggCount ?? 0) || 0,
    last_pushed_egg_count: Number(payload?.last_pushed_egg_count ?? payload?.lastPushedEggCount ?? 0) || 0,
    last_push_time: trimText(payload?.last_push_time || payload?.lastPushTime),
    last_check_time: trimText(payload?.last_check_time || payload?.lastCheckTime),
    updated_by: trimText(payload?.updated_by || payload?.updatedBy),
    updated_at: trimText(payload?.updated_at || payload?.updatedAt) || new Date().toISOString()
  }
}

class EggSubscriptionService {
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
      logger.error('[WeGame-plugin][rocom] 读取蛋订阅数据失败', error)
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

  /**
   * 获取某个用户/群的所有订阅（用于列出自己的订阅列表）
   */
  async getSubscriptionsByTarget (botId, targetId, targetType = TARGET_GROUP) {
    const all = this.loadAll()
    const normalizedType = normalizeTargetType(targetType)
    const normalizedBotId = trimText(botId)
    const normalizedTargetId = trimText(targetId)

    return Object.values(all).filter((sub) =>
      sub.bot_id === normalizedBotId &&
      sub.target_type === normalizedType &&
      (normalizedType === TARGET_GROUP
        ? sub.group_id === normalizedTargetId
        : sub.user_id === normalizedTargetId)
    )
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

  /**
   * 批量更新订阅状态（轮询后写入最新蛋数量和推送时间）。
   */
  async batchUpdateSubscriptions (updates = []) {
    if (!Array.isArray(updates) || updates.length === 0) return

    const all = this.loadAll()
    let changed = false

    for (const update of updates) {
      const key = trimText(update?.key)
      if (!key || !all[key]) continue
      all[key] = normalizeSubscription(key, {
        ...all[key],
        ...update,
        key
      })
      changed = true
    }

    if (changed) {
      this.saveAll(all)
    }
  }
}

const eggSubscriptionService = new EggSubscriptionService()

export {
  TARGET_GROUP,
  TARGET_PRIVATE,
  EggSubscriptionService,
  buildEggSubscriptionKey,
  normalizeTargetType
}

export default eggSubscriptionService
