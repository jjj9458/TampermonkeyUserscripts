// ==UserScript==
// @name         Taiwan SportsLottery 綜合腳本
// @namespace    https://github.com/jjj9458/
// @version      1.0
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

    function showPublicWarning() {
        if (document.getElementById('public-warning-banner')) return;
        const banner = document.createElement('div');
        banner.id = 'public-warning-banner';
        banner.innerHTML = `
        ⚠️ <strong>禁止在公共電腦使用本腳本</strong>
        <button id="close-public-warning" style="
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
            top: '6rem',
            left: '0',
            width: '100%',
            padding: '1rem',
            backgroundColor: '#faad14',
            color: '#fff',
            fontSize: '1rem',
            textAlign: 'center',
            zIndex: '10000',
            boxShadow: '0 2px 5px rgba(0,0,0,0.3)'
        });
        document.body.appendChild(banner);
        document.getElementById('close-public-warning')
            .addEventListener('click', () => banner.remove());
    }

    function showExpiryBanner(){
        if (document.getElementById('session-expiry-banner')) return;
        const banner = document.createElement('div');
        banner.id = 'session-expiry-banner';
        banner.innerHTML = `
            ⚠️ <strong>您已使用超過 3.5 小時</strong> ，
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

    if (location.host === 'member.sportslottery.com.tw') {
        let latestInit = null;
        let startTs = parseInt(localStorage.getItem('KeepAliveStartTs'),10) || null;
        let notified = false;
        const MAX_DURATION_MS = 3.5 * 3600 * 1000;

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
                    } else {
                        latestInit = init;
                    }
                } catch(e){}
            }
            return _origFetch(input, init);
        };

        async function sendHeartbeat(){
            if (!latestInit) return;
            try {
                const res = await _origFetch(
                    'https://member.sportslottery.com.tw/session-manager/v2/session/heartBeat',
                    latestInit
                );
                const data = await res.json();
            } catch(err){}
        }
        window.sendHeartbeat = sendHeartbeat;

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

        setInterval(()=>{
            if (startTs && !notified && Date.now() - startTs >= MAX_DURATION_MS) {
                notified = true;
                showExpiryBanner();
            }
        }, 60 * 1000);

        let prevPath = location.pathname;
        window.addEventListener('locationchange', ()=>{
            const newPath = location.pathname;
            if (prevPath === '/login' && newPath !== '/login') {
                startTs = Date.now();
                localStorage.setItem('KeepAliveStartTs', startTs);
                notified = false;
                showPublicWarning();
            }
            prevPath = newPath;
        });
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
