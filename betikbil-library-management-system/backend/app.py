from flask import Flask, jsonify, request
from flask_cors import CORS
from flask_jwt_extended import JWTManager, create_access_token, jwt_required, get_jwt_identity, get_jwt
from apscheduler.schedulers.background import BackgroundScheduler
from database import init_db, get_db_connection, ensure_database_exists
import datetime
import bcrypt

from flask.json.provider import DefaultJSONProvider

class ISOJSONProvider(DefaultJSONProvider):
    def default(self, o):
        if isinstance(o, datetime.datetime):
            return o.isoformat()
        if isinstance(o, datetime.date):
            return o.isoformat()
        return super().default(o)

app = Flask(__name__)
app.json = ISOJSONProvider(app)
CORS(app, supports_credentials=True)

app.config["JWT_SECRET_KEY"] = "super-secret-library-mgmt-key-2024"
# Not: JWT_SECRET_KEY must be >=32 bytes for SHA256.
app.config["JWT_ACCESS_TOKEN_EXPIRES"] = datetime.timedelta(hours=24)
jwt = JWTManager(app)

# ─── HELPERS ────────────────────────────────────────────────────────────────

def get_user_by_username(username):
    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute("SELECT * FROM users WHERE username = %s", (username,))
    user = cur.fetchone()
    cur.close(); conn.close()
    return user

def require_role(*roles):
    """Decorator-style helper to check role from JWT claims."""
    def decorator(fn):
        @jwt_required()
        def wrapper(*args, **kwargs):
            claims = get_jwt()
            if claims.get("role") not in roles:
                return jsonify({"error": "Bu işlem için yetkiniz yok."}), 403
            return fn(*args, **kwargs)
        wrapper.__name__ = fn.__name__
        return wrapper
    return decorator

def get_borrowing_limit(trust_score):
    if trust_score < 30:
        return 1
    elif trust_score > 80:
        return 5
    return 3

def apply_trust_penalty(conn, cur, user_id, score_delta, debt_delta, reason):
    cur.execute("""
        UPDATE users 
        SET trust_score = GREATEST(0, LEAST(100, trust_score + %s)),
            total_debt = total_debt + %s
        WHERE id = %s
    """, (score_delta, debt_delta, user_id))
    print(f"Trust penalty/bonus applied to user {user_id}: {score_delta} pts, {debt_delta} TL — {reason}")
    
    if score_delta != 0:
        cur.execute("""
            INSERT INTO trust_score_history (user_id, delta, reason)
            VALUES (%s, %s, %s)
        """, (user_id, score_delta, reason))

    if debt_delta > 0:
        cur.execute("""
            INSERT INTO payments (user_id, amount, type, description)
            VALUES (%s, %s, 'charge', %s)
        """, (user_id, debt_delta, f"Ceza: {reason}"))

# ─── BACKGROUND TASKS ────────────────────────────────────────────────────────

def check_timeouts():
    try:
        conn = get_db_connection()
        cur = conn.cursor()

        # Track A: 15 dk check-in kuralı
        cur.execute("""
            UPDATE room_reservations 
            SET status = 'cancelled'
            WHERE status = 'reserved' 
            AND check_in_time IS NULL 
            AND start_time <= NOW() - INTERVAL '15 minutes'
            RETURNING id, user_id
        """)
        cancelled_rooms = cur.fetchall()
        for r in cancelled_rooms:
            # Check-out yapmadan çıkış değil, check-in yapmama → ceza yok spec'e göre
            print(f"Room reservation {r['id']} cancelled (15-min rule)")

        # Track B: 24 saat onaylanmamış kitap taleplerini iptal et
        cur.execute("""
            UPDATE borrow_requests
            SET status = 'cancelled'
            WHERE status = 'pending'
            AND request_time <= NOW() - INTERVAL '24 hours'
            RETURNING id
        """)
        cancelled_borrows = cur.fetchall()
        if cancelled_borrows:
            print(f"Background: Cancelled {len(cancelled_borrows)} borrow requests (24h rule)")

        # Gecikmiş iade: her gün ceza
        cur.execute("""
            SELECT br.id, br.user_id, br.due_time
            FROM borrow_requests br
            WHERE br.status = 'approved'
            AND br.due_time < NOW()
            AND br.return_time IS NULL
            AND (br.last_penalty_date IS NULL OR br.last_penalty_date < CURRENT_DATE)
        """)
        overdue = cur.fetchall()
        for borrow in overdue:
            days_late = (datetime.datetime.now() - borrow['due_time']).days
            if days_late > 0:
                apply_trust_penalty(conn, cur, borrow['user_id'], -10, 5.0, f"Gecikmiş iade {days_late}. gün cezası")
                cur.execute("UPDATE borrow_requests SET last_penalty_date = CURRENT_DATE WHERE id = %s", (borrow['id'],))

        conn.commit()
        cur.close(); conn.close()
    except Exception as e:
        print("Error in background task:", e)

scheduler = BackgroundScheduler()
scheduler.add_job(func=check_timeouts, trigger="interval", minutes=5)
scheduler.start()

# ─── AUTH ENDPOINTS ──────────────────────────────────────────────────────────

