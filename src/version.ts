/// <reference types="vite/client" />

declare const __APP_VERSION__: string;
declare const __APP_COMMIT__: string;
declare const __APP_DATE__: string;
declare const __APP_FULL_VERSION__: string;

export const APP_VERSION = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'dev';
export const APP_COMMIT = typeof __APP_COMMIT__ !== 'undefined' ? __APP_COMMIT__ : 'unknown';
export const APP_DATE = typeof __APP_DATE__ !== 'undefined' ? __APP_DATE__ : '';
export const APP_FULL_VERSION = typeof __APP_FULL_VERSION__ !== 'undefined' ? __APP_FULL_VERSION__ : 'dev';
