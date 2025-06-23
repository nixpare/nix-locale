import React from 'react';
import { useLocale, type LocaleType } from YOUR_LOCALE_PACKAGE;

type TranslationMap<P extends object, R> = {
	[L in LocaleType]: R | ((props: P) => R);
};

export function T<P extends object = {}>(props: TranslationMap<P, React.ReactNode> & P): React.ReactNode {
	const locale = useLocale();
	const selected = props[locale];

	// se è funzione, la invochiamo con rest (di tipo P)
	if (typeof selected === 'function') {
		// TS non sa se è ReactNode o funzione, quindi castiamo
		return (selected as (props: P) => React.ReactNode)(props);
	}
	return selected;
}

export function useT<R, P extends object = {}>(locales: TranslationMap<P, R>, args = {} as P): R {
	const locale = useLocale();
	const selected = locales[locale];

	// se è funzione, la invochiamo con rest (di tipo P)
	if (typeof selected === 'function') {
		// TS non sa se è ReactNode o funzione, quindi castiamo
		return (selected as (props: P) => R)(args);
	}
	return selected;
}

export function t<R, P extends object = {}>(locales: TranslationMap<P, R>, args = {} as P): R {
	const locale = useLocale();
	const selected = locales[locale];

	// se è funzione, la invochiamo con rest (di tipo P)
	if (typeof selected === 'function') {
		// TS non sa se è ReactNode o funzione, quindi castiamo
		return (selected as (props: P) => R)(args);
	}
	return selected;
}
