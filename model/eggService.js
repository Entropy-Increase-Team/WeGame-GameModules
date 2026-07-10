import fs from 'node:fs'
import path from 'node:path'
import { pluginRoot } from '../../../model/path.js'
import { trimText, encodeAssetPath, normalizeUrl } from '../utils/rocom.js'

const GAME_CODE = 'rocom'
const DEFAULT_DATA_DIR = path.join(
  pluginRoot,
  'modules',
  GAME_CODE,
  'resources',
  'render',
  'searcheggs'
)
const DEFAULT_COPYRIGHT = 'WeGame-plugin · RoCom'

const EGG_GROUP_META = Object.freeze({
  1: { label: '未发现', desc: '不能和任何精灵生蛋，多用于传说中的精灵' },
  2: { label: '怪兽', desc: '像怪兽一样，或者比较野性的动物' },
  3: { label: '两栖', desc: '两栖动物和水边生活的多栖动物' },
  4: { label: '虫', desc: '看起来像虫子的精灵' },
  5: { label: '飞行', desc: '会飞的精灵' },
  6: { label: '陆上', desc: '生活在陆地上的精灵' },
  7: { label: '妖精', desc: '可爱的小动物，以及神话中的精灵' },
  8: { label: '植物', desc: '看起来像植物的精灵' },
  9: { label: '人型', desc: '看起来像人的精灵' },
  10: { label: '软体', desc: '看起来软软的精灵，圆形多为软体动物' },
  11: { label: '矿物', desc: '身体由矿物组成的精灵' },
  12: { label: '不定形', desc: '没有固定形态的精灵，包括水、火、灵魂、能量' },
  13: { label: '鱼', desc: '看起来像鱼的精灵' },
  14: { label: '龙', desc: '看起来像龙的精灵' },
  15: { label: '机械', desc: '身体由机械组成的精灵' }
})

const SEARCH_RESULT_TYPES = Object.freeze({
  EXACT: 'exact',
  FUZZY: 'fuzzy',
  MULTI: 'multi',
  NOT_FOUND: 'not_found'
})

const PRECIOUS_EGG_TYPE_MAP = Object.freeze({
  1: '迪莫蛋',
  2: '星辰蛋',
  3: '彩虹蛋',
  4: '梦幻蛋',
  5: '传说蛋',
  6: '神秘蛋',
  7: '特殊蛋'
})

function dedupeList (items = []) {
  const output = []
  const seen = new Set()

  for (const item of Array.isArray(items) ? items : []) {
    const text = trimText(item)
    if (!text || seen.has(text)) continue
    output.push(text)
    seen.add(text)
  }

  return output
}

function getEggGroupLabel (groupId) {
  return EGG_GROUP_META[groupId]?.label || `蛋组${groupId}`
}

function formatEggGroups (groupIds = []) {
  const values = (Array.isArray(groupIds) ? groupIds : [])
    .map((item) => Number(item))
    .filter((item) => Number.isFinite(item))

  if (values.length === 0) return '暂无蛋组数据'
  return values.map((item) => getEggGroupLabel(item)).join(' / ')
}

function formatPreciousEggLabel (eggType) {
  if (eggType === undefined || eggType === null || eggType === '') {
    return '普通蛋'
  }

  const numeric = Number(eggType)
  return PRECIOUS_EGG_TYPE_MAP[numeric] || `珍稀蛋(类型${eggType})`
}

class EggService {
  constructor (dataDir = DEFAULT_DATA_DIR) {
    this.dataDir = dataDir
    this.pets = []
    this.byId = new Map()
    this.byZhName = new Map()
    this.byEnName = new Map()
    this.load()
  }

  load () {
    try {
      const petsJsonPath = path.join(this.dataDir, 'Pets.json')
      if (!fs.existsSync(petsJsonPath)) {
        throw new Error(`未找到 Pets.json：${petsJsonPath}`)
      }

      const raw = JSON.parse(fs.readFileSync(petsJsonPath, 'utf8'))
      const pets = Array.isArray(raw) ? raw : []

      this.pets = pets
      this.byId.clear()
      this.byZhName.clear()
      this.byEnName.clear()

      for (const pet of pets) {
        const petId = Number(pet?.id)
        if (Number.isFinite(petId)) {
          this.byId.set(petId, pet)
        }

        const zhName = trimText(pet?.localized?.zh?.name)
        if (zhName) {
          this.byZhName.set(zhName, pet)
        }

        const enName = trimText(pet?.name).toLowerCase()
        if (enName) {
          this.byEnName.set(enName, pet)
        }
      }
    } catch (error) {
      logger.error('[WeGame-plugin][rocom] 加载查蛋数据失败', error)
      this.pets = []
      this.byId.clear()
      this.byZhName.clear()
      this.byEnName.clear()
    }
  }