@app.route('/api/auth/register', methods=['POST'])
def register():
    data = request.json
    username = data.get('username', '').strip()
    password = data.get('password', '').strip()
    role = data.get('role', 'member')

    if not username or not password:
        return jsonify({"error": "Kullanıcı adı ve şifre gerekli."}), 400
    if role not in ('member', 'student', 'teacher', 'staff', 'admin'):
        role = 'member'

    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute("SELECT id FROM users WHERE username = %s", (username,))
    if cur.fetchone():
        return jsonify({"error": "Bu kullanıcı adı zaten alınmış."}), 409

    hashed = bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()
    cur.execute(
        "INSERT INTO users (username, password_hash, role) VALUES (%s, %s, %s) RETURNING id, username, role, trust_score, total_debt",
        (username, hashed, role)
    )
    user = cur.fetchone()
    conn.commit(); cur.close(); conn.close()

    token = create_access_token(identity=str(user['id']), additional_claims={"role": user['role'], "username": user['username']})
    return jsonify({"token": token, "user": dict(user)}), 201

@app.route('/api/auth/login', methods=['POST'])
def login():
    data = request.json
    username = data.get('username', '').strip()
    password = data.get('password', '').strip()

    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute("SELECT * FROM users WHERE username = %s", (username,))
    user = cur.fetchone()
    cur.close(); conn.close()

    if not user or not bcrypt.checkpw(password.encode(), user['password_hash'].encode()):
        return jsonify({"error": "Kullanıcı adı veya şifre hatalı."}), 401

    token = create_access_token(identity=str(user['id']), additional_claims={"role": user['role'], "username": user['username']})
    return jsonify({
        "token": token,
        "user": {
            "id": user['id'],
            "username": user['username'],
            "role": user['role'],
            "trust_score": user['trust_score'],
            "total_debt": float(user['total_debt'])
        }
    }), 200

@app.route('/api/auth/me', methods=['GET'])
@jwt_required()
def me():
    user_id = get_jwt_identity()
    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute("SELECT id, username, role, trust_score, total_debt FROM users WHERE id = %s", (user_id,))
    user = cur.fetchone()
    cur.close(); conn.close()
    if not user:
        return jsonify({"error": "Kullanıcı bulunamadı"}), 404
    return jsonify(dict(user)), 200

# ─── HEALTH ──────────────────────────────────────────────────────────────────

@app.route('/api/health', methods=['GET'])
def health_check():
    return jsonify({"status": "healthy"}), 200

# ─── ROOMS ───────────────────────────────────────────────────────────────────

@app.route('/api/rooms', methods=['GET'])
def get_rooms():
    duration_hours = int(request.args.get('duration_hours', 1))
    start_time_str = request.args.get('start_time')
    
    if start_time_str:
        try:
            start_time = datetime.datetime.fromisoformat(start_time_str.replace('Z', '+00:00'))
        except ValueError:
            start_time = datetime.datetime.now()
    else:
        start_time = datetime.datetime.now()
        
    end_time = start_time + datetime.timedelta(hours=duration_hours)

    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute('''
        SELECT r.*, 
        (
            SELECT COUNT(1) FROM room_reservations rr 
            WHERE rr.room_id = r.id 
            AND rr.status IN ('reserved', 'active') 
            AND ((%s BETWEEN rr.start_time AND rr.end_time) OR (%s BETWEEN rr.start_time AND rr.end_time) OR (rr.start_time BETWEEN %s AND %s))
        ) as occupied_seats
        FROM rooms r
        ORDER BY r.id
    ''', (start_time, end_time, start_time, end_time))
    rows = cur.fetchall()
    cur.close(); conn.close()

    rooms = []
    for room in rows:
        r = dict(room)
        r['current_status'] = 'occupied' if r['occupied_seats'] >= r['capacity'] else 'available'
        if r['status'] == 'disabled':
            r['current_status'] = 'disabled'
        rooms.append(r)
    return jsonify(rooms), 200

@app.route('/api/rooms/<int:room_id>/seats', methods=['GET'])
def get_room_seats(room_id):
    duration_hours = int(request.args.get('duration_hours', 1))
    start_time_str = request.args.get('start_time')
    
    if start_time_str:
        try:
            start_time = datetime.datetime.fromisoformat(start_time_str.replace('Z', '+00:00'))
        except ValueError:
            start_time = datetime.datetime.now()
    else:
        start_time = datetime.datetime.now()
        
    end_time = start_time + datetime.timedelta(hours=duration_hours)

    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute("SELECT capacity, status FROM rooms WHERE id = %s", (room_id,))
    room = cur.fetchone()
    if not room:
        return jsonify({"error": "Oda bulunamadı"}), 404
    if room['status'] == 'disabled':
        return jsonify({"error": "Bu oda devre dışı bırakılmış."}), 400

    capacity = room['capacity']
    cur.execute('''
        SELECT id, seat_number FROM room_reservations 
        WHERE room_id = %s 
        AND status IN ('reserved', 'active')
        AND ((%s BETWEEN start_time AND end_time) OR (%s BETWEEN start_time AND end_time) OR (start_time BETWEEN %s AND %s))
    ''', (room_id, start_time, end_time, start_time, end_time))
    occupied_records = cur.fetchall()
    occupied_map = {row['seat_number']: row['id'] for row in occupied_records}

    cur.execute("SELECT seat_number FROM disabled_seats WHERE room_id = %s", (room_id,))
    disabled = [row['seat_number'] for row in cur.fetchall()]

    cur.close(); conn.close()

    seats = [{"seat_number": i, "is_occupied": i in occupied_map, "reservation_id": occupied_map.get(i), "is_disabled": i in disabled} for i in range(1, capacity + 1)]
    return jsonify({"capacity": capacity, "seats": seats}), 200

