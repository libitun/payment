import Link from 'next/link'
import Image from 'next/image'
import { MapPin, TrendingUp, Users, BadgeCheck } from 'lucide-react'
import { type Property, getFundingProgress, formatSOL } from '@/lib/properties'
import { cn } from '@/lib/utils'

interface PropertyCardProps {
  property: Property
  className?: string
}

const statusConfig = {
  active: { label: 'Live', color: 'bg-accent/20 text-accent border-accent/30' },
  funded: { label: 'Funded', color: 'bg-primary/20 text-primary border-primary/30' },
  coming_soon: { label: 'Coming Soon', color: 'bg-secondary text-muted-foreground border-border' },
}

export function PropertyCard({ property, className }: PropertyCardProps) {
  const progress = getFundingProgress(property)
  const remainingTokens = property.totalTokens - property.soldTokens
  const status = (property.status === 'active' && remainingTokens <= 0) 
    ? statusConfig.funded 
    : statusConfig[property.status]

  return (
    <Link
      href={`/marketplace/${property.id}`}
      className={cn(
        'group block rounded-2xl border-glow bg-card overflow-hidden card-hover',
        className
      )}
    >
      {/* Image */}
      <div className="relative h-52 overflow-hidden">
        <Image
          src={property.image}
          alt={property.name}
          fill
          className="object-cover transition-transform duration-500 group-hover:scale-105"
          sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-card via-card/20 to-transparent" />

        {/* Badges */}
        <div className="absolute top-3 left-3 flex items-center gap-2">
          <span className={cn('text-xs font-medium px-2.5 py-1 rounded-full border', status.color)}>
            {status.label}
          </span>
          {property.isFeatured && (
            <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-primary/20 text-primary border border-primary/30 flex items-center gap-1">
              <BadgeCheck className="w-3 h-3" />
              Featured
            </span>
          )}
        </div>

        {/* Yield badge */}
        <div className="absolute top-3 right-3">
          <div className="flex items-center gap-1 bg-black/60 backdrop-blur-sm px-2.5 py-1 rounded-full border border-accent/30">
            <TrendingUp className="w-3 h-3 text-accent" />
            <span className="text-xs font-bold text-accent">{property.annualYield}% APY</span>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="p-5">
        <div className="flex items-start justify-between gap-2 mb-1">
          <h3 className="font-semibold text-foreground leading-snug group-hover:text-primary transition-colors">
            {property.name}
          </h3>
        </div>

        <div className="flex items-center gap-1.5 text-muted-foreground text-sm mb-4">
          <MapPin className="w-3.5 h-3.5 shrink-0" />
          <span>{property.location}</span>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-3 gap-3 mb-4">
          <div>
            <p className="text-xs text-muted-foreground mb-0.5">Per Token</p>
            <p className="text-sm font-semibold text-foreground">{formatSOL(property.pricePerToken)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-0.5">Min. Invest</p>
            <p className="text-sm font-semibold text-foreground">{formatSOL(property.minInvestment)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-0.5">Occupancy</p>
            <p className="text-sm font-semibold text-accent">{property.occupancyRate}%</p>
          </div>
        </div>

        {/* Funding progress */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-1 text-muted-foreground">
              <Users className="w-3 h-3" />
              <span>{progress}% funded</span>
            </div>
            <span className="text-muted-foreground">{String(remainingTokens).replace(/\B(?=(\d{3})+(?!\d))/g, ',')} left</span>
          </div>
          <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${progress}%`,
                background: 'linear-gradient(90deg, #9945ff, #19fb9b)',
              }}
            />
          </div>
        </div>
      </div>
    </Link>
  )
}
