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
	        subElement.innerHTML = `<a href="${linkParam}" target="_blank" rel="noopener noreferrer" style="color: #2c5a2a; text-decoration: 	none;">${tournamentParams.подзаголовок}</a>`;
	    } else {
	        subElement.innerHTML = tournamentParams.подзаголовок;
	    }
	}        
        // Обновляем заголовок страницы
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
    
    // Парсим первый_матч_дата (может быть строкой или объектом Date)
    if (typeof tournamentParams.первый_матч_дата === 'string') {
        // Формат "DD.MM.YYYY"
        const dateParts = tournamentParams.первый_матч_дата.split('.');
        if (dateParts.length === 3) {
            day = parseInt(dateParts[0]);
            month = parseInt(dateParts[1]) - 1;
            year = parseInt(dateParts[2]);
        } else {
            // Попытка распарсить ISO строку
            const d = new Date(tournamentParams.первый_матч_дата);
            if (!isNaN(d.getTime())) {
                year = d.getFullYear();
                month = d.getMonth();
                day = d.getDate();
            }
        }
    } else if (tournamentParams.первый_матч_дата instanceof Date || tournamentParams.первый_матч_дата?.getTime) {
        // Уже объект Date
        const d = new Date(tournamentParams.первый_матч_дата);
        year = d.getFullYear();
        month = d.getMonth();
        day = d.getDate();
    } else if (typeof tournamentParams.первый_матч_дата === 'number') {
        // Unix timestamp
        const d = new Date(tournamentParams.первый_матч_дата);
        year = d.getFullYear();
        month = d.getMonth();
        day = d.getDate();
    }
    
    // Парсим первый_матч_время
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

