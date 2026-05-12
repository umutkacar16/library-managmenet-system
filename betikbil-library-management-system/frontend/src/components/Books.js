import React, { useState, useEffect } from 'react';
import { useAuth, authFetch } from '../context/AuthContext';
import './Books.css';

function getTrustZone(score) {
  if (score < 30) return { label: 'Kirmizi Alan', color: 'var(--danger)', limit: 1 };
  if (score > 80) return { label: 'Yesil Alan', color: 'var(--success)', limit: 5 };
  return { label: 'Notr Alan', color: 'var(--warning)', limit: 3 };
}

const STATUS_MAP = {
  available: 'Musait',
  reserved: 'Rezerve',
  borrowed: 'Oduncte',
  pending: 'Onay Bekliyor',
  approved: 'Oduncte',
  returned: 'Iade Edildi',
  cancelled: 'Iptal'
};

function Books() {
  const { user, token, refreshUser } = useAuth();
  const [query, setQuery] = useState('');
  const [books, setBooks] = useState([]);
  const [myBorrows, setMyBorrows] = useState([]);
  const [filter, setFilter] = useState('all'); // all, available, borrowed
  const [msg, setMsg] = useState('');

  // Sadece ilk yuklemede url'den gelen arama parametresi var mi diye bakalim
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const initialQuery = urlParams.get('q');
    if (initialQuery) {
      setQuery(initialQuery);
      fetchBooks(initialQuery);
    } else {
      fetchBooks('');
    }
  }, []);

  const fetchBooks = async (searchQuery = '') => {
    try {
      const res = await fetch(`http://localhost:5000/api/books?q=${encodeURIComponent(searchQuery)}`);
      const data = await res.json();
      setBooks(data);
    } catch (e) {
      console.error(e);
    }
  };

  const handleSearch = () => {
    fetchBooks(query);
  };

  const fetchMyBorrows = async () => {
    if (!token) return;
    try {
      const res = await authFetch(token, 'http://localhost:5000/api/my-borrows');
      const data = await res.json();
      if (res.ok) setMyBorrows(data);
    } catch (e) {}
  };

  useEffect(() => { fetchMyBorrows(); }, [token]);

  const showMsg = (text) => { setMsg(text); setTimeout(() => setMsg(''), 5000); };

  const borrow = async (bookId) => {
    if (!token) { showMsg('error:Lutfen once giris yapin.'); return; }
    const res = await authFetch(token, 'http://localhost:5000/api/borrow', {
      method: 'POST',
      body: JSON.stringify({ book_id: bookId })
    });
    const data = await res.json();
    if (res.ok) {
      showMsg(`ok:${data.message}`);
      fetchBooks(query); 
      fetchMyBorrows(); 
      refreshUser();
    } else {
      showMsg(`error:${data.error}`);
    }
  };

  const zone = user ? getTrustZone(user.trust_score) : null;
  const [msgType, msgText] = msg ? msg.split(':') : ['', ''];

  // Kategori filtrelemesi
  const filteredBooks = books.filter(b => {
    if (filter === 'all') return true;
    if (filter === 'available') return b.status === 'available';
    if (filter === 'borrowed') return b.status !== 'available';
    return true;
  });

  return (
    <div className="books-container fade-in">
      <h2>Kitaplar ve Dijital Envanter</h2>

      {user && (
        <div className="trust-bar glass-panel">
          <div className="trust-bar-inner">
            <div>
              <div className="trust-bar-label">Guven Skoru</div>
              <div className="trust-bar-row">
                <div className="score-bar-bg">
                  <div className="score-bar-fill" style={{ width: `${user.trust_score}%`, background: zone.color }}></div>
                </div>
                <strong style={{ color: zone.color, fontSize: '1.2rem' }}>{user.trust_score}</strong>
                <span className="zone-badge" style={{ background: `${zone.color}22`, color: zone.color, border: `1px solid ${zone.color}44` }}>
                  {zone.label}
                </span>
              </div>
            </div>
            <div className="trust-bar-stats">
              <div className="trust-stat-label">Kiralama Limiti</div>
              <div className="trust-stat-value">{zone.limit} Kitap</div>
              {user.total_debt > 0 && (
                <div className="trust-debt">Borc: {Number(user.total_debt).toFixed(2)} TL</div>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="books-controls">
        <div className="search-bar">
          <input
            type="text"
            id="book-search-input"
            placeholder="Kitap adi, yazar veya barkod ile arayin..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          />
          <button className="btn btn-primary" onClick={handleSearch}>Ara</button>
        </div>
        
        <div className="filter-group">
          <button 
            className={`filter-btn ${filter === 'all' ? 'active' : ''}`} 
            onClick={() => setFilter('all')}>Tumu ({books.length})
          </button>
          <button 
            className={`filter-btn ${filter === 'available' ? 'active' : ''}`} 
            onClick={() => setFilter('available')}>Musait Olanlar
          </button>
          <button 
            className={`filter-btn ${filter === 'borrowed' ? 'active' : ''}`} 
            onClick={() => setFilter('borrowed')}>Odunc Alinanlar
          </button>
        </div>
      </div>

      {msg && (
        <div className={`msg-banner ${msgType === 'ok' ? 'msg-ok' : 'msg-error'}`}>
          {msgText}
        </div>
      )}

      <div className="books-grid">
        {filteredBooks.length === 0 ? (
          <p className="empty-state">Aradiginiz kriterlere uygun kitap bulunamadi.</p>
        ) : filteredBooks.map(book => (
          <div key={book.id} className="book-card glass-panel">
            <div className="book-info">
              <div className="book-title">{book.title}</div>
              <div className="book-author">{book.author}</div>
              <div className="book-barcode">{book.barcode}</div>
            </div>
            <div className="book-action">
              <span className={`status-badge status-${book.status}`}>
                {STATUS_MAP[book.status] || book.status}
              </span>
              {book.status === 'available' && user && (
                <button className="btn btn-primary btn-sm" onClick={() => borrow(book.id)}>
                  Odunc Al
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {myBorrows.length > 0 && (
        <div style={{ marginTop: '50px' }}>
          <h3 style={{ marginBottom: '16px' }}>Gecmis ve Aktif Kiralamalarim</h3>
          <div className="history-list">
            {myBorrows.map(b => (
              <div key={b.id} className="history-card glass-panel">
                <div className="book-info" style={{ marginBottom: 0 }}>
                  <div className="book-title">{b.title}</div>
                  <div className="book-author">{b.author}</div>
                  {b.due_time && (
                    <div className="book-due">
                      Iade tarihi: {new Date(b.due_time).toLocaleDateString('tr-TR')}
                    </div>
                  )}
                </div>
                <div className="book-action">
                  <span className={`status-badge status-${b.status}`}>
                    {STATUS_MAP[b.status] || b.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default Books;
