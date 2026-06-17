// APPS_SCRIPT_URL определён в config.js

let matchesData = [];
let participantsData = [];
let firstMatchDeadline = null;
let REVEAL_DATE = null;
let teamsData = {};
let tournamentParams = {};
let selectedUserName = localStorage.getItem('selectedUserName') || null;
let selectedMatchId = localStorage.getItem('selectedMatchId') ? parseInt(localStorage.getItem('selectedMatchId')) : null;

// ========== ЗАГРУЗКА ПАРАМЕТРОВ ТУРНИРА ==========
async function loadTournamentParams() {
    try {
        const response = await fetch(`${APPS_SCRIPT_URL}?action=params`);
        if (!response.ok) throw new Error('Ошибка загрузки параметров');
        const params = await response.json();
        tournamentParams = params;
        console.log('🏆 Параметры турнира загружены:', tournamentParams);

        const logoContainer = document.getElementById('logoContainer');
        if (logoContainer && tournamentParams.логотип_файл) {
            logoContainer.innerHTML = `<img src="images/${tournamentParams.логотип_файл}" style="height: 2.4rem; width: auto; vertical-align: middle; margin-right: 1px;">`;
        }
        
        const subElement = document.querySelector('.sub');
        if (subElement && tournamentParams.подзаголовок) {
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
            document.title = `ЧМ-${tournamentParams.турнир_год} · Таблица прогнозов`;
        }
        
        return true;
    } catch (err) {
        console.error('Ошибка загрузки параметров:', err);
        return false;
    }
}

// ========== ЗАГРУЗКА ДАННЫХ О СБОРНЫХ ==========
async function loadTeamsData() {
    try {
        const response = await fetch(`${APPS_SCRIPT_URL}?action=teams`);
        if (!response.ok) throw new Error('Ошибка загрузки данных о сборных');
        teamsData = await response.json();
        console.log('🏆 Данные о сборных загружены:', Object.keys(teamsData).length, 'стран');
        return true;
    } catch (err) {
        console.error('Ошибка загрузки сборных:', err);
        return false;
    }
}

// ========== ОПРЕДЕЛЕНИЕ ДАТЫ ПЕРВОГО МАТЧА ИЗ ПАРАМЕТРОВ ==========
function getFirstMatchDeadlineFromParams() {
    if (!tournamentParams.первый_матч_дата || !tournamentParams.первый_матч_время) return null;
    
    let year, month, day, hour, minute;
    
    if (typeof tournamentParams.первый_матч_дата === 'string') {
        const dateParts = tournamentParams.первый_матч_дата.split('.');
        if (dateParts.length === 3) {
            day = parseInt(dateParts[0]);
            month = parseInt(dateParts[1]) - 1;
            year = parseInt(dateParts[2]);
        } else {
            const d = new Date(tournamentParams.первый_матч_дата);
            if (!isNaN(d.getTime())) {
                year = d.getFullYear();
                month = d.getMonth();
                day = d.getDate();
            }
        }
    } else if (tournamentParams.первый_матч_дата instanceof Date || tournamentParams.первый_матч_дата?.getTime) {
        const d = new Date(tournamentParams.первый_матч_дата);
        year = d.getFullYear();
        month = d.getMonth();
        day = d.getDate();
    } else if (typeof tournamentParams.первый_матч_дата === 'number') {
        const d = new Date(tournamentParams.первый_матч_дата);
        year = d.getFullYear();
        month = d.getMonth();
        day = d.getDate();
    }
    
    if (typeof tournamentParams.первый_матч_время === 'string') {
        const timeParts = tournamentParams.первый_матч_время.split(':');
        if (timeParts.length === 2) {
            hour = parseInt(timeParts[0]);
            minute = parseInt(timeParts[1]);
        } else {
            const d = new Date(tournamentParams.первый_матч_время);
            if (!isNaN(d.getTime())) {
                hour = d.getHours();
                minute = d.getMinutes();
            }
        }
    } else if (tournamentParams.первый_матч_время instanceof Date || tournamentParams.первый_матч_время?.getTime) {
        const d = new Date(tournamentParams.первый_матч_время);
        hour = d.getHours();
        minute = d.getMinutes();
    }
    
    if (year === undefined || month === undefined || day === undefined || hour === undefined || minute === undefined) {
        console.warn('Не удалось распарсить дату/время:', tournamentParams.первый_матч_дата, tournamentParams.первый_матч_время);
        return null;
    }
    
    return new Date(year, month, day, hour, minute);
}

