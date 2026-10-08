import WeGameAccountService from '../../../model/accountService.js'
import { renderModuleTemplate } from '../../../model/moduleRender.js'
import RocomApi from '../model/api.js'
import eggSubscriptionService, {
  TARGET_GROUP,
  TARGET_PRIVATE,
  buildEggSubscriptionKey,
  normalizeTargetType
} from '../model/eggSubscriptionService.js'
import RocomConfig from '../utils/config.js'
import { buildCommandReg, formatCommand, stripCommandPrefix } from '../utils/command.js'
import { trimText, toNumber, encodeAssetPath } from '../utils/rocom.js'

const MENTION_ALL_ALIASES = new Set(['@全体', '全体', '@所有人', 'at全体', 'at所有人'])

function getEggCron () {
  return trimText(RocomConfig.get('egg', 'subscription_cron')) || '0 */30 * * * *'
}

function normalizeTimestampSeconds (value) {
  const num = Number(value)
  if (!Number.isFinite(num) || num <= 0) return 0
  if (num > 1e14) return Math.floor(num / 1000000)
  if (num > 1e11) return Math.floor(num / 1000)
  return Math.floor(num)
}

function formatRemaining (targetTime, now = Math.floor(Date.now() / 1000)) {
  const target = normalizeTimestampSeconds(targetTime)
  if (!target) return '未开始'
  if (now >= target) return '已完成'

  const remain = Math.max(0, target - now)
  const days = Math.floor(remain / 86400)
  const hours = Math.floor((remain % 86400) / 3600)
  const minutes = Math.floor((remain % 3600) / 60)

  if (days > 0) return `${days}天${hours}小时`
  if (hours > 0) return `${hours}小时${minutes}分钟`
  if (minutes > 0) return `${minutes}分钟`
  return '即将完成'
}

/**
 * 从 home/eggs 响应中提取蛋状态。
 * 由于接口还在开发中，这里对多种可能的字段名做兼容。
 * 返回归一化结构：{ readyCount, totalEggs, pets: [{ name, petId, ready, remaining }] }
 */
function extractEggStatus (payload = {}) {
  const data = pickEggPayload(payload)
  const now = Math.floor(Date.now() / 1000)

  // 可能的蛋列表字段名
  const eggLists = [
    data?.eggs,
    data?.egg_list,
    data?.egg_info,
    data?.home_eggs,
    data?.home_egg_list,
    data?.home_pets,
    data?.pet_list
  ].filter(Array.isArray)

  const pets = []
  for (const list of eggLists) {
    for (const item of list) {
      const pet = extractEggPet(item, now)
      if (pet) pets.push(pet)
    }
  }

  // 如果没有列表结构，尝试从顶层字段提取计数
  const readyCount = pets.length > 0
    ? pets.filter((p) => p.ready).length
    : toNumber(data?.ready_egg_count ?? data?.readyEggCount ?? data?.egg_ready_count ?? 0, 0)

  const totalEggs = pets.length > 0
    ? pets.length
    : toNumber(data?.total_egg_count ?? data?.totalEggCount ?? data?.egg_count ?? 0, 0)

  return { readyCount, totalEggs, pets }
}

function pickEggPayload (payload = {}) {
  const candidates = [
    payload?.data,
    payload?.result,
    payload?.data?.data,
    payload?.result?.data,
    payload
  ]

  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) continue
    return candidate
  }

  return {}
}

function extractEggPet (item = {}, now = Math.floor(Date.now() / 1000)) {
  const petInfo = item?.home_pet_info && typeof item.home_pet_info === 'object' ? item.home_pet_info : item
  const petId = petInfo?.pet_cfg_id || petInfo?.pet_id || item?.pet_cfg_id || item?.pet_id
  const name = trimText(petInfo?.name || petInfo?.pet_name || item?.name || item?.pet_name)
  if (!toNumber(petId, 0) && !name) return null

  const hasEgg = Boolean(item?.have_egg ?? petInfo?.have_egg)
  const predictedEggTime = normalizeTimestampSeconds(
    item?.predicted_egg_time ?? petInfo?.predicted_egg_time ?? item?.egg_ready_time
  )
  const ready = hasEgg || (predictedEggTime > 0 && now >= predictedEggTime)
  const remaining = ready ? '' : (predictedEggTime > 0 ? formatRemaining(predictedEggTime, now) : '未知')

  return {
    petId: String(petId || ''),
    name: name || `精灵 ${petId || ''}`,
    ready,
    remaining,
    predictedEggTime: predictedEggTime || 0
  }
}

