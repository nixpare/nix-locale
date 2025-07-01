import { DEFAULT_LOCALE, useLocale, type LocaleType } from '__LOCALE_IMPORT_PATH__';

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
	const selected = locales[DEFAULT_LOCALE];

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
