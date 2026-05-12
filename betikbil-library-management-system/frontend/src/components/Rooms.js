import React, { useState, useEffect } from 'react';
import { useAuth, authFetch } from '../context/AuthContext';
import './Rooms.css';

function Rooms() {
  const { user, token } = useAuth();
  const [rooms, setRooms] = useState([]);
  const [myReservations, setMyReservations] = useState([]);
  const [selectedRoom, setSelectedRoom] = useState(null);
  const [duration, setDuration] = useState(1);
  const [seatMap, setSeatMap] = useState([]);
  const [selectedSeat, setSelectedSeat] = useState(null);
  const [startTime, setStartTime] = useState('');
  const [msg, setMsg] = useState('');
  const [closures, setClosures] = useState([]);

  const fetchRooms = async () => {
    try {
      let url = 'http://localhost:5000/api/rooms';
      const params = new URLSearchParams();
      params.append('duration_hours', duration);
      if (startTime) {
        params.append('start_time', startTime);
      }
      url += '?' + params.toString();
      
      const res = await fetch(url);
      const data = await res.json();
      setRooms(data);
    } catch {}
  };

  const fetchMyReservations = async () => {
    if (!token) return;
    try {
      const res = await authFetch(token, 'http://localhost:5000/api/my-reservations');
      const data = await res.json();
      if (res.ok) setMyReservations(data);
    } catch {}
  };

  const fetchSeats = async (roomId, hours, start) => {
    try {
      let url = `http://localhost:5000/api/rooms/${roomId}/seats?duration_hours=${hours}`;
      if (start) {
        url += `&start_time=${encodeURIComponent(start)}`;
      }
      const res = await fetch(url);
      const data = await res.json();
      if (res.ok) setSeatMap(data.seats || []);
    } catch {}
  };

  const fetchClosures = async () => {
    try {
      const res = await fetch('http://localhost:5000/api/admin/closures');
      if (res.ok) {
        const data = await res.json();
        const now = new Date();
        const upcoming = data.filter(c => new Date(c.end_time) > now);
        setClosures(upcoming);
      }
    } catch {}
  };

  useEffect(() => {
    fetchRooms();
  }, [startTime, duration]);

  useEffect(() => {
    fetchRooms();
    fetchMyReservations();
    fetchClosures();
    const interval = setInterval(() => {
      fetchRooms();
      fetchMyReservations();
    }, 30000);
    return () => clearInterval(interval);
  }, [token]);

  useEffect(() => {
    if (selectedRoom) {
      setSelectedSeat(null);
      fetchSeats(selectedRoom.id, duration, startTime);
    }
  }, [selectedRoom]);

  const showMsg = (text) => { setMsg(text); setTimeout(() => setMsg(''), 4000); };

  const handleBooking = async () => {
    if (!token) { showMsg('✗ Lütfen önce giriş yapın.'); return; }
    if (!selectedSeat) { showMsg('✗ Lütfen bir koltuk seçin!'); return; }
    
    const bodyParams = { room_id: selectedRoom.id, seat_number: selectedSeat, duration_hours: duration };
    if (startTime) {
      bodyParams.start_time = startTime;
    }
    
    const res = await authFetch(token, 'http://localhost:5000/api/reservations', {
      method: 'POST',
      body: JSON.stringify(bodyParams)
    });
    const data = await res.json();
    if (res.ok) {
      showMsg('✓ Rezervasyon başarılı! 15 dakika içinde Check-in yapın.');
      setSelectedRoom(null); setSelectedSeat(null);
      fetchRooms(); fetchMyReservations();
    } else {
      showMsg(`✗ ${data.error}`);
    }
  };

  const handleCheckIn = async (resId) => {
    const res = await authFetch(token, `http://localhost:5000/api/reservations/${resId}/checkin`, { method: 'POST' });
    const data = await res.json();
    if (res.ok) { showMsg('✓ Check-in başarılı!'); fetchMyReservations(); fetchRooms(); }
    else showMsg(`✗ ${data.error}`);
  };

  const handleCheckOut = async (resId) => {
    if (!window.confirm("Odadan çıkış yapmak istediğinize emin misiniz? (Bilgisayar odaları kullanım süresine göre ücretlendirilir)")) return;
    const res = await authFetch(token, `http://localhost:5000/api/reservations/${resId}/checkout`, { method: 'POST' });
    const data = await res.json();
    if (res.ok) { showMsg('✓ ' + data.message); fetchMyReservations(); fetchRooms(); }
    else showMsg(`✗ ${data.error}`);
  };

  return (
    <div className="rooms-container fade-in">
      <h2 style={{ marginBottom: '8px' }}>Çalışma Odaları ve Bilgisayarlar</h2>
      <p style={{ color: 'var(--text-muted)', marginBottom: '24px' }}>Kendinize uygun bir alan seçin ve rezervasyon yapın.</p>

      {closures.length > 0 && (
        <div style={{ background: 'rgba(239,68,68,0.1)', borderLeft: '4px solid var(--danger)', padding: '12px 16px', borderRadius: '4px', marginBottom: '20px' }}>
          <strong style={{ color: 'var(--danger)', display: 'block', marginBottom: '4px' }}>Dikkat - Kütüphane Kapalı Günler:</strong>
          {closures.map(c => (
            <div key={c.id} style={{ fontSize: '0.9rem', color: 'var(--text-main)' }}>
              • {new Date(c.start_time).toLocaleString('tr-TR')} - {new Date(c.end_time).toLocaleString('tr-TR')} : {c.reason}
            </div>
          ))}
        </div>
      )}

      <div className="glass-panel" style={{ padding: '20px', marginBottom: '24px', display: 'flex', gap: '20px', alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ flex: '1', minWidth: '250px' }}>
          <p style={{ fontSize:'0.9rem', color:'var(--text-muted)', marginBottom:'8px', fontWeight: 'bold' }}>Tarih ve Saat Seçin (Müsaitlik İçin):</p>
          <input 
            type="datetime-local" 
            value={startTime} 
            onChange={(e) => setStartTime(e.target.value)} 
            style={{ width: '100%', padding: '10px', background: 'rgba(255,255,255,0.05)', color: 'white', border: '1px solid var(--glass-border)', borderRadius: '8px', fontFamily: 'inherit' }}
          />
        </div>
        <div>
          <p style={{ fontSize:'0.9rem', color:'var(--text-muted)', marginBottom:'8px', fontWeight: 'bold' }}>Ne Kadar Kalacaksınız?</p>
          <div className="duration-selector" style={{ marginTop:0, display: 'flex', gap: '10px' }}>
            {[1, 2, 3].map(h => (
              <button key={h} className={`duration-btn ${duration === h ? 'selected' : ''}`} onClick={() => setDuration(h)} style={{ minWidth: '80px', padding: '10px', borderRadius: '8px', border: '1px solid var(--glass-border)', background: duration === h ? 'var(--primary)' : 'rgba(255,255,255,0.05)', color: 'white', cursor: 'pointer' }}>
                {h} Saat
              </button>
            ))}
          </div>
        </div>
      </div>

      {msg && (
        <div style={{ padding:'10px 16px', borderRadius:'8px', marginBottom:'12px',
          background: msg.startsWith('✓') ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)',
          color: msg.startsWith('✓') ? 'var(--success)' : 'var(--danger)',
          border:`1px solid ${msg.startsWith('✓') ? 'var(--success)' : 'var(--danger)'}` }}>
          {msg}
        </div>
      )}

      {!user && (
        <div style={{ padding:'10px', background:'rgba(239,68,68,0.1)', color:'var(--danger)', borderRadius:'8px', marginBottom:'10px' }}>
          Oda rezervasyonu için önce giriş yapın.
        </div>
      )}

      <div className="rooms-grid">
        {rooms.map(room => {
          const availCount = room.capacity - (room.occupied_seats || 0);
          const isDisabled = room.current_status === 'disabled';
          return (
            <div key={room.id}
              className={`room-card ${room.current_status}`}
              onClick={() => !isDisabled && room.current_status === 'available' && setSelectedRoom(room)}
              style={isDisabled ? { opacity: 0.4, cursor: 'not-allowed' } : {}}>
            <div className="room-icon" style={{ fontSize: '0.8rem', fontWeight: '800', letterSpacing: '1px', color: 'inherit' }}>ODA</div>
              <div className="room-name">{room.name}</div>
              <div style={{ fontSize:'0.85rem', color:'var(--text-muted)', marginBottom:'8px' }}>
                {isDisabled ? 'Devre Dışı' : availCount > 0 ? `${availCount}/${room.capacity} Boş` : 'Kapasite Dolu'}
              </div>
              <div className="room-status-badge">
                {isDisabled ? 'Kapalı' : room.current_status === 'available' ? 'Müsait' : 'Dolu'}
              </div>
            </div>
          );
        })}
      </div>

      {user && myReservations.length > 0 && (
        <div className="my-reservations">
          <h3>Aktif Rezervasyonlarım</h3>
          {myReservations.map(res => {
            const start = new Date(res.start_time).toLocaleTimeString('tr-TR', { hour:'2-digit', minute:'2-digit' });
            const end = new Date(res.end_time).toLocaleTimeString('tr-TR', { hour:'2-digit', minute:'2-digit' });
            return (
              <div key={res.id} className="reservation-item">
                <div>
                  <strong>{res.room_name} — Koltuk {res.seat_number}</strong><br />
                  <small style={{ color:'var(--text-muted)' }}>{start} – {end}</small><br />
                  <small style={{ color: res.status === 'cancelled' ? 'var(--danger)' : res.status === 'active' ? 'var(--success)' : 'var(--text-muted)' }}>
                    {res.status === 'reserved' ? '⏳ Onaylandı, check-in bekleniyor' : res.status === 'active' ? '✅ Aktif' : res.status === 'cancelled' ? '❌ İptal (15 dk)' : res.status.toUpperCase()}
                  </small>
                </div>
                <div>
                  {res.status === 'reserved' && !res.check_in_time && (
                    <button className="btn btn-checkin" onClick={() => handleCheckIn(res.id)}>Check-in</button>
                  )}
                  {res.status === 'active' && res.check_in_time && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                      <span style={{ color:'var(--success)', fontWeight:'bold' }}>Giriş Yapıldı</span>
                      <button className="btn btn-danger" onClick={() => handleCheckOut(res.id)}>Çıkış Yap (Check-out)</button>
                    </div>
                  )}
                  {res.status === 'completed' && <span style={{ color:'var(--text-muted)' }}>Tamamlandı</span>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {selectedRoom && (
        <div className="modal-overlay" onClick={(e) => { if (e.target.className === 'modal-overlay') { setSelectedRoom(null); setSelectedSeat(null); } }}>
          <div className="modal-content">
            <h3>{selectedRoom.name} Rezervasyonu</h3>

            <p style={{ fontSize:'0.9rem', color:'var(--text-muted)', marginTop:'10px', marginBottom:'5px' }}>Koltuk Seçin:</p>
            <div className="cinema-container">
              <div className="screen">TAHTA / EKRAN</div>
              <div className="seats-grid">
                {seatMap.map(seat => (
                  <div key={seat.seat_number}
                    className={`seat ${seat.is_disabled ? 'disabled' : seat.is_occupied ? 'occupied' : ''} ${selectedSeat === seat.seat_number ? 'selected' : ''}`}
                    onClick={() => !seat.is_disabled && !seat.is_occupied && setSelectedSeat(seat.seat_number)}
                    title={seat.is_disabled ? 'Devre Dışı' : seat.is_occupied ? 'Dolu' : `Koltuk ${seat.seat_number}`}
                    style={{ opacity: seat.is_disabled ? 0.3 : 1 }}>
                    {seat.seat_number}
                  </div>
                ))}
              </div>
              <div className="seat-legend">
                <div className="legend-item"><div className="legend-color available"></div> Boş</div>
                <div className="legend-item"><div className="legend-color occupied"></div> Dolu</div>
                <div className="legend-item"><div className="legend-color" style={{ background: 'rgba(255,255,255,0.1)' }}></div> Devre Dışı</div>
                <div className="legend-item"><div className="legend-color selected"></div> Seçiminiz</div>
              </div>
            </div>

            <div style={{ fontSize:'0.85rem', color:'var(--warning)', marginTop:'20px' }}>
              Uyarı: Başlangıçtan sonra ilk 15 dk içinde Check-in yapmazsanız rezervasyon otomatik iptal edilir.
            </div>
            {selectedRoom.room_type === 'computer' && (
              <div style={{ fontSize:'0.85rem', color:'var(--primary)', marginTop:'10px', fontWeight: 'bold' }}>
                Bilgi: Bilgisayar odaları Check-in sonrasında geçirdiğiniz süreye göre dakikası 1 TL'den ücretlendirilir. Çıkış yapmayı unutmayınız!
              </div>
            )}

            <div className="modal-actions">
              <button className="text-btn" onClick={() => { setSelectedRoom(null); setSelectedSeat(null); }}>İptal</button>
              <button className="btn btn-primary" onClick={handleBooking} disabled={!selectedSeat}>Onayla</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Rooms;
