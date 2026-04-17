// ==UserScript==
// @name         阿里云盘视频增强
// @namespace    https://github.com/Huang131/userscripts
// @version      1.0.0
// @description  替换阿里云盘原生播放器为 Artplayer+HLS.js，支持画质切换、播放列表、自动连播、字幕加载与切换、分享页播放
// @author       Huang131
// @license      MIT
// @homepageURL  https://github.com/Huang131/userscripts
// @supportURL   https://github.com/Huang131/userscripts/issues
// @match        https://www.alipan.com/*
// @match        https://www.aliyundrive.com/*
// @connect      alipan.com
// @connect      aliyundrive.com
// @connect      cn-beijing-video-preview.aliyundrive.net
// @connect      cn-shanghai-video-preview.aliyundrive.net
// @connect      cn-hangzhou-video-preview.aliyundrive.net
// @connect      cn-shenzhen-video-preview.aliyundrive.net
// @require      https://unpkg.com/hls.js@1.5.15/dist/hls.min.js
// @require      https://unpkg.com/artplayer@5.2.3/dist/artplayer.js
// @icon         https://gw.alicdn.com/imgextra/i3/O1CN01aj9rdD1GS0E8io11t_!!6000000000620-73-tps-16-16.ico
// @run-at       document-start
// @grant        unsafeWindow
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @compatible   chrome
// @compatible   firefox
// @compatible   edge
// ==/UserScript==

/**
 * 阿里云盘视频增强脚本
 *
 * 核心功能：
 * - 拦截阿里云盘页面的 XHR 请求，获取文件列表和视频播放信息
 * - 替换原生视频播放器为 Artplayer + HLS.js，支持多画质、字幕、播放列表
 * - 支持分享页视频播放（通过 saveFile → getPlayInfo → deleteFile 流程）
 *
 * 模块结构：
 * - CONFIG  : 常量配置（API地址、超时时间、画质/字幕映射等）
 * - Store   : 存储层（网站自有数据走 localStorage，脚本私有数据走 GM_getValue/GM_setValue）
 * - Notify  : 通知系统（页面顶部 Toast 提示）
 * - API     : 阿里云盘 API 调用（Token 刷新、视频预览、下载链接、文件操作）
 * - App     : 主流程编排（XHR 监听、文件管理、播放器创建、字幕加载）
 */

