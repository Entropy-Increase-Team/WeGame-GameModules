# Rocom API

本文档描述洛克王国世界（RoCom / NRC）游戏模块接口。

## 文档边界

本文档描述当前后端暴露的 RoCom 接口：

- `/api/v1/games/rocom/*`
- `/api/v1/games/rocom/ingame/*`

在调用本文件中的接口前，请先参考 [WeGame-API.md](./WeGame-API.md) 完成：

- 基础认证
- WeGame 登录或凭证导入
- `frameworkToken` 获取
- 开发者 `WeGame API Key` 创建
- `game:rocom` 对应权限申请

如果这份 `frameworkToken` 已经明确持久化为其他共享登录 provider，例如 `df`，当前接口会直接拒绝使用，避免跨游戏误用 token。

## 前置要求

当前洛克王国世界模块包含两组前缀：

- `/api/v1/games/rocom/*`
- `/api/v1/games/rocom/ingame/*`

以下认证规则主要针对非 `ingame` 接口，请先记住：

- 当前模块的大部分查询接口至少需要一种基础认证：`Authorization: Bearer <web-jwt>`、`X-Anonymous-Token`、或 `X-API-Key`
- 除了明确标注为“**不需要 `X-Framework-Token`**”的接口外，大部分游戏数据接口都需要通过 `X-Framework-Token` 指定一份已保存的 WeGame 凭证
- 如果使用 `X-API-Key`，统一使用开发者 `WeGame API Key`
- 该 API Key 还必须已经获批 `game:rocom` 下的对应权限，当前默认公开权限为 `rocom.access`
- 如果 API Key 请求使用的是按第三方用户作用域创建 / 归属的 `frameworkToken` 或绑定记录，后续请求还需要继续带同一个 `user_identifier`；可放在 query 参数，或 `X-User-Identifier` 请求头
- 如果这份 `frameworkToken` 来自 Web 授权流程，且授权请求里传过 `platform_id`，这里的 `user_identifier` 也应该和当时的 `platform_id` 保持一致
- 当前只开放 HAR 中已验证的核心查询接口
- 非 `ingame` 接口成功时，`data` 中通常会包一层上游 WeGame 响应

通用成功响应示例：

```json
{
  "code": 0,
  "message": "成功",
  "data": {
    "result": {
      "error_code": 0,
      "error_message": "WG_COMM_SUCC"
    }
  }
}
```

## RoCom / NRC Ingame 接口

这组接口统一使用：

- `/api/v1/games/rocom/ingame/*`

认证方式：

- `Authorization: Bearer <web-jwt>`
- `X-Anonymous-Token`
- `X-API-Key`

如果使用 `X-API-Key`：

- 统一使用开发者 `WeGame API Key`
- 该 API Key 仍需已获批 `game:rocom` 下的对应权限
- 当前默认公开权限为 `rocom.access`

这组接口当前不要求 `X-Framework-Token`。

### 玩家搜索

- `GET /api/v1/games/rocom/ingame/player/search?uid=<UID>`
- `POST /api/v1/games/rocom/ingame/player/search`

说明：

- 适合做玩家 UID 搜索、名片资料页、基础社交资料展示
- `GET` 使用 query 参数 `uid`
- `POST` 使用 JSON 请求体 `{"uid":123456}`
- `POST` 可选传 `wait_ms`，用于覆盖外置 gateway 默认同步等待时间

`GET /api/v1/games/rocom/ingame/player/search` 请求示例：

```http
GET /api/v1/games/rocom/ingame/player/search?uid=123456
X-API-Key: <wegame-api-key>
Accept: application/json
```

`POST /api/v1/games/rocom/ingame/player/search` 请求示例：

```http
POST /api/v1/games/rocom/ingame/player/search
Content-Type: application/json
X-API-Key: <wegame-api-key>

{"uid":123456,"wait_ms":5000}
```

同步成功响应示例，HTTP `200`：

```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "source": "live",
    "title": "[0x02A5] FriendSearchRsp - ZoneFriendSearchPlayerRsp",
    "rows": [
      {
        "level": 0,
        "field": "ret_info",
        "label": "返回码",
        "value": "(RetInfo, 2B)"
      },
      {
        "level": 1,
        "field": "ret_code",
        "label": "返回码",
        "value": "0"
      },
      {
        "level": 1,
        "field": "uin",
        "label": "用户ID",
        "value": "123456"
      },
      {
        "level": 1,
        "field": "name",
        "label": "昵称",
        "value": "'一二三四五六'"
      },
      {
        "level": 1,
        "field": "level",
        "label": "等级",
        "value": "48"
      },
      {
        "level": 1,
        "field": "signature",
        "label": "个性签名",
        "value": "'大柚子'"
      }
    ],
    "notes": [
      "unlocked_rel_node_num          已解锁关系节点 0",
      "(外层/未知字段 1 个，已跳过)"
    ],
    "meta": {}
  }
}
```

字段补充：

- `source`：结果来源，可能是 `live` 或 `cache`
- `title`：当前查询标题
- `rows`：结构化字段列表，适合前端直接按表格或树形结构渲染
- `notes`：附加说明
- `meta`：外置 gateway 返回的附加元信息
- `rows[].level`：层级深度
- `rows[].field`：字段名
- `rows[].label`：字段中文名
- `rows[].value`：字段值

