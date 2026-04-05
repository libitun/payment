export type PropertyStatus = 'active' | 'funded' | 'coming_soon'
export type PropertyType = 'residential' | 'commercial' | 'mixed'

export interface Property {
  id: string
  name: string
  location: string
  country: string
  type: PropertyType
  status: PropertyStatus
  image: string
  pricePerToken: number      // in SOL
  totalTokens: number
  soldTokens: number
  targetRaise: number        // in USD
  minInvestment: number      // in SOL
  annualYield: number        // %
  appreciationTarget: number // %
  description: string
  highlights: string[]
  bedrooms?: number
  bathrooms?: number
  sqft: number
  yearBuilt: number
  tokenMint: string          // mock Solana address
  isFeatured: boolean
  monthlyRent: number        // USD
  occupancyRate: number      // %
  yieldHistory: { month: string; yield: number }[]
}

export const properties: Property[] = [
  {
    id: 'nyc-penthouse-001-v3',
    name: 'Manhattan Penthouse',
    location: 'Upper East Side, New York',
    country: 'USA',
    type: 'residential',
    status: 'active',
    image: '/images/properties/nyc-penthouse.jpg',
    pricePerToken: 0.001,
    totalTokens: 10000,
    soldTokens: 7840,
    targetRaise: 2_400_000,
    minInvestment: 0.5,
    annualYield: 8.4,
    appreciationTarget: 12,
    sqft: 3200,
    bedrooms: 4,
    bathrooms: 3,
    yearBuilt: 2019,
    description:
      "A stunning 4-bedroom penthouse on the 38th floor with panoramic Manhattan skyline views. Located steps from Central Park in one of NYC's most prestigious buildings. Fully managed short-term rental with consistently high occupancy.",
    highlights: [
      'Panoramic skyline & Central Park views',
      'Concierge, gym & rooftop pool',
      'Strong short-term rental demand',
      'Professional property management',
    ],
    tokenMint: '5VrAqKk1L46wxxWEE4AEfNYZcBvitWnHJRxbPVshdKYu',
    isFeatured: true,
    monthlyRent: 18500,
    occupancyRate: 94,
    yieldHistory: [
      { month: 'Jul', yield: 7.8 }, { month: 'Aug', yield: 8.1 }, { month: 'Sep', yield: 8.4 },
      { month: 'Oct', yield: 8.2 }, { month: 'Nov', yield: 8.6 }, { month: 'Dec', yield: 9.1 },
      { month: 'Jan', yield: 8.7 }, { month: 'Feb', yield: 8.4 },
    ],
  },
  {
    id: 'miami-villa-002-v3',
    name: 'Miami Beach Villa',
    location: 'South Beach, Miami',
    country: 'USA',
    type: 'residential',
    status: 'active',
    image: '/images/properties/miami-villa.jpg',
    pricePerToken: 0.001,
    totalTokens: 20000,
    soldTokens: 11200,
    targetRaise: 1_800_000,
    minInvestment: 0.25,
    annualYield: 11.2,
    appreciationTarget: 15,
    sqft: 5800,
    bedrooms: 6,
    bathrooms: 5,
    yearBuilt: 2021,
    description:
      'Oceanfront villa with private beach access and a heated infinity pool. Premium vacation rental in the heart of South Beach, commanding top-tier nightly rates during peak season. Managed by award-winning Miami hospitality group.',
    highlights: [
      'Direct beach access, private pool',
      'Luxury vacation rental income',
      'Award-winning management team',
      'Strong seasonal demand',
    ],
    tokenMint: '2iEwrc1zaocZJQudCx3kNWtZG8f8tJZqwCprXfiba95o',
    isFeatured: true,
    monthlyRent: 32000,
    occupancyRate: 89,
    yieldHistory: [
      { month: 'Jul', yield: 9.8 }, { month: 'Aug', yield: 12.4 }, { month: 'Sep', yield: 10.1 },
      { month: 'Oct', yield: 11.0 }, { month: 'Nov', yield: 11.5 }, { month: 'Dec', yield: 13.2 },
      { month: 'Jan', yield: 12.1 }, { month: 'Feb', yield: 11.2 },
    ],
  },
  {
    id: 'dubai-tower-003-v3',
    name: 'Dubai Marina Tower',
    location: 'Dubai Marina, Dubai',
    country: 'UAE',
    type: 'residential',
    status: 'active',
    image: '/images/properties/dubai-tower.jpg',
    pricePerToken: 0.001,
    totalTokens: 5000,
    soldTokens: 5000,
    targetRaise: 3_200_000,
    minInvestment: 1.0,
    annualYield: 9.8,
    appreciationTarget: 20,
    sqft: 2100,
    bedrooms: 3,
    bathrooms: 2,
    yearBuilt: 2022,
    description:
      "Premium high-rise apartment in one of Dubai's most iconic addresses. Tax-free environment with exceptional rental yields and strong capital appreciation driven by Dubai's booming luxury property market.",
    highlights: [
      'Tax-free rental income',
      'Premium Dubai Marina views',
      'High capital appreciation',
      'Zero property taxes',
    ],
    tokenMint: 'HotTD9XK2vfZoVePeGY1piw593MtXpyGzXGsys7UvJr2',
    isFeatured: true,
    monthlyRent: 12000,
    occupancyRate: 96,
    yieldHistory: [
      { month: 'Jul', yield: 9.1 }, { month: 'Aug', yield: 9.4 }, { month: 'Sep', yield: 9.8 },
      { month: 'Oct', yield: 10.2 }, { month: 'Nov', yield: 9.6 }, { month: 'Dec', yield: 10.5 },
      { month: 'Jan', yield: 10.1 }, { month: 'Feb', yield: 9.8 },
    ],
  },
  {
    id: 'london-flat-004-v3',
    name: 'Mayfair Georgian Townhouse',
    location: 'Mayfair, London',
    country: 'UK',
    type: 'residential',
    status: 'active',
    image: '/images/properties/london-flat.jpg',
    pricePerToken: 0.001,
    totalTokens: 8000,
    soldTokens: 3200,
    targetRaise: 4_100_000,
    minInvestment: 0.75,
    annualYield: 6.2,
    appreciationTarget: 8,
    sqft: 4100,
    bedrooms: 5,
    bathrooms: 4,
    yearBuilt: 1890,
    description:
      "A rare Grade II listed Georgian townhouse in prestigious Mayfair, meticulously restored with modern interiors. One of London's most sought-after postcodes with exceptional long-term capital growth and strong demand from affluent tenants.",
    highlights: [
      'Grade II listed heritage building',
      'Mayfair prime central London',
      'Fully restored modern interiors',
      'Long-term capital appreciation',
    ],
    tokenMint: 'BdYjMXyZj22L587GUHj4giJFznv4YSqt6Q5uiaScTuj1',
    isFeatured: false,
    monthlyRent: 22000,
    occupancyRate: 98,
    yieldHistory: [
      { month: 'Jul', yield: 5.8 }, { month: 'Aug', yield: 6.1 }, { month: 'Sep', yield: 6.2 },
      { month: 'Oct', yield: 6.0 }, { month: 'Nov', yield: 6.3 }, { month: 'Dec', yield: 6.5 },
      { month: 'Jan', yield: 6.4 }, { month: 'Feb', yield: 6.2 },
    ],
  },
  {
    id: 'singapore-condo-005-v3',
    name: 'Marina Bay Residences',
    location: 'Marina Bay, Singapore',
    country: 'Singapore',
    type: 'residential',
    status: 'active',
    image: '/images/properties/singapore-condo.jpg',
    pricePerToken: 0.001,
    totalTokens: 12000,
    soldTokens: 8640,
    targetRaise: 5_200_000,
    minInvestment: 0.6,
    annualYield: 7.1,
    appreciationTarget: 11,
    sqft: 1850,
    bedrooms: 3,
    bathrooms: 2,
    yearBuilt: 2020,
    description:
      "Flagship luxury condominium with stunning Marina Bay Sands views, sky gardens, and a world-class amenity deck. Located in Singapore's financial district, prime for corporate long-term rentals with stable, high-quality tenants.",
    highlights: [
      'Marina Bay Sands views',
      'Corporate tenant demand',
      'Rooftop gardens & infinity pool',
      'Singapore stable rental market',
    ],
    tokenMint: 'AmpGg552Zubx21wjBrcw6FjAAo2QJTg2NjsKLa6XoycD',
    isFeatured: false,
    monthlyRent: 8500,
    occupancyRate: 97,
    yieldHistory: [
      { month: 'Jul', yield: 6.8 }, { month: 'Aug', yield: 7.0 }, { month: 'Sep', yield: 7.1 },
      { month: 'Oct', yield: 7.3 }, { month: 'Nov', yield: 6.9 }, { month: 'Dec', yield: 7.5 },
      { month: 'Jan', yield: 7.2 }, { month: 'Feb', yield: 7.1 },
    ],
  },
  {
    id: 'tokyo-apt-006-v3',
    name: 'Shibuya Luxury Apartments',
    location: 'Shibuya, Tokyo',
    country: 'Japan',
    type: 'residential',
    status: 'active',
    image: '/images/properties/tokyo-apt.jpg',
    pricePerToken: 0.001,
    totalTokens: 15000,
    soldTokens: 6000,
    targetRaise: 2_800_000,
    minInvestment: 0.4,
    annualYield: 5.8,
    appreciationTarget: 9,
    sqft: 950,
    bedrooms: 2,
    bathrooms: 1,
    yearBuilt: 2023,
    description:
      "Brand-new serviced apartments in Tokyo's most vibrant district. Steps from Shibuya Crossing, targeting both corporate and premium short-term rental markets. Japan's stable economy and growing inbound tourism drive consistent demand.",
    highlights: [
      'Brand new 2023 construction',
      'Central Shibuya location',
      'Stable Japanese property market',
      'Growing tourism & corporate demand',
    ],
    tokenMint: 'HKfJwqtZzrCgGJCzTtFbHVhsMYexD1G1K6mqz4Asvdfn',
    isFeatured: false,
    monthlyRent: 4200,
    occupancyRate: 92,
    yieldHistory: [
      { month: 'Jul', yield: 5.2 }, { month: 'Aug', yield: 5.6 }, { month: 'Sep', yield: 5.8 },
      { month: 'Oct', yield: 5.9 }, { month: 'Nov', yield: 5.7 }, { month: 'Dec', yield: 6.2 },
      { month: 'Jan', yield: 6.0 }, { month: 'Feb', yield: 5.8 },
    ],
  },
  {
    id: 'barcelona-penthouse-007-v3',
    name: 'Barcelona Sea View Penthouse',
    location: 'Barceloneta, Barcelona',
    country: 'Spain',
    type: 'residential',
    status: 'coming_soon',
    image: '/images/properties/barcelona-penthouse.jpg',
    pricePerToken: 0.001,
    totalTokens: 18000,
    soldTokens: 0,
    targetRaise: 2_100_000,
    minInvestment: 0.35,
    annualYield: 9.5,
    appreciationTarget: 13,
    sqft: 2600,
    bedrooms: 3,
    bathrooms: 2,
    yearBuilt: 2018,
    description:
      "Stunning rooftop penthouse overlooking the Mediterranean Sea in the heart of Barcelona's beachside district. Premium vacation rental with a private terrace and plunge pool, capturing Barcelona's booming tourist market.",
    highlights: [
      'Mediterranean sea panoramic views',
      'Private rooftop terrace & plunge pool',
      'Barcelona tourist hotspot',
      'High vacation rental returns',
    ],
    tokenMint: 'CE6cit8w5pLeeQ7NuaNRVVrhkyQd2LWN4m7cj25Zypx7',
    isFeatured: false,
    monthlyRent: 14500,
    occupancyRate: 88,
    yieldHistory: [
      { month: 'Jul', yield: 8.9 }, { month: 'Aug', yield: 10.2 }, { month: 'Sep', yield: 9.5 },
      { month: 'Oct', yield: 9.1 }, { month: 'Nov', yield: 9.3 }, { month: 'Dec', yield: 10.8 },
      { month: 'Jan', yield: 9.7 }, { month: 'Feb', yield: 9.5 },
    ],
  },
]

