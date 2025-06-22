import React from 'react';
import { useLocale, LocaleType } from YOUR_LOCALE_PACKAGE;

type TranslationMap<P extends object> = {
	[L in LocaleType]: React.ReactNode | ((props: P) => React.ReactNode);
};

export function T<P extends object = {}>(props: TranslationMap<P> & P) {
	const locale = useLocale();
	const selected = props[locale];

	// se è funzione, la invochiamo con rest (di tipo P)
	if (typeof selected === 'function') {
		// TS non sa se è ReactNode o funzione, quindi castiamo
		return (selected as (props: P) => React.ReactNode)(props);
	}
	return selected;
}
