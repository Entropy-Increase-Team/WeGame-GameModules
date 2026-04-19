import WeGameApi from '../../../model/api.js'

const GAME_CODE = 'rocom'

export default class RocomApi extends WeGameApi {
  requestRocomGet (urlPath, frameworkToken, params = {}) {
    return this.requestGameFrameworkGet(urlPath, frameworkToken, GAME_CODE, params)
  }

  requestRocomPublicGet (urlPath, params = {}) {
    return this.request(urlPath, {
      method: 'get',
      params,
      needBaseAuth: true
    })
  }

  getAccounts (userIdentifier, params = {}) {
    return this.requestUserScopedGet('/api/v1/games/rocom/accounts', userIdentifier, params)
  }

  getRoleProfile (frameworkToken, params = {}) {
    return this.requestRocomGet('/api/v1/games/rocom/profile/role', frameworkToken, params)
  }

  getProfileEvaluation (frameworkToken, params = {}) {
    return this.requestRocomGet('/api/v1/games/rocom/profile/evaluation', frameworkToken, params)
  }

  getPetSummary (frameworkToken, params = {}) {
    return this.requestRocomGet('/api/v1/games/rocom/profile/pet-summary', frameworkToken, params)
  }

  getCollection (frameworkToken, params = {}) {
    return this.requestRocomGet('/api/v1/games/rocom/profile/collection', frameworkToken, params)
  }

  getBattleOverview (frameworkToken, params = {}) {
    return this.requestRocomGet('/api/v1/games/rocom/profile/battle-overview', frameworkToken, params)
  }

  getBattleList (frameworkToken, params = {}) {
    return this.requestRocomGet('/api/v1/games/rocom/battle/list', frameworkToken, params)
  }

  getBattlePets (frameworkToken, params = {}) {
    return this.requestRocomGet('/api/v1/games/rocom/battle/pets', frameworkToken, params)
  }

  getPetSizeQuery (params = {}) {
    return this.requestRocomPublicGet('/api/v1/games/rocom/pet/size-query', params)
  }

  getMerchantInfo (params = {}) {
    return this.requestRocomPublicGet('/api/v1/games/rocom/merchant/info', params)
  }

  getLineupList (frameworkToken, params = {}) {
    return this.requestRocomGet('/api/v1/games/rocom/lineup/list', frameworkToken, params)
  }

  getExchangePosters (frameworkToken, params = {}) {
    return this.requestRocomGet('/api/v1/games/rocom/exchange/posters', frameworkToken, params)
  }
}
