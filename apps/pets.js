import WeGameAccountService from '../../../model/accountService.js'
import { renderModuleTemplate } from '../../../model/moduleRender.js'
import RocomApi from '../model/api.js'
import RocomConfig from '../utils/config.js'
import { buildCommandReg, formatCommand, stripCommandPrefix } from '../utils/command.js'
import { ensureUpstreamSuccess } from '../../../utils/queryHelper.js'
import { getLoginTypeLabel } from '../../../utils/common.js'

const PET_SUBSETS = {
  全部: 0,
  了不起: 1,
  异色: 2,
  炫彩: 3
}

function getMaxPage () {
  return Number(RocomConfig.get('rocom', 'max_page')) || 5
}

function getPageSize () {
  return Number(RocomConfig.get('rocom', 'page_size')) || 10
}

function getPetSubsetLabel (value) {
  const target = Number(value)
  return Object.keys(PET_SUBSETS).find((key) => PET_SUBSETS[key] === target) || '全部'
}

function getPetTabText (value) {
  const label = getPetSubsetLabel(value)
  return label === '全部' ? '全部' : `${label}精灵`
}

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
  return text
}

function toDisplayText (value, fallback = '--') {
  if (value === undefined || value === null || value === '') return fallback
  return String(value)
}

function toNumber (value, fallback = 0) {
  const num = Number(value)
  return Number.isFinite(num) ? num : fallback
}

export class RocomPets extends plugin {
  constructor (e) {
    super({
      name: '[WeGame-plugin][rocom] 精灵列表',
      dsc: '洛克王国世界精灵列表查询',
      event: 'message',
      priority: 113,
      rule: [
        {
          reg: buildCommandReg('精灵列表(?:\\s+.+)?'),
          fnc: 'queryPetList'
        }
      ]
    })

    this.e = e
    this.api = new RocomApi()
    this.accountService = new WeGameAccountService(e)
  }

  async queryPetList () {
    try {
      const args = this.parseCommandArgs()
      const { credential, binding } = await this.accountService.resolveActiveCredential()
      const userIdentifier = this.accountService.getUserIdentifier()
      const subsetLabel = getPetTabText(args.petSubset)

      await this.reply(`正在查询${subsetLabel}，第 ${args.pageNo} 页...`)

      const loginType = String(binding?.loginType || credential?.loginType || '').trim().toLowerCase()
      const params = {
        pet_subset: args.petSubset,
        page_no: args.pageNo,
        page_size: getPageSize()
      }

      const zone = this.resolveZone(loginType)
      if (zone !== undefined) {
        params.zone = zone
      }

      const [petData, roleProfile] = await Promise.all([
        this.api.getBattlePets(credential.frameworkToken, params, { userIdentifier }),
        this.loadRoleProfile(credential.frameworkToken, userIdentifier)
      ])

      ensureUpstreamSuccess(petData)
      const pets = this.extractPetList(petData)
      const renderData = this.buildRenderData({
        args,
        binding,
        credential,
        loginType,
        petData,
        pets,
        roleProfile
      })

      const image = await renderModuleTemplate(
        this.e,
        'rocom',
        'render/package/index',
        renderData,
        {
          retType: 'base64',
          scale: 1.4,
          viewport: {
            width: 1320,
            height: 1800
          },
          beforeRender: ({ data }) => this.withRenderAssets(data)
        }
      )

      if (!image) {
        throw new Error('精灵列表渲染失败')
      }

      await this.reply(image)
      return true
    } catch (error) {
      logger.error('[WeGame-plugin][rocom] 查询精灵列表失败', error)
      await this.reply(`查询精灵列表失败：${error.message || error}`)
      return true
    }
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

  parseCommandArgs () {
    const raw = stripCommandPrefix(this.e.msg, '精灵列表')
    if (!raw) {
      return {
        petSubset: 0,
        pageNo: 1
      }
    }

    const tokens = raw.split(/\s+/).filter(Boolean)
    let petSubset = 0
    let pageNo = 1

    for (const token of tokens) {
      if (PET_SUBSETS[token] !== undefined) {
        petSubset = PET_SUBSETS[token]
        continue
      }

      if (/^\d+$/.test(token)) {
        pageNo = Number(token)
        continue
      }

      throw new Error(`格式：${formatCommand('精灵列表 <了不起|异色|炫彩> <页码>')}`)
    }

    const maxPage = getMaxPage()
    if (pageNo < 1 || pageNo > maxPage) {
      throw new Error(`页码仅支持 1-${maxPage}`)
    }

    return { petSubset, pageNo }
  }

  resolveZone (loginType = '') {
    if (loginType === 'qq') return 0
    if (loginType === 'wechat') return 1
    return undefined
  }

  extractPetList (payload = {}, depth = 0) {
    if (!payload || typeof payload !== 'object' || depth > 2) return []

    const directKeys = ['pets', 'pet_list', 'list', 'records', 'items', 'rows']
    for (const key of directKeys) {
      if (Array.isArray(payload?.[key])) {
        return payload[key]
      }
    }

    for (const value of Object.values(payload)) {
      if (Array.isArray(value) && value.some((item) => item && typeof item === 'object')) {
        return value
      }
    }

    for (const value of Object.values(payload)) {
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        const list = this.extractPetList(value, depth + 1)
        if (list.length > 0) {
          return list
        }
      }
    }

    return []
  }

