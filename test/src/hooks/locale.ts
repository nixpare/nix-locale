import React from 'react';

export type LocaleType = 'it' | 'en'

export type LocaleScopes = '' | 'foo' | 'bar'

export const DEFAULT_LOCALE: LocaleType = 'it'

export const LocaleContext = React.createContext<{
	locale: LocaleType
	setLocale: React.Dispatch<React.SetStateAction<LocaleType>>
}>({ locale: DEFAULT_LOCALE, setLocale: () => {} })

export function useLocale(): LocaleType {
	const { locale } = React.useContext(LocaleContext)
	return locale
}
