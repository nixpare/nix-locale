import { useLocale, type LocaleType } from YOUR_LOCALE_PACKAGE;

const DEFAULT_STATIC_LOCALE: LocaleType = YOUR_DEFAULT_STATIC_LOCALE;

type TranslationMap<T> = {
	[L in LocaleType]: T;
};

export function t<R>(
	locales: TranslationMap<R>
): R;
export function t<P, R>(
	locales: TranslationMap<R | ((props: P) => R)>,
	arg: P
): R;
export function t(locales: TranslationMap<any>, arg?: any): any {
	const selected = locales[DEFAULT_STATIC_LOCALE];

	if (typeof selected === 'function') {
		return selected(arg)
	}
	return selected;
}

export function useT<R>(
	locales: TranslationMap<R>
): R;
export function useT<P, R>(
	locales: TranslationMap<R | ((props: P) => R)>,
	arg: P
): R;
export function useT(locales: TranslationMap<any>, arg?: any): any {
	const locale = useLocale();
	const selected = locales[locale];

	if (typeof selected === 'function') {
		return selected(arg)
	}
	return selected;
}

/*

	// File.tsx

import { useLocale as AutoLocale_useLocale } from USE_LOCALE_PATH;
import AutoLocale_React from "react";

// if lang0 is default
import { file__index as useAutoLocale_file__index_default } from "virtual:auto-locale/default.jsx";
const useAutoLocale_file__index_lang0 = () => Promise.resolve(useAutoLocale_file__index_default);
// if lang1 is not default
const useAutoLocale_file__index_lang1 = () => import("virtual:auto-locale/lang1.jsx").then(module => module["file__index"]);

function useAutoLocale_file__index(props) {
	const map = {
		lang0: useAutoLocale_file__index_lang0,
		lang1: useAutoLocale_file__index_lang1,
		...
	};

	const locale = AutoLocale_useLocale();
	const prevLocaleRef = AutoLocale_React.useRef(locale);
	const [result, setResult] = AutoLocale_React.useState(useAutoLocale_file__index_default(props));

	AutoLocale_React.useEffect(() => {
		prevLocaleRef.current = locale;
	}, [locale]);

	const selected = map[locale];
	AutoLocale_React.useEffect(() => {
		selected().then(f => setResult(f(props)))
	}, [locale]);

	return result;
}

	// virtual:auto-locale/lang.tsx

export const file0__0 = () => (STATIC_JSX_ELEMENT_FROM_FILE);

export const file1__1 = JSX_FUNCTION_COMPONENT_FROM_FILE;

export default { file0__0, file1__1 };

*/

export function T<R>(
	props: TranslationMap<R>
): R;
export function T<P, R>(
	props: TranslationMap<R | ((props: P) => R)> & {
		arg: P
	}
): R;
export function T(props: any) {
	const { arg, ...locales } = props;

	const locale = useLocale();
	const selected = locales[locale];

	if (typeof selected === 'function') {
		return selected(arg)
	}
	return selected;
}

/*

	// File.tsx

import { useLocale as AutoLocale_useLocale } from USE_LOCALE_PATH;
import AutoLocale_React from "react";

const AutoLocale_file__index_lang0 = AutoLocale_React.lazy(() => import("virtual:auto-locale/lang0.jsx").then(module => ({
	default: module["file__index"]
})));
const AutoLocale_file__index_lang1 = AutoLocale_React.lazy(() => import("virtual:auto-locale/lang1.jsx").then(module => ({
	default: module["file__index"]
})));

function AutoLocale_file__index(props) {
	const Map = {
		lang0: AutoLocale_file__index_lang0,
		lang1: AutoLocale_file__index_lang1,
		...
	};

	const locale = AutoLocale_useLocale();
	const prevLocaleRef = AutoLocale_React.useRef(locale);

	AutoLocale_React.useEffect(() => {
		prevLocaleRef.current = locale;
	}, [locale]);

	const Selected = Map[locale];
	const Fallback = Map[prevLocaleRef.current];

	return <AutoLocale_React.Suspense fallback={<Fallback {...props} />}><Selected {...props} /></AutoLocale_React.Suspense>;
}

	// virtual:auto-locale/lang.tsx

export const file0__0 = () => (STATIC_JSX_ELEMENT_FROM_FILE);

export const file1__1 = JSX_FUNCTION_COMPONENT_FROM_FILE;

export default { file0__0, file1__1 };

*/
