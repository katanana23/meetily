// Точка входа режима заглушек. Импортируется первой строкой в app/layout.tsx.
//
// Условие проверяется на этапе сборки: в production `process.env.NODE_ENV`
// подставляется строкой "production", ветка становится мёртвой и webpack
// не включает ./install (и фикстуры) в бандл. В браузере внутри Tauri
// window.__TAURI_INTERNALS__ уже есть, и заглушки не ставятся.

if (
  process.env.NODE_ENV === 'development' &&
  typeof window !== 'undefined' &&
  !(window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__
) {
  // require, а не import: установка должна пройти синхронно, до первого invoke,
  // и только в dev-ветке (статический import попал бы в production-бандл).
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('./install').installMockTauri();
}

export {};
