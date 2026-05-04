export type EventStatus = 'DRAFT' | 'REVIEW' | 'PUBLISHED' | 'CANCELLED' | 'COMPLETED' | 'ARCHIVED';

export type TicketCategoryStatus = 'DRAFT' | 'ACTIVE' | 'PAUSED' | 'CLOSED' | 'SOLD_OUT';

export interface Event {
  id: string;
  slug: string;
  title: string;
  shortDescription?: string;
  description?: string;
  startDate: string;
  endDate: string;
  isMultiDay: boolean;
  city: string;
  province?: string;
  posterUrl?: string;
  bannerUrl?: string;
  status: EventStatus;
  publishedAt?: string;
  eoId: string;
  createdAt: string;
  updatedAt: string;
}

export interface EventWithDetails extends Event {
  venue?: EventVenue;
  lineups?: EventLineup[];
  rundowns?: EventRundown[];
  categories?: TicketCategory[];
  tags?: string[];
  genres?: string[];
}

export interface EventVenue {
  id: string;
  name: string;
  address: string;
  city: string;
  province?: string;
  capacity: number;
  mapsUrl?: string;
}

export interface EventLineup {
  id: string;
  eventId: string;
  name: string;
  role: string;
  imageUrl?: string;
  order: number;
}

export interface EventRundown {
  id: string;
  eventId: string;
  title: string;
  description?: string;
  startTime: string;
  endTime: string;
  order: number;
}

export interface TicketCategory {
  id: string;
  eventId: string;
  name: string;
  description?: string;
  price: number;
  quota: number;
  sold: number;
  saleStartAt?: string;
  saleEndAt?: string;
  isInternal: boolean;
  status: TicketCategoryStatus;
}

export interface TicketAvailability {
  categories: {
    id: string;
    name: string;
    available: number;
    sold: number;
    status: 'AVAILABLE' | 'LOW_STOCK' | 'NOT_YET' | 'CLOSED' | 'SOLD_OUT';
  }[];
}

export interface EventListParams {
  status?: EventStatus;
  city?: string;
  search?: string;
  page?: number;
  limit?: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}