@app.route('/api/reservations', methods=['POST'])
@jwt_required()
def create_reservation():
    claims = get_jwt()
    user_id = int(get_jwt_identity())
    data = request.json
    room_id = data.get('room_id')
    seat_number = int(data.get('seat_number', 1))
    duration_hours = int(data.get('duration_hours', 1))
    start_time_str = data.get('start_time')

    if start_time_str:
        try:
            start_time = datetime.datetime.fromisoformat(start_time_str.replace('Z', '+00:00'))
        except ValueError:
            return jsonify({"error": "Geçersiz tarih formatı."}), 400
    else:
        start_time = datetime.datetime.now()

    end_time = start_time + datetime.timedelta(hours=duration_hours)

    closure_reason = check_closure(start_time, end_time)
    if closure_reason:
        return jsonify({"error": f"Kütüphane bu tarihlerde kapalı: {closure_reason}"}), 400

    conn = get_db_connection()
    cur = conn.cursor()

    # Güven skoru kontrolü
    cur.execute("SELECT trust_score, total_debt FROM users WHERE id = %s", (user_id,))
    user = cur.fetchone()
    if user['trust_score'] < 30:
        return jsonify({"error": "Güven skorunuz çok düşük (< 30). Oda rezervasyonu yapamazsınız."}), 403
    if user['total_debt'] > 50:
        return jsonify({"error": f"Toplam borcunuz {user['total_debt']} TL. Borç 50 TL'yi aştığında rezervasyon yapamazsınız."}), 403

    # Kullanıcının aynı saatlerde başka rezervasyonu var mı kontrolü
    cur.execute('''
        SELECT id FROM room_reservations 
        WHERE user_id = %s 
        AND status IN ('reserved', 'active') 
        AND ((%s BETWEEN start_time AND end_time) OR (%s BETWEEN start_time AND end_time) OR (start_time BETWEEN %s AND %s))
    ''', (user_id, start_time, end_time, start_time, end_time))
    if cur.fetchone():
        return jsonify({"error": "Aynı saatler içerisinde zaten aktif bir oda rezervasyonunuz bulunmaktadır."}), 400

    # Oda durumu
    cur.execute("SELECT status FROM rooms WHERE id = %s", (room_id,))
    room = cur.fetchone()
    if not room or room['status'] == 'disabled':
        return jsonify({"error": "Bu oda şu anda kullanılamaz."}), 400

    cur.execute("SELECT id FROM disabled_seats WHERE room_id = %s AND seat_number = %s", (room_id, seat_number))
    if cur.fetchone():
        return jsonify({"error": "Bu koltuk devre dışı bırakılmış."}), 400

    # Geçmişe rezervasyon yapılmasını engelle (10 dakika tölerans)
    if start_time < datetime.datetime.now() - datetime.timedelta(minutes=10):
        return jsonify({"error": "Geçmiş bir saate rezervasyon yapamazsınız."}), 400

    cur.execute('''
        SELECT id FROM room_reservations 
        WHERE room_id = %s AND seat_number = %s AND status IN ('reserved', 'active')
        AND ((%s BETWEEN start_time AND end_time) OR (%s BETWEEN start_time AND end_time) OR (start_time BETWEEN %s AND %s))
    ''', (room_id, seat_number, start_time, end_time, start_time, end_time))
    if cur.fetchone():
        return jsonify({"error": "Bu koltuk bu saatlerde dolu."}), 400

    cur.execute('''
        INSERT INTO room_reservations (user_id, room_id, seat_number, start_time, end_time, status)
        VALUES (%s, %s, %s, %s, %s, 'reserved') RETURNING id
    ''', (user_id, room_id, seat_number, start_time, end_time))
    res_id = cur.fetchone()['id']
    conn.commit(); cur.close(); conn.close()
    return jsonify({"message": "Rezervasyon başarılı.", "reservation_id": res_id}), 201

@app.route('/api/reservations/<int:res_id>/checkin', methods=['POST'])
@jwt_required()
def check_in(res_id):
    user_id = int(get_jwt_identity())
    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute("SELECT * FROM room_reservations WHERE id = %s", (res_id,))
    res = cur.fetchone()
    if not res:
        return jsonify({"error": "Rezervasyon bulunamadı."}), 404
    if res['status'] == 'cancelled':
        return jsonify({"error": "Bu rezervasyon iptal edilmiş (15 dk kuralı)."}), 400
    if res['check_in_time']:
        return jsonify({"error": "Zaten check-in yapılmış."}), 400

    now = datetime.datetime.now()
    if (res['start_time'] - now).total_seconds() > 1800:
        return jsonify({"error": "Check-in işlemini rezervasyon saatinize en fazla 30 dakika kala yapabilirsiniz."}), 400

    cur.execute("UPDATE room_reservations SET check_in_time = NOW(), status = 'active' WHERE id = %s", (res_id,))
    conn.commit(); cur.close(); conn.close()
    return jsonify({"message": "Check-in başarılı."}), 200