// ========== ФОРМАТИРОВАНИЕ ДАТЫ ==========
function formatDateTime(date) {
    if (!date) return '';
    const day = date.getDate().toString().padStart(2, '0');
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const year = date.getFullYear();
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    return `${day}.${month}.${year}, ${hours}:${minutes}`;
}

// ========== ФУНКЦИИ ДЛЯ ФЛАГОВ И РЕЙТИНГА ==========
function getFlagUrl(teamName) {
    const team = teamsData[teamName];
    if (team && team.flagCode) {
        return `images/flags/${team.flagCode}.png`;
    }
    return '';
}

function getTeamRank(teamName) {
    const team = teamsData[teamName];
    return team && team.rank ? team.rank : null;
}

function formatTeamWithFlag(teamName, position = 'home') {
    const flagUrl = getFlagUrl(teamName);
    const rank = getTeamRank(teamName);
    const rankText = rank ? `<span style="color:#888;">(${rank})</span> ` : '';
    const rankTextAfter = rank ? ` <span style="color:#888;">(${rank})</span>` : '';
    
    if (!flagUrl) {
        if (position === 'home') return rankText + teamName;
        return teamName + rankTextAfter;
    }
    
    const flagImg = `<img src="${flagUrl}" style="width:20px;height:15px;vertical-align:middle;" alt="${teamName}">`;
    if (position === 'home') {
        return `${rankText}${teamName} ${flagImg}`;
    } else {
        return `${flagImg} ${teamName}${rankTextAfter}`;
    }
}

// ========== ЦВЕТА ДЛЯ УЧАСТНИКОВ ==========
let participantColors = {};

function hashCode(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = ((hash << 5) - hash) + str.charCodeAt(i);
        hash |= 0;
    }
    return Math.abs(hash);
}

function getParticipantColor(name) {
    if (!participantColors[name]) {
        const hash = hashCode(name);
        const hue = hash % 360;
        const saturation = 30 + (hash % 20);
        const lightness = 90 + (hash % 5);
        participantColors[name] = `hsl(${hue}, ${saturation}%, ${lightness}%)`;
    }
    return participantColors[name];
}

