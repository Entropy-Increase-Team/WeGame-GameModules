import { renderModuleTemplate } from '../../../model/moduleRender.js'
import { getModuleHelpGroups } from '../../../utils/helpConfig.js'
import { buildCommandReg, COMMAND_PREFIXES, formatCommand } from '../utils/command.js'

function buildDefaultMenuGroups () {
  return [
    {
      groupTitle: '洛克王国世界',
      menuItems: [
        {
          cmd: formatCommand('帮助'),
          desc: '查看洛克王国世界帮助'
        },
        {
          cmd: formatCommand('档案'),
          desc: '查询角色档案'
        },
        {
          cmd: formatCommand('账号列表'),
          desc: '查询可识别的洛克角色账号'
        },
        {
          cmd: formatCommand('战绩'),
          desc: '查询闪耀大赛战绩'
        },
        {
          cmd: formatCommand('精灵列表'),
          desc: '查询精灵列表第一页'
        },
        {
          cmd: formatCommand('精灵列表 了不起 1'),
          desc: '查询了不起精灵第一页'
        },
        {
          cmd: formatCommand('尺寸查询 0.45 35.6'),
          desc: '按尺寸和重量反查精灵候选'
        },
        {
          cmd: formatCommand('远行商人'),
          desc: '查询远行商人活动信息'
        },
        {
          cmd: formatCommand('wiki精灵 圣剑'),
          desc: '查询 Wiki 精灵资料'
        },
        {
          cmd: formatCommand('wiki技能 圣光斩'),
          desc: '查询 Wiki 技能资料'
        }
      ]
    }
  ]
}

function normalizeMenuGroups (groups = []) {
  const normalized = (Array.isArray(groups) ? groups : [])
    .filter((group) => group?.type !== 'tips')
    .map((group) => ({
      groupTitle: String(group?.group || '常用命令').trim(),
      menuItems: (Array.isArray(group?.list) ? group.list : [])
        .map((item) => ({
          cmd: String(item?.title || '').trim(),
          desc: String(item?.desc || '').trim()
        }))
        .filter((item) => item.cmd || item.desc)
    }))
    .filter((group) => group.groupTitle || group.menuItems.length)

  return normalized.length > 0 ? normalized : buildDefaultMenuGroups()
}

function buildFallbackText (menuGroups = []) {
  const lines = [
    '洛克王国世界帮助',
    `支持前缀：${COMMAND_PREFIXES.join(' / ')}`
  ]

  for (const group of menuGroups) {
    const items = Array.isArray(group?.menuItems) ? group.menuItems : []
    if (!group?.groupTitle && items.length === 0) continue

    lines.push('')
    if (group?.groupTitle) {
      lines.push(`${group.groupTitle}：`)
    }

    for (const item of items) {
      if (!item?.cmd && !item?.desc) continue
      lines.push(item?.desc ? `${item.cmd} - ${item.desc}` : item.cmd)
    }
  }

  return lines.join('\n')
}

export class RocomHelp extends plugin {
  constructor (e) {
    super({
      name: '[WeGame-plugin][rocom] 帮助',
      dsc: '洛克王国世界模块帮助',
      event: 'message',
      priority: 110,
      rule: [
        {
          reg: buildCommandReg('(?:帮助|help|菜单)'),
          fnc: 'showHelp'
        }
      ]
    })

    this.e = e
  }

  async showHelp () {
    const menuGroups = normalizeMenuGroups(getModuleHelpGroups('rocom'))

    try {
      const image = await renderModuleTemplate(
        this.e,
        'rocom',
        'render/menu/index',
        {
          saveId: `rocom-help-${this.e.user_id}-${Date.now()}`,
          pageTitle: '洛克王国世界帮助',
          pageSubtitle: `支持前缀：${COMMAND_PREFIXES.join(' / ')}`,
          menuGroups
        },
        {
          retType: 'base64'
        }
      )

      if (!image) {
        throw new Error('模块帮助渲染失败')
      }

      await this.reply(image)
      return true
    } catch (error) {
      logger.error('[WeGame-plugin][rocom] 帮助渲染失败', error)
      await this.reply(buildFallbackText(menuGroups))
      return true
    }
  }
}