export class RocomEggSubscription extends plugin {
  constructor (e) {
    super({
      name: '[WeGame-plugin][rocom] 家园蛋状态订阅',
      dsc: '洛克王国世界家园精灵蛋状态订阅（定时轮询 + 推送）',
      event: 'message',
      priority: 119,
      rule: [
        {
          reg: buildCommandReg('订阅家园(?:\\s+\\S+)?(?:\\s+.*)?'),
          fnc: 'subscribeEgg',
          permission: 'admin'
        },
        {
          reg: buildCommandReg('取消订阅家园(?:\\s+\\S+)?'),
          fnc: 'unsubscribeEgg',
          permission: 'admin'
        },
        {
          reg: buildCommandReg('家园状态(?:\\s+\\S+)?'),
          fnc: 'queryEggStatus'
        },
        {
          reg: buildCommandReg('我的家园订阅'),
          fnc: 'listEggSubscriptions'
        }
      ]
    })

    this.e = e
    this.api = new RocomApi()
    this.accountService = new WeGameAccountService(e)
    this.task = [
      {
        name: '[WeGame-plugin][rocom] 家园蛋状态订阅检查',
        cron: getEggCron(),
        fnc: () => this.checkEggSubscriptions()
      }
    ]
  }

  async subscribeEgg () {
    try {
      const isGroup = this.e?.isGroup === true
      const raw = stripCommandPrefix(this.e.msg, '订阅家园') || ''
      const tokens = trimText(raw).split(/\s+/).filter(Boolean)

      if (tokens.length === 0) {
        await this.reply([
          '家园蛋状态订阅用法：',
          `${formatCommand('订阅家园 <UID>')}  订阅指定 UID 的家园蛋状态`,
          `${formatCommand('订阅家园 @全体 <UID>')}  命中后尝试 @全体`,
          `${formatCommand('取消订阅家园 <UID>')}  取消指定 UID 的订阅`,
          `${formatCommand('家园状态 <UID>')}  查询指定 UID 当前家园蛋状态`,
          `${formatCommand('我的家园订阅')}  查看当前订阅列表`
        ].join('\n'))
        return true
      }

      let mentionAll = false
      const uidTokens = []

      for (const token of tokens) {
        if (MENTION_ALL_ALIASES.has(token.toLowerCase())) {
          mentionAll = true
          continue
        }
        uidTokens.push(token)
      }

      if (uidTokens.length === 0) {
        await this.reply('请提供要订阅的 UID。')
        return true
      }

      const targetUid = uidTokens[0]
      const targetType = isGroup ? TARGET_GROUP : TARGET_PRIVATE
      const targetId = isGroup ? this.e.group_id : this.e.user_id
      const key = buildEggSubscriptionKey(this.e.self_id, targetId, targetType, targetUid)

      await eggSubscriptionService.upsertSubscription(key, {
        target_type: targetType,
        bot_id: this.e.self_id,
        group_id: isGroup ? this.e.group_id : '',
        user_id: isGroup ? '' : this.e.user_id,
        target_uid: targetUid,
        mention_all: mentionAll,
        last_egg_count: 0,
        last_pushed_egg_count: 0,
        last_push_time: '',
        last_check_time: '',
        updated_by: this.e.user_id
      })

      const scopeLabel = isGroup ? '本群' : '私聊'
      const lines = [
        `已订阅家园蛋状态（${scopeLabel}）：UID ${targetUid}`,
        `轮询频率：每 ${getCronIntervalLabel(getEggCron())} 检查一次`,
        `推送条件：检测到新的可收蛋精灵时推送`,
        mentionAll ? '命中后会尝试 @全体。' : '命中后不会 @全体。',
        '',
        `发送 ${formatCommand('取消订阅家园 ' + targetUid)} 取消订阅`,
        `发送 ${formatCommand('家园状态 ' + targetUid)} 立即查询`
      ]

      await this.reply(lines.join('\n'))
      return true
    } catch (error) {
      logger.error('[WeGame-plugin][rocom] 订阅家园蛋状态失败', error)
      await this.reply(`订阅家园蛋状态失败：${error.message || error}`)
      return true
    }
  }

