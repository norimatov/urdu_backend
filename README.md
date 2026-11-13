# URDU CONNECT — Backend

1. `cp .env.example .env` va qiymatlarni to'ldiring.
2. Admin parolini hash qiling: `npm run hash-password -- "kuchli-parol"`, natijani `ADMIN_PASSWORD_HASH` ga qo'ying.
3. `npm install`
4. `npm run dev` (yoki `npm start`). Jadvallar avtomatik yaratiladi.

Dev rejimda SMTP va SMS sozlanmagan bo'lsa tasdiqlash kodlari terminalga chiqadi.
