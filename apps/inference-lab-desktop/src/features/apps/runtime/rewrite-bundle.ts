export interface LocalAppModuleUrls {
  icons: string;
  react: string;
  sdk: string;
  ui: string;
}

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const replaceModule = (bundle: string, moduleName: string, url: string) =>
  bundle.replace(
    new RegExp(
      `((?:^|\\n)\\s*import\\s+(?:(?!;)[\\s\\S])*?\\bfrom\\s*)(["'])${escapeRegExp(moduleName)}\\2`,
      'g',
    ),
    (_, prefix: string) => `${prefix}${JSON.stringify(url)}`,
  );

export const rewriteGeneratedAppBundle = (bundle: string, urls: LocalAppModuleUrls) => {
  let rewritten = replaceModule(bundle, '@y31/local-app/icons', urls.icons);
  rewritten = replaceModule(rewritten, '@y31/local-app/ui', urls.ui);
  rewritten = replaceModule(rewritten, '@y31/local-app', urls.sdk);
  return replaceModule(rewritten, 'react', urls.react);
};
