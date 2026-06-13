// APPS_SCRIPT_URL определён в config.js

let allMatchesData = [];
let participantsData = [];
let playedMatches = [];
let currentMatchIndex = -1;
let isAnimating = false;
let isAutoPlaying = false;
let autoPlayTimeout = null;
let stopRequested = false;
let isDataLoaded = false;
let tournamentParams = {};

// ========== ЗАГРУЗКА ПАРАМЕТРОВ ==========
async function loadTournamentParams() {
    try {
        const response = await fetch(`${APPS_SCRIPT_URL}?action=params`);
        if (!response.ok) throw new Error('Ошибка загрузки параметров');
        const params = await response.json();
        tournamentParams = params;
        console.log('🏆 Параметры турнира загружены:', tournamentParams);
        
	// Обновляем логотип
	const logoContainer = document.getElementById('logoContainer');
	if (logoContainer && tournamentParams.логотип_файл) {
	    logoContainer.innerHTML = `<img src="images/${tournamentParams.логотип_файл}" style="height: 2.4rem; width: auto; vertical-align: 	middle; margin-right: 1px;">`;
	}

        // Обновляем подзаголовок на странице
	const subElement = document.querySelector('.sub');
	if (subElement && tournamentParams.подзаголовок) {
             // Определяем, какая страница открыта
            let linkParam = null;
            const path = window.location.pathname;
             if (path.includes('fill.html')) {
                 linkParam = tournamentParams.ссылка_подзаголовка_fill;
              } else if (path.includes('battle.html')) {
                 linkParam = tournamentParams.ссылка_подзаголовка_battle;
              } else {
                linkParam = tournamentParams.ссылка_подзаголовка_index;
            }
    
          if (linkParam && linkParam !== '') {
              subElement.innerHTML = `<a href="${linkParam}" target="_blank" rel="noopener noreferrer" style="color: #2c5a2a; text-decoration: none;">${tournamentParams.подзаголовок}</a>`;
	    } else {
                subElement.innerHTML = tournamentParams.подзаголовок;
            }
        }
        
        if (tournamentParams.турнир_год) {
            document.title = `ЧМ-${tournamentParams.турнир_год} · Ход борьбы`;
        }
        
        return true;
    } catch (err) {
        console.error('Ошибка загрузки параметров:', err);
        return false;
    }
}

// ========== ГЕНЕРАЦИЯ СТАБИЛЬНЫХ ЦВЕТОВ ДЛЯ УЧАСТНИКОВ ==========
function hashCode(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = ((hash << 5) - hash) + str.charCodeAt(i);
        hash |= 0;
    }
    return Math.abs(hash);
}

function getColorForName(name) {
    const hash = hashCode(name);
    const hue = hash % 360;
    const saturation = 30 + (hash % 20);
    const lightness = 90 + (hash % 5);
    return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
}

function getDarkerColor(lightColor) {
    const match = lightColor.match(/hsl\((\d+),\s*(\d+)%,\s*(\d+)%\)/);
    if (match) {
        const hue = match[1];
        const saturation = match[2];
        let lightness = parseInt(match[3]);
        lightness = Math.max(20, lightness - 18);
        return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
    }
    return 'rgba(0,0,0,0.15)';
}

let participantColors = {};
let participantDarkerColors = {};

function getParticipantColor(name) {
    if (!participantColors[name]) {
        participantColors[name] = getColorForName(name);
    }
    return participantColors[name];
}

function getParticipantDarkerColor(name) {
    if (!participantDarkerColors[name]) {
        const lightColor = getParticipantColor(name);
        participantDarkerColors[name] = getDarkerColor(lightColor);
    }
    return participantDarkerColors[name];
}

// ========== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ==========
function normalizeScore(score) {
    if (!score || score === '—') return score;
    if (score.includes('-')) return score.replace(/-/g, ':');
    return score;
}

