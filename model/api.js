import WeGameApi from '../../../model/api.js'

const DEFAULT_INGAME_WAIT_MS = 5000
const DEFAULT_INGAME_TASK_TIMEOUT_MS = 5 * 60 * 1000
const DEFAULT_INGAME_TASK_INTERVAL_MS = 3000
const DEFAULT_INGAME_HOME_TASK_TIMEOUT_MS = 3 * 60 * 1000
const DEFAULT_INGAME_HOME_HTTP_TIMEOUT_MS = 10000
const DEFAULT_INGAME_HOME_TASK_INTERVAL_MS = 5000

function sleep (ms = 0) {
  if (global.Bot?.sleep) {
    return Bot.sleep(ms)
  }

  return new Promise((resolve) => setTimeout(resolve, ms))
}

function trimText (value = '') {
  return String(value || '').trim()
}

function normalizeTaskStatus (value = '') {
  return trimText(value).toLowerCase()
}

function isPlainObject (value) {
  return value && typeof value === 'object' && !Array.isArray(value)
}

function trimObject (payload = {}) {
  if (!isPlainObject(payload)) return {}

  return Object.fromEntries(
    Object.entries(payload).filter(([, value]) => value !== undefined && value !== null && value !== '')
  )
}

function normalizeIngameMethod (value = '') {
  return trimText(value).toLowerCase() === 'get' ? 'get' : 'post'
}

function isIngameTaskPayload (payload = {}) {
  return Boolean(payload && typeof payload === 'object' && trimText(payload.task_id || payload.taskId))
}

function isPendingTaskStatus (status = '') {
  return ['queued', 'pending', 'running', 'processing', 'accepted'].includes(normalizeTaskStatus(status))
}

function isFailedTaskStatus (status = '') {
  return ['failed', 'error', 'timeout', 'cancelled', 'canceled'].includes(normalizeTaskStatus(status))
}

function isCompletedGatewayPayload (payload = {}) {
  if (!payload || typeof payload !== 'object') return false
  if (Array.isArray(payload.rows)) return true
  if (trimText(payload.title)) return true
  if (payload.source !== undefined) return true
  if (payload.home_info !== undefined) return true
  return false
}

function isCompletedTaskStatus (status = '') {
  return ['done', 'success', 'succeeded', 'completed', 'finished'].includes(normalizeTaskStatus(status))
}

function extractCompletedTaskPayload (payload = {}) {
  if (!payload || typeof payload !== 'object') return null
  if (isCompletedGatewayPayload(payload)) return payload
  if (isCompletedGatewayPayload(payload.result)) return payload.result
  if (isCompletedGatewayPayload(payload.data)) return payload.data
  return null
}

function extractTaskErrorMessage (payload = {}, fallbackStatus = '') {
  if (!payload || typeof payload !== 'object') {
    return trimText(fallbackStatus) || 'failed'
  }

  const candidates = [
    payload.message,
    payload.error,
    payload.error_message,
    payload.errorMessage,
    payload.reason,
    payload.detail,
    payload.result?.message,
    payload.result?.error,
    payload.result?.error_message,
    payload.result?.errorMessage,
    payload.result?.reason,
    payload.data?.message,
    payload.data?.error,
    payload.data?.error_message,
    payload.data?.errorMessage,
    payload.data?.reason
  ]

  for (const candidate of candidates) {
    const text = trimText(candidate)
    if (text && text !== 'failed') return text
  }

  return trimText(payload.status || fallbackStatus) || 'failed'
}

async function notifyIngameQueued (payload = {}, options = {}) {
  if (typeof options.onQueued !== 'function') return

  try {
    await options.onQueued({
      taskId: trimText(payload.task_id || payload.taskId),
      status: normalizeTaskStatus(payload.status),
      payload
    })
  } catch (error) {
    global.logger?.warn?.(`[WeGame-plugin][rocom] Ingame 排队提示发送失败：${error.message || error}`)
  }
}

function buildScopedPayload (api, userIdentifier = '', payload = {}) {
  const scoped = api.buildOptionalUserScopeOptions(userIdentifier)
  return {
    headers: isPlainObject(scoped.headers) ? scoped.headers : {},
    payload: {
      ...(isPlainObject(scoped.params) ? scoped.params : {}),
      ...(isPlainObject(payload) ? payload : {})
    }
  }
}

