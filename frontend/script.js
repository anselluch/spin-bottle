// Инициализация Telegram Mini App
const tg = window.Telegram.WebApp;
tg.expand(); // Растягиваем на весь экран

// Получаем данные пользователя
const user = tg.initDataUnsafe?.user || { id: 0, first_name: 'Гость' };

console.log('Пользователь:', user);

// DOM элементы
const screens = {
    entry: document.getElementById('entryScreen'),
    game: document.getElementById('gameScreen'),
    match: document.getElementById('matchScreen')
};

// Элементы экрана входа
const joinBtn = document.getElementById('joinBtn');
const roomStatus = document.getElementById('roomStatus');
const roomName = document.getElementById('roomName');
const playBtn = document.getElementById('playBtn');
const shopBtn = document.getElementById('shopBtn');
const totalSpins = document.getElementById('totalSpins');
const totalMatches = document.getElementById('totalMatches');

// Элементы игрового экрана
const spinBtn = document.getElementById('spinBtn');
const bottle = document.getElementById('bottle');
const spinResult = document.getElementById('spinResult');
const resultText = document.getElementById('resultText');
const reactBtn = document.getElementById('reactBtn');
const leaveBtn = document.getElementById('leaveBtn');

// Элементы экрана матча
const matchPartner = document.getElementById('matchPartner');
const openChatBtn = document.getElementById('openChatBtn');
const continueBtn = document.getElementById('continueBtn');

// Состояние игры
const state = {
    roomId: null,
    userId: user.id,
    userName: user.first_name || 'Игрок',
    inRoom: false,
    currentTarget: null,
    reactions: [],
    stats: {
        spins: 0,
        matches: 0
    }
};

// Функции для смены экранов
function showScreen(screenName) {
    Object.keys(screens).forEach(key => {
        screens[key].classList.remove('active');
    });
    screens[screenName].classList.add('active');
}

// Обновление статистики
function updateStats(stats) {
    if (stats) {
        state.stats = stats;
    }
    totalSpins.textContent = state.stats.spins || 0;
    totalMatches.textContent = state.stats.matches || 0;
}

// --- СЦЕНАРИЙ 1: ВХОД ---

// Обработчик кнопки "Присоединиться"
joinBtn.addEventListener('click', async () => {
    // Показываем индикатор загрузки
    joinBtn.textContent = '⏳ Ищем/создаём комнату...';
    joinBtn.disabled = true;

    try {
        // Симуляция запроса к бэкенду
        const response = await joinRoom();

        if (response.success) {
            state.roomId = response.roomId;
            state.inRoom = true;

            // Обновляем UI
            joinBtn.style.display = 'none';
            roomStatus.style.display = 'block';
            roomName.textContent = response.roomName || 'Комната 1';

            // Показываем всплывашку о приватности
            tg.showPopup({
                title: '🔒 Приватность',
                message: 'Твои данные не передаются третьим лицам. Только для игры.',
                buttons: [{ type: 'ok' }]
            });

            // Загружаем статистику
            await loadStats();

            // Показываем правила при первом входе
            const hasSeenRules = localStorage.getItem('hasSeenRules');
            if (!hasSeenRules) {
                setTimeout(() => {
                    showRules();
                }, 1000);
            }
        }
    } catch (error) {
        console.error('Ошибка при входе:', error);
        tg.showPopup({
            title: 'Ошибка',
            message: 'Не удалось подключиться к серверу. Попробуй позже.',
            buttons: [{ type: 'ok' }]
        });
    } finally {
        joinBtn.textContent = 'Присоединиться к комнате';
        joinBtn.disabled = false;
    }
});

// Кнопка "Играть!" (когда уже в комнате)
playBtn.addEventListener('click', () => {
    showScreen('game');
});

// Показ правил
function showRules() {
    tg.showPopup({
        title: '📖 Как играть',
        message: '1. Нажми "Крутить бутылочку"\n2. Бутылка покажет на игрока\n3. Отправь реакцию ❤️\n4. Если реакция взаимная — МЭТЧ!',
        buttons: [{ type: 'ok', text: 'Понял!' }]
    });
    localStorage.setItem('hasSeenRules', 'true');
}

// Магазин
shopBtn.addEventListener('click', () => {
    tg.showPopup({
        title: '🛒 Магазин',
        message: 'Пока тут пусто 😅\nСкоро появятся кастомизации!',
        buttons: [{ type: 'ok' }]
    });
});

// --- СЦЕНАРИЙ 2: ИГРА ---

// Крутим бутылочку
spinBtn.addEventListener('click', async () => {
    if (bottle.classList.contains('spinning')) return;

    spinBtn.disabled = true;
    spinResult.style.display = 'none';

    // Запускаем анимацию
    bottle.classList.add('spinning');

    try {
        // Симуляция запроса к бэкенду
        const result = await spinBottle();

        // Останавливаем анимацию через 3 секунды
        setTimeout(() => {
            bottle.classList.remove('spinning');

            if (result.success) {
                state.currentTarget = result.target;
                resultText.textContent = `🍾 Бутылочка указала на: ${result.targetName}`;
                spinResult.style.display = 'block';
                updateStats(result.stats);
            } else {
                tg.showPopup({
                    title: '❌ Ошибка',
                    message: result.message || 'Что-то пошло не так',
                    buttons: [{ type: 'ok' }]
                });
            }

            spinBtn.disabled = false;
        }, 3000);

    } catch (error) {
        console.error('Ошибка при вращении:', error);
        bottle.classList.remove('spinning');
        spinBtn.disabled = false;
        tg.showPopup({
            title: 'Ошибка',
            message: 'Не удалось покрутить. Попробуй снова.',
            buttons: [{ type: 'ok' }]
        });
    }
});

