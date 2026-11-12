import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity, Search, RefreshCw, Loader2, Plus, Pencil, Trash2,
  ArrowRight, CalendarDays, History as HistoryIcon, ChevronDown,
} from 'lucide-react';
import { supabase } from '../lib/supabase';

type AuditRow = {
  id: string;
  cheque_id: string | null;
  user_id: string;
  actor_id: string | null;
  action: 'INSERT' | 'UPDATE' | 'DELETE';
  old_data: Record<string, any> | null;
  new_data: Record<string, any> | null;
  created_at: string;
};

const PAGE_SIZE = 100;

const fieldLabels: Record<string, string> = {
  payer_name: 'Payeur',
  amount: 'Montant',
  received_at: 'Date de réception',
  category: 'Catégorie',
  cheque_number: 'N° de chèque',
  bank_name: 'Banque',
  status: 'Statut',
  payment_method: 'Moyen de paiement',
  deposited_at: 'Date de dépôt',
  encashed_at: 'Date d’encaissement',
  comment: 'Commentaire',
};

const paymentMethodLabels: Record<string, string> = {
  cheque: 'Chèque bancaire',
  especes: 'Espèces',
  ancv: 'ANCV',
};

const paymentMethodColors: Record<string, string> = {
  cheque: 'border-blue-200 bg-blue-50 text-blue-700',
  especes: 'border-orange-200 bg-orange-50 text-orange-700',
  ancv: 'border-violet-200 bg-violet-50 text-violet-700',
};

const statusLabels: Record<string, string> = {
  a_deposer: 'À déposer',
  depose: 'Déposé',
  encaisse: 'Encaissé',
  annule: 'Annulé',
};

const money = (value: unknown) => {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return String(value ?? '—');
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'EUR',
  }).format(amount);
};

const formatValue = (field: string, value: unknown) => {
  if (value === null || value === undefined || value === '') return '—';
  if (field === 'amount') return money(value);
  if (field === 'status') return statusLabels[String(value)] || String(value);
  if (field === 'payment_method') {
    return paymentMethodLabels[String(value)] || String(value);
  }
  if (['received_at', 'deposited_at', 'encashed_at'].includes(field)) {
    const date = String(value);
    return date.includes('T')
      ? new Date(date).toLocaleString('fr-FR')
      : new Date(`${date}T12:00:00`).toLocaleDateString('fr-FR');
  }
  return String(value);
};