function parseScoreToArray(scoreStr) {
    if (!scoreStr || scoreStr === '—') return null;
    let cleaned = scoreStr.trim().replace(/[^0-9:]/g, '');
    let parts = cleaned.split(':');
    if (parts.length !== 2) return null;
    let g1 = parseInt(parts[0]);
    let g2 = parseInt(parts[1]);
    if (isNaN(g1) || isNaN(g2)) return null;
    return [g1, g2];
}

function getOutcome(scoreArray) {
    if (!scoreArray) return null;
    if (scoreArray[0] > scoreArray[1]) return 1;
    if (scoreArray[0] === scoreArray[1]) return 0;
    return -1;
}

function calculateError(actualScore, predictedScore) {
    const actual = parseScoreToArray(actualScore);
    const predicted = parseScoreToArray(predictedScore);
    if (!actual || !predicted) return null;
    return Math.abs(actual[0] - predicted[0]) + Math.abs(actual[1] - predicted[1]);
}

function calculateBonus(actualScore, predictedScore) {
    const actual = parseScoreToArray(actualScore);
    const predicted = parseScoreToArray(predictedScore);
    if (!actual || !predicted) return 0;
    let bonus = 0;
    if (getOutcome(actual) === getOutcome(predicted)) bonus += 1;
    if (actual[0] === predicted[0] && actual[1] === predicted[1]) bonus += 1;
    return bonus;
}

function calculateMatchResult(actualScore, predictedScore) {
    const error = calculateError(actualScore, predictedScore);
    const bonus = calculateBonus(actualScore, predictedScore);
    if (error === null) return null;
    return error - bonus;
}

function getPlayedMatches() {
    const played = [];
    played.push({
        index: -1,
        id: 0,
        match: { team1: "Старт", team2: "турнира", result: "—" },
        result: "—",
        isVirtual: true
    });
    
    for (let i = 0; i < allMatchesData.length; i++) {
        const match = allMatchesData[i];
        if (match.result && match.result !== '—') {
            played.push({
                index: i,
                id: match.id,
                match: match,
                result: match.result,
                isVirtual: false
            });
        }
    }
    return played;
}

function getStandingsAfterMatches(upToMatchIndex) {
    const participantStats = [];
    for (let p of participantsData) {
        let prediction = '—';
        let matchError = null;
        let totalSum = 0;
        
        if (upToMatchIndex >= 0) {
            for (let i = 0; i <= upToMatchIndex; i++) {
                const result = allMatchesData[i].result;
                const pred = p.predictions[i];
                if (result && result !== '—' && pred && pred !== '—') {
                    const matchRes = calculateMatchResult(result, pred);
                    if (matchRes !== null) {
                        totalSum += matchRes;
                    }
                }
            }
            
            const currentMatch = allMatchesData[upToMatchIndex];
            if (currentMatch && currentMatch.result && currentMatch.result !== '—') {
                const currentPred = p.predictions[upToMatchIndex];
                if (currentPred && currentPred !== '—') {
                    prediction = currentPred;
                    const matchRes = calculateMatchResult(currentMatch.result, currentPred);
                    if (matchRes !== null) {
                        matchError = matchRes;
                    }
                }
            }
        }
        
        participantStats.push({
            name: p.name,
            prediction: prediction,
            matchError: matchError,
            totalSum: totalSum
        });
    }
    
    const sorted = [...participantStats].sort((a, b) => a.totalSum - b.totalSum);
    const rankMap = new Map();
    let i = 0;
    while (i < sorted.length) {
        let j = i + 1;
        while (j < sorted.length && sorted[j].totalSum === sorted[i].totalSum) j++;
        const rankDisplay = i + 1 === j ? `${i+1}` : `${i+1}-${j}`;
        for (let k = i; k < j; k++) rankMap.set(sorted[k].name, { rank: rankDisplay, totalSum: sorted[k].totalSum });
        i = j;
    }
    
    return participantStats.map(s => ({
        name: s.name,
        prediction: s.prediction,
        matchError: s.matchError !== null ? s.matchError : '—',
        totalSum: s.totalSum,
        rank: rankMap.get(s.name).rank
    }));
}

