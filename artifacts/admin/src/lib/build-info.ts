declare const __MINERVA_APP_VERSION__: string | undefined;

export const APP_VERSION =
  typeof __MINERVA_APP_VERSION__ === "string" && __MINERVA_APP_VERSION__
    ? __MINERVA_APP_VERSION__
    : "local";
