import Config from '../../../utils/config.js'
import { replyLargeText } from '../../../utils/queryHelper.js'
import RocomApi from '../model/api.js'
import { buildCommandReg, formatCommand } from '../utils/command.js'

const SIZE_QUERY_REG = buildCommandReg('(?:尺寸查询|精灵尺寸)(?:\\s+(.+))?')
const MERCHANT_INFO_REG = buildCommandReg('(?:远行商人|商人信息)(?:\\s+(.+))?')
const WIKI_PET_REG = buildCommandReg('(?:wiki精灵|Wiki精灵|图鉴精灵)(?:\\s+(.+))?')
const WIKI_SKILL_REG = buildCommandReg('(?:wiki技能|Wiki技能|图鉴技能)(?:\\s+(.+))?')

function toDisplayText (value, fallback = '未返回') {
  if (value === undefined || value === null || value === '') return fallback
  return String(value)
}

function toNumber (value, fallback = NaN) {
  const num = Number(value)
  return Number.isFinite(num) ? num : fallback
}

function trimText (value = '') {
  return String(value || '').trim()
}

function truncateText (value = '', maxLength = 80) {
  const text = trimText(value)
  if (!text) return ''
  if (text.length <= maxLength) return text
  return `${text.slice(0, Math.max(0, maxLength - 1))}…`
}

function formatNumericText (value, digits = 2) {
  const num = Number(value)
  if (!Number.isFinite(num)) return '未返回'

  const factor = 10 ** digits
  const rounded = Math.round(num * factor) / factor
  if (Number.isInteger(rounded)) return String(rounded)
  return rounded.toFixed(digits).replace(/\.0+$/, '').replace(/(\.\d*[1-9])0+$/, '$1')
}

function formatRangeText (minValue, maxValue, unit = '') {
  const minText = formatNumericText(minValue)
  const maxText = formatNumericText(maxValue)

  if (minText === '未返回' && maxText === '未返回') return '未返回'
  if (minText === maxText) return `${minText}${unit}`
  if (minText === '未返回') return `<= ${maxText}${unit}`
  if (maxText === '未返回') return `>= ${minText}${unit}`
  return `${minText}-${maxText}${unit}`
}

function formatPercent (value) {
  const text = formatNumericText(value)
  return text === '未返回' ? text : `${text}%`
}

function formatDateTime (value) {
  const text = trimText(value)
  if (!text) return '未返回'

  const numeric = /^\d+$/.test(text) ? Number(text) : NaN
  const date = Number.isFinite(numeric) ? new Date(numeric) : new Date(text)
  if (Number.isNaN(date.getTime())) return text

  const pad = (num) => String(num).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}

function getNameList (items = []) {
  const names = (Array.isArray(items) ? items : [])
    .map((item) => trimText(item?.name || item))
    .filter(Boolean)

  return names.length > 0 ? names.join('、') : '未返回'
}

function formatStats (stats = {}) {
  if (!stats || typeof stats !== 'object') return '未返回'

  const fields = [
    ['hp', 'HP'],
    ['atk', '物攻'],
    ['sp_atk', '魔攻'],
    ['def', '物防'],
    ['sp_def', '魔抗'],
    ['spd', '速度'],
    ['total', '总和']
  ]

  const parts = fields
    .filter(([key]) => stats[key] !== undefined && stats[key] !== null && stats[key] !== '')
    .map(([key, label]) => `${label} ${stats[key]}`)

  return parts.length > 0 ? parts.join(' / ') : '未返回'
}

function formatTypeMatchup (payload = {}) {
  if (!payload || typeof payload !== 'object') {
    return []
  }

  const mappings = [
    ['strong_against', '克制'],
    ['weak_to', '被克'],
    ['resists', '抗性'],
    ['resisted_by', '受阻']
  ]

  return mappings
    .map(([key, label]) => {
      const values = Array.isArray(payload[key]) ? payload[key].map((item) => trimText(item)).filter(Boolean) : []
      if (values.length === 0) return ''
      return `${label}：${values.join('、')}`
    })
    .filter(Boolean)
}

