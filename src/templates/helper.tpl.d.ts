import { LocaleType } from '__LOCALE_IMPORT_PATH__';

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

export function useT<R>(
	locales: TranslationMap<R>
): R;
export function useT<P, R>(
	locales: TranslationMap<R | ((props: P) => R)>,
	arg: P
): R;

export function T<R>(
	props: TranslationMap<R>
): R;
export function T<P, R>(
	props: TranslationMap<R | ((props: P) => R)> & {
		arg: P
	}
): R;