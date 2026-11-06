import heroFacility from '../../assets/hero-facility.jpg'
import authIllustration from '../../assets/auth-illustration.jpg'

type BackgroundVariant = 'landing' | 'auth-desktop' | 'auth-mobile'

export function BrandedBackground({ variant = 'landing' }: { variant?: BackgroundVariant }) {
  if (variant === 'auth-desktop') {
    return (
      <div className="absolute inset-0" aria-hidden="true">
        <img
          src={authIllustration}
          alt=""
          className="absolute inset-0 h-full w-full object-cover object-left brightness-[0.6] contrast-125"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-ink/20 via-transparent to-ink" />
        <div className="absolute inset-x-0 bottom-0 h-56 bg-gradient-to-t from-ink via-ink/95 to-transparent" />
      </div>
    )
  }

  if (variant === 'auth-mobile') {
    return (
      <div className="absolute inset-0" aria-hidden="true">
        <img
          src={authIllustration}
          alt=""
          className="absolute inset-0 h-full w-full object-cover object-left brightness-[0.6] contrast-125"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-ink/70 via-ink/30 to-surface-soft" />
      </div>
    )
  }

  return (
    <div className="absolute inset-0 overflow-hidden" aria-hidden="true">
      <img src={heroFacility} alt="" className="absolute inset-0 h-full w-full object-cover object-center brightness-[0.7]" />
      <div className="absolute inset-0 bg-ink/50" />
      <div className="absolute inset-0 bg-gradient-to-r from-ink/95 via-ink/85 to-ink/45" />
      <div className="absolute inset-0 bg-gradient-to-t from-ink/70 via-transparent to-transparent" />
      <div
        className="absolute inset-0"
        style={{ background: 'linear-gradient(to bottom, transparent 78%, var(--color-surface) 100%)' }}
      />
    </div>
  )
}