function formatSkillPreview (skills = []) {
  const rows = (Array.isArray(skills) ? skills : [])
    .slice(0, 3)
    .map((skill) => {
      const parts = [
        trimText(skill?.name),
        trimText(skill?.attribute),
        trimText(skill?.category)
      ].filter(Boolean)

      const cost = skill?.cost !== undefined && skill?.cost !== null && skill?.cost !== '' ? `${skill.cost}费` : ''
      const power = skill?.power !== undefined && skill?.power !== null && skill?.power !== '' ? `${skill.power}威力` : ''
      const suffix = [cost, power].filter(Boolean).join('/')

      if (parts.length === 0) return ''
      return suffix ? `${parts[0]}(${[...parts.slice(1), suffix].join('/')})` : `${parts[0]}(${parts.slice(1).join('/')})`
    })
    .filter(Boolean)

  if (rows.length === 0) return '未返回'
  return rows.join('；')
}

function extractMatchArg (message = '', pattern = '') {
  const match = String(message || '').trim().match(new RegExp(pattern))
  return trimText(match?.[1] || '')
}

function hasApiKey () {
  return Boolean(trimText(Config.get('wegame', 'api_key')))
}

function ensureApiKey (featureLabel = '该查询') {
  if (!hasApiKey()) {
    throw new Error(`${featureLabel}需要先在 wgconfig.yaml 中填写 wegame.api_key，并确保已获批 rocom.access`)
  }
}

function parsePositiveNumber (value, fieldLabel = '参数') {
  const text = trimText(value)
  if (!/^\d+(?:\.\d+)?$/.test(text)) {
    throw new Error(`${fieldLabel}格式不正确`)
  }

  const num = Number(text)
  if (!Number.isFinite(num) || num <= 0) {
    throw new Error(`${fieldLabel}必须大于 0`)
  }

  return num
}

function parseSizeQueryArgs (raw = '') {
  const tokens = trimText(raw).split(/\s+/).filter(Boolean)
  if (tokens.length !== 2) {
    throw new Error(`格式：${formatCommand('尺寸查询 <直径米> <重量千克>')}`)
  }

  return {
    diameter: parsePositiveNumber(tokens[0], '直径'),
    weight: parsePositiveNumber(tokens[1], '重量')
  }
}

function parseWikiQueryArgs (raw = '', commandLabel = 'wiki精灵') {
  const tokens = trimText(raw).split(/\s+/).filter(Boolean)
  if (tokens.length === 0) {
    throw new Error(`格式：${formatCommand(`${commandLabel} <关键词> [数量]`)}`)
  }

  let limit = 10
  const maybeLimit = tokens[tokens.length - 1]
  if (/^\d+$/.test(maybeLimit)) {
    limit = Number(maybeLimit)
    if (limit < 1 || limit > 50) {
      throw new Error('数量仅支持 1-50')
    }
    tokens.pop()
  }

  const query = tokens.join(' ').trim()
  if (!query) {
    throw new Error(`格式：${formatCommand(`${commandLabel} <关键词> [数量]`)}`)
  }

  return { query, limit }
}

function parseMerchantArgs (raw = '') {
  const text = trimText(raw)
  if (!text) {
    return { refresh: false }
  }

  const normalized = text.toLowerCase()
  if (['刷新', 'refresh', '1', 'true'].includes(normalized)) {
    return { refresh: true }
  }

  throw new Error(`格式：${formatCommand('远行商人 [刷新]')}`)
}

function buildSizeQueryText ({ diameter, weight, data = {} }) {
  const exactResults = Array.isArray(data?.exactResults) ? data.exactResults : []
  const candidates = Array.isArray(data?.candidates) ? data.candidates : []
  const lines = [
    '精灵尺寸查询',
    `输入：直径 ${formatNumericText(diameter)} 米 / 重量 ${formatNumericText(weight)} 千克`,
    `搜索模式：${toDisplayText(data?.searchMode, '未返回')}`,
    `精确匹配：${exactResults.length}`,
    `候选结果：${candidates.length}`
  ]

  const appendRows = (title, rows = []) => {
    if (rows.length === 0) return

    lines.push('')
    lines.push(`${title}：`)

    rows.forEach((item, index) => {
      lines.push(`${index + 1}. ${toDisplayText(item?.pet, '未命名精灵')}`)
      lines.push(`Pet ID：${toDisplayText(item?.petId)}`)
      lines.push(`匹配度：${formatPercent(item?.probability)}`)
      lines.push(`直径范围：${formatRangeText(item?.diameterMin, item?.diameterMax, ' 米')}`)
      lines.push(`重量范围：${formatRangeText(item?.weightMin, item?.weightMax, ' 千克')}`)
      if (trimText(item?.petImage)) {
        lines.push(`大图：${item.petImage}`)
      }
      if (trimText(item?.petIcon)) {
        lines.push(`小图：${item.petIcon}`)
      }
      if (index !== rows.length - 1) {
        lines.push('')
      }
    })
  }

  appendRows('精确匹配', exactResults)
  appendRows('候选结果', candidates)

  if (exactResults.length === 0 && candidates.length === 0) {
    lines.push('')
    lines.push('当前没有匹配到可用结果。')
  }

  return lines.join('\n')
}

