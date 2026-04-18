// ==UserScript==
// @name         百度网盘视频播放增强
// @namespace    https://github.com/Huang131/userscripts
// @version      1.0.0
// @description  百度网盘视频播放增强：倍速任意调整、分辨率任意切换、自动加载播放列表、自动加载字幕、可加载本地字幕、字幕样式精细设置、画面比例调整、色彩调整、播放设置自动记忆
// @author       Huang131
// @license      MIT
// @homepageURL  https://github.com/Huang131/userscripts
// @supportURL   https://github.com/Huang131/userscripts/issues
// @match        http*://yun.baidu.com/s/*
// @match        https://pan.baidu.com/s/*
// @match        https://pan.baidu.com/wap/home*
// @match        https://pan.baidu.com/play/video*
// @match        https://pan.baidu.com/pfile/video*
// @match        https://pan.baidu.com/pfile/mboxvideo*
// @match        https://pan.baidu.com/mbox/streampage*
// @require      https://unpkg.com/hls.js@1.6.0/dist/hls.min.js
// @require      https://unpkg.com/artplayer@5.2.2/dist/artplayer.js
// @run-at       document-start
// @grant        unsafeWindow
// @grant        GM_getValue
// @grant        GM_setValue
// @compatible   chrome
// @compatible   firefox
// @compatible   edge
// ==/UserScript==

