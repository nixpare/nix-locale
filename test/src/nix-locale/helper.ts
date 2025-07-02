import { type ReactNode } from 'react';
import { DEFAULT_LOCALE, useLocale, type LocaleType, type LocaleScopes } from '../hooks/locale';

export type TranslationMap<T> = {
	[L in LocaleType]: T;
};

export function t<R>(
	locales: TranslationMap<R>
): R;
export function t<P, R>(
	locales: TranslationMap<R | ((props: P) => R)>,
	arg: NonNullable<P>
): R;
export function t(locales: TranslationMap<any>, arg?: any): any {
	const selected = locales[DEFAULT_LOCALE];

	if (typeof selected === 'function') {
		return selected(arg)
	}
	return selected;
}

export function useT<R>(
	locales: TranslationMap<R>,
	arg?: undefined,
	scope?: LocaleScopes
): R;
export function useT<P, R>(
	locales: TranslationMap<R | ((props: P) => R)>,
	arg: NonNullable<P>,
	scope?: LocaleScopes
): R;
export function useT(locales: TranslationMap<any>, arg?: any, _?: LocaleScopes): any {
	const locale = useLocale();
	const selected = locales[locale];

	if (typeof selected === 'function') {
		return selected(arg)
	}
	return selected;
}

export type TProps<P extends object> = (
	TranslationMap<ReactNode> & {
		arg?: undefined
		scope?: LocaleScopes
	}
) | (
	TranslationMap<ReactNode | ((props: P) => ReactNode)> & {
		arg: NonNullable<P>
		scope?: LocaleScopes
	}
)

export function T<P extends object>(props: TProps<P>): ReactNode {
	const { arg, scope: _, ...locales } = props;

	const locale = useLocale();
	const selected = locales[locale];

	if (typeof selected === 'function') {
		return selected(arg!)
	}
	return selected;
}