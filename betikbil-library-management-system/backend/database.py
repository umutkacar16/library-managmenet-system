import psycopg2
from psycopg2.extras import RealDictCursor
from psycopg2.extensions import ISOLATION_LEVEL_AUTOCOMMIT
import os
from dotenv import load_dotenv

load_dotenv()

DB_HOST = os.getenv("DB_HOST", "localhost")
DB_NAME = os.getenv("DB_NAME", "library_db")       # Proje veritabani: library_db
DB_USER = os.getenv("DB_USER", "postgres")
DB_PASS = os.getenv("DB_PASS", "admin")
DB_PORT = os.getenv("DB_PORT", "5432")


def ensure_database_exists():
    """
    Once postgres sistem veritabanina baglanir.
    'library_db' yoksa olusturur.
    """
    try:
        conn = psycopg2.connect(
            host=DB_HOST,
            database="postgres",   # sistem veritabani, her zaman vardir
            user=DB_USER,
            password=DB_PASS,
            port=DB_PORT
        )
        conn.set_isolation_level(ISOLATION_LEVEL_AUTOCOMMIT)
        cur = conn.cursor()

        cur.execute("SELECT 1 FROM pg_database WHERE datname = %s", (DB_NAME,))
        exists = cur.fetchone()

        if not exists:
            cur.execute(f'CREATE DATABASE "{DB_NAME}" ENCODING "UTF8"')
            print(f"[DB] Veritabani olusturuldu: {DB_NAME}")
        else:
            print(f"[DB] Veritabani mevcut: {DB_NAME}")

        cur.close()
        conn.close()
    except Exception as e:
        print(f"[DB] Veritabani kontrol/olusturma hatasi: {e}")
        raise


def get_db_connection():
    conn = psycopg2.connect(
        host=DB_HOST,
        database=DB_NAME,
        user=DB_USER,
        password=DB_PASS,
        port=DB_PORT,
        cursor_factory=RealDictCursor
    )
    return conn


