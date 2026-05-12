# BetikBil Kütüphane Yönetim Sistemi

BetikBil, modern kütüphanelerin ihtiyaçlarını karşılamak üzere tasarlanmış, kapsamlı bir kütüphane ve çalışma alanı yönetim sistemidir. Kullanıcı güven skoru tabanlı ödünç alma sistemi, oda rezervasyonu ve bilgisayar odası kullanım takibi gibi gelişmiş özellikler sunar.

## 🚀 Özellikler

### 📚 Kitap Yönetimi ve Ödünç Alma
- **Gelişmiş Arama:** Başlık, yazar veya barkod numarasına göre kitap arama.
- **QR Barkod Tarayıcı:** Entegre QR/Barkod tarayıcı desteği ile hızlı kitap bulma.
- **Dinamik Ödünç Sistemi:** Kullanıcının güven skoruna göre değişen kitap alma limitleri.
- **Otomatik Ceza Sistemi:** Gecikmiş iadeler için otomatik güven puanı düşürme ve borç yansıtma.

### 🏢 Oda ve Çalışma Alanı Rezervasyonu
- **Koltuk Seçimi:** Odalardaki boş koltukları görsel olarak görme ve seçme.
- **Check-in/Check-out:** Rezervasyonların takibi için giriş ve çıkış sistemi.
- **15 Dakika Kuralı:** Rezerve edilen koltuğa 15 dakika içinde giriş yapılmazsa otomatik iptal.
- **Bilgisayar Odaları:** Dakika bazlı ücretlendirme yapılan özel bilgisayar odaları.

### ⚖️ Güven Skoru ve Borç Yönetimi
- **Güven Skoru (Trust Score):** Kullanıcı davranışlarına göre (zamanında iade, check-in ihlalleri vb.) artan veya azalan puan sistemi.
- **Borç Takibi:** Gecikme cezaları ve oda kullanım ücretlerinin takibi.
- **Kısıtlamalar:** Belirli bir borç limitini aşan veya güven skoru düşük olan kullanıcıların yeni işlem yapmasının engellenmesi.

### 🛠️ Personel ve Yönetici Panelleri
- **Personel Paneli:** Bekleyen talepleri onaylama, iade alma, borç tahsilatı ve aktif rezervasyon izleme.
- **Yönetici Dashboard:** Kütüphane doluluk oranları, gelir istatistikleri ve sistem genelindeki aktif işlemlerin özeti.
- **Çalışma Saatleri:** Haftalık çalışma saatlerinin ve özel tatil/kapanış tarihlerinin yönetimi.

## 🛠️ Teknoloji Yığını

### Backend
- **Framework:** Python Flask
- **Veritabanı:** PostgreSQL
- **Kimlik Doğrulama:** JWT (JSON Web Token)
- **Görev Zamanlayıcı:** APScheduler (Arka plan iptalleri ve cezalar için)
- **Güvenlik:** Bcrypt şifreleme

### Frontend
- **Kütüphane:** React
- **İkonlar:** Lucide-React
- **Styling:** Vanilla CSS (Modern UI)
- **HTTP Client:** Axios

## ⚙️ Kurulum

### 1. Veritabanı Hazırlığı
PostgreSQL üzerinde bir veritabanı oluşturun veya sistemin otomatik oluşturmasına izin verin. `backend/database.py` içindeki ayarları düzenleyebilirsiniz:
- Varsayılan DB: `library_db`
- Varsayılan Kullanıcı: `postgres`
- Varsayılan Şifre: `admin`

### 2. Backend Kurulumu
```bash
cd backend
python -m venv .venv
source .venv/bin/activate  # Windows için: .venv\Scripts\activate
pip install -r requirements.txt
python app.py
```
*Not: Backend ilk çalıştığında veritabanını otomatik olarak oluşturacak, tabloları kuracak ve örnek verileri (kitaplar, odalar, kullanıcılar) yükleyecektir.*

### 3. Frontend Kurulumu
```bash
cd frontend
npm install
npm start
```

## 🔐 Varsayılan Giriş Bilgileri

Sistem kurulumunda aşağıdaki demo kullanıcılar otomatik olarak oluşturulur:

| Rol | Kullanıcı Adı | Şifre |
| :--- | :--- | :--- |
| **Yönetici** | admin | admin |
| **Personel** | staff | staff |
| **Öğrenci** | student | student |
| **Öğretmen** | teacher | teacher |

## 📂 Proje Yapısı

```text
betikbil-library-management-system/
├── backend/                # Flask API
│   ├── app.py              # API endpoint'leri ve ana mantık
│   ├── database.py         # Veritabanı şeması ve ilklendirme
│   └── requirements.txt    # Python bağımlılıkları
├── frontend/               # React Uygulaması
│   ├── src/
│   │   ├── components/     # UI Bileşenleri (Admin, Auth, Books, Rooms...)
│   │   ├── context/        # AuthContext (Oturum yönetimi)
│   │   └── App.js          # Routing ve Ana Yapı
│   └── package.json        # JS bağımlılıkları
└── README.md
```

## 📝 Lisans
Bu proje eğitim ve geliştirme amaçlı hazırlanmıştır.
