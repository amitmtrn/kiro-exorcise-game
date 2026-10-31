// Allow TypeScript to accept CSS side-effect imports (handled by Vite at build time)
declare module '*.css' {
  const _: string
  export default _
}
