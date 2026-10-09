# YT Live Setup

เก็บ preset ของแต่ละเกม (ชื่อคลิป, description, หมวดหมู่, ชื่อเกม, ภาพปก, poll) แล้วกด Apply เพื่ออัปเดตไลฟ์บน YouTube ทันที

- `web/` — React + Vite (deploy บน Vercel)
- `api/` — Fastify (deploy บน Railway)

ข้อมูลเก็บใน SQLite และภาพปกเก็บเป็นไฟล์ ทั้งคู่อยู่ในโฟลเดอร์ `DATA_DIR` ของ api (ตารางถูกสร้างเองตอน start)

## 1. Google Cloud

1. สร้างโปรเจกต์ที่ https://console.cloud.google.com แล้ว Enable **YouTube Data API v3**
2. ตั้ง OAuth consent screen แบบ External และเพิ่มอีเมลตัวเองใน Test users
   - โหมด Testing ต้อง login ใหม่ทุก 7 วัน ถ้าไม่อยาก login บ่อยให้กด Publish app (ใช้เองไม่ต้องส่งตรวจ แต่ตอน login จะมีหน้าเตือนว่าแอปยังไม่ได้ยืนยัน)
3. Credentials > Create credentials > OAuth client ID > Web application แล้วเพิ่ม Authorized redirect URIs:
   - `http://localhost:5173/api/auth/callback`
   - `https://<โดเมน-vercel>/api/auth/callback`

## 2. รันบนเครื่อง

```bash
cd api
cp .env.example .env   # แล้วกรอกค่าให้ครบ
npm install
npm run dev
```

```bash
cd web
npm install
npm run dev
```

เปิด http://localhost:5173

## 3. Deploy

push โฟลเดอร์นี้ขึ้น GitHub ก่อน แล้ว:

**Railway (api)**
- New Project > Deploy from GitHub repo, ตั้ง Root Directory เป็น `api`
- ใส่ Variables ตาม `api/.env.example` โดย `PUBLIC_URL` คือโดเมน Vercel (เช่น `https://xxx.vercel.app`) และไม่ต้องใส่ `PORT` กับ `DATA_DIR`
- คลิกขวาที่ service > Attach Volume ตั้ง Mount Path เป็น `/data` (ถ้าไม่ผูก api จะไม่ยอม start เพราะข้อมูลจะหายทุกครั้งที่ deploy)
- Settings > Networking > Generate Domain

**Vercel (web)**
- แก้ `web/vercel.json` เปลี่ยน `YOUR-RAILWAY-DOMAIN.up.railway.app` เป็นโดเมน Railway
- Import repo, ตั้ง Root Directory เป็น `web` (Framework: Vite)

เบราว์เซอร์คุยกับ Vercel โดเมนเดียว แล้ว Vercel ส่งต่อ `/api/*` ไป Railway cookie login จึงเป็น first-party

## 4. โพสต์ลงเพจ Facebook (ไม่บังคับ)

ปุ่ม "โพสต์ลงเพจ" ในแท็บไลฟ์จะโพสต์ภาพปกของ preset พร้อมชื่อคลิปลงเพจ แล้วคอมเมนต์ลิงก์ไลฟ์ใต้โพสต์ ต้องใส่ตัวแปรสองตัวบน Railway:

1. สร้างแอปที่ https://developers.facebook.com/apps (ประเภท Business) ด้วยบัญชีที่เป็นแอดมินเพจ
2. เปิด Tools > Graph API Explorer เลือกแอป เพิ่มสิทธิ์ `pages_show_list`, `pages_read_engagement`, `pages_read_user_content`, `pages_manage_posts`, `pages_manage_engagement` แล้วกด Generate Access Token และเลือกเพจ
3. เปิด Tools > Access Token Debugger วาง token จากขั้น 2 กด Debug แล้วกด Extend Access Token จะได้ user token แบบอายุยาว
4. กลับไป Graph API Explorer วาง token อายุยาวลงช่อง Access Token แล้วเรียก `GET me/accounts` จะได้ `id` และ `access_token` ของเพจ (page token ที่ได้จาก user token อายุยาวจะไม่หมดอายุ)
5. ใส่บน Railway: `FB_PAGE_ID` = `id` และ `FB_PAGE_ACCESS_TOKEN` = `access_token`
6. สลับแอปเป็นโหมด Live (ต้องใส่ Privacy Policy URL ใน App settings > Basic) ถ้ายังเป็นโหมด Development โพสต์จะเห็นเฉพาะคนที่มีบทบาทในแอป

## ข้อจำกัดของ YouTube

- **ชื่อเกม** ตั้งผ่าน API ไม่ได้ หลัง Apply ให้กดปุ่มเปิดหน้า Studio แล้วเลือกเกมเอง
- **Poll** ยิงได้เฉพาะตอนไลฟ์ออนอยู่และแชตเปิด เปิดได้ครั้งละหนึ่ง poll
- **ภาพปก** ต้องเป็น JPG/PNG ไม่เกิน 2MB และช่องต้องยืนยันเบอร์โทรแล้ว
