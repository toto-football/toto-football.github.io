// APPS_SCRIPT_URL определён в config.js

let matchesData = [];
let predictions = {};
let isAlreadySent = false;
let firstMatchDeadline = null;
let tournamentParams = {};
let teamsData = {};

// ========== РАБОТА С LOCALSTORAGE ==========
function loadPredictionsFromStorage() {
    try {
        const saved = localStorage.getItem('fillPredictions');
        if (saved) {
            return JSON.parse(saved);
        }
    } catch(e) {
        console.warn('Ошибка загрузки прогнозов:', e);
    }
    return {};
}

function savePredictionsToStorage() {
    try {
        localStorage.setItem('fillPredictions', JSON.stringify(predictions));
    } catch(e) {
        console.warn('Ошибка сохранения прогнозов:', e);
    }
}

// ========== ЗАГРУЗКА ПАРАМЕТРОВ ==========
async function loadTournamentParams() {
    try {
        const response = await fetch(`${APPS_SCRIPT_URL}?action=params`);
        if (!response.ok) throw new Error('Ошибка загрузки параметров');
        const params = await response.json();
        tournamentParams = params;
        /* console.log('🏆 Параметры турнира загружены:', tournamentParams); */
        
        const logoContainer = document.getElementById('logoContainer');
        if (logoContainer && tournamentParams.логотип_файл) {
            logoContainer.innerHTML = `<img src="images/${tournamentParams.логотип_файл}" style="height: 2.4rem; width: auto; vertical-align: middle; margin-right: 1px;">`;
        }

        const subElements = document.querySelectorAll('.sub');
        if (subElements.length > 0 && tournamentParams.подзаголовок) {
            subElements.forEach(el => {
                const link = el.querySelector('a');
                if (link) {
                    link.innerHTML = tournamentParams.подзаголовок;
                } else {
                    el.innerHTML = tournamentParams.подзаголовок;
                }
            });
        }
        
        if (tournamentParams.турнир_год) {
            document.title = `ЧМ-${tournamentParams.турнир_год} · Заполнение прогнозов`;
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
        if (!response.ok) throw new Error();
        teamsData = await response.json();
        /* console.log('🏆 Данные о сборных загружены'); */
        return true;
    } catch (err) {
        console.error('Ошибка загрузки сборных:', err);
        return false;
    }
}

// ========== ОПРЕДЕЛЕНИЕ ДЕДЛАЙНА ==========
function getFirstMatchDeadline() {
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

function formatDateTime(date) {
    if (!date) return '';
    const day = date.getDate().toString().padStart(2, '0');
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const year = date.getFullYear();
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    return `${day}.${month}.${year}, ${hours}:${minutes}`;
}

// ========== ФЛАГИ И РЕЙТИНГ ==========
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

function formatTeamWithFlagAndRank(teamName, position = 'home') {
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

function getColumnHeader(position) {
    if (position === 'home') {
        return '<span style="color:#888;">(рейтинг)</span> Хозяева';
    } else {
        return 'Гости <span style="color:#888;">(рейтинг)</span>';
    }
}

function isValidNameFormat(name) {
    const trimmed = name.trim();
    const parts = trimmed.split(/\s+/);
    if (parts.length < 2) return false;
    const lastPart = parts[parts.length - 1];
    const lastPartClean = lastPart.replace(/\.$/, '');
    if (lastPartClean.length < 1 || lastPartClean.length > 2) return false;
    if (!/^[A-Za-zА-Яа-я]+$/.test(lastPartClean)) return false;
    return true;
}

function formatUsername(rawName) {
    if (!rawName) return '';
    const trimmed = rawName.trim();
    const parts = trimmed.split(/\s+/);
    if (parts.length === 0) return trimmed;
    const firstName = parts[0];
    if (parts.length === 1) return firstName + '.';
    const lastInitial = parts[1].charAt(0);
    return `${firstName} ${lastInitial}.`;
}

async function loadMatches() {
    try {
        const response = await fetch(`${APPS_SCRIPT_URL}?action=full`);
        if (!response.ok) throw new Error('Ошибка загрузки данных');
        const data = await response.json();
        if (!data || !data.headers || !data.rows) throw new Error('Нет данных');
        
        const rows = data.rows;
        matchesData = rows.map(row => ({
            id: parseInt(row.id),
            date: row.date || '—',
            time: row.time || '—',
            group: row.group || '?',
            team1: row.team1 || '—',
            team2: row.team2 || '—'
        })).sort((a,b) => a.id - b.id);
        
        /* console.log(`Загружено матчей: ${matchesData.length}`); */
        return true;
    } catch(e) {
        console.error('Ошибка загрузки матчей:', e);
        document.getElementById('table-wrapper').innerHTML = '<div class="loading-overlay" style="color:red;">❌ Ошибка загрузки</div>';
        return false;
    }
}

async function findTargetColumn() {
    try {
        const response = await fetch(APPS_SCRIPT_URL);
        if (!response.ok) throw new Error();
        const data = await response.json();
        const headers = data.headers || [];
        for (let i = 7; i < headers.length; i++) {
            if (!headers[i] || headers[i] === '' || headers[i].startsWith('Участник')) {
                return i + 1;
            }
        }
        return headers.length + 1;
    } catch(e) {
        console.error('Ошибка поиска колонки:', e);
        return null;
    }
}

async function checkUsernameExists(username) {
    if (!username) return false;
    try {
        const response = await fetch(APPS_SCRIPT_URL);
        if (!response.ok) throw new Error();
        const data = await response.json();
        const headers = data.headers || [];
        for (let i = 7; i < headers.length; i++) {
            if (headers[i] === username) return true;
        }
        return false;
    } catch(e) {
        console.error('Ошибка проверки имени:', e);
        return false;
    }
}

function parseScore(scoreStr) {
    if (!scoreStr) return null;
    let cleaned = scoreStr.trim().replace(/[^0-9\-:]/g, '');
    let sep = cleaned.includes(':') ? ':' : (cleaned.includes('-') ? '-' : null);
    if (!sep) return null;
    let parts = cleaned.split(sep);
    if (parts.length !== 2) return null;
    let g1 = parseInt(parts[0]), g2 = parseInt(parts[1]);
    if (isNaN(g1) || isNaN(g2)) return null;
    return [g1, g2];
}

function formatScore(scoreStr) {
    if (!scoreStr) return '';
    let parts = parseScore(scoreStr);
    if (parts) return `${parts[0]}:${parts[1]}`;
    return scoreStr;
}

function randomScore() {
    return `${Math.floor(Math.random() * 4)}:${Math.floor(Math.random() * 4)}`;
}

async function sendPredictions(username, preds, targetCol) {
    const predictionsArray = Object.entries(preds).map(([id, val]) => ({
        match_id: parseInt(id),
        prediction: formatScore(val)
    }));
    await fetch(APPS_SCRIPT_URL, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username, predictions: predictionsArray, targetCol: targetCol })
    });
    return true;
}

