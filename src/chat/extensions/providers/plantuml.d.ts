/* Ambient types for the untyped @plantuml/core package; delete alongside
 * plantuml.ext.ts when unplugging the provider. */
declare module "@plantuml/core" {
  export function renderToString(
    lines: string[],
    onSuccess: (svg: string) => void,
    onError: (message: string) => void,
    options?: { dark?: boolean; maxSvgSize?: number },
  ): void;
}
declare module "@plantuml/core/viz-global.js" {
  const viz: unknown;
  export default viz;
}
