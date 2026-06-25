// APPS_SCRIPT_URL определён в config.js

let allMatchesData = [];
let participantsData = [];
let tournamentParams = {};
let teamsData = {};
let totalMatches = 0;
let lastPlayedMatchIndex = -1;

// ========== ЗАГРУЗКА ДАННЫХ ==========
async function loadAllData() {
    try {
        const response = await fetch(`${APPS_SCRIPT_URL}?action=all`);
        if (!response.ok) throw new Error('Ошибка загрузки данных');
        const data = await response.json();
        
        // Проверяем, что данные пришли
        if (!data || !data.params || !data.headers || !data.rows) {
            throw new Error('Неполные данные');
        }
        
        // 1. ПАРАМЕТРЫ
        tournamentParams = data.params;
        
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
            } else if (path.includes('stat.html')) {
                linkParam = tournamentParams.ссылка_подзаголовка_stat;
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
            document.title = `ЧМ-${tournamentParams.турнир_год} · Статистика`;
        }
        
        // 2. ДАННЫЕ О СБОРНЫХ
        if (data.teams) {
            teamsData = data.teams;
        }
        
        // 3. МАТЧИ И ПРОГНОЗЫ
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
        })).sort((a, b) => a.id - b.id);

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

        totalMatches = allMatchesData.length;
        
        // ===== ВЫЧИСЛЯЕМ ПОСЛЕДНИЙ СЫГРАННЫЙ МАТЧ (СЧЕТА МАТЧЕЙ НЕ ДОЛЖНЫ ВВОДИТЬСЯ ОРГАНИЗАТОРОМ С ПРОПУСКАМИ МАТЧЕЙ) =====
        lastPlayedMatchIndex = -1;
        for (let i = 0; i < allMatchesData.length; i++) {
            if (allMatchesData[i].result && allMatchesData[i].result !== '—') {
                lastPlayedMatchIndex = i;
            } else {
                break;
            }
        }
        
        return true;
        
    } catch (err) {
        console.error('Ошибка загрузки:', err);
        return false;
    }
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

function getStandingsAfterMatches(upToMatchIndex) {
    if (upToMatchIndex < 0) {
        return participantsData.map(p => ({
            name: p.name,
            prediction: '—',
            matchError: '—',
            totalSum: 0,
            rank: '—',
            rankValue: 0
        }));
    }
    
    const participantStats = [];
    for (let p of participantsData) {
        let prediction = '—';
        let matchError = null;
        let totalSum = 0;

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

        participantStats.push({
            name: p.name,
            prediction: prediction,
            matchError: matchError !== null ? matchError : '—',
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
        matchError: s.matchError,
        totalSum: s.totalSum,
        rank: rankMap.get(s.name).rank,
        rankValue: parseRankValue(rankMap.get(s.name).rank)
    }));
}

function parseRankValue(rankStr) {
    if (!rankStr || rankStr === '—') return 0;
    if (rankStr.includes('-')) {
        const parts = rankStr.split('-');
        return (parseInt(parts[0]) + parseInt(parts[1])) / 2;
    }
    return parseInt(rankStr);
}

function getMinRankValue(rankStr) {
    if (!rankStr || rankStr === '—') return 0;
    if (rankStr.includes('-')) {
        return parseInt(rankStr.split('-')[0]);
    }
    return parseInt(rankStr);
}

function getMaxRankValue(rankStr) {
    if (!rankStr || rankStr === '—') return 0;
    if (rankStr.includes('-')) {
        return parseInt(rankStr.split('-')[1]);
    }
    return parseInt(rankStr);
}

function getRankPosition(rankStr) {
    if (!rankStr || rankStr === '—') return { min: 0, max: 0 };
    if (rankStr.includes('-')) {
        const parts = rankStr.split('-');
        return { min: parseInt(parts[0]), max: parseInt(parts[1]) };
    }
    return { min: parseInt(rankStr), max: parseInt(rankStr) };
}

function getFlagUrl(teamName) {
    if (!teamName) return '';
    const team = teamsData[teamName];
    if (team && team.flagCode) {
        return `images/flags/${team.flagCode}.png`;
    }
    return '';
}

function formatTeamWithFlag(teamName) {
    const flagUrl = getFlagUrl(teamName);
    const flagHtml = flagUrl ? `<img src="${flagUrl}" style="width:20px;height:15px;vertical-align:middle;margin-right:4px;">` : '';
    return `${flagHtml}${teamName}`;
}

