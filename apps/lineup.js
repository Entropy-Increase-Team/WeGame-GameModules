import WeGameAccountService from '../../../model/accountService.js'
import { renderModuleTemplate } from '../../../model/moduleRender.js'
import RocomApi from '../model/api.js'
import RocomConfig from '../utils/config.js'
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

function encodeAssetPath (assetPath = '') {
  return String(assetPath || '')
    .split('/')
    .filter(Boolean)
    .map((part) => encodeURIComponent(part))
    .join('/')
}

function resolveAccountType (loginType = '') {
  const normalized = trimText(loginType).toLowerCase()
  if (normalized === 'qq') return 1
  if (normalized === 'wechat') return 2
  return undefined
}

function getDetailSearchPages () {
  return Number(RocomConfig.get('lineup', 'detail_search_pages')) ||
    Number(RocomConfig.get('lineup', 'detail_lookup_pages')) ||
    10
}

function buildLineupCommandHint (category = '') {
  const normalizedCategory = trimText(category)
  if (!normalizedCategory) {
    return `用「${formatCommand('阵容 <分类> <页码>')}」查看不同阵容分类`
  }

  return `当前分类：${normalizedCategory}，继续翻页可发送「${formatCommand(`阵容 ${normalizedCategory} 2`)}」`
}

export class RocomLineup extends plugin {
  constructor (e) {
    super({
      name: '[WeGame-plugin][rocom] 阵容助手',
      dsc: '洛克王国世界阵容助手与详情查询',
      event: 'message',
      priority: 115,
      rule: [
        {
          reg: buildCommandReg('(?:查看阵容|阵容详情)(?:\\s+.+)?'),
          fnc: 'queryLineupDetail'
        },
        {
          reg: buildCommandReg('阵容(?:\\s+.+)?'),
          fnc: 'queryLineupList'
        }
      ]
    })

    this.e = e
    this.api = new RocomApi()
    this.accountService = new WeGameAccountService(e)
  }

  async queryLineupList () {
    try {
      const args = this.parseLineupArgs()
      const { credential } = await this.accountService.resolveActiveCredential()
      await this.reply(`正在查询阵容助手，第 ${args.pageNo} 页...`)

      const params = {
        page_no: args.pageNo
      }
      if (args.category) {
        params.category = args.category
      }

      const accountType = resolveAccountType(credential?.loginType)
      if (accountType !== undefined) {
        params.account_type = accountType
      }

      const data = await this.api.getLineupList(credential.frameworkToken, params)
      ensureUpstreamSuccess(data)

      const lineups = Array.isArray(data?.lineups) ? data.lineups : []
      if (lineups.length === 0) {
        throw new Error(args.pageNo > 1 ? '该页没有更多阵容数据了' : '当前没有可用的阵容数据')
      }

      const image = await renderModuleTemplate(
        this.e,
        'rocom',
        'render/lineup/index',
        {
          saveId: `rocom-lineup-${this.e.user_id}-${Date.now()}`,
          category: args.category,
          lineups: lineups.map((lineup) => this.normalizeLineupCard(lineup)),
          page_no: toNumber(data?.page_no, args.pageNo),
          total_pages: toNumber(data?.total_pages, 1),
          commandHint: buildLineupCommandHint(args.category)
        },
        {
          retType: 'base64',
          beforeRender: ({ data }) => this.withRenderAssets(data)
        }
      )

      if (!image) {
        throw new Error('阵容列表渲染失败')
      }

      await this.reply(image)
      return true
    } catch (error) {
      logger.error('[WeGame-plugin][rocom] 阵容助手查询失败', error)
      await this.reply(`阵容助手查询失败：${error.message || error}`)
      return true
    }
  }

  async queryLineupDetail () {
    try {
      const lineupId = this.parseLineupId()
      const { credential } = await this.accountService.resolveActiveCredential()
      await this.reply(`正在查询阵容 ${lineupId} 的详情...`)

      const targetLineup = await this.findLineupById(credential, lineupId)
      if (!targetLineup) {
        throw new Error(`未找到阵容码为 ${lineupId} 的阵容`)
      }

      const image = await renderModuleTemplate(
        this.e,
        'rocom',
        'render/lineup-detail/index',
        {
          saveId: `rocom-lineup-detail-${this.e.user_id}-${Date.now()}`,
          lineup: this.normalizeLineupDetail(targetLineup)
        },
        {
          retType: 'base64',
          beforeRender: ({ data }) => this.withRenderAssets(data)
        }
      )

      if (!image) {
        throw new Error('阵容详情渲染失败')
      }

      await this.reply(image)
      return true
    } catch (error) {
      logger.error('[WeGame-plugin][rocom] 阵容详情查询失败', error)
      await this.reply(`阵容详情查询失败：${error.message || error}`)
      return true
    }
  }