### 商店信息

- `GET /api/v1/games/rocom/ingame/merchant/info?shop_id=<SHOP_ID>`
- `POST /api/v1/games/rocom/ingame/merchant/info`

说明：

- 适合做远行商人页、商店商品列表、刷新时间展示
- `GET` 使用 query 参数 `shop_id`
- `POST` 使用 JSON 请求体 `{"shop_id":3019}`
- `POST` 可选传 `wait_ms`，用于覆盖外置 gateway 默认同步等待时间

`GET /api/v1/games/rocom/ingame/merchant/info` 请求示例：

```http
GET /api/v1/games/rocom/ingame/merchant/info?shop_id=3019
X-API-Key: <wegame-api-key>
Accept: application/json
```

`POST /api/v1/games/rocom/ingame/merchant/info` 请求示例：

```http
POST /api/v1/games/rocom/ingame/merchant/info
Content-Type: application/json
X-API-Key: <wegame-api-key>

{"shop_id":3019,"wait_ms":5000}
```

同步成功响应示例，HTTP `200`：

```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "source": "live",
    "title": "商店查询结果 - shop_id=3019",
    "rows": [
      {
        "level": 0,
        "field": "shop_id",
        "label": "商店ID",
        "value": "3019"
      },
      {
        "level": 0,
        "field": "ret_code",
        "label": "返回码",
        "value": "0"
      },
      {
        "level": 0,
        "field": "goods_count",
        "label": "商品数量",
        "value": "1"
      },
      {
        "level": 1,
        "field": "goods_id",
        "label": "商品ID",
        "value": "67005"
      },
      {
        "level": 1,
        "field": "next_refresh_time",
        "label": "下次刷新时间",
        "value": "1776830400 (2026-04-22 12:00:00 CST)"
      },
      {
        "level": 1,
        "field": "real_price",
        "label": "现价",
        "value": "6000"
      }
    ],
    "notes": [],
    "meta": {}
  }
}
```

### 任务状态

- `GET /api/v1/games/rocom/ingame/tasks/{task_id}`

说明：

- 玩家搜索或商店查询返回 HTTP `202` 时，使用返回的 `task_id` 查询异步任务状态
- 任务完成后，返回结构仍然是外置 gateway 的统一 JSON 响应

请求示例：

```http
GET /api/v1/games/rocom/ingame/tasks/tsk_xxx
X-API-Key: <wegame-api-key>
Accept: application/json
```

### Ingame 返回规则

同步成功，HTTP `200`：

```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "source": "cache",
    "title": "...",
    "rows": [],
    "notes": [],
    "meta": {}
  }
}
```

排队中，HTTP `202`：

```json
{
  "code": 0,
  "message": "accepted",
  "data": {
    "task_id": "tsk_xxx",
    "status": "queued"
  }
}
```

未授权，HTTP `401`：

```json
{
  "code": 4010,
  "message": "unauthorized",
  "data": null
}
```

外置 worker 查询失败，HTTP `500`：

```json
{
  "code": 5001,
  "message": "具体错误信息",
  "data": null
}
```

### 账号列表

- `GET /api/v1/games/rocom/accounts`

说明：

- 返回当前调用者在 `rocom` 组件下能成功识别出的账号列表
- 实现方式是先读取当前用户的 WeGame 绑定列表，再逐个查询 RoCom 角色资料
- 只有成功读取到角色资料的绑定才会出现在结果里
- `GET /api/v1/games/rocom/accounts` 基于已保存绑定工作，**不需要** `X-Framework-Token`
- Web 用户直接带 `Authorization: Bearer <web-jwt>` 即可
- API Key 调用时需要额外带 `user_identifier`，可放在 query 参数或 `X-User-Identifier` 请求头
- 当前账号列表接口不支持匿名令牌
- 支持可选查询参数 `account_type`

响应示例：

```json
{
  "code": 0,
  "message": "成功",
  "data": {
    "accounts": [
      {
        "binding": {
          "id": "67f12d2f4436d8d0d82f8b61",
          "framework_token": "4c52b50d-2b5f-47fb-9a1f-8b0c76f76c67",
          "token_type": "wegame",
          "login_type": "qq",
          "credential_provider": "rocom",
          "client_type": "web",
          "tgp_id": "295231685",
          "is_primary": true,
          "is_valid": true,
          "created_at": "2026-04-05T22:10:00+08:00",
          "updated_at": "2026-04-05T22:12:00+08:00"
        },
        "role": {
          "avatar": "1001009",
          "avatar_url": "https://jsonschema.qpic.cn/v1_/rb5/4c8194c8827d8b6c81de052a9409800f.png",
          "background_url": "https://photo-prod.nrc.qq.com/704693375/card/3302501774819218804",
          "create_time": "1774482937",
          "enroll_days": 12,
          "id": "704693375",
          "is_online": 0,
          "level": 52,
          "name": "BvzRays",
          "openid": "2153985996166641979",
          "star": 4,
          "star_name": "精灵博学者"
        },
        "data": {
          "result": {
            "error_code": 0,
            "error_message": "WG_COMM_SUCC"
          },
          "role": {
            "avatar": "1001009",
            "avatar_url": "https://jsonschema.qpic.cn/v1_/rb5/4c8194c8827d8b6c81de052a9409800f.png",
            "background_url": "https://photo-prod.nrc.qq.com/704693375/card/3302501774819218804",
            "create_time": "1774482937",
            "enroll_days": 12,
            "id": "704693375",
            "is_online": 0,
            "level": 52,
            "name": "BvzRays",
            "openid": "2153985996166641979",
            "star": 4,
            "star_name": "精灵博学者"
          }
        }
      }
    ],
    "total": 1,
    "bindings_total": 2
  }
}
```