// Отправить реакцию
reactBtn.addEventListener('click', async () => {
    if (!state.currentTarget) return;

    reactBtn.disabled = true;
    reactBtn.textContent = '⏳ Отправляем...';

    try {
        const result = await sendReaction(state.currentTarget);

        if (result.match) {
            // МЭТЧ!
            matchPartner.textContent = `С кем: ${result.partnerName}`;
            showScreen('match');

            // Обновляем статистику
            updateStats(result.stats);
        } else {
            tg.showPopup({
                title: '💫 Реакция отправлена',
                message: 'Ждём взаимности...',
                buttons: [{ type: 'ok' }]
            });
            spinResult.style.display = 'none';
            updateStats(result.stats);
        }
    } catch (error) {
        console.error('Ошибка при отправке реакции:', error);
        tg.showPopup({
            title: 'Ошибка',
            message: 'Не удалось отправить реакцию',
            buttons: [{ type: 'ok' }]
        });
    } finally {
        reactBtn.disabled = false;
        reactBtn.textContent = '❤️ Отправить реакцию';
    }
});

// --- СЦЕНАРИЙ 4: ВЫХОД ---

// Выйти из комнаты
leaveBtn.addEventListener('click', () => {
    tg.showPopup({
        title: '🚪 Выйти из комнаты?',
        message: 'Ты покинешь игру. Статистика сохранится.',
        buttons: [
            { id: 'leave', type: 'destructive', text: 'Выйти' },
            { id: 'cancel', type: 'cancel', text: 'Отмена' }
        ]
    }, (buttonId) => {
        if (buttonId === 'leave') {
            leaveRoom();
        }
    });
});

async function leaveRoom() {
    try {
        await leaveRoomRequest();
        state.inRoom = false;
        state.roomId = null;

        // Возвращаемся на экран входа
        roomStatus.style.display = 'none';
        joinBtn.style.display = 'block';
        showScreen('entry');

        tg.showPopup({
            title: '👋 Пока!',
            message: 'Ты вышел из комнаты. Возвращайся!',
            buttons: [{ type: 'ok' }]
        });
    } catch (error) {
        console.error('Ошибка при выходе:', error);
    }
}

// --- СЦЕНАРИЙ 3: МЭТЧ И ЧАТ ---

// Открыть чат в Telegram
openChatBtn.addEventListener('click', () => {
    tg.showPopup({
        title: '💬 Открыть чат?',
        message: 'Ты перейдёшь в Telegram-чат с этим человеком',
        buttons: [
            { id: 'open', type: 'default', text: 'Да, открыть' },
            { id: 'cancel', type: 'cancel', text: 'Отмена' }
        ]
    }, async (buttonId) => {
        if (buttonId === 'open') {
            try {
                const chatData = await getChatLink();
                tg.openTelegramLink(`tg://user?id=${chatData.userId}`);

                // Показываем финальный экран
                setTimeout(() => {
                    tg.showPopup({
                        title: '🎉 Мэтч зафиксирован!',
                        message: 'Статистика обновлена. Хочешь сыграть ещё?',
                        buttons: [
                            { id: 'continue', text: 'Продолжить' },
                            { id: 'close', type: 'destructive', text: 'Закрыть' }
                        ]
                    }, (btnId) => {
                        if (btnId === 'continue') {
                            showScreen('game');
                            spinResult.style.display = 'none';
                        } else {
                            tg.close();
                        }
                    });
                }, 1000);
            } catch (error) {
                console.error('Ошибка открытия чата:', error);
            }
        }
    });
});

// Продолжить игру после матча
continueBtn.addEventListener('click', () => {
    showScreen('game');
    spinResult.style.display = 'none';
});

// --- ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ (СИМУЛЯЦИЯ БЭКЕНДА) ---

// 🔥 ВНИМАНИЕ: Это симуляция! Потом заменим на реальные запросы к серверу

async function joinRoom() {
    // Симуляция задержки
    await new Promise(resolve => setTimeout(resolve, 1500));

    return {
        success: true,
        roomId: Math.floor(Math.random() * 1000),
        roomName: `Комната ${Math.floor(Math.random() * 100)}`
    };
}

async function loadStats() {
    // Загружаем статистику пользователя
    await new Promise(resolve => setTimeout(resolve, 500));
    updateStats({
        spins: 3,
        matches: 1
    });
}

async function spinBottle() {
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Проверяем, есть ли другие игроки
    // В симуляции всегда успех
    const names = ['Анна', 'Максим', 'Елена', 'Дмитрий', 'Ольга', 'Алексей', 'Мария', 'Сергей'];
    const targetName = names[Math.floor(Math.random() * names.length)];

    return {
        success: true,
        target: 123456789, // ID другого игрока
        targetName: targetName,
        stats: {
            spins: (state.stats.spins || 0) + 1,
            matches: state.stats.matches || 0
        }
    };
}

async function sendReaction(targetId) {
    await new Promise(resolve => setTimeout(resolve, 1000));

    // 50% шанс на мэтч в симуляции
    const isMatch = Math.random() > 0.5;

    return {
        match: isMatch,
        partnerName: isMatch ? 'Елена' : null,
        stats: {
            spins: state.stats.spins || 0,
            matches: isMatch ? (state.stats.matches || 0) + 1 : state.stats.matches || 0
        }
    };
}

async function leaveRoomRequest() {
    await new Promise(resolve => setTimeout(resolve, 500));
    return { success: true };
}

async function getChatLink() {
    await new Promise(resolve => setTimeout(resolve, 300));
    return { userId: 123456789 }; // ID пользователя из бэкенда
}

// --- ИНИЦИАЛИЗАЦИЯ ---

// Показываем экран входа
showScreen('entry');

// Загружаем статистику (если уже есть)
updateStats();

console.log('🚀 Игра готова!');