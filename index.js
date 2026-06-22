// APPS_SCRIPT_URL определён в config.js

let matchesData = [];
let participantsData = [];
let firstMatchDeadline = null;
let REVEAL_DATE = null;
let teamsData = {};
let tournamentParams = {};
let selectedUserName = localStorage.getItem('selectedUserName') || null;
let selectedMatchId = localStorage.getItem('selectedMatchId') ? parseInt(localStorage.getItem('selectedMatchId')) : null;

// ========== ПЕРЕМЕННЫЕ ДЛЯ АДМИН-РЕЖИМА ==========
let adminModeEnabled = localStorage.getItem('adminMode') === 'true' || false;
let adminClickSequence = []; // для отслеживания нажатий на заголовки
let isSpeechSupported = false;

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
        updateAdminUI();
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
    updateAdminUI();
}

// ========== ОБНОВЛЕНИЕ ИНТЕРФЕЙСА В РЕЖИМЕ АДМИНА ==========
function updateAdminUI() {
    // Меняем фон заголовка «Результат»
    const resultHeader = document.querySelector('th:nth-child(8)');
    if (resultHeader) {
        if (adminModeEnabled) {
            resultHeader.style.backgroundColor = '#a8d5a2';
        } else {
            resultHeader.style.backgroundColor = '';
        }
    }
    
    // Обновляем ячейки с результатами
    const resultCells = document.querySelectorAll('tbody td:nth-child(8)');
    const available = getAvailableMatches();
    
    resultCells.forEach((cell, index) => {
        // Проверяем, есть ли уже счёт (только если там цифры)
        const cellText = cell.textContent.trim();
	const hasScore = /^\d+\s*[:–\-]\s*\d+$/.test(cellText); // проверка на счёт вида "2:1"
        if (hasScore) return;
        
        // Проверяем, доступен ли этот матч для ввода
        const isAvailable = available.includes(index);
        
	if (adminModeEnabled && isAvailable) {
	    // Удаляем старую иконку, если она есть
	    const oldIcon = cell.querySelector('.admin-icon');
	    if (oldIcon) {
        	if (oldIcon._clickHandler) {
	            oldIcon.removeEventListener('click', oldIcon._clickHandler);
        	}
	        oldIcon.remove();
	    }
    
	    // Создаём новую иконку
	    const icon = isSpeechSupported ? '🎤' : '✏️';
	    const iconSpan = document.createElement('span');
	    iconSpan.className = 'admin-icon';
	    iconSpan.style.cssText = 'cursor:pointer; font-size:0.8rem; display:inline-block; width:1.2em; text-align:center;';
	    iconSpan.dataset.matchIndex = index;
	    iconSpan.textContent = icon;
    
	    const handler = function(e) {
        	e.stopPropagation();
	        const matchIndex = parseInt(this.dataset.matchIndex);
        	if (!adminModeEnabled) {
	            alert('Режим администратора выключен. Ввод счёта недоступен.');
        	    return;
	        }
        	openScoreInput(matchIndex);
	    };
	    iconSpan._clickHandler = handler;
	    iconSpan.addEventListener('click', handler);
    
	    cell.innerHTML = '';
	    cell.appendChild(iconSpan);
	} else {
	    // Очищаем ячейку и вставляем прочерк
	    while (cell.firstChild) {
        	cell.removeChild(cell.firstChild);
	    }
	    cell.textContent = '—';
	}

    });
}

// ========== ОТКРЫТИЕ ВВОДА СЧЁТА (ГОЛОС ИЛИ РУЧНОЙ) ==========
function openScoreInput(matchIndex) {
    // Проверяем, включён ли режим админа
    if (!adminModeEnabled) {
        alert('Режим администратора выключен. Ввод счёта недоступен.');
        return;
    }

    const match = matchesData[matchIndex];
    if (!match) return;
    
    if (isSpeechSupported) {
        // === ГОЛОСОВОЙ ВВОД ===
        startVoiceRecognition(matchIndex);
    } else {
        // === РУЧНОЙ ВВОД ===
        showManualInputModal(matchIndex);
    }
}


