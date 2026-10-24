# App 去广告（合并版）

在 Surge 中只启用这一个模块：

[安装 AppAdBlock.sgmodule](https://raw.githubusercontent.com/summer87279149/surge-ad-blocker/main/AppAdBlock.sgmodule)

它合并了已抓包确认的广告 SDK、QQ 音乐广告、B 站与高德开屏、海马爸比广告接口，以及 Alcidae、Jump、B 站信息流过滤。旧的分散模块已移除，请停用手机中已缓存的旧模块，避免重复执行。

## 必需文件

- `AppAdBlock.sgmodule`：唯一的 Surge 模块，包含拦截规则、脚本入口和 MitM 域名。
- `AppAdFilter.js`：五个脚本入口共用的过滤文件。模块自动从此仓库下载，不能删除。

脚本不记录请求、响应或用户信息。Jump 广告接口直接返回空结果；Alcidae 保留请求 ID 并清空广告数组；B 站只移除有广告标记的卡片。

## 闲鱼开屏

新增开屏接口 `mtop.taobao.idlecommerce.splash.async.ads/1.0/` 的响应过滤。
只在返回成功且存在广告对象时清空 `data.adMap`，保留其他字段和原有响应状态。
不封锁闲鱼整个 API 域名，也不修改搜索、商品、消息或交易接口。

接口和字段参考[现有开屏过滤代码](https://github.com/skernelx/SurgeScripts/blob/master/xianyu/xianyu-ad-block.js)。
本地边界检查及 Surge 配置检查已通过。
2026-10-24，用户确认更新后闲鱼开屏广告已消失。
随后在首页连续观察 125 秒，未见新增闲鱼开屏请求或持续重试；观察范围限于 Surge 可见的新请求。
手机更新模块后会通过带版本号的地址获取新脚本，避免沿用旧脚本缓存。

这台手机通过 iCloud 使用本地模块和脚本。维护时同时同步两个文件，并将本地模块的 `script-path` 设为 `AppAdFilter.js`。
手机上的点击、重启和验证由用户操作。

## B 站开屏

用户确认开屏请求已被拒绝，但清理普通缓存后仍出现广告。
版本 `2026.10.24.2` 将 `list`、`show`、`event/list2` 改为响应过滤。
仅在原响应成功且存在已识别的广告数组时，清空 `show`、`list`、`event_list`，并将已有的数值 `max_time` 归零。
保留其他字段及请求间隔，不伪造成功状态。错误响应和未知格式原样通过。
`brand/list` 仍使用拒绝规则。

字段参考 [app2smile 的开屏处理](https://github.com/app2smile/rules/blob/master/js/bilibili-json.js)和 [Sparkle 的开屏处理](https://github.com/kokoryh/Sparkle/blob/master/dist/bilibili.json.js)。
本地 63 项检查和 Surge 配置检查通过。
2026-10-24，用户确认更新后开屏广告消失，B 站版本为 9.16.0。
手机已启用新脚本，`splash/list` 不再被拒绝。首页连续观察 125 秒，未见新增开屏请求或持续重试。
两款 App 的这次观察只覆盖 Surge 可见的新请求，不包含独立的 DNS 查询计数，也不能保证以后不会重试。

## MitM

需要开启 MitM 和脚本。模块仅添加 9 个明确域名，不解密歌曲播放、摄像头视频或地图瓦片。用户主配置中的 `gs-loc-cn.apple.com` 和 `gs-loc.apple.com` 继续保留，实际共 11 个主机名。

此模块不封锁米家设备主接口、App Store 接口、B 站游戏中心或普通用户信息接口。Apple Home 不作处理。

## 更新与恢复

以此仓库为维护来源，修改后更新模块和脚本。应用更新或广告接口变化时可能需要调整。旧文件保留在 Git 历史中，当前分支不保留抓包、测试或备份文件。
