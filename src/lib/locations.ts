import { allCountries } from 'country-region-data'

export const worldRegions = [
  'Africa',
  'Asia',
  'Europe',
  'North America',
  'South America',
  'Oceania',
  'Antarctica',
] as const

export type WorldRegion = (typeof worldRegions)[number]

// The source package provides each country as a tuple (name, code, regions). Convert those values
// to named fields for easier use in forms, then sort by country name for predictable selector lists.
export const countries = allCountries
  .map(([name, code, regions]) => ({
    name,
    code,
    regions: regions.map(([divisionName, divisionCode]) => [
      code === 'NG' && divisionCode === 'FC' ? 'Federal Capital Territory' : divisionName,
      divisionCode,
    ] as const),
  }))
  .sort((left, right) => left.name.localeCompare(right.name))

export type CountryOption = (typeof countries)[number]

const countryCodesByRegion: Record<WorldRegion, readonly string[]> = {
  Africa: [
    'AO', 'BF', 'BI', 'BJ', 'BW', 'CD', 'CF', 'CG', 'CI', 'CM', 'CV', 'DJ', 'DZ', 'EG', 'EH', 'ER',
    'ET', 'GA', 'GH', 'GM', 'GN', 'GQ', 'GW', 'KE', 'KM', 'LR', 'LS', 'LY', 'MA', 'MG', 'ML', 'MR',
    'MU', 'MW', 'MZ', 'NA', 'NE', 'NG', 'RE', 'RW', 'SC', 'SD', 'SH', 'SL', 'SN', 'SO', 'SS', 'ST',
    'SZ', 'TD', 'TG', 'TN', 'TZ', 'UG', 'YT', 'ZA', 'ZM', 'ZW',
  ],
  Asia: [
    'AF', 'AM', 'AZ', 'BD', 'BH', 'BN', 'BT', 'CC', 'CN', 'CX', 'GE', 'HK', 'ID', 'IL', 'IN', 'IO',
    'IQ', 'IR', 'JO', 'JP', 'KG', 'KH', 'KP', 'KR', 'KW', 'KZ', 'LA', 'LB', 'LK', 'MM', 'MN', 'MO',
    'MV', 'MY', 'NP', 'OM', 'PH', 'PK', 'PS', 'QA', 'SA', 'SG', 'SY', 'TH', 'TJ', 'TL', 'TM', 'TR',
    'TW', 'AE', 'UZ', 'VN', 'YE',
  ],
  Europe: [
    'AD', 'AL', 'AT', 'AX', 'BA', 'BE', 'BG', 'BY', 'CH', 'CZ', 'DE', 'DK', 'EE', 'ES', 'FI', 'FO',
    'CY', 'FR', 'GB', 'GG', 'GI', 'GR', 'HR', 'HU', 'IE', 'IM', 'IS', 'IT', 'JE', 'LI', 'LT', 'LU', 'LV',
    'MC', 'MD', 'ME', 'MK', 'MT', 'NL', 'NO', 'PL', 'PT', 'RO', 'RS', 'RU', 'SE', 'SI', 'SJ', 'SK',
    'SM', 'UA', 'VA', 'XK',
  ],
  'North America': [
    'AG', 'AI', 'AW', 'BB', 'BL', 'BM', 'BQ', 'BS', 'BZ', 'CA', 'CR', 'CU', 'CW', 'DM', 'DO', 'GD',
    'GL', 'GP', 'GT', 'HN', 'HT', 'JM', 'KN', 'KY', 'LC', 'MF', 'MQ', 'MS', 'MX', 'NI', 'PA', 'PM',
    'PR', 'SV', 'SX', 'TC', 'TT', 'US', 'VC', 'VG', 'VI',
  ],
  'South America': ['AR', 'BO', 'BR', 'CL', 'CO', 'EC', 'FK', 'GF', 'GS', 'GY', 'PE', 'PY', 'SR', 'UY', 'VE'],
  Oceania: [
    'AS', 'AU', 'CK', 'FJ', 'FM', 'GU', 'KI', 'MH', 'MP', 'NC', 'NF', 'NR', 'NU', 'NZ', 'PF', 'PG',
    'PN', 'PW', 'SB', 'TK', 'TO', 'TV', 'UM', 'VU', 'WF', 'WS',
  ],
  Antarctica: ['AQ', 'BV', 'HM', 'TF'],
}

const regionByCountryCode = new Map(
  Object.entries(countryCodesByRegion).flatMap(([region, codes]) => codes.map((code) => [code, region as WorldRegion])),
)

export function getCountryRegion(countryCode: string): WorldRegion | undefined {
  return regionByCountryCode.get(countryCode)
}

export function getCountriesForRegion(region: string): CountryOption[] {
  return countries.filter((country) => getCountryRegion(country.code) === region)
}

export function getCountryOption(countryName: string): CountryOption | undefined {
  return countries.find((country) => country.name === countryName)
}