// ========== ГОЛОСОВОЙ ВВОД СЧЁТА ==========
function startVoiceRecognition(matchIndex) {
    const match = matchesData[matchIndex];
    if (!match) return;
    
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
        showManualInputModal(matchIndex);
        return;
    }
    
    const recognition = new SpeechRecognition();
    recognition.lang = 'ru-RU';
    recognition.continuous = false;
    recognition.interimResults = false;
    
    // Изменяем иконку на "слушаю..."
    const iconEl = document.querySelector(`.admin-icon[data-match-index="${matchIndex}"]`);
    if (iconEl) {
        iconEl.textContent = '🎤';
        iconEl.style.color = 'red';
        iconEl.style.animation = 'pulse 0.5s infinite';
    }
    
    recognition.start();
    
    let isScoreRecognized = false; // добавляем флаг

    recognition.onresult = function(event) {
        const transcript = event.results[0][0].transcript;
        // Парсим счёт из речи (например, "два один" → "2:1")
        const score = parseScoreFromSpeech(transcript);
        if (score) {
	    isScoreRecognized = true; // <-- УСТАНАВЛИВАЕМ ФЛАГ
	    recognition.stop(); // <-- ОСТАНАВЛИВАЕМ РАСПОЗНАВАНИЕ
            showConfirmModal(matchIndex, score);
        } else {
            alert('Не удалось распознать счёт. Попробуйте ещё раз или введите вручную.');
            resetIcon(matchIndex);
            showManualInputModal(matchIndex);
        }
    };
    
    recognition.onerror = function() {
        if (isScoreRecognized) return; // <-- ЕСЛИ УЖЕ РАСПОЗНАЛИ — ИГНОРИРУЕМ
        resetIcon(matchIndex);
        alert('Ошибка распознавания. Попробуйте ещё раз или введите вручную.');
        showManualInputModal(matchIndex);
    };
    
    recognition.onend = function() {
        if (isScoreRecognized) return; // <-- ЕСЛИ УЖЕ РАСПОЗНАЛИ — ИГНОРИРУЕМ
        resetIcon(matchIndex);
    };
    
    function resetIcon(index) {
        const el = document.querySelector(`.admin-icon[data-match-index="${index}"]`);
        if (el) {
            el.textContent = isSpeechSupported ? '🎤' : '✏️';
            el.style.color = '';
            el.style.animation = '';
        }
    }
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

// ========== РУЧНОЙ ВВОД СЧЁТА (МОДАЛЬНОЕ ОКНО) ==========
function showManualInputModal(matchIndex) {
    const match = matchesData[matchIndex];
    if (!match) return;
    
    // Создаём модальное окно
    const overlay = document.createElement('div');
    overlay.style.cssText = `
        position: fixed; top: 0; left: 0; width: 100%; height: 100%;
        background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center;
        z-index: 9999;
    `;
    
    const modal = document.createElement('div');
    modal.style.cssText = `
        background: #fef9e8; border-radius: 16px; padding: 20px; max-width: 400px;
        box-shadow: 0 8px 32px rgba(0,0,0,0.3); width: 90%;
    `;
    modal.innerHTML = `
        <h3 style="margin-top:0; color:#1e4620;">Введите счёт</h3>
        <p><strong>${match.team1} – ${match.team2}</strong></p>
        <input type="text" id="manualScoreInput" placeholder="Например: 2:1" style="
            width: 100%; padding: 8px 12px; font-size: 1.2rem; border: 2px solid #cddba8;
            border-radius: 10px; text-align: center; font-family: monospace;
        ">
        <div style="display:flex; gap:12px; margin-top:16px; justify-content:center;">
            <button id="manualSendBtn" style="
                background: #2c7840; color: white; border: none; border-radius: 20px;
                padding: 8px 24px; font-size: 0.9rem; cursor: pointer;
            ">Отправить</button>
            <button id="manualCancelBtn" style="
                background: #ccc; color: #333; border: none; border-radius: 20px;
                padding: 8px 24px; font-size: 0.9rem; cursor: pointer;
            ">Отмена</button>
        </div>
    `;
    
    overlay.appendChild(modal);
    document.body.appendChild(overlay);
    
    // Фокусируем поле ввода
    const input = modal.querySelector('#manualScoreInput');
    input.focus();
    
    // Обработчик отправки
    modal.querySelector('#manualSendBtn').addEventListener('click', function() {
        const score = input.value.trim();
        if (score && /^\d+\s*[:–\-]\s*\d+$/.test(score)) {
            const formattedScore = score.replace(/[–\-]/g, ':');
            closeModal();
            showConfirmModal(matchIndex, formattedScore);
        } else {
            alert('Пожалуйста, введите счёт в формате "2:1" или "2-1"');
        }
    });
    
    // Обработчик отмены
    modal.querySelector('#manualCancelBtn').addEventListener('click', closeModal);
    
    // Закрытие по клику на оверлей
    overlay.addEventListener('click', function(e) {
        if (e.target === overlay) closeModal();
    });
    
    // Enter в поле ввода
    input.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') {
            modal.querySelector('#manualSendBtn').click();
        }
    });
    
    function closeModal() {
        if (overlay.parentNode) overlay.remove();
    }
}