const formatDateTime = (value: string) =>
  new Date(value).toLocaleString('fr-FR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

const actionConfig = {
  INSERT: {
    label: 'Création',
    description: 'Un règlement a été ajouté au registre.',
    icon: Plus,
    color: 'bg-emerald-50 text-emerald-700 border-emerald-100',
  },
  UPDATE: {
    label: 'Modification',
    description: 'Un règlement a été modifié.',
    icon: Pencil,
    color: 'bg-amber-50 text-amber-700 border-amber-100',
  },
  DELETE: {
    label: 'Suppression',
    description: 'Un règlement a été supprimé du registre.',
    icon: Trash2,
    color: 'bg-red-50 text-red-700 border-red-100',
  },
};

function getSnapshot(row: AuditRow) {
  return row.action === 'DELETE' ? row.old_data : row.new_data;
}

function getChangedFields(row: AuditRow) {
  if (row.action !== 'UPDATE') return [];
  const before = row.old_data || {};
  const after = row.new_data || {};
  return Object.keys(fieldLabels)
    .filter((key) => before[key] !== after[key])
    .map((key) => ({
      key,
      label: fieldLabels[key],
      before: formatValue(key, before[key]),
      after: formatValue(key, after[key]),
    }));
}

export default function History() {
  const [events, setEvents] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [actionFilter, setActionFilter] = useState('ALL');
  const [yearFilter, setYearFilter] = useState('ALL');
  const [expanded, setExpanded] = useState<string[]>([]);
  const [hasMore, setHasMore] = useState(true);

  const loadEvents = useCallback(async (reset = true) => {
    if (reset) {
      setLoading(true);
      setError('');
    } else {
      setLoadingMore(true);
    }

    const from = reset ? 0 : events.length;
    const to = from + PAGE_SIZE - 1;

    const { data, error: queryError } = await supabase
      .from('cheques_audit')
      .select('id,cheque_id,user_id,actor_id,action,old_data,new_data,created_at')
      .order('created_at', { ascending: false })
      .range(from, to);

    if (queryError) {
      setError(
        queryError.message.includes('cheques_audit')
          ? 'La table d’historique n’est pas encore installée. Exécute d’abord le script SQL fourni.'
          : 'Impossible de charger l’historique. Vérifie les autorisations Supabase.'
      );
    } else {
      const rows = (data || []) as AuditRow[];
      setEvents((current) => reset ? rows : [...current, ...rows]);
      setHasMore(rows.length === PAGE_SIZE);
    }

    setLoading(false);
    setLoadingMore(false);
  }, [events.length]);

  useEffect(() => {
    loadEvents(true);
    // Chargement initial uniquement.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const years = useMemo(() => [
    ...new Set(events.map((event) => event.created_at.slice(0, 4))),
  ].sort().reverse(), [events]);

  const filteredEvents = useMemo(() => {
    const query = search.trim().toLocaleLowerCase('fr-FR');

    return events.filter((event) => {
      if (actionFilter !== 'ALL' && event.action !== actionFilter) return false;
      if (yearFilter !== 'ALL' && !event.created_at.startsWith(yearFilter)) return false;
      if (!query) return true;

      const snapshot = getSnapshot(event) || {};
      const previous = event.old_data || {};
      const searchable = [
        snapshot.payer_name,
        snapshot.cheque_number,
        snapshot.bank_name,
        snapshot.category,
        snapshot.payment_method,
        paymentMethodLabels[String(snapshot.payment_method || '')],
        previous.payer_name,
        previous.cheque_number,
        previous.bank_name,
        previous.category,
        previous.payment_method,
        paymentMethodLabels[String(previous.payment_method || '')],
        event.cheque_id,
      ].filter(Boolean).join(' ').toLocaleLowerCase('fr-FR');

      return searchable.includes(query);
    });
  }, [events, search, actionFilter, yearFilter]);

  const counts = useMemo(() => ({
    total: events.length,
    created: events.filter((event) => event.action === 'INSERT').length,
    modified: events.filter((event) => event.action === 'UPDATE').length,
    deleted: events.filter((event) => event.action === 'DELETE').length,
  }), [events]);

  const toggleExpanded = (id: string) => {
    setExpanded((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id]
    );
  };

  return (
    <div className="min-h-screen bg-[#f6f7f9] px-4 py-7 text-[#171717] md:px-9 md:py-9">
      <div className="mx-auto max-w-[1200px]">
        <div className="mb-8">
          <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-500">
            <HistoryIcon size={14} /> Traçabilité des opérations
          </div>
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Historique</h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-gray-500">
            Retrouvez toutes les opérations effectuées sur les règlements : créations,
            modifications et suppressions, avec les anciennes et nouvelles valeurs.
          </p>
        </div>

        {error && (
          <div className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[
            { label: 'Opérations chargées', value: counts.total, icon: Activity },
            { label: 'Créations', value: counts.created, icon: Plus },
            { label: 'Modifications', value: counts.modified, icon: Pencil },
            { label: 'Suppressions', value: counts.deleted, icon: Trash2 },
          ].map((item) => {
            const Icon = item.icon;
            return (
              <div key={item.label} className="rounded-2xl border border-gray-200 bg-white p-4">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-medium text-gray-500">{item.label}</p>
                  <Icon size={17} className="text-gray-400" />
                </div>
                <p className="mt-3 text-2xl font-bold tabular-nums">{item.value}</p>
              </div>
            );
          })}
        </div>

        <section className="mb-6 rounded-2xl border border-gray-200 bg-white p-4 md:p-5">
          <div className="grid gap-3 md:grid-cols-[1fr_190px_160px_auto]">
            <label className="relative block">
              <Search size={17} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Rechercher un payeur, un chèque..."
                className="h-11 w-full rounded-xl border border-gray-200 bg-gray-50 pl-10 pr-3 text-sm outline-none focus:border-red-400"
              />
            </label>

            <select
              value={actionFilter}
              onChange={(event) => setActionFilter(event.target.value)}
              className="h-11 rounded-xl border border-gray-200 bg-gray-50 px-3 text-sm outline-none focus:border-red-400"
            >
              <option value="ALL">Toutes les opérations</option>
              <option value="INSERT">Créations</option>
              <option value="UPDATE">Modifications</option>
              <option value="DELETE">Suppressions</option>
            </select>

            <select
              value={yearFilter}
              onChange={(event) => setYearFilter(event.target.value)}
              className="h-11 rounded-xl border border-gray-200 bg-gray-50 px-3 text-sm outline-none focus:border-red-400"
            >
              <option value="ALL">Toutes les années</option>
              {years.map((year) => <option key={year} value={year}>{year}</option>)}
            </select>

            <button
              onClick={() => {
                setSearch('');
                setActionFilter('ALL');
                setYearFilter('ALL');
              }}
              className="h-11 rounded-xl border border-gray-200 px-4 text-sm font-semibold text-gray-600 hover:bg-gray-50"
            >
              Réinitialiser
            </button>
          </div>
          <div className="mt-3 flex items-center justify-between gap-3 text-xs text-gray-500">
            <span>{filteredEvents.length} opération(s) affichée(s) sur {events.length} chargée(s)</span>
            <button
              onClick={() => loadEvents(true)}
              disabled={loading}
              className="inline-flex items-center gap-2 font-semibold text-gray-600 hover:text-red-700 disabled:opacity-50"
            >
              <RefreshCw size={13} /> Actualiser
            </button>
          </div>
        </section>

        {loading ? (
          <div className="flex items-center justify-center gap-3 rounded-2xl border border-gray-200 bg-white py-16 text-sm text-gray-500">
            <Loader2 size={20} className="animate-spin" /> Chargement de l’historique...
          </div>
        ) : filteredEvents.length === 0 ? (
          <div className="rounded-2xl border border-gray-200 bg-white px-6 py-16 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-gray-100 text-gray-400">
              <HistoryIcon size={25} />
            </div>
            <h2 className="mt-4 font-semibold">Aucune opération à afficher</h2>
            <p className="mt-2 text-sm text-gray-500">
              Les nouvelles opérations apparaîtront ici dès qu’elles seront enregistrées.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredEvents.map((event) => {
              const config = actionConfig[event.action];
              const Icon = config.icon;
              const snapshot = getSnapshot(event) || {};
              const changedFields = getChangedFields(event);
              const isOpen = expanded.includes(event.id);
              const payer = snapshot.payer_name || event.old_data?.payer_name || 'Payeur inconnu';

              return (
                <article key={event.id} className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
                  <button
                    type="button"
                    onClick={() => toggleExpanded(event.id)}
                    className="flex w-full items-center gap-3 p-4 text-left transition hover:bg-gray-50 md:gap-4 md:px-5"
                  >
                    <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border ${config.color}`}>
                      <Icon size={19} />
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${config.color}`}>
                          {config.label}
                        </span>
                        <span className="text-xs text-gray-400">{formatDateTime(event.created_at)}</span>
                        {snapshot.payment_method && (
                          <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${paymentMethodColors[String(snapshot.payment_method)] || 'border-gray-200 bg-gray-50 text-gray-600'}`}>
                            {paymentMethodLabels[String(snapshot.payment_method)] || String(snapshot.payment_method)}
                          </span>
                        )}
                      </div>
                      <p className="mt-1 truncate text-sm font-semibold text-gray-900">{payer}</p>
                      <p className="mt-0.5 text-xs text-gray-500">
                        {event.action === 'UPDATE'
                          ? `${changedFields.length} champ(s) modifié(s)`
                          : config.description}
                        {snapshot.amount !== undefined ? ` · ${money(snapshot.amount)}` : ''}
                      </p>
                    </div>

                    <ChevronDown
                      size={18}
                      className={`shrink-0 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}
                    />
                  </button>

                  {isOpen && (
                    <div className="border-t border-gray-100 bg-[#fbfbfc] px-4 py-4 md:px-5">
                      {event.action === 'UPDATE' ? (
                        changedFields.length > 0 ? (
                          <div className="space-y-2">
                            {changedFields.map((field) => (
                              <div
                                key={field.key}
                                className="grid gap-2 rounded-xl border border-gray-100 bg-white p-3 sm:grid-cols-[150px_1fr_auto_1fr] sm:items-center"
                              >
                                <span className="text-xs font-semibold text-gray-500">{field.label}</span>
                                <span className="break-words text-sm text-gray-500">{field.before}</span>
                                <ArrowRight size={15} className="hidden text-gray-400 sm:block" />
                                <span className="break-words text-sm font-semibold text-gray-900">{field.after}</span>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-sm text-gray-500">Aucune différence de champ suivie n’a été détectée.</p>
                        )
                      ) : (
                        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                          {Object.entries(fieldLabels)
                            .filter(([key]) => snapshot[key] !== undefined && snapshot[key] !== null && snapshot[key] !== '')
                            .map(([key, label]) => (
                              <div key={key} className="rounded-xl border border-gray-100 bg-white p-3">
                                <p className="text-[11px] font-medium text-gray-400">{label}</p>
                                <p className="mt-1 break-words text-sm font-semibold text-gray-800">
                                  {formatValue(key, snapshot[key])}
                                </p>
                              </div>
                            ))}
                        </div>
                      )}

                      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-gray-400">
                        <span className="inline-flex items-center gap-1">
                          <CalendarDays size={12} /> {formatDateTime(event.created_at)}
                        </span>
                        {event.cheque_id && <span>Référence : {event.cheque_id}</span>}
                        <span>Compte : {event.actor_id ? `${event.actor_id.slice(0, 8)}…` : 'Non identifié'}</span>
                      </div>
                    </div>
                  )}
                </article>
              );
            })}

            {hasMore && (
              <button
                onClick={() => loadEvents(false)}
                disabled={loadingMore}
                className="flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                {loadingMore ? (
                  <><Loader2 size={17} className="animate-spin" /> Chargement...</>
                ) : (
                  'Charger les opérations précédentes'
                )}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