  ensureLoaded () {
    if (this.pets.length > 0) return
    this.load()
  }

  search (keyword = '') {
    this.ensureLoaded()

    const normalizedKeyword = trimText(keyword)
    if (!normalizedKeyword) {
      return {
        matchType: SEARCH_RESULT_TYPES.NOT_FOUND,
        pet: null,
        candidates: []
      }
    }

    const exactZh = this.byZhName.get(normalizedKeyword)
    if (exactZh) {
      return {
        matchType: SEARCH_RESULT_TYPES.EXACT,
        pet: exactZh,
        candidates: []
      }
    }

    const numericId = Number(normalizedKeyword)
    if (Number.isFinite(numericId) && this.byId.has(numericId)) {
      return {
        matchType: SEARCH_RESULT_TYPES.EXACT,
        pet: this.byId.get(numericId),
        candidates: []
      }
    }

    const exactEn = this.byEnName.get(normalizedKeyword.toLowerCase())
    if (exactEn) {
      return {
        matchType: SEARCH_RESULT_TYPES.EXACT,
        pet: exactEn,
        candidates: []
      }
    }

    const keywordLower = normalizedKeyword.toLowerCase()
    const hits = this.pets.filter((pet) => {
      const zhName = trimText(pet?.localized?.zh?.name).toLowerCase()
      const enName = trimText(pet?.name).toLowerCase()
      return zhName.includes(keywordLower) || enName.includes(keywordLower)
    })

    if (hits.length === 1) {
      return {
        matchType: SEARCH_RESULT_TYPES.FUZZY,
        pet: hits[0],
        candidates: []
      }
    }

    if (hits.length > 1) {
      return {
        matchType: SEARCH_RESULT_TYPES.MULTI,
        pet: null,
        candidates: hits.slice(0, 20)
      }
    }

    return {
      matchType: SEARCH_RESULT_TYPES.NOT_FOUND,
      pet: null,
      candidates: []
    }
  }

  searchBySize (height = null, weight = null) {
    this.ensureLoaded()

    const perfectMatches = []
    const rangeMatches = []

    for (const pet of this.pets) {
      const breeding = pet?.breeding || {}
      const heightLow = breeding?.height_low
      const heightHigh = breeding?.height_high
      const weightLow = breeding?.weight_low
      const weightHigh = breeding?.weight_high

      let heightMatchType = null
      let weightMatchType = null

      if (height !== null && height !== undefined) {
        if (heightLow !== undefined && heightLow !== null && heightHigh !== undefined && heightHigh !== null) {
          if (heightLow <= height && height <= heightHigh) {
            heightMatchType = 'perfect'
          } else {
            const heightMin = heightLow * 0.85
            const heightMax = heightHigh * 1.15
            heightMatchType = heightMin <= height && height <= heightMax ? 'range' : 'none'
          }
        } else {
          heightMatchType = 'none'
        }
      }

      if (weight !== null && weight !== undefined) {
        if (weightLow !== undefined && weightLow !== null && weightHigh !== undefined && weightHigh !== null) {
          const weightKgLow = weightLow / 1000
          const weightKgHigh = weightHigh / 1000
          if (weightKgLow <= weight && weight <= weightKgHigh) {
            weightMatchType = 'perfect'
          } else {
            const weightMin = weightKgLow * 0.85
            const weightMax = weightKgHigh * 1.15
            weightMatchType = weightMin <= weight && weight <= weightMax ? 'range' : 'none'
          }
        } else {
          weightMatchType = 'none'
        }
      }

      if (height !== null && height !== undefined && weight !== null && weight !== undefined) {
        if (heightMatchType === 'perfect' && weightMatchType === 'perfect') {
          perfectMatches.push(pet)
        } else if (heightMatchType !== 'none' && weightMatchType !== 'none') {
          rangeMatches.push(pet)
        }
        continue
      }

      if (height !== null && height !== undefined) {
        if (heightMatchType === 'perfect') {
          perfectMatches.push(pet)
        } else if (heightMatchType === 'range') {
          rangeMatches.push(pet)
        }
        continue
      }

      if (weight !== null && weight !== undefined) {
        if (weightMatchType === 'perfect') {
          perfectMatches.push(pet)
        } else if (weightMatchType === 'range') {
          rangeMatches.push(pet)
        }
      }
    }

    return {
      perfect: perfectMatches.slice(0, 20),
      range: rangeMatches.slice(0, 20)
    }
  }

