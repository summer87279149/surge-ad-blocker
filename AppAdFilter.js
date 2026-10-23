// 只处理模块中列出的广告接口；不保存请求、响应或用户信息。
(function () {
  const url = String($request.url || "");
  const isResponse = typeof $response !== "undefined";
  try {
    if (!isResponse && /^https?:\/\/switch\.jumpvg\.com(?::443)?\//.test(url)) {
      const path = url.split("?")[0].replace(/^https?:\/\/switch\.jumpvg\.com(?::443)?/, "");
      const arrays = ["/jump/ad/home/screen", "/jump/recommend/ad_conf", "/jump/notice/popup"];
      const objects = ["/jump/ad/kiko_down_page/conf"];
      const empty = ["/jump/getlaunchad/v2", "/jump/ad/home/screen/full_v2"];
      if ([...arrays, ...objects, ...empty].includes(path)) {
        const result = { success: true, code: 0, msg: "success" };
        if (arrays.includes(path)) result.data = [];
        if (objects.includes(path)) result.data = {};
        $done({ response: {
          status: 200,
          headers: { "Content-Type": "application/json; charset=utf-8" },
          body: JSON.stringify(result)
        } });
        return;
      }
    }
    if (isResponse && /^https?:\/\/app-api-32\.ihaique\.net(?::443)?\/api\/app\/v5\/appad\/cmd\/AppadGetSplashAds(?:\?|$)/.test(url)) {
      const data = JSON.parse($response.body);
      if (data && data.code === 0 && Array.isArray(data.body)) {
        data.body = [];
        if (Object.prototype.hasOwnProperty.call(data, "count")) data.count = 0;
        $done({ body: JSON.stringify(data) });
        return;
      }
    }
    if (isResponse && /^https?:\/\/app\.bilibili\.com(?::443)?\/[^?]+\/feed\/index(?:\?|$)/.test(url)) {
      const data = JSON.parse($response.body);
      if (data && data.data && Array.isArray(data.data.items)) {
        data.data.items = data.data.items.filter(item => {
          if (!item || typeof item !== "object" || item.is_ad || item.card_goto === "ad" || item.goto === "ad") return false;
          if (Array.isArray(item.banner_item)) {
            item.banner_item = item.banner_item.filter(b => !(b && (b.is_ad || b.ad_banner)));
            if (item.banner_item.length === 0) return false;
          }
          if (item.ad_info) delete item.ad_info;
          return true;
        });
        $done({ body: JSON.stringify(data) });
        return;
      }
    }
  } catch (_) {}
  $done({});
})();
