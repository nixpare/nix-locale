import { type Plugin } from 'vite';
export interface NixLocaleOptions {
    /**
     * Include pattern for filtering the files to be parsed.
     * @default
     * ['**\/*.js', '**\/*.jsx', '**\/*.ts', '**\/*.tsx']
     */
    include?: string | string[];
    /**
     * Exclude pattern for filtering the files to be parsed.
     * @default
     * 'node_modules/**\/*'
     */
    exclude?: string | string[];
    /**
     * The list of languages to be parsed.
     * @example
     * ['en', 'it', 'de', 'default', 'something not standard']
     */
    locales: string[];
    /**
     * The language from the `locales` option to be considered the default loaded language.
     * The other ones are lazily loaded
     */
    default: string;
    /**
     * The import path of the hook responsible of signaling any language change. Use this property in conjunction with
     * the `useLocaleName` option.
     * @default
     * 'src/hooks/locale'
     */
    useLocaleImportPath?: string;
}
export default function nixLocalePlugin(options: NixLocaleOptions): Plugin;
