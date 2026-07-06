import fs from 'node:fs'
import path from 'node:path'
import WeGameAccountService from '../../../model/accountService.js'
import { renderModuleTemplate } from '../../../model/moduleRender.js'
import RocomApi from '../model/api.js'
import { buildCommandReg, formatCommand } from '../utils/command.js'
import { trimText, toNumber, encodeAssetPath, pickPrimaryAccount, extractUidFromAccount } from '../utils/rocom.js'

const HOME_REG = buildCommandReg('(?:家园|home)(?:\\s*(\\d+))?')
const REFRESH_HOME_REG = buildCommandReg('(?:刷新家园|rehome)(?:\\s*(\\d+))?')
const PET_DETAIL_REG = buildCommandReg('(?:家园详情|homeinfo)(?:\\s+(\\d+))?(?:\\s+(\\d+))?(?:\\s+(\\d+))?')
const PLANT_MAP_PATH = path.join(process.cwd(), 'plugins', 'WeGame-plugin', 'modules', 'rocom', 'utils', 'map', 'home_item_list.json')
const LOCAL_PLANT_MAP_PATH = path.join(process.cwd(), 'utils', 'map', 'home_item_list.json')
const RENDER_PLANT_MAP_PATH = path.join(process.cwd(), 'plugins', 'WeGame-plugin', 'modules', 'rocom', 'resources', 'render', 'home', 'data', 'home_item_list.json')
const PET_MAP_PATH = path.join(process.cwd(), 'plugins', 'WeGame-plugin', 'modules', 'rocom', 'utils', 'map', 'pet_list.json')
const LOCAL_PET_MAP_PATH = path.join(process.cwd(), 'utils', 'map', 'pet_list.json')
const SKILL_MAP_PATH = path.join(process.cwd(), 'plugins', 'WeGame-plugin', 'modules', 'rocom', 'utils', 'map', 'skill_list.json')
const LOCAL_SKILL_MAP_PATH = path.join(process.cwd(), 'utils', 'map', 'skill_list.json')
const NATURE_MAP_PATH = path.join(process.cwd(), 'plugins', 'WeGame-plugin', 'modules', 'rocom', 'utils', 'map', 'nature_map.json')
const LOCAL_NATURE_MAP_PATH = path.join(process.cwd(), 'utils', 'map', 'nature_map.json')
const HOME_INGAME_WAIT_MS = 5000
const HOME_INGAME_HTTP_TIMEOUT_MS = 10000
const HOME_INGAME_TASK_INTERVAL_MS = 5000
const HOME_INGAME_TASK_TIMEOUT_MS = 3 * 60 * 1000
const ROCOM_HEADICON_BASE_URL = 'https://silverwing.elysia.beauty/RocomUID/resource/headicon'
const ROCOM_ICON_BASE_URL = 'https://silverwing.elysia.beauty/RocomUID/resource/rocomicon'

let plantMapCache = null

function loadPlantMap () {
  if (plantMapCache) return plantMapCache

  for (const filePath of [PLANT_MAP_PATH, LOCAL_PLANT_MAP_PATH, RENDER_PLANT_MAP_PATH]) {
    try {
      if (fs.existsSync(filePath)) {
        plantMapCache = JSON.parse(fs.readFileSync(filePath, 'utf8'))
        return plantMapCache
      }
    } catch (error) {
      logger.warn(`[WeGame-plugin][rocom] 读取家园植物映射失败：${error.message || error}`)
    }
  }

  plantMapCache = {}
  return plantMapCache
}

let petMapCache = null

function loadPetMap () {
  if (petMapCache) return petMapCache
  for (const filePath of [PET_MAP_PATH, LOCAL_PET_MAP_PATH]) {
    try {
      if (fs.existsSync(filePath)) {
        petMapCache = JSON.parse(fs.readFileSync(filePath, 'utf8'))
        return petMapCache
      }
    } catch (error) {
      logger.warn(`[WeGame-plugin][rocom] 读取精灵映射失败：${error.message || error}`)
    }
  }
  petMapCache = {}
  return petMapCache
}

let skillMapCache = null

function loadSkillMap () {
  if (skillMapCache) return skillMapCache
  for (const filePath of [SKILL_MAP_PATH, LOCAL_SKILL_MAP_PATH]) {
    try {
      if (fs.existsSync(filePath)) {
        skillMapCache = JSON.parse(fs.readFileSync(filePath, 'utf8'))
        return skillMapCache
      }
    } catch (error) {
      logger.warn(`[WeGame-plugin][rocom] 读取技能映射失败：${error.message || error}`)
    }
  }
  skillMapCache = {}
  return skillMapCache
}

let natureMapCache = null

function loadNatureMap () {
  if (natureMapCache) return natureMapCache
  for (const filePath of [NATURE_MAP_PATH, LOCAL_NATURE_MAP_PATH]) {
    try {
      if (fs.existsSync(filePath)) {
        natureMapCache = JSON.parse(fs.readFileSync(filePath, 'utf8'))
        return natureMapCache
      }
    } catch (error) {
      logger.warn(`[WeGame-plugin][rocom] 读取性格映射失败：${error.message || error}`)
    }
  }
  natureMapCache = {}
  return natureMapCache
}

const TYPE_COLORS = {
  普通: 'rgb(63, 137, 180)',
  草: 'rgb(78, 188, 115)',
  火: 'rgb(219, 85, 37)',
  水: 'rgb(106, 169, 254)',
  冰: 'rgb(95, 173, 221)',
  电: 'rgb(231, 197, 6)',
  毒: 'rgb(186, 98, 224)',
  恶: 'rgb(207, 70, 122)',
  光: 'rgb(79, 192, 255)',
  幻: 'rgb(159, 167, 248)',
  虫: 'rgb(158, 206, 33)',
  地: 'rgb(154, 126, 63)',
  机械: 'rgb(64, 203, 169)',
  龙: 'rgb(237, 73, 98)',
  萌: 'rgb(252, 124, 172)',
  武: 'rgb(255, 150, 54)',
  翼: 'rgb(62, 199, 202)',
  幽: 'rgb(148, 70, 236)',
  无: 'rgb(186, 187, 198)',
  污染: 'rgb(186, 187, 198)',
  首领: 'rgb(219, 85, 37)',
  奇异: 'rgb(232, 202, 49)'
}

