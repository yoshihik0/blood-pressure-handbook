// Application State
let state = {
  records: [],
  currentStage: 'SYSTOLIC', // 'SYSTOLIC' | 'DIASTOLIC' | 'PULSE'
  inputs: {
    SYSTOLIC: '',
    DIASTOLIC: '',
    PULSE: ''
  },
  activeTab: 'history', // 'history' | 'trends' | 'stats'
  showGuide: false
};

// Blood Pressure Classification based on JSH (Japanese Society of Hypertension) guidelines for home readings
const CLASSIFICATIONS = {
  OPTIMAL: { label: '最適血圧', class: 'bg-optimal', color: '#10b981', desc: '健康的な血圧レベルです。維持しましょう。' },
  NORMAL: { label: '正常血圧', class: 'bg-normal', color: '#84cc16', desc: '正常な血圧レベルです。' },
  HIGH_NORMAL: { label: '正常高値血圧', class: 'bg-high-normal', color: '#eab308', desc: '高血圧の一歩手前です。生活習慣を見直しましょう。' },
  STAGE1: { label: 'I度高血圧', class: 'bg-stage1', color: '#f97316', desc: '軽度の高血圧です。食生活や運動を見直しましょう。' },
  STAGE2: { label: 'II度高血圧', class: 'bg-stage2', color: '#ef4444', desc: '中等度の高血圧です。医師への相談をおすすめします。' },
  STAGE3: { label: 'III度高血圧', class: 'bg-stage3', color: '#b91c1c', desc: '重度の高血圧です。早急に医師の診察を受けてください。' },
  ISH: { label: '収縮期単独高血圧', class: 'bg-ish', color: '#a855f7', desc: '上の血圧だけが高い状態です。血管の硬化が疑われます。' }
};

function classifyBloodPressure(sys, dia) {
  if (!sys || !dia) return null;
  const s = parseInt(sys, 10);
  const d = parseInt(dia, 10);
  if (isNaN(s) || isNaN(d)) return null;

  // JSH Home BP guidelines:
  // Optimal: <115 and <75
  // Normal: <125 and <80 (and not optimal)
  // High normal: 125-134 or 80-84
  // Stage 1: 135-159 or 85-99
  // Stage 2: 160-179 or 100-109
  // Stage 3: >=180 or >=110
  // ISH: >=135 and <85

  if (s >= 180 || d >= 110) return CLASSIFICATIONS.STAGE3;
  if ((s >= 160 && s <= 179) || (d >= 100 && d <= 109)) return CLASSIFICATIONS.STAGE2;
  if ((s >= 135 && s <= 159) || (d >= 85 && d <= 99)) return CLASSIFICATIONS.STAGE1;
  if (s >= 135 && d < 85) return CLASSIFICATIONS.ISH;
  if ((s >= 125 && s <= 134) || (d >= 80 && d <= 84)) return CLASSIFICATIONS.HIGH_NORMAL;
  if (s < 115 && d < 75) return CLASSIFICATIONS.OPTIMAL;
  if (s < 125 && d < 80) return CLASSIFICATIONS.NORMAL;
  
  // Fallback to high normal
  return CLASSIFICATIONS.HIGH_NORMAL;
}

// Storage Helpers
function saveRecordsToStorage(newRecords) {
  state.records = newRecords;
  localStorage.setItem('bp_records', JSON.stringify(newRecords));
  renderAll();
}

function loadRecordsFromStorage() {
  const data = localStorage.getItem('bp_records');
  if (data) {
    try {
      state.records = JSON.parse(data);
      // Sort newer first
      state.records.sort((a, b) => b.timestamp - a.timestamp);
    } catch (e) {
      state.records = [];
    }
  } else {
    state.records = [];
  }
}

// Toast System
function showToast(message, type = 'success') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  
  let iconName = 'check-circle';
  if (type === 'error') iconName = 'alert-triangle';
  if (type === 'info') iconName = 'info';

  toast.innerHTML = `
    <i data-lucide="${iconName}"></i>
    <span>${message}</span>
  `;
  
  container.appendChild(toast);
  lucide.createIcons();

  // Remove toast after animation completes
  setTimeout(() => {
    toast.remove();
  }, 3000);
}

// Format date helper
function formatDate(timestamp) {
  const d = new Date(timestamp);
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const date = String(d.getDate()).padStart(2, '0');
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  return `${month}/${date} ${hours}:${minutes}`;
}

