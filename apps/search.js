import common from '../../../../../lib/common/common.js'
import WeGameAccountService from '../../../model/accountService.js'
import RocomApi from '../model/api.js'
import { buildCommandReg, formatCommand } from '../utils/command.js'

const UID_SEARCH_REG = buildCommandReg('(?:uid|UID)(?:\\s*(\\d+))?')
const EMPTY_BUFFER_VALUE_REG = /^<\s*\d+B\s*>$/
const STRUCTURED_VALUE_REG = /^\([^()]+,\s*\d+B\)$/
const DISPLAY_FIELDS = [
  {
    label: 'UID',
    fields: ['uid', 'uin', 'id'],
    rowLabels: ['UID', '用户ID', '角色ID']
  },
  {
    label: '昵称',
    fields: ['name', 'nickname'],
    rowLabels: ['昵称']
  },
  {
    label: '等级',
    fields: ['level'],
    rowLabels: ['等级']
  },
  {
    label: '在线状态',
    fields: ['online', 'is_online', 'online_status'],
    rowLabels: ['在线状态', '是否在线'],
    formatter: formatOnlineValue
  },
  {
    label: '最后离线时间',
    fields: ['last_logout_time', 'last_offline_time', 'logout_time', 'offline_time'],
    rowLabels: ['最后离线时间', '离线时间'],
    formatter: formatTimeValue
  },
  {
    label: '个性签名',
    fields: ['signature'],
    rowLabels: ['个性签名'],
    formatter: formatSignatureValue
  },
  {
    label: '世界等级',
    fields: ['world_level', 'world_lv', 'worldlevel'],
    rowLabels: ['世界等级']
  },
  {
    label: '注册时间',
    fields: ['register_time', 'create_time', 'reg_time'],
    rowLabels: ['注册时间', '创建时间'],
    formatter: formatTimeValue
  },
  {
    label: '图鉴收集数',
    fields: ['collection_count', 'current_collection_count', 'collection_num', 'illustration_count'],
    rowLabels: ['图鉴收集数', '收藏数', '图鉴数量']
  },
  {
    label: '家园名称',
    fields: ['home_name', 'homeland_name', 'estate_name'],
    rowLabels: ['家园名称'],
    formatter: formatNoneValue
  },
  {
    label: '家园经验',
    fields: ['home_exp', 'home_experience', 'homeland_exp'],
    rowLabels: ['家园经验']
  },
  {
    label: '家园等级',
    fields: ['home_level', 'homeland_level'],
    rowLabels: ['家园等级']
  },
  {
    label: '房间等级',
    fields: ['room_level'],
    rowLabels: ['房间等级']
  },
  {
    label: '家园舒适度',
    fields: ['home_comfort', 'comfort', 'comfort_value', 'homeland_comfort'],
    rowLabels: ['家园舒适度', '舒适度']
  }
]
const CARD_IMAGE_FIELDS = ['background_url', 'card_url', 'card_image', 'name_card']
const CARD_IMAGE_LABELS = ['名片', '名片链接', '名片地址']

function trimText (value = '') {
  return String(value || '').trim()
}

function stripWrappedQuotes (value = '') {
  const text = trimText(value)
  if ((text.startsWith("'") && text.endsWith("'")) || (text.startsWith('"') && text.endsWith('"'))) {
    return text.slice(1, -1)
  }
  return text
}

function isStructuredValue (value = '') {
  return STRUCTURED_VALUE_REG.test(trimText(value))
}

function isEmptyBufferValue (value = '') {
  return EMPTY_BUFFER_VALUE_REG.test(trimText(value))
}

function normalizeSearchRow (row = {}) {
  return {
    field: trimText(row?.field),
    label: trimText(row?.label),
    value: stripWrappedQuotes(row?.value)
  }
}

function formatOnlineValue (value = '') {
  const text = trimText(value).toLowerCase()
  if (['1', 'true', 'yes', '在线'].includes(text)) return '是'
  if (['0', 'false', 'no', '离线'].includes(text)) return '否'
  return trimText(value)
}

function formatSignatureValue (value = '') {
  const text = trimText(value)
  return text || '未填写'
}

function formatNoneValue (value = '') {
  const text = trimText(value)
  return text || '无'
}

function formatTimeValue (value = '') {
  const text = trimText(value)
  if (!text) return ''

  if (/^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}/.test(text)) {
    return text.slice(0, 16)
  }

  const detailedTimeMatch = text.match(/\((\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2})(?::\d{2})?(?:\s+[A-Z]+)?\)/)
  if (detailedTimeMatch?.[1]) {
    return detailedTimeMatch[1]
  }

  const timestampMatch = text.match(/^(\d{10,13})/)
  const timestampText = timestampMatch?.[1] || text

  const numeric = Number(timestampText)
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return text
  }

  const timestampMs = timestampText.length <= 10 ? numeric * 1000 : numeric
  const date = new Date(timestampMs)
  if (Number.isNaN(date.getTime())) {
    return text
  }

  const formatter = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  })

  return formatter.format(date).replace(' ', ' ')
}

function formatRowValue (row = {}, formatter = null) {
  if (!row) {
    return ''
  }

  const text = stripWrappedQuotes(row?.value)
  if (isStructuredValue(text)) {
    return ''
  }

  if (!text || isEmptyBufferValue(text)) {
    return typeof formatter === 'function' ? trimText(formatter('')) : ''
  }

  return typeof formatter === 'function' ? trimText(formatter(text)) : trimText(text)
}

