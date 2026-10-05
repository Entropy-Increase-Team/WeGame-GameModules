import { renderModuleTemplate } from '../../../model/moduleRender.js'
import { replyLargeText } from '../../../utils/queryHelper.js'
import merchantService from '../model/merchantService.js'
import { MERCHANT_RENDER_OPTIONS } from '../model/merchantRender.js'
import merchantCatalogService, { resolveMerchantSelection } from '../model/merchantCatalogService.js'
import merchantSubscriptionService, {
  MODE_ALL,
  MODE_ITEMS,
  TARGET_GROUP,
  TARGET_PRIVATE,
  buildMerchantSubscriptionKey,
  parseMerchantSubscriptionArgs
} from '../model/merchantSubscriptionService.js'
import RocomConfig from '../utils/config.js'
import { buildCommandReg, formatCommand, stripCommandPrefix } from '../utils/command.js'
import { trimText, encodeAssetPath, normalizeUrl } from '../utils/rocom.js'

function getDefaultMerchantItems () {
  const values = RocomConfig.get('merchant', 'subscription_default_items')
  return Array.isArray(values) && values.length > 0
    ? values.map((item) => trimText(item)).filter(Boolean)
    : ['国王球', '棱镜球', '炫彩精灵蛋']
}

function getMerchantCron () {
  return trimText(RocomConfig.get('merchant', 'subscription_cron')) || '0 */5 * * * *'
}

/** 把订阅的商品名回显成「序号.名称」，方便用户对照商品列表 */
function describeMerchantItems (names = [], catalog = []) {
  const indexByName = new Map()
  for (const item of Array.isArray(catalog) ? catalog : []) {
    const name = trimText(item?.name)
    if (!name) continue
    indexByName.set(name, Number(item?.index) || 0)
  }

  return (Array.isArray(names) ? names : [])
    .map((raw) => {
      const name = trimText(raw)
      if (!name) return ''
      const index = indexByName.get(name)
      return index > 0 ? `${index}.${name}` : name
    })
    .filter(Boolean)
    .join('、')
}

export class RocomMerchantSubscription extends plugin {
  constructor (e) {
    super({
      name: '[WeGame-plugin][rocom] 远行商人订阅',
      dsc: '洛克王国世界远行商人订阅（分群 / 分人）',
      event: 'message',
      priority: 118,
      rule: [
        {
          reg: buildCommandReg('订阅(远行|旅行)商人(?:\\s+.*)?'),
          fnc: 'subscribeMerchant',
          permission: 'admin'
        },
        {
          reg: buildCommandReg('取消订阅(远行|旅行)商人'),
          fnc: 'unsubscribeMerchant',
          permission: 'admin'
        },
        {
          reg: buildCommandReg('(?:远行|旅行)?商人(?:商品|道具)(?:列表)?'),
          fnc: 'showMerchantCatalog'
        }
      ]
    })

    this.e = e
    this.task = [
      {
        name: '[WeGame-plugin][rocom] 远行商人订阅检查',
        cron: getMerchantCron(),
        fnc: () => this.checkSubscriptions()
      }
    ]
  }