function updateSubmitButtonState() {
    if (!matchesData.length) return;
    const filled = Object.keys(predictions).length;
    const total = matchesData.length;
    const submitBtn = document.getElementById('submitBtn');
    if (submitBtn) submitBtn.disabled = !(filled === total && !isAlreadySent);
}

// ========== ПРОВЕРКА ПОДДЕРЖКИ ГОЛОСА ==========
function isSpeechSupported() {
    return !!(window.SpeechRecognition || window.webkitSpeechRecognition);
}

// ========== ПАРСИНГ СЧЁТА ИЗ РЕЧИ ==========
function parseScoreFromSpeech(text) {
    text = text.toLowerCase().trim();
    
    const numberMap = {
        'ноль': '0', 'нуль': '0', 'один': '1', 'два': '2', 'три': '3',
        'четыре': '4', 'пять': '5', 'шесть': '6', 'семь': '7', 'восемь': '8',
        'девять': '9', 'десять': '10'
    };
    
    let result = text;
    for (const [word, digit] of Object.entries(numberMap)) {
        result = result.replace(new RegExp(word, 'g'), digit);
    }
    
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

// ========== МОДАЛЬНОЕ ОКНО ДЛЯ ВВОДА ==========
let activeModalMatchId = null;
let modalResultCell = null;

function openInputModal(matchId, cellElement) {
    if (isAlreadySent) {
        alert('Прогноз уже отправлен.');
        return;
    }
    
    const match = matchesData.find(m => m.id === matchId);
    if (!match) return;
    
    activeModalMatchId = matchId;
    modalResultCell = cellElement;
    
    const overlay = document.createElement('div');
    overlay.id = 'inputModalOverlay';
    overlay.style.cssText = `
        position: fixed; top: 0; left: 0; width: 100%; height: 100%;
        background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center;
        z-index: 9999;
    `;

    overlay.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
            closeModal();
        }
    });
    
    const modal = document.createElement('div');
    modal.style.cssText = `
        background: #fef9e8; border-radius: 12px; padding: 12px 16px; max-width: 260px;
        box-shadow: 0 8px 32px rgba(0,0,0,0.3); width: 90%;
    `;
    
    const speechSupported = isSpeechSupported();
    
    modal.innerHTML = `
        <h3 style="margin-top:0; margin-bottom:8px; color:#1e4620; font-size:1rem;">Введите прогноз на матч</h3>
        <p style="margin:0 0 8px 0; font-size:0.85rem; text-align: center;"><strong>${match.team1} – ${match.team2}</strong></p>

	<div style="display:flex; align-items:center; gap:0; justify-content:center;">
	    <input type="text" id="modalScoreInput" placeholder="х:х" style="
        	padding: 2px 4px; font-size: 0.85rem; border: 2px solid #cddba8;
	        border-radius: 8px; text-align: center; font-family: monospace; width: 80px;
	    ">
	    ${speechSupported ? `
	    <button id="modalVoiceBtn" style="background: none; border: none; font-size: 1.2rem; cursor: pointer;
	        padding: 0 2px;" title="Ввести голосом">🎙️</button>
	    ` : ''}
	</div>

	<div style="display:flex; gap:8px; margin-top:12px; justify-content:center;">
	    <button id="modalSendBtn" style="
        	background: #2c7840; color: white; border: none; border-radius: 20px;
	        padding: 4px 16px; font-size: 0.8rem; cursor: pointer;
	    ">Сохранить</button>
	    <button id="modalCancelBtn" style="
        	background: #ccc; color: #333; border: none; border-radius: 20px;
	        padding: 4px 16px; font-size: 0.8rem; cursor: pointer;
	    ">Отмена</button>
	</div>
    `;    

    overlay.appendChild(modal);
    document.body.appendChild(overlay);
    
    const input = modal.querySelector('#modalScoreInput');
    // Если в ячейке уже есть счет - показываем его в поле
    const currentScore = predictions[matchId] ? formatScore(predictions[matchId]) : '';
    if (currentScore) {
        input.value = currentScore;
    }
    input.focus();
    input.select(); // выделяет текст для быстрого перезаписывания
    
    const voiceBtn = modal.querySelector('#modalVoiceBtn');
    if (voiceBtn) {
        voiceBtn.onclick = function() {
            startVoiceRecognitionInModal(matchId, input);
        };
    }
    
    modal.querySelector('#modalSendBtn').onclick = function() {
        const score = input.value.trim();
        if (score === '') {
            // Если поле пустое - удаляем прогноз
            delete predictions[matchId];
            savePredictionsToStorage();
            // Обновляем ячейку
            if (modalResultCell) {
                const span = modalResultCell.querySelector('span');
                if (span) {
                    span.textContent = '-';
                    span.classList.remove('score-input-filled');
                    span.classList.add('score-input-empty');
                }
            }
            updateSubmitButtonState();
            showStatus(`✅ Очищено (${Object.keys(predictions).length}/${matchesData.length})`);
            closeModal();
            return;
        }
    
        if (/^\d+\s*[:–\-]\s*\d+$/.test(score)) {
            const formattedScore = score.replace(/[–\-]/g, ':');
            savePrediction(matchId, formattedScore);
            closeModal();
        } else {
	    /* console.log('Enter нажат'); */
            /* showNotification('Пожалуйста, введите счёт в формате "х:х" или "х-х"', true); */
	    input.style.borderColor = 'red';
	    setTimeout(() => {
	        input.style.borderColor = '#cddba8';
        	input.focus(); // Возвращаем фокус в поле
	    }, 800);
        }
    };
    
    modal.querySelector('#modalCancelBtn').onclick = closeModal;
    
    overlay.onclick = function(e) {
        if (e.target === overlay) closeModal();
    };
    
    input.onkeydown = function(e) {
        if (e.key === 'Enter') {
	    e.preventDefault();
            const sendBtn = modal.querySelector('#modalSendBtn');
	    sendBtn.focus(); // Переносим фокус на кнопку
            sendBtn.click();
        }
    };
    
    function closeModal() {
        if (overlay.parentNode) overlay.remove();
        activeModalMatchId = null;
        modalResultCell = null;
    }
}

