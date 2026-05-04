/// <reference types="vite/client" />

declare module "*.css" {
  const content: Record<string, string>;
  export default content;
}

interface ImportMetaEnv {
  /** F09 Phase 2 — Home banner 광고 그룹 ID (토스 콘솔 발급). 미설정 시 banner 미노출. */
  readonly VITE_AD_GROUP_HOME?: string;
  /** F09 Phase 2 — Result banner 광고 그룹 ID. 미설정 시 banner 미노출. */
  readonly VITE_AD_GROUP_RESULT?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
