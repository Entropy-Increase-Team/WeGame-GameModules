import WeGameAccountService from '../../../model/accountService.js'
import { replyLargeText } from '../../../utils/queryHelper.js'
import RocomApi from '../model/api.js'
import { buildCommandReg, formatCommand, stripCommandPrefix } from '../utils/command.js'
import { trimText, toNumber } from '../utils/rocom.js'

const EXCHANGE_LIST_REG = buildCommandReg('(?:换蛋广场|蛋广场)(?:\\s+(\\d+))?')
const EXCHANGE_POST_REG = buildCommandReg('发布换蛋帖(?:\\s+(.+))?')
const EXCHANGE_MY_REG = buildCommandReg('我的换蛋帖')
const EXCHANGE_CLOSE_REG = buildCommandReg('关闭换蛋帖(?:\\s+(\\S+))?')
const SUBSCRIBE_EGG_REG = buildCommandReg('订阅换蛋(?:\\s+(.+))?')
const UNSUBSCRIBE_EGG_REG = buildCommandReg('取消换蛋订阅')

function formatPostTime (value) {
  const text = trimText(value)
  if (!text) return '未知'
  const date = new Date(text)
  if (Number.isNaN(date.getTime())) return text
  const pad = (n) => String(n).padStart(2, '0')
  return `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function buildExchangeListText (items = [], pageInfo = {}) {
  if (items.length === 0) return '当前没有换蛋帖。'

  const lines = items.map((item, index) => {
    const pinned = trimText(item?.pinned_until) ? '📌' : ''
    const id = trimText(item?.id) || '?'
    const have = trimText(item?.have_text) || '未填写'
    const want = trimText(item?.want_text) || '未填写'
    const note = trimText(item?.want_note)
    const remark = trimText(item?.remark)
    const time = formatPostTime(item?.created_at)

    let line = `${index + 1}. ${pinned}[${id}] 我有：${have} → 想要：${want}`
    if (note) line += `（${note}）`
    if (remark) line += `\n   备注：${remark}`
    line += `  ${time}`
    return line
  })

  const pageText = pageInfo.total_pages > 1
    ? `\n第 ${pageInfo.page_no} 页 / 共 ${pageInfo.total_pages} 页（共 ${pageInfo.total} 条）`
    : ''

  lines.push(pageText)
  lines.push(`\n用「${formatCommand('换蛋广场 <页码>')}」翻页`)

  return lines.join('\n')
}

function buildMyPostsText (items = []) {
  if (items.length === 0) return '你当前没有换蛋帖。'

  const statusMap = {
    active: '✅ 生效中',
    closed: '🔒 已关闭',
    deleted: '❌ 已删除'
  }
  const reviewMap = {
    pending: '⏳ 待审核',
    manual_pending: '⏳ 人工审核中',
    approved: '✅ 已通过',
    rejected: '❌ 已拒绝'
  }

  const lines = items.map((item, index) => {
    const status = statusMap[item?.status] || item?.status
    const review = reviewMap[item?.review_status] || item?.review_status
    const have = trimText(item?.have_text) || '未填写'
    const want = trimText(item?.want_text) || '未填写'
    const postId = trimText(item?.post_id)

    return `${index + 1}. [${postId}] 我有：${have} → 想要：${want}\n   状态：${status} | 审核：${review}`
  })

  lines.push(`\n用「${formatCommand('关闭换蛋帖 <帖子ID>')}」关闭帖子`)

  return lines.join('\n')
}

function parseSubscribeFilters (raw = '') {
  const filters = {}
  const tokens = trimText(raw).split(/\s+/).filter(Boolean)

  for (const token of tokens) {
    const colonMatch = token.match(/^(.+?)[:：](.+)$/)
    if (colonMatch) {
      const key = trimText(colonMatch[1])
      const value = trimText(colonMatch[2])
      const keyMap = {
        '想要': 'want_text',
        '我有': 'have_text',
        '补充': 'want_note',
        '学号': 'id',
        '搜索': 'q'
      }
      const mappedKey = keyMap[key] || key
      if (mappedKey && value) {
        filters[mappedKey] = value
      }
      continue
    }

    if (token) {
      filters.want_text = filters.want_text ? `${filters.want_text} ${token}` : token
    }
  }

  return filters
}

export class RocomEggExchange extends plugin {
  constructor (e) {
    super({
      name: '[WeGame-plugin][rocom] 换蛋广场',
      dsc: '洛克王国世界换蛋广场',
      event: 'message',
      priority: 119,
      rule: [
        {
          reg: EXCHANGE_LIST_REG,
          fnc: 'queryExchangeList'
        },
        {
          reg: EXCHANGE_POST_REG,
          fnc: 'postExchange'
        },
        {
          reg: EXCHANGE_MY_REG,
          fnc: 'queryMyPosts'
        },
        {
          reg: EXCHANGE_CLOSE_REG,
          fnc: 'closePost'
        },
        {
          reg: SUBSCRIBE_EGG_REG,
          fnc: 'subscribeEgg',
          permission: 'admin'
        },
        {
          reg: UNSUBSCRIBE_EGG_REG,
          fnc: 'unsubscribeEgg',
          permission: 'admin'
        }
      ]
    })

    this.e = e
    this.api = new RocomApi()
    this.accountService = new WeGameAccountService(e)
  }

  async queryExchangeList () {
    try {
      const pageNo = this.parsePageArg(EXCHANGE_LIST_REG)
      await this.reply(`正在查询换蛋广场，第 ${pageNo} 页...`)

      const data = await this.api.getEggExchanges(
        { page_no: pageNo },
        { userIdentifier: this.accountService.getUserIdentifier() }
      )

      const items = Array.isArray(data?.items) ? data.items : []
      if (items.length === 0) {
        throw new Error(pageNo > 1 ? '该页没有更多换蛋帖了' : '当前换蛋广场暂无帖子')
      }

      const pageInfo = {
        page_no: toNumber(data?.page_no, pageNo),
        total_pages: toNumber(data?.total_pages, 1),
        total: toNumber(data?.total, items.length)
      }

      await replyLargeText(this, '换蛋广场', buildExchangeListText(items, pageInfo))
      return true
    } catch (error) {
      logger.error('[WeGame-plugin][rocom] 换蛋广场查询失败', error)
      await this.reply(`换蛋广场查询失败：${error.message || error}`)
      return true
    }
  }

  async postExchange () {
    try {
      const raw = stripCommandPrefix(this.e.msg, '发布换蛋帖')
      if (!raw) {
        throw new Error(`格式：${formatCommand('发布换蛋帖 <我有>|<想要>')}\n用「|」分隔"我有"和"想要"`)
      }

      const parts = raw.split(/[/|｜]/).map((s) => trimText(s)).filter(Boolean)
      if (parts.length < 2) {
        throw new Error(`格式：${formatCommand('发布换蛋帖 <我有>|<想要>')}\n用「|」分隔"我有"和"想要"`)
      }

      const haveText = parts[0]
      const wantText = parts[1]
      const remark = parts[2] || ''

      await this.reply('正在发布换蛋帖...')

      const data = await this.api.postEggExchange(
        { have_text: haveText, want_text: wantText, remark },
        { userIdentifier: this.accountService.getUserIdentifier() }
      )

      const postId = trimText(data?.post_id || data?.id)
      const similarPosts = Array.isArray(data?.similar_posts) ? data.similar_posts : []

      const lines = [
        '✅ 换蛋帖发布成功！',
        `我有：${haveText}`,
        `想要：${wantText}`,
      ]

      if (remark) lines.push(`备注：${remark}`)
      if (postId) lines.push(`帖子 ID：${postId}`)
      lines.push('\n帖子已进入审核，通过后将展示在换蛋广场。')

      if (similarPosts.length > 0) {
        lines.push('\n📋 相似帖子推荐：')
        for (const post of similarPosts.slice(0, 3)) {
          const have = trimText(post?.have_text) || '?'
          const want = trimText(post?.want_text) || '?'
          lines.push(`  - [${trimText(post?.id)}] 我有：${have} → 想要：${want}`)
        }
      }

      await this.reply(lines.join('\n'))
      return true
    } catch (error) {
      logger.error('[WeGame-plugin][rocom] 发布换蛋帖失败', error)
      await this.reply(`发布换蛋帖失败：${error.message || error}`)
      return true
    }
  }

  async queryMyPosts () {
    try {
      await this.reply('正在查询你的换蛋帖...')

      const data = await this.api.getMyEggExchanges(
        {},
        { userIdentifier: this.accountService.getUserIdentifier() }
      )

      const items = Array.isArray(data?.items) ? data.items : []
      await replyLargeText(this, '我的换蛋帖', buildMyPostsText(items))
      return true
    } catch (error) {
      logger.error('[WeGame-plugin][rocom] 查询我的换蛋帖失败', error)
      await this.reply(`查询我的换蛋帖失败：${error.message || error}`)
      return true
    }
  }

  async closePost () {
    try {
      const match = String(this.e.msg || '').match(new RegExp(EXCHANGE_CLOSE_REG))
      const postId = trimText(match?.[1])
      if (!postId) {
        throw new Error(`格式：${formatCommand('关闭换蛋帖 <帖子ID>')}`)
      }

      await this.reply(`正在关闭换蛋帖 ${postId}...`)

      await this.api.closeEggExchange(
        postId,
        { close_reason: 'cancel' },
        { userIdentifier: this.accountService.getUserIdentifier() }
      )

      await this.reply(`✅ 换蛋帖 ${postId} 已关闭。`)
      return true
    } catch (error) {
      logger.error('[WeGame-plugin][rocom] 关闭换蛋帖失败', error)
      await this.reply(`关闭换蛋帖失败：${error.message || error}`)
      return true
    }
  }

  async subscribeEgg () {
    try {
      if (!this.e?.isGroup) {
        await this.reply('订阅换蛋仅支持群聊使用')
        return true
      }

      const raw = stripCommandPrefix(this.e.msg, '订阅换蛋')
      const filters = parseSubscribeFilters(raw)

      if (Object.keys(filters).length === 0) {
        throw new Error(
          `格式：${formatCommand('订阅换蛋 想要:上岸蛙 补充:固执')}\n` +
          '支持的筛选键：想要、我有、补充、学号、搜索'
        )
      }

      await this.reply('正在创建换蛋订阅...')

      const data = await this.api.createEggExchangeSubscription(
        { filters },
        { userIdentifier: this.accountService.getUserIdentifier() }
      )

      const subscription = data?.subscription || {}
      const subscriptionId = trimText(subscription?.subscription_id)
      const filterDesc = Object.entries(filters)
        .map(([key, value]) => `${key}=${value}`)
        .join('、')

      await this.reply(
        [
          '✅ 换蛋订阅创建成功！',
          `筛选条件：${filterDesc}`,
          subscriptionId ? `订阅 ID：${subscriptionId}` : '',
          '\n当有符合条件的新帖审核通过时，系统会推送通知。'
        ].filter(Boolean).join('\n')
      )
      return true
    } catch (error) {
      logger.error('[WeGame-plugin][rocom] 订阅换蛋失败', error)
      await this.reply(`订阅换蛋失败：${error.message || error}`)
      return true
    }
  }

  async unsubscribeEgg () {
    try {
      if (!this.e?.isGroup) {
        await this.reply('取消换蛋订阅仅支持群聊使用')
        return true
      }

      await this.reply('正在取消换蛋订阅...')

      const listData = await this.api.getEggExchangeSubscriptions(
        {},
        { userIdentifier: this.accountService.getUserIdentifier() }
      )

      const subscriptions = Array.isArray(listData?.subscriptions) ? listData.subscriptions : []
      if (subscriptions.length === 0) {
        await this.reply('当前没有换蛋订阅。')
        return true
      }

      let deletedCount = 0
      for (const sub of subscriptions) {
        const subscriptionId = trimText(sub?.subscription_id)
        if (!subscriptionId) continue

        try {
          await this.api.deleteEggExchangeSubscription(
            subscriptionId,
            { userIdentifier: this.accountService.getUserIdentifier() }
          )
          deletedCount++
        } catch (error) {
          logger.warn(`[WeGame-plugin][rocom] 删除换蛋订阅 ${subscriptionId} 失败: ${error.message || error}`)
        }
      }

      await this.reply(deletedCount > 0
        ? `✅ 已取消 ${deletedCount} 个换蛋订阅。`
        : '取消换蛋订阅失败，请稍后重试。'
      )
      return true
    } catch (error) {
      logger.error('[WeGame-plugin][rocom] 取消换蛋订阅失败', error)
      await this.reply(`取消换蛋订阅失败：${error.message || error}`)
      return true
    }
  }

  parsePageArg (reg) {
    const match = String(this.e.msg || '').match(new RegExp(reg))
    const raw = trimText(match?.[1])
    if (!raw) return 1

    const pageNo = Number(raw)
    if (!Number.isFinite(pageNo) || pageNo < 1) {
      throw new Error('页码必须大于等于 1')
    }
    if (pageNo > 50) {
      throw new Error('页码暂仅支持到 50')
    }
    return pageNo
  }
}