### 角色资料

- `GET /api/v1/games/rocom/profile/role`
- `GET /api/v1/games/rocom/profile/evaluation`
- `GET /api/v1/games/rocom/profile/pet-summary`
- `GET /api/v1/games/rocom/profile/collection`
- `GET /api/v1/games/rocom/profile/battle-overview`

参数说明：
`GET /api/v1/games/rocom/profile/role`
`GET /api/v1/games/rocom/profile/evaluation`
`GET /api/v1/games/rocom/profile/pet-summary`
`GET /api/v1/games/rocom/profile/collection`
以上 4 个接口都需要 `X-Framework-Token`，并支持可选查询参数 `account_type`。
`account_type=1` 表示 QQ，`account_type=2` 表示微信。
未传 `account_type` 时，后端会根据当前 WeGame `loginType` 自动推断。

`GET /api/v1/games/rocom/profile/battle-overview` 同样需要 `X-Framework-Token`，但它使用的是可选查询参数 `zone`，不是 `account_type`。
`zone=0` 表示 QQ，`zone=1` 表示微信。
未传 `zone` 时，后端会根据当前 WeGame `loginType` 自动推断。

如果使用 `X-API-Key` 且该 `frameworkToken` 绑定了第三方用户作用域，以上接口仍需继续带同一个 `user_identifier`，可放在 query 参数或 `X-User-Identifier` 请求头。

`GET /api/v1/games/rocom/profile/role` 说明：

- 对应上游 `NrcProfile/GetRoleInfo`
- `avatar` 表示头像
- `avatar_url` 表示头像图片地址，由 API 侧按 `avatar` 从已同步到本地的 `headicon_config` 映射得出，不是上游原始字段
- `background_url` 表示角色卡背景图片地址，由 API 侧按 `id` 拼接得出，不是上游原始字段
- `create_time` 表示创建时间，时间戳格式
- `id` 表示账号 ID
- `is_online` 表示是否在线
- `level` 表示等级
- `name` 表示游戏昵称
- `openid` 表示 OpenID
- `star` 表示魔法师星级
- `star_name` 表示魔法师星级名称，由 API 侧按 `star` 映射得出，不是上游原始字段
- `enroll_days` 表示入学天数，由 API 侧按自然日计算并包含创建当日，不是上游原始字段

`star` 与 `star_name` 对应关系：

- `0` 对应 `魔法学徒`
- `1` 对应 `见习魔法生`
- `2` 对应 `精灵研究员`
- `3` 对应 `精灵学士`
- `4` 对应 `精灵博学者`
- `5` 对应 `精灵魔法师`

`GET /api/v1/games/rocom/profile/role` 响应示例：

```json
{
  "code": 0,
  "message": "成功",
  "data": {
    "result": {
      "error_code": 0,
      "error_message": "WG_COMM_SUCC"
    },
    "role": {
      "avatar": "1001009",
      "avatar_url": "https://jsonschema.qpic.cn/v1_/rb5/4c8194c8827d8b6c81de052a9409800f.png",
      "background_url": "https://photo-prod.nrc.qq.com/704693375/card/3302501774819218804",
      "create_time": "1774482937",
      "enroll_days": 12,
      "id": "704693375",
      "is_online": 0,
      "level": 52,
      "name": "BvzRays",
      "openid": "2153985996166641979",
      "star": 4,
      "star_name": "精灵博学者"
    }
  }
}
```

`GET /api/v1/games/rocom/profile/evaluation` 说明：

- 对应上游 `NrcProfile/GetDimensionEvaluation`
- `capture` 表示捉宠
- `collection` 表示收藏
- `strength` 表示战力
- `progression` 表示推进
- `score` 表示 AI 评分

`GET /api/v1/games/rocom/profile/evaluation` 响应示例：

```json
{
  "code": 0,
  "message": "成功",
  "data": {
    "capture": 77,
    "collection": 75,
    "progression": 85,
    "result": {
      "error_code": 0,
      "error_message": "WG_COMM_SUCC"
    },
    "score": "8.9",
    "strength": 75
  }
}
```

`GET /api/v1/games/rocom/profile/pet-summary` 说明：

