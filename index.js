// APPS_SCRIPT_URL определён в config.js

let matchesData = [];
let participantsData = [];
let firstMatchDeadline = null;
let REVEAL_DATE = null;
let teamsData = {};
let tournamentParams = {};
let selectedUserName = localStorage.getItem('selectedUserName') || null;
let selectedMatchId = localStorage.getItem('selectedMatchId') ? parseInt(localStorage.getItem('selectedMatchId')) : null;

let fantasyModeEnabled = false;
let fantasyData = null; // { matches: [], participants: [] }

// ========== ПЕРЕМЕННЫЕ ДЛЯ АДМИН-РЕЖИМА ==========
let adminModeEnabled = localStorage.getItem('adminMode') === 'true' || false;
let adminClickSequence = []; // для отслеживания нажатий на заголовки
let isSpeechSupported = false;

// ========== ЗАГРУЗКА ПАРАМЕТРОВ ТУРНИРА ==========
async function loadAllData() {
    try {
        const response = await fetch(`${APPS_SCRIPT_URL}?action=all`);
        if (!response.ok) throw new Error('Ошибка загрузки данных');
        const data = await response.json();
        
        // Проверяем, что данные пришли
        if (!data || !data.params || !data.headers || !data.rows) {
            throw new Error('Неполные данные');
        }
        
        // 1. СОХРАНЯЕМ ПАРАМЕТРЫ (как в loadTournamentParams)
        tournamentParams = data.params;
        console.log('🏆 Параметры турнира загружены:', tournamentParams);
        
        // Обновляем логотип
        const logoContainer = document.getElementById('logoContainer');
        if (logoContainer && tournamentParams.логотип_файл) {
            logoContainer.innerHTML = `<img src="images/${tournamentParams.логотип_файл}" style="height: 2.4rem; width: auto; vertical-align: middle; margin-right: 1px;">`;
        }
        
        // Обновляем подзаголовок
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
        
        // 2. СОХРАНЯЕМ ДАННЫЕ О СБОРНЫХ (как в loadTeamsData)
        if (data.teams) {
            teamsData = data.teams;
            console.log('🏆 Данные о сборных загружены:', Object.keys(teamsData).length, 'стран');
        }
        
        // 3. СОХРАНЯЕМ МАТЧИ И ПРОГНОЗЫ (как в loadAllData)
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
        console.error('Ошибка загрузки данных:', err);
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

// ========== ЗВУКОВОЕ СОПРОВОЖДЕНИЕ ==========
function playSound(type) {
    const sounds = {
        on: 'images/admin-on.mp3',
        off: 'images/admin-off.mp3',
        error: 'images/error.mp3'
    };
    
    const audio = new Audio(sounds[type] || sounds.error);
    audio.volume = 0.5;
    audio.play().catch(() => {
        // Если звук не воспроизвёлся (например, автозапрет) — игнорируем
    });
}

// ========== ПРОВЕРКА ВОЗМОЖНОСТИ ВВОДА СЧЁТА ДЛЯ КОНКРЕТНОГО МАТЧА (ОНИ ДОЛЖНЫ ИДТИ БЕЗ ПРОПУСКОВ!) ==========
function canEnterScore(matchIndex) {
    // Первый матч всегда можно вводить
    if (matchIndex === 0) return true;
    
    // Проверяем все предыдущие матчи
    for (let i = 0; i < matchIndex; i++) {
        if (!matchesData[i].result || matchesData[i].result === '—') {
            return false; // есть пропуск — нельзя
        }
    }
    return true; // все матчи до этого имеют счёт
}

// ========== ПРОВЕРКА ДОСТУПНЫХ ЯЧЕЕК ДЛЯ ВВОДА СЧЕТА ==========
function getAvailableMatches() {
    const now = new Date();
    const available = [];
    
    for (let i = 0; i < matchesData.length; i++) {
        const m = matchesData[i];
        
        // Проверяем, есть ли уже счёт
        if (m.result && m.result !== '—' && m.result !== '') {
            continue; // счёт уже есть — пропускаем
        }
        
        // Проверяем, начался ли матч
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
                        matchStarted = now >= matchDateTime;
                    }
                }
            } catch(e) {
                matchStarted = false;
            }
        }
        
        if (matchStarted) {
            available.push(i);
        }
    }
    
    return available;
}

// ========== ВКЛЮЧЕНИЕ / ВЫКЛЮЧЕНИЕ РЕЖИМА АДМИНА ==========
function toggleAdminMode() {
    if (adminModeEnabled) {
        // === ВЫКЛЮЧЕНИЕ ===
        adminModeEnabled = false;
        localStorage.removeItem('adminMode');
        playSound('off');
        // renderTable(); // <-- ПЕРЕРИСОВЫВАЕМ ВСЮ ТАБЛИЦУ

        // Убираем зелёный фон у заголовка "Результат"
        const resultHeader = document.querySelector('#table-wrapper table thead th:nth-child(8)');
        if (resultHeader) {
            resultHeader.style.backgroundColor = '';
        }
        return;
    }
    
    // === ВКЛЮЧЕНИЕ ===
    // Проверяем, есть ли доступные ячейки
    const available = getAvailableMatches();
    if (available.length === 0) {
        playSound('error');
        return;
    }
    
    // Проверяем поддержку голоса
    isSpeechSupported = !!(window.SpeechRecognition || window.webkitSpeechRecognition);
    
    adminModeEnabled = true;
    localStorage.setItem('adminMode', 'true');
    playSound('on');
    // renderTable(); // <-- ПЕРЕРИСОВЫВАЕМ ВСЮ ТАБЛИЦУ

    // Ставим зелёный фон у заголовка "Результат"
    const resultHeader = document.querySelector('#table-wrapper table thead th:nth-child(8)');
    if (resultHeader) {
        resultHeader.style.backgroundColor = '#a8d5a2';
    }
}

// ========== МОДАЛЬНОЕ ОКНО ДЛЯ ВВОДА СЧЕТА (INDEX) ==========
let activeScoreMatchId = null;
let activeScoreCell = null;

