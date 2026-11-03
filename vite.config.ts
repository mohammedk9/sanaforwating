import { defineConfig } from 'vite';

/**
 * إعداد Vite لواجهة SANA.
 *
 * base: './'
 *   مسارات نسبية ⇒ نفس الحزمة الناتجة تعمل من جذر النطاق أو من مسار فرعي
 *   (Cloudflare Pages أو GitHub Pages) بلا تعديل.
 *
 * server.host: true
 *   يسمح بفتح المعاينة من الهاتف على نفس الشبكة، وهو مفيد لاختبار رحلة QR
 *   الحقيقية (مسح الرمز → صفحة SANA).
 */
export default defineConfig({
  base: './',
  build: {
    outDir: 'dist',
    target: 'es2022',
  },
  server: {
    host: true,
    port: 5173,
  },
});