def init_db():
    conn = get_db_connection()
    cur = conn.cursor()

    # Tablolari olustur
    cur.execute('''
        CREATE TABLE IF NOT EXISTS users (
            id SERIAL PRIMARY KEY,
            username VARCHAR(50) UNIQUE NOT NULL,
            password_hash VARCHAR(255) NOT NULL,
            role VARCHAR(20) NOT NULL DEFAULT 'member',
            trust_score INTEGER DEFAULT 50,
            total_debt DECIMAL(10,2) DEFAULT 0.00
        );

        CREATE TABLE IF NOT EXISTS books (
            id SERIAL PRIMARY KEY,
            title VARCHAR(255) NOT NULL,
            author VARCHAR(255),
            barcode VARCHAR(100) UNIQUE NOT NULL,
            status VARCHAR(50) DEFAULT 'available'
        );

        CREATE TABLE IF NOT EXISTS borrow_requests (
            id SERIAL PRIMARY KEY,
            user_id INTEGER REFERENCES users(id),
            book_id INTEGER REFERENCES books(id),
            request_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            status VARCHAR(50) DEFAULT 'pending',
            borrow_time TIMESTAMP,
            due_time TIMESTAMP,
            return_time TIMESTAMP,
            last_penalty_date DATE
        );

        CREATE TABLE IF NOT EXISTS rooms (
            id SERIAL PRIMARY KEY,
            name VARCHAR(50) NOT NULL,
            room_type VARCHAR(50) NOT NULL,
            capacity INTEGER DEFAULT 36,
            status VARCHAR(50) DEFAULT 'active'
        );

        CREATE TABLE IF NOT EXISTS room_reservations (
            id SERIAL PRIMARY KEY,
            user_id INTEGER REFERENCES users(id),
            room_id INTEGER REFERENCES rooms(id),
            seat_number INTEGER DEFAULT 1,
            start_time TIMESTAMP NOT NULL,
            end_time TIMESTAMP NOT NULL,
            status VARCHAR(50) DEFAULT 'reserved',
            check_in_time TIMESTAMP,
            check_out_time TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS payments (
            id SERIAL PRIMARY KEY,
            user_id INTEGER REFERENCES users(id),
            amount DECIMAL(10,2) NOT NULL,
            type VARCHAR(50) NOT NULL,
            description TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS library_closures (
            id SERIAL PRIMARY KEY,
            start_time TIMESTAMP NOT NULL,
            end_time TIMESTAMP NOT NULL,
            reason TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS disabled_seats (
            id SERIAL PRIMARY KEY,
            room_id INTEGER REFERENCES rooms(id),
            seat_number INTEGER NOT NULL,
            UNIQUE(room_id, seat_number)
        );

        CREATE TABLE IF NOT EXISTS trust_score_history (
            id SERIAL PRIMARY KEY,
            user_id INTEGER REFERENCES users(id),
            delta INTEGER NOT NULL,
            reason TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS working_hours (
            id SERIAL PRIMARY KEY,
            day_of_week INTEGER UNIQUE NOT NULL, -- 1=Monday...7=Sunday
            open_time TIME NOT NULL,
            close_time TIME NOT NULL,
            is_closed BOOLEAN DEFAULT FALSE
        );
    ''')

    conn.commit()
    print("[DB] Tablolar hazir.")

    # Varsayilan calisma saatleri
    cur.execute("SELECT COUNT(*) FROM working_hours")
    if cur.fetchone()['count'] == 0:
        default_hours = []
        for i in range(1, 8):
            is_closed = (i == 7) # Pazar
            default_hours.append((i, '08:00', '23:00', is_closed))
        cur.executemany("INSERT INTO working_hours (day_of_week, open_time, close_time, is_closed) VALUES (%s, %s, %s, %s)", default_hours)
        print("[DB] Varsayilan calisma saatleri eklendi.")

    # Varsayilan kullanicilar
    import bcrypt

    demo_users = [
        ('admin', b'admin', 'admin'),
        ('staff', b'staff', 'staff'),
        ('student', b'student', 'student'),
        ('teacher', b'teacher', 'teacher'),
    ]
    for username, pwd, role in demo_users:
        cur.execute("SELECT id FROM users WHERE username = %s", (username,))
        if not cur.fetchone():
            hashed = bcrypt.hashpw(pwd, bcrypt.gensalt()).decode('utf-8')
            cur.execute(
                "INSERT INTO users (username, password_hash, role) VALUES (%s, %s, %s)",
                (username, hashed, role)
            )
            print(f"[DB] Demo kullanici olusturuldu: {username} ({role})")

    # Varsayilan odalar
    cur.execute("SELECT COUNT(*) FROM rooms")
    if cur.fetchone()['count'] == 0:
        rooms = [
            ('Oda 1', 'group', 36),
            ('Oda 2', 'group', 36),
            ('Oda 3', 'group', 36),
            ('Oda 4', 'group', 36),
            ('Oda 5', 'group', 36),
        ]
        cur.executemany("INSERT INTO rooms (name, room_type, capacity) VALUES (%s, %s, %s)", rooms)
        print(f"[DB] {len(rooms)} oda olusturuldu.")
    else:
        cur.execute("UPDATE rooms SET capacity = 36 WHERE room_type != 'computer'")

    # Bilgisayar odalari kontrolu
    cur.execute("SELECT COUNT(*) FROM rooms WHERE room_type = 'computer'")
    if cur.fetchone()['count'] == 0:
        comp_rooms = [
            ('Bilgisayar Odası 1', 'computer', 20),
            ('Bilgisayar Odası 2', 'computer', 20),
        ]
        cur.executemany("INSERT INTO rooms (name, room_type, capacity) VALUES (%s, %s, %s)", comp_rooms)
        print(f"[DB] {len(comp_rooms)} bilgisayar odasi eklendi.")

    # 50 ornek kitap
    cur.execute("SELECT COUNT(*) FROM books")
    if cur.fetchone()['count'] == 0:
        books = [
            # Turk Edebiyati
            ('Saatleri Ayarlama Enstitusu', 'Ahmet Hamdi Tanpinar', 'ISBN-9789750719387'),
            ('Huzur', 'Ahmet Hamdi Tanpinar', 'ISBN-9789750731907'),
            ('Yaban', 'Yakup Kadri Karaosmanoglu', 'ISBN-9789754585193'),
            ('Tutunamayanlar', 'Oguz Atay', 'ISBN-9789750718892'),
            ('Tehlikeli Oyunlar', 'Oguz Atay', 'ISBN-9789750729218'),
            ('Ince Memed', 'Yasar Kemal', 'ISBN-9789750727689'),
            ('Bereketli Topraklar Uzerinde', 'Orhan Kemal', 'ISBN-9789750730009'),
            ('Sinekli Bakkal', 'Halide Edib Adivar', 'ISBN-9789750729416'),
            ('Kurk Mantolu Madonna', 'Sabahattin Ali', 'ISBN-9789750738500'),
            ('Icimizeki Seytan', 'Sabahattin Ali', 'ISBN-9789750722714'),
            ('Calikusu', 'Resat Nuri Guntekin', 'ISBN-9789750725494'),
            ('Yaprak Dokumu', 'Resat Nuri Guntekin', 'ISBN-9789750726477'),
            ('Kiralik Konak', 'Yakup Kadri Karaosmanoglu', 'ISBN-9789754585209'),
            ('Mor Salkimli Ev', 'Halide Edib Adivar', 'ISBN-9789750735578'),
            ('Dokuzuncu Hariciye Kogusu', 'Peyami Safa', 'ISBN-9789750726835'),
            ('Fatih Harbiye', 'Peyami Safa', 'ISBN-9789750727900'),
            ('Benim Adim Kirmizi', 'Orhan Pamuk', 'ISBN-9789750736353'),
            ('Kar', 'Orhan Pamuk', 'ISBN-9789750738197'),
            ('Sessiz Ev', 'Orhan Pamuk', 'ISBN-9789750725296'),
            ('Masumiyet Muzesi', 'Orhan Pamuk', 'ISBN-9789750737091'),
            # Dunya Klasikleri
            ('Suc ve Ceza', 'Fyodor Dostoyevski', 'ISBN-9789753427944'),
            ('Karamazov Kardesler', 'Fyodor Dostoyevski', 'ISBN-9789753427951'),
            ('Budala', 'Fyodor Dostoyevski', 'ISBN-9789753428132'),
            ('Savas ve Baris', 'Lev Tolstoy', 'ISBN-9789753428224'),
            ('Anna Karenina', 'Lev Tolstoy', 'ISBN-9789753428217'),
            ('Dirilis', 'Lev Tolstoy', 'ISBN-9789753428231'),
            ('Donusum', 'Franz Kafka', 'ISBN-9789750741296'),
            ('Dava', 'Franz Kafka', 'ISBN-9789750741302'),
            ('Sato', 'Franz Kafka', 'ISBN-9789750741319'),
            ('Yuzyillik Yalnizlik', 'Gabriel Garcia Marquez', 'ISBN-9789750726514'),
            ('Ask ve Obur Cinler', 'Gabriel Garcia Marquez', 'ISBN-9789750726521'),
            ('1984', 'George Orwell', 'ISBN-9789750718936'),
            ('Hayvan Ciftligi', 'George Orwell', 'ISBN-9789750718943'),
            ('Cesur Yeni Dunya', 'Aldous Huxley', 'ISBN-9789750726088'),
            ('Simyaci', 'Paulo Coelho', 'ISBN-9789750726095'),
            ('Ucurtma Avcisi', 'Khaled Hosseini', 'ISBN-9789750742316'),
            ('Bin Muhtesem Gunes', 'Khaled Hosseini', 'ISBN-9789750742323'),
            ('Kucuk Prens', 'Antoine de Saint-Exupery', 'ISBN-9789750728044'),
            ('Simsek Hirsizi', 'Rick Riordan', 'ISBN-9789750742330'),
            ('Harry Potter ve Felsefe Tasi', 'J.K. Rowling', 'ISBN-9789750742347'),
            # Felsefe ve Bilim
            ('Sofienin Dunyasi', 'Jostein Gaarder', 'ISBN-9789750726101'),
            ('Insanligin Kisa Tarihcesi (Sapiens)', 'Yuval Noah Harari', 'ISBN-9789750726118'),
            ('Homo Deus', 'Yuval Noah Harari', 'ISBN-9789750726125'),
            ('Beyindeki Felsefe', 'Peter Brooksmith', 'ISBN-9789750726132'),
            ('Varlik ve Hiclik', 'Jean-Paul Sartre', 'ISBN-9789750741326'),
            ('Ahlak ve Soybirim', 'Friedrich Nietzsche', 'ISBN-9789750741333'),
            ('Boyle Buyurdu Zerdust', 'Friedrich Nietzsche', 'ISBN-9789750741340'),
            ('Devlet', 'Platon', 'ISBN-9789750741357'),
            ('Nikomakhos Etik', 'Aristoteles', 'ISBN-9789750741364'),
            ('Meditations', 'Marcus Aurelius', 'ISBN-9789750741371'),
        ]
        cur.executemany(
            "INSERT INTO books (title, author, barcode, status) VALUES (%s, %s, %s, 'available')",
            books
        )
        print(f"[DB] {len(books)} ornek kitap eklendi.")

    conn.commit()
    cur.close()
    conn.close()
    print("[DB] Tum veriler hazir.")