// ========== ОКНО ПОДТВЕРЖДЕНИЯ СЧЁТА ==========
function showConfirmModal(matchIndex, score) {
    const match = matchesData[matchIndex];
    if (!match) return;
    
    const overlay = document.createElement('div');
    overlay.style.cssText = `
        position: fixed; top: 0; left: 0; width: 100%; height: 100%;
        background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center;
        z-index: 9999;
    `;
    
    const modal = document.createElement('div');
    modal.style.cssText = `
        background: #fef9e8; border-radius: 16px; padding: 20px; max-width: 400px;
        box-shadow: 0 8px 32px rgba(0,0,0,0.3); width: 90%;
    `;
    modal.innerHTML = `
        <h3 style="margin-top:0; color:#1e4620;">Подтвердите ввод счёта</h3>
        <p><strong>${match.team1} – ${match.team2}</strong></p>
        <p style="font-size: 1.8rem; font-weight: bold; text-align: center; margin: 12px 0;">${score}</p>
        <div style="display:flex; gap:12px; margin-top:16px; justify-content:center;">
            <button id="confirmSendBtn" style="
                background: #2c7840; color: white; border: none; border-radius: 20px;
                padding: 8px 24px; font-size: 0.9rem; cursor: pointer;
            ">Отправить</button>
            <button id="confirmRetryBtn" style="
                background: #e67e22; color: white; border: none; border-radius: 20px;
                padding: 8px 24px; font-size: 0.9rem; cursor: pointer;
            ">Исправить</button>
            <button id="confirmCancelBtn" style="
                background: #ccc; color: #333; border: none; border-radius: 20px;
                padding: 8px 24px; font-size: 0.9rem; cursor: pointer;
            ">Отмена</button>
        </div>
    `;
    
    overlay.appendChild(modal);
    document.body.appendChild(overlay);
    
    // Отправить
    modal.querySelector('#confirmSendBtn').addEventListener('click', function() {
        closeModal();
        sendScoreToSheet(matchIndex, score);
    });
    
    // Исправить
    modal.querySelector('#confirmRetryBtn').addEventListener('click', function() {
        closeModal();
        openScoreInput(matchIndex);
    });
    
    // Отмена
    modal.querySelector('#confirmCancelBtn').addEventListener('click', closeModal);
    
    overlay.addEventListener('click', function(e) {
        if (e.target === overlay) closeModal();
    });
    
    function closeModal() {
        if (overlay.parentNode) overlay.remove();
    }
}