@app.route('/api/reservations/<int:res_id>/checkout', methods=['POST'])
@jwt_required()
def check_out(res_id):
    user_id = int(get_jwt_identity())
    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute('''
        SELECT rr.*, r.room_type 
        FROM room_reservations rr
        JOIN rooms r ON rr.room_id = r.id
        WHERE rr.id = %s AND rr.user_id = %s
    ''', (res_id, user_id))
    res = cur.fetchone()
    
    if not res:
        return jsonify({"error": "Rezervasyon bulunamadı veya size ait değil."}), 404
    if res['status'] != 'active' or not res['check_in_time']:
        return jsonify({"error": "Check-out yapmak için önce check-in yapmalısınız."}), 400

    now = datetime.datetime.now()
    duration_minutes = max(1, int((now - res['check_in_time']).total_seconds() / 60))
    cost = 0.0

    if res['room_type'] == 'computer':
        cost = duration_minutes * 1.0  # 1 TL per minute

    cur.execute("UPDATE room_reservations SET check_out_time = %s, status = 'completed' WHERE id = %s", (now, res_id))

    message = "Check-out başarılı."
    if cost > 0:
        cur.execute("UPDATE users SET total_debt = total_debt + %s WHERE id = %s", (cost, user_id))
        cur.execute("""
            INSERT INTO payments (user_id, amount, type, description)
            VALUES (%s, %s, 'charge', %s)
        """, (user_id, cost, f"{duration_minutes} dakika Bilgisayar Odası kullanımı"))
        message += f" Kullanım süresi: {duration_minutes} dk. Ücret: {cost} TL borcunuza eklendi."

    conn.commit(); cur.close(); conn.close()
    return jsonify({"message": message}), 200

@app.route('/api/my-reservations', methods=['GET'])
@jwt_required()
def my_reservations():
    user_id = int(get_jwt_identity())
    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute('''
        SELECT r.name as room_name, rr.* 
        FROM room_reservations rr
        JOIN rooms r ON rr.room_id = r.id
        WHERE rr.user_id = %s
        ORDER BY rr.id DESC LIMIT 20
    ''', (user_id,))
    rows = cur.fetchall()
    cur.close(); conn.close()
    return jsonify([dict(r) for r in rows]), 200

# ─── STAFF: Force Checkout ───────────────────────────────────────────────────

@app.route('/api/reservations/<int:res_id>/force-checkout', methods=['POST'])
@jwt_required()
def force_checkout(res_id):
    claims = get_jwt()
    if claims.get('role') not in ('staff', 'admin'):
        return jsonify({"error": "Yetkiniz yok."}), 403

    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute("SELECT * FROM room_reservations WHERE id = %s", (res_id,))
    res = cur.fetchone()
    if not res or res['status'] not in ('reserved', 'active'):
        return jsonify({"error": "Aktif rezervasyon bulunamadı."}), 404
    
    # Check-out yapmadan çıkma cezası: -10 puan, 25 TL
    apply_trust_penalty(conn, cur, res['user_id'], -10, 25.0, "Force check-out (görevli)")
    cur.execute("""
        UPDATE room_reservations SET status = 'force_closed', check_out_time = NOW() WHERE id = %s
    """, (res_id,))
    conn.commit(); cur.close(); conn.close()
    return jsonify({"message": "Force check-out yapıldı. Kullanıcıya ceza uygulandı."}), 200

# ─── BOOKS ───────────────────────────────────────────────────────────────────

@app.route('/api/books', methods=['GET'])
def search_books():
    q = request.args.get('q', '')
    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute("""
        SELECT * FROM books 
        WHERE title ILIKE %s OR author ILIKE %s OR barcode = %s
        ORDER BY title LIMIT 50
    """, (f'%{q}%', f'%{q}%', q))
    books = cur.fetchall()
    cur.close(); conn.close()
    return jsonify([dict(b) for b in books]), 200

@app.route('/api/books', methods=['POST'])
@jwt_required()
def add_book():
    claims = get_jwt()
    if claims.get('role') not in ('staff', 'admin'):
        return jsonify({"error": "Yetkiniz yok."}), 403
    data = request.json
    title = data.get('title', '').strip()
    author = data.get('author', '').strip()
    barcode = data.get('barcode', '').strip()
    if not title or not barcode:
        return jsonify({"error": "Başlık ve barkod gerekli."}), 400

    conn = get_db_connection()
    cur = conn.cursor()
    try:
        cur.execute("INSERT INTO books (title, author, barcode) VALUES (%s, %s, %s) RETURNING id", (title, author, barcode))
        book_id = cur.fetchone()['id']
        conn.commit()
    except Exception:
        conn.rollback()
        return jsonify({"error": "Bu barkod zaten kayıtlı."}), 409
    finally:
        cur.close(); conn.close()
    return jsonify({"message": "Kitap eklendi.", "book_id": book_id}), 201

# ─── BORROW ──────────────────────────────────────────────────────────────────

