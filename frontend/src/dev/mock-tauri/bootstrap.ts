// Точка входа режима заглушек. Импортируется первой строкой в app/layout.tsx.
//
// Условие проверяется на этапе сборки: в production `process.env.NODE_ENV`
// подставляется строкой "production", ветка становится мёртвой и webpack
// не включает ./install (и фикстуры) в бандл. В браузере внутри Tauri
// window.__TAURI_INTERNALS__ уже есть, и заглушки не ставятся.
//
// Исключение: веб-демо на Vercel собирается с NEXT_PUBLIC_DEMO=1, тогда
// заглушки и вымышленные фикстуры попадают в бандл намеренно. Сборка
// десктопного приложения этот флаг не задаёт.

if (
  (process.env.NODE_ENV === 'development' || process.env.NEXT_PUBLIC_DEMO === '1') &&
  typeof window !== 'undefined' &&
  !(window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__
) {
  // require, а не import: установка должна пройти синхронно, до первого invoke,
  // и только в dev-ветке (статический import попал бы в production-бандл).
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('./install').installMockTauri();
}

export {};
