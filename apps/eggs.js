import { renderModuleTemplate } from '../../../model/moduleRender.js'
import RocomApi from '../model/api.js'
import eggService, { DEFAULT_COPYRIGHT, SEARCH_RESULT_TYPES } from '../model/eggService.js'
import { buildCommandReg, formatCommand, stripCommandPrefix } from '../utils/command.js'

function trimText (value = '') {
  return String(value || '').trim()
}

function tryParseNumber (value = '') {
  const text = trimText(value).replace(/(?:kg|千克|公斤|m|米)$/i, '')
  if (!text) return null
  const numeric = Number(text)
  return Number.isFinite(numeric) ? numeric : null
}

function parsePrefixedNumber (value = '', prefixes = []) {
  const text = trimText(value)
  for (const prefix of prefixes) {
    if (!text.startsWith(prefix)) continue
    return tryParseNumber(text.slice(prefix.length))
  }
  return null
}

function buildUsageText () {
  return [
    '查蛋用法：',
    `${formatCommand('查蛋 <精灵名>')} 查询精灵蛋组和可配种精灵`,
    `${formatCommand('查蛋 0.29 3.294')} 按直径(m)+体重(kg)反查`,
    `${formatCommand('查蛋 直径0.29 体重3.294')} 支持带前缀写法`,
    '',
    '配种用法：',
    `${formatCommand('配种 <精灵名>')} 查看想要该精灵时的父体候选`,
    `${formatCommand('配种 <父体> <母体>')} 判断两只精灵是否可以配种`
  ].join('\n')
}

export class RocomEggs extends plugin {
  constructor (e) {
    super({
      name: '[WeGame-plugin][rocom] 查蛋与配种',
      dsc: '洛克王国世界查蛋与配种工具',
      event: 'message',
      priority: 117,
      rule: [
        {
          reg: buildCommandReg('(?:查蛋|精灵查蛋)(?:\\s+.+)?'),
          fnc: 'queryEggs'
        },
        {
          reg: buildCommandReg('配种(?:\\s+.+)?'),
          fnc: 'queryBreeding'
        }
      ]
    })

    this.e = e
    this.api = new RocomApi()
  }

  async queryEggs () {
    try {
      const raw = stripCommandPrefix(this.e.msg, '查蛋') || stripCommandPrefix(this.e.msg, '精灵查蛋')
      if (!raw) {
        await this.reply(buildUsageText())
        return true
      }

      const parsed = this.parseEggArgs(raw)
      if (parsed.diameter !== null || parsed.weight !== null) {
        return this.queryBySize(parsed)
      }

      if (!parsed.name) {
        throw new Error(`格式：${formatCommand('查蛋 <精灵名>')}`)
      }

      const searchResult = eggService.search(parsed.name)
      if (searchResult.matchType === SEARCH_RESULT_TYPES.MULTI) {
        const data = eggService.buildCandidatesRenderData(parsed.name, searchResult.candidates, {
          commandHint: `发送 ${formatCommand('查蛋 <精确名称>')} 继续查询`,
          copyright: DEFAULT_COPYRIGHT
        })
        return this.replyEggImage('render/searcheggs/candidates', data)
      }

      if (searchResult.matchType === SEARCH_RESULT_TYPES.NOT_FOUND || !searchResult.pet) {
        throw new Error(`未找到名为「${parsed.name}」的精灵`)
      }

      const data = eggService.buildSearchData(searchResult.pet, {
        commandHint: `发送 ${formatCommand('配种 <父体> <母体>')} 判断能否配种`,
        copyright: DEFAULT_COPYRIGHT
      })

      if (searchResult.matchType === SEARCH_RESULT_TYPES.FUZZY) {
        await this.reply(`模糊匹配到「${data.pet_name}」`)
      }

      return this.replyEggImage('render/searcheggs/index', data)
    } catch (error) {
      logger.error('[WeGame-plugin][rocom] 查蛋失败', error)
      await this.reply(`查蛋失败：${error.message || error}`)
      return true
    }
  }