@app.route('/api/borrow', methods=['POST'])
@jwt_required()
def request_borrow():
    user_id = int(get_jwt_identity())
    data = request.json
    book_id = data.get('book_id')

    closure_reason = check_closure(datetime.datetime.now())
    if closure_reason:
        return jsonify({"error": f"Kütüphane şu an kapalı: {closure_reason}"}), 400

    conn = get_db_connection()
    cur = conn.cursor()

    # Kullanıcı kısıtlamaları
    cur.execute("SELECT trust_score, total_debt FROM users WHERE id = %s", (user_id,))
    user = cur.fetchone()
    if user['total_debt'] > 50:
        return jsonify({"error": "Toplam borcunuz 50 TL'yi aştı. Kitap kiralamak için borcu ödeyin."}), 403

    limit = get_borrowing_limit(user['trust_score'])
    cur.execute("SELECT COUNT(*) FROM borrow_requests WHERE user_id=%s AND status='approved' AND return_time IS NULL", (user_id,))
    active_count = cur.fetchone()['count']
    if active_count >= limit:
        return jsonify({"error": f"Güven skorunuza göre maksimum {limit} kitap kiralayabilirsiniz."}), 403

    # Kitap müsait mi?
    cur.execute("SELECT status FROM books WHERE id = %s", (book_id,))
    book = cur.fetchone()
    if not book:
        return jsonify({"error": "Kitap bulunamadı."}), 404
    if book['status'] != 'available':
        return jsonify({"error": "Bu kitap şu an müsait değil."}), 400

    cur.execute("UPDATE books SET status = 'reserved' WHERE id = %s", (book_id,))
    cur.execute("""
        INSERT INTO borrow_requests (user_id, book_id, status) VALUES (%s, %s, 'pending') RETURNING id
    """, (user_id, book_id))
    req_id = cur.fetchone()['id']
    conn.commit(); cur.close(); conn.close()
    return jsonify({"message": "Ödünç talebi oluşturuldu. 24 saat içinde kütüphaneye gidiniz.", "request_id": req_id}), 201

@app.route('/api/borrow/<int:req_id>/approve', methods=['POST'])
@jwt_required()
def approve_borrow(req_id):
    claims = get_jwt()
    if claims.get('role') not in ('staff', 'admin'):
        return jsonify({"error": "Yetkiniz yok."}), 403
    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute('''
        SELECT br.*, u.role as user_role 
        FROM borrow_requests br 
        JOIN users u ON br.user_id = u.id 
        WHERE br.id = %s
    ''', (req_id,))
    br = cur.fetchone()
    if not br or br['status'] != 'pending':
        return jsonify({"error": "Bekleyen talep bulunamadı."}), 404
    borrow_time = datetime.datetime.now()
    days_to_add = 30 if br['user_role'] == 'teacher' else 15
    due_time = borrow_time + datetime.timedelta(days=days_to_add)
    cur.execute("""
        UPDATE borrow_requests SET status='approved', borrow_time=%s, due_time=%s WHERE id=%s
    """, (borrow_time, due_time, req_id))
    cur.execute("UPDATE books SET status = 'borrowed' WHERE id = %s", (br['book_id'],))
    conn.commit(); cur.close(); conn.close()
    return jsonify({"message": "Talep onaylandı. İade tarihi: " + due_time.strftime('%d.%m.%Y')}), 200

@app.route('/api/borrow/<int:req_id>/return', methods=['POST'])
@jwt_required()
def return_book(req_id):
    claims = get_jwt()
    if claims.get('role') not in ('staff', 'admin'):
        return jsonify({"error": "Yetkiniz yok."}), 403
    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute("SELECT * FROM borrow_requests WHERE id = %s", (req_id,))
    br = cur.fetchone()
    if not br or br['status'] != 'approved':
        return jsonify({"error": "Aktif ödünç bulunamadı."}), 404

    now = datetime.datetime.now()
    is_late = now > br['due_time']
    cur.execute("UPDATE borrow_requests SET status='returned', return_time=%s WHERE id=%s", (now, req_id))
    cur.execute("UPDATE books SET status = 'available' WHERE id = %s", (br['book_id'],))

    if is_late:
        days_late = (now - br['due_time']).days
        apply_trust_penalty(conn, cur, br['user_id'], -10, days_late * 5.0, f"Geç iade ({days_late} gün)")
        msg = f"İade alındı (GECİKMİŞ {days_late} gün). Ceza uygulandı."
    else:
        apply_trust_penalty(conn, cur, br['user_id'], 5, 0.0, "Zamanında İade")
        msg = "İade alındı. +5 puan verildi."

    conn.commit(); cur.close(); conn.close()
    return jsonify({"message": msg}), 200

@app.route('/api/my-borrows', methods=['GET'])
@jwt_required()
def my_borrows():
    user_id = int(get_jwt_identity())
    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute("""
        SELECT br.*, b.title, b.author, b.barcode 
        FROM borrow_requests br JOIN books b ON br.book_id = b.id
        WHERE br.user_id = %s ORDER BY br.id DESC
    """, (user_id,))
    rows = cur.fetchall()
    cur.close(); conn.close()
    return jsonify([dict(r) for r in rows]), 200

# ─── STAFF PANEL ─────────────────────────────────────────────────────────────

@app.route('/api/staff/pending-borrows', methods=['GET'])
@jwt_required()
def pending_borrows():
    claims = get_jwt()
    if claims.get('role') not in ('staff', 'admin'):
        return jsonify({"error": "Yetkiniz yok."}), 403
    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute("""
        SELECT br.*, b.title, b.barcode, u.username, u.trust_score
        FROM borrow_requests br
        JOIN books b ON br.book_id = b.id
        JOIN users u ON br.user_id = u.id
        WHERE br.status = 'pending'
        ORDER BY br.request_time ASC
    """)
    rows = cur.fetchall()
    cur.close(); conn.close()
    return jsonify([dict(r) for r in rows]), 200

