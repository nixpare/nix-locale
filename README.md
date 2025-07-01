# `@nixpare/nix-locale`
### Handle website localization inline in your React components, without external JSON files and weak translation tags.

A lightweight plugin with support for automatic code splitting, lazy loading, inline translations without code separation and magic keys, type safe, all of this done at build time, no runtime costs. Also compatible with pre-rendering/SSG.

This plugin offers a different approach at translation compared to other frameworks like `react-i18next` and similar.

The key difference is in how the translations are stored and organized: other libraries handle translations by placing every localization in one or more config or JSON file (usually one for each language) and then referencing a specific translation with a **magic key**, making the system very fragile, expecially for big projects.

## How translation are handled
Instead, this plugin wants to make very difficoult to mess things up and keep everything near where it should be, with the guaranteee that the project can still function even if you disable the plugin.

This is what a `@nixpare/nix-locale` code looks like (from the example from [react-i18next](https://www.npmjs.com/package/react-i18next)):
```jsx
<div>
  <T
    en={<>Just simple content</>}
    it="Solo un semplice componente"
  >
</div>
<T
  en={arg => <>
    Hello <strong title="This is your name">{arg.name}</strong>, you have {arg.count} unread messages. <Link to="/msgs">Go to messages</Link>.
  </>}
  it={({ name, count }) => <>
    Ciao <strong title="Questo è il tuo nome">{name}</strong>, hai {count} messaggi non letti. <Link to="/msgs">Vai ai messaggi</Link>.
  </>}
  arg={{ name: 'My Name', count: 10 }}
>
```
This code is completely type safe and prevents every possible runtime error, like missing translations! All of this is done through the generation of a set of helper function and components in your project via the command `npx @nixpare/nix-locale`. More details below.

Let me show what this code is actually hiding:
+ The `T` helper function takes as parameters every language you want to translate. If you miss one, the linter highlights this component in red and tells you what is missing.

+ Every locale parameter can be:
  + everything that is a `React.ReactNode`, so it can be a `string`, a `React.Element`, a native html element, or a collection of elements (with `<>...</>`).
  + a function which takes 0 or 1 argument (which is an object containing every information needed) and returns a React.ReactNode, so you can pass down arguments based on the context.
  
+ This types of parameters can be mixed together, but if one of those is a function which takes an argument, this argument must be defined in the `T` component under the `arg` parameter (see the code above). The types are automatically infered from this parameter, so everything is type safe.

+ During the **build step**, by leveraging *virtual modules and tranformations*, it automatically separates translations in different files, one for each language, preloads the default language and when the user decides to change the language, it automatically fetches the corresponding new language translations and applies them when available. All of this **DOES NOT CHANGE YOUR PROJECT ON DISK**, it's all done in memory at build time.

This plugin also exposes other two helper functions:
 + `useT`, which has the same principle behind the `T` component, but is used as an hook, so it can return any value, not only `React.ReactNode`. (**IMPORTANT**: this is not a magic wand, **this is a real hook**, and so you have to use it following the react guidelines, see [Rules of Hooks - React.dev](https://react.dev/reference/rules/rules-of-hooks))
 + `t`, which has the same principle of the `useT` function, but it does not change from the default language provided at build time. This is a fallback helper function to use where you can't use both components and hooks (for example, in the `<head>` section of the root html file)

## Installation
1) First, install the package:
   ```sh
   npm i -D @nixpare/nix-locale
   ```

2) Then, you have to make your own system for handling current language/language change: you must have a module which exports:
   + `LocaleType`: this is a `type union` which lists all the languages you want to handle, e.g.:
     ```js
     export type LocaleType = 'en' | 'it' | 'de' | ...
     ```
   
   + `DEFAULT_LOCALE`: this is a `constant` value which tells the default loaded function (also used by the `t` helper function), e.g.:
     ```js
     export const DEFAULT_LOCALE = 'en'
     ```
   
   + `useLocale`: this can be a `simple function` (for early testing) or a `full react hook`, it must return the current language, e.g.:
     ```js
     export function useLocale(): LocaleType {
        const localeContext = React.useContext(LocaleContext) // LocaleContext must be created and implemented by yourself
        return localeContext
     }
     ```
3) After creating this module, you have to generate the helper module to use all the functions in your project:
   ```sh
   npx @nixpare/nix-locale
   ```
   This command will ask you where is your project directory (the default is `src`) and the import path the module created the step before (e.g. `src/hooks/locale` if the file created before was in `./src/hooks/locale.ts`).
   This will create a file under `src/nix-locale/helper.tsx` where all the helper functions will be available.

4) And finally, include the plugin in your vite config file:
   ```js
   import nixLocale from "@nixpare/nix-locale/plugin";

   export default defineConfig({
     plugins: [
       // Other plugins ...
       nixLocale({
         include: ['**/*.js', '**/*.jsx', '**/*.ts', '**/*.tsx'],
         exclude: 'node_modules/**/*',
         locales: ["en", "it"],
         default: "en",
         useLocaleImportPath: 'src/hooks/locale'
       })
     ],
     // Other config entries ...
   })
   ```
   A few considerations:
   + `include` (optional) : a pattern or list of patterns, used to determine what files should be parsed. In the example above are shown the default values, but if you know exactly what files are using those, you can reduce build times by narrowing down (e.g. if you know only .tsx file are referencing the helper, and all files are in your `src` folder, you can `include: 'src/**/*.tsx`).
   + `exclude` (optional) : the opposite of `include`. In the example above is shown the default value, be careful while changing it to the inclusion of huge folders like `node_modules/`.
   + `locales` : a list of languages to parse, this should match the `type LocaleType` exported above.
   + `default` : the default language, taken from the list above, this should match `const DEFAULT_LOCALE` exported above.
   + `useLocaleImportPath` (optional) : the import path matching the one given while generating the helper module. In the example above is shown the default value.

**NOW YOU ARE READY TO GO**

### Disabling the plugin if errors are found
If you ever encountered a problem while working with this plugin, you can always disable it by removing it from the vite config. If you do this, everything will continue working as normal, because the helper function will not be replaced during the build steps, and this functions are just normal components (they are not using anthing fancy like `React.lazy`, `React.Suspense` or **dynamic imports**).
