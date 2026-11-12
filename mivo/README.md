# MIVO

Monorepo: `backend/` (Node + Postgres), `web/` (React + Vite), `android/` (Kotlin + Compose).

## Holat (1-bosqich)
Ishlaydi (kod yozilgan, hali sinalmagan): telefon+SMS kod orqali kirish, refresh-token rotatsiyasi,
o'zgarmas ASTER ledger sxemasi, `/v1/wallet`, Liquid Glass kirish ekrani, Android asos ilova.
Hali YO'Q: chatlar, guruhlar, kanallar, 2-bosqichli tekshiruv, app lock, to'lovlar, Premium, NEW BOT, admin.

## Telefonda ishga tushirish
1. GitHub'da `mivo` repo yarating, ZIP ichidagi fayllarni yuklang (GitHub ilovasi/brauzer "Upload files").
2. **APK**: repo → Actions → "Android APK" → Run workflow → tugagach Artifacts'dan `mivo-debug-apk`.
3. **Backend**: Render/Railway/Fly'da Node servis + Postgres oching. Root: `backend`, start: `npm start`,
   birinchi marta `npm run migrate`. `.env.example` dagi o'zgaruvchilarni kiriting.
4. **Web**: Netlify → Import from Git. `netlify.toml` tayyor. Env: `VITE_API_URL=<backend URL>`.
5. Android'da API manzil: `android/app/build.gradle.kts` → `API_URL`.

Talab qilinadigan kalitlar: `DATABASE_URL`, `JWT_SECRET`, SMS provayder (`SMS_API_URL`, `SMS_API_KEY`).
SMS provayder bo'lmasa, kod yuborish 501 qaytaradi — soxta kirish yo'q.

## 2-bosqich
- Realtime 1-1 chat (REST + WebSocket `/ws`), username qidiruv, profil sozlash.
- Android ilova endi Web UI'ni WebView ichida ochadi (bitta UI). Manzil: GitHub repo → Settings → Variables → `WEB_URL` (Netlify manzilingiz, `https://...` va oxirida `/` bilan). Keyin Actions'ni qayta ishga tushiring.
- `DEV_OTP=true` (backend) — SMS provayder yo'q paytda kod javobda qaytadi. FAQAT sinov uchun.
- Migratsiyalar: `npm run migrate` (001, 002).