function calculateProgressWidth(totalSum, allSums) {
    if (!allSums.length) return 0;
    
    // Находим минимальное и максимальное значение
    const maxSum = Math.max(...allSums);
    const minSum = Math.min(...allSums);
    
    // Если все суммы одинаковы (диапазон 0) — не показываем прогресс
    if (maxSum === minSum) return 0;
    
    // Смещаем шкалу так, чтобы минимальное значение было в 0%
    // А максимальное — в 100%
    let percent = ((totalSum - minSum) / (maxSum - minSum)) * 100;
    
    // Ограничиваем от 0 до 100%
    percent = Math.max(0, Math.min(100, percent));
    
    // Минимальная ширина 5%, максимальная 100%
    return Math.max(5, percent);
}

async function loadData() {
    try {
        const response = await fetch(`${APPS_SCRIPT_URL}?action=full`);
        if (!response.ok) throw new Error();
        const data = await response.json();
        const headers = data.headers;
        const rows = data.rows;
        const resultHeader = headers[6];
        
        allMatchesData = rows.map(row => ({
            id: parseInt(row.id),
            date: row.date || '—',
            time: row.time || '—',
            group: row.group || '?',
            team1: row.team1 || '—',
            team2: row.team2 || '—',
            result: normalizeScore(row[resultHeader] || '—')
        })).sort((a,b) => a.id - b.id);
        
        participantsData = [];
        for (let i = 7; i < headers.length; i++) {
            const key = headers[i];
            if (!key || key === '' || key.startsWith('Участник')) continue;
            let hasData = false;
            const predictions = [];
            for (const row of rows) {
                let pred = row[key] || '—';
                pred = normalizeScore(pred);
                predictions.push(pred);
                if (pred !== '—' && pred !== '') hasData = true;
            }
            if (hasData) participantsData.push({ name: key, predictions: predictions });
        }
        
        playedMatches = getPlayedMatches();
        currentMatchIndex = 0;
        return true;
    } catch (err) {
        console.error('Ошибка загрузки:', err);
        return false;
    }
}

function updateProgressBar() {
    const total = playedMatches.length - 1;
    const current = currentMatchIndex;
    
    const progressFill = document.getElementById('progressBarFill');
    const progressContainer = document.getElementById('progressContainer');
    
    if (!progressFill) return;
    
    if (total > 0) {
        const percent = (current / total) * 100;
        progressFill.style.width = `${percent}%`;
        if (progressContainer) progressContainer.style.display = 'block';
    } else {
        if (progressContainer) progressContainer.style.display = 'none';
    }
}

function updateAnimateAllButton() {
    const animateAllBtn = document.getElementById('animateAllBtn');
    if (!animateAllBtn) return;
    if (isAutoPlaying) {
        animateAllBtn.innerHTML = 'Стоп';
    } else {
        animateAllBtn.innerHTML = 'Авто ▶▶';
    }
}

function renderMatchSelector() {
    const select = document.getElementById('matchSelect');
    const matchInfo = document.getElementById('matchInfo');
    if (!select) return;
    select.innerHTML = '';
    if (playedMatches.length === 0) {
        select.innerHTML = '<option>Нет данных</option>';
        matchInfo.innerHTML = '';
        return;
    }
    for (let i = 0; i < playedMatches.length; i++) {
        const m = playedMatches[i];
        const option = document.createElement('option');
        option.value = i;
        if (m.isVirtual) {
            option.textContent = `🏁 Старт турнира`;
        } else {
            option.textContent = `${m.id}: ${m.match.team1} - ${m.match.team2}`;
        }
        select.appendChild(option);
    }
    select.value = currentMatchIndex;
    const current = playedMatches[currentMatchIndex];
    if (current) {
        if (current.isVirtual) {
            matchInfo.innerHTML = '';
        } else {
            matchInfo.innerHTML = `${current.result}`;
        }
    }
    
    select.addEventListener('change', (e) => {
        if (isAnimating || isAutoPlaying) return;
        currentMatchIndex = parseInt(e.target.value);
        updateProgressBar();
        animateFlip();
        const selected = playedMatches[currentMatchIndex];
        if (selected) {
            if (selected.isVirtual) {
                matchInfo.innerHTML = '';
            } else {
                matchInfo.innerHTML = `${selected.result}`;
            }
        }
        updateNavButtons();
    });
}

