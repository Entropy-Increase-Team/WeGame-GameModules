# Rocom API

本文档描述洛克王国世界（RoCom / NRC）游戏模块接口。

## 文档边界

本文档描述当前公开的 RoCom 接口：

- `/api/v1/games/rocom/*`
- `/api/v1/games/rocom/ingame/*`

接口分组：

- 普通 RoCom API：账号、资料、对战、宠物、活动和公告等接口
- Ingame API：数据查询接口

在调用本文件中的接口前，请先参考 [WeGame-API.md](./WeGame-API.md) 完成：

- 基础认证
- WeGame 登录或凭证导入
- `frameworkToken` 获取
- 开发者 `WeGame API Key` 创建
- `game:rocom` 对应权限申请

如果这份 `frameworkToken` 已经明确持久化为其他共享登录 provider，例如 `df`，当前接口会直接拒绝使用，避免跨游戏误用 token。

## 前置要求

当前洛克王国世界模块包含两类路由前缀：

- `/api/v1/games/rocom/*`
- `/api/v1/games/rocom/ingame/*`

这里的 `ingame` 只指 `/api/v1/games/rocom/ingame/*` 这一组数据查询接口。
`/api/v1/games/rocom/merchant/info` 和 `/api/v1/games/rocom/pet/size-query` 属于普通 RoCom 路由。

以下认证规则主要针对普通 RoCom 路由，请先记住：

- 当前模块的大部分查询接口至少需要一种基础认证：`Authorization: Bearer <web-jwt>`、`X-Anonymous-Token`、或 `X-API-Key`
- 除了明确标注为“**不需要 `X-Framework-Token`**”的接口外，大部分游戏数据接口都需要通过 `X-Framework-Token` 指定一份已保存的 WeGame 凭证
- 如果使用 `X-API-Key`，统一使用开发者 `WeGame API Key`
- 该 API Key 还必须已经获批 `game:rocom` 下的对应权限；普通开放接口使用 `rocom.access`，换蛋广场 API Key 发帖使用 `rocom.egg_exchange.post`
- 游戏路由默认进入订阅扣费链路；默认配置把 `/api/v1/games/*` 设为 `standard`，每次请求扣 `1` 积分
- 账号数据接口会先完成 `X-Framework-Token` 本地校验，再进入订阅扣费和上游请求
- 匿名令牌可以通过基础认证；默认收费配置下，匿名令牌在扣费前会返回 `401`，请使用 Web JWT 或归属到用户的 API Key 完成扣费调用
- 订阅扣费失败会返回 `402`，套餐频率超限会返回 `429`，成功响应会带 `X-Plan`、`X-Request-Cost`、`X-Credits-Balance` 等响应头
- 如果 API Key 请求使用的是按第三方用户作用域创建 / 归属的 `frameworkToken` 或绑定记录，后续请求还需要继续带同一个 `user_identifier`；可放在 query 参数或 `X-User-Identifier` 请求头
- `user_identifier` 支持 `1234567890:EC74CD08AA000D0BB72C765F04D151DF` 这类冒号分隔格式
- 如果这份 `frameworkToken` 来自 Web 授权流程，且授权请求里传过 `platform_id`，这里的 `user_identifier` 也应该和当时的 `platform_id` 保持一致
- 当前只开放 HAR 中已验证的核心查询接口
- 部分接口成功时，`data` 中会包含业务系统返回对象；具体结构以对应章节为准

## 请求头说明

本项目 CORS 会放行多个请求头，业务层实际读取范围如下。第三方插件调用 RoCom 接口时，默认使用 `X-API-Key`；账号数据接口再附带 `X-Framework-Token` 和 `X-User-Identifier`。

### 实际可用的请求头

| 请求头 | 处理位置 / 用途 | 适用场景 |
|---|---|---|
| `X-API-Key` | RoCom 游戏路由统一认证、管理接口统一认证 | 第三方客户端基础认证；调用 RoCom 接口时需要具备 `game:rocom` 对应权限 |
| `Authorization: Bearer <web-jwt>` | RoCom 游戏路由统一认证、管理接口统一认证 | Web 用户基础认证；管理接口要求后端管理员身份 |
| `X-Anonymous-Token` | RoCom 游戏路由统一认证 | 匿名基础认证；默认收费配置下没有用户归属会返回 `401` |
| `Authorization: Bearer anon_xxx` | RoCom 游戏路由统一认证 | 匿名令牌的 Bearer 写法，等价于 `X-Anonymous-Token` |
| `X-Framework-Token` | RoCom 账号数据接口 | 指定已保存的 WeGame 凭证；后端只读取这个请求头名 |
| `X-User-Identifier` | API Key 用户作用域 | 第三方客户端传入的用户标识符；支持 `3889750061:EC74CD08AA000D0BB72C765F04D151DF` 这类冒号分隔格式 |
| `Content-Type: application/json` | JSON 请求解析 | `POST` JSON 请求必填 |
| `Accept: application/json` | 客户端响应约定 | 建议附带，明确期望 JSON 响应 |

`user_identifier` query 参数也会被识别，优先级高于 `X-User-Identifier`。本文档统一推荐请求头写法。

### CORS 放行的其他链路请求头

| 请求头 | 归属链路 | RoCom 游戏路由处理 |
|---|---|---|
| `X-Client-Type` | WeGame 登录 / 绑定链路的客户端类型 | 换蛋发帖和订阅接口用于客户端归属；支持 `web` / `bot` / `app` |
| `X-Client-ID` | WeGame 登录 / 绑定链路的客户端标识 | 换蛋发帖和订阅接口用于客户端归属 |
| `X-Client-User-ID` | WritableAuth 可写代理接口的客户端用户标识 | 无业务读取 |
| `X-Client-User-Type` | WritableAuth 可写代理接口的客户端用户类型 | 无业务读取 |

### 第三方插件请求头模板

账号数据接口，也就是需要 `X-Framework-Token` 的接口：

```http
X-API-Key: <wegame-api-key>
X-Framework-Token: <framework-token>
X-User-Identifier: <第三方用户标识符>
Accept: application/json
```

账号列表接口：

```http
X-API-Key: <wegame-api-key>
X-User-Identifier: <第三方用户标识符>
Accept: application/json
```

普通查询接口和 Ingame `GET` 接口：

```http
X-API-Key: <wegame-api-key>
Accept: application/json
```

Ingame `POST` 接口：

```http
X-API-Key: <wegame-api-key>
Content-Type: application/json
Accept: application/json
```

配置同步接口使用 API Key 时：

```http
X-API-Key: <admin-api-key>
Accept: application/json
```

### Web 和匿名请求头模板

Web 用户调用账号数据接口：

