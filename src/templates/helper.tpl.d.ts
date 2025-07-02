import { type ReactNode } from 'react';
import { DEFAULT_LOCALE, useLocale, type LocaleType, type LocaleScopes } from '__LOCALE_IMPORT_PATH__';

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

export type TProps<P> = (
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

export function T<P extends object>(props: TProps<P>): ReactNode;