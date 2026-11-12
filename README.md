# App 去广告（合并版）

在 Surge 的「模块」中从 URL 安装，并启用「App 去广告（GitHub 版）」。停用旧的本地「App 去广告（合并版）」，避免两份规则同时匹配。模块会从 GitHub 下载脚本。 [安装 AppAdBlock.sgmodule](https://raw.githubusercontent.com/summer87279149/surge-ad-blocker/main/AppAdBlock.sgmodule)

当前模块为 `2026.11.12.2`，脚本为 `2026.11.10.4`。需要 Surge iOS 5.23.0+ 或 Mac 6.10.0+，并开启 MitM 和脚本。

## 必需文件

- `AppAdBlock.sgmodule` 提供路径规则、脚本入口、MitM 主机和 `AppAdSDK` 域名表。
- `AppAdFilter.js` 由模块引用。脚本可以保存本地诊断摘要，摘要只记录时间、固定类别和响应结构。

主配置需要引用 SDK 域名表，才能对这些域名执行静默丢弃。已配置下列引用的设备只需更换模块。

```ini
[Ruleset AppAdSDK]
# 由模块填充。

[Rule]
RULE-SET,AppAdSDK,REJECT-DROP,pre-matching,extended-matching
```

## 高德开屏

新版覆盖高德子域名下的 `/ws/aos/alimama/`、`/ws/valueadded/alimama/` 和 `/ws/shield/dsp/app/startup/`，可匹配这些路径下的备用接口。实时开屏仍用下面的响应过滤。`m5-x.amap.com` 和 `m5-zb.amap.com` 纳入高德网关的解密及 QUIC 回退范围。新版广告和重试尚待实机验收。 [备用广告路径参考](https://github.com/blackmatrix7/ios_rule_script/blob/master/rewrite/Surge/AdvertisingLite/AdvertisingLite.sgmodule)

Proxyman 抓到两条 `amap-aos-info-nogw.amap.com/ws/aos/alimama/splash_screen_rt` 的成功响应。每条响应都带了一条开屏广告。Surge 仅清空 multipart 表单 `jsonData` 里的 `data.custom_list`，保留原来的成功状态和其他字段。

## 淘宝开屏

模块在 `acs.m.taobao.com` 和 `guide-acs.m.taobao.com` 按 URL 拒绝独立广告服务 `mtop.alibaba.advertisementservice.getadv`。图片、视频开屏仍由原响应脚本处理。新版广告和重试尚待实机验收。 [广告接口参考](https://github.com/fmz200/wool_scripts/blob/main/Surge/module/split/partT/Taobao.sgmodule)

## 历史记录

以下是 2026 年 10 月 24 日的测试记录。

## 闲鱼开屏

新增开屏接口 `mtop.taobao.idlecommerce.splash.async.ads/1.0/` 的响应过滤。
只在返回成功且存在广告对象时清空 `data.adMap`，保留其他字段和原有响应状态。
不封锁闲鱼整个 API 域名，也不修改搜索、商品、消息或交易接口。

接口和字段参考[现有开屏过滤代码](https://github.com/skernelx/SurgeScripts/blob/master/xianyu/xianyu-ad-block.js)。
本地边界检查及 Surge 配置检查已通过。
2026-10-24，用户确认更新后闲鱼开屏广告已消失。
随后在首页连续观察 125 秒，未见新增闲鱼开屏请求或持续重试；观察范围限于 Surge 可见的新请求。
手机更新模块后会通过带版本号的地址获取新脚本，避免沿用旧脚本缓存。

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

## 更新与恢复

以此仓库为维护来源，修改后更新模块和脚本。应用更新或广告接口变化时可能需要调整。旧文件保留在 Git 历史中，当前分支不保留抓包、测试或备份文件。