```http
Authorization: Bearer <web-jwt>
X-Framework-Token: <framework-token>
Accept: application/json
```

Web 用户调用普通查询或 Ingame 接口：

```http
Authorization: Bearer <web-jwt>
Accept: application/json
```

匿名调用普通查询或 Ingame 接口：

```http
X-Anonymous-Token: <anonymous-token>
Accept: application/json
```

### 按接口类型附带请求头

| 接口类型 | 接口 | 请求头要求 |
|---|---|---|
| 账号列表 | `GET /api/v1/games/rocom/accounts` | Web 用户带 `Authorization`；API Key 调用带 `X-API-Key` 和 `X-User-Identifier`；不需要 `X-Framework-Token` |
| 账号数据 | `profile/*`、`battle/*`、`lineup/list`、`exchange/posters`、`social/friendship`、`activity/student-state`、`activity/perks` | 带一种基础认证；同时必须带 `X-Framework-Token`；API Key 用户作用域还必须带同一个 `X-User-Identifier` |
| UID 绑定 | `POST /api/v1/games/rocom/uid/bind` | 带一种基础认证；API Key 调用带 `X-API-Key` 和 `X-User-Identifier`；响应头返回 `X-Framework-Token` |
| 本地资料 / 内容查询 | `pet/list`、`pet/detail`、`pet/skill-users`、`pet/size-query`、`merchant/info`、`announcement/*` | 带一种基础认证；不需要 `X-Framework-Token` |
| Ingame 查询 | `ingame/*` | 带一种基础认证；已绑定 UID 时可省略 `uid`；也可带 UID 绑定返回的 `X-Framework-Token`；`POST` 请求带 `Content-Type: application/json` |
| 配置同步 | `POST /api/v1/games/rocom/config/sync` | 后端管理员 Web JWT，或具备 `admin.access` 的 `X-API-Key`；不需要 `X-Framework-Token` |

第三方插件调用账号数据接口时，建议统一在请求封装层注入 `X-API-Key`、`X-Framework-Token`、`X-User-Identifier`。
如果对应 `frameworkToken` 是按某个 `user_identifier` 创建、导入或绑定的，后续所有 RoCom 账号数据接口必须继续带同一个 `X-User-Identifier`。

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

## 普通 RoCom API

本章节描述 RoCom 普通 API，包括账号、资料、对战、宠物、活动和公告等接口。

### 账号列表

- `GET /api/v1/games/rocom/accounts`

说明：

- 返回当前调用者在 `rocom` 组件下能成功识别出的账号列表
- 实现方式是先读取当前用户的 WeGame 绑定列表，再逐个查询 RoCom 角色资料
- 只有成功读取到角色资料的绑定才会出现在结果里
- 请求头按“账号列表”模板传递
- 本接口基于已保存绑定工作，**不需要** `X-Framework-Token`
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

### UID 绑定

- `POST /api/v1/games/rocom/uid/bind`

说明：

- 手动绑定 RoCom 角色 UID，UID 即角色资料里的 `role.id`
- 成功后响应头返回 `X-Framework-Token`，后续 ingame 查询可直接带这个 token 并省略 `uid`
- 同一用户可绑定多个 UID；首次绑定的 UID 会成为默认 UID
- 如果后续通过 WeGame QQ / 微信扫码登录识别到同一个 UID，服务端会更新这条 UID 绑定，补上 WeGame 绑定、`tgp_id` 和角色资料

请求示例：

```http
POST /api/v1/games/rocom/uid/bind
Content-Type: application/json
X-API-Key: <wegame-api-key>
X-User-Identifier: <platform-user-id>
Accept: application/json

{"uid":"704693375"}
```

响应示例：

```json
{
  "code": 0,
  "message": "成功",
  "data": {
    "frameworkToken": "4f1f2fc2-16bc-4f6d-9f0b-53afde3d38f5",
    "binding": {
      "uid": "704693375",
      "source": "manual",
      "verified": false,
      "is_primary": true
    }
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

- 请求头按“账号数据接口”模板传递
- `GET /profile/role`、`GET /profile/evaluation`、`GET /profile/pet-summary`、`GET /profile/collection` 支持可选查询参数 `account_type`
- `account_type=1` 表示 QQ，`account_type=2` 表示微信
- 未传 `account_type` 时，后端会根据当前 WeGame `loginType` 自动推断
- `GET /profile/battle-overview` 使用可选查询参数 `zone`
- `zone=0` 表示 QQ，`zone=1` 表示微信
- 未传 `zone` 时，后端会根据当前 WeGame `loginType` 自动推断

如果使用 `X-API-Key` 且该 `frameworkToken` 绑定了第三方用户作用域，以上接口仍需继续带同一个 `user_identifier`，可放在 query 参数或 `X-User-Identifier` 请求头。

`GET /api/v1/games/rocom/profile/role` 说明：

- `avatar` 表示头像
- `avatar_url` 表示头像图片地址
- `background_url` 表示角色卡背景图片地址
- `create_time` 表示创建时间，时间戳格式
- `id` 表示账号 ID
- `is_online` 表示是否在线
- `level` 表示等级
- `name` 表示游戏昵称
- `openid` 表示 OpenID
- `star` 表示魔法师星级
- `star_name` 表示魔法师星级名称
- `enroll_days` 表示入学天数，按自然日计算并包含创建当日

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

- `best_pet_id` 为本期摘要对应的精灵 ID
- `best_pet_name` 为本期摘要对应的精灵名称
- `summary_title` 为本期精灵摘要标题
- `summary_content` 为本期精灵摘要文案
- `summary_time` 为本期摘要统计时间范围
- 当 `best_pet_id` 有效且名称缺失时，会补充 `best_pet_name`
- 当 `best_pet_id` 有效时，后端会补充 `best_pet_img_url`
- `best_pet_img_url` 为按 `best_pet_id` 拼出的精灵图片地址

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

- `tier` 表示段位 ID
- `tier_icon_url` 表示段位图标地址
- `total_match` 表示对战场次
- `total_win` 表示对战胜利场次
- `win_rate` 表示胜率百分比，按 `total_win / total_match * 100` 计算并保留两位小数

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
查询玩家对战记录。

参数说明：

- 请求头按“账号数据接口”模板传递
- `zone` 用于区分登录来源对应的战斗分区，`zone=0` 表示 QQ，`zone=1` 表示微信
- 未传 `zone` 时，后端会根据当前 WeGame `loginType` 自动推断
- `after_time` 为分页游标时间，建议使用 RFC3339 格式
- 未传 `after_time` 时，服务端会使用当前 UTC 时间作为查询游标
- `page_size` 默认为 `4`
- 如果使用 `X-API-Key` 且该 `frameworkToken` 绑定了第三方用户作用域，仍需继续带同一个 `user_identifier`，可放在 query 参数或 `X-User-Identifier` 请求头

响应补充：
每条对战记录会补充 `avatar_url`、`enemy_avatar_url`、`tier_url` 和 `enemy_tier_url`。
响应会保留 `pet_base_id` 和 `enemy_pet_base_id` 数组，同时追加 `pet_base_info` 和 `enemy_pet_base_info`。
顶层的 `data.result` 是接口状态对象；每条 `battles[].result` 是单场对战结果字段，两者含义不同。
`battles[].result=0` 表示胜利，`battles[].result=1` 表示失败；示例里的 `"result": 1` 表示这场战斗结果为失败，不是接口错误码。
`battle_time` 表示挑战时间。
`pet_base_info` 和 `enemy_pet_base_info` 中每一项都包含：
`pet_base_id` 精灵 ID。
`pet_name` 从本地 `pet_base` 表映射得到的精灵名称。
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
虽然路径是 `/api/v1/games/rocom/battle/pets`，但该接口实际用于查询精灵列表。

参数说明：

- 请求头按“账号数据接口”模板传递
- `zone` 用于区分登录来源对应的战斗分区，`zone=0` 表示 QQ，`zone=1` 表示微信
- 未传 `zone` 时，后端会根据当前 WeGame `loginType` 自动推断
- `pet_subset=0` 全部精灵列表
- `pet_subset=1` 了不起精灵列表
- `pet_subset=2` 异色精灵列表
- `pet_subset=3` 炫彩精灵列表
- `pet_type` 用于按属性筛选，默认 `0` 表示不过滤
- `page_no` 默认为 `1`
- `page_size` 默认为 `10`
- 如果使用 `X-API-Key` 且该 `frameworkToken` 绑定了第三方用户作用域，仍需继续带同一个 `user_identifier`，可放在 query 参数或 `X-User-Identifier` 请求头

响应补充：
后端会为每个精灵项补充 `pet_img_url` 字段，规则为
`https://game.gtimg.cn/images/rocom/rocodata/jingling/{pet_base_id}/image.png`。
响应会追加 `pet_types_info` 字段。
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