const BLOOD_COLORS = {
  1: 'rgb(63, 137, 180)',
  2: 'rgb(78, 188, 115)',
  3: 'rgb(219, 85, 37)',
  4: 'rgb(106, 169, 254)',
  5: 'rgb(79, 192, 255)',
  6: 'rgb(154, 126, 63)',
  7: 'rgb(95, 173, 221)',
  8: 'rgb(237, 73, 98)',
  9: 'rgb(231, 197, 6)',
  10: 'rgb(186, 98, 224)',
  11: 'rgb(158, 206, 33)',
  12: 'rgb(255, 150, 54)',
  13: 'rgb(62, 199, 202)',
  14: 'rgb(252, 124, 172)',
  15: 'rgb(148, 70, 236)',
  16: 'rgb(207, 70, 122)',
  17: 'rgb(64, 203, 169)',
  18: 'rgb(159, 167, 248)',
  19: 'rgb(197, 66, 84)',
  21: 'rgb(219, 85, 37)',
  23: 'rgb(186, 187, 198)',
  24: 'rgb(232, 202, 49)'
}

const BLOOD_NAMES = {
  1: '普通', 2: '草', 3: '火', 4: '水', 5: '光', 6: '地',
  7: '冰', 8: '龙', 9: '电', 10: '毒', 11: '虫', 12: '武',
  13: '翼', 14: '萌', 15: '幽', 16: '恶', 17: '机械', 18: '幻',
  19: '首领', 21: '首领', 23: '污染', 24: '奇异'
}

const TYPE_ID_MAP = {
  2: '普通', 3: '草', 4: '火', 5: '水', 6: '光', 7: '冰',
  8: '地', 9: '冰', 10: '龙', 11: '电', 12: '毒', 13: '虫',
  14: '武', 15: '翼', 16: '萌', 17: '幽', 18: '恶', 19: '机械',
  20: '幻', 23: '污染'
}

const SKILL_FAMILY_ALIAS = {
  SDT_NONE: '无',
  SDT_RELAX: '无',
  NONE: '无',
  RELAX: '无',
  无属性: '无'
}

function normalizeTimestampSeconds (value) {
  const num = Number(value)
  if (!Number.isFinite(num) || num <= 0) return 0
  if (num > 1e14) return Math.floor(num / 1000000)
  if (num > 1e11) return Math.floor(num / 1000)
  return Math.floor(num)
}

function normalizeDurationSeconds (value) {
  const num = Number(value)
  if (!Number.isFinite(num) || num <= 0) return 0
  if (num > 1e11) return Math.floor(num / 1000000)
  if (num > 1e8) return Math.floor(num / 1000)
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
  const seconds = remain % 60

  if (days > 0) {
    return hours > 0 ? `${days}天${hours}小时` : `${days}天`
  }
  if (hours > 0) {
    return `${hours}小时${minutes}分钟`
  }
  if (minutes > 0) {
    return `${minutes}分${seconds}秒`
  }
  return `${seconds}秒`
}

function formatEggRemaining (targetTime, now = Math.floor(Date.now() / 1000)) {
  const target = normalizeTimestampSeconds(targetTime)
  if (!target || now >= target) return '0分钟'

  const remain = Math.max(0, target - now)
  const totalHours = Math.floor(remain / 3600)
  const minutes = Math.floor((remain % 3600) / 60)

  return `${totalHours}小时${minutes}分钟`
}

function buildProgress (targetTime, duration, now = Math.floor(Date.now() / 1000)) {
  const target = normalizeTimestampSeconds(targetTime)
  const cost = normalizeDurationSeconds(duration)
  if (!target) return 0
  if (now >= target) return 100
  if (!cost) return 5
  return Math.max(5, Math.min(100, Math.round(((cost - (target - now)) / cost) * 100)))
}

function assetPetId (petId) {
  const numeric = Number(petId)
  if (!Number.isFinite(numeric) || numeric <= 0) return ''
  return numeric >= 3000 ? String(numeric) : String(numeric + 3000)
}

function buildPetIconUrl (petId) {
  const id = assetPetId(petId)
  if (!id) return ''
  return `https://game.gtimg.cn/images/rocom/rocodata/jingling/${id}/icon.png`
}

function buildHeadIconUrl (petId, mutationType = 0) {
  const id = assetPetId(petId)
  if (!id) return ''
  const suffix = [1, 9].includes(toNumber(mutationType, 0)) ? '_1' : ''
  return `${ROCOM_HEADICON_BASE_URL}/${id}${suffix}.png`
}

function buildRocomIconUrl (iconName = '', mutationType = 0) {
  const name = trimText(iconName)
  if (!name) return ''
  const suffix = [1, 9].includes(toNumber(mutationType, 0)) ? '_yise' : ''
  return `${ROCOM_ICON_BASE_URL}/${encodeURIComponent(`${name}${suffix}`)}.png`
}

function buildRocomIconCandidates (iconName = '', mutationType = 0) {
  const name = trimText(iconName)
  if (!name) return []
  const result = []
  const yiseUrl = buildRocomIconUrl(name, mutationType)
  if (yiseUrl) result.push(yiseUrl)
  const normalUrl = `${ROCOM_ICON_BASE_URL}/${encodeURIComponent(name)}.png`
  if (!result.includes(normalUrl)) result.push(normalUrl)
  return result
}

function buildSkillIconUrl (iconId = '') {
  const id = trimText(iconId)
  if (!id) return ''
  return `https://silverwing.elysia.beauty/RocomUID/resource/skillicon/${encodeURIComponent(id)}.png`
}

function pickHomePayload (payload = {}) {
  if (payload?.home_info?.friend_home_brief_info) return payload.home_info
  if (payload?.home_info?.home_info?.friend_home_brief_info) return payload.home_info.home_info
  if (payload?.data?.home_info?.friend_home_brief_info) return payload.data.home_info
  if (payload?.result?.home_info?.friend_home_brief_info) return payload.result.home_info
  return payload?.home_info || payload?.data || payload?.result || payload
}

