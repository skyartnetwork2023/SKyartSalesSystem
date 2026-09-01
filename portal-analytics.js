(function () {
  if (typeof window === 'undefined') return;

  var CONFIG_POLL_INTERVAL = 500;
  var FLUSH_DELAY = 600;
  var slideSignature = null;
  var adSignature = null;
  var audioSignature = null;
  var videoMap = new WeakSet();
  var impressionQueue = [];
  var flushTimer = null;
  var client = null;

  function logDebug() {
    if (window.__PORTAL_ANALYTICS_DEBUG__) {
      var args = Array.prototype.slice.call(arguments);
      console.log.apply(console, ['[Portal Analytics]'].concat(args));
    }
  }

  function initClient() {
    if (client) return client;
    var cfg = window.__SUPABASE_CONFIG__ || window.supabaseConfig;
    if (!cfg || !cfg.url || !cfg.anonKey) {
      logDebug('Supabase config missing.');
      return null;
    }
    var lib = window.supabase || window.Supabase;
    if (!lib || typeof lib.createClient !== 'function') {
      logDebug('Supabase library not ready.');
      return null;
    }
    client = lib.createClient(cfg.url, cfg.anonKey);
    return client;
  }

  function queueImpression(bucketId, assetName, increment) {
    if (!bucketId || !assetName) {
      return;
    }
    // Fetch device/session info from query string
    function getQueryStringKey(key) {
      var q = window.location.search.substring(1);
      var s = /([^&;=]+)=?([^&;]*)/g;
      var r = {};
      while (e = s.exec(q)) {
        var k = decodeURIComponent(e[1]);
        var v = decodeURIComponent(e[2]);
        r[k] = v;
      }
      return r[key];
    }
    var clientMac = getQueryStringKey('clientMac');
    var apMac = getQueryStringKey('apMac');
    var clientIp = getQueryStringKey('clientIp');
    var payload = {
      bucketId: bucketId,
      assetName: assetName,
      viewDate: new Date().toISOString().slice(0, 10),
      increment: Math.max(1, increment || 1),
      clientMac: clientMac,
      apMac: apMac,
      clientIp: clientIp
    };
    impressionQueue.push(payload);
    scheduleFlush();
  }

  function scheduleFlush() {
    if (flushTimer) return;
    flushTimer = window.setTimeout(flushQueue, FLUSH_DELAY);
  }

  function flushQueue() {
    flushTimer = null;
    if (!impressionQueue.length) return;
    var supabaseClient = initClient();
    if (!supabaseClient) {
      logDebug('Unable to flush impressions; client missing.');
      impressionQueue.length = 0;
      return;
    }
    var batch = impressionQueue.splice(0, impressionQueue.length);
    batch.reduce(function (promise, item) {
      return promise.then(function () {
        return supabaseClient
          .rpc('increment_ad_metric', {
            p_bucket_id: item.bucketId,
            p_asset_name: item.assetName,
            p_view_date: item.viewDate,
            p_increment: item.increment,
            p_client_mac: item.clientMac,
            p_ap_mac: item.apMac,
            p_client_ip: item.clientIp
          })
          .then(function (result) {
            if (result && result.error) {
              logDebug('Failed to record impression', item, result.error);
            }
          });
      });
    }, Promise.resolve());
  }

  function deriveObjectPath(rawSource, bucketId) {
    if (!rawSource) return null;
    var cleaned = rawSource.replace(/['"\)\(]/g, '').trim();
    if (!cleaned) return null;
    try {
      var url = new URL(cleaned, window.location.href);
      var pathname = decodeURIComponent(url.pathname);
      var marker = bucketId ? '/storage/v1/object/public/' + bucketId + '/' : '/storage/v1/object/public/';
      var idx = pathname.indexOf(marker);
      if (idx >= 0) {
        return pathname.slice(idx + marker.length);
      }
      return pathname.split('/').pop();
    } catch (err) {
      var withoutQuery = cleaned.split('?')[0];
      var segments = withoutQuery.split('/');
      return decodeURIComponent(segments[segments.length - 1] || withoutQuery);
    }
  }

  function watchSlides() {
    var bucket = (window.__SUPABASE_CONFIG__ && window.__SUPABASE_CONFIG__.imageBucket) || 'media-bucket';
    var observer = new MutationObserver(function () {
      var active = document.querySelector('.gallery-slide.active');
      if (!active) return;
      var bgValue = active.style.backgroundImage || '';
      var objectPath = deriveObjectPath(extractUrlFromBackground(bgValue), bucket);
      var signature = objectPath + '::' + (active.dataset.sceneIndex || '0');
      if (signature === slideSignature) return;
      slideSignature = signature;
      queueImpression(bucket, objectPath, 1);
      logDebug('Slide impression', objectPath);
    });
    observer.observe(document.body, { attributes: true, subtree: true, attributeFilter: ['class', 'style'] });
  }

  function extractUrlFromBackground(bg) {
    var match = /url\(([^)]+)\)/i.exec(bg || '');
    return match ? match[1] : '';
  }

  function watchAdRail() {
    var bucket = (window.__SUPABASE_CONFIG__ && window.__SUPABASE_CONFIG__.imageBucket) || 'media-bucket';
    var track = document.getElementById('ads-track');
    if (!track) return;
    var observer = new MutationObserver(function () {
      var transform = track.style.transform || '';
      var match = /translateX\(-?(\d+(?:\.\d+)?)%\)/.exec(transform);
      var index = match ? Math.round(parseFloat(match[1]) / 100) : 0;
      var ads = window.PORTAL_ADS || [];
      if (!ads.length) return;
      var ad = ads[(index % ads.length + ads.length) % ads.length];
      if (!ad) return;
      var objectPath = deriveObjectPath(ad.background || ad.image, bucket);
      var signature = objectPath + '::' + index;
      if (signature === adSignature) return;
      adSignature = signature;
      queueImpression(bucket, objectPath, 1);
      logDebug('Ad impression', objectPath);
    });
    observer.observe(track, { attributes: true, attributeFilter: ['style'] });
  }

  function watchAudio() {
    var bucket = (window.__SUPABASE_CONFIG__ && window.__SUPABASE_CONFIG__.audioBucket) || 'audios';
    var audioEl = document.getElementById('portal-audio');
    if (!audioEl) return;
    var record = function () {
      var source = audioEl.currentSrc || (audioEl.src || '');
      var objectPath = deriveObjectPath(source, bucket);
      if (!objectPath) return;
      var signature = objectPath + '::' + Math.floor(audioEl.currentTime || 0);
      if (signature === audioSignature) return;
      audioSignature = signature;
      queueImpression(bucket, objectPath, 1);
      logDebug('Audio impression', objectPath);
    };
    audioEl.addEventListener('play', record);
    audioEl.addEventListener('ended', function () {
      audioSignature = null;
    });
  }

  function watchVideos() {
    var bucket = (window.__SUPABASE_CONFIG__ && window.__SUPABASE_CONFIG__.videoBucket) || 'videos';
    var videos = document.querySelectorAll('video');
    videos.forEach(function (videoEl) {
      if (videoMap.has(videoEl)) return;
      videoMap.add(videoEl);
      videoEl.addEventListener('play', function () {
        var source = videoEl.currentSrc || (videoEl.src || '');
        if (!source && videoEl.firstElementChild && videoEl.firstElementChild.src) {
          source = videoEl.firstElementChild.src;
        }
        var objectPath = deriveObjectPath(source, bucket);
        if (!objectPath) return;
        queueImpression(bucket, objectPath, 1);
        logDebug('Video impression', objectPath);
      });
    });
  }

  function waitForReady() {
    if (!initClient()) {
      window.setTimeout(waitForReady, CONFIG_POLL_INTERVAL);
      return;
    }
    watchSlides();
    watchAdRail();
    watchAudio();
    watchVideos();
    setInterval(watchVideos, 5000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', waitForReady);
  } else {
    waitForReady();
  }
})();