function buildRowLookup (rows = []) {
  const byField = new Map()
  const byLabel = new Map()

  for (const row of rows) {
    if (row.field && !byField.has(row.field)) {
      byField.set(row.field, row)
    }
    if (row.label && !byLabel.has(row.label)) {
      byLabel.set(row.label, row)
    }
  }

  return { byField, byLabel }
}

function findRowValue (lookup = {}, options = {}) {
  const fields = Array.isArray(options?.fields) ? options.fields : []
  const rowLabels = Array.isArray(options?.rowLabels) ? options.rowLabels : []
  const formatter = options?.formatter

  for (const field of fields) {
    const row = lookup?.byField?.get(field)
    const value = formatRowValue(row, formatter)
    if (value) {
      return value
    }
  }

  for (const rowLabel of rowLabels) {
    const row = lookup?.byLabel?.get(rowLabel)
    const value = formatRowValue(row, formatter)
    if (value) {
      return value
    }
  }

  return ''
}

function buildDisplayLines (uid = '', rows = []) {
  const lookup = buildRowLookup(rows)
  const lines = []

  for (const item of DISPLAY_FIELDS) {
    const value = findRowValue(lookup, item)
    if (value) {
      lines.push(item.label === 'UID' ? `UID: ${value}` : `${item.label}：${value}`)
    }
  }

  if (!lines.some((line) => line.startsWith('UID: '))) {
    const fallbackUid = trimText(uid)
    if (fallbackUid) {
      lines.unshift(`UID: ${fallbackUid}`)
    }
  }

  return lines
}

function resolveCardImage (rows = []) {
  const lookup = buildRowLookup(rows)
  return findRowValue(lookup, {
    fields: CARD_IMAGE_FIELDS,
    rowLabels: CARD_IMAGE_LABELS
  })
}

function pickPrimaryAccount (accounts = []) {
  return accounts.find((item) => item?.binding?.is_primary === true || item?.binding?.isPrimary === true) ||
    accounts[0] ||
    null
}

function extractUidFromAccount (account = {}) {
  return trimText(
    account?.role?.id ||
    account?.role_id ||
    account?.binding?.role_id ||
    account?.binding?.roleId
  )
}

export class RocomPlayerSearch extends plugin {
  constructor (e) {
    super({
      name: '[WeGame-plugin][rocom] 玩家搜索',
      dsc: '洛克王国世界玩家搜索',
      event: 'message',
      priority: 109,
      rule: [
        {
          reg: UID_SEARCH_REG,
          fnc: 'searchPlayer'
        }
      ]
    })

    this.e = e
    this.api = new RocomApi()
    this.accountService = new WeGameAccountService(e)
  }

  async searchPlayer () {
    try {
      const uid = await this.resolveSearchUid()
      await this.reply(`正在搜索玩家 UID：${uid}`)

      const data = await this.api.searchPlayer(uid)
      const forwardMsg = await common.makeForwardMsg(
        this.e,
        this.buildForwardNodes(uid, data),
        'RoCom 玩家搜索'
      )
      await this.reply(forwardMsg)
      return true
    } catch (error) {
      logger.error('[WeGame-plugin][rocom] 玩家搜索失败', error)
      await this.reply(`玩家搜索失败：${error.message || error}`)
      return true
    }
  }

  async resolveSearchUid () {
    const match = String(this.e.msg || '').match(new RegExp(UID_SEARCH_REG))
    const rawUid = trimText(match?.[1])
    if (rawUid) {
      return rawUid
    }

    const active = await this.accountService.resolveActiveCredential().catch(() => null)
    const activeUid = trimText(
      active?.binding?.roleId ||
      active?.credential?.role?.id
    )
    if (activeUid) {
      return activeUid
    }

    if (!this.accountService.hasApiKey()) {
      throw new Error(`未提供 UID，且当前无法识别已绑定角色。请发送 ${formatCommand('uid <UID>')}`)
    }

    const accountsData = await this.api.getAccounts(this.accountService.getUserIdentifier())
    const accounts = Array.isArray(accountsData?.accounts) ? accountsData.accounts : []
    const primaryAccount = pickPrimaryAccount(accounts)
    const roleUid = extractUidFromAccount(primaryAccount)

    if (roleUid) {
      return roleUid
    }

    throw new Error(`未提供 UID，且当前没有可用的已绑定洛克角色。请先发送 ${formatCommand('账号列表')} 或 ${formatCommand('uid <UID>')}`)
  }

  buildForwardNodes (uid = '', payload = {}) {
    const rows = (Array.isArray(payload?.rows) ? payload.rows : [])
      .map((item) => normalizeSearchRow(item))
      .filter((item) => item.label || item.field || item.value)
    const lines = buildDisplayLines(uid, rows)
    const cardImage = resolveCardImage(rows)
    const nodes = []

    if (lines.length > 0) {
      nodes.push(lines.join('\n'))
    } else {
      nodes.push(`UID: ${trimText(uid) || '--'}\n未解析到可展示的玩家资料。`)
    }

    if (cardImage) {
      nodes.push(segment.image(cardImage))
    }

    return nodes
  }
}