function buildMerchantInfoText (data = {}) {
  const merchantActivities = Array.isArray(data?.merchant_activities) ? data.merchant_activities : []
  const otherActivities = Array.isArray(data?.other_activities) ? data.other_activities : []
  const lines = [
    '远行商人信息',
    `远行商人活动：${merchantActivities.length}`,
    `其他活动：${otherActivities.length}`
  ]

  if (merchantActivities.length > 0) {
    lines.push('')
    lines.push('远行商人活动：')

    merchantActivities.forEach((item, index) => {
      lines.push(`${index + 1}. ${toDisplayText(item?.name, '未命名活动')}`)
      lines.push(`开始日期：${toDisplayText(item?.start_date)}`)
      lines.push(`开始时间：${formatDateTime(item?.start_time)}`)
      lines.push(`结束时间：${formatDateTime(item?.end_time)}`)
      lines.push(`可领道具：${getNameList(item?.get_props)}`)
      lines.push(`可得精灵：${getNameList(item?.get_pets)}`)
      if (index !== merchantActivities.length - 1) {
        lines.push('')
      }
    })
  }

  if (otherActivities.length > 0) {
    lines.push('')
    lines.push('其他活动：')
    otherActivities.forEach((item, index) => {
      lines.push(`${index + 1}. ${toDisplayText(item?.name, '未命名活动')}`)
    })
  }

  if (merchantActivities.length === 0 && otherActivities.length === 0) {
    lines.push('')
    lines.push('当前没有读取到活动数据。')
  }

  return lines.join('\n')
}

function buildWikiPetText ({ query, limit, data = {} }) {
  const results = Array.isArray(data?.results) ? data.results : []
  const lines = [
    '洛克 Wiki 精灵查询',
    `关键词：${query}`,
    `请求数量：${limit}`,
    `命中结果：${toDisplayText(data?.total, results.length)}`
  ]

  if (results.length === 0) {
    lines.push('')
    lines.push('没有匹配到精灵。')
    return lines.join('\n')
  }

  lines.push('')
  results.forEach((item, index) => {
    lines.push(`${index + 1}. ${toDisplayText(item?.name, '未命名精灵')}`)
    lines.push(`编号：${toDisplayText(item?.no)}`)
    if (trimText(item?.form)) {
      lines.push(`形态：${item.form}`)
    }
    lines.push(`属性：${Array.isArray(item?.attributes) && item.attributes.length > 0 ? item.attributes.join('、') : '未返回'}`)
    lines.push(`种族：${formatStats(item?.stats)}`)
    if (trimText(item?.ability_name)) {
      lines.push(`特性：${item.ability_name}`)
    }
    if (trimText(item?.ability_desc)) {
      lines.push(`特性说明：${truncateText(item.ability_desc, 90)}`)
    }
    for (const matchupLine of formatTypeMatchup(item?.type_matchup)) {
      lines.push(matchupLine)
    }
    lines.push(`技能预览：${formatSkillPreview(item?.skills)}`)
    if (trimText(item?.image_url)) {
      lines.push(`图片：${item.image_url}`)
    }
    if (trimText(item?.url)) {
      lines.push(`页面：${item.url}`)
    }
    lines.push(`更新时间：${formatDateTime(item?.updated_at)}`)

    if (index !== results.length - 1) {
      lines.push('')
    }
  })

  return lines.join('\n')
}

