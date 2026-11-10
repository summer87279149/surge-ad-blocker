// 只处理模块中列出的广告接口。可选诊断仅保存时间、固定标签、结构类型和数量。
(function () {
  // 已核对列表模型及计时计算：两个间隔采用 Int32 上限，展示次数采用最小正数。
  // max_time <= 0 在已读选择代码中会回退到 6；不把 0 当作禁止展示。
  const BILI_SPLASH_CONTROLS = { min_interval: 2147483647, pull_interval: 2147483647, max_time: 1 };
  const url = String($request.url || "");
  const mtopMatch = /^https?:\/\/(?:(?:g-)?acs\.m\.goofish\.com|acs\.m\.taobao\.com)(?::443)?\/gw\/([^/?]+)(\/[0-9.]+)?\/?(?:\?|$)/.exec(url);
  const mtopApi = mtopMatch ? mtopMatch[1] : "";
  const hasMtopVersion = Boolean(mtopMatch?.[2]);
  const taobaoImage = /^https?:\/\/(?:guide-)?acs\.m\.taobao\.com(?::443)?\/gw\/mtop\.taobao\.wireless\.home\.splash\.awesome\.get(?:\/[0-9.]+)?\/?(?:\?|$)/.test(url);
  const taobaoVideo = /^https?:\/\/guide-acs\.m\.taobao\.com(?::443)?\/gw\/mtop\.taobao\.cloudvideo\.video\.query(?:\/[0-9.]+)?\/?(?:\?|$)/.test(url);
  const isResponse = typeof $response !== "undefined";
  const diagnostics = typeof $argument !== "undefined" && $argument === "splash-diagnostics-v1";
  const scriptName = typeof $script !== "undefined" ? $script.name : "";
  const app = scriptName === "BiliSplashAdCleaner" ? "bili" : ["XianyuSplashAds", "XianyuAdCleaner"].includes(scriptName) ? "xianyu" :
    scriptName === "TaobaoSplashAdCleaner" ? "taobao" : scriptName === "AmapStartupDiagnostics" ? "amap" :
    scriptName === "AmapGatewayDiagnostics" ? "amap-gateway" :
    scriptName === "TaobaoStartupDiagnostics" ? "taobao-startup" :
    scriptName === "XianyuDispatchDiagnostics" ? "xianyu-transport" :
    ["BiliPlayerJsonDiagnostics", "BiliPlayerRPCDiagnostics"].includes(scriptName) ? "bili-player" : "";
  let outcome = "url-unmatched";
  let route = "unmatched";
  let shape = {};
  let parsedResponse;
  let transport;

  function parseDispatchBody(body) {
    const text = String(body).trim();
    try {
      const value = JSON.parse(text);
      shape.dispatchFormat = "json";
      return value;
    } catch (_) {}
    shape.dispatchFormat = "unrecognized";
    if (!text || text.length > 262144 || text.length % 4 !== 0 || !/^[a-z0-9+/]*={0,2}$/i.test(text)) throw new SyntaxError("dispatch-format");
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let bits = 0, buffer = 0, escaped = "";
    for (const char of text) {
      if (char === "=") break;
      buffer = (buffer << 6) | alphabet.indexOf(char);
      bits += 6;
      if (bits >= 8) {
        bits -= 8;
        escaped += "%" + ("0" + ((buffer >> bits) & 255).toString(16)).slice(-2);
      }
    }
    shape.dispatchFormat = "base64";
    // 只在内存中解码，再按白名单取结构和服务器地址。原响应仍原样返回。
    return JSON.parse(decodeURIComponent(escaped));
  }

  function transportRoutes(root) {
    const result = [];
    let visited = 0;
    const hosts = ["acs.m.goofish.com", "g-acs.m.goofish.com", "acs.m.taobao.com"];
    const protocolName = /^(?:https?|http[123]|h[123]|spdy|quic)(?:[-+_][a-z0-9]{1,12}){0,3}$/i;
    function serverAddress(value) {
      if (typeof value !== "string") return false;
      if (/^(?:\d{1,3}\.){3}\d{1,3}$/.test(value)) {
        const p = value.split(".").map(Number);
        return p.every(n => n <= 255) && p[0] > 0 && p[0] < 224 &&
          ![10,127].includes(p[0]) && !(p[0] === 169 && p[1] === 254) &&
          !(p[0] === 172 && p[1] >= 16 && p[1] <= 31) && !(p[0] === 192 && p[1] === 168) &&
          !(p[0] === 100 && p[1] >= 64 && p[1] <= 127) && !(p[0] === 198 && (p[1] === 18 || p[1] === 19));
      }
      if (!/^[a-f0-9:]{3,39}$/i.test(value) || !value.includes(":")) return false;
      const compressed = value.includes("::"), groups = value.split(":").filter(Boolean);
      return groups.every(g => /^[a-f0-9]{1,4}$/i.test(g)) &&
        (compressed ? value.indexOf("::") === value.lastIndexOf("::") && groups.length < 8 : groups.length === 8) &&
        !/^(?:f[cd]|fe[89ab])/i.test(value) && value !== "::" && value !== "::1";
    }
    function visit(value, depth) {
      if (!value || typeof value !== "object" || depth > 6 || ++visited > 512) return;
      const host = hosts.includes(value.host) ? value.host : hosts.includes(value.domain) ? value.domain : "";
      if (host && result.length < 8) {
        const addresses = new Set(), protocols = new Set(), ports = new Set();
        let inspected = 0;
        function collect(node, level) {
          if (!node || typeof node !== "object" || level > 4 || ++inspected > 128) return;
          if (Array.isArray(node)) {
            for (const entry of node.slice(0,16)) {
              if (serverAddress(entry) && addresses.size < 8) addresses.add(entry);
              else collect(entry, level + 1);
            }
            return;
          }
          for (const [key, field] of Object.entries(node)) {
            if (/client|user|device|account|request|location|secdata|sign|token|trace/i.test(key)) continue;
            if (serverAddress(key) && addresses.size < 8) addresses.add(key);
            if (serverAddress(field) && addresses.size < 8) addresses.add(field);
            if (/^(protocol|proto|protocolType)$/i.test(key) && typeof field === "string" && protocolName.test(field) && protocols.size < 8) protocols.add(field.toLowerCase());
            if (/^(port|server_port)$/i.test(key) && /^\d{1,5}$/.test(String(field)) && Number(field) > 0 && Number(field) <= 65535 && ports.size < 8) ports.add(Number(field));
            if (typeof field === "string" && field.length <= 65536 && /^[\[{]/.test(field.trim())) {
              try { collect(JSON.parse(field), level + 1); } catch (_) {}
            } else collect(field, level + 1);
          }
        }
        collect(value, 0);
        result.push({ host, addresses: [...addresses], protocols: [...protocols], ports: [...ports], fields: fieldTypes(value) });
      }
      for (const item of Object.values(value)) visit(item, depth + 1);
    }
    visit(root, 0);
    return result;
  }

  function fieldTypes(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    const result = {};
    for (const key of Object.keys(value).filter(key => /^[a-z_][a-z0-9_]{0,39}$/i.test(key)).sort().slice(0,32)) {
      const field = value[key];
      result[key] = field === null ? "null" : Array.isArray(field) ? "array:" + field.length :
        typeof field === "object" ? "object:" + Object.keys(field).length :
        typeof field === "string" ? "string:" + field.length : typeof field;
    }
    return result;
  }

  function protobufFields(bytes, onMessage) {
    let at = 0, count = 0;
    const fields = {};
    function varint() {
      let value = 0, multiplier = 1;
      for (let i = 0; i < 10 && at < bytes.length; i++) {
        const byte = bytes[at++];
        value += (byte & 127) * multiplier;
        if (!(byte & 128)) return value;
        multiplier *= 128;
      }
      throw new SyntaxError("protobuf-varint");
    }
    while (at < bytes.length && ++count <= 1024) {
      const tag = varint(), number = Math.floor(tag / 8), wire = tag % 8;
      if (!Number.isSafeInteger(tag) || number < 1 || number > 536870911) throw new SyntaxError("protobuf-tag");
      const start = at;
      if (wire === 0) varint();
      else if (wire === 1) at += 8;
      else if (wire === 2) {
        const size = varint();
        if (!Number.isSafeInteger(size) || size < 0 || size > bytes.length - at) throw new SyntaxError("protobuf-size");
        if (typeof onMessage === "function") onMessage(number, bytes.subarray(at,at + size));
        at += size;
      } else if (wire === 5) at += 4;
      else throw new SyntaxError("protobuf-wire");
      if (at > bytes.length) throw new SyntaxError("protobuf-truncated");
      const key = "f" + number + "w" + wire;
      if (fields[key]) fields[key].count++;
      else if (Object.keys(fields).length < 64) fields[key] = { count: 1, bytes: at - start };
    }
    if (at !== bytes.length) throw new SyntaxError("protobuf-limit");
    return fields;
  }

  function describeCooldownFields(root) {
    const found = [], seen = new Set();
    let visited = 0, decodedChars = 0, decodedStrings = 0;
    function isControlKey(key) {
      const words = typeof key === "string" ? key.replace(/([a-z0-9])([A-Z])/g,"$1_$2").toLowerCase() : "";
      return typeof key === "string" && /^[a-z][a-z0-9_]{0,63}$/i.test(key) &&
        (["min_interval", "minInterval", "hotShowInterval", "hotStartInterval"].includes(key) ||
          /(?:^|_)(?:splash|hot)(?:_|$)/.test(words) && /interval|cooldown/.test(words));
    }
    function add(key, value, source) {
      if (!isControlKey(key) || found.length >= 24) return;
      const type = value === null ? "null" : Array.isArray(value) ? "array" : typeof value;
      const item = { key, type, source };
      // 只保存已知间隔字段的非负整数；不保存其他字符串、URL 或标识。
      const numeric = typeof value === "number" ? value :
        typeof value === "string" && /^\d{1,10}$/.test(value) ? Number(value) : NaN;
      if (Number.isInteger(numeric) && numeric >= 0 && numeric <= 2147483647) item.value = numeric;
      const signature = JSON.stringify(item);
      if (!seen.has(signature)) { seen.add(signature); found.push(item); }
    }
    function visit(value, depth) {
      if (depth > 6 || ++visited > 512) return;
      if (typeof value === "string") {
        if (decodedStrings >= 16 || value.length > 65536 || decodedChars + value.length > 262144 ||
            !/^[\[{]/.test(value.trim())) return;
        decodedStrings++;
        decodedChars += value.length;
        try { visit(JSON.parse(value), depth + 1); } catch (_) {}
        return;
      }
      if (!value || typeof value !== "object") return;
      if (Array.isArray(value)) {
        for (const entry of value.slice(0,16)) visit(entry, depth + 1);
        return;
      }
      const keys = Object.keys(value).slice(0,64);
      for (const key of keys) add(key, value[key], "field");
      // 同时识别 { key/name: "具体间隔键", value: 整数 } 的配置表格式。
      for (const selector of ["key", "name"]) {
        if (Object.prototype.hasOwnProperty.call(value,selector) && Object.prototype.hasOwnProperty.call(value,"value"))
          add(value[selector], value.value, "entry");
      }
      for (const key of keys) {
        if (/account|cookie|token|secret|device|user|sign|secdata/i.test(key)) continue;
        visit(value[key], depth + 1);
      }
    }
    visit(root, 0);
    shape.cooldownFields = found;
    shape.cooldownScan = { visited: Math.min(visited,513), decodedStrings, decodedChars };
  }

  function describePlayerResponse() {
    route = scriptName === "BiliPlayerRPCDiagnostics" ? "bili-player-rpc" :
      /^https?:\/\/cm\.bilibili\.com(?::443)?\//.test(url) ? "bili-cm" :
      /^https?:\/\/api\.bilibili\.com(?::443)?\/x\/kv-frontend\/namespace\/data(?:\?|$)/.test(url) ? "bili-config-json" : "bili-player-json";
    outcome = "observed-only";
    const body = $response.body;
    if (route === "bili-cm") {
      const path = url.split("?")[0].replace(/^https?:\/\/cm\.bilibili\.com(?::443)?/, "");
      if (path.length <= 160 && path.split("/").every(part => !part || /^[a-z][a-z_-]{0,23}$/i.test(part) || /^v[0-9]{1,2}$/.test(part))) shape.cmEndpoint = path;
    } else if (route === "bili-player-json") {
      shape.apiRoute = url.includes("/x/v2/dm/ad") ? "dm-ad" : url.includes("/x/vip/ads/material") ? "vip-ad-material" : url.includes("/wbi/v2") ? "player-wbi-v2" : "player-v2";
    }
    if (route === "bili-player-rpc") {
      shape.rpcMethod = url.includes("viewunite.v1.View/View") ? "view-unite" : url.includes("view.v1.View/View") ? "view" :
        url.includes("playerunite.v1.Player/PlayViewUnite") ? "player-unite" : url.includes("playurl.v1.PlayURL/PlayView") ? "play-url" : "splash-rpc";
      if (!(body instanceof Uint8Array)) { outcome = "unexpected-body-type"; return; }
      shape.bodyBytes = body.length;
      if (body.length < 5) { outcome = "empty-or-short-frame"; return; }
      const size = body[1] * 16777216 + body[2] * 65536 + body[3] * 256 + body[4];
      if (body[0] > 1 || size > body.length - 5) { outcome = "unrecognized-frame"; return; }
      shape.grpcCompressed = body[0] === 1;
      shape.messageBytes = size;
      shape.trailingBytes = body.length - 5 - size;
      let message = body.subarray(5,5 + size);
      if (shape.grpcCompressed) {
        // 先核对 gzip 标记和声明大小，再使用 Surge 原生解码；不存储消息值。
        if (message.length < 18 || message[0] !== 31 || message[1] !== 139 ||
            typeof $utils === "undefined" || typeof $utils.ungzip !== "function") return;
        const tail = message.length - 4;
        const expected = message[tail] + message[tail + 1] * 256 + message[tail + 2] * 65536 + message[tail + 3] * 16777216;
        if (expected > 1048576) { outcome = "decoded-size-limit"; return; }
        try { message = $utils.ungzip(message); } catch (_) { message = null; }
        if (!(message instanceof Uint8Array) || message.length !== expected || message.length > 1048576) {
          outcome = "compressed-decode-failed";
          return;
        }
      }
      shape.decodedBytes = message.length;
      try {
        shape.protobufFields = protobufFields(message, shape.rpcMethod === "view-unite" ? (number, cm) => {
          if (number !== 7 || shape.cmFields) return;
          // 参考 ViewReply.CM 的 7 -> 3/5 -> 1；这里只记录编号和数量，不按此改写。
          let itemPayloads = 0;
          shape.cmFields = protobufFields(cm, (field, item) => {
            if (field === 5) itemPayloads += (protobufFields(item).f1w2 || {}).count || 0;
          });
          shape.cmItemPayloads = itemPayloads;
        } : undefined);
      } catch (_) { outcome = "unrecognized-protobuf"; }
      return;
    }
    if (typeof body !== "string" || body.length === 0) { outcome = "empty-body"; return; }
    try { parsedResponse = JSON.parse(body); }
    catch (_) { outcome = "non-json"; return; }
    if (route === "bili-config-json") {
      shape.apiRoute = "kv-namespace";
      describeCooldownFields(parsedResponse);
      return;
    }
    shape.adStructures = [];
    const containers = ["data", "result", "config", "cm", "ad", "ads", "adInfo", "ad_info", "adMap", "splash", "splash_ad", "pause", "pause_ad"];
    let visited = 0;
    function visit(value, path, depth) {
      if (!value || typeof value !== "object" || depth > 3 || ++visited > 32) return;
      for (const key of containers) {
        if (!Object.prototype.hasOwnProperty.call(value,key)) continue;
        const field = value[key], label = path ? path + "." + key : key;
        if (key !== "data" && key !== "result" && key !== "config" && shape.adStructures.length < 16) {
          shape.adStructures.push({ label, type: field === null ? "null" : Array.isArray(field) ? "array" : typeof field,
            count: field && typeof field === "object" ? Object.keys(field).length : null,
            fields: Object.fromEntries(Object.entries(fieldTypes(field)).filter(([name]) =>
              containers.concat(["list", "items", "show", "sourceContent", "sourceContentItem", "source_content", "source_content_item"]).includes(name))) });
        }
        visit(field, label, depth + 1);
      }
    }
    visit(parsedResponse,"",0);
  }

  function splashControls(data) {
    const controls = {};
    if (!isRecord(data)) return controls;
    for (const key of ["min_interval", "pull_interval", "max_time", "disperse_interval", "splash_hot_show_interval", "max_count"]) {
      const value = data[key];
      if (Number.isInteger(value) && value >= 0 && value <= 2147483647) controls[key] = value;
    }
    return controls;
  }

  function describeFields(data, keys) {
    if (!diagnostics) return;
    for (const key of keys) {
      const value = data && data[key];
      shape[key] = value === null ? "null" : Array.isArray(value) ? "array" : typeof value;
      if (Array.isArray(value)) shape[key + "Count"] = value.length;
      if (value && typeof value === "object" && !Array.isArray(value)) {
        shape[key + "Count"] = Object.keys(value).length;
      }
    }
  }

  function readResponse() {
    if (typeof parsedResponse === "undefined") parsedResponse = JSON.parse($response.body);
    return parsedResponse;
  }

  function isRecord(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
  }

  function filterAmapSplash() {
    if ($request.method !== "POST" || $response.status !== 200 || typeof $response.body !== "string") return;
    const contentType = Object.entries($response.headers || {}).find(([name]) => name.toLowerCase() === "content-type")?.[1];
    if (typeof contentType !== "string" || !/^multipart\/form-data\s*;/i.test(contentType)) return;
    const parameter = /;\s*boundary\s*=\s*(?:"([^"\r\n]+)"|([^;\s]+))(?=\s*(?:;|$))/i.exec(contentType);
    if (!parameter) return;

    // 已抓到的响应只有一个 jsonData 部分。保留原来的边界和部分头。
    const boundary = parameter[1] || parameter[2];
    const body = $response.body;
    const start = /^--([^\r\n]+)\r?\n((?:[^\r\n]+\r?\n)+)\r?\n/.exec(body);
    const end = /\r?\n--([^\r\n]+)--(?:\r?\n)?$/.exec(body);
    if (start?.[1] !== boundary || end?.[1] !== boundary || end.index < start[0].length ||
        !/^content-disposition:[ \t]*form-data;[ \t]*name="jsonData"\r?$/im.test(start[2])) return;

    const payload = JSON.parse(body.slice(start[0].length, end.index));
    const data = payload?.data;
    if (payload?.result !== "true" || payload.code !== "1" || !isRecord(data) ||
        data.status !== "ok" || !Array.isArray(data.custom_list) || data.custom_list.length === 0) return;

    data.custom_list = [];
    return start[0] + JSON.stringify(payload) + end[0];
  }

  function isExplicitAd(entry) {
    if (!isRecord(entry)) return false;
    const adTypes = ["ad", "ads", "advert", "advertisement", "alimama", "splash_ad", "banner_ad"];
    return [entry, entry.data, entry.item, entry.card].some(value => isRecord(value) && (
      [value.is_ad, value.isAd].some(flag => flag === true || flag === 1 || flag === "1" || flag === "true") ||
      [value.bizType, value.biz_type, value.cardType, value.card_type, value.strategyType, value.type]
        .some(type => typeof type === "string" && adTypes.includes(type.toLowerCase())) ||
      value.card_goto === "ad" || value.goto === "ad"
    ));
  }

  function removeMarkedCards(data, keys) {
    let removed = 0;
    for (const key of keys) {
      if (!Array.isArray(data[key])) continue;
      const filtered = data[key].filter(entry => !isExplicitAd(entry));
      removed += data[key].length - filtered.length;
      if (filtered.length !== data[key].length) data[key] = filtered;
    }
    return removed;
  }

  function finish(result) {
    const observedRequest = route !== "unmatched" && (app === "amap-gateway" || app === "taobao-startup");
    if (diagnostics && app && (isResponse || observedRequest) && !["xianyu-feed", "xianyu-promotion"].includes(route)) {
      try {
        if (app === "bili") shape.controlsAfter = splashControls(parsedResponse && parsedResponse.data);
        const key = "AppAdFilter.splashDiagnostics.v1." + app;
        const raw = $persistentStore.read(key);
        let records = [];
        if (raw && raw.length <= 65536) {
          try {
            const saved = JSON.parse(raw);
            if (Array.isArray(saved)) records = saved.slice(-63);
          } catch (_) {}
        }
        const response = isResponse ? $response : {};
        const bodyChars = typeof response.body === "string" ? response.body.length : null;
        records.push({
          version: "2026.11.10.4",
          at: Date.now(),
          route,
          outcome,
          httpStatus: typeof response.status === "number" ? response.status : null,
          bodyChars,
          outputBodyChars: typeof result.body === "string" ? result.body.length : bodyChars,
          topFields: fieldTypes(parsedResponse),
          afterData: fieldTypes(parsedResponse && parsedResponse.data),
          transport,
          shape
        });
        let encoded = JSON.stringify(records);
        while (encoded.length > 60000 && records.length > 1) {
          records.shift();
          encoded = JSON.stringify(records);
        }
        $persistentStore.write(encoded, key);
      } catch (_) {} // 存储不可用时仍返回原本的过滤结果。
    }
    $done(result);
  }

  try {
    if (isResponse && scriptName === "AmapSplashAdCleaner") {
      const body = filterAmapSplash();
      finish(body === undefined ? {} : { body });
      return;
    }
    if (diagnostics && !isResponse && app === "taobao-startup") {
      if (taobaoImage) route = "taobao-image-request";
      else if (taobaoVideo) route = "taobao-video-request";
      else if (/^https?:\/\/poplayer\.template\.alibaba\.com(?::443)?\/[a-z0-9_]+\.json(?:\?|$)/i.test(url)) route = "taobao-poplayer-request";
      else if (/^https?:\/\/acs\.m\.taobao\.com(?::443)?\/gw\/mtop\.alibaba\.advertisementservice\.getadv(?:\/[0-9.]+)?\/?(?:\?|$)/.test(url)) route = "taobao-ad-service-request";
      outcome = "observed-only";
      finish({});
      return;
    }
    if (diagnostics && !isResponse && app === "amap-gateway") {
      const path = url.split("?", 1)[0].replace(/^https?:\/\/[^/]+/, "");
      if (/^\/ws\/(?:aos\/alimama\/splash_screen(?:_rt)?|valueadded\/alimama\/splash_screen)\/?$/.test(path)) route = "amap-gateway-splash";
      else if (/^\/ws\/shield\/(?:dsp\/app\/startup\/init|frogserver\/aocs\/updatable\/\d+)\/?$/.test(path)) route = "amap-gateway-config";
      else if (/^\/ws\/shield\/alc\/collect\/?$/.test(path)) route = "amap-gateway-telemetry";
      else if (/^\/ws\/asa\/ads_attribution\/?$/.test(path)) route = "amap-gateway-ad-attribution";
      else if (/(?:^|[\/_-])(?:splash|startup|alimama|optimus|advert|ads?)(?:[\/_-]|$)/i.test(path)) route = "amap-gateway-ad-candidate";
      else route = "amap-gateway-other";
      outcome = "observed-only";
      finish({});
      return;
    }
    if (diagnostics && isResponse && app === "amap") {
      route = url.split("?", 1)[0].includes("/frogserver/aocs/updatable/") ? "amap-config" : "amap-startup";
      const startup = JSON.parse($response.body);
      describeFields(startup, ["data", "result", "ad", "ads", "adInfo", "splash"]);
      const config = startup && startup.data;
      if (isRecord(config)) shape.splashConfigKeys = Object.keys(config).filter(key => /splash|startup.?ad|poplayer/i.test(key)).length;
      outcome = "observed-only";
      finish({});
      return;
    }
    if (diagnostics && isResponse && app === "bili-player") {
      describePlayerResponse();
      finish({});
      return;
    }
    // 仅观察这款 App 的明文 AMDC 调度响应；不记录设备 IP 或完整响应。
    if (diagnostics && isResponse && app === "xianyu-transport" &&
        /^http:\/\/(?:amdc\.m\.taobao\.com|(?:\d{1,3}\.){3}\d{1,3})(?::80)?\/amdc\/mobileDispatch\?(?:[^#]*&)?appkey=12431167(?:&|$)/.test(url)) {
      route = "xianyu-dispatch";
      parsedResponse = parseDispatchBody($response.body);
      transport = transportRoutes(parsedResponse);
      outcome = "observed-only";
      finish({});
      return;
    }
    if (isResponse && /^https?:\/\/(?:app\.bili(?:bili\.com|api\.net|api\.com)|api\.bilibili\.com)(?::443)?\/x\/v2\/splash\/(?:show|list|brand\/list|event\/list2)(?:\?|$)/.test(url)) {
      route = url.includes("/event/list2") ? "bili-event" : url.includes("/brand/list") ? "bili-brand" : url.includes("/splash/show") ? "bili-show" : "bili-list";
      const data = readResponse();
      outcome = data && data.code === 0 ? "unrecognized-format" : "non-success";
      describeFields(data && data.data, ["show", "list", "event_list", "preload", "account", "keep_ids", "max_time", "min_interval", "pull_interval", "disperse_interval", "splash_hot_show_interval", "max_count"]);
      if (diagnostics) shape.controlsBefore = splashControls(data && data.data);
      if (data && data.code === 0 && data.data && typeof data.data === "object" && !Array.isArray(data.data)) {
        let recognized = false;
        let changed = false;
        for (const key of ["show", "list", "event_list", "preload"]) {
          if (Array.isArray(data.data[key])) {
            recognized = true;
            if (data.data[key].length > 0) {
              data.data[key] = [];
              changed = true;
            }
          }
        }
        // 仅在已识别的开屏响应中清空已有 ID 数组，缺失或未知类型不改写。
        if (recognized && Array.isArray(data.data.keep_ids) && data.data.keep_ids.length > 0) {
          data.data.keep_ids = [];
          changed = true;
        }
        if (recognized && route === "bili-list") {
          for (const [key, target] of Object.entries(BILI_SPLASH_CONTROLS)) {
            const value = data.data[key];
            // 仅修改已有的合法非负 Int32；缺失和未知类型保持原样。
            if (Number.isInteger(value) && value >= 0 && value <= 2147483647 && value !== target) {
              data.data[key] = target;
              changed = true;
            }
          }
        }
        if (changed) {
          outcome = "filtered";
          finish({ body: JSON.stringify(data) });
          return;
        }
        if (recognized) outcome = "known-fields-empty";
      }
    }
    // 淘宝开屏与闲鱼共用淘宝服务，但使用独立网关和响应结构。
    // 只清已知素材数组；不伪造成功、不调整请求时间或缓存期限。
    if (isResponse && (taobaoImage || taobaoVideo)) {
      route = taobaoVideo ? "taobao-video" : "taobao-splash";
      const data = readResponse();
      const success = $response.status >= 200 && $response.status < 300 && data && Array.isArray(data.ret) &&
        data.ret.some(value => typeof value === "string" && /^SUCCESS::/.test(value));
      outcome = success ? "unrecognized-format" : "non-success";
      if (success && isRecord(data.data)) {
        let recognized = false;
        let removed = 0;
        if (route === "taobao-splash") {
          const containers = data.data.containers;
          const splash = isRecord(containers) && containers.splash_home_base;
          const base = isRecord(splash) && splash.base;
          describeFields(data.data, ["containers"]);
          describeFields(base, ["sections"]);
          if (isRecord(base) && Array.isArray(base.sections)) {
            for (const section of base.sections) {
              const biz = isRecord(section) && section.bizData;
              const ad = isRecord(biz) && biz["taobao-splash"];
              if (isRecord(ad) && Array.isArray(ad.data)) {
                recognized = true;
                removed += ad.data.length;
                if (ad.data.length) ad.data = [];
              }
            }
          }
        } else {
          describeFields(data.data, ["resources", "caches"]);
          for (const key of ["resources", "caches"]) {
            if (Array.isArray(data.data[key])) {
              recognized = true;
              removed += data.data[key].length;
              if (data.data[key].length) data.data[key] = [];
            }
          }
        }
        if (diagnostics) shape.removedCount = removed;
        if (removed > 0) {
          outcome = "filtered";
          finish({ body: JSON.stringify(data) });
          return;
        }
        if (recognized) outcome = "known-fields-empty";
      }
    }
    const xianyuSplash = ["mtop.taobao.idlecommerce.splash.async.ads", "mtop.taobao.idlecommerce.splash.ads"].includes(mtopApi);
    const xianyuFeed = ["mtop.taobao.idlehome.home.nextfresh", "mtop.taobao.idle.local.home", "mtop.taobao.idlemtopsearch.search"].includes(mtopApi);
    const xianyuPromotion = ["mtop.taobao.idle.user.strategy.list", "mtop.taobao.idlemtopsearch.search.shade", "mtop.taobao.idlemtopsearch.item.search.activate"].includes(mtopApi);
    if (isResponse && (xianyuSplash || (hasMtopVersion && (xianyuFeed || xianyuPromotion)))) {
      route = xianyuSplash ? (mtopApi.includes(".async.") ? "xianyu-async" : "xianyu-splash") : xianyuFeed ? "xianyu-feed" : "xianyu-promotion";
      const data = readResponse();
      const httpSuccess = $response.status >= 200 && $response.status < 300;
      const success = (!xianyuSplash || httpSuccess) && data && Array.isArray(data.ret) &&
        data.ret.some(value => typeof value === "string" && /^SUCCESS::/.test(value));
      outcome = success ? "unrecognized-format" : "non-success";
      if (xianyuSplash) describeFields(data && data.data, ["adMap", "dspList", "realTimeAd"]);
      if (success && isRecord(data.data)) {
        let changed = false;
        if (xianyuSplash && isRecord(data.data.adMap)) {
          const splash = data.data;
          changed = Object.keys(splash.adMap).length > 0;
          if (changed) splash.adMap = {};
          // 实机同步接口的空广告响应省略 realTimeAd，同时保留空 dspList。
          if (route === "xianyu-splash" && Array.isArray(splash.dspList) && splash.dspList.length === 0 &&
              isRecord(splash.realTimeAd) && Object.keys(splash.realTimeAd).length > 0) {
            delete splash.realTimeAd;
            changed = true;
          }
          if (!changed) outcome = "known-fields-empty";
        } else if (xianyuFeed || xianyuPromotion) {
          changed = removeMarkedCards(data.data, xianyuFeed ? ["sections", "cardList", "items", "homeTopList"] : ["strategies", "singleShadeWords", "cardList"]) > 0;
          outcome = "no-ad-markers";
        }
        if (changed) {
          outcome = "filtered";
          finish({ body: JSON.stringify(data) });
          return;
        }
      }
    }
    // 额外接口只观察结构，不改写尚未核实的广告响应。
    if (diagnostics && isResponse && route === "unmatched") {
      if (app === "bili" && /^https?:\/\/(?:app\.bili(?:bili\.com|api\.net|api\.com)|api\.bilibili\.com)(?::443)?\/x\/v2\/splash\/[^?]+(?:\?|$)/.test(url)) {
        route = "bili-other";
      } else if (app === "xianyu" && hasMtopVersion && mtopApi === "mtop.idle.idleadv.scene.restore") {
        route = "xianyu-restore";
      }
      if (route !== "unmatched") {
        readResponse();
        outcome = "observed-only";
      }
    }
    if (!isResponse && /^https?:\/\/switch\.jumpvg\.com(?::443)?\//.test(url)) {
      const path = url.split("?")[0].replace(/^https?:\/\/switch\.jumpvg\.com(?::443)?/, "");
      const arrays = ["/jump/ad/home/screen", "/jump/recommend/ad_conf", "/jump/notice/popup"];
      const objects = ["/jump/ad/kiko_down_page/conf"];
      const empty = ["/jump/getlaunchad/v2", "/jump/ad/home/screen/full_v2"];
      if ([...arrays, ...objects, ...empty].includes(path)) {
        const result = { success: true, code: 0, msg: "success" };
        if (arrays.includes(path)) result.data = [];
        if (objects.includes(path)) result.data = {};
        finish({ response: {
          status: 200,
          headers: { "Content-Type": "application/json; charset=utf-8" },
          body: JSON.stringify(result)
        } });
        return;
      }
    }
    if (isResponse && /^https?:\/\/app-api-32\.ihaique\.net(?::443)?\/api\/app\/v5\/appad\/cmd\/AppadGetSplashAds(?:\?|$)/.test(url)) {
      const data = readResponse();
      if (data && data.code === 0 && Array.isArray(data.body)) {
        data.body = [];
        if (Object.prototype.hasOwnProperty.call(data, "count")) data.count = 0;
        finish({ body: JSON.stringify(data) });
        return;
      }
    }
    if (isResponse && /^https?:\/\/app\.bilibili\.com(?::443)?\/[^?]+\/feed\/index(?:\?|$)/.test(url)) {
      const data = readResponse();
      if (data && data.data && Array.isArray(data.data.items)) {
        data.data.items = data.data.items.filter(item => {
          if (!item || typeof item !== "object" || isExplicitAd(item)) return false;
          if (Array.isArray(item.banner_item)) {
            item.banner_item = item.banner_item.filter(b => !(b && (b.is_ad || b.ad_banner)));
            if (item.banner_item.length === 0) return false;
          }
          if (item.ad_info) delete item.ad_info;
          return true;
        });
        finish({ body: JSON.stringify(data) });
        return;
      }
    }
  } catch (error) {
    outcome = error instanceof SyntaxError ? "invalid-json" : "error";
  }
  finish({});
})();