function updateNavButtons() {
    const prevBtn = document.getElementById('prevMatchBtn');
    const nextBtn = document.getElementById('nextMatchBtn');
    const animateAllBtn = document.getElementById('animateAllBtn');
    
    const hasRealMatches = playedMatches.some(m => !m.isVirtual);
    
    if (prevBtn) prevBtn.disabled = (currentMatchIndex <= 0 || isAnimating || isAutoPlaying || !isDataLoaded || !hasRealMatches);
    if (nextBtn) nextBtn.disabled = (currentMatchIndex >= playedMatches.length - 1 || isAnimating || isAutoPlaying || !isDataLoaded || !hasRealMatches);
    if (animateAllBtn) animateAllBtn.disabled = (!hasRealMatches || !isDataLoaded);
    
    updateAnimateAllButton();
}

function stopAutoPlay() {
    if (autoPlayTimeout) {
        clearTimeout(autoPlayTimeout);
        autoPlayTimeout = null;
    }
    isAutoPlaying = false;
    stopRequested = false;
    updateNavButtons();
}

function startAutoPlay() {
    if (isAnimating || isAutoPlaying || !isDataLoaded) return;
    if (playedMatches.length <= 1) return;
    
    stopRequested = false;
    isAutoPlaying = true;
    updateNavButtons();
    
    let current = currentMatchIndex + 1;
    if (current >= playedMatches.length) {
        current = 1;
        currentMatchIndex = 0;
        const select = document.getElementById('matchSelect');
        if (select) select.value = currentMatchIndex;
        const matchInfo = document.getElementById('matchInfo');
        if (matchInfo) matchInfo.innerHTML = '';
        updateProgressBar();
        renderStandingsStatic();
        setTimeout(() => {
            if (isAutoPlaying && !stopRequested) {
                startAutoPlayStep(current);
            }
        }, 500);
    } else {
        startAutoPlayStep(current);
    }
}

function startAutoPlayStep(current) {
    if (!isAutoPlaying || stopRequested || !isDataLoaded) {
        if (stopRequested) stopAutoPlay();
        return;
    }
    if (current >= playedMatches.length) {
        stopAutoPlay();
        return;
    }
    
    currentMatchIndex = current;
    const select = document.getElementById('matchSelect');
    if (select) select.value = currentMatchIndex;
    const selected = playedMatches[currentMatchIndex];
    const matchInfo = document.getElementById('matchInfo');
    if (matchInfo && selected) {
        if (selected.isVirtual) {
            matchInfo.innerHTML = '';
        } else {
            matchInfo.innerHTML = `${selected.result}`;
        }
    }
    
    updateProgressBar();
    
    animateFlipWithCallback(() => {
        if (isAutoPlaying && !stopRequested) {
            autoPlayTimeout = setTimeout(() => {
                startAutoPlayStep(current + 1);
            }, 1500);
        } else if (stopRequested) {
            stopAutoPlay();
        }
    });
}

