/* Kabi stage 4: Apple Music playback page on the NetEase vinyl view. */
(function startStage() {
  // Single source of truth for the version. Every guard below reads STAGE_VERSION, so a
  // release bump can never leave one site (a negated compare, a cached marker) behind and
  // silently disable the whole stage.
  var STAGE_VERSION = "133";
  // Page.addScriptToEvaluateOnNewDocument can run before <html> exists. Do not set the
  // installed marker and then crash: attach in the parser's first document mutation,
  // before its first paint. The previous bootstrap is always disposable.
  if (!document.documentElement) {
    if (window.__kabiStageBootstrapDispose) window.__kabiStageBootstrapDispose();
    var bootstrap = new MutationObserver(function () {
      if (!document.documentElement) return;
      bootstrap.disconnect();
      delete window.__kabiStageBootstrapDispose;
      startStage();
    });
    bootstrap.observe(document, { childList: true });
    window.__kabiStageBootstrapDispose = function () { bootstrap.disconnect(); };
    return;
  }
  if (window.__kabiStage === STAGE_VERSION) return;
  if (window.__kabiStageDispose) window.__kabiStageDispose();
  window.__kabiStage = STAGE_VERSION;
  // Upgrade repair: pre92 releases pinned the host column inline. Removing our
  // stylesheet cannot undo those old writes. Ask the observed host Qt layout
  // callback to recompute its own sizes once; new versions never own that style.
  // This is guarded to NetEase's inspected layout/ref shape, not a guessed size.
  (function recoverLegacyColumn() {
    var display = document.querySelector("#vinyl-page-container .display");
    if (!display || display.style.getPropertyPriority("position") !== "important" || display.style.position !== "fixed" || display.style.getPropertyPriority("max-height") !== "important") return;
    var key = Object.keys(display).find(function (k) { return k.indexOf("__reactInternalInstance") === 0; });
    var fiber = key && display[key];
    for (var depth = 0; fiber && depth < 12; depth++, fiber = fiber.return) {
      var hooks = [], h = fiber.memoizedState;
      for (var n = 0; h && n < 20; n++, h = h.next) hooks.push(h.memoizedState);
      var columnRef = hooks.find(function (v) { return v && v.current === display; });
      var sizeRef = hooks.find(function (v) { return v && v.current && typeof v.current.width === "number" && typeof v.current.height === "number"; });
      var callback = hooks.find(function (v) { return Array.isArray(v) && typeof v[0] === "function" && v[0].toString().indexOf("updateSize") >= 0 && v[0].toString().indexOf("style.cssText") >= 0; });
      if (!columnRef || !sizeRef || !callback) continue;
      var previous = sizeRef.current;
      try {
        sizeRef.current = Object.assign({}, previous, { width: -1, height: -1 });
        callback[0]();
        window.__reappleLegacyColumnRepair = { version: STAGE_VERSION, restored: display.style.getPropertyPriority("position") !== "important" };
      } catch (error) { sizeRef.current = previous; console.warn("Reapple Music: native column upgrade recovery failed", error); }
      return;
    }
    console.warn("Reapple Music: legacy column detected; host layout shape changed. Restart NetEase once to clear old inline geometry.");
  })();

  var reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  // Component switches.  The injector reads ~/.reapple/config.json and puts the result on
  // window.__reappleConfig before this payload runs, so a switch flip takes effect on the next
  // injection without the payload ever having to know where the setting came from.  A key that is
  // missing falls back to the default here rather than to `undefined`, so an older config file
  // added after this version still boots, and an unknown key is ignored rather than fatal -- the
  // first release of this schema cannot know what the tenth one will ask for.
  //
  // `playPage` is the master: when it is off the page never claims `html.kabi-on`, which is what
  // stops the host from hiding its own chrome.  The rest are independent, and each one has to be
  // able to stand alone -- turning lyrics off must not disturb the playback bar, which is the whole
  // point of a per-component switch.
  var CFG = (function () {
    var defaults = {
      playPage: true,     // master: the replicated Now Playing page at all
      backdrop: true,     // the sampled-and-graded album colour wash
      artwork: true,      // the floating artwork card and its play/pause animation
      songInfo: true,     // title / artist / album
      playbackBar: true,  // elapsed, remaining, scrubber
      lyrics: true,       // the synced lyric list and its scroll algorithm
      footer: true,       // the two liquid-glass buttons, bottom right
      queue: true,        // the queue sheet the right-hand button opens
      lyricHoverClear: true,
      lyricScrollClear: true,
      qualityCompact: true,
      miniBar: true,      // native-state floating capsule
      miniBarMaterial: "frosted", // frosted / glass (approximation) / solid
      sidebarRounded: true,
      coverRounded: true,
      albumRounded: true,
      searchFilled: true,
      appleSongList: true,
      showTrackMV: true,
      showTrackQuality: true,
      showTrackNumber: true,
      showTrackVIP: false
    };
    // Re-read rather than latch: the injector rewrites window.__reappleConfig whenever the config
    // file changes and bumps the payload version, and re-reading here as well means a flip is
    // picked up by the next tick even if the version bump did not happen.
    return function read() {
      var out = {};
      var src = window.__reappleConfig || {};
      var pending = readPendingSettings();
      Object.keys(defaults).forEach(function (k) {
        out[k] = pending && validPluginSetting(k, pending.values[k]) ? pending.values[k] : validPluginSetting(k, src[k]) ? src[k] : defaults[k];
      });
      return out;
    };
  })();
  // Settings are app-local, not a network service. UI writes a small validated pending record;
  // the existing local injector consumes it into config.json atomically on its next pass.
  var REAPPLE_PENDING_KEY = "reapple.settings.pending.v1";
  var REAPPLE_KEYS = ["playPage", "backdrop", "artwork", "songInfo", "playbackBar", "lyrics", "footer", "queue", "lyricHoverClear", "lyricScrollClear", "qualityCompact", "miniBar", "miniBarMaterial", "sidebarRounded", "coverRounded", "albumRounded", "searchFilled", "appleSongList", "showTrackMV", "showTrackQuality", "showTrackNumber", "showTrackVIP"];
  var settingsView_ = null;
  var lyricMenu_ = null;
  function readPendingSettings() {
    try {
      var p = window.__reapplePendingSettings || JSON.parse(localStorage.getItem(REAPPLE_PENDING_KEY) || "null");
      return p && typeof p === "object" && p.values && typeof p.values === "object" ? p : null;
    } catch (_) { return window.__reapplePendingSettings || null; }
  }
  function validPluginSetting(key, value) {
    return key === "miniBarMaterial" ? ["frosted", "glass", "solid"].indexOf(value) >= 0 : typeof value === "boolean";
  }
  function setPluginSetting(key, value) {
    if (REAPPLE_KEYS.indexOf(key) < 0 || !validPluginSetting(key, value)) return;
    var old = readPendingSettings(), values = {};
    REAPPLE_KEYS.forEach(function (name) { if (old && validPluginSetting(name, old.values[name])) values[name] = old.values[name]; });
    values[key] = value;
    var pending = { at: Date.now(), baseKey: window.__reappleSettingsKey || "", values: values };
    window.__reapplePendingSettings = pending;
    try { localStorage.setItem(REAPPLE_PENDING_KEY, JSON.stringify(pending)); }
    catch (_) { pending.storageFailed = true; }
    dirty.all = true;
    tick();
  }
  function nativeLyricState() {
    var store = hostStore_ || queueStore(), state = store && store.getState();
    var lyric = state && state["async:lyric"] || {};
    return { mode: state && state.setting && state.setting.lyricMode || "none",
      translation: !!(lyric.tlyricLines && lyric.tlyricLines.length),
      roman: !!(lyric.romaLyricLines && lyric.romaLyricLines.length) };
  }
  function setNativeLyricMode(mode) {
    if (["none", "translate", "roman"].indexOf(mode) < 0) return;
    var store = hostStore_ || queueStore();
    if (!store) return;
    // HOST-mode72.js LyricOperator uses precisely this action. It persists through the
    // host's updateSetting effect, and updates the native renderer and desktop lyrics.
    store.dispatch({ type: "setting/changeLyricMode", payload: { type: mode === "none" ? "translate" : mode, checked: mode !== "none" } });
    dirty.all = true;
    schedule("all");
  }
  function scrubControlTemplate(node) {
    [node].concat([].slice.call(node.querySelectorAll("*"))).forEach(function (el) {
      [].slice.call(el.attributes).forEach(function (a) {
        if (a.name === "id" || a.name === "_nk" || a.name === "datalog" || a.name.indexOf("data-") === 0 || a.name.indexOf("aria-") === 0 || a.name.indexOf("on") === 0) el.removeAttribute(a.name);
      });
    });
    return node;
  }
  function closeSettingsPanel(view) {
    view = view || settingsView_;
    if (!view || !view.open) return;
    view.open = false;
    view.main.removeAttribute("data-reapple-settings-open");
    view.panel.hidden = true;
    view.link.classList.remove("cmd-anchor-link-title-active");
    view.link.removeAttribute("aria-current");
    if (view.savedActive && view.savedActive.isConnected) view.savedActive.classList.add("cmd-anchor-link-title-active");
    view.scroller.scrollTop = view.savedScroll || 0;
  }
  function disposeSettingsPanel() {
    var view = settingsView_;
    if (!view) return;
    closeSettingsPanel(view);
    view.nav.removeEventListener("click", view.navigate, true);
    view.nav.removeEventListener("keydown", view.keydown);
    view.observer.disconnect();
    view.tab.remove(); view.panel.remove(); settingsView_ = null;
  }
  function refreshSettingsPanel() {
    var view = settingsView_;
    if (!view) return;
    var native = nativeLyricState();
    Object.keys(view.controls).forEach(function (key) {
      var item = view.controls[key], on = !!cfg[key];
      item.input.checked = on; item.input.setAttribute("aria-checked", String(on));
      ["cmd-checkbox-checked", "cmd-checkbox-unChecked"].forEach(function (c) {
        var wanted = c === (on ? "cmd-checkbox-checked" : "cmd-checkbox-unChecked");
        if (item.control.classList.contains(c) !== wanted) item.control.classList.toggle(c, wanted);
      });
      var inner = item.control.querySelector(".cmd-checkbox-inner");
      if (inner.classList.contains("cmd-checkbox-inner-checked") !== on) inner.classList.toggle("cmd-checkbox-inner-checked", on);
      var mark = item.control.querySelector(".cmd-checkbox-inner-display");
      if (on && !mark.firstChild) mark.appendChild(view.tick.cloneNode(true));
      if (!on && mark.firstChild) mark.replaceChildren();
    });
    view.radios.concat(view.materials || []).forEach(function (item) {
      var on = item.input.value === (item.input.name === "reapple-mini-material" ? cfg.miniBarMaterial : native.mode);
      item.input.checked = on; item.input.setAttribute("aria-checked", String(on));
      if (item.control.classList.contains("cmd-radio-checked") !== on) item.control.classList.toggle("cmd-radio-checked", on);
      var inner = item.control.querySelector(".cmd-radio-inner");
      if (inner.classList.contains("cmd-radio-inner-checked") !== on) inner.classList.toggle("cmd-radio-inner-checked", on);
      var mark = item.control.querySelector(".cmd-radio-inner-display");
      if (on && !mark.firstChild && view.radioTick) mark.appendChild(view.radioTick.cloneNode(true));
      if (!on && mark.firstChild) mark.replaceChildren();
    });
    var pending = readPendingSettings();
    var status = pending ? pending.storageFailed ? "已即时应用；本地存储不可用，等待本机注入器保存。" : "已即时应用并暂存；本机配置同步中（最长约20秒）。" : "设置已保存；重启后继续生效。";
    if (view.status.textContent !== status) view.status.textContent = status;
    var availability = "当前歌曲：" + (native.translation ? "有翻译" : "无翻译") + " · " + (native.roman ? "有罗马音" : "无罗马音") + "。缺失版本不会自动生成。";
    if (view.availability.textContent !== availability) view.availability.textContent = availability;
    if (view.open) {
      view.nav.querySelectorAll(".cmd-anchor-link-title-active").forEach(function (el) { if (el !== view.link) el.classList.remove("cmd-anchor-link-title-active"); });
      if (!view.link.classList.contains("cmd-anchor-link-title-active")) view.link.classList.add("cmd-anchor-link-title-active");
    }
  }
  function syncSettingsPanel() {
    var scroller = document.getElementById("page_pc_setting");
    var main = scroller && scroller.querySelector(":scope > main");
    var nav = scroller && scroller.parentElement.querySelector(".cmd-anchor-link-wrapper");
    if (!scroller || !main || !nav) { if (settingsView_) disposeSettingsPanel(); return; }
    if (settingsView_ && (settingsView_.main !== main || !settingsView_.tab.isConnected || !settingsView_.panel.isConnected)) disposeSettingsPanel();
    if (settingsView_) { refreshSettingsPanel(); return; }
    var sample = scroller.querySelector(".cmd-checkbox"), radioSample = scroller.querySelector(".cmd-radio");
    var sectionSample = document.getElementById("normalMac"), anchorSample = nav.querySelector(".cmd-anchor-link");
    var tickSample = scroller.querySelector(".cmd-checkbox-inner-display > *");
    var radioTick = scroller.querySelector(".cmd-radio-inner-checked .cmd-radio-inner-display > *");
    if (!sample || !sectionSample || !anchorSample || !tickSample || !radioSample) return;
    var panel = document.createElement("section"); panel.id = "reapple-settings-panel";
    panel.className = "reapple-settings-page"; panel.hidden = true;
    var heading = document.createElement("h3"); heading.textContent = "Reapple Music"; panel.appendChild(heading);
    var content = document.createElement("div"); content.className = "content"; panel.appendChild(content);
    var tab = document.createElement("div"); tab.id = "reapple-settings-tab"; tab.className = anchorSample.className; tab.setAttribute("role", "listitem");
    var link = document.createElement("div"); link.id = "reapple-settings-link"; link.className = "cmd-anchor-link-title"; link.textContent = "Reapple Music"; link.title = "Reapple Music"; link.tabIndex = 0; link.setAttribute("role", "link"); link.setAttribute("aria-controls", panel.id); tab.appendChild(link);
    var view = { nav: nav, scroller: scroller, main: main, panel: panel, tab: tab, link: link, open: false, controls: {}, radios: [], tick: scrubControlTemplate(tickSample.cloneNode(true)) };
    function group(name) {
      var section = document.createElement("section"); section.className = "reapple-settings-group";
      var h4 = document.createElement("h4"); h4.textContent = name; section.appendChild(h4); content.appendChild(section); return section;
    }
    function checkbox(group, key, title, disabled) {
      var label = document.createElement("label"); label.className = "list-item";
      var control = scrubControlTemplate(sample.cloneNode(true)), input = control.querySelector("input");
      var addon = control.querySelector(".cmd-checkbox-addon"); addon.textContent = title;
      input.id = "reapple-config-" + key; input.setAttribute("aria-label", title); input.disabled = !!disabled; input.checked = disabled ? false : !!cfg[key];
      control.querySelector(".cmd-checkbox-inner-display").replaceChildren();
      label.appendChild(control); group.appendChild(label);
      if (disabled) { control.classList.remove("cmd-checkbox-checked"); control.classList.add("cmd-checkbox-unChecked"); control.querySelector(".cmd-checkbox-inner").classList.remove("cmd-checkbox-inner-checked"); label.title = "后续计划，当前版本未实现"; control.classList.add("cmd-checkbox-disabled"); return; }
      input.addEventListener("change", function () { setPluginSetting(key, input.checked); });
      view.controls[key] = { input: input, control: control };
    }
    var master = group("插件开关"); checkbox(master, "playPage", "启用 Reapple Music");
    var modules = group("播放页组件");
    [["backdrop", "专辑氛围背景"], ["artwork", "专辑封面"], ["songInfo", "歌曲信息"], ["playbackBar", "进度条与时间"], ["lyrics", "歌词"], ["footer", "歌词／队列按钮"], ["queue", "播放列表"]].forEach(function (row) { checkbox(modules, row[0], row[1]); });
    var audio = group("音质卡片"); checkbox(audio, "qualityCompact", "简化音质卡片");
    var browsing = group("歌词交互"); checkbox(browsing, "lyricHoverClear", "悬停歌词行清晰显示"); checkbox(browsing, "lyricScrollClear", "手动浏览时全部清晰");
    var language = group("歌词版本");
    [["none", "原文"], ["translate", "翻译"], ["roman", "罗马音"]].forEach(function (row) {
      var label = document.createElement("label"); label.className = "list-item";
      var control = scrubControlTemplate(radioSample.cloneNode(true)), input = control.querySelector("input");
      input.name = "reapple-native-lyric-mode"; input.value = row[0]; input.setAttribute("aria-label", row[1]);
      control.querySelector(".cmd-radio-addon").textContent = row[1];
      control.querySelector(".cmd-radio-inner-display").replaceChildren();
      label.appendChild(control); language.appendChild(label); view.radios.push({ input: input, control: control });
      input.addEventListener("change", function () { if (input.checked) setNativeLyricMode(row[0]); });
    });
    var availability = document.createElement("p"); view.availability = availability; language.appendChild(availability);
    var hint = document.createElement("p"); hint.textContent = "沿用网易云歌词版本，也可右键点击播放器的歌词按钮切换。"; language.appendChild(hint);
    var capsule = group("悬浮播放栏"); checkbox(capsule, "miniBar", "启用悬浮胶囊播放栏");
    view.materials = [];
    [["frosted", "毛玻璃"], ["glass", "增强玻璃（网页近似）"], ["solid", "纯色"]].forEach(function (row) {
      var label = document.createElement("label"); label.className = "list-item";
      var control = scrubControlTemplate(radioSample.cloneNode(true)), input = control.querySelector("input");
      input.name = "reapple-mini-material"; input.value = row[0]; input.setAttribute("aria-label", row[1]);
      control.querySelector(".cmd-radio-addon").textContent = row[1]; control.querySelector(".cmd-radio-inner-display").replaceChildren();
      label.appendChild(control); capsule.appendChild(label); view.materials.push({ input: input, control: control });
      input.addEventListener("change", function () { if (input.checked) setPluginSetting("miniBarMaterial", row[0]); });
    });
    var materialHint = document.createElement("p"); materialHint.textContent = "沿用原生播放控件。增强玻璃是网页近似，不包含系统级折射；关闭后恢复原底栏。"; capsule.appendChild(materialHint);
    var shapes = group("主界面外观");
    checkbox(shapes, "sidebarRounded", "侧栏圆角");
    checkbox(shapes, "coverRounded", "封面圆角");
    checkbox(shapes, "albumRounded", "专辑页圆角与胶囊按钮");
    checkbox(shapes, "searchFilled", "无边框搜索栏");
    var tracks = group("歌曲列表");
    checkbox(tracks, "appleSongList", "Apple Music 歌曲列表布局");
    checkbox(tracks, "showTrackMV", "MV 图标");
    checkbox(tracks, "showTrackQuality", "音质图标");
    checkbox(tracks, "showTrackNumber", "歌曲序号");
    checkbox(tracks, "showTrackVIP", "VIP 标记");
    var trackHint = document.createElement("p"); trackHint.textContent = "歌名下显示专辑，歌手独立成列。隐藏序号仍可悬停封面播放；歌手列仅展示，不提供排序。"; tracks.appendChild(trackHint);
    var shapeHint = document.createElement("p"); shapeHint.textContent = "分别开启或关闭，不改变原生导航、收藏与播放逻辑。"; shapes.appendChild(shapeHint);
    // Stage109: use the host settings pattern — category at left, related options
    // flowing horizontally at right. Retain the same inputs and change listeners.
    browsing.querySelector("h4").textContent = "歌词";
    var lyricVersionHeading = document.createElement("h5"); lyricVersionHeading.textContent = "歌词版本";
    browsing.appendChild(lyricVersionHeading);
    while (language.children.length > 1) browsing.appendChild(language.children[1]);
    language.remove();
    [master, tracks, shapes, capsule, modules, browsing].forEach(function (group) {
      var options = document.createElement("div"); options.className = "reapple-settings-options";
      while (group.children.length > 1) options.appendChild(group.children[1]);
      group.appendChild(options); content.appendChild(group);
    });
    [tracks, capsule].forEach(function (group) { group.querySelector("label").classList.add("reapple-setting-wide"); });
    [capsule, browsing].forEach(function (group) {
      var options = group.querySelector(".reapple-settings-options"), radios = [].slice.call(options.querySelectorAll(":scope > label:has(input[type=radio])"));
      if (!radios.length) return;
      var choices = document.createElement("div"); choices.className = "reapple-settings-choices";
      choices.setAttribute("role", "radiogroup"); choices.setAttribute("aria-label", group === capsule ? "播放栏材质" : "歌词版本");
      if (group === capsule) { var title = document.createElement("h5"); title.textContent = "播放栏材质"; options.insertBefore(title, radios[0]); }
      options.insertBefore(choices, radios[0]); radios.forEach(function (label) { choices.appendChild(label); });
    });
    var status = document.createElement("p"); status.id = "reapple-settings-status"; status.setAttribute("role", "status"); view.status = status; content.appendChild(status);
    view.navigate = function (event) {
      var target = event.target.closest(".cmd-anchor-link-title"); if (!target) return;
      if (target !== link) { closeSettingsPanel(view); return; }
      event.preventDefault(); event.stopPropagation();
      if (!view.open) { view.savedScroll = scroller.scrollTop; view.savedActive = nav.querySelector(".cmd-anchor-link-title-active"); }
      view.open = true; main.setAttribute("data-reapple-settings-open", "true"); panel.hidden = false; link.setAttribute("aria-current", "page"); scroller.scrollTop = 0; refreshSettingsPanel();
    };
    view.keydown = function (event) { if (event.target === link && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); link.click(); } };
    view.observer = new MutationObserver(function () { if (view.open) refreshSettingsPanel(); });
    view.tick.setAttribute("aria-hidden", "true");
    view.radioTick = radioTick && scrubControlTemplate(radioTick.cloneNode(true));
    if (view.radioTick) view.radioTick.setAttribute("aria-hidden", "true");
    settingsView_ = view; main.appendChild(panel); nav.appendChild(tab);
    nav.addEventListener("click", view.navigate, true); nav.addEventListener("keydown", view.keydown);
    view.observer.observe(nav, { subtree: true, attributes: true, attributeFilter: ["class"] });
    refreshSettingsPanel();
  }
  function closeLyricMenu() {
    if (lyricMenu_) { lyricMenu_.remove(); lyricMenu_ = null; }
  }
  function lyricMenuOutside(event) { if (lyricMenu_ && !lyricMenu_.contains(event.target)) closeLyricMenu(); }
  function lyricMenuKey(event) { if (event.key === "Escape") { closeLyricMenu(); if (foot) foot.lyric.focus(); } }
  function openLyricMenu(event) {
    event.preventDefault(); closeLyricMenu();
    var native = nativeLyricState(), root = document.getElementById("vinyl-page-container"); if (!root) return;
    var menu = document.createElement("div"); menu.id = "reapple-lyric-menu"; menu.setAttribute("role", "menu"); menu.setAttribute("aria-label", "歌词版本");
    [["none", "原文", true], ["translate", "翻译", native.translation], ["roman", "罗马音", native.roman]].forEach(function (row) {
      var b = document.createElement("button"); b.type = "button"; b.textContent = row[1] + (row[2] ? "" : "（此歌曲无内容）"); b.disabled = !row[2]; b.setAttribute("role", "menuitemradio"); b.setAttribute("aria-checked", String(native.mode === row[0]));
      b.addEventListener("click", function () { setNativeLyricMode(row[0]); closeLyricMenu(); foot.lyric.focus(); }); menu.appendChild(b);
    });
    root.appendChild(menu); lyricMenu_ = menu;
    var box = foot.lyric.getBoundingClientRect(), view = stageBox();
    // Functional NetEase adaptation, not an Apple-measured extra component. Appears only
    // on request; leaves the existing pill, artwork, lyric columns and their geometry intact.
    var width = menu.offsetWidth, height = menu.offsetHeight;
    pin(menu, Math.max(view.left, Math.min(box.left, view.right - width)), Math.max(view.top, box.top - height), width, height);
    menu.style.setProperty("z-index", "60", "important"); menu.querySelector("button:not(:disabled)").focus();
  }
  var popupStyles_ = new Map();
  function returnNativeControls() {
    popupStyles_.forEach(function (style, el) { if (el.isConnected) { if (style == null) el.removeAttribute("style"); else el.setAttribute("style", style); } });
    popupStyles_.clear();
    document.querySelectorAll("#kabi-stack .slider-vinyl").forEach(function (slider) {
      var home = slider._kabiHome;
      if (home && home.parent && home.parent.isConnected) { home.parent.insertBefore(slider, home.next && home.next.parentNode === home.parent ? home.next : null); delete slider._kabiHome; }
    });
    borrowedControls_.forEach(function (el) {
      var home = el._kabiControlHome;
      if (home && home.parent && home.parent.isConnected && el.isConnected) home.parent.insertBefore(el, home.next && home.next.parentNode === home.parent ? home.next : null);
      ["data-role", "aria-label"].forEach(function (attr) { var value = home && home[attr === "data-role" ? "role" : "label"]; if (value == null) el.removeAttribute(attr); else el.setAttribute(attr, value); });
      el.removeAttribute("data-kabi-native"); el.style.removeProperty("--kabi-more-icon"); delete el._kabiControlHome;
    });
    document.querySelectorAll(".reapple-quality-toggle").forEach(function (el) { el.remove(); });
    document.querySelectorAll(".reapple-quality-compact").forEach(function (el) { el.classList.remove("reapple-quality-compact"); });
    borrowedControls_.clear();
  }

  // Apple native AX reference: APPLE93-CAPSULE-OUTER.json (700x54pt outer frame,
  // 9pt inset,148pt transport,385pt metadata,148pt utilities,34pt artwork).
  // The host retains all original React children and handlers. Only owned overlays
  // and CSS change the presentation; no second player or copied playback state.
  var miniView_ = null;
  function disposeMiniBar() {
    var v = miniView_; if (!v) return;
    if (v.cleanup) v.cleanup();
    v.root.removeAttribute("data-mini-scrubbing");
    v.bindings.forEach(function (b) { b.button.removeEventListener("click", b.click); });
    v.nodes.forEach(function (n) { n.remove(); });
    v.root.querySelectorAll("[data-reapple-control]").forEach(function (n) { n.removeAttribute("data-reapple-control"); });
    v.root.classList.remove("reapple-mini"); v.root.removeAttribute("data-material");
    v.root.style.removeProperty("--reapple-mini-sidebar");
    v.host.classList.remove("reapple-mini-host"); miniView_ = null;
  }
  function resolveMiniControls(root) {
    var map = {
      tid_btn_pc_minibar_vinyl: ".miniVinylWrapper",
      tid_playbar_controls: ".middle .btns",
      tid_playbar_prev_btn: ".cmd-icon-pre", tid_playbar_play_btn: ".cmd-icon-play,.cmd-icon-pause",
      tid_playbar_next_btn: ".cmd-icon-next", tid_playbar_playlist_btn: ".cmd-icon-playlist",
      tid_redstar_btn: ".cmd-icon-like_number_red,.cmd-icon-like_number,.cmd-icon-likenumber_red,.cmd-icon-likenumber",
      tid_playbar_comment_btn: ".cmd-icon-comment_number", tid_playbar_collect_btn: ".cmd-icon-collect",
      tid_playbar_lyric_btn: ".cmd-icon-lyric", tid_playbar_volume_btn: ".cmd-icon-Volume2,.cmd-icon-Volume1,.cmd-icon-Volume0,.cmd-icon-volume",
      tid_playmode_btn: ".middle .cmd-icon-shuffle,.middle .cmd-icon-playorder,.middle .cmd-icon-repeat,.middle .cmd-icon-singlecycle"
    };
    var found = {};
    Object.keys(map).forEach(function (key) {
      var e = root.querySelector('[data-testid="' + key + '"]') || root.querySelector(map[key]);
      if (e && e.classList.contains("cmd-icon")) { e = e.closest("button"); if (key === "tid_playmode_btn" && e) e = e.parentElement; }
      if(e) found[key] = e;
    });
    var quality = root.querySelector('[data-testid="tid_playbar_soundquality"]') || root.querySelector('.right .cmd-tag')?.parentElement;
    if (quality) found.tid_playbar_soundquality = quality;
    // Unknown host layouts stay native: never apply half a capsule around missing controls.
    var required = ["tid_btn_pc_minibar_vinyl", "tid_playbar_controls", "tid_playbar_prev_btn", "tid_playbar_play_btn", "tid_playbar_next_btn", "tid_playbar_playlist_btn"];
    if (required.some(function (key) { return !found[key]; })) return null;
    Object.keys(found).forEach(function (key) { if(found[key].getAttribute("data-reapple-control") !== key) found[key].setAttribute("data-reapple-control", key); });
    return found;
  }
  function syncMiniBar() {
    var root = [].find.call(document.querySelectorAll("#page_pc_mini_bar"), function (e) { return !e.closest("#vinyl-page-container"); });
    var enabled = cfg.playPage && cfg.miniBar;
    if (!enabled || !root || !root.querySelector(".default-bar-wrapper")) { disposeMiniBar(); return; }
    if (miniStyle && !miniStyle.isConnected) document.head.appendChild(miniStyle);
    if (!resolveMiniControls(root)) { disposeMiniBar(); root.classList.remove("reapple-mini"); root.closest("footer")?.classList.remove("reapple-mini-host"); return; }
    if (miniView_ && (miniView_.root !== root || !miniView_.playGlyph || !miniView_.playGlyph.isConnected || miniView_.bindings.some(function (b) { return !b.button.isConnected; }))) disposeMiniBar();
    if (!miniView_) {
      var host = root.closest("footer"); if (!host) return;
      resolveMiniControls(root);
      var v = { root: root, host: host, nodes: [], bindings: [] }; miniView_ = v;
      [["prev", "tid_playbar_prev_btn"], ["play", "tid_playbar_play_btn"], ["next", "tid_playbar_next_btn"]].forEach(function (row) {
        var button = root.querySelector('[data-reapple-control="' + row[1] + '"]'); if (!button) return;
        var glyph = document.createElement("span"); glyph.className = "reapple-mini-glyph"; glyph.setAttribute("aria-hidden", "true"); glyph.setAttribute("data-mini-role", row[0]);
        button.appendChild(glyph); v.nodes.push(glyph);
        if (row[0] !== "play") {
          ensureSkipGlyph(glyph);
          var click = function () { animateSkipGlyph(glyph, row[0]); };
          button.addEventListener("click", click); v.bindings.push({ button: button, click: click });
        } else v.playGlyph = glyph;
      });
      // Native combines shuffle/repeat in one menu. Keep its mode control and add
      // an explicit repeat button backed by the already-verified native action.
      var repeat = document.createElement("button"); repeat.type = "button"; repeat.className = "reapple-mini-repeat";
      repeat.addEventListener("click", function () { switchMode("repeat"); }); root.appendChild(repeat); v.nodes.push(repeat); v.repeat = repeat;
      var times = document.createElement("div"); times.className = "reapple-mini-times"; times.setAttribute("aria-hidden", "true");
      times.innerHTML = "<span></span><span></span>"; root.appendChild(times); v.nodes.push(times); v.times = times;
      // Keep the actual React range and its pointer capture. Observe, never seek independently.
      var updateTimes = function () {
        var input = root.querySelector('.slider-default input[type="range"]');
        var total = input ? Number(input.max) : 0, current = input ? Number(input.value) : 0;
        function format(t) { t = Math.max(0, Math.floor(Number.isFinite(t) ? t : 0)); return Math.floor(t / 60) + ":" + String(t % 60).padStart(2, "0"); }
        var elapsed = format(current), remaining = "−" + format(Math.ceil(total - current));
        if (times.firstChild.textContent !== elapsed) times.firstChild.textContent = elapsed;
        if (times.lastChild.textContent !== remaining) times.lastChild.textContent = remaining;
      };
      var down = function (e) { if (e.target.closest(".slider-default")) { root.setAttribute("data-mini-scrubbing", "true"); updateTimes(); } };
      var up = function () { root.removeAttribute("data-mini-scrubbing"); updateTimes(); };
      root.addEventListener("pointerdown", down, true); root.addEventListener("input", updateTimes); root.addEventListener("change", updateTimes);
      document.addEventListener("pointerup", up, true); document.addEventListener("pointercancel", up, true); window.addEventListener("blur", up);
      v.updateTimes = updateTimes;
      v.cleanup = function () { root.removeEventListener("pointerdown", down, true); root.removeEventListener("input", updateTimes); root.removeEventListener("change", updateTimes); document.removeEventListener("pointerup", up, true); document.removeEventListener("pointercancel", up, true); window.removeEventListener("blur", up); };
    }
    var v = miniView_;
    if (!root.classList.contains("reapple-mini")) root.classList.add("reapple-mini");
    if (!v.host.classList.contains("reapple-mini-host")) v.host.classList.add("reapple-mini-host");
    var material = cfg.miniBarMaterial;
    if (root.getAttribute("data-material") !== material) root.setAttribute("data-material", material);
    var player = document.getElementById("vinyl-page-container"), main = player && player.parentElement;
    var sidebar = Math.max(0, Math.min(window.innerWidth / 2, main ? main.getBoundingClientRect().left : 0));
    var left = sidebar + "px"; if (root.style.getPropertyValue("--reapple-mini-sidebar") !== left) root.style.setProperty("--reapple-mini-sidebar", left);
    // React may replace the range on track changes. Reattach only our paint layer;
    // leave the native slider, input, hotzone, fill widths and handlers untouched.
    var rail = root.querySelector(".slider-default");
    if (rail && !rail.querySelector(".reapple-mini-track-shell")) {
      var shell = document.createElement("span"); shell.className = "reapple-mini-track-shell";
      shell.setAttribute("aria-hidden", "true"); rail.appendChild(shell); v.nodes.push(shell);
    }
    v.updateTimes();
    if (v.playGlyph) syncPlayGlyph(v.playGlyph, isPlaying() ? "pause" : "play");
    var mode = playingMode(), kind = mode === "playOneCycle" ? "one" : "all";
    if (v.repeat.getAttribute("data-icon") !== kind) { v.repeat.innerHTML = kind === "one" ? ICONS.repeat1 : ICONS.repeat; v.repeat.setAttribute("data-icon", kind); }
    var on = mode === "playCycle" || mode === "playOneCycle";
    v.repeat.setAttribute("aria-pressed", String(on));
    v.repeat.setAttribute("aria-label", mode === "playOneCycle" ? "单曲循环；点击关闭" : on ? "列表循环；点击单曲循环" : "开启列表循环");
  }

  var cfg = CFG();
  var previousMaster_ = null;
  // The element each switch owns.  Used for the master switch's DOM teardown and for the hide rules,
  // so a switch that cannot cleanly early-return its build path still ends up invisible.
  function hideCss(c) {
    var rules = [];
    // The master switch needs unprefixed rules, and not as a nicety: every rule in the main sheet is
    // scoped `html.kabi-on`, so with the master off nothing applies.  The queue panel is
    // position:fixed only under that class, so it falls back to static flow and becomes a block
    // 48 tracks tall -- about 50,000px of it -- sitting in the middle of the host's document and
    // pushing the whole page down.  Hiding the injected nodes unconditionally is the only thing
    // that keeps the host's own layout intact when the replica is switched off.
    if (!c.playPage) {
      return "html #kabi-bg,html #kabi-art,html #kabi-stack,html #kabi-times,html #kabi-foot,html .kabi-queue{display:none!important;}";
    }
    if (!c.artwork) rules.push("#kabi-art{display:none!important;}");
    if (!c.songInfo) rules.push("#kabi-stack .head{display:none!important;}");
    if (!c.playbackBar) rules.push("#kabi-stack .bar,#kabi-stack #kabi-times{display:none!important;}");
    if (!c.lyrics) rules.push("ul.lyric{display:none!important;}");
    if (!c.footer) rules.push("#kabi-foot{display:none!important;}");
    if (!c.queue) rules.push(".kabi-queue{display:none!important;}");
    return rules.length ? "html.kabi-on " + rules.join("html.kabi-on ") + ";" : "";
  }

  var disposed = false;
  var pageObserver = null;
  var scheduledRender = 0;
  var imageStates = [];
  var coverMotion = null;
  var rasterCache = new Map();
  var lyricObserver = null;
  var observedList = null;
  var lyricFrame = 0;
  var lyricScrollCleanup = null;
  var hostStore_ = null;
  var hostUnsubscribe_ = null;
  var lastHostPage_ = "";
  var lastHostMode_ = "";
  var beforeShuffle_ = "playOrder";
  var borrowedControls_ = new Set();

  var old = document.getElementById("kabi-stage-style");
  if (old) old.remove();
  var oldBg = document.getElementById("kabi-bg");
  if (oldBg) oldBg.remove();
  // Discard disposed blend closures and stale shadow/motion state on reinjection. kabi-meta is
  // an orphan from an older revision that is no longer rendered; without this it survives every
  // reinjection and gets pinned at a meaningless offset forever.
  var oldArt = document.getElementById("kabi-art");
  if (oldArt) oldArt.remove();
  var oldMeta = document.getElementById("kabi-meta");
  if (oldMeta) oldMeta.remove();

  var css = [
    "html.kabi-on #vinyl-page-container{background:transparent!important;overflow:hidden!important;}",
    "html.kabi-on #vinyl-page-container #VINYL_COVER_ELEMENT_ID,",
    "html.kabi-on #vinyl-page-container [class*='CoverBackgroundContainer']{background:transparent!important;background-image:none!important;}",
    "html.kabi-on #vinyl-page-container [class*='CoverBackgroundContainer']>.mask{display:none!important;}",
    // Backdrop: MediaCoreUI draws three hierarchical mesh instances of the artwork
    // (rotation_vertex timeScale 2*PI*t/TS, scale 1+.34*mix(sp.x,sp.y,.1)^2) and composites
    // them largest-first. Each instance carries the recovered colour chain in its raster.
    // The child instance covers the viewport at the recovered scale, so the composite
    // reduces to the child; the parents stay in the tree to keep the crossfade symmetric.
    "#kabi-bg{position:absolute;inset:0;z-index:0;overflow:hidden;pointer-events:none;background:#1c1a17;transition:background-color .5s ease;}",
    "#kabi-bg .zoom.fade{opacity:0;}",
    // A rectangle rotated about its centre only contains the viewport while its side is at
    // least the viewport diagonal, sqrt(W^2+H^2). At the 1512x949 reference that is 1785 CSS px;
    // 128% gave a 1935x1215 canvas, whose height stopped spanning the viewport past roughly 65
    // degrees, so the mesh edge swung into view and exposed the flat colour behind it.
    // vmax is the tight bound: sqrt(W^2+H^2) <= sqrt(2)*max(W,H), so 142vmax always covers.
    // Flex centring rather than a negative percentage margin, which cannot express the half-size
    // of a vmax-based box; .zoom clips the overflow back to the viewport.
    "#kabi-bg .zoom{position:absolute;inset:0;contain:paint;overflow:hidden;display:flex;align-items:center;justify-content:center;}",
    "#kabi-bg .zoom canvas{flex:0 0 auto;width:max(142vmax,128%);height:max(142vmax,128%);transform-origin:50% 50%;will-change:transform;animation:kabi-mesh 96s linear infinite;}",
    // Only the graded canvases may render inside a mesh layer. An <img> dropped there by a
    // foreign build matches none of the sizing rules above, so it would sit at its intrinsic
    // square size in the middle of the page; hide it outright rather than leave it unstyled.
    "#kabi-bg .zoom > :not(canvas){display:none!important;}",
    "@keyframes kabi-mesh{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}",
    "html.kabi-paused #kabi-bg .zoom canvas{animation-play-state:paused;}",
    "html.kabi-on #vinyl-page-container #page_pc_songplay,",
    "html.kabi-on #vinyl-page-container [class*='ClassicPageContainer'],",
    "html.kabi-on #vinyl-page-container [class*='VinylPageLayoutContainer']{position:relative;z-index:1;background:transparent!important;}",
    "html.kabi-on #vinyl-page-container [class*='CommentTab'],",
    "html.kabi-on #vinyl-page-container .handle,",
    "html.kabi-on #vinyl-page-container .together-head,",
    "html.kabi-on #vinyl-page-container [class*='SoundEffectAnimation'],",
    "html.kabi-on #vinyl-page-container [class*='TrackTitleContainer'],",
    "html.kabi-on #vinyl-page-container .tab-group,",
    // Live DOM inspection (QUEUE70, 2026-10-18): LyricContribuleTipContainer contains both
    // .tip.classic-mode and LyricDisplayInnerContainer > ul.lyric. Hiding the wrapper gives
    // all 52 lines zero-sized rects even with .display opacity=1. Hide only the contribution
    // prompt, retaining the host's flex wrapper and the lyric scroll container.
    "html.kabi-on #vinyl-page-container [class*='LyricContribule']>.tip,",
    "html.kabi-on #vinyl-page-container [class*='LyricOperator'],",
    "html.kabi-on #vinyl-page-container img[src*='vinyl/disc'],",
    "html.kabi-on #vinyl-page-container img[src*='vinyl/outline'],",
    "html.kabi-on #vinyl-page-container .cover-container-rotate>.CenterImg_c1feg9h6:not([class*='Cover_']){display:none!important;}",
    "html.kabi-on #vinyl-page-container .page-header .right>button,",
    "html.kabi-on #vinyl-page-container .page-header [class*='WindowOpBar']{display:none!important;}",
    "html.kabi-on #vinyl-page-container .page-header{z-index:40!important;}",
    "html.kabi-on #vinyl-page-container .page-header .close{pointer-events:auto!important;}",
    // Host owns the underlay lifecycle: its vinyl-mode is cleared at opening/closing.
    // Never hide .should-hide-under-vinyl-mode here: that outlives the host transition
    // and blanks the exposed page until fully closed (LAYOUT90 baseline43/43 frames).
    "html.kabi-on #vinyl-page-container .cover-area,html.kabi-on #vinyl-page-container [class*='VinylCoverContainer'],html.kabi-on #vinyl-page-container .cover-container{opacity:0!important;visibility:hidden!important;pointer-events:none!important;}",
    // Shadow endpoints recovered from MediaCoreUI; CSS blur mapping/crossfade is a reconstruction.
    "#kabi-art{position:fixed;z-index:20;isolation:isolate;overflow:visible;border-radius:12px;pointer-events:none;transform-origin:center center;transition:left .65s cubic-bezier(.22,1,.36,1),top .65s cubic-bezier(.22,1,.36,1),width .65s cubic-bezier(.22,1,.36,1),height .65s cubic-bezier(.22,1,.36,1);}",
    "#kabi-art .art-shadow{position:absolute;inset:0;border-radius:inherit;z-index:-1;}#kabi-art .shadow-expanded{box-shadow:0 16px 64px rgba(0,0,0,.45);}#kabi-art .shadow-paused{box-shadow:0 5.479452px 21.917808px rgba(0,0,0,.15);}",
    "#kabi-art .art-layer{position:absolute;inset:0;overflow:hidden;border-radius:inherit;}#kabi-art img{display:block;width:100%;height:100%;object-fit:cover;}#kabi-art::after{content:'';position:absolute;inset:0;border-radius:inherit;box-shadow:inset 0 0 0 var(--kabi-hairline,1px) rgba(0,0,0,.08);z-index:3;}",
    "html.kabi-on #vinyl-page-container .CoverAnimationCls,",
    "html.kabi-on #vinyl-page-container .cover-container-rotate,",
    "html.kabi-on #vinyl-page-container [class*='Cover_c1l42i2x'],",
    "html.kabi-on #vinyl-page-container [class*='Cover_c1l42i2x'] img{width:100%!important;height:100%!important;animation:none!important;transform:none!important;border-radius:12px!important;object-fit:cover!important;}",
    // Control column geometry is transcribed from the reference frame: the stack is exactly
    // one playing-art width, centred on the artwork, and every offset below is the measured
    // Apple value at the 1512x949 reference window divided by --u (= artwork / 423.4).
    "#kabi-stack{position:fixed;z-index:20;color:#fff;--u:1;transition:left .65s cubic-bezier(.22,1,.36,1),top .65s cubic-bezier(.22,1,.36,1),width .65s cubic-bezier(.22,1,.36,1);}",
    // ---------------------------------------------------------------------
    // The song-info rail, measured off Apple at its 1291 x 949 window.
    //
    // These are absolute points and deliberately NOT in var(--u), which is the artwork column's
    // scale.  u was the reason this block read small: it is width/423.4, and 423.4 is the column
    // width at a 1512pt window, so at 1291 u came out .8538 and every size here was multiplied by
    // it.  The title rendered at 12.8pt against Apple's 18.2.  Type is a point size and Apple's does
    // not follow the artwork column, so neither does this.
    //
    // The type itself was measured, not chosen.  Apple's accessibility tree exposes no font for
    // this string at all -- the whole block is one AXButton with the title and subtitle folded into
    // its description and AXFont empty -- so the size came off the pixels.  The cap ratio was
    // calibrated against the replica itself, whose size is known exactly: 'HOYO-MiX' measured 7.00pt
    // of cap at a rendered 9.8187pt, i.e. .713, which is SF Pro's cap height to within a
    // thousandth.  Apple's title caps then measure 13.00pt and its subtitle caps 11.00pt, so
    // 13.00/.713 = 18.2pt and 11.00/.713 = 15.4pt.
    //
    // Line heights are solved from Apple's baselines rather than set to a round ratio: its title
    // baseline sits 15.9pt below the top of its own 37.5pt block and its subtitle baseline 32.6pt
    // below, which is 18.4 and 17.1 for the two line boxes.
    "#kabi-stack .head{display:flex;align-items:center;gap:10px;}",
    "#kabi-stack .names{flex:1;min-width:0;}",
    "#kabi-stack .names b{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:600;font-size:18.2px;line-height:18.4px;font-family:'SF Pro Text',-apple-system,'PingFang SC',sans-serif;letter-spacing:-.012em;}",
    "#kabi-stack .names span{display:block;margin-top:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:400;font-size:15.4px;line-height:17.1px;font-family:'SF Pro Text',-apple-system,'PingFang SC',sans-serif;color:rgba(255,255,255,.58);}",
    // Apple: favouriteButton and contextMenu are both 26 x 26 at page x 443.5 and 477.5 -- a 34pt
    // pitch, i.e. an 8pt gap -- and contextMenu is flush with the column's right edge at 503.5
    // while favourite's left edge is the 47pt from it.  They were 22 x 22 on a 26pt pitch.
    "#kabi-stack .tools{display:flex;gap:8px;flex:none;}",
    "#kabi-stack .tools button{width:26px!important;height:26px!important;min-width:26px!important;padding:0!important;border:0!important;border-radius:50%!important;background:rgba(255,255,255,.16)!important;color:#fff!important;display:grid!important;place-items:center!important;font-size:0!important;overflow:hidden!important;}",
    "#kabi-stack .tools button svg{width:auto!important;height:12.4px!important;}",
    "#kabi-stack .tools [data-role='star']{overflow:hidden!important;}",
    // Apple's star is 14.5pt of ink inside its 26pt circle.
    "#kabi-stack .tools [data-role='star'] i{width:14.5px;height:14.5px;background:#fff;-webkit-mask-repeat:no-repeat;-webkit-mask-position:center;-webkit-mask-size:contain;}",
    "@keyframes kabi-star-pop{0%{transform:scale(.55)}50%{transform:scale(1.28)}100%{transform:scale(1)}}",
    "#kabi-stack .tools [data-role='star'].pop i{animation:kabi-star-pop .42s cubic-bezier(.2,.8,.2,1);}",
    "#kabi-stack .tools [data-role='more'] svg{width:12.4px!important;height:auto!important;}",
    "#kabi-stack .tools button:not([data-role]){display:none!important;}",
    "#kabi-times .quality i{font-style:normal;}",
    "#kabi-stack .tools [data-kabi-native='more'] .cmd-button-content{display:none!important;}",
    "#kabi-stack .tools [data-kabi-native='more']::after{content:'';width:12.4px;height:12.4px;background:currentColor;-webkit-mask:var(--kabi-more-icon) center/contain no-repeat;}",
    "#kabi-times{display:grid;grid-template-columns:1fr auto 1fr;align-items:center;margin-top:6.5px;font-weight:500;font-size:11px;line-height:13px;font-family:'SF Pro Text',-apple-system,'PingFang SC',sans-serif;color:rgba(255,255,255,.5);font-variant-numeric:tabular-nums;}",
    "#kabi-times .remain{text-align:right;}",
    "#kabi-times .quality,#kabi-times .quality *{justify-self:center;background:transparent!important;border:0!important;box-shadow:none!important;outline:0!important;color:rgba(255,255,255,.5)!important;font-weight:500!important;font-size:11px!important;line-height:13px!important;font-family:'SF Pro Text',-apple-system,'PingFang SC',sans-serif!important;padding:0!important;height:auto!important;min-height:0!important;}",
    // Transport, from Music.nowPlaying.*TransportControl.  All five centres sit on page y 715,
    // which is what one shared row height buys: Apple gives prev and next 48pt boxes, play 28 and
    // the two accessory buttons 30, and centres them all on one line rather than aligning the tops
    // of the boxes.  The row is 48 tall and each button centres inside it.
    //
    // X as a fraction of the column, measured at Apple's 1291 window: centres 15 / 95 / 181 / 267
    // / 346.5 from the column's left edge over a 361.5 column.  The accessory pair is flush --
    // shuffle's box starts at the column's left edge, repeat's ends at its right.
    //
    // Keep AX hit geometry independent of ink size. Play/pause and previous/next ink bounds
    // now follow the measured v87/v88 captures below; shuffle/repeat retain earlier geometry.
    // A 48pt hit box must never turn the previous glyph into a48pt triangle.
    "#kabi-transport{position:relative;height:48px;margin-top:10px;}",
    "#kabi-transport button{position:absolute;top:50%;padding:0;border:0;background:transparent;color:rgba(255,255,255,.82);display:grid;place-items:center;cursor:pointer;transform:translate(-50%,-50%);}",
    "#kabi-transport button svg{display:block;width:auto;}",
    "#kabi-transport [data-role='shuffle']{left:4.148%;width:30px;height:30px;}#kabi-transport [data-role='shuffle'] svg{height:13.7px;}",
    "#kabi-transport [data-role='prev']{left:26.28%;width:48px;height:48px;}#kabi-transport [data-role='prev'] .skip-glyph{transform:scaleX(-1);}",
    // APPLE-TRANSPORT87.mov: 2px/pt, stable ink play48x54px / pause42x55px.
    // Hit box remains the AX-measured28x28pt. Do not scale this with the artwork column.
    "#kabi-transport [data-role='play']{left:50.069%;width:28px;height:28px;color:#fff;}",
    "#kabi-transport [data-role='play'] svg{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);transform-origin:center;pointer-events:none;}",
    "#kabi-transport [data-role='play'] svg[data-glyph='play']{width:24px;height:27px;}",
    "#kabi-transport [data-role='play'] svg[data-glyph='pause']{width:21px;height:27.5px;}",
    "#kabi-transport [data-role='next']{left:73.858%;width:48px;height:48px;}",
    "#kabi-transport [data-role='repeat']{left:95.851%;width:30px;height:30px;}#kabi-transport [data-role='repeat'] svg{height:13.2px;}",
    // APPLE-SKIP88.mov: stable two-arrow ink66x38px at2px/pt; AX hit boxes remain48pt.
    "#kabi-transport .skip-glyph{position:relative;display:block;width:33px;height:19px;color:#fff;opacity:.7;pointer-events:none;}",
    "#kabi-transport .skip-glyph svg{position:absolute;left:0;top:0;width:16.5px;height:19px;transform-origin:8.25px 9.5px;}",
    "#kabi-transport button.on{color:#fff;}",
    "html.kabi-on #vinyl-page-container .page-footer{position:fixed!important;left:-3200px!important;top:0!important;width:320px!important;opacity:0!important;pointer-events:none!important;}",
    "html.kabi-on #vinyl-page-container #page_pc_mini_bar,",
    "html.kabi-on #vinyl-page-container .page-footer [class*='SpaceWrap']{width:100%!important;height:auto!important;background:transparent!important;}",
    "html.kabi-on #vinyl-page-container .page-footer [class*='SpaceContainer']{width:100%!important;height:auto!important;display:block!important;}",
    "html.kabi-on #vinyl-page-container .vinyl-page-bar-wrapper{width:100%!important;height:auto!important;min-height:0!important;padding:0!important;background:transparent!important;-webkit-backdrop-filter:none!important;backdrop-filter:none!important;display:block!important;}",
    "html.kabi-on #vinyl-page-container .vinyl-page-bar-wrapper>.side{display:none!important;}",
    "html.kabi-on #vinyl-page-container .vinyl-page-bar-wrapper .middle{width:100%!important;height:auto!important;display:flex!important;justify-content:space-between!important;align-items:center!important;}",
    "html.kabi-on #vinyl-page-container .vinyl-page-bar-wrapper .middle button:has(.cmd-icon-playlist){display:none!important;}",
    // ---------------------------------------------------------------------
    // Apple's Now Playing footer control, measured rather than drawn by eye.
    //
    // The two footer buttons are Music.nowPlaying.footerButton.lyrics and .queue, both
    // AXCheckBox/AXToggle, both 56x56 hit boxes centred on the same y (925+28 = 953) at
    // x = 1448 and 1484.  Their captions are "Lyrics" and "playing next".  The visible
    // control behind them is a 72.5 x 36pt capsule sitting 10pt off the right edge and
    // 11.25pt off the bottom of the 1512x949 window, with a 30.5pt white disc that slides
    // between the two segment centres 36.25pt apart.
    //
    // Every number below comes from a 244x178 device-px capture of that 122x89pt region
    // at -R 1390,893 -- exactly 2.0 device px per pt on this display -- with edges read at
    // the 50% crossing rather than at a threshold: capsule x 39.5..112.0 and y 41.75..77.75
    // region points, disc 30.46 x 30.50 centred at (58.02, 60.44), queue glyph three rows
    // of a 2.15pt dot plus an 11.40 x 1.54pt bar on a 4.53pt pitch, quote bubble
    // 16.59 x 15.63 with its two marks 3.4 x 4.6 cut out of it.
    //
    // The three glyph paths are not hand-authored.  Each is the marching-squares contour of
    // the measured pixels at the 50% ink level, taken on a field bilinearly upsampled eight
    // times so the edge sits on the true crossing rather than on a pixel boundary, then
    // simplified to 0.045pt.  Rasterising them back at 8 samples/pt and comparing with the
    // reference masks gives IoU 0.982 (selected quote), 0.968 (unselected quote) and 0.952
    // (queue) -- they are the reference glyphs, not lookalikes.
    //
    // Materials are read off the same capture rather than guessed.  The capsule fill is white
    // at alpha .175 over the pane (backdrop luma 100.7 -> 127.7).  Its top and bottom six
    // points carry a further ramp peaking near .25, so it is a gradient over that flat fill.
    // The disc is white at .76 over the capsule (127.7 -> 224.3), not opaque: the ink the
    // disc is punched around measures rgb(113,103,87) against a backdrop of (112,103,87), so
    // in the selected state the glyph is a hole straight through the capsule and the pane
    // itself shows through it -- which is what the mask below does, and why the disc cannot be
    // a plain filled circle.  The rim is an opaque white hairline on the top and bottom edges
    // (luma 255.0) and a 0.5pt black contour on the left and right caps (luma 46-49), so it is
    // drawn as two separate strokes rather than one border.  Unselected glyphs are white: the
    // quote bubble becomes a 1.6pt outline with the pane showing through its middle, the queue
    // glyph stays solid.
    //
    // 1 CSS px is 1pt here: NetEase's viewport is 1512x949 at devicePixelRatio 2, the same as
    // Apple's window, and --u reads 0.9999, so the geometry is used unscaled in the viewBox and
    // the whole svg is sized in calc(Npx * var(--u)) with the window-relative offsets 10 and
    // 11.25pt, both measured against the same window.
    "#kabi-foot{position:absolute;right:calc(10px * var(--u));bottom:calc(11.25px * var(--u));z-index:6;width:calc(72.5px * var(--u));height:calc(36px * var(--u));}",
    "#kabi-foot .art{display:block;width:100%;height:100%;overflow:visible;pointer-events:none;}",
    "#kabi-foot .hit{position:absolute;top:calc(-10px * var(--u));width:50%;height:calc(56px * var(--u));padding:0;border:0;background:transparent;cursor:pointer;-webkit-appearance:none;appearance:none;}",
    "#kabi-foot .hit[data-seg='lyric']{left:0;}",
    "#kabi-foot .hit[data-seg='queue']{left:50%;}",
    "#kabi-foot .hit:focus{outline:none;}",
    // ---- Apple's queue panel, rebuilt from Apple's own resolved geometry -------------------
    // APPLE-LAYOUT.jsonl: AX headerContainer at window sizes 1512x949, 1291x949, 1100x800
    // is window-relative (756,88,696,861), (645.5,88,585.5,861), (550,88,490,712).
    // Thus left=W/2, right=60, top=88, bottom=0, residual 0pt on all three samples (AX
    // coordinates quantized to 0.5pt). These are layout constraints, not a scaled 1512 frame;
    // keep the measured 48pt rows, type sizes and internal insets unchanged as width varies.
    //
    // The panel is the right half of the window and contributes nothing of its own: scanned
    // horizontally across x=756 at four heights the window gradient runs through with no step
    // (delta 0..2 of 255) and there is no border line, so there is no fill, no border and no
    // shadow to reproduce.  Its box is (756,88,696,861) from the AX headerContainer rect; the
    // toggle pills are drawn inside it at y=88.5..124.5 and the row stack runs to the window's
    // bottom edge, which is why the box is 861 tall and not the full 949.
    "html.kabi-on #vinyl-page-container .kabi-queue{position:fixed;left:50%;right:60px;top:88px;bottom:0;z-index:5;overflow:visible;will-change:opacity;}",
    "html.kabi-on #vinyl-page-container .kabi-queue *{box-sizing:border-box;}",
    // Pills: two 334x37 capsules 10pt apart with 9pt of panel inset on each side, drawn a little
    // shorter than their AX hit boxes (88.5..124.5 against 87..125) and fully rounded -- the
    // top-left corner profile comes in over the first 3pt and is straight by 4pt, which is a
    // radius of h/2, not a fixed 6pt.  Fill solved off the backdrop above and below the pill,
    // (230,227,223) over (107,92,72) in all three channels, is alpha .83.
    // Pill box measured off the live Apple queue at 2 device px per point: 36.0pt tall, 271.5pt
    // wide, 17.5pt between the two, 13pt clear on each side of the pair inside a 585.5pt panel --
    // which resolves to left/right 13px and width calc(50% - 21.75px).  The previous rule asked
    // for a 10pt gap and 9pt margins, so the pair sat wider and tighter than Apple's.
    // The fill is opaque, measured rgb (209, 208, 204): the mark's holes show the pill, not the
    // album wash, which is what lets both glyphs be plain unfilled circles.
    "html.kabi-on #vinyl-page-container .kabi-queue .pill{position:absolute;top:.5px;height:36px;border-radius:18px;background:#d1d0cc;color:rgba(0,0,0,.85);font:500 13px/36px -apple-system,BlinkMacSystemFont,'SF Pro Text','Helvetica Neue',sans-serif;text-align:center;letter-spacing:0;}",
    "html.kabi-on #vinyl-page-container .kabi-queue .pill.autoplay{left:13px;width:calc(50% - 21.75px);}",
    "html.kabi-on #vinyl-page-container .kabi-queue .pill.automix{left:calc(50% + 8.75px);width:calc(50% - 21.75px);}",
    // Section header.  Both lines are inset 17pt -- aligned to the artwork column, not to the
    // row text at 62pt.  Sizes come from ink extents: 14.36pt of cap-to-descender on a line with
    // both gives 15pt, 12.10pt gives 13pt.  Alphas are the same solve as the pill.
    "html.kabi-on #vinyl-page-container .kabi-queue .secTitle{position:absolute;left:17px;top:46.5px;font:600 15px/18px -apple-system,BlinkMacSystemFont,'SF Pro Display','Helvetica Neue',sans-serif;color:rgba(255,255,255,.94);white-space:nowrap;}",
    "html.kabi-on #vinyl-page-container .kabi-queue .secSub{position:absolute;left:17px;top:66.5px;font:400 13px/16px -apple-system,BlinkMacSystemFont,'SF Pro Text','Helvetica Neue',sans-serif;color:rgba(255,255,255,.63);white-space:nowrap;}",
    // The section rule is the one divider that runs the full panel: measured x 756.00..1451.52
    // against a panel of 756..1452, so it is not inset like the row rules are.  1px at alpha .10
    // against its own local backdrop -- and it sits exactly on the first row's top edge, which is
    // why the row stack starts here.
    "html.kabi-on #vinyl-page-container .kabi-queue .rule{position:absolute;left:0;width:100%;height:1px;background:rgba(255,255,255,.10);}",
    "html.kabi-on #vinyl-page-container .kabi-queue .rule.top{top:92.5px;}",
    // Rows.  48pt pitch, taken from the artwork centres and the "..." blobs three rows apart
    // (204.9, 252.6, 301.0 -> 48.05), not from the AX row height: the 44pt AXRow measured is the
    // History section's own header row, which is a different kind of row and not the song list.
    // A song row is artwork 34x34 centred in the 48, text inset to 62pt -- 11pt clear of the
    // artwork's right edge -- and a 1pt rule at .11 alpha inset to the same 62pt on the left and
    // stopping at 1436, where the overlay scrollbar begins.
    // Height is the window's: the scroller's top edge is the section divider at page y 181.44 and
    // the panel runs off the bottom of the window, so the list is clipped by the window edge at
    // 949 and the box is 949-181 = 768.  At 792 it ran 24pt past the bottom and the last row was
    // cut by the window rather than by the panel.
    "html.kabi-on #vinyl-page-container .kabi-queue .scroller{position:absolute;left:0;top:93px;width:100%;bottom:0;overflow-y:auto;overflow-x:hidden;will-change:transform;}",
    "html.kabi-on #vinyl-page-container .kabi-queue .rows{position:relative;width:100%;}",
    "html.kabi-on #vinyl-page-container .kabi-queue .row{position:absolute;left:0;width:100%;height:48px;}",
    "html.kabi-on #vinyl-page-container .kabi-queue .row .art{position:absolute;left:17px;top:7px;width:34px;height:34px;border-radius:5px;background-size:cover;background-position:center;}",
    "html.kabi-on #vinyl-page-container .kabi-queue .row .tx{position:absolute;left:62px;top:8.5px;width:calc(100% - 136px);}",
    "html.kabi-on #vinyl-page-container .kabi-queue .row .t1{display:block;font:600 13px/16px -apple-system,BlinkMacSystemFont,'SF Pro Text','Helvetica Neue',sans-serif;color:rgba(255,255,255,.96);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}",
    "html.kabi-on #vinyl-page-container .kabi-queue .row .t2{display:block;font:400 11px/13px -apple-system,BlinkMacSystemFont,'SF Pro Text','Helvetica Neue',sans-serif;color:rgba(255,255,255,.61);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}",
    // The trailing ellipsis: three ~2.6pt dots on 3.5pt centres, centred at x=1413, alpha .59.
    // The row's "..." re-measured off Apple's own pixels at 2 device px per point, six rows deep in
    // the live Up Next queue (Apple window 1291x949 at origin 0,33; rows captured from screen
    // 1000,180).  Each dot is 2.00pt across, the centres sit 5.50pt apart, so the whole mark is
    // 13.00pt of ink; the panel's right edge is at x 1235.5 and the ink ends at 1204.5, which puts
    // the mark 31.0pt in from that edge.  The previous rule asked for 2.6pt dots on a 5.0pt pitch
    // in a 12pt box set 25pt in, at alpha .59 -- every number wrong, and the alpha by a factor of
    // three, which is why the dots read as bright stickers against Apple's faint marks.
    //
    // Alpha is solved per channel from the pixels rather than guessed: with the wash beside the
    // dots at rgb(100,89,73) and the dot core at rgb(125,117,106), white-over-wash gives
    // .195/.194/.195 -- neutral across all three, which is the signature of a white mark rather
    // than a tinted one, and .193 is the mean.  On hover the ink is NOT neutral: measured at
    // .313 red against .066 green and .125 blue on two different rows, i.e. the artwork's own
    // colour, so hover takes the accent sampleColor already computes instead of a fixed tint.
    "html.kabi-on #vinyl-page-container .kabi-queue .row .more{position:absolute;right:31px;top:50%;width:13px;height:2px;margin-top:-1px;color:rgba(255,255,255,.193);background-image:radial-gradient(circle 1px at 1px 1px,currentColor 99%,transparent),radial-gradient(circle 1px at 6.5px 1px,currentColor 99%,transparent),radial-gradient(circle 1px at 12px 1px,currentColor 99%,transparent);transition:color .12s ease;}",
    "html.kabi-on #vinyl-page-container .kabi-queue .row:hover .more{color:var(--kabi-accent,rgba(255,255,255,.85));}",
    "html.kabi-on #vinyl-page-container .kabi-queue .row .rule2{position:absolute;left:62px;right:16px;height:1px;top:47px;background:rgba(255,255,255,.11);}",
    // The overlay scrollbar is Apple's own: a 6pt indicator at x=1443..1449, the width the AX
    // value indicator reports, drawn over the rules rather than in a gutter.
    "html.kabi-on #vinyl-page-container .kabi-queue .bar{position:absolute;right:3px;width:6px;border-radius:3px;background:rgba(255,255,255,.28);pointer-events:none;}",
    // The floating globe straddles the panel's right edge: 54pt across, centred at (1468,267),
    // so 11pt of it sits outside the panel at x=1452 and its right edge stops 17pt short of the
    // window's.  It is Apple's cross-device control and has no NetEase counterpart, so it is
    // drawn for the layout and takes no clicks.
    "html.kabi-on #vinyl-page-container .kabi-queue .globe{position:absolute;right:-43px;top:152px;width:54px;height:54px;border-radius:27px;background:rgba(0,0,0,.72);pointer-events:none;}",
    // Apple's queue cross-fades; it does not slide.  Measured off its own toggle with a 20pt
    // band across the AutoPlay pill at 120Hz while pressing it by AX: the pill's text edge never
    // moves (2.5pt at most across a 696pt travel) while the band's rigid signal rises, and the
    // transition frames show the label at full brightness over a still-darkening fill -- the
    // material layer resolves after the glyphs, which only happens if the layer's opacity is
    // moving rather than its position.  So this is opacity, and the two numbers are measured:
    //
    //   fade in   228ms  cubic-bezier(0.453, 0.298, 0.505, 0.735)
    //   fade out  105ms  cubic-bezier(0.757, 0.188, 0.283, 0.676)
    //
    // Both are 2%-98% crossings of that signal, with the curve a cubic-bezier fit to the
    // resampled crossing.  Two independent opens came out at 233ms and 223ms and agree on shape
    // to within .015 at every point of the curve, so they were fitted jointly (rms .013).  The
    // reveal is a ~2x longer ease-in-out going in and a quicker ease coming out; the .5s
    // ease-out-quint this replaces was the lyric column's own and was never Apple's.
    //
    // The destination state's transition is the one that runs, so the base rule carries the
    // close curve and the open rule overrides it.
    "html.kabi-on #vinyl-page-container .kabi-queue{transition:opacity .105s cubic-bezier(.757,.188,.283,.676);}",
    "html.kabi-on.kabi-sheet-open #vinyl-page-container .kabi-queue{opacity:1!important;pointer-events:auto!important;transition:opacity .228s cubic-bezier(.453,.298,.505,.735);}",
    "html.kabi-on.kabi-sheet-closed #vinyl-page-container .kabi-queue{opacity:0!important;pointer-events:none!important;}",
    // How fast the lyric column clears, measured rather than assumed: a band over Apple's lyric
    // text, with its queue button pressed by AX, steps down 94.4 -> 83.6 luminance and is 90% of
    // the way there within 33ms, with the frames in between at 0.16 and 0.53 -- half gone at 25ms.
    // So the column goes in about 60ms, not the 220ms this used to carry.  The 33ms frame cadence
    // bounds it from below and above only to roughly 40-70ms; what it does rule out is anything
    // in the hundreds of milliseconds.  The travel is left as it was -- displacement was not
    // measured, so it stays where the earlier pass had it rather than gaining an invented number.
    "html.kabi-on.kabi-lyrics-off #vinyl-page-container .display{opacity:0!important;visibility:hidden!important;pointer-events:none!important;transform:translateX(24px);transition:opacity .06s ease,transform .06s cubic-bezier(.22,1,.36,1),visibility 0s .06s;}",
    "html.kabi-on #vinyl-page-container .display{position:fixed!important;left:var(--kabi-display-left)!important;top:var(--kabi-display-top)!important;width:var(--kabi-display-width)!important;max-width:var(--kabi-display-width)!important;height:var(--kabi-display-height)!important;min-height:var(--kabi-display-height)!important;max-height:var(--kabi-display-height)!important;margin:0!important;z-index:20!important;display:flex!important;align-items:stretch!important;padding:0!important;box-sizing:border-box!important;background:transparent!important;opacity:1;visibility:visible;transform:translateX(0);transition:opacity .35s .12s ease,transform .65s cubic-bezier(.22,1,.36,1),visibility 0s;}",
    "html.kabi-on #vinyl-page-container [class*='TrackDisplayContainer'],",
    "html.kabi-on #vinyl-page-container .area.lyric-mode,",
    "html.kabi-on #vinyl-page-container [class*='LyricDisplayInnerContainer']{width:100%!important;height:100%!important;max-height:none!important;margin:0!important;padding:0!important;background:transparent!important;}",
    "html.kabi-on #vinyl-page-container ul.lyric,",
    "html.kabi-on #vinyl-page-container *{scrollbar-width:none!important;}",
    "html.kabi-on #vinyl-page-container ul.lyric::-webkit-scrollbar,",
    "html.kabi-on #vinyl-page-container *::-webkit-scrollbar{width:0!important;height:0!important;display:none!important;}",
    "html.kabi-on #vinyl-page-container ul.lyric{mask-image:linear-gradient(180deg,transparent 0%,#000 14%,#000 86%,transparent 100%);-webkit-mask-image:linear-gradient(180deg,transparent 0%,#000 14%,#000 86%,transparent 100%);}",
    // Room for the unfocused-line blur, without moving a single glyph. Both .display and ul.lyric
    // clip, and both sat at exactly x=776.5, which is also where the first glyph's ink begins -- so
    // a 2.5px blur put its left tail outside the clip and every line got a dead-straight vertical
    // slice through its first letter. .display cannot be moved: the host writes width/left/margin
    // into its style attribute with !important, which outranks any stylesheet rule. It does not set
    // overflow inline, though, so the clip is lifted there instead; the divs between .display and
    // the ul already have overflow:visible. That leaves ul.lyric as the only clip, and it is the
    // one that can move: margin-left:-8px with padding-left:8px puts its clip edge at 768.5 while
    // the line boxes stay at 776.5. Content width is pinned to the original 516.5 (100% - 6px of
    // the unchanged 522.5 parent) so no line re-wraps and no line box changes width.
    "html.kabi-on #vinyl-page-container .display{overflow:visible!important;}",
    "html.kabi-on #vinyl-page-container ul.lyric{box-sizing:border-box!important;margin-left:-8px!important;width:calc(100% - 6px)!important;padding-left:8px!important;}",
    // Apple's unfocused lyric lines are genuinely defocused, not merely dimmed. Measured off a
    // 2x Apple capture by fitting a Gaussian to the steepest mid-level slope of a glyph stem
    // (which opacity cannot change, being a scalar): the focused line gives sigma .84 device px,
    // and lines 246, 460 and 652 px away from it give 5.05, 5.19 and 5.71 -- i.e. 2.5 CSS px,
    // flat, independent of distance. An earlier pass concluded the opposite from a 99.9th-percentile
    // horizontal gradient, which is the wrong instrument: it reads the ink plateau and never sees
    // the edge. The radius is 2.5px rather than 5pt of blur radius because CSS blur() takes a
    // standard deviation and the fit returns a sigma. Not transitioned: Apple switches sharpness
    // in the same instant the line takes focus, and a transitioned filter spends a third of a
    // second at an intermediate sigma that Apple never shows.
    "html.kabi-on #vinyl-page-container ul.lyric li.line{opacity:.3;filter:var(--reapple-lyric-blur,blur(2.5px))!important;font-size:calc(34px * var(--kabi-type,1))!important;font-weight:650!important;letter-spacing:-.035em!important;line-height:1.2!important;text-align:left!important;transform-origin:left center;transition:opacity .2s cubic-bezier(.4,0,1,1);}",
    // User-requested Apple browsing semantics; ordinary playback still defocuses other lines.
    "html.kabi-on #vinyl-page-container ul.lyric.reapple-lyric-hover li.line:hover{--reapple-lyric-blur:none;}",
    "html.kabi-on #vinyl-page-container ul.lyric.reapple-lyric-browsing{--reapple-lyric-blur:none;}",
    // Native selectedTime seek indicator (HOST-mode72 Xt); not the playback timer.
    "html.kabi-on #vinyl-page-container .ScrollableLyricDisplayContainer_spqfaoe{display:none!important;}",
    "html.kabi-on #vinyl-page-container ul.lyric li.line p{font-family:-apple-system,BlinkMacSystemFont,'PingFang SC',sans-serif!important;font-size:inherit!important;font-weight:inherit!important;line-height:inherit!important;letter-spacing:inherit!important;color:#fff!important;}",
    "html.kabi-on #vinyl-page-container ul.lyric li.line p:empty{display:none!important;}",
    "html.kabi-on #vinyl-page-container ul.lyric li.line p+p{font-size:.55em!important;line-height:1.4!important;margin-top:.4em!important;opacity:.65;}",
    "html.kabi-on #vinyl-page-container ul.lyric li.line[data-kabi='2']{opacity:.42;}",
    "html.kabi-on #vinyl-page-container ul.lyric li.line[data-kabi='1']{opacity:.64;}",
    // The two ends of the hand-off are timed apart on purpose. A line leaving focus takes state '1'
    // and drops out over 200ms; a line entering focus takes state '0' and only starts 90ms later,
    // running 320ms. Timing them together is what made focus look like it dissolved between the two
    // lines; separated, it travels. Total window 410ms, the same length the filter crossfade used.
    // filter:none on the focused line is the whole focus effect: the only thing separating Apple's
    // focused line from the rest is that it is the one line at sigma 0, and the transition list
    // names opacity alone so the blur cuts at the same instant the line starts brightening.
    "html.kabi-on #vinyl-page-container ul.lyric li.line[data-kabi='0']{opacity:1;filter:none!important;transition:opacity .32s cubic-bezier(.22,1,.36,1) .09s;}",
    // Host slider restyled to the reference rail; its own seek handlers and width are preserved.
    // 22.7u is measured from the reference: artist ink bottom (664.0) to rail top (686.5).
    //
    // Both alphas are measured off Apple rather than eyeballed, by taking the rail's own row band
    // and solving (rail - backdrop) / (255 - backdrop) with the backdrop read from the rows just
    // above and below the rail: played 0.679..0.689 over the first 440 device px, unfilled
    // 0.272..0.276 over the last 350. The rail is 12 device rows = 6.00 CSS px, and both its edges
    // are single-pixel steps (87 -> 202 and 202 -> 87) with no partial rows at all, so it carries
    // no antialiasing, no gradient and no glow. The played span ends at the playhead with the same
    // one-pixel step: there is no knob on this slider.
    // HOST-mode72.js StyledSliderContainer: normal top=0, hovered top=var(--smigcsb-0)=2px.
    // A fixed height alone did not remove that vertical hover shift. Own the entire rail state
    // in one place, including top/background, while preserving the host's seek handlers.
    "html.kabi-on #vinyl-page-container #kabi-stack .bar .slider-vinyl{position:relative!important;left:0!important;top:0!important;width:100%!important;height:6px!important;min-height:6px!important;margin:23.5px 0 0!important;padding:0!important;border:0!important;background:transparent!important;box-shadow:none!important;border-radius:0!important;cursor:default;overflow:visible!important;transition:none!important;}",
    "html.kabi-on #vinyl-page-container #kabi-stack .bar .slider-vinyl::before{content:'';display:block!important;position:absolute!important;z-index:0;inset:0!important;height:6px!important;border:0!important;border-radius:3px!important;background:rgba(255,255,255,.274)!important;box-shadow:none!important;}",
    "html.kabi-on #vinyl-page-container #kabi-stack .bar .slider-vinyl .track{position:absolute!important;left:0!important;top:0!important;height:6px!important;max-width:100%!important;margin:0!important;border:0!important;border-radius:3px!important;background:rgba(255,255,255,.684)!important;opacity:1!important;transform:none!important;transition:none!important;box-shadow:none!important;pointer-events:none!important;}",
    "html.kabi-on #vinyl-page-container #kabi-stack .bar .slider-vinyl::after,html.kabi-on #vinyl-page-container #kabi-stack .bar .slider-vinyl .track::before,html.kabi-on #vinyl-page-container #kabi-stack .bar .slider-vinyl .track::after,html.kabi-on #vinyl-page-container #kabi-stack .bar .slider-vinyl .cache,html.kabi-on #vinyl-page-container #kabi-stack .bar .slider-vinyl .dots,html.kabi-on #vinyl-page-container #kabi-stack .bar .slider-vinyl .thumb{display:none!important;}",
    // No hover, and that is the measurement rather than an omission. Two passes over the same
    // slider region at 120fps with the cursor hidden, one with the pointer parked 840px away and
    // one with it resting on the rail: max |diff| 2, mean 0.46, and zero pixels differing by more
    // than 2. The volume slider measures the same. A previous pass had concluded the opposite from
    // MediaCoreUI's Thumb{size,fill} layout metadata, which describes the type and not the runtime
    // behaviour -- the earlier reading was taken with a posted mouseMoved that never reached the
    // app. The hover path itself is verified by control: the same synthetic move over the window's
    // close button turns it red, max |diff| 109 over 338 px in exactly the traffic-light bbox.
    // So there was a hover rule here (rail .34 -> .46, a 13pt knob scaling from .35) and Apple has
    // no such state; both are deleted rather than tuned.
    "html.kabi-on #vinyl-page-container #kabi-stack .bar .slider-vinyl .hotzone-overlay{position:absolute!important;left:0!important;top:-12px!important;width:100%!important;height:30px!important;cursor:default!important;z-index:5!important;}",
    "html.kabi-on #vinyl-page-container #kabi-times{margin-top:6.5px!important;font-size:11px!important;line-height:13px!important;color:rgba(255,255,255,.5)!important;}html.kabi-on #vinyl-page-container #kabi-times .quality,html.kabi-on #vinyl-page-container #kabi-times .quality *{font-size:11px!important;line-height:13px!important;}",
    "@media(prefers-reduced-motion:reduce){#kabi-art,#kabi-stack,html.kabi-on #vinyl-page-container .display,html.kabi-on.kabi-lyrics-off #vinyl-page-container .display,html.kabi-on #vinyl-page-container ul.lyric li.line,#kabi-bg,#kabi-bg .zoom,#kabi-bg .zoom canvas,#kabi-art .art-layer{transition:none!important;animation:none!important;}#kabi-stack .pop i{animation:none!important;}}"

  ].join("");

  var style = document.createElement("style");
  style.id = "kabi-stage-style";
  style.textContent = css;
  document.documentElement.appendChild(style);
  // The hide rules live in their own sheet rather than at the end of the main one, because they are
  // the only part of the CSS that depends on the switches, and the switches are re-read every tick.
  // Regenerating a handful of display:none rules is nothing next to rebuilding the page, and it
  // keeps every switch uniformly live rather than half of them frozen at boot.
  var switchStyle = document.createElement("style");
  switchStyle.id = "kabi-switch-style";
  switchStyle.textContent = hideCss(cfg);
  document.documentElement.appendChild(switchStyle);
  var settingsStyle = document.createElement("style");
  settingsStyle.id = "reapple-settings-style";
  // These are manager-only visibility rules. Typography/controls/spacing are the host's
  // live classes, not Apple/player overrides; no account/settings values are copied.
  settingsStyle.textContent = "#page_pc_setting main[data-reapple-settings-open] > section:not(#reapple-settings-panel){display:none!important;}" +
    "#reapple-settings-panel[hidden]{display:none!important;}" +
    "#reapple-lyric-menu{font:menu;min-width:12em;padding:4px;border:1px solid ButtonBorder;border-radius:6px;background:Canvas;color:CanvasText;box-shadow:0 4px 16px #0002;}" +
    "#reapple-lyric-menu button{display:block;width:100%;padding:8px 12px;border:0;border-radius:4px;background:transparent;color:inherit;font:inherit;text-align:left;cursor:pointer;}" +
    "#reapple-lyric-menu button[aria-checked=true]{font-weight:600;}#reapple-lyric-menu button:hover:not(:disabled){background:Highlight;color:HighlightText;}#reapple-lyric-menu button:disabled{opacity:.45;cursor:default;}";
  settingsStyle.textContent += "\n/* Stage109: horizontal, native-style settings groups; no global settings overrides. */\n#reapple-settings-panel{display:block!important;width:100%!important;min-width:0!important;margin:0!important;padding:24px 0 110px!important;box-sizing:border-box;}\n#reapple-settings-panel>h3{font-size:17px!important;line-height:24px!important;font-weight:600!important;margin:0 0 12px!important;padding:0!important;}\n#reapple-settings-panel>.content{display:block!important;width:100%!important;margin:0!important;padding:0!important;min-width:0!important;}\n#reapple-settings-panel .reapple-settings-group{display:grid!important;grid-template-columns:112px minmax(0,1fr);column-gap:20px;padding:16px 0!important;margin:0!important;border-bottom:1px solid var(--colorBlack11);}\n#reapple-settings-panel h4{font-size:14px!important;line-height:28px!important;font-weight:600!important;margin:0!important;padding:0!important;color:var(--colorBlack2);}\n#reapple-settings-panel .reapple-settings-options{display:flex;flex-wrap:wrap;align-items:center;align-content:flex-start;gap:10px 32px;min-width:0;}\n#reapple-settings-panel .list-item{display:inline-flex!important;align-items:center;min-height:28px;height:auto!important;max-width:100%;width:auto!important;margin:0!important;padding:0!important;flex:0 1 auto;}\n#reapple-settings-panel .reapple-setting-wide{flex-basis:100%;}\n#reapple-settings-panel :is(.cmd-checkbox,.cmd-radio){display:inline-flex!important;align-items:center!important;max-width:100%;margin:0!important;}\n#reapple-settings-panel :is(.cmd-checkbox-content,.cmd-radio-content){min-width:0;margin-left:0!important;}\n#reapple-settings-panel :is(.cmd-checkbox-addon,.cmd-radio-addon){font-size:14px!important;line-height:22px!important;white-space:normal;color:var(--colorBlack3);}\n#reapple-settings-panel :is(.cmd-checkbox-inner,.cmd-radio-inner){flex-shrink:0;}\n#reapple-settings-panel h5{flex:0 0 100%;font-size:12px;line-height:18px;font-weight:400;color:var(--colorBlack5);margin:2px 0 -6px;padding:0;}\n#reapple-settings-panel .reapple-settings-choices{display:flex;flex:0 0 100%;flex-wrap:wrap;align-items:center;gap:10px 32px;}\n#reapple-settings-panel .reapple-settings-options>p{flex:0 0 100%;font-size:12px!important;line-height:19px!important;color:var(--colorBlack5)!important;margin:0!important;padding:0!important;}\n#reapple-settings-panel #reapple-settings-status{font-size:12px;line-height:20px;color:var(--colorBlack5);margin:16px 0 0 132px;}\n@media(max-width:850px){#reapple-settings-panel .reapple-settings-group{grid-template-columns:96px minmax(0,1fr);column-gap:16px;}#reapple-settings-panel .reapple-settings-options,#reapple-settings-panel .reapple-settings-choices{column-gap:20px;}#reapple-settings-panel #reapple-settings-status{margin-left:112px;}}\n";
  document.documentElement.appendChild(settingsStyle);
  var miniStyle = document.createElement("style"); miniStyle.id = "reapple-mini-style";
  miniStyle.textContent = "/* Geometry measured from the native mini player, material is a web adaptation. */\n.reapple-mini-host{background:transparent!important;border:0!important;box-shadow:none!important;pointer-events:none!important;}\n#page_pc_mini_bar.reapple-mini{position:absolute!important;inset:auto auto 19px calc(50% + var(--reapple-mini-sidebar,0px)/2)!important;transform:translateX(-50%)!important;width:min(700px,calc(100% - var(--reapple-mini-sidebar,0px) - 32px))!important;height:54px!important;box-sizing:border-box!important;border-radius:28px!important;background:rgba(247,248,250,.80)!important;box-shadow:0 8px 28px #00000016,0 1px 4px #0000000a,inset 0 0 0 1px #ffffffc7!important;backdrop-filter:blur(28px) saturate(1.45);-webkit-backdrop-filter:blur(28px) saturate(1.45);color:var(--colorBlack1,#24252a)!important;pointer-events:auto!important;isolation:isolate;--mini-side:148px;--mini-rail:158px;}\n#page_pc_mini_bar.reapple-mini[data-material=glass]{background:linear-gradient(150deg,#ffffffe6,#ffffff66 36%,#ffffff80 67%,#ffffffbf)!important;box-shadow:0 10px 32px #0000001f,0 2px 6px #00000012,inset 0 1px 1px #fff,inset 0 -1px 1px #ffffff80,inset 1px 0 1px #fff!important;backdrop-filter:blur(20px) saturate(1.8);-webkit-backdrop-filter:blur(20px) saturate(1.8);}\n#page_pc_mini_bar.reapple-mini[data-material=solid]{background:var(--colorBackgroundWhite,#f8f9fa)!important;backdrop-filter:none!important;-webkit-backdrop-filter:none!important;box-shadow:0 5px 20px #00000014,inset 0 0 0 1px #88888828!important;}\n#page_pc_mini_bar.reapple-mini>.cmd-space{display:block!important;position:static!important;width:100%!important;height:54px!important;margin:0!important;padding:0!important;}\n#page_pc_mini_bar.reapple-mini [class*=MinibarHoverMask]{display:none!important;}\n#page_pc_mini_bar.reapple-mini .default-bar-wrapper{position:static!important;display:block!important;background:transparent!important;width:100%!important;height:54px!important;padding:0!important;border:0!important;}\n#page_pc_mini_bar.reapple-mini .default-bar-wrapper>.side:first-child{position:absolute!important;left:var(--mini-rail)!important;right:var(--mini-rail)!important;top:9px!important;width:auto!important;min-width:0!important;height:36px!important;padding:0!important;}\n#page_pc_mini_bar.reapple-mini .left{position:static!important;display:flex!important;align-items:center!important;gap:8px!important;width:100%!important;height:36px!important;padding:0!important;}\n#page_pc_mini_bar.reapple-mini :is([data-testid=tid_btn_pc_minibar_vinyl],[data-reapple-control=tid_btn_pc_minibar_vinyl]){width:34px!important;height:34px!important;min-width:34px!important;border-radius:6px!important;overflow:hidden!important;transform:none!important;animation:none!important;background:none!important;box-shadow:0 0 0 .5px #00000014!important;cursor:pointer;}\n#page_pc_mini_bar.reapple-mini :is([data-testid=tid_btn_pc_minibar_vinyl],[data-reapple-control=tid_btn_pc_minibar_vinyl])::before,#page_pc_mini_bar.reapple-mini :is([data-testid=tid_btn_pc_minibar_vinyl],[data-reapple-control=tid_btn_pc_minibar_vinyl])::after{display:none!important;}\n#page_pc_mini_bar.reapple-mini :is([data-testid=tid_btn_pc_minibar_vinyl],[data-reapple-control=tid_btn_pc_minibar_vinyl]) img{display:block!important;position:static!important;width:100%!important;height:100%!important;border:0!important;border-radius:6px!important;object-fit:cover!important;transform:none!important;animation:none!important;}\n#page_pc_mini_bar.reapple-mini [class*=songPlayInfo]{display:block!important;flex:1!important;min-width:0!important;width:auto!important;max-width:none!important;margin:0!important;padding:0!important;}\n#page_pc_mini_bar.reapple-mini .info-wrapper{display:block!important;width:100%!important;min-width:0!important;}\n#page_pc_mini_bar.reapple-mini .title-container{display:block!important;width:100%!important;max-width:100%!important;font-family:-apple-system,'PingFang SC',sans-serif!important;font-size:13px!important;line-height:16px!important;font-weight:500!important;letter-spacing:-.01em!important;}\n#page_pc_mini_bar.reapple-mini .main-title,#page_pc_mini_bar.reapple-mini .title{display:block!important;overflow:hidden!important;text-overflow:ellipsis!important;white-space:nowrap!important;font:inherit!important;}\n#page_pc_mini_bar.reapple-mini .author{display:block!important;overflow:hidden!important;text-overflow:ellipsis!important;white-space:nowrap!important;font-size:12px!important;font-weight:400!important;line-height:15px!important;opacity:.6;}\n#page_pc_mini_bar.reapple-mini .vip-tag,#page_pc_mini_bar.reapple-mini :is([data-testid=tid_playbar_comment_btn],[data-reapple-control=tid_playbar_comment_btn]),#page_pc_mini_bar.reapple-mini .redstar-count,#page_pc_mini_bar.reapple-mini :is([data-testid=tid_playbar_collect_btn],[data-reapple-control=tid_playbar_collect_btn]){display:none!important;}\n#page_pc_mini_bar.reapple-mini .left>.cmd-space:last-child{flex:0 0 64px!important;width:64px!important;margin:0!important;}\n#page_pc_mini_bar.reapple-mini .red-star-comment-wrapper{width:28px!important;display:block!important;}\n#page_pc_mini_bar.reapple-mini :is([data-testid=tid_redstar_btn],[data-reapple-control=tid_redstar_btn]){width:28px!important;height:28px!important;min-height:0!important;}\n#page_pc_mini_bar.reapple-mini :is([data-testid=tid_redstar_btn],[data-reapple-control=tid_redstar_btn]) .cmd-icon{font-size:17px!important;}\n#page_pc_mini_bar.reapple-mini .default-bar-wrapper>.middle{position:absolute!important;left:9px!important;top:9px!important;width:148px!important;height:36px!important;margin:0!important;padding:0!important;display:block!important;}\n#page_pc_mini_bar.reapple-mini :is([data-testid=tid_playbar_controls],[data-reapple-control=tid_playbar_controls]){height:36px!important;width:148px!important;display:flex!important;align-items:center!important;justify-content:flex-start!important;gap:0!important;}\n#page_pc_mini_bar.reapple-mini :is([data-testid=tid_playbar_controls],[data-reapple-control=tid_playbar_controls])>button,#page_pc_mini_bar.reapple-mini :is([data-testid=tid_playmode_btn],[data-reapple-control=tid_playmode_btn]),#page_pc_mini_bar.reapple-mini :is([data-testid=tid_playmode_btn],[data-reapple-control=tid_playmode_btn])>button{flex:none!important;width:28px!important;height:28px!important;min-width:0!important;min-height:0!important;margin:0!important;padding:0!important;}\n#page_pc_mini_bar.reapple-mini button{border-radius:50%!important;border:0!important;background:transparent!important;box-shadow:none!important;transition:background .15s,scale .16s!important;cursor:pointer;}\n#page_pc_mini_bar.reapple-mini button:hover{background:#80808016!important;}\n#page_pc_mini_bar.reapple-mini button:active{scale:.9;transition:scale .07s!important;}\n#page_pc_mini_bar.reapple-mini button:focus-visible{outline:2px solid #fa586a!important;outline-offset:2px;}\n#page_pc_mini_bar.reapple-mini :is([data-testid=tid_playbar_controls],[data-reapple-control=tid_playbar_controls])>:is([data-testid=tid_playbar_play_btn],[data-reapple-control=tid_playbar_play_btn]){width:36px!important;height:36px!important;background:transparent!important;}\n#page_pc_mini_bar.reapple-mini :is([data-testid=tid_playbar_controls],[data-reapple-control=tid_playbar_controls]) .cmd-icon{font-size:16px!important;}\n#page_pc_mini_bar.reapple-mini :is([data-testid=tid_playbar_prev_btn],[data-reapple-control=tid_playbar_prev_btn])>.cmd-button-content,#page_pc_mini_bar.reapple-mini :is([data-testid=tid_playbar_play_btn],[data-reapple-control=tid_playbar_play_btn])>.cmd-button-content,#page_pc_mini_bar.reapple-mini :is([data-testid=tid_playbar_next_btn],[data-reapple-control=tid_playbar_next_btn])>.cmd-button-content{visibility:hidden!important;}\n#page_pc_mini_bar.reapple-mini .reapple-mini-glyph{display:grid;place-items:center;position:absolute;inset:0;pointer-events:none;}\n#page_pc_mini_bar.reapple-mini .reapple-mini-glyph[data-mini-role=play]>svg{position:absolute;left:50%;top:50%;width:16px;height:18px;color:inherit;}\n#page_pc_mini_bar.reapple-mini .reapple-mini-glyph[data-mini-role=play]>svg[data-glyph=pause]{width:14px;height:18.333px;}\n#page_pc_mini_bar.reapple-mini .skip-glyph{position:relative;display:block;width:33px;height:19px;transform:scale(.64);pointer-events:none;}\n#page_pc_mini_bar.reapple-mini [data-mini-role=prev] .skip-glyph{transform:scale(-.64,.64);}\n#page_pc_mini_bar.reapple-mini .skip-glyph svg{position:absolute;left:0;top:0;width:16.5px;height:19px;transform-origin:8.25px 9.5px;}\n#page_pc_mini_bar.reapple-mini .reapple-mini-repeat{position:absolute!important;left:129px!important;top:13px!important;display:grid;place-items:center;width:28px!important;height:28px!important;color:inherit;}\n#page_pc_mini_bar.reapple-mini .reapple-mini-repeat svg{width:14px;height:14px;}\n#page_pc_mini_bar.reapple-mini .reapple-mini-repeat[aria-pressed=true]{color:#f34b62;background:#fa586a14!important;}\n#page_pc_mini_bar.reapple-mini .right-side,#page_pc_mini_bar.reapple-mini .right-side>.right,#page_pc_mini_bar.reapple-mini .right>.cmd-space{position:static!important;width:auto!important;height:auto!important;padding:0!important;}\n#page_pc_mini_bar.reapple-mini :is([data-testid=tid_playbar_playlist_btn],[data-reapple-control=tid_playbar_playlist_btn]),#page_pc_mini_bar.reapple-mini :is([data-testid=tid_playbar_lyric_btn],[data-reapple-control=tid_playbar_lyric_btn]),#page_pc_mini_bar.reapple-mini :is([data-testid=tid_playbar_volume_btn],[data-reapple-control=tid_playbar_volume_btn]),#page_pc_mini_bar.reapple-mini :is([data-testid=tid_playbar_soundquality],[data-reapple-control=tid_playbar_soundquality]),#page_pc_mini_bar.reapple-mini .right>button:last-child{position:absolute!important;top:9px!important;left:auto!important;width:36px!important;height:36px!important;min-width:0!important;min-height:0!important;padding:0!important;margin:0!important;display:grid!important;place-items:center!important;color:inherit;}\n#page_pc_mini_bar.reapple-mini :is([data-testid=tid_playbar_playlist_btn],[data-reapple-control=tid_playbar_playlist_btn]){right:83px!important;}\n#page_pc_mini_bar.reapple-mini :is([data-testid=tid_playbar_lyric_btn],[data-reapple-control=tid_playbar_lyric_btn]){right:120px!important;}\n#page_pc_mini_bar.reapple-mini :is([data-testid=tid_playbar_volume_btn],[data-reapple-control=tid_playbar_volume_btn]){right:9px!important;}\n#page_pc_mini_bar.reapple-mini :is([data-testid=tid_playbar_soundquality],[data-reapple-control=tid_playbar_soundquality]){right:46px!important;}\n#page_pc_mini_bar.reapple-mini :is([data-testid=tid_playbar_soundquality],[data-reapple-control=tid_playbar_soundquality]) .cmd-tag{font-size:9px!important;line-height:14px!important;padding:0 2px!important;max-width:34px!important;overflow:hidden!important;white-space:nowrap!important;}\n#page_pc_mini_bar.reapple-mini .right>button:last-child{right:165px!important;}\n#page_pc_mini_bar.reapple-mini .right .cmd-icon,#page_pc_mini_bar.reapple-mini :is([data-testid=tid_playbar_playlist_btn],[data-reapple-control=tid_playbar_playlist_btn]) .cmd-icon{font-size:17px!important;}\n#page_pc_mini_bar.reapple-mini>.cmd-space>[class*=SpaceContainer]{position:absolute!important;left:var(--mini-rail)!important;right:var(--mini-rail)!important;top:48px!important;width:auto!important;height:3px!important;padding:0!important;z-index:2;}\n#page_pc_mini_bar.reapple-mini .slider-default{width:100%!important;height:3px!important;border-radius:3px!important;background:#80808020!important;overflow:visible!important;}\n#page_pc_mini_bar.reapple-mini .slider-default .track{height:100%!important;top:0!important;border-radius:inherit!important;background:currentColor!important;opacity:.5;}\n#page_pc_mini_bar.reapple-mini .slider-default .cache{height:100%!important;top:0!important;border-radius:inherit!important;background:#80808014!important;}\n#page_pc_mini_bar.reapple-mini .slider-default .thumb{opacity:0!important;}\n#page_pc_mini_bar.reapple-mini .slider-default .hotzone-overlay{height:18px!important;top:-7.5px!important;}\n#page_pc_mini_bar.reapple-mini .slider-default .dots{display:none!important;}\n@media(prefers-color-scheme:dark){#page_pc_mini_bar.reapple-mini{background:rgba(38,39,43,.82)!important;color:#f1f1f3!important;box-shadow:0 8px 28px #0004,inset 0 0 0 1px #ffffff24!important;}#page_pc_mini_bar.reapple-mini[data-material=glass]{background:linear-gradient(150deg,#ffffff2e,#ffffff08 40%,#ffffff18)!important;box-shadow:0 10px 32px #0005,inset 0 1px 1px #ffffff66,inset 0 -1px 1px #ffffff22!important;}#page_pc_mini_bar.reapple-mini[data-material=solid]{background:#28292d!important;}}\n@media(max-width:800px){#page_pc_mini_bar.reapple-mini{--reapple-mini-sidebar:0px!important;--mini-side:120px;--mini-rail:130px;width:calc(100% - 24px)!important;}#page_pc_mini_bar.reapple-mini .default-bar-wrapper>.middle{width:120px!important;}#page_pc_mini_bar.reapple-mini :is([data-testid=tid_playmode_btn],[data-reapple-control=tid_playmode_btn]),#page_pc_mini_bar.reapple-mini .reapple-mini-repeat{display:none!important;}#page_pc_mini_bar.reapple-mini .left>.cmd-space:last-child{display:none!important;}}\n@media(prefers-reduced-motion:reduce){#page_pc_mini_bar.reapple-mini *{transition:none!important;animation:none!important;}}\n@media(prefers-reduced-transparency:reduce){#page_pc_mini_bar.reapple-mini{background:var(--colorBackgroundWhite,#f8f9fa)!important;backdrop-filter:none!important;-webkit-backdrop-filter:none!important;}}\n";
  miniStyle.textContent += "/* Neutralise only the host's hard constraints which conflict with the measured capsule. */\n#page_pc_mini_bar.reapple-mini .default-bar-wrapper,#page_pc_mini_bar.reapple-mini .middle,#page_pc_mini_bar.reapple-mini .side,#page_pc_mini_bar.reapple-mini .right{color:inherit!important;}\n#page_pc_mini_bar.reapple-mini button:not(:is([data-testid=tid_redstar_btn],[data-reapple-control=tid_redstar_btn])){color:inherit!important;}\n#page_pc_mini_bar.reapple-mini :is([data-testid=tid_playbar_controls],[data-reapple-control=tid_playbar_controls])>button{position:relative!important;}\n#page_pc_mini_bar.reapple-mini :is([data-testid=tid_btn_pc_minibar_vinyl],[data-reapple-control=tid_btn_pc_minibar_vinyl]){min-height:34px!important;max-height:34px!important;max-width:34px!important;margin:0!important;}\n#page_pc_mini_bar.reapple-mini [class*=songPlayInfo],#page_pc_mini_bar.reapple-mini .info-wrapper,#page_pc_mini_bar.reapple-mini .title-container{height:31px!important;min-height:31px!important;max-height:31px!important;}\n#page_pc_mini_bar.reapple-mini .main-title,#page_pc_mini_bar.reapple-mini .title{width:100%!important;max-width:100%!important;height:16px!important;margin:0!important;}\n#page_pc_mini_bar.reapple-mini .author{width:100%!important;height:15px!important;min-height:15px!important;margin:0!important;opacity:1!important;}\n#page_pc_mini_bar.reapple-mini .default-bar-wrapper>.side:first-child{right:157px!important;}\n#page_pc_mini_bar.reapple-mini>.cmd-space>[class*=SpaceContainer]{right:157px!important;}\n/* The original queue button stays in its React parent. The root transform is\n   the fixed-position containing block, so it can occupy the right utility slot. */\n#page_pc_mini_bar.reapple-mini :is([data-testid=tid_playbar_controls],[data-reapple-control=tid_playbar_controls])>:is([data-testid=tid_playbar_playlist_btn],[data-reapple-control=tid_playbar_playlist_btn]){position:fixed!important;top:9px!important;left:auto!important;right:83px!important;width:36px!important;height:36px!important;}\n";
  miniStyle.textContent += "\n#page_pc_mini_bar.reapple-mini .main-title [class*=MarqueeWrapper]{display:block!important;width:100%!important;overflow:hidden!important;mask-image:none!important;}\n#page_pc_mini_bar.reapple-mini .main-title .marquee{animation:none!important;transform:none!important;min-width:0!important;width:100%!important;display:block!important;}\n#page_pc_mini_bar.reapple-mini .main-title .marquee~.marquee{display:none!important;}\n#page_pc_mini_bar.reapple-mini .main-title .initial-child-container,#page_pc_mini_bar.reapple-mini .main-title .child{display:block!important;width:100%!important;transform:none!important;}\n#page_pc_mini_bar.reapple-mini .title>span{display:block!important;overflow:hidden!important;text-overflow:ellipsis!important;white-space:nowrap!important;font:inherit!important;}\n";
  miniStyle.textContent += "\n/* Stage100: one interpolated scalar drives metadata blur/opacity/mask, time labels,\n   and track geometry together. CSS retargets a running transition at its current value.\n   This fixes the missing in-between frames in99; 240ms/cubic-bezier below is an\n   explicit web adaptation, NOT a traced Apple mini-player animation constant. */\n@property --reapple-mini-hover{syntax:'<number>';inherits:true;initial-value:0;}\n#page_pc_mini_bar.reapple-mini{--reapple-mini-hover:0;transition:--reapple-mini-hover 240ms cubic-bezier(.2,0,0,1)!important;}\n#page_pc_mini_bar.reapple-mini:is(:has(.slider-default:hover,.slider-default input:focus-visible),[data-mini-scrubbing=true]){--reapple-mini-hover:1;}\n#page_pc_mini_bar.reapple-mini .default-bar-wrapper>.side:first-child{opacity:calc(1 - .7 * var(--reapple-mini-hover))!important;filter:blur(calc(5px * var(--reapple-mini-hover)));-webkit-mask-image:linear-gradient(#000 0%,#000 24%,rgba(0,0,0,calc(1 - var(--reapple-mini-hover))) 70%);mask-image:linear-gradient(#000 0%,#000 24%,rgba(0,0,0,calc(1 - var(--reapple-mini-hover))) 70%);}\n#page_pc_mini_bar.reapple-mini .right>button:last-child{opacity:calc(1 - var(--reapple-mini-hover))!important;}\n@media(prefers-reduced-motion:reduce){#page_pc_mini_bar.reapple-mini{transition:none!important;}}\n\n#page_pc_mini_bar.reapple-mini .reapple-mini-times{position:absolute;left:var(--mini-rail);right:157px;top:22px;z-index:3;display:flex;justify-content:space-between;font:400 13px/16px -apple-system,BlinkMacSystemFont,sans-serif;font-variant-numeric:tabular-nums;opacity:var(--reapple-mini-hover);transform:translateY(calc(3px * (1 - var(--reapple-mini-hover))));pointer-events:none;}\n#page_pc_mini_bar.reapple-mini:is(:has(.slider-default:hover,.slider-default input:focus-visible),[data-mini-scrubbing=true]) .default-bar-wrapper>.side:first-child{pointer-events:none;}\n#page_pc_mini_bar.reapple-mini:is(:has(.slider-default:hover,.slider-default input:focus-visible),[data-mini-scrubbing=true]) .right>button:last-child{pointer-events:none!important;}\n#page_pc_mini_bar.reapple-mini>.cmd-space>[class*=SpaceContainer]{top:calc(48px - 11px * var(--reapple-mini-hover))!important;height:calc(3px + 5px * var(--reapple-mini-hover))!important;}\n#page_pc_mini_bar.reapple-mini .slider-default{height:calc(3px + 5px * var(--reapple-mini-hover))!important;border-radius:calc(3px + 1px * var(--reapple-mini-hover))!important;}\n#page_pc_mini_bar.reapple-mini:is(:has(.slider-default:hover,.slider-default input:focus-visible),[data-mini-scrubbing=true]) .slider-default .hotzone-overlay{height:40px!important;top:-21px!important;}\n#page_pc_mini_bar.reapple-mini .slider-default .curtime-thumb{display:none!important;}\n#page_pc_mini_bar.reapple-mini [data-reapple-control=tid_redstar_btn] .cmd-button-content{display:grid!important;place-items:center!important;width:28px!important;height:28px!important;padding:0!important;}\n#page_pc_mini_bar.reapple-mini [data-reapple-control=tid_redstar_btn] .cmd-icon{position:relative!important;display:block!important;width:20px!important;height:20px!important;}\n#page_pc_mini_bar.reapple-mini [data-reapple-control=tid_redstar_btn] .cmd-icon svg{visibility:hidden!important;}\n#page_pc_mini_bar.reapple-mini [data-reapple-control=tid_redstar_btn] .cmd-icon::after{content:'';position:absolute;inset:0;background:currentColor;-webkit-mask:url('data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2024%2024%22%3E%3Cpath%20d%3D%22M12%2021s-8.5-5.2-8.5-11.5A4.75%204.75%200%200%201%2012%206.6a4.75%204.75%200%200%201%208.5%202.9C20.5%2015.8%2012%2021%2012%2021Z%22%20fill%3D%22none%22%20stroke%3D%22black%22%20stroke-width%3D%221.6%22%20stroke-linejoin%3D%22round%22%2F%3E%3C%2Fsvg%3E') center/contain no-repeat;mask:url('data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2024%2024%22%3E%3Cpath%20d%3D%22M12%2021s-8.5-5.2-8.5-11.5A4.75%204.75%200%200%201%2012%206.6a4.75%204.75%200%200%201%208.5%202.9C20.5%2015.8%2012%2021%2012%2021Z%22%20fill%3D%22none%22%20stroke%3D%22black%22%20stroke-width%3D%221.6%22%20stroke-linejoin%3D%22round%22%2F%3E%3C%2Fsvg%3E') center/contain no-repeat;pointer-events:none;}\n#page_pc_mini_bar.reapple-mini [data-reapple-control=tid_redstar_btn] .cmd-icon[class*=red]::after{-webkit-mask-image:url('data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2024%2024%22%3E%3Cpath%20d%3D%22M12%2021s-8.5-5.2-8.5-11.5A4.75%204.75%200%200%201%2012%206.6a4.75%204.75%200%200%201%208.5%202.9C20.5%2015.8%2012%2021%2012%2021Z%22%2F%3E%3C%2Fsvg%3E');mask-image:url('data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2024%2024%22%3E%3Cpath%20d%3D%22M12%2021s-8.5-5.2-8.5-11.5A4.75%204.75%200%200%201%2012%206.6a4.75%204.75%200%200%201%208.5%202.9C20.5%2015.8%2012%2021%2012%2021Z%22%2F%3E%3C%2Fsvg%3E');}\n/* Scope to semantic components; never round avatars, every image, or every button. */\nhtml[data-reapple-sidebar=true] #page_pc_main_tab [data-testid^=tid_navitem_]{border-radius:8px!important;}\nhtml[data-reapple-covers=true] :is(#page_pc_main_tab,.main-content-glass-mask) .cmd-metacard-resource .cover{border-radius:5px!important;overflow:hidden;}\nhtml[data-reapple-covers=true] :is(#page_pc_main_tab,.main-content-glass-mask) .cmd-metacard-resource .cover img{border-radius:inherit!important;}\nhtml[data-reapple-album=true] :is(#page_pc_songlist,#page_pc_album) [class*=StyledCover]{border-radius:12px!important;overflow:hidden;}\nhtml[data-reapple-album=true] :is(#page_pc_songlist,#page_pc_album) [class*=StyledCover] img{border-radius:inherit!important;}\nhtml[data-reapple-album=true] :is(#page_pc_songlist,#page_pc_album) .btns>.cmd-button{border-radius:999px!important;}\n";
  miniStyle.textContent += "\n/* Stage101: native search input / handlers stay in place. Host draws its border\n   with a masked ::after, not border. Remove that drawing, not the focus indicator.\n   160/180ms are web adaptation parameters, not extracted Apple timings. */\nhtml[data-reapple-search=true] .searchbox:has([data-testid=tid_searchbox_input]){\n background-image:none!important;background-color:var(--colorBlack10,rgba(127,127,127,.10))!important;\n border:0!important;border-radius:999px!important;box-shadow:0 0 0 3px transparent!important;\n transition:background-color 160ms cubic-bezier(.2,0,0,1),box-shadow 160ms cubic-bezier(.2,0,0,1)!important;\n}\nhtml[data-reapple-search=true] .searchbox:has([data-testid=tid_searchbox_input])::after{content:none!important;}\nhtml[data-reapple-search=true] .searchbox:has([data-testid=tid_searchbox_input]):hover{background-color:color-mix(in srgb,var(--colorBlack1,#808080) 13%,transparent)!important;}\nhtml[data-reapple-search=true] .searchbox:has([data-testid=tid_searchbox_input]):focus-within{\n background-color:color-mix(in srgb,var(--colorBlack1,#808080) 16%,transparent)!important;\n box-shadow:0 0 0 3px var(--colorPrimary5,rgba(252,59,91,.4))!important;\n}\nhtml[data-reapple-search=true] .searchbox [data-testid=tid_searchbox_input]{background:transparent!important;caret-color:var(--colorPrimary1,#fc3b5b)!important;}\nhtml[data-reapple-search=true] .searchbox [data-testid=tid_searchbox_btn]{background:transparent!important;border:0!important;box-shadow:none!important;border-radius:999px!important;}\nhtml[data-reapple-search=true] .searchbox :is(.icon,.icon-clear){transition:color 160ms ease!important;}\n/* Animate the inner surface only: the portal's placement, native keyboard handling,\n   history, suggestion fetching and hit testing remain owned by NetEase. */\nhtml[data-reapple-search=true] .cmd-popover-wrapper:has([class^=SearchResults_]){border-radius:16px!important;}\nhtml[data-reapple-search=true] .cmd-popover-wrapper:has([class^=SearchResults_])>.cmd-popover{\n border-radius:16px!important;overflow:hidden;transform-origin:top left;\n animation:reapple-search-reveal 180ms cubic-bezier(.2,0,0,1) both;\n}\n@keyframes reapple-search-reveal{from{opacity:.5;transform:translateY(-4px) scale(.985);}to{opacity:1;transform:translateY(0) scale(1);}}\n/* Host switches the rail's vertical translate by 2px on hover. Pin it so the\n   interpolated parent is the only source of movement. */\n#page_pc_mini_bar.reapple-mini .slider-default{top:0!important;transform:translateY(0)!important;}\n@media(prefers-reduced-motion:reduce){\n html[data-reapple-search=true] .searchbox,html[data-reapple-search=true] .searchbox :is(.icon,.icon-clear){transition:none!important;}\n html[data-reapple-search=true] .cmd-popover-wrapper:has([class^=SearchResults_])>.cmd-popover{animation:none!important;}\n}\n";
  miniStyle.textContent += "\n/* Stage102: complete the search group; keep both native action targets intact. */\nhtml[data-reapple-search=true] #page_pc_main_nav :is([data-testid=tid_header_back_btn],[data-testid=tid_header_recognize_btn]){box-sizing:border-box!important;width:36px!important;min-width:36px!important;height:36px!important;flex:0 0 36px!important;border:0!important;border-radius:50%!important;background:var(--colorBlack10,rgba(127,127,127,.1))!important;box-shadow:none!important;display:flex!important;align-items:center!important;justify-content:center!important;transition:background-color 160ms cubic-bezier(.2,0,0,1),transform 160ms cubic-bezier(.2,0,0,1),box-shadow 160ms cubic-bezier(.2,0,0,1)!important;}\nhtml[data-reapple-search=true] #page_pc_main_nav :is([data-testid=tid_header_back_btn],[data-testid=tid_header_recognize_btn])::after{content:none!important;}\nhtml[data-reapple-search=true] #page_pc_main_nav :is([data-testid=tid_header_back_btn],[data-testid=tid_header_recognize_btn]):not([aria-disabled=true]):not(.disabled):hover{background:color-mix(in srgb,var(--colorBlack1,#808080) 16%,transparent)!important;}\nhtml[data-reapple-search=true] #page_pc_main_nav :is([data-testid=tid_header_back_btn],[data-testid=tid_header_recognize_btn]):not([aria-disabled=true]):not(.disabled):active{transform:scale(.94);background:color-mix(in srgb,var(--colorBlack1,#808080) 20%,transparent)!important;}\nhtml[data-reapple-search=true] #page_pc_main_nav :is([data-testid=tid_header_back_btn],[data-testid=tid_header_recognize_btn]):focus-visible{outline:none!important;box-shadow:0 0 0 3px var(--colorPrimary5,rgba(252,59,91,.4))!important;}\n@media(prefers-reduced-motion:reduce){html[data-reapple-search=true] #page_pc_main_nav :is([data-testid=tid_header_back_btn],[data-testid=tid_header_recognize_btn]){transition:none!important;}html[data-reapple-search=true] #page_pc_main_nav :is([data-testid=tid_header_back_btn],[data-testid=tid_header_recognize_btn]):active{transform:none!important;}}\n";
  miniStyle.textContent += "\n/* The native grid reserves 28px for Back: expand that slot with the circular target. */\nhtml[data-reapple-search=true] #page_pc_main_nav>div:has(>[data-testid=tid_header_back_btn]){grid-template-columns:36px 8px 258px 8px 36px 20px auto 20px min-content!important;}\n";
  miniStyle.textContent += "\n/* Stage104: CSS grid projects the ORIGINAL native nodes into columns.\n   No text copies, reparenting, synthetic links or changes to virtual row height. */\nhtml[data-reapple-list=true] [class*=TrackViewerCss]:has(.th-album):not(:has(.th-artist)){ --reapple-index-width:45px; }\nhtml[data-reapple-list=true] [class*=TrackViewerCss]:has(.th-album):not(:has(.th-artist)) .tr{display:grid!important;grid-template-columns:var(--reapple-index-width) 52px minmax(0,1.35fr) minmax(0,1fr) 60px 76px!important;grid-template-rows:28px 28px;align-items:stretch;}\nhtml[data-reapple-list=true] [class*=TrackViewerCss]:has(.th-album):not(:has(.th-artist)) .thead .tr{grid-template-rows:40px;}\nhtml[data-reapple-list=true] [class*=TrackViewerCss]:has(.th-album):not(:has(.th-artist)) .tr>:is(.td,.th){width:auto!important;min-width:0!important;flex:none!important;}\nhtml[data-reapple-list=true] [class*=TrackViewerCss]:has(.th-album):not(:has(.th-artist)) .td-title,html[data-reapple-list=true] [class*=TrackViewerCss]:has(.th-album):not(:has(.th-artist)) .td-title [data-testid=tid_track_title_cell],html[data-reapple-list=true] [class*=TrackViewerCss]:has(.th-album):not(:has(.th-artist)) .td-title .cmd-metacard-table,html[data-reapple-list=true] [class*=TrackViewerCss]:has(.th-album):not(:has(.th-artist)) .td-title .cmd-metacard-content,html[data-reapple-list=true] [class*=TrackViewerCss]:has(.th-album):not(:has(.th-artist)) .td-title .sub-title{display:contents!important;}\nhtml[data-reapple-list=true] [class*=TrackViewerCss]:has(.th-album):not(:has(.th-artist)) .td-num{grid-column:1;grid-row:1/3;}\nhtml[data-reapple-list=true] [class*=TrackViewerCss]:has(.th-album):not(:has(.th-artist)) .cmd-metacard-resource{grid-column:2;grid-row:1/3;align-self:center;justify-self:start;margin:0 0 0 8px!important;}\nhtml[data-reapple-list=true] [class*=TrackViewerCss]:has(.th-album):not(:has(.th-artist)) .cmd-metacard-resource .cover,html[data-reapple-list=true] [class*=TrackViewerCss]:has(.th-album):not(:has(.th-artist)) .cmd-metacard-resource img{width:36px!important;height:36px!important;border-radius:5px!important;}\nhtml[data-reapple-list=true] [class*=TrackViewerCss]:has(.th-album):not(:has(.th-artist)) h4.title{grid-column:3;grid-row:1;align-self:end;margin:0!important;padding:0 16px 0 0;min-width:0!important;font-size:14px!important;line-height:20px!important;font-weight:400!important;}\nhtml[data-reapple-list=true] [class*=TrackViewerCss]:has(.th-album):not(:has(.th-artist)) .td-album{grid-column:3;grid-row:2;align-self:start;height:auto!important;padding:0 16px 0 0!important;font-size:13px!important;line-height:20px!important;color:var(--colorBlack5)!important;overflow:hidden;}\nhtml[data-reapple-list=true] [class*=TrackViewerCss]:has(.th-album):not(:has(.th-artist)) .td-album a{color:inherit!important;}\nhtml[data-reapple-list=true] [class*=TrackViewerCss]:has(.th-album):not(:has(.th-artist)) [data-testid=tid_tracktitlecell_artist]{grid-column:4;grid-row:1;align-self:end;margin:0!important;min-width:0!important;padding-right:16px;font-size:14px!important;line-height:20px!important;font-weight:400!important;color:var(--colorBlack4)!important;}\nhtml[data-reapple-list=true] [class*=TrackViewerCss]:has(.th-album):not(:has(.th-artist)) .sub-title>.tag{grid-column:4;grid-row:2;align-self:start;display:flex!important;gap:4px;align-items:center;height:20px;margin:0!important;min-width:0;overflow:hidden;}\nhtml[data-reapple-list=true] [class*=TrackViewerCss]:has(.th-album):not(:has(.th-artist)) .cmd-metacard-extra{grid-column:3;grid-row:1/3;align-self:center;justify-self:end;z-index:2;}\nhtml[data-reapple-list=true] [class*=TrackViewerCss]:has(.th-album):not(:has(.th-artist)) .td-oper{grid-column:5;grid-row:1/3;}\nhtml[data-reapple-list=true] [class*=TrackViewerCss]:has(.th-album):not(:has(.th-artist)) .td-duration{grid-column:6;grid-row:1/3;font-variant-numeric:tabular-nums;}\nhtml[data-reapple-list=true] [class*=TrackViewerCss]:has(.th-album):not(:has(.th-artist)) .th-num{grid-column:1;}\nhtml[data-reapple-list=true] [class*=TrackViewerCss]:has(.th-album):not(:has(.th-artist)) .th-title{grid-column:2/4;}\nhtml[data-reapple-list=true] [class*=TrackViewerCss]:has(.th-album):not(:has(.th-artist)) .th-album{grid-column:4;pointer-events:none;}\nhtml[data-reapple-list=true] [class*=TrackViewerCss]:has(.th-album):not(:has(.th-artist)) .th-album>*{display:none!important;}\nhtml[data-reapple-list=true] [class*=TrackViewerCss]:has(.th-album):not(:has(.th-artist)) .th-album::before{content:'歌手';}\nhtml[data-reapple-list=true] [class*=TrackViewerCss]:has(.th-album):not(:has(.th-artist)) .th-oper{grid-column:5;}\nhtml[data-reapple-list=true] [class*=TrackViewerCss]:has(.th-album):not(:has(.th-artist)) .th-duration{grid-column:6;}\n/* Do not advertise artist sorting while retaining an album-sort handler. */\nhtml[data-reapple-list=true] [class*=TrackViewerCss]:has(.th-album):not(:has(.th-artist)) .th-album .sort-handler{visibility:hidden!important;}\nhtml[data-reapple-mv=false] [class*=TrackViewerCss] [data-testid=tid_track_mv_tag]{display:none!important;}\nhtml[data-reapple-quality=false] [class*=TrackViewerCss] [class*=qualityTagClassName]{display:none!important;}\n/* Number toggle is independent. A collapsed number column must not remove Play. */\nhtml[data-reapple-number=false] [class*=TrackViewerCss] :is(.th-num,.td-num){width:0!important;min-width:0!important;flex:0 0 0!important;padding:0!important;}\nhtml[data-reapple-number=false] [class*=TrackViewerCss] .th-num>*{display:none!important;}\nhtml[data-reapple-number=false] [class*=TrackViewerCss] .td-num .text{display:none!important;}\nhtml[data-reapple-number=false] [class*=TrackViewerCss] .td-num{position:absolute!important;left:8px;top:10px;width:36px!important;height:36px!important;z-index:4;pointer-events:none;}\nhtml[data-reapple-number=false] [class*=TrackViewerCss] .td-num .play-btn{pointer-events:auto;}\nhtml[data-reapple-number=false] [class*=TrackViewerCss]:has(.th-album):not(:has(.th-artist)){--reapple-index-width:0px;}\n";
  miniStyle.textContent += "\n/* Keep native hover actions clear of the two-line text, rather than painting over it. */\nhtml[data-reapple-list=true] [class*=TrackViewerCss]:has(.th-album):not(:has(.th-artist)) .tr:is(:hover,:focus-within) h4.title,html[data-reapple-list=true] [class*=TrackViewerCss]:has(.th-album):not(:has(.th-artist)) .tr:is(:hover,:focus-within) .td-album{padding-right:132px!important;}\nhtml[data-reapple-list=true] [class*=TrackViewerCss]:has(.th-album):not(:has(.th-artist)) .th-album{padding-left:0!important;}\nhtml[data-reapple-list=true] [class*=TrackViewerCss]:has(.th-album):not(:has(.th-artist)) .td-album .album-more{min-width:0;max-width:100%;}\nhtml[data-reapple-list=true] [class*=TrackViewerCss]:has(.th-album):not(:has(.th-artist)) .td-album a{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}\nhtml[data-reapple-list=true][data-reapple-mv=true][data-reapple-quality=true] [class*=TrackViewerCss]:has(.th-album):not(:has(.th-artist)) .tr:not(:has(.sub-title>.tag>*)) [data-testid=tid_tracktitlecell_artist]{grid-row:1/3;align-self:center;}\nhtml[data-reapple-list=true][data-reapple-mv=true][data-reapple-quality=false] [class*=TrackViewerCss]:has(.th-album):not(:has(.th-artist)) .tr:not(:has(.sub-title>.tag>*:not([class*=qualityTagClassName]))) [data-testid=tid_tracktitlecell_artist]{grid-row:1/3;align-self:center;}\nhtml[data-reapple-list=true][data-reapple-mv=false][data-reapple-quality=true] [class*=TrackViewerCss]:has(.th-album):not(:has(.th-artist)) .tr:not(:has(.sub-title>.tag>*:not([data-testid=tid_track_mv_tag]))) [data-testid=tid_tracktitlecell_artist]{grid-row:1/3;align-self:center;}\nhtml[data-reapple-list=true][data-reapple-mv=false][data-reapple-quality=false] [class*=TrackViewerCss]:has(.th-album):not(:has(.th-artist)) .tr:not(:has(.sub-title>.tag>*:not([data-testid=tid_track_mv_tag]):not([class*=qualityTagClassName]))) [data-testid=tid_tracktitlecell_artist]{grid-row:1/3;align-self:center;}\n";
  miniStyle.textContent += "\n/* Collapsing the grid track must not collapse the overlaid native Play target. */\nhtml[data-reapple-number=false] [class*=TrackViewerCss] .tr>.td.td-num{width:36px!important;min-width:36px!important;max-width:36px!important;}\nhtml[data-reapple-number=false] [class*=TrackViewerCss] .td-num>div{position:relative!important;width:36px!important;height:36px!important;}\nhtml[data-reapple-number=false] [class*=TrackViewerCss] .td-num .play-btn{position:absolute!important;inset:0!important;width:36px!important;height:36px!important;border-radius:5px!important;background:rgba(0,0,0,.35)!important;color:white!important;}\n";
  miniStyle.textContent += "\n/* Stage107: match the native two-line lockup's hierarchy without altering the\n   host's 56px virtual row geometry. Artwork40 + gap12, subtitle12/18. */\nhtml[data-reapple-list=true] [class*=TrackViewerCss]:has(.th-album):not(:has(.th-artist)) .tr{grid-template-columns:var(--reapple-index-width) 60px minmax(0,1.35fr) minmax(0,1fr) 60px 76px!important;}\nhtml[data-reapple-list=true] [class*=TrackViewerCss]:has(.th-album):not(:has(.th-artist)) .cmd-metacard-resource{width:40px!important;}\nhtml[data-reapple-list=true] [class*=TrackViewerCss]:has(.th-album):not(:has(.th-artist)) .cmd-metacard-resource .cover,html[data-reapple-list=true] [class*=TrackViewerCss]:has(.th-album):not(:has(.th-artist)) .cmd-metacard-resource img{width:40px!important;height:40px!important;border-radius:5px!important;}\nhtml[data-reapple-list=true] [class*=TrackViewerCss]:has(.th-album):not(:has(.th-artist)) h4.title{font-size:14px!important;line-height:18px!important;}\nhtml[data-reapple-list=true] [class*=TrackViewerCss]:has(.th-album):not(:has(.th-artist)) .td-album{font-size:12px!important;line-height:18px!important;padding-top:2px!important;}\nhtml[data-reapple-list=true] [class*=TrackViewerCss]:has(.th-album):not(:has(.th-artist)) [data-testid=tid_tracktitlecell_artist]{font-size:13px!important;line-height:18px!important;}\nhtml[data-reapple-list=true] [class*=TrackViewerCss]:has(.th-album):not(:has(.th-artist)) [data-testid=tid_table_viewer_row]::after{content:'';position:absolute;left:calc(var(--reapple-index-width) + 60px);right:8px;bottom:0;height:1px;background:var(--colorBlack11,rgba(127,127,127,.06));pointer-events:none;}\nhtml[data-reapple-vip=false] [class*=TrackViewerCss] .tag>[aria-label=\"Tag: VIP\"]{display:none!important;}\nhtml[data-reapple-number=false][data-reapple-list=true] [class*=TrackViewerCss]:has(.th-album):not(:has(.th-artist)) .tr>.td.td-num{top:8px!important;width:40px!important;min-width:40px!important;max-width:40px!important;height:40px!important;}\nhtml[data-reapple-number=false][data-reapple-list=true] [class*=TrackViewerCss]:has(.th-album):not(:has(.th-artist)) .td-num>div,html[data-reapple-number=false][data-reapple-list=true] [class*=TrackViewerCss]:has(.th-album):not(:has(.th-artist)) .td-num .play-btn{width:40px!important;height:40px!important;}\nhtml[data-reapple-list=true][data-reapple-mv=true][data-reapple-quality=true][data-reapple-vip=true] [class*=TrackViewerCss]:has(.th-album):not(:has(.th-artist)) .tr:not(:has(.sub-title>.tag>*)) [data-testid=tid_tracktitlecell_artist]{grid-row:1/3;align-self:center;}\nhtml[data-reapple-list=true][data-reapple-mv=true][data-reapple-quality=true][data-reapple-vip=false] [class*=TrackViewerCss]:has(.th-album):not(:has(.th-artist)) .tr:not(:has(.sub-title>.tag>*:not([aria-label=\"Tag: VIP\"]))) [data-testid=tid_tracktitlecell_artist]{grid-row:1/3;align-self:center;}\nhtml[data-reapple-list=true][data-reapple-mv=true][data-reapple-quality=false][data-reapple-vip=true] [class*=TrackViewerCss]:has(.th-album):not(:has(.th-artist)) .tr:not(:has(.sub-title>.tag>*:not([class*=qualityTagClassName]))) [data-testid=tid_tracktitlecell_artist]{grid-row:1/3;align-self:center;}\nhtml[data-reapple-list=true][data-reapple-mv=true][data-reapple-quality=false][data-reapple-vip=false] [class*=TrackViewerCss]:has(.th-album):not(:has(.th-artist)) .tr:not(:has(.sub-title>.tag>*:not([class*=qualityTagClassName]):not([aria-label=\"Tag: VIP\"]))) [data-testid=tid_tracktitlecell_artist]{grid-row:1/3;align-self:center;}\nhtml[data-reapple-list=true][data-reapple-mv=false][data-reapple-quality=true][data-reapple-vip=true] [class*=TrackViewerCss]:has(.th-album):not(:has(.th-artist)) .tr:not(:has(.sub-title>.tag>*:not([data-testid=tid_track_mv_tag]))) [data-testid=tid_tracktitlecell_artist]{grid-row:1/3;align-self:center;}\nhtml[data-reapple-list=true][data-reapple-mv=false][data-reapple-quality=true][data-reapple-vip=false] [class*=TrackViewerCss]:has(.th-album):not(:has(.th-artist)) .tr:not(:has(.sub-title>.tag>*:not([data-testid=tid_track_mv_tag]):not([aria-label=\"Tag: VIP\"]))) [data-testid=tid_tracktitlecell_artist]{grid-row:1/3;align-self:center;}\nhtml[data-reapple-list=true][data-reapple-mv=false][data-reapple-quality=false][data-reapple-vip=true] [class*=TrackViewerCss]:has(.th-album):not(:has(.th-artist)) .tr:not(:has(.sub-title>.tag>*:not([data-testid=tid_track_mv_tag]):not([class*=qualityTagClassName]))) [data-testid=tid_tracktitlecell_artist]{grid-row:1/3;align-self:center;}\nhtml[data-reapple-list=true][data-reapple-mv=false][data-reapple-quality=false][data-reapple-vip=false] [class*=TrackViewerCss]:has(.th-album):not(:has(.th-artist)) .tr:not(:has(.sub-title>.tag>*:not([data-testid=tid_track_mv_tag]):not([class*=qualityTagClassName]):not([aria-label=\"Tag: VIP\"]))) [data-testid=tid_tracktitlecell_artist]{grid-row:1/3;align-self:center;}\n";
  miniStyle.textContent += "\n/* Stage108: one native More entry in a reserved trailing column.\n   Download/favourite/comment already belong to the host track menu; no new handlers.\n   Fix artwork shrink: host cover margin consumed 10px inside a 40px flex box. */\nhtml[data-reapple-list=true] [class*=TrackViewerCss]:has(.th-album):not(:has(.th-artist)) .tr{grid-template-columns:var(--reapple-index-width) 60px minmax(0,1.35fr) minmax(0,1fr) 44px 64px 40px!important;}\nhtml[data-reapple-list=true] [class*=TrackViewerCss]:has(.th-album):not(:has(.th-artist)) .cmd-metacard-resource{min-width:40px!important;flex-shrink:0!important;}\nhtml[data-reapple-list=true] [class*=TrackViewerCss]:has(.th-album):not(:has(.th-artist)) .cmd-metacard-resource .cover{box-sizing:border-box!important;flex:0 0 40px!important;min-width:40px!important;max-width:40px!important;width:40px!important;height:40px!important;margin:0!important;}\nhtml[data-reapple-list=true] [class*=TrackViewerCss]:has(.th-album):not(:has(.th-artist)) .cmd-metacard-resource img{width:40px!important;height:40px!important;object-fit:cover!important;}\nhtml[data-reapple-list=true] [class*=TrackViewerCss]:has(.th-album):not(:has(.th-artist)) .tr:is(:hover,:focus-within) h4.title{padding-right:16px!important;}\nhtml[data-reapple-list=true] [class*=TrackViewerCss]:has(.th-album):not(:has(.th-artist)) .tr:is(:hover,:focus-within) .td-album{padding-right:16px!important;}\nhtml[data-reapple-list=true] [class*=TrackViewerCss]:has(.th-album):not(:has(.th-artist)) .cmd-metacard-extra{grid-column:7!important;grid-row:1/3;display:flex!important;align-self:center;justify-self:center;align-items:center;justify-content:center;box-sizing:border-box;width:32px!important;height:32px!important;min-width:0!important;margin:0!important;padding:0!important;opacity:0;pointer-events:none;transition:opacity 160ms cubic-bezier(.2,0,0,1);}\nhtml[data-reapple-list=true] [class*=TrackViewerCss]:has(.th-album):not(:has(.th-artist)) .cmd-metacard-extra>div{display:flex!important;align-items:center;justify-content:center;gap:0!important;margin:0!important;padding:0!important;}\nhtml[data-reapple-list=true] [class*=TrackViewerCss]:has(.th-album):not(:has(.th-artist)) .cmd-metacard-extra button:not([data-testid=tid_tracktitlecell_more_btn]){display:none!important;}\nhtml[data-reapple-list=true] [class*=TrackViewerCss]:has(.th-album):not(:has(.th-artist)) .cmd-metacard-extra [data-testid=tid_tracktitlecell_more_btn]{display:inline-flex!important;visibility:visible!important;align-items:center;justify-content:center;width:32px!important;min-width:32px!important;height:32px!important;margin:0!important;padding:0!important;border:0!important;border-radius:6px!important;background:transparent!important;box-shadow:none!important;color:var(--colorBlack4)!important;pointer-events:inherit;}\nhtml[data-reapple-list=true] [class*=TrackViewerCss]:has(.th-album):not(:has(.th-artist)) .cmd-metacard-extra [data-testid=tid_tracktitlecell_more_btn] .cmd-icon{font-size:18px!important;width:18px!important;height:18px!important;}\nhtml[data-reapple-list=true] [class*=TrackViewerCss]:has(.th-album):not(:has(.th-artist)) .tr:is(:hover,:focus-within) .cmd-metacard-extra{opacity:1;pointer-events:auto;}\nhtml[data-reapple-list=true] [class*=TrackViewerCss]:has(.th-album):not(:has(.th-artist)) .cmd-metacard-extra [data-testid=tid_tracktitlecell_more_btn]:hover{background:var(--colorBlack10)!important;color:var(--colorBlack1)!important;}\nhtml[data-reapple-list=true] [class*=TrackViewerCss]:has(.th-album):not(:has(.th-artist)) .cmd-metacard-extra [data-testid=tid_tracktitlecell_more_btn]:focus-visible{outline:2px solid var(--colorPrimary5)!important;outline-offset:1px;}\n@media(prefers-reduced-motion:reduce){html[data-reapple-list=true] [class*=TrackViewerCss]:has(.th-album):not(:has(.th-artist)) .cmd-metacard-extra{transition:none!important;}}\n";
  miniStyle.textContent += "\n/* Stage109: swap only positions; keep native quality/like nodes and handlers. */\n#page_pc_mini_bar.reapple-mini .default-bar-wrapper>.side:first-child{opacity:1!important;filter:none!important;-webkit-mask-image:none!important;mask-image:none!important;}\n#page_pc_mini_bar.reapple-mini .left{display:grid!important;grid-template-columns:34px minmax(0,1fr);column-gap:8px!important;padding-right:89px!important;box-sizing:border-box!important;}\n#page_pc_mini_bar.reapple-mini .left>.cmd-space:has(.red-star-comment-wrapper),#page_pc_mini_bar.reapple-mini .red-star-comment-wrapper{display:contents!important;}\n#page_pc_mini_bar.reapple-mini [data-reapple-control=tid_redstar_btn]{position:fixed!important;left:auto!important;right:46px!important;top:9px!important;width:36px!important;height:36px!important;margin:0!important;padding:0!important;display:grid!important;place-items:center!important;pointer-events:auto!important;}\n#page_pc_mini_bar.reapple-mini [data-reapple-control=tid_playbar_soundquality]{right:202px!important;}\n#page_pc_mini_bar.reapple-mini .left>:is(.miniVinylWrapper,[class*=songPlayInfo]),#page_pc_mini_bar.reapple-mini [data-reapple-control=tid_playbar_soundquality]{opacity:calc(1 - .7 * var(--reapple-mini-hover))!important;filter:blur(calc(5px * var(--reapple-mini-hover)));-webkit-mask-image:linear-gradient(#000 0%,#000 24%,rgba(0,0,0,calc(1 - var(--reapple-mini-hover))) 70%);mask-image:linear-gradient(#000 0%,#000 24%,rgba(0,0,0,calc(1 - var(--reapple-mini-hover))) 70%);}\n";
  miniStyle.textContent += "\n/* Stage111: borderless capsule; native artwork target and React range stay intact.\n   Timing/optics are a web adaptation, not claimed Apple shader constants. */\n#page_pc_mini_bar.reapple-mini,\n#page_pc_mini_bar.reapple-mini[data-material=glass],\n#page_pc_mini_bar.reapple-mini[data-material=solid]{\n border:0!important;box-shadow:0 8px 28px #00000016,0 2px 6px #00000009!important;\n transition:--reapple-mini-hover 220ms cubic-bezier(.2,.7,.2,1)!important;\n}\n#page_pc_mini_bar.reapple-mini::before,#page_pc_mini_bar.reapple-mini::after{border:0!important;box-shadow:none!important;}\n@media(prefers-color-scheme:dark){\n #page_pc_mini_bar.reapple-mini,#page_pc_mini_bar.reapple-mini[data-material=glass],#page_pc_mini_bar.reapple-mini[data-material=solid]{box-shadow:0 8px 28px #00000038,0 2px 6px #00000018!important;}\n}\n/* Reuse the cover's click target; the decorative overlay never intercepts input. */\n#page_pc_mini_bar.reapple-mini :is([data-testid=tid_btn_pc_minibar_vinyl],[data-reapple-control=tid_btn_pc_minibar_vinyl]){position:relative!important;isolation:isolate;}\n#page_pc_mini_bar.reapple-mini :is([data-testid=tid_btn_pc_minibar_vinyl],[data-reapple-control=tid_btn_pc_minibar_vinyl])::before,\n#page_pc_mini_bar.reapple-mini :is([data-testid=tid_btn_pc_minibar_vinyl],[data-reapple-control=tid_btn_pc_minibar_vinyl])::after{\n content:''!important;display:block!important;position:absolute!important;inset:0!important;width:auto!important;height:auto!important;margin:0!important;border:0!important;border-radius:inherit!important;pointer-events:none!important;opacity:0!important;transition:opacity 160ms ease,transform 200ms cubic-bezier(.2,.7,.2,1)!important;\n}\n#page_pc_mini_bar.reapple-mini :is([data-testid=tid_btn_pc_minibar_vinyl],[data-reapple-control=tid_btn_pc_minibar_vinyl])::before{background:#0006!important;z-index:1;}\n#page_pc_mini_bar.reapple-mini :is([data-testid=tid_btn_pc_minibar_vinyl],[data-reapple-control=tid_btn_pc_minibar_vinyl])::after{\n z-index:2;transform:scale(.88)!important;\n background:transparent url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath d='M14 5h5v5M19 5l-6 6M10 19H5v-5M5 19l6-6' fill='none' stroke='white' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E\") center/20px 20px no-repeat!important;\n}\n#page_pc_mini_bar.reapple-mini :is([data-testid=tid_btn_pc_minibar_vinyl],[data-reapple-control=tid_btn_pc_minibar_vinyl]):is(:hover,:focus-visible)::before,\n#page_pc_mini_bar.reapple-mini :is([data-testid=tid_btn_pc_minibar_vinyl],[data-reapple-control=tid_btn_pc_minibar_vinyl]):is(:hover,:focus-visible)::after{opacity:1!important;transform:scale(1)!important;}\n/* The seek overlay stays at y=40.5..58.5 throughout the animated rail lift.\n   Previously its bounds jumped from y=40.5 to y=16, swallowing the artwork.\n   Keep the native range and its width/value/pointer capture unmodified. */\n#page_pc_mini_bar.reapple-mini .slider-default .hotzone-overlay,\n#page_pc_mini_bar.reapple-mini:is(:has(.slider-default:hover,.slider-default input:focus-visible),[data-mini-scrubbing=true]) .slider-default .hotzone-overlay{\n height:18px!important;top:calc(-7.5px + 11px * var(--reapple-mini-hover))!important;\n}\n#page_pc_mini_bar.reapple-mini .default-bar-wrapper>.side:first-child{pointer-events:auto!important;}\n#page_pc_mini_bar.reapple-mini .left>:is(.miniVinylWrapper,[class*=songPlayInfo]),\n#page_pc_mini_bar.reapple-mini [data-reapple-control=tid_playbar_soundquality]{\n opacity:calc(1 - .85 * var(--reapple-mini-hover))!important;\n filter:blur(calc(3px * var(--reapple-mini-hover)));\n -webkit-mask-image:linear-gradient(#000 0%,#000 24%,rgba(0,0,0,calc(1 - var(--reapple-mini-hover))) 85%);\n mask-image:linear-gradient(#000 0%,#000 24%,rgba(0,0,0,calc(1 - var(--reapple-mini-hover))) 85%);\n}\n#page_pc_mini_bar.reapple-mini .slider-default .track{opacity:calc(.5 + .3 * var(--reapple-mini-hover));}\n#page_pc_mini_bar.reapple-mini .reapple-mini-times{font-size:12px;line-height:16px;transform:translateY(calc(2px * (1 - var(--reapple-mini-hover))));}\n@media(prefers-reduced-motion:reduce){\n #page_pc_mini_bar.reapple-mini,\n #page_pc_mini_bar.reapple-mini[data-material=glass],\n #page_pc_mini_bar.reapple-mini[data-material=solid],\n #page_pc_mini_bar.reapple-mini :is([data-testid=tid_btn_pc_minibar_vinyl],[data-reapple-control=tid_btn_pc_minibar_vinyl])::before,\n #page_pc_mini_bar.reapple-mini :is([data-testid=tid_btn_pc_minibar_vinyl],[data-reapple-control=tid_btn_pc_minibar_vinyl])::after{transition:none!important;}\n}\n";
  miniStyle.textContent += "\n/* Stage113: one backdrop blur surface for the entire metadata region.\n   The time labels and seek track are above it; native controls keep their parents. */\n#page_pc_mini_bar.reapple-mini .left>:is(.miniVinylWrapper,[class*=songPlayInfo]),\n#page_pc_mini_bar.reapple-mini .left .info-wrapper,\n#page_pc_mini_bar.reapple-mini [data-reapple-control=tid_playbar_soundquality]{\n opacity:1!important;filter:none!important;-webkit-mask-image:none!important;mask-image:none!important;\n}\n#page_pc_mini_bar.reapple-mini .reapple-mini-metadata-blur{\n position:absolute;left:var(--mini-rail);right:157px;top:7px;height:40px;\n z-index:3;pointer-events:none;border-radius:8px;\n backdrop-filter:blur(calc(5px * var(--reapple-mini-hover)));\n -webkit-backdrop-filter:blur(calc(5px * var(--reapple-mini-hover)));\n}\n#page_pc_mini_bar.reapple-mini .reapple-mini-times{z-index:5;}\n#page_pc_mini_bar.reapple-mini>.cmd-space>[class*=SpaceContainer]{z-index:4;}\n/* Clip only the painted track, NOT the slider: its 18px hit target must stay live.\n   The host owns --track-precent / --cache-percent, so no copied playback clock. */\n#page_pc_mini_bar.reapple-mini .slider-default:has(>.reapple-mini-track-shell){background:transparent!important;}\n#page_pc_mini_bar.reapple-mini .slider-default:has(>.reapple-mini-track-shell)>.track,\n#page_pc_mini_bar.reapple-mini .slider-default:has(>.reapple-mini-track-shell)>.cache{opacity:0!important;}\n#page_pc_mini_bar.reapple-mini .reapple-mini-track-shell{\n position:absolute;inset:0;display:block;overflow:hidden;border-radius:inherit;\n background:#80808020;pointer-events:none;\n}\n#page_pc_mini_bar.reapple-mini .reapple-mini-track-shell::before,\n#page_pc_mini_bar.reapple-mini .reapple-mini-track-shell::after{\n content:'';position:absolute;left:0;top:0;height:100%;border-radius:inherit;pointer-events:none;\n}\n#page_pc_mini_bar.reapple-mini .reapple-mini-track-shell::before{width:clamp(0%,var(--cache-percent,0%),100%);background:#80808014;}\n#page_pc_mini_bar.reapple-mini .reapple-mini-track-shell::after{width:clamp(0%,var(--track-precent,0%),100%);background:currentColor;opacity:calc(.5 + .3 * var(--reapple-mini-hover));}\n";
  miniStyle.textContent += "\n/* Stage114: blur actual painted content, not a backdrop sampling surface.\n   The native host can composite text above a backdrop; direct filters avoid that.\n   Scope to artwork/text leaves so fixed-position native controls never relocate. */\n#page_pc_mini_bar.reapple-mini .reapple-mini-metadata-blur{display:none!important;}\n#page_pc_mini_bar.reapple-mini .left > [data-reapple-control=tid_btn_pc_minibar_vinyl],\n#page_pc_mini_bar.reapple-mini .left .main-title,\n#page_pc_mini_bar.reapple-mini .left .author,\n#page_pc_mini_bar.reapple-mini [data-reapple-control=tid_playbar_soundquality]{\n filter:blur(calc(5px * var(--reapple-mini-hover)))!important;\n opacity:calc(1 - .72 * var(--reapple-mini-hover))!important;\n -webkit-mask-image:none!important;mask-image:none!important;\n}\n";
  miniStyle.textContent += "\n/* Stage117: blur after native text truncation, never inside a clipped line.\n   The transparent metadata paint spills into one continuous visual field. Native\n   Like retains its fixed containing block; no React-owned nodes are reparented. */\n#page_pc_mini_bar.reapple-mini .default-bar-wrapper>.side:first-child,\n#page_pc_mini_bar.reapple-mini .left,\n#page_pc_mini_bar.reapple-mini .left > [class*=songPlayInfo]{overflow:visible!important;}\n#page_pc_mini_bar.reapple-mini .left .main-title,\n#page_pc_mini_bar.reapple-mini .left .author{\n filter:none!important;opacity:1!important;\n}\n#page_pc_mini_bar.reapple-mini .left > [class*=songPlayInfo],\n#page_pc_mini_bar.reapple-mini .left > [data-reapple-control=tid_btn_pc_minibar_vinyl],\n#page_pc_mini_bar.reapple-mini [data-reapple-control=tid_playbar_soundquality]{\n filter:blur(calc(5px * var(--reapple-mini-hover)))!important;\n opacity:calc(1 - .72 * var(--reapple-mini-hover))!important;\n -webkit-mask-image:none!important;mask-image:none!important;\n}\n";
  document.documentElement.appendChild(miniStyle);
  document.addEventListener("pointerdown", lyricMenuOutside, true);
  document.addEventListener("keydown", lyricMenuKey);

  // The master switch is the one case where the page must not claim the html class at all: that
  // class is what suppresses the host's own vinyl chrome, so adding it with the master off would
  // leave NetEase with a blank page and nothing visible to show for it.  tick() re-adds it as soon
  // as the switch comes back, so a live flip needs no reload.
  if (cfg.playPage) document.documentElement.classList.add("kabi-on");
  // Preserve the current expanded/collapsed state during reinjection.

  function coverImg() {
    return document.querySelector("[class*='Cover_c1l42i2x'] img");
  }

  function pageOpen() {
    var root = document.getElementById("vinyl-page-container");
    if (!root) return false;
    var store = hostStore_ || queueStore();
    var page = store && store.getState()["page:vinylPage"];
    // HOST-mode72.js declares opening/opened/closing/closed. Baseline capture shows 48
    // visible, unstyled frames before the old top<80 gate caught up (~615ms). Styling is
    // a view of host intent, not of how far its entrance animation has travelled.
    if (page && page.pageState) return page.pageState !== "closed";
    var box = root.getBoundingClientRect();
    return box.height > 200 && box.top < stageBox().height;
  }

  // The mesh markup this stage owns. Mesh instances are canvases, not <img>: the host app
  // installs a document-wide image proxy that rewrites every img[src] back to orpheus://cache/
  // within about a second, which silently discarded the graded raster. A canvas has no src.
  function meshMarkup() {
    return "<div class='zoom'><canvas></canvas></div>"
      + "<div class='zoom fade'><canvas></canvas></div>";
  }

  function ensureBg() {
    if (!cfg.backdrop) return null;
    var root = document.getElementById("vinyl-page-container");
    if (!root) return null;
    var bg = document.getElementById("kabi-bg");
    if (!bg) {
      bg = document.createElement("div");
      bg.id = "kabi-bg";
      bg.innerHTML = meshMarkup();
      installBackdropDither(bg);
      root.insertBefore(bg, root.firstChild);
      return bg;
    }
    installBackdropDither(bg);
    // Validate the mesh instead of trusting the id. An older build armed through
    // addScriptToEvaluateOnNewDocument re-fires whenever NetEase creates a document and runs
    // after this one, rebuilding #kabi-bg out of its own markup -- "<div class='zoom'><img></div>"
    // plus a stray <i> -- while leaving the id, and leaving this stylesheet's canvas-only sizing
    // rules unapplied to the orphan. The <img> then laid out at its intrinsic 390x390, centred
    // by .zoom's flex box: a second album cover floating over the middle of the page.
    // ensureArt already guarded its layers this way; the backdrop did not.
    var layers = bg.querySelectorAll(".zoom");
    var sound = layers.length === 2;
    for (var i = 0; sound && i < layers.length; i++) {
      if (!layers[i].querySelector("canvas")) sound = false;
    }
    if (!sound) {
      bg.innerHTML = meshMarkup();
      // blendCover caches the layer list, its pending token and its blend timer on the
      // container; a rebuilt mesh makes all three stale, so drop the state and let the next
      // sync re-blend from the fresh canvases.
      var stale = bg._kabiBlend;
      if (stale) {
        clearTimeout(stale.timer);
        cancelAnimationFrame(stale.frame);
        var at = imageStates.indexOf(stale);
        if (at >= 0) imageStates.splice(at, 1);
        bg._kabiBlend = null;
      }
    }
    return bg;
  }

  // Web-output adaptation, not a claim about Apple's private framebuffer format.
  // A stationary, one-device-pixel dither is composited AFTER mesh scaling/rotation.
  // Generate once: no animation, no full-frame JS pixel loop on each display frame.
  function installBackdropDither(bg) {
    if (bg.querySelector(".reapple-backdrop-dither")) return;
    var tile = document.createElement("canvas"); tile.width = tile.height = 128;
    var ctx = tile.getContext("2d"), pixels = ctx.createImageData(128, 128);
    var seed = 730201;
    for (var i = 0; i < pixels.data.length; i += 4) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      var value = (seed >>> 24); // neutral, zero-mean around mid-grey
      pixels.data[i] = pixels.data[i + 1] = pixels.data[i + 2] = value;
      pixels.data[i + 3] = 255;
    }
    ctx.putImageData(pixels, 0, 0);
    var layer = document.createElement("div"); layer.className = "reapple-backdrop-dither";
    var dpr = window.devicePixelRatio || 1;
    layer.style.cssText = "position:absolute;inset:0;z-index:2;pointer-events:none;opacity:.016;mix-blend-mode:soft-light;background-repeat:repeat;background-size:" + (128 / dpr) + "px " + (128 / dpr) + "px;background-image:url(" + tile.toDataURL() + ")";
    bg.appendChild(layer);
  }

  function sampleColor(img) {
    if (!img || !img.complete || !img.naturalWidth) return;
    var canvas = document.createElement("canvas");
    canvas.width = 8;
    canvas.height = 8;
    var ctx = canvas.getContext("2d", { willReadFrequently: true });
    try {
      ctx.drawImage(img, 0, 0, 8, 8);
      var data = ctx.getImageData(0, 0, 8, 8).data;
      var r = 0, g = 0, b = 0, n = 0;
      for (var i = 0; i < data.length; i += 4) {
        if (data[i + 3] < 16) continue;
        r += data[i];
        g += data[i + 1];
        b += data[i + 2];
        n += 1;
      }
      if (!n) return;
      var bg = document.getElementById("kabi-bg");
      var rgb = "rgb(" + (r / n | 0) + "," + (g / n | 0) + "," + (b / n | 0) + ")";
      if (bg) bg.style.background = rgb;
      // The queue row's hover mark takes this.  Apple tints the "..." toward the artwork on hover
      // rather than brightening a neutral white, and sampleColor is already the average of the
      // whole 8x8 downsample, so this is the same colour the backdrop grade is built from.
      document.documentElement.style.setProperty("--kabi-accent", rgb);
    } catch (error) {}
  }

  // ---- Backdrop: recovered MediaCoreUI pipeline -------------------------------
  // default.metallib AIR, transcribed:
  //   pinch_fragment   c = rgb/a ; c = mix(c, 1, whiteScrimAlpha) ; c = sample3D(lut, c)
  //   rotation_fragment c *= 1 - (blackScrimAlpha + .0075*instanceId)
  //                    c  = (c - .5) * (1 + .076*spectrumPower.x) + .5
  //                    c  = Y + s*(c - Y),  Y = dot(c, Rec.709), s = saturation + .166*spectrumPower.z
  // CPU side: whiteScrimAlpha .1, blackScrimAlpha .35/.5 by FLAG, (saturation, blurRadius)
  // 2.4/120 (wide). The .5 branch is the one the reference frame runs: sweeping the recovered
  // pipeline against apple-supplied.png over four backdrop bands puts luma at 58.2 against the
  // reference's 58.1, while .35 overshoots by roughly 52/255 on mean red. Both values are native
  // constants; this selects between them rather than introducing a new one.
  // Pass order (pinch grade inside, rotation grade outside) is the one that reproduces the
  // reference frame's blue-channel signature; the two orders differ measurably there.
  var BACKDROP = {
    size: 1024,
    blurPx: 64,
    whiteScrim: 0.1,
    blackScrim: 0.5,
    saturation: 2.4,
    contrast: 1,
    lutSize: 32,
    lut: null,
    lutTask: null
  };
  // BackdropLUT.png as shipped carries a macOS eXIf chunk; Chromium applies it while
  // decoding and the strip no longer reads back 1:1 through a canvas. The cube therefore
  // travels as raw RGB triples: 32 blue slices x 32 green rows x 32 red columns.
  var LUT_RAW_B64 =
    "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NRshOxwhQR0hRhwiTR4jUh4iWB4kXR4jYyAlaCAkbiAmcyAleiImgCEmhSIniyMnkCIolyQpnCQooiQqpyQpriYqsyUruSYrACAgCCAgECAgGSEhISEhJiIiLCMiMiIiOCQkPSQjQyMjSSUlTyQlVSUlWiYmYCcmZSYnaycncCgodikofCgogioqiCkqjSkpkysrmSornysrpCwsqi0ssCwsti4uuy4tACggCCggECggGSkhISkhKSkhLigiMycjOCgkPSgjQykjSSklTyolVSslWiomYCsmZSwnay0ncCwodi0ofC4ogi4qiC8qjS8pky8rmTArnzErpDAsqjEssDIstjIuuzItADAgCDAgEDAgGTEhITEhKTEhMTEhOC8iPTAjQTAjRS4jSi8kTy4lVS8lWjAmYDEmZTAnazEncDIodjMofDIogjQqiDMqjTMpkzUrmTQrnzUrpDYsqjcssDYstjguuzgtADogCDogEDogGTkhITkhKTkhMTkhOjoiQjoiRjgiSjYiTjckVDYkWDYkXDcmYTYnZTYnazcncDgodjkofDgogjoqiDkqjTkpkzsrmTornzsrpDwsqj0ssDwstj4uuz4tAEIgCEIgEEIgGUEhIUEhKUEhMUEhOkIiQkIiSkIiT0AhUz0jWT4jXT0lYT0lZj4maj4mbjwmcz0ndz0nfD4ogj4qiD8qjT8pkz8rmUArn0ErpEAsqkEssEIstkIuu0ItAEogCEogEEogGUkhIUkhKUkhMUkhOkoiQkoiSkoiUkoiWEciXkYiYkUkZkUkakUkb0Qlc0Mnd0MnfEQogUMphUMpikQqjkQqk0UrmUQrn0UrpEYsqkcssEYstkguu0gtAFIgCFIgEFIgGVEhIVEhKVEhMVEhOlIiQlIiSlIiUlIiWlIiY1IhZ08ja00jb0sjc0wleEsmfEsmgEsmhksoiksojkkok0opl0opm0sroUwrpUorqksssEwstkwuu0wtAFogCFogEFogGVkhIVkhKVkhMVkhOloiQloiSloiUloiWloiY1oha1ohcFcidFUieFQkfVMlgVMlhVEli1Enj1Enk1EnmFIonFEqoVEppVArqlEsrlEss1Itt1Itu1ItAGIgCGIgEGIgGWMhIWMhKWMhMWMhOmIiQmIiSmIiUmIiWmIiY2Iha2Ihc2IhemIifl4ig10jh1wli1ol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YwFjawFjcwFjewFjhAFiiQFhjQJfkQNdlwNbmwVbnwZZowZZqAZYrQZXsQdVtghWugpWvgpWwgtUxwxVAwhFCwtHEAxIFgtIHAtKIwxNKgpSNAlWPglcSAhgUghiWghiYwljawljcwljewljhAhkiApgjAtekApclQxbmgxang5aog1Ypw5Zqw9XsA9WsxBVuRJXvRFVwRNVxhRWAw5FCxFHExNLGRRLHhRKJBRMKxJRNBNWPhFcRxFfUhBiWhBiYxFjaxFjcxFjexFjghBihxJhixNfjxRdlBRcmBVanRVZoRdZpRZXqhdYrhlYsxlXtxlXvBtWwBtWxBtWAxVHCxdHExlLGxxNIRtNJhxOLBxQNRtVPRtZRxpdUhpiWhpiYxljaxljcxljexljgBpghRpfihxejh1ckh1clx1bmh5anyBZpCBYqCBYrSFZsSNZtSJXuyNXvyNXwyVXAxtLCx1LEx9LGyJNIyNPKCRQLiNQNiNUPSNZRiNcUSFhWiJiYyFjayFjcyFjeyFjfyJhgyNfhyRdjCRckSZblSVZmSdZnihaoyhZpyhZrClasCtatCpYuixavixawixaAiNQCiROEyZNGyZNIylPKytTMCtSNytTPSpXRitcUCpgWipiYyljayljcyljeSlhfyphgixehixeiyxdjy1blC5cmC9anTBboTBbpjBaqjJarzNbszJZuTRbvTRbwTRbAitUCixSEixSGy5RIy9PKzFTMzRVOTNVPzNXRzNbTzFfWjJiYzFjazFjczFjeDFifDJggTRfhjReiTVdjjVckzdblzdbmzdboDhcpTpbqTpbrjtcsjtcuDxcvDxcwDxcATNZCTRXETRXGzZVIzZVKzdTMzpVOztXQDtWRzxZTzpdWjpiYztjaztjcjpidzxhez1ffzxdgz5diD9ejT9dkT9dlkBemkFcn0JdpENeqENerUNdsUNduEVevURfw0VfAD1eCT1dET5bGj5aIj1YKj9YMkBWO0FXQ0RZSUNZUERcWUNhY0Nja0NjcENidkNgekVgfkRegkZeh0dfjEdekEdelUhfmUhfnkpeo0tfqUpfrktgtExguktgwE1ixU1hAEliCEliEEhgGUZfIUddKkdcMkdcO0dbQ0pZS0tbUUtdWEpgY0tja0tjb0phc0tfeUxffU5fgU5fhk9gi09fj09flFBgmVFhn1JhpVFhq1NjsVJjtlJivVRjwlNkyFRkAFFiCFFiEFFiGVJjIVJjKVFhMVBfOlBeQlBeS1JdUlJeWVJfY1NjalJiblRiclNgd1RhfFZggFZghlZii1ZhkVhjllhinFhkoVhjqFpkrVlls1pluVtlv1tnxVxnylxmAFliCFliEFliGVpjIVpjKVpjMVpjOlpiQlpiSlhiUllgWltgY1tjaFtibVthcVthd11jfV5jgl1kiF5kjl9kk15lmV9lnmBmpGFmqmBmsGJotWJnu2JpwWNpx2RpzWNpAGNiCGNiEGNiGWJjIWJjKWJjMWJjOmJiQmJiSmJiUmJiWmJiY2NjaGRkbmVkc2RlemZmf2ZlhWVli2dnkWZnl2dnnGhoomlop2hprWlpsmpquGtqvWprxGxsymtsz2trAGtiCGtiEGtiGWpjIWpjKWpjMWpjOmpiQmpiSmpiUmpiWmpiY2tja2tjcGpkdWtlempmf2plhWtli2tnkWxnl21nnGxoom1op25prW9psm5quG9qvXBrxHBsynFsz3FrAHNiCHNiEHNiGXJjIXJjKXJjMXJjOnJiQnJiSnJiUnJiWnJiY3Nja3Njc3NjeXJjf3Jlg3Jlh3BljHFmkXBnl3FnnHJoonNop3JprXNpsnRquHVqvXRrxHZsynVsz3VrAHtiCHtiEHtiGXpjIXpjKXpjMXpjOnpiQnpiSnpiUnpiWnpiY3tja3tjc3tje3tjhHpkiHhkjHhkkHdmlXhnmXhnnXhnondop3hprXlpsnhquHlqvXprxHpsyntsz3trAINiCINiEINiGYRjIYRjKYRjMYRjOoRiQoRiSoRiUoRiWoRiY4Nja4Njc4Nje4NjhIRkjIRkkYJjlX9lm4Bln39no39nqIBorH5osH5otX9puX9pvYBrxIBsyoFsz4FrAItiCItiEItiGYxjIYxjKYxjMYxjOoxiQoxiSoxiUoxiWoxiY4tja4tjc4tje4tjhIxkjIxklIxkmolkoIhkpIdmqIdmrIdmsYZntYVpuYVpvoZqwoZqx4VrzIZs0IZsAJNiCJNiEJNiGZRjIZRjKZRjMZRjOpRiQpRiSpRiUpRiWpRiY5Nja5Njc5Nje5NjhJRkjJRklJRknJRkpZRjqZFlrY9lsY1lto5muo1ovo1owo1ox4xpzI1q0Itq1YxrAJtiCJtiEJtiGZxjIZxjKZxjMZxjOpxiQpxiSpxiUpxiWpxiY5tja5tjc5tje5tjhJxkjJxklJxknJxkpZxjrZxjsplktpdkupZmv5Vnw5Vnx5NnzJRo0ZNp1ZNp2pRqAKViCKViEKViGaRjIaRjKaRjMaRjOqRiQqRiSqRiUqRiWqRiY6Vja6Vjc6Vje6VjhKRkjKRklKRknKRkpaRjraRjtaRjvKRkwKJkxZ9lyZ5nzZxn0Zxn1p1o2pto3ppqAK1iCK1iEK1iGaxjIaxjKaxjMaxjOqxiQqxiSqxiUqxiWqxiY61ja61jc61je61jhKxkjKxklKxknKxkpaxjraxjtaxjvaxjxaxjyqlkzqdk0qZm1qRm26Nn4KRo46JpALViCLViELViGbRjIbRjKbRjMbRjOrRiQrRiSrRiUrRiWrRiY7Vja7Vjc7Vje7VjhLRkjLRklLRknLRkpbRjrbRjtbRjvbRjxbRjzrVk07Nj17Bl3K9m36tn5Kxo6KpoAL1iCL1iEL1iGbxjIbxjKbxjMbxjOrxiQrxiSrxiUrxiWrxiY71ja71jc71je71jhLxkjLxklLxknLxkpbxjrbxjtbxjvbxjxbxjzrtk1r1k3bxj4bll5bdl6bRn7bRnAMViCMViEMViGcRjIcRjKcRjMcRjOsRiQsRiSsRiUsRiWsRiY8Vja8Vjc8Vje8VjhMRkjMRklMRknMRkpcRjrcRjtcRjvcRjxcRjzsVk1sNk3sVk5sVk6sFk7r5m8rxmAM1iCM1iEM1iGc5jIc5jKc5jMc5jOs5iQs5iSs5iUs5iWs5iY81ja81jc81je81jhM5kjM5klM5knM5kpc5jrc5jtc5jvM5kxc5jzs1k1s1k3s1k5s1k781j9Mpk+MhkANViCNViENViGdZjIdZjKdVhMdZjOtZiQtZiStZiUtZiWtZiY9Vja9Vjc9Vje9VjhNZkjNZklNZknNZkpdZjrdZjtdZjvdZjxNZkzdZj1tVk3tVk5tVk79Vj99Vj/dRjAN1iCN1iEN1iGd5jId5jKd5jMd5jOt5iQt5iSt5iUt5iWt5iY91ja91jc91je91jhN5kjN5klN5knN5kpd5jrd5jtd5jvd5jxd5jzt1k1d5j3t1k5t1k791j991j/91jAOViCOViEOViGeZjIeVhKeZjMeVhOuZiQuZiSuZiUuZiWuZiY+Vja+Vjc+Vje+VjhOZkjOZklOZknOZkpOZkreZjteZjveZjxeZjzeZj1uVk3eZj5eZj7+Vj9+Vj/+VjAO9iCO9iEO9iGe5jIe5jKe5jMe5jOu5iQu5iSu5iUu5iWu5iY+9ja+9jc+9je+9jhO5kjO5klO5knO5kpe5jre5jtO5kve5jxe5jzu9k1e5j3e5j5u9k7u9k9+1j/+9jAPdiCPdiEPdiGfZjIfZjKfZjMfdhOvZiQvZiSvZiUvZiWvZiY/dja/djc/dje/djhPZkjPZklPZknPZkpfZjrfZjtfZjvfZjxfZjzfZj1fZj3vdk5vdk7vdk9vdk//VjAP9iCP9iEP9iGf5jIf5jKf5jMf5jOv5iQv5iSv5iUv5iWv5iY/9ja/9jc/9je/9jhP5kjP5klP5knP5kpf5jrf5jtf5jvf5jxP5kzv9k1v9k3f5j5f5j7/9j9v9k/v9kBARMCQRLDwVLFQRLGgROIgNUKQJXMwJdPAJgRgJmUgBqWQBrYwFrawFrcwFrewFrhABsjABskgBqlwJpnANmoARkpANiqARgrQVhsQZftgZeuwhdvwhdwwpdxwlbzApcBApMCwxNEAtOFwxNHAtOIwtTKgpWMwtbPApgRglkUQlpWghqYghqawlrcwlrewlrhAhsjAlqkQlplQpnmgpmnwtjow1jpw5hqw5hsQ5ftQ5fuQ9dvhBewhFcxhJeyhNcBBBMCxBNExNPGRRPHhNQJBNSKxRVNBNaPBFeRhFkUBBoWhBqYxFraxFrcxFrexFrhBBsjBBskBJolBNmmRNlnRRjohRiphZiqhVgrhZesxdfuBdeuxhdwRldxRldyRtdBBZMCxhNExlPHBxUIRxTJx1TLR1VNBxYPBteRRpjTxlnWhpqYxlraxlrcxlrexlrhBpsihpqjxppkxtnlxxlmx1jnx5hpR9hqR9hrSBfsiFgtiFguiJevyNfxCNeyCNeAxtPCx1PEx9PHCJUIyRVKSNVLiRWNSRXPSNdRSNhTyJlWiJqYyFrayFrcyFreyFrhCJsiCJojSJnkiRmliVkmiVknyVjoiZipyhhrChgsChgtSlhuSthvitgwytfxytfAyJVCyNTEyVTHChUIypVKytXMCxYNytXPitcRSthTitkWSlpYylraylrcylreylrgylrhyppiytnjyxllCxkmS5jnS1hoS9hpjBiqzBhrzBhtDFiuDNivTNhwjRixjRiAitYCitYEixWHC1WIy5VKzFXMzNbOTRbPzNbRTJfTjNkWDJoYzFrazFrczFrezFrgTFphzJpijRmjjRmkzVjlzVjnDZkoDdipThjqjhirjhisjpitztjvDtiwTxjxTxjAjReCjNcEjVcGzRZIzZZKzdXMzlbPDxcQT1dRjxeTztjVztnYztraztrcztreztrgDtqhDtmiD1mjT1lkj9klj9km0Bln0Fjo0FjqUJjrUJjsUJjtkNku0Rlv0RlxEZkATxjCTthETxfGjxeIz5dKz5dMz9bPEJcQ0NfSENeT0RhV0JlY0Nra0Nrc0NrekJqf0Rpg0Vnh0Rli0ZlkUdllUdlmUdlnkhmoklkqElmrEtmsEtmtUtlukxmwE1mxUxnAEdmCEVmEUVlGkVkIkZiKkVgMkdgO0dfQ0lfS0xhUUthWExkY0tra0trc0treEtqfUxngk1ohkxmik5mkE9mlE9mmE9mnVBnoVBnp1Fnq1NnsVJntlNovVNpwlNoyFVqAFFqCFFqEFFqGVBnIU5nKU9lMk9kO09jQ09jS1JhU1NjWVNlYlJqa1Nrc1Nrd1JpfFRogVRnhVZniVZnj1dnk1dnl1dnnFhooVlpqFlqrVlps1truVprv1trxVxryltsAFlqCFlqEFlqGVprIVprKVprMVlpOldoQlhmSlhmU1plWlpmYVpna1trclpqdlxqe1xpf1xphF5oiF5ojl5qk15pmWBrnmBqpGBsqmFssGJstWFtu2JtwWNtx2NvzWRvAGNqCGFqEGNqGWJrIWJrKWJrMWJrOmJqQmJqSmJqUmJqWmFoY2Nna2NrcGNqdWRremZqf2VrhWZri2drkWZrl2htnGhsomhup2htrWpvsmpuuGpwvWpvxGxwymtwz2xxAGtqCGtqEGtqGWprIWprKWprMWprOmpqQmpqSmpqUmpqWmpqY2tra2trcGxsdm1sfGxsgm5uh25tjW1tk29vmW5vn29vpHBwqnFwr3BxtXFxunJywHNyxnJyzHR00nN0AHNqCHNqEHNqGXJrIXJrKXJrMXJrOnJqQnJqSnJqUnJqWnJqY3Nra3Nrc3NreHJsfXFtgnJuh3JtjXNtk3NvmXRvn3VvpHRwqnVwr3ZxtXdxunZywHdyxnhyzHh00nl0AHtqCHtqEHtqGXprIXprKXprMXprOnpqQnpqSnpqUnpqWnpqY3tra3trc3tre3trgnlsh3pti3ptj3htlHlumXhvn3lvpHpwqntwr3pxtXtxunxywH1yxnxyzH500n10AINqCINqEINqGYRrIYRrKYRrMYRrOoRqQoRqSoRqUoRqWoRqY4Nra4Nrc4Nre4NrhIRsjIRskIJslIBsmYFtnoBuooBupoFwq4Bxr4BxtYFxuoJywINyxoJyzIR00oN0AItqCItqEItqGYxrIYxrKYxrMYxrOoxqQoxqSoxqUoxqWoxqY4tra4trc4tre4trhIxsjIxslIxsmYprnodso4htp4dvq4dvsIhwtIhwuIZwvYdxwYdxxohyzIh00ol0AJNqCJNqEJNqGZRrIZRrKZRrMZRrOpRqQpRqSpRqUpRqWpRqY5Nra5Nrc5Nre5NrhJRsjJRslJRsnJRso5FrqJBsrI9usI9utI9uuY5vvY1xwY1xxo5yy41zz41z1I50AJtqCJtqEJtqGZxrIZxrKZxrMZxrOpxqQpxqSpxqUpxqWpxqY5tra5trc5tre5trhJxsjJxslJxsnJxspZxrrZxrsZlttZdtuZVtvZZvwpVwxpVwypVw0JVy1JVy2JNyAKVqCKVqEKVqGaVpIaRrKaRrMaRrOqRqQqRqSqRqUqRqWqRqY6Vra6Vrc6Vre6VrhKRsjKRslKRsnKRspaRrraRrtaRruqNsvqFsw55tyJ9uzJ1u0Jxw1Z1x2pxy3ZtxAK1qCK1qEK1qGaxrIaxrKaxrMaxrOqxqQqxqSqxqUqxqWqxqY61ra61rc61re61rhKxsjKxslKxsnKxspaxrraxrtaxrvaxrxKxsyKhszadt0aZv1aRv2qVw3qVw4qNwALVqCLVqELVqGbRrIbRrKbRrMbRrOrRqQrRqSrRqUrRqWrRqY7Vra7Vrc7Vre7VrhLRsjLRslLRsnLRspbRrrbRrtbRrvbRrxbRrzrVs0rFs1q9s2q5u3qxu46tv6KxwAL1qCL1qEL1qGbxrIbxrKbxrMbxrOrxqQrxqSrxqUrxqWrxqY71ra71rc71re71rhLxsjLxslLxsnLxspbxrrbxrtbxrvbxrxbxrzr1s1r1s27tr37ht47Zt57Nv7LRwAMVqCMVqEMVqGcRrIcRrKcRrMcRrOsRqQsRqSsRqUsRqWsRqY8Vra8Vrc8Vre8VrhMRsjMRslMRsnMRspcRrrcRrtcRrvcRrxcRrzsVs1sNs3sVs5cRr6cFt7b9t8bxvAM1qCM1qEM1qGc5rIc5rKc5rMc5rOs5qQs5qSs5qUs5qWs5qY81ra81rc81re81rhM5sjM5slM5snM5spc5rrc5rtc5rvc5rxc5rzs1s1s1s3s1s5s1s781r88pt98htANVqCNVqENVqGdZrIdZrKdZrMdZrOtZqQtZqStZqUtZqWtZqY9Vra9Vrc9Vre9VrhNZsjNZslNZsnNZspdZrrdZrtdZrvdZrxNZsztVs1tVs3tVs5tVs79Vr99Vr/NJsAN1qCN1qEN1qGd5rId5rKd5rMd1pOt5qQt5qSt5qUt5qWt5qY91ra91rc91re91rhN5sjN5slN5snN5spd5rrd5rtd5rvd5rxd5rzt1s1d5r3t1s5t1s791r991r/91rAOVqCOVqEOVqGeZrIeZrKeZrMeZrOuZqQuZqSuZqUuZqWuZqY+Vra+Vrc+Vre+VrhOZsjOZslOZsnOZspeZrreZrteZrveZrxeZrzeZr1uVs3eZr5uVs7+Vr9+Vr/+VrAO9qCO9qEO9qGe5rIe5rKe5rMe5rOu5qQu5qSu5qUu5qWu5qY+9ra+9rc+9re+9rhO5sjO5slO5snO5spe5rre5rte5rvO5sxe5rze5r1u9s3e5r5u9s7u9s9+1r/+1rAPdqCPdqEPdqGfZrIfZrKfZrMfZrOvZqQvZqSvZqUvZqWvZqY/dra/drc/dre/drhPZsjPZslPZsnPZspfZrrfZrtfZrvPZsxfZrzfZr1vds3fZr5fZr7vds9vds//VrAP9qCP9qEP9qGf5rIf5rKf5rMf5rOv5qQv5qSv5qUv5qWv5qY/9ra/9rc/9re/9rhP5sjP5slP5snP5spf5rrf5rtf5rvf5rxf5rzv9s1f5r3f5r5v9s7v9s9v9s/v9sBAVSCQVRDwRRFQVRGwVTIQRXKQNdMgNgOwJlRAFqTwFvWgByYwFzagBycwFzewFzhAFyjAFylAFynAB0oQFxpQJvqQNtrQRrsQVptgVouwVnvwZlxAdmyAhkzAhk0AliBAlSDAxUEQxTGAxUHQxTIgxWKgtcMgtgOwplRApoTgpuWghyYwlzawlzcwlzewlzhAh0jAh0lAh0mghyoApwpAtuqAxsrAtqsAxotg1ouQ5nvg5mwxBlxxBlyxJlzxFjBA9SDBJUExRVGRNVHxRVJBNWKxNbMhJeOxNjRBJoThFsWRFxYxFzahBycxFzexFzhBB0jBB0lBFymRFxnRFtohJupxNrqxVrrxZpsxVnuRZnvRZnwRdlxhhmyhlkzhpmBBVSDBhUExpVHBxYIR1ZJxxZLBxYNB1ePBtiRBtmThtsWBpwYxlzaxlzcxlzexlzhBlyjBp0lBp0mBpwnBtuoBxspB1qqh5qrR9psh9otiBmuiBmvyFnxCFmySNlzSNlBBxUDB5UEyBVHCJYJCRcKSRbLyVbNSVdPCRgRCNmTSJrVyFvYyFzayFzcyFzeyFzhCJ0jCJ0kiJylyJxmyRtnyRtoyVrpyZprSdpsSdptShnuilovilowylnxytnzCtmAyJZCyNXEyVXHChYJCpcKyxdMStdNyxdPSxfRStlTStpVyptYylzaylzcylzeylzhCp0jCp0kCpwlSpvmSttni1soi1spy1rqi5qsDBotDBouDBovTFpwjNoxjNoyzNnAypdCypdEytbHC1aJDBcKzJdMzNfOTRfPzNfRjNkTTNpVjNsYzFzazFzczFzezFzhDJ0izFzjzJxkzNvmDRsnDRsoTZrpTVpqTdprzhpszhptzhpvDlqwTtpxTtpyjxqAjJiCjNgEjNgGzVfJDdeKzhdMzlfPD1iQTxjRz1jTTxnVjtsYjpyaztzcztzeztzhDp0iTtxjTxvkjxulz5tmz1rnz9rpEBsqD9qrUBrskJqtkJqukJqwENqxENqyURrATpnCjxmEjtkGz1jIzxhKz5hMz9fPEFiRERkSUVlTkRmV0NrYUJva0Nzc0Nze0NzhEJ0iENyjENukEVulkZumkdsnkdso0htp0lrrEhssUprtUpruUprv0xtw0xtx0xtAUZrCURrEUNpGkNoIkRmK0ZlM0ZlPEhkREpkS0tnUEtmV0xpYEtua0tzc0tze0tzg0tzh0xxi01vj0xtlE1umU9tnU9toU9tplBuq1BtsFFutFNuuFNuvVNtwlRuyFVuAFBwCE9uEE1uGk9sIk1sKk5qMk1oO09nQ09nS1FnU1RpWVNpYFNua1Nzc1Nze1NzgVNxhVRvilVwjlRuk1ZtmFdunFduoFdupVhvqlhur1lvs1tvuVpvv1xxxVtxyltwAFlyCFlyEFlyGVlxIVhvKVZvMVdtO1ZtQ1drS1drU1ppW1trYVttalpyc1tze1tzgFtyhFxwiVxvjV5vkl1wl19vm19vn19vpGBwqmFwsGFytWFxu2NzwWJzx2NzzWRzAGNyCGNyEGNyGWJzIWJzKWJzMWJzOmJyQmFwSmBuUmBuWmFsY2RtaWRvc2NzemRyf2Rxg2Rxh2ZxjGdykWdxl2hxnGdyomhyp2lzrWpzsml0uGp0vWt1xGt2ymx2z2x1AGlyCGtyEGlyGWpzIWpzKWpzMWpzOmpyQmpySmpyUmpyWmpyY2lva2tvc2tzeGtyfW1xgm5yh21zjW5zk29zmW5zn3B1pHB0qnB2r3B1tXJ3unJ2wHJ4xnN4zHR40nN4AHNyCHNyEHNyGXJzIXJzKXJzMXJzOnJyQnJySnJyUnJyWnJyY3Nza3Nzc3NzeHR0f3R1hHR0inZ2j3Z1lnZ2m3d3oXZ3p3d3rHh4snl4t3h5vXl5wnp6yXp7znp61Hx8AHtyCHtyEHtyGXpzIXpzKXpzMXpzOnpyQnpySnpyUnpyWnpyY3tza3tzc3tze3tzgXpzhXl1inp2j3p1lnx2m3t3oXx3p313rHx4sn14t355vX95wn56yYB7zoB61IB8AINyCINyEINyGYNxIYRzKYRzMYRzOoRyQoRySoRyUoRyWoRyY4Nza4Nzc4Nze4NzhIR0ioN0j4J1k4J1mIF2nYJ3oYJ3p4N3rIJ4soN4t4R5vYV5woR6yYZ7zoZ61IZ8AItyCItyEItyGYxzIYxzKYxzMYxzOoxyQoxySoxyUoxyWoxyY4tza4tzc4tze4tzhIx0jIx0lIx0mIp0nYl1oYl1poh2qoh2rol4s4h5t4h5vYl5wop6yYp7zop61Ix8AJNyCJNyEJNyGZRzIZRzKZRzMZRzOpRyQpRySpRyUpRyWpRyY5Nza5Nzc5Nze5NzhJR0jJR0lJR0nJR0opF0po90q5B1r493s493t493vJB4wI54xY95ypB6zpB61JB8AJtyCJtyEJtyGZxzIZxzKZxzMZxzOpxyQpxySpxyUpxyWpxyY5tza5tzc5tze5tzhJx0jJx0lJx0nJx0pZxzq5lzsJh0tJd2uJd2vJV2wZZ3xZV5yZV5z5Z505V715V7AKVyCKVyEKVyGaRzIaVxKaRzMaRzOqRyQqRySqRyUqRyWqRyY6Vza6Vzc6Vze6VzhKR0jKR0lKR0nKR0paRzraRztaRzuaF1vZ91wp52x593y593z5131J542Z153J16AK1yCK1yEK1yGaxzIa1xKaxzMaxzOqxyQqxySqxyUqxyWqxyY61za61zc61ze61zhKx0jKx0lKx0nKx0paxzraxztaxzvaxzwqt0x6h1y6Z10Kd21KV22KR43aV54qR6ALVyCLVyELVyGbRzIbRzKbRzMbRzOrRyQrRySrRyUrRyWrRyY7Vza7Vzc7Vze7VzhLR0jLR0lLR0nLR0pbRzrbRztbRzvbRzxbRzzLJ00LB01a912a533ax34q145q14AL1yCL1yEL1yGbxzIbxzKbxzMbxzOrxyQrxySrxyUrxyWrxyY71za71zc71ze71zhLx0jLx0lLx0nLx0pbxzrbxztbxzvbxzxbxzzr101r102rl03rd04rZ25rR267N3AMVyCMVyEMVyGcVxIcRzKcRzMcRzOsRyQsRySsRyUsRyWsRyY8Vza8Vzc8Vze8VzhMR0jMR0lMR0nMR0pcRzrcRztcRzvcRzxcRzzsV01sV03sV048Nz58B1675177t3AM1yCM1yEM1yGc5zIc5zKc1xMc5zOs5yQs5ySs5yUs5yWs5yY81za81zc81ze81zhM50jM50lM50nM50pc5zrc5ztc5zvc5zxc5zzs101s103s105s107s108cl19sh2ANVyCNVyENVyGdVxIdZzKdZzMdZzOtZyQtZyStZyUtZyWtZyY9Vza9Vzc9Vze9VzhNZ0jNZ0lNZ0nNZ0pdZzrdZztdZzvdZzxdZzzdZz1tV03tV05tV079Vz99Vz+9J1AN1yCN1yEN1yGd1xId5zKd5zMd5zOt5yQt5ySt5yUt5yWt5yY91za91zc91ze91zhN50jN50lN50nN50pd5zrd5ztd5zvd5zxd5zzt101t103t105t10791z991z/91zAOVyCOVyEOVyGeZzIeZzKeZzMeZzOuZyQuZySuZyUuZyWuZyY+Vza+Vzc+Vze+VzhOZ0jOZ0lOZ0nOZ0peZzreZzteZzveZzxeZzzuV01uV03eZz5uV07+Vz9+Vz/+VzAO9yCO9yEO9yGe9xIe5zKe9xMe5zOu5yQu5ySu5yUu5yWu5yY+9za+9zc+9ze+9zhO50jO50lO50nO50pe5zre5zte5zve5zxe5zzu901u903u905e5z7+9z9+9z/+9zAPdyCPdyEPdyGfdxIfZzKfZzMfZzOvZyQvZySvZyUvZyWvZyY/dza/dzc/dze/dzhPZ0jPZ0lPZ0nPZ0pfZzrfZztfZzvfZzxPZ0zvd01fZz3vd05fZz7/dz9vd0//VzAP9yCP9yEP9yGf5zIf5zKf5zMf5zOv5yQv5ySv5yUv5yWv5yY/9za/9zc/9ze/9zhP50jP50lP50nP50pf5zrf5ztf5zvf5zxP50zv901f5z3v905f5z7/9z9v90/v90BAVWCgRWDwVXFQRXGgVYIgVcKARgMQNlOgJqQwNvTQJzWAB4YgB6awF7cgB6ewF7hAB8jAF6lAB8nAF6pQB7qgF4rgJ2sgN0tgRyuwRxwARwwwVvxwZtzQdt0Qhr1glsBAtWDA1aEQ1ZGA1aHQ1ZIw1bKQxfMgtkOgtoQwptTAlyVwl3Ywl7awl7cgh6ewl7hAl6jAl6lAl6nAl6pQh7qQl5rQp3sQt1tQxzuQ1xvg1www1vxw5tzA9u0BBs1BBsBA9WDBFaFBRcGhVcIBRcJRRbKhReMxNjOhNoQxJtTBJwVhJ2YxF7axF7cxF7exF7hBF6jBB8lBB8nBB8oxB5qBJ4rBN2sBR0tBNyuRVxvhVwwRZvxhZuyhdszxht0xptBBVWDBlaFBpcHB1eIRxfJx1fLB1eNB1iOxtnQxtrTBpwVht0Yxl7axl7cxl7exl7hBp8jBl6lBp8nBp8ohp6pRp3qRt1rRxzsh5ytx5xux9vwCBwxCFuySFtziJu0iJuBBxYDB1aFCBcHCFeJCRgKSVhLyRhNSVhPCVmRCNqTCNuViN0YiJ6ayF7cyF7eyF7hCJ8jCF6lCJ8nCJ8oCJ4pCN2qCR0rCVysiZytiZyuidwvihuwihuyCluzClu0SttBCNeDCRcFCZcHCdeJCpgLCxkMSxjOCxkPS1lRCxoTCtuVSpzYSp3ayl7cyl7eyl7hCp8jCp8lCp8mip6nit4oyx1pyx1qy1zry5xtS9xuS9xvTBvwjFwxzFvyzFvzzNvAyphCyphEytfHC1eJDBgLDJkMzRlOTNlPzRlRTRnTTNtVTNxYDF2azF7czF7ezF7hDJ8jDJ8lDJ8mDJ4nTJ3oTN1pjV0qjV0rzVzszZxuDhwvDhwwDhwxTpvyjtwzjtwAzNnCzJlEzRlHDRkJDViLDhkMzplPDxoQTxnRz1nTj1sVTxvYDt2azt7czt7ezt7hDp8jDp8kzt7lzx5nD12oDx0pD50qT5zrUBzskBytkByu0Jxv0JxxENyyUNxzUNxAjtsCjpqEjtoGztnIz1nLD9mM0BlPEJoREVqSURrT0VrVURvYER0akJ6c0N7e0N7hEJ8jEJ8kUN5lUR3m0V3n0Z1o0Vzp0dzrEh0sUhztUhzukpyvkpyw0tzyEtyzEtyAUJvCUJvEkRuG0RtI0VrK0RpM0ZpPEhoRElqTExsUU1tVkxuYEx0aUp3c0t7e0t7hEp8jEp8kEt6lEt2mU11nk52ok90pk90q1B1sFB0tFB0uVJzvVJzwlN0x1R1y1R1AU11CU5zEUxzGktwIktwKkxuM05tPE5sRFBsTFJsU1NvWFNuYFNyaFN2c1N7e1N7hFJ8i1N7j1R5k1V3mFV2nFV2oVd1pVd1qVd1r1h1s1h1uFl2vFt2wVt1xVt1ylx2AFl6CFh4EFd2GVV1Ild0KlV0MlZyO1ZxQ1dvS1dvU1lvW1xxYVtxaFt2c1t7e1t7hFp8iVt5jVx3kl14l113m151oF92pF92qF92rmB2smB2t2F3u2N3wWJ3x2R5zWN5AGF6CGN6EGN6GWJ7IWJ7KWF5MWB3OmB2Q2B1S19zU2FzW2JxZGR0amV0cmR6e2N7hGR8iGV6jGR4kGZ4lmd4mmd4nmd4o2h5p2l3rWl5sml4uGt6vWt5xGt6ymx6z2t7AGt6CGt6EGt6GWp7IWp7KWp7MWp7Omp6Qmp6Sml4Umh2Wmh2Y2p1a2x1cWx3e2t7gmx6h2x5i2x5j255lW95mW95n3B5pG96qnB6r3F7tXJ7unF8wHJ8xnN8zHN+0nR+AHF6CHF6EHN6GXJ7IXJ7KXJ7MXJ7OnJ6QnJ6SnJ6UnJ6WnJ6Y3J5a3F3c3N3e3N7gXR7hXV5inZ6j3V7lnd8m3d7oXZ7p3h9rHh8snh+t3h9vXp/wnp+yXp/znuA1HyAAHt6CHt6EHt6GXp7IXp7KXp7MXp7Onp6Qnp6Snp6Unp6Wnp6Y3t7a3t7c3t7e3t7gXx7h3x9jHx8kn5+mH1+nn5+o39/qX5/r39/tICAuoGAv4CBxYGBy4KB0YKD1oKCAIN6CIN6EIN6GYR7IYR7KYR7MYR7OoR6QoR6SoR6UoR6WoR6Y4N7a4N7c4N7e4N7hIR8iYJ7joN8koR+mIN+noR+o4V/qYR/r4V/tIaAuoeAv4aBxYeBy4iB0YiD1oiCAIt6CIt6EIt6GYt5IYt5KYx7MYx7Oox6Qox6Sox6Uox6Wox6Y4t7a4t7c4t7e4t7hIx8jIx8kot8l4p9nIl+oIl+pYp/qYp/r4t/tIqAuouAv4yBxY2By4yB0Y6D1o6CAJN6CJN6EJN6GZR7IZR7KZR7MZR7OpR6QpR6SpR6UpR6WpR6Y5N7a5N7c5N7e5N7hJR8jJR8lJR8nJR8oZF9pZF9qZF9rpB+spB+tpGAu5CBv5CBxZGBy5KB0ZKD1pKCAJt6CJt6EJt6GZx7IZx7KZx7MZx7Opx6Qpx6Spx6Upx6Wpx6Y5t7a5t7c5t7e5t7hJx8jJx8lJx8nJx8pZx7qpl8rpd8s5h9t5d/u5d/v5d/xJiAyJaAzpiC0piC1piCAKV6CKV6EKV6GaR7IaR7KaR7MaR7OqR6QqR6SqR6UqR6WqR6Y6V7a6V7c6V7e6V7hKR8jKR8lKR8nKR8paR7raR7tKR8uKJ8vKF+wZ99xaB/yp+Azp+A0p2A156B256BAK16CK16EK16Gax7Iax7Ka15Max7Oqx6Qqx6Sqx6Uqx6Wqx6Y617a617c617e617hKx8jKx8lKx8nKx8pax7rax7tax7vax7wal9xql8yqZ+z6d/06d/16V/3KaA4aWBALV6CLV6ELV6GbV5IbR7KbV5MbR7OrR6QrR6SrR6UrR6WrR6Y7V7a7V7c7V7e7V7hLR8jLR8lLR8nLR8pbR7rbR7tbR7vbR7xbR7y7N7z7B906592K9+3a5/4KyA5a2BAL16CL16EL16Gb15Ibx7Kbx7Mbx7Orx6Qrx6Srx6Urx6Wrx6Y717a717c717e717hLx8jLx8lLx8nLx8pbx7rbx7tbx7vbx7xbx7zr181Lp82Lh83bd94bZ/5bR/6rWAAMV6CMV6EMV6GcV5IcR7KcR7McR7OsR6QsR6SsR6UsR6WsR6Y8V7a8V7c8V7e8V7hMR8jMR8lMR8nMR8pcR7rcR7tcR7vcR7xcR7zsV81sV83sV84sF85sB+6r5+7rx+AM16CM16EM16Gc57Ic57Kc57Mc57Os56Qs56Ss56Us56Ws56Y817a817c817e817hM58jM58lM58nM58pc57rc57tc57vc57xc57zs181s183s185s187Mp88Mh89cd9ANV6CNV6ENV6GdV5IdZ7KdZ7MdV5OtZ6QtZ6StZ6UtZ6WtZ6Y9V7a9V7c9V7e9V7hNZ8jNZ8lNZ8nNZ8pdZ7rdZ7tdZ7vdZ7xdZ7ztV81tV83tV85tV879V79tV8+dF9AN16CN16EN16Gd57Id15Kd57Md57Ot56Qt56St56Ut56Wt56Y917a917c917e917hN58jN58lN58nN58pd57rd57td57vd57xd57zt181d573t185t1879179917/917AOV6COV6EOV6GeZ7IeV5KeZ7MeZ7OuZ6QuZ6SuZ6UuZ6WuZ6Y+V7a+V7c+V7e+V7hOZ8jOZ8lOZ8nOZ8peZ7reZ7teZ7veZ7xeZ7zuV81uV83uV85uV87+V79+V7/+V7AO96CO96EO96Ge57Ie95Ke57Me95Ou56Qu56Su56Uu56Wu56Y+97a+97c+97e+97hO58jO58lO58nO58pe57re57te57ve57xe57ze571u983u985e577+979+97/+17APd6CPd6EPd6GfZ7Ifd5KfZ7Mfd5OvZ6QvZ6SvZ6UvZ6WvZ6Y/d7a/d7c/d7e/d7hPZ8jPZ8lPZ8nPZ8pfZ7rfZ7tfZ7vfZ7xfZ7zvd81vd83vd85vd87/d79/d7//d7AP96CP96EP96Gf57If95Kf57Mf57Ov56Qv56Sv56Uv56Wv56Y/97a/97c/97e/97hP58jP58lP58nP58pf57rf57tf57vf57xf57zf571v983f575v987v989/97/v98BQVdCgZeEAVeFgZeGwZdIQVhKAVmMANqOQRvQgN0SwJ5VgJ+YQGBawGDcgGEewGDhACEjACElACEnACEpQCDrQGFswGDuAKAvAN+wQN9xQR7yQV5zQZ30wd31wh12wh1BQtdDAxgEQxfFw1fHQxfIg1gKQ1lMQtpOQxvQgpySwt3Vgl8YQmBawmDcwmDegmEhAiEjAiElAiEnAiEpQiDrQmFsgiCtgmAuwp9wAx8xA16yA16zA540g941hB22g90BRFdDBJgFBViGhRiHxVjJRRjKxRlMhNoOhRuQhJySxN3VBF6YBCAaxGDcxGDehGEhBCEjBCElBCEnBCEpRGFrRCDsRGBtRJ/uRN9vhN8whR6xxZ5yxV30RZ31Rh32Rl1BRddDBhgFBtiHR1lIh1kKB5kLR1lMx1nOxxtQhtwSxx1VBt6Xxt/axmDchmEexmDhBqEjBqElBqEnBqEpRmFqxmDsBuCtBt+uB1+vRx7wR15xh56yh94zx931CF22CF2BRxfDB5gFB9iHSNlJCVmKSRnLyVnNSRnPCRsQyNvSyR1VCJ4XyJ9aiKCcyGDeyGDhCKEjCKElCKEnCKEpSKDqiKCriOAsiR+tyR9vCZ8wCd6xCd6ySd5zid40ih21yl3BCFiDCRgFCViHSllJClmLCxoMS1pNyxpPSxrRC1uSytzVCp4Xyp9aSmBcymDeymDhCqEjCqElCqEnCqEpSmFqSuBrSx/sSt9tS19uy17vy97wy55yC96zDB40TB31DF2BCpoDCtmFCtmHS1lJC9mLDJoNDRsOjVsPzVrRTVtTDNyVDN2XzJ9aDKAczGDezGDhDKEjDKElDKEnDKEozGDqDOCrDSAsDV+tDR8uTZ7vjZ6wjh6xjd4yzh5zzp51Dp4AzFrCzNrEzJpHDRoJDZoLDhoNDpsPD1uQjxuRz1vTT1xVT11Xjx6aDt+czuDezuDhDqEjDqElDqEnDqEoTuBpjuAqz1/rz59sz59uD58uz97wEF6xUF5yUF5zkJ60kR6AjlwCztvEztvHDtuJDxsLD5sNEBsPENuRERwSUVxT0RxVkV0XkR6Z0R9ckKCe0ODhEKEjEKElEKEnEKEoEOCpESAqEV+rUV9skd8tkZ6ukh6v0l7xEl6yEl6zUp70Ux7AkJ2CkN0EkJyG0RxI0RxK0VvNEduPEduREpwTEx0UUxzV01zXkt4Z0x9cUuBe0uDhEqEjEqElEqEmkqCoEuCo01/p01/rE1+sU99tU99uVB7vlF8wlF8x1F7y1N70FR8AUt5CUt5Ekt4G0t3I0x1K01zM01zPE9yRFBwTFJ0VFV2WVV1YFR4aFR8cFKAe1ODhFKEjFKElFKEmVKDnVOBolWAp1V/qlZ+r1Z9tFh8uFh8vFh8wVl9xlt8ylt8z1x9AVZ/CVV9EVV9GlR6IlR6KlN4MlV4PFV2RFd2TFh0VFl2W1t3YVx3aFx8cVp/e1uDhFqEjFqElFqEmFuCnFyAoF1+pV5/qV5/rV99smB+t2B9u2B9wGF+xWJ/yWN9zmR+AGKECGKEEGGCGWB/IV5/Kl5+Ml98O197Q155S2B5U2F3W2F3ZGV6amR6cWV9emSChGSEjGSEkWSDl2SBm2aBn2V/o2d/qGiArGd+sWh/tmmAummAv2t/xGyAymuAz2yBAGqECGqEEGqEGWqDIWqDKWqDMWmBOmeAQmh+S2h9U2h9W2l7ZGt6bGx8cmx+eWuBhGyEjGyEkGuClGyAmm2Anm+Aom+Ap3CBq3CBsHCAtXGBunKCwHOCxnKCzHSE0nOEAHKECHKEEHKEGXKDIXKDKXKDMXKDOnOEQnOESnKCUnGAWnGAY3F/bHN+c3N/enOAhHSEi3ODj3WDk3SBmHWCnXeBoXeBp3eDrHeCsnmEt3mDvXmFwnmEyXuFznqG1HuGAHqECHqEEHqEGXqDIXqDKXqDMXqDOnuEQnuESnuEUnuEWnuEY3uDa3mDc3qBe3yBhHyEiXyDjnyCknyCmH6Enn+Eo36FqX+Fr4CFtH+GuoCGv4GHxYKHy4GH0YOJ1oOIAIKECISEEISEGYSDIYSDKYSDMYSDOoOEQoOESoOEUoOEWoOEY4ODa4ODc4ODe4ODhISEiYWFj4aFlIWGm4eHoIeGpoaGrIiIsYiHuIiIvYmJw4qJyImKzoqK04uL2YyLAIuCCIyEEIyEGYyDIYyDKYyDMYyDOouEQouESouEUouEWouEY4uDa4uDc4uDe4uDhIyEjIyEkYuFloyGm4uHoIuGpoyGrIyIsYyHuI6IvY2Jw46JyI+KzpCK04+L2ZCLAJOCCJSEEJOCGZSDIZSDKZSDMZSDOpOEQpOESpOEUpOEWpOEY5ODa5ODc5ODe5ODhJSEjJSElJSEmpOEoJOGpJOGqJGGrZKHsZKHuJKIvZOJw5SJyJOKzpSK05WL2ZaLAJyECJyEEJuCGZyDIZyDKZyDMZyDOpuEQpuESpuEUpuEWpuEY5uDa5uDc5uDe5uDhJyEjJyElJyEnJyEpZuFqZmFrZmFsZiHtpmIupmIvpmIw5iJyJmKzpqK05mL2ZqLAKWCCKWCEKSEGaSDIaSDKaSDMaSDOqWEQqWESqWEUqWEWqWEY6WDa6WDc6WDe6WDhKSEjKSElKSEnKSEpaWFraWFsqOEtqCGu6GHwKCIxKCIyaGJzZ+J0Z+J1qCK2qCKAKyECKyEEK2CGayDIayDKayDMayDOq2EQq2ESq2EUq2EWq2EY62Da62Dc62De62DhKyEjKyElKyEnKyEpa2Fra2Fta2Fu6qFwKmGxaiHyaiHzaiH0qeI1qaK2qaK36eLALSECLSEELWCGbSDIbSDKbSDMbSDOrWEQrWESrWEUrWEWrWEY7WDa7WDc7WDe7WDhLSEjLSElLSEnLSEpbWFrbWFtbWFvbWFxbWFyrKGzrCG0q6G16+H266J366J466JAL2CCLyEELyEGbyDIbyDKbyDMbyDOr2EQr2ESr2EUr2EWr2EY72Da72Dc72De72DhLyEjLyElLyEnLyEpb2Frb2Ftb2Fvb2Fxb2Fzr2E07qF17iF27eH4LaI5LaI6LSIAMSECMWCEMWCGcSDIcSDKcSDMcSDOsWEQsSCSsWEUsWEWsWEY8WDa8WDc8WDe8WDhMSEjMSElMSEnMSEpcWFrcWFtcWFvcWFxcWFzsWE1sWE3MKE4MGG5cCH6b6H7byHAM2CCM6EEM6EGc6DIc6DKc6DMc6DOs2EQs2ESs2EUs2EWs2EY82Da82Dc82De82DhM6EjM6ElM6EnM6Epc2Frc2Ftc2Fvc2Fxc2Fzs2E1s2E3s2E5s2E68qF78iF88eHANWCCNWCENWCGdaDIdaDKdaDMdaDOtWEQtWEStWEUtWEWtWEY9WDa9WDc9WDe9WDhNaEjNaElNaEnNaEpdWFrdWFtdWFvdWFxdWFztWE1tWE3tWE5tWE79aF9NSE+NGGAN6ECN6EEN6EGd6DId6DKd6DMd6DOt2EQt2ESt2EUt2EWt2EY92Da92Dc92De92DhN6EjN6ElN6EnN6Epd2Frd2Ftd2Fvd2Fxd2Fzt2E1t2E3t2E5t2E79yF996F/t2EAOWCCOWCEOWCGeaDIeaDKeaDMeaDOuWEQuWESuWEUuWEWuWEY+WDa+WDc+WDe+WDhOaEjOaElOaEnOaEpeWFreWFteWFveWFxeWFzuWE1uWE3uWE5uWE7+aF9+SF/+aFAO6ECO6EEO6EGe6DIe6DKe6DMe6DOu+EQu+ESu+EUu+EWu+EY++Da++Dc++De++DhO6EjO6ElO6EnO6Epe+Fre+Fte+Fve+Fxe+Fzu+E1u+E3e+F5u+E7+6F9+6F/+6FAPeCCPeCEPeCGfaDIfaDKfaDMfaDOveEQveESvaCUveEWveEY/eDa/eDc/eDe/eDhPaEjPaElPaEnPaEpfeFrfeFtfeFvfeFxfeFzveE1veE3veE5feF7veE9/aF//aFAP+CCP+CEP6EGf6DIf6DKf6DMf6DOv+EQv+ESv+EUv+EWv+EY/+Da/+Dc/+De/+DhP6EjP6ElP6EnP6Epf+Frf+Ftf+Fvf+Fxf+Fzv+E1v+E3v+E5v+E7/6F9v+E//6FBQZjCwVjEAZkFgVkGwVjIQVlJwRpMQRvOAR0QQN5SgN8VAGCXwGHawGLcgGMegGMgwGLjACMlACMnACMpQCLrQCLtQCLvQGNwQGJxgKGygOEzgOE0wSB2AaA3AaA4Ad+BQxjDQ1lEg5mGA1mHg5mIw5lKQ1pMgxuOAtyQQx3Sgt8UwqBXwqFaQmJcwmLegmMhAiMjAiMlAiMnAiMpQiLrQiLtQmNuwmLwAqIxQqHyQuFzQyD0Q2B1g2A2w9/3xB9BRBjDRNlFBRoGhVoHxVnJRRnKhVoMhRuORNxQRR3ShJ6UxN/XhGEaRGJcxGLexGLhBCMjBCMlBCMnBCMpRCLrRCLtRGNuhCKvhGIwxKFyBSEzBWC0BWC1RZ/2heA3hh+BRZjDRllFBpoHR5rIh5qKB1qLR5rNB5sOh1wQhx2Shx6Uxt/XRqDaBqIcxmLehmMgxmLjBqMlBqMnBqMpRqLrRqLtRmNuRuJvRqHwhyGxh2Eyh6Czx6B1B6A2B9+3SB/BRxjDR9lFCBoHSJrJSVtKiVsMCZsNiVsOyVvQyR1SiN4UyR9XSOBZyOHcyGLeiGMhCKMjCKMlCKMnCKMpSGNrSGNsyGLuCOKvCOGwSWFxSSDySWBziaC0ieA1yd/3Cl+BCJoDSRnFCZoHShrJSttLC1uMSxvOC1uPSxvRCx0Syt3Uyx9XSuBZyqFciqKeymLgymLjCqMlCqMnCqMpSmNrSqLsiqKtiuIuiyGwCyExC6EyC+CzC+C0i+A1i+A2jB+BClqDClqFCxoHS5rJTFtLDFuNDRwOjVwPzRxRTRzTDV2UzN7XTJ/ZzKFcTGJezGLhDKMjDKMlDKMnDKMpTGNrTGNsTOJtTSHuTOFvjWEwzWDxzeDyzaBzzd/1DiA2Th/AzJxDDJwFDNuHTVtJTdtLDluNDpwPT11Qj10SD50Tj52VD16XTx/ZjuEcDqIezuLhDqMjDqMlDqMnDqMpTuNqzuLsDuKtDyIuD2GvD6EwD+CxkCCykCCzkGA00KB10KBAzh1CzlzEztzHDtyJDxwLD5wNEBwPUN1REV2SkR2T0V3VUV5XkR+ZkSCcEOGe0OLhEKMjEKMlEKMnEKMpUONqUOJrkOIs0WHt0aFu0aFwEaEw0eDyEmCzUmB0UmB1kqCAkB6CkF4E0N3HEN2JEN2LER0NEZ0PUl1REt2TEx4UU15V0x5X0x9ZkyCb0yFekqKhEqMjEqMlEqMnEqMpEqMqEuKrEyIsE2GtU2Fuk+Evk6CwlCCx1GDzFGC0FGC1VKDAkp+Ckp+Ekt8G0t7I0x5K0x5M013PU53RE92TFJ4VFR8WVR7YFR8ZlOAb1SFeVOJhFKMjFKMlFKMnFKMolKKqFOKq1WHr1WHtFWGuFaEvVeFwViDxlmEy1mDz1mD01uDAVSDCVOBEVOBG1N/I1N/K1R9M1V7PFV6RFd6TFh4VFp8XF1+Ylx+aFyAcFyEeFqIhFqMjFqMlFqMnFqMoVuJpVuJql2Ir12Hsl6Gt16FvGCEwGCExGCEymGEzmOE0mOEAGCICWCHEWCHGl+EIl2EKlyCMl2AO11/RF9+TF9+VGB8XGN+ZGSAaWR/cGWCeGOGhGSMjGSMlGSMm2OLoGWKpGaIqGWGrGeGsWiHtmiGumiGv2mHw2qFyWqHzWyH0WyHAGqMCGqMEGqMGWmJIWiHKWaHMmaGO2aFQ2eDS2aBU2iBW2l/ZGqAbG2CcmyCeW2FhGyMjGyMlGyMmWyLnm2Io26Jp22Hq2+HsHCItXCHuXCHvnGIwnGIyHKIzHSI0nOIAHKMCHKMEHKMGXKLIXKLKXKLMXKLOnGIQm+ISnCGU3CFW3CFZHCEbHOCdHSEenSGg3OLjHSMlHSMmHOKnXWJonWIpneIqneIr3iJtHiIuHiIvXmJwnqKyXqLznqK1HyMAHqMCHqMEHqMGXqLIXqLKXqLMXqLOnuMQnuMSnuMUnqKWnmIY3mHa3mHdHuGe3uHgnuIjHyMk3uLl32LnH2KoH2KpX+JqX+Jr3+LtH+KuoGMv4GLxYGNy4KN0YON1oKOAIKMCISMEISMGYKLIYSLKYKLMYSLOoOMQoOMSoOMUoOMWoOMY4OLa4OLc4OLe4KJhISIjISMkYSLloWMm4eLoIaMpoeMrIiMsYeNuImOvYmNw4mPyImOzouQ04uP2YuRAIqMCIqMEIyMGYyLIYyLKYyLMYyLOouMQouMSouMUouMWouMY4uLa4uLc4uLe4uLhIyMjIyMkY2Nl46NnY2No4+PqI+Oro6OtJCQuo+QwJCQxZGRy5KR0JGS1pKS25OTAJOKCJOKEJSMGZSLIZSLKZSLMZSLOpOMQpOMSpOMUpOMWpOMY5OLa5OLc5OLe5OLhJSMjJSMlJSMmZONnpKOo5OPqJOOrpSOtJSQupWQwJaQxZWRy5aR0JeS1piS25eTAJyMCJuKEJyMGZyLIZyLKZyLMZyLOpuMQpuMSpuMUpuMWpuMY5uLa5uLc5uLe5uLhJyMjJyMlJyMnJyMo5qNqJuOrJuOsJmOtZqPupmQwJqQxZuRy5yR0JuS1pyS252TAKWKCKWKEKWKGaSLIaSLKaSLMaSLOqWMQqWMSqWMUqWMWqWMY6WLa6WLc6WLe6WLhKSMjKSMlKSMnKSMpaWNraWNsaONtaGNuaKPv6GPw6GPx6KRzKGS0KGS1qKS26OTAK2KCK2KEK2KGayLIayLKayLMayLOq2MQq2MSq2MUq2MWq2MY62La62Lc62Le62LhKyMjKyMlKyMnKyMpa2Nra2Nta2NuquMvqiOxKmOyKiQzKiQ0amR1amR2aeR3qiSALWKCLSMELSMGbSLIbSLKbSLMbSLOrWMQrWMSrWMUrWMWrWMY7WLa7WLc7WLe7WLhLSMjLSMlLSMnLSMpbWNrbWNtbWNvbWNw7KNybGNzbCP0bCP1bCP2q+Q3q6S4q6SALyMCLyMELyMGbyLIbyLKbyLMbyLOr2MQr2MSr2MUr2MWr2MY72La72Lc72Le72LhLyMjLyMlLyMnLyMpb2Nrb2Ntb2Nvb2Nxb2Nzr2M0rqO1riO2raO3reQ47aR57aRAMWKCMWKEMSMGcSLIcSLKcSLMcSLOsSKQsWMSsWMUsWMWsWMY8WLa8WLc8WLe8WLhMSMjMSMlMSMnMSMpcWNrcWNtcWNvcWNxcWNzsWM1sWM28KN38CN47+P6L6Q7L6QAM2KCM2KEM2KGc6LIc6LKc6LMc6LOs2MQs2MSs2MUs2MWs2MY82La82Lc82Le82LhM6MjM6MlM6MnM6Mpc2Nrc2Ntc2Nvc2Nxc2Nzs2M1s2M3s2M5c2N6cmN7siO8seQANaMCNWKENaMGdaLIdaLKdaLMdaLOtWMQtWMStWMUtWMWtWMY9WLa9WLc9WLe9WLhNaMjNaMlNaMnNaMpdWNrdWNtdWNvdWNxdWNztWM1tWM3tWM5tWM79aN89KN99CNAN6MCN2KEN2KGd6LId6LKd6LMd6LOt2MQt2MSt2MUt2MWt2MY92La92Lc92Le92LhN6MjN6MlN6MnN6Mpd2Nrd2Ntd2Nvd2Nxd2Nzt2M1t2M3t2M5t2M796N996N/NyMAOWKCOaMEOaMGeaLIeaLKeaLMeaLOuWMQuWMSuWMUuWMWuWMY+WLa+WLc+WLe+WLhOaMjOaMlOaMnOaMpeWNreWNteWNveWNxeWNzuWM1uWM3uWM5uWM7+aN9+SN/+aNAO+KCO6MEO6MGe6LIe6LKe6LMe6LOu+MQu+MSu+MUu+MWu+MY++La++Lc++Le++LhO6MjO6MlO6MnO6Mpe+Nre+Nte+Nve+Nxe+Nzu+M1u+M3u+M5u+M7+6N9+6N/+6NAPaMCPaMEPaMGfaLIfaLKfaLMfaLOveMQveMSveMUveMWveMY/eLa/eLc/eLe/eLhPaMjPaMlPaMnPaMpfeNrfeNtfeNvfeNxfeNzveM1veM3veM5feN7/aN9/aN//aNAP+KCP+KEP+KGf6LIf6LKf6LMf6LOv+MQv+MSv+MUv6KWv+MY/+La/+Lc/+Le/+LhP6MjP6MlP6MnP6Mpf+Nrf+Ntf+Nvf+Nxf+Nzv+M1v+M3v+M5v+M7/6N9v+M//6NBQVpCgVoEAZoFgVoGwZpIQVpKAVuMAR0OAR4QAR8SAOCUwOHXgGMZwGPcgGUewGTgwGTiwGTlACUnACUpQGVrQCTtQGVvQGVxQGVywCRzwGP1AOO2ASM3QSL4QWJ5QaHBQtpDQ5rEw1rGQ5rHg1sIw1rKQ1tMQxzOQx3QAx8SQuBUguEXQmJZwmPcwmTegmUhAiUiwmTlAiUnAiUpQiTrQiTtQiTvQiTxQmVygqSzgqO0guM1guM3A2K4A6I5A6IBRFpDRRrFRVtGxZtIBVuJhZuKxZtMhRyOhR2QBN6SRR/UhOEXBKIZxKNcRGRexGTgxGTjBCUlBCUnBCUpRGVrRCTtRCTvRGVwxGTyRGRzRKP0RON1RSL2hSK3hWI4xeHBRdpDRprFRttHR5vIx1vKB5wLR5vMx5xOx51QR15Shx+UhyCXByIZhuMcRmRexmThBqUixmTlBqUnBqUpRqTrRmVtRqTvRqTwhqSxxuPyxyNzx2L1B2K2R2J3B6I4B+GBRtpDR5rFSFtHSRvJSZzKiZyMCVyNiZyPCZ0QiV4SiR+UiSCXCOGZSKLcCKQeyGThCKUiyGTlCKUnCKUpSKTrSKTtSKTvSGVwSORxiOQyiSOziWM0iaK1yaJ3CaI4CeGBSNtDSRrFSdtHShvJSpzLS11Mi10OS11Pi10Qy13Syx9UiuAXCuGZSuJbyuPeymThCqUjCqUlCqUnCqUpSmVrSmVtSmVuymTwCuSxSyPyS2NzSyL0S2J1y6J2i+I3y+HBShvDCpwFSxvHS5vJTBzLTN1NDV2OjR2QDV2RTR3TDR8UzN/XDSEZTOJbzKNejKShDKUizGTlDKUnDKUpTGVrTGVtTKTujKSvjOQwzOPyDSMzDaM0DeK1DaI2jeI3jeIBDB0DDJ0FDNyHTVxJTZzLTl1NDt2PT15Qj56SD16TT15VD1+XTyDZTyHbzyNeTuRhDqUjDqUlDqUnDqUpTqTrTuVtTuVuTuRvTyPwT2NxT6Lyz+LzkCK00CJ10GH20GHAzh5Czp5FDp4HTx3JT11LT91NEF2PUN5RUV9SkV8UEZ8VkZ+XUWBZUSHbkOMeEKQhEKUjEKUlEKUnEKUpUOVrUOVs0OTuEOSvESQwEWOxEaMyEeKzkiK0kiK1kmI20qJA0F/C0B9E0F7HEN6JEN6LER4NEZ4PUl5RUt9TE1+Ukx+V01/Xk2AZkyGbkyKeEuOhEqUjEqUlEqUnEqUpUuVrUuVsUuRtkuQu02Pv06Nw06NyE6My0+L0VGJ1VGJ2VGJAkiCCkiCEkmAHEqAJEt+LEt+NEx8PU57RVF9TFN+VFSAWVWBYFSAZ1SFblSKd1SNhFKUjFKUlFKUnFKUpVOVrFKUsFOStFSQuFWOvVWNwleMxlaKyliK0FmK1FmK2FmKAlOIClKGElKGG1GDI1ODK1SBM1SBPFSARVZ/TFd+VFqAXFyEYl2EaFyEbluId1yNg1uTjFqUlFqUnFqUpVuVqlqSsFuSs12Pt12PvF6MwF6MxV+NyWCLzmGM02GL12GLAV+NCV6LEV2JGluIIluIK12HM1yFPF6ERF2CTF+CVGCAXGKEZWWFamaGb2WHeGSMgmOQjGSUlGSUnGSUpWOVqWSTrWSPsWaPtmaOu2iNv2iNxGmOyGqMzWmN0muM1muMAGmSCGiQEWiPGmaOImeMKmWMMmSKO2SJQ2WHTGeGVGeGXGiEZWuFbGyIcWyHeG2KgWyPjGyUlGyUnGyUpGyUqG2SrG6QsG2OtG+OunCOvnCOwnCOx3GPzHGO0XKP1XSPAHKUCHKUEHKUGXKTIXGRKXCPMW6PO3CNQ26NS2+LU26JW3CJZHCIbHKIdHWKenSKgXSPjHSUlHSUnHSUonSSpnWQq3aRr3WPs3ePuXiPvXiPwXiPxnmQy3mP0HqQ1HyQAHqUCHqUEHqUGXqTIXqTKXqTMXqTOnqSQnmQSneQUniOW3iNZHiMbHiMdHuKfHyMgnyOi3uTlHyUnHyUoXyTpX2Rqn2Qrn+Qsn+QuICQvICQwICQxYGRy4KR0YKT1oKSAIKUCISUEIKUGYSTIYSTKYSTMYSTOoOUQoOUSoOUUoOUWoOUY4KRa4GPc4GPe4KNhIWOioWQlISUm4WToIWSpIWSqIeSrYiTsYeRuImSvYiTw4mTyIqUzouU04qV2YuVAIqUCIqUEIyUGYqTIYqTKYyTMYqTOouUQouUSouUUouUWouUY4uTa4uTc4uTe4uThIqQjIyQlIyUmYyTno6So4+TqI6Uro+UtJCUuo+UwJGWxZGVy5GX0JGW1pOY25OXAJKUCJKUEJKUGZSTIZSTKZSTMZSTOpOUQpOUSpOUUpOUWpOUY5OTa5OTc5OTe5OThJSUjJSUlJSUmZWVoJWWpZWVq5eXsJeWtpaWvJiYwpeYyJiYzZmZ05qZ2Jma3pqaAJuSCJuSEJuSGZyTIZyTKZyTMZyTOpuUQpuUSpuUUpuUWpuUY5uTa5uTc5uTe5uThJyUjJyUlJyUnJyUopuUppqWq5uXsJuWtpyWvJyYwp2YyJ6YzZ2Z056Z2J+a3qCaAKSUCKWSEKSUGaSTIaSTKaSTMaSTOqSSQqWUSqWUUqWUWqWUY6WTa6WTc6WTe6WThKSUjKSUlKSUnKSUpaWVq6SVsKOWtKOWuKOWvqOYwqOYyKSYzaOZ06SZ2KWa3qaaAK2SCK2SEK2SGayTIayTKayTMayTOq2UQq2USq2UUq2UWq2UY62Ta62Tc62Te62ThKyUjKyUlKyUnKyUpa2Vra2Vta2VuauVvamVwqqWx6mXy6mXz6qZ1Kma2Kma3qqaALSUCLWSELWSGbSTIbSTKbSTMbSTOrWUQrWUSrWUUrWUWrWUY7WTa7WTc7WTe7WThLSUjLSUlLSUnLSUpbWVrbWVtbWVvbWVwrOUx7CVzLGW0LCY1LCY2LCY3bGZ4a+ZALyUCL2SELyUGbyTIbyTKbyTMbyTOr2UQr2USr2UUr2UWr2UY72Ta72Tc72Te72ThLyUjLyUlLyUnLyUpb2Vrb2Vtb2Vvb2Vxb2VzLqU0bmV1biX2biX3baX4reY5raaAMSUCMSUEMSUGcSTIcSTKcSTMcSTOsWUQsWUSsWUUsWUWsWUY8WTa8WTc8WTe8WThMSUjMSUlMSUnMSUpcWVrcWVtcWVvcWVxcWVzsWU1sWU2sKW3sCW4r6W5r+Y676ZAM2SCM2SEM2SGc6TIc6TKc6TMc6TOs2UQs6SSs2UUs2UWs2UY82Ta82Tc82Te82ThM6UjM6UlM6UnM6Upc2Vrc2Vtc2Vvc2Vxc2Vzs2U1s2U3s2U48yV6MmW7MeW8ciXANWSCNWSENWSGdaTIdaTKdaTMdaTOtWUQtWUStWUUtWUWtWUY9WTa9WTc9WTe9WThNaUjNaUlNaUnNaUpdWVrdWVtdWVvdWVxdWVztWU1tWU3tWU5tWU7dOV8dGV9tCWAN2SCN6UEN2SGd6TId6TKd6TMd6TOt2UQt2USt2UUt2UWt2UY92Ta92Tc92Te92ThN6UjN6UlN6UnN6Upd2Vrd2Vtd2Vvd2Vxd2Vzt2U1t2U3t2U5t2U796V996V+9qVAOWSCOaUEOWSGeaTIeaTKeaTMeaTOuaSQuWUSuWUUuWUWuWUY+WTa+WTc+WTe+WThOaUjOaUlOaUnOaUpeWVreWVteWVveWVxeWVzuWU1uWU3uWU5uWU7+aV9+aV/+aVAO6UCO6UEO6UGe6TIe6TKe6TMe6TOu+UQu+USu6SUu+UWu+UY++Ta++Tc++Te++ThO6UjO6UlO6UnO6Upe+Vre+Vte+Vve+Vxe+Vzu+U1u+U3u+U5u+U7+6V9+6V/+6VAPaUCPeSEPaUGfaTIfaTKfaTMfaTOvaSQveUSveUUveUWveUY/eTa/eTc/eTe/eThPaUjPaUlPaUnPaUpfeVrfeVtfeVvfeVxfeVzveU1veU3veU5veU7veU9/aV//aVAP+SCP6UEP6UGf6TIf6TKf6TMf6TOv6SQv+USv+UUv+UWv+UY/+Ta/+Tc/+Te/+ThP6UjP6UlP6UnP6Upf+Vrf+Vtf+Vvf+Vxf+Vzv+U1v+U3v+U5v+U7/6V9/6V//6VBQZvCgZuEAVuFgZuGwVvIQZvKAZ0LwR5NwR9PwSBSAOGUQKLWwGPZgGUcACYegGchACcjACckwGbnACcpQCbrQCbtQGdvQCbxQCbzgGc1AGa2AKY3QKX4gOU5gSS6gWQBQpvDQ1xEg1wGA5wHg1wIw5xKQ1xMQ53OAx8QAyASAyEUAuKXAuOZgmUbwmXegmchAiciwmbkwmbnAicpQibrQmdtQibvQmdxQmdzgmc0wiZ1wmX3AuW4QyT5QyT6Q2RBRBvDRNxFRZzGxVzIRZzJhV0KxVzMhZ2ORR7QRR/SBSEUROJWxKNZRGRbxGXexGbgxGbjBCckxGbnBCcpRGdrRCbtRCbvRCbxRCbzhGc0hKa1hKW2hOU3xOT5BWS6BaQBRZvDRlxFRxzHh52Ix51KR91Lh52NB92Oh56QR5/SRyDUh2IWxuLZBqQbxqVeRmZgxmbjBqckxmbnBqcpRmdrRmdtRqbvRmdxRqbzBma0RuZ1RyX2RuV3h2U4R2R5h+QBRxvDR9xFSJzHiR2JSZ3KyV3MCZ4NiV4OyZ5QyZ9SSWBUiSGWyOLZCSQbiOUeSGZgyGbjCKckyGbnCKcpSGdrSKbtSGdvSKbxSKbyyKZzyOX0ySV1yWT3CWS4SWR5CaQBSFxDSNxFSZzHip2JSx3LS57Mi56OS57Pi56RC58Si2AUiyGWyyJZCuObSqTeCqYhCqcjCqckymbnCqcpSqbrSqbtSqbvSqbxSmdyiqaziuY0iyW1i2U2i6S3y6R5C6QBSl1DSt1FSxzHi52JTB3LTJ7NTV9OzZ9QTV9RjV8SzV/UzSFWzSJZDOObTORdzOXhDKcjDKclDKcnDKcpTKbrTGdtTGdvTGdwzGbyTOZzTSX0TWV1TST2jaS3zaR4jeQBDF6DDJ4FDJ4HjR2JTZ3LTp7NTt9PT5/Qj2ASD6ATT5/VD2CXDyIZDyMbTuRdzyVhDqcjDqclDqcnDqcpTudrTqbtTudvTudwjqaxjuYyjyWzj2U0z+T2D+S3ECQ4UGRBDl+DDh8FDp8HTx7JT15LT57NUF9PUJ/RUWBSkaCUEWCVUWBXUaHZUSLbUSPd0SVg0ObjEKclEKcnEKcpUOdrUKbtUOdvUOdwUOZxUSXyUWVzUaT00eT10eT20iR30mPAz+DC0CBE0KBHUJ/JUR/LUV9NUd9PUh/RUuBTU2FUk2EWE6EXk6GZU2JbUyPdkuUgkuYjEqclEqcnEqcpUudrUudtUudu0ubwEuaxE2WyE2WzE6U0E+S1lCS2lCS3lGQA0mHC0mHE0iFHEqEJEuCLEuCNEyAPU5/RVGBTVOFVFWGWlSGYFWGZlWIblSOdlSSgVKXjFKclFKcnFKcpVOdrVOdtVOduVOZvlOYwlSWx1aVy1aV0FaU1FeS2VmR3VmRAlGMClCKElCKG1KJJFKILFOGNFOGPVWFRVaDTVmFVFuGXFyIYl2IaFyIb1yNdlySgVqXjFqclFqcnFqcpVudrVudtFqcuFuavFyYwV2VxV2Vyl+Uzl6S01+T2GGS3GGSAV2RCVuREluQG1yNI1yNK1uLM1yJPFyIRF6ITWCHVGGGXGKIZWaLamWMcGaMdmWQgWWVi2OblGScnGScpWOdrWOdsmSatmWYu2WXwGeWxGaUyGiUzWmV0mmU1mmU22uTAWiXCWeVEWaTGmaSImOQKmOQM2WPPGWORGaMTGWKVGeKXGiIZWqLbW2Ncm6Od22PgW2VimuYlGycnGycpWudrWudsWybtWyXuW6Xv2+Xw3CVx3CVzHGW0XGV1XGV2nOUAHKcCHGaEHCYGW6XIm6WKm+UMm2UO2yRQ2yRS22PVG+OXG+OZXGNbXONdHSQeXSPgXSTiXSXlHScnHScpXOdrHScsHWatHaYuHWWvXaXwniWxniWyniW0HmW1HmW2XqXAHqcCHqcEHqcGXqbIXqbKXmZMXiXOnaWQ3iVS3aVU3eTW3aRZHiQbHiQdHqQfH2SgnySiXyXlHycnHycpXudqnyarn2Ys36Zt32XvH+WwYCXxYCXyYCXz4GX04GX2IKYAIScCIScEIKcGYKbIYKbKYSbMYSbOoOcQoOcSoKaUoGYWoCWZIGWbICUdIKUfIOShYWVi4aVk4WbnIScpYWdqYabrYWZsYeZtoeYu4iZv4iZxImayIqYzoqa04qZ2YybAIycCIqcEIycGYybIYybKYybMYybOoucQoucSoucUoucWoucY4uba4qZc4mXe4mXhIuWjI2Wko2YnIyco42bqI2arI2asI+atZCbupCawJGaxZCby5Gb0JKc1pOc25KdAJKcCJKcEJKcGZKbIZKbKZKbMZSbOpOcQpOcSpOcUpOcWpOcY5Oba5Obc5Obe5ObhJOajJKYlJSYnJScopWcppaaq5ebsJactpecvJicwpecyJmezZmd05mf2Jme3pugAJqcCJqcEJqcGZqbIZybKZybMZybOpucQpucSpucUpucWpucY5uba5ubc5ube5ubhJycjJyclJycnJycop2cqJ2erZ2ds5+fuJ+ev5+fxKCgyp+g0KCg1aGh26Kh4KGiAKWaCKWaEKScGaSbIaSbKaSbMaSbOqWcQqWcSqWcUqWcWqWcY6Wba6Wbc6Wbe6WbhKScjKSclKScnKScpaWdqqOcr6Sds6WfuKWev6WfxKagyqWg0Kag1aeh26ih4KeiAK2aCKycEK2aGaybIaybKaybMaybOqyaQqyaSq2cUq2cWq2cY62ba62bc62be62bhKycjKyclKycnKycpa2dra2ds6yduKuevKuewaqfxqugyqug0Kyg1auh26yh4K2iALScCLWaELWaGbSbIbSbKbSbMbSbOrWcQrWcSrWcUrWcWrWcY7Wba7Wbc7Wbe7WbhLScjLSclLScnLScpbWdrbWdtbWdvbWdwbOdxrKeyrKez7Gf07Gf17Kh3LGi4LGiAL2aCLycEL2aGbybIbybKbybMbybOr2cQr2cSr2cUr2cWr2cY72ba72bc72be72bhLycjLyclLycnLycpb2drb2dtb2dvb2dxb2dy7qdz7id1Lme2Lig3Lig4Lig5bmhAMWaCMScEMWaGcSbIcSbKcSbMcSbOsWcQsWcSsWcUsWcWsWcY8Wba8Wbc8Wbe8WbhMScjMSclMScnMScpcWdrcWdtcWdvcWdxcWdzsWc1MKc2cGd3cCf4cCf5b6f6r+gAM2aCM6cEM6cGc6bIc6bKc6bMc6bOs2cQs2cSs6aUs2cWs2cY82ba82bc82be82bhM6cjM6clM6cnM6cpc2drc2dtc2dvc2dxc2dzs2c1s2c3s2c4sqe58qd68ef8MigANWaCNWaENWaGdabIdabKdabMdabOtaaQtWcStaaUtWcWtWcY9Wba9Wbc9Wbe9WbhNacjNaclNacnNacpdWdrdWdtdWdvdWdxdWdztWc1tWc3tWc5tWc7NSc8NGe9M+eAN2aCN2aEN2aGd6bId6bKd6bMd6bOt6aQt2cSt2cUt2cWt2cY92ba92bc92be92bhN6cjN6clN6cnN6cpd2drd2dtd2dvd2dxd2dzt2c1t2c3t2c5t2c796d9dud+dmdAOWaCOWaEOacGeabIeabKeabMeabOuaaQuWcSuWcUuWcWuWcY+Wba+Wbc+Wbe+WbhOacjOaclOacnOacpeWdreWdteWdveWdxeWdzuWc1uWc3uWc5uWc7+ad9+ad/+adAO+aCO+aEO+aGe6bIe6bKe6bMe6bOu+cQu+cSu+cUu+cWu+cY++ba++bc++be++bhO6cjO6clO6cnO6cpe+dre+dte+dve+dxe+dzu+c1u+c3u+c5u+c7+6d9+6d/+6dAPeaCPacEPacGfabIfabKfabMfabOvaaQvecSvecUvaaWvecY/eba/ebc/ebe/ebhPacjPaclPacnPacpfedrfedtfedvfedxfedzvec1vec3vec5vec7/ad9/ad//adAP+aCP6cEP+aGf6bIf6bKf6bMf6bOv+cQv6aSv+cUv+cWv+cY/+ba/+bc/+be/+bhP6cjP6clP6cnP6cpf+drf+dtf+dvf+dxf+dzv+c1v+c3v+c5v+c7/6d9v+c//6dBgZ2CwZ1EQd1FwZ1HAd2IgZ2JwZ5MAV+NgSCPgSGRgSKUASQWgOUZAOabwGfeQCjgwCliwCllACkmwClpQGlrQGltQGlvQGlxQGlzgGk1gCm3gCm4wGj5wOf6wKd7wObBgx2Dg94Ew93Gg94Hw93JA54Kg94MA58OA6APwyFRwyJUAuOWguUZAqYbgqeeAmigwiliwilkwilmwilpQmlrQmltQmlvQmlxQmlzgmk1gmk3gmk4gqi5gug6wuf7gucBhJ2DhN4FRV5GxZ5IBV6JhZ6KxZ5MhV8ORWBPxWDSBSIUBOOWhKSZBKYbRKbeBCghBCkixCllBCknBCkpRGlrRGltRGlvRGlxRGlzhGk1hGk2xGj4RKj5RKf6ROd7RSbBhh2Dht4FRt5Hh98JB58KR99Lh98NB58Oh5+QB2CSB6IUByMWhySYxyVbRqbeBqghBqkixqlkxqlnBqkpRmlrRmltRmlvRmlxRmlzhmk1hqm2hqi3hug4xyd5xyd7B2aBhx2Dh94FSF5HiV8JiZ+Kyd/MSZ/Nyd/PCd+QiaCSSaHUCWKWiWQYySVbCOadyOfgiKijCKkkyKlnCKkpSGlrSGltSGlvSGlxSGlziKm1CKk2SOh3SSf4iSe5iWc6iaaBiJ2DiV4FSd5Hil8Jix+LS2BMi2AOC6APi2AQy6BSi6GUS2JWi2QYyuTbCyYdyqdgiqijCqklCqkmyqlpSmlrSmltSmlvSmlxSmlziqm0ymj1yqh3Cue4S2d5S6b6S6bBSl5DSl5FSt5Hi98JjJ+LTOBNTaDOzWDQDaERjWETDWGUjWIWzWPYzOTbDSYdTKbgTGhjDKklDKkmzKlpTGlrTGltTGlvTGlxTGlzjGk0jKi1jOg2jSe3zSd4zWb6DeaBTB/DTJ/FTN9HjV8Jjh+LTmBNTyDPj6GQz6FST+FTj6GUz2HXD2OYzyRbD2WdTybgDygjDqkkzqlnDqkpTulrTultTulvTulxTulzDqk0Tyj1Tyf2T6f3j2c4j6a5z+bBDiEDTiDFDmCHTuBJj2ALT+BNUCDPkSGRUaHSkWIUEaIVUaHXUWNZESQbEWWdUOZgEOei0OjlEKknEKkpUOlrUOltUOlvUOlxUOly0Ojz0Sh00Wf2EWe3Ued4Uib5UibBECIDECIFEGGHUKDJUKDLUWBNUaDPkqGRUqHTU2JUk6KWE2KXk2MZU6PbEyUdUuZgEueikqilEqknEqkpUulrUultUulvUulxUulykyizk2g0kye1k6e3E6c4FCc5E+aA0iNC0eLE0mLHUmJJUuJLUyHNUyHPk6GRVCHTVOJVVWNWlWMYFaMZlaObVSTdVSXgFOeiVOhlFKknFKkpVOlrVOltVOlvVOlxFKkyVSjzVWh0Vaf1VWd2lec31eb41mbA1CRC1CRE1GPHFCMJFKMLFKMNFOKPVWJRVaHTVmJVVuNXF2OYlyOaF2OblySdlyWf1ubiFqglFqknFqkpVulrVultVulvVulwlukx1yhy12f0F2e1F2e2F6c3WCb4mGcAlqWClmUElmUG1mTI1qRLFyQNFyQPVyPRV2NTV+NVWGNXGOOZWWRamaScGWSd2aVf2WbiGWek2OjnGSkpWOlrWOltWOlvWOlwWSjxWWhyWafzmae02id12eb22mb4GqcAWSbCWOZEWOZG2OXI2OXK2SVM2OTPGWSRGWSTGaQVWiPXGmOZWuRbW2Vcm2UeG6Uf2yZiG2ekmyinGykpWulrWultWulu2ujwG2ixG6gyG6gzW6f0nCe1nCe2nGc33KdAG6gCW6fEW2dGm2cImyaKmyaM2yZPGyYRG2WTG6UVG6UXG+SZXGRbXOVdXaXenaWgXWZiXWdkXOhnHSkpXOlrXOltXOlunOkvnSiw3ahyHagy3ef0Hee1Xmd2Xmd3XmdAHqkCHqkEHeiGXehInegKnaeMnaeO3WbQ3WbS3SZU3aZXHaYZXiXbXmVdXqXfHyYgn2YiX2dknugnHykpXulrXultXuluXyjvX2hwX6fxn+gyn+gzoCe04Gf2IGe3IGeAIKkCIKkEISkGYOlIYOlKYOlMYKjOoGgQn+gS3+fU4CdW4CdZH+abIGadIKYfIKYhYabi4Wbkoaem4WjpYWlrYWlsoWkuIWiu4ahwIagxIigyYmhzYif0omg14qh24qhAIqkCIqkEIqkGYulIYulKYulMYulOoukQoukSoukUoqiWomgY4mfbImedImefIqchYybjY2dk42fmoyipY2lrY2lsYyjtY2huo6iv5Chw5ChyJGizJGi0ZGh1pKi25OjAJSkCJKkEJSkGZOlIZOlKZOlMZOlOpOkQpOkSpOkUpOkWpOkY5Sla5Ojc5Khe5KhhJKgjZSflJSgm5ShpZWlrJSksJaktJWiuJeivpiiwpiiyJikzZij05ql2Jqk3pqmAJqkCJqkEJykGZulIZulKZulMZulOpukQpukSpukUpukWpukY5yla5ylc5yle5ylhJykjJqklJuinJ2ipZ2lqp2kr52js52juJ6kv6ClxJ+myqCm0KGm1aCn26Gn4KKoAKSkCKSkEKSkGaOlIaOlKaWlMaWlOqWkQqWkSqWkUqWkWqWkY6Sla6Slc6Sle6SlhKSkjKSklKSknKSkpaWlqqamsKemtaanu6enwainx6enzamp0qmo2amp3qqq5KuqAKykCKykEKykGayjIayjKa2lMa2lOq2kQq2kSq2kUq2kWq2kY6yla6ylc6yle6ylhKykjKyklKyknKykpa2lra2lsqymt62nu62nwaynx62nza2p0q2o2a+p3q6q5K+qALSkCLSkELSkGbWlIbSjKbWlMbSjOrWkQrWkSrWkUrWkWrWkY7Sla7Slc7Sle7SlhLSkjLSklLSknLSkpbWlrbWltbWlu7SlwLOmxbSnybKnzrOo0rOo2bOp3rSq5LWqALykCLykELykGb2lIb2lKb2lMbyjOr2kQr2kSr2kUr2kWr2kY7yla7ylc7yle7ylhLykjLyklLyknLykpb2lrb2ltb2lvb2lxb2lyrqmzrqm0rmo17qp27qp37qp5LmqAMSkCMSkEMSkGcWlIcSjKcWlMcWlOsWkQsWkSsWkUsWkWsWkY8Sla8Slc8Sle8SlhMSkjMSklMSknMSkpcWlrcWltcWlvcWlxcWlzsSm08Kl18Gn3MKo4MCo5MCo6cGpAM6kCM6kEM6kGc6jIc2lKc2lMc6jOs2kQs2kSs2kUs2kWs2kY86la86lc86le86lhM6kjM6klM6knM6kpc2lrc2ltc2lvc2lxc2lzs6m1s6m3Mum4cqn5smo6smo7smoANakCNakENakGdWlIdWlKdWlMdajOtWkQtWkStWkUtWkWtWkY9ala9alc9ale9alhNakjNaklNaknNakpdWlrdWltdWlvdWlxdWlztam1tam3tam5tam69On79Gn88+nAN6kCN6kEN6kGd6jId6jKd2lMd2lOt2kQt2kSt2kUt2kWt2kY96la96lc96le96lhN6kjN6klN6knN6kpd2lrd2ltd2lvd2lxd2lzt6m1t6m3t6m5t6m796l9Num+NmmAOakCOakEOakGeajIeWlKeajMeajOuWkQuWkSuWkUuWkWuWkY+Wja+alc+ale+alhOakjOaklOaknOakpeWlreWlteWlveWlxeWlzuam1uam3uam5uam7+al9+al/eOlAO6kCO6kEO6kGe+lIe6jKe+lMe+lOu+kQu+kSu+kUu+kWu+kY+6la+6lc+6le+6lhO6kjO6klO6knO6kpe+lre+lte+lve+lxe+lzu6m1u6m3u6m5u6m7+6l9+6l/+6lAPakCPakEPakGfelIfajKfajMfajOvekQvekSvekUvekWvekY/ala/alc/ale/alhPakjPaklPaknPakpfelrfeltfelvfelxfelzvam1vam3vam5vam7/al9/al//alAP6kCP6kEP6kGf6jIf+lKf+lMf+lOv+kQv+kSv+kUv+kWv+kY/6la/6lc/6le/6lhP6kjP6klP6knP6kpf+lrf+ltf+lvf+lxf+lzv6m1v6m3v6m5v6m7/6l9/6l//6lBgZ6Cwd7EQZ7Fwd7HAd6IQZ7KAd+LwaBNgaGPgaKRgWQTgOUWQOZYwOfbQKjdwGnhACsiwCtkwCtmwCtpACsrQGttQGtvQGtxQGtzgGs1gGs3gCu5gGs7QCr8QGp9QKnBgx6Dg5+Ew59GQ99Hw59JA9+Kg5+MA6AOA2GPgyKRgyOTgySWQuZYgucbAuidwmngwmriwitkwitnAispQmtrQmttQmtvQmtxQmtzgiu1gms3giu5giu6wmr7wun8wqlBhJ6DhR+FheAHBaAIheAJxd/LBaAMheAOBaEQBaIRxSNTxSRWRSXYhOcbBKgdhKmgRGpixCtkxCtmxCtpBCsrRGttRGtvRGtxRGtzhCu1hGs3hGs5hGs6hKq7hOo8xOn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va6vxLCwybCvz6+v1bGx27Cx4bGx5rKyALSsCLSsELSsGbSrIbSrKbSrMbWtOrWsQrWsSrWsUrWsWrWsY7Sta7Stc7Ste7SthLSsjLSslLSsnLSspbWtrbWttbWturSuv7WvxLSwybSvz7Wv1bWx27ax4bex5rayALysCLysELysGbyrIb2tKbyrMb2tOr2sQr2sSr2sUr2sWr2sY7yta7ytc7yte7ythLysjLyslLysnLyspb2trb2ttb2tvb2tw7ytybyvzbyv0bqv1ruw27qx4bux5ryyAMSsCMSsEMSsGcSrIcWtKcWtMcWtOsWsQsWsSsWsUsWsWsWsY8Sta8Stc8Ste8SthMSsjMSslMSsnMSspcWtrcWttcWtvcWtxcWtzsSu0sKu1sKu2sGw38Kx48Kx58KxAM6sCM6sEM6sGc2tIc6rKc6rMc6rOs2sQs2sSs2sUs2sWs2sY86ta86tc86te86thM6sjM6slM6snM6spc2trc2ttc2tvc2txc2tzs6u1s6u28yt38mv5cqv6cmx7cmxANasCNasENasGdWtIdarKdWtMdWtOtWsQtWsStWsUtWsWtWsY9ata9atc9ate9athNasjNaslNasnNaspdWtrdWttdWtvdWtxdWtztau1tau3tau5NOu6tKu7tGw8tGwAN6sCN6sEN6sGd2tId2tKd2tMd2tOt2sQt2sSt2sUt2sWt2sY96ta96tc96te96thN6sjN6slN6snN6spd2trd2ttd2tvd2txd2tzt6u1t6u3t6u5t6u796t89uv99mvAOasCOasEOasGearIearKearMeWtOuWsQuWsSuWsUuWsWuWsY+ata+atc+ate+athOasjOaslOasnOaspeWtreWtteWtveWtxeWtzuau1uau3uau5uau7+at9+at/OOuAO6sCO6sEO6sGe6rIe6rKe6rMe6rOu+sQu+sSu+sUu+sWu+sY+6ta+6tc+6te+6thO6sjO6slO6snO6spe+tre+tte+tve+txe+tzu6u1u6u3u6u5u6u7+6t9+6t/+6tAPasCPasEPasGfarIfetKfarMfetOvesQvesSvesUvesWvesY/ata/atc/ate/athPasjPaslPasnPaspfetrfettfetvfetxfetzvau1vau3vau5vau7/at9/at//atAP6sCP6sEP6sGf6rIf+tKf6rMf6rOv+sQv+sSv+sUv+sWv+sY/6ta/6tc/6te/6thP6sjP6slP6snP6spf+trf+ttf+tvf+txf+tzv6u1v6u3v6u5v6u7/6t9/6t//6tBgeACwaBEQeBFwaBHAaAIgeAJwaBLweHNgaKPQaPRQSTTgWYVwSdYQKjawOndQKrgQGxiwC1lAC0nAC0pAC0rQG1tQG1vQG1xQG1zgG01gC23gG05gC27wC19wC1+gKyBguADg6CEw+DGQ6DHw+DJA+CKQ6DMQ+FNw6JPg6ORg6STg2YVwydYQuhawundQqrgAiwjAi0kwi1mwi1pAi0rAi0tQm1vQm1xQm1zgm01gm03gm05gi27wi19Qiz+QmxBhGADhSCFhaGHBeGIReFJxaFLBeGMhaGOBaIQBWORhSSThSWVxObYROhahOkdBOqfxGvixGzkxC1mxC1pBC0rRG1tRG1vRG1xRG1zhG01hC23hG05hC27xC18xGz9xOvBheADhqCFhyGHh+IIx+HKR6HLh+INB6IOh+IQR+NSB6QTx6VWB2aYRyfahukdByofxqtiRmxkxq1mxq1pRm1rBq0tRm1vRm1xRm1zhq21hm03hm05hm07Rqz8Rux9huwBh2ADiCCFiKGHiOIJiaKKyaJMSeJNyaJPCeKQiaKSSaPTyWTWSWZYSWdaSSjdCSofyKtiCKwkyK1nCK0pCK0rCK0tSG1vSG1xSG1ziG01iK23iK25iK27CGy8CKw9SSvBiOADiSCFiiGHimIJiyKLi+MNC6MOi+MPy6NRC6MSi6OUC2SWi2YYS2daiyicyylfiqqiCqwlCq0myq1pSm1rCq0tSm1vSm1xSm1zim01im03im05iq26yuz7yuv8yytBiiCDiqCFiyGHi+IJjKKLjWMNjaOPDeOQTaPRzePTDeOUjaSWzWXYTSbajWgczSlfTOpiDOukjKynDK0pDK0rTG1tTG1vTG1xTG1zjG01jG03jK25DK06jKy7jOw8jSuBjGIDjGIFjSGHjWIJjiKLjuMNjyOPj+QRD6QST+RTj+QUz6RXD+WYj6aaz2fcz2jfT2phzytkjqynDq0pTu1rDq0tTu1vTu1xTu1zjq21ju03ju04zuz6Dyw7D2u8D6sBTeNDTiLFTiLHjqKJjyKLj+MNkKOPkWQRkeUS0eTUUaTVkeUXUeVY0aZa0Wfc0WjfUSnhkOskUOxnEK0pUO1rEK0tUO1vUO1xUO1zkO01kO03kK24kSy50Sx60Wv70atBT+RDT+RFUCPHkKOJkSOLkWMNkiOPkmQRkuUTk6WU06VWU+VX06VZE6YbE2ec0yhfUynhkyqkEywnEq0pUu1rUu1tUu1vUu1xUu1zkq21kq23Eq04Uyz5k2w6k6u7k2sBEeWDEaUFEiUHUiTJkmQLUuRNk2QPk+QRlGUTlSWVVaXWlWYYVaXZlWYbVWddFSgfVWlhlSqkFOum1OzpVO1rFK0tVO1vVO1xVO1zlK21lO021Oz31Sx5FSw6VWt7VetA0+bDE+aFFCYHVCXJVGVLVKTNVKTPlSSRleUTlqWVVqXXV2ZY16ZaF2abl2cdV6ffl2khluokFuumlqypVu1rVu1tVu1vVu1xVu1zlq21lq22lyy3l2w412v516t7F6sA1efC1idE1idHFicJFmaLFuaNVuZPl2YRl6WTmCWVWKXXWOZZmaea2adcWedd2effmaihmWoj2StmWOxpWO1rWO1tWO1vWO1xWO1zmS21GS02WSz3WWx4Wav5Wet6WirAmGkCmCiEmCiHGKgJGKgLGGeNGKcPWSbRWSbTWWZVWeZXWmZZmyebW6fc22feG6gf26hh22nj22rmWyvpWu1rWu1tWu1vWu1xWu1zmy20myy12yx3G6w4G+u5G+u6W+tAWupCmuoEmqmG2qlI2mjK2mjM2qhPWuhRWyfTWyfVW2dXW+dZnKebXSfdXWhenaigXWhiHWmj3WrmHWupXO1rXO1tXO1vXO1xXO1zXO10XSz1XWx2Xav3nau43it53erAXWtCXWtEXSrGnSqI3SpK3OnM3OnPHKkRHSkTHWiVHWiXHagZnegbXifdXuhfX2lg36liX2lj3ypmH2upHy0rXu1tXu1vXu1xXu1y3uz0Xyz1H6w2H6w3X+t4X+t5oCuAIGyCIGyEICwGoGwIoCuKn+sMn6qO3ypQ3ypTH6oVH2mXH+mZX6jbYCjdYGhfYOlhoami4enkIaomYWto4SxrYW1tYW1vYW1xYW1yoW0zoWw0oew14ev3Imu4Imu5YqvAIq0CIy0EIy0GYu1IYqzKYmxMomwO4evQ4itS4atU4WrW4apZIaobYindYinfYmlhoymjY2pko2omY6roo2wrY21tY21vY21xIy0yY6zzY+x0Y6v1ZCv25Gv35Gv45GvAJS0CJK0EJK0GZO1IZO1KZO1MZO1OpO0QpKySpGwUo+wW4+vZI+ubJCsdI+qfJGqhZGpjZOplZarm5WropWwrZW1tZW1vZW1wpW0x5axzJey0Jaw1Jiw2pmw3pmw4pmwAJy0CJq0EJq0GZu1IZu1KZu1MZu1Opu0Qpu0Spu0Upu0Wpu0Y5qxa5ixc5mvfJmuhZmtjZmtlZyrnZ2to52vrJy0tZ21vZ21wZyzxp6yy56xz6Cx06Cx2aGx3aGx4aGxAKS0CKS0EKS0GaW1IaO1KaW1MaO1OqW0QqW0SqW0UqW0WqW0Y6S1a6S1c6S1e6S1hKOyjKKwlKKwnKOupaavq6axtaW1vKa0wKa0xaazyaizzqm00qiy2aqz3qm05Kq0AKy0CKy0EKy0Gau1Iau1Kau1Ma21Oqu0Qqu0Sq20Uqu0Wq20Y6y1a6y1c6y1e6y1hKy0jKy0lKy0nKy0pauxra2xta21uq20v661xLC0ya+1z7C11bG127C14bK35rK2ALS0CLS0ELS0GbO1IbO1KbO1MbO1OrW0QrW0SrW0UrW0WrW0Y7S1a7S1c7S1e7S1hLS0jLS0lLS0nLS0pbW1rbW1tbW1ura2wLe2xra2zLi40bi317e33bm547i56bm5ALy0CLy0ELy0Gb21IbyzKbyzMbyzOr20Qr20Sr20Ur20Wr20Y7y1a7y1c7y1e7y1hLy0jLy0lLy0nLy0pb21rb21tb21vb21wry2x7u3zLy40by317233b2547656b+5AMS0CMS0EMS0GcSzIcSzKcW1McSzOsW0QsW0SsW0UsW0WsW0Y8S1a8S1c8S1e8S1hMS0jMS0lMS0nMS0pcW1rcW1tcW1vcW1xcW1zMO20cS31cS32cK33sO448K56cO5AM60CM60EM60Gc21Ic6zKc6zMc6zOs20Qs20Ss20Us20Ws20Y861a861c861e861hM60jM60lM60nM60pc21rc21tc21vc21xc21zs621s622sy23sq248u36Mq47Mq4ANa0CNa0ENa0GdazIdW1KdazMdazOtW0QtW0StW0UtW0WtW0Y9a1a9a1c9a1e9a1hNa0jNa0lNa0nNa0pdW1rdW1tdW1vdW1xdW1zta21ta23ta249S16NG27dK38dG5AN60CN60EN60Gd6zId21Kd6zMd21Ot20Qt20St20Ut20Wt20Y961a961c961e961hN60jN60lN60nN60pd21rd21td21vd21xd21zt621t623t625t627du18tq29tm4AOa0COa0EOa0GeazIeW1KeW1MeW1OuW0QuW0SuW0UuW0WuW0Y+a1a+a1c+a1e+a1hOa0jOa0lOa0nOa0peW1reW1teW1veW1xeW1zua21ua23ua25ua27+a19+a1++O3AO60CO60EO60Ge6zIe6zKe6zMe6zOu+0Qu+0Su+0Uu+0Wu+0Y++za+61c+61e+61hO60jO60lO60nO60pe+1re+1te+1ve+1xe+1zu621u623u625u627+619+61/+61APa0CPa0EPa0GfazIfazKfazMfazOve0Qve0Sve0Uve0Wve0Y/a1a/a1c/a1e/a1hPa0jPa0lPa0nPa0pfe1rfe1tfe1vfe1xfe1zva21va23va25va27/a19/a1//a1AP60CP60EP60Gf6zIf6zKf+1Mf6zOv+0Qv+0Sv+0Uv+0Wv+0Y/61a/61c/61e/61hP60jP60lP60nP60pf+1rf+1tf+1vf+1xf+1zv621v623v625v627/619/61//61BweHDAeGEgiGGAeGHQiHIgiGKAeGLweLNgeQPQaTRQWZTAScVwWjXwOnaQKrcwKxfwK1iQG5lAC8mwC9pQG9rAC8tAC8vQG9xQG9zgG81gG83gG85gC+7wC99wC9/wC9Bw2HDg+IEw6JGg+IHw6JJA6IKg+IMA+KNw+PPg6SRQ6XTQybVwyhXwylaQqrcwuvfgm0iQm5kwi9nAi8pAi8rAi8tQm9vQm9xQm9zgm81gm83gi+5gm87wi99wi9/wi9BxOHDhOIFhaKHBeKIRaLJxeLLBeKMhaKOReNPxaRRhaWThaaVxShXxSlaROpcxOvfRKziBC4lBC8mxC9pRG9rBC8tBC8vRG9xRG9zhG81hG83hG85hG87xC99xC9/RC7BxmHDhuIFhyKHyCNJB+OKiCOLyCNNR+NOyCNQB6QRx6VTh6aWB6gYBykaR2pchusfRuxiBu2khq6nBq8pRm9rBq8tRm9vRm9xRm9zhm81hm83hm85hm87xq99xq9+xu7Bx2HDh+IFiKKHySNJieQKyePMSaPNyePPCaQQieQSSeVUCaYWCWeYCWiaSSnciOsfCKwhyK1kSG5myK9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5pTu75Xv95Xv/5XvApLiCpPgEpLeG5LdI5DdLJLcNJHaPZHZRZDXTZLXVZHVXZPVZ5PTb5XTd5bRf5bRiJjQj5rRl53Tn5/XpaDXqqDWsKDYt57dv57hyp3o053r3pzu5pzu753v953v/53vAZ7nCZ3lEZ3lGp3kI5zhK5zhM5zhPJveRJrcTJrcVZzbXZvZZpvYbpzWdp7Wfp3Uh5/Tj6HTl6PTn6XXp6jZrafZsqjauKjcwKjgyafl06bp3qbu5qbu76Xv96Xv/6XvAKrsCKnqEanpGqfoIqfoKqbmM6XjO6XjRKXiTKTgVKPeXKPeZaPdbaTbdqbafqbah6bZj6fXl6nXn6vXp67Zr6/btLDcuq/cwbDfya/l0q/o3a3t5q7u763v963v/63vALPuCLPuELXuGbPtIbLrKrDqMbHpO6/nQ6/nS67lU63jW63jZa3hba3hda7ffa3dhq/cjq/clrDan7LZp7LZr7Xbt7ffvLfewrjeybbj0rfo3Lbs5rbu77Xv97Xv/7XvAL3uCLvuELvuGbzvIbzvKbzvMbzvOrvsQrjqSrjqU7jpW7fnZLfmbLbkdLbkfbbjhrbijrfglrjenrjep7rdr7vbt73fv8DhxMDgy7/j07/n273r5r7u773v973v/73vAMPuCMXuEMPuGcTvIcTvKcTvMcTvOsTuQsTuSsTuUsTuWsHsY8HrbMHqdMDofMDohb/ljb/llb7jncDjp8Dhr8Lht8Pfv8ThxsbizMfi08fn3MXq5sbu78Xv98Xv/8XvAM3uCM3uEM3uGc7vIczvKc7vMc7vOs7uQszuSszuUszuWs7uY83va83vc83ve8zthMvqjMnqlcnpncrnpsrmrsnktsvkvszixsziz9Dl1c/l3NDo5c/t78/v98/v/M/uANXuCNXuENXuGdTvIdTvKdTvMdTvOtbuQtTuStTuUtTuWtTuY9Xva9Xvc9Xve9XvhNXujNXulNXunNTspdLrrdPpttPovtPoxtTmz9bl19fn3dfp5Nbs79fv99fv+9btAN3uCN3uEN3uGdzvIdzvKdzvMdzvOtzuQtzuSt7uUtzuWt7uY93va93vc93ve93vhN3ujN3ulN3unN3upd7vrd7vtd3tvdzrxdzrztzq197p3t7q5d7r79/v9t7u+uDuAOXuCOXuEOXuGeTvIeTvKeTvMeTvOuTu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iKDckKHemKTgn6bhqKjkranls6jluKjkv6jpyKfu0Kfy2qf45Kb876X/96X//6X/AaX1CqX0EqbyG6TxI6PvK6PvM6LtPaLrRaLrTaHpVaLnXaLnZqLmbqPkdqXkf6XjiKfikKjgmKrgn6zhqK7ksLDotbDnu7HnwbHpyLDs0K/y2a734637763/963//63/AbH5CbH5Ea73Gq72Iq30Kq30M6zxPKzwRKvuTKvuVKrsXKrsZqzqbqzqdqvofqzmh67lj67ll6/jn7HjqLTksLbot7jpvbfpwrjqybjr0bfx2bf147b577X/97X//7X/ALv+CLv+ELr8Gbr7Irj6Krf4Mrf4O7b1RLb0S7XzVLXyXLTwZbTvbbPtdbPtfbTrh7Xrj7bpl7bpn7fnqLnmsLzot77pv7/rxMDsy7/r0r/w2b/14r/4773/973//73/AMP+CMP+EMP+GcT/IcT/KcP9McL7O8H7QsD6S7/3U7/3W771ZL70bb7zdb3xfb3xhrzujr7ulr/snr/sp7/rsMHqt8Lpv8Xrx8fvzcjv08fv2cbz4sf47sb+98X//8X/AM3+CM3+EM3+Gc7/Ic7/Kc7/Mcz/Os7+Qs7+Ssv8Usv8Wsr6ZMv6bMr4dMn2fMj0hcbzjcbzlsjynsfwp8nvr8jtt8rtv8vrx83v0NDw1dHx2tDy48/37c7798///8//ANX+CNX+ENX+Gdb/IdT/KdT/MdT/OtT+Qtb+StT+Utb+Wtb+Y9X/a9T9c9P7fNP6hdH5jdL3ldD3nc/1ps/0rtDyt9Lxv9Lxx9Pv0Nbw19fz3Nfy49j17Nf699f//9f/AN3+CN3+EN3+Gdz/Idz/Kd7/Mdz/Otz+Qtz+St7+Utz+Wtz+Y93/a93/c93/e93/hN3+jNz8lNv6nNn6ptv4rtn4ttr2vtn0xtv0z9vz193z3+D15d/17N/699///9//AOX+COX+EOX+GeT/IeT/KeT/MeT/Oub+QuT+Sub+UuT+WuT+Y+X/a+X/c+X/e+X/hOX+jOX+lOX+nOX+peX9reT7teL7veP5xuP4z+P31+P33+b15+f37ef59ub+/+f/AO3+CO3+EO3+Ge7/Ie7/Ke7/Me7/Ou7+Qu7+Su7+Uu7+Wu7+Y+//a+3/c+//e+3/hO/+jO/+lO/+nO/+pe7/re7/te7/ve7/xe7/zu381uz63uz65u347/D59fD7/+//APX+CPX+EPX+Gfb/Ifb/Kfb/Mfb/Ovb+Qvb+Svb+Uvb+Wvb+Y/X/a/X/c/X/e/f/hPX+jPX+lPf+nPX+pfb/rfb/tfb/vfb/xfb/zvb+1vb+3vb+5vb+7/X79/f7//f/AP3+CP3+EP3+Gf7/If7/Kf7/Mf7/Ov7+Qv7+Sv7+Uv7+Wv7+Y/3/a/3/c/3/e/3/hP/+jP/+lP/+nP/+pf7/rf7/tf7/vf7/xf7/zv7+1v7+3v7+5v7+7///9///////";

  function backdropLut() {
    if (BACKDROP.lut) return BACKDROP.lut;
    if (BACKDROP.lutTask) return BACKDROP.lutTask;
    BACKDROP.lutTask = Promise.resolve().then(function () {
      var bin = atob(LUT_RAW_B64);
      var out = new Uint8Array(bin.length);
      for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
      BACKDROP.lut = out;
      return out;
    });
    return BACKDROP.lutTask;
  }

  function lutSample(lut, n, r, g, b) {
    var p0 = r * (n - 1), p1 = g * (n - 1), p2 = b * (n - 1);
    var i0 = p0 | 0, j0 = p1 | 0, k0 = p2 | 0;
    if (i0 > n - 2) i0 = n - 2;
    if (j0 > n - 2) j0 = n - 2;
    if (k0 > n - 2) k0 = n - 2;
    var fr = p0 - i0, fg = p1 - j0, fb = p2 - k0;
    var out = [0, 0, 0], i, j, k, w, idx;
    for (k = 0; k < 2; k++) {
      var wk = k ? fb : 1 - fb, kb = (k0 + k) * n * n;
      for (j = 0; j < 2; j++) {
        var wj = wk * (j ? fg : 1 - fg), jb = kb + (j0 + j) * n;
        for (i = 0; i < 2; i++) {
          w = wj * (i ? fr : 1 - fr);
          if (w <= 0) continue;
          idx = (jb + i0 + i) * 3;
          out[0] += w * lut[idx];
          out[1] += w * lut[idx + 1];
          out[2] += w * lut[idx + 2];
        }
      }
    }
    return out;
  }

  function gradeBackdrop(imageData, lut) {
    var d = imageData.data;
    var n = BACKDROP.lutSize;
    var ws = BACKDROP.whiteScrim, bs = BACKDROP.blackScrim;
    var sat = BACKDROP.saturation, k = BACKDROP.contrast;
    var inv = 1 - ws;
    for (var i = 0; i < d.length; i += 4) {
      var r = (d[i] / 255) * inv + ws;
      var g = (d[i + 1] / 255) * inv + ws;
      var b = (d[i + 2] / 255) * inv + ws;
      if (lut) {
        var s = lutSample(lut, n, r, g, b);
        r = s[0] / 255; g = s[1] / 255; b = s[2] / 255;
      }
      r *= 1 - bs; g *= 1 - bs; b *= 1 - bs;
      if (k !== 1) { r = (r - 0.5) * k + 0.5; g = (g - 0.5) * k + 0.5; b = (b - 0.5) * k + 0.5; }
      var Y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      r = Y + sat * (r - Y);
      g = Y + sat * (g - Y);
      b = Y + sat * (b - Y);
      d[i] = r < 0 ? 0 : r > 1 ? 255 : (r * 255 + 0.5);
      d[i + 1] = g < 0 ? 0 : g > 1 ? 255 : (g * 255 + 0.5);
      d[i + 2] = b < 0 ? 0 : b > 1 ? 255 : (b * 255 + 0.5);
      d[i + 3] = 255;
    }
  }

  function prepareBackdrop(image, src) {
    if (rasterCache.has(src)) return rasterCache.get(src);
    var task = Promise.all([Promise.resolve(), backdropLut()]).then(function (pair) {
      var lut = pair[1];
      var n = BACKDROP.size;
      var w = image.naturalWidth, h = image.naturalHeight;
      var side = Math.min(w, h);
      var canvas = document.createElement("canvas");
      canvas.width = n; canvas.height = n;
      var ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx || !("filter" in ctx)) throw new Error("Canvas Gaussian filter unavailable");
      // Clamp the cover into the square before convolution so blur edges never fade to black.
      var padded = document.createElement("canvas");
      var edge = BACKDROP.blurPx * 3;
      padded.width = n + edge * 2; padded.height = n + edge * 2;
      var pad = padded.getContext("2d");
      var cx = (w - side) / 2, cy = (h - side) / 2;
      pad.drawImage(image, cx, cy, side, side, edge, edge, n, n);
      pad.drawImage(image, cx, cy, 1, side, 0, edge, edge, n);
      pad.drawImage(image, cx + side - 1, cy, 1, side, edge + n, edge, edge, n);
      pad.drawImage(image, cx, cy, side, 1, edge, 0, n, edge);
      pad.drawImage(image, cx, cy + side - 1, side, 1, edge, edge + n, n, edge);
      ctx.filter = "blur(" + BACKDROP.blurPx + "px)";
      ctx.drawImage(padded, -edge, -edge);
      ctx.filter = "none";
      var frame = ctx.getImageData(0, 0, n, n);
      gradeBackdrop(frame, lut);
      ctx.putImageData(frame, 0, 0);
      // Hand the graded canvas straight to the mesh layers. Encoding it to PNG and decoding
      // it back was pure overhead, and in CEF 116 img.decode() never settled on the data URI.
      return { canvas: canvas, raster: true, bytes: n * n * 4 };
    }).catch(function (error) {
      // Surface the reason instead of silently dropping back to the raw cover.
      document.getElementById("kabi-bg").dataset.kabiBackdropError =
        error && error.message ? error.message : String(error);
      return { url: src, raster: false };
    });
    rasterCache.set(src, task);
    if (rasterCache.size > 3) rasterCache.delete(rasterCache.keys().next().value);
    return task;
  }

  // Decode before fading. Finish the active blend before starting the newest queued cover.
  // Background 500ms matches the legacy native initializer; art 600ms remains reconstruction.
  function blendCover(container, src, layerSelector, duration, onReady) {
    var state = container._kabiBlend;
    if (!state) {
      var layers = Array.prototype.slice.call(container.querySelectorAll(layerSelector));
      if (layers.length !== 2) return;
      state = container._kabiBlend = { layers: layers, front: 0, requested: "", token: 0, ready: null, busy: false, timer: 0, frame: 0 };
      imageStates.push(state);
      layers[0].style.opacity = "1";
      layers[1].style.opacity = "0";
    }
    if (state.requested === src) return;
    state.requested = src;
    var token = ++state.token;
    state.ready = null;
    container.dataset.kabiCoverState = "loading";
    var loader = new Image();
    var corsRetry = false;
    // Same-origin covers share the host image request; CORS mode would duplicate in-flight downloads.
    if (container.id === "kabi-bg" && new URL(src, document.baseURI).origin !== location.origin) loader.crossOrigin = "anonymous";
    loader.onload = function () {
      var decoded = loader.decode ? Promise.race([
        loader.decode().catch(function () {}),
        new Promise(function (done) { setTimeout(done, 800); })
      ]) : Promise.resolve();
      decoded.then(function () {
        return container.id === "kabi-bg" ? prepareBackdrop(loader, src) : { url: src, raster: false };
      }).then(function (prepared) {
        if (disposed || state.token !== token) return;
        state.ready = { src: src, image: loader, prepared: prepared };
        start();
      });
    };
    loader.onerror = function () {
      if (disposed || state.token !== token) return;
      if (container.id === "kabi-bg" && !corsRetry) {
        corsRetry = true; loader.removeAttribute("crossorigin"); loader.src = src; return;
      }
      container.dataset.kabiCoverState = "error";
    };
    loader.src = src;

    function assign(layer, ready) {
      // All mesh instances share one graded raster; per-instance colour terms (the
      // .0075*instanceId scrim step) are below one quantisation step at 8 bit.
      var source = ready.prepared.canvas;
      var views = source ? layer.querySelectorAll("canvas") : layer.querySelectorAll("img");
      for (var i = 0; i < views.length; i++) {
        var view = views[i];
        view.dataset.kabiSource = ready.src;
        view.dataset.kabiRaster = ready.prepared.raster ? "graded" : "raw";
        if (source) {
          if (view.width !== source.width || view.height !== source.height) {
            view.width = source.width; view.height = source.height;
          }
          var ctx = view.getContext("2d");
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = "high";
          ctx.drawImage(source, 0, 0);
        } else {
          view.src = ready.prepared.url;
        }
      }
    }

    function painted(layer) {
      var img = layer.querySelector("img");
      if (img) return !!img.getAttribute("src");
      // A canvas carries no src; treat a non-empty bitmap as painted.
      var canvas = layer.querySelector("canvas");
      if (!canvas || !canvas.width) return false;
      try {
        return canvas.getContext("2d").getImageData(0, 0, 1, 1).data[3] !== 0
          || canvas.getContext("2d").getImageData(0, 0, 1, 1).data[0] !== 0;
      } catch (error) { return true; }
    }

    function start() {
      if (disposed || state.busy || !state.ready || state.ready.src !== state.requested) return;
      var ready = state.ready;
      state.ready = null;
      var previous = state.layers[state.front];
      if (!painted(previous) || reducedMotion.matches) {
        assign(previous, ready);
        container.dataset.kabiCoverState = "idle";
        container.dataset.kabiCoverSrc = ready.src;
        if (onReady) onReady(ready.image);
        return;
      }
      state.busy = true;
      var nextIndex = 1 - state.front;
      var next = state.layers[nextIndex];
      // A hidden page gets no rAF, so a rAF-driven crossfade would strand the visible
      // layer on the previous cover. Swap in place and keep the state machine moving.
      if (document.hidden) {
        assign(previous, ready);
        next.style.transition = "none";
        next.style.opacity = "0";
        state.busy = false;
        if (onReady) onReady(ready.image);
        container.dataset.kabiCoverSrc = ready.src;
        container.dataset.kabiCoverState = state.requested === ready.src ? "idle" : "loading";
        start();
        return;
      }
      // The incoming layer must be above the outgoing layer in both directions.
      previous.style.zIndex = "0";
      next.style.zIndex = "1";
      next.style.transition = "none";
      next.style.opacity = "0";
      assign(next, ready);
      state.frame = requestAnimationFrame(function () {
        state.frame = requestAnimationFrame(function () {
          if (disposed) return;
          if (onReady) onReady(ready.image);
          container.dataset.kabiCoverState = "fading";
          next.style.transition = "opacity " + duration + "ms ease";
          next.style.opacity = "1";
          state.timer = setTimeout(function () {
            if (disposed) return;
            previous.style.transition = "none";
            previous.style.opacity = "0";
            state.front = nextIndex;
            state.busy = false;
            container.dataset.kabiCoverSrc = ready.src;
            container.dataset.kabiCoverState = state.requested === ready.src ? "idle" : "loading";
            start();
          }, duration + 40);
        });
      });
    }
  }

  function syncCover() {
    var bg = ensureBg();
    var img = coverImg();
    if (!bg || !img) return;
    var src = img.src || img.currentSrc || "";
    if (src) blendCover(bg, src, ".zoom", 500, sampleColor);
  }

  function pin(el, x, y, w, h) {
    function set(name, value) {
      if (el.style.getPropertyValue(name) !== value || el.style.getPropertyPriority(name) !== "important") {
        el.style.setProperty(name, value, "important");
      }
    }
    var pixel = window.devicePixelRatio || 1;
    function snap(value) { return Math.round(value * pixel) / pixel + "px"; }
    set("position", "fixed"); set("left", snap(x)); set("top", snap(y));
    set("width", snap(w)); set("max-width", snap(w)); set("margin", "0px"); set("z-index", "20");
    ["height", "min-height", "max-height"].forEach(function (name) {
      if (h == null) { if (el.style.getPropertyValue(name)) el.style.removeProperty(name); }
      else set(name, snap(h));
    });
  }

  // The host asks NetEase's image service for a 390px thumbnail, because the vinyl disc it
  // normally draws is small. The Now Playing artwork is 309 CSS pt, i.e. 618 device px on this
  // 2x display, so the host URL was being upscaled 1.6x and read soft. Measured against the
  // live CDN: thumbnail=390y390 -> 390x390, thumbnail=618y618 -> 620x620, and param=618y618
  // -> the stored 1500x1500 original, which is what a Now Playing view should be showing. The
  // query cannot simply be dropped -- the same URL with no parameters fails to load -- so only
  // the thumbnail/param pair is swapped and the rest is left alone. Backdrop art is left on
  // the host URL on purpose: it is convolved down to BACKDROP.size (256) with a 16px blur,
  // where a 390px source is already more than the raster can carry.
  var ART_PIXELS = 618;
  function artworkUrl(src) {
    if (!src || !/[?&](thumbnail|param)=/.test(src)) return src || "";
    return src.replace(/([?&])(?:thumbnail|param)=\d+y\d+/g, "$1param=" + ART_PIXELS + "y" + ART_PIXELS);
  }

  function ensureArt() {
    if (!cfg.artwork) return;
    var art = document.getElementById("kabi-art");
    var root = document.getElementById("vinyl-page-container");
    if (!art) {
      art = document.createElement("div");
      art.id = "kabi-art";
      art.innerHTML = "<img alt=''>";
    }
    if (root && art.parentNode !== root) root.appendChild(art);
    var src = coverImg();
    var view = art.querySelector("img");
    var url = artworkUrl(src ? (src.src || src.currentSrc || "") : "");
    if (!art.querySelector(".art-layer")) {
      art.innerHTML = "<div class='art-layer'><img alt=''></div><div class='art-layer' style='opacity:0'><img alt=''></div>";
    }
    if (!art.querySelector(".art-shadow")) {
      art.insertAdjacentHTML("afterbegin", "<div class='art-shadow shadow-paused'></div><div class='art-shadow shadow-expanded'></div>");
    }
    art.style.setProperty("--kabi-hairline", (1 / (window.devicePixelRatio || 1)) + "px");
    if (url) blendCover(art, url, ".art-layer", 600);
    return art;
  }

  function buttonOf(selector) {
    var list = document.querySelectorAll(selector);
    var fallback = null;
    for (var i = 0; i < list.length; i++) {
      var item = list[i].closest("button") || list[i];
      var hidden = getComputedStyle(item).display === "none";
      var keys = Object.keys(item);
      var live = false;
      for (var k = 0; k < keys.length; k++) {
        if (keys[k].indexOf("__react") === 0) { live = true; break; }
      }
      if (!hidden && live) return item;
      if (!hidden && !fallback) fallback = item;
      if (!fallback) fallback = item;
    }
    return fallback;
  }

  // Borrow the original React trigger rather than proxy-clicking a hidden one. Its popup
  // reference, accessibility state, keyboard handling and entitlement checks stay native.
  function borrowControl(el, slot, kind) {
    if (!el || !slot) return null;
    if (el.parentNode === slot) return el;
    if (!el._kabiControlHome) {
      el._kabiControlHome = { parent: el.parentNode, next: el.nextSibling,
        role: el.getAttribute("data-role"), label: el.getAttribute("aria-label") };
      borrowedControls_.add(el);
    }
    el.setAttribute("data-kabi-native", kind);
    if (kind === "more") {
      el.setAttribute("data-role", "more");
      el.setAttribute("aria-label", "更多");
      el.style.setProperty("--kabi-more-icon", 'url("data:image/svg+xml,' + encodeURIComponent(ICONS.more.replace("<svg ", '<svg xmlns="http://www.w3.org/2000/svg" ')) + '")');
    }
    slot.appendChild(el);
    return el;
  }

  function playingMode() {
    var store = hostStore_ || queueStore();
    return store && store.getState().playing && store.getState().playing.playingMode;
  }

  function switchMode(role) {
    var store = hostStore_ || queueStore();
    if (!store) return;
    var current = playingMode(), next;
    if (role === "shuffle") {
      if (current === "playRandom") next = beforeShuffle_;
      else { beforeShuffle_ = /^(playOrder|playCycle|playOneCycle)$/.test(current) ? current : "playOrder"; next = "playRandom"; }
    } else {
      next = current === "playCycle" ? "playOneCycle" : current === "playOneCycle" ? "playOrder" : "playCycle";
    }
    // Exact host effect/enums from HOST-mode72.js at 3672180 and 805662. NetEase has
    // one mutually-exclusive mode, unlike Apple's orthogonal shuffle/repeat switches.
    // Do not merely cycle its combined icon; select the requested native state explicitly.
    store.dispatch({ type: "playing/switchPlayingMode", payload: {
      playingMode: next, triggerScene: "miniBar", HeartBeatFlage: false
    } });
    schedule("meta");
  }

  function fieldText(selector, prefix) {
    var el = document.querySelector(selector);
    if (!el) return "";
    return el.textContent.replace(prefix, "").replace(/\s+/g, " ").trim();
  }

  var ICONS = {
    shuffle: '<svg viewBox=\'0 0 297 237\'><path fill=\'currentColor\' fill-rule=\'evenodd\' d="M230.3 2.4L227.5 4.8 L227.2 21.9L226.9 39.0 L209.2 39.0C174.8 39.0 168.2 42.8 136.9 80.5C125.2 94.6 121.3 98.7 120.5 97.7C120.0 97.0 112.7 88.3 104.4 78.5C73.6 41.8 70.1 40.0 31.7 40.0C6.6 40.0 4.4 40.4 1.5 46.0C-1.2 51.1 -0.5 56.5 3.4 60.8L6.8 64.5 L29.2 65.0C50.6 65.5 51.7 65.7 57.2 68.2C60.4 69.7 65.3 73.0 68.1 75.7C72.1 79.4 95.9 107.0 103.7 117.1C104.8 118.4 102.9 121.2 90.9 135.6C61.1 171.3 59.9 172.0 27.2 172.0C12.0 172.0 8.3 172.3 6.0 173.6C-1.9 178.3 -2.1 190.0 5.6 195.1C8.2 196.8 10.4 197.0 30.7 197.0C55.0 197.0 60.3 196.3 69.8 191.8C78.3 187.8 86.2 180.1 104.2 158.5C112.5 148.6 119.8 139.9 120.4 139.3C121.3 138.3 124.7 141.8 135.0 154.3C159.2 183.4 166.1 189.6 179.8 194.8C186.0 197.2 188.1 197.4 206.7 197.8L226.9 198.2 L227.2 215.2L227.5 232.2 L230.3 234.6C232.4 236.4 234.3 237.0 237.5 237.0C241.8 237.0 242.7 236.4 266.7 216.4C296.8 191.4 297.0 191.2 297.0 186.1C297.0 181.6 298.2 182.7 264.5 154.5C242.1 135.8 239.5 134.2 233.7 136.0C228.0 137.7 227.0 140.9 227.0 158.0L227.0 172.2 L208.8 171.8C191.3 171.5 190.3 171.4 185.0 168.8C178.2 165.4 171.4 158.6 152.7 136.1C140.4 121.3 138.3 118.4 139.3 117.0C140.0 116.1 147.3 107.3 155.6 97.5C181.8 66.3 183.7 65.1 210.2 64.3L227.0 63.7 L227.0 78.4C227.0 96.4 227.9 99.3 234.0 101.1C237.4 102.1 238.6 102.1 241.3 100.8C244.3 99.3 286.5 64.7 293.8 57.7C297.8 53.8 298.2 48.4 294.8 44.7C291.6 41.2 245.0 2.5 242.3 1.1C238.6 -0.8 233.4 -0.2 230.3 2.4Z"/></svg>',
    prev: '<svg viewBox=\'0 0 353 199\'><path fill=\'currentColor\' fill-rule=\'evenodd\' d="M151.5 1.2C147.9 2.6 11.8 82.2 7.2 85.7C-2.6 93.1 -2.5 105.8 7.3 113.2C11.4 116.3 145.1 194.7 150.5 197.1C161.2 202.0 173.0 196.9 176.0 186.2C176.6 184.0 177.0 167.7 177.0 144.9L177.0 107.3 L181.3 111.4C185.3 115.1 307.5 187.5 323.8 195.8C337.3 202.6 349.1 198.1 351.9 185.0C352.6 181.6 353.0 153.5 353.0 98.6C353.0 8.0 353.1 10.0 346.5 4.1C342.2 0.4 339.5 -0.4 332.6 0.2C327.7 0.6 321.4 4.1 256.4 42.1C213.5 67.2 183.9 85.1 181.3 87.5L177.1 91.6 L176.8 52.0C176.5 12.5 176.5 12.5 174.1 8.4C169.9 1.0 160.4 -2.0 151.5 1.2Z"/></svg>',
    play: '<svg viewBox=\'0 0 194 218\'><path fill=\'currentColor\' fill-rule=\'evenodd\' d="M8.6 2.3C6.1 3.7 3.8 6.2 2.3 8.9L0.0 13.3 L-0.0 108.8C-0.0 203.6 0.0 204.4 2.1 208.7C5.1 214.8 9.1 217.3 16.6 217.8C21.2 218.1 23.8 217.7 27.1 216.3C33.4 213.5 181.8 126.3 186.3 122.8C196.6 114.6 195.7 101.7 184.4 93.9C178.2 89.7 32.5 4.2 27.5 1.9C21.8 -0.7 13.5 -0.6 8.6 2.3Z"/></svg>',
    pause: '<svg viewBox=\'0 0 160 215\'><path fill=\'currentColor\' fill-rule=\'evenodd\' d="M8.2 1.6C6.4 2.5 3.9 4.7 2.7 6.4L0.5 9.5 L0.5 107.2L0.5 204.9 L2.6 207.7C7.3 214.0 9.4 214.5 32.5 214.5C55.6 214.5 57.7 214.0 62.4 207.7C64.5 204.9 64.5 204.7 64.8 108.4C65.1 1.5 65.4 7.6 58.6 2.7C55.7 0.6 54.4 0.5 33.5 0.2C14.7 0.0 11.0 0.2 8.2 1.6Z M103.4 1.4C99.5 3.1 96.3 7.2 95.0 12.1C94.3 14.6 94.0 47.7 94.2 109.7L94.5 203.5 L96.8 207.1C100.9 213.8 103.7 214.5 127.5 214.5C151.1 214.5 153.4 213.9 157.5 207.0C159.5 203.6 159.5 202.0 159.8 109.5C160.0 41.2 159.8 14.4 158.9 11.3C157.7 6.8 154.0 2.7 149.7 1.1C145.4 -0.6 107.3 -0.3 103.4 1.4Z"/></svg>',
    next: '<svg viewBox=\'0 0 353 199\'><path fill=\'currentColor\' fill-rule=\'evenodd\' d="M9.5 1.4C5.7 3.1 3.5 5.5 1.5 10.3C0.2 13.5 0.0 24.8 0.0 99.7C0.0 181.2 0.1 185.7 1.9 189.6C5.5 197.5 14.9 201.0 24.2 197.7C30.8 195.4 167.0 115.3 171.2 111.2L175.0 107.6 L175.0 143.2C175.0 162.8 175.4 181.1 176.0 184.0C178.6 197.9 190.3 202.8 204.2 195.8C220.3 187.6 342.7 115.1 346.6 111.5C353.7 104.8 354.4 96.2 348.4 89.1C345.1 85.2 341.1 82.7 264.5 37.9L200.6 0.5 L194.0 0.2C188.5 -0.1 187.0 0.2 184.1 2.2C175.5 8.0 175.0 11.1 175.0 55.7L175.0 91.2 L170.2 87.0C165.9 83.1 39.0 8.0 27.5 2.4C21.8 -0.3 14.3 -0.7 9.5 1.4Z"/></svg>',
    repeat: '<svg viewBox=\'0 0 275 234\'><path fill=\'currentColor\' fill-rule=\'evenodd\' d="M99.0 1.7C93.1 5.8 47.8 44.4 46.4 46.6C45.3 48.2 45.0 50.1 45.4 52.4C46.0 55.3 49.5 58.6 72.1 77.6C86.4 89.7 99.6 100.1 101.3 100.8C105.4 102.6 110.4 101.5 113.0 98.3C114.8 96.0 115.0 94.3 115.0 79.4L115.0 63.0 L163.8 63.0C192.2 63.0 215.2 63.4 219.0 64.0C227.9 65.4 235.0 69.1 240.4 75.1C246.5 81.9 248.1 87.1 248.7 101.5C249.3 114.9 250.4 118.0 255.3 121.0C261.5 124.8 270.1 122.5 273.5 116.1C275.5 112.2 275.5 91.2 273.5 81.7C269.1 60.8 253.8 45.8 230.9 39.9C222.9 37.8 220.0 37.7 168.8 37.3L115.0 36.8 L115.0 20.9C115.0 5.3 114.9 4.9 112.5 2.5C109.6 -0.5 102.8 -0.9 99.0 1.7Z M7.3 111.9C0.5 115.1 -0.3 117.6 0.2 135.9C0.6 148.8 1.0 152.6 2.9 157.9C7.6 171.4 16.8 181.8 29.5 188.0C44.7 195.5 43.0 195.4 104.8 195.8L160.0 196.1 L160.0 212.4C160.0 228.1 160.1 228.7 162.3 230.8C165.1 233.5 169.7 234.5 173.1 233.2C176.7 231.8 227.2 189.3 228.9 186.2C231.8 180.8 230.3 179.0 201.2 154.8C174.5 132.4 173.9 132.0 169.5 132.0C166.0 132.0 164.3 132.6 162.5 134.5C160.0 136.9 160.0 137.2 160.0 153.5L160.0 170.0 L108.2 170.0C52.5 170.0 50.5 169.8 41.6 164.6C30.8 158.3 27.0 150.5 26.1 132.4C25.6 122.5 25.0 118.7 23.7 116.7C19.9 110.9 13.6 109.1 7.3 111.9Z"/></svg>',
    repeat1: '<svg viewBox=\'0 0 276 237\'><path fill=\'currentColor\' fill-rule=\'evenodd\' d="M99.0 1.7C93.7 5.3 48.0 44.1 46.6 46.2C44.7 48.9 44.6 51.0 46.1 54.3C47.4 57.3 96.9 98.9 101.3 100.8C105.4 102.6 110.4 101.5 113.0 98.3C114.8 96.0 115.0 94.3 115.0 79.4L115.0 63.0 L163.8 63.0C192.2 63.0 215.2 63.4 219.0 64.0C227.9 65.4 235.0 69.1 240.4 75.1C246.5 81.9 248.1 87.1 248.7 101.5C249.3 114.9 250.4 118.0 255.3 121.0C261.5 124.8 270.1 122.5 273.5 116.1C275.5 112.2 275.5 91.2 273.5 81.7C269.1 60.8 253.8 45.8 230.9 39.9C222.9 37.8 220.0 37.7 168.8 37.3L115.0 36.8 L115.0 20.9C115.0 5.3 114.9 4.9 112.5 2.5C109.6 -0.5 102.8 -0.9 99.0 1.7Z M7.3 111.9C0.5 115.1 -0.3 117.6 0.2 135.9C0.6 148.8 1.0 152.6 2.9 157.9C7.6 171.4 16.8 181.8 29.5 188.0C44.1 195.2 44.9 195.3 89.2 195.8L129.0 196.1 L129.0 210.6C129.0 228.3 129.9 231.3 136.0 233.1C141.9 234.9 143.4 233.9 169.1 212.5C199.0 187.4 199.0 187.4 199.0 182.9C199.0 177.9 198.7 177.6 169.1 153.0C144.7 132.8 143.5 132.0 139.4 132.0C136.3 132.0 134.3 132.7 132.3 134.4L129.5 136.8 L129.2 153.4L128.9 170.0 L92.7 170.0C53.7 170.0 50.1 169.6 41.6 164.6C30.8 158.3 27.0 150.5 26.1 132.4C25.6 122.5 25.0 118.7 23.7 116.7C19.9 110.9 13.6 109.1 7.3 111.9Z M257.0 149.3C255.1 150.0 252.6 152.0 251.3 153.9C249.0 157.2 249.0 157.8 249.0 185.3C249.0 212.6 249.0 213.2 247.1 211.9C246.0 211.1 242.4 208.4 239.0 205.8C232.0 200.4 228.0 199.7 223.6 203.1C220.4 205.6 220.0 211.6 222.8 214.8C225.2 217.6 244.8 232.3 249.0 234.6C251.4 235.8 254.7 236.4 259.2 236.5C266.7 236.5 270.0 234.8 273.5 228.9C275.4 225.7 275.5 223.7 275.5 192.0C275.5 153.8 275.4 153.0 268.6 149.9C263.9 147.8 261.8 147.7 257.0 149.3Z"/></svg>',
    star: '<svg viewBox=\'0 0 282 270\'><path fill=\'currentColor\' fill-rule=\'evenodd\' d="M55.3 2.0C53.5 3.0 51.4 5.3 50.5 6.9C47.3 13.2 48.3 17.6 62.5 59.8C69.9 81.9 76.0 100.1 76.0 100.4C76.0 100.7 60.1 112.4 40.6 126.4C2.5 153.9 0.7 155.6 0.7 163.7C0.7 168.8 3.0 172.5 8.1 175.5C11.3 177.4 13.8 177.5 56.4 178.0L101.3 178.5 L114.0 218.8C121.8 243.3 127.8 260.6 129.4 263.0C136.7 274.0 150.1 271.6 155.8 258.1C156.9 255.6 163.1 236.5 169.6 215.8L181.5 178.0 L225.5 178.0C266.7 178.0 269.8 177.8 273.7 176.0C281.0 172.7 284.1 164.0 280.6 157.1C278.3 152.7 273.6 149.0 238.8 124.1L206.2 100.6 L219.6 61.3C226.9 39.6 233.2 19.7 233.6 17.1C234.9 7.2 229.1 0.0 219.7 0.0C213.9 0.0 210.7 2.0 174.0 29.1C157.2 41.5 143.0 51.9 142.3 52.3C141.6 52.8 127.8 43.3 107.0 27.9C88.2 14.1 71.3 2.2 69.4 1.4C64.7 -0.6 59.1 -0.3 55.3 2.0Z M114.9 62.2C128.7 72.9 137.7 79.2 139.7 79.6C144.1 80.4 145.2 79.7 174.1 57.4C187.5 47.0 200.2 37.2 202.3 35.6L206.0 32.7 L199.9 50.1C183.3 97.3 181.0 104.4 181.0 106.9C181.0 108.5 182.0 110.8 183.2 112.1C184.5 113.5 198.6 123.5 214.5 134.4C230.4 145.3 243.9 154.7 244.5 155.2C245.1 155.8 230.9 155.8 206.8 155.4L168.2 154.7 L165.3 157.6C162.9 160.1 160.9 165.8 152.0 196.2C146.3 215.9 141.5 231.8 141.3 231.6C141.1 231.4 136.7 216.7 131.5 198.9C126.2 181.1 121.3 164.6 120.4 162.2C117.5 154.4 118.8 154.6 75.9 155.4C55.1 155.8 38.0 155.9 38.0 155.7C38.0 155.4 51.3 146.1 67.6 134.9C96.7 114.9 102.0 110.6 102.0 107.0C102.0 106.0 96.4 89.1 89.5 69.6C82.6 50.0 77.0 33.7 77.0 33.4C77.0 33.1 80.7 35.7 85.2 39.2C89.6 42.7 103.0 53.0 114.9 62.2Z"/></svg>',
    starFill: '<svg viewBox=\'0 0 282 270\'><path fill=\'currentColor\' fill-rule=\'evenodd\' d="M55.3 2.0C53.5 3.0 51.4 5.3 50.5 6.9C47.3 13.2 48.3 17.6 62.5 59.8C69.9 81.9 76.0 100.1 76.0 100.4C76.0 100.7 60.1 112.4 40.6 126.4C2.5 153.9 0.7 155.6 0.7 163.7C0.7 169.2 3.1 172.7 9.0 175.8C13.4 178.0 13.8 178.0 57.1 178.0L100.9 178.0 L107.4 198.5C111.0 209.8 116.9 228.2 120.5 239.4C127.5 261.1 130.4 266.7 135.9 269.0C142.7 271.8 150.7 268.2 154.8 260.5C155.7 258.9 162.1 239.7 169.0 218.0L181.6 178.5 L226.6 178.0C267.4 177.5 271.8 177.3 274.8 175.7C281.2 172.2 283.9 163.6 280.6 157.1C278.3 152.7 273.6 149.0 238.8 124.1L206.2 100.6 L219.6 61.3C226.9 39.6 233.2 19.7 233.6 17.1C234.9 7.2 229.1 0.0 219.7 0.0C213.9 0.0 210.7 2.0 174.0 29.1C157.2 41.5 143.0 51.9 142.3 52.3C141.6 52.8 127.8 43.3 107.0 27.9C88.2 14.1 71.3 2.2 69.4 1.4C64.7 -0.6 59.1 -0.3 55.3 2.0Z"/></svg>',
    more: '<svg viewBox=\'0 0 239 52\'><path fill=\'currentColor\' fill-rule=\'evenodd\' d="M14.2 2.6C-1.0 10.2 -4.9 29.9 6.3 42.6C13.5 50.8 22.3 53.5 32.4 50.6C54.6 44.1 57.5 12.9 36.8 2.6C29.6 -1.0 21.4 -1.0 14.2 2.6Z M108.5 2.4C99.2 6.7 93.9 15.1 93.8 25.5C93.7 35.7 98.3 43.7 106.8 48.3C117.4 54.1 128.6 52.5 137.0 44.1C147.7 33.4 147.5 18.1 136.5 7.3C128.5 -0.5 118.4 -2.3 108.5 2.4Z M204.0 1.3C198.1 3.2 190.4 11.6 188.5 18.3C183.1 37.2 199.5 55.4 218.3 51.1C238.9 46.4 245.5 20.3 229.5 6.2C222.8 0.3 213.0 -1.6 204.0 1.3Z"/></svg>',
  };

  var STAR_OUTLINE = 'data:image/png;base64,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';
  var STAR_FILL = 'data:image/png;base64,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';

  function ensureStack() {
    var root = document.getElementById("vinyl-page-container");
    if (!root) return null;
    var stray = document.getElementById("kabi-times");
    if (stray && !stray.closest("#kabi-stack")) stray.remove();
    var stack = document.getElementById("kabi-stack");
    if (!stack) {
      stack = document.createElement("div");
      stack.id = "kabi-stack";
      stack.innerHTML = [
        "<div class='head'><div class='names'><b></b><span></span></div><div class='tools'></div></div>",
        "<div class='bar'></div>",
        "<div id='kabi-times'><span class='elapsed'></span><span class='quality'></span><span class='remain'></span></div>",
        "<div id='kabi-transport'>",
        "<button type='button' data-role='shuffle' aria-label='随机'></button>",
        "<button type='button' data-role='prev' aria-label='上一首'></button>",
        "<button type='button' class='play' data-role='play' aria-label='播放'></button>",
        "<button type='button' data-role='next' aria-label='下一首'></button>",
        "<button type='button' data-role='repeat' aria-label='循环'></button>",
        "</div>"
      ].join("");
      root.appendChild(stack);
    }
    if (stack.getAttribute("data-icons") !== "sf2") {
      var fresh = stack.cloneNode(true);
      if (stack.parentNode) stack.replaceWith(fresh);
      stack = fresh;
      stack._icons = ICONS;

      stack.querySelector("[data-role='shuffle']").innerHTML = ICONS.shuffle;
      ensureSkipGlyph(stack.querySelector("[data-role='prev']"));
      ensureSkipGlyph(stack.querySelector("[data-role='next']"));
      stack.querySelector("[data-role='play']").innerHTML = ICONS.play;
      stack.querySelector("[data-role='repeat']").innerHTML = ICONS.repeat;
      stack.setAttribute("data-icons", "sf2");
      stack.addEventListener("click", function (event) {
        var qualityHit = event.target.closest("#kabi-times .quality");
        if (qualityHit) {
          var nativeQuality = qualityHit.querySelector("[data-kabi-native='quality']");
          if (nativeQuality && !nativeQuality.contains(event.target)) nativeQuality.click();
          return;
        }
        var button = event.target.closest("button");
        if (!button || !stack.contains(button)) return;
        if (button.getAttribute("data-kabi-native") === "more") return;
        var role = button.getAttribute("data-role");
        var target = null;
        if (role === "shuffle" || role === "repeat") { switchMode(role); return; }
        // Transport goes through the host's command layer now, not through .click() on its own
        // hidden buttons.  Clicking them worked, but it bound us to NetEase's CSS class names and
        // Chinese button titles, which are presentation and change between releases; the dva
        // actions above are the model's own contract.  star and more still click through, because
        // those have no action of their own -- they open host UI, which is what they should do.
        if (role === "prev") { if (jumpTrack(-1)) { animateSkipGlyph(button, role); return; } }
        if (role === "next") { if (jumpTrack(1)) { animateSkipGlyph(button, role); return; } }
        if (role === "play") { if (togglePlay()) return; }
        if (role === "star") target = buttonOf("[data-testid='tid_redstar_btn']");
        if (role === "more") target = buttonOf("[title='更多操作']");
        if (target) target.click();
      });
    }
    stack._icons = ICONS;
    var title = document.querySelector("[class*='TrackTitleContainer'] .title");
    var titleText = title ? (title.getAttribute("title") || title.textContent).replace(/\s+/g, " ").trim() : "";
    var artist = fieldText(".info.artist", /^歌手[:：]\s*/);
    var album = fieldText(".info.album", /^专辑[:：]\s*/);
    var sub = artist && album ? artist + " — " + album : (artist || album);
    var name = stack.querySelector(".names b");
    var line = stack.querySelector(".names span");
    if (name.textContent !== titleText) name.textContent = titleText;
    if (line.textContent !== sub) line.textContent = sub;
    var tools = stack.querySelector(".tools");
    if (!stack.querySelector("[data-role='star']")) {
      var star = document.createElement("button");
      star.type = "button";
      star.setAttribute("data-role", "star");
      star.setAttribute("aria-label", "喜欢");
      tools.insertBefore(star, tools.firstChild);
    }
    var strayBtns = tools.querySelectorAll("button:not([data-role])");
    for (var s = 0; s < strayBtns.length; s++) strayBtns[s].remove();
    var starBtn = stack.querySelector("[data-role='star']");
    var likeBtn = buttonOf("[data-testid='tid_redstar_btn']");
    var likeIcon = likeBtn && likeBtn.querySelector("[class*='cmd-icon']");
    var liked = !!(likeIcon && /red/.test(String(likeIcon.className)));
    var starKind = liked ? "on" : "off";
    if (starBtn && (starBtn.getAttribute("data-icon") !== starKind || !starBtn.querySelector("i"))) {
      var previous = starBtn.getAttribute("data-icon");
      starBtn.innerHTML = "<i></i>";
      starBtn.querySelector("i").style.webkitMaskImage = "url(" + (liked ? STAR_FILL : STAR_OUTLINE) + ")";
      starBtn.setAttribute("data-icon", starKind);
      if (previous && previous !== starKind) {
        starBtn.classList.remove("pop");
        void starBtn.offsetWidth;
        starBtn.classList.add("pop");
      }
    }
    var nativeMore = root.querySelector(".page-footer [data-minibar-more-button]");
    if (nativeMore) {
      var previousMore = tools.querySelector("[data-role='more']");
      if (previousMore && previousMore !== nativeMore) {
        borrowedControls_.delete(previousMore);
        delete previousMore._kabiControlHome;
        previousMore.remove();
      }
      borrowControl(nativeMore, tools, "more");
    } else if (!stack.querySelector("[data-role='more']")) {
      var moreBtn = document.createElement("button");
      moreBtn.type = "button";
      moreBtn.setAttribute("data-role", "more");
      moreBtn.setAttribute("aria-label", "更多");
      moreBtn.innerHTML = ICONS.more;
      tools.appendChild(moreBtn);
    }
    var slot = stack.querySelector(".bar");
    var sliders = [].slice.call(document.querySelectorAll(".slider-vinyl"));
    var fresh = null;
    for (var n = 0; n < sliders.length; n++) {
      if (!slot.contains(sliders[n])) fresh = sliders[n];
    }
    var slider = fresh || sliders[sliders.length - 1] || null;
    for (var m = 0; m < sliders.length; m++) {
      if (sliders[m] !== slider) sliders[m].remove();
    }
    if (slider && slider.parentNode !== slot) {
      // This is the live React-owned seek control, not a clone. Record its exact home before
      // borrowing it; removing #kabi-stack on a version change otherwise deletes the only
      // slider (observed v70 -> v71: 1 -> 0 controls, empty elapsed/remaining labels).
      slider._kabiHome = { parent: slider.parentNode, next: slider.nextSibling };
      slot.appendChild(slider);
    }
    var holder = stack.querySelector(".quality");
    // There are two host quality components: minibar and vinyl. Their visible conditions
    // are opposite (HOST-quality72.js: visible=D && isVinylOpened!==isDefaultMiniBar).
    // A global query can borrow the minibar's live-looking but permanently hidden popup.
    var quality = root.querySelector(".page-footer [title='音质']") || holder.querySelector("[title='音质']");
    if (quality) {
      // Opening the vinyl view remounts this host component. A borrowed node can remain
      // connected to our slot after its React fiber is unmounted; replace it, do not append
      // a second label or retain a dead onClick closure across entries.
      holder.querySelectorAll("[data-kabi-native='quality']").forEach(function (previous) {
        if (previous !== quality) {
          borrowedControls_.delete(previous);
          delete previous._kabiControlHome;
          previous.remove();
        }
      });
      var qualityLabel = holder.querySelector("i");
      if (qualityLabel) qualityLabel.remove();
      borrowControl(quality, holder, "quality");
    } else if (!holder.firstChild) {
      holder.appendChild(document.createElement("i"));
    }
    var modeName = playingMode();
    var shuffleBtn = stack.querySelector("[data-role='shuffle']");
    shuffleBtn.classList.toggle("on", modeName === "playRandom");
    shuffleBtn.setAttribute("aria-pressed", String(modeName === "playRandom"));
    shuffleBtn.setAttribute("aria-label", modeName === "playRandom" ? "关闭随机播放" : "开启随机播放");
    var repeatBtn = stack.querySelector("[data-role='repeat']");
    var repeatKind = modeName === "playOneCycle" ? "one" : "all";
    if (repeatBtn.getAttribute("data-icon") !== repeatKind) {
      repeatBtn.innerHTML = repeatKind === "one" ? ICONS.repeat1 : ICONS.repeat;
      repeatBtn.setAttribute("data-icon", repeatKind);
    }
    var repeatOn = modeName === "playCycle" || modeName === "playOneCycle";
    repeatBtn.classList.toggle("on", repeatOn);
    repeatBtn.setAttribute("aria-pressed", String(repeatOn));
    repeatBtn.setAttribute("aria-label", modeName === "playOneCycle" ? "单曲循环；点击关闭" : modeName === "playCycle" ? "列表循环；点击单曲循环" : "开启列表循环");
    var playing = isPlaying();
    var play = stack.querySelector("[data-role='play']");
    syncPlayGlyph(play, playing ? "pause" : "play");
    return stack;
  }


  // v87 — visually reconstructed from APPLE-TRANSPORT87.mov, NOT extracted Apple code.
  // Source: Apple Music play<->pause AXPress; initial/final Play restored. 2 device px/pt.
  // Irregular presentation samples (16.7–41.7ms), not a120fps timing claim. Tables replay
  // measured relative scale/alpha; max incoming scale1.09; settled sample at550ms.
  // Two-template least-squares fit: TRANSPORT87-FIT.json. Faint/occluded-layer scale is
  // unobservable below .025 alpha, so hidden values are normalised rather than invented.
  // This is shrink/replace/overshoot, not a path morph. Keep the actual host action intact.
  var TRANSPORT_REPLACE = {"pause":[[0,1,1,0.1,0],[16.666,0.74,0.735,0.1,0],[33.333,0.57,0.574,0.16,0.05],[50.0,0.41,0.436,0.24,0.117],[66.666,0.3,0.255,0.35,0.289],[83.333,0.21,0.179,0.43,0.447],[100.0,0.14,0.071,0.53,0.531],[125.0,0.1,0,0.68,0.645],[141.666,0.1,0,0.76,0.732],[158.333,0.1,0,0.83,0.825],[183.333,0.1,0,0.92,0.92],[200.0,0.1,0,0.97,0.971],[216.666,0.1,0,1.01,1],[241.666,0.1,0,1.05,1],[258.333,0.1,0,1.07,1],[275.0,0.1,0,1.08,1],[291.666,0.1,0,1.09,1],[316.666,0.1,0,1.09,1],[333.333,0.1,0,1.09,1],[358.333,0.1,0,1.08,1],[375.0,0.1,0,1.07,1],[400.0,0.1,0,1.06,1],[416.666,0.1,0,1.04,1],[433.333,0.1,0,1.04,1],[450.0,0.1,0,1.03,1],[466.666,0.1,0,1.02,1],[483.333,0.1,0,1.02,1],[500.0,0.1,0,1.01,1],[516.666,0.1,0,1.01,0.998],[533.333,0.1,0,1.0,1],[550.0,0.1,0,1,1]],"play":[[0,0.1,0,1,1],[16.667,0.1,0,0.9,0.891],[33.334,0.1,0,0.73,0.695],[50.0,0.59,0.034,0.56,0.527],[66.667,0.25,0.164,0.41,0.412],[91.667,0.4,0.339,0.25,0.143],[108.334,0.49,0.413,0.17,0.087],[125.0,0.59,0.472,0.12,0.052],[141.667,0.68,0.534,0.1,0],[158.334,0.76,0.589,0.1,0],[175.0,0.84,0.638,0.1,0],[200.0,0.93,0.703,0.1,0],[216.667,0.97,0.752,0.1,0],[233.334,1.01,0.783,0.1,0],[258.334,1.05,0.831,0.1,0],[275.0,1.07,0.854,0.1,0],[291.667,1.08,0.877,0.1,0],[308.334,1.09,0.893,0.1,0],[333.334,1.09,0.918,0.1,0],[350.0,1.08,0.934,0.1,0],[366.667,1.08,0.943,0.1,0],[383.334,1.07,0.953,0.1,0],[400.0,1.06,0.962,0.1,0],[425.0,1.05,0.967,0.1,0],[441.667,1.04,0.977,0.1,0],[458.334,1.04,0.969,0.1,0],[475.0,1.03,0.975,0.1,0],[491.667,1.02,0.984,0.1,0],[508.334,1.01,0.985,0.1,0],[533.334,1.0,0.982,0.1,0],[550.0,1,1,0.1,0]]};

  // v89: three-arrow hand-off, sampled separately for next and previous by native AXPress.
  // APPLE-SKIP88.mov + SKIP88-FIT.json:234 presented frames; irregular16.7–50ms gaps.
  // [ms, incoming(tx,scale,alpha), middle(...), outgoing(...)], x in painted points.
  // The incoming grows, the middle translates one slot, the outgoing shrinks. Previous
  // mirrors the canonical geometry but uses its independently sampled timing, not a guess.
  // Existing reconstructed play contour reused; no Apple vector/binary asset redistributed.
  var SKIP_REPLACE = {"next":[[0,-8.25,0,0,0,1,1,16.5,1,1],[50.0,-3.5,0.1,0.657,0.75,1.0,1,16.85,0.769,0.779],[66.666,-8.3,0.105,0.369,2.0,1.0,1,17.7,0.599,0.599],[83.333,-7.8,0.211,0.535,3.4,0.99,1,18.85,0.451,0.447],[100.0,-6.8,0.306,0.654,4.95,1.0,1,20.35,0.316,0.328],[125.0,-5.35,0.464,0.784,7.5,1.0,1,22.7,0.168,0.196],[141.666,-4.4,0.559,0.854,9.05,1.0,1,24.7,0,0],[158.333,-3.4,0.652,0.905,10.6,1.0,1,24.7,0,0],[175.0,-2.7,0.74,0.94,12.0,1.0,1,24.7,0,0],[191.666,-1.983,0.807,0.97,13.1,1.0,1,24.7,0,0],[216.666,-0.983,0.907,0.96,14.75,1.0,0.99,24.7,0,0],[233.333,-0.567,0.963,0.97,15.55,1.0,1,24.7,0,0],[250.0,0.0,1.0,0.98,16.2,1.0,0.98,24.7,0,0],[266.666,0.3,1.03,0.99,16.65,1.0,0.99,24.7,0,0],[283.333,0.6,1.06,0.99,17.1,1.0,0.99,24.7,0,0],[300.0,0.6,1.07,1,17.25,1.0,0.99,24.7,0,0],[316.666,0.6,1.07,1,17.55,1.0,0.99,24.7,0,0],[333.333,0.6,1.07,1,17.55,1.0,0.99,24.7,0,0],[350.0,0.6,1.07,1,17.55,1.0,0.99,24.7,0,0],[366.666,0.6,1.07,1,17.55,1.0,0.99,24.7,0,0],[383.333,0.6,1.07,1,17.55,1.0,1,24.7,0,0],[400.0,0.6,1.07,1,17.25,1.0,0.99,24.7,0,0],[416.666,0.6,1.07,0.99,17.25,1.0,0.99,24.7,0,0],[441.666,0.6,1.06,0.99,17.1,1.0,0.99,24.7,0,0],[458.333,0.3,1.04,1,16.95,1.0,1,24.7,0,0],[475.0,0.3,1.04,1,16.8,1.0,1,24.7,0,0],[491.666,0.15,1.02,1,16.65,1.0,0.99,24.7,0,0],[508.333,0.0,1.0,1,16.5,1.0,1,24.7,0,0],[525.0,0.0,1.0,1,16.5,1.0,1,24.7,0,0],[541.666,0.0,1.0,1,16.2,1.0,0.99,24.7,0,0],[558.333,0.0,1.0,1,16.2,1.0,0.99,24.7,0,0],[575.0,0.0,1.0,1,16.2,1.0,0.99,24.7,0,0],[600.0,-0.15,1.0,0.99,16.05,1.0,1,24.7,0,0],[616.666,-0.3,1.0,0.98,16.05,1.0,1,24.7,0,0],[633.333,-0.3,1.0,0.98,16.05,1.0,1,24.7,0,0],[650.0,-0.3,1.0,0.98,16.05,1.0,0.99,24.7,0,0],[666.666,-0.3,1.0,0.98,16.05,1.0,0.99,24.7,0,0],[683.333,-0.3,1.0,0.99,16.05,1.0,0.99,24.7,0,0],[700.0,0,1,1,16.5,1,1,33,0,0]],"prev":[[0,-8.25,0,0,0,1,1,16.5,1,1],[16.666,-6.434,0,0,0.35,1.0,1,16.55,0.915,0.887],[33.333,-4.667,0.273,0.208,1.3,1.0,1,17.1,0.747,0.726],[50.0,-11.15,0.148,0.459,2.4,1.0,1,18.15,0.569,0.55],[75.0,-9.35,0.283,0.73,4.65,1.0,1,20.05,0.352,0.336],[91.666,-7.95,0.378,0.824,6.35,1.0,1,21.55,0.251,0.227],[108.333,-6.6,0.484,0.879,7.9,1.0,1,22.983,0.167,0.157],[125.0,-5.35,0.579,0.932,9.45,1.0,1,24.523,0.108,0.108],[141.666,-4.2,0.674,0.942,11.0,1.0,1,24.4,0,0],[166.666,-2.6,0.789,0.99,12.95,1.0,0.99,24.4,0,0],[183.333,-1.7,0.852,1,14.2,1.0,1,24.4,0,0],[200.0,-0.95,0.92,1,15.15,1.0,1,24.4,0,0],[216.666,-0.384,0.967,1,15.8,1.0,1,24.4,0,0],[233.333,0.183,1.003,0.99,16.45,1.0,0.99,24.4,0,0],[250.0,0.6,1.04,1,16.95,1.0,0.99,24.4,0,0],[266.666,0.9,1.06,1,17.4,1.0,0.99,24.4,0,0],[283.333,1.1,1.07,1,17.7,1.0,1,24.4,0,0],[300.0,1.1,1.08,1,17.7,1.0,1,24.4,0,0],[325.0,1.25,1.09,0.99,17.85,1.0,0.99,24.4,0,0],[341.666,1.25,1.09,0.99,17.7,1.0,1,24.4,0,0],[358.333,1.1,1.08,1,17.7,1.0,1,24.4,0,0],[375.0,1.1,1.07,1,17.7,1.0,0.99,24.4,0,0],[391.666,0.9,1.07,0.99,17.4,1.0,0.99,24.4,0,0],[408.333,0.9,1.06,0.99,17.25,1.0,1,24.4,0,0],[425.0,0.75,1.05,1,17.25,1.0,1,24.4,0,0],[441.666,0.6,1.04,1,16.95,1.0,0.99,24.4,0,0],[458.333,0.45,1.03,1,16.95,1.0,1,24.4,0,0],[475.0,0.45,1.02,1,16.8,1.0,1,24.4,0,0],[500.0,0.3,1.01,1,16.8,1.0,0.99,24.4,0,0],[516.666,0.3,1.01,1,16.5,1.0,0.99,24.4,0,0],[533.333,0.15,0.99,1,16.5,1.0,0.99,24.4,0,0],[550.0,0.0,1.0,0.99,16.35,1.0,0.99,24.4,0,0],[566.666,0.0,1.0,0.99,16.35,1.0,0.99,24.4,0,0],[583.333,0.0,1.0,0.98,16.35,1.0,0.99,24.4,0,0],[608.333,0.0,1.0,0.98,16.2,1.0,1,24.4,0,0],[633.333,0.0,1.0,0.98,16.2,1.0,1,24.4,0,0],[650.0,0.0,1.0,0.99,16.2,1.0,1,24.4,0,0],[666.666,0.0,1.0,0.99,16.2,1.0,1,24.4,0,0],[683.333,0,1,1,16.5,1,1,33,0,0]]};
  function settleSkipGlyph(button) {
    if (!button) return;
    button._kabiSkipRun = null;
    var nodes = button.querySelectorAll(".skip-glyph svg");
    [].forEach.call(nodes, function (node, i) {
      node.getAnimations().forEach(function (a) { a.cancel(); });
      node.style.opacity = i ? "1" : "0";
      node.style.transform = "translateX(" + (i === 2 ? 16.5 : i === 1 ? 0 : -8.25) + "px) scale(" + (i ? 1 : 0) + ")";
    });
  }
  function ensureSkipGlyph(button) {
    if (!button || button.querySelectorAll(".skip-glyph svg").length === 3) return;
    button.innerHTML = "<span class='skip-glyph' aria-hidden='true'>" + ICONS.play + ICONS.play + ICONS.play + "</span>";
    [].forEach.call(button.querySelectorAll("svg"), function (node) {
      node.setAttribute("aria-hidden", "true");
      node.setAttribute("focusable", "false");
      node.setAttribute("preserveAspectRatio", "none");
    });
    settleSkipGlyph(button);
  }
  function animateSkipGlyph(button, role) {
    ensureSkipGlyph(button);
    if (reducedMotion.matches) { settleSkipGlyph(button); return; }
    var nodes = button.querySelectorAll(".skip-glyph svg");
    if (!nodes.length || !nodes[0].animate) return;
    var rows = SKIP_REPLACE[role], duration = rows[rows.length - 1][0];
    var presentation = [].map.call(nodes, function (node) {
      var css = getComputedStyle(node), matrix = new DOMMatrixReadOnly(css.transform);
      return { x: matrix.e, scale: matrix.a, opacity: parseFloat(css.opacity) };
    });
    // Every accepted command executes immediately; fast presses replace the motion, not
    // the command. Carry current presentation to prevent a reset-to-rest flash or a queue
    // of stale effects. The measured single-press trajectory remains the normal case.
    [].forEach.call(nodes, function (node) { node.getAnimations().forEach(function (a) { a.cancel(); }); });
    var run = {};
    button._kabiSkipRun = run;
    var animations = [].map.call(nodes, function (node, i) {
      var col = 1 + i * 3, initial = rows[0];
      var frames = rows.map(function (row) {
        var u = row[0] / duration, tail = 1 - u;
        var x = row[col] + (presentation[i].x - initial[col]) * tail;
        var scale = Math.max(0, row[col + 1] + (presentation[i].scale - initial[col + 1]) * tail);
        var opacity = Math.max(0, Math.min(1, row[col + 2] + (presentation[i].opacity - initial[col + 2]) * tail));
        return { offset: u, opacity: opacity, transform: "translateX(" + x + "px) scale(" + scale + ")" };
      });
      return node.animate(frames, { duration: duration, easing: "linear" });
    });
    animations[0].onfinish = function () {
      if (!disposed && button._kabiSkipRun === run) settleSkipGlyph(button);
    };
  }

  function syncPlayGlyph(button, kind) {
    var previous = button.getAttribute("data-icon");
    button.setAttribute("aria-label", kind === "pause" ? "暂停" : "播放");
    var glyphs = button.querySelectorAll("svg[data-glyph]");
    if (glyphs.length !== 2) {
      button.innerHTML = ICONS.play + ICONS.pause;
      glyphs = button.querySelectorAll("svg");
      ["play", "pause"].forEach(function (name, i) {
        glyphs[i].setAttribute("data-glyph", name);
        glyphs[i].setAttribute("aria-hidden", "true");
        glyphs[i].setAttribute("focusable", "false");
        glyphs[i].setAttribute("preserveAspectRatio", "none");
      });
      previous = null; // First mount reflects host state immediately, never an entrance tween.
    }
    if (previous === kind && !reducedMotion.matches) return;
    var presentation = [].map.call(glyphs, function (node) {
      var style = getComputedStyle(node);
      return { opacity: style.opacity, transform: style.transform };
    });
    // Retarget rapid reversals from the current presentation, not a stale endpoint.
    [].forEach.call(glyphs, function (node) {
      node.getAnimations().forEach(function (a) { a.cancel(); });
    });
    button.setAttribute("data-icon", kind);
    [].forEach.call(glyphs, function (node, i) {
      var visible = node.getAttribute("data-glyph") === kind;
      node.style.opacity = visible ? "1" : "0";
      node.style.transform = "translate(-50%,-50%) scale(" + (visible ? 1 : .1) + ")";
      if (!previous || reducedMotion.matches || !node.animate) return;
      var samples = TRANSPORT_REPLACE[kind];
      var duration = samples[samples.length - 1][0];
      var frames = samples.map(function (row) {
        return { offset: row[0] / duration, opacity: row[2 + i * 2],
          transform: "translate(-50%,-50%) scale(" + row[1 + i * 2] + ")" };
      });
      frames[0].opacity = presentation[i].opacity;
      frames[0].transform = presentation[i].transform;
      node.animate(frames, { duration: duration, easing: "linear" });
    });
  }

  miniStyle.textContent += "\n/* Stage118: one rounded native quality panel; no copied selection or entitlement logic. */\nhtml.kabi-on .cmd-popover:has([data-testid=tid_soundquality_panel]),\nhtml.kabi-on .cmd-popover:has([data-testid=tid_soundquality_panel]) .cmd-popover-content{border-radius:20px!important;overflow:hidden!important;}\nhtml.kabi-on [data-testid=tid_soundquality_panel]{border-radius:20px!important;padding:16px!important;max-height:calc(100vh - 40px)!important;overflow-y:auto!important;box-sizing:border-box!important;}\nhtml.kabi-on [data-testid=tid_soundquality_panel] .part-item{border-radius:12px!important;}\nhtml.kabi-on .reapple-quality-toggle{border:0;border-radius:999px;padding:5px 10px;font:500 12px -apple-system,sans-serif;color:inherit;background:rgba(128,128,128,.15);cursor:pointer;}\nhtml.kabi-on [data-testid=tid_soundquality_panel] .quality-title{display:flex!important;align-items:center;gap:12px;}\nhtml.kabi-on .quality-title-left{flex:1;}\nhtml.kabi-on .reapple-quality-compact{width:min(320px,calc(100vw - 24px))!important;}\nhtml.kabi-on .reapple-quality-compact :is(.quality-title-right,.item-desc,.item-header,.quality-icon,.item-footer){display:none!important;}\nhtml.kabi-on .reapple-quality-compact :is(.part-list,.part-svip-list,.quality-list){display:block!important;background:transparent!important;margin:0!important;padding:0!important;border:0!important;}\nhtml.kabi-on .reapple-quality-compact .part-item{display:flex!important;align-items:center!important;width:100%!important;min-height:40px!important;height:auto!important;box-sizing:border-box!important;padding:10px 12px!important;margin:2px 0!important;}\nhtml.kabi-on .reapple-quality-compact .item-content{display:block!important;width:auto!important;margin:0!important;}\nhtml.kabi-on .reapple-quality-compact .part-item>[class^=Icon_]{display:none!important;}\nhtml.kabi-on .reapple-quality-compact :is(.item-title,.item-content-title){font-size:13px!important;line-height:20px!important;}\n";
  miniStyle.textContent += "\n/* Stage119: quiet single-column chooser, preserving native actions and selected marks. */\nhtml.kabi-on .cmd-popover:has([data-testid=tid_soundquality_panel]){background:rgba(37,37,39,.97)!important;box-shadow:0 16px 48px #0004!important;border:1px solid #ffffff12!important;}\nhtml.kabi-on .cmd-popover:has([data-testid=tid_soundquality_panel]) .cmd-popover-content{padding:0!important;}\nhtml.kabi-on [data-testid=tid_soundquality_panel]{background:transparent!important;color:#f5f5f7!important;}\nhtml.kabi-on [data-testid=tid_soundquality_panel].reapple-quality-compact{padding:12px!important;}\nhtml.kabi-on .reapple-quality-compact .quality-title{padding:4px 8px 10px!important;margin:0!important;}\nhtml.kabi-on .reapple-quality-compact .quality-title-left{font:600 13px/20px -apple-system,sans-serif!important;}\nhtml.kabi-on .reapple-quality-compact .part-item{background:transparent!important;border:0!important;box-shadow:none!important;gap:8px!important;margin:0!important;padding:9px 10px!important;border-radius:10px!important;min-height:40px!important;}\nhtml.kabi-on .reapple-quality-compact .part-item:hover{background:#ffffff12!important;}\nhtml.kabi-on .reapple-quality-compact .part-item:focus-within{outline:2px solid #ffffff66;outline-offset:-2px;}\nhtml.kabi-on .reapple-quality-compact .item-content{flex:1;min-width:0;}\nhtml.kabi-on .reapple-quality-compact :is(.item-title,.item-content-title){color:inherit!important;font:500 13px/20px -apple-system,BlinkMacSystemFont,'PingFang SC',sans-serif!important;white-space:normal!important;}\nhtml.kabi-on .reapple-quality-compact .item-title img{opacity:.65;vertical-align:middle;margin-left:6px;}\nhtml.kabi-on .reapple-quality-toggle{font-size:11px!important;color:#d0d0d5!important;padding:5px 9px!important;}\n";
  miniStyle.textContent += "\n/* Stage120: size the whole native popup, not just its inner panel. */\nhtml.kabi-on .cmd-portal-inner:has(.reapple-quality-compact){min-width:0!important;}\nhtml.kabi-on .cmd-popover-wrapper:has(.reapple-quality-compact){width:min(288px,calc(100vw - 24px))!important;min-width:0!important;margin:0!important;}\nhtml.kabi-on .cmd-popover:has(.reapple-quality-compact),\nhtml.kabi-on .cmd-popover:has(.reapple-quality-compact) .cmd-popover-content{width:100%!important;min-width:0!important;box-sizing:border-box!important;border-radius:16px!important;}\nhtml.kabi-on [data-testid=tid_soundquality_panel].reapple-quality-compact{width:100%!important;min-width:0!important;padding:8px!important;border-radius:16px!important;}\nhtml.kabi-on .reapple-quality-compact :is(.part-list,.part-svip-list,.quality-list){width:100%!important;min-width:0!important;max-width:100%!important;box-sizing:border-box!important;}\nhtml.kabi-on .reapple-quality-compact .quality-title{padding:4px 8px 8px!important;}\nhtml.kabi-on .reapple-quality-compact .part-item{min-width:0!important;max-width:100%!important;flex-direction:row!important;justify-content:flex-start!important;min-height:36px!important;padding:8px!important;text-align:left!important;}\nhtml.kabi-on .reapple-quality-compact .item-content{display:flex!important;flex-direction:row!important;justify-content:flex-start!important;align-items:center!important;align-self:center!important;flex:1!important;min-width:0!important;margin:0!important;padding:0!important;text-align:left!important;}\nhtml.kabi-on .reapple-quality-compact :is(.item-title,.item-content-title){flex:1!important;min-width:0!important;margin:0!important;align-self:auto!important;text-align:left!important;}\nhtml.kabi-on .reapple-quality-compact .item-footer{display:contents!important;}\nhtml.kabi-on .reapple-quality-compact .tick-icon{flex-shrink:0!important;margin-left:6px!important;}\n";
  function syncQualityPopup() {
    var trigger = document.querySelector("#vinyl-page-container [data-kabi-native='quality']");
    var panel = document.querySelector('[data-testid="tid_soundquality_panel"]');
    if (!trigger || !panel || !document.documentElement.classList.contains('kabi-on')) return;
    var portal = panel.closest('.cmd-portal-inner');
    if (!portal) return;
    if (!popupStyles_.has(portal)) popupStyles_.set(portal, portal.getAttribute('style'));
    if (!panel.querySelector('.reapple-quality-toggle')) {
      var button = document.createElement('button'); button.type = 'button'; button.className = 'reapple-quality-toggle';
      button.addEventListener('click', function (event) { event.stopPropagation(); setPluginSetting('qualityCompact', !cfg.qualityCompact); });
      panel.querySelector('.quality-title').appendChild(button);
    }
    var toggle = panel.querySelector('.reapple-quality-toggle');
    var label = cfg.qualityCompact ? '显示详情' : '简化';
    if (toggle.textContent !== label) toggle.textContent = label;
    if (toggle.getAttribute('aria-pressed') !== String(!!cfg.qualityCompact)) toggle.setAttribute('aria-pressed', String(!!cfg.qualityCompact));
    panel.classList.toggle('reapple-quality-compact', !!cfg.qualityCompact);
    var surface = panel.closest('.cmd-popover') || panel;
    var box = trigger.getBoundingClientRect(), width = surface.offsetWidth, height = portal.offsetHeight;
    if (!width || !height) return;
    var x = Math.max(12, Math.min(box.left + box.width / 2 - width / 2, innerWidth - width - 12));
    var y = box.bottom + 12;
    if (y + height > innerHeight - 12) y = Math.max(12, box.top - height - 12);
    pin(portal, x, y, width, null);
    portal.style.setProperty('transform', 'none', 'important');
  }
  function syncHostPopups() {
    syncQualityPopup();
    var root = document.getElementById("vinyl-page-container");
    var trigger = root && root.querySelector("[data-kabi-native='more'][aria-expanded='true']");
    if (!trigger) return;
    var popup = document.getElementById(trigger.getAttribute("data-popupid"));
    var portal = popup && popup.closest(".cmd-portal-inner");
    if (!portal) return;
    var box = trigger.getBoundingClientRect(), view = stageBox();
    var width = portal.offsetWidth, height = portal.offsetHeight;
    if (!width || !height) return;
    // APPLE-MORE73.json: button (477.5,635,26,26), AXMenu (477,319,172,294).
    // The menu's left edge is button.left-.5; bottom is 22pt above button.top. Native
    // NetEase rows/actions and their natural width are retained, only the anchor changes.
    var x = Math.max(view.left, Math.min(box.left - .5, view.left + view.width - width));
    var y = box.top - 22 - height;
    if (y < view.top) y = Math.min(box.bottom + 22, view.top + view.height - height);
    if (!popupStyles_.has(portal)) popupStyles_.set(portal, portal.getAttribute("style"));
    pin(portal, x, Math.max(view.top, y), width, null);
    if (portal.style.getPropertyValue("transform") !== "none") portal.style.setProperty("transform", "none", "important");
  }

  // Native modern Animation.default: response .5, dampingFraction 1, delay/blend 0.
  // RequestAnimationFrame follows the display; native's 1/120 preference is not a timer.
  function animateArtwork(art, playing) {
    var target = playing ? 1 : .73;
    var motion = coverMotion;
    if (!motion || motion.art !== art) {
      if (motion) cancelAnimationFrame(motion.frame);
      motion = coverMotion = { art: art, x: target, velocity: 0, target: target, frame: 0, time: animationTime(), expanded: art.querySelector(".shadow-expanded"), paused: art.querySelector(".shadow-paused") };
      art._kabiMotion = motion;
      paint();
      return;
    }
    if (motion.target === target && !reducedMotion.matches) return;
    var now = animationTime();
    advance(now);
    cancelAnimationFrame(motion.frame);
    motion.frame = 0;
    motion.target = target;
    motion.time = now;
    if (reducedMotion.matches || document.hidden) {
      motion.x = target; motion.velocity = 0; paint();
    } else motion.frame = requestAnimationFrame(step);

    // CEF can offset the document/rAF timeline from performance.now().
    // Use a single timeline for starts, retargets, and every frame.
    function animationTime() {
      var time = document.timeline && document.timeline.currentTime;
      return typeof time === "number" ? time : performance.now();
    }
    function advance(now) {
      now = Math.max(motion.time, now);
      var dt = Math.max(0, (now - motion.time) / 1000);
      var omega = 2 * Math.PI / .5;
      var displacement = motion.x - motion.target;
      var b = motion.velocity + omega * displacement;
      var decay = Math.exp(-omega * dt);
      motion.x = motion.target + (displacement + b * dt) * decay;
      motion.velocity = (b - omega * (displacement + b * dt)) * decay;
      motion.time = now;
    }
    function paint() {
      motion.art.style.transform = "scale(" + motion.x.toFixed(6) + ")";
      var weight = Math.max(0, Math.min(1, (motion.x - .73) / .27));
      if (motion.expanded) motion.expanded.style.opacity = weight.toFixed(5);
      if (motion.paused) motion.paused.style.opacity = (1 - weight).toFixed(5);
    }
    function step(now) {
      motion.frame = 0;
      if (disposed) return;
      advance(animationTime());
      if (reducedMotion.matches || document.hidden || (Math.abs(motion.x - motion.target) < .0001 && Math.abs(motion.velocity) < .001)) {
        motion.x = motion.target; motion.velocity = 0; paint(); return;
      }
      paint();
      motion.frame = requestAnimationFrame(step);
    }
  }

  // What the lyric segment says, kept apart from whether the lyric column is on screen.  The queue
  // forces the column out of view but leaves the button alone, and Apple's own does the same:
  // driving Music's queue button by AX four times, kAXValue on its lyric button read 0 before,
  // between and after every press, while a band over the lyric column settled darker on each open
  // and brighter on each close -- the ink leaves and comes back.  So the class is derived, never
  // latched, which is what the old code got wrong: it added kabi-lyrics-off on open and nothing
  // ever removed it, so one open/close pair left the lyrics gone for good.
  var lyricsManualOn_ = true;

  // The stage box, in the same painted-point frame every offset in this file is written against.
  //
  // It used to be #vinyl-page-container's own rect, which is the host's page box: position:fixed
  // with width/height auto, so it shrink-wraps whatever the host has in flow.  That makes it
  // content-dependent, and it swung between 3024x1898 (header and footer in flow) and 0x0 (the
  // lyric column taken out of flow, which is exactly what hiding the lyrics does).  layoutLeft()
  // bails on a small rect, so the second reading never corrected the first and the artwork kept
  // the 846pt box at left 1088 from the 3024-wide pass -- in a 1512pt page that puts it off the
  // right edge entirely, which is the offset that was reported.
  //
  // documentElement.clientWidth is no better: it reports 3024, the unzoomed number, because <html>
  // carries zoom:2, so dividing by nothing gives a stage twice the real one.  A fixed, full-viewport
  // probe is measured in the one frame that cannot drift -- position:fixed resolves against the
  // visual viewport, which is also where the panel's own hardcoded 756/88 offsets land.  Reading
  // the stage and drawing the panel in the same frame is what stops them disagreeing.
  var stageProbe_ = null;

  function stageBox() {
    if (!stageProbe_ && document.body) {
      stageProbe_ = document.createElement("div");
      stageProbe_.id = "kabi-stage-probe";
      stageProbe_.style.cssText = "position:fixed;left:0;top:0;width:100%;height:100%;visibility:hidden;pointer-events:none;";
      document.body.appendChild(stageProbe_);
    }
    if (stageProbe_) {
      var r = stageProbe_.getBoundingClientRect();
      if (r.width >= 200 && r.height >= 200) return r;
    }
    var d = document.documentElement;
    var z = parseFloat(getComputedStyle(d).zoom) || 1;
    return { left: 0, top: 0, width: d.clientWidth / z, height: d.clientHeight / z };
  }

  function layoutLeft() {
    var display = document.querySelector("#vinyl-page-container .display");
    var root = document.getElementById("vinyl-page-container");
    var art = document.getElementById("kabi-art") || ensureArt();
    var stack = document.getElementById("kabi-stack") || ensureStack();
    if (!root || !stack) return;
    var b = stageBox();
    if (b.width < 200 || b.height < 200) return;
    // Either visible right-hand component reserves a column, independently of lyric preference.
    // v87 only checked footLyricsOn(): with lyrics OFF, opening/playing a queue row kept the
    // artwork and rail centred underneath the queue. The queue requires the left column too.
    // Keep lyricsManualOn_ untouched: closing the queue must not switch the lyrics back on.
    var off = !(cfg.lyrics && footLyricsOn()) && !(cfg.queue && footQueueOpen());
    var typeScale = Math.max(.82, Math.min(1, b.width / 1024)).toFixed(4);
    if (root.style.getPropertyValue("--kabi-type") !== typeScale) root.style.setProperty("--kabi-type", typeScale);
    // APPLE-LAYOUT90: AX at1291x949 /1512x949 /1512x800, paused+playing.
    // Native (page-local) art top/height/title top:216/361.5/596.5,
    // 185/423.5/627.5,110.5/423.5/553. Gap=19pt in every sample, unchanged by play.
    // At2px/pt all samples fit snap((H-snap(.28W))/2 -78) with0pt residual.
    // The old independently anchored596.5/949 title overlapped playing art by12.5pt
    // at1512x949. Solve the coupled vertical stack from one snapped artwork box.
    var pixel = window.devicePixelRatio || 1;
    function snapPoint(value) { return Math.round(value * pixel) / pixel; }
    var size = snapPoint(b.width * .28);
    var centerX = b.left + b.width * (off ? .5 : .25);
    var left = centerX - size / 2;
    var top = snapPoint(b.top + (b.height - size) / 2 - 78);
    var headTop = top + size + 19;
    var u = size / 423.4;
    if (stack.style.getPropertyValue("--u") !== u.toFixed(4)) stack.style.setProperty("--u", u.toFixed(4));
    // The footer is a sibling of the stack, not a descendant, so it does not inherit --u; every
    // calc() in its rules resolves against this copy.  Without it the capsule falls back to the
    // svg's 300x150 default size.
    var footEl = document.getElementById("kabi-foot");
    if (footEl && footEl.style.getPropertyValue("--u") !== u.toFixed(4)) footEl.style.setProperty("--u", u.toFixed(4));
    var playingNow = isPlaying();
    document.documentElement.classList.toggle("kabi-paused", !playingNow);
    if (art) art.classList.toggle("is-paused", !playingNow);
    // Keep rail/title and artwork coupled through headTop; font and internal row spacing stay absolute.
    if (art) pin(art, left, top, size, size);
    pin(stack, left, headTop, size, null);
    if (art) animateArtwork(art, playingNow);
    // Never pin the host lyric column inline: those !important dimensions survive
    // the master class being removed and push the native record into the lyric rail.
    // Geometry lives only in scoped CSS; host inline sizing remains host-owned.
    [["left", b.left + b.width * (526 / 1024)], ["top", b.top + b.height * (136 / 642)],
     ["width", b.width * (354 / 1024)], ["height", b.height * (411 / 642)]].forEach(function (row) {
      var key = "--kabi-display-" + row[0], value = snapPoint(row[1]) + "px";
      if (root.style.getPropertyValue(key) !== value) root.style.setProperty(key, value);
    });
  }

  function syncTimes() {
    var row = document.querySelector("#kabi-stack #kabi-times");
    var slider = document.querySelector("#kabi-stack .bar .slider-vinyl");
    var elapsedNode = row && row.querySelector(".elapsed");
    var remainNode = row && row.querySelector(".remain");
    if (!row || !slider || !elapsedNode || !remainNode) return;
    var thumb = slider.querySelector(".thumb");
    var raw = thumb ? (thumb.textContent || "").trim() : "";
    var parts = raw.split("/");
    if (parts.length !== 2) return;
    var elapsed = parts[0].trim();
    var total = parts[1].trim();
    var remain = total;
    var es = elapsed.split(":");
    var ts = total.split(":");
    if (es.length === 2 && ts.length === 2) {
      var left = (Number(ts[0]) * 60 + Number(ts[1])) - (Number(es[0]) * 60 + Number(es[1]));
      if (left >= 0) remain = "-" + Math.floor(left / 60) + ":" + String(left % 60).padStart(2, "0");
    }
    if (elapsedNode.textContent !== elapsed) elapsedNode.textContent = elapsed;
    if (remainNode.textContent !== remain) remainNode.textContent = remain;
  }

  // The footer's three glyph paths, straight out of the marching-squares trace of the
  // reference capture.  Coordinates are pill-local points in a 72.5 x 36 viewBox; see the
  // CSS block above for the capture, the level crossings and the IoU check.
  var KABI_FOOT_BUBBLE =
    "M13.06 11.17L11.94 11.34L11.12 11.82L10.54 12.42L10.06 13.48L9.96 14.99L9.99 20.99L10.09 21.55" +
    "L10.56 22.55L11.15 23.17L12.19 23.71L13.69 23.84L13.87 23.99L13.94 24.55L13.96 26.05L14.19 26.6" +
    "L14.69 26.76L15.25 26.6L18.25 23.92L18.75 23.82L23.19 23.82L24.19 23.74L24.6 23.61L25.31 23.22" +
    "L25.88 22.68L26.35 21.86L26.51 20.99L26.54 14.49L26.46 13.55L26.34 13.05L25.88 12.3L25.46 11.86" +
    "L24.69 11.36L23.19 11.15Z" +
    "M15.75 15.29L15.44 15.44L14.99 15.86L14.7 16.55L14.7 16.99L14.99 17.67L15.38 18.08L15.69 18.24L16." +
    "31 18.29L16.56 18.49L16.43 18.67L15.88 18.96L15.52 19.3L15.44 19.55L15.75 19.76L16.38 19.62L16.94 " +
    "19.23L17.36 18.8L17.82 17.99L17.95 17.05L17.84 16.36L17.5 15.85L17.16 15.49L16.69 15.28ZM19.75 15." +
    "29L19.44 15.43L18.98 15.86L18.69 16.49L18.67 16.99L18.98 17.67L19.32 18.05L19.69 18.24L20.31 18.29" +
    "L20.55 18.49L20.42 18.67L19.82 18.99L19.51 19.3L19.43 19.55L19.75 19.76L20.31 19.65L20.94 19.21L21" +
    ".34 18.8L21.8 17.99L21.91 17.55L21.94 17.05L21.82 16.36L21.45 15.8L21.12 15.48L20.69 15.28Z";
  var KABI_FOOT_QUOTE_OFF =
    "M12.75 11.23L11.94 11.38L11.11 11.86L10.56 12.44L10.08 13.49L9.97 14.55L10 21.05L10.09 21.55" +
    "L10.55 22.55L11.12 23.17L12.06 23.69L13.25 23.84L13.75 24.05L13.85 24.49L13.91 25.99L14.22 26.55" +
    "L14.75 26.75L15.19 26.73L15.44 26.63L16.19 26.1L17.88 24.63L18.1 24.36L18.75 23.88L23.19 23.83" +
    "L24.25 23.74L24.69 23.61L25.31 23.23L25.88 22.69L26.35 21.86L26.5 21.05L26.53 14.49L26.45 13.55" +
    "L26.31 13.06L25.9 12.36L25.4 11.86L24.55 11.36L23.25 11.2L13.75 11.18Z" +
    "M13.1 12.8L23.19 12.78L23.75 12.84L24.31 13.2L24.86 13.92L24.95 14.55L24.94 20.55L24.88 21.05" +
    "L24.52 21.61L23.9 22.11L23.44 22.23L18.15 22.3L17.81 22.46L17.25 22.96L15.75 24.43L15.39 24.36" +
    "L15.27 24.05L15.26 22.99L15.01 22.42L14.69 22.27L13.25 22.25L12.69 22.15L12.03 21.67L11.62 20.8" +
    "L11.56 19.99L11.61 14.3L11.68 13.99L12.06 13.32L12.69 12.88Z" +
    "M15.75 15.29L15.44 15.44L14.99 15.86L14.7 16.55L14.7 16.99L14.99 17.67L15.38 18.08L15.69 18.24" +
    "L16.31 18.29L16.56 18.49L16.43 18.67L15.88 18.96L15.52 19.3L15.44 19.55L15.75 19.76L16.38 19.62" +
    "L16.94 19.23L17.36 18.8L17.82 17.99L17.95 17.05L17.84 16.36L17.5 15.85L17.16 15.49L16.69 15.28Z" +
    "M19.75 15.29L19.44 15.43L18.98 15.86L18.69 16.49L18.67 16.99L18.98 17.67L19.32 18.05L19.69 18.24" +
    "L20.31 18.29L20.55 18.49L20.42 18.67L19.82 18.99L19.51 19.3L19.43 19.55L19.75 19.76L20.31 19.65" +
    "L20.94 19.21L21.34 18.8L21.8 17.99L21.91 17.55L21.94 17.05L21.82 16.36L21.45 15.8L21.12 15.48" +
    "L20.69 15.28Z";
  var KABI_FOOT_QUEUE =
    "M51.69 22.35L51.19 22.59L50.94 23.05L50.98 23.49L51.1 23.67L51.25 23.77L51.75 23.88L61.69 23.85" +
    "L62.17 23.55L62.33 23.05L61.8 22.42L61.31 22.35Z" +
    "M51.5 17.86L51.19 18.01L51.01 18.3L50.93 18.55L51 18.99L51.19 19.22L51.75 19.34L61.69 19.31" +
    "L62.12 19.05L62.33 18.55L61.94 17.99L61.69 17.83L52.25 17.8Z" +
    "M51.62 13.3L51.13 13.49L50.93 14.05L51.02 14.49L51.12 14.63L51.75 14.8L61.69 14.78L62.06 14.56" +
    "L62.34 14.05L62 13.49L61.69 13.3Z" +
    "M48.06 12.98L47.69 13.07L47.18 13.42L47.09 13.55L46.98 14.05L47.05 14.49L47.18 14.67L47.69 15.1" +
    "L48.19 15.18L48.44 15.07L48.89 14.74L49.03 14.49L49.12 13.99L48.99 13.49L48.84 13.3L48.25 12.97Z" +
    "M47.75 22.17L47.38 22.37L47.13 22.61L46.99 22.99L47.02 23.49L47.12 23.69L47.62 24.17L48.25 24.24" +
    "L48.69 24.07L48.88 23.85L49.07 23.49L49.11 22.99L48.94 22.49L48.75 22.29L48.19 22.12Z" +
    "M48.19 17.54L47.69 17.64L47.23 17.92L47.12 18.05L46.99 18.49L47.06 19.07L47.75 19.68L48.19 19.72" +
    "L48.49 19.61L48.82 19.36L49.05 18.99L49.12 18.55L48.97 17.99L48.75 17.76Z";

  // Apple's indicator is one disc shared by the two segments, 36.25pt apart, so the segments
  // cannot both be lit.  Pressing the buttons in AX settles the three states the reference
  // actually has -- pressing lyrics four times walks lyrics 0 -> 1 -> 0 -> 1 -> 0 with the queue
  // shut the whole way, and opening the queue forces lyrics to 0 -- and a capture of the fourth
  // state shows the pill with no disc at all and both glyphs in white.  So the state is derived,
  // never stored: the queue owns the disc when its sheet is up, the lyrics own it when the lyric
  // column is showing, and with neither up the disc is simply absent and both glyphs are white.
  //
  // There is no transition between those three states.  Captured off Apple at 120fps through
  // ScreenCaptureKit, every footer change lands inside a single 8.3ms frame: the disc's bright
  // area steps 241 -> 2505 device px and its width 0 -> 58 with nothing in between when the
  // queue opens, and the lyric toggle steps 1967 -> 398 the same way.  That is not a suppressed
  // animation -- the lyrics pane in the same window, in the same capture, scrolls with a mean
  // consecutive-frame delta of 15.4.  An earlier damped harmonic oscillator here (zeta .78,
  // omega 17, ~550ms settle) was reasoned rather than measured and is gone; cx and opacity are
  // now written in the same tick as the state.
  var FOOT_X = { lyric: 18.125, queue: 54.375 };
  var foot = null;

  // ---- the queue panel --------------------------------------------------------------------
  // This used to be the host's: .cmd-sidesheet, parked off-screen by two of its own class names
  // and opened by removing them.  None of that exists on this build -- querySelector
  // (".cmd-sidesheet") returns null and nothing in the page carries those class names -- so the
  // old driver was silently dead and the queue button did nothing at all.  The panel is ours now,
  // laid out on Apple's own measured geometry; the host class names, the mask and the
  // full-viewport wrapper that swallowed every click are all gone with it.
  var QUEUE_ROW = 48;
  var que = null;

  // The play list lives in the page's dva store, reached the way the vinyl page itself reaches
  // it: up the React fiber from #vinyl-page-container to the component that was handed a store.
  // One walk per open, no DOM scraping and no polling.
  function queueStore() {
    var root = document.getElementById("vinyl-page-container");
    if (!root) return null;
    var key = null;
    for (var k in root) if (k.indexOf("__reactInternalInstance") === 0) key = k;
    if (!key) return null;
    var f = root[key];
    for (var i = 0; i < 80 && f; i++) {
      if (f.memoizedProps && f.memoizedProps.store && f.memoizedProps.store.getState) {
        return f.memoizedProps.store;
      }
      f = f.return;
    }
    return null;
  }

  function queueRead() {
    var store = queueStore();
    if (!store) return { list: [], cur: -1 };
    var st = store.getState();
    var list = (st.playingList && st.playingList.curPlayingList) || [];
    var id = st.playing && st.playing.curPlaying && st.playing.curPlaying.trackId;
    var cur = -1;
    if (id != null) {
      for (var i = 0; i < list.length; i++) {
        var t = list[i] && list[i].track;
        if (t && String(t.id) === String(id)) { cur = i; break; }
      }
    }
    return { list: list, cur: cur };
  }

  // The host's command layer, read out of its own bundle rather than guessed.
  //
  // NetEase's player exposes no playback function on window: every command is a dva action, and
  // the four that matter here are
  //
  //   playing/switchResumeOrPause       {triggerScene}
  //   playingList/jump2Track            {flag: 1|-1, type: "call", triggerScene}
  //   playing/playOneTrackInPlayingList {item: <resourceId>, flag, switchType, triggerScene}
  //   async:action/popMenu              {resource, resourceType: "track", from: {scene}}
  //
  // The first three drive the player.  The fourth is better than it looks: it asks the host to
  // build and pop ITS OWN native menu for a resource, which is why the row's "..." can carry
  // real actions -- 收藏, 下载, 分享, 查看评论 -- rather than a look-alike we would have to keep
  // in sync with a menu we cannot see.
  //
  // They were found by reading orpheus://orpheus/pub/hybrid/app.chunk.114fa7e.js and then
  // confirmed against the running page, NOT by watching what crosses store.dispatch.  That is the
  // whole reason this took a while: double-clicking one of the host's own rows puts exactly four
  // types across dispatch -- playing/onUpdate, playing/onUpdateCurPlaying, page:vinylPage/setColor
  // and async:playingListHandoff/* -- every one of them an EFFECT.  The action that started the
  // audio was never among them, so a dispatch-log tap finds the smoke and not the fire, and
  // playback looks like it bypasses the store entirely.  It does not; the command is simply
  // dispatched from a component, not from the row handler you would think to instrument.
  //
  // One trap worth keeping: jump2Track lives under playingList/, not playing/.  The playing/ form
  // is accepted by the dispatcher and does nothing at all, which on screen is indistinguishable
  // from a dead button.
  function hostCommand(type, payload) {
    var store = hostStore_ || queueStore();
    if (!store) return false;
    store.dispatch({ type: type, payload: payload });
    return true;
  }

  function togglePlay() {
    return hostCommand("playing/switchResumeOrPause", { triggerScene: "vinyl" });
  }

  function jumpTrack(dir) {
    return hostCommand("playingList/jump2Track", {
      flag: dir, type: "call", triggerScene: "vinyl"
    });
  }

  // `item` may be the resourceId as a string: the reducer looks the entry up in curPlayingList
  // itself when it is given one, which is both the shorter form and the one that cannot drift out
  // of step with the host's own entry objects.
  function playEntry(entry) {
    if (!entry || entry.resourceId == null) return false;
    return hostCommand("playing/playOneTrackInPlayingList", {
      item: String(entry.resourceId), flag: 0, switchType: "call", triggerScene: "vinyl"
    });
  }

  // The shape is copied from the host's own row, which is the only place this menu is built for a
  // track in the playing list -- its mini-player row does exactly this when you right-click one:
  //
  //   var r = curPlayingList.find(function (e) { return e.resourceId === id || e.trackId === id; });
  //   r && dispatch({ type: "async:action/popMenu", payload: {
  //        resource: r, resourceType: "track", from: { scene: "playingList" },
  //        actionPayload: { rawEvent: <the React synthetic event> }, parentData: { ... } } });
  //
  // Three details are the host's and not guesses.  `resource` is the LIST ENTRY, not entry.track
  // -- the entry carries the fromInfo, displayOrder and href the menu builder reads.  The scene is
  // "playingList", which is the scene that means "this is a row of the queue".  And rawEvent
  // carries the click point: winhelper.popupMenu is handed {content, hotkey, left_border_size,
  // menu_type} and no coordinates whatsoever, so the position can only arrive some other way, and
  // this is the only channel the host has.  Send the entry and the scene without it and the menu
  // still appears -- at the bottom-left corner of the window, as far from the mark as it gets.
  function popHostMenu(entry, x, y) {
    if (!entry) return false;
    return hostCommand("async:action/popMenu", {
      resource: entry,
      resourceType: "track",
      from: { scene: "playingList" },
      actionPayload: {
        rawEvent: {
          clientX: x, clientY: y, pageX: x, pageY: y,
          stopPropagation: function () {}, preventDefault: function () {}
        }
      }
    });
  }

  // Play state read from the model, not scraped out of the host's markup.  The scrape worked --
  // it looked for the pause glyph, which only exists while playing -- but it coupled the replica
  // to NetEase's CSS class names for a fact the store already states outright.  The enum is not a
  // guess: End -1, Stop 0, Pause 1, Playing 2, read out of the same chunk as the commands above.
  function isPlaying() {
    var store = hostStore_ || queueStore();
    var st = store && store.getState();
    return !!(st && st.playing && st.playing.playingState === 2);
  }

  function httpToHttps(u) {
    return typeof u === "string" && u.indexOf("http:") === 0
      ? "https:" + u.slice(5)
      : u;
  }

  // Queue row artwork is 34pt square, so ask the CDN for that many device pixels rather than the
  // original.  picUrl from the store carries no size query at all, which means every one of the
  // ~21 visible rows was fetching the full-resolution upload -- several hundred KB apiece -- to be
  // downscaled into a 34pt box, and the panel sat blank until they all arrived.  NetEase's CDN
  // takes ?param=WxH; the existing param is replaced rather than appended so a URL that already
  // carries one does not end up with two.
  function thumbUrl(u, pt) {
    if (!u) return u;
    var px = Math.max(1, Math.round(pt * (window.devicePixelRatio || 1)));
    var clean = String(u).replace(/([?&])(?:param|thumbnail)=\d+y\d+/g, "");
    return clean + (clean.indexOf("?") >= 0 ? "&" : "?") + "param=" + px + "y" + px;
  }

  // Only the rows in view exist.  The play list is 1000+ tracks and a song row is 48pt in a 792pt
  // window, so the whole stack would be ~20 rows either side of nothing; the pool is grown to
  // what the scroller needs and hidden beyond it, which keeps the open at about 20 elements
  // regardless of list length.
  function queuePaint() {
    if (!que) return;
    var list = que.data.list;
    var total = list.length;
    var stack = total * QUEUE_ROW;
    que.rows.style.height = stack + "px";
    var top = que.scroller.scrollTop;
    var h = que.scroller.clientHeight || 792;
    var first = Math.max(0, Math.floor(top / QUEUE_ROW) - 2);
    var last = Math.min(total, Math.ceil((top + h) / QUEUE_ROW) + 2);
    var need = Math.max(0, last - first);
    while (que.pool.length < need) {
      var el = que.tpl.cloneNode(true);
      // Held on the element rather than re-queried per paint: a row is rewritten on every
      // scroll frame and querySelector four times a row is the only per-frame allocation here.
      el._art = el.querySelector(".art");
      el._t1 = el.querySelector(".t1");
      el._t2 = el.querySelector(".t2");
      el._rule = el.querySelector(".rule2");
      que.rows.appendChild(el);
      que.pool.push(el);
    }
    for (var i = 0; i < que.pool.length; i++) {
      var row = que.pool[i];
      if (i >= need) {
        if (row.style.display !== "none") row.style.display = "none";
        continue;
      }
      var idx = first + i;
      var item = list[idx];
      var t = (item && item.track) || {};
      var pic = t.album && thumbUrl(httpToHttps(t.album.picUrl), 34);
      row.style.display = "";
      row.style.top = idx * QUEUE_ROW + "px";
      // The pool recycles rows on every scroll frame, so a click cannot be resolved to a track by
      // counting children.  The index is stamped here and the listener below re-reads the list,
      // so a stale click lands on whatever now occupies that slot rather than on a wrong song.
      row._idx = idx;
      row._art.style.backgroundImage = pic ? 'url("' + pic + '")' : "none";
      row._t1.textContent = t.name || "";
      row._t2.textContent = t.album ? ((t.artists || []).map(function (a) { return a.name; }).join(", ")) : "";
      // The last rule would sit on the panel's bottom edge, where Apple has nothing.
      row._rule.style.display = idx === total - 1 ? "none" : "";
    }
    // Apple draws an overlay indicator, not a gutter: 6pt wide at x=1443, length proportional to
    // how much of the stack is showing.
    var vis = Math.min(h, stack);
    var barH = stack <= h ? 0 : Math.max(28, Math.round(h * (h / stack)));
    var barTop = stack <= h ? 0 : Math.round((top / (stack - h)) * (h - barH));
    que.bar.style.height = barH + "px";
    que.bar.style.top = 93 + barTop + "px";
    que.bar.style.opacity = barH ? "1" : "0";
  }

  function buildQueue(root) {
    if (!cfg.queue) return null;
    var wrap = document.createElement("div");
    wrap.className = "kabi-queue";
    wrap.id = "kabi-queue";
    // Both marks are drawn rather than typed, off Apple's own pixels, re-measured at 2 device px
    // per point off a fresh capture of the live queue panel (Apple window 1291x949 at origin
    // 0,33; pill band captured from screen 650,108 580x52).  The previous numbers came off a
    // 1.3228 px/pt image and described a shape that does not exist: two circles whose stated radii
    // and centre spacing put 0.78pt of daylight between them, so the mark rendered as "oo" while
    // the comment beside it claimed they crossed.  The topology below is what the thresholded
    // pixels actually show.
    //
    // AutoPlay is a lemniscate.  Reading the ink run per scanline at the vertical midpoint gives
    // three runs, at x 0-2, 15-22 and 35-37 px: the two outer strokes, and one continuous 8px
    // blob in the middle.  That middle blob is the crossing -- the lobes touch, they do not sit
    // apart.  Solving for a pair of equal rings that produces it: outer radius 9px (4.5pt), stroke
    // 3px (1.5pt), centres 9.5pt apart.  Ink 18.5 x 8.5pt.
    //
    // AutoMix is two rings of the same construction that overlap harder: outer radius 6.0pt,
    // stroke 2.0pt, centres 8.25pt apart.  At mid-height its scanline reads
    // "####.............########........########" -- the 8px merged run on the left of centre is
    // both lobes' strokes landing on top of each other, which is why it looks like a filled disc
    // at a glance.  It is not filled, and the previous evenodd path with a solid right lobe was
    // wrong in both topology and size.  Ink 20.5 x 12.0pt.
    //
    // Both rings are drawn as plain stroked circles with no fill, so nothing depends on guessing
    // what shows through the middle -- the pill behind is opaque (measured fill rgb 209,208,204).
    wrap.innerHTML =
      '<div class="pill autoplay"><svg width="18.5" height="8.5" viewBox="0 0 18.5 8.5" aria-hidden="true" style="vertical-align:-1.6px;margin-right:6px">' +
        '<circle cx="4.5" cy="4.25" r="3.75" fill="none" stroke="currentColor" stroke-width="1.5"/>' +
        '<circle cx="14" cy="4.25" r="3.75" fill="none" stroke="currentColor" stroke-width="1.5"/>' +
        '</svg><span>AutoPlay</span></div>' +
      '<div class="pill automix"><svg width="20.5" height="12" viewBox="0 0 20.5 12" aria-hidden="true" style="vertical-align:-3.2px;margin-right:6px">' +
        '<circle cx="6" cy="6" r="5" fill="none" stroke="currentColor" stroke-width="2"/>' +
        '<circle cx="14.25" cy="6" r="5" fill="none" stroke="currentColor" stroke-width="2"/>' +
        '</svg><span>AutoMix</span></div>' +
      '<div class="secTitle"><svg width="14.5" height="6.7" viewBox="0 0 18.5 8.5" aria-hidden="true" style="vertical-align:-1.3px;margin-right:6px">' +
        '<circle cx="4.5" cy="4.25" r="3.75" fill="none" stroke="currentColor" stroke-width="1.5"/>' +
        '<circle cx="14" cy="4.25" r="3.75" fill="none" stroke="currentColor" stroke-width="1.5"/>' +
        '</svg>AutoPlay</div>' +
      '<div class="secSub">Similar songs will play</div>' +
      '<div class="rule top"></div>' +
      '<div class="scroller"><div class="rows"></div></div>' +
      '<div class="bar"></div>' +
      '<svg class="globe" width="54" height="54" viewBox="0 0 54 54" aria-hidden="true">' +
        '<circle cx="27" cy="27" r="26" fill="none" stroke="rgba(255,255,255,.55)" stroke-width="1.6"/>' +
        '<ellipse cx="27" cy="27" rx="11" ry="26" fill="none" stroke="rgba(255,255,255,.4)" stroke-width="1.3"/>' +
        '<ellipse cx="27" cy="27" rx="26" ry="11" fill="none" stroke="rgba(255,255,255,.4)" stroke-width="1.3"/>' +
        '<rect x="17" y="17" width="6" height="20" rx="3" fill="rgba(255,255,255,.9)"/>' +
        '<rect x="31" y="17" width="6" height="20" rx="3" fill="rgba(255,255,255,.9)"/>' +
        '</svg>';
    var rowTpl = document.createElement("div");
    rowTpl.className = "row";
    // role/aria because these stopped being decoration: a row plays, and the mark opens NetEase's
    // own menu.  Apple's queue carries the same information to VoiceOver.
    rowTpl.innerHTML =
      '<div class="art"></div><div class="tx"><span class="t1"></span><span class="t2"></span></div>' +
      '<div class="more" role="button" tabindex="-1" aria-label="\u66f4\u591a\u64cd\u4f5c"></div>' +
      '<div class="rule2"></div>';
    rowTpl.setAttribute("role", "listitem");
    que = {
      wrap: wrap,
      scroller: wrap.querySelector(".scroller"),
      rows: wrap.querySelector(".rows"),
      tpl: rowTpl,
      pool: [],
      bar: wrap.querySelector(".bar"),
      data: { list: [], cur: -1 }
    };
    que.onScroll = function () { queuePaint(); };
    que.scroller.addEventListener("scroll", que.onScroll, { passive: true });

    // One listener for the whole panel, not one per row: the pool recycles about twenty elements
    // as the list scrolls, and twenty closures rebinding on every frame is the per-frame allocation
    // this panel is specifically built to avoid.  Delegation also survives the pool being rebuilt.
    que.rows.addEventListener("click", function (e) {
      var row = e.target && e.target.closest ? e.target.closest(".row") : null;
      if (!row || row._idx == null) return;
      var entry = (que.data.list || [])[row._idx];
      if (!entry) return;
      // The mark is a child of the row, so it would otherwise play the track and open the menu.
      if (e.target.classList && e.target.classList.contains("more")) {
        e.stopPropagation();
        popHostMenu(entry, e.clientX, e.clientY);
      } else {
        playEntry(entry);
      }
    });
    root.appendChild(wrap);
  }

  function queueFill() {
    if (!que) return;
    que.data = queueRead();
    queuePaint();
    // Apple brings the panel up showing the queue from where you are; NetEase's list is the whole
    // play list, so the current track is what the top of the panel lands on.
    if (que.data.cur > 0) {
      que.scroller.scrollTop = Math.max(0, que.data.cur * QUEUE_ROW - QUEUE_ROW);
      queuePaint();
    }
  }

  var footSheetOpen_ = false;

  function footQueueOpen() {
    return footSheetOpen_;
  }

  // Every sheet-driven class is written here and only here, from the two pieces of state, so no
  // combination of presses can leave one latched on <html> after the vinyl page is gone.
  function footSheetApply() {
    var root = document.documentElement;
    root.classList.toggle("kabi-sheet-open", footSheetOpen_);
    root.classList.toggle("kabi-sheet-closed", !footSheetOpen_);
    root.classList.toggle("kabi-lyrics-off", !lyricsManualOn_ || footSheetOpen_);
  }

  function footSheetOpen() {
    footSheetOpen_ = true;
    footSheetApply();
    queueFill();
    return true;
  }

  function footSheetClose() {
    footSheetOpen_ = false;
    footSheetApply();
  }

  function footLyricsOn() {
    return lyricsManualOn_;
  }

  // One place that reconciles the indicator and the sheet, whichever of the two moved.  The
  // lyrics can change with the queue untouched -- pressing the lyric segment with the queue shut
  // is exactly that -- so this must not short-circuit on the queue alone; footPush recomputes the
  // state from both and reports whether anything actually moved.
  function footSyncQueue() {
    if (!foot) return;
    if (footPush()) layoutLeft();
  }

  // Derived, never stored: the queue owns the disc when its sheet is up, the lyrics own it when
  // the lyric column is showing, and with neither up the disc is absent and both glyphs white.
  // Returns whether the state moved, which is what tells the caller a relayout is due.
  function footPush() {
    if (!foot) return false;
    var queue = footQueueOpen();
    var lyrics = footLyricsOn();
    foot.queue.disabled = !cfg.queue; foot.lyric.disabled = !cfg.lyrics;
    var state = queue ? "queue" : (lyrics ? "lyric" : "none");
    foot.queueOpen = queue;
    if (state === foot.state) return false;
    foot.state = state;
    footSheetApply();
    foot.cut.setAttribute("d", state === "queue" ? KABI_FOOT_QUEUE : KABI_FOOT_BUBBLE);
    foot.glyph.setAttribute("d", state === "queue" ? KABI_FOOT_QUOTE_OFF : KABI_FOOT_QUEUE);
    foot.lyric.setAttribute("aria-pressed", String(lyrics));
    foot.queue.setAttribute("aria-pressed", String(queue));
    foot.lyric.setAttribute("aria-label", lyrics ? "收起歌词" : "展开歌词");
    foot.queue.setAttribute("aria-label", queue ? "关闭播放列表" : "播放列表");
    // No travel, no fade: the disc is placed and lit in this same tick. Apple measures as one
    // 8.3ms frame wide, so anything here would be motion Apple does not have.
    if (state !== "none") {
      foot.disc.setAttribute("cx", String(FOOT_X[state]));
      foot.discG.setAttribute("opacity", "1");
    } else {
      foot.discG.setAttribute("opacity", "0");
    }
    return true;
  }

  function buildFooter(root) {
    if (!cfg.footer) return null;
    var wrap = document.createElement("div");
    wrap.id = "kabi-foot";
    wrap.innerHTML =
      '<svg class="art" viewBox="0 0 72.5 36" aria-hidden="true" focusable="false">' +
        '<defs>' +
          // Measured off Apple: back the white alpha out of the green channel along the
          // capsule's vertical centreline. Apple plateaus at .165, NetEase at .173, so the
          // flat .175 body is right; the difference is entirely in the rim highlight, which
          // in Apple is strongly convex rather than the linear ramp this used to draw.
          // Offsets are depth-below-rim / 36pt, read straight off Apple's profile.
          '<linearGradient id="kabiFootBody" x1="0" y1="0" x2="0" y2="1">' +
            '<stop offset="0" stop-color="#fff" stop-opacity=".4"/>' +
            '<stop offset=".028" stop-color="#fff" stop-opacity=".165"/>' +
            '<stop offset=".042" stop-color="#fff" stop-opacity=".12"/>' +
            '<stop offset=".056" stop-color="#fff" stop-opacity=".09"/>' +
            '<stop offset=".083" stop-color="#fff" stop-opacity=".057"/>' +
            '<stop offset=".111" stop-color="#fff" stop-opacity=".034"/>' +
            '<stop offset=".139" stop-color="#fff" stop-opacity=".023"/>' +
            '<stop offset=".167" stop-color="#fff" stop-opacity=".011"/>' +
            '<stop offset=".2" stop-color="#fff" stop-opacity="0"/>' +
            '<stop offset=".8" stop-color="#fff" stop-opacity="0"/>' +
            '<stop offset=".833" stop-color="#fff" stop-opacity=".011"/>' +
            '<stop offset=".861" stop-color="#fff" stop-opacity=".023"/>' +
            '<stop offset=".889" stop-color="#fff" stop-opacity=".034"/>' +
            '<stop offset=".917" stop-color="#fff" stop-opacity=".057"/>' +
            '<stop offset=".944" stop-color="#fff" stop-opacity=".09"/>' +
            '<stop offset=".958" stop-color="#fff" stop-opacity=".12"/>' +
            '<stop offset=".972" stop-color="#fff" stop-opacity=".165"/>' +
            '<stop offset="1" stop-color="#fff" stop-opacity=".4"/>' +
          '</linearGradient>' +
          '<mask id="kabiFootCut" maskUnits="userSpaceOnUse" x="0" y="0" width="72.5" height="36">' +
            '<rect x="0" y="0" width="72.5" height="36" fill="#fff"/>' +
            '<path id="kabiFootCutPath" fill="#000" fill-rule="evenodd" d=""/>' +
          '</mask>' +
        '</defs>' +
        '<g mask="url(#kabiFootCut)">' +
          '<rect x=".25" y=".3" width="72" height="35.4" rx="17.7" fill="#fff" fill-opacity=".175"/>' +
          '<rect x=".25" y=".3" width="72" height="35.4" rx="17.7" fill="url(#kabiFootBody)"/>' +
          '<g id="kabiFootDiscG">' +
            '<circle id="kabiFootDisc" cx="18.125" cy="18.6" r="15.25" fill="#fff" fill-opacity=".76"/>' +
          '</g>' +
          '<path id="kabiFootGlyph" fill="#fff" fill-rule="evenodd" d=""/>' +
        '</g>' +
        // The rim is one continuous capsule stroke. An earlier pass drew dark arcs at the
        // two cap seams; a rim walk across an identically-framed Apple capture shows the rim
        // flat at luma 248 from x=67..103 with no dip at either cap, so the arcs are gone.
        '<rect x=".25" y=".3" width="72" height="35.4" rx="17.7" fill="none" stroke="#fff" ' +
          'stroke-width=".6"/>' +
      '</svg>' +
      '<button class="hit" type="button" data-seg="lyric"></button>' +
      '<button class="hit" type="button" data-seg="queue"></button>';
    foot = {
      wrap: wrap,
      disc: wrap.querySelector("#kabiFootDisc"),
      discG: wrap.querySelector("#kabiFootDiscG"),
      cut: wrap.querySelector("#kabiFootCutPath"),
      glyph: wrap.querySelector("#kabiFootGlyph"),
      lyric: wrap.querySelector('[data-seg="lyric"]'),
      queue: wrap.querySelector('[data-seg="queue"]'),
      state: "",
      queueOpen: false
    };
    // The lyric segment toggles lyricsManualOn_ and the queue toggles the sheet; neither writes
    // the other's state, and footSheetApply() derives the class from both.  The previous claim
    // here -- that Apple clears the lyrics on open and does not put them back on close -- was a
    // guess, and it is wrong: see the measurement on lyricsManualOn_ above.  Pressing lyrics while
    // the queue is up still shuts the sheet first, which is the one place the two do interact.
    // Held on foot so dispose can unhook them: they close over footSheetOpen_, so two live
    // builds would each answer for the queue and fight over the same sheet.
    foot.onLyric = function () {
      if (footQueueOpen()) footSheetClose();
      lyricsManualOn_ = !lyricsManualOn_;
      footSheetApply();
      footSyncQueue();
    };
    foot.onQueue = function () {
      if (!cfg.queue) return;
      if (footQueueOpen()) footSheetClose();
      else footSheetOpen();
      footSyncQueue();
    };
    foot.lyric.addEventListener("click", foot.onLyric);
    foot.lyric.addEventListener("contextmenu", openLyricMenu);
    foot.lyric.setAttribute("aria-description", "右键选择原文、翻译或罗马音");
    foot.queue.addEventListener("click", foot.onQueue);
    // Nothing watches the host for the queue any more.  The panel is ours and its state is ours;
    // the observer that used to watch .cmd-sidesheet-inner's class name had nothing left to watch
    // once the host's sheet turned out not to be on the page, and a body-wide MutationObserver
    // that fires on every lyric line rewriting its class is not worth carrying for a signal that
    // no longer exists.  The queue state moves only through foot.onQueue.
    root.appendChild(wrap);
    if (!que) buildQueue(root);
    // Apple rests with the lyrics up and the queue shut, and nothing else can put it there.
    footSheetClose();
    footPush();
  }

  function syncFooter() {
    var root = document.getElementById("vinyl-page-container");
    if (!root) return;
    var old = document.getElementById("kabi-lyric-btn");
    if (old && old.parentNode) old.parentNode.removeChild(old);
    var wrap = document.getElementById("kabi-foot");
    if (!wrap || wrap.getAttribute("data-kabi") !== STAGE_VERSION) {
      if (wrap && wrap.parentNode) wrap.parentNode.removeChild(wrap);
      // The panel goes with it: it is built once per footer, and a rebuild that left the old one
      // mounted would leave two .kabi-queue layers stacked on the same pixels.
      if (que) {
        if (que.onScroll) que.scroller.removeEventListener("scroll", que.onScroll);
        if (que.wrap.parentNode) que.wrap.parentNode.removeChild(que.wrap);
        que = null;
      }
      foot = null;
      buildFooter(root);
      if (foot) foot.wrap.setAttribute("data-kabi", STAGE_VERSION);
      layoutLeft();
      return;
    }
    if (foot && foot.wrap.parentNode !== root) root.appendChild(foot.wrap);
    if (que && que.wrap.parentNode !== root) root.appendChild(que.wrap);
    // The play list changes under us -- a track ends and the next one starts -- and Apple's panel
    // is a view onto whatever is playing, not a snapshot taken when it opened.
    if (que && footQueueOpen()) {
      var before = que.data.list.length;
      que.data = queueRead();
      if (que.data.list.length !== before) queuePaint();
    }
    footSyncQueue();
  }

  // Apple's lyric advance, measured rather than guessed. Tracking the focused line through nine
  // line changes in Apple Music -- 45s of 60fps capture, row-mean profile of the lyric column,
  // cosine-matched frame to frame with parabolic sub-pixel refinement, and a tracker that reads
  // 0px at rest with similarity 1.0000 and 0.64px standard deviation over 2440 rest frames --
  // recovers the unit step response of a damped harmonic oscillator:
  //
  //     zeta = 0.811, omega0 = 8.68 rad/s          (response 2*pi/omega0 = 724ms)
  //     peak +1.28% of travel at 619ms, back through zero near 700ms, settled by ~1.05s
  //
  // zeta and omega0 are not a plain least-squares fit. Over the monotone early curve the two are
  // strongly correlated -- every grid lands short of the overshoot -- so they are separated by the
  // overshoot itself: for a step response the peak excess is exp(-zeta*pi/sqrt(1-zeta^2))
  // independently of omega0, which fixes zeta from the measured +1.27%, and the 617ms time to
  // that peak, pi/(omega0*sqrt(1-zeta^2)), then fixes omega0. Nine advances spanning 165..181pt
  // collapse onto one normalised curve with standard deviation <= 0.06, and the result holds to
  // within 0.9 standard deviations at every sample from 50ms to 950ms.
  //
  // That rebound is the whole point. A cubic or quartic ease-out, which is what this file used
  // to approximate Apple with, is flat at the end by construction and cannot have one.
  var LYRIC_SPRING = (function () {
    var zeta = 0.811, omega = 8.68;
    var a = zeta * omega;                                  // 7.039, the exponential decay rate
    var wd = omega * Math.sqrt(1 - zeta * zeta);           // 5.078, the damped natural frequency
    return {
      // Position and velocity of the step response t seconds in, entering at velocity v0 in
      // units of travel per second. v0 = 0 reproduces the plain step: with B = a/wd the
      // coefficient of sin cancels the exponential's own slope at t=0, so x'(0) = 0 as it must
      // be, and x''(0) = omega0^2.
      at: function (t, v0) {
        var e = Math.exp(-a * t);
        var c = Math.cos(wd * t), s = Math.sin(wd * t);
        var b = (a - (v0 || 0)) / wd;
        return {
          x: 1 - e * (c + b * s),
          v: e * (a * c + a * b * s + wd * s - b * wd * c)
        };
      },
      settle: function (t) { return t > 1.2; }
    };
  })();

  // NetEase moves the lyric list with list.scrollTo({top, behavior:'smooth'}) -- ten calls over a
  // 45s trace, exactly one per line change, and no direct scrollTop assignment anywhere in it --
  // which Chromium resolves over roughly 215ms. That is the stiffness the page reads as dead:
  // not a different distance (the host's travel is right), a curve three and a half times shorter
  // with no rebound at all. So the call is intercepted, its target kept, and its curve replaced:
  // the host still chooses where the list comes to rest, and only the path there changes.
  //
  // Retargeting carries the absolute velocity across, so a line that lands during the rebound is
  // chased from where the list actually is instead of restarting from a dead stop. That is also
  // what CASpringAnimation does, and it is the difference between a scroll that feels sprung and
  // one that feels queued.
  function followLyricScroll(list) {
    var manualUntil = 0;
    var frame = 0;
    var run = null;                       // {from, travel, at, v0}
    var seen = list.scrollTop;
    var rowRuns = [];
    function clearRows() {
      rowRuns.forEach(function (r) { r.node.style.removeProperty("translate"); r.node.style.removeProperty("will-change"); });
      rowRuns = [];
    }
    function captureRows(travel, at) {
      var rows = Array.prototype.slice.call(list.querySelectorAll("li.line"));
      var focus = rows.indexOf(list.querySelector("li.current"));
      var box = list.getBoundingClientRect();
      var old = rowRuns;
      rowRuns = rows.map(function (node, index) {
        var prior = old.find(function (r) { return r.node === node; });
        var rect = node.getBoundingClientRect();
        // Keep only nearby rows composited; offscreen rows are never promoted.
        var visible = rect.bottom > box.top - 200 && rect.top < box.bottom + 200;
        var offset = prior ? prior.offset : 0;
        var distance = Math.max(0, index - Math.max(0, focus));
        // Reconstructed per-line lag; exact native delay formula is still under study.
        var delay = visible ? Math.min(180, distance * 28) : 0;
        node.style.willChange = visible ? "transform" : "auto";
        return { node: node, initial: offset, offset: offset, delay: delay };
      });
      old.forEach(function (r) { if (rows.indexOf(r.node) < 0) { r.node.style.removeProperty("translate"); r.node.style.removeProperty("will-change"); } });
    }
    var nativeScrollTo = list.scrollTo;
    var hadOwnScrollTo = Object.prototype.hasOwnProperty.call(list, 'scrollTo');
    var focusTimer = 0;
    function followCurrent() {
      clearTimeout(focusTimer);
      if (disposed || !cfg.playPage || !cfg.lyrics || !footLyricsOn() || footQueueOpen()) return;
      var wait = Math.max(manualUntil, list._reappleManualUntil || 0) - performance.now();
      if (wait > 0) { focusTimer = setTimeout(followCurrent, wait + 20); return; }
      var current = list.querySelector('li.current');
      if (!current || !list.clientHeight) return;
      var row = current.getBoundingClientRect(), box = list.getBoundingClientRect();
      var target = Math.max(0, Math.min(list.scrollHeight - list.clientHeight,
        list.scrollTop + row.top - box.top - (parseFloat(current.style.translate.split(" ").pop()) || 0) - list.clientTop - list.clientHeight * .35));
      if (Math.abs(target - list.scrollTop) > 1) settle(target);
    }
    list._reappleFollowCurrent = followCurrent;

    function settle(to) {
      to = Math.max(0, Math.min(list.scrollHeight - list.clientHeight, to));
      var from = list.scrollTop;
      var travel = to - from;
      if (reducedMotion.matches || !travel) {
        clearRows();
        run = null;
        list.scrollTop = to;
        seen = list.scrollTop;
        return;
      }
      // Absolute velocity, expressed in units of the new travel.
      var v0 = 0;
      if (run) {
        var s = LYRIC_SPRING.at(Math.max(0, (performance.now() - run.at) / 1000), run.v0);
        v0 = (run.travel * s.v) / travel;
      }
      run = { from: from, travel: travel, at: performance.now(), v0: v0 };
      captureRows(travel, run.at);
      seen = from;
      if (!frame) frame = requestAnimationFrame(renderScroll);
    }

    function renderScroll() {
      frame = 0;
      if (disposed) { run = null; return; }
      var now = performance.now();
      if (run) {
        if (now < manualUntil) { clearRows(); run = null; clearTimeout(focusTimer); focusTimer = setTimeout(followCurrent, manualUntil - now + 20); }             // the user grabbed the list
        else {
          if (reducedMotion.matches) {
            list.scrollTop = run.from + run.travel; seen = list.scrollTop;
            clearRows(); run = null; return;
          }
          var elapsed = (now - run.at) / 1000;
          var s = LYRIC_SPRING.at(elapsed, run.v0);
          list.scrollTop = run.from + run.travel * s.x;
          var actualTravel = list.scrollTop - run.from;
          seen = list.scrollTop;
          rowRuns.forEach(function (r) {
            var t = Math.max(0, elapsed - r.delay / 1000);
            var response = LYRIC_SPRING.at(t, run.v0).x;
            r.offset = r.initial + actualTravel - (run.travel + r.initial) * response;
            r.node.style.translate = "0 " + r.offset.toFixed(3) + "px";
          });
          // Include the final row's lag. Always commit the exact target, including
          // timeout exit; the former code could leave an unfinished run at 1.2s.
          if (elapsed > 1.5) {
            list.scrollTop = run.from + run.travel; seen = list.scrollTop;
            clearRows(); run = null; return;
          }
          frame = requestAnimationFrame(renderScroll);
          return;
        }
      }
      var top = list.scrollTop;
      var root = document.documentElement.classList;
      if (now >= manualUntil && !reducedMotion.matches && root.contains('kabi-on') &&
          footLyricsOn() && !footQueueOpen() && Math.abs(top - seen) > 40) {
        // A move nobody asked us for: the host writing scrollTop directly on some other path, or
        // the list remounting under a new track. Same spring, same curve.
        settle(top);
        return;
      }
      seen = top;
    }

    function scroll() { if (performance.now() < manualUntil && list._reappleManualUntil) beginBrowsing(); if (!frame) frame = requestAnimationFrame(renderScroll); }
    list.addEventListener('scroll', scroll, { passive: true });
    var browsingTimer = 0;
    function beginBrowsing() {
      // Reuse the pre-existing1500ms manual-scroll ownership window. This is a recovery
      // policy, not a newly claimed Apple timing measurement. Native paused-scroll can
      // retain browsing longer; the current-line autofocus path never enters this state.
      list._reappleManualUntil = performance.now() + 1500;
      clearTimeout(browsingTimer); syncLyricBrowsing(list);
      browsingTimer = setTimeout(function () { list._reappleManualUntil = 0; if (!disposed) syncLyricBrowsing(list); }, 1500);
    }
    var release = function (event) { manualUntil = performance.now() + 1500; clearRows(); run = null; clearTimeout(focusTimer); focusTimer = setTimeout(followCurrent, 1520); if (event.type !== "pointerdown") beginBrowsing(); };
    var keyboardBrowse = function (event) { if (["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End"].indexOf(event.key) >= 0) { manualUntil = performance.now() + 1500; clearRows(); run = null; clearTimeout(focusTimer); focusTimer = setTimeout(followCurrent, 1520); beginBrowsing(); } };
    list.addEventListener("keydown", keyboardBrowse);
    ['wheel', 'touchstart', 'pointerdown'].forEach(function (name) { list.addEventListener(name, release, { passive: true }); });

    list.scrollTo = function (arg) {
      if (!cfg.playPage || !cfg.lyrics) return nativeScrollTo.apply(this, arguments);
      if (arg && typeof arg === 'object' && typeof arg.top === 'number') { settle(arg.top); return; }
      return nativeScrollTo.apply(this, arguments);
    };

    return function () {
      cancelAnimationFrame(frame);
      clearRows();
      clearTimeout(browsingTimer); clearTimeout(focusTimer); delete list._reappleFollowCurrent; list._reappleManualUntil = 0;
      list.classList.remove("reapple-lyric-browsing", "reapple-lyric-hover");
      list.removeEventListener("keydown", keyboardBrowse);
      run = null;
      list.removeEventListener('scroll', scroll);
      ['wheel', 'touchstart', 'pointerdown'].forEach(function (name) { list.removeEventListener(name, release); });
      if (hadOwnScrollTo) list.scrollTo = nativeScrollTo; else delete list.scrollTo;
    };
  }

  function syncLyricBrowsing(list) {
    var store = hostStore_ || queueStore(), state = store && store.getState()["page:vinylPage"];
    var hover = !!cfg.lyricHoverClear;
    var browsing = !!cfg.lyricScrollClear && !!((state && state.isLyricPausedScroll) || performance.now() < (list._reappleManualUntil || 0));
    if (list.classList.contains("reapple-lyric-hover") !== hover) list.classList.toggle("reapple-lyric-hover", hover);
    if (list.classList.contains("reapple-lyric-browsing") !== browsing) list.classList.toggle("reapple-lyric-browsing", browsing);
  }
  function tuneLyrics() {
    if (!cfg.lyrics) return;
    var list = document.querySelector("ul.lyric");
    if (!list) return;
    syncLyricBrowsing(list);
    if (observedList !== list) {
      if (lyricObserver) lyricObserver.disconnect();
      if (lyricScrollCleanup) lyricScrollCleanup();
      observedList = list;
      lyricScrollCleanup = followLyricScroll(list);
      lyricObserver = new MutationObserver(function () {
        if (!lyricFrame) lyricFrame = requestAnimationFrame(function () { lyricFrame = 0; tuneLyrics(); });
      });
      lyricObserver.observe(list, { childList: true, subtree: true, attributes: true, attributeFilter: ["class"] });
    }
    var items = list.children;
    var cur = -1;
    for (var i = 0; i < items.length; i++) {
      if (items[i].classList.contains("current")) {
        cur = i;
        break;
      }
    }
    if (list._kabiCur === cur && list._kabiFocusedNode === items[cur] && cur >= 0 && items[cur] && items[cur].getAttribute("data-kabi") === "0") return;
    if (cur >= 0 && list._reappleFollowCurrent) list._reappleFollowCurrent();
    var previous = list._kabiCur;
    var remounted = list._kabiNodes !== items.length || list._kabiFirstNode !== items[0];
    list._kabiCur = cur;
    list._kabiFocusedNode = items[cur];
    list._kabiNodes = items.length;
    list._kabiFirstNode = items[0];
    for (var j = 0; j < items.length; j++) {
      if (!remounted && previous >= 0 && cur >= 0 && Math.abs(j - previous) > 2 && Math.abs(j - cur) > 2) continue;
      var dist = cur < 0 ? 3 : Math.abs(j - cur);
      var mark = dist > 2 ? "3" : String(dist);
      if (items[j].getAttribute("data-kabi") !== mark) items[j].setAttribute("data-kabi", mark);
    }
  }

  var dirty = { all: true };
  var runtimeRoot = document.getElementById("vinyl-page-container");
  var lastOpen = false;
  var lastLyricPreference_ = "";
  var lastMiniState_ = "";
  function bindHostStore() {
    var store = queueStore();
    if (!store || store === hostStore_) return;
    if (hostUnsubscribe_) hostUnsubscribe_();
    hostStore_ = store;
    function reconcile() {
      if (disposed) return;
      var state = store.getState();
      var miniState = state.playing && [state.playing.playingState, state.playing.resourceTrackId, state.playing.playingMode].join(":");
      if (miniState !== lastMiniState_) { lastMiniState_ = miniState; schedule("mini"); }
      var page = state["page:vinylPage"] && state["page:vinylPage"].pageState;
      var mode = state.playing && state.playing.playingMode;
      var lyricPreference = (state.setting && state.setting.lyricMode) + ":" + (state["page:vinylPage"] && state["page:vinylPage"].isLyricPausedScroll);
      if (lyricPreference !== lastLyricPreference_) { lastLyricPreference_ = lyricPreference; schedule("all"); }
      if (page !== lastHostPage_) {
        lastHostPage_ = page;
        dirty.all = true;
        // Store notifications and DOM mutation callbacks run before the browser paints.
        // Keep the host entrance animation, but put our final view on its very first frame.
        tick();
      } else if (mode !== lastHostMode_) schedule("meta");
      lastHostMode_ = mode;
    }
    hostUnsubscribe_ = store.subscribe(reconcile);
    reconcile();
  }
  function schedule(part) {
    dirty[part || "all"] = true;
    if (!scheduledRender && !disposed && !document.hidden) scheduledRender = requestAnimationFrame(tick);
  }
  function tick() {
    if (scheduledRender) cancelAnimationFrame(scheduledRender);
    scheduledRender = 0;
    if (disposed || window.__kabiStage !== STAGE_VERSION) return;
    var changes = dirty;
    dirty = {};
    // The switches are re-read here rather than at boot, so a settings flip reaches the page on the
    // next frame without needing a reload or a version bump.
    cfg = CFG();
    if (previousMaster_ && !cfg.playPage) {
      returnNativeControls(); closeLyricMenu();
      if (lyricScrollCleanup) { lyricScrollCleanup(); lyricScrollCleanup = null; observedList = null; }
    }
    previousMaster_ = cfg.playPage;
    [["sidebar", "sidebarRounded"], ["covers", "coverRounded"], ["album", "albumRounded"], ["search", "searchFilled"], ["list", "appleSongList"], ["mv", "showTrackMV"], ["quality", "showTrackQuality"], ["number", "showTrackNumber"], ["vip", "showTrackVIP"]].forEach(function (row) {
      var visibility = ["mv", "quality", "number", "vip"].indexOf(row[0]) >= 0;
      var name = "data-reapple-" + row[0], value = String(visibility ? (!cfg.playPage || cfg[row[1]]) : (cfg.playPage && cfg[row[1]]));
      if (document.documentElement.getAttribute(name) !== value) document.documentElement.setAttribute(name, value);
    });
    if (changes.all || changes.settings) syncSettingsPanel();
    if (changes.all || changes.settings || changes.layout || changes.meta || changes.mini) syncMiniBar();
    if (!cfg.queue && footQueueOpen()) footSheetClose();
    var h = hideCss(cfg);
    if (switchStyle.textContent !== h) switchStyle.textContent = h;
    var open = pageOpen() && cfg.playPage;
    if (document.documentElement.classList.contains("kabi-on") !== open) document.documentElement.classList.toggle("kabi-on", open);
    if (open && !lastOpen) changes.all = true;
    lastOpen = open;
    if (!open) return;
    if (changes.all || changes.cover) { syncCover(); ensureArt(); }
    if (changes.all || changes.meta) ensureStack();
    if (changes.all || changes.layout || changes.meta) layoutLeft();
    if (changes.all || changes.times) syncTimes();
    if (changes.all) { syncFooter(); tuneLyrics(); }
    // The viewport changes the visible row count and scrollbar length, not just CSS width.
    if (changes.layout && que) queuePaint();
    syncHostPopups();
  }
  function changed(records) {
    if (!runtimeRoot || !runtimeRoot.isConnected) {
      runtimeRoot = document.getElementById("vinyl-page-container");
      if (runtimeRoot) { bindHostStore(); dirty.all = true; tick(); }
      return;
    }
    records.forEach(function (record) {
      var node = record.target.nodeType === 1 ? record.target : record.target.parentElement;
      if (!node || node === document.documentElement) return;
      if (node.closest("#reapple-settings-panel,#reapple-settings-tab,#reapple-lyric-menu,.reapple-mini-glyph,.reapple-mini-repeat")) return;
      var miniRoot = node.closest("#page_pc_mini_bar");
      if (miniRoot && !miniRoot.closest("#vinyl-page-container")) { if (record.type === "childList" || record.attributeName === "class" || record.attributeName === "data-testid" || node.closest(".slider-default")) schedule("mini"); return; }
      if (record.type === "childList" && !runtimeRoot.contains(node)) schedule("settings");
      if (node.closest("#kabi-bg,#kabi-art,#kabi-times")) return;
      if (node.closest("#kabi-stack")) {
        if (node.closest(".slider-vinyl .thumb, .slider-vinyl .track")) schedule("times");
        return;
      }
      if (node === runtimeRoot) { schedule("all"); return; }
      if (node.closest("ul.lyric")) return; // the focused lyric observer owns these records
      if (node.closest("[class*='Cover_c1l42i2x']")) { schedule("cover"); return; }
      if (node.closest("[class*='TrackTitleContainer'],.info.artist,.info.album")) { schedule("meta"); return; }
      if (node.closest(".page-footer")) {
        if (record.type !== "attributes" || record.attributeName === "class" || record.attributeName === "title") schedule("meta");
        return;
      }
      if (runtimeRoot.contains(node)) {
        if (record.type === "childList") schedule("all");
        return;
      }
      if (record.type === "childList" && node.contains(runtimeRoot)) schedule("all");
    });
    // A newly mounted/replaced view must be styled before paint, not one rAF later.
    if (dirty.all && pageOpen()) tick();
    if (pageOpen()) syncHostPopups();
  }
  function transportMotionChanged() {
    var button = document.querySelector("#kabi-transport [data-role='play']");
    if (button && reducedMotion.matches) syncPlayGlyph(button, isPlaying() ? "pause" : "play");
    if (reducedMotion.matches) {
      document.querySelectorAll("#kabi-transport [data-role='prev'],#kabi-transport [data-role='next']").forEach(settleSkipGlyph);
    }
    resized();
  }
  function resized() { schedule("layout"); }
  function visibilityChanged() { if (!document.hidden) schedule("all"); }
  pageObserver = new MutationObserver(changed);
  pageObserver.observe(document.documentElement, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ["src", "class", "style", "title", "data-testid"] });
  window.addEventListener("resize", resized, { passive: true });
  document.addEventListener("visibilitychange", visibilityChanged);
  if (reducedMotion.addEventListener) reducedMotion.addEventListener("change", transportMotionChanged);

  if (window.__kabiTimer) clearInterval(window.__kabiTimer);
  // A settings flip must not require a reload, and the injector deliberately skips re-injection
  // when the payload version is unchanged -- which is the common case for a config-only edit.  So
  // the injector calls this instead of re-evaluating the whole build.  tick() re-reads the switches
  // itself, and the !lastOpen branch inside it turns the master coming back on into a full build,
  // so a live flip in either direction is a complete transition rather than a half-applied one.
  window.__kabiReconfigure = function () {
    if (disposed || window.__kabiStage !== STAGE_VERSION) return false;
    // Native stylesheet refreshes / remounts may remove owned style nodes while
    // leaving our version marker. Reattach the same nodes, not a second stage.
    [style, switchStyle, settingsStyle, miniStyle].forEach(function (sheet) {
      if (sheet && !sheet.isConnected) document.documentElement.appendChild(sheet);
    });
    dirty.all = true;
    tick();
    return cfg;
  };
  window.__kabiStageDispose = function () {
    disposed = true;
    disposeSettingsPanel(); closeLyricMenu(); disposeMiniBar();
    document.removeEventListener("pointerdown", lyricMenuOutside, true);
    document.removeEventListener("keydown", lyricMenuKey);
    if (hostUnsubscribe_) hostUnsubscribe_();
    hostUnsubscribe_ = null;
    hostStore_ = null;
    if (pageObserver) pageObserver.disconnect();
    cancelAnimationFrame(scheduledRender);
    window.removeEventListener("resize", resized);
    document.removeEventListener("visibilitychange", visibilityChanged);
    if (reducedMotion.removeEventListener) reducedMotion.removeEventListener("change", transportMotionChanged);
    if (coverMotion) cancelAnimationFrame(coverMotion.frame);
    rasterCache.clear();
    if (lyricScrollCleanup) lyricScrollCleanup();
    clearInterval(window.__kabiTimer);
    cancelAnimationFrame(lyricFrame);
    if (lyricObserver) lyricObserver.disconnect();
    imageStates.forEach(function (state) { clearTimeout(state.timer); cancelAnimationFrame(state.frame); });
    // The footer is the one subsystem whose handlers close over module state (footSheetOpen_,
    // foot.state).  Leaving them armed across a version bump gives the page two live builds that
    // each answer for the queue and overwrite each other's state.  Both handlers, the pill, and
    // the panel it opens all go here, so a rebuild starts from one clean reader.
    if (foot) {
      if (foot.onLyric) foot.lyric.removeEventListener("click", foot.onLyric);
      foot.lyric.removeEventListener("contextmenu", openLyricMenu);
      if (foot.onQueue) foot.queue.removeEventListener("click", foot.onQueue);
      if (foot.wrap && foot.wrap.parentNode) foot.wrap.parentNode.removeChild(foot.wrap);
      foot = null;
    }
    if (que) {
      if (que.onScroll) que.scroller.removeEventListener("scroll", que.onScroll);
      if (que.wrap.parentNode) que.wrap.parentNode.removeChild(que.wrap);
      que = null;
    }
    // The vinyl page and the three overlays it carries are ours too, and they used to survive a
    // rebuild: #kabi-bg, #kabi-art and #kabi-stack stayed in the DOM across a version bump, so a
    // second build appended a second set next to them.  They are invisible while the vinyl page is
    // closed, which is why it only showed up as odd leftovers rather than as a visible fault.
    // Return borrowed host controls before deleting the overlay. Keeping the original node
    // preserves React's listeners and playback state, and permits reinjection without a reload.
    returnNativeControls();
    ["kabi-bg", "kabi-art", "kabi-stack"].forEach(function (id) {
      var el = document.getElementById(id);
      if (el && el.parentNode) el.parentNode.removeChild(el);
    });
    ["kabi-stage-style", "kabi-switch-style", "reapple-settings-style", "reapple-mini-style"].forEach(function (id) {
      var sheet = document.getElementById(id);
      if (sheet && sheet.parentNode) sheet.parentNode.removeChild(sheet);
    });
    var probe = document.getElementById("kabi-stage-probe");
    if (probe && probe.parentNode) probe.parentNode.removeChild(probe);
    document.documentElement.classList.remove("kabi-on", "kabi-sheet-open", "kabi-sheet-closed", "kabi-lyrics-off", "kabi-paused");
    ["sidebar", "covers", "album", "search", "list", "mv", "quality", "number", "vip"].forEach(function (name) { document.documentElement.removeAttribute("data-reapple-" + name); });
    stageProbe_ = null;
    delete window.__kabiReconfigure;
  };
  // Quiet liveness fallback; all normal track, control, size and time changes are event-driven.
  window.__kabiTimer = setInterval(function () { schedule("all"); }, 5000);
  bindHostStore();
  tick();
})();