(function () {
    'use strict';

    var obj = {
        video_page: {
            flag: "",
            file: {},
            filelist: [],
            quality: [],
            adToken: "",
            getUrl: null
        }
    };

    obj.currentList = function () {
        try {
            var currentList = unsafeWindow.require('system-core:context/context.js').instanceForSystem.list.getCurrentList();
            if (currentList.length) {
                sessionStorage.setItem("currentList", JSON.stringify(currentList));
            } else {
                setTimeout(obj.currentList, 500);
            }
        } catch (e) {}

        window.onhashchange = function () {
            setTimeout(obj.currentList, 500);
        };
        var fufHyA = document.querySelector(".fufHyA");
        if (fufHyA) {
            [].forEach.call(document.querySelectorAll(".fufHyA"), function (element) {
                element.onclick = function () {
                    setTimeout(obj.currentList, 500);
                };
            });
        }
    };

    obj.forcePreview = function () {
        unsafeWindow.jQuery(document).on("click", "#shareqr dd", function () {
            try {
                var selectedFile = unsafeWindow.require('system-core:context/context.js').instanceForSystem.list.getSelected();
                var file = selectedFile[0];
                if (file.category == 1) {
                    var ext = file.server_filename.split(".").pop().toLowerCase();
                    if (["ts", "3gp2", "3g2", "3gpp", "amv", "divx", "dpg", "f4v", "m2t", "m2ts", "m2v", "mpe", "mpeg", "mts", "vob", "webm", "wxp", "wxv"].indexOf(ext) >= 0) {
                        window.open("https://pan.baidu.com" + location.pathname + "?fid=" + file.fs_id, "_blank");
                    }
                }
            } catch (error) {}
        });
    };

    obj.sharevideo = function () {
        if (unsafeWindow.require) {
            unsafeWindow.locals.get("file_list", "share_uk", "shareid", "sign", "timestamp", function (file_list, share_uk, shareid, sign, timestamp) {
                if (file_list.length == 1 && file_list[0].category == 1) {
                    obj.startObj().then(function () {
                        obj.video_page.flag = "sharevideo";
                        var fs_id = (obj.video_page.file = file_list[0]).fs_id;
                        var vip = obj.getVip();
                        obj.video_page.getUrl = function (type) {
                            return "/share/streaming?channel=chunlei&uk=" + share_uk + "&fid=" + fs_id + "&sign=" + sign + "&timestamp=" + timestamp + "&shareid=" + shareid + "&type=" + type + "&vip=" + vip + "&jsToken=" + unsafeWindow.jsToken;
                        };
                        obj.getAdToken().then(function () {
                            obj.addQuality();
                            obj.addFilelist();
                            obj.initVideoPlayer();
                        });
                    });
                } else {
                    obj.currentList();
                    obj.forcePreview();
                }
            });
        }
    };

    obj.playvideo = function () {
        unsafeWindow.jQuery(document).ajaxComplete(function (event, xhr, options) {
            var response, requestUrl = options.url;
            if (requestUrl.indexOf("/api/categorylist") >= 0) {
                response = xhr.responseJSON;
                obj.video_page.filelist = response.info || [];
            } else if (requestUrl.indexOf("/api/filemetas") >= 0) {
                response = xhr.responseJSON;
                if (response && response.info) {
                    obj.startObj().then(function () {
                        obj.video_page.flag = "playvideo";
                        var path = (obj.video_page.file = response.info[0]).path;
                        var vip = obj.getVip();
                        obj.video_page.getUrl = function (type) {
                            if (type.includes(1080) && vip <= 1) type = type.replace(1080, 720);
                            return "/api/streaming?path=" + encodeURIComponent(path) + "&app_id=250528&clienttype=0&type=" + type + "&vip=" + vip + "&jsToken=" + unsafeWindow.jsToken;
                        };
                        obj.getAdToken().then(function () {
                            obj.addQuality();
                            obj.addFilelist();
                            obj.initVideoPlayer();
                        });
                    });
                }
            }
        });
    };

    obj.video = function () {
        var appEl = document.querySelector("#app");
        var globalProps = appEl && appEl.__vue_app__ ? appEl.__vue_app__.config.globalProperties : {};
        var $pinia = globalProps.$pinia;
        var $router = globalProps.$router;
        if ($pinia && $router && Object.keys(($pinia.state._rawValue.videoinfo || {}).videoinfo || {}).length) {
            obj.startObj().then(function () {
                obj.video_page.flag = "video";
                var state = $pinia.state._rawValue;
                var videoinfo = state.videoinfo.videoinfo;
                var recommendListInfo = state.videoinfo.recommendListInfo || {};
                var selectionVideoList = recommendListInfo.selectionVideoList;
                if (Array.isArray(selectionVideoList) && selectionVideoList.length) {
                    obj.video_page.filelist = selectionVideoList;
                } else {
                    Object.defineProperty(recommendListInfo, "selectionVideoList", {
                        enumerable: true,
                        set: function (val) {
                            obj.video_page.filelist = val;
                        }
                    });
                }
                var path = (obj.video_page.file = videoinfo).path;
                var vip = obj.getVip();
                obj.video_page.getUrl = function (type) {
                    if (type.includes(1080) && vip <= 1) type = type.replace(1080, 720);
                    return "/api/streaming?path=" + encodeURIComponent(path) + "&app_id=250528&clienttype=0&type=" + type + "&vip=" + vip + "&jsToken=" + unsafeWindow.jsToken;
                };
                obj.getAdToken().then(function () {
                    obj.addQuality();
                    obj.addFilelist();
                    obj.initVideoPlayer();
                });
            });
            $router.isReady().then(function () {
                $router.afterEach(function (to, from) {
                    if (from.fullPath !== "/" && from.fullPath !== to.fullPath) location.reload();
                });
            });
        } else {
            obj.delay().then(obj.video);
        }
    };

    obj.mboxvideo = function () {
        var appEl = document.querySelector("#app");
        var globalProps = appEl && appEl.__vue_app__ ? appEl.__vue_app__.config.globalProperties : {};
        var $pinia = globalProps.$pinia;
        var $router = globalProps.$router;
        if ($pinia && $router && Object.keys(($pinia.state._rawValue.videoinfo || {}).videoinfo || {}).length) {
            obj.startObj().then(function () {
                obj.video_page.flag = "mboxvideo";
                var videoinfo = $pinia.state._rawValue.videoinfo.videoinfo;
                obj.video_page.file = videoinfo;
                var to = videoinfo.to, from_uk = videoinfo.from_uk, msg_id = videoinfo.msg_id;
                var fs_id = videoinfo.fs_id, type = videoinfo.type, trans = videoinfo.trans, ltime = videoinfo.ltime;
                obj.video_page.getUrl = function (stream_type) {
                    return "/mbox/msg/streaming?to=" + to + "&from_uk=" + from_uk + "&msg_id=" + msg_id + "&fs_id=" + fs_id + "&type=" + type + "&stream_type=" + stream_type + "&trans=" + (trans || "") + "&ltime=" + ltime;
                };
                obj.video_page.adToken = videoinfo.adToken || "";
                obj.getAdToken().then(function () {
                    obj.addQuality();
                    obj.addFilelist();
                    obj.initVideoPlayer();
                });
            });
            $router.isReady().then(function () {
                $router.afterEach(function (to, from) {
                    if (from.fullPath !== "/" && from.fullPath !== to.fullPath) location.reload();
                });
            });
        } else {
            obj.delay().then(obj.mboxvideo);
        }
    };

    obj.videoView = function () {
        var previewEl = document.querySelector(".preview-video");
        var videoFile = previewEl && previewEl.__vue__ ? previewEl.__vue__.videoFile : null;
        if (videoFile) {
            obj.startObj().then(function () {
                obj.video_page.flag = "videoView";
                obj.video_page.file = videoFile;
                var path = videoFile.path;
                obj.video_page.getUrl = function (type) {
                    if (type.includes(1080) && +unsafeWindow.locals && +unsafeWindow.locals.isVip <= 1) type = type.replace(1080, 720);
                    return "/rest/2.0/xpan/file?method=streaming&path=" + encodeURIComponent(path) + "&type=" + type;
                };
                obj.getAdToken().then(function () {
                    obj.addQuality();
                    obj.addFilelist();
                    obj.initVideoPlayer();
                });
            });
        } else {
            obj.delay().then(obj.videoView);
        }
    };

    obj.initVideoPlayer = function () {
        obj.replaceVideoPlayer().then(function () {
            var vp = obj.video_page;
            var defaultQ = vp.quality.find(function (item) { return item.default; }) || vp.quality[0];
            var options = {
                adToken: vp.adToken,
                file: vp.file,
                filelist: vp.filelist,
                quality: vp.quality,
                getUrl: vp.getUrl,
                url: defaultQ.url,
                type: defaultQ.type,
                id: "" + vp.file.fs_id,
                poster: (Object.values(vp.file.thumbs || []).slice(-1)[0] || "").replace(/size=c\d+_u\d+/, "size=c850_u580")
            };
            obj.artPlugins().init(options).then(function () {
                obj.showTip("视频播放器已就绪 ...", "success");
                obj.destroyPlayer();
            });
        });
    };

    obj.replaceVideoPlayer = function () {
        var flag = obj.video_page.flag;
        var videoNode = document.querySelector("#video-wrap, .vp-video__player, #app .video-content");
        if (videoNode) {
            while (videoNode.nextSibling) {
                videoNode.parentNode.removeChild(videoNode.nextSibling);
            }
            var container = document.getElementById("artplayer");
            if (!container) {
                container = document.createElement("div");
                container.setAttribute("id", "artplayer");
                if (flag === "videoView") {
                    container.setAttribute("style", "width: 100%; height: 3.75rem;");
                } else {
                    container.setAttribute("style", "width: 100%; height: 100%;");
                }
                obj.videoNode = videoNode.parentNode.replaceChild(container, videoNode);
                container.parentNode.style.cssText += "z-index: auto;";
                return Promise.resolve();
            }
        } else {
            return obj.delay().then(function () {
                return obj.replaceVideoPlayer();
            });
        }
    };

    obj.artPlugins = function () {
        var plugins = [
            obj.pluginQuality,
            obj.pluginPlaylist,
            obj.pluginPlaybackRate,
            obj.pluginSubtitle,
            obj.pluginImageFilter,
            obj.pluginPlaySetting,
            obj.pluginHotkey
        ];
        return {
            version: "1.0.0",
            init: function (opts) {
                return Promise.all([
                    obj.readyHls(),
                    obj.readyArtplayer()
                ]).then(function () {
                    return obj.initArtplayer(opts, plugins);
                });
            }
        };
    };

    obj.readyHls = function () {
        if (window.Hls || unsafeWindow.Hls) return Promise.resolve();
        return obj.loadJs("https://cdnjs.cloudflare.com/ajax/libs/hls.js/1.6.0/hls.min.js");
    };

    obj.readyArtplayer = function () {
        if (window.Artplayer || unsafeWindow.Artplayer) return Promise.resolve();
        return obj.loadJs("https://cdnjs.cloudflare.com/ajax/libs/artplayer/5.2.2/artplayer.min.js");
    };

    obj.loadJs = function (url) {
        window.instances = window.instances || {};
        if (window.instances[url]) return window.instances[url];
        window.instances[url] = new Promise(function (resolve, reject) {
            var n = document.createElement("script");
            n.src = url;
            n.type = "text/javascript";
            n.onload = resolve;
            n.onerror = reject;
            Node.prototype.appendChild.call(document.head, n);
        });
        return window.instances[url];
    };

    obj.initArtplayer = function (opts, plugins) {
        var Artplayer = window.Artplayer || unsafeWindow.Artplayer;
        var Hls = window.Hls || unsafeWindow.Hls;
        var isMobile = Artplayer.utils.isMobile;

        Artplayer.ASPECT_RATIO = ["default", "自动", "4:3", "16:9"];
        Artplayer.AUTO_PLAYBACK_TIMEOUT = 10000;
        Artplayer.NOTICE_TIME = 5000;

        var artOption = {
            container: "#artplayer",
            url: opts.url,
            quality: opts.quality,
            type: "hls",
            autoplay: true,
            autoPlayback: true,
            aspectRatio: true,
            contextmenu: [],
            customType: {
                hls: function (video, url, art) {
                    if (!Hls || !Hls.isSupported()) {
                        if (video.canPlayType("application/vnd.apple.mpegurl")) {
                            video.src = url;
                        } else {
                            art.notice.show = "不支持此播放格式: m3u8";
                        }
                        return;
                    }
                    if (art.hls) art.hls.destroy();
                    var hls = new Hls({
                        maxBufferLength: 10 * Hls.DefaultConfig.maxBufferLength,
                        xhrSetup: function (xhr, url) {
                            var host = (url.match(/^https?:\/\/(.*?)\//) || [])[1];
                            if (host && host !== location.host) {
                                if (/backhost=/.test(url)) {
                                    var backhostMatch = (decodeURIComponent(url || "").match(/backhost=(\[.*\])/) || [])[1];
                                    if (backhostMatch) {
                                        try {
                                            var backhosts = JSON.parse(backhostMatch);
                                            if (backhosts && backhosts.length) {
                                                backhosts = [].concat(backhosts, [host]);
                                                var idx = backhosts.findIndex(function (h) { return h === art.realHost; });
                                                art.realHost = backhosts[idx + 1 >= backhosts.length ? 0 : idx + 1];
                                            }
                                        } catch (e) {}
                                    }
                                }
                                if (art.realHost) {
                                    url = url.replace(host, art.realHost);
                                    xhr.open("GET", url, true);
                                }
                            }
                        }
                    });
                    hls.loadSource(url);
                    hls.attachMedia(video);
                    hls.on(Hls.Events.ERROR, function (event, data) {
                        if (data.fatal) {
                            switch (data.type) {
                                case Hls.ErrorTypes.NETWORK_ERROR:
                                    if (data.details === Hls.ErrorDetails.MANIFEST_LOAD_ERROR) {
                                        setTimeout(function () { hls.loadSource(hls.url); }, 1000);
                                    } else if (data.details === Hls.ErrorDetails.MANIFEST_LOAD_TIMEOUT || data.details === Hls.ErrorDetails.MANIFEST_PARSING_ERROR) {
                                        hls.loadSource(hls.url);
                                    } else if (data.details === Hls.ErrorDetails.FRAG_LOAD_ERROR) {
                                        hls.fragLoadError = (hls.fragLoadError || 0) + 1;
                                        if (hls.fragLoadError < 5) {
                                            hls.loadSource(hls.url);
                                            hls.media.currentTime = art.currentTime;
                                            hls.media.play();
                                        } else {
                                            hls.destroy();
                                            art.notice.show = "视频播放错误次数过多，请刷新重试";
                                        }
                                    } else {
                                        hls.startLoad();
                                    }
                                    break;
                                case Hls.ErrorTypes.MEDIA_ERROR:
                                    hls.recoverMediaError();
                                    break;
                                default:
                                    hls.destroy();
                                    art.notice.show = "视频播放异常，请刷新重试";
                            }
                        }
                    });
                    art.hls = hls;
                    art.on("destroy", function () { hls.destroy(); });
                }
            },
            flip: false,
            icons: {
                loading: '<img src="https://artplayer.org/assets/img/ploading.gif">',
                state: '<img width="150" height="150" src="https://artplayer.org/assets/img/state.svg">',
                indicator: '<img width="16" height="16" src="https://artplayer.org/assets/img/indicator.svg">'
            },
            id: opts.id || "",
            pip: !isMobile,
            poster: opts.poster || "",
            playbackRate: false,
            screenshot: true,
            setting: true,
            subtitle: {
                url: "",
                type: "auto",
                style: {
                    color: "#fe9200",
                    bottom: "5%",
                    fontSize: "25px",
                    fontWeight: 400,
                    fontFamily: "",
                    textShadow: ""
                },
                encoding: "utf-8",
                escape: false
            },
            subtitleOffset: false,
            hotkey: true,
            fullscreen: true,
            fullscreenWeb: !isMobile
        };

        Object.assign(artOption, {
            getUrl: opts.getUrl,
            adToken: opts.adToken,
            file: opts.file,
            filelist: opts.filelist,
            sublist: opts.sublist || []
        });

        var art = new Artplayer(artOption, function (art) {
            plugins.forEach(function (pluginFn) {
                var plugin = pluginFn();
                art.plugins.add(plugin);
            });
        });
        return art;
    };

    obj.pluginQuality = function () {
        return function (art) {
            var i18n = art.i18n;
            var option = art.option;
            var notice = art.notice;
            var storage = art.storage;
            var controls = art.controls;
            var isMobile = art.constructor.utils.isMobile;

            function shortText(text) {
                return isMobile ? text.split(/\s/).shift() : text;
            }

            function updateQuality() {
                var quality = option.quality;
                var current = quality.find(function (q) { return q.default; }) || quality[0];
                controls.update({
                    name: "quality",
                    html: current ? shortText(current.html) : "",
                    selector: quality.map(function (q) { return Object.assign({}, q); }),
                    onSelect: function (item) {
                        art.switchQuality(item.url);
                        notice.show = i18n.get("Switch Video") + ": " + item.html;
                        return shortText(item.html);
                    }
                });
            }

            function init() {
                updateQuality();
                option.qualityid = option.id;
                art.on("restart", function () {
                    if (option.qualityid === option.id) {
                        var autoPlayback = art.layers["auto-playback"];
                        if (autoPlayback) art.constructor.utils.setStyle(autoPlayback, "display", "none");
                    } else {
                        option.qualityid = option.id;
                        updateQuality();
                    }
                });
            }

            i18n.update({ "zh-cn": { "Switch Video": "切换画质" } });
            if (art.isReady) init(); else art.once("ready", init);
            return { name: "quality" };
        };
    };

    obj.pluginPlaylist = function () {
        return function (art) {
            var i18n = art.i18n;
            var option = art.option;
            var controls = art.controls;
            var isMobile = art.constructor.utils.isMobile;
            var showtext = !isMobile;
            var icon = '<i class="art-icon"><svg class="icon" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" width="22" height="22"><path d="M810.666667 384H85.333333v85.333333h725.333334V384z m0-170.666667H85.333333v85.333334h725.333334v-85.333334zM85.333333 640h554.666667v-85.333333H85.333333v85.333333z m640-85.333333v256l213.333334-128-213.333334-128z" fill="#ffffff"></path></svg></i>';

            function init() {
                art.once("ready", function () {
                    var filelist = option.filelist || [];
                    if (filelist.length <= 1) {
                        if (controls.hasOwnProperty("playlist")) controls.remove("playlist");
                        return;
                    }
                    controls.update({
                        html: showtext ? i18n.get("PlayList") : icon,
                        name: "playlist",
                        position: "right",
                        style: { paddingLeft: "10px", paddingRight: "10px" },
                        selector: filelist.map(function (f) { return Object.assign({}, f, { html: f.name, style: { textAlign: "left" } }); }),
                        onSelect: function (item) {
                            option.file = item;
                            if (typeof item.open === "function") item.open();
                            return showtext ? i18n.get("PlayList") : icon;
                        }
                    });
                });
            }

            i18n.update({ "zh-cn": { PlayList: "播放列表" } });
            init();
            return { name: "playlist" };
        };
    };

    obj.pluginPlaybackRate = function () {
        return function (art) {
            var i18n = art.i18n;
            var icons = art.icons;
            var storage = art.storage;
            var setting = art.setting;
            var contextmenu = art.contextmenu;
            var layers = art.layers;
            var notice = art.notice;
            var PLAYBACK_RATE = art.constructor.PLAYBACK_RATE;
            var SETTING_ITEM_WIDTH = art.constructor.SETTING_ITEM_WIDTH;
            var utils = art.constructor.utils;
            var query = utils.query;
            var append = utils.append;
            var setStyle = utils.setStyle;
            var inverseClass = utils.inverseClass;
            var isMobile = utils.isMobile;

        function getAutoPlaybackRateLayer() {
            return layers["auto-playbackrate"] || layers.update({
                name: "auto-playbackrate",
                html: '<div>播放速度</div><input type="number" value="' + art.playbackRate + '" style="min-height: 20px;border: none; border-radius: 3px;text-align: center;" step=".01" max="16" min=".1"><div class="art-auto-playback-close"><i class="art-icon art-icon-close"><svg class="icon" viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg" width="22" height="22" style="fill: var(--art-theme);width: 15px;height: 15px;"><path d="m571.733 512 268.8-268.8c17.067-17.067 17.067-42.667 0-59.733-17.066-17.067-42.666-17.067-59.733 0L512 452.267l-268.8-268.8c-17.067-17.067-42.667-17.067-59.733 0-17.067 17.066-17.067 42.666 0 59.733l268.8 268.8-268.8 268.8c-17.067 17.067-17.067 42.667 0 59.733 8.533 8.534 19.2 12.8 29.866 12.8s21.334-4.266 29.867-12.8l268.8-268.8 268.8 268.8c8.533 8.534 19.2 12.8 29.867 12.8s21.333-4.266 29.866-12.8c17.067-17.066 17.067-42.666 0-59.733L571.733 512z"></path></svg></i></div>',
                tooltip: "",
                style: {
                    "border-radius": "var(--art-border-radius)",
                    left: "var(--art-padding)",
                    bottom: "calc(var(--art-control-height) + var(--art-bottom-gap) + 10px)",
                    "background-color": "var(--art-widget-background)",
                    "align-items": "center",
                    gap: "10px",
                    padding: "10px",
                    "line-height": 1,
                    display: "none",
                    position: "absolute"
                },
                mounted: function (el) {
                    var input = query("input", el);
                    var closeBtn = query(".art-auto-playback-close", el);
                    art.proxy(input, "change", function () {
                        art.playbackRate = input.value;
                    });
                    art.proxy(closeBtn, "click", function () {
                        setStyle(el, "display", "none");
                    });
                }
            });
        }

        function formatRate(t) {
            if (t === 1) return i18n.get("Normal");
            if (t) return t.toFixed(2);
            return i18n.get("Custom");
        }

        function getCurrentRateIndex() {
            return PLAYBACK_RATE.includes(art.playbackRate) ? art.playbackRate : 0;
        }

        function checkCurrentRate() {
            var item = setting.find("playback-rate-" + getCurrentRateIndex());
            if (item) setting.check(item);
        }

        function init() {
            art.on("video:ratechange", function () {
                storage.set("playbackRate", art.playbackRate);
            });
            var savedRate = storage.get("playbackRate");
            if (savedRate) art.playbackRate = Number(savedRate);
        }

        i18n.update({ "zh-cn": { Normal: "正常", Custom: "自定义", "Play Speed": "播放速度" } });
        PLAYBACK_RATE.unshift(0);

        setting.update({
            width: SETTING_ITEM_WIDTH,
            name: "playback-rate",
            html: i18n.get("Play Speed"),
            tooltip: formatRate(art.playbackRate),
            icon: icons.playbackRate,
            selector: PLAYBACK_RATE.map(function (r) {
                return { value: r, name: "playback-rate-" + r, default: r === getCurrentRateIndex(), html: formatRate(r) };
            }),
            onSelect: function (item) {
                if (item.value) {
                    art.playbackRate = item.value;
                    setStyle(getAutoPlaybackRateLayer(), "display", "none");
                } else {
                    query("input", getAutoPlaybackRateLayer()).value = art.playbackRate;
                    setStyle(getAutoPlaybackRateLayer(), "display", "flex");
                }
                return item.html;
            },
            mounted: function () {
                checkCurrentRate();
                art.on("video:ratechange", checkCurrentRate);
            }
        });

        contextmenu.update({
            index: 10,
            name: "playbackRate",
            html: i18n.get("Play Speed") + ": " + PLAYBACK_RATE.map(function (r) {
                return '<span data-value="' + r + '">' + formatRate(r) + '</span>';
            }).join(""),
            click: function (menu, event) {
                menu.show = false;
                var value = event.target.dataset.value;
                if (Number(value)) {
                    art.playbackRate = Number(value);
                    setStyle(getAutoPlaybackRateLayer(), "display", "none");
                } else {
                    query("input", getAutoPlaybackRateLayer()).value = art.playbackRate;
                    setStyle(getAutoPlaybackRateLayer(), "display", "flex");
                }
            },
            mounted: function (el) {
                var current = query("[data-value='" + getCurrentRateIndex() + "']", el);
                if (current) inverseClass(current, "art-current");
                art.on("video:ratechange", function () {
                    var item = query("[data-value='" + getCurrentRateIndex() + "']", el);
                    if (item) inverseClass(item, "art-current");
                });
            }
        });

        if (art.isReady) init(); else art.once("ready", init);
        return { name: "playbackRate" };
        };
    };

    obj.pluginSubtitle = function () {
        return function (art) {
            var i18n = art.i18n;
            var option = art.option;
            var notice = art.notice;
            var storage = art.storage;
            var setting = art.setting;
            var controls = art.controls;
            var template = art.template;
            var subtitle = art.subtitle;
            var contextmenu = art.contextmenu;
            var utils = art.constructor.utils;
            var isMobile = utils.isMobile;
            var append = utils.append;
            var query = utils.query;
            var inverseClass = utils.inverseClass;
            var showtext = !isMobile;
        var subIcon = '<i class="art-icon"><svg xmlns="http://www.w3.org/2000/svg" height="24" width="24" viewBox="0 0 48 48"><path d="M0 0h48v48H0z" fill="none"/><path fill="#ffffff" d="M40 8H8c-2.21 0-4 1.79-4 4v24c0 2.21 1.79 4 4 4h32c2.21 0 4-1.79 4-4V12c0-2.21-1.79-4-4-4zM8 24h8v4H8v-4zm20 12H8v-4h20v4zm12 0h-8v-4h8v4zm0-8H20v-4h20v4z"/></svg></i>';
        var colorTooltip = '<label style="font-size: 0;padding: 4px;display: inline-block;"><span style="width: 20px;height: 20px;display: inline-block;border-radius: 50%;box-sizing: border-box;cursor: pointer;background: #FE9200;"></span></label>';

        function readFileAsText(file) {
            return new Promise(function (resolve, reject) {
                var reader = new FileReader();
                reader.readAsText(file, "UTF-8");
                reader.onload = function () {
                    var text = reader.result;
                    if (text.indexOf(" ") > -1 && !reader.markGBK) {
                        reader.markGBK = true;
                        reader.readAsText(file, "GBK");
                    } else if (text.indexOf("") > -1 && !reader.markBIG5) {
                        reader.markBIG5 = true;
                        reader.readAsText(file, "BIG5");
                    } else {
                        resolve(text);
                    }
                };
                reader.onerror = reject;
            });
        }

        function textToBlobUrl(text) {
            var blob = new Blob([text], { type: "text/plain" });
            return URL.createObjectURL(blob);
        }

        function loadLocalSubtitle(file) {
            return readFileAsText(file).then(textToBlobUrl).then(function (url) {
                var ext = file.name.split(".").pop().toLowerCase();
                return { url: url, type: ext, name: file.name, html: "本地字幕「" + ext + "」" };
            });
        }

        function applySubtitleList(list) {
            if (!list || list.length < 1) return;
            var current = list.find(function (s) { return s.default; }) || list[0];
            var subOpts = Object.assign({}, option.subtitle, { style: option.subtitle.style }, current);
            var subUrl = subOpts.url, subType = subOpts.type;
            Object.assign(option.subtitle, { url: subUrl, type: subType, escape: false });
            subtitle.init(Object.assign({}, subOpts)).then(function () {
                if (current.name) notice.show = "加载字幕: " + current.name;
            });
            controls.update({
                html: showtext ? "字幕列表" : subIcon,
                name: "subtitle",
                position: "right",
                style: { paddingLeft: "10px", paddingRight: "10px" },
                selector: list.map(function (s) { return Object.assign({}, s); }),
                onSelect: function (item) {
                    Object.assign(option.subtitle, { url: item.url, type: item.type });
                    subtitle.switch(item.url, subOpts).then(function () {
                        notice.show = "切换字幕: " + item.name;
                    });
                    return item.html;
                }
            });
        }

        function fetchAutoSubtitles() {
            if (typeof option.getUrl !== "function") return;
            var subUrl = option.getUrl("M3U8_SUBTITLE_SRT") + "&adToken=" + encodeURIComponent(option.adToken);
            fetch(subUrl).then(function (res) {
                return res.ok ? res.text() : Promise.reject();
            }).then(function (text) {
                var lines = (text || "").split("\n");
                var subs = [];
                try {
                    for (var i = 2; i < lines.length; i += 2) {
                        var line = lines[i] || "";
                        if (line.indexOf("#EXT-X-MEDIA:") !== -1) {
                            var parts = line.replace("#EXT-X-MEDIA:", "").split(",");
                            var sub = {};
                            for (var j = 0; j < parts.length; j++) {
                                var kv = parts[j].split("=");
                                sub[(kv[0] || "").toLowerCase().replace("-", "_")] = String(kv[1]).replace(/"/g, "");
                            }
                            sub.url = lines[i + 1];
                            subs.push(sub);
                        }
                    }
                } catch (e) {}
                return subs.map(function (s) {
                    return Object.assign({}, s, { type: "srt", html: s.name, default: s.default === "YES" });
                });
            }).then(function (subs) {
                option.sublist = (option.sublist || []).concat(subs);
                applySubtitleList(option.sublist);
            }).catch(function () {});
        }

        function init() {
            Object.assign(option.subtitle.style, {
                color: storage.get("subtitle-color"),
                bottom: storage.get("subtitle-bottom"),
                fontSize: storage.get("subtitle-fontSize"),
                fontWeight: storage.get("subtitle-fontWeight"),
                fontFamily: storage.get("subtitle-fontFamily"),
                textShadow: storage.get("subtitle-textShadow")
            });
            art.on("subtitle", function (show) { storage.set("subtitle", show); });
            var savedSub = storage.get("subtitle");
            if (typeof savedSub === "boolean") subtitle.show = savedSub;
            if ((option.sublist || []).length) applySubtitleList(option.sublist);
            fetchAutoSubtitles();
            option.subid = option.id;
            art.on("restart", function () {
                if (option.subid === option.id) {
                    var cached = controls.cache.get("subtitle");
                    if (cached && cached.option && cached.option.selector && cached.option.selector.length) {
                        applySubtitleList(cached.option.selector);
                    }
                } else {
                    option.subid = option.id;
                    if ((option.sublist || []).length) {
                        applySubtitleList(option.sublist);
                    } else {
                        template.$subtitle.innerHTML = "";
                        option.subtitle.url = "";
                        subtitle.createTrack("metadata", "");
                        if (controls.hasOwnProperty("subtitle")) controls.remove("subtitle");
                    }
                }
            });
        }

        setting.add({
            html: "字幕设置",
            name: "subtitle-setting",
            tooltip: "",
            icon: '<svg xmlns="http://www.w3.org/2000/svg" height="24" width="24" viewBox="0 0 48 48"><path d="M0 0h48v48H0z" fill="none"/><path fill="#ffffff" d="M40 8H8c-2.21 0-4 1.79-4 4v24c0 2.21 1.79 4 4 4h32c2.21 0 4-1.79 4-4V12c0-2.21-1.79-4-4-4zM8 24h8v4H8v-4zm20 12H8v-4h20v4zm12 0h-8v-4h8v4zm0-8H20v-4h20v4z"/></svg>',
            selector: [
                {
                    html: "显示", name: "subtitle", tooltip: "显示", switch: true,
                    onSwitch: function (item) {
                        item.tooltip = item.switch ? "隐藏" : "显示";
                        subtitle.show = !item.switch;
                        return !item.switch;
                    },
                    mounted: function (el, item) {
                        var show = subtitle.show;
                        item.switch = show;
                        item.tooltip = show ? "显示" : "隐藏";
                        art.on("subtitle", function (val) {
                            setTimeout(function () {
                                if (item.switch !== val) {
                                    item.switch = val;
                                    item.tooltip = val ? "显示" : "隐藏";
                                }
                            });
                        });
                    }
                },
                {
                    html: "字幕偏移", name: "subtitle-offset", tooltip: "0s", range: [0, -10, 10, 0.1],
                    onChange: function (item) {
                        var val = item.range[0];
                        art.subtitleOffset = val;
                        return val + "s";
                    },
                    mounted: function (el, item) {
                        art.on("subtitleOffset", function (val) {
                            setTimeout(function () {
                                item.$range.value = val;
                                item.tooltip = val + "s";
                            });
                        });
                    }
                },
                {
                    html: "字幕位置", name: "subtitle-bottom", tooltip: "5%", range: [5, 1, 90, 1],
                    onChange: function (item) {
                        var val = item.range[0] + "%";
                        subtitle.style({ bottom: val });
                        storage.set("subtitle-bottom", val);
                        return val;
                    },
                    mounted: function (el, item) {
                        var saved = storage.get("subtitle-bottom");
                        if (saved) { item.tooltip = saved; item.$range.value = parseFloat(saved); }
                    }
                },
                {
                    html: "字体大小", name: "subtitle-fontSize", tooltip: "25px", range: [25, 10, 60, 1],
                    onChange: function (item) {
                        var val = item.range[0] + "px";
                        subtitle.style({ fontSize: val });
                        storage.set("subtitle-fontSize", val);
                        return val;
                    },
                    mounted: function (el, item) {
                        var saved = storage.get("subtitle-fontSize");
                        if (saved) { item.tooltip = saved; item.$range.value = parseFloat(saved); }
                    }
                },
                {
                    html: "字体粗细", name: "subtitle-fontWeight", tooltip: 400, range: [400, 100, 900, 100],
                    onChange: function (item) {
                        var val = item.range[0];
                        storage.set("subtitle-fontWeight", val);
                        subtitle.style({ fontWeight: val });
                        return val;
                    },
                    mounted: function (el, item) {
                        var saved = storage.get("subtitle-fontWeight");
                        if (saved) { item.tooltip = saved; item.$range.value = saved; }
                    }
                },
                {
                    html: "字体颜色", name: "subtitle-color", tooltip: colorTooltip,
                    selector: [
                        { html: "预设", name: "color-presets", tooltip: '<style>.panel-setting-color label{font-size:0;padding:4px;display:inline-block}.panel-setting-color input{display:none}.panel-setting-color span{width:22px;height:22px;display:inline-block;border-radius:50%;box-sizing:border-box;cursor:pointer}</style><div class="panel-setting-color"><label><input type="radio" value="#fff"><span style="background:#fff"></span></label><label><input type="radio" value="#e54256"><span style="background:#e54256"></span></label><label><input type="radio" value="#ffe133"><span style="background:#ffe133"></span></label><label><input type="radio" value="#64DD17"><span style="background:#64DD17"></span></label><label><input type="radio" value="#39ccff"><span style="background:#39ccff"></span></label><label><input type="radio" value="#D500F9"><span style="background:#D500F9"></span></label></div>' },
                        { html: "默认颜色", name: "color-default", tooltip: colorTooltip },
                        { html: "颜色选择器", name: "color-picker", tooltip: colorTooltip.replace("#FE9200", "#000") }
                    ],
                    onSelect: function (item, control, event) {
                        switch (item.name) {
                            case "color-presets":
                                if (event.target.nodeName === "INPUT") {
                                    var color = event.target.value;
                                    subtitle.style({ color: color });
                                    storage.set("subtitle-color", color);
                                }
                                break;
                            case "color-default":
                                subtitle.style({ color: "#FE9200" });
                                storage.set("subtitle-color", "#FE9200");
                                break;
                            case "color-picker":
                                if (!template.$colorPicker) {
                                    template.$colorPicker = append(template.$player, '<input hidden type="color">');
                                    template.$colorPicker.oninput = function (e) {
                                        var c = e.target.value;
                                        subtitle.style({ color: c });
                                        storage.set("subtitle-color", c);
                                        item.tooltip = item.$parent.tooltip = colorTooltip.replace("#FE9200", c);
                                    };
                                }
                                template.$colorPicker.click();
                                break;
                        }
                        return colorTooltip.replace("#FE9200", template.$subtitle.style.color);
                    },
                    mounted: function (el, item) {
                        var saved = storage.get("subtitle-color");
                        if (saved) item.tooltip = colorTooltip.replace("#FE9200", saved);
                    }
                },
                {
                    html: "字体类型", name: "subtitle-fontFamily", tooltip: i18n.get("Default"),
                    selector: [
                        { html: "默认", text: "" },
                        { html: "等宽 衬线", value: '"Courier New", Courier, "Nimbus Mono L", "Cutive Mono", monospace' },
                        { html: "比例 衬线", value: '"Times New Roman", Times, Georgia, Cambria, "PT Serif Caption", serif' },
                        { html: "等宽 无衬线", value: '"Deja Vu Sans Mono", "Lucida Console", Monaco, Consolas, "PT Mono", monospace' },
                        { html: "比例 无衬线", value: '"YouTube Noto", Roboto, "Arial Unicode Ms", Arial, Helvetica, Verdana, "PT Sans Caption", sans-serif' },
                        { html: "Casual", value: '"Comic Sans MS", Impact, Handlee, fantasy' },
                        { html: "Cursive", value: '"Monotype Corsiva", "URW Chancery L", "Apple Chancery", "Dancing Script", cursive' },
                        { html: "Small Capitals", value: '"Arial Unicode Ms", Arial, Helvetica, Verdana, "Marcellus SC", sans-serif' }
                    ],
                    onSelect: function (item) {
                        storage.set("subtitle-fontFamily", item.html);
                        subtitle.style({ fontFamily: item.value });
                        return item.html;
                    },
                    mounted: function (el, item) {
                        var saved = storage.get("subtitle-fontFamily");
                        if (saved) item.tooltip = saved;
                    }
                },
                {
                    html: "描边样式", name: "subtitle-textShadow", tooltip: i18n.get("Default"),
                    selector: [
                        { html: "默认", value: "rgb(0 0 0) 1px 0 1px, rgb(0 0 0) 0 1px 1px, rgb(0 0 0) -1px 0 1px, rgb(0 0 0) 0 -1px 1px, rgb(0 0 0) 1px 1px 1px, rgb(0 0 0) -1px -1px 1px, rgb(0 0 0) 1px -1px 1px, rgb(0 0 0) -1px 1px 1px" },
                        { html: "重墨", value: "rgb(0, 0, 0) 1px 0px 1px, rgb(0, 0, 0) 0px 1px 1px, rgb(0, 0, 0) 0px -1px 1px, rgb(0, 0, 0) -1px 0px 1px" },
                        { html: "描边", value: "rgb(0, 0, 0) 0px 0px 1px, rgb(0, 0, 0) 0px 0px 1px, rgb(0, 0, 0) 0px 0px 1px" },
                        { html: "45°投影", value: "rgb(0, 0, 0) 1px 1px 2px, rgb(0, 0, 0) 0px 0px 1px" },
                        { html: "阴影", value: "rgb(34, 34, 34) 1px 1px 1.4875px, rgb(34, 34, 34) 1px 1px 1.98333px, rgb(34, 34, 34) 1px 1px 2.47917px" },
                        { html: "凸起", value: "rgb(34, 34, 34) 1px 1px" },
                        { html: "下沉", value: "rgb(204, 204, 204) 1px 1px, rgb(34, 34, 34) -1px -1px" },
                        { html: "边框", value: "rgb(34, 34, 34) 0px 0px 1px, rgb(34, 34, 34) 0px 0px 1px, rgb(34, 34, 34) 0px 0px 1px, rgb(34, 34, 34) 0px 0px 1px, rgb(34, 34, 34) 0px 0px 1px" }
                    ],
                    onSelect: function (item) {
                        storage.set("subtitle-textShadow", item.html);
                        subtitle.style({ textShadow: item.value });
                        return item.html;
                    },
                    mounted: function (el, item) {
                        var saved = storage.get("subtitle-textShadow");
                        if (saved) item.tooltip = saved;
                    }
                },
                {
                    name: "subtitle-load", html: "加载字幕",
                    selector: [{ html: "本地文件", name: "file" }],
                    onSelect: function (item) {
                        return function () {
                            if (item.name === "file") {
                                if (!template.$subtitleLocalFile) {
                                    template.$subtitleLocalFile = append(template.$container, '<input class="subtitleLocalFile" type="file" accept="webvtt,.vtt,.srt,.ssa,.ass" style="display: none;">');
                                }
                                template.$subtitleLocalFile.click();
                                template.$subtitleLocalFile.onchange = function (e) {
                                    if (e.target.files.length) {
                                        var file = e.target.files[0];
                                        loadLocalSubtitle(file).then(function (subItem) {
                                            option.sublist = (option.sublist || []).concat([subItem]);
                                            applySubtitleList(option.sublist);
                                        });
                                    }
                                    e.target.value = "";
                                };
                            }
                        }, "";
                    }
                }
            ]
        });

        contextmenu.update({
            name: "subtitle",
            index: 31,
            html: "字幕显示: " + [1, 0].map(function (v) { return '<span data-value="' + v + '">' + (v ? "显示" : "隐藏") + '</span>'; }).join(""),
            click: function (menu, event) {
                inverseClass(event.target, "art-current");
                var value = event.target.dataset.value;
                subtitle.show = Boolean(Number(value));
                menu.show = false;
            },
            mounted: function (el) {
                var current = query("[data-value='" + Number(subtitle.show) + "']", el);
                if (current) inverseClass(current, "art-current");
                art.on("subtitle", function (show) {
                    var item = query("[data-value='" + Number(show) + "']", el);
                    if (item) inverseClass(item, "art-current");
                });
            }
        });

        if (art.isReady) init(); else art.once("ready", init);
        return { name: "subtitle" };
        };
    };

    obj.pluginImageFilter = function () {
        return function (art) {
            var notice = art.notice;
            var storage = art.storage;
            var setting = art.setting;
            var videoStyle = art.template.$video.style;

        function applyFilter() {
            var filter = storage.get("filter") || {};
            var sat = filter.saturate || 1;
            var brt = filter.brightness || 1;
            var cnt = filter.contrast || 1;
            videoStyle.filter = "saturate(" + sat + ") brightness(" + brt + ") contrast(" + cnt + ")";
        }

        function init() {
            applyFilter();
        }

        setting.update({
            html: "色彩滤镜",
            name: "filter",
            tooltip: "",
            selector: [
                {
                    html: "饱和度", name: "saturate", tooltip: 100, range: [100, 0, 255, 1],
                    onRange: function (item) {
                        var val = item.range[0];
                        notice.show = "饱和度: " + val;
                        storage.set("filter", Object.assign({}, storage.get("filter"), { saturate: val / 100 }));
                        applyFilter();
                        return val;
                    },
                    mounted: function (el, item) {
                        var filter = storage.get("filter") || {};
                        if (filter.saturate) { item.$range.value = 100 * filter.saturate; item.tooltip = 100 * filter.saturate; }
                    }
                },
                {
                    html: "亮度", name: "brightness", tooltip: 100, range: [100, 0, 255, 1],
                    onRange: function (item) {
                        var val = item.range[0];
                        notice.show = "亮度: " + val;
                        storage.set("filter", Object.assign({}, storage.get("filter"), { brightness: val / 100 }));
                        applyFilter();
                        return val;
                    },
                    mounted: function (el, item) {
                        var filter = storage.get("filter") || {};
                        if (filter.brightness) { item.$range.value = 100 * filter.brightness; item.tooltip = 100 * filter.brightness; }
                    }
                },
                {
                    html: "对比度", name: "contrast", tooltip: 100, range: [100, 0, 255, 1],
                    onRange: function (item) {
                        var val = item.range[0];
                        notice.show = "对比度: " + val;
                        storage.set("filter", Object.assign({}, storage.get("filter"), { contrast: val / 100 }));
                        applyFilter();
                        return val;
                    },
                    mounted: function (el, item) {
                        var filter = storage.get("filter") || {};
                        if (filter.contrast) { item.$range.value = 100 * filter.contrast; item.tooltip = 100 * filter.contrast; }
                    }
                },
                {
                    html: "预设「1」", name: "filter-presets", tooltip: "",
                    onSelect: function () {
                        var satSetting = setting.find("saturate");
                        var brtSetting = setting.find("brightness");
                        var cntSetting = setting.find("contrast");
                        satSetting.tooltip = 110; satSetting.$range.value = 110;
                        brtSetting.tooltip = 105; brtSetting.$range.value = 105;
                        cntSetting.tooltip = 101; cntSetting.$range.value = 101;
                        storage.set("filter", { saturate: 1.1, brightness: 1.05, contrast: 1.01 });
                        videoStyle.filter = "saturate(1.1) brightness(1.05) contrast(1.01)";
                        return "预设「1」";
                    }
                },
                {
                    html: "默认", name: "filter-default", tooltip: "",
                    onSelect: function () {
                        var satSetting = setting.find("saturate");
                        var brtSetting = setting.find("brightness");
                        var cntSetting = setting.find("contrast");
                        satSetting.tooltip = 100; satSetting.$range.value = 100;
                        brtSetting.tooltip = 100; brtSetting.$range.value = 100;
                        cntSetting.tooltip = 100; cntSetting.$range.value = 100;
                        storage.set("filter", { saturate: 1, brightness: 1, contrast: 1 });
                        videoStyle.filter = "";
                        return "默认";
                    }
                }
            ]
        });

        if (art.isReady) init(); else art.once("ready", init);
        return { name: "imagefilter" };
        };
    };

    obj.pluginPlaySetting = function () {
        return function (art) {
            var notice = art.notice;
            var storage = art.storage;
            var setting = art.setting;
            var controls = art.controls;
            var throttle = art.constructor.utils.throttle;

        function init() {
            if (storage.get("auto-fullscreen")) art.fullscreenWeb = true;
            art.startTime = storage.get("startTime");
            art.endTime = storage.get("endTime");
            art.on("video:timeupdate", throttle(function () {
                var currentTime = art.currentTime;
                var duration = art.duration;
                var startTime = art.startTime;
                var endTime = art.endTime;
                if (startTime || endTime) {
                    var ranges = [[0, startTime || 0], [endTime ? duration - endTime : 0, endTime ? duration : 0]];
                    for (var i = 0; i < ranges.length; i++) {
                        if (currentTime >= ranges[i][0] && currentTime < ranges[i][1]) {
                            art.seek = ranges[i][1];
                            break;
                        }
                    }
                }
            }, 1000));
            art.on("video:ended", function () {
                if (storage.get("auto-next") && controls.hasOwnProperty("playlist")) {
                    var selector = controls.cache.get("playlist").option.selector;
                    var next = selector[selector.findIndex(function (s) { return s.default; }) + 1];
                    if (next) next.$control_item.click();
                    else notice.show = "没有下一集了";
                }
            });
        }

        setting.update({
            html: "播放设置",
            name: "play-setting",
            tooltip: "",
            selector: [
                {
                    html: "自动下一集", name: "auto-next", tooltip: "关闭", switch: false,
                    onSwitch: function (item) {
                        item.tooltip = item.switch ? "关闭" : "开启";
                        storage.set("auto-next", !item.switch);
                        notice.show = "自动下一集: " + (item.switch ? "关闭" : "开启");
                        return !item.switch;
                    },
                    mounted: function (el, item) {
                        if (storage.get("auto-next")) { item.tooltip = "开启"; item.switch = true; }
                    }
                },
                {
                    html: "自动全屏", name: "auto-fullscreen", tooltip: "关闭", switch: false,
                    onSwitch: function (item) {
                        item.tooltip = item.switch ? "关闭" : "开启";
                        art.fullscreenWeb = !item.switch;
                        storage.set("auto-fullscreen", !item.switch);
                        notice.show = "自动全屏: " + (item.switch ? "关闭" : "开启");
                        return !item.switch;
                    },
                    mounted: function (el, item) {
                        if (storage.get("auto-fullscreen")) { item.tooltip = "开启"; item.switch = true; }
                    }
                },
                {
                    html: "跳过片头", tooltip: "0s", range: [0, 0, 120, 1],
                    onChange: function (item) {
                        var val = item.range[0];
                        art.startTime = val;
                        storage.set("startTime", val);
                        notice.show = "跳过片头: " + val + " 秒";
                        return val + "s";
                    },
                    mounted: function (el, item) {
                        var saved = storage.get("startTime");
                        if (saved) { item.range = [saved, 0, 120, 1]; item.tooltip = saved + "s"; }
                    }
                },
                {
                    html: "跳过片尾", tooltip: "0s", range: [0, 0, 120, 1],
                    onChange: function (item) {
                        var val = item.range[0];
                        art.endTime = val;
                        storage.set("endTime", val);
                        notice.show = "跳过片尾: " + val + " 秒";
                        return val + "s";
                    },
                    mounted: function (el, item) {
                        var saved = storage.get("endTime");
                        if (saved) { item.range = [saved, 0, 120, 1]; item.tooltip = saved + "s"; }
                    }
                }
            ]
        });

        if (art.isReady) init(); else art.once("ready", init);
        return { name: "play" };
        };
    };

    obj.pluginHotkey = function () {
        return function (art) {
            var proxy = art.proxy;
            var option = art.option;
            var isMobile = art.constructor.utils.isMobile;

            function init() {
                if (option.hotkey && !isMobile) {
                    art.isFocus = true;
                }
                art.on("blur", function () {
                    if (option.hotkey && !isMobile) art.isFocus = true;
                });
            }

            if (art.isReady) init(); else art.once("ready", init);
            return { name: "hotkey" };
        };
    };

    obj.destroyPlayer = function () {
        var flag = obj.video_page.flag;
        var count, id;
        if (flag === "sharevideo" || flag === "playvideo") {
            unsafeWindow.require.async("file-widget-1:videoPlay/context.js", function (context) {
                id = count = setInterval(function () {
                    var playerInstance = context && context.getContext && context.getContext() && context.getContext().playerInstance;
                    if (playerInstance && playerInstance.player) {
                        clearInterval(id);
                        playerInstance.player.dispose();
                        playerInstance.player = false;
                    } else if (++count - id > 60) {
                        clearInterval(id);
                    }
                }, 500);
            });
        } else if (flag === "video" || flag === "mboxvideo") {
            id = count = setInterval(function () {
                var playerInstance = obj.videoNode && obj.videoNode.firstChild;
                if (playerInstance && playerInstance.player) {
                    clearInterval(id);
                    playerInstance.player.dispose();
                    playerInstance.player = false;
                    obj.videoNode = null;
                } else if (++count - id > 60) {
                    clearInterval(id);
                    obj.videoNode = null;
                }
            }, 500);
        } else {
            obj.videoNode = null;
        }
    };

    obj.getVip = function () {
        if (unsafeWindow.yunData && !unsafeWindow.yunData.neglect) {
            return unsafeWindow.yunData.ISSVIP === 1 ? 2 : unsafeWindow.yunData.ISVIP === 1 ? 1 : 0;
        }
        if (unsafeWindow.locals) {
            if (unsafeWindow.locals.get) {
                return unsafeWindow.locals.get("is_svip") === 1 ? 2 : unsafeWindow.locals.get("is_vip") === 1 ? 1 : 0;
            }
            return unsafeWindow.locals.is_svip === 1 ? 2 : unsafeWindow.locals.is_vip === 1 ? 1 : 0;
        }
        return 0;
    };

    obj.getAdToken = function () {
        if (obj.video_page.adToken || obj.getVip() > 1) {
            return Promise.resolve(obj.video_page.adToken);
        }
        var getUrl = obj.video_page.getUrl;
        var url = getUrl(obj.getBPSType());
        return fetch(url).then(function (response) {
            return response.text();
        }).then(function (text) {
            var response;
            try { response = JSON.parse(text); } catch (e) { response = null; }
            if (response && response.errno === 133 && response.adTime !== 0) {
                obj.video_page.adToken = response.adToken;
            }
            return obj.video_page.adToken;
        });
    };

    obj.addQuality = function () {
        var resolution = obj.video_page.file.resolution;
        var getUrl = obj.video_page.getUrl;
        var adToken = obj.video_page.adToken;
        var templates = {
            1080: "超清 1080P",
            720: "高清 720P",
            480: "流畅 480P",
            360: "省流 360P"
        };
        var freeList = obj.freeList(resolution);
        obj.video_page.quality = freeList.map(function (tpl, index) {
            return {
                html: templates[tpl],
                url: getUrl(obj.getBPSType(tpl)) + "&adToken=" + encodeURIComponent(adToken),
                default: index === 0,
                type: "hls"
            };
        });
        return obj.video_page.quality;
    };

    obj.freeList = function (resolution) {
        resolution = resolution || "";
        var list = [480, 360];
        var match = resolution.match(/width:(\d+),height:(\d+)/) || ["", "", ""];
        var pixels = +match[1] * +match[2];
        if (pixels) {
            if (pixels > 409920) list.unshift(720);
            if (pixels > 921600) list.unshift(1080);
        }
        return list;
    };

    obj.getBPSType = function (value) {
        return "M3U8_AUTO_" + (value || 480);
    };

    obj.addFilelist = function () {
        var flag = obj.video_page.flag;
        var file = obj.video_page.file;
        var filelist = obj.video_page.filelist;
        if (!filelist || !filelist.length) return;
        if (flag === "sharevideo") {
            var currentList = JSON.parse(sessionStorage.getItem("currentList") || "[]");
            if (currentList.length) {
                currentList.forEach(function (item) {
                    if (item.category == 1) {
                        item.name = item.server_filename;
                        item.open = function () {
                            location.href = "https://pan.baidu.com" + location.pathname + "?fid=" + item.fs_id;
                        };
                        filelist.push(item);
                    }
                });
            }
        } else if (flag === "playvideo") {
            filelist.forEach(function (item, index) {
                item.name = item.server_filename;
                item.open = function () {
                    location.href = "https://pan.baidu.com" + location.pathname + "#/video?path=" + encodeURIComponent(item.path) + "&t=" + index;
                };
            });
        } else if (flag === "video") {
            filelist.forEach(function (item) {
                item.name = item.name || item.server_filename;
                item.open = function () {
                    location.href = "https://pan.baidu.com/pfile/video?path=" + encodeURIComponent(item.path);
                };
            });
        }
        var found = filelist.find(function (item) { return item.fs_id == file.fs_id; });
        if (found) found.default = true;
    };

    obj.startObj = function () {
        return Promise.resolve(obj);
    };

    obj.ready = function (state) {
        state = state || 3;
        return new Promise(function (resolve) {
            var states = ["uninitialized", "loading", "loaded", "interactive", "complete"];
            state = Math.min(state, states.length - 1);
            if (states.indexOf(document.readyState) >= state) {
                setTimeout(resolve);
            } else {
                document.onreadystatechange = function () {
                    if (states.indexOf(document.readyState) >= state) {
                        document.onreadystatechange = null;
                        setTimeout(resolve);
                    }
                };
            }
        });
    };

    obj.delay = function (ms) {
        return new Promise(function (resolve) { setTimeout(resolve, ms || 500); });
    };

    obj.showTip = function (msg, mode, durtime) {
        if (unsafeWindow.require) {
            unsafeWindow.require("system-core:system/uiService/tip/tip.js").show({
                vipType: "svip",
                mode: mode,
                msg: msg
            });
        } else if (unsafeWindow.toast) {
            unsafeWindow.toast.show({
                type: ["caution", "failure"].indexOf(mode) >= 0 ? "wide" : "svip",
                message: msg,
                duration: durtime || 3000
            });
        } else if (unsafeWindow.$bus) {
            unsafeWindow.$bus.$Toast.addToast({
                type: { caution: "tip", failure: "error" }[mode] || mode,
                content: msg,
                durtime: durtime || 3000
            });
        } else if (unsafeWindow.VueApp) {
            unsafeWindow.VueApp.$Toast.addToast({
                type: { caution: "tip", failure: "error" }[mode] || mode,
                content: msg,
                durtime: durtime || 3000
            });
        }
    };

    (function run() {
        var url = location.href;
        if (url.indexOf(".baidu.com/s/") > 0) {
            obj.ready().then(function () { obj.sharevideo(); });
        } else if (url.indexOf(".baidu.com/play/video#/video") > 0) {
            obj.ready().then(function () { obj.playvideo(); });
            window.onhashchange = function () { location.reload(); };
        } else if (url.indexOf(".baidu.com/pfile/video") > 0) {
            obj.ready().then(obj.video);
        } else if (url.indexOf(".baidu.com/pfile/mboxvideo") > 0) {
            obj.ready().then(obj.mboxvideo);
        } else if (url.indexOf(".baidu.com/wap") > 0) {
            obj.ready(4).then(function () {
                var appEl = document.getElementById("app");
                if (appEl && appEl.__vue__) {
                    var $router = appEl.__vue__.$router;
                    $router.onReady(function () {
                        var currentRoute = $router.currentRoute;
                        if (currentRoute && currentRoute.name === "videoView") {
                            obj.videoView();
                        }
                        $router.afterEach(function (to, from) {
                            if (to.name !== from.name) {
                                obj.video_page.flag = to.name;
                                if (to.name === "videoView") location.reload();
                            }
                        });
                    });
                }
            });
        }
    })();

})();