// ========== ОТПРАВКА СЧЁТА В НОВЫЙ СЦЕНАРИЙ ==========
async function sendScoreToSheet(matchIndex, score) {
    // Проверяем, включён ли режим админа
    if (!adminModeEnabled) {
        alert('Режим администратора выключен. Отправка счёта недоступна.');
        return;
    }

    const match = matchesData[matchIndex];
    if (!match) return;
    
    // Показываем индикатор загрузки на иконке
    const iconEl = document.querySelector(`.admin-icon[data-match-index="${matchIndex}"]`);
    if (iconEl) {
        iconEl.textContent = '⏳';
        iconEl.style.color = '#888';
    }
    
    try {
        const response = await fetch(`${APPS_SCRIPT_UPDATE_URL}?action=updateScore&matchId=${match.id}&score=${encodeURIComponent(score)}`);
        const result = await response.json();
        
        if (result.success) {
            // Успешно — обновляем ячейку
            matchesData[matchIndex].result = score;
            updateMatchCell(matchIndex, score);
            
            // Проверяем, остались ли ещё доступные ячейки
            const available = getAvailableMatches();
            if (available.length === 0) {
                // Все счета введены — выключаем режим
                adminModeEnabled = false;
                localStorage.removeItem('adminMode');
                playSound('off');
                updateAdminUI();
            }
        } else {
            throw new Error(result.error || 'Неизвестная ошибка');
        }
    } catch (err) {
        alert(`Ошибка при отправке: ${err.message}`);
        // Возвращаем иконку
        if (iconEl) {
            iconEl.textContent = isSpeechSupported ? '🎤' : '✏️';
            iconEl.style.color = '';
        }
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
    
    // Расчет места и отставания от лидера
    let rankDisplay = '—';
    let leaderDiff = '—';
    let totalParticipants = participantsData.length;

    if (totalMatches > 0) {
        // Считаем сумму ошибок для всех участников
        const results = matchesData.map(m => m.result);
        const allScores = participantsData.map(p => ({
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
        padding: 0;
        gap: 12px;
    `;
    subHeader.innerHTML = `
        <span style="white-space: nowrap; text-align: left;">участник: <strong>${participantName}</strong></span>
        <span style="white-space: nowrap; text-align: right;">матчей: <strong>${totalMatches}</strong></span>
    `;
    menu.appendChild(subHeader);

    // Место (из)
    const rankRow = document.createElement('div');
    rankRow.style.cssText = `
        font-size: 0.7rem;
        color: #555;
        margin-bottom: 4px;
        padding: 0;
	text-align: center;
    `;
    rankRow.innerHTML = `
        <span>место: <strong>${rankDisplay}</strong> (из ${totalParticipants})</span>
    `;
    menu.appendChild(rankRow);

    // Сумма ошибок (отставание от лидера)
    const diffRow = document.createElement('div');
    diffRow.style.cssText = `
        font-size: 0.7rem;
        color: #555;
        margin-bottom: 8px;
        padding: 0;
	text-align: center;
    `;
    diffRow.innerHTML = `
        <span>сумма ошибок: <strong>${totalMatches > 0 ? sumResults : '-'}</strong>${totalMatches > 0 ? ` (${leaderDiff})` : ''}</span>
    `;

    menu.appendChild(diffRow);
    
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
    
    const results = matchesData.map(m => m.result);
    const { ranks, totalScores } = calculateRanks(participantsData, results);
    
    const table = document.createElement('table');
    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');
    
    const mainHeaders = ['№', 'Дата', 'Время', 'Группа', 'Хозяева', '', 'Гости', 'Результат'];
    for (const h of mainHeaders) {
        const th = document.createElement('th');
        th.textContent = h;
    
        // ===== ОБРАБОТЧИК АДМИН-РЕЖИМА (ПОСЛЕДОВАТЕЛЬНОСТЬ ЗАГОЛОВКОВ) =====
        th.addEventListener('click', function(e) {
            const headerText = this.textContent.trim();
            const cellIndex = this.cellIndex;
        
            const isHome = headerText === 'Хозяева' || cellIndex === 4;
            const isAway = headerText === 'Гости' || cellIndex === 6;
            const isResult = cellIndex === 7;
        
            if (isHome || isAway || isResult) {
                let clickType = '';
                if (isHome) clickType = 'Хозяева';
                else if (isAway) clickType = 'Гости';
                else if (isResult) clickType = 'Результат';
            
                adminClickSequence.push(clickType);
            
                if (adminClickSequence.length > 3) {
                    adminClickSequence.shift();
                }
            
                const expectedSequence = ['Хозяева', 'Гости', 'Результат'];
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
    
    // Восстанавливаем режим админа после перерисовки таблицы
    if (adminModeEnabled) {
        updateAdminUI();
    }

    // Прокручиваем к выделенной строке при загрузке/обновлении
    scrollToSelectedMatchOnLoad();
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
    
    // Прокручиваем
    wrapper.scrollTop = Math.max(0, targetScroll);
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