function extractPet (item = {}, now = Math.floor(Date.now() / 1000), guard = false) {
  const homePetInfo = item?.home_pet_info && typeof item.home_pet_info === 'object' ? item.home_pet_info : item
  const displayInfo = item?.display_info && typeof item.display_info === 'object' ? item.display_info : {}
  const petId = homePetInfo?.pet_cfg_id || homePetInfo?.pet_id || homePetInfo?.pet_base_id || item?.pet_cfg_id || item?.pet_id || item?.id

  const name = trimText(homePetInfo?.name || homePetInfo?.pet_name || item?.name || item?.pet_name) || `精灵 ${petId || ''}`.trim()
  if (!toNumber(petId, 0) && !guard) return null
  const mutationType = toNumber(displayInfo?.mutation_type || displayInfo?.mutationType || item?.mutation_type || item?.mutationType, 0)

  const hasEgg = Boolean(item?.have_egg)
  const predictedEggTime = normalizeTimestampSeconds(item?.predicted_egg_time)
  const eggReady = hasEgg || (predictedEggTime > 0 && now >= predictedEggTime)
  const feedRound = toNumber(homePetInfo?.feed_round || item?.feed_round, 0)
  const gender = toNumber(displayInfo?.gender || item?.gender, 0)
  const isMale = gender === 1

  const status = homePetInfo?.status ?? item?.status
  const isGuard = guard || Boolean(item?.is_guard || item?.guard) || String(status).toLowerCase() === '2' || String(status).toLowerCase() === 'guard'

  const hasInspiration = feedRound > 0
  const inspireReady = hasInspiration

  const statusText = isGuard && !hasInspiration ? '守卫中'
    : (inspireReady ? '可收取灵感'
    : (hasInspiration ? '灵感收集中'
    : '未喂食'))

  const statusClass = isGuard && !hasInspiration ? 'guard'
    : (eggReady ? 'ready'
    : (inspireReady ? 'progress'
    : (hasInspiration ? 'progress'
    : 'idle')))

  let note

  if (isGuard && String(petId) === '0') {
    note = '家园守卫位'
  } else if (eggReady) {
    note = '可收取'
  } else if (predictedEggTime > 0) {
    note = `${formatEggRemaining(predictedEggTime, now)}后生蛋`
  } else if (feedRound > 0) {
    note = isMale ? '' : '等待生蛋'
  } else if (isGuard) {
    note = '家园守卫位'
  } else {
    note = '未喂食'
  }

  return {
    id: String(petId || ''),
    name,
    level: trimText(displayInfo?.level || item?.level || homePetInfo?.level || '--'),
    iconUrl: buildHeadIconUrl(petId, mutationType) || buildPetIconUrl(petId),
    fallbackIconUrl: buildPetIconUrl(petId),
    starIconUrl: [1, 8, 9].includes(mutationType) ? `render/home/img/rocomuid/star_${mutationType}.png` : '',
    badge: isGuard ? '守' : (hasEgg ? '蛋' : ''),
    mutationType,
    isGuard,
    statusText,
    statusClass,
    note,
    inspireReady: eggReady,
    readyAt: predictedEggTime || 0,
    progress: 0,
    gender
  }
}

function collectPetSources (homeInfo) {
  const cellInfo = homeInfo?.friend_cell_home_brief_info || homeInfo?.cell_info || {}
  const indoorSources = []
  const guardSources = []

  if (Array.isArray(homeInfo?.home_pets)) {
    indoorSources.push(...homeInfo.home_pets)
  }
  if (Array.isArray(cellInfo?.home_pets)) {
    for (const pet of cellInfo.home_pets) {
      const homePet = pet?.home_pet_info && typeof pet.home_pet_info === 'object' ? pet.home_pet_info : {}
      if (String(homePet?.pet_cfg_id || '0') === '0' && (homePet?.name || homePet?.pet_name)) {
        guardSources.push(pet)
      } else {
        indoorSources.push(pet)
      }
    }
  }

  const petInfo = cellInfo?.home_pet_info && typeof cellInfo.home_pet_info === 'object' ? cellInfo.home_pet_info : {}
  if (Array.isArray(petInfo?.home_pet_list)) {
    indoorSources.push(...petInfo.home_pet_list)
  }

  for (const key of ['guard_pets', 'home_guard_pets', 'guard_pet_list']) {
    if (Array.isArray(homeInfo?.[key])) guardSources.push(...homeInfo[key])
    if (Array.isArray(cellInfo?.[key])) guardSources.push(...cellInfo[key])
  }

  for (const key of ['guard_pet', 'home_guard_pet', 'guard_pet_info', 'home_guard_pet_info', 'defend_pet', 'defend_pet_info', 'protect_pet', 'protect_pet_info']) {
    if (homeInfo?.[key] && typeof homeInfo[key] === 'object' && !Array.isArray(homeInfo[key])) guardSources.push(homeInfo[key])
    if (cellInfo?.[key] && typeof cellInfo[key] === 'object' && !Array.isArray(cellInfo[key])) guardSources.push(cellInfo[key])
  }

  return { indoorSources, guardSources }
}

