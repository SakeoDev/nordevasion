import { useEffect, useMemo, useState } from 'react';
import {
  ReceiptText, Plus, Search, SlidersHorizontal, Pencil, Trash2,
  X, CheckCircle2, CircleDollarSign, Loader2, CalendarDays,
  ChevronDown, ChevronRight,
} from 'lucide-react';
import { supabase } from '../lib/supabase';

type Check = {
  id: string;
  payer_name: string;
  amount: number;
  received_at: string;
  category: string;
  cheque_number: string | null;
  bank_name: string | null;
  status: string;
  payment_method: 'cheque' | 'especes' | 'ancv';
  comment: string | null;
};

const categories = [
  'Cotisations',
  'Voyages et sorties',
  'Dons',
  'Autres règlements',
];

const paymentMethods = [
  { value: 'cheque', label: 'Chèque bancaire' },
  { value: 'especes', label: 'Espèces' },
  { value: 'ancv', label: 'ANCV' },
] as const;

const paymentMethodLabel = (value: string) =>
  paymentMethods.find((item) => item.value === value)?.label || 'Chèque bancaire';

const paymentMethodStyle = (value: string) => {
  if (value === 'especes') return 'bg-amber-50 text-amber-800 ring-1 ring-inset ring-amber-200';
  if (value === 'ancv') return 'bg-violet-50 text-violet-800 ring-1 ring-inset ring-violet-200';
  return 'bg-blue-50 text-blue-800 ring-1 ring-inset ring-blue-200';
};

const statuses = [
  { value: 'a_deposer', label: 'À déposer' },
  { value: 'depose', label: 'Déposé' },
  { value: 'encaisse', label: 'Encaissé' },
  { value: 'annule', label: 'Annulé' },
];

const money = (value: number) =>
  new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'EUR',
  }).format(value);

const dateLabel = (value: string) =>
  new Date(`${value}T12:00:00`).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

