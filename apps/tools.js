import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Restart } from '../../../../other/restart.js'
import { renderModuleTemplate } from '../../../model/moduleRender.js'
import WeGameAccountService from '../../../model/accountService.js'
import { replyLargeText } from '../../../utils/queryHelper.js'
import RocomApi from '../model/api.js'
import merchantService from '../model/merchantService.js'
import activitiesService from '../model/activitiesService.js'
import { buildCommandReg } from '../utils/command.js'
import { trimText, encodeAssetPath } from '../utils/rocom.js'

const execFileAsync = promisify(execFile)
const moduleRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const MERCHANT_INFO_REG = buildCommandReg('(?:(?:远行|旅行)商人|商人信息)')
const MERCHANT_TODAY_REG = buildCommandReg('今日(?:远行|旅行)商人')
const ACTIVITIES_INFO_REG = buildCommandReg('(?:洛克)?日历')
const UPDATE_REG = buildCommandReg('更新')
const FORCE_UPDATE_REG = buildCommandReg('强制更新')

let updating = false

async function execModuleGit (args = []) {
  return execFileAsync('git', args, {
    cwd: moduleRoot,
    timeout: 30000,
    windowsHide: true
  })
}

function normalizeExecOutput (value = '') {
  return String(value || '').trim()
}

function getGitErrorMessage (error) {
  return normalizeExecOutput(error?.stderr) ||
    normalizeExecOutput(error?.stdout) ||
    normalizeExecOutput(error?.message) ||
    '未知错误'
}

async function getGitHead () {
  try {
    const result = await execModuleGit(['rev-parse', '--short', 'HEAD'])
    return normalizeExecOutput(result.stdout)
  } catch {
    return ''
  }
}

async function getGitBranch () {
  try {
    const result = await execModuleGit(['branch', '--show-current'])
    return normalizeExecOutput(result.stdout)
  } catch {
    return ''
  }
}

async function getGitCommitTime () {
  try {
    const result = await execModuleGit(['log', '-1', '--pretty=%cd', '--date=format:%F %T'])
    return normalizeExecOutput(result.stdout)
  } catch {
    return ''
  }
}