function openScoreInput(matchIndex) {

    const data = getCurrentData();
    const matches = data.matches;
    const match = matches[matchIndex];

    // ===== ПРОВЕРКА НА ПРОПУСКИ =====
    if (!canEnterScore(matchIndex)) {
        alert('⚠️ Не заполнены счета всех предыдущих матчей!');
        return;
    }

    if (!adminModeEnabled) {
        alert('Режим администратора выключен.');
        return;
    }
    
    if (!match) return;
    
    // Находим ячейку
    const rows = document.querySelectorAll('tbody tr');
    const row = rows[matchIndex];
    if (!row) return;
    const cells = row.querySelectorAll('td');
    const resultCell = cells[7];
    if (!resultCell) return;
    
    activeScoreMatchId = matchIndex;
    activeScoreCell = resultCell;
    
    const overlay = document.createElement('div');
    overlay.id = 'scoreModalOverlay';
    overlay.style.cssText = `
        position: fixed; top: 0; left: 0; width: 100%; height: 100%;
        background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center;
        z-index: 9999;
    `;
    
    const modal = document.createElement('div');
    modal.style.cssText = `
        background: #fef9e8; border-radius: 12px; padding: 12px 16px; max-width: 260px;
        box-shadow: 0 8px 32px rgba(0,0,0,0.3); width: 90%;
    `;
    
    const speechSupported = !!(window.SpeechRecognition || window.webkitSpeechRecognition);
    const currentScore = (matches[matchIndex].result && matches[matchIndex].result !== '—') ? matches[matchIndex].result : '';    

    modal.innerHTML = `
        <h3 style="margin-top:0; margin-bottom:8px; color:#1e4620; font-size:1rem;">Введите счёт</h3>
        <p style="margin:0 0 8px 0; font-size:0.85rem; text-align: center;"><strong>${match.team1} – ${match.team2}</strong></p>
        <div style="display:flex; align-items:center; gap:0; justify-content:center;">
            <input type="text" id="scoreInput" placeholder="х:х" style="
                padding: 2px 4px; font-size: 0.85rem; border: 2px solid #cddba8;
                border-radius: 8px; text-align: center; font-family: monospace; width: 80px;
            " value="${currentScore}">
            ${speechSupported ? `
            <button id="scoreVoiceBtn" style="background: none; border: none; font-size: 1.2rem; cursor: pointer; padding: 0 2px;" title="Ввести голосом">🎙️</button>
            ` : ''}
        </div>
        <div style="display:flex; gap:8px; margin-top:12px; justify-content:center;">
            <button id="scoreSendBtn" style="background: #2c7840; color: white; border: none; border-radius: 20px; padding: 4px 16px; font-size: 0.8rem; cursor: pointer;">Сохранить</button>
            <button id="scoreCancelBtn" style="background: #ccc; color: #333; border: none; border-radius: 20px; padding: 4px 16px; font-size: 0.8rem; cursor: pointer;">Отмена</button>
        </div>
    `;
    
    overlay.appendChild(modal);
    document.body.appendChild(overlay);
    
    const input = modal.querySelector('#scoreInput');
    input.focus();
    input.select();
    
    const voiceBtn = modal.querySelector('#scoreVoiceBtn');
    if (voiceBtn) {
        voiceBtn.onclick = function() {
            startVoiceRecognitionInScoreModal(matchIndex, input);
        };
    }
    
    modal.querySelector('#scoreSendBtn').onclick = function() {
        const score = input.value.trim();
        if (score === '') {
            // Пустое поле — удаляем счет
            matches[matchIndex].result = '—';
            if (activeScoreCell) {
                activeScoreCell.textContent = '—';
                // Сбрасываем фон и стили
                activeScoreCell.style.backgroundColor = '';
                activeScoreCell.style.fontWeight = '';
                activeScoreCell.classList.remove('pulse-result-missed');
            }
            closeModal();
            return;
        }
        
        if (/^\d+\s*[:–\-]\s*\d+$/.test(score)) {
            const formattedScore = score.replace(/[–\-]/g, ':');
            // Отправляем на сервер
            sendScoreToSheet(matchIndex, formattedScore);
            closeModal();
        } else {
            input.style.borderColor = 'red';
            setTimeout(() => {
                input.style.borderColor = '#cddba8';
                input.focus();
                input.select();
            }, 800);
        }
    };
    
    modal.querySelector('#scoreCancelBtn').onclick = closeModal;
    
    overlay.onclick = function(e) {
        if (e.target === overlay) closeModal();
    };
    
    input.onkeydown = function(e) {
        if (e.key === 'Enter') {
            e.preventDefault();
            const sendBtn = modal.querySelector('#scoreSendBtn');
            sendBtn.focus();
            sendBtn.click();
        }
        if (e.key === 'Escape') {
            closeModal();
        }
    };
    
    function closeModal() {
        if (overlay.parentNode) overlay.remove();
        activeScoreMatchId = null;
        activeScoreCell = null;
    }
}

// ========== ГОЛОС В МОДАЛЬНОМ ОКНЕ (INDEX) ==========
function startVoiceRecognitionInScoreModal(matchIndex, inputElement) {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return;
    
    inputElement.readOnly = true;
    inputElement.blur();
    inputElement.style.borderColor = 'red';
    inputElement.placeholder = 'Говорите...';
    
    const recognition = new SpeechRecognition();
    recognition.lang = 'ru-RU';
    recognition.continuous = false;
    recognition.interimResults = false;
    
    recognition.start();
    
    let isScoreRecognized = false;
    
    recognition.onresult = function(event) {
        const transcript = event.results[0][0].transcript;
        const score = parseScoreFromSpeech(transcript);
        if (score) {
            isScoreRecognized = true;
            recognition.stop();
            inputElement.value = score;
            inputElement.style.borderColor = '#cddba8';
            inputElement.placeholder = 'х:х';
            inputElement.readOnly = false;
        } else {
            inputElement.style.borderColor = '#cddba8';
            inputElement.placeholder = 'х:х';
            inputElement.readOnly = false;
        }
    };
    
    recognition.onerror = function() {
        if (isScoreRecognized) return;
        inputElement.style.borderColor = '#cddba8';
        inputElement.placeholder = 'х:х';
        inputElement.readOnly = false;
    };
    
    recognition.onend = function() {
        if (isScoreRecognized) return;
        inputElement.style.borderColor = '#cddba8';
        inputElement.placeholder = 'х:х';
        inputElement.readOnly = false;
    };
}

