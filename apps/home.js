import fs from 'node:fs'
import path from 'node:path'
import WeGameAccountService from '../../../model/accountService.js'
import { renderModuleTemplate } from '../../../model/moduleRender.js'
import RocomApi from '../model/api.js'
import { buildCommandReg, formatCommand } from '../utils/command.js'
import { trimText, toNumber, encodeAssetPath, pickPrimaryAccount, extractUidFromAccount } from '../utils/rocom.js'

const HOME_REG = buildCommandReg('(?:家园|home)(?:\\s*(\\d+))?')
const REFRESH_HOME_REG = buildCommandReg('(?:刷新家园|rehome)(?:\\s*(\\d+))?')
const PLANT_MAP_PATH = path.join(process.cwd(), 'plugins', 'WeGame-plugin', 'modules', 'rocom', 'utils', 'map', 'home_item_list.json')
const LOCAL_PLANT_MAP_PATH = path.join(process.cwd(), 'utils', 'map', 'home_item_list.json')
const RENDER_PLANT_MAP_PATH = path.join(process.cwd(), 'plugins', 'WeGame-plugin', 'modules', 'rocom', 'resources', 'render', 'home', 'data', 'home_item_list.json')
const HOME_INGAME_WAIT_MS = 5000
const HOME_INGAME_HTTP_TIMEOUT_MS = 10000
const HOME_INGAME_TASK_INTERVAL_MS = 5000
const HOME_INGAME_TASK_TIMEOUT_MS = 3 * 60 * 1000
const ROCOM_HEADICON_BASE_URL = 'https://silverwing.elysia.beauty/RocomUID/resource/headicon'

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
}