// ========== АКТИВАЦИЯ КНОПОК ==========
function activateButtons() {
    const fillBtn = document.getElementById('fillBtn');
    const battleBtn = document.getElementById('battleBtn');
    const statusDiv = document.getElementById('statusMsg');
    
    if (!fillBtn || !battleBtn || !firstMatchDeadline) return;
    
    fillBtn.classList.remove('disabled');
    
    const now = new Date();
    const isExpired = now >= firstMatchDeadline;
    
    if (isExpired) {
        fillBtn.style.pointerEvents = 'none';
        fillBtn.style.opacity = '0.5';
        fillBtn.title = '❌ Приём прогнозов завершён';
        fillBtn.onclick = (e) => {
            e.preventDefault();
            alert('❌ Приём прогнозов завершён. Первый матч уже начался.');
            return false;
        };
        if (statusDiv) {
            const participantsCount = participantsData.length;
            let playedMatches = 0;
            for (const match of matchesData) {
                if (match.result && match.result !== '—') playedMatches++;
            }
            const totalMatches = matchesData.length;
            const percent = totalMatches > 0 ? Math.round((playedMatches / totalMatches) * 100) : 0;
            statusDiv.innerHTML = `✅ Участников: ${participantsCount}. Матчей сыграно: ${playedMatches} из ${totalMatches} (${percent}%)`;
            statusDiv.className = 'status-msg';
        }
    } else {
        fillBtn.style.pointerEvents = 'auto';
        fillBtn.style.opacity = '1';
        fillBtn.title = '✏️ Сделать прогноз';
        fillBtn.onclick = null;
        if (statusDiv) {
            const participantsCount = participantsData.length;
            const matchesCount = matchesData.length;
            statusDiv.innerHTML = `📅 Участников: ${participantsCount}, матчей: ${matchesCount}. Приём прогнозов до ${formatDateTime(firstMatchDeadline)} (мск)`;
            statusDiv.className = 'status-msg deadline';
        }
    }
    
    const table = document.querySelector('#table-wrapper table');
    if (table) {
        let hasFinished = false;
        const rows = table.querySelectorAll('tbody tr');
        for (const row of rows) {
            const cells = row.querySelectorAll('td');
            if (cells.length >= 8) {
                const result = cells[7]?.innerText?.trim();
                if (result && result !== '—' && /\d/.test(result)) {
                    hasFinished = true;
                    break;
                }
            }
        }
        
        battleBtn.classList.remove('disabled');
        if (hasFinished) {
            battleBtn.classList.add('active');
            battleBtn.style.pointerEvents = 'auto';
            battleBtn.style.background = '#2ecc71';
            battleBtn.title = '⚔️ Перейти к ходу борьбы';
            battleBtn.onclick = null;
        } else {
            battleBtn.classList.remove('active');
            battleBtn.style.pointerEvents = 'none';
            battleBtn.style.opacity = '0.5';
            battleBtn.style.background = '#7f8c8d';
            battleBtn.title = '🔒 Доступно после первого завершённого матча';
            battleBtn.onclick = (e) => {
                e.preventDefault();
                alert('🔒 Ход борьбы откроется после появления первого завершённого матча.');
                return false;
            };
        }
    }
}

// ========== ОСТАЛЬНЫЕ ФУНКЦИИ ==========
function isRevealed() {
    if (!REVEAL_DATE) return false;
    return new Date() >= REVEAL_DATE;
}

function normalizeScore(score) {
    if (!score || score === '—') return score;
    return score.includes('-') ? score.replace(/-/g, ':') : score;
}

