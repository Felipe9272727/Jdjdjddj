/// <reference types="vite/client" />

// Asset import declarations — Vite bundles these as data-URIs via
// assetsInlineLimit in vite.config.ts. TypeScript needs these module
// declarations to know that `import url from './foo.jpg'` returns a
// string (the bundled asset path / data-URI).
declare module '*.jpg' {
  const src: string;
  export default src;
}
declare module '*.jpeg' {
  const src: string;
  export default src;
}
declare module '*.png' {
  const src: string;
  export default src;
}
declare module '*.gif' {
  const src: string;
  export default src;
}
declare module '*.svg' {
  const src: string;
  export default src;
}
declare module '*.webp' {
  const src: string;
  export default src;
}
declare module '*.glb' {
  const src: string;
  export default src;
}
declare module '*.gltf' {
  const src: string;
  export default src;
}
declare module '*.hdr' {
  const src: string;
  export default src;
}
declare module '*.exr' {
  const src: string;
  export default src;
}
declare module '*.mp3' {
  const src: string;
  export default src;
}
declare module '*.ogg' {
  const src: string;
  export default src;
}
