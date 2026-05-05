/**
 * WakaTime Theme Loader
 * 根据 config.json 自动应用主题
 */

(function() {
  'use strict';

  var THEMES = {
    rest: {
      name: '休息日',
      gradient: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)',
      colors: { c1: '#1a1a2e', c2: '#16213e', c3: '#0f3460' },
      animationSpeed: '30s',
      glowColor: 'rgba(100, 100, 150, 0.3)',
      glowSize: '10px',
      pulseSpeed: '4s',
      emoji: '🛌'
    },
    relaxed: {
      name: '轻松日',
      gradient: 'linear-gradient(135deg, #134e5e 0%, #71b280 100%)',
      colors: { c1: '#134e5e', c2: '#71b280', c3: '#a8e6cf' },
      animationSpeed: '20s',
      glowColor: 'rgba(113, 178, 128, 0.5)',
      glowSize: '20px',
      pulseSpeed: '3s',
      emoji: '🌱'
    },
    productive: {
      name: '充实日',
      gradient: 'linear-gradient(135deg, #f5af19 0%, #f12711 100%)',
      colors: { c1: '#f12711', c2: '#f5af19', c3: '#ff9a9e' },
      animationSpeed: '15s',
      glowColor: 'rgba(245, 175, 25, 0.6)',
      glowSize: '25px',
      pulseSpeed: '2s',
      emoji: '⚡'
    },
    focused: {
      name: '专注日',
      gradient: 'linear-gradient(135deg, #ff416c 0%, #ff4b2b 100%)',
      colors: { c1: '#ff416c', c2: '#ff4b2b', c3: '#ff9a9e' },
      animationSpeed: '10s',
      glowColor: 'rgba(255, 75, 43, 0.7)',
      glowSize: '30px',
      pulseSpeed: '1s',
      emoji: '🔥'
    },
    intense: {
      name: '极限日',
      gradient: 'linear-gradient(135deg, #8e2de2 0%, #4a00e0 100%)',
      colors: { c1: '#8e2de2', c2: '#4a00e0', c3: '#00c6ff' },
      animationSpeed: '8s',
      glowColor: 'rgba(142, 45, 226, 0.8)',
      glowSize: '35px',
      pulseSpeed: '0.8s',
      emoji: '🌟'
    },
    legendary: {
      name: '超神日',
      gradient: 'linear-gradient(135deg, #00c6ff 0%, #0072ff 100%)',
      colors: { c1: '#00c6ff', c2: '#0072ff', c3: '#ffffff' },
      animationSpeed: '5s',
      glowColor: 'rgba(0, 198, 255, 1)',
      glowSize: '50px',
      pulseSpeed: '0.5s',
      emoji: '💥'
    }
  };

  function loadConfig() {
    // Debug: Check URL parameters first
    // Example: ?theme=focused&hours=6
    var urlParams = new URLSearchParams(window.location.search);
    if (urlParams.has('theme') || urlParams.has('hours')) {
      console.log('🔧 Debug mode: Using URL parameters');
      var debugConfig = {
        theme_name: urlParams.get('theme') || 'rest',
        hours: parseFloat(urlParams.get('hours')) || 0,
        date: new Date().toISOString().split('T')[0]
      };
      applyTheme(debugConfig);
      return;
    }

    // Main execution: Load config via script tag
    loadScript('assets/json/config.js', function(err) {
      if (!err && window.WAKATIME_CONFIG) {
        applyTheme(window.WAKATIME_CONFIG);
      } else {
        console.warn('Config load failed:', err);
        // Fallback
        applyTheme({
          theme_name: 'rest',
          hours: 0,
          theme_display: '初始化'
        });
      }
    });
  }

  // Helper to load scripts dynamically
  function loadScript(url, callback) {
    var script = document.createElement('script');
    script.src = url + '?t=' + new Date().getTime();
    script.onload = function() {
      callback(null);
      // Optional: remove script after loading to keep DOM clean
      // script.remove(); 
    };
    script.onerror = function() {
      callback(new Error('Failed to load ' + url));
    };
    document.body.appendChild(script);
  }

  function applyTheme(config) {
    var themeName = config.theme_name || 'rest';
    var theme = THEMES[themeName] || THEMES.rest;
    
    document.documentElement.style.setProperty('--bg-gradient', theme.gradient);
    document.documentElement.style.setProperty('--animation-speed', theme.animationSpeed);
    document.documentElement.style.setProperty('--glow-color', theme.glowColor);
    document.documentElement.style.setProperty('--glow-size', theme.glowSize);
    document.documentElement.style.setProperty('--pulse-speed', theme.pulseSpeed);
    
    // Extract a main color from the gradient for accents
    // Simple heuristic: take the first color of the gradient
    var match = theme.gradient.match(/#[a-fA-F0-9]{6}|#[a-fA-F0-9]{3}|rgba?\([^)]+\)/);
    var mainColor = match ? match[0] : '#ffffff';
    document.documentElement.style.setProperty('--wakatime-theme-color', mainColor);

    // Remove the background override to let Bing image show through naturally
    // We will use the theme color for accents instead
    var targetElement = document.querySelector('.panel-cover--overlay');
    if (targetElement) {
       targetElement.style.background = '';
       targetElement.classList.remove('animated-bg');
    }
    
    var avatar = document.querySelector('.js-avatar');
    if (avatar) {
      avatar.classList.add('glowing');
    }
    
    updateStatusDisplay(config, theme);
    
    // 初始化周报弹窗交互
    initWeeklyStats(theme);
    
    if (themeName === 'intense' || themeName === 'legendary') {
      addParticleEffects();
    }
    
    console.log('🎨 Theme applied:', theme.name, '(' + config.hours + ' hours)');
  }

  function updateStatusDisplay(config, theme) {
    var statusEl = document.getElementById('wakatime-status');
    if (!statusEl) {
      statusEl = document.createElement('div');
      statusEl.id = 'wakatime-status';
      statusEl.className = 'wakatime-status';
      document.body.appendChild(statusEl);
    }
    
    // 添加点击提示样式
    statusEl.style.cursor = 'pointer';
    statusEl.title = '点击查看本周能量报告';
    
    statusEl.innerHTML = '<span class="wt-emoji">' + theme.emoji + '</span> ' +
                         '<span class="wt-text">' + theme.name + ' · ' + config.hours + 'h</span>';
  }

  function initWeeklyStats(theme) {
    var statusEl = document.getElementById('wakatime-status');
    if (!statusEl) return;
    
    // 避免重复绑定
    var newEl = statusEl.cloneNode(true);
    statusEl.parentNode.replaceChild(newEl, statusEl);
    statusEl = newEl;
    
    statusEl.addEventListener('click', function() {
      // 检查是否已存在弹窗
      var existingModal = document.querySelector('.weekly-modal');
      if (existingModal) {
        existingModal.classList.add('show');
        return;
      }
      
      // 加载数据 via Script tag
      loadScript('assets/json/weekly.js', function(err) {
        if (!err && window.WAKATIME_WEEKLY) {
          showWeeklyModal(window.WAKATIME_WEEKLY, theme);
        } else {
          console.error('Failed to load weekly data', err);
        }
      });
    });
  }

  function showWeeklyModal(data, theme) {
    var modal = document.createElement('div');
    modal.className = 'weekly-modal';
    
    // 生成 SVG 平滑曲线图 (Catmull-Rom Spline)
    var chartHeight = 100;
    var chartWidth = 340; 
    var maxHours = Math.max(...data.days.map(d => d.hours), 1); 
    
    // 计算点坐标
    var points = data.days.map((day, index) => {
      var x = (index / (data.days.length - 1)) * chartWidth;
      var y = chartHeight - (day.hours / maxHours) * chartHeight;
      return {x, y};
    });

    // 生成平滑路径 (Catmull-Rom)
    function catmullRom2bezier(points) {
      var result = [];
      for (var i = 0; i < points.length - 1; i++) {
        var p0 = i === 0 ? points[0] : points[i - 1];
        var p1 = points[i];
        var p2 = points[i + 1];
        var p3 = i + 2 < points.length ? points[i + 2] : p2;

        var cp1x = p1.x + (p2.x - p0.x) / 6;
        var cp1y = p1.y + (p2.y - p0.y) / 6;
        var cp2x = p2.x - (p3.x - p1.x) / 6;
        var cp2y = p2.y - (p3.y - p1.y) / 6;

        result.push(`C ${cp1x},${cp1y} ${cp2x},${cp2y} ${p2.x},${p2.y}`);
      }
      return result.join(' ');
    }

    var pathD = `M ${points[0].x},${points[0].y} ` + catmullRom2bezier(points);
    // 闭合路径用于填充
    var fillD = pathD + ` L ${chartWidth},${chartHeight + 20} L 0,${chartHeight + 20} Z`;

    function isHexColor(value) {
      return typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value.trim());
    }
    function safeNumber(value, fallback) {
      var n = Number(value);
      return Number.isFinite(n) ? n : fallback;
    }

    var badgeColor = isHexColor(data && data.ai && data.ai.theme_color) ? data.ai.theme_color.trim() : theme.colors.c1;

    modal.innerHTML =
      '<div class="modal-backdrop"></div>' +
      '<div class="modal-content">' +
        '<div class="modal-header">' +
          '<div class="ai-badge" style="--badge-color: ' + badgeColor + '"></div>' +
          '<h2>SYSTEM MONITOR</h2>' +
        '</div>' +
        '<div class="weekly-chart-container">' +
          '<svg viewBox="0 0 ' + chartWidth + ' ' + (chartHeight + 20) + '" preserveAspectRatio="none">' +
            '<pattern id="grid" width="40" height="20" patternUnits="userSpaceOnUse">' +
              '<path d="M 40 0 L 0 0 0 20" fill="none" stroke="#222" stroke-width="1"></path>' +
            '</pattern>' +
            '<rect width="100%" height="100%" fill="url(#grid)"></rect>' +
            '<defs>' +
              '<linearGradient id="chartGradient" x1="0" x2="0" y1="0" y2="1">' +
                '<stop offset="0%" stop-color="' + theme.colors.c1 + '" stop-opacity="0.2"></stop>' +
                '<stop offset="100%" stop-color="' + theme.colors.c1 + '" stop-opacity="0"></stop>' +
              '</linearGradient>' +
            '</defs>' +
            '<path d="' + fillD + '" fill="url(#chartGradient)"></path>' +
            '<path d="' + pathD + '" fill="none" stroke="' + theme.colors.c1 + '" stroke-width="1.5" stroke-linecap="round"></path>' +
          '</svg>' +
        '</div>' +
        '<div class="ai-insight"><p></p></div>' +
        '<div class="stats-grid">' +
          '<div class="stat-item"><span class="val"></span><span class="key">TOTAL</span></div>' +
          '<div class="stat-item"><span class="val"></span><span class="key">AVG</span></div>' +
          '<div class="stat-item"><span class="val"></span><span class="key">PEAK</span></div>' +
        '</div>' +
      '</div>';

    var badgeEl = modal.querySelector('.ai-badge');
    if (badgeEl) {
      badgeEl.textContent = (data && data.ai && typeof data.ai.tarot === 'string') ? data.ai.tarot : '';
    }
    var quoteEl = modal.querySelector('.ai-insight p');
    if (quoteEl) {
      quoteEl.textContent = (data && data.ai && typeof data.ai.quote === 'string') ? data.ai.quote : '';
    }
    var statVals = modal.querySelectorAll('.stat-item .val');
    if (statVals && statVals.length === 3) {
      statVals[0].textContent = String(safeNumber(data && data.stats && data.stats.total_hours, 0)) + 'h';
      statVals[1].textContent = String(safeNumber(data && data.stats && data.stats.daily_avg, 0)) + 'h';
      statVals[2].textContent = String(safeNumber(data && data.stats && data.stats.max_day && data.stats.max_day.hours, 0)) + 'h';
    }
    
    document.body.appendChild(modal);
    
    // Force Reflow: 强制浏览器计算初始状态，确保 transition 能生效
    void modal.offsetWidth;
    
    // 延迟添加 show 类，触发动画
    setTimeout(function() {
      modal.classList.add('show');
    }, 10);
    
    // 点击背景关闭
    modal.querySelector('.modal-backdrop').addEventListener('click', function() {
      modal.classList.remove('show');
      setTimeout(function() { modal.remove(); }, 200);
    });
  }

  function addParticleEffects() {
    if (document.getElementById('particle-container')) return;
    
    var container = document.createElement('div');
    container.id = 'particle-container';
    container.className = 'particle-container';
    
    var targetElement = document.querySelector('.panel-cover') || document.body;
    targetElement.appendChild(container);
    
    for (var i = 0; i < 20; i++) {
      var particle = document.createElement('div');
      particle.className = 'particle';
      particle.style.left = Math.random() * 100 + '%';
      particle.style.animationDelay = Math.random() * 2 + 's';
      container.appendChild(particle);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', loadConfig);
  } else {
    loadConfig();
  }
})();