  getEggGroups (pet = {}) {
    const eggGroups = pet?.breeding_profile?.egg_groups
    return Array.isArray(eggGroups) ? eggGroups : []
  }

  getCompatiblePets (pet = {}) {
    this.ensureLoaded()

    const petId = Number(pet?.id)
    const groups = new Set(this.getEggGroups(pet))
    if (!groups.size || groups.has(1)) return []

    return this.pets.filter((item) => {
      const itemId = Number(item?.id)
      if (Number.isFinite(petId) && Number.isFinite(itemId) && itemId === petId) return false

      const targetGroups = new Set(this.getEggGroups(item))
      if (!targetGroups.size || targetGroups.has(1)) return false

      return [...groups].some((groupId) => targetGroups.has(groupId))
    })
  }

  getBreedingParents (pet = {}) {
    return this.getCompatiblePets(pet)
  }

  evaluatePair (mother = {}, father = {}) {
    const motherGroups = new Set(this.getEggGroups(mother))
    const fatherGroups = new Set(this.getEggGroups(father))
    const sharedGroups = [...motherGroups].filter((groupId) => fatherGroups.has(groupId)).sort((left, right) => left - right)
    const reasons = []

    if (!motherGroups.size) {
      reasons.push(`${this.getPetName(mother)} 暂无蛋组数据`)
    }

    if (!fatherGroups.size) {
      reasons.push(`${this.getPetName(father)} 暂无蛋组数据`)
    }

    if (motherGroups.has(1)) {
      reasons.push(`${this.getPetName(mother)} 属于「未发现」蛋组`)
    }

    if (fatherGroups.has(1)) {
      reasons.push(`${this.getPetName(father)} 属于「未发现」蛋组`)
    }

    if (sharedGroups.length === 0 && reasons.length === 0) {
      reasons.push('蛋组不相同，无法配种')
    }

    const breeding = mother?.breeding || {}

    return {
      compatible: reasons.length === 0 && sharedGroups.length > 0,
      reasons,
      shared_egg_groups: sharedGroups,
      shared_egg_group_labels: sharedGroups.map((groupId) => getEggGroupLabel(groupId)),
      hatch_label: this.formatDuration(breeding?.hatch_data),
      weight_label: this.formatRange(this.toWeightKg(breeding?.weight_low), this.toWeightKg(breeding?.weight_high), 'kg'),
      height_label: this.formatRange(breeding?.height_low, breeding?.height_high, 'cm')
    }
  }