  async unsubscribeEgg () {
    try {
      const isGroup = this.e?.isGroup === true
      const raw = stripCommandPrefix(this.e.msg, '取消订阅家园') || ''
      const targetUid = trimText(raw)
      const targetType = isGroup ? TARGET_GROUP : TARGET_PRIVATE
      const targetId = isGroup ? this.e.group_id : this.e.user_id

      if (targetUid) {
        const key = buildEggSubscriptionKey(this.e.self_id, targetId, targetType, targetUid)
        const deleted = await eggSubscriptionService.deleteSubscription(key)

        if (deleted) {
          await this.reply(`已取消订阅 UID ${targetUid} 的家园蛋状态。`)
        } else {
          await this.reply(`没有找到 UID ${targetUid} 的家园蛋状态订阅。`)
        }
      } else {
        // 取消该用户/群的所有家园蛋订阅
        const subs = await eggSubscriptionService.getSubscriptionsByTarget(
          this.e.self_id, targetId, targetType
        )

        if (subs.length === 0) {
          await this.reply(isGroup ? '本群当前没有家园蛋状态订阅。' : '你当前没有家园蛋状态订阅。')
          return true
        }

        for (const sub of subs) {
          await eggSubscriptionService.deleteSubscription(sub.key)
        }

        await this.reply(`已取消全部 ${subs.length} 个家园蛋状态订阅（${subs.map((s) => s.target_uid).join('、')}）。`)
      }

      return true
    } catch (error) {
      logger.error('[WeGame-plugin][rocom] 取消家园蛋状态订阅失败', error)
      await this.reply(`取消家园蛋状态订阅失败：${error.message || error}`)
      return true
    }
  }

  async queryEggStatus () {
    try {
      const raw = stripCommandPrefix(this.e.msg, '家园状态') || ''
      const targetUid = trimText(raw)

      if (!targetUid) {
        await this.reply(`格式：${formatCommand('家园状态 <UID>')}  查询家园蛋状态`)
        return true
      }

      await this.reply(`正在查询 UID ${targetUid} 的家园蛋状态，请稍后...`)

      let queuedNotified = false
      const payload = await this.api.getIngameHomeEggs(targetUid, {
        userIdentifier: this.accountService.getUserIdentifier(),
        onQueued: async () => {
          if (queuedNotified) return
          queuedNotified = true
          await this.reply(`UID ${targetUid} 的家园蛋状态查询已进入队列，正在等待游戏侧返回...`)
        }
      })

      const eggStatus = extractEggStatus(payload)
      const lines = this.buildEggStatusText(targetUid, eggStatus)

      await this.reply(lines.join('\n'))
      return true
    } catch (error) {
      logger.error('[WeGame-plugin][rocom] 查询家园蛋状态失败', error)
      await this.reply(`查询家园蛋状态失败：${error.message || error}`)
      return true
    }
  }

  async listEggSubscriptions () {
    try {
      const isGroup = this.e?.isGroup === true
      const targetType = isGroup ? TARGET_GROUP : TARGET_PRIVATE
      const targetId = isGroup ? this.e.group_id : this.e.user_id
      const subs = await eggSubscriptionService.getSubscriptionsByTarget(
        this.e.self_id, targetId, targetType
      )

      if (subs.length === 0) {
        await this.reply(isGroup ? '本群当前没有家园蛋状态订阅。' : '你当前没有家园蛋状态订阅。')
        return true
      }

      const lines = [
        `当前家园蛋状态订阅（共 ${subs.length} 个）：`,
        ''
      ]

      for (const sub of subs) {
        const lastCheck = sub.last_check_time || '从未检查'
        const lastPush = sub.last_push_time || '从未推送'
        lines.push(`UID ${sub.target_uid}：上次检查 ${lastCheck}，上次推送 ${lastPush}`)
      }

      lines.push('')
      lines.push(`发送 ${formatCommand('取消订阅家园 <UID>')} 取消单个订阅`)
      lines.push(`发送 ${formatCommand('取消订阅家园')} 取消全部订阅`)

      await this.reply(lines.join('\n'))
      return true
    } catch (error) {
      logger.error('[WeGame-plugin][rocom] 查看家园蛋订阅列表失败', error)
      await this.reply(`查看家园蛋订阅列表失败：${error.message || error}`)
      return true
    }
  }

  buildEggStatusText (uid, eggStatus) {
    const { readyCount, totalEggs, pets } = eggStatus
    const lines = [
      `家园蛋状态 - UID ${uid}`,
      `可收蛋精灵：${readyCount} 只 / 共检测 ${totalEggs} 只`
    ]

    if (pets.length > 0) {
      lines.push('')
      for (const pet of pets) {
        const status = pet.ready ? '✅ 可收蛋' : `⏳ ${pet.remaining}`
        lines.push(`${pet.name}  ${status}`)
      }
    }

    lines.push('')
    lines.push(`更新时间：${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}`)

    return lines
  }

