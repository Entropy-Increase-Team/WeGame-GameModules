import WeGameAccountService from '../../../model/accountService.js'
import { renderModuleTemplate } from '../../../model/moduleRender.js'
import RocomApi from '../model/api.js'
import { buildCommandReg, formatCommand, stripCommandPrefix } from '../utils/command.js'
import { ensureUpstreamSuccess } from '../../../utils/queryHelper.js'

const PAGE_SIZE = 4

function encodeAssetPath (assetPath = '') {
  return String(assetPath || '')
    .split('/')
    .filter(Boolean)
    .map((part) => encodeURIComponent(part))
    .join('/')
}

function normalizeUrl (value) {
  const text = String(value || '').trim()
  if (!text) return ''
  if (text.startsWith('//')) return `https:${text}`
  if (/^https?:\/\//.test(text)) return text
  return ''
}

function toDisplayText (value, fallback = '--') {
  if (value === undefined || value === null || value === '') return fallback
  return String(value)
}

function formatWinRate (value) {
  const num = Number(value)
  if (!Number.isFinite(num)) return '--'
  return `${num.toFixed(2).replace(/\.00$/, '').replace(/(\.\d)0$/, '$1')}%`
}

function normalizeBattleResult (value) {
  const text = String(value ?? '').trim().toLowerCase()
  if (Number(value) === 0) return 'win'
  if (Number(value) === 1) return 'fail'
  if (['win', 'success', 'true'].includes(text)) return 'win'
  return 'fail'
}

function formatBattleTime (value) {
  const date = new Date(String(value || '').trim())
  if (Number.isNaN(date.getTime())) {
    return {
      time: '--:--',
      date: '--'
    }
  }

  const pad = (num) => String(num).padStart(2, '0')
  return {
    time: `${pad(date.getHours())}:${pad(date.getMinutes())}`,
    date: `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
  }
}

function normalizeBattlePets (petInfoList = []) {
  if (!Array.isArray(petInfoList)) return []

  return petInfoList.slice(0, 6).map((item, index) => ({
    name: toDisplayText(item?.pet_name, `精灵 ${index + 1}`),
    icon: normalizeUrl(item?.pet_img_url)
  }))
}

export class RocomRecord extends plugin {
  constructor (e) {
    super({
      name: '[WeGame-plugin][rocom] 大赛战绩',
      dsc: '洛克王国世界闪耀大赛战绩',
      event: 'message',
      priority: 112,
      rule: [
        {
          reg: buildCommandReg('(?:大赛战绩|战绩)(?:\\s+.+)?'),
          fnc: 'queryBattleRecord'
        }
      ]
    })

    this.e = e
    this.api = new RocomApi()
    this.accountService = new WeGameAccountService(e)
  }

  async queryBattleRecord () {
    try {
      const pageNo = this.parsePageArg()
      const { credential } = await this.accountService.resolveActiveCredential()
      const userIdentifier = this.accountService.getUserIdentifier()
      await this.reply(`正在查询闪耀大赛战绩，第 ${pageNo} 页...`)

      const [roleData, battleOverviewData, battlePage] = await Promise.all([
        this.loadRoleProfile(credential.frameworkToken, userIdentifier),
        this.loadBattleOverview(credential.frameworkToken, credential?.loginType, userIdentifier),
        this.loadBattlePage(credential.frameworkToken, credential?.loginType, pageNo, userIdentifier)
      ])

      const renderData = this.buildRenderData({
        credential,
        roleData,
        battleOverviewData,
        battlePage
      })

      const image = await renderModuleTemplate(
        this.e,
        'rocom',
        'render/record/index',
        renderData,
        {
          retType: 'base64',
          beforeRender: ({ data }) => this.withRenderAssets(data)
        }
      )

      if (!image) {
        throw new Error('大赛战绩渲染失败')
      }

      await this.reply(image)
      return true
    } catch (error) {
      logger.error('[WeGame-plugin][rocom] 查询大赛战绩失败', error)
      await this.reply(`查询大赛战绩失败：${error.message || error}`)
      return true
    }
  }

  parsePageArg () {
    const raw = this.extractCommandArg()
    if (!raw) return 1

    if (!/^\d+$/.test(raw)) {
      throw new Error(`格式：${formatCommand('战绩 <页数>')}`)
    }

    const pageNo = Number(raw)
    if (pageNo < 1) {
      throw new Error('页码必须大于等于 1')
    }

    if (pageNo > 50) {
      throw new Error('页码暂仅支持到 50')
    }

    return pageNo
  }

  extractCommandArg () {
    return stripCommandPrefix(this.e.msg, '大赛战绩') || stripCommandPrefix(this.e.msg, '战绩')
  }

  resolveZone (loginType = '') {
    const normalized = String(loginType || '').trim().toLowerCase()
    if (normalized === 'qq') return 0
    if (normalized === 'wechat') return 1
    return undefined
  }

  async loadRoleProfile (frameworkToken, userIdentifier = '') {
    try {
      const data = await this.api.getRoleProfile(frameworkToken, {}, { userIdentifier })
      ensureUpstreamSuccess(data)
      return data
    } catch (error) {
      logger.warn(`[WeGame-plugin][rocom] 读取角色资料失败，改用本地账号信息: ${error.message || error}`)
      return null
    }
  }

  async loadBattleOverview (frameworkToken, loginType = '', userIdentifier = '') {
    try {
      const zone = this.resolveZone(loginType)
      const params = zone !== undefined ? { zone } : {}
      const data = await this.api.getBattleOverview(frameworkToken, params, { userIdentifier })
      ensureUpstreamSuccess(data)
      return data
    } catch (error) {
      logger.warn(`[WeGame-plugin][rocom] 读取对战总览失败: ${error.message || error}`)
      return {}
    }
  }

  async loadBattlePage (frameworkToken, loginType = '', pageNo = 1, userIdentifier = '') {
    const zone = this.resolveZone(loginType)
    let afterTime = ''
    let currentPage = 1
    let lastResponse = null

    while (currentPage <= pageNo) {
      const params = { page_size: PAGE_SIZE }
      if (zone !== undefined) {
        params.zone = zone
      }
      if (afterTime) {
        params.after_time = afterTime
      }

      const data = await this.api.getBattleList(frameworkToken, params, { userIdentifier })
      ensureUpstreamSuccess(data)

      const battles = Array.isArray(data?.battles) ? data.battles : []
      const finish = data?.finish === true

      if (currentPage === 1 && battles.length === 0) {
        throw new Error('暂无大赛战绩数据')
      }

      if (currentPage === pageNo) {
        return {
          battles,
          finish,
          currentPage
        }
      }

      if (finish || battles.length === 0) {
        throw new Error(`当前最多只有 ${currentPage} 页战绩`)
      }

      afterTime = String(battles[battles.length - 1]?.battle_time || '').trim()
      if (!afterTime) {
        throw new Error('战绩分页游标缺失，无法继续翻页')
      }

      lastResponse = data
      currentPage++
    }

    return {
      battles: Array.isArray(lastResponse?.battles) ? lastResponse.battles : [],
      finish: lastResponse?.finish === true,
      currentPage: pageNo
    }
  }

  buildRenderData ({ credential, roleData, battleOverviewData, battlePage }) {
    const role = roleData?.role || credential?.role || {}
    const battles = Array.isArray(battlePage?.battles) ? battlePage.battles : []

    return {
      saveId: `record-card-${this.e.user_id}-${Date.now()}`,
      userName: toDisplayText(role?.name || battles[0]?.nickname, '洛克玩家'),
      userLevel: toDisplayText(role?.level),
      userUid: toDisplayText(role?.id || role?.openid || credential?.tgpId),
      userAvatar: normalizeUrl(role?.avatar_url || battles[0]?.avatar_url || role?.avatar),
      winRate: formatWinRate(battleOverviewData?.win_rate),
      totalMatch: toDisplayText(battleOverviewData?.total_match, '0'),
      currentPage: battlePage?.currentPage || 1,
      totalPages: battlePage?.finish ? String(battlePage?.currentPage || 1) : '',
      pageText: battlePage?.finish
        ? `第 ${battlePage?.currentPage || 1} 页 / 共 ${battlePage?.currentPage || 1} 页`
        : `第 ${battlePage?.currentPage || 1} 页 / 可继续翻页`,
      footerCommandHint: `用 “${formatCommand('战绩 <页数>')}” 进行翻页`,
      battles: battles.map((battle) => {
        const battleTime = formatBattleTime(battle?.battle_time)
        return {
          leftAvatar: normalizeUrl(battle?.avatar_url),
          leftName: toDisplayText(battle?.nickname, '我方'),
          leftPets: normalizeBattlePets(battle?.pet_base_info),
          rightAvatar: normalizeUrl(battle?.enemy_avatar_url),
          rightName: toDisplayText(battle?.enemy_nickname, '未知对手'),
          rightPets: normalizeBattlePets(battle?.enemy_pet_base_info),
          result: normalizeBattleResult(battle?.result),
          time: battleTime.time,
          date: battleTime.date
        }
      })
    }
  }

  withRenderAssets (data = {}) {
    const buildResUrl = (assetPath) => `${data.pluResPath}${encodeAssetPath(assetPath)}`
    const defaultAvatar = buildResUrl('img/测试头像.png')
    const fallbackPetImage = buildResUrl('img/本周达宠 测试立绘.png')

    return {
      ...data,
      defaultAvatar,
      fallbackPetImage,
      userAvatarDisplay: normalizeUrl(data.userAvatar) || defaultAvatar,
      battles: (data.battles || []).map((battle) => ({
        ...battle,
        leftAvatar: normalizeUrl(battle.leftAvatar) || defaultAvatar,
        rightAvatar: normalizeUrl(battle.rightAvatar) || defaultAvatar,
        leftPets: (battle.leftPets || []).map((pet) => ({
          ...pet,
          icon: normalizeUrl(pet.icon) || fallbackPetImage
        })),
        rightPets: (battle.rightPets || []).map((pet) => ({
          ...pet,
          icon: normalizeUrl(pet.icon) || fallbackPetImage
        }))
      }))
    }
  }
}
