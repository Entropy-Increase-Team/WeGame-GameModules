import { buildCommandReg, formatCommand } from '../utils/command.js'

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
    const lines = [
      '洛克王国世界帮助',
      '',
      `${formatCommand('帮助')} - 查看模块帮助`,
      `${formatCommand('档案')} - 查询角色档案`,
      `${formatCommand('战绩')} - 查询闪耀大赛战绩`,
      `${formatCommand('精灵列表')} - 查询精灵列表`,
      `${formatCommand('精灵列表 了不起 1')} - 查询了不起精灵第一页`
    ]

    await this.reply(lines.join('\n'))
    return true
  }
}