@app.route('/api/staff/active-borrows', methods=['GET'])
@jwt_required()
def active_borrows():
    claims = get_jwt()
    if claims.get('role') not in ('staff', 'admin'):
        return jsonify({"error": "Yetkiniz yok."}), 403
    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute("""
        SELECT br.*, b.title, b.barcode, u.username, u.trust_score, u.total_debt
        FROM borrow_requests br
        JOIN books b ON br.book_id = b.id
        JOIN users u ON br.user_id = u.id
        WHERE br.status = 'approved'
        ORDER BY br.due_time ASC
    """)
    rows = cur.fetchall()
    cur.close(); conn.close()
    return jsonify([dict(r) for r in rows]), 200

@app.route('/api/staff/clear-debt/<int:uid>', methods=['POST'])
@jwt_required()
def clear_debt(uid):
    claims = get_jwt()
    if claims.get('role') not in ('staff', 'admin'):
        return jsonify({"error": "Yetkiniz yok."}), 403
    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute("SELECT total_debt FROM users WHERE id = %s", (uid,))
    user = cur.fetchone()
    if user and user['total_debt'] > 0:
        debt = user['total_debt']
        cur.execute("UPDATE users SET total_debt = 0 WHERE id = %s", (uid,))
        cur.execute("""
            INSERT INTO payments (user_id, amount, type, description)
            VALUES (%s, %s, 'payment', 'Borç tahsilatı (Görevli)')
        """, (uid, debt))
    conn.commit(); cur.close(); conn.close()
    return jsonify({"message": "Borç sıfırlandı ve tahsilat kaydedildi."}), 200

@app.route('/api/staff/payments', methods=['GET'])
@jwt_required()
def get_payments():
    claims = get_jwt()
    if claims.get('role') not in ('staff', 'admin'):
        return jsonify({"error": "Yetkiniz yok."}), 403
    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute("""
        SELECT p.*, u.username 
        FROM payments p
        JOIN users u ON p.user_id = u.id
        ORDER BY p.created_at DESC LIMIT 100
    """)
    rows = cur.fetchall()
    cur.close(); conn.close()
    return jsonify([dict(r) for r in rows]), 200

@app.route('/api/staff/active-reservations', methods=['GET'])
@jwt_required()
def active_reservations():
    claims = get_jwt()
    if claims.get('role') not in ('staff', 'admin'):
        return jsonify({"error": "Yetkiniz yok."}), 403
    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute("""
        SELECT rr.*, r.name as room_name, u.username
        FROM room_reservations rr
        JOIN rooms r ON rr.room_id = r.id
        JOIN users u ON rr.user_id = u.id
        WHERE rr.status IN ('reserved','active')
        AND NOW() BETWEEN rr.start_time AND rr.end_time
        ORDER BY rr.start_time
    """)
    rows = cur.fetchall()
    cur.close(); conn.close()
    return jsonify([dict(r) for r in rows]), 200

# ─── ADMIN PANEL ──────────────────────────────────────────────────────────────

@app.route('/api/admin/dashboard', methods=['GET'])
@jwt_required()
def admin_dashboard():
    claims = get_jwt()
    if claims.get('role') != 'admin':
        return jsonify({"error": "Yetkiniz yok."}), 403
    conn = get_db_connection()
    cur = conn.cursor()

    cur.execute("SELECT COUNT(*) FROM room_reservations WHERE status IN ('reserved','active') AND NOW() BETWEEN start_time AND end_time")
    active_reservations = cur.fetchone()['count']

    cur.execute("SELECT COUNT(*) FROM borrow_requests WHERE status = 'approved' AND return_time IS NULL")
    active_borrows = cur.fetchone()['count']

    cur.execute("SELECT COUNT(*) FROM borrow_requests WHERE status = 'pending'")
    pending_borrows = cur.fetchone()['count']

    cur.execute("SELECT COALESCE(SUM(total_debt), 0) as total FROM users")
    total_debt = cur.fetchone()['total']

    cur.execute("""
        SELECT r.id, r.name, r.capacity, r.status,
        (SELECT COUNT(*) FROM room_reservations rr WHERE rr.room_id = r.id AND rr.status IN ('reserved','active') AND NOW() BETWEEN rr.start_time AND rr.end_time) as occupied
        FROM rooms r ORDER BY r.id
    """)
    rooms_stats = [dict(r) for r in cur.fetchall()]

    cur.execute("SELECT COUNT(*) FROM users WHERE role = 'member'")
    total_members = cur.fetchone()['count']

    cur.execute("SELECT COUNT(*) FROM users WHERE trust_score < 30")
    red_zone_users = cur.fetchone()['count']

    # Aylık ceza geliri
    cur.execute("""
        SELECT COALESCE(SUM(amount), 0) as total
        FROM payments
        WHERE type = 'charge' AND description ILIKE '%Ceza%'
          AND EXTRACT(MONTH FROM created_at) = EXTRACT(MONTH FROM NOW())
          AND EXTRACT(YEAR FROM created_at) = EXTRACT(YEAR FROM NOW())
    """)
    monthly_penalty_revenue = cur.fetchone()['total']

    # Aylık en çok okunan kitaplar (top 5)
    cur.execute("""
        SELECT b.title, COUNT(br.id) as read_count 
        FROM borrow_requests br
        JOIN books b ON br.book_id = b.id
        WHERE br.status IN ('approved', 'returned') 
          AND EXTRACT(MONTH FROM br.borrow_time) = EXTRACT(MONTH FROM NOW())
          AND EXTRACT(YEAR FROM br.borrow_time) = EXTRACT(YEAR FROM NOW())
        GROUP BY b.id, b.title
        ORDER BY read_count DESC
        LIMIT 5
    """)
    top_books = [dict(row) for row in cur.fetchall()]

    cur.close(); conn.close()
    return jsonify({
        "active_reservations": active_reservations,
        "active_borrows": active_borrows,
        "pending_borrows": pending_borrows,
        "total_debt_tl": float(total_debt),
        "total_members": total_members,
        "red_zone_users": red_zone_users,
        "rooms": rooms_stats,
        "monthly_penalty_revenue": float(monthly_penalty_revenue),
        "top_books": top_books
    }), 200