// ========== ПАРСИНГ СЧЁТА ИЗ РЕЧИ ==========
function parseScoreFromSpeech(text) {
    // Убираем лишние пробелы и приводим к нижнему регистру
    text = text.toLowerCase().trim();
    
    // Заменяем слова на цифры
    const numberMap = {
        'ноль': '0', 'нуль': '0', 'один': '1', 'два': '2', 'три': '3',
        'четыре': '4', 'пять': '5', 'шесть': '6', 'семь': '7', 'восемь': '8',
        'девять': '9', 'десять': '10'
    };
    
    let result = text;
    for (const [word, digit] of Object.entries(numberMap)) {
        result = result.replace(new RegExp(word, 'g'), digit);
    }
    
    // Ищем паттерн "цифра:цифра" или "цифра цифра"
    let match = result.match(/(\d+)\s*[:\-]\s*(\d+)/);
    if (!match) {
        match = result.match(/(\d+)\s+(\d+)/);
    }
    if (!match) {
        match = result.match(/(\d+)\s*(к|на)\s*(\d+)/);
    }
    
    if (match) {
        return `${match[1]}:${match[2]}`;
    }
    
    return null;
}

// ========== ОТПРАВКА СЧЁТА В ТАБЛИЦУ ЧЕРЕЗ СЦЕНАРИЙ ==========
async function sendScoreToSheet(matchIndex, score) {

    // Если режим фантазии — НЕ отправляем в Google Sheets!
    if (fantasyModeEnabled) {
        // Обновляем fantasyData
        fantasyData.matches[matchIndex].result = score;
        // Пересчитываем всё
        recalculateFantasyStats();
        renderTable();
        return;
    }

    // Проверяем, включён ли режим админа
    if (!adminModeEnabled) {
        alert('Режим администратора выключен. Отправка счёта недоступна.');
        return;
    }

    const match = matchesData[matchIndex];
    if (!match) return;
    
    try {
        const response = await fetch(`${APPS_SCRIPT_URL}?action=updateScore&matchId=${match.id}&score=${encodeURIComponent(score)}`);
        const result = await response.json();
        
        if (result.success) {
            // Успешно — обновляем ячейку
            matchesData[matchIndex].result = score;
            updateMatchCell(matchIndex, score);
            
            // Проверяем, остались ли ещё доступные ячейки
            const available = getAvailableMatches();
            if (available.length === 0) {
                // Все счета введены — выключаем режим
                toggleAdminMode();
            }
        } else {
            throw new Error(result.error || 'Неизвестная ошибка');
        }
    } catch (err) {
        alert(`Ошибка при отправке: ${err.message}`);
    }
}

