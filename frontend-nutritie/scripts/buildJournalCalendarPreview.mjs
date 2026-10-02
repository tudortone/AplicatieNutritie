import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = resolve(root, 'artifacts/journal_calendar_preview');
mkdirSync(outDir, { recursive: true });

const html = `<!DOCTYPE html>
<html lang="ro">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>GetFlow — Journal Compact 7-Day Calendar Visual QA</title>
  <style>
    :root {
      --bg: #090C0E;
      --surface: #12161A;
      --surface-elevated: #181D22;
      --border: rgba(255, 255, 255, 0.08);
      --overlay-light: rgba(255, 255, 255, 0.04);
      --accent: #CCFF00;
      --accent-hover: #b8e600;
      --text-on-accent: #000000;
      --text-primary: #FFFFFF;
      --text-secondary: #8B93A0;
      --text-tertiary: #9AA0B0;
      --dot-color: #CCFF00;
      --danger: #F87171;
      --font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    }

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
      font-family: var(--font-family);
      -webkit-tap-highlight-color: transparent;
    }

    body {
      background: var(--bg);
      color: var(--text-primary);
      min-height: 100vh;
      padding: 24px 16px;
      display: flex;
      flex-direction: column;
      align-items: center;
    }

    header {
      width: 100%;
      max-width: 900px;
      margin-bottom: 24px;
      text-align: center;
    }

    h1 {
      font-size: 24px;
      font-weight: 800;
      letter-spacing: -0.5px;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
    }

    .badge-pro {
      font-size: 11px;
      font-weight: 800;
      background: var(--accent);
      color: var(--text-on-accent);
      padding: 3px 8px;
      border-radius: 6px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    p.subtitle {
      color: var(--text-secondary);
      font-size: 14px;
      margin-top: 6px;
    }

    /* Controls Bar */
    .controls-bar {
      width: 100%;
      max-width: 900px;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 16px;
      padding: 12px 16px;
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      margin-bottom: 24px;
    }

    .controls-group {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .control-label {
      font-size: 12px;
      font-weight: 700;
      color: var(--text-secondary);
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .btn-pill {
      background: var(--overlay-light);
      border: 1px solid var(--border);
      color: var(--text-primary);
      padding: 6px 12px;
      border-radius: 10px;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.15s ease;
    }

    .btn-pill:hover {
      background: rgba(255, 255, 255, 0.08);
      border-color: rgba(255, 255, 255, 0.2);
    }

    .btn-pill.active {
      background: var(--accent);
      color: var(--text-on-accent);
      border-color: var(--accent);
      font-weight: 800;
    }

    /* QA State Scenarios Grid */
    .qa-states-grid {
      width: 100%;
      max-width: 900px;
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
      gap: 16px;
      margin-bottom: 32px;
    }

    .state-card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 14px;
      padding: 12px 14px;
      cursor: pointer;
      transition: all 0.2s ease;
    }

    .state-card:hover {
      border-color: var(--accent);
      transform: translateY(-2px);
    }

    .state-card.selected {
      border-color: var(--accent);
      box-shadow: 0 0 16px rgba(204, 255, 0, 0.15);
    }

    .state-num {
      font-size: 10px;
      font-weight: 800;
      color: var(--accent);
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .state-title {
      font-size: 14px;
      font-weight: 700;
      color: var(--text-primary);
      margin-top: 2px;
    }

    .state-desc {
      font-size: 12px;
      color: var(--text-secondary);
      margin-top: 4px;
      line-height: 1.3;
    }

    /* Device Showcase Container */
    .showcase-container {
      width: 100%;
      display: flex;
      justify-content: center;
      gap: 24px;
      flex-wrap: wrap;
    }

    .device-frame {
      background: #000000;
      border: 2px solid rgba(255, 255, 255, 0.15);
      border-radius: 36px;
      padding: 16px 12px 24px;
      box-shadow: 0 20px 50px rgba(0, 0, 0, 0.8), 0 0 0 1px rgba(255, 255, 255, 0.05);
      display: flex;
      flex-direction: column;
      position: relative;
    }

    .device-notch {
      width: 120px;
      height: 18px;
      background: #111;
      border-radius: 0 0 12px 12px;
      margin: 0 auto 12px;
    }

    .device-label {
      text-align: center;
      font-size: 11px;
      font-weight: 700;
      color: var(--text-secondary);
      margin-bottom: 8px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    /* Component: MonthCalendar */
    .month-calendar-container {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 20px;
      padding: 12px 12px 10px;
      width: 100%;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.4);
      transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
    }

    /* Calendar Header */
    .calendar-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 10px;
    }

    .header-title-btn {
      display: flex;
      align-items: center;
      gap: 4px;
      background: none;
      border: none;
      color: var(--text-primary);
      cursor: pointer;
      padding: 4px 6px;
      border-radius: 8px;
    }

    .header-title-btn:hover {
      background: var(--overlay-light);
    }

    .month-title {
      font-size: 16px;
      font-weight: 800;
      letter-spacing: -0.3px;
    }

    .dropdown-caret {
      font-size: 12px;
      font-weight: 800;
      color: var(--accent);
      margin-left: 2px;
    }

    .header-actions {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .btn-today, .btn-expand {
      background: var(--overlay-light);
      border: 1px solid var(--border);
      color: var(--text-primary);
      padding: 6px 10px;
      border-radius: 12px;
      font-size: 12px;
      font-weight: 800;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 4px;
      min-height: 36px;
      transition: all 0.15s ease;
    }

    .btn-today:hover, .btn-expand:hover {
      background: rgba(255, 255, 255, 0.08);
      border-color: rgba(255, 255, 255, 0.2);
    }

    .btn-today.highlight {
      background: var(--accent);
      color: var(--text-on-accent);
      border-color: var(--accent);
    }

    /* Compact 7-Day Strip */
    .compact-strip-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 4px;
    }

    .nav-arrow-btn {
      width: 36px;
      height: 36px;
      border-radius: 12px;
      background: var(--overlay-light);
      border: 1px solid var(--border);
      color: var(--accent);
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      font-size: 18px;
      font-weight: bold;
      transition: all 0.15s ease;
      flex-shrink: 0;
    }

    .nav-arrow-btn:hover {
      background: rgba(255, 255, 255, 0.08);
      border-color: rgba(255, 255, 255, 0.2);
    }

    .compact-days-container {
      flex: 1;
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 4px;
    }

    .day-pill {
      flex: 1;
      min-width: 34px;
      max-width: 48px;
      min-height: 52px;
      padding: 6px 2px;
      border-radius: 14px;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      background: var(--overlay-light);
      border: 1px solid transparent;
      transition: all 0.15s ease;
      position: relative;
    }

    .day-pill:hover {
      background: rgba(255, 255, 255, 0.08);
    }

    .day-pill.today-unselected {
      border: 1.5px solid var(--accent);
      background: var(--overlay-light);
    }

    .day-pill.selected {
      background: var(--accent);
      border-color: var(--accent);
      box-shadow: 0 4px 12px rgba(204, 255, 0, 0.25);
    }

    .weekday-text {
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.2px;
      margin-bottom: 2px;
      color: var(--text-secondary);
    }

    .day-pill.selected .weekday-text {
      color: var(--text-on-accent);
      font-weight: 800;
    }

    .day-number-text {
      font-size: 15px;
      font-weight: 700;
      color: var(--text-primary);
    }

    .day-pill.selected .day-number-text {
      color: var(--text-on-accent);
      font-weight: 900;
    }

    .meal-dot {
      width: 4px;
      height: 4px;
      border-radius: 2px;
      margin-top: 3px;
      background: var(--dot-color);
    }

    .day-pill.selected .meal-dot {
      background: var(--text-on-accent);
    }

    /* Expanded Month Section */
    .expanded-section {
      padding-top: 8px;
      border-top: 1px solid var(--border);
      margin-top: 10px;
      display: none;
    }

    .expanded-section.open {
      display: block;
      animation: fadeIn 0.25s ease-out;
    }

    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(-4px); }
      to { opacity: 1; transform: translateY(0); }
    }

    .month-nav-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 12px;
    }

    .expanded-month-title {
      font-size: 16px;
      font-weight: 800;
      color: var(--text-primary);
    }

    .grid-header-row {
      display: flex;
      justify-content: space-around;
      margin-bottom: 6px;
    }

    .grid-header-initial {
      flex: 1;
      text-align: center;
      font-size: 12px;
      font-weight: 700;
      color: var(--text-secondary);
      text-transform: uppercase;
    }

    .month-grid {
      display: grid;
      grid-template-columns: repeat(7, 1fr);
      gap: 4px;
      margin-bottom: 8px;
    }

    .grid-cell {
      aspect-ratio: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      border-radius: 12px;
      cursor: pointer;
      background: transparent;
      border: 1px solid transparent;
      transition: all 0.12s ease;
      position: relative;
    }

    .grid-cell:hover {
      background: var(--overlay-light);
    }

    .grid-cell.other-month {
      opacity: 0.25;
    }

    .grid-cell.today-unselected {
      border: 1.5px solid var(--accent);
      background: var(--overlay-light);
    }

    .grid-cell.selected {
      background: var(--accent);
      border-color: var(--accent);
      box-shadow: 0 2px 10px rgba(204, 255, 0, 0.3);
    }

    .grid-day-number {
      font-size: 14px;
      font-weight: 600;
      color: var(--text-primary);
    }

    .grid-cell.selected .grid-day-number {
      color: var(--text-on-accent);
      font-weight: 800;
    }

    .grid-cell.selected .meal-dot {
      background: var(--text-on-accent);
    }

    /* Collapse Handle Bar */
    .collapse-handle {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      padding: 8px;
      border-radius: 12px;
      border: 1px solid var(--border);
      background: var(--overlay-light);
      color: var(--text-secondary);
      cursor: pointer;
      font-size: 12px;
      font-weight: 700;
      width: 100%;
      margin-top: 6px;
      transition: all 0.15s ease;
    }

    .collapse-handle:hover {
      background: rgba(255, 255, 255, 0.08);
      color: var(--text-primary);
      border-color: rgba(255, 255, 255, 0.2);
    }

    /* Journal Day Context Banner & Meals Mock */
    .day-context-banner {
      background: rgba(204, 255, 0, 0.08);
      border: 1px solid rgba(204, 255, 0, 0.25);
      border-radius: 14px;
      padding: 10px 14px;
      margin-top: 14px;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    .banner-date-label {
      font-size: 13px;
      font-weight: 800;
      color: var(--text-primary);
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .banner-meals-count {
      font-size: 12px;
      font-weight: 700;
      color: var(--accent);
    }

    .journal-sample-card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 16px;
      padding: 14px;
      margin-top: 12px;
    }

    .journal-card-title {
      font-size: 13px;
      font-weight: 800;
      color: var(--accent);
      margin-bottom: 6px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .macro-row {
      display: flex;
      gap: 12px;
      font-size: 12px;
      color: var(--text-secondary);
    }

    .macro-row strong {
      color: var(--text-primary);
    }

    /* Proof Badge */
    .proof-badge {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      background: rgba(74, 222, 128, 0.15);
      border: 1px solid rgba(74, 222, 128, 0.3);
      color: #4ADE80;
      font-size: 11px;
      font-weight: 800;
      padding: 3px 8px;
      border-radius: 6px;
      margin-top: 4px;
    }
  </style>
</head>
<body>

  <header>
    <h1>GetFlow Journal <span class="badge-pro">Compact 7-Day UX</span></h1>
    <p class="subtitle">Interactive visual verification across viewports, locales (RO/EN/FR/DE), and QA states</p>
    <div style="margin-top: 8px;">
      <span class="proof-badge" id="qa-proof-indicator">QA STATE: 1. Compact Default</span>
    </div>
  </header>

  <!-- Controls Bar -->
  <div class="controls-bar">
    <div class="controls-group">
      <span class="control-label">Locale:</span>
      <button class="btn-pill active" onclick="setLocale('ro')">RO</button>
      <button class="btn-pill" onclick="setLocale('en')">EN</button>
      <button class="btn-pill" onclick="setLocale('fr')">FR</button>
      <button class="btn-pill" onclick="setLocale('de')">DE</button>
    </div>

    <div class="controls-group">
      <span class="control-label">Viewport:</span>
      <button class="btn-pill" onclick="setViewport(320)">320px (Small)</button>
      <button class="btn-pill active" onclick="setViewport(375)">375px (Normal)</button>
      <button class="btn-pill" onclick="setViewport(412)">412px (Large)</button>
    </div>
  </div>

  <!-- QA State Presets Bar -->
  <div class="qa-states-grid">
    <div class="state-card selected" id="card-state-1" onclick="applyState(1)">
      <div class="state-num">Evidence 1</div>
      <div class="state-title">Compact Default</div>
      <div class="state-desc">7-day strip, today indicator, unexpanded, minimal vertical footprint.</div>
    </div>

    <div class="state-card" id="card-state-2" onclick="applyState(2)">
      <div class="state-num">Evidence 2</div>
      <div class="state-title">Selected Day</div>
      <div class="state-desc">Selecting 28 Septembrie; prominent accent pill, journal data reloaded.</div>
    </div>

    <div class="state-card" id="card-state-3" onclick="applyState(3)">
      <div class="state-num">Evidence 3</div>
      <div class="state-title">Today Quick Jump</div>
      <div class="state-desc">Instant return to current day (30 Septembrie) via 'Astăzi' header button.</div>
    </div>

    <div class="state-card" id="card-state-4" onclick="applyState(4)">
      <div class="state-num">Evidence 4</div>
      <div class="state-title">Expanded Month</div>
      <div class="state-desc">Full month calendar grid, meal dot indicators, synchronized selection.</div>
    </div>

    <div class="state-card" id="card-state-5" onclick="applyState(5)">
      <div class="state-num">Evidence 5</div>
      <div class="state-title">Different Month</div>
      <div class="state-desc">Navigating to Octombrie 2026 via month chevron navigation.</div>
    </div>

    <div class="state-card" id="card-state-6" onclick="applyState(6)">
      <div class="state-num">Evidence 6</div>
      <div class="state-title">Collapsed After Selection</div>
      <div class="state-desc">Selecting 15 Octombrie in full calendar, collapsing back to compact strip.</div>
    </div>
  </div>

  <!-- Device Showcase -->
  <div class="showcase-container">
    <div class="device-frame" id="device-wrapper" style="width: 375px;">
      <div class="device-notch"></div>
      <div class="device-label" id="viewport-label">Normal Phone (375px)</div>

      <!-- MonthCalendar Component Instance -->
      <div class="month-calendar-container" id="calendar-widget">
        
        <!-- Header -->
        <div class="calendar-header">
          <button class="header-title-btn" id="calendar-title-btn" onclick="toggleExpand()">
            <span class="month-title" id="display-month-year">Septembrie 2026</span>
            <span class="dropdown-caret" id="title-caret">▼</span>
          </button>

          <div class="header-actions">
            <button class="btn-today" id="btn-today" onclick="goToToday()" aria-label="Mergi la ziua de azi">
              📅 <span id="label-today">Astăzi</span>
            </button>
            <button class="btn-expand" id="btn-expand" onclick="toggleExpand()" aria-label="Deschide calendar complet">
              <span id="label-expand-icon">📅</span>
              <span id="label-expand-text">Lună</span>
            </button>
          </div>
        </div>

        <!-- Compact 7-Day Strip Row -->
        <div class="compact-strip-row" id="compact-strip">
          <button class="nav-arrow-btn" onclick="navWeek(-1)" aria-label="Săptămâna anterioară">‹</button>
          <div class="compact-days-container" id="strip-days-container">
            <!-- Dynamically populated 7 days -->
          </div>
          <button class="nav-arrow-btn" onclick="navWeek(1)" aria-label="Săptămâna următoare">›</button>
        </div>

        <!-- Expanded Full Month Section -->
        <div class="expanded-section" id="expanded-section">
          <!-- Month Nav Row -->
          <div class="month-nav-row">
            <button class="nav-arrow-btn" onclick="navMonth(-1)" aria-label="Luna anterioară">‹</button>
            <span class="expanded-month-title" id="expanded-month-title">Septembrie 2026</span>
            <button class="nav-arrow-btn" onclick="navMonth(1)" aria-label="Luna următoare">›</button>
          </div>

          <!-- Weekday Headers -->
          <div class="grid-header-row" id="grid-header-row">
            <!-- L M M J V S D -->
          </div>

          <!-- Days Grid -->
          <div class="month-grid" id="month-grid">
            <!-- 35 or 42 cells -->
          </div>

          <!-- Collapse Handle -->
          <button class="collapse-handle" onclick="toggleExpand()" aria-label="Restrânge calendarul">
            ▲ <span id="label-collapse-handle">Restrânge</span>
          </button>
        </div>

      </div>

      <!-- Journal Day Context Banner -->
      <div class="day-context-banner">
        <div class="banner-date-label">
          📅 <span id="journal-selected-date-text">Miercuri, 30 Septembrie 2026</span>
        </div>
        <div class="banner-meals-count" id="journal-meals-summary">3 mese înregistrate</div>
      </div>

      <!-- Sample Nutrition Card -->
      <div class="journal-sample-card">
        <div class="journal-card-title" id="journal-card-meal">Mic Dejun — 580 kcal</div>
        <div class="macro-row">
          <span>P: <strong>38g</strong></span>
          <span>C: <strong>54g</strong></span>
          <span>G: <strong>18g</strong></span>
        </div>
      </div>

    </div>
  </div>

  <script>
    // State
    let currentLocale = 'ro';
    let today = new Date(2026, 8, 30); // 30 September 2026 (Wednesday)
    let selectedDate = new Date(2026, 8, 30);
    let viewMonth = new Date(2026, 8, 1);
    let isExpanded = false;

    // Marked dates with logged meals
    const markedDates = new Set([
      '2026-09-28',
      '2026-09-29',
      '2026-09-30',
      '2026-10-02',
      '2026-10-05',
      '2026-10-15'
    ]);

    const i18n = {
      ro: {
        today: 'Astăzi',
        month: 'Lună',
        collapse: 'Restrânge',
        weekdays: ['Lun', 'Mar', 'Mie', 'Joi', 'Vin', 'Sâm', 'Dum'],
        initials: ['L', 'M', 'M', 'J', 'V', 'S', 'D'],
        mealsLogged: (n) => n + (n === 1 ? ' masă înregistrată' : ' mese înregistrate'),
        noMeals: 'Nicio masă înregistrată'
      },
      en: {
        today: 'Today',
        month: 'Month',
        collapse: 'Collapse',
        weekdays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
        initials: ['M', 'T', 'W', 'T', 'F', 'S', 'S'],
        mealsLogged: (n) => n + (n === 1 ? ' meal logged' : ' meals logged'),
        noMeals: 'No meals logged'
      },
      fr: {
        today: "Aujourd'hui",
        month: 'Mois',
        collapse: 'Réduire',
        weekdays: ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'],
        initials: ['L', 'M', 'M', 'J', 'V', 'S', 'D'],
        mealsLogged: (n) => n + (n === 1 ? ' repas enregistré' : ' repas enregistrés'),
        noMeals: 'Aucun repas enregistré'
      },
      de: {
        today: 'Heute',
        month: 'Monat',
        collapse: 'Einklappen',
        weekdays: ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'],
        initials: ['M', 'D', 'M', 'D', 'F', 'S', 'S'],
        mealsLogged: (n) => n + (n === 1 ? ' Mahlzeit eingetragen' : ' Mahlzeiten eingetragen'),
        noMeals: 'Keine Mahlzeiten'
      }
    };

    function formatDateKey(d) {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return \`\${y}-\${m}-\${day}\`;
    }

    function isSameDay(d1, d2) {
      return d1.getFullYear() === d2.getFullYear() &&
             d1.getMonth() === d2.getMonth() &&
             d1.getDate() === d2.getDate();
    }

    function getMondayOfWeek(d) {
      const res = new Date(d);
      const day = res.getDay();
      const diff = res.getDate() - (day === 0 ? 6 : day - 1);
      res.setDate(diff);
      res.setHours(0, 0, 0, 0);
      return res;
    }

    function formatMonthYear(date, locale) {
      return date.toLocaleDateString(locale, { month: 'long', year: 'numeric' });
    }

    function formatFullDate(date, locale) {
      return date.toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    }

    function render() {
      // Labels
      const t = i18n[currentLocale];
      document.getElementById('label-today').textContent = t.today;
      document.getElementById('label-expand-text').textContent = isExpanded ? t.collapse : t.month;
      document.getElementById('label-expand-icon').textContent = isExpanded ? '▲' : '📅';
      document.getElementById('label-collapse-handle').textContent = t.collapse;
      document.getElementById('title-caret').textContent = isExpanded ? '▲' : '▼';

      // Month/Year title
      const titleStr = formatMonthYear(isExpanded ? viewMonth : selectedDate, currentLocale);
      const capTitle = titleStr.charAt(0).toUpperCase() + titleStr.slice(1);
      document.getElementById('display-month-year').textContent = capTitle;
      document.getElementById('expanded-month-title').textContent = capTitle;

      // Today button highlight
      const btnToday = document.getElementById('btn-today');
      if (isSameDay(selectedDate, today)) {
        btnToday.classList.remove('highlight');
      } else {
        btnToday.classList.add('highlight');
      }

      // Compact Strip Days
      const stripContainer = document.getElementById('strip-days-container');
      stripContainer.innerHTML = '';
      const monday = getMondayOfWeek(selectedDate);

      for (let i = 0; i < 7; i++) {
        const d = new Date(monday);
        d.setDate(monday.getDate() + i);

        const pill = document.createElement('div');
        pill.className = 'day-pill';

        const isSel = isSameDay(d, selectedDate);
        const isTod = isSameDay(d, today);
        const key = formatDateKey(d);
        const hasMeal = markedDates.has(key);

        if (isSel) {
          pill.classList.add('selected');
        } else if (isTod) {
          pill.classList.add('today-unselected');
        }

        const weekdayName = t.weekdays[i];
        const dayNum = String(d.getDate()).padStart(2, '0');

        pill.innerHTML = \`
          <span class="weekday-text">\${weekdayName}</span>
          <span class="day-number-text">\${dayNum}</span>
          \${hasMeal ? '<span class="meal-dot"></span>' : ''}
        \`;

        pill.onclick = () => {
          selectDate(d);
        };

        stripContainer.appendChild(pill);
      }

      // Expanded Grid
      const expandedSec = document.getElementById('expanded-section');
      if (isExpanded) {
        expandedSec.classList.add('open');
        renderMonthGrid();
      } else {
        expandedSec.classList.remove('open');
      }

      // Day context banner & sample card
      const dateStr = formatFullDate(selectedDate, currentLocale);
      const capDateStr = dateStr.charAt(0).toUpperCase() + dateStr.slice(1);
      document.getElementById('journal-selected-date-text').textContent = capDateStr;

      const selKey = formatDateKey(selectedDate);
      const hasMeals = markedDates.has(selKey);
      document.getElementById('journal-meals-summary').textContent = hasMeals ? t.mealsLogged(3) : t.noMeals;
      document.getElementById('journal-meals-summary').style.color = hasMeals ? 'var(--accent)' : 'var(--text-secondary)';
    }

    function renderMonthGrid() {
      const t = i18n[currentLocale];
      // Headers
      const headerRow = document.getElementById('grid-header-row');
      headerRow.innerHTML = '';
      t.initials.forEach(init => {
        const el = document.createElement('div');
        el.className = 'grid-header-initial';
        el.textContent = init;
        headerRow.appendChild(el);
      });

      // Days Grid
      const grid = document.getElementById('month-grid');
      grid.innerHTML = '';

      const y = viewMonth.getFullYear();
      const m = viewMonth.getMonth();
      const firstDay = new Date(y, m, 1);
      const lastDay = new Date(y, m + 1, 0);

      const startMonday = getMondayOfWeek(firstDay);
      const cells = [];
      const curr = new Date(startMonday);

      while (curr <= lastDay || curr.getDay() !== 1) {
        cells.push(new Date(curr));
        curr.setDate(curr.getDate() + 1);
        if (cells.length >= 42) break;
      }

      cells.forEach(d => {
        const cell = document.createElement('div');
        cell.className = 'grid-cell';

        const isCurrentMonth = d.getMonth() === m;
        const isSel = isSameDay(d, selectedDate);
        const isTod = isSameDay(d, today);
        const hasMeal = markedDates.has(formatDateKey(d));

        if (!isCurrentMonth) cell.classList.add('other-month');
        if (isSel) cell.classList.add('selected');
        else if (isTod) cell.classList.add('today-unselected');

        cell.innerHTML = \`
          <span class="grid-day-number">\${d.getDate()}</span>
          \${hasMeal ? '<span class="meal-dot"></span>' : ''}
        \`;

        cell.onclick = () => {
          selectDate(d);
        };

        grid.appendChild(cell);
      });
    }

    function selectDate(d) {
      selectedDate = new Date(d);
      viewMonth = new Date(d.getFullYear(), d.getMonth(), 1);
      render();
    }

    function goToToday() {
      selectDate(today);
    }

    function toggleExpand() {
      isExpanded = !isExpanded;
      if (isExpanded) {
        viewMonth = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1);
      }
      render();
    }

    function navWeek(direction) {
      const next = new Date(selectedDate);
      next.setDate(selectedDate.getDate() + direction * 7);
      selectDate(next);
    }

    function navMonth(direction) {
      viewMonth = new Date(viewMonth.getFullYear(), viewMonth.getMonth() + direction, 1);
      render();
    }

    function setLocale(loc) {
      currentLocale = loc;
      document.querySelectorAll('.controls-bar .btn-pill').forEach(btn => {
        if (['RO', 'EN', 'FR', 'DE'].includes(btn.textContent)) {
          btn.classList.toggle('active', btn.textContent.toLowerCase() === loc);
        }
      });
      render();
    }

    function setViewport(w) {
      document.getElementById('device-wrapper').style.width = w + 'px';
      const labels = {
        320: 'Small Phone (320px)',
        375: 'Normal Phone (375px)',
        412: 'Large Phone (412px)'
      };
      document.getElementById('viewport-label').textContent = labels[w];
      document.querySelectorAll('.controls-bar .btn-pill').forEach(btn => {
        if (btn.textContent.includes('px')) {
          btn.classList.toggle('active', btn.textContent.includes(String(w)));
        }
      });
    }

    function applyState(stateNum) {
      document.querySelectorAll('.state-card').forEach((c, idx) => {
        c.classList.toggle('selected', idx + 1 === stateNum);
      });

      const indicator = document.getElementById('qa-proof-indicator');

      switch (stateNum) {
        case 1: // Compact Default
          indicator.textContent = 'QA STATE: 1. Compact Default (30 Septembrie 2026 Today)';
          isExpanded = false;
          selectedDate = new Date(2026, 8, 30);
          viewMonth = new Date(2026, 8, 1);
          break;
        case 2: // Selected Day
          indicator.textContent = 'QA STATE: 2. Selected Day (28 Septembrie 2026 Highlighted)';
          isExpanded = false;
          selectedDate = new Date(2026, 8, 28);
          viewMonth = new Date(2026, 8, 1);
          break;
        case 3: // Today Quick Jump
          indicator.textContent = 'QA STATE: 3. Today Quick Jump (Astăzi Returned)';
          isExpanded = false;
          selectedDate = new Date(2026, 8, 30);
          viewMonth = new Date(2026, 8, 1);
          break;
        case 4: // Expanded Month
          indicator.textContent = 'QA STATE: 4. Expanded Month (Septembrie 2026 Full Grid)';
          isExpanded = true;
          selectedDate = new Date(2026, 8, 30);
          viewMonth = new Date(2026, 8, 1);
          break;
        case 5: // Different Month
          indicator.textContent = 'QA STATE: 5. Different Month (Octombrie 2026 Navigated)';
          isExpanded = true;
          selectedDate = new Date(2026, 8, 30);
          viewMonth = new Date(2026, 9, 1);
          break;
        case 6: // Collapsed After Full-Calendar Selection
          indicator.textContent = 'QA STATE: 6. Collapsed After Selection (15 Octombrie 2026 Selected)';
          isExpanded = false;
          selectedDate = new Date(2026, 9, 15);
          viewMonth = new Date(2026, 9, 1);
          break;
      }

      render();
    }

    // Initial render and URL query param support
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('locale')) setLocale(urlParams.get('locale'));
    if (urlParams.get('viewport')) setViewport(parseInt(urlParams.get('viewport')));
    if (urlParams.get('state')) applyState(parseInt(urlParams.get('state')));
    else render();
  </script>
</body>
</html>
`;

writeFileSync(resolve(outDir, 'index.html'), html, 'utf8');
console.log('Preview built at:', resolve(outDir, 'index.html'));