function buildScopedOptions (api, userIdentifier = '', params = {}) {
  const scoped = api.buildOptionalUserScopeOptions(userIdentifier)
  return {
    headers: isPlainObject(scoped.headers) ? scoped.headers : {},
    params: {
      ...(isPlainObject(scoped.params) ? scoped.params : {}),
      ...(isPlainObject(params) ? params : {})
    }
  }
}

export default class RocomApi extends WeGameApi {
  requestRocomGet (urlPath, frameworkToken, params = {}, requestOptions = {}) {
    const scoped = buildScopedPayload(this, requestOptions.userIdentifier, params)
    return this.request(urlPath, {
      method: 'get',
      params: scoped.payload,
      headers: {
        Accept: 'application/json',
        ...this.buildFrameworkHeaders(frameworkToken),
        ...scoped.headers
      },
      needBaseAuth: true
    })
  }

  requestRocomPublicGet (urlPath, params = {}, requestOptions = {}) {
    const scoped = buildScopedPayload(this, requestOptions.userIdentifier, params)
    return this.request(urlPath, {
      method: 'get',
      params: scoped.payload,
      headers: {
        Accept: 'application/json',
        ...scoped.headers
      },
      timeout: requestOptions.timeout,
      needBaseAuth: true
    })
  }

  requestRocomPublicPost (urlPath, data = {}, requestOptions = {}) {
    const scoped = buildScopedOptions(this, requestOptions.userIdentifier, requestOptions.params)
    return this.request(urlPath, {
      method: 'post',
      params: scoped.params,
      data: isPlainObject(data) ? data : {},
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        ...scoped.headers
      },
      timeout: requestOptions.timeout,
      needBaseAuth: true
    })
  }

  async requestRocomPublicRawGet (urlPath, params = {}, requestOptions = {}) {
    let response
    const scoped = buildScopedPayload(this, requestOptions.userIdentifier, params)

    try {
      response = await this.client.request({
        url: `${this.getBaseUrl()}${urlPath}`,
        method: 'get',
        params: {
          device_fingerprint: this.getDeviceFingerprint(),
          ...scoped.payload
        },
        headers: {
          Accept: 'application/json',
          ...this.getDeviceHeaders(),
          ...scoped.headers,
          ...(await this.getBaseAuthHeaders())
        }
      })
    } catch (error) {
      throw new Error(error?.message || '请求失败')
    }

    const body = response.data

    if (response.status >= 400) {
      throw new Error(body?.message || response.statusText || `请求失败：HTTP ${response.status}`)
    }

    if (body && typeof body === 'object' && Object.prototype.hasOwnProperty.call(body, 'code')) {
      if (Number(body.code) !== 0) {
        throw new Error(body.message || `请求失败：业务码 ${body.code}`)
      }
      return body.data ?? {}
    }

    return body
  }

  async requestRocomIngameGet (urlPath, params = {}, options = {}) {
    const payload = await this.requestRocomPublicGet(urlPath, {
      wait_ms: Number(options.waitMs ?? DEFAULT_INGAME_WAIT_MS) || DEFAULT_INGAME_WAIT_MS,
      ...params
    }, {
      userIdentifier: options.userIdentifier,
      timeout: options.httpTimeoutMs
    })

    return this.resolveIngameTask(payload, options)
  }

  async requestRocomIngamePost (urlPath, data = {}, options = {}) {
    const payload = await this.requestRocomPublicPost(urlPath, {
      wait_ms: Number(options.waitMs ?? DEFAULT_INGAME_WAIT_MS) || DEFAULT_INGAME_WAIT_MS,
      ...data
    }, {
      userIdentifier: options.userIdentifier,
      timeout: options.httpTimeoutMs
    })

    return this.resolveIngameTask(payload, options)
  }

  async getIngameTask (taskId = '', options = {}) {
    const normalizedTaskId = trimText(taskId)
    if (!normalizedTaskId) {
      throw new Error('缺少 Ingame 任务 ID')
    }

    return this.requestRocomPublicGet(`/api/v1/games/rocom/ingame/tasks/${encodeURIComponent(normalizedTaskId)}`, {}, {
      userIdentifier: options.userIdentifier,
      timeout: options.taskHttpTimeoutMs ?? options.httpTimeoutMs
    })
  }

  async resolveIngameTask (payload = {}, options = {}) {
    const initialCompletedPayload = extractCompletedTaskPayload(payload)
    if (initialCompletedPayload) {
      return initialCompletedPayload
    }

    if (!isIngameTaskPayload(payload)) {
      return payload
    }

    const taskId = trimText(payload.task_id || payload.taskId)
    await notifyIngameQueued(payload, options)

    const timeoutMs = Math.max(1000, Number(options.timeoutMs ?? DEFAULT_INGAME_TASK_TIMEOUT_MS) || DEFAULT_INGAME_TASK_TIMEOUT_MS)
    const intervalMs = Math.max(300, Number(options.intervalMs ?? DEFAULT_INGAME_TASK_INTERVAL_MS) || DEFAULT_INGAME_TASK_INTERVAL_MS)
    const startedAt = Date.now()
    let lastStatus = normalizeTaskStatus(payload.status)

    while (Date.now() - startedAt < timeoutMs) {
      if (lastStatus && isFailedTaskStatus(lastStatus)) {
        throw new Error(`Ingame 任务失败：${extractTaskErrorMessage(payload, lastStatus)}`)
      }

      if (lastStatus && !isPendingTaskStatus(lastStatus)) {
        break
      }

      await sleep(intervalMs)

      const taskPayload = await this.getIngameTask(taskId, options)
      const completedPayload = extractCompletedTaskPayload(taskPayload)
      if (completedPayload) {
        return completedPayload
      }

      lastStatus = normalizeTaskStatus(taskPayload.status)
      if (lastStatus && isFailedTaskStatus(lastStatus)) {
        throw new Error(`Ingame 任务失败：${extractTaskErrorMessage(taskPayload, lastStatus)}`)
      }

      if (isCompletedTaskStatus(lastStatus)) {
        const nestedPayload = extractCompletedTaskPayload(taskPayload.result || taskPayload.data)
        if (nestedPayload) return nestedPayload
        throw new Error(`Ingame 任务已完成但未返回可解析结果：${taskId}`)
      }

      if (!isIngameTaskPayload(taskPayload) && !lastStatus) {
        return taskPayload
      }
    }

    throw new Error(`Ingame 任务等待超时：${taskId}`)
  }

  getAccounts (userIdentifier, params = {}) {
    const scoped = this.buildUserScopeOptions(userIdentifier)
    return this.request('/api/v1/games/rocom/accounts', {
      method: 'get',
      headers: {
        Accept: 'application/json',
        ...scoped.headers
      },
      params: {
        ...(isPlainObject(scoped.params) ? scoped.params : {}),
        ...(isPlainObject(params) ? params : {})
      }
    })
  }

  searchPlayer (uid, options = {}) {
    const request = normalizeIngameMethod(options.method) === 'get'
      ? this.requestRocomIngameGet.bind(this)
      : this.requestRocomIngamePost.bind(this)

    return request('/api/v1/games/rocom/ingame/player/search', {
      uid
    }, options)
  }

  getIngameMerchantInfo (shopId = undefined, options = {}) {
    const request = normalizeIngameMethod(options.method) === 'get'
      ? this.requestRocomIngameGet.bind(this)
      : this.requestRocomIngamePost.bind(this)

    return request('/api/v1/games/rocom/ingame/merchant/info', trimObject({
      shop_id: shopId
    }), options)
  }

  getIngameHomeInfo (uid, options = {}) {
    const request = normalizeIngameMethod(options.method) === 'post'
      ? this.requestRocomIngamePost.bind(this)
      : this.requestRocomIngameGet.bind(this)

    return request('/api/v1/games/rocom/ingame/home/info', {
      uid
    }, {
      waitMs: 5000,
      httpTimeoutMs: DEFAULT_INGAME_HOME_HTTP_TIMEOUT_MS,
      taskHttpTimeoutMs: DEFAULT_INGAME_HOME_HTTP_TIMEOUT_MS,
      intervalMs: DEFAULT_INGAME_HOME_TASK_INTERVAL_MS,
      timeoutMs: DEFAULT_INGAME_HOME_TASK_TIMEOUT_MS,
      ...options
    })
  }

  getIngameHealth () {
    return this.requestRocomPublicRawGet('/api/v1/games/rocom/ingame/health')
  }

  getRoleProfile (frameworkToken, params = {}, options = {}) {
    return this.requestRocomGet('/api/v1/games/rocom/profile/role', frameworkToken, params, options)
  }

  getProfileEvaluation (frameworkToken, params = {}, options = {}) {
    return this.requestRocomGet('/api/v1/games/rocom/profile/evaluation', frameworkToken, params, options)
  }

  getPetSummary (frameworkToken, params = {}, options = {}) {
    return this.requestRocomGet('/api/v1/games/rocom/profile/pet-summary', frameworkToken, params, options)
  }

  getCollection (frameworkToken, params = {}, options = {}) {
    return this.requestRocomGet('/api/v1/games/rocom/profile/collection', frameworkToken, params, options)
  }

  getBattleOverview (frameworkToken, params = {}, options = {}) {
    return this.requestRocomGet('/api/v1/games/rocom/profile/battle-overview', frameworkToken, params, options)
  }

  getBattleList (frameworkToken, params = {}, options = {}) {
    return this.requestRocomGet('/api/v1/games/rocom/battle/list', frameworkToken, params, options)
  }

  getBattlePets (frameworkToken, params = {}, options = {}) {
    return this.requestRocomGet('/api/v1/games/rocom/battle/pets', frameworkToken, params, options)
  }

  getPetList (params = {}, options = {}) {
    return this.requestRocomPublicGet('/api/v1/games/rocom/pet/list', params, options)
  }

  getPetDetail (params = {}, options = {}) {
    return this.requestRocomPublicGet('/api/v1/games/rocom/pet/detail', params, options)
  }

  getPetSkillUsers (params = {}, options = {}) {
    return this.requestRocomPublicGet('/api/v1/games/rocom/pet/skill-users', params, options)
  }

  getPetSizeQuery (params = {}, options = {}) {
    return this.requestRocomPublicGet('/api/v1/games/rocom/pet/size-query', params, options)
  }

  getMerchantInfo (params = {}, options = {}) {
    return this.requestRocomPublicGet('/api/v1/games/rocom/merchant/info', params, options)
  }

  getLineupList (frameworkToken, params = {}, options = {}) {
    return this.requestRocomGet('/api/v1/games/rocom/lineup/list', frameworkToken, params, options)
  }

  getExchangePosters (frameworkToken, params = {}, options = {}) {
    return this.requestRocomGet('/api/v1/games/rocom/exchange/posters', frameworkToken, params, options)
  }

  getFriendship (frameworkToken, params = {}, options = {}) {
    return this.requestRocomGet('/api/v1/games/rocom/social/friendship', frameworkToken, params, options)
  }

  getStudentState (frameworkToken, params = {}, options = {}) {
    return this.requestRocomGet('/api/v1/games/rocom/activity/student-state', frameworkToken, params, options)
  }

  getActivityPerks (frameworkToken, params = {}, options = {}) {
    return this.requestRocomGet('/api/v1/games/rocom/activity/perks', frameworkToken, params, options)
  }

  syncConfig (data = {}, options = {}) {
    return this.requestRocomPublicPost('/api/v1/games/rocom/config/sync', data, options)
  }

  getAnnouncementList (params = {}, options = {}) {
    return this.requestRocomPublicGet('/api/v1/games/rocom/announcement/list', params, options)
  }

  getLatestAnnouncement (params = {}, options = {}) {
    return this.requestRocomPublicGet('/api/v1/games/rocom/announcement/latest', params, options)
  }

  getAnnouncementDetail (threadIdOrParams, options = {}) {
    const params = isPlainObject(threadIdOrParams)
      ? threadIdOrParams
      : { thread_id: threadIdOrParams }

    return this.requestRocomPublicGet('/api/v1/games/rocom/announcement/detail', params, options)
  }
}
