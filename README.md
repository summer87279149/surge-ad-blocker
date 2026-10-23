# Surge 去广告模块

保留以下两个精简模块。它们不封锁 App 主接口、登录、游戏中心、歌曲播放或 Apple 系统服务。

| App | 用途 | 远程模块 |
| --- | --- | --- |
| 哔哩哔哩 | 过滤首页信息流中的广告卡片 | [BiliAdBlock.sgmodule](https://raw.githubusercontent.com/summer87279149/surge-ad-blocker/main/apps/bilibili/BiliAdBlock.sgmodule) |
| QQ 音乐 | 拦截广告配置、广告素材和相关广告 SDK | [QQMusicAdBlock.sgmodule](https://raw.githubusercontent.com/summer87279149/surge-ad-blocker/main/apps/qqmusic/QQMusicAdBlock.sgmodule) |

B 站信息流过滤需要 MitM，仅添加 `app.bilibili.com`；QQ 音乐模块不需要 MitM。

## 2026-10-23 清理

删除旧米家、Apple、高德、闲鱼模块。旧米家模块会拒绝设备主接口；旧 Apple 模块包含 App Store / News 等系统服务；旧高德已由手机上的精准开屏规则替代；旧闲鱼模块重复拦截多个通用广告 SDK，并包含范围过宽的 CDN 规则。

B 站模块移除游戏中心、推送、通用诊断及重复开屏规则。QQ 音乐移除普通统计与无关域名规则，只保留广告配置和素材拦截。

手机另外安装的「哔哩哔哩与高德开屏广告拦截」「App 广告精准过滤」「已确认广告域名拦截」继续负责已经抓包确认的开屏、弹窗与广告 SDK。

主配置中用户需要的 Apple 定位域名应由用户自己保留，不由去广告模块覆盖。删除 GitHub 文件不会自动卸载手机中已经缓存的旧模块，旧模块应保持停用。

删除前版本仍保留在 Git 历史中。
