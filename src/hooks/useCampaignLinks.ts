import { useEffect, useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { format } from 'date-fns';
import type { DateRange } from 'react-day-picker';
import { apiFetch } from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';
import { useUserRole } from '@/hooks/useUserRole';
import { dhakaToday, type CampaignInput, type CampaignReport } from '@/lib/campaignLinks';

class CampaignApiError extends Error {
  constructor(message: string, public status: number) { super(message); }
}
async function readCampaign<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await apiFetch(path, options);
  const data = await response.json();
  if (!response.ok) throw new CampaignApiError(data.error || 'Campaign links are temporarily unavailable. Please retry.', response.status);
  return data;
}
export function useCampaignIdentity() {
  const { user, loading: authLoading } = useAuth();
  const { role, loading: roleLoading } = useUserRole();
  const client = useQueryClient();
  const ready = !authLoading && !roleLoading && !!user && (role === 'admin' || role === 'team_member');
  const id = ready ? `${user.id}:${role}` : null;
  const previous = useRef(id);
  useEffect(() => {
    if (previous.current !== id) {
      // Identity-keyed reads prevent stale data on render; then purge old financial payloads.
      void client.cancelQueries({ predicate: q => q.queryKey[0] === 'campaign-links' && `${q.queryKey[1]}:${q.queryKey[2]}` !== id });
      client.removeQueries({ predicate: q => q.queryKey[0] === 'campaign-links' && `${q.queryKey[1]}:${q.queryKey[2]}` !== id });
      previous.current = id;
    }
  }, [id, client]);
  return { userId: user?.id ?? null, role, ready };
}
export function useCampaignDates() {
  const [params, setParams] = useSearchParams();
  const from = params.get('from') || dhakaToday();
  const to = params.get('to') || from;
  const query = new URLSearchParams({ from, to }).toString();
  const dateRange: DateRange = { from: new Date(`${from}T12:00:00`), to: new Date(`${to}T12:00:00`) };
  const setRange = (range: DateRange | undefined | null) => {
    const next = new URLSearchParams(params);
    next.set('from', range?.from ? format(range.from, 'yyyy-MM-dd') : dhakaToday());
    next.set('to', range?.to ? format(range.to, 'yyyy-MM-dd') : range?.from ? format(range.from, 'yyyy-MM-dd') : dhakaToday());
    setParams(next);
  };
  return { from, to, query, dateRange, setRange };
}
export function useCampaignLinks(query: string, id?: string, includeArchived = false, enabled = true) {
  const identity = useCampaignIdentity();
  const suffix = id ? `/${encodeURIComponent(id)}` : '';
  const result = useQuery({
    queryKey: ['campaign-links', identity.userId, identity.role, id ? 'detail' : 'list', id ?? '', query, includeArchived],
    queryFn: ({ signal }) => readCampaign<CampaignReport>(`/api/campaign-links${suffix}?${query}&include_archived=${includeArchived}`, { signal }),
    enabled: identity.ready && enabled, staleTime: 30_000, refetchInterval: 60_000,
    placeholderData: undefined,
  });
  return { ...result, data: identity.ready ? result.data : undefined, role: identity.role };
}
export function useSaveCampaignLink() {
  const identity = useCampaignIdentity();
  const client = useQueryClient();
  const refresh = () => client.invalidateQueries({ queryKey: ['campaign-links', identity.userId, identity.role] });
  return useMutation({
    mutationFn: ({ id, input }: { id?: string; input: CampaignInput | { archived: boolean } }) => {
      if (!identity.ready) throw new Error('Please sign in before changing a campaign link.');
      return readCampaign(`/api/campaign-links${id ? `/${encodeURIComponent(id)}` : ''}`, {
        method: id ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input),
      });
    },
    onSuccess: refresh,
    onError: error => { if (error instanceof CampaignApiError && error.status === 409) void refresh(); },
  });
}