### 宠物图鉴

- `GET /api/v1/games/rocom/pet/list`
- `GET /api/v1/games/rocom/pet/detail`
- `GET /api/v1/games/rocom/pet/skill-users`

说明：

- 这些接口读取本地 `game_rocom.pet_list`、`game_rocom.pet_skills`、`game_rocom.pet_evolutions` 表
- 数据来自已同步的宠物图鉴配置
- 请求头按“不需要 `X-Framework-Token` 的普通查询接口”模板传递
- 这是本地资料查询，**不需要** `X-Framework-Token`
- 认证层支持 Web JWT、匿名令牌、或持有 `rocom.access` 权限的 `X-API-Key`；默认收费配置下需要 Web JWT 或归属到用户的 API Key 完成扣费调用

#### 宠物列表

`GET /api/v1/games/rocom/pet/list`

参数说明：

- `q`：可选，按宠物名称或形态模糊搜索，例如 `喵`
- `type`：可选，按属性筛选，例如 `草`
- `egg_group`：可选，按蛋组筛选，例如 `动物组`
- `skill_id`：可选，按技能 ID 筛选，例如 `7020360`
- `skill`：可选，按技能名称模糊筛选，例如 `抓挠`
- `page_no`：可选，页码，默认 `1`
- `page_size`：可选，每页数量，默认 `20`，最大 `100`

示例：

`GET /api/v1/games/rocom/pet/list?q=喵&type=草&page_no=1&page_size=20`

响应示例：

```json
{
  "code": 0,
  "message": "成功",
  "data": {
    "items": [
      {
        "id": 3001,
        "name": "喵喵",
        "form": "",
        "icon": "JL_miaomiao",
        "pet_img_url": "https://game.gtimg.cn/images/rocom/rocodata/jingling/3001/image.png",
        "pet_icon_url": "https://game.gtimg.cn/images/rocom/rocodata/jingling/3001/icon.png",
        "unit_type": ["草"],
        "egg_group": ["动物组", "拟人组"],
        "attribute": {
          "attr_hp": 65,
          "attr_atk": 66,
          "attr_spatk": 66,
          "attr_def": 49,
          "attr_spdef": 91,
          "attr_spd": 33
        },
        "feature": {
          "name": "氧循环",
          "desc": "使用草系技能后，回复10%生命。"
        },
        "weight_low": 3620,
        "weight_high": 4600,
        "height_low": 53,
        "height_high": 75
      }
    ],
    "total": 1,
    "page_no": 1,
    "page_size": 20,
    "total_pages": 1,
    "has_more": false
  }
}
```

#### 宠物详情

`GET /api/v1/games/rocom/pet/detail?id=3001`

也可以按名称查询：

`GET /api/v1/games/rocom/pet/detail?name=喵喵`

参数说明：

- `id`：宠物 ID，和 `name` 二选一
- `name`：宠物名称，和 `id` 二选一；同时传入时优先使用 `id`

响应补充：

- 返回列表接口中的基础字段
- `level_skill_list` 为升级技能
- `machine_skill_list` 为技能机技能
- `blood_skill_list` 为血脉技能
- `evolution_list` 为进化链
- `talent_random_list`、`breeding` 保留原始 JSON 配置

响应示例（节选）：

```json
{
  "code": 0,
  "message": "成功",
  "data": {
    "id": 3001,
    "name": "喵喵",
    "pet_img_url": "https://game.gtimg.cn/images/rocom/rocodata/jingling/3001/image.png",
    "pet_icon_url": "https://game.gtimg.cn/images/rocom/rocodata/jingling/3001/icon.png",
    "unit_type": ["草"],
    "egg_group": ["动物组", "拟人组"],
    "level_skill_list": [
      {
        "id": 7020360,
        "name": "抓挠",
        "level": 1,
        "cost": "0",
        "power": "35",
        "families": "普通",
        "desc": "造成物伤，自己回复1能量。"
      }
    ],
    "machine_skill_list": [],
    "blood_skill_list": [],
    "evolution_list": [
      {
        "pet_id": 3001,
        "name": "喵喵",
        "level": 0,
        "icon": "JL_miaomiao"
      }
    ]
  }
}
```

#### 技能可用宠物

`GET /api/v1/games/rocom/pet/skill-users?skill_id=7020360`

也可以按技能名模糊查询：

`GET /api/v1/games/rocom/pet/skill-users?skill=抓挠`

参数说明：

- `skill_id`：技能 ID，和 `skill` 二选一
- `skill`：技能名称模糊搜索，和 `skill_id` 二选一；同时传入时优先使用 `skill_id`

响应说明：