  async queryBreeding () {
    try {
      const raw = stripCommandPrefix(this.e.msg, '配种')
      if (!raw) {
        await this.reply(buildUsageText())
        return true
      }

      const names = raw.split(/\s+/).filter(Boolean)
      if (names.length === 0) {
        throw new Error(`格式：${formatCommand('配种 <精灵名>')} 或 ${formatCommand('配种 <父体> <母体>')}`)
      }

      if (names.length === 1) {
        const searchResult = eggService.search(names[0])
        if (searchResult.matchType === SEARCH_RESULT_TYPES.MULTI) {
          const data = eggService.buildCandidatesRenderData(names[0], searchResult.candidates, {
            commandHint: `发送 ${formatCommand('配种 <精确名称>')} 查看目标配种方案`,
            copyright: DEFAULT_COPYRIGHT
          })
          return this.replyEggImage('render/searcheggs/candidates', data)
        }

        if (searchResult.matchType === SEARCH_RESULT_TYPES.NOT_FOUND || !searchResult.pet) {
          throw new Error(`未找到名为「${names[0]}」的精灵`)
        }

        const data = eggService.buildWantPetData(searchResult.pet, {
          commandHint: `发送 ${formatCommand('配种 <父体> <母体>')} 判断能否配种`,
          copyright: DEFAULT_COPYRIGHT
        })
        return this.replyEggImage('render/searcheggs/want', data)
      }

      const fatherName = names[0]
      const motherName = names.slice(1).join(' ')
      const fatherResult = eggService.search(fatherName)
      if (fatherResult.matchType === SEARCH_RESULT_TYPES.MULTI) {
        const data = eggService.buildCandidatesRenderData(fatherName, fatherResult.candidates, {
          commandHint: `发送 ${formatCommand('配种 <精确父体> <母体>')} 继续查询`,
          copyright: DEFAULT_COPYRIGHT
        })
        return this.replyEggImage('render/searcheggs/candidates', data)
      }

      if (fatherResult.matchType === SEARCH_RESULT_TYPES.NOT_FOUND || !fatherResult.pet) {
        throw new Error(`未找到名为「${fatherName}」的精灵`)
      }

      const motherResult = eggService.search(motherName)
      if (motherResult.matchType === SEARCH_RESULT_TYPES.MULTI) {
        const data = eggService.buildCandidatesRenderData(motherName, motherResult.candidates, {
          commandHint: `发送 ${formatCommand('配种 <父体> <精确母体>')} 继续查询`,
          copyright: DEFAULT_COPYRIGHT
        })
        return this.replyEggImage('render/searcheggs/candidates', data)
      }

      if (motherResult.matchType === SEARCH_RESULT_TYPES.NOT_FOUND || !motherResult.pet) {
        throw new Error(`未找到名为「${motherName}」的精灵`)
      }

      const data = eggService.buildPairData(motherResult.pet, fatherResult.pet, {
        commandHint: `默认前父后母，孵蛋结果跟随后者；也可发送 ${formatCommand('配种 <精灵名>')} 查看目标方案`,
        copyright: DEFAULT_COPYRIGHT
      })

      return this.replyEggImage('render/searcheggs/pair', data)
    } catch (error) {
      logger.error('[WeGame-plugin][rocom] 配种失败', error)
      await this.reply(`配种失败：${error.message || error}`)
      return true
    }
  }

  parseEggArgs (raw = '') {
    const tokens = trimText(raw).split(/\s+/).filter(Boolean)
    const nameParts = []
    const numericParts = []
    let diameter = null
    let weight = null

    for (const token of tokens) {
      const parsedDiameter = parsePrefixedNumber(token, ['直径', '尺寸', 'd', 'D', '身高', 'h', 'H'])
      if (parsedDiameter !== null) {
        diameter = parsedDiameter
        continue
      }

      const parsedWeight = parsePrefixedNumber(token, ['体重', 'w', 'W'])
      if (parsedWeight !== null) {
        weight = parsedWeight
        continue
      }

      const numeric = tryParseNumber(token)
      if (numeric !== null) {
        numericParts.push(numeric)
        continue
      }

      nameParts.push(token)
    }

    if (diameter === null && numericParts.length > 0) {
      diameter = numericParts[0]
    }

    if (weight === null && numericParts.length > 1) {
      weight = numericParts[1]
    }

    return {
      diameter,
      weight,
      name: nameParts.join(' ').trim()
    }
  }

  async queryBySize ({ diameter = null, weight = null } = {}) {
    const commandHint = `发送 ${formatCommand('查蛋 <精灵名>')} 查看详细蛋组`
    const copyright = DEFAULT_COPYRIGHT
    let renderData = null
    let fallbackText = ''

    if (diameter !== null && weight !== null) {
      try {
        const apiResult = await this.api.getPetSizeQuery({
          diameter,
          weight
        })
        renderData = eggService.buildSizeSearchDataFromApi(diameter, weight, apiResult, {
          dimensionLabel: '直径',
          dimensionUnit: 'm',
          commandHint,
          copyright
        })
        fallbackText = eggService.buildSizeSearchTextFromApi(diameter, weight, apiResult, {
          dimensionLabel: '直径',
          dimensionUnit: 'm'
        })
      } catch (error) {
        logger.warn(`[WeGame-plugin][rocom] 查蛋尺寸后端查询失败，回退本地数据：${error.message || error}`)
      }
    }

    if (!renderData) {
      const localHeightCm = diameter !== null && diameter !== undefined ? diameter * 100 : diameter
      const localResult = eggService.searchBySize(localHeightCm, weight)
      renderData = eggService.buildSizeSearchData(localHeightCm, weight, localResult, {
        commandHint,
        copyright
      })
      fallbackText = eggService.buildSizeSearchText(localHeightCm, weight, localResult)
    }

    return this.replyEggImage('render/searcheggs/size', renderData, fallbackText)
  }

  async replyEggImage (templatePath = '', data = {}, fallbackText = '') {
    const image = await renderModuleTemplate(
      this.e,
      'rocom',
      templatePath,
      data,
      {
        retType: 'base64',
        beforeRender: ({ data }) => eggService.withRenderAssets(data, data.pluResPath)
      }
    )

    if (!image) {
      await this.reply(fallbackText || '图片渲染失败')
      return true
    }

    await this.reply(image)
    return true
  }
}