- 对应上游 `NrcProfile/GetPetSummary`
- `best_pet_id` 为本期摘要对应的精灵 ID
- `best_pet_name` 为本期摘要对应的精灵名称
- `summary_title` 为本期精灵摘要标题
- `summary_content` 为本期精灵摘要文案
- `summary_time` 为本期摘要统计时间范围
- 当上游未返回有效 `best_pet_name` 且 `best_pet_id` 有效时，后端会从 `sprite_base_info` 表回填 `best_pet_name`
- 当 `best_pet_id` 有效时，后端会补充 `best_pet_img_url`
- `best_pet_img_url` 为 API 侧按 `best_pet_id` 拼出的精灵图片地址，不是上游原始字段

`GET /api/v1/games/rocom/profile/pet-summary` 响应示例：

响应补充：
当 `best_pet_id` 有效时，后端会补充 `best_pet_img_url` 字段，规则为
`https://game.gtimg.cn/images/rocom/rocodata/jingling/{best_pet_id}/image.png`。

```json
{
  "code": 0,
  "message": "成功",
  "data": {
    "best_pet_id": "3117",
    "best_pet_img_url": "https://game.gtimg.cn/images/rocom/rocodata/jingling/3117/image.png",
    "best_pet_name": "彩蝶鲨",
    "result": {
      "error_code": 0,
      "error_message": "WG_COMM_SUCC"
    },
    "summary_content": "它站在哪里，哪里就是舞台。各种搞怪动作层出不穷，简直是队伍里的显眼包，你的快乐源泉。",
    "summary_time": "2026-03-30 - 2026-04-03",
    "summary_title": "显眼包包 快乐源泉"
  }
}
```

`GET /api/v1/games/rocom/profile/collection` 说明：

- 对应上游 `NrcProfile/GetMyCollection`
- `total_collection_count` 表示图鉴总数
- `current_collection_count` 表示当前收藏数
- `amazing_sprite_count` 表示了不起精灵数量
- `shiny_sprite_count` 表示异色精灵数量
- `colorful_sprite_count` 表示炫彩精灵数量
- `fashion_collection_count` 表示时装数量
- `item_count` 表示道具数量

`GET /api/v1/games/rocom/profile/collection` 响应示例：

```json
{
  "code": 0,
  "message": "成功",
  "data": {
    "amazing_sprite_count": 48,
    "colorful_sprite_count": 10,
    "current_collection_count": 201,
    "fashion_collection_count": 4,
    "item_count": 15016,
    "result": {
      "error_code": 0,
      "error_message": "WG_COMM_SUCC"
    },
    "shiny_sprite_count": 0,
    "total_collection_count": 340
  }
}
```

`GET /api/v1/games/rocom/profile/battle-overview` 说明：

- 对应上游 `NrcBattle/GetBattleOverview`
- `tier` 表示段位 ID
- `tier_icon_url` 表示段位图标地址，由 API 侧按 `tier` 从已同步到本地的 `file_config.rank_big` 映射得出，不是上游原始字段
- `total_match` 表示对战场次
- `total_win` 表示对战胜利场次
- `win_rate` 表示胜率百分比，由 API 侧按 `total_win / total_match * 100` 计算并保留两位小数，不是上游原始字段

`GET /api/v1/games/rocom/profile/battle-overview` 响应示例：

```json
{
  "code": 0,
  "message": "成功",
  "data": {
    "result": {
      "error_code": 0,
      "error_message": "WG_COMM_SUCC"
    },
    "tier": "107",
    "tier_icon_url": "https://jsonschema.qpic.cn/v1_/rb5/355c48f831d151102bc4761cffcb074b.png",
    "total_match": 194,
    "total_win": 85,
    "win_rate": 43.81
  }
}
```

### 对战记录

- `GET /api/v1/games/rocom/battle/list`

说明：
对应上游 `NrcBattle/GetBattles`。

参数说明：
`X-Framework-Token` 必填。
`zone` 用于区分登录来源对应的战斗分区，`zone=0` 表示 QQ，`zone=1` 表示微信。
未传 `zone` 时，后端会根据当前 WeGame `loginType` 自动推断。
`after_time` 为分页游标时间，建议使用 RFC3339 格式。
未传 `after_time` 时，后端会自动使用当前 UTC 时间后再请求上游。
`page_size` 默认为 `4`。
如果使用 `X-API-Key` 且该 `frameworkToken` 绑定了第三方用户作用域，仍需继续带同一个 `user_identifier`，可放在 query 参数或 `X-User-Identifier` 请求头。

响应补充：
后端会为每条对战记录补充 `avatar_url` 和 `enemy_avatar_url`，由 API 侧按头像 ID 从已同步到本地的 `headicon_config` 映射得出，不是上游原始字段。
后端会为每条对战记录补充 `tier_url` 和 `enemy_tier_url`，由 API 侧按段位 ID 从已同步到本地的 `file_config.rank_big` 映射得出，不是上游原始字段。
后端会保留上游原始 `pet_base_id` 和 `enemy_pet_base_id` 数组，同时追加 `pet_base_info` 和 `enemy_pet_base_info`。
顶层的 `data.result` 是上游通用状态对象；每条 `battles[].result` 则是单场对战结果字段，两者不是同一含义。
后端当前不会改写 `battles[].result`，会原样保留上游返回值。
`battles[].result=0` 表示胜利，`battles[].result=1` 表示失败；示例里的 `"result": 1` 表示这场战斗结果为失败，不是接口错误码。
`battle_time` 表示挑战时间。
`pet_base_info` 和 `enemy_pet_base_info` 中每一项都包含：
`pet_base_id` 精灵 ID。
`pet_name` 从本地 `sprite_base_info` 表映射得到的精灵名称。
`pet_img_url` 按 `https://game.gtimg.cn/images/rocom/rocodata/jingling/{pet_base_id}/image.png` 拼出的精灵图片地址。