  parseLineupArgs () {
    const raw = stripCommandPrefix(this.e.msg, '阵容')
    if (!raw) {
      return {
        category: '',
        pageNo: 1
      }
    }

    const tokens = raw.split(/\s+/).filter(Boolean)
    let pageNo = 1
    const categoryTokens = []

    for (const token of tokens) {
      if (/^\d+$/.test(token)) {
        pageNo = Number(token)
        continue
      }

      categoryTokens.push(token)
    }

    if (pageNo < 1 || pageNo > 50) {
      throw new Error('页码仅支持 1-50')
    }

    return {
      category: categoryTokens.join(' ').trim(),
      pageNo
    }
  }

  parseLineupId () {
    const raw = stripCommandPrefix(this.e.msg, '查看阵容') || stripCommandPrefix(this.e.msg, '阵容详情')
    const lineupId = trimText(raw)

    if (!lineupId) {
      throw new Error(`格式：${formatCommand('查看阵容 <阵容码>')}`)
    }

    return lineupId
  }

  async findLineupById (credential = {}, lineupId = '') {
    const accountType = resolveAccountType(credential?.loginType)
    const maxSearchPages = Math.max(1, getDetailSearchPages())
    let totalPages = 1

    for (let pageNo = 1; pageNo <= Math.min(totalPages, maxSearchPages); pageNo++) {
      const params = { page_no: pageNo }
      if (accountType !== undefined) {
        params.account_type = accountType
      }

      const data = await this.api.getLineupList(credential.frameworkToken, params)
      ensureUpstreamSuccess(data)

      totalPages = Math.max(1, toNumber(data?.total_pages, 1))
      const lineups = Array.isArray(data?.lineups) ? data.lineups : []
      const target = lineups.find((item) => trimText(item?.id) === trimText(lineupId))
      if (target) {
        return target
      }
    }

    return null
  }

  normalizeLineupCard (lineup = {}) {
    return {
      name: trimText(lineup?.name) || '未命名阵容',
      tags: Array.isArray(lineup?.tags) ? lineup.tags.map((item) => trimText(item)).filter(Boolean) : [],
      pets: this.normalizeLineupPets(lineup?.lineup?.pets, false),
      author_name: trimText(lineup?.author_name) || '匿名作者',
      author_avatar: normalizeUrl(lineup?.author_avatar),
      likes: toNumber(lineup?.likes, 0),
      lineup_code: trimText(lineup?.id || lineup?.code)
    }
  }

  normalizeLineupDetail (lineup = {}) {
    return {
      ...this.normalizeLineupCard(lineup),
      pets: this.normalizeLineupPets(lineup?.lineup?.pets, true)
    }
  }

  normalizeLineupPets (pets = [], includeBloodline = false) {
    return (Array.isArray(pets) ? pets : []).map((pet) => {
      const normalized = {
        pet_name: trimText(pet?.pet_name) || `精灵 ${pet?.id || '?'}`,
        pet_img_url: normalizeUrl(pet?.pet_img_url),
        skills_info: Array.isArray(pet?.skills_info)
          ? pet.skills_info.map((skill) => ({
              skill_name: trimText(skill?.skill_name) || '未知技能',
              skill_img_url: normalizeUrl(skill?.skill_img_url)
            }))
          : []
      }

      if (!includeBloodline) {
        return normalized
      }

      return {
        ...normalized,
        skills: normalized.skills_info.map((skill) => skill.skill_img_url).filter(Boolean),
        bloodline: Boolean(pet?.bloodline_info),
        bloodline_icon: normalizeUrl(pet?.bloodline_info?.icon)
      }
    })
  }

  withRenderAssets (data = {}) {
    const buildResUrl = (assetPath) => `${data.pluResPath}${encodeAssetPath(assetPath)}`
    const fallbackPetImage = buildResUrl('img/roco_icon.png')
    const fallbackAvatar = buildResUrl('img/头像黑色圆底.png')

    const patchPets = (pets = [], includeDetail = false) => (pets || []).map((pet) => ({
      ...pet,
      pet_img_url: normalizeUrl(pet?.pet_img_url) || fallbackPetImage,
      ...(includeDetail
        ? {
            skills: (pet?.skills || []).map((skill) => normalizeUrl(skill)).filter(Boolean),
            bloodline_icon: normalizeUrl(pet?.bloodline_icon)
          }
        : {
            skills_info: (pet?.skills_info || []).map((skill) => ({
              ...skill,
              skill_img_url: normalizeUrl(skill?.skill_img_url)
            }))
          })
    }))

    return {
      ...data,
      fallbackPetImage,
      lineups: (data?.lineups || []).map((lineup) => ({
        ...lineup,
        author_avatar: normalizeUrl(lineup?.author_avatar) || fallbackAvatar,
        pets: patchPets(lineup?.pets, false)
      })),
      lineup: data?.lineup
        ? {
            ...data.lineup,
            author_avatar: normalizeUrl(data.lineup?.author_avatar) || fallbackAvatar,
            pets: patchPets(data.lineup?.pets, true)
          }
        : data?.lineup
    }
  }
}
