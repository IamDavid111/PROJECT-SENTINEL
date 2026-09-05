import { allCountries } from 'country-region-data'

export const worldRegions = [
  'Africa',
  'Americas',
  'Asia',
  'Europe',
  'Middle East',
  'Oceania',
  'Polar Regions',
] as const

export const countries = allCountries
  .map(([name, code, regions]) => ({ name, code, regions }))
  .sort((left, right) => left.name.localeCompare(right.name))

export type CountryOption = (typeof countries)[number]