function extractPlants (homeInfo) {
  const cellInfo = homeInfo?.friend_cell_home_brief_info || homeInfo?.cell_info || {}
  const plantMap = loadPlantMap()
  const plantSources = []

  if (Array.isArray(homeInfo?.home_plants)) {
    plantSources.push(...homeInfo.home_plants)
  }

  const plantInfo = cellInfo?.home_plant_info && typeof cellInfo.home_plant_info === 'object' ? cellInfo.home_plant_info : {}
  const landList = Array.isArray(plantInfo?.home_plant_land_list) ? plantInfo.home_plant_land_list : []
  for (const land of landList) {
    if (!land || typeof land !== 'object') continue
    for (const item of (land.home_plant_list || [])) {
      if (item && typeof item === 'object') {
        plantSources.push({ ...item, land_index: item.land_index || land.land_index })
      }
    }
  }

  const now = Math.floor(Date.now() / 1000)
  const result = []

  for (let index = 0; index < plantSources.length; index++) {
    const raw = plantSources[index]
    const plantData = raw?.plant_info && typeof raw.plant_info === 'object' ? raw.plant_info : raw
    const plantId = raw?.plant_seed_id || raw?.plant_cfg_id || raw?.plant_id || plantData?.id
    if (!toNumber(plantId, 0)) continue

    const mappedPlant = plantMap[String(plantId)] || {}
    const iconId = plantData?.icon_url || plantData?.iconUrl || raw?.icon_url || raw?.iconUrl || plantData?.iconid || raw?.iconid || raw?.icon_id || mappedPlant?.iconid || ''

    let ripTime = normalizeTimestampSeconds(raw?.plant_rip_time || raw?.rip_time || raw?.end_time)
    const leftTime = toNumber(raw?.left_time, 0)
    if (!ripTime && leftTime > 0) {
      ripTime = now + leftTime
    }

    const ready = (ripTime > 0 && now >= ripTime) || raw?.status === 2 || raw?.status === 'ready' || raw?.status === 'mature'
    let total = toNumber(raw?.time_cost || raw?.total_time, 0)
    if (!total && raw?.plant_tab_id) {
      total = toNumber(raw.plant_tab_id, 1) * 21600
    }
    const progress = total && ripTime ? Math.max(0, Math.min(100, Math.round(((total - Math.max(0, ripTime - now)) / total) * 100))) : (ready ? 100 : 35)

    const landIndex = raw?.slot_index || raw?.land_index || index + 1
    const harvestNum = raw?.plant_harvest_num
    const stealAccount = raw?.plant_steal_account
    const canStealAccount = raw?.plant_can_steal_account

    const iconUrl = iconId ? (String(iconId).startsWith('http') ? iconId : `render/home/img/home_icon/${iconId}_2.png`) : ''

    result.push({
      id: String(plantId),
      landIndex,
      plantName: trimText(plantData?.name || raw?.name || mappedPlant?.name) || `种子 ${plantId}`,
      iconUrl,
      stateType: ready ? 'ready' : 'warning',
      statusText: ready ? '已成熟' : '成长中',
      leftTimeText: ready ? '可收获' : formatRemaining(ripTime, now),
      progress,
      ready,
      readyAt: ripTime,
      harvestText: harvestNum != null ? `产量 ${harvestNum}` : '',
      stealText: (stealAccount != null && canStealAccount != null) ? `可偷 ${stealAccount}/${canStealAccount}` : ''
    })
  }

  return result
}

function normalizeHomeInfo (payload = {}, uid = '') {
  const homeInfo = pickHomePayload(payload)
  const brief = homeInfo?.friend_home_brief_info || homeInfo?.home_brief_info || homeInfo?.brief || homeInfo
  const now = Math.floor(Date.now() / 1000)

  const { indoorSources, guardSources } = collectPetSources(homeInfo)
  const indoorPets = []
  const guardPets = []

  for (let i = 0; i < indoorSources.length; i++) {
    const pet = extractPet(indoorSources[i], now, false)
    if (!pet) continue
    if (pet.isGuard) {
      guardPets.push(pet)
    } else {
      indoorPets.push(pet)
    }
  }
  for (let i = 0; i < guardSources.length; i++) {
    const pet = extractPet(guardSources[i], now, true)
    if (pet) guardPets.push(pet)
  }

  indoorPets.sort((a, b) => {
    if (a.gender === 2 && b.gender !== 2) return -1
    if (a.gender !== 2 && b.gender === 2) return 1
    if (a.gender === 2) {
      const ta = a.readyAt || Number.MAX_SAFE_INTEGER
      const tb = b.readyAt || Number.MAX_SAFE_INTEGER
      return ta - tb
    }
    return 0
  })

  const gardenPlots = extractPlants(homeInfo)
  const homeName = trimText(brief?.home_name || brief?.name) || '洛克玩家'

  return {
    title: '洛克家园',
    subtitle: 'Home Information',
    homeName,
    uid,
    updatedAt: new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }),
    summaryCards: [
      { label: '房间等级', value: trimText(brief?.room_level) || '--' },
      { label: '家园等级', value: trimText(brief?.home_level) || '--' },
      { label: '家园经验', value: trimText(brief?.home_experience) || '--' },
      { label: '舒适度', value: trimText(brief?.home_comfort_level) || '--' }
    ],
    gardenPlots,
    guardPets,
    indoorPets,
    gardenCount: gardenPlots.length,
    indoorCount: indoorPets.length,
    guardCount: guardPets.length,
    guardEmptyText: '后端当前返回中没有守卫精灵字段'
  }
}

export class RocomHome extends plugin {
  constructor (e) {
    super({
      name: '[WeGame-plugin][rocom] 家园',
      dsc: '洛克王国世界家园信息查询',
      event: 'message',
      priority: 108,
      rule: [
        {
          reg: PET_DETAIL_REG,
          fnc: 'queryPetDetail'
        },
        {
          reg: HOME_REG,
          fnc: 'queryHome'
        },
        {
          reg: REFRESH_HOME_REG,
          fnc: 'queryHome'
        }
      ]
    })

    this.e = e
    this.api = new RocomApi()
    this.accountService = new WeGameAccountService(e)
  }

  async queryHome () {
    try {
      const isRefresh = new RegExp(REFRESH_HOME_REG).test(String(this.e.msg || ''))
      const uid = await this.resolveHomeUid(isRefresh ? REFRESH_HOME_REG : HOME_REG)
      await this.reply(`${isRefresh ? '正在刷新' : '正在获取'} UID：${uid} 的家园信息，请稍后...`)

      let queuedNotified = false
      const payload = await this.api.getIngameHomeInfo(uid, {
        userIdentifier: this.accountService.getUserIdentifier(),
        waitMs: HOME_INGAME_WAIT_MS,
        httpTimeoutMs: HOME_INGAME_HTTP_TIMEOUT_MS,
        taskHttpTimeoutMs: HOME_INGAME_HTTP_TIMEOUT_MS,
        intervalMs: HOME_INGAME_TASK_INTERVAL_MS,
        timeoutMs: HOME_INGAME_TASK_TIMEOUT_MS,
        onQueued: async () => {
          if (queuedNotified) return
          queuedNotified = true
          await this.reply(`UID：${uid} 的家园查询已进入队列，正在等待游戏侧返回...`)
        }
      })
      const renderData = normalizeHomeInfo(payload, uid)
      const image = await renderModuleTemplate(
        this.e,
        'rocom',
        'render/home/index',
        renderData,
        {
          retType: 'base64',
          beforeRender: ({ data }) => this.withRenderAssets(data)
        }
      )

      if (!image) {
        throw new Error('家园信息渲染失败')
      }

      await this.reply(image)
      return true
    } catch (error) {
      logger.error('[WeGame-plugin][rocom] 查询家园失败', error)
      await this.reply(`查询家园失败：${error.message || error}`)
      return true
    }
  }