  async subscribeMerchant () {
    try {
      const isGroup = this.e?.isGroup === true
      const raw = stripCommandPrefix(this.e.msg, '订阅远行商人') ||
        stripCommandPrefix(this.e.msg, '订阅旅行商人')
      const parsed = parseMerchantSubscriptionArgs(raw)

      const targetType = isGroup ? TARGET_GROUP : TARGET_PRIVATE
      const targetId = isGroup ? this.e.group_id : this.e.user_id
      const key = buildMerchantSubscriptionKey(this.e.self_id, targetId, targetType)
      const previous = await merchantSubscriptionService.getSubscription(key)

      const catalog = await merchantCatalogService.getCatalog()
      const resolved = resolveMerchantSelection(parsed.tokens, catalog)
      const wantAll = parsed.all || resolved.all
      const hasInput = parsed.all || parsed.tokens.length > 0

      if (hasInput && !wantAll && resolved.names.length === 0) {
        await this.reply([
          `没有识别到可订阅的商品：${resolved.unknownIndexes.join('、') || parsed.tokens.join('、')}`,
          `先用 ${formatCommand('商人商品')} 查看商品序号，再按序号订阅。`
        ].join('\n'))
        return true
      }

      let mode = MODE_ITEMS
      let selectedItems = []
      let sourceHint = ''

      if (wantAll) {
        mode = MODE_ALL
        sourceHint = '全物品订阅'
      } else if (resolved.names.length > 0) {
        mode = MODE_ITEMS
        selectedItems = resolved.names
        sourceHint = '本次指定'
      } else if (previous && (previous.mode === MODE_ALL || (previous.items || []).length > 0)) {
        mode = previous.mode
        selectedItems = previous.items
        sourceHint = '沿用上次配置'
      } else {
        mode = MODE_ITEMS
        selectedItems = getDefaultMerchantItems()
        sourceHint = '默认商品配置'
      }

      const mentionAll = parsed.mentionAll === null
        ? previous?.mention_all === true
        : parsed.mentionAll

      await merchantSubscriptionService.upsertSubscription(key, {
        target_type: targetType,
        bot_id: this.e.self_id,
        group_id: isGroup ? this.e.group_id : '',
        user_id: isGroup ? '' : this.e.user_id,
        mode,
        mention_all: mentionAll,
        items: selectedItems,
        last_push_round: previous?.last_push_round || '',
        last_matched_items: previous?.last_matched_items || [],
        updated_by: this.e.user_id
      })

      const scopeLabel = isGroup ? '本群' : '私聊'
      const lines = []

      if (mode === MODE_ALL) {
        lines.push(`已订阅远行商人（${scopeLabel}）：全物品订阅，每轮只要有商品上架就推送。`)
      } else {
        lines.push(`已订阅远行商人（${scopeLabel}）：共监听 ${selectedItems.length} 件商品。`)
        lines.push(`监听商品：${describeMerchantItems(selectedItems, catalog)}`)
      }

      lines.push(`商品来源：${sourceHint}。`)
      lines.push(mentionAll ? '命中后会尝试 @全体。' : '命中后不会 @全体。')

      if (resolved.unknownIndexes.length > 0) {
        lines.push(`未找到的序号：${resolved.unknownIndexes.join('、')}（已忽略）。`)
      }
      if (resolved.unrecognizedNames.length > 0) {
        lines.push(`商品目录里没有：${resolved.unrecognizedNames.join('、')}（已按原名订阅）。`)
      }

      lines.push('')
      lines.push('可用格式：')
      lines.push(`${formatCommand('订阅远行商人 1 3 国王球')} 按序号或名称订阅商品`)
      lines.push(`${formatCommand('订阅远行商人 全部')} 订阅全物品，任意商品上架都推送`)
      lines.push(`${formatCommand('订阅远行商人 @全体 1 3')} 命中后尝试 @全体`)
      lines.push(`${formatCommand('商人商品')} 查看商品序号`)
      lines.push(`${formatCommand('取消订阅远行商人')} 取消订阅`)

      await this.reply(lines.join('\n'))
      return true
    } catch (error) {
      logger.error('[WeGame-plugin][rocom] 订阅远行商人失败', error)
      await this.reply(`订阅远行商人失败：${error.message || error}`)
      return true
    }
  }

  async unsubscribeMerchant () {
    try {
      const isGroup = this.e?.isGroup === true
      const targetType = isGroup ? TARGET_GROUP : TARGET_PRIVATE
      const targetId = isGroup ? this.e.group_id : this.e.user_id
      const key = buildMerchantSubscriptionKey(this.e.self_id, targetId, targetType)
      const deleted = await merchantSubscriptionService.deleteSubscription(key)

      if (deleted) {
        await this.reply(isGroup ? '已取消本群远行商人订阅。' : '已取消你的远行商人订阅。')
      } else {
        await this.reply(isGroup ? '本群当前没有远行商人订阅。' : '你当前没有远行商人订阅。')
      }
      return true
    } catch (error) {
      logger.error('[WeGame-plugin][rocom] 取消远行商人订阅失败', error)
      await this.reply(`取消远行商人订阅失败：${error.message || error}`)
      return true
    }
  }

  async showMerchantCatalog () {
    try {
      await this.reply('正在获取远行商人商品列表...')
      const catalog = await merchantCatalogService.getCatalog()

      if (catalog.length === 0) {
        await this.reply('暂时取不到远行商人商品列表，请稍后再试。')
        return true
      }

      const lines = [
        `远行商人商品列表（共 ${catalog.length} 件）`,
        `订阅写法：${formatCommand('订阅远行商人 1 3 5')}，也可以用商品名`
      ]

      for (const item of catalog) {
        lines.push(`${item.index}. ${item.name}`)
      }

      await replyLargeText(this, '远行商人商品列表', lines.join('\n'))
      return true
    } catch (error) {
      logger.error('[WeGame-plugin][rocom] 获取远行商人商品列表失败', error)
      await this.reply(`获取远行商人商品列表失败：${error.message || error}`)
      return true
    }
  }