示例：
`GET /api/v1/games/rocom/battle/list?zone=0&after_time=2026-04-08T00:47:46.498Z&page_size=4`

`GET /api/v1/games/rocom/battle/list` 响应示例：

```json
{
  "code": 0,
  "message": "成功",
  "data": {
    "result": {
      "error_code": 0,
      "error_message": "WG_COMM_SUCC"
    },
    "battles": [
      {
        "roleid": "704693375",
        "nickname": "BvzRays",
        "avatar": "1001009",
        "avatar_url": "https://jsonschema.qpic.cn/v1_/rb5/4c8194c8827d8b6c81de052a9409800f.png",
        "tier": "35",
        "tier_url": "https://jsonschema.qpic.cn/v1_/rb5/ad415107f20449ed002b4b8d9a7a0f36.png",
        "pet_base_id": [
          "3011",
          "3182",
          "3210",
          "3528",
          "3332",
          "3383"
        ],
        "pet_base_info": [
          {
            "pet_base_id": "3011",
            "pet_name": "恶魔狼",
            "pet_img_url": "https://game.gtimg.cn/images/rocom/rocodata/jingling/3011/image.png"
          },
          {
            "pet_base_id": "3182",
            "pet_name": "龙息帕尔",
            "pet_img_url": "https://game.gtimg.cn/images/rocom/rocodata/jingling/3182/image.png"
          },
          {
            "pet_base_id": "3210",
            "pet_name": "翼龙",
            "pet_img_url": "https://game.gtimg.cn/images/rocom/rocodata/jingling/3210/image.png"
          },
          {
            "pet_base_id": "3528",
            "pet_name": "熔岩布丁",
            "pet_img_url": "https://game.gtimg.cn/images/rocom/rocodata/jingling/3528/image.png"
          },
          {
            "pet_base_id": "3332",
            "pet_name": "千棘盔",
            "pet_img_url": "https://game.gtimg.cn/images/rocom/rocodata/jingling/3332/image.png"
          },
          {
            "pet_base_id": "3383",
            "pet_name": "利灯鱼",
            "pet_img_url": "https://game.gtimg.cn/images/rocom/rocodata/jingling/3383/image.png"
          }
        ],
        "enemy_roleid": "637827243",
        "enemy_nickname": "迪克",
        "enemy_avatar": "1001009",
        "enemy_avatar_url": "https://jsonschema.qpic.cn/v1_/rb5/4c8194c8827d8b6c81de052a9409800f.png",
        "enemy_tier": "30",
        "enemy_tier_url": "https://jsonschema.qpic.cn/v1_/rb5/eeeb652a049778568bcb3b3088d06d49.png",
        "enemy_pet_base_id": [
          "3167",
          "3177",
          "3377",
          "3609",
          "3147",
          "3171"
        ],
        "enemy_pet_base_info": [
          {
            "pet_base_id": "3167",
            "pet_name": "巨噬针鼹",
            "pet_img_url": "https://game.gtimg.cn/images/rocom/rocodata/jingling/3167/image.png"
          },
          {
            "pet_base_id": "3177",
            "pet_name": "咔咔鸟",
            "pet_img_url": "https://game.gtimg.cn/images/rocom/rocodata/jingling/3177/image.png"
          },
          {
            "pet_base_id": "3377",
            "pet_name": "风滚暮虫",
            "pet_img_url": "https://game.gtimg.cn/images/rocom/rocodata/jingling/3377/image.png"
          },
          {
            "pet_base_id": "3609",
            "pet_name": "画间沉铁兽",
            "pet_img_url": "https://game.gtimg.cn/images/rocom/rocodata/jingling/3609/image.png"
          },
          {
            "pet_base_id": "3147",
            "pet_name": "幻影灵菇",
            "pet_img_url": "https://game.gtimg.cn/images/rocom/rocodata/jingling/3147/image.png"
          },
          {
            "pet_base_id": "3171",
            "pet_name": "巨灵石",
            "pet_img_url": "https://game.gtimg.cn/images/rocom/rocodata/jingling/3171/image.png"
          }
        ],
        "battle_time": "2026-04-07T16:40:50+08:00",
        "result": 1
      }
    ],
    "finish": true
  }
}
```

### 精灵列表

- `GET /api/v1/games/rocom/battle/pets`

说明：
虽然路径是 `/api/v1/games/rocom/battle/pets`，但该接口实际用于查询精灵列表，对应上游 `NrcBattle/GetMyPets`。

