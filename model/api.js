import WeGameApi from '../../../model/api.js'

const GAME_CODE = 'rocom'

export default class RocomApi extends WeGameApi {
  requestRocomGet (urlPath, frameworkToken, params = {}) {
    return this.requestGameFrameworkGet(urlPath, frameworkToken, GAME_CODE, params)
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

  getBattlePets (frameworkToken, params = {}) {
    return this.requestRocomGet('/api/v1/games/rocom/battle/pets', frameworkToken, params)
  }
}
