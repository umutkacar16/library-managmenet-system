import React, { useState, useEffect } from 'react';
import { useAuth, authFetch } from '../context/AuthContext';
import './AdminDashboard.css';

function StatCard({ label, value, color = 'var(--primary)', sub }) {
  return (
    <div className="stat-card glass-panel">
      <div className="stat-value" style={{ color }}>{value}</div>
      <div className="stat-label">{label}</div>
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  );
}

function AdminDashboard() {
  const { token } = useAuth();
  const [data, setData] = useState(null);
  const [msg, setMsg] = useState('');
  const [scoreForm, setScoreForm] = useState({ user_id: '', delta: '' });
  const [users, setUsers] = useState([]);
  const [closures, setClosures] = useState([]);
  const [closureForm, setClosureForm] = useState({ start_time: '', end_time: '', reason: '' });
  const [selectedRoomSeats, setSelectedRoomSeats] = useState(null);
  const [seatsData, setSeatsData] = useState([]);
  const [workingHours, setWorkingHours] = useState([]);

  const tzOffset = (new Date()).getTimezoneOffset() * 60000;
  const nowLocalStr = (new Date(Date.now() - tzOffset)).toISOString().slice(0, 16);

  const fetchData = async () => {
    const res = await authFetch(token, 'http://localhost:5000/api/admin/dashboard');
    if (res.ok) setData(await res.json());
    const ur = await authFetch(token, 'http://localhost:5000/api/admin/users');
    if (ur.ok) setUsers(await ur.json());
    fetchClosures();
    fetchWorkingHours();
  };

  const fetchClosures = async () => {
    const res = await authFetch(token, 'http://localhost:5000/api/admin/closures');
    if (res.ok) setClosures(await res.json());
  };

  const fetchWorkingHours = async () => {
    const res = await authFetch(token, 'http://localhost:5000/api/admin/working-hours');
    if (res.ok) setWorkingHours(await res.json());
  };

  const saveWorkingHours = async () => {
    const res = await authFetch(token, 'http://localhost:5000/api/admin/working-hours', {
      method: 'PUT',
      body: JSON.stringify(workingHours)
    });
    const d = await res.json();
    showMsg(res.ok ? `ok:${d.message}` : `error:${d.error}`);
  };

  useEffect(() => { if (token) fetchData(); }, [token]);

  const showMsg = (text) => { setMsg(text); setTimeout(() => setMsg(''), 4000); };

  const toggleRoom = async (roomId) => {
    const res = await authFetch(token, `http://localhost:5000/api/rooms/${roomId}/toggle-disable`, { method: 'POST' });
    const d = await res.json();
    showMsg(res.ok ? `ok:${d.message}` : `error:${d.error}`);
    if (res.ok) fetchData();
  };

  const adjustScore = async () => {
    if (!scoreForm.user_id || !scoreForm.delta) { showMsg('error:Lutfen kullanici ve puan girin.'); return; }
    const res = await authFetch(token, 'http://localhost:5000/api/admin/adjust-score', {
      method: 'POST', body: JSON.stringify({ user_id: parseInt(scoreForm.user_id), delta: parseInt(scoreForm.delta) })
    });
    const d = await res.json();
    showMsg(res.ok ? `ok:${d.message}` : `error:${d.error}`);
    if (res.ok) { setScoreForm({ user_id: '', delta: '' }); fetchData(); }
  };

  const addClosure = async () => {
    if (!closureForm.start_time || !closureForm.end_time || !closureForm.reason) { showMsg('error:Tum alanlari doldurun.'); return; }
    const startVal = new Date(closureForm.start_time);
    const endVal = new Date(closureForm.end_time);
    const now = new Date();
    if (startVal < now) {
      showMsg('error:Gecmis bir tarihe tatil/kapali donem ekleyemezsiniz.');
      return;
    }
    if (endVal <= startVal) {
      showMsg('error:Bitis tarihi baslangic tarihinden sonra olmalidir.');
      return;
    }
    const res = await authFetch(token, 'http://localhost:5000/api/admin/closures', {
      method: 'POST', body: JSON.stringify(closureForm)
    });
    const d = await res.json();
    showMsg(res.ok ? `ok:${d.message}` : `error:${d.error}`);
    if (res.ok) { setClosureForm({ start_time: '', end_time: '', reason: '' }); fetchClosures(); }
  };

  const deleteClosure = async (id) => {
    if (!window.confirm("Bu kapali donemi silmek istediginize emin misiniz?")) return;
    const res = await authFetch(token, `http://localhost:5000/api/admin/closures/${id}`, { method: 'DELETE' });
    const d = await res.json();
    showMsg(res.ok ? `ok:${d.message}` : `error:${d.error}`);
    if (res.ok) fetchClosures();
  };

  const openSeatModal = async (room) => {
    setSelectedRoomSeats(room);
    const res = await authFetch(token, `http://localhost:5000/api/rooms/${room.id}/seats`);
    if (res.ok) {
      const d = await res.json();
      setSeatsData(d.seats);
    }
  };

  const toggleSeatStatus = async (seatNum) => {
    const res = await authFetch(token, `http://localhost:5000/api/rooms/${selectedRoomSeats.id}/toggle-seat`, {
      method: 'POST', body: JSON.stringify({ seat_number: seatNum })
    });
    const d = await res.json();
    showMsg(res.ok ? `ok:${d.message}` : `error:${d.error}`);
    if (res.ok) {
      // update local
      setSeatsData(seatsData.map(s => s.seat_number === seatNum ? { ...s, is_disabled: !s.is_disabled } : s));
    }
  };

  const handleSeatClick = async (seat) => {
    if (seat.is_occupied) {
      if (window.confirm(`Bu koltuk dolu. Rezervasyonu iptal edip koltuğu boşaltmak istiyor musunuz? Kullanıcıya ceza uygulanacaktır.`)) {
        const res = await authFetch(token, `http://localhost:5000/api/reservations/${seat.reservation_id}/force-checkout`, { method: 'POST' });
        const d = await res.json();
        showMsg(res.ok ? `ok:${d.message}` : `error:${d.error}`);
        if (res.ok) {
          openSeatModal(selectedRoomSeats); // refresh seats
          fetchData(); // refresh occupancy
        }
      }
    } else {
      toggleSeatStatus(seat.seat_number);
    }
  };

  const [msgType, msgText] = msg ? msg.split(':') : ['', ''];

  if (!data) return <div style={{ textAlign: 'center', marginTop: '60px', color: 'var(--text-muted)' }}>Yukleniyor...</div>;

  const getTrustColor = (s) => s < 30 ? 'var(--danger)' : s > 80 ? 'var(--success)' : 'var(--warning)';

  return (
    <div className="admin-container fade-in">
      <h2 style={{ marginBottom: '24px' }}>Yonetici Paneli</h2>

      {msg && (
        <div style={{ padding: '10px 16px', borderRadius: '8px', marginBottom: '16px', fontSize: '0.875rem', fontWeight: '500',
          background: msgType === 'ok' ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)',
          color: msgType === 'ok' ? 'var(--success)' : 'var(--danger)',
          border: `1px solid ${msgType === 'ok' ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)'}` }}>
          {msgText}
        </div>
      )}

      {/* KPI Cards */}
      <div className="stats-grid">
        <StatCard label="Aktif Rezervasyon" value={data.active_reservations} color="var(--primary)" />
        <StatCard label="Odunc Kitap" value={data.active_borrows} color="var(--success)" />
        <StatCard label="Onay Bekleyen" value={data.pending_borrows} color="var(--warning)" />
        <StatCard label="Toplam Borc" value={`${data.total_debt_tl.toFixed(2)} TL`} color="var(--danger)" />
        <StatCard label="Aylık Ceza Geliri" value={`${(data.monthly_penalty_revenue || 0).toFixed(2)} TL`} color="var(--primary)" />
        <StatCard label="Toplam Uye" value={data.total_members} color="var(--text-muted)" />
        <StatCard label="Kirmizi Alan Uye" value={data.red_zone_users} color="var(--danger)" sub="Guven < 30" />
      </div>

      {/* Top Books */}
      <div className="section glass-panel">
        <h3>En Çok Okunan Kitaplar (Bu Ay)</h3>
        {data.top_books && data.top_books.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {data.top_books.map((book, idx) => (
              <div key={idx} style={{ display: 'flex', alignItems: 'center', background: 'rgba(255,255,255,0.05)', padding: '12px 16px', borderRadius: '8px' }}>
                <div style={{ fontSize: '1.2rem', fontWeight: 'bold', color: 'var(--primary)', width: '30px' }}>#{idx + 1}</div>
                <div style={{ flex: 1, fontWeight: '600' }}>{book.title}</div>
                <div style={{ fontWeight: 'bold', background: 'rgba(16,185,129,0.2)', color: 'var(--success)', padding: '4px 10px', borderRadius: '12px', fontSize: '0.85rem' }}>
                  {book.read_count} Okunma
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p style={{ color: 'var(--text-muted)' }}>Bu ay henüz kitap okunmamış.</p>
        )}
      </div>

      {/* Calendar Management */}
      <div className="section glass-panel">
        <h3>Kütüphane Takvimi (Tatiller / Kapalı Günler)</h3>
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: '20px' }}>
          <div>
            <label style={{ display: 'block', marginBottom: '6px', color: 'var(--text-muted)', fontSize: '0.78rem' }}>Başlangıç</label>
            <input type="datetime-local" min={nowLocalStr} value={closureForm.start_time} onChange={(e) => setClosureForm({ ...closureForm, start_time: e.target.value })} />
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: '6px', color: 'var(--text-muted)', fontSize: '0.78rem' }}>Bitiş</label>
            <input type="datetime-local" min={closureForm.start_time || nowLocalStr} value={closureForm.end_time} onChange={(e) => setClosureForm({ ...closureForm, end_time: e.target.value })} />
          </div>
          <div style={{ flex: 1 }}>
            <label style={{ display: 'block', marginBottom: '6px', color: 'var(--text-muted)', fontSize: '0.78rem' }}>Sebep (Örn: Resmi Tatil)</label>
            <input type="text" value={closureForm.reason} onChange={(e) => setClosureForm({ ...closureForm, reason: e.target.value })} />
          </div>
          <button className="btn btn-primary" onClick={addClosure}>Ekle</button>
        </div>
        {closures.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {closures.map(c => (
              <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', background: 'rgba(255,255,255,0.05)', padding: '10px 16px', borderRadius: '8px' }}>
                <div>
                  <div style={{ fontWeight: '600' }}>{c.reason}</div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                    {new Date(c.start_time).toLocaleString('tr-TR')} - {new Date(c.end_time).toLocaleString('tr-TR')}
                  </div>
                </div>
                <button className="btn btn-danger" style={{ padding: '4px 10px', fontSize: '0.8rem' }} onClick={() => deleteClosure(c.id)}>Sil</button>
              </div>
            ))}
          </div>
        ) : (
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Eklenmiş kapalı dönem yok.</p>
        )}
      </div>

      {/* Working Hours */}
      <div className="section glass-panel">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h3>Çalışma Saatleri (Günlük)</h3>
          <button className="btn btn-primary" onClick={saveWorkingHours}>Kaydet</button>
        </div>
        <div style={{ display: 'grid', gap: '10px' }}>
          {workingHours.map((wh, idx) => {
            const days = ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar'];
            return (
              <div key={wh.day_of_week} style={{ display: 'flex', alignItems: 'center', gap: '15px', background: 'rgba(255,255,255,0.05)', padding: '10px 16px', borderRadius: '8px' }}>
                <div style={{ width: '100px', fontWeight: '600', color: wh.is_closed ? 'var(--danger)' : 'var(--text-main)' }}>
                  {days[wh.day_of_week - 1]}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', opacity: wh.is_closed ? 0.4 : 1 }}>
                  <input 
                    type="time" 
                    value={wh.open_time} 
                    disabled={wh.is_closed}
                    onChange={(e) => {
                      const newWh = [...workingHours];
                      newWh[idx].open_time = e.target.value;
                      setWorkingHours(newWh);
                    }}
                    style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid var(--glass-border)', color: 'white', padding: '4px 8px', borderRadius: '4px', fontFamily: 'inherit' }}
                  />
                  <span>-</span>
                  <input 
                    type="time" 
                    value={wh.close_time} 
                    disabled={wh.is_closed}
                    onChange={(e) => {
                      const newWh = [...workingHours];
                      newWh[idx].close_time = e.target.value;
                      setWorkingHours(newWh);
                    }}
                    style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid var(--glass-border)', color: 'white', padding: '4px 8px', borderRadius: '4px', fontFamily: 'inherit' }}
                  />
                </div>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', marginLeft: 'auto' }}>
                  <input 
                    type="checkbox" 
                    checked={wh.is_closed} 
                    onChange={(e) => {
                      const newWh = [...workingHours];
                      newWh[idx].is_closed = e.target.checked;
                      setWorkingHours(newWh);
                    }}
                  />
                  <span style={{ fontSize: '0.85rem', color: wh.is_closed ? 'var(--danger)' : 'var(--text-muted)' }}>Kapalı</span>
                </label>
              </div>
            );
          })}
        </div>
      </div>

      {/* Room Occupancy */}
      <div className="section glass-panel">
        <h3>Oda Doluluk Durumu</h3>
        <div className="rooms-admin-grid">
          {data.rooms.map(room => {
            const pct = room.capacity > 0 ? Math.round((room.occupied / room.capacity) * 100) : 0;
            const isDisabled = room.status === 'disabled';
            return (
              <div key={room.id} className={`room-admin-card ${isDisabled ? 'disabled' : ''}`}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <strong style={{ fontSize: '0.9rem' }}>{room.name}</strong>
                  <span style={{ fontSize: '0.72rem', fontWeight: '600', padding: '2px 8px', borderRadius: '6px',
                    background: isDisabled ? 'rgba(100,116,139,0.15)' : pct === 100 ? 'rgba(239,68,68,0.15)' : 'rgba(16,185,129,0.15)',
                    color: isDisabled ? 'var(--text-muted)' : pct === 100 ? 'var(--danger)' : 'var(--success)' }}>
                    {isDisabled ? 'Devre Disi' : `${room.occupied}/${room.capacity}`}
                  </span>
                </div>
                {!isDisabled && (
                  <div style={{ height: '5px', background: 'rgba(255,255,255,0.08)', borderRadius: '4px', overflow: 'hidden', marginBottom: '10px' }}>
                    <div style={{ width: `${pct}%`, height: '100%', borderRadius: '4px',
                      background: pct > 75 ? 'var(--danger)' : pct > 40 ? 'var(--warning)' : 'var(--success)',
                      transition: 'width 0.4s' }}></div>
                  </div>
                )}
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button onClick={() => toggleRoom(room.id)} className="room-toggle-btn" style={{
                    flex: 1,
                    background: isDisabled ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)',
                    color: isDisabled ? 'var(--success)' : 'var(--danger)',
                    border: `1px solid ${isDisabled ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)'}` }}>
                    {isDisabled ? 'Aktif Et' : 'Devre Disi Birak'}
                  </button>
                  <button onClick={() => openSeatModal(room)} className="room-toggle-btn" style={{
                    flex: 1,
                    background: 'rgba(255,255,255,0.1)',
                    color: 'white',
                    border: '1px solid var(--glass-border)' }}>
                    Koltukları Yönet
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Score Adjustment */}
      <div className="section glass-panel">
        <h3>Manuel Puan Iadesi</h3>
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div style={{ flex: 1, minWidth: '220px' }}>
            <label style={{ display: 'block', marginBottom: '6px', color: 'var(--text-muted)', fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: '600' }}>Kullanici</label>
            <select value={scoreForm.user_id} onChange={(e) => setScoreForm({ ...scoreForm, user_id: e.target.value })}
              style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid var(--glass-border)', background: 'rgba(15,23,42,0.6)', color: 'white', fontSize: '0.9rem' }}>
              <option value="">Secin...</option>
              {users.filter(u => ['member', 'student', 'teacher'].includes(u.role)).map(u => (
                <option key={u.id} value={u.id}>{u.username} (Skor: {u.trust_score})</option>
              ))}
            </select>
          </div>
          <div style={{ width: '130px' }}>
            <label style={{ display: 'block', marginBottom: '6px', color: 'var(--text-muted)', fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: '600' }}>Puan (+/-)</label>
            <input type="number" placeholder="ornek: 10" value={scoreForm.delta}
              onChange={(e) => setScoreForm({ ...scoreForm, delta: e.target.value })} />
          </div>
          <button className="btn btn-primary" onClick={adjustScore}>Uygula</button>
        </div>
      </div>

      {/* Users Table */}
      <div className="section glass-panel" style={{ overflowX: 'auto' }}>
        <h3>Uye Listesi ve Guven Skoru</h3>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              {['Kullanici', 'Guven Skoru', 'Alan', 'Borc'].map(h => (
                <th key={h} style={{ textAlign: h === 'Borc' ? 'right' : h === 'Guven Skoru' || h === 'Alan' ? 'center' : 'left', padding: '8px 12px', color: 'var(--text-muted)', fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.5px', borderBottom: '1px solid var(--glass-border)', fontWeight: '600' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {users.filter(u => ['member', 'student', 'teacher'].includes(u.role)).map(u => (
              <tr key={u.id}>
                <td style={{ padding: '11px 12px', fontWeight: '600', borderBottom: '1px solid rgba(255,255,255,0.03)' }}>{u.username}</td>
                <td style={{ padding: '11px 12px', textAlign: 'center', borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                    <div style={{ width: '80px', height: '5px', background: 'rgba(255,255,255,0.08)', borderRadius: '4px', overflow: 'hidden' }}>
                      <div style={{ width: `${u.trust_score}%`, height: '100%', borderRadius: '4px', background: getTrustColor(u.trust_score) }}></div>
                    </div>
                    <span style={{ color: getTrustColor(u.trust_score), fontWeight: '700', minWidth: '28px', fontSize: '0.9rem' }}>{u.trust_score}</span>
                  </div>
                </td>
                <td style={{ padding: '11px 12px', textAlign: 'center', borderBottom: '1px solid rgba(255,255,255,0.03)', fontSize: '0.78rem', fontWeight: '600', color: u.trust_score < 30 ? 'var(--danger)' : u.trust_score > 80 ? 'var(--success)' : 'var(--warning)' }}>
                  {u.trust_score < 30 ? 'Kirmizi' : u.trust_score > 80 ? 'Yesil' : 'Notr'}
                </td>
                <td style={{ padding: '11px 12px', textAlign: 'right', borderBottom: '1px solid rgba(255,255,255,0.03)', color: u.total_debt > 50 ? 'var(--danger)' : u.total_debt < 0 ? 'var(--success)' : 'var(--text-muted)', fontWeight: u.total_debt > 50 || u.total_debt < 0 ? '700' : '400' }}>
                  {u.total_debt < 0 ? `+${Math.abs(u.total_debt).toFixed(2)} TL (Bakiye)` : `${parseFloat(u.total_debt || 0).toFixed(2)} TL`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Seat Management Modal */}
      {selectedRoomSeats && (
        <div className="modal-overlay" onClick={(e) => { if (e.target.className === 'modal-overlay') setSelectedRoomSeats(null); }}>
          <div className="modal-content" style={{ maxWidth: '600px' }}>
            <h3>{selectedRoomSeats.name} - Koltuk Yönetimi</h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '16px' }}>
              Arızalı bilgisayarları veya sorunlu koltukları seçerek "Devre Dışı" bırakabilirsiniz (Gri renk).
            </p>
            <div className="cinema-container" style={{ transform: 'scale(0.9)', transformOrigin: 'top center', marginBottom: '-20px' }}>
              <div className="screen">EKRAN / TAHTA</div>
              <div className="seats-grid">
                {seatsData.map(seat => (
                  <div key={seat.seat_number}
                    className={`seat ${seat.is_disabled ? 'disabled' : seat.is_occupied ? 'occupied' : ''}`}
                    style={{ cursor: 'pointer', opacity: seat.is_disabled ? 0.3 : 1 }}
                    onClick={() => handleSeatClick(seat)}
                    title={`Koltuk ${seat.seat_number}`}>
                    {seat.seat_number}
                  </div>
                ))}
              </div>
              <div className="seat-legend" style={{ marginTop: '16px' }}>
                <div className="legend-item"><div className="legend-color available"></div> Aktif</div>
                <div className="legend-item"><div className="legend-color occupied"></div> Dolu</div>
                <div className="legend-item"><div className="legend-color" style={{ background: 'rgba(255,255,255,0.1)' }}></div> Devre Dışı</div>
              </div>
            </div>
            <div className="modal-actions" style={{ marginTop: '20px' }}>
              <button className="btn btn-primary" onClick={() => setSelectedRoomSeats(null)}>Kapat</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default AdminDashboard;
