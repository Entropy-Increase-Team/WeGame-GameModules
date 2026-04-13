import WeGameAccountService from '../../../model/accountService.js'
import { renderModuleTemplate } from '../../../model/moduleRender.js'
import { formatCommand as formatCoreCommand } from '../../../utils/command.js'
import { getLoginTypeLabel } from '../../../utils/common.js'
import RocomApi from '../model/api.js'
import { buildCommandReg } from '../utils/command.js'

function normalizeRocomAccount (payload = {}) {
  if (!payload || typeof payload !== 'object') return null

  const binding = payload.binding && typeof payload.binding === 'object' ? payload.binding : {}
  const role = payload.role && typeof payload.role === 'object' ? payload.role : {}
  const bindingId = String(binding.id || '').trim()
  const roleId = String(role.id || '').trim()

  if (!bindingId && !roleId) {
    return null
  }

  return {
    id: bindingId || roleId,
    bindingId,
    bindingIndex: 0,
    loginType: String(binding.loginType || binding.login_type || '').trim(),
    tgpId: String(binding.tgpId || binding.tgp_id || '').trim(),
    isPrimary: binding.isPrimary === true || binding.is_primary === true,
    isValid: binding.isValid !== false && binding.is_valid !== false,
    updatedAt: String(binding.updatedAt || binding.updated_at || '').trim(),
    roleId,
    roleName: String(role.name || '').trim(),
    level: role.level,
    starName: String(role.star_name || '').trim(),
    enrollDays: role.enroll_days,
    isOnline: role.is_online
  }
}

function formatDateTime (value) {
  const text = String(value || '').trim()
  if (!text) return '未返回'

  const date = new Date(text)
  if (Number.isNaN(date.getTime())) {
    return text
  }

  const pad = (num) => String(num).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}

function getAccountName (account = {}) {
  return account.roleName || account.roleId || account.tgpId || '未命名角色'
}

function getStatusText (account = {}) {
  return buildStatusTags(account).join(' | ')
}

function buildStatusTags (account = {}) {
  const tags = []

  if (account.isPrimary) tags.push('主账号')
  tags.push(account.isValid ? '有效' : '失效')

  if (account.isOnline !== undefined) {
    tags.push(Number(account.isOnline) === 1 ? '在线' : '离线')
  }

  return tags
}

function buildRenderBadges (account = {}) {
  const badges = []

  if (account.isPrimary) {
    badges.push({ text: '主账号', type: 'primary' })
  }

  badges.push({
    text: account.isValid ? '有效' : '失效',
    type: account.isValid ? 'valid' : 'invalid'
  })

  if (account.isOnline !== undefined) {
    badges.push({
      text: Number(account.isOnline) === 1 ? '在线' : '离线',
      type: Number(account.isOnline) === 1 ? 'online' : 'offline'
    })
  }

  return badges
}

function getSubtitle (accounts = [], bindingsTotal = 0) {
  const total = Math.max(bindingsTotal, accounts.length)

  if (accounts.length > 0 && total > accounts.length) {
    return `已识别 ${accounts.length} / ${total} 个可用洛克角色`
  }

  if (accounts.length > 0) {
    return `当前共识别到 ${accounts.length} 个可用洛克角色`
  }

  if (total > 0) {
    return `当前已绑定 ${total} 个 WeGame 账号，但还没有识别到可用洛克角色`
  }

  return '当前还没有已绑定的 WeGame 账号'
}

function getEmptyText (bindingsTotal = 0) {
  if (bindingsTotal > 0) {
    return '已绑定账号存在，但暂未识别到可用洛克角色'
  }

  return '暂无已绑定的 WeGame 账号'
}

function buildRenderBindings (accounts = []) {
  return accounts.map((account, index) => ({
    index: index + 1,
    binding_index: account.bindingIndex || '--',
    nickname: getAccountName(account),
    role_id: account.roleId || '未返回',
    tgp_id: account.tgpId || '未返回',
    type_label: getLoginTypeLabel(account.loginType),
    level_text: account.level !== undefined && account.level !== null && account.level !== ''
      ? `Lv.${account.level}`
      : '未返回',
    star_name: account.starName || '未返回',
    updated_at: formatDateTime(account.updatedAt),
    status_text: getStatusText(account),
    isPrimary: account.isPrimary,
    badges: buildRenderBadges(account)
  }))
}