// Keypad Logics
function handleKeyInput(key) {
  const stage = state.currentStage;
  const currentVal = state.inputs[stage];

  if (key === 'C') {
    state.inputs[stage] = '';
    updateInputDisplay();
    return;
  }

  if (key === 'backspace') {
    state.inputs[stage] = currentVal.slice(0, -1);
    updateInputDisplay();
    return;
  }

  // Adding digits
  const digit = key;
  const newVal = currentVal + digit;

  if (stage === 'SYSTOLIC') {
    // Limit to 3 digits
    if (newVal.length <= 3) {
      state.inputs[stage] = newVal;
      // Auto advance to DIASTOLIC when 3 digits are entered (e.g., 120)
      if (newVal.length === 3) {
        state.currentStage = 'DIASTOLIC';
      }
    }
  } else if (stage === 'DIASTOLIC') {
    if (newVal.length <= 3) {
      state.inputs[stage] = newVal;
      // Auto advance to PULSE when 2 digits are entered (e.g., 80)
      if (newVal.length === 2) {
        state.currentStage = 'PULSE';
      }
    }
  } else if (stage === 'PULSE') {
    if (newVal.length <= 3) {
      state.inputs[stage] = newVal;
      // Auto-save when 2 digits reach (e.g., 72)
      if (newVal.length === 2) {
        updateInputDisplay();
        // Wait briefly for UI visual response, then save
        setTimeout(() => {
          triggerAutoSave();
        }, 405);
        return;
      }
    }
  }

  updateInputDisplay();
}

function triggerAutoSave() {
  const sys = state.inputs.SYSTOLIC;
  const dia = state.inputs.DIASTOLIC;
  const pulse = state.inputs.PULSE;
  
  if (sys && dia && pulse) {
    saveRecord(sys, dia, pulse);
  }
}

