// APPS_SCRIPT_URL определён в config.js

let matchesData = [];
let predictions = {};
let isAlreadySent = false;
let firstMatchDeadline = null;
let tournamentParams = {};
let teamsData = {};

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
	    logoContainer.innerHTML = `<img src="images/${tournamentParams.логотип_файл}" style="height: 2.4rem; width: auto; vertical-align: middle; margin-right: 1px;">`;
	}

        // Обновляем подзаголовок на странице
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
        console.log('🏆 Данные о сборных загружены');
        return true;
    } catch (err) {
        console.error('Ошибка загрузки сборных:', err);
        return false;
    }
}

// ========== ОПРЕДЕЛЕНИЕ ДЕДЛАЙНА (УНИВЕРСАЛЬНЫЙ ПАРСИНГ) ==========
function getFirstMatchDeadline() {
    if (!tournamentParams.первый_матч_дата || !tournamentParams.первый_матч_время) return null;
    
    let year, month, day, hour, minute;
    
    // Парсим первый_матч_дата
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
        
        console.log(`Загружено матчей: ${matchesData.length}`);
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

// ========== ГОЛОСОВОЙ ВВОД СЧЁТА ==========
function startVoiceRecognition(matchId, inputElement) {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
        return;
    }

     // Активируем микрофонный режим
    inputElement.classList.remove('input-active-keyboard');
    inputElement.classList.add('input-active-microphone');
    
    const recognition = new SpeechRecognition();
    recognition.lang = 'ru-RU';
    recognition.continuous = false;
    recognition.interimResults = false;
    
    inputElement.style.borderColor = 'red';
    inputElement.placeholder = '🎤 Слушаю...';
    
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
            inputElement.placeholder = 'x:x';
            // Убираем микрофонный режим
            inputElement.classList.remove('input-active-microphone');
            inputElement.dispatchEvent(new Event('change'));
        } else {
            alert('Не удалось распознать счёт. Попробуйте ещё раз или введите вручную.');
            inputElement.style.borderColor = '#cddba8';
            inputElement.placeholder = 'x:x';
        }
    };
    
    recognition.onerror = function() {
        if (isScoreRecognized) return;
        inputElement.style.borderColor = '#cddba8';
        inputElement.placeholder = 'x:x';
	inputElement.classList.remove('input-active-microphone');
        alert('Ошибка распознавания. Попробуйте ещё раз или введите вручную.');
    };
    
    recognition.onend = function() {
        if (isScoreRecognized) return;
        inputElement.style.borderColor = '#cddba8';
        inputElement.placeholder = 'x:x';
	inputElement.classList.remove('input-active-microphone');
    };
}

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
        
        const inp = document.createElement('input');
        inp.type = 'text';
        inp.placeholder = 'x:x';
        inp.classList.add('score-input');
        inp.value = predictions[m.id] ? formatScore(predictions[m.id]) : '';
	inp.style.display = 'inline-block';

	// Обработчик для начала ввода с клавиатуры
	inp.addEventListener('focus', function() {
	    this.classList.remove('input-active-microphone');
	    this.classList.add('input-active-keyboard');
	});

	// Обработчик окончания ввода
	inp.addEventListener('blur', function() {
	    this.classList.remove('input-active-keyboard', 'input-active-microphone');
	});
        
        const now = new Date();
        const isDeadlinePassed = firstMatchDeadline ? (now >= firstMatchDeadline) : false;
        // Временно отключаем блокировку для теста
        // if (isAlreadySent || isDeadlinePassed) inp.disabled = true;
        
        const speechSupported = isSpeechSupported();
        if (speechSupported && !isAlreadySent && !isDeadlinePassed) {
            inp.style.paddingRight = '22px';
        }
        
        inp.onchange = (function(id, input) {
            return function() {
                if (isAlreadySent) return;
                const nowCheck = new Date();
                const isDeadlinePassedCheck = firstMatchDeadline ? (nowCheck >= firstMatchDeadline) : false;
                // Временно отключаем проверку для теста
                // if (isDeadlinePassedCheck) {
                //     alert('❌ Дедлайн прошёл, прогнозы больше не принимаются.');
                //     input.disabled = true;
                //     return;
                // }
                let v = input.value.trim();
                if (v === '') {
                    delete predictions[id];
                } else {
                    let parsed = parseScore(v);
                    if (!parsed) {
                        input.style.borderColor = 'red';
                        showStatus('⚠️ Формат 2:1 или 3:0', true);
                        return;
                    }
                    input.style.borderColor = '#cddba8';
                    predictions[id] = formatScore(v);
                }
                updateSubmitButtonState();
                showStatus(`✅ Заполнено  (${Object.keys(predictions).length}/${matchesData.length})`);
            };
        })(m.id, inp);
        
        td.appendChild(inp);
        
	// Иконка слева от поля (без лишних стилей)
	if (speechSupported) {
	    const iconBtn = document.createElement('span');
	    iconBtn.textContent = '🎤 ';
	    iconBtn.style.cssText = 'cursor:pointer; font-size:0.85rem; user-select:none;';
	    iconBtn.title = 'Ввести счёт голосом';
	    iconBtn.onclick = function(e) {
	        e.stopPropagation();
	        if (isAlreadySent) {
	            alert('Прогноз уже отправлен.');
	            return;
	        }
	        startVoiceRecognition(m.id, inp);
	    };
	    // Вставляем ДО поля ввода
	    td.insertBefore(iconBtn, inp);
	}
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
    // Временно отключаем проверку для теста
    // if (isDeadlinePassed) {
    //     alert('❌ Дедлайн прошёл, прогнозы больше нельзя заполнять.');
    //     return;
    // }
    for (const m of matchesData) if (!predictions[m.id]) { predictions[m.id] = randomScore(); }
    renderTable();
    updateSubmitButtonState();
    showStatus(`✅ Заполнено!`);
}

function resetAll() {
    if (confirm('Очистить все прогнозы?')) { predictions = {}; renderTable(); updateSubmitButtonState(); showStatus(`✅ Очищено!`); }
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
    console.log(`🎯 Дедлайн первого матча: ${firstMatchDeadline ? formatDateTime(firstMatchDeadline) : 'не определён'}`);
    
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
    
    predictions = {};
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
        // document.getElementById('username').disabled = true;        // ← Временно отключаем
        // document.getElementById('resetBtn').disabled = true;        // ← Временно отключаем
        // document.getElementById('randomBtn').disabled = true;       // ← Временно отключаем
        const submitBtn = document.getElementById('submitBtn');
        if (submitBtn) submitBtn.disabled = true;
    }
});