  buildSearchData (pet = {}, options = {}) {
    const eggGroups = this.getEggGroups(pet)
    const compatiblePets = this.getCompatiblePets(pet)
    const groupedMembers = {}

    for (const eggGroupId of eggGroups) {
      if (Number(eggGroupId) === 1) continue
      groupedMembers[eggGroupId] = []
    }

    for (const candidate of compatiblePets) {
      const candidateEggGroups = new Set(this.getEggGroups(candidate))
      for (const eggGroupId of eggGroups) {
        if (Number(eggGroupId) === 1 || !candidateEggGroups.has(eggGroupId)) continue
        groupedMembers[eggGroupId] ||= []
        groupedMembers[eggGroupId].push(candidate)
      }
    }

    const sections = eggGroups.map((eggGroupId) => {
      const meta = EGG_GROUP_META[eggGroupId] || {}
      const members = groupedMembers[eggGroupId] || []

      return {
        id: eggGroupId,
        label: meta.label || `蛋组${eggGroupId}`,
        desc: meta.desc || '',
        count: members.length,
        members: members.slice(0, 30).map((member) => ({
          id: member.id,
          name: this.getPetName(member),
          type_label: this.getPetType(member),
          egg_groups_label: formatEggGroups(this.getEggGroups(member))
        })),
        has_more: members.length > 30,
        total: members.length
      }
    })

    const breeding = pet?.breeding || {}
    const breedingProfile = pet?.breeding_profile || {}
    const eggDetails = this.buildEggDetails(breeding)

    return {
      pet_name: this.getPetName(pet),
      pet_id: pet?.id,
      pet_icon: this.getPetIconUrl(pet?.id),
      pet_image: this.getPetImageUrl(pet?.id),
      type_label: this.getPetType(pet),
      egg_groups_label: formatEggGroups(eggGroups),
      egg_groups: eggGroups,
      egg_group_labels: Object.fromEntries(eggGroups.map((eggGroupId) => [eggGroupId, getEggGroupLabel(eggGroupId)])),
      male_rate: breedingProfile?.male_rate,
      female_rate: breedingProfile?.female_rate,
      hatch_label: this.formatDuration(breeding?.hatch_data),
      weight_label: this.formatRange(this.toWeightKg(breeding?.weight_low), this.toWeightKg(breeding?.weight_high), 'kg'),
      height_label: this.formatRange(breeding?.height_low, breeding?.height_high, 'cm'),
      total_compatible: compatiblePets.length,
      is_undiscovered: eggGroups.includes(1),
      egg_group_sections: sections,
      total_stats: this.getTotalStats(pet),
      egg_details: eggDetails,
      commandHint: options.commandHint || '',
      copyright: options.copyright || DEFAULT_COPYRIGHT
    }
  }

  buildEggDetails (breeding = {}) {
    if (!breeding || typeof breeding !== 'object' || Object.keys(breeding).length === 0) {
      return { has_data: false }
    }

    const baseProb = this.formatProbabilityArray(breeding?.egg_base_glass_prob_array)
    const addProb = this.formatProbabilityArray(breeding?.egg_add_glass_prob_array)
    const variants = Array.isArray(breeding?.variants) ? breeding.variants : []

    return {
      has_data: true,
      base_prob_str: baseProb.text,
      base_prob_pct: baseProb.percent,
      add_prob_str: addProb.text,
      add_prob_pct: addProb.percent,
      is_contact_add_glass: breeding?.is_contact_add_glass_prob,
      is_contact_add_shining: breeding?.is_contact_add_shining_prob,
      precious_egg_type: breeding?.precious_egg_type,
      precious_egg_label: formatPreciousEggLabel(breeding?.precious_egg_type),
      variants: variants.map((variant) => {
        const variantBaseProb = this.formatProbabilityArray(variant?.egg_base_glass_prob_array)
        return {
          id: variant?.id,
          name: trimText(variant?.name) || '未知变体',
          hatch_label: this.formatDuration(variant?.hatch_data),
          weight_label: this.formatRange(this.toWeightKg(variant?.weight_low), this.toWeightKg(variant?.weight_high), 'kg'),
          height_label: this.formatRange(variant?.height_low, variant?.height_high, 'cm'),
          precious_egg_type: variant?.precious_egg_type,
          precious_egg_label: formatPreciousEggLabel(variant?.precious_egg_type),
          base_prob_str: variantBaseProb.text
        }
      }),
      variant_count: variants.length
    }
  }

  buildPairData (mother = {}, father = {}, options = {}) {
    return {
      mother: {
        id: mother?.id,
        name: this.getPetName(mother),
        type_label: this.getPetType(mother),
        egg_groups_label: formatEggGroups(this.getEggGroups(mother))
      },
      father: {
        id: father?.id,
        name: this.getPetName(father),
        type_label: this.getPetType(father),
        egg_groups_label: formatEggGroups(this.getEggGroups(father))
      },
      ...this.evaluatePair(mother, father),
      commandHint: options.commandHint || '',
      copyright: options.copyright || DEFAULT_COPYRIGHT
    }
  }

  buildWantPetData (pet = {}, options = {}) {
    const fathers = this.getBreedingParents(pet)
    const breedingProfile = pet?.breeding_profile || {}
    const eggGroups = this.getEggGroups(pet)

    return {
      target: this.formatPetCard(pet),
      egg_groups_label: formatEggGroups(eggGroups),
      female_rate: breedingProfile?.female_rate,
      female_rate_label: breedingProfile?.female_rate ?? '--',
      male_rate: breedingProfile?.male_rate,
      male_rate_label: breedingProfile?.male_rate ?? '--',
      is_undiscovered: eggGroups.includes(1),
      fathers: fathers.slice(0, 30).map((father) => this.formatPetCard(father)),
      father_count: fathers.length,
      commandHint: options.commandHint || '',
      copyright: options.copyright || DEFAULT_COPYRIGHT
    }
  }

