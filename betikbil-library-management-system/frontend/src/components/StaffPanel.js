import React, { useState, useEffect } from 'react';
import { useAuth, authFetch } from '../context/AuthContext';

const STATUS_TR = {
  approved: 'Oduncte',
  pending: 'Onay Bekliyor',
  returned: 'Iade Edildi',
  cancelled: 'Iptal',
  reserved: 'Rezerve',
  active: 'Aktif',
  force_closed: 'Zorla Kapatildi'
};

function StaffPanel() {
  const { token } = useAuth();
  const [tab, setTab] = useState('pending');
  const [pending, setPending] = useState([]);
  const [active, setActive] = useState([]);
  const [activeRooms, setActiveRooms] = useState([]);
  const [users, setUsers] = useState([]);
  const [payments, setPayments] = useState([]);
  const [newBook, setNewBook] = useState({ title: '', author: '', barcode: '' });
  const [msg, setMsg] = useState('');

  const fetchAll = async () => {
    const [p, a, r, u, pay] = await Promise.all([
      authFetch(token, 'http://localhost:5000/api/staff/pending-borrows').then(r => r.json()),
      authFetch(token, 'http://localhost:5000/api/staff/active-borrows').then(r => r.json()),
      authFetch(token, 'http://localhost:5000/api/staff/active-reservations').then(r => r.json()),
      authFetch(token, 'http://localhost:5000/api/admin/users').then(r => r.json()),
      authFetch(token, 'http://localhost:5000/api/staff/payments').then(r => r.json()),
    ]);
    setPending(Array.isArray(p) ? p : []);
    setActive(Array.isArray(a) ? a : []);
    setActiveRooms(Array.isArray(r) ? r : []);
    setUsers(Array.isArray(u) ? u : []);
    setPayments(Array.isArray(pay) ? pay : []);
  };

  useEffect(() => { if (token) fetchAll(); }, [token]);

  const showMsg = (text) => { setMsg(text); setTimeout(() => setMsg(''), 4000); };

  const approveBorrow = async (id) => {
    const res = await authFetch(token, `http://localhost:5000/api/borrow/${id}/approve`, { method: 'POST' });
    const d = await res.json();
    showMsg(res.ok ? `ok:${d.message}` : `error:${d.error}`);
    if (res.ok) fetchAll();
  };

  const returnBook = async (id) => {
    const res = await authFetch(token, `http://localhost:5000/api/borrow/${id}/return`, { method: 'POST' });
    const d = await res.json();
    showMsg(res.ok ? `ok:${d.message}` : `error:${d.error}`);
    if (res.ok) fetchAll();
  };

  const forceCheckout = async (id) => {
    if (!window.confirm('Kullanıcının masayı terk ettiğini ve çıkış yapmadığını onaylıyor musunuz? (Üyeye -10 puan düşülecek ve 25 TL sabit ceza yansıtılacaktır.)')) return;
    const res = await authFetch(token, `http://localhost:5000/api/reservations/${id}/force-checkout`, { method: 'POST' });
    const d = await res.json();
    showMsg(res.ok ? `ok:${d.message}` : `error:${d.error}`);
    if (res.ok) fetchAll();
  };

  const clearDebt = async (uid) => {
    const res = await authFetch(token, `http://localhost:5000/api/staff/clear-debt/${uid}`, { method: 'POST' });
    const d = await res.json();
    showMsg(res.ok ? `ok:${d.message}` : `error:${d.error}`);
    if (res.ok) fetchAll();
  };

  const addBook = async () => {
    if (!newBook.title || !newBook.barcode) { showMsg('error:Baslik ve barkod zorunludur.'); return; }
    const res = await authFetch(token, 'http://localhost:5000/api/books', {
      method: 'POST', body: JSON.stringify(newBook)
    });
    const d = await res.json();
    showMsg(res.ok ? `ok:${d.message}` : `error:${d.error}`);
    if (res.ok) setNewBook({ title: '', author: '', barcode: '' });
  };

  const tabs = [
    { id: 'pending', label: `Onay Bekleyen (${pending.length})` },
    { id: 'active', label: `Aktif Kiralamalar (${active.length})` },
    { id: 'rooms', label: `Aktif Odalar (${activeRooms.length})` },
    { id: 'users', label: `Uyeler (${users.length})` },
    { id: 'payments', label: `Odemeler (${payments.length})` },
    { id: 'books', label: 'Kitap Ekle' },
  ];

  const getTrustColor = (s) => s < 30 ? 'var(--danger)' : s > 80 ? 'var(--success)' : 'var(--warning)';
  const [msgType, msgText] = msg ? msg.split(':') : ['', ''];

  const tableHeaderStyle = { textAlign: 'left', padding: '8px 12px', color: 'var(--text-muted)', fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.5px', borderBottom: '1px solid var(--glass-border)', fontWeight: '600' };
  const tableCellStyle = { padding: '12px 12px', borderBottom: '1px solid rgba(255,255,255,0.03)', fontSize: '0.9rem' };

  return (
    <div className="fade-in" style={{ maxWidth: '1000px', margin: '0 auto' }}>
      <h2 style={{ marginBottom: '24px' }}>Kutuphane Gorevlisi Paneli</h2>

      {msg && (
        <div style={{ padding: '10px 16px', borderRadius: '8px', marginBottom: '16px', fontSize: '0.875rem', fontWeight: '500',
          background: msgType === 'ok' ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)',
          color: msgType === 'ok' ? 'var(--success)' : 'var(--danger)',
          border: `1px solid ${msgType === 'ok' ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)'}` }}>
          {msgText}
        </div>
      )}

      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '24px', borderBottom: '1px solid var(--glass-border)', paddingBottom: '0' }}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            padding: '8px 18px', border: 'none', background: 'transparent', cursor: 'pointer', fontSize: '0.875rem',
            fontWeight: tab === t.id ? '700' : '500',
            color: tab === t.id ? 'var(--primary)' : 'var(--text-muted)',
            borderBottom: tab === t.id ? '2px solid var(--primary)' : '2px solid transparent',
            marginBottom: '-1px', transition: 'all 0.15s'
          }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* PENDING BORROWS */}
      {tab === 'pending' && (
        <div>
          {pending.length === 0 ? (
            <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '40px' }}>Onay bekleyen talep yok.</p>
          ) : pending.map(b => (
            <div key={b.id} className="glass-panel" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', padding: '16px 18px' }}>
              <div>
                <div style={{ fontWeight: '600', marginBottom: '4px' }}>{b.title}</div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontFamily: 'monospace' }}>{b.barcode}</div>
                <div style={{ marginTop: '6px', fontSize: '0.875rem' }}>
                  Kullanici: <strong>{b.username}</strong>
                  <span style={{ marginLeft: '10px', fontSize: '0.78rem', fontWeight: '700', color: getTrustColor(b.trust_score) }}>
                    Guven: {b.trust_score}
                  </span>
                </div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                  {new Date(b.request_time).toLocaleString('tr-TR')}
                </div>
              </div>
              <button className="btn btn-primary" onClick={() => approveBorrow(b.id)}>Onayla</button>
            </div>
          ))}
        </div>
      )}

      {/* ACTIVE BORROWS */}
      {tab === 'active' && (
        <div>
          {active.length === 0 ? (
            <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '40px' }}>Aktif kiralama yok.</p>
          ) : active.map(b => {
            const isOverdue = new Date(b.due_time) < new Date();
            return (
              <div key={b.id} className="glass-panel" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', padding: '16px 18px', borderColor: isOverdue ? 'rgba(239,68,68,0.4)' : undefined }}>
                <div>
                  <div style={{ fontWeight: '600', marginBottom: '4px' }}>{b.title}</div>
                  <div style={{ fontSize: '0.875rem' }}>
                    Kullanici: <strong>{b.username}</strong>
                    {b.total_debt > 0 && (
                      <span style={{ marginLeft: '10px', fontSize: '0.8rem', color: b.total_debt > 50 ? 'var(--danger)' : 'var(--warning)', fontWeight: '600' }}>
                        Borc: {parseFloat(b.total_debt).toFixed(2)} TL
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: '0.8rem', marginTop: '4px', color: isOverdue ? 'var(--danger)' : 'var(--text-muted)' }}>
                    {isOverdue ? 'GECIKTI — ' : ''}Iade: {new Date(b.due_time).toLocaleDateString('tr-TR')}
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <button className="btn" style={{ background: 'var(--success)', color: '#fff' }} onClick={() => returnBook(b.id)}>Iade Al</button>
                  {b.total_debt > 0 && (
                    <button className="btn" style={{ background: 'rgba(245,158,11,0.2)', color: 'var(--warning)', border: '1px solid rgba(245,158,11,0.4)', fontSize: '0.8rem' }} onClick={() => clearDebt(b.user_id)}>
                      Borc Sifirla
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ACTIVE ROOM RESERVATIONS */}
      {tab === 'rooms' && (
        <div>
          {activeRooms.length === 0 ? (
            <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '40px' }}>Aktif rezervasyon yok.</p>
          ) : activeRooms.map(r => (
            <div key={r.id} className="glass-panel" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', padding: '16px 18px' }}>
              <div>
                <div style={{ fontWeight: '600', marginBottom: '4px' }}>{r.room_name} — Koltuk {r.seat_number}</div>
                <div style={{ fontSize: '0.875rem' }}>Kullanici: <strong>{r.username}</strong></div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                  {new Date(r.start_time).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })} – {new Date(r.end_time).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}
                  {!r.check_in_time && <span style={{ color: 'var(--warning)', marginLeft: '10px', fontWeight: '600' }}>Check-in yapilmadi</span>}
                </div>
              </div>
              <button className="btn" style={{ background: 'rgba(239,68,68,0.2)', color: 'var(--danger)', border: '1px solid rgba(239,68,68,0.4)' }}
                onClick={() => forceCheckout(r.id)}>
                Masayı Boşalt
              </button>
            </div>
          ))}
        </div>
      )}

      {/* USERS */}
      {tab === 'users' && (
        <div className="glass-panel" style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={tableHeaderStyle}>Kullanici</th>
                <th style={tableHeaderStyle}>Rol</th>
                <th style={{ ...tableHeaderStyle, textAlign: 'center' }}>Guven Skoru</th>
                <th style={{ ...tableHeaderStyle, textAlign: 'right' }}>Borc</th>
                <th style={{ ...tableHeaderStyle, textAlign: 'center' }}>Islem</th>
              </tr>
            </thead>
            <tbody>
              {users.map(u => (
                <tr key={u.id}>
                  <td style={{ ...tableCellStyle, fontWeight: '600' }}>{u.username}</td>
                  <td style={{ ...tableCellStyle, color: 'var(--text-muted)' }}>{u.role}</td>
                  <td style={{ ...tableCellStyle, textAlign: 'center', fontWeight: '700', color: getTrustColor(u.trust_score) }}>{u.trust_score}</td>
                  <td style={{ ...tableCellStyle, textAlign: 'right', color: u.total_debt > 50 ? 'var(--danger)' : u.total_debt < 0 ? 'var(--success)' : 'var(--text-muted)', fontWeight: u.total_debt > 50 || u.total_debt < 0 ? '700' : '400' }}>
                    {u.total_debt < 0 ? `+${Math.abs(u.total_debt).toFixed(2)} TL (Bakiye)` : `${parseFloat(u.total_debt || 0).toFixed(2)} TL`}
                  </td>
                  <td style={{ ...tableCellStyle, textAlign: 'center' }}>
                    {u.total_debt > 0 && (
                      <button onClick={() => clearDebt(u.id)} style={{ padding: '4px 12px', borderRadius: '6px', border: '1px solid rgba(245,158,11,0.4)', background: 'rgba(245,158,11,0.1)', color: 'var(--warning)', cursor: 'pointer', fontSize: '0.78rem', fontWeight: '600' }}>
                        Borc Sifirla
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* PAYMENTS */}
      {tab === 'payments' && (
        <div className="glass-panel" style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={tableHeaderStyle}>Tarih</th>
                <th style={tableHeaderStyle}>Kullanici</th>
                <th style={tableHeaderStyle}>Islem Tipi</th>
                <th style={tableHeaderStyle}>Tutar</th>
                <th style={tableHeaderStyle}>Aciklama</th>
              </tr>
            </thead>
            <tbody>
              {payments.map(p => (
                <tr key={p.id}>
                  <td style={{ ...tableCellStyle, color: 'var(--text-muted)' }}>{new Date(p.created_at).toLocaleString('tr-TR')}</td>
                  <td style={{ ...tableCellStyle, fontWeight: '600' }}>{p.username}</td>
                  <td style={{ ...tableCellStyle }}>
                    <span style={{ padding: '4px 8px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 'bold', background: p.type === 'payment' ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)', color: p.type === 'payment' ? 'var(--success)' : 'var(--danger)' }}>
                      {p.type === 'payment' ? 'TAHSILAT' : 'UCRET YANSIMASI'}
                    </span>
                  </td>
                  <td style={{ ...tableCellStyle, fontWeight: '700', color: p.type === 'payment' ? 'var(--success)' : 'var(--danger)' }}>
                    {p.type === 'payment' ? '+' : '-'}{parseFloat(p.amount).toFixed(2)} TL
                  </td>
                  <td style={{ ...tableCellStyle, color: 'var(--text-muted)' }}>{p.description}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ADD BOOK */}
      {tab === 'books' && (
        <div>
          <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', gap: '14px', maxWidth: '500px', padding: '24px' }}>
            <div className="input-group">
              <label>Kitap Basligi <span style={{ color: 'var(--danger)' }}>*</span></label>
              <input type="text" placeholder="Ornek: Suc ve Ceza" value={newBook.title} onChange={(e) => setNewBook({ ...newBook, title: e.target.value })} />
            </div>
            <div className="input-group">
              <label>Yazar</label>
              <input type="text" placeholder="Ornek: Dostoyevski" value={newBook.author} onChange={(e) => setNewBook({ ...newBook, author: e.target.value })} />
            </div>
            <div className="input-group">
              <label>Barkod <span style={{ color: 'var(--danger)' }}>*</span></label>
              <input type="text" placeholder="ISBN veya ozel barkod" value={newBook.barcode} onChange={(e) => setNewBook({ ...newBook, barcode: e.target.value })} />
            </div>
            <button className="btn btn-primary" onClick={addBook}>Kitabi Ekle</button>
          </div>
        </div>
      )}
    </div>
  );
}

export default StaffPanel;
