export const companySettingsUpdatedEvent = 'company-settings-updated'

export function notifyCompanySettingsUpdated(organizationId: string) {
  window.dispatchEvent(new CustomEvent(companySettingsUpdatedEvent, {
    detail: { organizationId },
  }))
}

export function companySettingsEventMatchesOrganization(event: Event, organizationId: string) {
  const eventOrganizationId = (event as CustomEvent<{ organizationId?: string }>).detail?.organizationId
  return !eventOrganizationId || eventOrganizationId === organizationId
}