function formatMatchWithFlagsAndScore(match) {
    const flag1 = getFlagUrl(match.team1);
    const flag2 = getFlagUrl(match.team2);
    const flagHtml1 = flag1 ? `<img src="${flag1}" style="width:20px;height:15px;vertical-align:middle;margin-left:4px;">` : '';
    const flagHtml2 = flag2 ? `<img src="${flag2}" style="width:20px;height:15px;vertical-align:middle;margin-right:4px;">` : '';
    const score = match.result && match.result !== '—' ? ` (${match.result})` : '';
    return `${match.team1}${flagHtml1} – ${flagHtml2}${match.team2}${score}`;
}

// ========== РАСЧЕТ СТАТИСТИКИ ==========
function calculateStatistics() {
    if (lastPlayedMatchIndex < 0) {
        return { matches: {}, participants: {} };
    }

    // ===== КЕШИРОВАНИЕ ТАБЛИЦ =====
    // Один раз вычисляем таблицу после каждого матча
    const cachedStandings = {};
    for (let i = 0; i <= lastPlayedMatchIndex; i++) {
        cachedStandings[i] = getStandingsAfterMatches(i);
    }

    const stats = {
        matches: {},
        participants: {}
    };

    // ===== Вкладка "Матчи" =====
    let minTotalError = Infinity;
    let minErrorMatches = [];
    let maxTotalError = -Infinity;
    let maxErrorMatches = [];
    let teamErrors = {};

    for (let matchIndex = 0; matchIndex <= lastPlayedMatchIndex; matchIndex++) {
        const match = allMatchesData[matchIndex];
        let totalError = 0;
        let validPredictions = 0;

        // Сумма результатов участников с бонусами
        for (const p of participantsData) {
            const pred = p.predictions[matchIndex];
            if (pred && pred !== '—') {
                const matchRes = calculateMatchResult(match.result, pred);
                if (matchRes !== null) {
                    totalError += matchRes;
                    validPredictions++;
                }
            }
        }

        if (validPredictions > 0) {
            if (totalError < minTotalError) {
                minTotalError = totalError;
                minErrorMatches = [{ match: match, totalError: totalError }];
            } else if (totalError === minTotalError) {
                minErrorMatches.push({ match: match, totalError: totalError });
            }

            if (totalError > maxTotalError) {
                maxTotalError = totalError;
                maxErrorMatches = [{ match: match, totalError: totalError }];
            } else if (totalError === maxTotalError) {
                maxErrorMatches.push({ match: match, totalError: totalError });
            }

            // Для команд - только ошибки по голам (без бонусов)
            const actual1 = parseScoreToArray(match.result)[0];
            const actual2 = parseScoreToArray(match.result)[1];

            for (const p of participantsData) {
                const pred = p.predictions[matchIndex];
                if (pred && pred !== '—') {
                    const predArray = parseScoreToArray(pred);
                    if (predArray) {
                        const error1 = Math.abs(actual1 - predArray[0]);
                        const error2 = Math.abs(actual2 - predArray[1]);
                        if (!teamErrors[match.team1]) teamErrors[match.team1] = 0;
                        if (!teamErrors[match.team2]) teamErrors[match.team2] = 0;
                        teamErrors[match.team1] += error1;
                        teamErrors[match.team2] += error2;
                    }
                }
            }
        }
    }

    // ===== НОВЫЕ НОМИНАЦИИ: Команды по исходам =====
    let teamOutcomeErrors = {};

    for (let matchIndex = 0; matchIndex <= lastPlayedMatchIndex; matchIndex++) {
        const match = allMatchesData[matchIndex];
    
        // Фактический исход для каждой команды в матче
        const actualScore = parseScoreToArray(match.result);
        if (!actualScore) continue;
    
        const actualOutcome1 = getOutcome(actualScore); // 1 - победа, 0 - ничья, -1 - поражение
        const actualOutcome2 = -actualOutcome1; // для второй команды исход противоположный
    
        for (const p of participantsData) {
            const pred = p.predictions[matchIndex];
            if (pred && pred !== '—') {
                const predArray = parseScoreToArray(pred);
                if (predArray) {
                    const predOutcome1 = getOutcome(predArray);
                    const predOutcome2 = -predOutcome1;
                
                    // Сравниваем исход для первой команды
                    if (!teamOutcomeErrors[match.team1]) teamOutcomeErrors[match.team1] = 0;
                    if (actualOutcome1 !== predOutcome1) {
                        teamOutcomeErrors[match.team1] += 1;
                    }
                
                    // Сравниваем исход для второй команды
                    if (!teamOutcomeErrors[match.team2]) teamOutcomeErrors[match.team2] = 0;
                    if (actualOutcome2 !== predOutcome2) {
                        teamOutcomeErrors[match.team2] += 1;
                    }
                }
            }
        }
    }

    const sortedTeamsOutcome = Object.entries(teamOutcomeErrors).sort((a, b) => a[1] - b[1]);
    if (sortedTeamsOutcome.length > 0) {
        const minTeamOutcomeError = sortedTeamsOutcome[0][1];
        const maxTeamOutcomeError = sortedTeamsOutcome[sortedTeamsOutcome.length - 1][1];
        stats.matches.mostPredictableTeamOutcome = {
            winners: sortedTeamsOutcome.filter(t => t[1] === minTeamOutcomeError).map(t => ({ name: t[0] })),
            value: minTeamOutcomeError
        };
        stats.matches.leastPredictableTeamOutcome = {
            winners: sortedTeamsOutcome.filter(t => t[1] === maxTeamOutcomeError).map(t => ({ name: t[0] })),
            value: maxTeamOutcomeError
        };
    }

    stats.matches.mostPredictable = {
        winners: minErrorMatches,
        value: minTotalError !== Infinity ? minTotalError : null
    };

    stats.matches.leastPredictable = {
        winners: maxErrorMatches,
        value: maxTotalError !== -Infinity ? maxTotalError : null
    };

    const sortedTeams = Object.entries(teamErrors).sort((a, b) => a[1] - b[1]);
    if (sortedTeams.length > 0) {
        const minTeamError = sortedTeams[0][1];
        const maxTeamError = sortedTeams[sortedTeams.length - 1][1];
        stats.matches.mostPredictableTeam = {
            winners: sortedTeams.filter(t => t[1] === minTeamError).map(t => ({ name: t[0] })),
            value: minTeamError
        };
        stats.matches.leastPredictableTeam = {
            winners: sortedTeams.filter(t => t[1] === maxTeamError).map(t => ({ name: t[0] })),
            value: maxTeamError
        };
    }

    // ===== Вкладка "Участники" =====
    const finalStandings = getStandingsAfterMatches(lastPlayedMatchIndex);
    
    // 1. Самый лучший предсказатель (с бонусами)
    let minTotal = Infinity;
    for (const s of finalStandings) {
        if (s.totalSum < minTotal) minTotal = s.totalSum;
    }
    const firstPlace = finalStandings.filter(s => s.totalSum === minTotal);
    stats.participants.bestPredictor = {
        winners: firstPlace.map(s => ({ name: s.name })),
        value: minTotal
    };

    // ===== 2. Самый лучший предсказатель исходов (НОВАЯ) =====
    let outcomeErrors = {};
    for (const p of participantsData) {
        let errors = 0;
        for (let matchIndex = 0; matchIndex <= lastPlayedMatchIndex; matchIndex++) {
            const match = allMatchesData[matchIndex];
            const pred = p.predictions[matchIndex];
            if (pred && pred !== '—') {
                const actualOutcome = getOutcome(parseScoreToArray(match.result));
                const predOutcome = getOutcome(parseScoreToArray(pred));
                if (actualOutcome !== null && predOutcome !== null && actualOutcome !== predOutcome) {
                    errors++;
                }
            }
        }
        outcomeErrors[p.name] = errors;
    }
    
    const minOutcomeErrors = Math.min(...Object.values(outcomeErrors));
    const bestOutcomePredictors = Object.entries(outcomeErrors)
        .filter(([name, errors]) => errors === minOutcomeErrors)
        .map(([name]) => ({ name: name }));
    stats.participants.bestOutcomePredictor = {
        winners: bestOutcomePredictors,
        value: minOutcomeErrors
    };

    // ===== 3. Самый лучший предсказатель счетов (бывшая "Самый частый угадыватель счета") =====
    let exactScoreCounts = {};
    for (const p of participantsData) {
        let count = 0;
        for (let matchIndex = 0; matchIndex <= lastPlayedMatchIndex; matchIndex++) {
            const match = allMatchesData[matchIndex];
            const pred = p.predictions[matchIndex];
            if (pred && pred !== '—') {
                const error = calculateError(match.result, pred);
                if (error === 0) count++;
            }
        }
        if (count > 0) exactScoreCounts[p.name] = count;
    }

    const sortedExact = Object.entries(exactScoreCounts).sort((a, b) => b[1] - a[1]);
    if (sortedExact.length > 0) {
        const maxExact = sortedExact[0][1];
        const bestExact = sortedExact.filter(e => e[1] === maxExact);
        stats.participants.mostExactScore = {
            winners: bestExact.map(e => ({ name: e[0] })),
            value: maxExact
        };
    }

    // 4. Самый уникальный прогноз (с бонусами)
    let uniquePredictions = [];
    for (let matchIndex = 0; matchIndex <= lastPlayedMatchIndex; matchIndex++) {
        const match = allMatchesData[matchIndex];
        const correctPredictions = [];
        
        // Находим всех участников, которые угадали счет
        for (const p of participantsData) {
            const pred = p.predictions[matchIndex];
            if (pred && pred !== '—') {
                const error = calculateError(match.result, pred);
                if (error === 0) {
                    correctPredictions.push(p.name);
                }
            }
        }
        
        // Если ровно один участник угадал счет
        if (correctPredictions.length === 1) {
            const winner = correctPredictions[0];
            let othersTotalError = 0;
            
            // Считаем сумму ошибок (с бонусами) остальных участников
            for (const p of participantsData) {
                if (p.name !== winner) {
                    const pred = p.predictions[matchIndex];
                    if (pred && pred !== '—') {
                        const matchRes = calculateMatchResult(match.result, pred);
                        if (matchRes !== null) {
                            othersTotalError += matchRes;
                        }
                    }
                }
            }
            
            uniquePredictions.push({
                name: winner,
                match: match,
                score: match.result,
                othersTotalError: othersTotalError
            });
        }
    }

    uniquePredictions.sort((a, b) => b.othersTotalError - a.othersTotalError);
    if (uniquePredictions.length > 0) {
        const maxError = uniquePredictions[0].othersTotalError;
        const bestUnique = uniquePredictions.filter(u => u.othersTotalError === maxError);
        stats.participants.mostUniquePrediction = {
            winners: bestUnique.map(u => ({ name: u.name, match: u.match, score: u.score })),
            value: maxError
        };
    }

    // 5. Самый большой диапазон занимаемых мест (с бонусами)
    let rankRanges = {};
    const totalParticipants = participantsData.length;
    const SKIP_MATCHES = 5;

    for (const p of participantsData) {
        let minRank = Infinity;
        let maxRank = -Infinity;
        let hasRealData = false;
        let matchCount = 0;
    
        for (let matchIndex = 0; matchIndex <= lastPlayedMatchIndex; matchIndex++) {
            matchCount++;
            if (matchCount <= SKIP_MATCHES) continue;
        
            const standings = cachedStandings[matchIndex];
            const s = standings.find(s => s.name === p.name);
            if (s && s.rank && s.rank !== '—') {
                const { min, max } = getRankPosition(s.rank);
                if (min === 1 && max === totalParticipants) continue;
                hasRealData = true;
                if (min < minRank) minRank = min;
                if (max > maxRank) maxRank = max;
            }
        }
    
        if (hasRealData && minRank !== Infinity && maxRank !== -Infinity) {
            rankRanges[p.name] = { min: minRank, max: maxRank, diff: maxRank - minRank };
        }
    }

    const sortedRanges = Object.entries(rankRanges).sort((a, b) => b[1].diff - a[1].diff);
    if (sortedRanges.length > 0) {
        const maxDiff = sortedRanges[0][1].diff;
        const bestRanges = sortedRanges.filter(r => r[1].diff === maxDiff);
        stats.participants.biggestRankRange = {
            winners: bestRanges.map(r => ({ name: r[0], min: r[1].min, max: r[1].max })),
            value: maxDiff
        };
    }

    // 6. Самый маленький диапазон занимаемых мест (первые 5 матчей не учитываются)
    let minRankRanges = {};
    const totalParticipantsMin = participantsData.length;
    const SKIP_MATCHES_MIN = 5;

    for (const p of participantsData) {
        let minRank = Infinity;
        let maxRank = -Infinity;
        let hasRealData = false;
        let matchCount = 0;

        for (let matchIndex = 0; matchIndex <= lastPlayedMatchIndex; matchIndex++) {
            matchCount++;
            if (matchCount <= SKIP_MATCHES_MIN) continue;

            const standings = cachedStandings[matchIndex];
            const s = standings.find(s => s.name === p.name);
            if (s && s.rank && s.rank !== '—') {
                const { min, max } = getRankPosition(s.rank);
                if (min === 1 && max === totalParticipantsMin) continue;
                hasRealData = true;
                if (min < minRank) minRank = min;
                if (max > maxRank) maxRank = max;
            }
        }

        if (hasRealData && minRank !== Infinity && maxRank !== -Infinity) {
            minRankRanges[p.name] = { min: minRank, max: maxRank, diff: maxRank - minRank };
        }
    }

    // Находим минимальный диапазон
    const sortedMinRanges = Object.entries(minRankRanges).sort((a, b) => a[1].diff - b[1].diff);
    if (sortedMinRanges.length > 0) {
        const minDiff = sortedMinRanges[0][1].diff;
        const bestMinRanges = sortedMinRanges.filter(r => r[1].diff === minDiff);
        stats.participants.smallestRankRange = {
            winners: bestMinRanges.map(r => ({ name: r[0], min: r[1].min, max: r[1].max })),
            value: minDiff
        };
    }

    // 7. Самый впечатляющий рывок (с бонусами)
    let bestComebacks = [];
    for (const p of participantsData) {
        let prevRank = null;
        for (let matchIndex = 0; matchIndex <= lastPlayedMatchIndex; matchIndex++) {
            const standings = cachedStandings[matchIndex];
            const s = standings.find(s => s.name === p.name);
            if (s && s.rank && s.rank !== '—') {
                const currentRank = getMinRankValue(s.rank);
                if (prevRank !== null && currentRank < prevRank) {
                    const improvement = prevRank - currentRank;
                    if (improvement > 0) {
                        bestComebacks.push({
                            name: p.name,
                            match: allMatchesData[matchIndex],
                            from: prevRank,
                            to: currentRank,
                            improvement: improvement
                        });
                    }
                }
                prevRank = currentRank;
            }
        }
    }

    bestComebacks.sort((a, b) => b.improvement - a.improvement);
    if (bestComebacks.length > 0) {
        const maxImprovement = bestComebacks[0].improvement;
        const bestComeback = bestComebacks.filter(c => c.improvement === maxImprovement);
        stats.participants.bestComeback = {
            winners: bestComeback.map(c => ({ name: c.name, match: c.match, from: c.from, to: c.to })),
            value: maxImprovement
        };
    }

    // 8. Самое частое пребывание на первом месте (считаем общее количество матчей на первом месте)
    let firstPlaceCounts = {};
    for (const p of participantsData) {
        let count = 0;
        for (let matchIndex = 0; matchIndex <= lastPlayedMatchIndex; matchIndex++) {
            const standings = cachedStandings[matchIndex];
            const s = standings.find(s => s.name === p.name);
            if (s && s.rank && s.rank !== '—' && getMinRankValue(s.rank) === 1) {
                count++;
            }
        }
        if (count > 0) firstPlaceCounts[p.name] = count;
    }

    const sortedCounts = Object.entries(firstPlaceCounts).sort((a, b) => b[1] - a[1]);
    if (sortedCounts.length > 0) {
        const maxCount = sortedCounts[0][1];
        const bestCount = sortedCounts.filter(s => s[1] === maxCount);
        stats.participants.mostFrequentFirstPlace = {
            winners: bestCount.map(s => ({ name: s[0] })),
            value: maxCount
        };
    }

    // 9. Самое долгое пребывание на первом месте (с бонусами)
    let firstPlaceStreaks = {};
    for (const p of participantsData) {
        let streak = 0;
        let maxStreak = 0;
        for (let matchIndex = 0; matchIndex <= lastPlayedMatchIndex; matchIndex++) {
            const standings = cachedStandings[matchIndex];
            const s = standings.find(s => s.name === p.name);
            if (s && s.rank && s.rank !== '—' && getMinRankValue(s.rank) === 1) {
                streak++;
                if (streak > maxStreak) maxStreak = streak;
            } else {
                streak = 0;
            }
        }
        if (maxStreak > 0) firstPlaceStreaks[p.name] = maxStreak;
    }

    const sortedStreaks = Object.entries(firstPlaceStreaks).sort((a, b) => b[1] - a[1]);
    if (sortedStreaks.length > 0) {
        const maxStreak = sortedStreaks[0][1];
        const bestStreak = sortedStreaks.filter(s => s[1] === maxStreak);
        stats.participants.longestFirstPlace = {
            winners: bestStreak.map(s => ({ name: s[0] })),
            value: maxStreak
        };
    }

    return stats;
}