- `skill_source` 表示技能来源，取值为 `level`、`machine`、`blood`
- `pet` 为会使用该技能的宠物基础信息
- `skill` 为匹配到的技能信息

响应示例：

```json
{
  "code": 0,
  "message": "成功",
  "data": {
    "items": [
      {
        "skill_source": "level",
        "pet": {
          "id": 3001,
          "name": "喵喵",
          "pet_img_url": "https://game.gtimg.cn/images/rocom/rocodata/jingling/3001/image.png",
          "pet_icon_url": "https://game.gtimg.cn/images/rocom/rocodata/jingling/3001/icon.png",
          "unit_type": ["草"]
        },
        "skill": {
          "id": 7020360,
          "name": "抓挠",
          "level": 1,
          "cost": "0",
          "power": "35",
          "families": "普通",
          "desc": "造成物伤，自己回复1能量。"
        }
      }
    ],
    "total": 1
  }
}
```

### 阵容助手

- `GET /api/v1/games/rocom/lineup/list`

说明：
查询阵容助手列表。

参数说明：

- 请求头按“账号数据接口”模板传递
- `category` 用于按阵容分类过滤
- `account_type` 用于区分账号类型
- `page_no` 表示后端分页页码，默认为 `1`
- 服务端按每页 `6` 条分页返回
- 如果使用 `X-API-Key` 且该 `frameworkToken` 绑定了第三方用户作用域，仍需继续带同一个 `user_identifier`，可放在 query 参数或 `X-User-Identifier` 请求头

响应补充：
后端会在顶层补充 `page_no`、`page_size`、`total`、`total_pages`、`has_more`，用于表示 API 侧分页结果。
响应会保留 `lineup.pets[].id` 和 `lineup.pets[].skills`。
后端会为每个 `lineup.pets[]` 追加：
`pet_name` 从本地 `pet_base` 表映射得到的精灵名称。
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
查询交换大厅海报列表。

参数说明：

- 请求头按“账号数据接口”模板传递
- `refresh` 默认为 `false`
- `account_type` 用于区分账号类型
- `page_no` 表示后端分页页码，默认为 `1`
- 服务端按每页 `6` 条分页返回
- 如果使用 `X-API-Key` 且该 `frameworkToken` 绑定了第三方用户作用域，仍需继续带同一个 `user_identifier`，可放在 query 参数或 `X-User-Identifier` 请求头

响应补充：
后端会在顶层补充 `page_no`、`page_size`、`total`、`total_pages`、`has_more`，用于表示 API 侧分页结果。
响应会保留 `posters[].user_info.avatar` 字段。
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

### 换蛋广场

换蛋帖字段：

- `post_id`：帖子内部 ID，用于关闭、查询审核状态
- `id`：游戏内学号
- `have_text`：我有
- `want_text`：想要
- `want_note`：补充标签，例如性格、体型
- `remark`：在线时间 / 交换说明
- `status`：`active` / `closed` / `deleted`
- `review_status`：`pending` / `manual_pending` / `approved` / `rejected`
- `expires_at`：过期时间；发布时可选，默认 30 天
- `closed_by`：`owner` / `admin` / `system`
- `close_reason`：`traded` / `cancel` / `expired` / `admin`
- `pinned_until`：置顶截止时间

#### 公开列表

`GET /api/v1/games/rocom/community/egg-exchanges`

公开列表只返回 `status=active`、`review_status=approved` 且未过期的帖子，置顶帖排在普通帖前面。

Query 参数：

- `page_no`：可选，默认 `1`
- `page_size`：可选，默认 `20`，最大 `100`
- `q`：可选，按学号、我有、想要、补充标签和备注模糊搜索；兼容 `keyword`
- `id`：可选，按学号精确筛选
- `have_text`：可选，按“我有”模糊筛选
- `want_text`：可选，按“想要”模糊筛选
- `want_note`：可选，按补充标签模糊筛选
- `sort`：可选，`-created_at` 最新优先，`created_at` 最早优先；默认 `-created_at`

响应示例：

```json
{
  "code": 0,
  "message": "成功",
  "data": {
    "items": [
      {
        "post_id": "6658f0f3d8e7a3f38b552a11",
        "id": "470557585",
        "have_text": "雪怪果实，大块头异色粉耳星兔",
        "want_text": "上岸蛙，二代水开图鉴",
        "want_note": "固执大块头",
        "remark": "全天在线",
        "status": "active",
        "review_status": "approved",
        "created_at": "2026-05-29T12:00:00+08:00",
        "expires_at": "2026-06-29T12:00:00+08:00",
        "pinned_until": "2026-06-01T00:00:00+08:00"
      }
    ],
    "total": 1,
    "page_no": 1,
    "page_size": 20,
    "total_pages": 1,
    "has_more": false
  }
}
```

#### 发帖与我的帖子

以下接口支持 Web JWT 和 API Key：

- Web 端使用 `Authorization: Bearer <web-jwt>`，后端按 JWT 中的 Web 用户 ID 判断帖子归属
- API Key 端使用 `X-API-Key`，并携带 `X-Client-Type`、`X-Client-ID`，后端按 `API Key ID + X-Client-Type + X-Client-ID` 判断帖子归属
- API Key 发布和关闭换蛋帖需要 `game:rocom` 下的 `rocom.egg_exchange.post` 权限

`X-Client-ID` 表示第三方客户端实例或渠道，例如一个机器人、一个网页站点或一个小程序；终端用户归属仍由 Web JWT 或 API Key 所属用户决定。
同一把 API Key 下的 `X-Client-ID` 属于客户端自报标识，适合可信渠道间做逻辑隔离；需要强隔离的渠道建议使用不同 API Key。

接口权限：

| 接口 | 用途 | API Key 权限 |
|---|---|---|
| `POST /api/v1/games/rocom/community/egg-exchanges` | 发布换蛋帖 | `rocom.egg_exchange.post` |
| `GET /api/v1/games/rocom/community/egg-exchanges/my` | 查询当前归属下的帖子 | `rocom.access` 或 `rocom.egg_exchange.post` |
| `GET /api/v1/games/rocom/community/egg-exchanges/:post_id/review-status` | 查询当前归属下指定帖子的审核状态 | `rocom.access` 或 `rocom.egg_exchange.post` |
| `POST /api/v1/games/rocom/community/egg-exchanges/:post_id/close` | 关闭当前归属下的帖子 | `rocom.egg_exchange.post` |

后台管理员的审核、后台关闭、置顶和取消置顶接口记录在 `DOCS-API/WeGame-Web-API.md` 的后台管理接口中。

发布后默认进入 `pending`；AI 审核通过后进入 `approved`，AI 审核失败或审核服务未配置时进入 `manual_pending`。发布响应会返回 `similar_posts`，用于展示相似推荐。