参数说明：
`X-Framework-Token` 必填。
`zone` 用于区分登录来源对应的战斗分区，`zone=0` 表示 QQ，`zone=1` 表示微信。
未传 `zone` 时，后端会根据当前 WeGame `loginType` 自动推断。
`pet_subset=0` 全部精灵列表。
`pet_subset=1` 了不起精灵列表。
`pet_subset=2` 异色精灵列表。
`pet_subset=3` 炫彩精灵列表。
`pet_type` 用于按属性筛选，默认 `0` 表示不过滤。
`page_no` 默认为 `1`。
`page_size` 默认为 `10`。
如果使用 `X-API-Key` 且该 `frameworkToken` 绑定了第三方用户作用域，仍需继续带同一个 `user_identifier`，可放在 query 参数或 `X-User-Identifier` 请求头。

响应补充：
后端会为每个精灵项补充 `pet_img_url` 字段，规则为
`https://game.gtimg.cn/images/rocom/rocodata/jingling/{pet_base_id}/image.png`。
后端会移除上游原始 `pet_types` 字段，并追加 `pet_types_info` 字段。
`pet_types_info` 中每一项都来自已同步到本地的 `file_config.department`，格式为 `id`、`name`、`icon`。

示例：
`GET /api/v1/games/rocom/battle/pets?zone=1&pet_subset=0&page_no=1&page_size=10`
`GET /api/v1/games/rocom/battle/pets?zone=1&pet_subset=1&page_no=1&page_size=10`
`GET /api/v1/games/rocom/battle/pets?zone=1&pet_subset=2&page_no=1&page_size=10`
`GET /api/v1/games/rocom/battle/pets?zone=1&pet_subset=3&page_no=1&page_size=10`

`GET /api/v1/games/rocom/battle/pets` 响应示例：

```json
{
  "code": 0,
  "message": "成功",
  "data": {
    "average_pet_level": 28,
    "dazzling_pet_count": 4,
    "great_pet_count": 54,
    "pets": [
      {
        "pet_base_id": "3350",
        "pet_img_url": "https://game.gtimg.cn/images/rocom/rocodata/jingling/3350/image.png",
        "pet_level": 60,
        "pet_mutation": 0,
        "pet_name": "红绒十字&红绒十字",
        "pet_talent_level": 4,
        "pet_types_info": [
          {
            "id": 4,
            "name": "火系",
            "icon": "https://jsonschema.qpic.cn/v1_/rb5/882d0b03e083b37978da7359fb1da277.png"
          },
          {
            "id": 16,
            "name": "",
            "icon": ""
          }
        ]
      }
    ],
    "result": {
      "error_code": 0,
      "error_message": "WG_COMM_SUCC"
    },
    "shiny_pet_count": 0,
    "total": 167,
    "weekly_pet": "3005",
    "weekly_pet_update_time": "0"
  }
}
```

### 阵容助手

- `GET /api/v1/games/rocom/lineup/list`

说明：
对应上游 `NrcLineup/GetLineupList`。

参数说明：
`X-Framework-Token` 必填。
`category` 用于按阵容分类过滤，透传给上游。
`account_type` 透传给上游。
`page_no` 表示后端分页页码，默认为 `1`。
后端会先请求上游全量阵容列表，再在 API 侧按每页 `6` 条分页返回。
如果使用 `X-API-Key` 且该 `frameworkToken` 绑定了第三方用户作用域，仍需继续带同一个 `user_identifier`，可放在 query 参数或 `X-User-Identifier` 请求头。

响应补充：
后端会在顶层补充 `page_no`、`page_size`、`total`、`total_pages`、`has_more`，用于表示 API 侧分页结果。
后端会保留上游原始 `lineup.pets[].id` 和 `lineup.pets[].skills`。
后端会为每个 `lineup.pets[]` 追加：
`pet_name` 从本地 `sprite_base_info` 表映射得到的精灵名称。
`pet_img_url` 按 `https://game.gtimg.cn/images/rocom/rocodata/jingling/{id}/icon.png` 拼出的精灵图片地址。
`bloodline_info` 来自本地 `lineup_bloodlines` 表，包含 `id`、`name`、`icon`。
`skills_info` 数组，其中每一项都包含：
`skill_id` 技能 ID。
`skill_name` 从本地 `skill_list` 表映射得到的技能名称。
`skill_img_url` 按 `https://game.gtimg.cn/images/rocom/rocodata/skill/{skill_id}.png` 拼出的技能图片地址。

示例：
`GET /api/v1/games/rocom/lineup/list?page_no=1`
`GET /api/v1/games/rocom/lineup/list?category=闪耀大赛&page_no=2`

`GET /api/v1/games/rocom/lineup/list` 响应示例（节选）：