function formatCommit (result = {}) {
  if (result.updated && result.beforeHead && result.afterHead) {
    return `${result.beforeHead} -> ${result.afterHead}`
  }
  return result.afterHead || result.beforeHead || '未知提交'
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
          reg: MERCHANT_TODAY_REG,
          fnc: 'queryTodayMerchantInfo'
        },
        {
          reg: MERCHANT_INFO_REG,
          fnc: 'queryMerchantInfo'
        },
        {
          reg: ACTIVITIES_INFO_REG,
          fnc: 'queryActivitiesInfo'
        },
        {
          reg: UPDATE_REG,
          fnc: 'updateModule',
          permission: 'master'
        },
        {
          reg: FORCE_UPDATE_REG,
          fnc: 'forceUpdateModule',
          permission: 'master'
        }
      ]
    })

    this.e = e
    this.api = new RocomApi()
    this.accountService = new WeGameAccountService(e)
  }

  async queryMerchantInfo () {
    try {
      await this.reply('正在查询远行商人信息...')
      const data = await merchantService.getInfo(false, {
        userIdentifier: this.accountService.getUserIdentifier()
      })
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

  async queryTodayMerchantInfo () {
    try {
      await this.reply('正在查询今日远行商人信息...')
      const data = await merchantService.getInfo(false, {
        userIdentifier: this.accountService.getUserIdentifier()
      })
      const renderData = merchantService.buildTodayRenderData(data)

      const image = await renderModuleTemplate(
        this.e,
        'rocom',
        'render/yuanxing-shangren/today',
        {
          saveId: `merchant-today-${this.e.user_id}-${Date.now()}`,
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

      await replyLargeText(this, '今日远行商人', merchantService.buildTodayFallbackText(data))
      return true
    } catch (error) {
      logger.error('[WeGame-plugin][rocom] 今日远行商人信息查询失败', error)
      await this.reply(`今日远行商人信息查询失败：${error.message || error}`)
      return true
    }
  }

  async queryActivitiesInfo () {
    try {
      await this.reply('正在查询活动日历...')
      const data = await activitiesService.getInfo(false, {
        userIdentifier: this.accountService.getUserIdentifier()
      })
      const renderData = activitiesService.buildRenderData(data)

      const image = await renderModuleTemplate(
        this.e,
        'rocom',
        'render/activities/index',
        {
          saveId: `activities-${this.e.user_id}-${Date.now()}`,
          ...renderData
        },
        {
          retType: 'base64',
          beforeRender: ({ data }) => this.withActivitiesAssets(data)
        }
      )

      if (image) {
        await this.reply(image)
        return true
      }

      await replyLargeText(this, '活动日历', activitiesService.buildFallbackText(data))
      return true
    } catch (error) {
      logger.error('[WeGame-plugin][rocom] 活动日历查询失败', error)
      await this.reply(`活动日历查询失败：${error.message || error}`)
      return true
    }
  }

  async updateModule () {
    if (updating) {
      await this.reply('当前已有更新任务进行中，请稍后再试。')
      return true
    }

    updating = true
    try {
      const fs = await import('node:fs')
      if (!fs.existsSync(path.join(moduleRoot, '.git'))) {
        await this.reply('当前模块目录不是 Git 仓库，无法更新。')
        return true
      }

      await this.reply('正在更新洛克王国世界模块...')
      const branch = await getGitBranch()
      const beforeHead = await getGitHead()

      let pullResult
      try {
        pullResult = await execModuleGit(['pull', '--ff-only'])
      } catch (error) {
        await this.reply(`更新失败：${getGitErrorMessage(error)}`)
        return true
      }

      const afterHead = await getGitHead()
      const updatedAt = await getGitCommitTime()
      const output = [pullResult?.stdout, pullResult?.stderr].filter(Boolean).join('\n').trim()
      const updated = beforeHead && afterHead
        ? beforeHead !== afterHead
        : !/already up[- ]to[- ]date|已经是最新/i.test(output)

      const lines = [
        updated ? '洛克王国世界 模块更新成功' : '洛克王国世界 模块已是最新'
      ]
      if (branch) lines.push(`分支：${branch}`)
      lines.push(`提交：${formatCommit({ updated, beforeHead, afterHead })}`)
      if (updatedAt) lines.push(`最后提交时间：${updatedAt}`)

      await this.reply(lines.join('\n'))
      if (updated) {
        setTimeout(() => new Restart(this.e).restart(), 2000)
      }
      return true
    } catch (error) {
      logger.error('[WeGame-plugin][rocom] 模块更新失败', error)
      await this.reply(`更新失败：${error.message || error}`)
      return true
    } finally {
      updating = false
    }
  }

  async forceUpdateModule () {
    if (updating) {
      await this.reply('当前已有更新任务进行中，请稍后再试。')
      return true
    }

    updating = true
    try {
      const fs = await import('node:fs')
      if (!fs.existsSync(path.join(moduleRoot, '.git'))) {
        await this.reply('当前模块目录不是 Git 仓库，无法更新。')
        return true
      }

      await this.reply('正在强制更新洛克王国世界模块...')
      const branch = await getGitBranch()
      const beforeHead = await getGitHead()
      const remoteRef = `origin/${branch || 'main'}`

      try {
        await execModuleGit(['fetch', 'origin'])
      } catch (error) {
        await this.reply(`拉取远程失败：${getGitErrorMessage(error)}`)
        return true
      }

      try {
        await execModuleGit(['reset', '--hard', remoteRef])
      } catch (error) {
        await this.reply(`强制重置失败：${getGitErrorMessage(error)}`)
        return true
      }

      const afterHead = await getGitHead()
      const updatedAt = await getGitCommitTime()
      const updated = beforeHead !== afterHead

      const lines = [
        updated ? '洛克王国世界 模块强制更新成功' : '洛克王国世界 模块已是最新'
      ]
      if (branch) lines.push(`分支：${branch}`)
      lines.push(`提交：${formatCommit({ updated, beforeHead, afterHead })}`)
      if (updatedAt) lines.push(`最后提交时间：${updatedAt}`)

      await this.reply(lines.join('\n'))
      if (updated) {
        setTimeout(() => new Restart(this.e).restart(), 2000)
      }
      return true
    } catch (error) {
      logger.error('[WeGame-plugin][rocom] 模块强制更新失败', error)
      await this.reply(`强制更新失败：${error.message || error}`)
      return true
    } finally {
      updating = false
    }
  }

  withActivitiesAssets (data = {}) {
    return {
      ...data,
      activities: (data.activities || []).map((item) => ({
        ...item,
        cover: String(item?.cover || '').trim()
      }))
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