  async resolveHomeUid (reg) {
    const match = String(this.e.msg || '').match(new RegExp(reg))
    const rawUid = trimText(match?.[1])
    if (rawUid) return rawUid

    const active = await this.accountService.resolveActiveCredential().catch(() => null)
    const activeUid = trimText(
      active?.binding?.roleId ||
      active?.credential?.role?.id
    )
    if (activeUid) return activeUid

    if (!this.accountService.hasApiKey()) {
      throw new Error(`未提供 UID，且当前无法识别已绑定角色。请发送 ${formatCommand('家园 <UID>')}`)
    }

    const accountsData = await this.api.getAccounts(this.accountService.getUserIdentifier())
    const accounts = Array.isArray(accountsData?.accounts) ? accountsData.accounts : []
    const roleUid = extractUidFromAccount(pickPrimaryAccount(accounts))
    if (roleUid) return roleUid

    throw new Error(`未提供 UID，且当前没有可用的已绑定洛克角色。请先发送 ${formatCommand('账号列表')} 或 ${formatCommand('家园 <UID>')}`)
  }

  withRenderAssets (data = {}) {
    const buildResUrl = (assetPath) => `${data.pluResPath}${encodeAssetPath(assetPath)}`

    return {
      ...data,
      gardenPlots: (data.gardenPlots || []).map((plot) => ({
        ...plot,
        iconUrl: plot.iconUrl ? buildResUrl(plot.iconUrl) : ''
      })),
      indoorPets: (data.indoorPets || []).map((pet) => ({
        ...pet,
        iconUrl: pet.iconUrl && !String(pet.iconUrl).startsWith('http') ? buildResUrl(pet.iconUrl) : (pet.iconUrl || ''),
        starIconUrl: pet.starIconUrl ? buildResUrl(pet.starIconUrl) : ''
      })),
      guardPets: (data.guardPets || []).map((pet) => ({
        ...pet,
        iconUrl: pet.iconUrl && !String(pet.iconUrl).startsWith('http') ? buildResUrl(pet.iconUrl) : (pet.iconUrl || ''),
        starIconUrl: pet.starIconUrl ? buildResUrl(pet.starIconUrl) : ''
      }))
    }
  }

  async queryPetDetail () {
    try {
      const match = String(this.e.msg || '').match(new RegExp(PET_DETAIL_REG))
      const nums = [match?.[1], match?.[2], match?.[3]].filter(Boolean).map((v) => toNumber(v, 0))
      const uid = nums[0] ? String(nums[0]) : ''
      const petGid = nums[1] || 0
      const npcId = nums[2] || 0

      if (!uid && !petGid) {
        throw new Error(`格式：${formatCommand('家园详情 <UID>')}`)
      }

      const userIdentifier = this.accountService.getUserIdentifier()

      await this.reply('正在查询家园精灵详情，请稍后...（需要目标玩家在线）')

      const data = {}
      if (petGid) data.pet_gid = petGid
      if (npcId) data.npc_id = npcId
      if (uid) data.target_uin = toNumber(uid, 0)

      let queuedNotified = false
      const payload = await this.api.getIngamePetData(data, {
        userIdentifier,
        onQueued: async () => {
          if (queuedNotified) return
          queuedNotified = true
          await this.reply('家园宠物查询已进入队列，正在等待游戏侧返回...')
        }
      })

      let renderData = buildPetDetailRenderData(payload, uid)
      if (petGid || npcId) {
        const pickedPets = filterPetDetailPets(renderData.pets, petGid, npcId)
        if (pickedPets.length > 0) {
          renderData = {
            ...renderData,
            pets: pickedPets
          }
        }
      }

      const image = await renderModuleTemplate(
        this.e,
        'rocom',
        'render/pet-detail/index',
        {
          saveId: `pet-detail-${this.e.user_id}-${Date.now()}`,
          ...renderData
        },
        {
          retType: 'base64',
          scale: 2,
          viewport: {
            width: 1200,
            height: 800
          },
          beforeRender: ({ data }) => data
        }
      )

      if (!image) {
        throw new Error('家园精灵详情渲染失败')
      }

      await this.reply(image)
      return true
    } catch (error) {
      logger.error('[WeGame-plugin][rocom] 查询家园精灵详情失败', error)
      await this.reply(`查询家园精灵详情失败：${error.message || error}`)
      return true
    }
  }
}

function pickPetDetailPayload (payload = {}) {
  const candidates = [
    payload?.data,
    payload?.result,
    payload?.data?.data,
    payload?.result?.data,
    payload
  ]

  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) continue
    if (
      candidate.home_info !== undefined ||
      candidate.npc_pets !== undefined ||
      candidate.rows !== undefined ||
      candidate.uin !== undefined
    ) {
      return candidate
    }
  }

  return {}
}

function collectPetDetailHomePets (data = {}) {
  const homeInfo = data?.home_info && typeof data.home_info === 'object' ? data.home_info : {}
  const containers = [
    homeInfo?.friend_cell_home_brief_info,
    homeInfo?.cell_info,
    homeInfo,
    data?.friend_cell_home_brief_info
  ]
  const result = []
  const seen = new Set()

  for (const container of containers) {
    if (!container || typeof container !== 'object' || !Array.isArray(container.home_pets)) continue
    for (const item of container.home_pets) {
      const info = item?.home_pet_info && typeof item.home_pet_info === 'object' ? item.home_pet_info : item
      const key = trimText(info?.pet_gid || info?.furniture_guid || `${info?.pet_cfg_id || ''}:${info?.name || ''}`)
      if (key && seen.has(key)) continue
      if (key) seen.add(key)
      result.push(item)
    }
  }

  return result
}

function pickObject (...items) {
  for (const item of items) {
    if (item && typeof item === 'object' && !Array.isArray(item)) return item
  }
  return {}
}

function extractNpcFullPet (raw = {}) {
  const npcPet = pickObject(raw?.npc_pet, raw?.npcPet)
  return pickObject(npcPet?.pet, raw?.pet, raw?.detail, raw?.display_info)
}