(function () {
    'use strict';

    var CONFIG = {
        API_BASE: 'https://api.aliyundrive.com',
        URL_EXPIRE_SEC: 14400,
        TIP_DURATION: { SHORT: 3e3, MEDIUM: 5e3, LONG: 10e3 },
        CANARY_HEADER: 'client=windows,app=adrive,version=v6.0.0',
        MAX_REPLACE_RETRIES: 20,
        REPLACE_RETRY_INTERVAL: 500,
        QUALITY_MAP: {
            QHD: '1440 超清',
            FHD: '1080 全高清',
            HD: '720 高清',
            SD: '540 标清',
            LD: '360 流畅'
        },
        SUBTITLE_LANG_MAP: {
            chi: '中文字幕',
            zho: '中文字幕',
            eng: '英文字幕',
            jpn: '日文字幕'
        }
    };

    /**
     * 白名单机制：这些 key 由阿里云盘网站自身写入 localStorage，
     * 脚本需要读取它们（如 token、shareToken），因此必须走 localStorage。
     * 其他脚本私有数据走 GM_getValue/GM_setValue（油猴沙箱，更安全）。
     */
    var WEBSITE_KEYS = ['token', 'shareToken'];

    /**
     * 存储层：统一封装 localStorage 和 GM 存储的读写操作。
     * - 白名单 key → localStorage（与阿里云盘网站共享数据）
     * - 其他 key → GM_getValue/GM_setValue（油猴沙箱隔离存储）
     */
    var Store = {
        get: function (key) {
            if (WEBSITE_KEYS.includes(key)) {
                var value = localStorage.getItem(key);
                if (!value) return null;
                try { return JSON.parse(value); } catch (e) { return value; }
            }
            var value = GM_getValue(key);
            if (!value) return null;
            try { return JSON.parse(value); } catch (e) { return value; }
        },
        set: function (key, value) {
            if (!key || value == undefined) return;
            var serialized = value instanceof Object ? JSON.stringify(value) : value;
            if (WEBSITE_KEYS.includes(key)) {
                localStorage.setItem(key, serialized);
            } else {
                GM_setValue(key, serialized);
            }
        },
        remove: function (key) {
            if (key == undefined) return;
            if (WEBSITE_KEYS.includes(key)) {
                localStorage.removeItem(key);
            } else {
                GM_deleteValue(key);
            }
        }
    };

    /**
     * 通知系统：在页面顶部显示 Toast 提示。
     * 兼容阿里云盘自有的 application.showNotify 接口，
     * 若不存在则注入自定义通知 DOM。
     */
    var Notify = {
        _injected: false,
        _notifySets: {
            type_class_obj: { success: 'alert-success', fail: 'alert-fail', loading: 'alert-loading' },
            count: 0
        },

        _inject: function () {
            if (this._injected) return;
            if (unsafeWindow.application) { this._injected = true; return; }

            var css = [
                '.notify{display:none;position:absolute;top:0;left:25%;width:50%;text-align:center;overflow:hidden;z-index:1010}',
                '.notify .alert{display:inline-block;min-width:110px;white-space:nowrap}',
                '.alert-success,.alert-fail,.alert-loading{padding:0 20px;line-height:34px;font-size:14px;color:#ffffff}',
                '.alert-success,.alert-loading{background:#36be63}',
                '.alert-fail{background:#ff794a}',
                '.fade{opacity:0;transition:opacity .15s linear}',
                '.fade.in{opacity:1}'
            ];

            var style = document.createElement('style');
            style.id = 'J_Notify_Style';
            style.textContent = css.join(' ');
            (document.head || document.documentElement).appendChild(style);

            var notifyDiv = document.createElement('div');
            notifyDiv.id = 'J_Notify';
            notifyDiv.className = 'notify';
            notifyDiv.style.cssText = 'width: 650px; margin: 10px auto; display: none;';
            document.body.appendChild(notifyDiv);

            var self = this;
            unsafeWindow.application = {
                showNotify: function (opts) { self._show(opts); },
                hideNotify: function () { self._hide(); }
            };
            this._injected = true;
        },

        _show: function (opts) {
            var class_obj = this._notifySets.type_class_obj;
            var count = this._notifySets.count;
            var notifyEl = document.getElementById('J_Notify');
            if (!notifyEl) return;

            if (!notifyEl.querySelector('.alert')) {
                notifyEl.innerHTML = '<div class="alert in fade"></div>';
                notifyEl.style.display = 'block';
            } else {
                Object.keys(class_obj).forEach(function (key) {
                    notifyEl.querySelector('.alert').classList.remove(class_obj[key]);
                });
            }

            var alertEl = notifyEl.querySelector('.alert');
            alertEl.textContent = opts.message;
            alertEl.classList.add(class_obj[opts.type]);
            this._notifySets.count += 1;

            var delay = opts.time || (opts.type === 'loading' ? 15e3 : CONFIG.TIP_DURATION.SHORT);
            var currentCount = count;
            var self = this;
            setTimeout(function () {
                if (currentCount + 1 === self._notifySets.count) {
                    self._hide();
                }
            }, delay);
        },

        _hide: function () {
            var notifyEl = document.getElementById('J_Notify');
            if (notifyEl) {
                notifyEl.innerHTML = '';
                notifyEl.style.display = 'none';
            }
        },

        success: function (message, time) {
            this._inject();
            unsafeWindow.application.showNotify({ type: 'success', message: message, time: time });
        },

        error: function (message, time) {
            this._inject();
            unsafeWindow.application.showNotify({ type: 'fail', message: message, time: time });
        },

        loading: function (message, time) {
            this._inject();
            unsafeWindow.application.showNotify({ type: 'loading', message: message, time: time });
        }
    };

    /**
     * 阿里云盘 API 调用层。
     * 所有请求自动附带 Token 刷新逻辑，确保 Authorization 头有效。
     */
    var API = {
        /** 检查 Token 是否仍在有效期内 */
        tokenIsValid: function (token) {
            if (!token || !token.expire_time || !token.expires_in) return false;
            var remaining = Date.parse(token.expire_time) - Date.now();
            return remaining > 0 && remaining < Number(token.expires_in) * 1000;
        },

        /** 刷新 Token：若当前 Token 有效则直接返回，否则调用 /token/refresh 接口 */
        refresh: function () {
            var token = Store.get('token') || {};
            if (API.tokenIsValid(token)) {
                return Promise.resolve(token);
            }
            return fetch(CONFIG.API_BASE + '/token/refresh', {
                body: JSON.stringify({ refresh_token: token.refresh_token }),
                headers: { 'accept': 'application/json, text/plain, */*', 'content-type': 'application/json' },
                method: 'POST'
            }).then(function (response) {
                return response.ok ? response.json() : Promise.reject(new Error('Token refresh failed'));
            }).then(function (response) {
                Store.set('token', response);
                return response;
            });
        },

        /** 构造 Authorization 请求头 */
        getAuthHeader: function () {
            var token = Store.get('token') || {};
            return (token.token_type || '') + ' ' + (token.access_token || '');
        },

        /** 获取视频预览播放信息（含转码列表和字幕列表） */
        getVideoPreviewPlayInfo: function (driveId, fileId) {
            return API.refresh().then(function () {
                return fetch(CONFIG.API_BASE + '/v2/file/get_video_preview_play_info', {
                    body: JSON.stringify({
                        category: 'live_transcoding',
                        drive_id: driveId,
                        file_id: fileId,
                        template_id: '',
                        get_subtitle_info: true,
                        mode: 'high_res',
                        url_expire_sec: CONFIG.URL_EXPIRE_SEC
                    }),
                    headers: {
                        'authorization': API.getAuthHeader(),
                        'content-type': 'application/json;charset=UTF-8'
                    },
                    method: 'POST'
                }).then(function (response) {
                    return response.ok ? response.json() : Promise.reject(new Error('Get video preview failed'));
                });
            });
        },

        /** 获取文件下载链接（用于网盘内挂字幕文件） */
        getDownloadUrl: function (driveId, fileId) {
            return API.refresh().then(function () {
                return fetch(CONFIG.API_BASE + '/v2/file/get_download_url', {
                    body: JSON.stringify({
                        expire_sec: CONFIG.URL_EXPIRE_SEC,
                        drive_id: driveId,
                        file_id: fileId
                    }),
                    headers: {
                        'authorization': API.getAuthHeader(),
                        'content-type': 'application/json;charset=UTF-8',
                        'x-canary': CONFIG.CANARY_HEADER
                    },
                    method: 'POST'
                }).then(function (response) {
                    return response.ok ? response.json() : Promise.reject(new Error('Get download url failed'));
                });
            });
        },

        /**
         * 保存分享文件到自己的网盘（用于分享页视频播放）。
         * 分享页的视频无法直接获取播放信息，需先转存到自己的网盘。
         */
        saveFile: function (fileId, shareId) {
            var token = Store.get('token') || {};
            var shareToken = Store.get('shareToken') || {};
            return fetch(CONFIG.API_BASE + '/adrive/v4/batch', {
                body: JSON.stringify({
                    requests: [{
                        body: {
                            auto_rename: true,
                            file_id: fileId,
                            share_id: shareId,
                            to_parent_file_id: 'root',
                            to_drive_id: token.default_drive_id
                        },
                        headers: { 'Content-Type': 'application/json' },
                        id: '0',
                        method: 'POST',
                        url: '/file/copy'
                    }],
                    resource: 'file'
                }),
                headers: {
                    'authorization': API.getAuthHeader(),
                    'content-type': 'application/json;charset=UTF-8',
                    'x-share-token': shareToken.share_token || ''
                },
                method: 'POST'
            }).then(function (response) {
                return response.ok ? response.json() : Promise.reject(new Error('Save file failed'));
            });
        },

        /** 删除文件（用于清理分享页转存的临时文件） */
        deleteFile: function (driveId, fileId) {
            return fetch(CONFIG.API_BASE + '/v3/file/delete', {
                body: JSON.stringify({ drive_id: driveId, file_id: fileId }),
                headers: {
                    'authorization': API.getAuthHeader(),
                    'content-type': 'application/json;charset=UTF-8'
                },
                method: 'POST'
            });
        }
    };

    /**
     * 主应用模块：编排 XHR 监听、文件管理、播放器创建、字幕加载等核心流程。
     *
     * 核心流程：
     * 1. httpListener 拦截阿里云盘 XHR 请求
     * 2. 检测到 /file/list → 收集文件列表
     * 3. 检测到 /file/get_video_preview_play_info → 获取播放信息并替换播放器
     * 4. 创建 Artplayer 实例，绑定画质/字幕/播放列表控件
     */
    var App = {
        file_page: {
            root_info: {},
            send_params: {},
            file_items: []
        },
        video_page: {
            video_info: {},
            video_file: {},
            video_items: [],
            subtitle_items: []
        },
        artInstance: null,
        /** 请求版本号，用于防止快速切换视频时的竞态条件 */
        requestVersion: 0,

        run: function () {
            App.httpListener();
        },

        /**
         * 拦截 XMLHttpRequest.prototype.send，监听阿里云盘页面的 API 请求。
         * 当检测到文件列表或视频预览信息的响应时，触发相应的处理逻辑。
         *
         * 注意：此方式覆盖了 XHR 原型方法，是油猴脚本的常见做法，
         * 但会与同样拦截 XHR 的其他脚本产生冲突。
         */
        httpListener: function () {
            (function (send) {
                XMLHttpRequest.prototype.send = function (sendParams) {
                    this.addEventListener('load', function () {
                        if (this.readyState === 4 && this.status === 200) {
                            var response = this.response || this.responseText || '';
                            var url = this.responseURL;
                            if (url.indexOf('/file/list') > 0 || url.indexOf('/file/search') > 0) {
                                App.initFilesInfo(sendParams, response);
                            } else if (url.indexOf('/file/get_video_preview_play_info') > 0) {
                                App.initVideoPlayInfo(response);
                                App.initVideoPlayer();
                            }
                        }
                    }, false);
                    send.apply(this, arguments);
                };
            })(XMLHttpRequest.prototype.send);
        },

        /**
         * 解析文件列表响应，收集当前目录下的文件信息。
         * 使用 Set 去重，避免分页加载时重复添加。
         */
        initFilesInfo: function (sendParams, response) {
            try { sendParams = JSON.parse(sendParams); } catch (e) { return; }
            try { response = JSON.parse(response); } catch (e) { return; }

            if (!(sendParams instanceof Object && response instanceof Object)) return;

            var sp = sendParams || {};
            var prev = App.file_page.send_params;
            if (!(sp.order_by === prev.order_by && sp.order_direction === prev.order_direction && sp.parent_file_id === prev.parent_file_id)) {
                App.file_page.file_items = [];
            }
            App.file_page.send_params = sp;

            var existingIds = new Set(App.file_page.file_items.map(function (item) { return item.file_id; }));
            var newItems = (response.items || []).filter(function (item) { return !existingIds.has(item.file_id); });
            App.file_page.file_items = App.file_page.file_items.concat(newItems);

            Notify.success('文件列表获取完成 共：' + App.file_page.file_items.length + '项');
        },

        /**
         * 解析视频预览播放信息响应，提取视频文件、视频列表和字幕文件。
         * 字幕文件通过文件扩展名（vtt/srt/ass/ssa）和 category=others 识别。
         */
        initVideoPlayInfo: function (response) {
            try { response = JSON.parse(response); } catch (e) { return; }
            if (!(response instanceof Object)) return;

            App.video_page.video_info = response;
            App.video_page.video_items = App.file_page.file_items.filter(function (item) {
                return item.type === 'file' && item.category === 'video';
            });
            App.video_page.video_file = App.file_page.file_items.find(function (item) {
                return item.type === 'file' && item.file_id === response.file_id;
            });
            App.video_page.subtitle_items = App.file_page.file_items.filter(function (item) {
                return item.type === 'file' && item.category === 'others' &&
                    ['vtt', 'srt', 'ass', 'ssa'].includes(item.file_extension.toLowerCase());
            });
        },

        /**
         * 初始化视频播放器：获取播放信息 → 替换 DOM → 创建 Artplayer 实例。
         * 分享页视频需先转存再获取播放信息，播放后自动清理临时文件。
         * 使用 requestVersion 防止快速切换视频时的竞态条件。
         */
        initVideoPlayer: function () {
            var version = ++App.requestVersion;
            var videoFile = App.video_page.video_file || App.video_page.video_info;
            var driveId = videoFile.drive_id;
            var fileId = videoFile.file_id;
            var shareId = videoFile.share_id;

            var playInfoPromise;
            if (shareId) {
                playInfoPromise = API.saveFile(fileId, shareId).then(function (resp) {
                    var result = resp.responses[0];
                    if (result.status === 201) {
                        return API.getVideoPreviewPlayInfo(result.body.drive_id, result.body.file_id)
                            .finally(function () { API.deleteFile(result.body.drive_id, result.body.file_id); });
                    }
                    Notify.error('文件缓存失败，可能网盘存储空间已满 ...', CONFIG.TIP_DURATION.MEDIUM);
                    return Promise.reject(new Error('Save file failed'));
                });
            } else {
                playInfoPromise = API.getVideoPreviewPlayInfo(driveId, fileId);
            }

            playInfoPromise.then(function (response) {
                if (version !== App.requestVersion) return;
                Object.assign(App.video_page.video_info, response);
                return App.replaceVideoPlayer();
            }).then(function () {
                if (version !== App.requestVersion) return;
                App.createPlayer();
            }).catch(function (err) {
                console.warn('[alipan] initVideoPlayer failed:', err);
            });
        },

        /**
         * 替换原生视频播放器 DOM 为 Artplayer 容器。
         * 采用轮询重试机制（最多 MAX_REPLACE_RETRIES 次），等待 <video> 元素渲染完成。
         */
        replaceVideoPlayer: function (retries) {
            retries = retries || CONFIG.MAX_REPLACE_RETRIES;
            var videoNode = document.querySelector('video');
            if (videoNode) {
                var container = document.getElementById('artplayer');
                if (container) return Promise.resolve();

                container = document.createElement('div');
                container.setAttribute('id', 'artplayer');
                container.setAttribute('style', 'width: 100%; height: 100%;');
                var videoParentNode = videoNode.parentNode.parentNode;
                videoParentNode.parentNode.replaceChild(container, videoParentNode);
                return Promise.resolve();
            }

            if (retries <= 0) {
                Notify.error('视频播放器替换失败，请刷新重试', CONFIG.TIP_DURATION.MEDIUM);
                return Promise.reject(new Error('Video element not found'));
            }

            Notify.loading('正在替换视频播放器 ...', 1e3);
            return App.delay(CONFIG.REPLACE_RETRY_INTERVAL).then(function () {
                return App.replaceVideoPlayer(retries - 1);
            });
        },

        /**
         * 从 API 返回的播放信息中构建画质列表。
         * 优先使用 quick_video_list（极速转码），回退到 live_transcoding_task_list。
         * 按分辨率降序排列，最高画质默认选中。
         */
        buildQualityList: function () {
            var playInfo = App.video_page.video_info.video_preview_play_info;
            if (!playInfo) return [];

            var taskList = playInfo.quick_video_list || playInfo.live_transcoding_task_list || [];
            var list = taskList.map(function (task) {
                if (!task.url) return null;
                return Object.assign({}, task, {
                    html: CONFIG.QUALITY_MAP[task.template_id] || task.template_id,
                    type: 'hls'
                });
            }).filter(Boolean);

            list.sort(function (a, b) { return b.template_height - a.template_height; });
            if (list.length) list[0].default = true;
            return list;
        },

        /**
         * 从 API 返回的播放信息中构建字幕列表（内镶字幕）。
         * 优先使用 quick_video_subtitle_list，回退到 live_transcoding_subtitle_task_list。
         * 所有字幕统一标记为 VTT 格式（阿里云盘 API 返回的字幕链接即为 VTT）。
         */
        buildSubtitleList: function () {
            var playInfo = App.video_page.video_info.video_preview_play_info;
            if (!playInfo) return [];

            var subList = playInfo.quick_video_subtitle_list || playInfo.live_transcoding_subtitle_task_list || [];
            return subList.map(function (sub) {
                if (!sub.url) return null;
                return Object.assign({}, sub, {
                    html: CONFIG.SUBTITLE_LANG_MAP[sub.language] || sub.language || '未知语言',
                    name: (CONFIG.SUBTITLE_LANG_MAP[sub.language] || sub.language || '未知语言') + ' - 内镶字幕「vtt」',
                    type: 'vtt'
                });
            }).filter(Boolean);
        },

        /**
         * 构建网盘内挂字幕列表（与视频同目录的 .vtt/.srt/.ass/.ssa 文件）。
         * 通过 getDownloadUrl 获取字幕文件的临时下载链接。
         */
        buildPanSubtitleList: function () {
            var filelist = App.filterSubFilesByPan();
            if (!filelist.length) return Promise.resolve([]);

            var promises = filelist.map(function (item) {
                if (item.type !== 'file') return Promise.resolve(null);
                var file = item;
                var shareId = file.share_id;
                var driveId = file.drive_id;
                var fileId = file.file_id;

                var urlPromise;
                if (shareId) {
                    urlPromise = API.saveFile(fileId, shareId).then(function (resp) {
                        var result = resp.responses[0];
                        if (result.status === 201) {
                            return API.getDownloadUrl(result.body.drive_id, result.body.file_id)
                                .then(function (dl) { return dl.url; })
                                .finally(function () { API.deleteFile(result.body.drive_id, result.body.file_id); });
                        }
                        return null;
                    });
                } else {
                    urlPromise = API.getDownloadUrl(driveId, fileId).then(function (dl) { return dl.url; });
                }

                return urlPromise.then(function (url) {
                    if (!url) return null;
                    return {
                        html: '内挂字幕「' + item.file_extension + '」',
                        name: item.name,
                        url: url,
                        type: item.file_extension
                    };
                }).catch(function () { return null; });
            });

            return Promise.allSettled(promises).then(function (results) {
                return results
                    .filter(function (r) { return r.status === 'fulfilled' && r.value; })
                    .map(function (r) { return r.value; });
            });
        },

        /**
         * 根据视频文件名匹配同目录下的字幕文件。
         * 匹配规则：字幕文件名与视频文件名（去掉扩展名）相同或以之为前缀。
         * 例如视频 "ep01.mp4" 可匹配 "ep01.srt"、"ep01.zh.srt"、"ep01_chinese.ass"。
         */
        filterSubFilesByPan: function () {
            var videoFile = App.video_page.video_file;
            var subtitleItems = App.video_page.subtitle_items;
            var videoItems = App.video_page.video_items;

            if (!subtitleItems.length) return [];
            if (videoItems.length === 1) return subtitleItems;

            var getBaseName = function (fileName) {
                return fileName.split('.').slice(0, -1).join('.').toLowerCase();
            };

            var subItems = subtitleItems.map(function (item) {
                return { item: item, base: getBaseName(item.name) };
            });

            var videoBase = getBaseName(videoFile.name);
            var videoVariants = [];
            var current = videoBase;
            while (current) {
                videoVariants.push(current);
                var next = current.split('.').slice(0, -1).join('.');
                if (next === current) break;
                current = next;
            }

            for (var i = 0; i < videoVariants.length; i++) {
                var variant = videoVariants[i];
                var matched = subItems.filter(function (s) {
                    return s.base === variant || s.base.startsWith(variant + '.') || s.base.startsWith(variant + '_');
                });
                if (matched.length) return matched.map(function (m) { return m.item; });
            }
            return [];
        },

        /**
         * 创建 Artplayer 播放器实例。
         * 配置包括：HLS 自定义类型、画质选择、右键菜单、播放列表、字幕等。
         */
        createPlayer: function () {
            var qualityList = App.buildQualityList();
            if (!qualityList.length) {
                Notify.error('获取播放信息失败，请刷新网页重试', CONFIG.TIP_DURATION.LONG);
                return;
            }

            var defaultQuality = qualityList.find(function (q) { return q.default; }) || qualityList[0];
            var videoFile = App.video_page.video_file || {};
            var videoItems = App.video_page.video_items;
            var artInstance = null;

            var artOption = {
                container: '#artplayer',
                url: defaultQuality.url,
                type: 'hls',
                autoplay: true,
                autoPlayback: true,
                aspectRatio: true,
                flip: true,
                pip: true,
                playbackRate: true,
                screenshot: true,
                setting: true,
                hotkey: true,
                fullscreen: true,
                fullscreenWeb: true,
                subtitle: {
                    url: '',
                    type: 'vtt',
                    style: { color: '#fe9200' },
                    escape: false,
                    encoding: 'utf-8'
                },
                customType: {
                    hls: function (video, url, art) {
                        var Hls = window.Hls || unsafeWindow.Hls;
                        if (Hls.isSupported()) {
                            if (art.hls) art.hls.destroy();
                            var hls = new Hls({ maxBufferLength: 60 });
                            hls.loadSource(url);
                            hls.attachMedia(video);
                            art.hls = hls;
                            art.on('destroy', function () { hls.destroy(); });
                        } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
                            video.src = url;
                        } else {
                            art.notice.show = '不支持此播放格式: m3u8';
                        }
                    }
                },
                quality: qualityList,
                id: videoFile.file_id || '',
                poster: videoFile.thumbnail || '',
                contextmenu: [
                    { html: '检查更新', click: function () { window.open('https://github.com/Huang131/userscripts', '_blank'); } }
                ]
            };

            if (videoItems.length > 1) {
                artOption.controls = [{
                    name: 'playlist',
                    position: 'right',
                    html: '播放列表',
                    style: { marginLeft: '10px', marginRight: '10px' },
                    selector: videoItems.map(function (item) {
                        return Object.assign({}, item, {
                            html: item.name,
                            default: item.file_id === (videoFile.file_id),
                            style: { textAlign: 'left' }
                        });
                    }),
                    onSelect: function (item) {
                        App.switchVideo(item);
                        return item.name;
                    }
                }];
            }

            var Artplayer = window.Artplayer || unsafeWindow.Artplayer;
            artInstance = new Artplayer(artOption);
            App.artInstance = artInstance;

            artInstance.on('ready', function () {
                App.loadSubtitles(artInstance);
                App.bindCloseButton(artInstance);
            });

            artInstance.on('quality', function (quality) {
                if (quality.url) {
                    artInstance.switchUrl(quality.url);
                }
            });

            artInstance.on('video:ended', function () {
                var currentIdx = videoItems.findIndex(function (v) { return v.file_id === videoFile.file_id; });
                if (currentIdx >= 0 && currentIdx < videoItems.length - 1) {
                    var nextItem = videoItems[currentIdx + 1];
                    App.switchVideo(nextItem);
                }
            });
        },

        /**
         * 切换视频：获取新视频的播放信息，更新播放器。
         * 使用 requestVersion 防止快速切换时的竞态条件。
         */
        switchVideo: function (fileOption) {
            var version = ++App.requestVersion;
            App.video_page.video_file = fileOption;

            var driveId = fileOption.drive_id;
            var fileId = fileOption.file_id;
            var shareId = fileOption.share_id;

            var playInfoPromise;
            if (shareId) {
                playInfoPromise = API.saveFile(fileId, shareId).then(function (resp) {
                    var result = resp.responses[0];
                    if (result.status === 201) {
                        return API.getVideoPreviewPlayInfo(result.body.drive_id, result.body.file_id)
                            .finally(function () { API.deleteFile(result.body.drive_id, result.body.file_id); });
                    }
                    return Promise.reject(new Error('Save file failed'));
                });
            } else {
                playInfoPromise = API.getVideoPreviewPlayInfo(driveId, fileId);
            }

            playInfoPromise.then(function (response) {
                if (version !== App.requestVersion) return;
                Object.assign(App.video_page.video_info, response);

                var qualityList = App.buildQualityList();
                if (!qualityList.length) {
                    Notify.error('视频地址不可用', CONFIG.TIP_DURATION.MEDIUM);
                    return;
                }

                var defaultQ = qualityList.find(function (q) { return q.default; }) || qualityList[0];
                var art = App.artInstance;
                if (!art) return;

                art.switchUrl(defaultQ.url);
                art.option.quality = qualityList;

                var filenameNode = document.querySelector('[class^=header-file-name] span, [class^=filename] span, [class^=header-center] div span');
                if (filenameNode) filenameNode.innerText = fileOption.name;

                Notify.success('切换视频: ' + fileOption.name);
                App.loadSubtitles(art);
            }).catch(function (err) {
                Notify.error('切换视频失败', CONFIG.TIP_DURATION.MEDIUM);
                console.warn('[alipan] switchVideo failed:', err);
            });
        },

        /**
         * 加载字幕：合并 API 内镶字幕和网盘内挂字幕，自动选中中文字幕。
         * 只要有字幕就显示字幕选择控件（即使只有 1 个）。
         */
        loadSubtitles: function (art) {
            var apiSubs = App.buildSubtitleList();
            var panSubsPromise = App.buildPanSubtitleList();

            panSubsPromise.then(function (panSubs) {
                var allSubs = apiSubs.concat(panSubs);
                if (!allSubs.length) return;

                var defaultSub = allSubs.find(function (s) {
                    return s.language === 'chi' || s.language === 'zho';
                }) || allSubs[0];

                if (defaultSub && defaultSub.url) {
                    art.subtitle.init({
                        url: defaultSub.url,
                        type: defaultSub.type || 'vtt',
                        style: { color: '#fe9200' },
                        escape: false,
                        encoding: 'utf-8'
                    });
                    art.subtitle.show = true;
                    Notify.success('加载字幕: ' + (defaultSub.name || defaultSub.html));
                }

                if (allSubs.length > 0) {
                    art.controls.update({
                        name: 'subtitle',
                        position: 'right',
                        html: '字幕',
                        style: { paddingLeft: '10px', paddingRight: '10px' },
                        selector: allSubs.map(function (sub, idx) {
                            return Object.assign({}, sub, { default: sub === defaultSub });
                        }),
                        onSelect: function (sub) {
                            art.subtitle.init({
                                url: sub.url,
                                type: sub.type || 'vtt',
                                style: { color: '#fe9200' },
                                escape: false,
                                encoding: 'utf-8'
                            });
                            art.subtitle.show = true;
                            Notify.success('切换字幕: ' + (sub.name || sub.html));
                            return '字幕';
                        }
                    });
                }
            });
        },

        /** 绑定关闭按钮：点击关闭时销毁 Artplayer 实例 */
        bindCloseButton: function (art) {
            var closeNode = document.querySelector('[class^="header-"] [data-icon-type="PDSClose"], [class^="header-"] [data-icon-type="PDSChevronLeft"]');
            if (closeNode) {
                closeNode.addEventListener('click', function () {
                    art.destroy();
                    App.artInstance = null;
                }, { once: true });
            }
        },

        delay: function (ms) {
            return new Promise(function (resolve) { setTimeout(resolve, ms || 500); });
        }
    };

    App.run();
    console.log('[alipan] Enhanced player v6.0.0 loaded');
})();
