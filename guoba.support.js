import path from 'node:path'
import Config from '../../utils/config.js'
import RocomConfig from './utils/config.js'
import merchantSubscriptionService, {
  buildMerchantSubscriptionKey
} from './model/merchantSubscriptionService.js'
import { pluginRoot } from '../../model/path.js'

const MODULE_CODE = 'rocom'
const MODULE_TITLE = '洛克王国世界'

// 当前模块在 games/rocom.yaml 中拥有的顶层键
// 锅巴保存时只会把这些顶层键下的字段写回该模块配置
const CONFIG_TOP_KEYS = ['rocom', 'lineup', 'merchant']

// 走运行时数据落盘的虚拟命名空间（不写 yaml）
const RUNTIME_TOP_KEYS = ['subscriptions']

const TOP_KEYS = [...CONFIG_TOP_KEYS, ...RUNTIME_TOP_KEYS]

const schemas = [
  {
    component: 'SOFT_GROUP_BEGIN',
    label: `${MODULE_TITLE}`
  },
  {
    field: 'merchant.subscription_cron',
    label: '订阅检查 Cron',
    bottomHelpMessage: '远行商人订阅扫描的 cron 表达式，默认每 5 分钟扫描一次：0 */5 * * * *',
    component: 'EasyCron',
    required: true,
    componentProps: {
      placeholder: '0 */5 * * * *'
    }
  },
  {
    field: 'merchant.subscription_default_items',
    label: '默认监听商品',
    bottomHelpMessage: '群订阅未自定义商品时使用的默认监听列表。回车添加，可拖动调整顺序。',
    component: 'Select',
    componentProps: {
      mode: 'tags',
      placeholder: '输入商品名称后回车添加，例如：国王球',
      tokenSeparators: [',', '，', ' ', '、']
    }
  },
  {
    component: 'SOFT_GROUP_BEGIN',
    label: `${MODULE_TITLE} · 远行商人订阅 · 已订阅群`
  },
  {
    field: 'subscriptions.merchant',
    label: '已订阅群',
    bottomHelpMessage: '直接管理已写入 data/wegame-plugin/rocom_merchant_subscriptions.json 的订阅；保存后会按机器人ID + 群号增删改。',
    component: 'GSubForm',
    componentProps: {
      multiple: true,
      schemas: [
        {
          field: 'bot_id',
          label: '机器人ID',
          required: true,
          component: 'Input',
          componentProps: { placeholder: '该订阅所属的 bot self_id' }
        },
        {
          field: 'group_id',
          label: '群号',
          required: true,
          component: 'Input',
          componentProps: { placeholder: '订阅生效的群号' }
        },
        {
          field: 'mention_all',
          label: '@全体',
          component: 'Switch',
          bottomHelpMessage: '命中商品时是否尝试 @全体（要求机器人是群管理员）'
        },
        {
          field: 'items',
          label: '监听商品',
          component: 'Select',
          componentProps: {
            mode: 'tags',
            placeholder: '留空表示使用上方的默认监听商品',
            tokenSeparators: [',', '，', ' ', '、']
          }
        }
      ]
    }
  }
]

function cloneDeep (value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value))
}

function mergeNamespace (current = {}, patch = {}) {
  const base = current && typeof current === 'object' && !Array.isArray(current) ? current : {}
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return base
  return { ...base, ...patch }
}

function trimText (value = '') {
  return String(value || '').trim()
}

async function loadMerchantSubscriptionRows () {
  const all = await merchantSubscriptionService.getAllSubscriptions()
  return Object.values(all || {}).map((item) => ({
    bot_id: trimText(item?.bot_id),
    group_id: trimText(item?.group_id),
    mention_all: item?.mention_all === true,
    items: Array.isArray(item?.items) ? [...item.items] : []
  }))
}

async function applyMerchantSubscriptionRows (rows = []) {
  const list = Array.isArray(rows) ? rows : []
  const all = await merchantSubscriptionService.getAllSubscriptions()
  const nextKeys = new Set()

  for (const row of list) {
    const botId = trimText(row?.bot_id)
    const groupId = trimText(row?.group_id)
    if (!botId || !groupId) continue

    const key = buildMerchantSubscriptionKey(botId, groupId)
    nextKeys.add(key)
    const prev = all[key] || {}

    await merchantSubscriptionService.upsertSubscription(key, {
      ...prev,
      group_id: groupId,
      bot_id: botId,
      mention_all: row?.mention_all === true,
      items: Array.isArray(row?.items) ? row.items : [],
      // 保留运行时进度，避免重复推送
      last_push_round: prev?.last_push_round || '',
      last_matched_items: Array.isArray(prev?.last_matched_items) ? prev.last_matched_items : []
    })
  }

  for (const key of Object.keys(all || {})) {
    if (!nextKeys.has(key)) {
      await merchantSubscriptionService.deleteSubscription(key)
    }
  }
}

export default {
  code: MODULE_CODE,
  title: MODULE_TITLE,
  topKeys: TOP_KEYS,
  iconPath: path.join(pluginRoot, 'modules', MODULE_CODE, 'resources', 'img', 'logo.png'),
  schemas,

  async getConfigData () {
    const config = cloneDeep(RocomConfig.getConfig()) || {}
    const output = {}
    for (const key of CONFIG_TOP_KEYS) {
      output[key] = config[key] || {}
    }
    output.subscriptions = {
      merchant: await loadMerchantSubscriptionRows()
    }
    return output
  },

  async setConfigData (partial = {}) {
    // 1) yaml 配置部分
    const current = cloneDeep(RocomConfig.getConfig()) || {}
    const next = { ...current }
    let yamlDirty = false

    for (const key of CONFIG_TOP_KEYS) {
      if (partial[key] === undefined) continue
      next[key] = mergeNamespace(current[key], partial[key])
      yamlDirty = true
    }

    if (yamlDirty) {
      Config.setGameConfig(MODULE_CODE, next)
    }

    // 2) 远行商人订阅 JSON 部分
    if (partial.subscriptions && partial.subscriptions.merchant !== undefined) {
      await applyMerchantSubscriptionRows(partial.subscriptions.merchant)
    }
  }
}
