(() => {
  const KEY = '__pip_timer_state__';

  const APP = window.__pip_timer_app__ || (window.__pip_timer_app__ = {
    win: null,
    tick: null,
    midnight: null,
    chartOpen: true,
    state: null
  });

  const today = () => new Date().toLocaleDateString('en-CA');

  const blank = () => ({
    day: today(),
    mode: 'work',
    work: 0,
    rest: 0,
    activeSince: Date.now(),
    paused: false,
    segments: []
  });

  const load = () => {
    try {
      const s = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (!s || s.day !== today()) return blank();
      return {
        ...blank(),
        ...s,
        paused: !!s.paused,
        segments: Array.isArray(s.segments) ? s.segments : []
      };
    } catch {
      return blank();
    }
  };

  const save = (s) => {
    const clean = { ...s, day: today() };
    localStorage.setItem(KEY, JSON.stringify(clean));
    APP.state = clean;
    window.__timerState = clean;
  };

  const fmt = (ms) => {
    ms = Math.max(0, ms | 0);
    const x = Math.floor(ms / 1000);
    const h = Math.floor(x / 3600);
    const m = Math.floor((x % 3600) / 60);
    const s = x % 60;
    return [h, m, s].map(n => String(n).padStart(2, '0')).join(':');
  };

  const msToMidnight = () => {
    const n = new Date();
    const m = new Date(n);
    m.setHours(24, 0, 0, 0);
    return m - n + 50;
  };

  const clearTimers = () => {
    if (APP.tick) {
      clearInterval(APP.tick);
      APP.tick = null;
    }
    if (APP.midnight) {
      clearTimeout(APP.midnight);
      APP.midnight = null;
    }
  };

  const finalizeOnClose = () => {
    if (!APP.state || APP.state.paused) return;

    const now = Date.now();
    if (APP.state.mode === 'work') {
      APP.state.work += now - APP.state.activeSince;
    } else {
      APP.state.rest += now - APP.state.activeSince;
    }

    APP.state.segments = APP.state.segments || [];
    APP.state.segments.push({
      mode: APP.state.mode,
      start: APP.state.activeSince,
      end: now
    });

    APP.state.activeSince = now;
    APP.state.paused = true;
    save(APP.state);
  };

  const resumeOnOpen = () => {
    if (!APP.state) APP.state = load();
    if (APP.state.paused) {
      APP.state.activeSince = Date.now();
      APP.state.paused = false;
      save(APP.state);
    }
  };

  const html = `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>Timer</title>
<style>
html,body{margin:0;width:100%;height:100%;font-family:Arial,system-ui,sans-serif;color:#fff;overflow:hidden;background:radial-gradient(circle at top,#1f2937,#111 60%)}
body{display:flex;align-items:center;justify-content:center}
.wrap{width:100%;height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;box-sizing:border-box;padding:12px}
.card{width:min(390px,96vw);background:rgba(17,24,39,.92);border:1px solid rgba(255,255,255,.08);border-radius:18px;box-shadow:0 18px 50px rgba(0,0,0,.35);backdrop-filter:blur(8px);overflow:hidden}
.top{padding:14px 14px 12px;text-align:center}
.mode{font:700 11px Arial;letter-spacing:1.6px;opacity:.85;margin-bottom:6px}
.time{font:700 38px Arial;letter-spacing:2px;line-height:1}
.sub{display:flex;justify-content:space-between;gap:10px;font:12px Arial;opacity:.8;margin-top:8px}
.bar{display:flex;gap:8px;justify-content:center;flex-wrap:wrap;margin-top:12px}
button{font:14px Arial;padding:7px 12px;border-radius:10px;border:0;cursor:pointer;background:#334155;color:#fff}
button.primary{background:#4f46e5}
.chart{display:none;border-top:1px solid rgba(255,255,255,.08);background:rgba(15,23,42,.75);padding:10px 12px 12px}
.chart.open{display:block}
.head{display:flex;justify-content:space-between;gap:8px;align-items:center;font:12px Arial;margin-bottom:8px;opacity:.92}
.legend{display:flex;gap:10px;flex-wrap:wrap;font:12px Arial;opacity:.9}
.dot{display:inline-block;width:10px;height:10px;border-radius:50%;margin-right:6px;vertical-align:middle}
.track{height:14px;background:#243041;border-radius:999px;overflow:hidden;display:flex;margin-top:10px}
.work{height:100%;background:#4f46e5}
.rest{height:100%;background:#10b981}
.stats{display:flex;justify-content:space-between;gap:10px;font:12px Arial;margin-top:6px;opacity:.95}
.log{margin-top:8px;font:11px Arial;line-height:1.4;opacity:.8;white-space:pre-wrap}
</style>
</head>
<body>
<div class="wrap">
  <div class="card">
    <div class="top">
      <div class="mode" id="md">WORK MODE</div>
      <div class="time" id="tm">00:00:00</div>
      <div class="sub">
        <span id="tot">Work 00:00:00 | Rest 00:00:00</span>
        <span id="since">Since: --:--:--</span>
      </div>
      <div class="bar">
        <button class="primary" id="tw">Rest</button>
        <button id="rs">Reset</button>
        <button id="ch">Chart ▾</button>
      </div>
    </div>
    <div class="chart" id="ct">
      <div class="head">
        <strong>Live chart</strong>
        <span id="pr">0% productive</span>
      </div>
      <div class="legend">
        <span><span class="dot" style="background:#4f46e5"></span>Productive</span>
        <span><span class="dot" style="background:#10b981"></span>Rest</span>
      </div>
      <div class="track">
        <div class="work" id="wb" style="width:50%"></div>
        <div class="rest" id="rb" style="width:50%"></div>
      </div>
      <div class="stats">
        <span id="ws">Work: 00:00:00</span>
        <span id="rsx">Rest: 00:00:00</span>
      </div>
      <div class="log" id="lg"></div>
    </div>
  </div>
</div>
</body>
</html>`;

  window.__timerToggle = async function () {
    if (APP.win && !APP.win.closed) {
      APP.win.close();
      return;
    }

    if (!window.documentPictureInPicture) {
      alert('Doc PiP not supported');
      return;
    }

    APP.state = load();
    resumeOnOpen();

    const pip = await documentPictureInPicture.requestWindow({ width: 420, height: 255 });
    APP.win = pip;

    const d = pip.document;
    d.open();
    d.write(html);
    d.close();

    const E = (id) => d.getElementById(id);
    let chartOpen = true;

    const totalNow = () => {
      const now = Date.now();
      let work = APP.state.work;
      let rest = APP.state.rest;

      if (!APP.state.paused) {
        if (APP.state.mode === 'work') work += now - APP.state.activeSince;
        else rest += now - APP.state.activeSince;
      }

      return {
        work,
        rest,
        total: work + rest,
        cur: APP.state.paused
          ? (APP.state.mode === 'work' ? work : rest)
          : (APP.state.mode === 'work' ? work : rest)
      };
    };

    const render = () => {
      if (APP.state.day !== today()) {
        APP.state = blank();
        save(APP.state);
      }

      const x = totalNow();
      const prod = x.total ? Math.round((x.work * 100) / x.total) : 0;

      E('tm').textContent = fmt(x.cur);
      E('md').textContent = APP.state.mode === 'work' ? 'WORK MODE' : 'REST MODE';
      E('tw').textContent = APP.state.mode === 'work' ? 'Rest' : 'Work';
      E('tot').textContent = 'Work ' + fmt(x.work) + ' | Rest ' + fmt(x.rest);
      E('since').textContent = 'Since: ' + new Date(APP.state.activeSince).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      E('pr').textContent = prod + '% productive';
      E('wb').style.width = x.total ? Math.max(3, (x.work * 100) / x.total) + '%' : '50%';
      E('rb').style.width = x.total ? Math.max(3, (x.rest * 100) / x.total) + '%' : '50%';
      E('ws').textContent = 'Work: ' + fmt(x.work);
      E('rsx').textContent = 'Rest: ' + fmt(x.rest);
      E('lg').textContent = (APP.state.segments || []).slice(-5).map(s =>
        new Date(s.start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) +
        ' ' + (s.mode === 'work' ? 'Work' : 'Rest') +
        ' → ' +
        new Date(s.end).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      ).join('\n') || 'Your recent work/rest blocks will appear here.';

      save(APP.state);
    };

    const swap = () => {
      if (APP.state.paused) return;

      const now = Date.now();
      if (APP.state.mode === 'work') APP.state.work += now - APP.state.activeSince;
      else APP.state.rest += now - APP.state.activeSince;

      APP.state.segments = APP.state.segments || [];
      APP.state.segments.push({
        mode: APP.state.mode,
        start: APP.state.activeSince,
        end: now
      });

      APP.state.mode = APP.state.mode === 'work' ? 'rest' : 'work';
      APP.state.activeSince = now;
      save(APP.state);
      render();
    };

    const reset = () => {
      APP.state = blank();
      save(APP.state);
      render();
    };

    const scheduleMidnight = () => {
      clearTimeout(APP.midnight);
      APP.midnight = setTimeout(() => {
        APP.state = blank();
        save(APP.state);
        render();
        scheduleMidnight();
      }, msToMidnight());
    };

    const cleanup = () => {
      finalizeOnClose();
      clearTimers();
      if (APP.win === pip) APP.win = null;
    };

    pip.addEventListener('pagehide', cleanup);
    pip.addEventListener('beforeunload', cleanup);

    E('tw').onclick = swap;
    E('rs').onclick = reset;
    E('ch').onclick = () => {
      chartOpen = !chartOpen;
      APP.chartOpen = chartOpen;
      E('ct').classList.toggle('open', chartOpen);
      E('ch').textContent = chartOpen ? 'Chart ▴' : 'Chart ▾';
      try { pip.resizeTo(420, chartOpen ? 395 : 255); } catch {}
    };

    E('ct').classList.add('open');
    E('ch').textContent = 'Chart ▴';
    APP.chartOpen = true;

    render();
    clearTimers();
    APP.tick = setInterval(render, 200);
    scheduleMidnight();
  };
})();