function saveRecord(sys, dia, pulse) {
  const noteInput = document.getElementById('custom-note');
  const note = noteInput ? noteInput.value.trim() : '';

  const newRecord = {
    id: `rec-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    systolic: parseInt(sys, 10),
    diastolic: parseInt(dia, 10),
    pulse: parseInt(pulse, 10),
    timestamp: Date.now(),
    note: note || undefined
  };

  const updatedRecords = [newRecord, ...state.records];
  saveRecordsToStorage(updatedRecords);

  // Clear inputs & Reset Stage
  state.inputs = { SYSTOLIC: '', DIASTOLIC: '', PULSE: '' };
  state.currentStage = 'SYSTOLIC';
  if (noteInput) noteInput.value = '';

  updateInputDisplay();
  showToast('測定データを保存しました！', 'success');
}

// UI Updating functions
function updateInputDisplay() {
  // Update Values
  const valSys = document.getElementById('val-sys');
  const valDia = document.getElementById('val-dia');
  const valPulse = document.getElementById('val-pulse');

  valSys.innerText = state.inputs.SYSTOLIC || '---';
  valDia.innerText = state.inputs.DIASTOLIC || '---';
  valPulse.innerText = state.inputs.PULSE || '---';

  // Toggle active class & has-val class
  const meterSys = document.getElementById('meter-sys');
  const meterDia = document.getElementById('meter-dia');
  const meterPulse = document.getElementById('meter-pulse');

  [meterSys, meterDia, meterPulse].forEach(box => {
    box.classList.remove('active');
    box.classList.remove('has-val');
  });

  if (state.currentStage === 'SYSTOLIC') meterSys.classList.add('active');
  if (state.currentStage === 'DIASTOLIC') meterDia.classList.add('active');
  if (state.currentStage === 'PULSE') meterPulse.classList.add('active');

  if (state.inputs.SYSTOLIC) meterSys.classList.add('has-val');
  if (state.inputs.DIASTOLIC) meterDia.classList.add('has-val');
  if (state.inputs.PULSE) meterPulse.classList.add('has-val');

  // Disable/Enable manual save button
  const saveBtn = document.getElementById('save-record-btn');
  const isComplete = state.inputs.SYSTOLIC && state.inputs.DIASTOLIC && state.inputs.PULSE;
  saveBtn.disabled = !isComplete;

  // Live BP category indicator
  const liveBadge = document.getElementById('live-badge');
  if (state.inputs.SYSTOLIC && state.inputs.DIASTOLIC) {
    const classification = classifyBloodPressure(state.inputs.SYSTOLIC, state.inputs.DIASTOLIC);
    if (classification) {
      liveBadge.className = `live-badge ${classification.class}`;
      liveBadge.innerHTML = `<span>判定: ${classification.label}</span>`;
      liveBadge.classList.remove('hidden');
    } else {
      liveBadge.classList.add('hidden');
    }
  } else {
    liveBadge.classList.add('hidden');
  }
}

// Render History
function renderHistory() {
  const list = document.getElementById('records-list');
  const emptyState = document.getElementById('records-empty');
  const listWrapper = document.getElementById('records-list-wrapper');

  if (state.records.length === 0) {
    emptyState.classList.remove('hidden');
    listWrapper.classList.add('hidden');
    return;
  }

  emptyState.classList.add('hidden');
  listWrapper.classList.remove('hidden');
  list.innerHTML = '';

  state.records.forEach(record => {
    const li = document.createElement('li');
    li.className = 'record-item';

    const classification = classifyBloodPressure(record.systolic, record.diastolic);
    const dotColor = classification ? classification.color : '#94a3b8';

    li.innerHTML = `
      <div class="record-left">
        <div class="record-time-badge">
          <span class="indicator-dot" style="background-color: ${dotColor}"></span>
          <span class="record-time">${formatDate(record.timestamp)}</span>
        </div>
        ${record.note ? `<span class="record-note">${escapeHtml(record.note)}</span>` : ''}
      </div>
      <div class="record-mid">
        <div class="val-item">
          <span class="val-item-label">最高</span>
          <span class="val-item-num color-sys font-mono">${record.systolic}</span>
        </div>
        <div class="val-item">
          <span class="val-item-label">最低</span>
          <span class="val-item-num color-dia font-mono">${record.diastolic}</span>
        </div>
        <div class="val-item">
          <span class="val-item-label">脈拍</span>
          <span class="val-item-num color-pulse font-mono">${record.pulse}</span>
        </div>
      </div>
      <div class="record-right">
        <button class="delete-record-btn" data-id="${record.id}" aria-label="削除">
          <i data-lucide="trash-2"></i>
        </button>
      </div>
    `;

    list.appendChild(li);
  });

  // Attach delete events
  document.querySelectorAll('.delete-record-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const id = btn.getAttribute('data-id');
      const filtered = state.records.filter(r => r.id !== id);
      saveRecordsToStorage(filtered);
      showToast('記録を削除しました', 'info');
    });
  });

  lucide.createIcons();
}

// Helper to escape HTML characters to prevent XSS
function escapeHtml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Render SVG Trend Chart
function renderTrendChart() {
  const container = document.getElementById('trend-chart-container');
  if (!container) return;

  if (state.records.length === 0) {
    container.innerHTML = `<p class="text-xs text-slate-400">データがありません</p>`;
    return;
  }

  // Take latest 10 records and reverse so chronological left-to-right
  const recentRecords = [...state.records].slice(0, 10).reverse();
  
  const width = 500;
  const height = 220;
  const paddingLeft = 35;
  const paddingRight = 20;
  const paddingTop = 25;
  const paddingBottom = 25;

  const chartW = width - paddingLeft - paddingRight;
  const chartH = height - paddingTop - paddingBottom;

  // Axis limits
  const minY = 40;
  const maxY = 200;

  const getYCoord = (val) => {
    const ratio = (val - minY) / (maxY - minY);
    return height - paddingBottom - (ratio * chartH);
  };

  const getXCoord = (index) => {
    if (recentRecords.length <= 1) return paddingLeft + chartW / 2;
    return paddingLeft + (index / (recentRecords.length - 1)) * chartW;
  };

  // Build Grid & Horizontal lines
  let gridLines = '';
  const intervals = [60, 90, 120, 135, 160, 180];
  intervals.forEach(val => {
    const y = getYCoord(val);
    let color = '#e2e8f0';
    let dash = '2 2';
    if (val === 135) { color = '#fecaca'; dash = '3 1'; } // JSH High threshold
    if (val === 85) { color = '#bae6fd'; dash = '3 1'; }
    
    gridLines += `
      <line x1="${paddingLeft}" y1="${y}" x2="${width - paddingRight}" y2="${y}" stroke="${color}" stroke-dasharray="${dash}" stroke-width="1" />
      <text x="${paddingLeft - 5}" y="${y + 3}" text-anchor="end" font-size="8" fill="#94a3b8" font-family="monospace">${val}</text>
    `;
  });

  // Plot Lines
  let sysPoints = [];
  let diaPoints = [];

  recentRecords.forEach((rec, idx) => {
    const x = getXCoord(idx);
    sysPoints.push({ x, y: getYCoord(rec.systolic), val: rec.systolic });
    diaPoints.push({ x, y: getYCoord(rec.diastolic), val: rec.diastolic });
  });

  const makePath = (points) => {
    if (points.length === 0) return '';
    if (points.length === 1) return '';
    return points.reduce((acc, p, idx) => {
      return acc + `${idx === 0 ? 'M' : 'L'} ${p.x} ${p.y} `;
    }, '');
  };

  const sysPath = makePath(sysPoints);
  const diaPath = makePath(diaPoints);

  let sysDotsSvg = '';
  let diaDotsSvg = '';

  sysPoints.forEach((p) => {
    sysDotsSvg += `
      <circle cx="${p.x}" cy="${p.y}" r="4" fill="#f43f5e" stroke="#ffffff" stroke-width="1.5" />
      <text x="${p.x}" y="${p.y - 7}" text-anchor="middle" font-size="8" font-weight="700" fill="#e11d48" font-family="monospace">${p.val}</text>
    `;
  });

  diaPoints.forEach((p) => {
    diaDotsSvg += `
      <circle cx="${p.x}" cy="${p.y}" r="4" fill="#0ea5e9" stroke="#ffffff" stroke-width="1.5" />
      <text x="${p.x}" y="${p.y + 11}" text-anchor="middle" font-size="8" font-weight="700" fill="#0369a1" font-family="monospace">${p.val}</text>
    `;
  });

  // Date Labels along X axis
  let xLabelsSvg = '';
  recentRecords.forEach((rec, idx) => {
    const x = getXCoord(idx);
    const date = new Date(rec.timestamp);
    const label = `${date.getMonth() + 1}/${date.getDate()}`;
    xLabelsSvg += `
      <text x="${x}" y="${height - 5}" text-anchor="middle" font-size="8" fill="#94a3b8">${label}</text>
    `;
  });

  const svgContent = `
    <svg viewBox="0 0 ${width} ${height}" class="w-full h-auto">
      <!-- Grid -->
      ${gridLines}
      
      <!-- Paths -->
      ${sysPath ? `<path d="${sysPath}" fill="none" stroke="#f43f5e" stroke-width="2" />` : ''}
      ${diaPath ? `<path d="${diaPath}" fill="none" stroke="#0ea5e9" stroke-width="2" />` : ''}
      
      <!-- Dots & Values -->
      ${sysDotsSvg}
      ${diaDotsSvg}
      
      <!-- Labels -->
      ${xLabelsSvg}
    </svg>
  `;

  container.innerHTML = svgContent;
}

// Render Distribution Stats (Tab 3)
function renderDistributionStats() {
  const legendContainer = document.getElementById('stats-legend');
  const chartContainer = document.getElementById('donut-chart');

  if (!legendContainer || !chartContainer) return;

  if (state.records.length === 0) {
    chartContainer.innerHTML = '';
    legendContainer.innerHTML = `<p class="text-xs text-slate-400 text-center">分析データがありません</p>`;
    return;
  }

  // Count classifications
  const counts = {
    OPTIMAL: 0,
    NORMAL: 0,
    HIGH_NORMAL: 0,
    STAGE1: 0,
    STAGE2: 0,
    STAGE3: 0,
    ISH: 0
  };

  state.records.forEach(rec => {
    const classification = classifyBloodPressure(rec.systolic, rec.diastolic);
    if (!classification) return;

    // Find key in CLASSIFICATIONS
    const key = Object.keys(CLASSIFICATIONS).find(k => CLASSIFICATIONS[k].label === classification.label);
    if (key) {
      counts[key]++;
    }
  });

  const total = state.records.length;

  // Build SVG Pie/Donut Chart
  let cumulativePercent = 0;
  const getCoordinatesForPercent = (percent) => {
    const x = Math.cos(2 * Math.PI * percent);
    const y = Math.sin(2 * Math.PI * percent);
    return [x, y];
  };

  let paths = [];
  
  Object.keys(CLASSIFICATIONS).forEach(key => {
    const count = counts[key];
    if (count === 0) return;

    const percent = count / total;
    const [startX, startY] = getCoordinatesForPercent(cumulativePercent);
    cumulativePercent += percent;
    const [endX, endY] = getCoordinatesForPercent(cumulativePercent);

    const largeArcFlag = percent > 0.5 ? 1 : 0;

    // Scale coordinates to chart size (radius 40, centered at 50,50)
    const r = 40;
    const cx = 50;
    const cy = 50;

    const x1 = cx + startX * r;
    const y1 = cy + startY * r;
    const x2 = cx + endX * r;
    const y2 = cy + endY * r;

    // SVG path for a slice
    const d = `
      M ${cx} ${cy}
      L ${x1} ${y1}
      A ${r} ${r} 0 ${largeArcFlag} 1 ${x2} ${y2}
      Z
    `;

    paths.push({
      d,
      color: CLASSIFICATIONS[key].color
    });
  });

  // Render SVG Donut
  let svgPathsContent = paths.map(p => `<path d="${p.d}" fill="${p.color}" />`).join('');
  
  // Cut a hole in the middle to make it a donut
  const donutHole = `<circle cx="50" cy="50" r="25" fill="#ffffff" />`;
  
  const totalText = `
    <text x="50" y="47" text-anchor="middle" font-size="8" font-weight="700" fill="#64748b">測定回数</text>
    <text x="50" y="59" text-anchor="middle" font-size="12" font-weight="800" fill="#0f172a">${total}回</text>
  `;

  chartContainer.innerHTML = `
    <svg viewBox="0 0 100 100" class="w-full h-full">
      <g transform="rotate(-90 50 50)">
        ${svgPathsContent}
      </g>
      ${donutHole}
      ${totalText}
    </svg>
  `;

  // Render Legends list
  legendContainer.innerHTML = '';
  Object.keys(CLASSIFICATIONS).forEach(key => {
    const count = counts[key];
    const item = CLASSIFICATIONS[key];
    const pct = total > 0 ? Math.round((count / total) * 100) : 0;

    if (count > 0) {
      const legendRow = document.createElement('div');
      legendRow.className = 'legend-item';
      legendRow.innerHTML = `
        <div class="legend-left">
          <span class="legend-color" style="background-color: ${item.color}"></span>
          <span class="legend-name">${item.label}</span>
        </div>
        <div class="legend-right">
          <span class="legend-count">${count}回</span>
          <span class="legend-percentage">${pct}%</span>
        </div>
      `;
      legendContainer.appendChild(legendRow);
    }
  });
}

function renderAll() {
  renderHistory();
  renderTrendChart();
  renderDistributionStats();
}

// Tab switcher
function switchTab(tabId) {
  state.activeTab = tabId;

  // Toggle buttons
  document.querySelectorAll('.tab-btn').forEach(btn => {
    if (btn.getAttribute('data-tab') === tabId) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });

  // Toggle content
  document.querySelectorAll('.tab-content').forEach(content => {
    if (content.id === `tab-content-${tabId}`) {
      content.classList.add('active');
    } else {
      content.classList.remove('active');
    }
  });

  // Render charts when switching tabs
  if (tabId === 'trends') renderTrendChart();
  if (tabId === 'stats') renderDistributionStats();
}

// CSV Export
function exportToCSV() {
  if (state.records.length === 0) {
    showToast('データがありません。', 'error');
    return;
  }

  // Header row
  let csvContent = 'ID,最高血圧,最低血圧,脈拍,測定日時,メモ\r\n';

  state.records.forEach(rec => {
    const dateStr = formatDate(rec.timestamp);
    const note = rec.note ? `"${rec.note.replace(/"/g, '""')}"` : '';
    csvContent += `${rec.id},${rec.systolic},${rec.diastolic},${rec.pulse},${dateStr},${note}\r\n`;
  });

  const blob = new Blob([new Uint8Array([0xEF, 0xBB, 0xBF]), csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `blood_pressure_records_${new Date().toISOString().slice(0,10)}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  showToast('CSVデータをダウンロードしました！', 'success');
}

// CSV Import
function importFromCSV(file) {
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      const content = e.target.result;
      const lines = content.split(/\r?\n/).map(line => line.trim()).filter(line => line.length > 0);
      if (lines.length <= 1) {
        showToast('有効なデータ行が見つかりませんでした。', 'error');
        return;
      }

      // Quick CSV Parser supporting double quotes
      const parseCSVLine = (text) => {
        const result = [];
        let current = '';
        let inQuotes = false;
        for (let i = 0; i < text.length; i++) {
          const char = text[i];
          if (char === '"') {
            inQuotes = !inQuotes;
          } else if (char === ',' && !inQuotes) {
            result.push(current.trim());
            current = '';
          } else {
            current += char;
          }
        }
        result.push(current.trim());
        return result;
      };

      const parsedRecords = [];
      for (let i = 1; i < lines.length; i++) {
        const cells = parseCSVLine(lines[i]);
        if (cells.length < 4) continue;

        const id = cells[0] || `imported-${Date.now()}-${i}`;
        const sys = parseInt(cells[1], 10);
        const dia = parseInt(cells[2], 10);
        const pulse = parseInt(cells[3], 10);

        if (isNaN(sys) || isNaN(dia) || isNaN(pulse)) {
          continue;
        }

        // Try to parse timestamp
        let timestamp = Date.now() - (i * 60000);
        if (cells[4]) {
          const cleanDateStr = cells[4].replace(/\//g, '-');
          const parsedTime = Date.parse(cleanDateStr);
          if (!isNaN(parsedTime)) {
            timestamp = parsedTime;
          }
        }

        const note = cells[5] || undefined;

        parsedRecords.push({
          id,
          systolic: sys,
          diastolic: dia,
          pulse: pulse,
          timestamp,
          note: note || undefined
        });
      }

      if (parsedRecords.length > 0) {
        const combined = [...parsedRecords, ...state.records];
        // Deduplicate by timestamp
        const unique = Array.from(new Map(combined.map(item => [item.timestamp, item])).values());
        unique.sort((a, b) => b.timestamp - a.timestamp);
        
        saveRecordsToStorage(unique);
        showToast(`${parsedRecords.length}件の記録を読み込みました！`, 'success');
      } else {
        showToast('読み込み可能な血圧レコードが見つかりません。', 'error');
      }

    } catch (err) {
      showToast('読み込み中にエラーが発生しました。', 'error');
    }
  };
  
  reader.readAsText(file);
}

// Reset All Records
function resetAllRecords() {
  saveRecordsToStorage([]);
  showToast('すべての履歴を初期化しました', 'success');
}

// Setup Event Listeners
document.addEventListener('DOMContentLoaded', () => {
  // Load initial data
  loadRecordsFromStorage();
  updateInputDisplay();
  renderAll();

  // Guide toggle
  const toggleGuideBtn = document.getElementById('toggle-guide-btn');
  const guideSection = document.getElementById('guide-section');
  toggleGuideBtn.addEventListener('click', () => {
    state.showGuide = !state.showGuide;
    if (state.showGuide) {
      guideSection.classList.remove('hidden');
      toggleGuideBtn.classList.add('active');
    } else {
      guideSection.classList.add('hidden');
      toggleGuideBtn.classList.remove('active');
    }
  });

  // Stage Switcher clicking boxes directly
  document.querySelectorAll('.meter-box').forEach(box => {
    box.addEventListener('click', () => {
      const stage = box.getAttribute('data-stage');
      state.currentStage = stage;
      updateInputDisplay();
    });
  });

  // Keypad keys click
  document.querySelectorAll('.key-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const key = btn.getAttribute('data-key');
      handleKeyInput(key);
    });
  });

  // Manual actions
  document.getElementById('clear-all-inputs').addEventListener('click', () => {
    state.inputs = { SYSTOLIC: '', DIASTOLIC: '', PULSE: '' };
    state.currentStage = 'SYSTOLIC';
    updateInputDisplay();
  });

  document.getElementById('save-record-btn').addEventListener('click', () => {
    const sys = state.inputs.SYSTOLIC;
    const dia = state.inputs.DIASTOLIC;
    const pulse = state.inputs.PULSE;
    if (sys && dia && pulse) {
      saveRecord(sys, dia, pulse);
    }
  });

  // Tabs switching
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const tabId = btn.getAttribute('data-tab');
      switchTab(tabId);
    });
  });

  // Data Actions (CSV / Reset)
  document.getElementById('export-csv-btn').addEventListener('click', exportToCSV);
  
  const fileInput = document.getElementById('import-csv-file');
  fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    importFromCSV(file);
    e.target.value = ''; // reset so same file can be selected again
  });

  document.getElementById('reset-all-btn').addEventListener('click', resetAllRecords);

  // Initialize Lucide icons
  lucide.createIcons();
});