export default function ChecksRegister() {
  const [checks, setChecks] = useState<Check[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('Toutes les catégories');
  const [status, setStatus] = useState('Tous les statuts');
  const [paymentMethod, setPaymentMethod] = useState('Tous les moyens');
  const [year, setYear] = useState('Toutes les années');
  const [editing, setEditing] = useState<Check | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  // Les journées sont fermées au départ.
  const [expandedDates, setExpandedDates] = useState<string[]>([]);

  function toggleDate(date: string) {
    setExpandedDates((current) =>
      current.includes(date)
        ? current.filter((item) => item !== date)
        : [...current, date]
    );
  }

  async function loadChecks() {
    setLoading(true);
    setError('');

    const { data, error } = await supabase
      .from('cheques')
      .select('*')
      .order('received_at', { ascending: false })
      .order('created_at', { ascending: false });

    if (error) {
      setError('Impossible de charger les règlements. Réessaie.');
      setChecks([]);
    } else {
      setChecks((data || []) as Check[]);
    }

    setLoading(false);
  }

  useEffect(() => {
    loadChecks();
  }, []);

  const years = useMemo(
    () => [...new Set(checks.map((item) => item.received_at.slice(0, 4)))].sort().reverse(),
    [checks]
  );

  const filteredChecks = useMemo(() => {
    const query = search.trim().toLowerCase();

    return checks.filter((item) => {
      const matchesSearch =
        !query ||
        item.payer_name.toLowerCase().includes(query) ||
        (item.cheque_number || '').toLowerCase().includes(query) ||
        (item.bank_name || '').toLowerCase().includes(query) ||
        paymentMethodLabel(item.payment_method || 'cheque').toLowerCase().includes(query);

      const matchesCategory =
        category === 'Toutes les catégories' || item.category === category;

      const matchesStatus =
        status === 'Tous les statuts' || item.status === status;

      const matchesPaymentMethod =
        paymentMethod === 'Tous les moyens' ||
        (item.payment_method || 'cheque') === paymentMethod;

      const matchesYear =
        year === 'Toutes les années' || item.received_at.startsWith(year);

      return matchesSearch && matchesCategory && matchesStatus && matchesPaymentMethod && matchesYear;
    });
  }, [checks, search, category, status, paymentMethod, year]);

  const groupedChecks = useMemo(() => {
    const groups = new Map<string, Check[]>();

    filteredChecks.forEach((item) => {
      const existing = groups.get(item.received_at) || [];
      existing.push(item);
      groups.set(item.received_at, existing);
    });

    return [...groups.entries()]
      .sort(([dateA], [dateB]) => dateB.localeCompare(dateA))
      .map(([date, items]) => ({
        date,
        items,
        count: items.length,
        total: items
          .filter((item) => item.status !== 'annule')
          .reduce((sum, item) => sum + Number(item.amount), 0),
      }));
  }, [filteredChecks]);

  const total = filteredChecks.reduce(
    (sum, item) => sum + Number(item.amount),
    0
  );

  const activeTotal = filteredChecks
    .filter((item) => item.status !== 'annule')
    .reduce((sum, item) => sum + Number(item.amount), 0);

  async function saveEdit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editing) return;

    setSaving(true);
    setError('');

    const { error } = await supabase
      .from('cheques')
      .update({
        payer_name: editing.payer_name.trim(),
        amount: Number(editing.amount),
        received_at: editing.received_at,
        category: editing.category,
        status: editing.payment_method === 'cheque' ? editing.status : 'encaisse',
        payment_method: editing.payment_method || 'cheque',
        cheque_number: editing.payment_method === 'cheque' ? editing.cheque_number || null : null,
        bank_name: editing.payment_method === 'cheque' ? editing.bank_name || null : null,
        comment: editing.comment || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', editing.id);

    if (error) {
      setError('La modification a échoué. Vérifie les informations.');
    } else {
      setEditing(null);
      await loadChecks();
    }

    setSaving(false);
  }

  async function deleteCheck(id: string) {
    if (!window.confirm('Supprimer définitivement ce règlement ?')) return;

    setDeleting(id);
    const { error } = await supabase.from('cheques').delete().eq('id', id);

    if (error) {
      setError('La suppression a échoué.');
    } else {
      setChecks((current) => current.filter((item) => item.id !== id));
    }

    setDeleting(null);
  }

  function resetFilters() {
    setSearch('');
    setCategory('Toutes les catégories');
    setStatus('Tous les statuts');
    setPaymentMethod('Tous les moyens');
    setYear('Toutes les années');
  }

  const statusStyle = (value: string) => {
    if (value === 'encaisse') return 'bg-emerald-50 text-emerald-700';
    if (value === 'depose') return 'bg-blue-50 text-blue-700';
    if (value === 'annule') return 'bg-red-50 text-red-700';
    return 'bg-amber-50 text-amber-700';
  };

  const statusText = (value: string) =>
    statuses.find((item) => item.value === value)?.label || value;

  return (
    <div className="min-h-screen bg-[#f6f7f9] text-[#171717]">
      <header className="sticky top-0 z-20 flex min-h-[76px] items-center justify-between border-b border-gray-200 bg-white/95 px-5 backdrop-blur md:px-9">
        <div>
          <p className="text-xs text-gray-400">Nord Évasion 59 / Registre</p>
          <p className="mt-1 text-sm font-semibold">Registre des règlements</p>
        </div>
        <a href="/ajouter" className="hidden items-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 sm:flex">
          <Plus size={17} /> Ajouter un règlement
        </a>
      </header>

      <main className="mx-auto max-w-[1400px] px-4 py-7 md:px-9 md:py-9">
        <div className="mb-7 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-500">
              <ReceiptText size={14} /> Registre général
            </div>
            <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Tous les règlements</h1>
            <p className="mt-2 text-sm text-gray-500">
              Les règlements sont classés par date de réception.
            </p>
          </div>
          <a href="/ajouter" className="flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-3.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 sm:hidden">
            <Plus size={18} /> Ajouter un règlement
          </a>
        </div>

        {error && (
          <div className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
        )}

        <section className="mb-6 grid gap-4 sm:grid-cols-2">
          <div className="rounded-2xl border border-gray-200 bg-white p-5">
            <div className="flex items-center justify-between">
              <p className="text-sm text-gray-500">Règlements affichés</p>
              <div className="rounded-xl bg-blue-50 p-2.5 text-blue-700"><ReceiptText size={19} /></div>
            </div>
            <p className="mt-3 text-2xl font-bold tabular-nums">{filteredChecks.length}</p>
            <p className="mt-1 text-xs text-gray-400">Sur {checks.length} règlement(s) enregistré(s)</p>
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white p-5">
            <div className="flex items-center justify-between">
              <p className="text-sm text-gray-500">Total des règlements affichés</p>
              <div className="rounded-xl bg-emerald-50 p-2.5 text-emerald-700"><CircleDollarSign size={19} /></div>
            </div>
            <p className="mt-3 text-2xl font-bold tabular-nums">{money(activeTotal)}</p>
            <p className="mt-1 text-xs text-gray-400">
              {money(total)} en incluant les règlements annulés
            </p>
          </div>
        </section>

        <section className="mb-5 rounded-2xl border border-gray-200 bg-white p-4 md:p-5">
          <div className="mb-4 flex items-center gap-2 text-sm font-semibold">
            <SlidersHorizontal size={17} /> Recherche et filtres
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            <div className="relative md:col-span-2 xl:col-span-1">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Nom, banque, n° de chèque..." className="h-12 w-full rounded-xl border border-gray-200 bg-gray-50 pl-10 pr-3 text-sm outline-none transition focus:border-blue-500 focus:bg-white" />
            </div>
            <select value={category} onChange={(e) => setCategory(e.target.value)} className="h-12 rounded-xl border border-gray-200 bg-gray-50 px-3 text-sm outline-none focus:border-blue-500">
              <option>Toutes les catégories</option>
              {categories.map((item) => <option key={item}>{item}</option>)}
            </select>
            <select value={status} onChange={(e) => setStatus(e.target.value)} className="h-12 rounded-xl border border-gray-200 bg-gray-50 px-3 text-sm outline-none focus:border-blue-500">
              <option value="Tous les statuts">Tous les statuts</option>
              {statuses.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
            <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} className="h-12 rounded-xl border border-gray-200 bg-gray-50 px-3 text-sm outline-none focus:border-blue-500">
              <option value="Tous les moyens">Tous les moyens</option>
              {paymentMethods.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
            <select value={year} onChange={(e) => setYear(e.target.value)} className="h-12 rounded-xl border border-gray-200 bg-gray-50 px-3 text-sm outline-none focus:border-blue-500">
              <option>Toutes les années</option>
              {years.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </div>
          <div className="mt-3 flex justify-end">
            <button onClick={resetFilters} className="text-xs font-semibold text-blue-700 hover:text-blue-900">Réinitialiser les filtres</button>
          </div>
        </section>

        <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
          <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
            <div>
              <h2 className="font-semibold">Règlements par journée</h2>
              <p className="mt-1 text-xs text-gray-400">
                {filteredChecks.length} résultat(s) · {groupedChecks.length} journée(s)
              </p>
            </div>
            <button onClick={loadChecks} className="rounded-lg border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-50">
              Actualiser
            </button>
          </div>

          {loading ? (
            <div className="flex items-center justify-center gap-3 py-16 text-sm text-gray-500">
              <Loader2 className="animate-spin" size={20} /> Chargement des règlements...
            </div>
          ) : filteredChecks.length === 0 ? (
            <div className="px-5 py-16 text-center">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gray-100 text-gray-400">
                <ReceiptText size={25} />
              </div>
              <p className="font-semibold">Aucun règlement trouvé</p>
              <p className="mt-2 text-sm text-gray-500">
                {checks.length === 0 ? 'Les règlements ajoutés apparaîtront ici.' : 'Essaie de modifier tes critères de recherche.'}
              </p>
              {checks.length === 0 && (
                <a href="/ajouter" className="mt-5 inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white">
                  <Plus size={16} /> Ajouter le premier règlement
                </a>
              )}
            </div>
          ) : (
            <div className="divide-y divide-gray-200">
              {groupedChecks.map((group) => {
                const isExpanded = expandedDates.includes(group.date);

                return (
                  <div key={group.date}>
                    <button
                      type="button"
                      onClick={() => toggleDate(group.date)}
                      aria-expanded={isExpanded}
                      className="flex w-full flex-col justify-between gap-3 bg-gray-50 px-5 py-4 text-left transition hover:bg-gray-100 sm:flex-row sm:items-center"
                    >
                      <div className="flex items-center gap-3">
                        <div className="rounded-xl border border-gray-200 bg-white p-2.5 text-gray-500">
                          <CalendarDays size={19} />
                        </div>
                        <div className="text-gray-500">
                          {isExpanded ? <ChevronDown size={17} /> : <ChevronRight size={17} />}
                        </div>
                        <div>
                          <h3 className="font-semibold capitalize">{dateLabel(group.date)}</h3>
                          <p className="mt-0.5 text-xs text-gray-500">
                            {group.count} règlement{group.count > 1 ? 's' : ''}
                            {' · '}
                            {isExpanded ? 'Cliquer pour replier' : 'Cliquer pour afficher'}
                          </p>
                        </div>
                      </div>
                      <div className="sm:text-right">
                        <p className="text-xs text-gray-500">Sous-total de la journée</p>
                        <p className="mt-0.5 text-lg font-bold tabular-nums">{money(group.total)}</p>
                        <p className="text-[11px] text-gray-400">Hors règlements annulés</p>
                      </div>
                    </button>

                    {isExpanded && (
                      <>
                        <div className="hidden overflow-x-auto md:block">
                          <table className="w-full text-left text-sm">
                            <thead className="bg-white text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                              <tr>
                                <th className="px-5 py-3">Payeur</th>
                                <th className="px-5 py-3">Catégorie</th>
                                <th className="px-5 py-3">Moyen</th>
                                <th className="px-5 py-3">N° de chèque</th>
                                <th className="px-5 py-3">Montant</th>
                                <th className="px-5 py-3">Statut</th>
                                <th className="px-5 py-3 text-right">Actions</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                              {group.items.map((item) => (
                                <tr key={item.id} className="hover:bg-gray-50/70">
                                  <td className="px-5 py-4">
                                    <p className="font-semibold">{item.payer_name}</p>
                                    {item.bank_name && <p className="mt-1 text-xs text-gray-400">{item.bank_name}</p>}
                                  </td>
                                  <td className="px-5 py-4 text-gray-600">{item.category}</td>
                                  <td className="px-5 py-4">
                                    <span className={`whitespace-nowrap rounded-full px-2.5 py-1.5 text-xs font-semibold ${paymentMethodStyle(item.payment_method || 'cheque')}`}>
                                      {paymentMethodLabel(item.payment_method || 'cheque')}
                                    </span>
                                  </td>
                                  <td className="px-5 py-4 text-gray-500">{(item.payment_method || 'cheque') === 'cheque' ? item.cheque_number || '—' : '—'}</td>
                                  <td className="whitespace-nowrap px-5 py-4 font-semibold tabular-nums">{money(Number(item.amount))}</td>
                                  <td className="px-5 py-4">
                                    <span className={`whitespace-nowrap rounded-full px-2.5 py-1.5 text-xs font-semibold ${statusStyle(item.status)}`}>
                                      {statusText(item.status)}
                                    </span>
                                  </td>
                                  <td className="px-5 py-4">
                                    <div className="flex justify-end gap-2">
                                      <button onClick={() => setEditing({ ...item })} aria-label="Modifier" className="rounded-lg border border-gray-200 p-2.5 text-gray-500 hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700">
                                        <Pencil size={16} />
                                      </button>
                                      <button onClick={() => deleteCheck(item.id)} disabled={deleting === item.id} aria-label="Supprimer" className="rounded-lg border border-gray-200 p-2.5 text-gray-500 hover:border-red-200 hover:bg-red-50 hover:text-red-600 disabled:opacity-40">
                                        <Trash2 size={16} />
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>

                        <div className="divide-y divide-gray-100 md:hidden">
                          {group.items.map((item) => (
                            <article key={item.id} className="p-4">
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <p className="truncate font-semibold">{item.payer_name}</p>
                                  <p className="mt-1 text-xs text-gray-400">{item.category}</p>
                                  <p className={`mt-1 inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${paymentMethodStyle(item.payment_method || 'cheque')}`}>{paymentMethodLabel(item.payment_method || 'cheque')}</p>
                                  {item.bank_name && <p className="mt-1 text-xs text-gray-400">{item.bank_name}</p>}
                                </div>
                                <p className="whitespace-nowrap font-bold tabular-nums">{money(Number(item.amount))}</p>
                              </div>
                              <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                                <span className={`rounded-full px-2.5 py-1.5 text-xs font-semibold ${statusStyle(item.status)}`}>
                                  {statusText(item.status)}
                                </span>
                                <div className="flex gap-2">
                                  <button onClick={() => setEditing({ ...item })} className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-600">
                                    <Pencil size={14} /> Modifier
                                  </button>
                                  <button onClick={() => deleteCheck(item.id)} disabled={deleting === item.id} className="rounded-lg border border-gray-200 px-3 py-2 text-xs font-semibold text-red-600">
                                    <Trash2 size={14} />
                                  </button>
                                </div>
                              </div>
                              {item.cheque_number && <p className="mt-2 text-xs text-gray-400">Chèque n° {item.cheque_number}</p>}
                            </article>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <p className="mt-5 text-center text-xs text-gray-400">Nord Évasion 59 · Gestion de trésorerie</p>
      </main>

      {editing && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 backdrop-blur-sm sm:items-center sm:p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) setEditing(null); }}>
          <form onSubmit={saveEdit} className="max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-t-3xl bg-white p-5 shadow-2xl sm:rounded-3xl sm:p-7">
            <div className="mb-6 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold">Modifier le règlement</h2>
                <p className="mt-1 text-sm text-gray-500">Modifie les informations puis enregistre.</p>
              </div>
              <button type="button" onClick={() => setEditing(null)} className="rounded-xl border border-gray-200 p-2.5 text-gray-500">
                <X size={19} />
              </button>
            </div>

            <div className="space-y-4">
              <label className="block">
                <span className="mb-2 block text-sm font-semibold">Nom du payeur</span>
                <input required value={editing.payer_name} onChange={(e) => setEditing({ ...editing, payer_name: e.target.value })} className="h-12 w-full rounded-xl border border-gray-200 px-3 outline-none focus:border-blue-500" />
              </label>

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-2 block text-sm font-semibold">Montant (€)</span>
                  <input required type="number" min="0.01" step="0.01" value={editing.amount} onChange={(e) => setEditing({ ...editing, amount: Number(e.target.value) })} className="h-12 w-full rounded-xl border border-gray-200 px-3 outline-none focus:border-blue-500" />
                </label>
                <label className="block">
                  <span className="mb-2 block text-sm font-semibold">Date de réception</span>
                  <input required type="date" value={editing.received_at} onChange={(e) => setEditing({ ...editing, received_at: e.target.value })} className="h-12 w-full rounded-xl border border-gray-200 px-3 outline-none focus:border-blue-500" />
                </label>
              </div>

              <label className="block">
                <span className="mb-2 block text-sm font-semibold">Catégorie</span>
                <select value={editing.category} onChange={(e) => setEditing({ ...editing, category: e.target.value })} className="h-12 w-full rounded-xl border border-gray-200 bg-white px-3 outline-none focus:border-blue-500">
                  {categories.map((item) => <option key={item}>{item}</option>)}
                </select>
              </label>

              <label className="block">
                <span className="mb-2 block text-sm font-semibold">Moyen de paiement</span>
                <select
                  value={editing.payment_method || 'cheque'}
                  onChange={(e) => {
                    const nextMethod = e.target.value as Check['payment_method'];
                    setEditing({
                      ...editing,
                      payment_method: nextMethod,
                      status: nextMethod === 'cheque' ? (editing.payment_method === 'cheque' ? editing.status : 'a_deposer') : 'encaisse',
                      cheque_number: nextMethod === 'cheque' ? editing.cheque_number : null,
                      bank_name: nextMethod === 'cheque' ? editing.bank_name : null,
                    });
                  }}
                  className="h-12 w-full rounded-xl border border-gray-200 bg-white px-3 outline-none focus:border-blue-500"
                >
                  {paymentMethods.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                </select>
                <span className="mt-2 block text-xs text-gray-500">
                  Les espèces et les ANCV sont automatiquement considérés comme encaissés.
                </span>
              </label>

              {(editing.payment_method || 'cheque') === 'cheque' && (
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-2 block text-sm font-semibold">Numéro de chèque</span>
                  <input value={editing.cheque_number || ''} onChange={(e) => setEditing({ ...editing, cheque_number: e.target.value })} className="h-12 w-full rounded-xl border border-gray-200 px-3 outline-none focus:border-blue-500" />
                </label>
                <label className="block">
                  <span className="mb-2 block text-sm font-semibold">Banque</span>
                  <input value={editing.bank_name || ''} onChange={(e) => setEditing({ ...editing, bank_name: e.target.value })} className="h-12 w-full rounded-xl border border-gray-200 px-3 outline-none focus:border-blue-500" />
                </label>
              </div>
              )}

              {(editing.payment_method || 'cheque') === 'cheque' ? (
              <label className="block">
                <span className="mb-2 block text-sm font-semibold">Statut</span>
                <select value={editing.status} onChange={(e) => setEditing({ ...editing, status: e.target.value })} className="h-12 w-full rounded-xl border border-gray-200 bg-white px-3 outline-none focus:border-blue-500">
                  {statuses.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                </select>
              </label>
              ) : (
                <div className="rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                  Statut : <strong>Encaissé</strong> automatiquement — aucun dépôt bancaire nécessaire.
                </div>
              )}

              <label className="block">
                <span className="mb-2 block text-sm font-semibold">Commentaire</span>
                <textarea rows={3} value={editing.comment || ''} onChange={(e) => setEditing({ ...editing, comment: e.target.value })} className="w-full rounded-xl border border-gray-200 p-3 outline-none focus:border-blue-500" />
              </label>
            </div>

            <div className="mt-7 flex gap-3">
              <button type="button" onClick={() => setEditing(null)} className="h-12 flex-1 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600">
                Annuler
              </button>
              <button disabled={saving} className="flex h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-blue-600 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60">
                {saving ? <Loader2 className="animate-spin" size={17} /> : <CheckCircle2 size={17} />}
                {saving ? 'Enregistrement...' : 'Enregistrer'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