@app.route('/api/admin/adjust-score', methods=['POST'])
@jwt_required()
def adjust_score():
    claims = get_jwt()
    if claims.get('role') != 'admin':
        return jsonify({"error": "Yetkiniz yok."}), 403
    data = request.json
    target_user_id = data.get('user_id')
    delta = int(data.get('delta', 0))
    conn = get_db_connection()
    cur = conn.cursor()
    apply_trust_penalty(conn, cur, target_user_id, delta, 0.0, "Manuel puan düzenlemesi (Admin)")
    conn.commit(); cur.close(); conn.close()
    return jsonify({"message": f"Puan güncellendi ({delta:+d})."}), 200

@app.route('/api/rooms/<int:room_id>/toggle-disable', methods=['POST'])
@jwt_required()
def toggle_room(room_id):
    claims = get_jwt()
    if claims.get('role') != 'admin':
        return jsonify({"error": "Yetkiniz yok."}), 403
    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute("SELECT status FROM rooms WHERE id = %s", (room_id,))
    room = cur.fetchone()
    new_status = 'active' if room['status'] == 'disabled' else 'disabled'
    cur.execute("UPDATE rooms SET status = %s WHERE id = %s", (new_status, room_id))
    conn.commit(); cur.close(); conn.close()
    return jsonify({"message": f"Oda durumu '{new_status}' yapıldı.", "new_status": new_status}), 200

@app.route('/api/admin/users', methods=['GET'])
@jwt_required()
def list_users():
    claims = get_jwt()
    if claims.get('role') not in ('staff', 'admin'):
        return jsonify({"error": "Yetkiniz yok."}), 403
    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute("SELECT id, username, role, trust_score, total_debt FROM users ORDER BY username")
    rows = cur.fetchall()
    cur.close(); conn.close()
    return jsonify([dict(r) for r in rows]), 200

@app.route('/api/profile', methods=['GET'])
@jwt_required()
def get_profile():
    claims = get_jwt()
    user_id = claims['sub']
    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute("SELECT id, username, role, trust_score, total_debt FROM users WHERE id = %s", (user_id,))
    user = cur.fetchone()
    if not user:
        cur.close(); conn.close()
        return jsonify({"error": "Kullanıcı bulunamadı."}), 404

    cur.execute("SELECT * FROM payments WHERE user_id = %s ORDER BY created_at DESC", (user_id,))
    payments = [dict(r) for r in cur.fetchall()]

    cur.execute("SELECT * FROM trust_score_history WHERE user_id = %s ORDER BY created_at DESC", (user_id,))
    trust_history = [dict(r) for r in cur.fetchall()]

    cur.close(); conn.close()
    
    user_data = dict(user)
    user_data['payments'] = payments
    user_data['trust_score_history'] = trust_history
    return jsonify(user_data), 200

@app.route('/api/profile/add-balance', methods=['POST'])
@jwt_required()
def add_balance():
    claims = get_jwt()
    user_id = claims['sub']
    data = request.json
    amount = data.get('amount')
    try:
        amount = float(amount)
        if amount <= 0:
            return jsonify({"error": "Geçerli bir tutar girin."}), 400
    except:
        return jsonify({"error": "Geçersiz tutar."}), 400

    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute("SELECT total_debt FROM users WHERE id = %s", (user_id,))
    user = cur.fetchone()
    if not user:
        cur.close(); conn.close()
        return jsonify({"error": "Kullanıcı bulunamadı."}), 404

    new_debt = float(user['total_debt']) - amount
    cur.execute("UPDATE users SET total_debt = %s WHERE id = %s", (new_debt, user_id))
    
    cur.execute("""
        INSERT INTO payments (user_id, amount, type, description)
        VALUES (%s, %s, 'payment', 'Online Bakiye Yükleme')
    """, (user_id, amount))

    conn.commit()
    cur.close(); conn.close()
    return jsonify({"message": f"{amount} TL bakiye başarıyla yüklendi.", "new_debt": new_debt}), 200

# ─── CALENDAR & SEAT MANAGEMENT (BR-8 & BR-6) ───────────────────────────────

@app.route('/api/admin/closures', methods=['GET'])
def get_closures():
    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute("SELECT * FROM library_closures ORDER BY start_time")
    rows = cur.fetchall()
    cur.close(); conn.close()
    return jsonify([dict(r) for r in rows]), 200