function buildFallbackText (accounts = [], bindingsTotal = 0) {
  if (accounts.length === 0) {
    return [
      '洛克王国世界账号列表',
      getSubtitle(accounts, bindingsTotal),
      getEmptyText(bindingsTotal)
    ].join('\n')
  }

  const lines = [
    '洛克王国世界账号列表',
    getSubtitle(accounts, bindingsTotal),
    ''
  ]

  for (const account of accounts) {
    lines.push(`绑定序号：${account.bindingIndex || '未返回'}`)
    lines.push(`角色昵称：${getAccountName(account)}`)
    lines.push(`状态：${getStatusText(account)}`)
    lines.push(`登录方式：${getLoginTypeLabel(account.loginType)}`)
    lines.push(`角色ID：${account.roleId || '未返回'}`)
    lines.push(`WeGameID：${account.tgpId || '未返回'}`)
    lines.push('')
  }

  lines.push(`切换默认账号：${formatCoreCommand('切换账号 <绑定序号>')}`)
  return lines.join('\n').trim()
}

export class RocomAccounts extends plugin {
  constructor (e) {
    super({
      name: '[WeGame-plugin][rocom] 账号列表',
      dsc: '洛克王国世界账号列表查询',
      event: 'message',
      priority: 111,
      rule: [
        {
          reg: buildCommandReg('账号列表'),
          fnc: 'listAccounts'
        }
      ]
    })

    this.e = e
    this.api = new RocomApi()
    this.accountService = new WeGameAccountService(e)
  }

  async listAccounts () {
    let accounts = []
    let bindingsTotal = 0

    try {
      if (!this.accountService.hasApiKey()) {
        throw new Error('查询洛克账号列表需要先在 wgconfig.yaml 中填写 wegame.api_key')
      }

      const [data, bindings] = await Promise.all([
        this.api.getAccounts(this.accountService.getUserIdentifier()),
        this.accountService.listBindings({ attemptRepair: false }).catch(() => [])
      ])
      const bindingIndexMap = new Map(bindings.map((binding, index) => [binding.id, index + 1]))
      accounts = (Array.isArray(data?.accounts) ? data.accounts : [])
        .map((item) => {
          const account = normalizeRocomAccount(item)
          if (!account) return null

          return {
            ...account,
            bindingIndex: bindingIndexMap.get(account.bindingId) || 0
          }
        })
        .filter(Boolean)

      bindingsTotal = Math.max(
        0,
        Number(data?.bindings_total) || 0,
        Array.isArray(bindings) ? bindings.length : 0
      )

      const image = await renderModuleTemplate(
        this.e,
        'rocom',
        'render/bind-list/index',
        {
          saveId: `rocom-bind-list-${this.e.user_id}-${Date.now()}`,
          title: '洛克王国世界账号列表',
          subtitle: getSubtitle(accounts, bindingsTotal),
          bindings: buildRenderBindings(accounts),
          emptyText: getEmptyText(bindingsTotal),
          tip: accounts.length > 0
            ? `发送 ${formatCoreCommand('切换账号 <绑定序号>')} 切换默认账号`
            : `可先发送 ${formatCoreCommand('qq登陆')} 或 ${formatCoreCommand('wx登陆')} 绑定账号`,
          copyright: 'WeGame-plugin · RoCom'
        },
        {
          retType: 'base64'
        }
      )

      if (!image) {
        throw new Error('账号列表渲染失败')
      }

      await this.reply(image)
      return true
    } catch (error) {
      logger.error('[WeGame-plugin][rocom] 查询账号列表失败', error)
      if (accounts.length > 0 || bindingsTotal > 0) {
        await this.reply(buildFallbackText(accounts, bindingsTotal))
      } else {
        await this.reply(`查询账号列表失败：${error.message || error}`)
      }
      return true
    }
  }
}
