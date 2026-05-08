// ==UserScript==
// @name         Taiwan SportsLottery 綜合腳本
// @namespace    https://github.com/jjj9458/
// @version      1.2
// @description  MyBets 自動計算 + 維持登入及超時提醒
// @author       haley80208@PTT
// @match        https://member.sportslottery.com.tw/*
// @match        https://www-talo-ssb-pr.sportslottery.com.tw/*
// @run-at       document-end
// @grant        none
// @license      GPL-3.0
// @updateURL    https://raw.githubusercontent.com/jjj9458/TampermonkeyUserscripts/main/src/TSL_toolA/TSL_toolA.user.js
// @downloadURL  https://raw.githubusercontent.com/jjj9458/TampermonkeyUserscripts/main/src/TSL_toolA/TSL_toolA.user.js
// @homepageURL  https://github.com/jjj9458/TampermonkeyUserscripts
// @supportURL   https://github.com/jjj9458/TampermonkeyUserscripts/issues
// ==/UserScript==

(function(){
    'use strict';

    (function(){
        const wrap = fn => function(){
            const ret = fn.apply(this, arguments);
            window.dispatchEvent(new Event('locationchange'));
            return ret;
        };
        history.pushState = wrap(history.pushState);
        history.replaceState = wrap(history.replaceState);
        window.addEventListener('popstate', ()=> window.dispatchEvent(new Event('locationchange')));
    })();

    /* KEEPALIVE_DEBUG_LOG：功能註解：輸出 KeepAlive 除錯紀錄，方便在 Console 搜尋 [KeepAliveDebug] */
    const KEEPALIVE_DEBUG = false;

    function keepAliveLog(message, data){
        if (!KEEPALIVE_DEBUG) return;
        console.log(`[KeepAliveDebug] ${message}`, data || '');
    }

    /* KEEPALIVE_BOTTOM_BANNER：功能註解：建立底部提醒橫幅，可設定是否自動關閉，也保留手動關閉功能 */
    function showBottomBanner(bannerId, html, options){
        const old = document.getElementById(bannerId);
        if (old) {
            old.remove();
            keepAliveLog(`已移除舊橫幅：${bannerId}`);
        }

        const banner = document.createElement('div');
        banner.id = bannerId;
        banner.innerHTML = html;

        Object.assign(banner.style, {
            position: 'fixed',
            bottom: '0',
            left: '0',
            width: '100%',
            padding: '1rem',
            backgroundColor: options.backgroundColor,
            color: '#fff',
            fontSize: '1rem',
            textAlign: 'center',
            zIndex: options.zIndex || '2147483647',
            boxShadow: '0 -2px 5px rgba(0,0,0,0.3)',
            boxSizing: 'border-box'
        });

        let closed = false;

        const closeBanner = (reason) => {
            if (closed) return;
            closed = true;

            if (banner && banner.parentNode) {
                banner.remove();
            }

            keepAliveLog(`橫幅已關閉：${bannerId}`, { reason });

            if (reason === 'manual' && typeof options.onManualClose === 'function') {
                options.onManualClose();
            }
        };

        banner.querySelector('button')?.addEventListener('click', () => {
            closeBanner('manual');
        });

        const appendBanner = () => {
            if (!document.body) {
                keepAliveLog(`document.body 尚未準備好，延後顯示：${bannerId}`);
                setTimeout(appendBanner, 300);
                return;
            }

            document.body.appendChild(banner);
            keepAliveLog(`橫幅已顯示：${bannerId}`);

            if (typeof options.onShow === 'function') {
                options.onShow();
            }

            if (Number(options.autoCloseMs) > 0) {
                keepAliveLog(`已設定自動關閉：${bannerId}`, {
                    autoCloseMs: options.autoCloseMs
                });

                setTimeout(() => {
                    closeBanner('auto');
                }, Number(options.autoCloseMs));
            }
        };

        appendBanner();
        return true;
    }

    /* KEEPALIVE_PUBLIC_WARNING：功能註解：顯示登入後公共電腦提醒，底部顯示，2 秒後自動關閉 */
    function showPublicWarning() {
        keepAliveLog('準備顯示公共電腦提醒');

        showBottomBanner(
            'public-warning-banner',
            `
        ⚠️ <strong>禁止在公共電腦使用本腳本</strong>
        <button id="close-public-warning" style="
            margin-left:1rem;
            background:transparent;
            border:none;
            color:#fff;
            font-size:1.2rem;
            cursor:pointer;
        ">✕</button>
        `,
            {
                backgroundColor: '#faad14',
                zIndex: '2147483647',
                autoCloseMs: 3500
            }
        );
    }

    if (location.host === 'member.sportslottery.com.tw') {

        if (window.__TSL_KEEPALIVE_INSTALLED__) {
            keepAliveLog('KeepAlive 已安裝過，略過重複初始化');
        } else {
            window.__TSL_KEEPALIVE_INSTALLED__ = true;

            /* KEEPALIVE_3_5H_NOTIFY_CONFIG：功能註解：網站約 4 小時強制登出，腳本在 3.5 小時提醒 */
            let latestInit = null;

            const START_TS_KEY = 'KeepAliveStartTs';
            const TOKEN_KEY = 'KeepAliveSessionToken';
            const LAST_REMINDER_TS_KEY = 'KeepAliveLastReminderTs';

            const REMIND_DURATION_MS = 3.5 * 3600 * 1000;
            const FORCE_LOGOUT_DURATION_MS = 4 * 3600 * 1000;
            const REMINDER_REPEAT_MS = 8 * 60 * 1000;

            let startTs = parseInt(localStorage.getItem(START_TS_KEY), 10) || null;

            keepAliveLog('腳本啟動', {
                path: location.pathname,
                startTs,
                now: Date.now()
            });

            /* KEEPALIVE_CLEAR_STATE：功能註解：清除登入計時與提醒紀錄，避免登出後重新開頁誤提醒 */
            function clearKeepAliveState(reason) {
                startTs = null;
                latestInit = null;

                localStorage.removeItem(START_TS_KEY);
                localStorage.removeItem(TOKEN_KEY);
                localStorage.removeItem(LAST_REMINDER_TS_KEY);

                const oldExpiryBanner = document.getElementById('session-expiry-banner');
                if (oldExpiryBanner) oldExpiryBanner.remove();

                keepAliveLog(`已清除登入計時狀態：${reason}`);
            }

            /* KEEPALIVE_3_5H_BANNER：功能註解：顯示登入滿 3.5 小時提醒，不自動關閉，手動關閉後 8 分鐘才可再次提醒 */
            function showExpiryBanner(){
                keepAliveLog('準備顯示 3.5 小時提醒');

                showBottomBanner(
                    'session-expiry-banner',
                    `
                    ⚠️ <strong>您已登入滿 3.5 小時</strong>，
                    網站約 4 小時會強制登出，建議立即重新登入
                    <button id="close-session-expiry" style="
                        margin-left:1rem;
                        background:transparent;
                        border:none;
                        color:#fff;
                        font-size:1.2rem;
                        cursor:pointer;
                    ">✕</button>
                    `,
                    {
                        backgroundColor: '#ff4d4f',
                        zIndex: '2147483647',
                        autoCloseMs: 0,
                        onShow: () => {
                            localStorage.setItem(LAST_REMINDER_TS_KEY, String(Date.now()));
                            keepAliveLog('已記錄 3.5 小時提醒顯示時間', {
                                lastReminderTs: Date.now()
                            });
                        },
                        onManualClose: () => {
                            localStorage.setItem(LAST_REMINDER_TS_KEY, String(Date.now()));
                            keepAliveLog('已記錄 3.5 小時提醒手動關閉時間', {
                                lastReminderTs: Date.now()
                            });
                        }
                    }
                );
            }

            if (location.pathname === '/login') {
                clearKeepAliveState('腳本啟動時位於 login 頁');
            }

            /* KEEPALIVE_FETCH_HEARTBEAT：功能註解：攔截 heartbeat，取得 sessionToken 並建立或沿用登入計時 */
            const _origFetch = window.fetch;
            window.fetch = function(input, init){
                const url = typeof input === 'string' ? input : input?.url;

                if (url && url.includes('/session-manager/v2/session/heartBeat')) {
                    try {
                        keepAliveLog('攔截到 heartbeat', { url });

                        const bodyText = init && init.body;
                        const tokenNow = bodyText && JSON.parse(bodyText).sessionToken;
                        const tokenPrev = localStorage.getItem(TOKEN_KEY);
                        const savedStartTs = parseInt(localStorage.getItem(START_TS_KEY), 10) || null;

                        latestInit = init;

                        if (!tokenNow) {
                            keepAliveLog('heartbeat 未抓到 sessionToken', { bodyText });
                        }

                        if (tokenNow && tokenNow !== tokenPrev) {
                            if (!savedStartTs) {
                                startTs = Date.now();
                                localStorage.setItem(START_TS_KEY, String(startTs));

                                keepAliveLog('偵測到 sessionToken，沒有舊計時，建立新的登入計時', {
                                    startTs
                                });
                            } else {
                                startTs = savedStartTs;

                                keepAliveLog('偵測到 sessionToken 變化，但沿用原本登入計時', {
                                    startTs,
                                    elapsedMinutes: Math.floor((Date.now() - startTs) / 60000)
                                });
                            }

                            localStorage.setItem(TOKEN_KEY, tokenNow);
                        }

                        if (tokenNow && tokenNow === tokenPrev) {
                            startTs = savedStartTs || startTs || Date.now();
                            localStorage.setItem(START_TS_KEY, String(startTs));

                            keepAliveLog('同一個 session，沿用登入計時', {
                                startTs,
                                elapsedMinutes: Math.floor((Date.now() - startTs) / 60000)
                            });
                        }
                    } catch(e){
                        keepAliveLog('heartbeat 處理失敗', e);
                    }
                }

                return _origFetch(input, init);
            };

            /* KEEPALIVE_SEND_HEARTBEAT：功能註解：使用最新 heartbeat 初始化資料主動送出 heartbeat */
            async function sendHeartbeat(){
                if (!latestInit) return;
                try {
                    await _origFetch(
                        'https://member.sportslottery.com.tw/session-manager/v2/session/heartBeat',
                        latestInit
                    );
                } catch(err){
                    keepAliveLog('手動 heartbeat 失敗', err);
                }
            }
            window.sendHeartbeat = sendHeartbeat;

            /* KEEPALIVE_SCHEDULE_HEARTBEAT：功能註解：定期送 heartbeat，維持原本隨機間隔邏輯 */
            function scheduleHeartbeat(){
                const baseMs = 4 * 60 * 1000;
                const randSec = Math.floor(Math.random()*31);
                const varMs = randSec * 1000;
                const interval= (randSec%2===0) ? baseMs + varMs : baseMs - varMs;

                setTimeout(async ()=>{
                    await sendHeartbeat();
                    scheduleHeartbeat();
                }, interval);
            }
            scheduleHeartbeat();

            /* KEEPALIVE_REMINDER_CHECK：功能註解：滿 3.5 小時提醒；手動關閉或曾顯示後，至少間隔 8 分鐘才再次提醒 */
            function checkThreePointFiveHourReminder(reason){
                const savedStartTs = parseInt(localStorage.getItem(START_TS_KEY), 10) || null;
                const lastReminderTs = parseInt(localStorage.getItem(LAST_REMINDER_TS_KEY), 10) || null;

                if (!startTs && savedStartTs) {
                    startTs = savedStartTs;
                    keepAliveLog('從 localStorage 補回 startTs', { startTs });
                }

                if (!startTs && location.pathname !== '/login') {
                    startTs = Date.now();
                    localStorage.setItem(START_TS_KEY, String(startTs));

                    keepAliveLog('沒有 startTs，先以目前時間建立計時起點', {
                        reason,
                        startTs
                    });
                }

                if (!startTs) {
                    keepAliveLog('尚未有 startTs，略過 3.5 小時提醒檢查', { reason });
                    return;
                }

                const now = Date.now();
                const elapsedMs = now - startTs;
                const elapsedMinutes = Math.floor(elapsedMs / 60000);
                const remindRemainMinutes = Math.ceil((REMIND_DURATION_MS - elapsedMs) / 60000);
                const forceRemainMinutes = Math.ceil((FORCE_LOGOUT_DURATION_MS - elapsedMs) / 60000);
                const bannerExists = !!document.getElementById('session-expiry-banner');
                const canShowAgain = !lastReminderTs || now - lastReminderTs >= REMINDER_REPEAT_MS;

                keepAliveLog('3.5 小時提醒檢查', {
                    reason,
                    elapsedMinutes,
                    remindRemainMinutes,
                    forceRemainMinutes,
                    bannerExists,
                    lastReminderTs,
                    canShowAgain
                });

                if (elapsedMs < REMIND_DURATION_MS) return;

                if (bannerExists) {
                    keepAliveLog('3.5 小時提醒已在畫面上，不重複建立');
                    return;
                }

                if (!canShowAgain) {
                    keepAliveLog('尚未滿 8 分鐘，不再次顯示 3.5 小時提醒', {
                        nextShowRemainMinutes: Math.ceil((REMINDER_REPEAT_MS - (now - lastReminderTs)) / 60000)
                    });
                    return;
                }

                keepAliveLog('已達 3.5 小時，顯示提醒橫幅', {
                    elapsedMinutes
                });

                showExpiryBanner();
            }

            setTimeout(()=>{
                checkThreePointFiveHourReminder('啟動後初次檢查');
            }, 3000);

            setInterval(()=>{
                checkThreePointFiveHourReminder('每分鐘檢查');
            }, 60 * 1000);

            /* KEEPALIVE_LOCATION_RESET：功能註解：監聽登入與登出路由，登入後開始計時，回 login 清除狀態 */
            let prevPath = location.pathname;
            window.addEventListener('locationchange', ()=>{
                const newPath = location.pathname;

                keepAliveLog('locationchange', {
                    prevPath,
                    newPath
                });

                if (newPath === '/login') {
                    clearKeepAliveState('進入 login 頁');
                }

                if (prevPath === '/login' && newPath !== '/login') {
                    startTs = Date.now();

                    localStorage.setItem(START_TS_KEY, String(startTs));
                    localStorage.removeItem(LAST_REMINDER_TS_KEY);

                    keepAliveLog('從 login 離開，判定登入成功，開始 3.5 小時計時', {
                        startTs
                    });

                    showPublicWarning();
                }

                prevPath = newPath;
            });
        }
    }

    function runMyBets(){
        const host = location.host;
        if (!((host==='member.sportslottery.com.tw' && location.pathname.startsWith('/account/my-bets')) ||
              host==='www-talo-ssb-pr.sportslottery.com.tw')) return;
        const isTop = window.top === window.self;

        function injectButton(){
            if (document.querySelector('#myCalcButton')) return;
            const bcInfo = document.querySelector('.styled__BreadcrumbsInfo-sc-1ipvy8g-6');
            if (!bcInfo) return;
            bcInfo.style.display = 'flex';
            bcInfo.style.justifyContent = 'space-between';
            bcInfo.style.gap = '1rem';

            const ctrl = document.createElement('div');
            ctrl.style.display = 'inline-flex';
            ctrl.style.alignItems = 'center';
            ctrl.style.gap = '0.5rem';
            const txt = document.createElement('span');
            txt.textContent = '先到已派彩，設定日期區間，再按';
            const btn = document.createElement('button');
            btn.id = 'myCalcButton';
            btn.textContent = '計算';
            const out = document.createElement('span');
            out.id = 'myCalcText';
            ctrl.append(txt, btn, out);
            bcInfo.appendChild(ctrl);

            let pending=0, sumS=0, sumR=0;
            window.addEventListener('message', e => {
                if (e.origin==='https://www-talo-ssb-pr.sportslottery.com.tw' &&
                    e.data?.type==='BET_RESULTS') {
                    sumS += e.data.totalStake;
                    sumR += e.data.totalReturn;
                    pending--;
                    if (pending===0) {
                        out.textContent = `共花費：${sumS}，共中獎：${sumR}，淨利：${sumR - sumS}`;
                        btn.disabled = false;
                    }
                }
            });
            btn.addEventListener('click', ()=> {
                out.textContent = '計算中...';
                btn.disabled = true;
                sumS = 0; sumR = 0;
                const iframes = Array.from(
                    document.querySelectorAll('iframe[src*="talo-ssb-pr"]')
                );
                pending = iframes.length;
                if (pending===0) {
                    out.textContent = '找不到 iframe';
                    btn.disabled = false;
                    return;
                }
                iframes.forEach(f => {
                    f.contentWindow.postMessage(
                        { type:'START_CALC' },
                        'https://www-talo-ssb-pr.sportslottery.com.tw'
                    );
                });
            });
        }

        function initTop(){
            const iv = setInterval(()=>{
                injectButton();
                if (document.querySelector('#myCalcButton')) clearInterval(iv);
            }, 300);
        }

        function initIframe(){
            window.addEventListener('message', e => {
                if (e.origin==='https://member.sportslottery.com.tw' && e.data?.type==='START_CALC') {
                    let nf = 0;
                    const d = window.document;
                    const ci = setInterval(()=>{
                        let b = d.querySelector('.MyBetsstyled__LoadMoreButton-sc-nwucds-1')
                        || Array.from(d.querySelectorAll('button'))
                        .find(x => /載入更多|更多|Load\s?More/i.test(x.innerText));
                        if (b) { b.click(); nf = 0; }
                        else {
                            nf++;
                            if (nf>=3) {
                                clearInterval(ci);
                                let tS=0, tR=0;
                                d.querySelectorAll('[data-test-id="amount-mybets-mgs-totalstake"]')
                                    .forEach(s => {
                                    const r = s.closest('[title]')?.title || s.innerText;
                                    tS += parseFloat(r.replace(/[^\d\.-]/g,''))||0;
                                });
                                d.querySelectorAll('[data-test-id="amount-mybets-mgs-potentialreturn"]')
                                    .forEach(s => {
                                    const r = s.closest('[title]')?.title || s.innerText;
                                    tR += parseFloat(r.replace(/[^\d\.-]/g,''))||0;
                                });
                                window.parent.postMessage(
                                    { type:'BET_RESULTS', totalStake:tS, totalReturn:tR },
                                    'https://member.sportslottery.com.tw'
                                );
                            }
                        }
                    }, 500);
                }
            });
        }

        if (isTop) initTop(); else initIframe();
    }

    window.addEventListener('load', runMyBets);
    window.addEventListener('locationchange', runMyBets);

})();

/*
 * 匯集過去PTT@SportLottery各位前輩們分享過的架構
 * 與鄉民們的使用回饋，就不一一提及
 * 僅供未來接棒者了解並繼續傳承
 * 祝各位繼續順利尻剛
 **/