function animateFlipWithCallback(callback) {
    if (isAnimating) {
        if (callback) setTimeout(() => animateFlipWithCallback(callback), 100);
        return;
    }
    isAnimating = true;
    updateNavButtons();
    
    const container = document.getElementById('standingsTable');
    if (!container) { isAnimating = false; updateNavButtons(); if (callback) callback(); return; }
    
    const selectedMatch = playedMatches[currentMatchIndex];
    if (!selectedMatch) { isAnimating = false; updateNavButtons(); if (callback) callback(); return; }
    
    const items = Array.from(container.querySelectorAll('.standings-row'));
    
    let firstPositions = {};
    if (items.length > 0) {
        items.forEach(item => {
            const rect = item.getBoundingClientRect();
            firstPositions[item.getAttribute('data-name')] = rect.top;
        });
    }
    
    const matchIndexForScore = selectedMatch.isVirtual ? -1 : selectedMatch.index;
    let standings = getStandingsAfterMatches(matchIndexForScore);
    const sorted = [...standings].sort((a, b) => a.totalSum - b.totalSum);
    const allSums = sorted.map(s => s.totalSum);
    
    let html = `
        <table class="standings-table">
            <thead>
                <tr>
                    <th style="color: #b8860b; font-weight: bold;">Место</th>
                    <th>Участник</th>
                    <th>Прогноз</th>
                    <th>Ошибка</th>
                    <th>Сумма ошибок</th>
                </tr>
            </thead>
            <tbody>
    `;
    
    for (let i = 0; i < sorted.length; i++) {
        const item = sorted[i];
        const bgColor = getParticipantColor(item.name);
        const darkerColor = getParticipantDarkerColor(item.name);
        const progressPercent = calculateProgressWidth(item.totalSum, allSums);
        
        html += `
            <tr class="standings-row" data-name="${item.name}" style="background-color: ${bgColor};">
                <td style="color: #b8860b; font-weight: bold; text-align: center;">${item.rank}</td>
                
		<td style="text-align: left; font-weight: 500; padding: 2px;">
		    <div class="standings-cell-3d" style="position: relative; border-radius: 12px; overflow: hidden;">
		        <div style="position: relative; display: flex; align-items: center; min-height: 28px;">
		            <div style="position: absolute; left: 0; top: 0; height: 100%; width: ${progressPercent}%; background-color: ${darkerColor}; opacity: 0.6; border-radius: 0;"></div>
		            <span style="position: relative; z-index: 1; padding: 8px 8px 8px 12px;">${item.name}</span>
		        </div>
		    </div>
		</td>

                <td style="text-align: center; font-family: monospace;">${item.prediction}</td>
                <td style="text-align: center; font-weight: bold;">${item.matchError}</td>
                <td style="text-align: center; font-weight: bold;">${item.totalSum}</td>
            </tr>
        `;
    }
    html += `</tbody> </table>`;
    
    container.innerHTML = html;
    
    const newItems = Array.from(container.querySelectorAll('.standings-row'));
    
    if (Object.keys(firstPositions).length > 0) {
        newItems.forEach(item => {
            const name = item.getAttribute('data-name');
            const firstTop = firstPositions[name];
            if (firstTop !== undefined) {
                const rect = item.getBoundingClientRect();
                const deltaY = firstTop - rect.top;
                if (Math.abs(deltaY) > 2) {
                    item.style.transform = `translateY(${deltaY}px)`;
                    item.style.transition = 'none';
                }
            }
        });
        
        setTimeout(() => {
            newItems.forEach(item => {
                item.style.transition = 'transform 1s cubic-bezier(0.2, 0.9, 0.4, 1.1)';
                item.style.transform = 'translateY(0)';
            });
        }, 20);
        
        setTimeout(() => {
            newItems.forEach(item => {
                item.style.transition = '';
                item.style.transform = '';
            });
            isAnimating = false;
            updateNavButtons();
            if (callback) callback();
        }, 1100);
    } else {
        isAnimating = false;
        updateNavButtons();
        if (callback) callback();
    }
}

function animateFlip() {
    animateFlipWithCallback(null);
}

