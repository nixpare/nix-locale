import React from 'react';

export type LocaleType = 'it' | 'en'

export type LocaleScopes = '' | 'foo' | 'bar'

export const DEFAULT_LOCALE: LocaleType = 'it'

export const LocaleContext = React.createContext<LocaleType>(DEFAULT_LOCALE)

export function useLocale(): LocaleType {
	return React.useContext(LocaleContext)
}
