'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { Event, EventWithDetails, EventListParams, TicketAvailability, PaginatedResponse } from '@/types/event';

const EVENT_KEYS = {
  list: (params?: EventListParams) => ['events', 'list', params] as const,
  detail: (id: string) => ['events', 'detail', id] as const,
  availability: (slugOrId: string) => ['events', 'availability', slugOrId] as const,
};

const eventApi = {
  list: (params?: EventListParams) =>
    api.get<PaginatedResponse<Event>>('/api/events', { params }).then((r) => r.data),

  get: (id: string) =>
    api.get<EventWithDetails>(`/api/events/${id}`).then((r) => r.data),

  getBySlug: (slug: string) =>
    api.get<EventWithDetails>(`/api/events/${slug}`).then((r) => r.data),

  create: (data: Partial<Event>) =>
    api.post<Event>('/api/events', data).then((r) => r.data),

  update: (id: string, data: Partial<Event>) =>
    api.patch<Event>(`/api/events/${id}`, data).then((r) => r.data),

  delete: (id: string) =>
    api.delete(`/api/events/${id}`),

  submitReview: (id: string) =>
    api.post<{ status: string }>(`/api/events/${id}/submit-review`),

  publish: (id: string) =>
    api.post<{ status: string }>(`/api/events/${id}/publish`),

  cancel: (id: string, reason?: string) =>
    api.post(`/api/events/${id}/cancel`, { reason }),

  archive: (id: string) =>
    api.post(`/api/events/${id}/archive`),

  getAvailability: (slugOrId: string) =>
    api.get<TicketAvailability>(`/api/events/${slugOrId}/ticket-availability`).then((r) => r.data),
};

export function useEventList(params?: EventListParams) {
  const query = useQuery({
    queryKey: EVENT_KEYS.list(params),
    queryFn: () => eventApi.list(params),
  });
  return { ...query, error: query.error ? query.error.message : null };
}

export function useEvent(id: string) {
  const query = useQuery({
    queryKey: EVENT_KEYS.detail(id),
    queryFn: () => eventApi.get(id),
    enabled: !!id,
  });
  return { ...query, error: query.error ? query.error.message : null };
}

export function useEventBySlug(slug: string) {
  const query = useQuery({
    queryKey: EVENT_KEYS.detail(slug),
    queryFn: () => eventApi.getBySlug(slug),
    enabled: !!slug,
  });
  return { ...query, error: query.error ? query.error.message : null };
}

export function useEventAvailability(slugOrId: string) {
  const query = useQuery({
    queryKey: EVENT_KEYS.availability(slugOrId),
    queryFn: () => eventApi.getAvailability(slugOrId),
    enabled: !!slugOrId,
    refetchInterval: 30000,
  });
  return { ...query, error: query.error ? query.error.message : null };
}

export function useCreateEvent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: eventApi.create,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['events'] }),
  });
}

export function useUpdateEvent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Event> }) => eventApi.update(id, data),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: EVENT_KEYS.detail(id) });
      queryClient.invalidateQueries({ queryKey: ['events'] });
    },
  });
}

export function useDeleteEvent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: eventApi.delete,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['events'] }),
  });
}

export function useSubmitReview() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: eventApi.submitReview,
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: EVENT_KEYS.detail(id) });
    },
  });
}

export function usePublishEvent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: eventApi.publish,
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: EVENT_KEYS.detail(id) });
      queryClient.invalidateQueries({ queryKey: EVENT_KEYS.availability(id) });
    },
  });
}

export function useCancelEvent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason?: string }) => eventApi.cancel(id, reason),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: EVENT_KEYS.detail(id) });
    },
  });
}