// ========== ФОРМАТИРОВАНИЕ ДАТЫ БЕЗ СЕКУНД ==========
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
        // Используем локальную папку flags с PNG-файлами
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
            // Показываем прогресс матчей вместо сообщения о завершении приёма
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
	    statusDiv.innerHTML = `📅 Участников: ${participantsCount}, матчей: ${matchesCount}. Приём прогнозов до 	${formatDateTime(firstMatchDeadline)} (мск)`;
	    statusDiv.className = 'status-msg deadline';
        }
    }
    
    // Кнопка "Ход борьбы"
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

        // Получаем цвет участника (как в battle.js)
        const bgColor = getParticipantColor(p.name);
    
        th.style.backgroundColor = bgColor;
        th.innerHTML = `<div><div style="font-size:0.65rem;color:#b8860b;">${rank}</div><div>${p.name}</div><div style="font-size:0.65rem;color:#888;">${totalScore}</div></div>`;

        // Подсветка выбранной колонки при загрузке
        if (selectedUserName === p.name) {
            th.classList.add('selected-col');
        }
    
        // ===== ОБРАБОТЧИК ВЫБОРА =====
        th.style.cursor = 'pointer';
        th.title = 'Нажатие выделяет/освобождает колонку участника';
    
        th.onclick = () => {
            if (selectedUserName === p.name) {
                // Отменяем выбор
                selectedUserName = null;
		localStorage.removeItem('selectedUserName');

                // Убираем подсветку со всех ячеек этого участника
                document.querySelectorAll(`th[data-participant="${p.name}"], td[data-participant="${p.name}"]`).forEach(el => {
                    el.classList.remove('selected-col');
                });
                console.log('❌ Выбор отменён');
            } else {
                // Убираем подсветку с предыдущего выбранного участника
                if (selectedUserName) {
                    document.querySelectorAll(`th[data-participant="${selectedUserName}"], td[data-participant="${selectedUserName}"]`).forEach(el => {
                        el.classList.remove('selected-col');
                    });
                }
                // Выбираем нового участника
                selectedUserName = p.name;
		localStorage.setItem('selectedUserName', selectedUserName);

                // Подсвечиваем новую колонку
                document.querySelectorAll(`th[data-participant="${selectedUserName}"], td[data-participant="${selectedUserName}"]`).forEach(el => {
                    el.classList.add('selected-col');
                });
                console.log('✅ Выбран участник:', selectedUserName);
            }
        };

	th.addEventListener('contextmenu', (e) => {
	    e.preventDefault();
	    showContextMenu(e, p.name);
	});


	// ===== ДОЛГОЕ НАЖАТИЕ (ТЕЛЕФОН) =====
	th.addEventListener('touchstart', (e) => {
	    if (document.getElementById('participantContextMenu')) return;
	    handleTouchStart(e, p.name);
	});

	th.addEventListener('touchend', () => {
	    handleTouchEnd();
	    // Если это был короткий тап (не долгое нажатие) - выделяем колонку
	    if (!isLongPressTriggered && !document.getElementById('participantContextMenu')) {
	        th.onclick();
	    }
	});

	th.addEventListener('touchmove', () => {
	    handleTouchMove();
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

	// ===== ОБРАБОТЧИК ВЫБОРА СТРОКИ (МАТЧА) =====
	resultCell.style.cursor = 'pointer';
	resultCell.title = 'Нажатие выделяет/освобождает строку матча';

	resultCell.onclick = (function(matchId, rowElement, resultCellElement) {
	    return function() {
        	if (selectedMatchId === matchId) {
	            // Отменяем выбор
        	    selectedMatchId = null;
	            localStorage.removeItem('selectedMatchId');
            
        	    // Убираем подсветку со строки
	            rowElement.classList.remove('selected-match-row');
            
        	    console.log('❌ Выбор матча отменён');
	        } else {
        	    // Убираем подсветку с предыдущего выбранного матча
	            if (selectedMatchId !== null) {
                	const prevRow = document.querySelector(`tr[data-match-id="${selectedMatchId}"]`);
        	        if (prevRow) prevRow.classList.remove('selected-match-row');
	            }
            
        	    // Выбираем новый матч
	            selectedMatchId = matchId;
        	    localStorage.setItem('selectedMatchId', selectedMatchId);
            
	            // Подсвечиваем новую строку
        	    rowElement.classList.add('selected-match-row');
            
	            console.log('✅ Выбран матч:', matchId);
        	}
	    };
	})(m.id, tr, resultCell);


	// Парсим дату и время матча для проверки, начался ли он
	let matchStarted = false;
	if (m.date && m.date !== '—' && m.time && m.time !== '—') {
	    try {
        	// Получаем год турнира из параметров
	        let year = tournamentParams.турнир_год ? parseInt(tournamentParams.турнир_год) : new Date().getFullYear();
        
        	// Формат даты: "12 июня" (русские названия месяцев)
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

	// Для ячейки результата
	if (m.result && m.result !== '—') {
	    // Чередуем оттенки голубого в зависимости от дня (используем bg, который уже определён)
	    // bg = 'transparent' для светлого дня, bg = '#...' для тёмного дня
	    const isLightDay = bg === 'transparent';
	    resultCell.style.backgroundColor = isLightDay ? '#B7E2FA' : '#93D4F0';
	} else {
	    // Если нет счёта — проверяем, начался ли матч
	    if (matchStarted) {
	        // Матч начался, но счёта нет — пульсация
	        resultCell.classList.add('pulse-result-missed');
	        resultCell.style.backgroundColor = '#B7E2FA'; // базовый цвет
	    } else {
	        // Матч ещё не начался — фон как у строки
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

	    // Если точный счёт (total === -2) — добавляем класс пульсации ко всей ячейке
	    if (total === -2) {
	        cell.classList.add('pulse-bullseye-index');
	    }

    	    // Подсветка выбранной колонки
	    if (selectedUserName === p.name) {
	        cell.classList.add('selected-col');
	    }

            if (disp !== raw && !isRevealed()) {
                cell.style.filter = 'blur(1px)';
                cell.title = REVEAL_DATE ? `Откроется ${formatDateTime(REVEAL_DATE)}` : '';
            }
            tr.appendChild(cell);

	    // ===== ДОЛГОЕ НАЖАТИЕ (ТЕЛЕФОН) =====
	    cell.addEventListener('touchstart', (e) => {
	        if (document.getElementById('participantContextMenu')) return;
	        handleTouchStart(e, p.name);
	    });

	    cell.addEventListener('touchend', () => {
	        handleTouchEnd();
	        // Если это был короткий тап - выделяем колонку
	        if (!isLongPressTriggered && !document.getElementById('participantContextMenu')) {
	            // Находим заголовок этого участника и вызываем его onclick
	            const header = document.querySelector(`th[data-participant="${p.name}"]`);
	            if (header && header.onclick) {
	                header.onclick();
	            }
	        }
	    });

	    cell.addEventListener('touchmove', () => {
	        handleTouchMove();
	    });

        }

       // Восстанавливаем подсветку при загрузке
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

// ========== КОНТЕКСТНОЕ МЕНЮ ДЛЯ УЧАСТНИКОВ (начало) ==========
let contextMenuVisible = false;

function showContextMenu(event, participantName) {
    event.preventDefault();
    
    // Удаляем старое меню
    const existingMenu = document.getElementById('participantContextMenu');
    if (existingMenu) existingMenu.remove();
    
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
    
    // Средний результат
    const average = totalMatches > 0 ? (sumResults / totalMatches) : 0;
    const averageFormatted = average.toFixed(2);
    
    // Создаём меню - делаем его уже
    const menu = document.createElement('div');
    menu.id = 'participantContextMenu';
    menu.style.cssText = `
        position: fixed;
        background: #fef9e8;
        border: 1px solid #9aaa80;
        border-radius: 16px;
        box-shadow: 0 8px 32px rgba(0,0,0,0.3);
        padding: 16px 20px;
        z-index: 9999;
        min-width: 240px;
        max-width: 260px;
        font-size: 0.85rem;
        color: #1e4620;
    `;
    
    // Заголовок
    const header = document.createElement('div');
    header.style.cssText = `
        font-weight: bold;
        font-size: 1rem;
        color: #1e4620;
        border-bottom: 2px solid #dde8c0;
        padding-bottom: 8px;
        margin-bottom: 8px;
        text-align: center;
    `;
    header.textContent = 'Статистика участника';
    menu.appendChild(header);
    
    // Подзаголовки: участник и матчей
    const subHeader = document.createElement('div');
    subHeader.style.cssText = `
        display: flex;
        justify-content: space-between;
        font-size: 0.75rem;
        color: #555;
        margin-bottom: 12px;
        padding: 0 4px;
    `;
    subHeader.innerHTML = `
        <span>участник: <strong>${participantName}</strong></span>
        <span>матчей: <strong>${totalMatches}</strong></span>
    `;
    menu.appendChild(subHeader);
    
    // Статистика
    if (totalMatches === 0) {
        const empty = document.createElement('div');
        empty.style.cssText = 'color: #888; text-align: center; padding: 12px 0;';
        empty.textContent = 'Нет сыгранных матчей';
        menu.appendChild(empty);
    } else {
        const statsDiv = document.createElement('div');
        statsDiv.style.cssText = 'margin-bottom: 8px;';
        
        // Сортируем ключи
        const sortedKeys = Object.keys(stats).sort((a, b) => parseInt(a) - parseInt(b));
        
        // Заголовки таблицы - объединяем первые 2 колонки
        const headerRow = document.createElement('div');
        headerRow.style.cssText = `
            display: grid;
            grid-template-columns: 1fr 50px;
            gap: 4px 12px;
            font-weight: bold;
            color: #666;
            font-size: 0.65rem;
            text-transform: uppercase;
            border-bottom: 1px solid #e9e6cf;
            padding-bottom: 4px;
            margin-bottom: 4px;
        `;
        headerRow.innerHTML = `
            <div style="text-align: center;">Результат прогноза</div>
            <div style="text-align: right;">Кол-во</div>
        `;
        statsDiv.appendChild(headerRow);
        
        // Находим максимальное значение для шкалы
        const maxKey = Math.max(...sortedKeys.map(Number));
        const minScale = -2;
        const maxScale = maxKey;
        const scaleRange = maxScale - minScale;
        
        for (const key of sortedKeys) {
            const count = stats[key];
            const keyNum = parseInt(key);
            
            // Вычисляем позицию на шкале от -2 до максимума
            let percent;
            if (scaleRange === 0) {
                percent = 100;
            } else {
                percent = ((keyNum - minScale) / scaleRange) * 100;
            }
            percent = Math.max(0, Math.min(100, percent));
            
            const row = document.createElement('div');
            row.style.cssText = `
                display: grid;
                grid-template-columns: 1fr 50px;
                gap: 4px 12px;
                align-items: center;
                padding: 2px 0;
            `;
            
            // Левая часть: значение + полоса
            const leftCell = document.createElement('div');
            leftCell.style.cssText = 'display: flex; align-items: center; gap: 8px;';
            
            // Значение
            const val = document.createElement('div');
            val.textContent = key;
            val.style.cssText = 'font-weight: bold; text-align: right; min-width: 20px;';
            if (keyNum < 0) val.style.color = '#c62828';
            else if (keyNum === 0) val.style.color = '#e65100';
            else val.style.color = '#2e7d32';
            
            // Полоса
            let color;
            if (keyNum === -2) {
                color = '#1a5c1a'; // тёмно-зелёный
            } else {
                const intensity = Math.min(1, (keyNum + 2) / 10);
                const r = 46 + intensity * 119;
                const g = 125 - intensity * 59;
                const b = 50 + intensity * 117;
                color = `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`;
            }
            
            const barContainer = document.createElement('div');
            barContainer.style.cssText = 'flex: 1; background: #e9e6cf; border-radius: 10px; height: 14px; overflow: hidden;';
            const bar = document.createElement('div');
            bar.style.cssText = `width: ${percent}%; height: 100%; background: ${color}; border-radius: 10px; opacity: 0.8;`;
            barContainer.appendChild(bar);
            
            leftCell.appendChild(val);
            leftCell.appendChild(barContainer);
            
            // Правая часть: количество
            const countDiv = document.createElement('div');
            countDiv.textContent = count;
            countDiv.style.cssText = 'text-align: right; font-weight: bold;';
            
            row.appendChild(leftCell);
            row.appendChild(countDiv);
            statsDiv.appendChild(row);
        }
        
        menu.appendChild(statsDiv);
    }
    
    // Разделитель
    const sep = document.createElement('hr');
    sep.style.cssText = 'border: none; border-top: 1px solid #dde8c0; margin: 8px 0;';
    menu.appendChild(sep);
    
    // Средний результат
    const avgDiv = document.createElement('div');
    avgDiv.style.cssText = 'text-align: center; font-size: 0.8rem; color: #1e4620; padding: 4px 0;';
    avgDiv.innerHTML = `Средний результат: <strong>${averageFormatted}</strong>`;
    menu.appendChild(avgDiv);
    
    // Позиционирование
    let x = event.clientX;
    let y = event.clientY;
    const menuWidth = 260;
    const menuHeight = 450;
    if (x + menuWidth > window.innerWidth) x = window.innerWidth - menuWidth - 10;
    if (y + menuHeight > window.innerHeight) y = window.innerHeight - menuHeight - 10;
    if (x < 10) x = 10;
    if (y < 10) y = 10;
    
    menu.style.left = x + 'px';
    menu.style.top = y + 'px';
    
    document.body.appendChild(menu);
    contextMenuVisible = true;
}

function closeContextMenu() {
    const menu = document.getElementById('participantContextMenu');
    if (menu) menu.remove();
    contextMenuVisible = false;
}

// Закрываем меню при клике вне его
document.addEventListener('click', (e) => {
    if (contextMenuVisible) {
        const menu = document.getElementById('participantContextMenu');
        if (menu && !menu.contains(e.target)) {
            closeContextMenu();
        }
    }
});

// Отключаем стандартное контекстное меню
document.addEventListener('contextmenu', (e) => {
    const cell = e.target.closest('td[data-participant]');
    const header = e.target.closest('th[data-participant]');
    if (cell || header) {
        e.preventDefault();
        const name = (cell || header).getAttribute('data-participant');
        if (name) {
            showContextMenu(e, name);
        }
    }
});

// ========== КОНТЕКСТНОЕ МЕНЮ ДЛЯ УЧАСТНИКОВ (окончание) ==========

// ========== ДОЛГОЕ НАЖАТИЕ ДЛЯ ТЕЛЕФОНОВ (начало) ==========
let longPressTimer = null;
let longPressTarget = null;
let isLongPressTriggered = false;

function handleTouchStart(element, participantName) {
    // НЕ сбрасываем isLongPressTriggered здесь!
    longPressTarget = participantName;
    
    // Очищаем предыдущий таймер
    if (longPressTimer) {
        clearTimeout(longPressTimer);
        longPressTimer = null;
    }
    
    longPressTimer = setTimeout(() => {
        isLongPressTriggered = true;
        // Эмулируем событие для showContextMenu
        const fakeEvent = {
            clientX: window.innerWidth / 2,
            clientY: window.innerHeight / 2,
            preventDefault: () => {}
        };
        showContextMenu(fakeEvent, participantName);
        // Вибрация (если поддерживается)
        if (navigator.vibrate) navigator.vibrate(20);
    }, 600); // 600 мс = долгое нажатие
}

function handleTouchEnd() {
    clearTimeout(longPressTimer);
    longPressTimer = null;
    longPressTarget = null;
    // ВАЖНО: сбрасываем флаг, чтобы короткие тапы работали
    isLongPressTriggered = false;
}

function handleTouchMove() {
    clearTimeout(longPressTimer);
    longPressTimer = null;
    longPressTarget = null;
}

// ========== ДОЛГОЕ НАЖАТИЕ ДЛЯ ТЕЛЕФОНОВ (окончание) ==========

async function init() {
    // 1. Загружаем параметры
    const paramsLoaded = await loadTournamentParams();
    if (!paramsLoaded) {
        document.getElementById('table-wrapper').innerHTML = '<div class="loading-overlay" style="color:#a00;">❌ Ошибка загрузки параметров</div>';
        return;
    }
    
    // 2. Определяем дедлайн
    firstMatchDeadline = getFirstMatchDeadlineFromParams();
    REVEAL_DATE = firstMatchDeadline;
    console.log(`🎯 Дедлайн: ${firstMatchDeadline ? formatDateTime(firstMatchDeadline) : 'не определён'}`);
    
    // 3. Загружаем данные о сборных
    await loadTeamsData();
    
    // 4. Загружаем матчи и прогнозы
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