import { DEFAULT_LOCALE, useLocale } from '__LOCALE_IMPORT_PATH__';

export function t(locales, arg) {
	const selected = locales[DEFAULT_LOCALE];

	if (typeof selected === 'function') {
		return selected(arg)
	}
	return selected;
}

export function useT(locales, arg, _) {
	const locale = useLocale();
	const selected = locales[locale];

	if (typeof selected === 'function') {
		return selected(arg)
	}
	return selected;
}

export function T(props) {
	const { arg, scope: _, ...locales } = props;

	const locale = useLocale();
	const selected = locales[locale];

	if (typeof selected === 'function') {
		return selected(arg)
	}
	return selected;
}