// ========== ОБНОВЛЕНИЕ ЯЧЕЙКИ НА СТРАНИЦЕ ==========
function updateMatchCell(matchIndex, score) {
    const rows = document.querySelectorAll('tbody tr');
    if (rows[matchIndex]) {
        const cells = rows[matchIndex].querySelectorAll('td');
        if (cells.length >= 8) {
            const resultCell = cells[7];
            resultCell.textContent = score;
            
            resultCell.style.fontWeight = 'bold';
            resultCell.classList.remove('pulse-result-missed');
        }
    }
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
        
        if (hasFinished) {
  	    battleBtn.style.display = '';
	    battleBtn.classList.remove('hidden', 'disabled');
            battleBtn.classList.add('active');
            battleBtn.title = '⚔️ Перейти к ходу борьбы';
            battleBtn.onclick = null;
        } else {
	    battleBtn.classList.add('hidden', 'disabled');
            battleBtn.classList.remove('active');
            battleBtn.title = '🔒 Доступно после первого завершённого матча';
            battleBtn.onclick = (e) => {
                e.preventDefault();
                alert('🔒 Ход борьбы откроется после появления первого завершённого матча.');
                return false;
            };
        }
    }

    // ===== КНОПКА СТАТИСТИКА =====
    const statBtn = document.getElementById('statBtn');
    let playedMatches = 0;
    for (const match of matchesData) {
        if (match.result && match.result !== '—') playedMatches++;
    }
    
    if (playedMatches >= 10) {
        statBtn.style.display = 'inline-block';
        fillBtn.style.display = 'none';
    } else {
        statBtn.style.display = 'none';
        fillBtn.style.display = 'inline-block';
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

// ========== РАСЧЁТ STANDINGS ПОСЛЕ МАТЧА (ДЛЯ МЕСТ) ==========
function calculateStandingsAfterMatch(upToMatchIndex) {
    const data = getCurrentData();
    if (upToMatchIndex < 0) {
        return data.participants.map(p => ({
            name: p.name,
            totalSum: 0,
            rank: '—'
        }));
    }
    
    const participantStats = [];
    for (let p of data.participants) {
        let totalSum = 0;

        for (let i = 0; i <= upToMatchIndex; i++) {
            const result = data.matches[i].result;
            const pred = p.predictions[i];
            if (result && result !== '—' && pred && pred !== '—') {
                const matchRes = calculateTotalScore(result, pred);
                if (matchRes !== null) {
                    totalSum += matchRes;
                }
            }
        }

        participantStats.push({
            name: p.name,
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
        for (let k = i; k < j; k++) rankMap.set(sorted[k].name, { rank: rankDisplay });
        i = j;
    }

    return participantStats.map(s => ({
        name: s.name,
        totalSum: s.totalSum,
        rank: rankMap.get(s.name).rank
    }));
}

// ========== ПОЛУЧЕНИЕ ПОЗИЦИИ РАНГА ==========
function getRankPosition(rankStr) {
    if (!rankStr || rankStr === '—') return { min: 0, max: 0 };
    if (rankStr.includes('-')) {
        const parts = rankStr.split('-');
        return { min: parseInt(parts[0]), max: parseInt(parts[1]) };
    }
    return { min: parseInt(rankStr), max: parseInt(rankStr) };
}

// ========== РАСЧЁТ РАСШИРЕННОЙ СТАТИСТИКИ УЧАСТНИКА ==========
function calculateParticipantExtendedStats(participantName) {
    const data = getCurrentData();
    const results = data.matches.map(m => m.result);
    const participant = data.participants.find(p => p.name === participantName);

    if (!participant) return null;

    let correctOutcomes = 0;
    let totalMatches = 0;

    // 1. Считаем угаданные исходы
    for (let i = 0; i < results.length; i++) {
        const result = results[i];
        const pred = participant.predictions[i];
        
        if (result && result !== '—' && pred && pred !== '—') {
            const actualOutcome = getOutcome(parseScoreToArray(result));
            const predOutcome = getOutcome(parseScoreToArray(pred));
            
            if (actualOutcome !== null && predOutcome !== null) {
                totalMatches++;
                if (actualOutcome === predOutcome) {
                    correctOutcomes++;
                }
            }
        }
    }

    // 2. Считаем отставание от лидера по угаданным исходам
    let leaderCorrectOutcomes = 0;
    for (const p of data.participants) {
        let outcomes = 0;
        for (let i = 0; i < results.length; i++) {
            const result = results[i];
            const pred = p.predictions[i];
            if (result && result !== '—' && pred && pred !== '—') {
                const actualOutcome = getOutcome(parseScoreToArray(result));
                const predOutcome = getOutcome(parseScoreToArray(pred));
                if (actualOutcome !== null && predOutcome !== null && actualOutcome === predOutcome) {
                    outcomes++;
                }
            }
        }
        if (outcomes > leaderCorrectOutcomes) {
            leaderCorrectOutcomes = outcomes;
        }
    }

    const diffFromLeader = leaderCorrectOutcomes - correctOutcomes;

    // 3. Считаем места (после матча №5)
    let minRank = null;
    let maxRank = null;
    
    // Определяем индекс последнего сыгранного матча
    let lastPlayedMatchIndex = -1;
    for (let i = 0; i < data.matches.length; i++) {
        if (data.matches[i].result && data.matches[i].result !== '—') {
            lastPlayedMatchIndex = i;
        } else {
            break;
        }
    }

    if (lastPlayedMatchIndex >= 0) {
        const cachedStandings = {};
        for (let i = 0; i <= lastPlayedMatchIndex; i++) {
            cachedStandings[i] = calculateStandingsAfterMatch(i);
        }

        // Начинаем с 6-го матча (индекс 5, так как нумерация с 0)
        for (let i = 5; i <= lastPlayedMatchIndex; i++) {
            const standings = cachedStandings[i];
            const s = standings.find(s => s.name === participantName);
            if (s && s.rank && s.rank !== '—') {
                const { min, max } = getRankPosition(s.rank);
                if (minRank === null || min < minRank) minRank = min;
                if (maxRank === null || max > maxRank) maxRank = max;
            }
        }
    }

    return {
        correctOutcomes: correctOutcomes,
        totalMatches: totalMatches,
        minRank: minRank,
        maxRank: maxRank,
        diffFromLeader: diffFromLeader,
        leaderCorrectOutcomes: leaderCorrectOutcomes
    };
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
    const data = getCurrentData();
    const participant = data.participants.find(p => p.name === participantName);

    if (!participant) return;
    
    // Собираем статистику прогнозов
    const results = data.matches.map(m => m.result);
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
    
    // Расчет места и отставания от лидера
    let rankDisplay = '—';
    let leaderDiff = '—';
    let totalParticipants = data.participants.length;

    if (totalMatches > 0) {
        // Считаем сумму ошибок для всех участников
        const results = data.matches.map(m => m.result);
        const allScores = data.participants.map(p => ({
            name: p.name,
            totalScore: calculateTotalParticipantScore(p.predictions, results)
        }));
    
        // Сортируем по сумме ошибок
        allScores.sort((a, b) => a.totalScore - b.totalScore);
    
        // Находим место текущего участника
        const currentScore = allScores.find(p => p.name === participantName)?.totalScore || 0;
        const sameScoreCount = allScores.filter(p => p.totalScore === currentScore).length;
        const betterCount = allScores.filter(p => p.totalScore < currentScore).length;
    
        if (sameScoreCount === 1) {
            rankDisplay = `${betterCount + 1}`;
        } else {
            rankDisplay = `${betterCount + 1}-${betterCount + sameScoreCount}`;
        }
    
        // Отставание от лидера
        const leaderScore = allScores[0]?.totalScore || 0;
        if (currentScore !== leaderScore) {
            leaderDiff = `+${currentScore - leaderScore}`;
        } else {
            leaderDiff = '0';
        }
    }

    // Создаём меню
    const menu = document.createElement('div');
    menu.id = 'participantContextMenu';
    menu.style.cssText = `
        position: fixed;
        background: #fef9e8;
        border: 1px solid #9aaa80;
        border-radius: 12px;
        box-shadow: 0 4px 16px rgba(0,0,0,0.2);
        padding: 10px 14px 10px 14px;
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
        margin-bottom: 4px;
        padding: 0 0 6px 0;
        gap: 12px;
        border-bottom: 1px solid #dde8c0;
    `;
    subHeader.innerHTML = `
        <span style="white-space: nowrap; text-align: left;">участник: <strong>${participantName}</strong></span>
        <span style="white-space: nowrap; text-align: right;">матчей: <strong>${totalMatches}</strong></span>
    `;
    menu.appendChild(subHeader);

    // Место __ (из __)
    const rankRow = document.createElement('div');
    rankRow.style.cssText = `
        font-size: 0.7rem;
        color: #555;
        margin-bottom: 3px;
        padding: 0 0 0 6px;
        text-align: left;
    `;
    rankRow.innerHTML = `
        <span style="display: inline-block; width: 110px;">место:</span>
        <span><strong>${rankDisplay}</strong> (из ${totalParticipants})</span>
    `;
    menu.appendChild(rankRow);

    // Сумма ошибок (отставание от лидера)
    const diffRow = document.createElement('div');
    diffRow.style.cssText = `
        font-size: 0.7rem;
        color: #555;
        margin-bottom: 3px;
        padding: 0 0 0 6px;
        text-align: left;
    `;
    diffRow.innerHTML = `
        <span style="display: inline-block; width: 110px;">сумма ошибок:</span>
        <span><strong>${totalMatches > 0 ? sumResults : '-'}</strong>${totalMatches > 0 ? ` (${leaderDiff})` : ''}</span>
    `;
    menu.appendChild(diffRow);

    // Угадал исход (отставание от лидера)
    const extendedStats = calculateParticipantExtendedStats(participantName);
    if (extendedStats) {
	const outcomeDiv = document.createElement('div');
	outcomeDiv.style.cssText = 'font-size: 0.7rem; color: #1e4620; padding: 0 0 0 6px; margin-bottom: 3px; text-align: left;';
	const diffText = extendedStats.diffFromLeader > 0 ? `(-${extendedStats.diffFromLeader})` : '(-)';
	outcomeDiv.innerHTML = `
	    <span style="display: inline-block; width: 110px;">угадал исход:</span>
	    <span><strong>${extendedStats.correctOutcomes}</strong> ${diffText}</span>
	`;
	menu.appendChild(outcomeDiv);

        // Занимал места 
        const rankRangeDiv = document.createElement('div');
        rankRangeDiv.style.cssText = 'font-size: 0.7rem; color: #1e4620; padding: 0 0 6px 6px; margin-bottom: 4px; text-align: left; border-bottom: 1px solid #dde8c0;';
        
        // Проверяем, сыграно ли 5 матчей
        let playedMatches = 0;
        for (const match of data.matches) {
            if (match.result && match.result !== '—') playedMatches++;
        }
        
        if (playedMatches < 5 || extendedStats.minRank === null || extendedStats.maxRank === null) {
            rankRangeDiv.innerHTML = `
	        <span style="display: inline-block; width: 110px;">места (после №5):</span>
	        <span><strong>—</strong></span>
	    `;
        } else {
            rankRangeDiv.innerHTML = `
	        <span style="display: inline-block; width: 110px;">места (после №5):</span>
	        <span><strong>${extendedStats.minRank}-${extendedStats.maxRank}</strong></span>
	    `;
        }
        menu.appendChild(rankRangeDiv);
    }

    // Статистика
    if (totalMatches === 0) {
        const empty = document.createElement('div');
        empty.style.cssText = 'color: #888; text-align: center; padding: 8px 0;';
        empty.textContent = 'Нет сыгранных матчей';
        menu.appendChild(empty);
    } else {
        const statsDiv = document.createElement('div');
        statsDiv.style.cssText = 'margin-bottom: 6px; margin-top: 8px;';
        
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
            <div style="text-align: left;">Результаты прогноза</div>
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
            val.style.cssText = 'font-weight: bold; text-align: center; min-width: 18px; font-size: 0.7rem;';
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
    
    const data = getCurrentData();
    const matches = data.matches;
    const participants = data.participants;
    const results = matches.map(m => m.result);
    const { ranks, totalScores } = calculateRanks(participants, results);

    const table = document.createElement('table');
    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');
    
    const mainHeaders = ['№', 'Дата', 'Время', 'Группа', 'Хозяева', '', 'Гости', 'Результат'];
    for (const h of mainHeaders) {
        const th = document.createElement('th');
        th.textContent = h;
    
	// ===== ОБРАБОТЧИК АДМИН-РЕЖИМА (ПОСЛЕДОВАТЕЛЬНОСТЬ ЗАГОЛОВКОВ) =====
	th.addEventListener('click', function(e) {
	    const cellIndex = this.cellIndex;
    
	    // Колонка 6 = "Гости", колонка 7 = "Счет"
	    if (cellIndex === 6 || cellIndex === 7) {
	        adminClickSequence.push(cellIndex);
        
	        if (adminClickSequence.length > 3) {
	            adminClickSequence.shift();
	        }
        
	        const expectedSequence = [6, 7, 6];
	        const isMatch = adminClickSequence.length === 3 && 
	                adminClickSequence.every((val, idx) => val === expectedSequence[idx]);
        
	        if (isMatch) {
	            adminClickSequence = [];
        	    toggleAdminMode();
	        }
	    }
	});
    
        headerRow.appendChild(th);
    }

    const resultHeaderCell = headerRow.children[7];
    if (resultHeaderCell) {
	if (adminModeEnabled) {
            resultHeaderCell.style.backgroundColor = '#a8d5a2';
	} else {
            resultHeaderCell.style.backgroundColor = '';
    	}

        resultHeaderCell.innerHTML = `
            <div style="display:flex;flex-direction:column;gap:2px;">
                <div style="font-size:0.6rem;color:#d4af37;text-align:right;">Место</div>
                <div>Счет\\Участник</div>
                <div style="font-size:0.6rem;color:#888;text-align:right;">Сумма ошибок</div>
            </div>
        `;
    }
    
    for (let idx = 0; idx < participants.length; idx++) {
        const p = participants[idx];
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
    
    for (let i = 0; i < matches.length; i++) {
        const m = matches[i];
        const tr = document.createElement('tr');
        tr.setAttribute('data-match-id', m.id);
        
        let bg = 'transparent';
        if (i > 0 && m.date !== matches[i-1].date) {
            bg = lastBg === 'transparent' ? '#f0f0e8' : 'transparent';
            lastBg = bg;
        } else {
            bg = lastBg;
        }
        tr.style.backgroundColor = bg;
        
	// Ячейка "№"
	const idCell = createCell(m.id);
	idCell.style.cursor = 'pointer';
	idCell.title = 'Нажмите чтобы выделить строку';
	idCell.onclick = (function(matchId, rowElement) {
	    return function() { toggleRowSelection(matchId, rowElement); };
	})(m.id, tr);
	tr.appendChild(idCell);

	// Ячейка "Дата"
	const dateCell = createCell(m.date);
	dateCell.style.cursor = 'pointer';
	dateCell.title = 'Нажмите чтобы выделить строку';
	dateCell.onclick = (function(matchId, rowElement) {
	    return function() { toggleRowSelection(matchId, rowElement); };
	})(m.id, tr);
	tr.appendChild(dateCell);

	// Ячейка "Время"
	const timeCell = createCell(m.time);
	timeCell.style.cursor = 'pointer';
	timeCell.title = 'Нажмите чтобы выделить строку';
	timeCell.onclick = (function(matchId, rowElement) {
	    return function() { toggleRowSelection(matchId, rowElement); };
	})(m.id, tr);
	tr.appendChild(timeCell);

	// Ячейка "Группа"
	const groupCell = createCell(`<span class="group-badge">${m.group}</span>`, true);
	groupCell.style.cursor = 'pointer';
	groupCell.title = 'Нажмите чтобы выделить строку';
	groupCell.onclick = (function(matchId, rowElement) {
	    return function() { toggleRowSelection(matchId, rowElement); };
	})(m.id, tr);
	tr.appendChild(groupCell);

	// Ячейка "Хозяева"
	const homeCell = createCell(formatTeamWithFlag(m.team1, 'home'), true, 'team-name');
	homeCell.style.cursor = 'pointer';
	homeCell.title = 'Нажмите чтобы выделить строку';
	homeCell.onclick = (function(matchId, rowElement) {
	    return function() { toggleRowSelection(matchId, rowElement); };
	})(m.id, tr);
	tr.appendChild(homeCell);

	// Ячейка "–" (разделитель)
	const dashCell = createCell('–', false, '', true);
	dashCell.style.cursor = 'pointer';
	dashCell.title = 'Нажмите чтобы выделить строку';
	dashCell.onclick = (function(matchId, rowElement) {
	    return function() { toggleRowSelection(matchId, rowElement); };
	})(m.id, tr);
	tr.appendChild(dashCell);

	// Ячейка "Гости"
	const awayCell = createCell(formatTeamWithFlag(m.team2, 'away'), true, 'team-name');
	awayCell.style.cursor = 'pointer';
	awayCell.title = 'Нажмите чтобы выделить строку';
	awayCell.onclick = (function(matchId, rowElement) {
	    return function() { toggleRowSelection(matchId, rowElement); };
	})(m.id, tr);
	tr.appendChild(awayCell);
        
	const resultCell = createCell(m.result, false, 'result-cell');

	if (fantasyModeEnabled) {
	    resultCell.style.cursor = 'pointer';
	    resultCell.title = 'Нажмите чтобы изменить счёт матча (режим "А если...")';
	} else {
	    resultCell.style.cursor = adminModeEnabled ? 'pointer' : 'default';
	    resultCell.title = 'Нажмите чтобы изменить счёт (админ-режим)';
	}
	
	resultCell.onclick = (function(matchId, rowElement, matchIndex) {
	    return function() {
        	// === РЕЖИМ ФАНТАЗИИ: изменяем счёт матча ===
	        if (fantasyModeEnabled) {
        	    openFantasyScoreInput(matchIndex);
	            return;
        	}
        
	        const isAvailable = getAvailableMatches().includes(matchIndex);
        
	        // Если админ-режим включен и ячейка доступна (матч начался, счета нет)
        	if (adminModeEnabled && isAvailable) {
	            openScoreInput(matchIndex);
        	    return;
	        }
        
	        // Если ничего не подошло — ничего не делаем (выделение строки теперь на других ячейках)
	    };
	})(m.id, tr, i);

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
	        // Матч начался, но счёта нет — пульсация с фоном в зависимости от дня
        	resultCell.classList.add('pulse-result-missed');
	        // Устанавливаем правильный фон в зависимости от дня
        	const isLightDay = bg === 'transparent';
	        resultCell.style.backgroundColor = isLightDay ? '#B7E2FA' : '#93D4F0';
            } else {
                resultCell.style.backgroundColor = bg;
            }
        }
        if (m.result && m.result !== '—') resultCell.style.fontWeight = 'bold';

	if (fantasyModeEnabled) {
	    resultCell.style.backgroundColor = '#ffe0e6';
	    const originalMatch = matchesData[i];
	    if (originalMatch && originalMatch.result !== m.result) {
        	resultCell.style.backgroundColor = '#ff6b6b';
	    }
	}

        tr.appendChild(resultCell);
        
        for (let idx = 0; idx < participants.length; idx++) {
            const p = participants[idx];
            const raw = p.predictions[i] || '—';
            const disp = blurPrediction(raw);
            let total = null;
            if (m.result && m.result !== '—' && raw !== '—') {
                total = calculateTotalScore(m.result, raw);
            }
            const cell = document.createElement('td');
            cell.setAttribute('data-participant', p.name);

	    cell.style.cursor = 'pointer';
	    if (fantasyModeEnabled) {
	        cell.title = 'Нажмите чтобы изменить прогноз (режим "А если...")';
	    } else {
	        cell.title = ''; // или убрать title, или оставить пустым
	    }

	    cell.onclick = (function(participantIdx, matchIdx) {
	        return function() {
	            if (fantasyModeEnabled) {
            	    openFantasyPredictionInput(participantIdx, matchIdx);
	            }
	        };
	    })(idx, i);

            cell.style.textAlign = 'center';
            cell.innerHTML = total !== null ? `${disp}<sup style="font-size:0.65rem;color:#888;">${total}</sup>` : disp;

	    if (fantasyModeEnabled) {
	        cell.style.backgroundColor = '#ffe0e6';
	        const originalParticipant = participantsData[idx];
	        if (originalParticipant && originalParticipant.predictions[i] !== raw) {
	            cell.style.backgroundColor = '#ff6b6b';
	        }
	    }

	    if (total === -2) {
	        if (fantasyModeEnabled) {
	            // Проверяем, изменена ли ячейка
	            const originalParticipant = participantsData[idx];
	            const isChanged = originalParticipant && originalParticipant.predictions[i] !== raw;
	            if (isChanged) {
	                cell.classList.add('pulse-bullseye-fantasy');
	            } else {
	                cell.classList.add('pulse-bullseye-index');
	            }
	        } else {
	            cell.classList.add('pulse-bullseye-index');
	        }
	    }

            if (selectedUserName === p.name) {
                cell.classList.add('selected-col');
            }

            if (disp !== raw && !isRevealed()) {
                cell.style.filter = 'blur(1px)';
                cell.title = REVEAL_DATE ? `Откроется ${formatDateTime(REVEAL_DATE)}` : '';
            }
            
	    // Обработчик клика для изменения прогноза в режиме "А если..."            
            
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
    
    // Прокручиваем к выделенной строке при загрузке/обновлении
    scrollToSelectedMatchOnLoad();
}

function toggleRowSelection(matchId, rowElement) {
    if (selectedMatchId === matchId) {
        selectedMatchId = null;
        localStorage.removeItem('selectedMatchId');
        rowElement.classList.remove('selected-match-row');
    } else {
        if (selectedMatchId !== null) {
            const prevRow = document.querySelector(`tr[data-match-id="${selectedMatchId}"]`);
            if (prevRow) prevRow.classList.remove('selected-match-row');
        }
        selectedMatchId = matchId;
        localStorage.setItem('selectedMatchId', selectedMatchId);
        rowElement.classList.add('selected-match-row');
    }
}

// ========== ПРОКРУТКА К ВЫДЕЛЕННОЙ СТРОКЕ ПРИ ЗАГРУЗКЕ ==========
function scrollToSelectedMatchOnLoad() {
    if (selectedMatchId === null) return;
    
    const selectedRow = document.querySelector(`tr[data-match-id="${selectedMatchId}"]`);
    if (!selectedRow) return;
    
    const wrapper = document.getElementById('table-wrapper');
    if (!wrapper) return;
    
    // Находим высоту одной строки
    const firstRow = wrapper.querySelector('tbody tr');
    if (!firstRow) return;
    const rowHeight = firstRow.offsetHeight;
    
    // Вычисляем позицию для прокрутки (строка должна быть 4-й сверху)
    const targetScroll = selectedRow.offsetTop - (4 * rowHeight);
    
    // Задержка 300ms для телефона (на компьютере тоже работает)
    setTimeout(function() {
        // Прокручиваем
        wrapper.scrollTop = Math.max(0, targetScroll);
    }, 300);
}

// ========== ФУНКЦИИ ДЛЯ ФАНТАЗИ РЕЖИМА ==========
function getCurrentData() {
    if (fantasyModeEnabled && fantasyData) {
        return {
            matches: fantasyData.matches,
            participants: fantasyData.participants
        };
    }
    return {
        matches: matchesData,
        participants: participantsData
    };
}

function toggleFantasyMode() {
    const btn = document.getElementById('fantasyBtn');
    if (!btn) return;

    if (fantasyModeEnabled) {
        // === ВЫКЛЮЧЕНИЕ РЕЖИМА ===
        fantasyModeEnabled = false;
        fantasyData = null;
    
        // Сбрасываем визуальное состояние кнопки
        const btn = document.getElementById('fantasyBtn');
        if (btn) {
            btn.style.background = '#ffb6c1'; // исходный розовый
        }
    
        // Перерисовываем таблицу из исходных данных
        renderTable();
        return;
    }

    // === ВКЛЮЧЕНИЕ РЕЖИМА ===
    // 1. Клонируем данные
    fantasyData = {
        matches: JSON.parse(JSON.stringify(matchesData)),
        participants: JSON.parse(JSON.stringify(participantsData))
    };
    
    fantasyModeEnabled = true;

    // Меняем вид кнопки — показываем, что режим активен
    if (btn) {
        btn.style.background = '#ff8a9e'; // более насыщенный розовый
    }

    // 2. Перерисовываем таблицу (функция renderTable должна использовать fantasyData, если режим включён)
    renderTable();

    // 3. Показываем модальное окно с описанием
    showFantasyModal();
}

function recalculateFantasyStats() {
    if (!fantasyModeEnabled || !fantasyData) return;
    // Ничего дополнительного не нужно — renderTable() перерисует всё на основе fantasyData
    // Все расчёты происходят внутри renderTable() через getCurrentData()
}

function showFantasyModal() {
    const overlay = document.createElement('div');
    overlay.style.cssText = `
        position: fixed; top: 0; left: 0; width: 100%; height: 100%;
        background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center;
        z-index: 9999;
    `;
    
    const modal = document.createElement('div');
    modal.style.cssText = `
        background: #ffe0e6; border-radius: 12px; padding: 16px 16px; max-width: 340px;
        box-shadow: 0 8px 32px rgba(0,0,0,0.3); width: 90%;
    `;
    
    modal.innerHTML = `
        <h4 style="margin-top:0; color:#1e4620;">✨ Вы включили режим «А если...»</h4>
        <p style="font-size:0.85rem; line-height:1.5; color: #2c5a2a;">
            В этом режиме вы можете пофантазировать:<br>
            • менять счёт любого матча<br>
            • менять любой прогноз любого участника<br><br>
            Все изменения остаются <strong>только у вас в <br>
	    браузере</strong> и не видны никому.<br><br>
            Чтобы выйти из режима - нажмите кнопку <br>
	    «А если...» ещё раз или обновите страницу.
        </p>
        <button id="fantasyModalCloseBtn" style="
            background: #2c7840; color: white; border: none; border-radius: 20px;
            padding: 6px 20px; font-size: 0.9rem; cursor: pointer; display: block; margin: 12px auto 0;
        ">Понятно</button>
    `;
    
    overlay.appendChild(modal);
    document.body.appendChild(overlay);
    
    modal.querySelector('#fantasyModalCloseBtn').onclick = function() {
        overlay.remove();
    };
    
    overlay.onclick = function(e) {
        if (e.target === overlay) overlay.remove();
    };
}

function openFantasyPredictionInput(participantIdx, matchIdx) {
    if (!fantasyModeEnabled || !fantasyData) return;
    
    const data = getCurrentData();
    const match = data.matches[matchIdx];
    const participant = data.participants[participantIdx];
    const currentPrediction = participant.predictions[matchIdx] || '—';
    
    // Создаём overlay
    const overlay = document.createElement('div');
    overlay.style.cssText = `
        position: fixed; top: 0; left: 0; width: 100%; height: 100%;
        background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center;
        z-index: 9999;
    `;
    
    const modal = document.createElement('div');
    modal.style.cssText = `
        background: #fef9e8; border-radius: 12px; padding: 12px 16px; max-width: 260px;
        box-shadow: 0 8px 32px rgba(0,0,0,0.3); width: 90%;
    `;
    
    modal.innerHTML = `
        <h3 style="margin-top:0; margin-bottom:8px; color:#1e4620; font-size:1rem;">Изменить прогноз</h3>
        <p style="margin:0 0 8px 0; font-size:0.85rem; text-align: center;">
            <strong>${participant.name}</strong><br>
            ${match.team1} – ${match.team2}
        </p>
        <div style="display:flex; align-items:center; gap:0; justify-content:center;">
            <input type="text" id="fantasyPredictionInput" placeholder="х:х" style="
                padding: 2px 4px; font-size: 0.85rem; border: 2px solid #cddba8;
                border-radius: 8px; text-align: center; font-family: monospace; width: 80px;
            " value="${currentPrediction !== '—' ? currentPrediction : ''}">
        </div>
        <div style="display:flex; gap:8px; margin-top:12px; justify-content:center;">
            <button id="fantasyPredictionSendBtn" style="background: #2c7840; color: white; border: none; border-radius: 20px; padding: 4px 16px; font-size: 0.8rem; cursor: pointer;">Сохранить</button>
            <button id="fantasyPredictionCancelBtn" style="background: #ccc; color: #333; border: none; border-radius: 20px; padding: 4px 16px; font-size: 0.8rem; cursor: pointer;">Отмена</button>
        </div>
    `;
    
    overlay.appendChild(modal);
    document.body.appendChild(overlay);
    
    const input = modal.querySelector('#fantasyPredictionInput');
    input.focus();
    input.select();
    
    modal.querySelector('#fantasyPredictionSendBtn').onclick = function() {
        const score = input.value.trim();
        
        // Если пусто — не меняем прогноз
        if (score === '') {
            overlay.remove();
            return;
        }
        
        // Проверяем валидность счёта
        if (/^\d+\s*[:–\-]\s*\d+$/.test(score)) {
            const formattedScore = score.replace(/[–\-]/g, ':');
            
            // Обновляем fantasyData
            fantasyData.participants[participantIdx].predictions[matchIdx] = formattedScore;
            
            // Пересчитываем и перерисовываем
            recalculateFantasyStats();
            renderTable();
            overlay.remove();
        } else {
            input.style.borderColor = 'red';
            setTimeout(() => {
                input.style.borderColor = '#cddba8';
                input.focus();
                input.select();
            }, 800);
        }
    };
    
    modal.querySelector('#fantasyPredictionCancelBtn').onclick = function() {
        overlay.remove();
    };
    
    overlay.onclick = function(e) {
        if (e.target === overlay) overlay.remove();
    };
    
    input.onkeydown = function(e) {
        if (e.key === 'Enter') {
            e.preventDefault();
            const sendBtn = modal.querySelector('#fantasyPredictionSendBtn');
            sendBtn.focus();
            sendBtn.click();
        }
        if (e.key === 'Escape') {
            overlay.remove();
        }
    };
}

function openFantasyScoreInput(matchIndex) {
    if (!fantasyModeEnabled || !fantasyData) return;
    
    const data = getCurrentData();
    const matches = data.matches;
    const match = matches[matchIndex];
    if (!match) return;
    
    const currentScore = (match.result && match.result !== '—') ? match.result : '';
    
    const overlay = document.createElement('div');
    overlay.style.cssText = `
        position: fixed; top: 0; left: 0; width: 100%; height: 100%;
        background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center;
        z-index: 9999;
    `;
    
    const modal = document.createElement('div');
    modal.style.cssText = `
        background: #ffe0e6; border-radius: 12px; padding: 12px 16px; max-width: 260px;
        box-shadow: 0 8px 32px rgba(0,0,0,0.3); width: 90%;
    `;
    
    modal.innerHTML = `
        <h3 style="margin-top:0; margin-bottom:8px; color:#1e4620; font-size:1rem;">Изменить счёт матча</h3>
        <p style="margin:0 0 8px 0; font-size:0.85rem; text-align: center;"><strong>${match.team1} – ${match.team2}</strong></p>
        <div style="display:flex; align-items:center; gap:0; justify-content:center;">
            <input type="text" id="fantasyScoreInput" placeholder="х:х" style="
                padding: 2px 4px; font-size: 0.85rem; border: 2px solid #cddba8;
                border-radius: 8px; text-align: center; font-family: monospace; width: 80px;
            " value="${currentScore}">
        </div>
        <div style="display:flex; gap:8px; margin-top:12px; justify-content:center;">
            <button id="fantasyScoreSendBtn" style="background: #2c7840; color: white; border: none; border-radius: 20px; padding: 4px 16px; font-size: 0.8rem; cursor: pointer;">Сохранить</button>
            <button id="fantasyScoreCancelBtn" style="background: #ccc; color: #333; border: none; border-radius: 20px; padding: 4px 16px; font-size: 0.8rem; cursor: pointer;">Отмена</button>
        </div>
    `;
    
    overlay.appendChild(modal);
    document.body.appendChild(overlay);
    
    const input = modal.querySelector('#fantasyScoreInput');
    input.focus();
    input.select();
    
    modal.querySelector('#fantasyScoreSendBtn').onclick = function() {
        const score = input.value.trim();
        
        // Пустое поле — удаляем счёт
        if (score === '') {
            fantasyData.matches[matchIndex].result = '—';
            recalculateFantasyStats();
            renderTable();
            overlay.remove();
            return;
        }
        
        // Проверяем валидность счёта
        if (/^\d+\s*[:–\-]\s*\d+$/.test(score)) {
            const formattedScore = score.replace(/[–\-]/g, ':');
            
            // Обновляем fantasyData
            fantasyData.matches[matchIndex].result = formattedScore;
            
            // Пересчитываем и перерисовываем
            recalculateFantasyStats();
            renderTable();
            overlay.remove();
        } else {
            input.style.borderColor = 'red';
            setTimeout(() => {
                input.style.borderColor = '#cddba8';
                input.focus();
                input.select();
            }, 800);
        }
    };
    
    modal.querySelector('#fantasyScoreCancelBtn').onclick = function() {
        overlay.remove();
    };
    
    overlay.onclick = function(e) {
        if (e.target === overlay) overlay.remove();
    };
    
    input.onkeydown = function(e) {
        if (e.key === 'Enter') {
            e.preventDefault();
            const sendBtn = modal.querySelector('#fantasyScoreSendBtn');
            sendBtn.focus();
            sendBtn.click();
        }
        if (e.key === 'Escape') {
            overlay.remove();
        }
    };
}

// ========== init() ==========
async function init() {
    // Загружаем ВСЁ за один запрос
    const success = await loadAllData();
    
    if (!success) {
        document.getElementById('table-wrapper').innerHTML = '<div class="loading-overlay" style="color:#a00;">❌ Ошибка загрузки данных</div>';
        const fillBtn = document.getElementById('fillBtn');
        const battleBtn = document.getElementById('battleBtn');
        if (fillBtn) fillBtn.classList.remove('disabled');
        if (battleBtn) battleBtn.classList.remove('disabled');
        return;
    }

    const fantasyBtn = document.getElementById('fantasyBtn');
    if (fantasyBtn) {
        fantasyBtn.style.display = participantsData.length > 0 ? 'inline-block' : 'none';
        fantasyBtn.onclick = toggleFantasyMode;
    }
    
    // Определяем дедлайн (из уже загруженных tournamentParams)
    firstMatchDeadline = getFirstMatchDeadlineFromParams();
    REVEAL_DATE = firstMatchDeadline;
    console.log(`🎯 Дедлайн: ${firstMatchDeadline ? formatDateTime(firstMatchDeadline) : 'не определён'}`);

    // ===== ПРОВЕРКА АДМИН-РЕЖИМА (СЧЕТА МОГЛИ БЫТЬ ПОСТАВЛЕНЫ В ДРУГОМ БРАУЗЕРЕ) ПЕРЕД РЕНДЕРОМ =====
    if (adminModeEnabled) {
        const available = getAvailableMatches();
        if (available.length === 0) {
            toggleAdminMode();
        }
    }
    
    // Рендерим таблицу
    renderTable();
}

init();