function extractNpcPetGid (raw = {}) {
  const npcPet = pickObject(raw?.npc_pet, raw?.npcPet)
  const pet = pickObject(npcPet?.pet, raw?.pet)
  return trimText(raw?.pet_gid || raw?.petGid || npcPet?.pet_gid || pet?.pet_gid)
}

function buildHomePetFromNpc (raw = {}) {
  const pet = extractNpcFullPet(raw)
  const petId = raw?.pet_cfg_id || raw?.pet_id || pet?.base_conf_id || pet?.pet_id || pet?.id
  return {
    home_pet_info: {
      pet_gid: raw?.pet_gid || pet?.pet_gid,
      npc_id: raw?.npc_id || raw?.npcId,
      pet_cfg_id: petId,
      furniture_guid: raw?.furniture_guid,
      name: raw?.name || pet?.name,
      pet_default_name: raw?.pet_default_name || pet?.pet_default_name,
      speciality_id: raw?.speciality_id || pet?.speciality_id,
      real_speciality_ids: raw?.real_speciality_ids || pet?.real_speciality_ids || []
    },
    display_info: pet
  }
}

function normalizeTypeName (value) {
  const text = trimText(value)
  if (!text) return ''
  return TYPE_ID_MAP[text] || SKILL_FAMILY_ALIAS[text] || text
}

function normalizeSkillTypeName (value) {
  const name = normalizeTypeName(value)
  if (!name) return '无'
  return TYPE_COLORS[name] ? name : '无'
}

function buildTypeTags (mapped = {}, pet = {}, displayInfo = {}) {
  const rawTypes = Array.isArray(mapped?.unit_type) && mapped.unit_type.length > 0
    ? mapped.unit_type
    : (Array.isArray(pet?.unit_type)
      ? pet.unit_type
      : (Array.isArray(displayInfo?.unit_type) ? displayInfo.unit_type : []))

  const result = []
  const seen = new Set()
  for (const rawType of rawTypes) {
    const name = normalizeTypeName(rawType)
    if (!name || seen.has(name)) continue
    seen.add(name)
    result.push({
      name,
      icon: name,
      color: TYPE_COLORS[name] || 'rgb(150,150,150)'
    })
  }

  return result
}

function filterPetDetailPets (pets = [], petGid = 0, npcId = 0) {
  const targetPetGid = trimText(petGid)
  const targetNpcId = trimText(npcId)
  if (!targetPetGid && !targetNpcId) return pets

  return (pets || []).filter((pet) => {
    const matchedPetGid = targetPetGid && trimText(pet?.petGid) === targetPetGid
    const matchedNpcId = targetNpcId && trimText(pet?.npcId) === targetNpcId
    return matchedPetGid || matchedNpcId
  })
}

function isHomeGuardPet (homePetInfo = {}, displayInfo = {}, pet = {}) {
  const status = homePetInfo?.status ?? pet?.status ?? displayInfo?.status
  const normalizedStatus = trimText(status).toLowerCase()
  const zeroCfgWithName = String(homePetInfo?.pet_cfg_id || '0') === '0' &&
    Boolean(trimText(homePetInfo?.name || homePetInfo?.pet_name))

  return zeroCfgWithName ||
    Boolean(homePetInfo?.is_guard || homePetInfo?.guard || pet?.is_guard || pet?.guard || displayInfo?.is_guard || displayInfo?.guard) ||
    normalizedStatus === '2' ||
    normalizedStatus === 'guard'
}

function getSkillDetail (skill = {}) {
  return pickObject(
    skill?.skill,
    skill?.skill_info,
    skill?.skillInfo,
    skill?.skill_conf,
    skill?.skillConf,
    skill?.conf,
    skill?.config,
    skill?.data
  )
}

function getSkillRawType (skill = {}, detail = {}) {
  return toNumber(
    skill?.type ??
    skill?.skill_type ??
    skill?.skillType ??
    detail?.type ??
    detail?.skill_type ??
    detail?.skillType,
    0
  )
}

function getSkillId (skill = {}, detail = {}) {
  return toNumber(
    skill?.id ??
    skill?.skill_id ??
    skill?.skillId ??
    detail?.id ??
    detail?.skill_id ??
    detail?.skillId,
    0
  )
}

function collectSkillDataLists (source = {}) {
  if (!source || typeof source !== 'object' || Array.isArray(source)) return []
  const skill = pickObject(source?.skill, source?.skill_info, source?.skillInfo)
  return [
    skill?.skill_data,
    skill?.skillData,
    source?.skill_data,
    source?.skillData,
    source?.skill_list,
    source?.skillList,
    source?.skills
  ].filter((item) => Array.isArray(item))
}

function scoreSkillDataList (list = []) {
  let score = list.length
  for (const skill of list) {
    const detail = getSkillDetail(skill)
    const type = getSkillRawType(skill, detail)
    if (type === 1 || type === 2) score += 6
    if (type === 2) score += 8
    if (trimText(
      skill?.iconid ??
      skill?.icon_id ??
      skill?.iconId ??
      detail?.iconid ??
      detail?.icon_id ??
      detail?.iconId
    )) score += 4
  }
  return score
}

function pickPetSkillData (...sources) {
  let best = []
  let bestScore = -1
  for (const source of sources) {
    for (const list of collectSkillDataLists(source)) {
      const score = scoreSkillDataList(list)
      if (score > bestScore) {
        best = list
        bestScore = score
      }
    }
  }
  return best
}

function findMappedPetSkill (mapped = {}, skillId = 0) {
  const target = trimText(skillId)
  if (!target) return {}

  for (const key of ['level_skill_list', 'machine_skill_list', 'blood_skill_list', 'skill_list', 'skills']) {
    const list = Array.isArray(mapped?.[key]) ? mapped[key] : []
    const found = list.find((skill) => trimText(skill?.id ?? skill?.skill_id ?? skill?.skillId) === target)
    if (found) return found
  }

  return {}
}