```json
{
  "code": 0,
  "message": "成功",
  "data": {
    "result": {
      "error_code": 0,
      "error_message": "success"
    },
    "page_no": 1,
    "page_size": 6,
    "total": 48,
    "total_pages": 8,
    "has_more": true,
    "lineups": [
      {
        "id": 59,
        "name": "大运翼王队",
        "author_name": "洛王",
        "category": "闪耀大赛",
        "code": "B~G3K~~~O~a~BSBPBTa5Sg~a5QA~bUGI~a5QU~1F~~~M~G~BQBPBUayBM~ayCS~bRqq~bRrw~4Z~~~H~E~BQBSBPayGq~ayI2~ayBM~bPMi~2d~~~M~V~BPBRBUayBW~bbbW~bWhw~ayJK~vd~~~G~X~BQBPBUbRqq~ayBM~ayCS~bDCa~37~~~N~V~BQBPBUbRpG~ayAa~ayBM~bUFM~ZZC~FA~A~G~D~A~D~A~A~A~A~A~D~",
        "lineup": {
          "version": 1,
          "pets": [
            {
              "id": 3530,
              "pet_name": "精灵名称示例",
              "pet_img_url": "https://game.gtimg.cn/images/rocom/rocodata/jingling/3530/icon.png",
              "bloodline": 14,
              "bloodline_info": {
                "id": 14,
                "name": "血脉名称示例",
                "icon": "https://example.com/bloodline.png"
              },
              "nature": 26,
              "attributes": [
                82,
                79,
                83
              ],
              "skills": [
                7050400,
                7050240,
                7160200,
                7050260
              ],
              "skills_info": [
                {
                  "skill_id": "7050400",
                  "skill_name": "技能名称示例一",
                  "skill_img_url": "https://game.gtimg.cn/images/rocom/rocodata/skill/7050400.png"
                },
                {
                  "skill_id": "7050240",
                  "skill_name": "技能名称示例二",
                  "skill_img_url": "https://game.gtimg.cn/images/rocom/rocodata/skill/7050240.png"
                }
              ]
            }
          ],
          "magic_id": 104002,
          "formation_mode": 5,
          "name": ""
        }
      }
    ]
  }
}
```

### 交换大厅

- `GET /api/v1/games/rocom/exchange/posters`

说明：
对应上游 `RocoExchange/GetPosterList`。

参数说明：
`X-Framework-Token` 必填。
`refresh` 透传给上游，默认为 `false`。
`account_type` 透传给上游。
`page_no` 表示后端分页页码，默认为 `1`。
后端会先请求上游全量海报列表，再在 API 侧按每页 `6` 条分页返回。
如果使用 `X-API-Key` 且该 `frameworkToken` 绑定了第三方用户作用域，仍需继续带同一个 `user_identifier`，可放在 query 参数或 `X-User-Identifier` 请求头。

响应补充：
后端会在顶层补充 `page_no`、`page_size`、`total`、`total_pages`、`has_more`，用于表示 API 侧分页结果。
后端会保留上游原始 `posters[].user_info.avatar` 字段。
后端会为每条海报的 `user_info` 追加：
`avatar_url` 由 API 侧按头像 ID 从本地 `headicon_icons` 表映射得到。

示例：
`GET /api/v1/games/rocom/exchange/posters?page_no=1`
`GET /api/v1/games/rocom/exchange/posters?refresh=true&page_no=2`

`GET /api/v1/games/rocom/exchange/posters` 响应示例（节选）：

```json
{
  "code": 0,
  "message": "成功",
  "data": {
    "result": {
      "error_code": 0,
      "error_message": "success"
    },
    "page_no": 1,
    "page_size": 6,
    "total": 96,
    "total_pages": 16,
    "has_more": true,
    "posters": [
      {
        "poster_id": "02084051-083e-4932-871f-862eebb55fc5",
        "user_info": {
          "role_id": "5256315",
          "openid": "14526297201009036867",
          "nickname": "温柔小帅",
          "avatar": "2001001",
          "avatar_url": "https://jsonschema.qpic.cn/v1_/rb5/4c8194c8827d8b6c81de052a9409800f.png",
          "level": 58,
          "online_status": 1,
          "master_tgpid": "3644507"
        },
        "want_item": 0,
        "want_item_name": "交友",
        "message": "牵手",
        "offer_items": [
          "恶魔狼",
          "一火二水",
          "雪影犀角鸟"
        ],
        "duration": 1,
        "create_time": "1775784858",
        "expire_time": "1775871258"
      }
    ],
    "openid": "439241631",
    "trace_id": ""
  }
}
```

### 精灵尺寸查询

- `GET /api/v1/games/rocom/pet/size-query`

说明：
根据精灵尺寸（直径，单位米）与重量（单位千克）查询匹配的精灵候选列表。该接口代理第三方服务 `size.mfsky.xyz`，并在返回结果上追加精灵的 `petImage`（大图）与 `petIcon`（小图）。

参数说明：
`diameter`（必填）精灵尺寸，单位米，例如 `0.45`。
`weight`（必填）精灵重量，单位千克，例如 `35.6`。

鉴权说明：
- 支持 Web JWT、匿名令牌、或持有 `rocom.access` 权限的 `X-API-Key`
- 本接口为工具类查询，**不需要** 传 `X-Framework-Token`

响应补充：
后端会按上游返回的 `petId` 反查本地 `sprite_base_info.item_id`，得到精灵图片资源 `id` 后，在每个 `candidates` / `exactResults` 条目上追加：

- `petImage`：`https://game.gtimg.cn/images/rocom/rocodata/jingling/{id}/image.png`
- `petIcon`：`https://game.gtimg.cn/images/rocom/rocodata/jingling/{id}/icon.png`

本地尚未同步到该精灵时，不会写入 `petImage` / `petIcon`。

示例：
`GET /api/v1/games/rocom/pet/size-query?diameter=1.23&weight=45.6`

响应示例：