// ========== ГОЛОС В МОДАЛЬНОМ ОКНЕ ==========
function startVoiceRecognitionInModal(matchId, inputElement) {
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

    // Авто-отмена через 5 секунд
    const timeoutId = setTimeout(function() {
        if (!isScoreRecognized) {
            recognition.stop();
            inputElement.style.borderColor = '#cddba8';
            inputElement.placeholder = 'х:х';
            inputElement.readOnly = false;
            /* alert('Время ожидания истекло. Попробуйте ещё раз.'); */
        }
    }, 5000); // 5000 = 5 секунд
    
    let isScoreRecognized = false;
    
    recognition.onresult = function(event) {
	clearTimeout(timeoutId); 
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
            /* alert('Не удалось распознать счёт. Попробуйте ещё раз.'); */
            inputElement.style.borderColor = '#cddba8';
            inputElement.placeholder = 'х:х';
            inputElement.readOnly = false;
        }
    };
    
    recognition.onerror = function() {
	clearTimeout(timeoutId); 
        if (isScoreRecognized) return;
        inputElement.style.borderColor = '#cddba8';
        inputElement.placeholder = 'х:х';
        inputElement.readOnly = false;
        /* alert('Ошибка распознавания. Попробуйте ещё раз.'); */
    };
    
    recognition.onend = function() {
	clearTimeout(timeoutId); 
        if (isScoreRecognized) return;
        inputElement.style.borderColor = '#cddba8';
        inputElement.placeholder = 'х:х';
        inputElement.readOnly = false;
    };
}