  async checkSubscriptions () {
    try {
      const subscriptions = await merchantSubscriptionService.getAllSubscriptions()
      const entries = Object.entries(subscriptions || {})
      if (entries.length === 0) return

      const requestOwner = trimText(entries.find(([, item]) => trimText(item?.updated_by))?.[1]?.updated_by)
      const payload = await merchantService.getInfo(true, {
        userIdentifier: requestOwner
      })
      const { products } = merchantService.extractProducts(payload)
      const roundInfo = merchantService.getCurrentRound()

      if (!roundInfo.is_open || products.length === 0) {
        return
      }

      const productNameSet = new Set(products.map((item) => trimText(item?.name)).filter(Boolean))
      const image = await this.renderMerchantImage(payload)

      for (const [key, subscription] of entries) {
        if (trimText(subscription?.last_push_round) === roundInfo.round_id) continue

        const mode = subscription?.mode === MODE_ALL ? MODE_ALL : MODE_ITEMS
        let matchedItems = []

        if (mode === MODE_ALL) {
          // 全物品订阅：本轮只要有任何商品上架就推送
          matchedItems = [...productNameSet]
        } else {
          const configuredItems = Array.isArray(subscription?.items) && subscription.items.length > 0
            ? subscription.items
            : getDefaultMerchantItems()
          matchedItems = configuredItems.filter((item) => productNameSet.has(trimText(item)))
          if (matchedItems.length === 0) continue
        }

        const message = [
          subscription?.mention_all && subscription?.target_type !== TARGET_PRIVATE ? segment.at('all') : '',
          mode === MODE_ALL
            ? `远行商人本轮上新：${matchedItems.join('、')}`
            : `远行商人本轮命中订阅商品：${matchedItems.join('、')}`,
          `轮次：第 ${roundInfo.current} / ${roundInfo.total} 轮`,
          `剩余：${roundInfo.countdown}`
        ].filter(Boolean)

        try {
          await this.sendSubscriptionMessage(subscription, message, image)
        } catch (error) {
          logger.warn(`[WeGame-plugin][rocom] 推送远行商人订阅失败：${key}`, error)
          continue
        }

        await merchantSubscriptionService.upsertSubscription(key, {
          ...subscription,
          last_push_round: roundInfo.round_id,
          last_matched_items: matchedItems
        })
      }
    } catch (error) {
      logger.error('[WeGame-plugin][rocom] 检查远行商人订阅失败', error)
    }
  }

  /** 群订阅发到群里，私聊订阅发给本人 */
  async sendSubscriptionMessage (subscription = {}, message = [], image = '') {
    const botId = subscription.bot_id

    if (subscription.target_type === TARGET_PRIVATE) {
      const userId = trimText(subscription.user_id)
      if (!userId) throw new Error('私聊订阅缺少用户号')
      await Bot.sendFriendMsg(botId, userId, message)
      if (image) await Bot.sendFriendMsg(botId, userId, image)
      return
    }

    const groupId = trimText(subscription.group_id)
    if (!groupId) throw new Error('群订阅缺少群号')
    await Bot.sendGroupMsg(botId, groupId, message)
    if (image) await Bot.sendGroupMsg(botId, groupId, image)
  }

  async renderMerchantImage (payload = {}) {
    try {
      const image = await renderModuleTemplate(
        null,
        'rocom',
        'render/yuanxing-shangren/merchant',
        merchantService.buildCurrentRoundCardRenderData(payload),
        {
          ...MERCHANT_RENDER_OPTIONS,
          beforeRender: ({ data }) => this.withRenderAssets(data)
        }
      )

      return image || ''
    } catch (error) {
      logger.warn(`[WeGame-plugin][rocom] 远行商人订阅图片渲染失败：${error.message || error}`)
      return ''
    }
  }

  withRenderAssets (data = {}) {
    const buildResUrl = (assetPath) => `${data.pluResPath}${encodeAssetPath(assetPath)}`
    const fallbackImage = buildResUrl('img/logo.png')

    return {
      ...data,
      goods: (data?.goods || []).map((item) => ({
        ...item,
        iconUrl: normalizeUrl(item?.iconUrl) || fallbackImage
      }))
    }
  }
}