```json
{
  "code": 0,
  "message": "成功",
  "data": {
    "candidates": [
      {
        "diameterMax": 0.49,
        "diameterMin": 0.376,
        "matchCount": 1,
        "pet": "圣剑侍从",
        "petId": 285,
        "petImage": "https://game.gtimg.cn/images/rocom/rocodata/jingling/3285/image.png",
        "petIcon": "https://game.gtimg.cn/images/rocom/rocodata/jingling/3285/icon.png",
        "probability": 13.4,
        "weightMax": 69.44,
        "weightMin": 46.28
      }
    ],
    "exactResults": [],
    "searchMode": "nearest"
  }
}
```

### 远行商人信息

- `GET /api/v1/games/rocom/merchant/info`

说明：
查询 RoCom 小程序 `m-common-co.getInitInfo` 里的远行商人活动数据。后端不会再对返回结构做投影或字段重命名，当前会直接透传上游 JSON，并对成功结果做短时缓存。

参数：

- `refresh`（选填）是否强制刷新缓存，支持 `true / false / 1 / 0`，默认 `false`

鉴权说明：

- 支持 Web JWT、匿名令牌、或持有 `rocom.access` 权限的 `X-API-Key`
- **不需要** 传 `X-Framework-Token`
- API Key 调用时仍需通过游戏权限校验

缓存说明：

- 默认缓存 5 分钟
- 传 `refresh=true` 时会先清掉当前进程内缓存，再重新请求上游

返回说明：

- 当前直接返回上游 JSON，字段名、嵌套结构、数组内容以上游实际返回为准
- 例如 `merchantActivities`、`otherActivities`、`get_props`、`get_pets`、`get_extra_props`、`_id`、`icon_url` 等字段都会原样保留

示例：

`GET /api/v1/games/rocom/merchant/info?refresh=true`

响应示例：

```json
{
  "code": 0,
  "message": "成功",
  "data": {
    "merchantActivities": [
      {
        "name": "远行商人",
        "start_date": "2026-04-18",
        "start_time": 1776441600000,
        "end_time": 1776527999000,
        "get_props": [
          {
            "_id": "67611185d8ac54dc9b688c9b",
            "icon_url": "https://mmbiz.qpic.cn/example.png",
            "name": "高级咕噜球",
            "start_time": 1776441600000,
            "end_time": 1776527999000
          }
        ],
        "get_extra_props": [],
        "get_pets": [
          {
            "name": "圣剑侍从"
          }
        ]
      }
    ],
    "otherActivities": [
      {
        "name": "签到活动"
      }
    ]
  }
}
```

### 好友关系

- `GET /api/v1/games/rocom/social/friendship`

说明：

- 对应上游 `Imsnssvr/CheckFriendship`
- 需要 `X-Framework-Token`
- `user_ids` 必填，使用英文逗号分隔的一组数字 ID，例如 `10001,10002`
- 如果使用 `X-API-Key` 且该 `frameworkToken` 绑定了第三方用户作用域，仍需继续带同一个 `user_identifier`（query 或 `X-User-Identifier`）

返回说明：

- 当前直接透传上游 JSON，字段以上游实际返回为准

### 学生认证状态

- `GET /api/v1/games/rocom/activity/student-state`

说明：

- 对应上游 `StudentActivity/GetStudentCertifiedState`
- 需要 `X-Framework-Token`
- `account_type` 可选，默认 `0`，透传给上游
- 如果使用 `X-API-Key` 且该 `frameworkToken` 绑定了第三方用户作用域，仍需继续带同一个 `user_identifier`（query 或 `X-User-Identifier`）

返回说明：

- 当前直接透传上游 JSON，字段以上游实际返回为准

### 学生活动福利

- `GET /api/v1/games/rocom/activity/perks`

说明：

- 对应上游 `NrcStudentActivity/GetPerksList`
- 需要 `X-Framework-Token`
- `area` 可选，默认 `101`
- `account_type` 可选，默认 `0`
- 如果使用 `X-API-Key` 且该 `frameworkToken` 绑定了第三方用户作用域，仍需继续带同一个 `user_identifier`（query 或 `X-User-Identifier`）

返回说明：

- 当前直接透传上游 JSON，字段以上游实际返回为准

### 手动同步本地配置

- `POST /api/v1/games/rocom/config/sync`

说明：

- 该接口用于手动触发一次 RoCom 配置同步任务
- 需要 `Authorization: Bearer <web-jwt>`
- 调用者必须是后端管理员角色，普通 Web 用户无权调用
- 会拉取并覆盖写入 RoCom 本地配置表
- 当前同步资源包括：
  - `file_config`
  - `LineupData`
  - `headicon_config`
  - `videoList`
  - `config_info`
  - `base_info.json`
  - `skill.json`

响应示例：

```json
{
  "code": 0,
  "message": "RoCom 配置同步完成",
  "data": {
    "schema": "game_rocom",
    "synced_at": "2026-04-07T20:30:00+08:00",
    "resources": [
      "file_config",
      "LineupData",
      "headicon_config",
      "videoList",
      "config_info",
      "base_info.json",
      "skill.json"
    ],
    "triggered_by": "web_jwt"
  }
}
```