function renderStandingsStatic() {
    const container = document.getElementById('standingsTable');
    if (!container) return;
    const selectedMatch = playedMatches[currentMatchIndex];
    if (!selectedMatch) return;
    
    const matchIndexForScore = selectedMatch.isVirtual ? -1 : selectedMatch.index;
    let standings = getStandingsAfterMatches(matchIndexForScore);
    const sorted = [...standings].sort((a, b) => a.totalSum - b.totalSum);
    const allSums = sorted.map(s => s.totalSum);
    
    let html = `
        <table class="standings-table">
            <thead>
                <tr>
                    <th style="color: #b8860b; font-weight: bold;">Место</th>
                    <th>Участник</th>
                    <th>Прогноз</th>
                    <th>Ошибка</th>
                    <th>Сумма ошибок</th>
                </tr>
            </thead>
            <tbody>
    `;
    
    for (let i = 0; i < sorted.length; i++) {
        const bgColor = getParticipantColor(sorted[i].name);
        const darkerColor = getParticipantDarkerColor(sorted[i].name);
        const progressPercent = calculateProgressWidth(sorted[i].totalSum, allSums);
        
	html += `
	    <tr class="standings-row" data-name="${sorted[i].name}" style="background-color: ${bgColor};">
	        <td style="color: #b8860b; font-weight: bold; text-align: center;">${sorted[i].rank}</td>

	        <td style="text-align: left; font-weight: 500; padding: 2px;">
	            <div class="standings-cell-3d" style="position: relative; border-radius: 12px; overflow: hidden;">
	                <div style="position: relative; display: flex; align-items: center; min-height: 28px;">
	                    <div style="position: absolute; left: 0; top: 0; height: 100%; width: ${progressPercent}%; background-color: ${darkerColor}; opacity: 0.6; border-radius: 0;"></div>
	                    <span style="position: relative; z-index: 1; padding: 8px 8px 8px 12px;">${sorted[i].name}</span>
        	        </div>
	            </div>
	        </td>

	        <td style="text-align: center; font-family: monospace;">${sorted[i].prediction}</td>
	        <td style="text-align: center; font-weight: bold;">${sorted[i].matchError}</td>
	        <td style="text-align: center; font-weight: bold;">${sorted[i].totalSum}</td>
	    </tr>
	`;
    }
    html += `</tbody> <table>`;
    container.innerHTML = html;
    updateProgressBar();
}

function setupNavigation() {
    const prevBtn = document.getElementById('prevMatchBtn');
    const nextBtn = document.getElementById('nextMatchBtn');
    const animateAllBtn = document.getElementById('animateAllBtn');
    
    if (prevBtn) {
        prevBtn.addEventListener('click', () => {
            if (currentMatchIndex > 0 && !isAnimating && !isAutoPlaying && isDataLoaded) {
                currentMatchIndex--;
                const select = document.getElementById('matchSelect');
                if (select) select.value = currentMatchIndex;
                updateProgressBar();
                animateFlip();
                const selected = playedMatches[currentMatchIndex];
                const matchInfo = document.getElementById('matchInfo');
                if (matchInfo && selected) {
                    if (selected.isVirtual) {
                        matchInfo.innerHTML = '';
                    } else {
                        matchInfo.innerHTML = `${selected.result}`;
                    }
                }
                updateNavButtons();
            }
        });
    }
    
    if (nextBtn) {
        nextBtn.addEventListener('click', () => {
            if (currentMatchIndex < playedMatches.length - 1 && !isAnimating && !isAutoPlaying && isDataLoaded) {
                currentMatchIndex++;
                const select = document.getElementById('matchSelect');
                if (select) select.value = currentMatchIndex;
                updateProgressBar();
                animateFlip();
                const selected = playedMatches[currentMatchIndex];
                const matchInfo = document.getElementById('matchInfo');
                if (matchInfo && selected) {
                    if (selected.isVirtual) {
                        matchInfo.innerHTML = '';
                    } else {
                        matchInfo.innerHTML = `${selected.result}`;
                    }
                }
                updateNavButtons();
            }
        });
    }
    
    if (animateAllBtn) {
        animateAllBtn.addEventListener('click', () => {
            if (!isDataLoaded) return;
            if (isAutoPlaying) {
                stopRequested = true;
            } else {
                if (!isAnimating && playedMatches.length > 1) {
                    startAutoPlay();
                }
            }
        });
    }
}

async function init() {
    isDataLoaded = false;
    updateNavButtons();
    
    await loadTournamentParams();
    
    const success = await loadData();
    if (success) {
        isDataLoaded = true;
        renderMatchSelector();
        renderStandingsStatic();
        setupNavigation();
        updateNavButtons();
        updateProgressBar();
    } else {
        document.getElementById('standingsTable').innerHTML = '<div class="loading-overlay" style="color:red;">❌ Не удалось загрузить данные</div>';
        isDataLoaded = true;
        updateNavButtons();
    }
}

init();