function buildWikiSkillText ({ query, limit, data = {} }) {
  const results = Array.isArray(data?.results) ? data.results : []
  const lines = [
    '洛克 Wiki 技能查询',
    `关键词：${query}`,
    `请求数量：${limit}`,
    `命中结果：${toDisplayText(data?.total, results.length)}`
  ]

  if (results.length === 0) {
    lines.push('')
    lines.push('没有匹配到技能。')
    return lines.join('\n')
  }

  lines.push('')
  results.forEach((item, index) => {
    lines.push(`${index + 1}. ${toDisplayText(item?.name, '未命名技能')}`)
    lines.push(`属性：${toDisplayText(item?.attribute)}`)
    lines.push(`分类：${toDisplayText(item?.category)}`)
    lines.push(`费用：${toDisplayText(item?.cost)}`)
    lines.push(`威力：${toDisplayText(item?.power)}`)
    lines.push(`描述：${truncateText(item?.description, 120) || '未返回'}`)
    lines.push(`更新时间：${formatDateTime(item?.updated_at)}`)

    if (index !== results.length - 1) {
      lines.push('')
    }
  })

  return lines.join('\n')
}

export class RocomTools extends plugin {
  constructor (e) {
    super({
      name: '[WeGame-plugin][rocom] 工具查询',
      dsc: '洛克王国世界工具与 Wiki 查询',
      event: 'message',
      priority: 114,
      rule: [
        {
          reg: SIZE_QUERY_REG,
          fnc: 'queryPetSize'
        },
        {
          reg: MERCHANT_INFO_REG,
          fnc: 'queryMerchantInfo'
        },
        {
          reg: WIKI_PET_REG,
          fnc: 'queryWikiPet'
        },
        {
          reg: WIKI_SKILL_REG,
          fnc: 'queryWikiSkill'
        }
      ]
    })

    this.e = e
    this.api = new RocomApi()
  }

  async queryPetSize () {
    try {
      ensureApiKey('精灵尺寸查询')
      const args = parseSizeQueryArgs(extractMatchArg(this.e.msg, SIZE_QUERY_REG))
      await this.reply(`正在查询精灵尺寸：直径 ${formatNumericText(args.diameter)} 米，重量 ${formatNumericText(args.weight)} 千克...`)
      const data = await this.api.getPetSizeQuery(args)
      await replyLargeText(this, '精灵尺寸查询', buildSizeQueryText({ ...args, data }))
      return true
    } catch (error) {
      logger.error('[WeGame-plugin][rocom] 精灵尺寸查询失败', error)
      await this.reply(`精灵尺寸查询失败：${error.message || error}`)
      return true
    }
  }

  async queryMerchantInfo () {
    try {
      const args = parseMerchantArgs(extractMatchArg(this.e.msg, MERCHANT_INFO_REG))
      await this.reply(args.refresh ? '正在强制刷新远行商人信息...' : '正在查询远行商人信息...')
      const data = await this.api.getMerchantInfo(args)
      await replyLargeText(this, '远行商人信息', buildMerchantInfoText(data))
      return true
    } catch (error) {
      logger.error('[WeGame-plugin][rocom] 远行商人信息查询失败', error)
      await this.reply(`远行商人信息查询失败：${error.message || error}`)
      return true
    }
  }

  async queryWikiPet () {
    try {
      ensureApiKey('Wiki 精灵查询')
      const args = parseWikiQueryArgs(extractMatchArg(this.e.msg, WIKI_PET_REG), 'wiki精灵')
      await this.reply(`正在查询 Wiki 精灵：${args.query}`)
      const data = await this.api.searchWikiPet({
        q: args.query,
        limit: args.limit
      })
      await replyLargeText(this, '洛克 Wiki 精灵查询', buildWikiPetText({ ...args, data }))
      return true
    } catch (error) {
      logger.error('[WeGame-plugin][rocom] Wiki 精灵查询失败', error)
      await this.reply(`Wiki 精灵查询失败：${error.message || error}`)
      return true
    }
  }

  async queryWikiSkill () {
    try {
      ensureApiKey('Wiki 技能查询')
      const args = parseWikiQueryArgs(extractMatchArg(this.e.msg, WIKI_SKILL_REG), 'wiki技能')
      await this.reply(`正在查询 Wiki 技能：${args.query}`)
      const data = await this.api.searchWikiSkill({
        q: args.query,
        limit: args.limit
      })
      await replyLargeText(this, '洛克 Wiki 技能查询', buildWikiSkillText({ ...args, data }))
      return true
    } catch (error) {
      logger.error('[WeGame-plugin][rocom] Wiki 技能查询失败', error)
      await this.reply(`Wiki 技能查询失败：${error.message || error}`)
      return true
    }
  }
}