function pickFeatureObject (...sources) {
  for (const source of sources) {
    if (!source || typeof source !== 'object' || Array.isArray(source)) continue
    const feature = pickObject(
      source?.feature,
      source?.feature_info,
      source?.featureInfo,
      source?.speciality,
      source?.speciality_info,
      source?.specialityInfo,
      source?.characteristic,
      source?.characteristic_info,
      source?.characteristicInfo
    )
    if (Object.keys(feature).length > 0) return feature
  }

  return {}
}

function normalizeFeatureInfo (raw = {}, rawId = 0, skillMap = {}) {
  const id = toNumber(
    rawId ||
    raw?.id ||
    raw?.skill_id ||
    raw?.skillId ||
    raw?.feature_id ||
    raw?.featureId ||
    raw?.speciality_id ||
    raw?.specialityId ||
    raw?.characteristic_id ||
    raw?.characteristicId,
    0
  )
  if (!id && Object.keys(raw).length === 0) return null

  const mappedSkill = id ? (skillMap[String(id)] || {}) : {}
  return {
    id,
    name: trimText(
      raw?.name ||
      raw?.feature_name ||
      raw?.featureName ||
      raw?.speciality_name ||
      raw?.specialityName ||
      raw?.characteristic_name ||
      raw?.characteristicName ||
      mappedSkill.name
    ) || (id ? `特性 ${id}` : '精灵特性'),
    desc: trimText(
      raw?.desc ||
      raw?.description ||
      raw?.feature_desc ||
      raw?.featureDesc ||
      raw?.speciality_desc ||
      raw?.specialityDesc ||
      raw?.characteristic_desc ||
      raw?.characteristicDesc ||
      mappedSkill.desc
    )
  }
}

function buildFeatureInfo (mapped = {}, pet = {}, displayInfo = {}, homePetInfo = {}, skillMap = {}, skillSource = []) {
  const featureSkill = (skillSource || []).find((skill) => {
    const detail = getSkillDetail(skill)
    return getSkillRawType(skill, detail) === 2
  })

  if (featureSkill) {
    const detail = getSkillDetail(featureSkill)
    const id = getSkillId(featureSkill, detail)
    const feature = normalizeFeatureInfo({ ...detail, ...featureSkill }, id, skillMap)
    if (feature) return feature
  }

  const apiFeature = pickFeatureObject(pet, displayInfo, homePetInfo)
  const apiFeatureId = pet?.feature_id ??
    pet?.featureId ??
    pet?.speciality_id ??
    pet?.specialityId ??
    pet?.characteristic_id ??
    pet?.characteristicId ??
    displayInfo?.feature_id ??
    displayInfo?.featureId ??
    displayInfo?.speciality_id ??
    displayInfo?.specialityId ??
    displayInfo?.characteristic_id ??
    displayInfo?.characteristicId ??
    homePetInfo?.feature_id ??
    homePetInfo?.featureId ??
    homePetInfo?.speciality_id ??
    homePetInfo?.specialityId ??
    homePetInfo?.characteristic_id ??
    homePetInfo?.characteristicId
  const apiFeatureInfo = normalizeFeatureInfo(apiFeature, apiFeatureId, skillMap)
  if (apiFeatureInfo && (apiFeatureInfo.id || apiFeatureInfo.name)) return apiFeatureInfo

  const mappedFeature = mapped?.feature && typeof mapped.feature === 'object' ? mapped.feature : {}
  const mappedFeatureInfo = normalizeFeatureInfo(mappedFeature, mappedFeature?.id, skillMap)
  if (mappedFeatureInfo && (mappedFeatureInfo.id || mappedFeatureInfo.name)) return mappedFeatureInfo

  const featureIds = [
    pet?.speciality_id,
    pet?.specialityId,
    displayInfo?.speciality_id,
    displayInfo?.specialityId,
    homePetInfo?.speciality_id,
    homePetInfo?.specialityId,
    ...(Array.isArray(pet?.real_speciality_ids) ? pet.real_speciality_ids : []),
    ...(Array.isArray(homePetInfo?.real_speciality_ids) ? homePetInfo.real_speciality_ids : [])
  ]

  for (const rawId of featureIds) {
    const id = toNumber(rawId, 0)
    if (!id) continue
    return normalizeFeatureInfo({}, id, skillMap)
  }

  return null
}