发布请求：

```json
{
  "id": "470557585",
  "have_text": "雪怪果实，大块头异色粉耳星兔",
  "want_text": "上岸蛙，二代水开图鉴",
  "want_note": "固执大块头",
  "remark": "全天在线",
  "expires_at": "2026-06-29T12:00:00+08:00"
}
```

我的列表额外支持 query 参数：

- `status`
- `review_status`

关闭请求：

```json
{
  "close_reason": "traded"
}
```

`close_reason` 支持：

- `traded`：成交关闭
- `cancel`：取消关闭；默认值

#### 换蛋订阅

订阅接口用于第三方客户端定时拉取审核通过的新帖。订阅接口支持 Web JWT 和 API Key。

API Key 请求头：

- `X-API-Key: <api-key>`
- `X-Client-Type: bot`
- `X-Client-ID: <client-id>`

订阅接口使用 `rocom.access` 权限。订阅归属按 `API Key ID + X-Client-Type + X-Client-ID` 判断。第三方客户端保存 `subscription_id` 和 `next_event_id` 即可；同一个 API Key 下，不同 `X-Client-ID` 的订阅互相隔离。相同客户端和相同筛选重复创建订阅时，后端返回已有 `subscription_id`。

订阅接口：

| 接口 | 用途 | API Key 权限 |
|---|---|---|
| `POST /api/v1/games/rocom/community/egg-exchange-subscriptions` | 创建订阅 | `rocom.access` |
| `GET /api/v1/games/rocom/community/egg-exchange-subscriptions` | 查询订阅列表 | `rocom.access` |
| `DELETE /api/v1/games/rocom/community/egg-exchange-subscriptions/:subscription_id` | 删除订阅 | `rocom.access` |
| `GET /api/v1/games/rocom/community/egg-exchange-events` | 拉取订阅事件 | `rocom.access` |

创建订阅：

```json
{
  "filters": {
    "q": "",
    "id": "",
    "have_text": "",
    "want_text": "上岸蛙",
    "want_note": "固执"
  }
}
```

订阅筛选字段：

- `q`
- `id`
- `have_text`
- `want_text`
- `want_note`

创建订阅响应：

```json
{
  "code": 0,
  "message": "成功",
  "data": {
    "subscription": {
      "subscription_id": "6658f0f3d8e7a3f38b552a22",
      "event_type": "egg_exchange.approved",
      "filters": {
        "want_text": "上岸蛙",
        "want_note": "固执"
      },
      "status": "active",
      "created_at": "2026-05-29T12:00:00+08:00",
      "updated_at": "2026-05-29T12:00:00+08:00"
    }
  }
}
```

拉取事件：

- `subscription_id`：必填
- `after_event_id`：可选，默认 `0`
- `limit`：可选，默认 `50`，最大 `100`

事件类型固定为 `egg_exchange.approved`，只推送订阅创建后的审核通过帖子。客户端保存响应中的 `next_event_id`，下一次请求传入 `after_event_id`。

```json
{
  "code": 0,
  "message": "成功",
  "data": {
    "items": [
      {
        "event_id": 124,
        "event_type": "egg_exchange.approved",
        "post": {
          "post_id": "6658f0f3d8e7a3f38b552a11",
          "id": "470557585",
          "have_text": "雪怪果实",
          "want_text": "上岸蛙",
          "status": "active",
          "review_status": "approved",
          "created_at": "2026-05-29T12:00:00+08:00",
          "expires_at": "2026-06-29T12:00:00+08:00"
        },
        "created_at": "2026-05-29T12:01:00+08:00"
      }
    ],
    "next_event_id": 124,
    "has_more": false
  }
}
```

### 好友关系

- `GET /api/v1/games/rocom/social/friendship`

说明：

- 请求头按“账号数据接口”模板传递
- `user_ids` 必填，使用英文逗号分隔的一组数字 ID，例如 `10001,10002`
- 如果使用 `X-API-Key` 且该 `frameworkToken` 绑定了第三方用户作用域，仍需继续带同一个 `user_identifier`（query 或 `X-User-Identifier`）

返回说明：

- 返回好友关系查询结果，字段以响应体为准

### 学生认证状态

- `GET /api/v1/games/rocom/activity/student-state`

说明：

- 请求头按“账号数据接口”模板传递
- `account_type` 可选，默认 `0`
- 如果使用 `X-API-Key` 且该 `frameworkToken` 绑定了第三方用户作用域，仍需继续带同一个 `user_identifier`（query 或 `X-User-Identifier`）

返回说明：

- 返回学生认证状态，字段以响应体为准

### 学生活动福利

- `GET /api/v1/games/rocom/activity/perks`

说明：

- 请求头按“账号数据接口”模板传递
- `area` 可选，默认 `101`
- `account_type` 可选，默认 `0`
- 如果使用 `X-API-Key` 且该 `frameworkToken` 绑定了第三方用户作用域，仍需继续带同一个 `user_identifier`（query 或 `X-User-Identifier`）

返回说明：

- 返回学生活动福利列表，字段以响应体为准

### 手动同步本地配置

- `POST /api/v1/games/rocom/config/sync`

说明：