@app.route('/api/admin/closures', methods=['POST'])
@jwt_required()
def add_closure():
    claims = get_jwt()
    if claims.get('role') != 'admin':
        return jsonify({"error": "Yetkiniz yok."}), 403
    data = request.json
    start_time = data.get('start_time')
    end_time = data.get('end_time')
    reason = data.get('reason')
    if not start_time or not end_time or not reason:
        return jsonify({"error": "Eksik bilgi."}), 400

    try:
        start_dt = datetime.datetime.fromisoformat(start_time.replace('Z', '+00:00'))
        end_dt = datetime.datetime.fromisoformat(end_time.replace('Z', '+00:00'))
    except ValueError:
        return jsonify({"error": "Geçersiz tarih formatı."}), 400

    now = datetime.datetime.now(start_dt.tzinfo) if start_dt.tzinfo else datetime.datetime.now()
    if start_dt < now:
        return jsonify({"error": "Geçmiş bir tarihe tatil/kapalı dönem ekleyemezsiniz."}), 400
    if end_dt <= start_dt:
        return jsonify({"error": "Bitiş tarihi başlangıç tarihinden sonra olmalıdır."}), 400
    
    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute("INSERT INTO library_closures (start_time, end_time, reason) VALUES (%s, %s, %s)",
                (start_time, end_time, reason))
    conn.commit(); cur.close(); conn.close()
    return jsonify({"message": "Kapalı dönem eklendi."}), 201

@app.route('/api/admin/closures/<int:id>', methods=['DELETE'])
@jwt_required()
def delete_closure(id):
    claims = get_jwt()
    if claims.get('role') != 'admin':
        return jsonify({"error": "Yetkiniz yok."}), 403
    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute("DELETE FROM library_closures WHERE id = %s", (id,))
    conn.commit(); cur.close(); conn.close()
    return jsonify({"message": "Kapalı dönem silindi."}), 200

@app.route('/api/rooms/<int:room_id>/toggle-seat', methods=['POST'])
@jwt_required()
def toggle_seat(room_id):
    claims = get_jwt()
    if claims.get('role') not in ('admin', 'staff'):
        return jsonify({"error": "Yetkiniz yok."}), 403
    data = request.json
    seat_number = data.get('seat_number')
    if not seat_number:
        return jsonify({"error": "Koltuk numarası gerekli."}), 400
    
    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute("SELECT id FROM disabled_seats WHERE room_id = %s AND seat_number = %s", (room_id, seat_number))
    if cur.fetchone():
        cur.execute("DELETE FROM disabled_seats WHERE room_id = %s AND seat_number = %s", (room_id, seat_number))
        msg = "Koltuk aktif edildi."
    else:
        cur.execute("INSERT INTO disabled_seats (room_id, seat_number) VALUES (%s, %s)", (room_id, seat_number))
        msg = "Koltuk devre dışı bırakıldı."
    conn.commit(); cur.close(); conn.close()
    return jsonify({"message": msg}), 200

@app.route('/api/admin/working-hours', methods=['GET'])
def get_working_hours():
    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute("SELECT * FROM working_hours ORDER BY day_of_week")
    rows = cur.fetchall()
    cur.close(); conn.close()
    
    # We convert timedelta/time to string for JSON serialization
    res = []
    for r in rows:
        d = dict(r)
        d['open_time'] = d['open_time'].strftime('%H:%M')
        d['close_time'] = d['close_time'].strftime('%H:%M')
        res.append(d)
    return jsonify(res), 200

@app.route('/api/admin/working-hours', methods=['PUT'])
@jwt_required()
def update_working_hours():
    claims = get_jwt()
    if claims.get('role') != 'admin':
        return jsonify({"error": "Yetkiniz yok."}), 403
    
    data = request.json
    conn = get_db_connection()
    cur = conn.cursor()
    
    for day in data:
        cur.execute("""
            UPDATE working_hours 
            SET open_time = %s, close_time = %s, is_closed = %s
            WHERE day_of_week = %s
        """, (day['open_time'], day['close_time'], day.get('is_closed', False), day['day_of_week']))
        
    conn.commit()
    cur.close(); conn.close()
    return jsonify({"message": "Çalışma saatleri başarıyla güncellendi."}), 200

def check_closure(start_time, end_time=None):
    if end_time is None:
        end_time = start_time
    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute('''
        SELECT reason FROM library_closures 
        WHERE (%s BETWEEN start_time AND end_time) 
           OR (%s BETWEEN start_time AND end_time)
           OR (start_time BETWEEN %s AND %s)
    ''', (start_time, end_time, start_time, end_time))
    closure = cur.fetchone()
    
    if not closure:
        day = start_time.isoweekday()
        cur.execute("SELECT open_time, close_time, is_closed FROM working_hours WHERE day_of_week = %s", (day,))
        wh = cur.fetchone()
        if wh:
            if wh['is_closed']:
                closure = {'reason': 'Kütüphane bu gün kapalıdır.'}
            else:
                s_time = start_time.time()
                e_time = end_time.time()
                if start_time.date() != end_time.date():
                    closure = {'reason': 'Rezervasyonlar tek gün içinde olmalıdır.'}
                elif s_time < wh['open_time'] or e_time > wh['close_time']:
                    closure = {'reason': f"Mesai saatleri dışında. Çalışma saatleri: {wh['open_time'].strftime('%H:%M')} - {wh['close_time'].strftime('%H:%M')}"}
                    
    cur.close(); conn.close()
    return closure['reason'] if closure else None

if __name__ == '__main__':
    try:
        from database import ensure_database_exists
        ensure_database_exists()
        init_db()
        print("Database initialized successfully.")
    except Exception as e:
        print("Could not initialize DB (is Postgres running?):", e)
    app.run(debug=True, port=5000, use_reloader=False)
