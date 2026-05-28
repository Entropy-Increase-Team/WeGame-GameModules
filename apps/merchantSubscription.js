import { renderModuleTemplate } from '../../../model/moduleRender.js'
import merchantService from '../model/merchantService.js'
import merchantSubscriptionService, {
  buildMerchantSubscriptionKey,
  parseMerchantSubscriptionArgs
} from '../model/merchantSubscriptionService.js'
import RocomConfig from '../utils/config.js'
import { buildCommandReg, formatCommand, stripCommandPrefix } from '../utils/command.js'

function trimText (value = '') {
  return String(value || '').trim()
}

function encodeAssetPath (assetPath = '') {
  return String(assetPath || '')
    .split('/')
    .filter(Boolean)
    .map((part) => encodeURIComponent(part))
    .join('/')
}

function normalizeUrl (value = '') {
  const text = trimText(value)
  if (!text) return ''
  if (text.startsWith('//')) return `https:${text}`
  return text
}

function getDefaultMerchantItems () {
  const values = RocomConfig.get('merchant', 'subscription_default_items')
  return Array.isArray(values) && values.length > 0
    ? values.map((item) => trimText(item)).filter(Boolean)
    : ['国王球', '棱镜球', '炫彩精灵蛋']
}

function getMerchantCron () {
  return trimText(RocomConfig.get('merchant', 'subscription_cron')) || '0 */5 * * * *'
}

export class RocomMerchantSubscription extends plugin {
  constructor (e) {
    super({
      name: '[WeGame-plugin][rocom] 远行商人订阅',
      dsc: '洛克王国世界远行商人群订阅',
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
      if (!this.e?.isGroup) {
        await this.reply('订阅远行商人仅支持群聊使用')
        return true
      }

      const raw = stripCommandPrefix(this.e.msg, '订阅远行商人')
      const parsed = parseMerchantSubscriptionArgs(raw)
      const selectedItems = parsed.customItems || getDefaultMerchantItems()
      const groupKey = buildMerchantSubscriptionKey(this.e.self_id, this.e.group_id)

      await merchantSubscriptionService.upsertSubscription(groupKey, {
        group_id: this.e.group_id,
        bot_id: this.e.self_id,
        mention_all: parsed.mentionAll,
        items: selectedItems,
        last_push_round: '',
        last_matched_items: [],
        updated_by: this.e.user_id
      })

      const sourceHint = parsed.customItems ? '本群自定义商品' : '默认商品配置'
      await this.reply(
        [
          `已订阅远行商人，监听商品：${selectedItems.join('、')}（${sourceHint}）`,
          parsed.mentionAll ? '命中后会尝试 @全体。' : '命中后不会 @全体。',
          `可用格式：${formatCommand('订阅远行商人 1 国王球 棱镜球')} / ${formatCommand('取消订阅远行商人')}`
        ].join('\n')
      )
      return true
    } catch (error) {
      logger.error('[WeGame-plugin][rocom] 订阅远行商人失败', error)
      await this.reply(`订阅远行商人失败：${error.message || error}`)
      return true
    }
  }

  async unsubscribeMerchant () {
    try {
      if (!this.e?.isGroup) {
        await this.reply('取消订阅远行商人仅支持群聊使用')
        return true
      }

      const groupKey = buildMerchantSubscriptionKey(this.e.self_id, this.e.group_id)
      const deleted = await merchantSubscriptionService.deleteSubscription(groupKey)

      await this.reply(deleted ? '已取消本群远行商人订阅。' : '本群当前没有远行商人订阅。')
      return true
    } catch (error) {
      logger.error('[WeGame-plugin][rocom] 取消远行商人订阅失败', error)
      await this.reply(`取消远行商人订阅失败：${error.message || error}`)
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
        const configuredItems = Array.isArray(subscription?.items) && subscription.items.length > 0
          ? subscription.items
          : getDefaultMerchantItems()
        const matchedItems = configuredItems.filter((item) => productNameSet.has(trimText(item)))

        if (matchedItems.length === 0) continue
        if (trimText(subscription?.last_push_round) === roundInfo.round_id) continue

        const message = [
          subscription?.mention_all ? segment.at('all') : '',
          `远行商人本轮命中订阅商品：${matchedItems.join('、')}`,
          `轮次：第 ${roundInfo.current} / ${roundInfo.total} 轮`,
          `剩余：${roundInfo.countdown}`
        ].filter(Boolean)

        try {
          await Bot.sendGroupMsg(subscription.bot_id, subscription.group_id, message)
          if (image) {
            await Bot.sendGroupMsg(subscription.bot_id, subscription.group_id, image)
          }
        } catch (error) {
          logger.warn(`[WeGame-plugin][rocom] 推送远行商人订阅失败：${subscription.group_id}`, error)
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

  async renderMerchantImage (payload = {}) {
    try {
      const image = await renderModuleTemplate(
        null,
        'rocom',
        'render/yuanxing-shangren/index',
        merchantService.buildRenderData(payload),
        {
          retType: 'base64',
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
      background: normalizeUrl(data?.background) || buildResUrl('img/bg.C8CUoi7I.jpg'),
      products: (data?.products || []).map((product) => ({
        ...product,
        image: normalizeUrl(product?.image) || fallbackImage
      }))
    }
  }
}