- 该接口用于手动触发一次 RoCom 配置同步任务
- 支持后端管理员 Web JWT，或已获批 `admin.access` 的平台 API Key
- Web JWT 调用者必须是后端管理员角色，普通 Web 用户无权调用
- API Key 调用者需要携带 `X-API-Key`，且该 Key 已获批 `admin.access`
- 不需要 `X-Framework-Token`
- 会拉取并覆盖写入 RoCom 本地配置表
- 单个配置资源 URL 失效、返回非 `2xx` 或解析失败时，该资源会记录到 `skipped_resources` 并跳过写入，其他可用资源继续同步
- 只有所有配置资源都无法同步时，接口才会返回失败
- 当前同步资源包括：
  - `file_config`
  - `headicon_config`
  - `videoList`
  - `config_info`
  - `linkInfo`
  - `pet_base`
  - `lineupSettings`
  - `spiritList`
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
      "videoList",
      "config_info",
      "linkInfo",
      "pet_base",
      "lineupSettings",
      "spiritList",
      "skill.json"
    ],
    "skipped_resources": [
      "headicon_config"
    ],
    "triggered_by": "web_jwt"
  }
}
```

`triggered_by` 会随实际认证方式变化；使用 `admin.access` API Key 调用时通常为 `api_key`。

## ingame API

本章节描述 `/api/v1/games/rocom/ingame/*` 数据查询接口。
`/merchant/info` 和 `/pet/size-query` 属于普通 RoCom 路由，在后文单独说明。

请求头要求：

- 请求头按“Ingame 查询”模板传递
- `GET` 请求通常带 `X-API-Key` 和 `Accept: application/json`
- `POST` 请求带 `X-API-Key`、`Content-Type: application/json` 和 `Accept: application/json`
- Web 用户可用 `Authorization: Bearer <web-jwt>` 替代 `X-API-Key`
- 匿名调用可用 `X-Anonymous-Token` 或 `Authorization: Bearer anon_xxx`
- 这组接口当前不要求 `X-Framework-Token`

默认订阅配置下，这组游戏路由按 `standard` 扣费，需要 Web JWT 或归属到用户的 API Key 完成扣费调用。

如果使用 `X-API-Key`：

- 统一使用开发者 `WeGame API Key`
- 该 API Key 仍需已获批 `game:rocom` 下的对应权限
- 当前默认公开权限为 `rocom.access`

公共规则：

- 调用方只需要传本项目认证凭证
- 已绑定 UID 时，`player/search` 和 `home/info` 可以省略 `uid`
- 带 UID 绑定返回的 `X-Framework-Token` 时，会使用该 token 对应的 UID
- 不带 `X-Framework-Token` 且省略 `uid` 时，会使用当前用户默认 UID
- `wait_ms` 可选，用于指定同步等待查询结果的毫秒数
- `wait_ms` 省略时使用服务端默认等待时间

### 玩家搜索

- `GET /api/v1/games/rocom/ingame/player/search?uid=<UID>`
- `POST /api/v1/games/rocom/ingame/player/search`

说明：

- 适合做玩家 UID 搜索、名片资料页、基础社交资料展示
- `GET` 可使用 query 参数 `uid`
- `POST` 可使用 JSON 请求体 `{"uid":123456}`
- 省略 `uid` 时按 UID 绑定规则自动补齐
- `GET` 和 `POST` 都可选传 `wait_ms`，用于指定同步等待查询结果的毫秒数

`GET /api/v1/games/rocom/ingame/player/search` 请求示例：

```http
GET /api/v1/games/rocom/ingame/player/search?uid=123456&wait_ms=5000
X-API-Key: <wegame-api-key>
Accept: application/json
```

`POST /api/v1/games/rocom/ingame/player/search` 请求示例：

```http
POST /api/v1/games/rocom/ingame/player/search
Content-Type: application/json
X-API-Key: <wegame-api-key>
Accept: application/json

{"uid":123456,"wait_ms":5000}
```

成功响应示例，HTTP `200`：

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
- `meta`：任务元信息
- `rows[].level`：层级深度
- `rows[].field`：字段名
- `rows[].label`：字段中文名
- `rows[].value`：字段值

### 商店信息

- `GET /api/v1/games/rocom/ingame/merchant/info`
- `POST /api/v1/games/rocom/ingame/merchant/info`

说明：

- 适合做远行商人页、商店商品列表、刷新时间展示
- `shop_id` 可省略；省略时返回当前周期远行商人商店信息
- 当前周期商店每天 `Asia/Shanghai` 08:01 后更新
- 显式传 `shop_id` 时查询指定商店
- `GET` 可使用 query 参数 `shop_id`
- `POST` 可使用 JSON 请求体 `{"shop_id":3019}`
- `GET` 和 `POST` 都可选传 `wait_ms`，用于指定同步等待查询结果的毫秒数

`GET /api/v1/games/rocom/ingame/merchant/info` 请求示例：

```http
GET /api/v1/games/rocom/ingame/merchant/info?wait_ms=5000
X-API-Key: <wegame-api-key>
Accept: application/json
```

指定商店 ID 查询：

```http
GET /api/v1/games/rocom/ingame/merchant/info?shop_id=3019&wait_ms=5000
X-API-Key: <wegame-api-key>
Accept: application/json
```

`POST /api/v1/games/rocom/ingame/merchant/info` 请求示例：

```http
POST /api/v1/games/rocom/ingame/merchant/info
Content-Type: application/json
X-API-Key: <wegame-api-key>
Accept: application/json

{"wait_ms":5000}
```

指定商店 ID 查询：

```http
POST /api/v1/games/rocom/ingame/merchant/info
Content-Type: application/json
X-API-Key: <wegame-api-key>
Accept: application/json

{"shop_id":3019,"wait_ms":5000}
```

成功响应示例，HTTP `200`：

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

### 家园信息

- `GET /api/v1/games/rocom/ingame/home/info?uid=<UID>`
- `POST /api/v1/games/rocom/ingame/home/info`

说明：

- 适合做玩家家园资料、居住精灵、种植植物信息展示
- `GET` 可使用 query 参数 `uid`
- `POST` 可使用 JSON 请求体 `{"uid":123456}`
- 省略 `uid` 时按 UID 绑定规则自动补齐
- `GET` 和 `POST` 都可选传 `wait_ms`，用于指定同步等待查询结果的毫秒数

`GET /api/v1/games/rocom/ingame/home/info` 请求示例：

```http
GET /api/v1/games/rocom/ingame/home/info?uid=123456&wait_ms=5000
X-API-Key: <wegame-api-key>
Accept: application/json
```

`POST /api/v1/games/rocom/ingame/home/info` 请求示例：

```http
POST /api/v1/games/rocom/ingame/home/info
Content-Type: application/json
X-API-Key: <wegame-api-key>
Accept: application/json

{"uid":123456,"wait_ms":5000}
```

成功响应示例，HTTP `200`：

```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "rows": [
      {
        "level": 0,
        "field": "ret_code",
        "label": "返回码",
        "value": "0"
      }
    ],
    "home_info": {
      "ret_info": {
        "ret_code": 0
      },
      "uin": 123456,
      "friend_cell_home_brief_info": {
        "home_pet_info": {
          "home_pet_list": [
            {
              "pet_gid": "1000000001",
              "pet_cfg_id": 1001,
              "status": 1,
              "pos": 1
            }
          ]
        },
        "home_plant_info": {
          "home_plant_land_list": [
            {
              "land_index": 0,
              "home_plant_list": [
                {
                  "plant_cfg_id": 2001,
                  "status": 1,
                  "left_time": 3600
                }
              ]
            }
          ]
        }
      }
    },
    "meta": {
      "task_id": "tsk_xxx",
      "created_at": 1777353600.123,
      "finished_at": 1777353602.456
    }
  }
}
```

字段补充：

- `rows`：当前主要包含返回码等扁平字段
- `home_info`：家园原始结构化信息，包含返回信息、家园简要信息、居住精灵和种植植物等
- `meta`：任务元信息

### 任务状态

- `GET /api/v1/games/rocom/ingame/tasks/{task_id}`

说明：

- 玩家搜索、商店查询或家园信息返回 HTTP `202` 时，使用返回的 `task_id` 查询异步任务状态
- 任务完成后会返回对应查询结果

请求示例：

```http
GET /api/v1/games/rocom/ingame/tasks/tsk_xxx
X-API-Key: <wegame-api-key>
Accept: application/json
```

### 服务健康状态

- `GET /api/v1/games/rocom/ingame/health`

说明：

- 用于查看 ingame 服务健康状态
- 该接口需要本项目认证与 `game:rocom` 权限

请求示例：

```http
GET /api/v1/games/rocom/ingame/health
X-API-Key: <wegame-api-key>
Accept: application/json
```

响应示例，HTTP `200`：

```json
{
  "status": "ok"
}
```

### Ingame 返回规则

以下为 ingame 接口的常见响应结构。

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

说明：玩家搜索和商店信息通常返回 `source/title/rows/notes/meta`；家园信息通常返回 `rows/home_info/meta`。

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

查询失败，HTTP `500`：

```json
{
  "code": 5001,
  "message": "具体错误信息",
  "data": null
}
```

## 其他 RoCom API

本章节描述挂在普通 RoCom 路由下的补充能力接口。

### 精灵尺寸查询

- `GET /api/v1/games/rocom/pet/size-query`

说明：
根据精灵尺寸（直径，单位米）与重量（单位千克）查询匹配的精灵候选列表。该接口会在返回结果上追加精灵的 `petImage`（大图）与 `petIcon`（小图），并使用本项目统一的 `code/message/data` 响应格式返回。

参数说明：
`diameter`（必填）精灵尺寸，单位米，例如 `0.45`。
`weight`（必填）精灵重量，单位千克，例如 `35.6`。
`sameRideEgg`（可选）是否查询同乘蛋，传 `1` 表示查询同乘；不传或传 `0` 为普通查询。

鉴权说明：

- 请求头按“不需要 `X-Framework-Token` 的普通查询接口”模板传递
- 认证层支持 Web JWT、匿名令牌、或持有 `rocom.access` 权限的 `X-API-Key`；默认收费配置下需要 Web JWT 或归属到用户的 API Key 完成扣费调用
- 本接口为工具类查询，**不需要** 传 `X-Framework-Token`

响应补充：
当返回项包含有效 `petId` 时，会在每个 `candidates` / `exactResults` 条目上追加：

- `petImage`：`https://game.gtimg.cn/images/rocom/rocodata/jingling/{id}/image.png`
- `petIcon`：`https://game.gtimg.cn/images/rocom/rocodata/jingling/{id}/icon.png`

本地尚未同步到该精灵时，不会写入 `petImage` / `petIcon`。
同乘查询结果中会包含 `isSameRideEgg: true` 和 `ImageKey` 等字段。

示例：
`GET /api/v1/games/rocom/pet/size-query?diameter=1.23&weight=45.6`

同乘查询示例：
`GET /api/v1/games/rocom/pet/size-query?diameter=0.231&weight=3.601&sameRideEgg=1`

响应示例：

```json
{
  "code": 0,
  "message": "成功",
  "data": {
    "candidates": [
      {
        "ImageKey": "3516.png",
        "attributes": ["水"],
        "diameterMax": 0.32,
        "diameterMin": 0.23,
        "isSameRideEgg": true,
        "pet": "板板壳",
        "petId": 12,
        "petImage": "https://game.gtimg.cn/images/rocom/rocodata/jingling/3516/image.png",
        "petIcon": "https://game.gtimg.cn/images/rocom/rocodata/jingling/3516/icon.png",
        "weightMax": 4.2,
        "weightMin": 2.625
      }
    ],
    "exactResults": [
      {
        "ImageKey": "3200.png",
        "attributes": ["机械"],
        "diameterMax": 0.22,
        "diameterMin": 0.22,
        "isSameRideEgg": true,
        "pet": "机械方方",
        "petId": 263,
        "petImage": "https://game.gtimg.cn/images/rocom/rocodata/jingling/3200/image.png",
        "petIcon": "https://game.gtimg.cn/images/rocom/rocodata/jingling/3200/icon.png",
        "probability": 100,
        "weightMax": 3.718,
        "weightMin": 3.718
      }
    ],
    "searchMode": "tolerance2"
  }
}
```

### 公告列表

- `GET /api/v1/games/rocom/announcement/list`

说明：

- 查询 RoCom 小程序公告/社区内容分页列表
- 列表接口固定返回轻量卡片字段，不返回 `content.text`、图片索引或视频索引
- 公告正文、图片、视频等富文本资源请用“公告详情”接口按 `thread_id` 查询

参数：

- `category_id`（选填）公告分类，默认 `99`
- `page`（选填）页码，从 `1` 开始，默认 `1`
- `limit`（选填）每页数量，默认 `10`，最大 `50`
- `order`（选填）排序，默认 `ttDesc`

已知分类：

- `99` 全部/聚合
- `1` 活动预告、商城时装、版本更新等
- `2` 壁纸、攻略、动画短片等
- `3` 联动、活动、创作激励等

鉴权说明：

- 请求头按“不需要 `X-Framework-Token` 的普通查询接口”模板传递
- 认证层支持 Web JWT、匿名令牌、或持有 `rocom.access` 权限的 `X-API-Key`；默认收费配置下需要 Web JWT 或归属到用户的 API Key 完成扣费调用
- **不需要** 传 `X-Framework-Token`
- API Key 调用时仍需通过游戏权限校验

示例：

`GET /api/v1/games/rocom/announcement/list?category_id=99&page=1&limit=10`
`GET /api/v1/games/rocom/announcement/list?category_id=99&page=2&limit=10`
`GET /api/v1/games/rocom/announcement/list?category_id=99&page=9&limit=10`

响应示例（节选）：

```json
{
  "code": 0,
  "message": "成功",
  "data": {
    "currentTime": "2026-05-07 20:19:40",
    "category_id": 99,
    "page": 1,
    "limit": 10,
    "order": "ttDesc",
    "count": 10,
    "has_more": true,
    "next_page": 2,
    "list": [
      {
        "id": 73,
        "title": "页游联动福利 | 不褪色的羁绊",
        "categoryID": 3,
        "cover": "https://res.mfoa.qq.com/rocom/community/example.png",
        "summary": "你是几年小洛克？分享洛克报告领称号和奖牌！",
        "author": {
          "nickname": "洛克王国：世界",
          "avatar": "https://res.mfoa.qq.com/rocom/community/example.png"
        },
        "contentType": 0,
        "infoType": 0,
        "publishAt": "2026-03-03 10:00:00",
        "createdAt": "2026-03-03 10:00:00",
        "editedAt": "2026-03-03 10:00:00",
        "viewCount": 8258452,
        "likedCount": 0,
        "collectCount": 0,
        "shareCount": 0,
        "isStick": 1,
        "isRecommend": 0,
        "status": 0
      }
    ]
  }
}
```

### 最新公告

- `GET /api/v1/games/rocom/announcement/latest`

说明：

- 获取最新的一条 RoCom 公告，用于客户端轮询检查是否有新公告
- 为避免旧置顶公告长期占据第一位，本接口会优先返回第一页中的第一条非置顶公告
- 如果第一页只有置顶公告，则返回第一条置顶公告作为兜底
- 返回轻量公告字段，不返回 `content.text`、图片索引或视频索引；完整内容请用“公告详情”接口查询

参数：

- `category_id`（选填）公告分类，默认 `99`
- `order`（选填）排序，默认 `ttDesc`

鉴权说明：

- 请求头按“不需要 `X-Framework-Token` 的普通查询接口”模板传递
- 认证层支持 Web JWT、匿名令牌、或持有 `rocom.access` 权限的 `X-API-Key`；默认收费配置下需要 Web JWT 或归属到用户的 API Key 完成扣费调用
- **不需要** 传 `X-Framework-Token`
- API Key 调用时仍需通过游戏权限校验

示例：

`GET /api/v1/games/rocom/announcement/latest`

响应示例：

```json
{
  "code": 0,
  "message": "成功",
  "data": {
    "id": 222,
    "thread_id": 222,
    "title": "活动预告 | 奇丽草大量出没",
    "summary": "",
    "categoryID": 1,
    "cover": "https://res.mfoa.qq.com/rocom/community/example.jpg",
    "publishAt": "2026-05-07 19:00:00",
    "published_at": "2026-05-07 19:00:00",
    "published_at_ts": 1778151600,
    "createdAt": "2026-05-07 19:00:00",
    "isStick": 0,
    "status": 0,
    "currentTime": "2026-05-08 10:51:28",
    "category_id": 99,
    "order": "ttDesc"
  }
}
```

客户端轮询示例：

```javascript
let lastKnownTimestamp = 0;

async function checkLatestRoComAnnouncement() {
  const res = await fetch('/api/v1/games/rocom/announcement/latest', {
    headers: { 'X-API-Key': API_KEY }
  });
  const { data } = await res.json();
  if (data.published_at_ts > lastKnownTimestamp) {
    lastKnownTimestamp = data.published_at_ts;
    // 发现新公告后，可用 data.thread_id 请求公告详情
  }
}

setInterval(checkLatestRoComAnnouncement, 2 * 60 * 1000);
```

### 公告详情

- `GET /api/v1/games/rocom/announcement/detail`

说明：

- 根据公告 ID 查询 RoCom 小程序公告/社区内容详情
- 成功时返回公告详情对象；`content.text` 为 HTML 富文本，图片资源通常在 `content.indexes` 中同步列出

参数：

- `thread_id`（必填）公告 ID，对应公告列表返回的 `id`

鉴权说明：

- 请求头按“不需要 `X-Framework-Token` 的普通查询接口”模板传递
- 认证层支持 Web JWT、匿名令牌、或持有 `rocom.access` 权限的 `X-API-Key`；默认收费配置下需要 Web JWT 或归属到用户的 API Key 完成扣费调用
- **不需要** 传 `X-Framework-Token`
- API Key 调用时仍需通过游戏权限校验

示例：

`GET /api/v1/games/rocom/announcement/detail?thread_id=219`

响应示例（节选）：

```json
{
  "code": 0,
  "message": "成功",
  "data": {
    "id": 219,
    "title": "「不褪色的羁绊」和「故乡的礼物」限时活动即将结束！",
    "categoryID": 3,
    "cover": "https://res.mfoa.qq.com/rocom/community/example.png",
    "summary": "",
    "content": {
      "text": "<p style=\"line-height: 2;\">...</p>",
      "indexes": [
        {
          "type": 101,
          "imageUrl": [
            "https://res.mfoa.qq.com/rocom/community/example.png"
          ],
          "imagePreviewUrl": [
            "https://res.mfoa.qq.com/rocom/community/p_example.png"
          ]
        }
      ]
    },
    "publishAt": "2026-05-07 08:00:00",
    "createdAt": "2026-05-07 08:00:00",
    "editedAt": "2026-05-07 11:21:51",
    "viewCount": 35758,
    "shareCount": 0,
    "likedCount": 0,
    "collectCount": 197,
    "isStick": 0,
    "status": 0
  }
}
```

### 远行商人信息

- `GET /api/v1/games/rocom/merchant/info`

说明：

- 查询 RoCom 小程序 `m-common-co.getInitInfo` 里的远行商人活动数据
- 返回远行商人活动列表，并附带随机商品配置

参数：

- `refresh`（选填）是否强制刷新缓存，支持 `true / false / 1 / 0`，默认 `false`
- `random_goods`（选填）随机商品配置返回范围，默认只返回 `goods_name` 与远行商人 `get_props[].name` 相同的配置；传 `all / full / true / 1 / yes` 时返回全部随机商品配置

鉴权说明：

- 请求头按“不需要 `X-Framework-Token` 的普通查询接口”模板传递
- 认证层支持 Web JWT、匿名令牌、或持有 `rocom.access` 权限的 `X-API-Key`；默认收费配置下需要 Web JWT 或归属到用户的 API Key 完成扣费调用
- **不需要** 传 `X-Framework-Token`
- API Key 调用时仍需通过游戏权限校验
- `refresh=true` 只允许持有 `rocom.access` 的 API Key 或后台管理员 Web JWT 使用；普通 Web 用户只能读取缓存，匿名令牌在默认收费配置下仍受订阅扣费限制

缓存说明：

- 默认缓存 5 分钟
- 传 `refresh=true` 时会尝试强制刷新，但服务端有 30 秒刷新冷却；冷却期内会直接复用最近一次成功缓存
- 同一时刻发生的缓存未命中或强制刷新会合并处理，避免重复刷新

返回说明：

- `merchantActivities` 返回远行商人活动数组
- `random_goods` 返回本地随机商品配置数组；默认按 `merchantActivities[].get_props[].name` 匹配 `random_goods.goods_name`
- `banner_list`、`index_top_list`、`otherActivities` 等非必要字段不会返回

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
    "random_goods": [
      {
        "id": 67001,
        "goods_name": "黑晶琉璃",
        "package_id": 1,
        "enable": true,
        "Type": 1,
        "item_id": 100628,
        "item_num": 1,
        "price_goods_type": 2,
        "price_goods_id": 1,
        "origin_price": 1000,
        "price": 1000,
        "buy_limit_num": 100,
        "weight": 1
      }
    ]
  }
}
```
