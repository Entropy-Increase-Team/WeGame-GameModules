import { renderModuleTemplate } from '../../../model/moduleRender.js'
import { replyLargeText } from '../../../utils/queryHelper.js'
import RocomApi from '../model/api.js'
import eggService from '../model/eggService.js'
import merchantService from '../model/merchantService.js'
import { buildCommandReg, formatCommand } from '../utils/command.js'

const SIZE_QUERY_REG = buildCommandReg('(?:尺寸查询|精灵尺寸)(?:\\s+(.+))?')
const MERCHANT_INFO_REG = buildCommandReg('(?:(远行|旅行)商人|商人信息)(?:\\s+(.+))?')

function trimText (value = '') {
  return String(value || '').trim()
}

function extractMatchArg (message = '', pattern = '') {
  const match = String(message || '').trim().match(new RegExp(pattern))
  return trimText(match?.[1] || '')
}

function parsePositiveNumber (value, fieldLabel = '参数') {
  const text = trimText(value)
  if (!/^\d+(?:\.\d+)?$/.test(text)) {
    throw new Error(`${fieldLabel}格式不正确`)
  }

  const num = Number(text)
  if (!Number.isFinite(num) || num <= 0) {
    throw new Error(`${fieldLabel}必须大于 0`)
  }

  return num
}

function parseSizeQueryArgs (raw = '') {
  const tokens = trimText(raw).split(/\s+/).filter(Boolean)
  if (tokens.length !== 2) {
    throw new Error(`格式：${formatCommand('尺寸查询 <直径米> <重量千克>')}`)
  }

  return {
    diameter: parsePositiveNumber(tokens[0], '直径'),
    weight: parsePositiveNumber(tokens[1], '重量')
  }
}

function parseMerchantArgs (raw = '') {
  const text = trimText(raw)
  if (!text) {
    return { refresh: false }
  }

  const normalized = text.toLowerCase()
  if (['刷新', 'refresh', '1', 'true'].includes(normalized)) {
    return { refresh: true }
  }

  throw new Error(`格式：${formatCommand('远行商人 [刷新]')}`)
}

function encodeAssetPath (assetPath = '') {
  return String(assetPath || '')
    .split('/')
    .filter(Boolean)
    .map((part) => encodeURIComponent(part))
    .join('/')
}

export class RocomTools extends plugin {
  constructor (e) {
    super({
      name: '[WeGame-plugin][rocom] 工具查询',
      dsc: '洛克王国世界工具查询',
      event: 'message',
      priority: 114,
      rule: [
        {
          reg: SIZE_QUERY_REG,
          fnc: 'queryPetSize'
        },
        {
          reg: MERCHANT_INFO_REG,
          fnc: 'queryMerchantInfo'
        }
      ]
    })

    this.e = e
    this.api = new RocomApi()
  }

  async queryPetSize () {
    try {
      const args = parseSizeQueryArgs(extractMatchArg(this.e.msg, SIZE_QUERY_REG))
      await this.reply(`正在查询精灵尺寸：直径 ${args.diameter} 米，重量 ${args.weight} 千克...`)
      const data = await this.api.getPetSizeQuery(args)
      const renderData = eggService.buildSizeSearchDataFromApi(args.diameter, args.weight, data, {
        dimensionLabel: '直径',
        dimensionUnit: 'm',
        commandHint: `发送 ${formatCommand('尺寸查询 <直径米> <重量千克>')} 或 ${formatCommand('查蛋 <精灵名>')} 继续查询`,
        copyright: 'WeGame-plugin · RoCom'
      })

      const image = await renderModuleTemplate(
        this.e,
        'rocom',
        'render/searcheggs/size',
        {
          saveId: `tool-size-${this.e.user_id}-${Date.now()}`,
          ...renderData
        },
        {
          retType: 'base64',
          beforeRender: ({ data }) => eggService.withRenderAssets(data, data.pluResPath)
        }
      )

      if (image) {
        await this.reply(image)
        return true
      }

      await replyLargeText(this, '精灵尺寸查询', eggService.buildSizeSearchTextFromApi(args.diameter, args.weight, data, {
        dimensionLabel: '直径',
        dimensionUnit: 'm'
      }))
      return true
    } catch (error) {
      logger.error('[WeGame-plugin][rocom] 精灵尺寸查询失败', error)
      await this.reply(`精灵尺寸查询失败：${error.message || error}`)
      return true
    }
  }

  async queryMerchantInfo () {
    try {
      const args = parseMerchantArgs(extractMatchArg(this.e.msg, MERCHANT_INFO_REG))
      await this.reply(args.refresh ? '正在强制刷新远行商人信息...' : '正在查询远行商人信息...')
      const data = await merchantService.getInfo(args.refresh)
      const renderData = merchantService.buildRenderData(data)

      const image = await renderModuleTemplate(
        this.e,
        'rocom',
        'render/yuanxing-shangren/index',
        {
          saveId: `merchant-${this.e.user_id}-${Date.now()}`,
          ...renderData
        },
        {
          retType: 'base64',
          beforeRender: ({ data }) => this.withMerchantAssets(data)
        }
      )

      if (image) {
        await this.reply(image)
        return true
      }

      await replyLargeText(this, '远行商人信息', merchantService.buildFallbackText(data))
      return true
    } catch (error) {
      logger.error('[WeGame-plugin][rocom] 远行商人信息查询失败', error)
      await this.reply(`远行商人信息查询失败：${error.message || error}`)
      return true
    }
  }

  withMerchantAssets (data = {}) {
    const buildResUrl = (assetPath) => `${data.pluResPath}${encodeAssetPath(assetPath)}`
    const fallbackImage = buildResUrl('img/logo.cVSpb3sL.png')

    return {
      ...data,
      background: buildResUrl('img/bg.C8CUoi7I.jpg'),
      products: (data.products || []).map((item) => ({
        ...item,
        image: String(item?.image || '').trim() || fallbackImage
      }))
    }
  }
}
