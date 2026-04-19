import WeGameAccountService from '../../../model/accountService.js'
import { renderModuleTemplate } from '../../../model/moduleRender.js'
import RocomApi from '../model/api.js'
import { buildCommandReg, formatCommand, stripCommandPrefix } from '../utils/command.js'
import { ensureUpstreamSuccess } from '../../../utils/queryHelper.js'

function trimText (value = '') {
  return String(value || '').trim()
}

function toNumber (value, fallback = 0) {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : fallback
}

function normalizeUrl (value = '') {
  const text = trimText(value)
  if (!text) return ''
  if (text.startsWith('//')) return `https:${text}`
  return text
}

function resolveAccountType (loginType = '') {
  const normalized = trimText(loginType).toLowerCase()
  if (normalized === 'qq') return 1
  if (normalized === 'wechat') return 2
  return undefined
}

function formatPosterTime (value) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric) || numeric <= 0) return '未知'

  const date = new Date(numeric * 1000)
  if (Number.isNaN(date.getTime())) return '未知'

  const pad = (number) => String(number).padStart(2, '0')
  return `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export class RocomExchange extends plugin {
  constructor (e) {
    super({
      name: '[WeGame-plugin][rocom] 交换大厅',
      dsc: '洛克王国世界交换大厅',
      event: 'message',
      priority: 116,
      rule: [
        {
          reg: buildCommandReg('(?:交换大厅|大厅)(?:\\s+.+)?'),
          fnc: 'queryExchangeHall'
        }
      ]
    })

    this.e = e
    this.api = new RocomApi()
    this.accountService = new WeGameAccountService(e)
  }

  async queryExchangeHall () {
    try {
      const args = this.parseArgs()
      const { credential } = await this.accountService.resolveActiveCredential()
      await this.reply(args.refresh ? `正在刷新交换大厅，第 ${args.pageNo} 页...` : `正在查询交换大厅，第 ${args.pageNo} 页...`)

      const params = {
        page_no: args.pageNo,
        refresh: args.refresh
      }

      const accountType = resolveAccountType(credential?.loginType)
      if (accountType !== undefined) {
        params.account_type = accountType
      }

      const data = await this.api.getExchangePosters(credential.frameworkToken, params)
      ensureUpstreamSuccess(data)

      const posters = Array.isArray(data?.posters) ? data.posters : []
      if (posters.length === 0) {
        throw new Error(args.pageNo > 1 ? '该页没有更多交换大厅海报了' : '当前交换大厅暂无海报')
      }

      const image = await renderModuleTemplate(
        this.e,
        'rocom',
        'render/exchange-hall/index',
        {
          saveId: `rocom-exchange-${this.e.user_id}-${Date.now()}`,
          filterLabel: '全部',
          posts: posters.map((poster) => this.normalizePoster(poster)),
          currentPage: toNumber(data?.page_no, args.pageNo),
          totalPages: toNumber(data?.total_pages, 1),
          commandHint: `用「${formatCommand('交换大厅 <页码>')}」翻页，追加“刷新”可强制刷新`
        },
        {
          retType: 'base64'
        }
      )

      if (!image) {
        throw new Error('交换大厅渲染失败')
      }

      await this.reply(image)
      return true
    } catch (error) {
      logger.error('[WeGame-plugin][rocom] 交换大厅查询失败', error)
      await this.reply(`交换大厅查询失败：${error.message || error}`)
      return true
    }
  }

  parseArgs () {
    const raw = stripCommandPrefix(this.e.msg, '交换大厅') || stripCommandPrefix(this.e.msg, '大厅')
    if (!raw) {
      return {
        pageNo: 1,
        refresh: false
      }
    }

    const tokens = raw.split(/\s+/).filter(Boolean)
    let pageNo = 1
    let refresh = false

    for (const token of tokens) {
      const normalized = trimText(token).toLowerCase()
      if (normalized === '刷新' || normalized === 'refresh') {
        refresh = true
        continue
      }

      if (/^\d+$/.test(token)) {
        pageNo = Number(token)
        continue
      }

      throw new Error(`格式：${formatCommand('交换大厅 [页码] [刷新]')}`)
    }

    if (pageNo < 1 || pageNo > 50) {
      throw new Error('页码仅支持 1-50')
    }

    return {
      pageNo,
      refresh
    }
  }

  normalizePoster (poster = {}) {
    const userInfo = poster?.user_info || {}
    const expireTime = Number(poster?.expire_time)
    const nowSeconds = Math.floor(Date.now() / 1000)

    return {
      userName: trimText(userInfo?.nickname) || '未知玩家',
      userLevel: toNumber(userInfo?.level, 0),
      isOnline: Number(userInfo?.online_status) === 1,
      avatarUrl: normalizeUrl(userInfo?.avatar_url),
      userId: trimText(userInfo?.role_id) || '未知',
      wantText: trimText(poster?.want_item_name) || trimText(poster?.message) || '交友',
      wantBadgeUrl: '',
      provideItems: Array.isArray(poster?.offer_items) ? poster.offer_items.map((item) => trimText(item)).filter(Boolean) : [],
      timeLabel: formatPosterTime(poster?.create_time),
      isExpired: Number.isFinite(expireTime) ? nowSeconds >= expireTime : false
    }
  }
}
