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

// The source package provides each country as a tuple (name, code, regions). Convert those values
// to named fields for easier use in forms, then sort by country name for predictable selector lists.
export const countries = allCountries
  .map(([name, code, regions]) => ({ name, code, regions }))
  .sort((left, right) => left.name.localeCompare(right.name))

export type CountryOption = (typeof countries)[number]