function parseScoreToArray(scoreStr) {
    if (!scoreStr || scoreStr === '—') return null;
    let cleaned = scoreStr.trim().replace(/[^0-9:]/g, '');
    let parts = cleaned.split(':');
    if (parts.length !== 2) return null;
    let g1 = parseInt(parts[0]), g2 = parseInt(parts[1]);
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

function calculateTotalScore(actualScore, predictedScore) {
    const error = calculateError(actualScore, predictedScore);
    const bonus = calculateBonus(actualScore, predictedScore);
    if (error === null) return null;
    return error - bonus;
}

function blurPrediction(prediction) {
    if (!prediction || prediction === '—') return '—';
    const normalized = normalizeScore(prediction);
    if (isRevealed()) return normalized;
    if (/^\d+\:\d+$/.test(normalized)) {
        return normalized.replace(/[0-9]/g, 'X');
    }
    return normalized;
}

function calculateTotalParticipantScore(predictions, results) {
    let total = 0;
    for (let i = 0; i < predictions.length; i++) {
        const result = results[i];
        const pred = predictions[i];
        if (result && result !== '—' && pred && pred !== '—') {
            const score = calculateTotalScore(result, pred);
            if (score !== null) total += score;
        }
    }
    return total;
}

function calculateRanks(participants, results) {
    const withScores = participants.map((p, idx) => ({
        name: p.name,
        totalScore: calculateTotalParticipantScore(p.predictions, results),
        originalIndex: idx
    }));
    withScores.sort((a, b) => a.totalScore - b.totalScore);
    const ranks = new Array(participants.length);
    let i = 0;
    while (i < withScores.length) {
        let j = i + 1;
        while (j < withScores.length && withScores[j].totalScore === withScores[i].totalScore) j++;
        const rankDisplay = (i + 1 === j) ? `${i+1}` : `${i+1}-${j}`;
        for (let k = i; k < j; k++) ranks[withScores[k].originalIndex] = rankDisplay;
        i = j;
    }
    return { ranks, totalScores: withScores };
}

function createCell(content, isHtml = false, className = '') {
    const cell = document.createElement('td');
    if (className) cell.className = className;
    if (isHtml) cell.innerHTML = content;
    else cell.textContent = content;
    return cell;
}

async function loadAllData() {
    try {
        const response = await fetch(`${APPS_SCRIPT_URL}?action=full`);
        if (!response.ok) throw new Error();
        const data = await response.json();
        if (!data || !data.headers || !data.rows) throw new Error();
        
        const headers = data.headers;
        const rows = data.rows;
        const resultHeader = headers[6];
        
        matchesData = rows.map(row => ({
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
        
        return true;
    } catch (err) {
        console.error(err);
        return false;
    }
}

// ========== КОНТЕКСТНОЕ МЕНЮ ==========
let contextMenuVisible = false;
let contextMenuTarget = null;

function showContextMenu(event, participantName, targetElement) {
    event.preventDefault();
    event.stopPropagation();
    
    // Если уже открыто меню для этого участника — закрываем и снимаем выделение
    if (contextMenuVisible && contextMenuTarget === participantName) {
        closeContextMenu();
        // Снимаем выделение
        if (selectedUserName === participantName) {
            selectedUserName = null;
            localStorage.removeItem('selectedUserName');
            document.querySelectorAll(`th[data-participant="${participantName}"], td[data-participant="${participantName}"]`).forEach(el => {
                el.classList.remove('selected-col');
            });
        }
        return;
    }
    
    // Если открыто меню для другого участника — закрываем его
    if (contextMenuVisible) {
        closeContextMenu();
    }
    
    // Находим участника
    const participant = participantsData.find(p => p.name === participantName);
    if (!participant) return;
    
    // Собираем статистику прогнозов
    const results = matchesData.map(m => m.result);
    const stats = {};
    let totalMatches = 0;
    let sumResults = 0;
    
    for (let i = 0; i < results.length; i++) {
        const result = results[i];
        const pred = participant.predictions[i];
        if (result && result !== '—' && pred && pred !== '—') {
            const score = calculateTotalScore(result, pred);
            if (score !== null) {
                stats[score] = (stats[score] || 0) + 1;
                sumResults += score;
                totalMatches++;
            }
        }
    }
    
    const average = totalMatches > 0 ? (sumResults / totalMatches) : 0;
    const averageFormatted = average.toFixed(2);
    
    // Создаём меню
    const menu = document.createElement('div');
    menu.id = 'participantContextMenu';
    menu.style.cssText = `
        position: fixed;
        background: #fef9e8;
        border: 1px solid #9aaa80;
        border-radius: 12px;
        box-shadow: 0 4px 16px rgba(0,0,0,0.2);
        padding: 10px 14px;
        z-index: 9999;
        min-width: 200px;
        max-width: 240px;
        font-size: 0.7rem;
        color: #1e4620;
    `;
    
    // Заголовок
    const header = document.createElement('div');
    header.style.cssText = `
        font-weight: bold;
        font-size: 0.8rem;
        color: #1e4620;
        border-bottom: 1px solid #dde8c0;
        padding-bottom: 6px;
        margin-bottom: 6px;
        text-align: center;
    `;
    header.textContent = 'Статистика участника';
    menu.appendChild(header);
    
    // Подзаголовки
    const subHeader = document.createElement('div');
    subHeader.style.cssText = `
        display: flex;
        justify-content: space-between;
        font-size: 0.7rem;
        color: #555;
        margin-bottom: 8px;
        padding: 0 2px;
	gap: 12px;
    `;
    subHeader.innerHTML = `
        <span style="white-space: nowrap; text-align: left;">участник: <strong>${participantName}</strong></span>
        <span style="white-space: nowrap; text-align: right;">матчей: <strong>${totalMatches}</strong></span>
    `;
    menu.appendChild(subHeader);
    
    // Статистика
    if (totalMatches === 0) {
        const empty = document.createElement('div');
        empty.style.cssText = 'color: #888; text-align: center; padding: 8px 0;';
        empty.textContent = 'Нет сыгранных матчей';
        menu.appendChild(empty);
    } else {
        const statsDiv = document.createElement('div');
        statsDiv.style.cssText = 'margin-bottom: 6px;';
        
	// Находим максимальное значение ошибки
	const maxError = Math.max(...Object.keys(stats).map(Number));
	// Создаём полный список от -2 до maxError, пропуская -1
	const allValues = [];
	for (let i = -2; i <= maxError; i++) {
	    if (i === -1) continue; // пропускаем -1
	    allValues.push(i);
	}
        
        // Заголовки таблицы
        const headerRow = document.createElement('div');
        headerRow.style.cssText = `
            display: grid;
            grid-template-columns: 1fr 40px;
            gap: 2px 8px;
            font-weight: bold;
            color: #666;
            font-size: 0.55rem;
            text-transform: uppercase;
            border-bottom: 1px solid #e9e6cf;
            padding-bottom: 3px;
            margin-bottom: 3px;
        `;
        headerRow.innerHTML = `
            <div style="text-align: left;">Результат прогноза</div>
            <div style="text-align: right;">Кол-во</div>
        `;
        statsDiv.appendChild(headerRow);
        
        // Находим максимальное количество для шкалы
        const maxCount = Math.max(...Object.values(stats));
        
        for (const key of allValues) {
            const count = stats[key] || 0;
            const keyNum = parseInt(key);
            
            // Процент для прогрессбара (от 0 до 100% от максимального количества)
            const percent = maxCount > 0 ? (count / maxCount) * 100 : 0;
            
            const row = document.createElement('div');
            row.style.cssText = `
                display: grid;
                grid-template-columns: 1fr 40px;
                gap: 2px 8px;
                align-items: center;
                padding: 1px 0;
            `;
            
            // Левая часть: значение + полоса
            const leftCell = document.createElement('div');
            leftCell.style.cssText = 'display: flex; align-items: center; gap: 6px;';
            
            // Значение (прижато влево)
            const val = document.createElement('div');
            val.textContent = key;
            val.style.cssText = 'font-weight: bold; text-align: left; min-width: 18px; font-size: 0.7rem;';
	    if (keyNum === -2) val.style.color = '#2e7d32';
	    else val.style.color = '#c62828';
            
            // Полоса
	    let color;
	    if (keyNum === -2) {
	        color = '#1a5c1a'; // зелёный для -2
	    } else {
	        color = '#b0b0b0'; // серый для всех остальных
	    }            

            const barContainer = document.createElement('div');
            barContainer.style.cssText = 'flex: 1; background: #e9e6cf; border-radius: 8px; height: 10px; overflow: hidden;';
            const bar = document.createElement('div');
            bar.style.cssText = `width: ${percent}%; height: 100%; background: ${color}; border-radius: 8px; opacity: 0.8;`;
            
	    // Если это максимальное количество — выделяем тёмно-серым (кроме -2)
	    if (count === maxCount && count > 0 && keyNum !== -2) {
	        bar.style.background = '#555555'; // тёмно-серый
	        bar.style.opacity = '1';
	        bar.style.boxShadow = '0 0 6px rgba(85, 85, 85, 0.5)';
	    }
	    // Если это -2 и оно максимальное — оставляем зелёным, но делаем ярче
	    if (count === maxCount && count > 0 && keyNum === -2) {
	        bar.style.opacity = '1';
	        bar.style.boxShadow = '0 0 6px rgba(26, 92, 26, 0.5)';
	    }
            
            barContainer.appendChild(bar);
            
            leftCell.appendChild(val);
            leftCell.appendChild(barContainer);
            
            // Правая часть: количество
	    const countDiv = document.createElement('div');
	    countDiv.textContent = count === 0 ? '-' : count;
	    countDiv.style.cssText = 'text-align: center; font-weight: bold; font-size: 0.7rem;';
	    if (keyNum === -2 && count > 0) {
	        countDiv.style.color = '#2e7d32';
	    }

            row.appendChild(leftCell);
            row.appendChild(countDiv);
            statsDiv.appendChild(row);
        }
        
        menu.appendChild(statsDiv);
    }
    
    const sep = document.createElement('hr');
    sep.style.cssText = 'border: none; border-top: 1px solid #dde8c0; margin: 6px 0;';
    menu.appendChild(sep);
    
    const avgDiv = document.createElement('div');
    avgDiv.style.cssText = 'text-align: center; font-size: 0.7rem; color: #1e4620; padding: 2px 0;';
    avgDiv.innerHTML = `Средний результат: <strong>${averageFormatted}</strong>`;
    menu.appendChild(avgDiv);
    
    // Позиционирование — левый верхний угол под левым нижним углом ячейки
    const rect = targetElement.getBoundingClientRect();
    let x = rect.left;
    let y = rect.bottom + 4;
    
    // Корректировка, чтобы не выходило за экран
    const menuWidth = 240;
    const menuHeight = 300;
    if (x + menuWidth > window.innerWidth) {
        x = window.innerWidth - menuWidth - 10;
    }
    if (y + menuHeight > window.innerHeight) {
        y = rect.top - menuHeight - 4;
    }
    if (x < 10) x = 10;
    if (y < 10) y = 10;
    
    menu.style.left = x + 'px';
    menu.style.top = y + 'px';
    
    // Клик по меню закрывает его
    menu.addEventListener('click', (e) => {
        e.stopPropagation();
        closeContextMenu();
        // Снимаем выделение
        if (selectedUserName === contextMenuTarget) {
            selectedUserName = null;
            localStorage.removeItem('selectedUserName');
            document.querySelectorAll(`th[data-participant="${contextMenuTarget}"], td[data-participant="${contextMenuTarget}"]`).forEach(el => {
                el.classList.remove('selected-col');
            });
        }
    });

    document.body.appendChild(menu);
    contextMenuVisible = true;
    contextMenuTarget = participantName;
    
    // Выделяем колонку
    selectParticipant(participantName);
}

function selectParticipant(participantName) {
    if (selectedUserName === participantName) return;
    
    if (selectedUserName) {
        document.querySelectorAll(`th[data-participant="${selectedUserName}"], td[data-participant="${selectedUserName}"]`).forEach(el => {
            el.classList.remove('selected-col');
        });
    }
    selectedUserName = participantName;
    localStorage.setItem('selectedUserName', selectedUserName);
    document.querySelectorAll(`th[data-participant="${selectedUserName}"], td[data-participant="${selectedUserName}"]`).forEach(el => {
        el.classList.add('selected-col');
    });
}

function closeContextMenu() {
    const menu = document.getElementById('participantContextMenu');
    if (menu) menu.remove();
    contextMenuVisible = false;
    contextMenuTarget = null;
}

// Закрываем меню при клике вне его
document.addEventListener('click', (e) => {
    if (contextMenuVisible) {
        const menu = document.getElementById('participantContextMenu');
        if (menu && !menu.contains(e.target)) {
            // Проверяем, не кликнули ли по имени участника в заголовке
            const header = e.target.closest('th[data-participant]');
            if (!header) {
                // Закрываем только меню, выделение НЕ снимаем
                closeContextMenu();
            }
        }
    }
});

function renderTable() {
    const wrapper = document.getElementById('table-wrapper');
    if (!wrapper) return;
    if (matchesData.length === 0) {
        wrapper.innerHTML = '<div class="loading-overlay">❌ Нет данных</div>';
        return;
    }
    
    const results = matchesData.map(m => m.result);
    const { ranks, totalScores } = calculateRanks(participantsData, results);
    
    const table = document.createElement('table');
    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');
    
    const mainHeaders = ['№', 'Дата', 'Время', 'Группа', 'Хозяева', '', 'Гости', 'Результат'];
    for (const h of mainHeaders) {
        const th = document.createElement('th');
        th.textContent = h;
        headerRow.appendChild(th);
    }
    
    const resultHeaderCell = headerRow.children[7];
    if (resultHeaderCell) {
        resultHeaderCell.innerHTML = `
            <div style="display:flex;flex-direction:column;gap:2px;">
                <div style="font-size:0.6rem;color:#d4af37;text-align:right;">Место</div>
                <div>Счет\\Участник</div>
                <div style="font-size:0.6rem;color:#888;text-align:right;">Сумма ошибок</div>
            </div>
        `;
    }
    
    for (let idx = 0; idx < participantsData.length; idx++) {
        const p = participantsData[idx];
        const rank = ranks[idx];
        const totalScore = totalScores.find(ts => ts.name === p.name)?.totalScore || 0;
        const th = document.createElement('th');
        th.classList.add('participant-col');
        th.setAttribute('data-participant', p.name);

        const bgColor = getParticipantColor(p.name);
        th.style.backgroundColor = bgColor;
        th.innerHTML = `<div><div style="font-size:0.65rem;color:#b8860b;">${rank}</div><div>${p.name}</div><div style="font-size:0.65rem;color:#888;">${totalScore}</div></div>`;

        if (selectedUserName === p.name) {
            th.classList.add('selected-col');
        }
    
        th.style.cursor = 'pointer';
        th.title = 'Нажмите для статистики';
    
        // Обработчик клика по заголовку (ТОЛЬКО ЗДЕСЬ!)
        th.addEventListener('click', (e) => {
            e.stopPropagation();
            showContextMenu(e, p.name, th);
        });

        headerRow.appendChild(th);
    }

    thead.appendChild(headerRow);
    table.appendChild(thead);
    
    const tbody = document.createElement('tbody');
    let lastBg = 'transparent';
    
    for (let i = 0; i < matchesData.length; i++) {
        const m = matchesData[i];
        const tr = document.createElement('tr');
        tr.setAttribute('data-match-id', m.id);
        
        let bg = 'transparent';
        if (i > 0 && m.date !== matchesData[i-1].date) {
            bg = lastBg === 'transparent' ? '#f0f0e8' : 'transparent';
            lastBg = bg;
        } else {
            bg = lastBg;
        }
        tr.style.backgroundColor = bg;
        
        tr.appendChild(createCell(m.id));
        tr.appendChild(createCell(m.date));
        tr.appendChild(createCell(m.time));
        tr.appendChild(createCell(`<span class="group-badge">${m.group}</span>`, true));
        tr.appendChild(createCell(formatTeamWithFlag(m.team1, 'home'), true, 'team-name'));
        tr.appendChild(createCell('–', false, '', true));
        tr.appendChild(createCell(formatTeamWithFlag(m.team2, 'away'), true, 'team-name'));
        
        const resultCell = createCell(m.result, false, 'result-cell');

        resultCell.style.cursor = 'pointer';
        resultCell.title = 'Нажатие выделяет/освобождает строку матча';

        resultCell.onclick = (function(matchId, rowElement) {
            return function() {
                if (selectedMatchId === matchId) {
                    selectedMatchId = null;
                    localStorage.removeItem('selectedMatchId');
                    rowElement.classList.remove('selected-match-row');
                    console.log('❌ Выбор матча отменён');
                } else {
                    if (selectedMatchId !== null) {
                        const prevRow = document.querySelector(`tr[data-match-id="${selectedMatchId}"]`);
                        if (prevRow) prevRow.classList.remove('selected-match-row');
                    }
                    selectedMatchId = matchId;
                    localStorage.setItem('selectedMatchId', selectedMatchId);
                    rowElement.classList.add('selected-match-row');
                    console.log('✅ Выбран матч:', matchId);
                }
            };
        })(m.id, tr);

        let matchStarted = false;
        if (m.date && m.date !== '—' && m.time && m.time !== '—') {
            try {
                let year = tournamentParams.турнир_год ? parseInt(tournamentParams.турнир_год) : new Date().getFullYear();
                let months = {
                    'января': 0, 'февраля': 1, 'марта': 2, 'апреля': 3, 'мая': 4, 'июня': 5,
                    'июля': 6, 'августа': 7, 'сентября': 8, 'октября': 9, 'ноября': 10, 'декабря': 11
                };
                let dateParts = m.date.trim().split(' ');
                if (dateParts.length === 2) {
                    let day = parseInt(dateParts[0]);
                    let monthName = dateParts[1];
                    let month = months[monthName];
                    if (!isNaN(day) && month !== undefined) {
                        let timeParts = m.time.split(':');
                        let hours = parseInt(timeParts[0]);
                        let minutes = parseInt(timeParts[1]);
                        let matchDateTime = new Date(year, month, day, hours, minutes);
                        let now = new Date();
                        matchStarted = now >= matchDateTime;
                    }
                }
            } catch(e) {
                matchStarted = false;
            }
        }

        if (m.result && m.result !== '—') {
            const isLightDay = bg === 'transparent';
            resultCell.style.backgroundColor = isLightDay ? '#B7E2FA' : '#93D4F0';
        } else {
            if (matchStarted) {
                resultCell.classList.add('pulse-result-missed');
                resultCell.style.backgroundColor = '#B7E2FA';
            } else {
                resultCell.style.backgroundColor = bg;
            }
        }
        if (m.result && m.result !== '—') resultCell.style.fontWeight = 'bold';
        tr.appendChild(resultCell);
        
        for (let idx = 0; idx < participantsData.length; idx++) {
            const p = participantsData[idx];
            const raw = p.predictions[i] || '—';
            const disp = blurPrediction(raw);
            let total = null;
            if (m.result && m.result !== '—' && raw !== '—') {
                total = calculateTotalScore(m.result, raw);
            }
            const cell = document.createElement('td');
            cell.setAttribute('data-participant', p.name);
            cell.style.textAlign = 'center';
            cell.innerHTML = total !== null ? `${disp}<sup style="font-size:0.65rem;color:#888;">${total}</sup>` : disp;

            if (total === -2) {
                cell.classList.add('pulse-bullseye-index');
            }

            if (selectedUserName === p.name) {
                cell.classList.add('selected-col');
            }

            if (disp !== raw && !isRevealed()) {
                cell.style.filter = 'blur(1px)';
                cell.title = REVEAL_DATE ? `Откроется ${formatDateTime(REVEAL_DATE)}` : '';
            }
            
            // Только добавляем классы, НО НЕ вешаем обработчик клика!
            // Клик по ячейке с прогнозом НЕ открывает меню и НЕ выделяет колонку
            
            tr.appendChild(cell);
        }

        if (selectedMatchId === m.id) {
            tr.classList.add('selected-match-row');
        }
        tbody.appendChild(tr);
    }
    
    table.appendChild(tbody);
    wrapper.innerHTML = '';
    wrapper.appendChild(table);
    
    activateButtons();
}

async function init() {
    const paramsLoaded = await loadTournamentParams();
    if (!paramsLoaded) {
        document.getElementById('table-wrapper').innerHTML = '<div class="loading-overlay" style="color:#a00;">❌ Ошибка загрузки параметров</div>';
        return;
    }
    
    firstMatchDeadline = getFirstMatchDeadlineFromParams();
    REVEAL_DATE = firstMatchDeadline;
    console.log(`🎯 Дедлайн: ${firstMatchDeadline ? formatDateTime(firstMatchDeadline) : 'не определён'}`);
    
    await loadTeamsData();
    
    const success = await loadAllData();
    if (success) {
        renderTable();
    } else {
        document.getElementById('table-wrapper').innerHTML = '<div class="loading-overlay" style="color:#a00;">❌ Ошибка загрузки данных</div>';
        const fillBtn = document.getElementById('fillBtn');
        const battleBtn = document.getElementById('battleBtn');
        if (fillBtn) fillBtn.classList.remove('disabled');
        if (battleBtn) battleBtn.classList.remove('disabled');
    }
}

init();