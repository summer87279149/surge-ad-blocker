function purgeBanner(arr) {
  return arr.filter(item => {
    if (!item || typeof item !== 'object') {
      return false;
    }
    if (item.is_ad || item.card_goto === 'ad' || item.goto === 'ad') {
      return false;
    }
    if (Array.isArray(item.banner_item)) {
      item.banner_item = item.banner_item.filter(b => !(b && (b.is_ad || b.ad_banner)));
      if (item.banner_item.length === 0) {
        return false;
      }
    }
    if (item.ad_info) {
      delete item.ad_info;
    }
    return true;
  });
}

try {
  if (!$response.body) {
    $done({});
  }
  const obj = JSON.parse($response.body);
  if (obj && obj.data && Array.isArray(obj.data.items)) {
    obj.data.items = purgeBanner(obj.data.items);
  }
  $done({ body: JSON.stringify(obj) });
} catch (err) {
  $done({});
}
