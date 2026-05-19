const fs = require('fs');
const https = require('https');
const path = require('path');

const WAKATIME_TOKEN = process.env.WAKATIME_TOKEN?.trim();
const TIME_ZONE = process.env.TZ || 'Asia/Shanghai';
const GH_TOKEN = process.env.GH_TOKEN?.trim();
const MODEL_NAME = process.env.MODEL_NAME || 'openai/gpt-4.1';
const MODEL_DEBUG = process.env.MODEL_DEBUG === '1';
const MANUAL_HOURS = process.env.MANUAL_HOURS;
const MANUAL_THEME = process.env.MANUAL_THEME;

const THEME_RULES = [
  { max: 1, name: 'rest', display: '休息日' },
  { max: 3, name: 'relaxed', display: '轻松日' },
  { max: 5, name: 'productive', display: '充实日' },
  { max: 7, name: 'focused', display: '专注日' },
  { max: 9, name: 'intense', display: '极限日' },
  { max: Infinity, name: 'legendary', display: '超神日' }
];

function formatYmd(date, timeZone) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(date);
}

function addDays(date, delta) {
  const d = new Date(date.getTime());
  d.setDate(d.getDate() + delta);
  return d;
}

function writeGithubOutput(hours, themeName) {
  if (!process.env.GITHUB_OUTPUT) return;
  fs.appendFileSync(process.env.GITHUB_OUTPUT, `hours=${hours}\n`);
  fs.appendFileSync(process.env.GITHUB_OUTPUT, `theme_name=${themeName}\n`);
}

function httpRequestJson(url, method, headers, body) {
  return new Promise((resolve, reject) => {
    const req = https.request(url, { method, headers, timeout: 15000 }, (res) => {
      let raw = '';
      res.on('data', chunk => raw += chunk);
      res.on('end', () => {
        if (res.statusCode >= 400) {
          reject(new Error(`HTTP ${res.statusCode}: ${raw.slice(0, 500)}`));
          return;
        }
        try {
          resolve(JSON.parse(raw));
        } catch (e) {
          reject(new Error('Invalid JSON response'));
        }
      });
    });

    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error('Request timeout')));
    if (body) req.write(body);
    req.end();
  });
}

async function fetchWeeklyRaw(startDate, endDate) {
  if (!WAKATIME_TOKEN) {
    throw new Error('WAKATIME_TOKEN is required.');
  }

  const url = `https://wakatime.com/api/v1/users/current/summaries?start=${startDate}&end=${endDate}`;

  let authHeader = '';
  if (/^bearer\s+/i.test(WAKATIME_TOKEN)) {
    authHeader = WAKATIME_TOKEN;
  } else if (/^waka_/i.test(WAKATIME_TOKEN)) {
    const basic = Buffer.from(`${WAKATIME_TOKEN}:`, 'utf8').toString('base64');
    authHeader = `Basic ${basic}`;
  } else {
    authHeader = `Bearer ${WAKATIME_TOKEN}`;
  }

  console.log(`Fetching WakaTime data for ${startDate} to ${endDate}`);
  return httpRequestJson(url, 'GET', { Authorization: authHeader });
}

function parseDaysFromRaw(raw) {
  if (!raw?.data?.length) throw new Error('Invalid WakaTime data structure');
  return raw.data.map(day => ({
    date: day.range.date,
    hours: parseFloat((day.grand_total.total_seconds / 3600).toFixed(2)),
    text: day.grand_total.text
  }));
}

function computeStats(days) {
  const totalHours = days.reduce((sum, d) => sum + d.hours, 0);
  const avgHours = totalHours / days.length;
  const maxDay = days.reduce((prev, curr) => prev.hours > curr.hours ? prev : curr);
  const firstHalf = days.slice(0, 3).reduce((sum, d) => sum + d.hours, 0) / 3;
  const secondHalf = days.slice(3).reduce((sum, d) => sum + d.hours, 0) / (days.length - 3);
  const trend = secondHalf > firstHalf ? '上升' : '下降';

  return { totalHours, avgHours, maxDay, trend };
}