// ========== СОХРАНЕНИЕ ПРОГНОЗА ==========
function savePrediction(matchId, score) {
    predictions[matchId] = score;

    savePredictionsToStorage();    

    // Обновляем ячейку в таблице
    if (modalResultCell) {
	// Ищем span внутри td
        const span = modalResultCell.querySelector('span');
        if (span) {
	    span.textContent = score;
	    span.classList.remove('score-input-empty');
	    span.classList.add('score-input-filled');
        } else {
            modalResultCell.textContent = score;
        }
    }
    
    updateSubmitButtonState();
    showStatus(`✅ Заполнено (${Object.keys(predictions).length}/${matchesData.length})`);
}

// ========== ОТРИСОВКА ТАБЛИЦЫ ==========
function renderTable() {
    const w = document.getElementById('table-wrapper');
    if (!w || !matchesData.length) return;

    w.innerHTML = '';
    const t = document.createElement('table');
    t.classList.add('fill-table');
    const thead = t.createTHead();
    const thr = thead.insertRow();
    
    const headers = ['№', 'Дата', 'Время', 'Группа', getColumnHeader('home'), '', getColumnHeader('away'), 'Прогноз'];
    headers.forEach(txt => { 
        let th = document.createElement('th'); 
        th.innerHTML = txt; 
        thr.appendChild(th); 
    });
    
    const tbody = t.appendChild(document.createElement('tbody'));
    let lastBgColor = 'transparent';
    
    for (let i = 0; i < matchesData.length; i++) {
        const m = matchesData[i];
        const tr = tbody.insertRow();
        
        let bgColor = 'transparent';
        if (i === 0) {
            bgColor = 'transparent';
        } else if (m.date !== matchesData[i-1].date) {
            bgColor = lastBgColor === 'transparent' ? '#f0f0e8' : 'transparent';
            lastBgColor = bgColor;
        } else {
            bgColor = lastBgColor;
        }
        tr.style.backgroundColor = bgColor;
        
        tr.insertCell().textContent = m.id;
        tr.insertCell().textContent = m.date;
        tr.insertCell().textContent = m.time;
        let g = tr.insertCell(); g.innerHTML = `<span class="group-badge">${m.group}</span>`;
        tr.insertCell().innerHTML = formatTeamWithFlagAndRank(m.team1, 'home');
        tr.insertCell().textContent = '–';
        tr.insertCell().innerHTML = formatTeamWithFlagAndRank(m.team2, 'away');
        

	const td = tr.insertCell();
	td.style.position = 'relative';
	td.style.textAlign = 'center';
	td.style.padding = '4px 2px';

	const span = document.createElement('span');
	span.className = 'score-input';
	span.style.display = 'inline-block';
	span.style.cursor = 'pointer';
	// Вместо inline-стилей используем классы
	if (predictions[m.id]) {
	    span.classList.add('score-input-filled');
	} else {
	    span.classList.add('score-input-empty');
	}

	const predictionText = predictions[m.id] ? formatScore(predictions[m.id]) : '-';
	span.textContent = predictionText;

	span.onclick = function() {
	    openInputModal(m.id, td);
	};

	td.appendChild(span);
	tr.appendChild(td);

    }
    w.innerHTML = '';
    w.appendChild(t);
}