  buildRenderData ({ args, binding, credential, loginType, petData, pets, roleProfile }) {
    const role = roleProfile?.role || credential?.role || {}
    const totalCount = this.pickNumber(petData, ['total', 'total_count', 'totalCount', 'count'], pets.length)
    const defaultPageSize = getPageSize()
    const pageSize = this.pickNumber(petData, ['page_size', 'pageSize'], defaultPageSize) || defaultPageSize
    const currentPage = this.pickNumber(petData, ['page_no', 'pageNo', 'page'], args.pageNo) || args.pageNo
    const totalPages = this.pickNumber(
      petData,
      ['total_pages', 'totalPages', 'page_count', 'pageCount'],
      Math.max(currentPage, Math.ceil(totalCount / pageSize) || 1)
    ) || 1

    const normalizedPets = pets.map((pet, index) => this.normalizePet(pet, index, args))
    const emptySlotCount = normalizedPets.length > 0 ? Math.max(defaultPageSize - normalizedPets.length, 0) : 0

    return {
      saveId: `pet-list-${this.e.user_id}-${Date.now()}`,
      pageTitle: '我的精灵',
      userName: toDisplayText(role?.name || binding?.nickname, '洛克玩家'),
      userLevel: toDisplayText(role?.level),
      userUid: toDisplayText(role?.id || role?.openid || credential?.tgpId),
      userAvatar: normalizeUrl(role?.avatar_url || role?.avatar || binding?.avatar),
      tabs: Object.keys(PET_SUBSETS).map((label) => ({
        text: getPetTabText(PET_SUBSETS[label]),
        active: PET_SUBSETS[label] === args.petSubset
      })),
      currentTab: getPetTabText(args.petSubset),
      totalCount,
      currentPage,
      totalPages,
      pageSize,
      accountLabel: getLoginTypeLabel(loginType || credential?.loginType),
      commandHint: `用指令「${formatCommand('精灵列表 <了不起|异色|炫彩> <页数>')}」翻页，默认查询全部精灵第一页`,
      pets: normalizedPets,
      emptySlots: Array.from({ length: emptySlotCount }, (_, index) => index + 1)
    }
  }

  normalizePet (pet, index, args) {
    const name = toDisplayText(
      this.pickValue(pet, ['pet_name', 'name', 'nickname', 'pet_nick']),
      `第 ${((args.pageNo - 1) * getPageSize()) + index + 1} 个精灵`
    )
    const level = toDisplayText(this.pickValue(pet, ['pet_level', 'level']), '--')
    const imageUrl = normalizeUrl(this.pickValue(pet, [
      'pet_img_url',
      'image_url',
      'img_url',
      'pet_image',
      'pet_img',
      'avatar',
      'icon',
      'icon_url',
      'cover',
      'pic'
    ]))

    return {
      name,
      level,
      pet_img_url: imageUrl,
      imageUrl,
      badgeFile: args.petSubset > 0 ? `${getPetTabText(args.petSubset)} half.png` : '',
      elementTypesInfo: this.extractElementTypesInfo(pet)
    }
  }

  extractElementTypesInfo (pet = {}) {
    const values = [
      pet?.pet_types_info,
      pet?.types_info,
      pet?.element_info,
      pet?.attribute_info
    ]

    for (const value of values) {
      if (!Array.isArray(value)) continue

      const normalized = value
        .map((item) => ({
          name: String(item?.name || item?.label || '').trim(),
          icon: normalizeUrl(item?.icon)
        }))
        .filter((item) => item.name || item.icon)

      if (normalized.length > 0) {
        return normalized.slice(0, 2)
      }
    }

    return []
  }
  withRenderAssets (data = {}) {
    const buildResUrl = (assetPath) => `${data.pluResPath}${encodeAssetPath(assetPath)}`
    const defaultAvatar = buildResUrl('img/测试头像.png')
    const fallbackPetImage = buildResUrl('img/本周达宠 测试立绘.png')

    return {
      ...data,
      defaultAvatar,
      fallbackPetImage,
      userAvatar: normalizeUrl(data.userAvatar) || defaultAvatar,
      pets: (data.pets || []).map((pet) => ({
        ...pet,
        pet_img_url: normalizeUrl(pet.pet_img_url) || normalizeUrl(pet.imageUrl) || fallbackPetImage,
        imageUrl: normalizeUrl(pet.imageUrl) || fallbackPetImage,
        badgeImage: pet.badgeFile ? buildResUrl(`img/${pet.badgeFile}`) : '',
        elementIcons: this.buildElementIcons(pet)
      }))
    }
  }

  buildElementIcons (pet = {}) {
    if (!Array.isArray(pet.elementTypesInfo) || pet.elementTypesInfo.length === 0) {
      return []
    }

    return pet.elementTypesInfo
      .map((item) => ({
        name: item.name || '',
        src: normalizeUrl(item.icon)
      }))
      .filter((item) => item.src)
  }

  pickValue (obj, keys = [], depth = 0) {
    if (!obj || typeof obj !== 'object' || depth > 2) return ''

    for (const key of keys) {
      const value = obj?.[key]
      if (value !== undefined && value !== null && value !== '') {
        return value
      }
    }

    for (const value of Object.values(obj)) {
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        const nested = this.pickValue(value, keys, depth + 1)
        if (nested !== '') {
          return nested
        }
      }
    }

    return ''
  }

  pickNumber (obj, keys = [], fallback = 0, depth = 0) {
    if (!obj || typeof obj !== 'object' || depth > 2) return fallback

    for (const key of keys) {
      const value = obj?.[key]
      const num = toNumber(value, NaN)
      if (Number.isFinite(num)) {
        return num
      }
    }

    for (const value of Object.values(obj)) {
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        const nested = this.pickNumber(value, keys, fallback, depth + 1)
        if (nested !== fallback) {
          return nested
        }
      }
    }

    return fallback
  }
}