  buildCandidatesRenderData (keyword = '', candidates = [], options = {}) {
    return {
      keyword: trimText(keyword),
      count: Array.isArray(candidates) ? candidates.length : 0,
      candidates: (Array.isArray(candidates) ? candidates : []).map((candidate) => this.formatPetCard(candidate)),
      commandHint: options.commandHint || '请使用更精确的名称重新查询',
      copyright: options.copyright || DEFAULT_COPYRIGHT
    }
  }

  buildSizeSearchData (height = null, weight = null, results = {}, options = {}) {
    const conditions = []
    if (height !== null && height !== undefined) {
      conditions.push(`身高 ${height} cm`)
    }
    if (weight !== null && weight !== undefined) {
      conditions.push(`体重 ${weight} kg`)
    }

    const perfectMatches = (results?.perfect || []).map((pet) => this.formatPetCard(pet))
    const rangeMatches = (results?.range || []).map((pet) => this.formatPetCard(pet))

    return {
      query_label: conditions.join(' / ') || '尺寸反查',
      perfect_matches: perfectMatches,
      range_matches: rangeMatches,
      total_count: perfectMatches.length + rangeMatches.length,
      has_results: perfectMatches.length > 0 || rangeMatches.length > 0,
      commandHint: options.commandHint || '',
      copyright: options.copyright || DEFAULT_COPYRIGHT
    }
  }

  buildSizeSearchText (height = null, weight = null, results = {}) {
    const conditions = []
    if (height !== null && height !== undefined) conditions.push(`身高=${height}cm`)
    if (weight !== null && weight !== undefined) conditions.push(`体重=${weight}kg`)
    const conditionText = conditions.join(' + ') || '当前条件'

    const perfectMatches = Array.isArray(results?.perfect) ? results.perfect : []
    const rangeMatches = Array.isArray(results?.range) ? results.range : []

    if (perfectMatches.length === 0 && rangeMatches.length === 0) {
      return `未找到符合 ${conditionText} 的精灵。`
    }

    const lines = []

    if (perfectMatches.length > 0) {
      lines.push(`完美匹配 ${conditionText} 的精灵（共 ${perfectMatches.length} 只）：`)
      perfectMatches.slice(0, 10).forEach((pet, index) => {
        const breeding = pet?.breeding || {}
        lines.push(
          `${index + 1}. ${this.getPetName(pet)} (#${pet?.id}) - ${this.formatRange(breeding?.height_low, breeding?.height_high, 'cm')} / ${this.formatRange(this.toWeightKg(breeding?.weight_low), this.toWeightKg(breeding?.weight_high), 'kg')} · ${formatEggGroups(this.getEggGroups(pet))}`
        )
      })
    }

    if (rangeMatches.length > 0) {
      if (lines.length > 0) lines.push('')
      lines.push(`范围匹配 ${conditionText} 的精灵（共 ${rangeMatches.length} 只，容差 ±15%）：`)
      rangeMatches.slice(0, 10).forEach((pet, index) => {
        const breeding = pet?.breeding || {}
        lines.push(
          `${index + 1}. ${this.getPetName(pet)} (#${pet?.id}) - ${this.formatRange(breeding?.height_low, breeding?.height_high, 'cm')} / ${this.formatRange(this.toWeightKg(breeding?.weight_low), this.toWeightKg(breeding?.weight_high), 'kg')} · ${formatEggGroups(this.getEggGroups(pet))}`
        )
      })
    }

    lines.push('')
    lines.push('提示：发送 +查蛋 <精灵名> 查看详细蛋组信息')
    return lines.join('\n')
  }

  buildCandidatesText (keyword = '', candidates = []) {
    const rows = Array.isArray(candidates) ? candidates : []
    const lines = [`「${trimText(keyword)}」匹配到 ${rows.length} 只精灵，请精确输入：`]

    rows.slice(0, 10).forEach((pet, index) => {
      lines.push(`${index + 1}. ${this.getPetName(pet)} (#${pet?.id}) - ${this.getPetType(pet)} · ${formatEggGroups(this.getEggGroups(pet))}`)
    })

    lines.push('')
    lines.push('提示：请使用更精确的名称重新查询')
    return lines.join('\n')
  }

