from fastapi import APIRouter, HTTPException
from app.database import execute_query
from app.models import User, SpinRequest, ReactionRequest

router = APIRouter()


@router.post("/user")
async def create_or_update_user(user: User):
    """Создаём или обновляем пользователя"""
    query = """
        INSERT INTO users (id, first_name, username, last_seen)
        VALUES (%s, %s, %s, NOW())
        ON CONFLICT (id) DO UPDATE
        SET first_name = EXCLUDED.first_name,
            username = EXCLUDED.username,
            last_seen = NOW()
        RETURNING *
    """
    result = execute_query(query, (user.id, user.first_name, user.username), fetch_one=True)
    return {"success": True, "user": result}


@router.get("/stats/{user_id}")
async def get_stats(user_id: int):
    """Получить статистику игрока"""
    query = """
        SELECT COALESCE(spins, 0) as spins, COALESCE(matches, 0) as matches
        FROM stats
        WHERE user_id = %s
    """
    result = execute_query(query, (user_id,), fetch_one=True)

    if not result:
        # Создаём запись, если её нет
        execute_query(
            "INSERT INTO stats (user_id, spins, matches) VALUES (%s, 0, 0)",
            (user_id,)
        )
        return {"spins": 0, "matches": 0}

    return dict(result)


@router.post("/room/join")
async def join_room(user_id: int, room_name: str = "Комната 1"):
    """Присоединиться к комнате"""
    # Проверяем, есть ли активная комната с таким именем
    room = execute_query(
        "SELECT id FROM rooms WHERE name = %s AND is_active = TRUE",
        (room_name,),
        fetch_one=True
    )

    if not room:
        # Создаём новую комнату
        room = execute_query(
            "INSERT INTO rooms (name) VALUES (%s) RETURNING id",
            (room_name,),
            fetch_one=True
        )

    room_id = room['id']

    # Добавляем участника
    execute_query(
        "INSERT INTO room_participants (room_id, user_id) VALUES (%s, %s) ON CONFLICT DO NOTHING",
        (room_id, user_id)
    )

    return {
        "success": True,
        "room_id": room_id,
        "room_name": room_name
    }


@router.post("/spin")
async def spin_bottle(data: SpinRequest):
    """Крутить бутылочку"""
    user_id = data.user_id
    room_id = data.room_id

    # Получаем всех участников комнаты, кроме текущего
    query = """
        SELECT u.id, u.first_name
        FROM room_participants rp
        JOIN users u ON rp.user_id = u.id
        WHERE rp.room_id = %s AND rp.user_id != %s
    """
    participants = execute_query(query, (room_id, user_id), fetch_all=True)

    if len(participants) < 1:
        raise HTTPException(status_code=400, detail="В комнате мало игроков. Нужно минимум 2.")

    # Случайный выбор
    import random
    target = random.choice(participants)

    # Обновляем счётчик вращений
    execute_query(
        "INSERT INTO stats (user_id, spins, matches) VALUES (%s, 1, 0) ON CONFLICT (user_id) DO UPDATE SET spins = stats.spins + 1",
        (user_id,)
    )

    # Сохраняем историю
    execute_query(
        "INSERT INTO spins_history (room_id, spinner_id, target_id) VALUES (%s, %s, %s)",
        (room_id, user_id, target['id'])
    )

    return {
        "success": True,
        "target_id": target['id'],
        "target_name": target['first_name'],
        "stats": await get_stats(user_id)
    }


@router.post("/react")
async def send_reaction(data: ReactionRequest):
    """Отправить реакцию"""
    from_user = data.from_user_id
    to_user = data.to_user_id
    room_id = data.room_id

    # Сохраняем реакцию
    execute_query(
        "INSERT INTO reactions (room_id, from_user_id, to_user_id, status) VALUES (%s, %s, %s, 'pending')",
        (room_id, from_user, to_user)
    )

    # Проверяем, есть ли встречная реакция
    check_query = """
        SELECT r1.id, r2.id as match_id, u.first_name
        FROM reactions r1
        JOIN reactions r2 ON r2.room_id = r1.room_id 
            AND r2.from_user_id = r1.to_user_id 
            AND r2.to_user_id = r1.from_user_id
        JOIN users u ON u.id = r1.from_user_id
        WHERE r1.from_user_id = %s 
            AND r1.to_user_id = %s 
            AND r1.room_id = %s
            AND r1.status = 'pending'
            AND r2.status = 'pending'
    """
    match = execute_query(check_query, (to_user, from_user, room_id), fetch_one=True)

    if match:
        # МЭТЧ!
        # Обновляем статусы реакций
        execute_query(
            "UPDATE reactions SET status = 'matched', matched_at = NOW() WHERE room_id = %s AND ((from_user_id = %s AND to_user_id = %s) OR (from_user_id = %s AND to_user_id = %s))",
            (room_id, to_user, from_user, from_user, to_user)
        )

        # Увеличиваем счётчики мэтчей у обоих
        execute_query(
            "INSERT INTO stats (user_id, spins, matches) VALUES (%s, 0, 1) ON CONFLICT (user_id) DO UPDATE SET matches = stats.matches + 1",
            (from_user,)
        )
        execute_query(
            "INSERT INTO stats (user_id, spins, matches) VALUES (%s, 0, 1) ON CONFLICT (user_id) DO UPDATE SET matches = stats.matches + 1",
            (to_user,)
        )

        # Получаем имя партнёра
        partner = execute_query(
            "SELECT first_name FROM users WHERE id = %s",
            (to_user,),
            fetch_one=True
        )

        return {
            "match": True,
            "partner_name": partner['first_name'] if partner else None,
            "partner_id": to_user,
            "stats": await get_stats(from_user)
        }
    else:
        return {
            "match": False,
            "stats": await get_stats(from_user)
        }


@router.post("/room/leave")
async def leave_room(user_id: int, room_id: int):
    """Выйти из комнаты"""
    execute_query(
        "DELETE FROM room_participants WHERE user_id = %s AND room_id = %s",
        (user_id, room_id)
    )

    # Проверяем, сколько осталось участников в комнате
    count = execute_query(
        "SELECT COUNT(*) as count FROM room_participants WHERE room_id = %s",
        (room_id,),
        fetch_one=True
    )

    # Если участников нет, удаляем комнату
    if count['count'] == 0:
        execute_query(
            "UPDATE rooms SET is_active = FALSE WHERE id = %s",
            (room_id,)
        )

    return {"success": True}


@router.get("/room/{room_id}/participants")
async def get_participants(room_id: int):
    """Получить всех участников комнаты"""
    query = """
        SELECT u.id, u.first_name, u.username
        FROM room_participants rp
        JOIN users u ON rp.user_id = u.id
        WHERE rp.room_id = %s
    """
    participants = execute_query(query, (room_id,), fetch_all=True)
    return {"participants": participants}