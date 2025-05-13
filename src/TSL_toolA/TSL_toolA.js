// ==UserScript==
// @name         Taiwan SportsLottery 綜合腳本
// @namespace    https://github.com/jjj9458/test
// @version      1.0
// @description  v1.0：MyBets 自動計算 + 維持登入及超時提醒
// @author       jjj9458
// @match        https://member.sportslottery.com.tw/*
// @match        https://www-talo-ssb-pr.sportslottery.com.tw/*
// @run-at       document-end
// @grant        none
// @license      GPL-3.0

// @homepageURL  https://github.com/jjj9458/TampermonkeyUserscripts
// @supportURL   https://github.com/jjj9458/TampermonkeyUserscripts/issues
// ==/UserScript==

/*
 * 註解版
 * // @updateURL    https://raw.githubusercontent.com/jjj9458/TampermonkeyUserscripts/main/src/TSL_toolA.user.js
 * // @downloadURL  https://raw.githubusercontent.com/jjj9458/TampermonkeyUserscripts/main/src/TSL_toolA.user.js
 **/

(function(){
    'use strict';

    /*** SPA RouteChange 事件注入 ***/
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

    /***** 顯示 Session 到期紅底橫幅 *****/
    function showExpiryBanner(){
        if (document.getElementById('session-expiry-banner')) return;
        const banner = document.createElement('div');
        banner.id = 'session-expiry-banner';
        banner.innerHTML = `
            ⚠️ <strong>您的 Session 已使用超過 3.5 小時</strong> ，
            為避免被強制登出，建議立即重新登入
            <button id="close-session-expiry" style="
                margin-left:1rem;
                background:transparent;
                border:none;
                color:#fff;
                font-size:1.2rem;
                cursor:pointer;
            ">✕</button>
        `;
        Object.assign(banner.style, {
            position: 'fixed',
            top: '0',
            left: '0',
            width: '100%',
            padding: '1rem',
            backgroundColor: '#ff4d4f',
            color: '#fff',
            fontSize: '1rem',
            textAlign: 'center',
            zIndex: '9999',
            boxShadow: '0 2px 5px rgba(0,0,0,0.3)'
        });
        document.body.appendChild(banner);
        document.getElementById('close-session-expiry')
            .addEventListener('click', ()=> banner.remove());
    }

    /*=== 1. KeepAlive 心跳攔截 & 隨機間隔自動重送 + 3.5h 提示 + /login 路由重置 ===*/
    if (location.host === 'member.sportslottery.com.tw') {
        let latestInit = null;
        let startTs = parseInt(localStorage.getItem('KeepAliveStartTs'),10) || null;
        let notified = false;
        const MAX_DURATION_MS = 3.5 * 3600 * 1000;
        //3個半小時

        // 攔截 heartbeat init，並重置計時
        const _origFetch = window.fetch;
        window.fetch = function(input, init){
            if (typeof input === 'string' &&
                input.includes('/session-manager/v2/session/heartBeat')) {
                try {
                    const bodyText = init && init.body;
                    const tokenNow = bodyText && JSON.parse(bodyText).sessionToken;
                    const tokenPrev = latestInit && JSON.parse(latestInit.body).sessionToken;
                    if (!latestInit || tokenNow !== tokenPrev) {
                        latestInit = init;
                        startTs = Date.now();
                        localStorage.setItem('KeepAliveStartTs', startTs);
                        notified = false;
                        console.log(
                            `%c[KeepAlive] 擷取心跳 init，計時重置 @ ${new Date(startTs).toLocaleString()}`,
                            'color:green'
                        );
                    } else {
                        latestInit = init;
                        console.log('[KeepAlive] heartbeat init 更新，時間不重置');
                    }
                } catch(e){
                    console.warn('[KeepAlive] init 解析失敗', e);
                }
            }
            return _origFetch(input, init);
        };

        // 發送心跳
        async function sendHeartbeat(){
            console.log(`%c[KeepAlive] sendHeartbeat @ ${new Date().toLocaleString()}`, 'color:blue');
            if (!latestInit) { console.warn('[KeepAlive] 尚未擷取 init'); return; }
            try {
                const res = await _origFetch(
                    'https://member.sportslottery.com.tw/session-manager/v2/session/heartBeat',
                    latestInit
                );
                const data = await res.json();
                if (res.ok && data.sessionActive) console.log('[KeepAlive] 心跳成功', data);
                else console.warn('[KeepAlive] 心跳異常', res.status, data);
            } catch(err){
                console.error('[KeepAlive] 心跳錯誤', err);
            }
        }
        window.sendHeartbeat = sendHeartbeat;

        // 隨機 ±30s 排程
        function scheduleHeartbeat(){
            const baseMs = 4 * 60 * 1000;
            const randSec = Math.floor(Math.random()*31);
            const varMs = randSec * 1000;
            const interval= (randSec%2===0) ? baseMs + varMs : baseMs - varMs;
            console.log(
                `[KeepAlive] 下一次心跳 in ${(interval/1000).toFixed()}s ` +
                `(隨機 ${randSec}s ${randSec%2===0?'+':'-'})`
            );
            setTimeout(async ()=>{
                await sendHeartbeat();
                scheduleHeartbeat();
            }, interval);
        }
        scheduleHeartbeat();

        // 到期檢查
        setInterval(()=>{
            if (startTs && !notified && Date.now() - startTs >= MAX_DURATION_MS) {
                notified = true;
                //alert('⚠️ Session 已超過 3.5 小時，請重新登入！');
                showExpiryBanner();
                console.log('[KeepAlive] 顯示 3.5h 到期橫幅提醒');
            }
        }, 60 * 1000);

        // 路由 /login → 其他：自動重置計時
        let prevPath = location.pathname;
        window.addEventListener('locationchange', ()=>{
            const newPath = location.pathname;
            console.log(`[KeepAlive] route change: ${prevPath} → ${newPath}`);
            if (prevPath === '/login' && newPath !== '/login') {
                startTs = Date.now();
                localStorage.setItem('KeepAliveStartTs', startTs);
                notified = false;
                console.log(
                    `%c[KeepAlive] 偵測到登入完成，計時重置 @ ${new Date(startTs).toLocaleString()}`,
                    'color:orange'
                );
            }
            prevPath = newPath;
        });

        console.log('%c[KeepAlive] 隨機心跳 + 3.5h 提示 + /login 重置 已啟動','color:green');
    }

    /*=== 2. MyBets 自動計算 + SPA 延遲注入 ===*/
    function runMyBets(){
        const host = location.host;
        if (!((host==='member.sportslottery.com.tw' && location.pathname.startsWith('/account/my-bets')) ||
              host==='www-talo-ssb-pr.sportslottery.com.tw')) return;
        const isTop = window.top === window.self;

        function injectButton(){
            if (document.querySelector('#myCalcButton')) return;
            const bcInfo = document.querySelector('.styled__BreadcrumbsInfo-sc-1ipvy8g-6');
            if (!bcInfo) return;
            console.log('[MyBets] 注入按鈕到 BreadcrumbsInfo');
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
            console.log('[MyBets] iframe init');
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