  buildWantPetText (pet = {}) {
    const eggGroups = this.getEggGroups(pet)
    const fathers = this.getBreedingParents(pet)
    const lines = [
      `想要孵出「${this.getPetName(pet)}」：`,
      `蛋组：${formatEggGroups(eggGroups)}`
    ]

    if (eggGroups.includes(1)) {
      lines.push('该精灵属于「未发现」蛋组，无法通过配种获得。')
      return lines.join('\n')
    }

    lines.push('')
    lines.push(`母体必须是「${this.getPetName(pet)}」（孵蛋结果跟随母体）`)

    fathers.slice(0, 15).forEach((father, index) => {
      lines.push(`${index + 1}. ${this.getPetName(father)} - ${formatEggGroups(this.getEggGroups(father))}`)
    })

    return lines.join('\n')
  }

  formatPetCard (pet = {}) {
    const breeding = pet?.breeding || {}
    return {
      id: pet?.id,
      name: this.getPetName(pet),
      icon: this.getPetIconUrl(pet?.id),
      image: this.getPetImageUrl(pet?.id),
      type_label: this.getPetType(pet),
      egg_groups_label: formatEggGroups(this.getEggGroups(pet)),
      height_label: this.formatRange(breeding?.height_low, breeding?.height_high, 'cm'),
      weight_label: this.formatRange(this.toWeightKg(breeding?.weight_low), this.toWeightKg(breeding?.weight_high), 'kg')
    }
  }

  formatPetSizeUnitRange (range = {}, preferredUnit = 'm') {
    if (Array.isArray(range)) {
      return this.formatRange(range[0], range[1], preferredUnit)
    }

    if (!range || typeof range !== 'object') return '暂无数据'

    const pickValue = (keys = []) => {
      for (const key of keys) {
        const value = range?.[key]
        if (value !== undefined && value !== null && value !== '') return value
      }
      return null
    }
    const normalizeNumber = (value) => {
      const numeric = Number(value)
      if (!Number.isFinite(numeric)) return null
      return Math.round(numeric * 1000) / 1000
    }
    const normalizeConverted = (value, factor) => {
      if (value === null) return null
      return normalizeNumber(Number(value) * factor)
    }

    if (preferredUnit === 'kg') {
      const lowKg = pickValue(['min_kg', 'min'])
      const highKg = pickValue(['max_kg', 'max'])
      const low = lowKg !== null ? lowKg : normalizeConverted(pickValue(['min_g']), 0.001)
      const high = highKg !== null ? highKg : normalizeConverted(pickValue(['max_g']), 0.001)
      return this.formatRange(low, high, 'kg')
    }

    if (preferredUnit === 'cm') {
      const lowCm = pickValue(['min_cm', 'min'])
      const highCm = pickValue(['max_cm', 'max'])
      const low = lowCm !== null ? lowCm : normalizeConverted(pickValue(['min_m']), 100)
      const high = highCm !== null ? highCm : normalizeConverted(pickValue(['max_m']), 100)
      return this.formatRange(low, high, 'cm')
    }

    const lowM = pickValue(['min_m', 'min'])
    const highM = pickValue(['max_m', 'max'])
    const low = lowM !== null ? lowM : normalizeConverted(pickValue(['min_cm']), 0.01)
    const high = highM !== null ? highM : normalizeConverted(pickValue(['max_cm']), 0.01)
    return this.formatRange(low, high, 'm')
  }

  formatPetSizeQueryMatchLabel (item = {}) {
    const match = item?.match || {}
    const parts = []
    const matchPercentText = trimText(match?.match_percent_text)

    if (matchPercentText) {
      parts.push(matchPercentText)
    } else {
      const percent = Number(match?.percent)
      if (Number.isFinite(percent)) {
        parts.push(`${Math.round((percent > 1 ? percent : percent * 100) * 100) / 100}%`)
      }
    }

    parts.push(trimText(match?.layer))

    if (Array.isArray(match?.size_tags)) {
      parts.push(...match.size_tags)
    }

    if (match?.display_only) {
      parts.push('展示数据')
    }

    return dedupeList(parts).join(' / ')
  }