export function getPropertyById(id: string): Property | undefined {
  return properties.find((p) => p.id === id)
}

export function getFeaturedProperties(): Property[] {
  return properties.filter((p) => p.isFeatured)
}

export function getFundingProgress(property: Property): number {
  return Math.round((property.soldTokens / property.totalTokens) * 100)
}

export function formatSOL(amount: number): string {
  return `${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 })} SOL`
}

export function formatUSD(amount: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(amount)
}

// Mock portfolio for the dashboard
export const mockPortfolio = [
  { propertyId: 'nyc-penthouse-001-v3', tokensOwned: 40, purchasePrice: 0.42, currentPrice: 0.5 },
  { propertyId: 'miami-villa-002-v3', tokensOwned: 120, purchasePrice: 0.20, currentPrice: 0.25 },
  { propertyId: 'dubai-tower-003-v3', tokensOwned: 8, purchasePrice: 0.85, currentPrice: 1.0 },
  { propertyId: 'singapore-condo-005-v3', tokensOwned: 60, purchasePrice: 0.52, currentPrice: 0.6 },
]

export const portfolioYieldHistory = [
  { month: 'Jul', value: 4820, yield: 7.2 },
  { month: 'Aug', value: 5140, yield: 7.9 },
  { month: 'Sep', value: 5380, yield: 8.1 },
  { month: 'Oct', value: 5210, yield: 7.8 },
  { month: 'Nov', value: 5640, yield: 8.5 },
  { month: 'Dec', value: 6100, yield: 9.2 },
  { month: 'Jan', value: 5890, yield: 8.8 },
  { month: 'Feb', value: 6240, yield: 9.4 },
]