function showStatus(msg, isErr = false) {
    let s = document.getElementById('statusMsg');
    s.innerHTML = msg;
    s.className = 'status-msg' + (isErr ? ' error' : '');
}

function fillRandom() {
    if (isAlreadySent) return;
    const now = new Date();
    const isDeadlinePassed = firstMatchDeadline ? (now >= firstMatchDeadline) : false;
    for (const m of matchesData) if (!predictions[m.id]) { predictions[m.id] = randomScore(); }
    renderTable();
    updateSubmitButtonState();
    showStatus(`✅ Заполнено!`);
}

function resetAll() {
    if (confirm('Очистить все прогнозы?')) { 
	predictions = {}; 
	localStorage.removeItem('fillPredictions');
	renderTable(); 
	updateSubmitButtonState(); 
	showStatus(`✅ Очищено!`); 
    }
}

async function submitAll() {
    const now = new Date();
    const isDeadlinePassed = firstMatchDeadline ? (now >= firstMatchDeadline) : false;
    if (isDeadlinePassed) {
        alert('❌ Приём прогнозов завершён. Первый матч уже начался.');
        return;
    }

    let rawName = document.getElementById('username').value.trim();
    if (!rawName) { alert('❌ Введите имя в формате "Имя Ф." (например, "Евпатий К.")'); return; }
    
    if (!isValidNameFormat(rawName)) {
        alert('❌ Неверный формат имени. Используйте формат "Имя Ф." (например, "Евпатий К.")');
        return;
    }
    
    const username = formatUsername(rawName);
    document.getElementById('username').value = username;
    
    if (isAlreadySent) { alert('❌ Прогноз уже отправлен'); return; }
    if (Object.keys(predictions).length !== matchesData.length) { alert(`⚠️ Заполнено ${Object.keys(predictions).length} из ${matchesData.length}`); return; }
    
    const nameExists = await checkUsernameExists(username);
    if (nameExists) {
        alert(`❌ Имя "${username}" уже используется. Пожалуйста, добавьте еще одну букву фамилии, чтобы имя стало уникальным.`);
        return;
    }
    
    const progressContainer = document.getElementById('writingProgressContainer');
    const progressFill = document.getElementById('writingProgressFill');
    const progressText = document.getElementById('writingProgressText');
    progressContainer.style.display = 'block';
    progressFill.style.width = '30%';
    progressText.innerHTML = `⏳ Поиск колонки...`;
    
    try {
        const targetCol = await findTargetColumn();
        if (!targetCol) throw new Error('Не найдена колонка для прогнозов');
        progressFill.style.width = '60%';
        progressText.innerHTML = `⏳ Отправка...`;
        await sendPredictions(username, predictions, targetCol);
        progressFill.style.width = '100%';
        progressText.innerHTML = `✅ Отправлено!`;
        await new Promise(resolve => setTimeout(resolve, 500));
        progressContainer.style.display = 'none';
        isAlreadySent = true;
        document.getElementById('sentBadge').style.display = 'inline-flex';
        document.getElementById('submitBtn').disabled = true;
        showStatus(`✅ Отправлено!`);
        alert(`✅ Отправлено! Имя: ${username}`);
	
	localStorage.removeItem('fillPredictions');
        renderTable();
    } catch(e) {
        progressContainer.style.display = 'none';
        showStatus(`❌ Ошибка: ${e.message}`, true);
        alert(`❌ Ошибка: ${e.message}`);
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    await loadTournamentParams();
    
    firstMatchDeadline = getFirstMatchDeadline();
    /* console.log(`🎯 Дедлайн первого матча: ${firstMatchDeadline ? formatDateTime(firstMatchDeadline) : 'не определён'}`); */
    
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
    
    await loadTeamsData();
    
    if (!await loadMatches()) return;
    
    predictions = loadPredictionsFromStorage();
    document.getElementById('username').value = '';
    isAlreadySent = false;
    document.getElementById('sentBadge').style.display = 'none';
    renderTable();
    updateSubmitButtonState();
    document.getElementById('resetBtn').onclick = resetAll;
    document.getElementById('randomBtn').onclick = fillRandom;
    document.getElementById('submitBtn').onclick = submitAll;
    
    const now = new Date();
    if (firstMatchDeadline && now >= firstMatchDeadline) {
        const submitBtn = document.getElementById('submitBtn');
        if (submitBtn) submitBtn.disabled = true;
    }
});