  formatPetSizeQueryCard (item = {}) {
    const pet = item?.pet || {}
    const petId = item?.pet_id || pet?.pet_id || pet?.id
    const typeNames = dedupeList(Array.isArray(pet?.type_names) ? pet.type_names : [])
    const eggGroupNames = dedupeList(Array.isArray(pet?.egg_group_names) ? pet.egg_group_names : [])
    const eggGroupsLabel = eggGroupNames.length > 0
      ? eggGroupNames.join(' / ')
      : formatEggGroups(pet?.egg_group_ids)

    return {
      id: petId || '-',
      name: trimText(item?.name) || trimText(pet?.name) || '未知精灵',
      icon: pet?.small_icon || pet?.icon || this.getPetIconUrl(petId),
      image: pet?.icon || pet?.small_icon || this.getPetImageUrl(petId),
      type_label: typeNames.length > 0 ? typeNames.join(' / ') : '未知',
      egg_groups_label: eggGroupsLabel,
      egg_label: trimText(item?.egg_item?.name),
      match_label: this.formatPetSizeQueryMatchLabel(item),
      height_label: this.formatPetSizeUnitRange(item?.egg_size?.height, 'm'),
      weight_label: this.formatPetSizeUnitRange(item?.egg_size?.weight, 'kg')
    }
  }

  formatPetSizeQueryTextLine (item = {}) {
    const card = this.formatPetSizeQueryCard(item)
    const extras = []

    if (card.egg_groups_label && card.egg_groups_label !== '暂无蛋组数据') {
      extras.push(card.egg_groups_label)
    }
    if (card.egg_label) {
      extras.push(card.egg_label)
    }
    if (card.match_label) {
      extras.push(`匹配 ${card.match_label}`)
    }

    const suffix = extras.length > 0 ? ` · ${extras.join(' / ')}` : ''
    return `${card.name} (#${card.id}) - ${card.height_label} / ${card.weight_label}${suffix}`
  }

  buildPetSizeQueryData (diameterM = null, weightKg = null, result = {}, options = {}) {
    const { commandHint = '', copyright = DEFAULT_COPYRIGHT } = options
    const query = result?.query || {}
    const queryDiameter = diameterM !== null && diameterM !== undefined ? diameterM : query?.diameter
    const queryWeight = weightKg !== null && weightKg !== undefined ? weightKg : query?.weight
    const conditions = []

    if (queryDiameter !== null && queryDiameter !== undefined) conditions.push(`直径 ${queryDiameter} m`)
    if (queryWeight !== null && queryWeight !== undefined) conditions.push(`体重 ${queryWeight} kg`)

    const poolName = trimText(query?.pool?.name || query?.pool?.key)
    const queryLabel = [
      conditions.join(' / ') || '尺寸反查',
      poolName ? `池 ${poolName}` : ''
    ].filter(Boolean).join(' · ')
    const items = Array.isArray(result?.items) ? result.items : []
    const cards = items.map((item) => this.formatPetSizeQueryCard(item))

    return {
      query_label: queryLabel,
      perfect_matches: [],
      range_matches: cards,
      total_count: result?.total ?? cards.length,
      has_results: cards.length > 0,
      commandHint,
      copyright
    }
  }

  buildPetSizeQueryText (diameterM = null, weightKg = null, result = {}) {
    const query = result?.query || {}
    const queryDiameter = diameterM !== null && diameterM !== undefined ? diameterM : query?.diameter
    const queryWeight = weightKg !== null && weightKg !== undefined ? weightKg : query?.weight
    const conditions = []

    if (queryDiameter !== null && queryDiameter !== undefined) conditions.push(`直径=${queryDiameter}m`)
    if (queryWeight !== null && queryWeight !== undefined) conditions.push(`体重=${queryWeight}kg`)

    const conditionText = conditions.join(' + ') || '当前条件'
    const items = Array.isArray(result?.items) ? result.items : []

    if (items.length === 0) {
      return `未找到符合 ${conditionText} 的精灵。`
    }

    const lines = [`符合 ${conditionText} 的精灵（共 ${result?.total ?? items.length} 只）：`]
    items.slice(0, 10).forEach((item, index) => {
      lines.push(`${index + 1}. ${this.formatPetSizeQueryTextLine(item)}`)
    })

    lines.push('')
    lines.push('提示：发送 +查蛋 <精灵名> 查看详细蛋组信息')
    return lines.join('\n')
  }

