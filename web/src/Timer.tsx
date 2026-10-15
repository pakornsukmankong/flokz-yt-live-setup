import { formatClock, formatDuration, nextAlertAt, playChime, stopChime, timer, useTimer } from './timerStore'

export function Timer() {
  const t = useTimer()
  const next = nextAlertAt(t)

  return (
    <div className="stack">
      <section className="card form">
        <h3>แจ้งเตือนตามเวลา</h3>

        <div className="countdown">
          <span className="muted">ตอนนี้</span>
          <strong>{new Date(t.now).toLocaleTimeString('th-TH')}</strong>
          <span className="muted">
            {next ? `แจ้งเตือนครั้งถัดไป ${formatClock(next)} น. (อีก ${formatDuration(next - t.now)})` : 'ปิดการแจ้งเตือนอยู่'}
          </span>
        </div>

        <label className="switch">
          <input type="checkbox" role="switch" checked={t.halfHour} onChange={(e) => timer.setHalfHour(e.target.checked)} />
          <span>
            ทุก 30 นาที <span className="muted">ดังตอน xx:00 และ xx:30</span>
          </span>
        </label>
        <label className="switch">
          <input type="checkbox" role="switch" checked={t.hourly} onChange={(e) => timer.setHourly(e.target.checked)} />
          <span>
            ทุก 1 ชั่วโมง <span className="muted">ดังตอน xx:00</span>
          </span>
        </label>

        <label>
          ความดัง {Math.round(t.volume * 100)}%
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={t.volume}
            onChange={(e) => timer.setVolume(Number(e.target.value))}
          />
        </label>

        <div className="row wrap">
          <button className="btn" onClick={() => playChime(false)}>
            ทดสอบเสียง 30 นาที
          </button>
          <button className="btn" onClick={() => playChime(true)}>
            ทดสอบเสียง 1 ชั่วโมง
          </button>
          <button className="btn" onClick={stopChime}>
            หยุดเสียง
          </button>
        </div>

        <p className="muted">
          เสียงเตือนดังราว 10 วินาที ต้นชั่วโมงเป็นทำนองขึ้นแล้วลง รอบครึ่งชั่วโมงเป็นทำนองขึ้นอย่างเดียว ต้องเปิดเว็บนี้ค้างไว้ สลับไปแท็บอื่นของเบราว์เซอร์หรือสลับเมนูในแอปได้
          แต่ห้ามปิดแท็บ ทุกครั้งที่เปิดหรือรีเฟรชหน้า ต้องคลิกบนหน้านี้หนึ่งครั้งก่อน เบราว์เซอร์ถึงจะยอมให้เล่นเสียง
        </p>
      </section>
    </div>
  )
}
