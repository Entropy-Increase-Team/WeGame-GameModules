import fs from 'node:fs'
import path from 'node:path'
import RocomApi from './api.js'
import { trimText } from '../utils/rocom.js'

const DATA_DIR = path.join(process.cwd(), 'data', 'wegame-plugin')
const DATA_PATH = path.join(DATA_DIR, 'rocom_merchant_catalog.json')

// 商品池变化很慢，内存缓存 6 小时，避免订阅轮询反复拉全量
const CATALOG_TTL_MS = 6 * 60 * 60 * 1000

// 「全物品订阅」的写法
const ALL_ALIASES = new Set(['全部', '全物品', '全部物品', '所有', '所有物品', 'all', '*'])

function deepClone (payload) {
  return payload === undefined ? undefined : JSON.parse(JSON.stringify(payload))
}

function ensureDataDir () {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true })
  }
}

function isAllAlias (token = '') {
  return ALL_ALIASES.has(trimText(token).toLowerCase())
}

/**
 * 把后端商品池归一成带序号的目录。
 *
 * 序号只取后端返回的顺序（index = 位置 + 1），解析订阅时立刻换成商品名落盘，
 * 所以后端调整目录顺序不会影响已有订阅。
 */
function buildMerchantCatalog (randomGoods = []) {
  const items = []
  const seen = new Set()

  for (const raw of Array.isArray(randomGoods) ? randomGoods : []) {
    const name = trimText(raw?.goods_name)
    if (!name || seen.has(name)) continue
    seen.add(name)

    items.push({
      index: items.length + 1,
      name,
      goods_id: Number(raw?.id) || 0,
      item_id: Number(raw?.item_id) || 0,
      item_num: Number(raw?.item_num) || 1
    })
  }

  return items
}

/** 锅巴下拉选项：序号 + 名称，值统一用商品名 */
function buildMerchantCatalogOptions (catalog = []) {
  return (Array.isArray(catalog) ? catalog : []).map((item) => ({
    label: `${Number(item?.index) || 0}. ${trimText(item?.name)}`,
    value: trimText(item?.name)
  }))
}

/**
 * 解析用户输入：序号 / 商品名 / 全部。
 *
 * - 纯数字按序号查目录，命中后换成规范名
 * - 目录里没有的文字按原样保留（后端随时会加新商品），同时记进 unrecognizedNames 供提示
 * - 目录为空（离线）时不报未识别，避免误伤
 */
function resolveMerchantSelection (input = [], catalog = []) {
  const list = Array.isArray(input) ? input : [input]
  const items = Array.isArray(catalog) ? catalog : []

  const names = []
  const seen = new Set()
  const unknownIndexes = []
  const unrecognizedNames = []
  let all = false

  const pushName = (value) => {
    const text = trimText(value)
    if (!text || seen.has(text)) return
    seen.add(text)
    names.push(text)
  }

  for (const raw of list) {
    const token = trimText(raw)
    if (!token) continue

    if (isAllAlias(token)) {
      all = true
      continue
    }

    if (/^\d+$/.test(token)) {
      const hit = items.find((item) => Number(item?.index) === Number(token))
      if (hit) pushName(hit.name)
      else unknownIndexes.push(token)
      continue
    }

    const hit = items.find((item) => trimText(item?.name) === token)
    if (hit) {
      pushName(hit.name)
      continue
    }

    pushName(token)
    if (items.length > 0) unrecognizedNames.push(token)
  }

  return {
    all,
    names,
    unknownIndexes,
    unrecognizedNames
  }
}

class MerchantCatalogService {
  constructor (filePath = DATA_PATH) {
    this.filePath = filePath
    this.api = new RocomApi()
    this.memory = null
  }

  /** 同步读磁盘缓存，供锅巴在模块加载阶段构建下拉选项 */
  loadCachedCatalog () {
    try {
      const raw = JSON.parse(fs.readFileSync(this.filePath, 'utf8'))
      const items = Array.isArray(raw?.items) ? raw.items : []
      return items.filter((item) => trimText(item?.name))
    } catch {
      return []
    }
  }

  writeCache (items = []) {
    try {
      ensureDataDir()
      const payload = {
        updated_at: new Date().toISOString(),
        source: 'merchant/info?random_goods=all',
        items
      }

      const tempPath = `${this.filePath}.tmp`
      fs.writeFileSync(tempPath, JSON.stringify(payload, null, 2), 'utf8')
      fs.renameSync(tempPath, this.filePath)
      return true
    } catch (error) {
      logger.warn(`[WeGame-plugin][rocom] 写入远行商人商品目录失败：${error?.message || error}`)
      return false
    }
  }

  /**
   * 取商品目录：内存缓存 → 后端全量商品池 → 磁盘缓存。
   * 全链路失败时返回上一次的目录（可能为空），由调用方决定怎么提示。
   */
  async getCatalog (options = {}) {
    const now = Date.now()
    const cached = this.memory

    if (!options.refresh && cached && cached.items.length > 0 && now - cached.at < CATALOG_TTL_MS) {
      return deepClone(cached.items)
    }

    try {
      const payload = await this.api.getMerchantInfo(
        { random_goods: 'all' },
        { userIdentifier: options.userIdentifier }
      )
      const items = buildMerchantCatalog(payload?.random_goods)

      if (items.length > 0) {
        this.memory = { at: now, items }
        this.writeCache(items)
        return deepClone(items)
      }

      logger.warn('[WeGame-plugin][rocom] 远行商人商品目录为空，沿用本地缓存')
    } catch (error) {
      logger.warn(`[WeGame-plugin][rocom] 拉取远行商人商品目录失败：${error?.message || error}`)
    }

    const disk = this.loadCachedCatalog()
    if (disk.length > 0) {
      this.memory = { at: now, items: disk }
      return deepClone(disk)
    }

    return cached?.items ? deepClone(cached.items) : []
  }
}

const merchantCatalogService = new MerchantCatalogService()

export {
  ALL_ALIASES,
  MerchantCatalogService,
  buildMerchantCatalog,
  buildMerchantCatalogOptions,
  isAllAlias,
  resolveMerchantSelection
}

export default merchantCatalogService