function pickTheme(hours, manualTheme) {
  if (manualTheme) {
    const rule = THEME_RULES.find(r => r.name === manualTheme) || THEME_RULES[THEME_RULES.length - 1];
    return { theme_name: manualTheme, theme_display: rule.display };
  }
  const rule = THEME_RULES.find(r => hours < r.max) || THEME_RULES[THEME_RULES.length - 1];
  return { theme_name: rule.name, theme_display: rule.display };
}

// ... (keep your normalizeAiResult, isHexColor, truncateByCodePoints functions unchanged)

async function callModel(prompt) {
  if (!GH_TOKEN) {
    console.log('⚠️ GH_TOKEN not set, skipping AI generation.');
    return null;
  }

  const body = JSON.stringify({
    messages: [
      { role: 'system', content: 'You are a helpful assistant that speaks JSON.' },
      { role: 'user', content: prompt }
    ],
    model: MODEL_NAME,
    temperature: 0.8,
    max_tokens: 250
  });

  return httpRequestJson(
    'https://models.github.ai/inference/chat/completions',
    'POST',
    {
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
      'X-GitHub-Api-Version': '2022-11-28',
      Authorization: `Bearer ${GH_TOKEN}`
    },
    body
  );
}

// ... (keep generateAi function, but update the callModel call)

async function generateAi(days, stats) {
  // Your existing FALLBACK_SCENARIOS remains the same...

  const fallbackData = FALLBACK_SCENARIOS.find(s => stats.avgHours < s.max).data;
  let aiResult = { ...fallbackData };

  const prompt = `...`; // your existing prompt (unchanged)

  try {
    const apiResponse = await callModel(prompt);
    if (!apiResponse) return normalizeAiResult(null, fallbackData);

    const content = apiResponse.choices?.[0]?.message?.content || '';
    const cleaned = content.replace(/```json|```/gi, '').trim();

    try {
      const candidate = JSON.parse(cleaned);
      aiResult = normalizeAiResult(candidate, fallbackData);
    } catch (e) {
      console.log('⚠️ Failed to parse AI JSON, using fallback.');
    }
  } catch (err) {
    console.log(`AI generation failed: ${err.message}`);
  }

  return normalizeAiResult(aiResult, fallbackData);
}

// ... (keep ensureDir, writeJsVar)

async function main() {
  try {
    const now = new Date();
    const endDate = formatYmd(now, TIME_ZONE);
    const startDate = formatYmd(addDays(now, -6), TIME_ZONE);
    const yesterday = formatYmd(addDays(now, -1), TIME_ZONE);

    const raw = await fetchWeeklyRaw(startDate, endDate);
    const days = parseDaysFromRaw(raw);
    const stats = computeStats(days);

    let dailyHours = MANUAL_HOURS 
      ? parseFloat(MANUAL_HOURS) 
      : (days.find(d => d.date === yesterday)?.hours || 0);

    const theme = pickTheme(dailyHours, MANUAL_THEME);

    const config = {
      date: yesterday,
      hours: dailyHours,
      theme_name: theme.theme_name,
      theme_display: theme.theme_display,
      updated_at: new Date().toISOString()
    };

    const ai = await generateAi(days, stats);

    const weekly = {
      updated_at: new Date().toISOString(),
      stats: {
        total_hours: parseFloat(stats.totalHours.toFixed(2)),
        daily_avg: parseFloat(stats.avgHours.toFixed(2)),
        trend: stats.trend === '上升' ? 'rising' : 'falling',
        max_day: stats.maxDay
      },
      days,
      ai
    };

    const outDir = path.join(__dirname, '../../assets/json');
    ensureDir(outDir);

    writeJsVar(path.join(outDir, 'config.js'), 'WAKATIME_CONFIG', config);
    writeJsVar(path.join(outDir, 'weekly.js'), 'WAKATIME_WEEKLY', weekly);

    console.log(`✅ Success! Daily theme: ${theme.theme_display} (${dailyHours}h)`);
    writeGithubOutput(dailyHours, theme.theme_name);

  } catch (err) {
    console.error('WakaTime update failed:', err.message);
    process.exit(1);
  }
}

main();