function buildPetDetailRenderData (payload = {}, uid = '') {
  const data = pickPetDetailPayload(payload)
  const npcPets = Array.isArray(data?.npc_pets) ? data.npc_pets : []
  const homePets = collectPetDetailHomePets(data)
  const petMap = loadPetMap()
  const skillMap = loadSkillMap()
  const natureMap = loadNatureMap()

  const npcMap = new Map()
  for (const raw of npcPets) {
    const gid = extractNpcPetGid(raw)
    if (gid) npcMap.set(gid, raw)
  }

  const petSources = homePets.length > 0
    ? homePets
    : npcPets.map((raw) => buildHomePetFromNpc(raw))

  const pets = []
  for (const hp of petSources) {
    const di = pickObject(hp?.display_info, hp?.displayInfo)
    const hi = pickObject(hp?.home_pet_info, hp?.homePetInfo, hp)
    const petGid = trimText(hi?.pet_gid || di?.pet_gid)
    const npcRaw = npcMap.get(petGid) || {}
    const npcFullPet = extractNpcFullPet(npcRaw)
    const npcStatus = trimText(npcRaw?.status)
    const hasFull = Object.keys(npcFullPet).length > 0 && npcStatus !== 'error'
    const pet = hasFull ? npcFullPet : di
    const petId = toNumber(pet?.base_conf_id || pet?.pet_id || pet?.id || di?.base_conf_id || hi?.pet_cfg_id, 0)
    if (isHomeGuardPet(hi, di, pet) || !petId) continue

    const mapped = petMap[String(petId)] || petMap[assetPetId(petId)] || {}
    const status = hasFull ? 'ok' : (npcStatus === 'error' && Object.keys(di).length > 0 ? 'fallback' : (npcStatus || 'fallback'))

    const petName = trimText(pet?.name || hi?.name || mapped?.name) || `精灵 ${petId || petGid || ''}`.trim()
    const defaultName = trimText(mapped?.form) || trimText(hi?.pet_default_name || pet?.pet_default_name || mapped?.name)
    const displayDefault = defaultName && defaultName !== petName ? defaultName : ''

    const gender = toNumber(pet?.gender ?? di?.gender, 0)
    const genderMap = { 0: '未知', 1: '♂ 雄性', 2: '♀ 雌性' }
    const genderText = genderMap[gender] || '未知'

    const mutationType = toNumber(pet?.mutation_type ?? di?.mutation_type, 0)
    const variantText = trimText(pet?.mutation_name || di?.mutation_name) ||
      (mutationType === 9 ? '异色炫彩' : mutationType === 1 ? '异色' : mutationType === 8 ? '炫彩' : '')
    const variantIcon = [1, 8, 9].includes(mutationType) ? `render/pet-detail/texture2D/star_${mutationType}.png` : ''

    const nature = toNumber(pet?.nature ?? di?.nature, 0)
    const natureEntry = natureMap[String(nature)] || {}
    const natureText = natureEntry.name || (nature ? `性格 ${nature}` : '')

    const bloodId = toNumber(pet?.blood_id ?? di?.blood_id, 0)
    const bloodText = BLOOD_NAMES[bloodId] || ''
    const bloodColor = BLOOD_COLORS[bloodId] || 'rgb(150,150,150)'

    const typeTags = buildTypeTags(mapped, pet, di)
    const typeColor = typeTags.length > 0 ? typeTags[0].color : bloodColor

    const attrSource = pickObject(pet?.attribute_info, di?.attribute_info)
    const attrKeys = ['hp', 'attack', 'special_attack', 'defense', 'special_defense', 'speed']
    const attrLabels = ['HP', '物攻', '魔攻', '物防', '魔防', '速度']
    const attributes = attrKeys.map((key, index) => {
      const attr = pickObject(attrSource[key])
      return {
        label: attrLabels[index],
        y: 483 + index * 54,
        value: toNumber(attr?.base_value, 0),
        talent: toNumber(attr?.talent, 0),
        effort: toNumber(attr?.effort_add, 0)
      }
    })

    const skillSource = pickPetSkillData(pet, di, hi)
    const feature = buildFeatureInfo(mapped, pet, di, hi, skillMap, skillSource)
    const equipSkills = []
    const learnedSkills = []

    for (const s of skillSource) {
      const skillDetail = getSkillDetail(s)
      const skillType = getSkillRawType(s, skillDetail)
      if (skillType === 2) continue
      if (skillType && skillType !== 1) continue

      const skillId = getSkillId(s, skillDetail)
      if (!skillId) continue
      const mappedSkill = skillMap[String(skillId)] || {}
      const mappedPetSkill = findMappedPetSkill(mapped, skillId)
      const families = normalizeSkillTypeName(skillDetail?.families || s?.families || mappedPetSkill?.families || mappedSkill.families)
      const skillIconId = trimText(
        s?.iconid ??
        s?.icon_id ??
        s?.iconId ??
        skillDetail?.iconid ??
        skillDetail?.icon_id ??
        skillDetail?.iconId ??
        mappedPetSkill?.iconid ??
        mappedSkill.iconid ??
        skillId
      )
      const skillInfo = {
        id: skillId,
        pos: toNumber(s?.pos ?? skillDetail?.pos, 0),
        name: trimText(s?.name || skillDetail?.name || mappedPetSkill?.name || mappedSkill.name) || `技能 ${skillId}`,
        cost: trimText(s?.cost ?? skillDetail?.cost ?? mappedPetSkill?.cost ?? mappedSkill.cost) || '--',
        power: trimText(s?.power ?? skillDetail?.power ?? mappedPetSkill?.power ?? mappedSkill.power) || '0',
        families,
        typeIcon: families,
        iconUrl: buildSkillIconUrl(skillIconId),
        fallbackIconUrl: buildSkillIconUrl(skillId) || buildSkillIconUrl('img_linshi'),
        placeholderIconUrl: buildSkillIconUrl('img_linshi'),
        typeColor: TYPE_COLORS[families] || 'rgb(150,150,150)'
      }

      const isEquipped = Boolean(
        s?.is_equipped ??
        s?.isEquipped ??
        s?.equipped ??
        skillDetail?.is_equipped ??
        skillDetail?.isEquipped ??
        skillDetail?.equipped
      )

      if (isEquipped) {
        equipSkills.push(skillInfo)
      }
      learnedSkills.push(skillInfo)
    }

    equipSkills.sort((a, b) => (a.pos || 999) - (b.pos || 999))
    learnedSkills.sort((a, b) => (a.pos || 999) - (b.pos || 999))

    const positionedTypeTags = typeTags.map((tag) => ({ ...tag }))
    const bloodTag = bloodText
      ? {
          name: bloodText,
          icon: String(bloodId),
          color: bloodColor
        }
      : null

    const petIconCandidates = buildRocomIconCandidates(mapped?.icon, mutationType)
    const iconUrl = petIconCandidates[0] || ''
    const fallbackIconUrl = petIconCandidates[1] || ''
    const fallbackIconUrl2 = ''
    const featureIcon = feature?.id
      ? `https://silverwing.elysia.beauty/RocomUID/resource/characteristicicon/${feature.id}.png`
      : ''

    pets.push({
      status,
      petId: String(petId || ''),
      petGid,
      npcId: trimText(hi?.npc_id || npcRaw?.npc_id || npcRaw?.npcId),
      name: petName,
      defaultName: displayDefault,
      level: trimText(pet?.level ?? di?.level) || '--',
      genderText,
      natureText,
      bloodText,
      bloodColor,
      typeTags: positionedTypeTags,
      typeColor,
      bloodTag,
      iconUrl,
      fallbackIconUrl,
      fallbackIconUrl2,
      variantText,
      variantIcon,
      featureIcon,
      fallbackFeatureIcon: 'https://silverwing.elysia.beauty/RocomUID/resource/characteristicicon/200191.png',
      attributes,
      feature,
      equipSkills,
      learnedSkills,
      errorText: status === 'error' ? trimText(npcRaw?.error || npcRaw?.message || npcRaw?.npc_pet?.error_message) : ''
    })
  }

  return {
    title: '精灵状态',
    subtitle: 'Ingame Pet Data',
    uid: trimText(data?.uin || uid) || '--',
    pets,
    emptyText: '未获取到家园精灵完整数据。请确认目标玩家在线、家园可访问，或稍后重试。',
    updatedAt: new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })
  }
}
