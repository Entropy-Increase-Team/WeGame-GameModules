import WeGameApi from '../../../model/api.js'
import Config from '../../../utils/config.js'
import { trimText } from '../utils/rocom.js'

const ROCOM_DEFAULT_BASE_URL = 'https://wegame.shallow.ink'
const ROCOM_DEFAULT_API_KEY = 'sk-fd65b3f4e2b7c7ac26aaaf4ae8a2f61e'
const DEFAULT_INGAME_WAIT_MS = 5000
const DEFAULT_INGAME_TASK_TIMEOUT_MS = 5 * 60 * 1000
const DEFAULT_INGAME_TASK_INTERVAL_MS = 3000
const DEFAULT_INGAME_HOME_TASK_TIMEOUT_MS = 3 * 60 * 1000
const DEFAULT_INGAME_HOME_HTTP_TIMEOUT_MS = 15000
const DEFAULT_INGAME_HOME_TASK_INTERVAL_MS = 5000

function sleep (ms = 0) {
  if (global.Bot?.sleep) {
    return Bot.sleep(ms)
  }

  return new Promise((resolve) => setTimeout(resolve, ms))
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
  // 新响应格式：不再返回 rows，而是直接给出结构化业务对象
  if (payload.player_info !== undefined) return true
  if (payload.player_card_brief_info !== undefined) return true
  if (payload.academy_career_snapshot !== undefined) return true
  // ingame 商店：{ shop, goods } 结构
  if (Array.isArray(payload.goods) && payload.shop !== undefined) return true
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
  getBaseUrl () {
    const configuredBaseUrl = trimText(Config.get('wegame', 'base_url')).replace(/\/+$/, '')
    return configuredBaseUrl || ROCOM_DEFAULT_BASE_URL
  }

  getRocomApiKey () {
    return trimText(Config.get('wegame', 'api_key')) || ROCOM_DEFAULT_API_KEY
  }

  /**
   * 把接口返回的资源地址补全成可直接访问的绝对地址。
   * 新响应里名片地址是 relative/api/v1/resources/... 形式，需要拼上 base_url。
   */
  resolveResourceUrl (value = '') {
    const text = trimText(value)
    if (!text) return ''
    if (/^https?:\/\//i.test(text)) return text
    if (text.startsWith('//')) return `https:${text}`

    const path = text
      .replace(/^relative\//i, '')
      .replace(/^\/+/, '')

    if (!path) return ''

    return `${this.getBaseUrl()}/${path}`
  }

  getApiKey () {
    return this.getRocomApiKey()
  }

  async getBaseAuthHeaders () {
    return { 'X-API-Key': this.getRocomApiKey() }
  }

  buildOptionalUserScopeOptions (userIdentifier) {
    const normalized = trimText(userIdentifier)
    if (!normalized) return {}

    return {
      headers: {
        'X-User-Identifier': normalized,
        ...this.getClientScopeHeaders()
      },
      params: {
        user_identifier: normalized,
        ...this.getClientScopeParams()
      }
    }
  }

  buildUserScopeOptions (userIdentifier) {
    const normalized = trimText(userIdentifier)
    if (!normalized) {
      throw new Error('缺少 user_identifier')
    }

    return {
      headers: {
        'X-API-Key': this.getRocomApiKey(),
        'X-User-Identifier': normalized,
        ...this.getClientScopeHeaders()
      },
      params: {
        user_identifier: normalized,
        ...this.getClientScopeParams()
      }
    }
  }

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

  /**
   * 返回完整响应信封（不剥掉 data 之外的同级字段），用于 goods_mapping 这类
   * 挂在 data 之外的补充数据。
   */
  async requestRocomRawEnvelope (urlPath, options = {}) {
    const method = trimText(options.method).toLowerCase() === 'post' ? 'post' : 'get'
    const scoped = buildScopedPayload(this, options.userIdentifier, options.params)
    const fingerprint = this.getDeviceFingerprint()
    const body = isPlainObject(options.data) ? options.data : {}

    let response
    try {
      response = await this.client.request({
        url: `${this.getBaseUrl()}${urlPath}`,
        method,
        params: {
          device_fingerprint: fingerprint,
          ...scoped.payload
        },
        ...(method === 'post'
          ? {
              data: {
                device_fingerprint: fingerprint,
                ...body
              }
            }
          : {}),
        headers: {
          Accept: 'application/json',
          ...(method === 'post' ? { 'Content-Type': 'application/json' } : {}),
          ...this.getDeviceHeaders(),
          ...scoped.headers,
          ...(await this.getBaseAuthHeaders())
        },
        ...(Number.isFinite(Number(options.timeout)) && Number(options.timeout) > 0
          ? { timeout: Number(options.timeout) }
          : {})
      })
    } catch (error) {
      throw new Error(error?.message || '请求失败')
    }

    const payload = response.data

    if (response.status >= 400) {
      throw new Error(payload?.message || response.statusText || `请求失败：HTTP ${response.status}`)
    }

    if (payload && typeof payload === 'object' && Object.prototype.hasOwnProperty.call(payload, 'code')) {
      if (Number(payload.code) !== 0) {
        throw new Error(payload.message || `请求失败：业务码 ${payload.code}`)
      }
    }

    return payload
  }

  /** 把信封上 data 之外的补充字段并进 data，例如商店接口的 goods_mapping */
  attachEnvelopeExtras (envelope = {}) {
    const data = isPlainObject(envelope?.data) ? { ...envelope.data } : {}

    if (Array.isArray(envelope?.goods_mapping)) {
      data.goods_mapping = envelope.goods_mapping
    }

    return data
  }

  async requestRocomPublicRawGet (urlPath, params = {}, requestOptions = {}) {
    const envelope = await this.requestRocomRawEnvelope(urlPath, {
      method: 'get',
      params,
      userIdentifier: requestOptions.userIdentifier,
      timeout: requestOptions.timeout
    })

    // 与改造前保持一致：有 code 信封时取 data，否则原样返回整个响应体
    if (isPlainObject(envelope) && Object.prototype.hasOwnProperty.call(envelope, 'code')) {
      return envelope.data ?? {}
    }

    return envelope
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

    // 允许调用方自定义任务查询（例如需要保留信封上的 goods_mapping）
    if (typeof options.fetchTask === 'function') {
      return options.fetchTask(normalizedTaskId)
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

  getPlayerCard (uid, options = {}) {
    const request = normalizeIngameMethod(options.method) === 'post'
      ? this.requestRocomIngamePost.bind(this)
      : this.requestRocomIngameGet.bind(this)

    return request('/api/v1/games/rocom/ingame/player/card', {
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

  /**
   * 实时商店信息：走完整信封请求以保留 data 之外的 goods_mapping，
   * 同时兼容异步任务结果（202 + task_id 时轮询任务）。
   */
  async getIngameMerchantInfoRealtime (shopId = undefined, options = {}) {
    const method = normalizeIngameMethod(options.method) === 'post' ? 'post' : 'get'
    const shopParams = trimObject({ shop_id: shopId })

    const envelope = await this.requestRocomRawEnvelope('/api/v1/games/rocom/ingame/merchant/info', {
      method,
      params: {
        wait_ms: Number(options.waitMs ?? DEFAULT_INGAME_WAIT_MS) || DEFAULT_INGAME_WAIT_MS,
        ...shopParams
      },
      data: shopParams,
      userIdentifier: options.userIdentifier,
      timeout: options.httpTimeoutMs
    })

    const payload = this.attachEnvelopeExtras(envelope)

    return this.resolveIngameTask(payload, {
      waitMs: DEFAULT_INGAME_WAIT_MS,
      httpTimeoutMs: DEFAULT_INGAME_HOME_HTTP_TIMEOUT_MS,
      taskHttpTimeoutMs: DEFAULT_INGAME_HOME_HTTP_TIMEOUT_MS,
      intervalMs: DEFAULT_INGAME_HOME_TASK_INTERVAL_MS,
      timeoutMs: DEFAULT_INGAME_HOME_TASK_TIMEOUT_MS,
      ...options,
      fetchTask: async (taskId) => {
        const taskEnvelope = await this.requestRocomRawEnvelope(
          `/api/v1/games/rocom/ingame/tasks/${encodeURIComponent(taskId)}`,
          {
            method: 'get',
            userIdentifier: options.userIdentifier,
            timeout: options.taskHttpTimeoutMs ?? options.httpTimeoutMs
          }
        )

        return this.attachEnvelopeExtras(taskEnvelope)
      }
    })
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

  getIngamePetData (data = {}, options = {}) {
    const request = normalizeIngameMethod(options.method) === 'get'
      ? this.requestRocomIngameGet.bind(this)
      : this.requestRocomIngamePost.bind(this)

    return request('/api/v1/games/rocom/ingame/pet/data', trimObject(data), {
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

  getWikiPetSizeQuery (params = {}, options = {}) {
    return this.requestRocomPublicGet('/api/v1/games/rocom/wiki/pet-size/query', params, options)
  }

  getMerchantInfo (params = {}, options = {}) {
    return this.requestRocomPublicGet('/api/v1/games/rocom/merchant/info', params, options)
  }

  getActivitiesInfo (params = {}, options = {}) {
    return this.requestRocomPublicGet('/api/v1/games/rocom/activities/info', params, options)
  }

  getLineupList (frameworkToken, params = {}, options = {}) {
    return this.requestRocomGet('/api/v1/games/rocom/lineup/list', frameworkToken, params, options)
  }

  parseShareCode (data = {}, options = {}) {
    return this.requestRocomPublicPost('/api/v1/games/rocom/tools/share-code/parse', data, options)
  }

  generateShareCode (data = {}, options = {}) {
    return this.requestRocomPublicPost('/api/v1/games/rocom/tools/share-code/generate', data, options)
  }

  getShareCodeRecords (params = {}, options = {}) {
    return this.requestRocomPublicGet('/api/v1/games/rocom/tools/share-code/records', params, options)
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

  bindUid (uid, options = {}) {
    return this.requestRocomPublicPost('/api/v1/games/rocom/uid/bind', { uid }, options)
  }

  getEggGroups (options = {}) {
    return this.requestRocomPublicGet('/api/v1/games/rocom/egg/groups', {}, options)
  }

  getEggGroupPets (params = {}, options = {}) {
    return this.requestRocomPublicGet('/api/v1/games/rocom/egg/group-pets', params, options)
  }

  getEggPetGroups (params = {}, options = {}) {
    return this.requestRocomPublicGet('/api/v1/games/rocom/egg/pet-groups', params, options)
  }

  getEggExchanges (params = {}, options = {}) {
    return this.requestRocomPublicGet('/api/v1/games/rocom/community/egg-exchanges', params, options)
  }

  postEggExchange (data = {}, options = {}) {
    return this.requestRocomPublicPost('/api/v1/games/rocom/community/egg-exchanges', data, options)
  }

  getMyEggExchanges (params = {}, options = {}) {
    return this.requestRocomPublicGet('/api/v1/games/rocom/community/egg-exchanges/my', params, options)
  }

  getEggExchangeReviewStatus (postId, options = {}) {
    return this.requestRocomPublicGet(
      `/api/v1/games/rocom/community/egg-exchanges/${encodeURIComponent(postId)}/review-status`,
      {},
      options
    )
  }

  closeEggExchange (postId, data = {}, options = {}) {
    return this.requestRocomPublicPost(
      `/api/v1/games/rocom/community/egg-exchanges/${encodeURIComponent(postId)}/close`,
      data,
      options
    )
  }

  createEggExchangeSubscription (data = {}, options = {}) {
    return this.requestRocomPublicPost('/api/v1/games/rocom/community/egg-exchange-subscriptions', data, options)
  }

  getEggExchangeSubscriptions (params = {}, options = {}) {
    return this.requestRocomPublicGet('/api/v1/games/rocom/community/egg-exchange-subscriptions', params, options)
  }

  deleteEggExchangeSubscription (subscriptionId, options = {}) {
    const scoped = buildScopedPayload(this, options.userIdentifier, {})
    return this.request(
      `/api/v1/games/rocom/community/egg-exchange-subscriptions/${encodeURIComponent(subscriptionId)}`,
      {
        method: 'delete',
        params: scoped.payload,
        headers: {
          Accept: 'application/json',
          ...scoped.headers
        },
        needBaseAuth: true
      }
    )
  }

  getEggExchangeEvents (params = {}, options = {}) {
    return this.requestRocomPublicGet('/api/v1/games/rocom/community/egg-exchange-events', params, options)
  }
}
