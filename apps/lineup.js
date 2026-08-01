import fs from 'node:fs'
import path from 'node:path'
import WeGameAccountService from '../../../model/accountService.js'
import { renderModuleTemplate } from '../../../model/moduleRender.js'
import RocomApi from '../model/api.js'
import RocomConfig from '../utils/config.js'
import { buildCommandReg, formatCommand, stripCommandPrefix } from '../utils/command.js'
import { ensureUpstreamSuccess } from '../../../utils/queryHelper.js'
import { trimText, toNumber, normalizeUrl, encodeAssetPath, resolveAccountType } from '../utils/rocom.js'

const SHARE_CODE_PARSE_COMMANDS = ['阵容解析', '解析阵容', '分享码解析']
const PET_MAP_PATH = path.join(process.cwd(), 'plugins', 'WeGame-plugin', 'modules', 'rocom', 'utils', 'map', 'pet_list.json')
const LOCAL_PET_MAP_PATH = path.join(process.cwd(), 'utils', 'map', 'pet_list.json')
const NATURE_MAP_PATH = path.join(process.cwd(), 'plugins', 'WeGame-plugin', 'modules', 'rocom', 'utils', 'map', 'nature_map.json')
const LOCAL_NATURE_MAP_PATH = path.join(process.cwd(), 'utils', 'map', 'nature_map.json')
const ELEMENT_COLORS = {
  草: '#4ebc73',
  火: '#db5525',
  水: '#3f89b4',
  光: '#6aa9fe',
  地: '#9a7e3f',
  冰: '#63aeda',
  龙: '#ed4962',
  电: '#e7c506',
  毒: '#ba62e0',
  虫: '#96ca0f',
  武: '#ff9636',
  翼: '#3ec7ca',
  萌: '#fc74a7',
  幽: '#9446ec',
  恶: '#cf467a',
  机械: '#40cba9',
  幻: '#9fa7f8',
  普通: '#babbc6',
  无: '#babbc6'
}

let petMapCache = null
let natureMapCache = null

function loadJsonMap (filePaths = [], label = '映射') {
  for (const filePath of filePaths) {
    try {
      if (fs.existsSync(filePath)) {
        return JSON.parse(fs.readFileSync(filePath, 'utf8'))
      }
    } catch (error) {
      logger.warn(`[WeGame-plugin][rocom] 读取${label}失败：${error.message || error}`)
    }
  }
  return {}
}

function loadPetMap () {
  if (!petMapCache) petMapCache = loadJsonMap([PET_MAP_PATH, LOCAL_PET_MAP_PATH], '精灵映射')
  return petMapCache
}

function loadNatureMap () {
  if (!natureMapCache) natureMapCache = loadJsonMap([NATURE_MAP_PATH, LOCAL_NATURE_MAP_PATH], '性格映射')
  return natureMapCache
}