  withRenderAssets (data = {}, basePath = '') {
    const buildResUrl = (assetPath) => {
      if (!basePath) return assetPath
      return `${basePath}${encodeAssetPath(assetPath)}`
    }

    const fallbackIcon = buildResUrl('img/roco_icon.png')
    const patchCard = (card = {}) => ({
      ...card,
      icon: normalizeUrl(card?.icon) || fallbackIcon,
      image: normalizeUrl(card?.image) || fallbackIcon
    })

    return {
      ...data,
      fallbackIcon,
      pet_icon: normalizeUrl(data?.pet_icon) || fallbackIcon,
      pet_image: normalizeUrl(data?.pet_image) || fallbackIcon,
      target: data?.target ? patchCard(data.target) : data?.target,
      fathers: (data?.fathers || []).map((card) => patchCard(card)),
      candidates: (data?.candidates || []).map((card) => patchCard(card)),
      perfect_matches: (data?.perfect_matches || []).map((card) => patchCard(card)),
      range_matches: (data?.range_matches || []).map((card) => patchCard(card))
    }
  }

  getPetName (pet = {}) {
    return trimText(pet?.localized?.zh?.name) || trimText(pet?.name) || '未知精灵'
  }

  getPetType (pet = {}) {
    const values = dedupeList([
      pet?.main_type?.localized?.zh,
      pet?.sub_type?.localized?.zh
    ])

    return values.length > 0 ? values.join(' / ') : '未知'
  }

  getTotalStats (pet = {}) {
    const statKeys = ['base_hp', 'base_phy_atk', 'base_mag_atk', 'base_phy_def', 'base_mag_def', 'base_spd']
    return statKeys.reduce((sum, key) => sum + (Number(pet?.[key]) || 0), 0)
  }

  formatProbabilityArray (value) {
    if (!Array.isArray(value) || value.length !== 2 || !value[1]) {
      return {
        text: '暂无数据',
        percent: null
      }
    }

    const numerator = Number(value[0])
    const denominator = Number(value[1])
    if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) {
      return {
        text: '暂无数据',
        percent: null
      }
    }

    return {
      text: `${numerator}/${denominator}`,
      percent: numerator / denominator * 100
    }
  }

  formatDuration (seconds) {
    const numeric = Number(seconds)
    if (!Number.isFinite(numeric) || numeric <= 0) return '暂无数据'
    if (numeric % 86400 === 0) return `${numeric / 86400} 天`

    const hours = numeric / 3600
    return Number.isInteger(hours) ? `${hours} 小时` : `${hours.toFixed(1)} 小时`
  }

  toWeightKg (value) {
    const numeric = Number(value)
    if (!Number.isFinite(numeric)) return null
    return Math.round((numeric / 1000) * 10) / 10
  }

  formatRange (low, high, unit = '') {
    const left = low !== undefined && low !== null && low !== '' ? low : null
    const right = high !== undefined && high !== null && high !== '' ? high : null

    if (left === null && right === null) return '暂无数据'
    if (left !== null && right !== null) {
      return left === right ? `${left}${unit}` : `${left}-${right}${unit}`
    }

    return `${left ?? right}${unit}`
  }

  getAssetPetId (petId) {
    const numeric = Number(petId)
    if (!Number.isFinite(numeric)) return null
    return numeric >= 3000 ? numeric : numeric + 3000
  }

  getPetIconUrl (petId) {
    const assetPetId = this.getAssetPetId(petId)
    if (!assetPetId) return ''
    return `https://game.gtimg.cn/images/rocom/rocodata/jingling/${assetPetId}/icon.png`
  }

  getPetImageUrl (petId) {
    const assetPetId = this.getAssetPetId(petId)
    if (!assetPetId) return ''
    return `https://game.gtimg.cn/images/rocom/rocodata/jingling/${assetPetId}/image.png`
  }
}

const eggService = new EggService()

export {
  DEFAULT_COPYRIGHT,
  DEFAULT_DATA_DIR,
  EGG_GROUP_META,
  SEARCH_RESULT_TYPES,
  EggService,
  formatEggGroups,
  formatPreciousEggLabel,
  getEggGroupLabel
}

export default eggService
