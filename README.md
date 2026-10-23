# App 去广告（合并版）

在 Surge 中只启用这一个模块：

[安装 AppAdBlock.sgmodule](https://raw.githubusercontent.com/summer87279149/surge-ad-blocker/main/AppAdBlock.sgmodule)

它合并了已抓包确认的广告 SDK、QQ 音乐广告、B 站与高德开屏、海马爸比广告接口，以及 Alcidae、Jump、B 站信息流过滤。旧的分散模块已移除，请停用手机中已缓存的旧模块，避免重复执行。

## 必需文件

- `AppAdBlock.sgmodule`：唯一的 Surge 模块，包含拦截规则、脚本入口和 MitM 域名。
- `AppAdFilter.js`：三个脚本入口共用的过滤文件。模块自动从此仓库下载，不能删除。

脚本不记录请求、响应或用户信息。Jump 广告接口直接返回空结果；Alcidae 保留请求 ID 并清空广告数组；B 站只移除有广告标记的卡片。

## MitM

需要开启 MitM 和脚本。模块仅添加 7 个明确域名，不解密歌曲播放、摄像头视频或地图瓦片。用户主配置中的 `gs-loc-cn.apple.com` 和 `gs-loc.apple.com` 继续保留，实际共 9 个主机名。

此模块不封锁米家设备主接口、App Store 接口、B 站游戏中心或普通用户信息接口。Apple Home 不作处理。

## 更新与恢复

以此仓库为维护来源，修改后更新模块和脚本。应用更新或广告接口变化时可能需要调整。旧文件保留在 Git 历史中，当前分支不保留抓包、测试或备份文件。