function normalizeResourceUrl (value = '', baseUrl = '') {
  const url = normalizeUrl(value)
  if (url) return url
  const text = trimText(value)
  if (!text) return ''
  const normalizedBaseUrl = trimText(baseUrl).replace(/\/+$/, '')
  if (text.startsWith('/') && normalizedBaseUrl) return `${normalizedBaseUrl}${text}`
  return ''
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
          reg: buildCommandReg('(?:阵容解析|解析阵容|分享码解析)(?:\\s+[\\s\\S]+)?'),
          fnc: 'parseShareCode'
        },
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

  async parseShareCode () {
    try {
      const shareCode = this.parseShareCodeArg()
      const userIdentifier = this.accountService.getUserIdentifier()
      await this.reply('正在解析阵容码...')

      const data = await this.api.parseShareCode({ share_code: shareCode }, { userIdentifier })
      ensureUpstreamSuccess(data)
      const teamData = this.normalizeShareCodeTeam(data)
      if (teamData.teams.length === 0) {
        throw new Error('阵容码解析成功，但没有返回阵容精灵数据')
      }

      const image = await renderModuleTemplate(
        this.e,
        'rocom',
        'render/share-code-team/index',
        {
          saveId: `rocom-share-code-${this.e.user_id}-${Date.now()}`,
          team: teamData
        },
        {
          retType: 'base64',
          beforeRender: ({ data }) => this.withShareCodeRenderAssets(data)
        }
      )

      if (!image) {
        throw new Error('阵容卡片渲染失败')
      }

      await this.reply(image)
      return true
    } catch (error) {
      logger.error('[WeGame-plugin][rocom] 阵容码解析失败', error)
      await this.reply(`阵容码解析失败：${error.message || error}`)
      return true
    }
  }

  async queryLineupList () {
    try {
      const args = this.parseLineupArgs()
      const { credential } = await this.accountService.resolveActiveCredential()
      const userIdentifier = this.accountService.getUserIdentifier()
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

      const data = await this.api.getLineupList(credential.frameworkToken, params, { userIdentifier })
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

  stripFirstCommand (commands = []) {
    for (const command of commands) {
      const raw = stripCommandPrefix(this.e.msg, command)
      if (raw) return raw
    }
    return ''
  }

  parseShareCodeArg () {
    const shareCode = trimText(this.stripFirstCommand(SHARE_CODE_PARSE_COMMANDS))
    if (!shareCode) {
      throw new Error(`格式：${formatCommand('阵容解析 <阵容码>')}`)
    }
    return shareCode
  }

  normalizeShareCodeTeam (payload = {}) {
    const data = payload?.data && typeof payload.data === 'object' ? payload.data : payload
    const teams = Array.isArray(data?.teams) ? data.teams : []
    const spriteCount = toNumber(data?.sprite_count ?? data?.spriteCount, teams.length) || teams.length
    const baseUrl = this.api.getBaseUrl()

    return {
      share_code: trimText(data?.share_code || data?.shareCode),
      mode_name: trimText(data?.mode?.name) || '阵容分享',
      magic_icon: normalizeResourceUrl(data?.magic?.icon, baseUrl),
      sprite_count: spriteCount,
      count_label: `/ ${spriteCount} 精灵`,
      teams: teams
        .slice()
        .sort((a, b) => toNumber(a?.slot, 0) - toNumber(b?.slot, 0))
        .map((team, index) => this.normalizeShareCodePet(team, index))
    }
  }

  normalizeShareCodePet (team = {}, index = 0) {
    const baseUrl = this.api.getBaseUrl()
    const petId = trimText(team?.pet?.id || team?.pet_id || team?.id)
    const petMeta = loadPetMap()[petId] || {}
    const bloodlineName = trimText(team?.bloodline?.name)
    const bloodlineElement = bloodlineName.replace(/系血脉$/, '').replace(/血脉$/, '') || '普通'
    const nature = loadNatureMap()[trimText(team?.personality?.id)] || {}
    const typeNames = Array.isArray(team?.pet?.type_names)
      ? team.pet.type_names
      : Array.isArray(petMeta?.unit_type) ? petMeta.unit_type : []
    const slot = toNumber(team?.slot, index + 1)

    return {
      slot,
      slotText: String(slot).padStart(2, '0'),
      color: ELEMENT_COLORS[bloodlineElement] || '#a687d5',
      pet: {
        id: petId,
        name: trimText(team?.pet?.name) || trimText(petMeta?.name) || `精灵 ${index + 1}`,
        icon: normalizeResourceUrl(team?.pet?.icon || team?.pet?.pet_img_url || team?.pet_img_url, baseUrl)
      },
      typeIcons: typeNames.map((name) => trimText(name)).filter(Boolean),
      bloodline: {
        name: bloodlineName || `${bloodlineElement}系血脉`,
        element: bloodlineElement,
        icon: normalizeResourceUrl(team?.bloodline?.icon, baseUrl)
      },
      personality: {
        id: trimText(team?.personality?.id),
        name: trimText(team?.personality?.name) || trimText(nature?.name) || '未知',
        up: trimText(nature?.up),
        down: trimText(nature?.down)
      },
      ivs_detail: (Array.isArray(team?.ivs_detail) ? team.ivs_detail : []).map((item) => ({
        name: trimText(item?.name || item?.label || item?.text || item)
      })).filter((item) => item.name),
      skills: (Array.isArray(team?.skills) ? team.skills : []).map((skill) => ({
        name: trimText(skill?.name || skill?.skill_name) || '未知技能',
        icon: normalizeResourceUrl(skill?.icon || skill?.skill_img_url, baseUrl)
      }))
    }
  }

  withShareCodeRenderAssets (data = {}) {
    const buildResUrl = (assetPath) => `${data.pluResPath}${encodeAssetPath(assetPath)}`
    const assetRoot = 'render/share-code-team/assets'
    const fallbackPetImage = buildResUrl(`${assetRoot}/roco_icon.png`)
    const baseUrl = this.api.getBaseUrl()
    const normalizeImage = (value = '') => normalizeResourceUrl(value, baseUrl) || fallbackPetImage
    const asset = (assetPath = '') => buildResUrl(`${assetRoot}/${assetPath}`)

    return {
      ...data,
      team: {
        ...(data.team || {}),
        magic_icon: normalizeImage(data.team?.magic_icon),
        teams: (data.team?.teams || []).map((team) => ({
          ...team,
          pet: {
            ...team.pet,
            icon: normalizeImage(team?.pet?.icon)
          },
          typeIcons: (team?.typeIcons || []).map((name) => ({ name, icon: asset(`宠物属性/${name}.png`) })),
          bloodline: {
            ...team.bloodline,
            icon: normalizeResourceUrl(team?.bloodline?.icon, baseUrl) || asset(`血脉/${team?.bloodline?.element || '普通'}.png`)
          },
          skills: (team?.skills || []).map((skill) => ({
            ...skill,
            icon: normalizeImage(skill?.icon)
          }))
        }))
      },
      shareAssets: {
        rocoIcon: fallbackPetImage,
        logo: asset('eit-logo.png'),
        star: asset('img_xingxingdi.png'),
        wax: asset('火漆印.png'),
        frame: asset('立绘背景框.png')
      }
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

      const data = await this.api.getLineupList(credential.frameworkToken, params, {
        userIdentifier: this.accountService.getUserIdentifier()
      })
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
