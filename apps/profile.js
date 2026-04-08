import WeGameAccountService from '../../../model/accountService.js'
import RocomApi from '../model/api.js'
import { renderModuleTemplate } from '../../../model/moduleRender.js'
import { buildCommandReg, formatCommand } from '../utils/command.js'
import { ensureUpstreamSuccess } from '../../../utils/queryHelper.js'

const RADAR_AXES = [
  { key: 'strength', name: '战力', labelX: 128, labelY: 18, anchor: 'middle', dx: 0, dy: -18 },
  { key: 'progression', name: '推进', labelX: 224, labelY: 110, anchor: 'start', dx: 20, dy: 0 },
  { key: 'capture', name: '捉宠', labelX: 128, labelY: 198, anchor: 'middle', dx: 0, dy: 18 },
  { key: 'collection', name: '收藏', labelX: 34, labelY: 110, anchor: 'end', dx: -20, dy: 0 }
]

function encodeAssetPath (assetPath = '') {
  return String(assetPath || '')
    .split('/')
    .filter(Boolean)
    .map((part) => encodeURIComponent(part))
    .join('/')
}

function normalizeRemoteUrl (value) {
  const text = String(value || '').trim()
  if (!text) return ''
  if (/^data:image\//.test(text)) return text
  if (text.startsWith('//')) return `https:${text}`
  if (/^https?:\/\//.test(text)) return text
  return ''
}

function toDisplayText (value, fallback = '--') {
  if (value === undefined || value === null || value === '') return fallback
  return String(value)
}

function toNumber (value, fallback = 0) {
  const num = Number(value)
  return Number.isFinite(num) ? num : fallback
}

function clampPercent (value) {
  return Math.max(0, Math.min(100, toNumber(value, 0)))
}

function formatScore (value) {
  if (value === undefined || value === null || value === '') return '--'

  const num = Number(value)
  if (Number.isFinite(num)) {
    const text = Number.isInteger(num) ? String(num) : num.toFixed(1).replace(/\.0$/, '')
    return `${text}分`
  }

  const text = String(value).trim()
  return text.endsWith('分') ? text : `${text}分`
}

function formatWinRate (value) {
  const num = Number(value)
  if (!Number.isFinite(num)) return '--'
  return `${num.toFixed(2).replace(/\.00$/, '').replace(/(\.\d)0$/, '$1')}%`
}

function hasMeaningfulEvaluation (evaluation = {}) {
  const metricKeys = ['capture', 'collection', 'progression', 'strength']
  if (metricKeys.some((key) => toNumber(evaluation?.[key], 0) > 0)) {
    return true
  }

  const scoreNum = Number(evaluation?.score)
  if (Number.isFinite(scoreNum) && scoreNum > 0) {
    return true
  }

  return false
}

function hasMeaningfulPetSummary (petSummary = {}) {
  const bestPetId = String(petSummary?.best_pet_id ?? '').trim()
  if (bestPetId && bestPetId !== '0') {
    return true
  }

  return ['best_pet_name', 'summary_title', 'summary_content', 'best_pet_img_url']
    .some((key) => String(petSummary?.[key] ?? '').trim())
}

function hasMeaningfulBattleOverview (battleOverview = {}) {
  if (toNumber(battleOverview?.total_match, 0) > 0) return true
  if (toNumber(battleOverview?.total_win, 0) > 0) return true
  if (String(battleOverview?.tier || '').trim()) return true
  return Boolean(normalizeRemoteUrl(battleOverview?.tier_icon_url))
}

function hasMeaningfulBattleRecord (battle = {}) {
  if (!battle || typeof battle !== 'object') return false

  if (String(battle?.battle_time || '').trim()) return true
  if (String(battle?.nickname || '').trim()) return true
  if (String(battle?.enemy_nickname || '').trim()) return true
  if (Array.isArray(battle?.pet_base_info) && battle.pet_base_info.length > 0) return true
  if (Array.isArray(battle?.enemy_pet_base_info) && battle.enemy_pet_base_info.length > 0) return true

  return false
}

function splitSummaryTitle (value) {
  const text = String(value || '').trim()
  if (!text) return ['洛克档案']

  const parts = text.split(/[\s|｜/、，,]+/).filter(Boolean)
  if (parts.length >= 2) {
    return [parts[0], parts.slice(1).join(' ')].filter(Boolean).slice(0, 2)
  }

  if (text.length >= 6) {
    const middle = Math.ceil(text.length / 2)
    return [text.slice(0, middle), text.slice(middle)].filter(Boolean)
  }

  return [text]
}

function buildRadarPoints (centerX, centerY, radius, ratio) {
  return [
    `${centerX},${centerY - (radius * ratio)}`,
    `${centerX + (radius * ratio)},${centerY}`,
    `${centerX},${centerY + (radius * ratio)}`,
    `${centerX - (radius * ratio)},${centerY}`
  ].join(' ')
}

function buildRadarModel (evaluation = {}) {
  const centerX = 128
  const centerY = 108
  const radius = 60
  const values = {
    strength: clampPercent(evaluation?.strength),
    progression: clampPercent(evaluation?.progression),
    capture: clampPercent(evaluation?.capture),
    collection: clampPercent(evaluation?.collection)
  }

  const radarPolygons = [0.25, 0.5, 0.75, 1].map((level) => buildRadarPoints(centerX, centerY, radius, level))
  const radarAxes = [
    { x: centerX, y: centerY - radius },
    { x: centerX + radius, y: centerY },
    { x: centerX, y: centerY + radius },
    { x: centerX - radius, y: centerY }
  ]

  const pointMap = {
    strength: { x: centerX, y: centerY - (radius * values.strength / 100) },
    progression: { x: centerX + (radius * values.progression / 100), y: centerY },
    capture: { x: centerX, y: centerY + (radius * values.capture / 100) },
    collection: { x: centerX - (radius * values.collection / 100), y: centerY }
  }

  const radarAreaPoints = [
    pointMap.strength,
    pointMap.progression,
    pointMap.capture,
    pointMap.collection
  ].map((point) => `${point.x},${point.y}`).join(' ')

  const radarDots = RADAR_AXES.map((axis) => ({
    key: axis.key,
    x: pointMap[axis.key].x,
    y: pointMap[axis.key].y,
    value: values[axis.key]
  }))

  const radarValueBadges = RADAR_AXES.map((axis) => {
    const point = pointMap[axis.key]
    const text = String(values[axis.key])
    const width = Math.max(34, (text.length * 10) + 16)
    return {
      value: text,
      x: point.x + axis.dx - (width / 2),
      y: point.y + axis.dy - 12,
      width
    }
  })

  const radarAxisLabels = RADAR_AXES.map((axis) => ({
    name: axis.name,
    x: axis.labelX,
    y: axis.labelY,
    anchor: axis.anchor
  }))

  return {
    centerX,
    centerY,
    radarPolygons,
    radarAxes,
    radarAreaPoints,
    radarDots,
    radarValueBadges,
    radarAxisLabels
  }
}

function normalizeBattlePets (petInfoList = [], petIdList = []) {
  if (Array.isArray(petInfoList) && petInfoList.length > 0) {
    return petInfoList.slice(0, 6).map((item, index) => ({
      name: toDisplayText(item?.pet_name, `精灵 ${index + 1}`),
      icon: normalizeRemoteUrl(item?.pet_img_url)
    }))
  }

  if (Array.isArray(petIdList) && petIdList.length > 0) {
    return petIdList.slice(0, 6).map((petBaseId, index) => ({
      name: `精灵 ${index + 1}`,
      icon: ''
    }))
  }

  return []
}

function normalizeBattleResult (value) {
  const text = String(value ?? '').trim().toLowerCase()
  if (Number(value) === 1) return 'win'
  if (['win', 'success', 'true'].includes(text)) return 'win'
  return 'fail'
}

export class RocomProfile extends plugin {
  constructor (e) {
    super({
      name: '[WeGame-plugin][rocom] 洛克档案',
      dsc: '洛克王国世界档案卡',
      event: 'message',
      priority: 110,
      rule: [
        {
          reg: buildCommandReg('档案'),
          fnc: 'queryProfileCard'
        }
      ]
    })

    this.e = e
    this.api = new RocomApi()
    this.accountService = new WeGameAccountService(e)
  }

  async queryProfileCard () {
    try {
      const { credential } = await this.accountService.resolveActiveCredential()
      await this.reply('正在生成洛克档案...')

      const profileParams = this.buildProfileParams(credential?.loginType)
      const battleListParams = this.buildBattleListParams(credential?.loginType)
      const profileData = await this.loadProfileSections(credential.frameworkToken, profileParams, battleListParams)
      const renderData = this.buildRenderData({
        credential,
        ...profileData
      })

      const image = await renderModuleTemplate(
        this.e,
        'rocom',
        'render/personal-card/index',
        renderData,
        {
          retType: 'base64',
          beforeRender: ({ data }) => this.withRenderAssets(data)
        }
      )

      if (!image) {
        throw new Error('洛克档案渲染失败')
      }

      await this.reply(image)
      return true
    } catch (error) {
      logger.error('[WeGame-plugin][rocom] 查询洛克档案失败', error)
      await this.reply(`查询洛克档案失败：${error.message || error}`)
      return true
    }
  }

  buildProfileParams (loginType = '') {
    const normalized = String(loginType || '').trim().toLowerCase()
    if (normalized === 'qq') return { account_type: 1 }
    if (normalized === 'wechat') return { account_type: 2 }
    return {}
  }

  buildBattleListParams (loginType = '') {
    const normalized = String(loginType || '').trim().toLowerCase()
    const params = { page_size: 1 }

    if (normalized === 'qq') {
      params.zone = 0
    } else if (normalized === 'wechat') {
      params.zone = 1
    }

    return params
  }

  async loadProfileSections (frameworkToken, profileParams = {}, battleListParams = {}) {
    const tasks = [
      { key: 'roleData', method: 'getRoleProfile', params: profileParams },
      { key: 'evaluationData', method: 'getProfileEvaluation', params: profileParams },
      { key: 'petSummaryData', method: 'getPetSummary', params: profileParams },
      { key: 'collectionData', method: 'getCollection', params: profileParams },
      { key: 'battleOverviewData', method: 'getBattleOverview', params: {} },
      { key: 'battleListData', method: 'getBattleList', params: battleListParams }
    ]

    const settled = await Promise.allSettled(tasks.map(async (task) => {
      const data = await this.api[task.method](frameworkToken, task.params)
      ensureUpstreamSuccess(data)
      return {
        key: task.key,
        data
      }
    }))

    const result = {}
    let successCount = 0
    let firstError = ''

    for (const item of settled) {
      if (item.status === 'fulfilled') {
        result[item.value.key] = item.value.data
        successCount++
        continue
      }

      const message = item.reason?.message || String(item.reason)
      firstError ||= message
      logger.warn(`[WeGame-plugin][rocom] 档案分段接口请求失败: ${message}`)
    }

    if (successCount === 0) {
      throw new Error(firstError || '档案接口全部请求失败')
    }

    return result
  }

  buildRenderData ({
    credential,
    roleData,
    evaluationData,
    petSummaryData,
    collectionData,
    battleOverviewData,
    battleListData
  }) {
    const role = roleData?.role || credential?.role || {}
    const evaluation = evaluationData || {}
    const petSummary = petSummaryData || {}
    const collection = collectionData || {}
    const battleOverview = battleOverviewData || {}
    const latestBattle = Array.isArray(battleListData?.battles) ? (battleListData.battles[0] || null) : null

    const hasAiProfileData = hasMeaningfulEvaluation(evaluation) && hasMeaningfulPetSummary(petSummary)
    const hasBattleData = hasMeaningfulBattleOverview(battleOverview) && hasMeaningfulBattleRecord(latestBattle)
    const starName = role?.star_name || ''
    const summaryTitleParts = splitSummaryTitle(petSummary?.summary_title || '')
    const bestPetName = toDisplayText(
      petSummary?.best_pet_name,
      petSummary?.best_pet_id ? `精灵 ${petSummary.best_pet_id}` : '本期精灵'
    )
    const aiCommentText = petSummary?.summary_content || '暂无 AI 点评。'

    return {
      saveId: `profile-card-${this.e.user_id}-${Date.now()}`,
      userName: toDisplayText(role?.name, '洛克玩家'),
      userLevel: toDisplayText(role?.level),
      userUid: toDisplayText(role?.id || role?.openid || credential?.tgpId),
      userAvatar: normalizeRemoteUrl(role?.avatar_url || latestBattle?.avatar_url || role?.avatar),
      enrollDays: toDisplayText(role?.enroll_days),
      starName: toDisplayText(starName),
      hasAiProfileData,
      summaryTitleParts,
      bestPetName,
      bestPetImage: normalizeRemoteUrl(petSummary?.best_pet_img_url),
      scoreText: formatScore(evaluation?.score),
      aiCommentText,
      currentCollectionCount: toDisplayText(collection?.current_collection_count, '0'),
      totalCollectionCount: toDisplayText(collection?.total_collection_count, '0'),
      amazingSpriteCount: toDisplayText(collection?.amazing_sprite_count, '0'),
      shinySpriteCount: toDisplayText(collection?.shiny_sprite_count, '0'),
      colorfulSpriteCount: toDisplayText(collection?.colorful_sprite_count, '0'),
      fashionCollectionCount: toDisplayText(collection?.fashion_collection_count, '0'),
      itemCount: toDisplayText(collection?.item_count, '0'),
      collectionHint: `输入“${formatCommand('精灵列表')}”查看精灵总览`,
      hasBattleData,
      tierBadgeUrl: normalizeRemoteUrl(battleOverview?.tier_icon_url || latestBattle?.tier_url),
      totalMatch: toDisplayText(battleOverview?.total_match, '0'),
      totalWin: toDisplayText(battleOverview?.total_win, '0'),
      winRate: formatWinRate(battleOverview?.win_rate),
      matchResult: normalizeBattleResult(latestBattle?.result),
      leftTeamPets: normalizeBattlePets(latestBattle?.pet_base_info, latestBattle?.pet_base_id),
      rightTeamPets: normalizeBattlePets(latestBattle?.enemy_pet_base_info, latestBattle?.enemy_pet_base_id),
      opponentName: toDisplayText(latestBattle?.enemy_nickname, '未知对手'),
      opponentAvatar: normalizeRemoteUrl(latestBattle?.enemy_avatar_url),
      ...buildRadarModel(evaluation)
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
      userAvatarDisplay: normalizeRemoteUrl(data.userAvatar) || defaultAvatar,
      bestPetImageDisplay: normalizeRemoteUrl(data.bestPetImage) || fallbackPetImage,
      tierBadgeUrl: normalizeRemoteUrl(data.tierBadgeUrl),
      opponentAvatarDisplay: normalizeRemoteUrl(data.opponentAvatar) || defaultAvatar,
      leftTeamPets: (data.leftTeamPets || []).map((pet) => ({
        ...pet,
        icon: normalizeRemoteUrl(pet.icon) || fallbackPetImage
      })),
      rightTeamPets: (data.rightTeamPets || []).map((pet) => ({
        ...pet,
        icon: normalizeRemoteUrl(pet.icon) || fallbackPetImage
      }))
    }
  }
}