// ========== ОТРИСОВКА СТАТИСТИКИ ==========
function renderStats(stats) {
    const subtitle = document.getElementById('statSubtitle');
    const playedMatchesCount = lastPlayedMatchIndex + 1;
    const totalMatchesCount = allMatchesData.length;
    
    if (playedMatchesCount === totalMatchesCount) {
        subtitle.innerHTML = `Номинации "самый-самый" по итогам турнира (${totalMatchesCount} матчей):`;
    } else {
        subtitle.innerHTML = `Номинации "самый-самый" по ходу турнира (${playedMatchesCount} из ${totalMatchesCount} матчей):`;
    }

    // Вкладка "Матчи"
    const matchesContainer = document.getElementById('matchesStats');
    if (stats.matches) {
        let html = '';

        if (stats.matches.mostPredictable && stats.matches.mostPredictable.winners.length > 0) {
            const m = stats.matches.mostPredictable;
            html += `
                <div class="stat-nomination">
                    <h3>Самый предсказуемый матч</h3>
                    <div class="explanation">(матч с минимальной суммой ошибок участников)</div>
                    <div class="winners" style="padding-left: 20px;"><strong>${m.winners.map(w => `<span style="background: #ffffff; padding: 2px 8px; border-radius: 4px; font-weight: normal;">${w.match.id}. ${formatMatchWithFlagsAndScore(w.match)}</span>`).join(', ')}</strong></div>
                    <div class="value" style="padding-left: 20px;">Сумма ошибок: <strong>${m.value}</strong></div>
                </div>
            `;
        }

        if (stats.matches.leastPredictable && stats.matches.leastPredictable.winners.length > 0) {
            const m = stats.matches.leastPredictable;
            html += `
                <div class="stat-nomination">
                    <h3>Самый непредсказуемый матч</h3>
                    <div class="explanation">(матч с максимальной суммой ошибок участников)</div>
                    <div class="winners" style="padding-left: 20px;"><strong>${m.winners.map(w => `<span style="background: #ffffff; padding: 2px 8px; border-radius: 4px; font-weight: normal;">${w.match.id}. ${formatMatchWithFlagsAndScore(w.match)}</span>`).join(', ')}</strong></div>
                    <div class="value" style="padding-left: 20px;">Сумма ошибок: <strong>${m.value}</strong></div>
                </div>
            `;
        }

        if (stats.matches.mostPredictableTeam && stats.matches.mostPredictableTeam.winners.length > 0) {
            const m = stats.matches.mostPredictableTeam;
            html += `
                <div class="stat-nomination">
                    <h3>Самая предсказуемая команда (по голам)</h3>
                    <div class="explanation">(команда с минимальной суммой ошибок голов)</div>
                    <div class="winners" style="padding-left: 20px;"><strong>${m.winners.map(w => formatTeamWithFlag(w.name)).join(', ')}</strong></div>
                    <div class="value" style="padding-left: 20px;">Сумма ошибок: <strong>${m.value}</strong></div>
                </div>
            `;
        }

        if (stats.matches.leastPredictableTeam && stats.matches.leastPredictableTeam.winners.length > 0) {
            const m = stats.matches.leastPredictableTeam;
            html += `
                <div class="stat-nomination">
                    <h3>Самая непредсказуемая команда (по голам)</h3>
                    <div class="explanation">(команда с максимальной суммой ошибок голов)</div>
                    <div class="winners" style="padding-left: 20px;"><strong>${m.winners.map(w => formatTeamWithFlag(w.name)).join(', ')}</strong></div>
                    <div class="value" style="padding-left: 20px;">Сумма ошибок: <strong>${m.value}</strong></div>
                </div>
            `;
        }

	if (stats.matches.mostPredictableTeamOutcome && stats.matches.mostPredictableTeamOutcome.winners.length > 0) {
	    const m = stats.matches.mostPredictableTeamOutcome;
	    html += `
        	<div class="stat-nomination">
	            <h3>Самая предсказуемая команда (по исходам)</h3>
        	    <div class="explanation">(команда с минимальной суммой ошибок исходов)</div>
	            <div class="winners" style="padding-left: 20px;"><strong>${m.winners.map(w => formatTeamWithFlag(w.name)).join(', ')}</strong></div>
        	    <div class="value" style="padding-left: 20px;">Сумма ошибок исходов: <strong>${m.value}</strong></div>
	        </div>
	    `;
	}

	if (stats.matches.leastPredictableTeamOutcome && stats.matches.leastPredictableTeamOutcome.winners.length > 0) {
	    const m = stats.matches.leastPredictableTeamOutcome;
	    html += `
        	<div class="stat-nomination">
	            <h3>Самая непредсказуемая команда (по исходам)</h3>
        	    <div class="explanation">(команда с максимальной суммой ошибок исходов)</div>
	            <div class="winners" style="padding-left: 20px;"><strong>${m.winners.map(w => formatTeamWithFlag(w.name)).join(', ')}</strong></div>
        	    <div class="value" style="padding-left: 20px;">Сумма ошибок исходов: <strong>${m.value}</strong></div>
	        </div>
	    `;
	}

        if (!html) {
            html = `<div class="stat-nomination-empty">Нет данных для отображения номинаций</div>`;
        }
        matchesContainer.innerHTML = html;
    }

    // Вкладка "Участники"
    const participantsContainer = document.getElementById('participantsStats');
    if (stats.participants) {
        let html = '';

        // 1. Самый лучший предсказатель (с бонусами)
        if (stats.participants.bestPredictor && stats.participants.bestPredictor.winners.length > 0) {
            const m = stats.participants.bestPredictor;
            html += `
                <div class="stat-nomination">
                    <h3>Самый лучший предсказатель</h3>
                    <div class="explanation">(участник с наименьшей суммой ошибок)</div>
                    <div class="winners" style="padding-left: 20px;"><strong>${m.winners.map(w => w.name).join(', ')}</strong></div>
                    <div class="value" style="padding-left: 20px;">Сумма ошибок: <strong>${m.value}</strong></div>
                </div>
            `;
        }

        // 2. Самый лучший предсказатель исходов
        if (stats.participants.bestOutcomePredictor && stats.participants.bestOutcomePredictor.winners.length > 0) {
            const m = stats.participants.bestOutcomePredictor;
            html += `
                <div class="stat-nomination">
                    <h3>Самый лучший предсказатель исходов</h3>
                    <div class="explanation">(участник, который чаще всех угадывал исход матча)</div>
                    <div class="winners" style="padding-left: 20px;"><strong>${m.winners.map(w => w.name).join(', ')}</strong></div>
                    <div class="value" style="padding-left: 20px;">Точных попаданий: <strong>${playedMatchesCount - m.value}</strong></div>
                </div>
            `;
        }

        // 3. Самый лучший предсказатель счетов
        if (stats.participants.mostExactScore && stats.participants.mostExactScore.winners.length > 0) {
            const m = stats.participants.mostExactScore;
            html += `
                <div class="stat-nomination">
                    <h3>Самый лучший предсказатель счетов</h3>
                    <div class="explanation">(участник, который чаще всех угадывал счет матча)</div>
                    <div class="winners" style="padding-left: 20px;"><strong>${m.winners.map(w => w.name).join(', ')}</strong></div>
                    <div class="value" style="padding-left: 20px;">Точных попаданий: <strong>${m.value}</strong></div>
                </div>
            `;
        }

	if (stats.participants.mostUniquePrediction && stats.participants.mostUniquePrediction.winners.length > 0) {
	    const m = stats.participants.mostUniquePrediction;
	    const winnerNames = m.winners.map(w => `<strong>${w.name}</strong>`).join(', ');
	    const matchDetails = m.winners.map(w => 
        	`<span style="background: #ffffff; padding: 2px 8px; border-radius: 4px; font-weight: normal;">${w.match.id}. ${formatMatchWithFlagsAndScore(w.match)}</span>`
	    ).join(', ');
	    html += `
        	<div class="stat-nomination">
	            <h3>Самый уникальный прогноз</h3>
        	    <div class="explanation">(единственный участник, угадавший счет в матче, при максимальной сумме ошибок остальных)</div>
	            <div class="winners" style="padding-left: 20px;">${winnerNames}</div>
        	    <div class="winners" style="padding-left: 20px; font-weight: normal;">${matchDetails}</div>
	            <div class="value" style="padding-left: 20px;">Сумма ошибок остальных: <strong>${m.value}</strong></div>
        	</div>
	    `;
	}

	if (stats.participants.biggestRankRange && stats.participants.biggestRankRange.winners.length > 0) {
	    const m = stats.participants.biggestRankRange;
	    const winnersHtml = m.winners.map(w => `
        	<div style="margin-bottom: 4px;">
	            <strong>${w.name}</strong><br>
        	    самое высокое - ${w.min}<br>
	            самое низкое - ${w.max}
        	</div>
	    `).join('');
	    html += `
        	<div class="stat-nomination">
	            <h3>Самый большой диапазон занимаемых мест</h3>
        	    <div class="explanation">(участник, который занимал максимально далекие места, первые 5 матчей не учитываются)</div>
	            <div class="winners" style="padding-left: 20px;">${winnersHtml}</div>
        	    <div class="value" style="padding-left: 20px;">Диапазон: <strong>${m.value} мест</strong></div>
	        </div>
	    `;
	}

	if (stats.participants.smallestRankRange && stats.participants.smallestRankRange.winners.length > 0) {
	    const m = stats.participants.smallestRankRange;
	    const winnersHtml = m.winners.map(w => `
        	<div style="margin-bottom: 4px;">
	            <strong>${w.name}</strong><br>
        	    самое высокое - ${w.min}<br>
	            самое низкое - ${w.max}
        	</div>
	    `).join('');
	    html += `
        	<div class="stat-nomination">
	            <h3>Самый маленький диапазон занимаемых мест</h3>
        	    <div class="explanation">(участник, который занимал минимально далекие места, первые 5 матчей не учитываются)</div>
	            <div class="winners" style="padding-left: 20px;">${winnersHtml}</div>
        	    <div class="value" style="padding-left: 20px;">Диапазон: <strong>${m.value} мест</strong></div>
	        </div>
	    `;
	}

	if (stats.participants.bestComeback && stats.participants.bestComeback.winners.length > 0) {
	    const m = stats.participants.bestComeback;
	    const winnerNames = m.winners.map(w => `<strong>${w.name}</strong>`).join(', ');
	    const matchDetails = m.winners.map(w => 
        	`после матча <span style="background: #ffffff; padding: 2px 8px; border-radius: 4px; font-weight: normal;">${w.match.id}. ${formatMatchWithFlagsAndScore(w.match)}</span>: ${w.from} → ${w.to}`
	    ).join('<br>');
	    html += `
        	<div class="stat-nomination">
	            <h3>Самый впечатляющий рывок</h3>
        	    <div class="explanation">(самый высокий скачок вверх по турнирной таблице)</div>
	            <div class="winners" style="padding-left: 20px;">${winnerNames}</div>
        	    <div class="winners" style="padding-left: 20px; font-weight: normal;">${matchDetails}</div>
	            <div class="value" style="padding-left: 20px;">Скачок: <strong>${m.value} мест</strong></div>
        	</div>
	    `;
	}

        if (stats.participants.mostFrequentFirstPlace && stats.participants.mostFrequentFirstPlace.winners.length > 0) {
            const m = stats.participants.mostFrequentFirstPlace;
            html += `
                <div class="stat-nomination">
                    <h3>Самое частое пребывание на первом месте</h3>
                    <div class="explanation">(участник, чаще всех находившийся на первой позиции)</div>
                    <div class="winners" style="padding-left: 20px;"><strong>${m.winners.map(w => w.name).join(', ')}</strong></div>
                    <div class="value" style="padding-left: 20px;">Матчей: <strong>${m.value}</strong></div>
                </div>
            `;
        }

        if (stats.participants.longestFirstPlace && stats.participants.longestFirstPlace.winners.length > 0) {
            const m = stats.participants.longestFirstPlace;
            html += `
                <div class="stat-nomination">
                    <h3>Самое долгое пребывание на первом месте</h3>
                    <div class="explanation">(участник, дольше всех находившийся на первой позиции подряд)</div>
                    <div class="winners" style="padding-left: 20px;"><strong>${m.winners.map(w => w.name).join(', ')}</strong></div>
                    <div class="value" style="padding-left: 20px;">Матчей подряд: <strong>${m.value}</strong></div>
                </div>
            `;
        }

        if (!html) {
            html = `<div class="stat-nomination-empty">Нет данных для отображения номинаций</div>`;
        }
        participantsContainer.innerHTML = html;
    }
}

// ========== ВКЛАДКИ ==========
function setupTabs() {
    const tabs = document.querySelectorAll('.stat-tab');
    tabs.forEach(tab => {
        tab.addEventListener('click', function() {
            tabs.forEach(t => t.classList.remove('active'));
            this.classList.add('active');

            const tabName = this.dataset.tab;
            document.querySelectorAll('.stat-tab-content').forEach(c => c.classList.remove('active'));
            document.getElementById(`tab-${tabName}`).classList.add('active');
        });
    });
}

// ========== ИНИЦИАЛИЗАЦИЯ ==========
async function init() {
    const success = await loadAllData();
    
    if (!success) {
        document.getElementById('matchesStats').innerHTML = '<div class="loading-overlay" style="color:#a00;">❌ Ошибка загрузки данных</div>';
        document.getElementById('participantsStats').innerHTML = '';
        return;
    }
    
    const stats = calculateStatistics();
    renderStats(stats);
    setupTabs();
}

init();