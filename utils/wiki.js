function toNumber (value, fallback = 0) {
  const num = Number(value)
  return Number.isFinite(num) ? num : fallback
}

function toText (value, fallback = '') {
  const text = String(value ?? '').trim()
  return text || fallback
}

function normalizeUrl (value) {
  const text = String(value || '').trim()
  if (!text) return ''
  if (text.startsWith('//')) return `https:${text}`
  if (/^https?:\/\//.test(text)) return text
  return ''
}

function assetPetId (number) {
  const numeric = Number(number)
  if (!Number.isFinite(numeric)) return null
  return numeric >= 3000 ? numeric : numeric + 3000
}

function buildPetIcon (item = {}) {
  const directUrl = normalizeUrl(item?.icon_url || item?.pet_icon || item?.petIcon)
  if (directUrl) return directUrl

  const assetId = assetPetId(item?.no || item?.pet_id)
  return assetId ? `https://game.gtimg.cn/images/rocom/rocodata/jingling/${assetId}/icon.png` : ''
}

function buildPetImage (item = {}) {
  const directUrl = normalizeUrl(item?.image_url || item?.pet_image || item?.petImage)
  if (directUrl) return directUrl

  const assetId = assetPetId(item?.no || item?.pet_id)
  return assetId ? `https://game.gtimg.cn/images/rocom/rocodata/jingling/${assetId}/image.png` : ''
}

function normalizeTypeValues (values = []) {
  const output = []
  for (const value of Array.isArray(values) ? values : []) {
    if (value && typeof value === 'object') {
      const text = value.name || value.label || value.value
      if (text) output.push(String(text))
      continue
    }

    if (value !== undefined && value !== null && value !== '') {
      output.push(String(value))
    }
  }
  return output
}

function buildEvolutionData (item = {}) {
  const rawChain = item?.evolution_chain || item?.evolutionChain || item?.evolutions || item?.evolution || []
  const chain = []

  for (const evolution of Array.isArray(rawChain) ? rawChain : []) {
    const number = evolution?.no || evolution?.pet_id || item?.no || '?'
    const assetId = assetPetId(number)
    chain.push({
      name: toText(evolution?.name, '未知形态'),
      number,
      image: normalizeUrl(evolution?.image || evolution?.image_url || evolution?.petImage) ||
        (assetId ? `https://game.gtimg.cn/images/rocom/rocodata/jingling/${assetId}/image.png` : buildPetImage(item)),
      icon: normalizeUrl(evolution?.icon || evolution?.icon_url || evolution?.petIcon) ||
        (assetId ? `https://game.gtimg.cn/images/rocom/rocodata/jingling/${assetId}/icon.png` : buildPetIcon(item)),
      condition: toText(evolution?.condition || evolution?.how || evolution?.requirement, ''),
      is_current: Boolean(
        evolution?.is_current ||
        toText(evolution?.name) === toText(item?.name) ||
        String(number) === String(item?.no)
      )
    })
  }

  if (chain.length > 0) return chain

  return [
    {
      name: toText(item?.name, '未知精灵'),
      number: item?.no || '?',
      image: buildPetImage(item),
      icon: buildPetIcon(item),
      condition: '',
      is_current: true
    }
  ]
}

function buildWikiPetRenderData (item = {}, query = '') {
  const stats = item?.stats || {}
  const statDefs = [
    ['HP', 'hp', '#4bc074'],
    ['攻击', 'atk', '#e95f5f'],
    ['魔攻', 'sp_atk', '#6f85ff'],
    ['防御', 'def', '#da9c37'],
    ['魔抗', 'sp_def', '#18a1a1'],
    ['速度', 'spd', '#9b61ff']
  ]

  const petStats = statDefs.map(([label, key, color]) => {
    const value = toNumber(stats?.[key], 0)
    return {
      label,
      value,
      color,
      percent: Math.max(8, Math.min(100, Math.round((value / 255) * 100)))
    }
  })

  const abilityName = toText(item?.ability_name || item?.ability, '暂无')
  const abilityDesc = toText(item?.ability_desc || item?.ability_description, '暂无特性描述')
  const petTypes = normalizeTypeValues(item?.attributes || item?.types).map((name) => ({ name }))
  const spriteSkills = []
  const skills = Array.isArray(item?.skills || item?.skill_list) ? (item?.skills || item?.skill_list) : []

  for (const skill of skills.slice(0, 24)) {
    spriteSkills.push({
      name: toText(skill?.name, '未知技能'),
      type: toText(skill?.attribute, '未知'),
      category: toText(skill?.category, '未知'),
      power: skill?.power ?? '?',
      pp: skill?.cost ?? '?',
      effect: toText(skill?.description, '暂无描述'),
      level: skill?.level ?? '-'
    })
  }

  const matchup = item?.type_matchup || {}
  const petTraits = [
    {
      name: abilityName,
      type: '特性',
      effect: abilityDesc,
      type_class: 'ability'
    }
  ]

  const matchupDefs = [
    ['克制', 'strong_against'],
    ['被克制', 'weak_to'],
    ['抗性', 'resists'],
    ['被抗', 'resisted_by']
  ]

  for (const [label, key] of matchupDefs) {
    const values = normalizeTypeValues(matchup?.[key])
    petTraits.push({
      name: label,
      type: '属性',
      effect: values.length > 0 ? values.join('、') : '暂无',
      type_class: 'matchup'
    })
  }

  const description = toText(
    item?.description ||
    item?.summary ||
    item?.intro ||
    item?.profile ||
    abilityDesc,
    '暂无图鉴描述'
  )

  return {
    name: toText(item?.name, query || '未知精灵'),
    number: item?.no || '???',
    query,
    form: toText(item?.form, ''),
    pet_types: petTypes,
    pet_icon: buildPetIcon(item),
    main_image: buildPetImage(item),
    total_stats: toNumber(stats?.total, petStats.reduce((sum, stat) => sum + stat.value, 0)),
    pet_stats: petStats,
    description,
    pet_traits: petTraits,
    pet_evolution: buildEvolutionData(item),
    sprite_skills: spriteSkills,
    updated_at: toText(item?.updated_at, ''),
    wiki_url: toText(item?.url, ''),
    commandHint: '💡 +wiki精灵 <精灵名> | +wiki技能 <技能名>',
    resultHint: '',
    copyright: 'WeGame-plugin · RoCom Wiki'
  }
}

function buildWikiSkillRenderData (item = {}, query = '') {
  const power = item?.power
  const cost = item?.cost
  return {
    name: toText(item?.name, query || '未知技能'),
    query,
    attribute: toText(item?.attribute, '未知'),
    category: toText(item?.category, '未知'),
    cost: cost !== undefined && cost !== null && cost !== '' ? cost : '?',
    power: power !== undefined && power !== null && power !== '' ? power : '?',
    description: toText(item?.description, '暂无描述'),
    updated_at: toText(item?.updated_at, ''),
    commandHint: '+wiki技能 <技能名>',
    resultHint: '',
    copyright: 'WeGame-plugin · RoCom Wiki'
  }
}

export {
  assetPetId,
  buildPetIcon,
  buildPetImage,
  buildWikiPetRenderData,
  buildWikiSkillRenderData,
  normalizeTypeValues
}
