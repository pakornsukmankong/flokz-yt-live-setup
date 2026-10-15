import { formatDuration, nextAlertIn, playChime, timer, useTimer } from './timerStore'

export function Timer() {
  const t = useTimer()
  const running = t.startedAt !== null

  return (
    <div className="stack">
      <section className="card form">
        <h3>ตัวจับเวลา</h3>
        <div className="chips">
          {([30, 60] as const).map((m) => (
            <button key={m} className={t.minutes === m ? 'chip on' : 'chip'} onClick={() => timer.setMinutes(m)}>
              {m === 30 ? 'ทุก 30 นาที' : 'ทุก 1 ชั่วโมง'}
            </button>
          ))}
        </div>

        <div className="countdown">
          {running ? (
            <>
              <span className="muted">เตือนครั้งถัดไปใน</span>
              <strong>{formatDuration(nextAlertIn(t))}</strong>
              <span className="muted">
                จับเวลามาแล้ว {formatDuration(t.now - t.startedAt!)} · เตือนไปแล้ว {t.alerts} ครั้ง
              </span>
            </>
          ) : (
            <>
              <span className="muted">ยังไม่ได้เริ่ม</span>
              <strong>{formatDuration(t.minutes * 60_000)}</strong>
            </>
          )}
        </div>

        <div className="row">
          {running ? (
            <button className="btn danger" onClick={timer.stop}>
              หยุด
            </button>
          ) : (
            <button className="btn primary" onClick={timer.start}>
              เริ่มจับเวลา
            </button>
          )}
          <button className="btn" onClick={() => playChime()}>
            ทดสอบเสียง
          </button>
        </div>

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

        <p className="muted">
          ต้องเปิดเว็บนี้ค้างไว้ เปลี่ยนไปแท็บอื่นของเบราว์เซอร์หรือสลับเมนูในแอปได้ แต่ห้ามปิดแท็บ ถ้าแท็บอยู่เบื้องหลังนาน ๆ
          เบราว์เซอร์อาจทำให้เสียงช้าไปได้ไม่เกินราว 1 นาที เปลี่ยนรอบระหว่างจับเวลาจะเริ่มนับใหม่
        </p>
      </section>
    </div>
  )
}