  /**
   * 定时轮询所有家园蛋状态订阅，检测到新的可收蛋时推送通知。
   */
  async checkEggSubscriptions () {
    try {
      const subscriptions = await eggSubscriptionService.getAllSubscriptions()
      const entries = Object.entries(subscriptions || {})
      if (entries.length === 0) return

      // 按 UID 分组，避免对同一 UID 重复请求
      const uidMap = new Map()
      for (const [, sub] of entries) {
        const uid = trimText(sub?.target_uid)
        if (!uid) continue
        if (!uidMap.has(uid)) uidMap.set(uid, [])
        uidMap.get(uid).push(sub)
      }

      const now = new Date().toISOString()
      const batchUpdates = []

      for (const [uid, subList] of uidMap) {
        let eggStatus = null
        let fetchError = null

        try {
          const requestOwner = subList.find((s) => trimText(s?.updated_by))?.updated_by
          const payload = await this.api.getIngameHomeEggs(uid, {
            userIdentifier: requestOwner,
            httpTimeoutMs: 10000,
            taskHttpTimeoutMs: 10000,
            timeoutMs: 60 * 1000
          })
          eggStatus = extractEggStatus(payload)
        } catch (error) {
          fetchError = error.message || String(error)
          logger.warn(`[WeGame-plugin][rocom] 轮询 UID ${uid} 家园蛋状态失败：${fetchError}`)
        }

        for (const sub of subList) {
          if (fetchError || !eggStatus) {
            batchUpdates.push({
              key: sub.key,
              last_check_time: now
            })
            continue
          }

          const currentReady = eggStatus.readyCount
          const previousReady = sub.last_egg_count || 0
          const lastPushed = sub.last_pushed_egg_count || 0

          // 有新的可收蛋精灵且上次没有推送过这个数量
          const hasNewEggs = currentReady > 0 && currentReady > lastPushed

          if (hasNewEggs) {
            const message = this.buildPushMessage(sub, eggStatus)
            try {
              await this.sendSubscriptionMessage(sub, message)
            } catch (error) {
              logger.warn(`[WeGame-plugin][rocom] 家园蛋状态推送失败：${sub.key}`, error)
            }

            batchUpdates.push({
              key: sub.key,
              last_egg_count: currentReady,
              last_pushed_egg_count: currentReady,
              last_push_time: now,
              last_check_time: now
            })
          } else {
            batchUpdates.push({
              key: sub.key,
              last_egg_count: currentReady,
              last_check_time: now
            })
          }
        }
      }

      await eggSubscriptionService.batchUpdateSubscriptions(batchUpdates)
    } catch (error) {
      logger.error('[WeGame-plugin][rocom] 检查家园蛋状态订阅失败', error)
    }
  }

  buildPushMessage (subscription, eggStatus) {
    const { readyCount, pets } = eggStatus
    const readyPets = pets.filter((p) => p.ready)

    const lines = [
      subscription?.mention_all && subscription?.target_type !== TARGET_PRIVATE
        ? segment.at('all')
        : '',
      `🔔 UID ${subscription.target_uid} 的家园有 ${readyCount} 只精灵可收蛋！`
    ]

    if (readyPets.length > 0 && readyPets.length <= 10) {
      lines.push(readyPets.map((p) => p.name).join('、'))
    }

    lines.push(`发送 ${formatCommand('家园状态 ' + subscription.target_uid)} 查看详情`)

    return lines.filter(Boolean)
  }

  /** 群订阅发到群里，私聊订阅发给本人 */
  async sendSubscriptionMessage (subscription = {}, message = []) {
    const botId = subscription.bot_id

    if (subscription.target_type === TARGET_PRIVATE) {
      const userId = trimText(subscription.user_id)
      if (!userId) throw new Error('私聊订阅缺少用户号')
      await Bot.sendFriendMsg(botId, userId, message)
      return
    }

    const groupId = trimText(subscription.group_id)
    if (!groupId) throw new Error('群订阅缺少群号')
    await Bot.sendGroupMsg(botId, groupId, message)
  }
}

function getCronIntervalLabel (cron = '') {
  const match = cron.match(/0 \*\/(\d+) \* \* \* \*/)
  if (match) return `${match[1]} 分钟`

  const match2 = cron.match(/0 \d+ \*\/(\d+) \* \* \*/)
  if (match2) return `${match2[1]} 小时`

  return '定时'
}
