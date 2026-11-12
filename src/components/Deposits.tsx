import { useEffect, useState } from 'react';
import {
  Landmark,
  CheckCircle2,
  Clock3,
  RefreshCw,
  Banknote,
  CalendarDays,
  Loader2,
} from 'lucide-react';
import { supabase } from '../lib/supabase';

type Cheque = {
  id: string;
  payer_name: string;
  amount: number;
  received_at: string;
  deposited_at: string | null;
  encashed_at: string | null;
  category: string;
  cheque_number: string | null;
  bank_name: string | null;
  status: 'a_deposer' | 'depose' | 'encaisse' | 'annule';
  payment_method: 'cheque' | 'especes' | 'ancv';
};

function today() {
  const date = new Date();
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60000)
    .toISOString()
    .slice(0, 10);
}

function formatDate(value: string | null) {
  if (!value) return 'Non renseignée';
  return new Intl.DateTimeFormat('fr-FR').format(
    new Date(`${value}T12:00:00`)
  );
}

function money(value: number) {
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'EUR',
  }).format(value);
}

export default function Deposits() {
  const [checks, setChecks] = useState<Cheque[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  async function loadChecks() {
    setLoading(true);
    setError('');

    const { data, error } = await supabase
      .from('cheques')
      .select('*')
      .order('received_at', { ascending: false })
      .order('created_at', { ascending: false });

    if (error) {
      setError(`Impossible de charger les chèques : ${error.message}`);
      setChecks([]);
    } else {
      setChecks((data || []) as Cheque[]);
    }

    setLoading(false);
  }

  useEffect(() => {
    loadChecks();
  }, []);

  async function updateStatus(
    cheque: Cheque,
    nextStatus: 'depose' | 'encaisse'
  ) {
    setUpdatingId(cheque.id);
    setError('');
    setSuccess('');

    const updates =
      nextStatus === 'depose'
        ? {
            status: 'depose',
            deposited_at: today(),
          }
        : {
            status: 'encaisse',
            encashed_at: today(),
          };

    const { error } = await supabase
      .from('cheques')
      .update(updates)
      .eq('id', cheque.id);

    if (error) {
      setError(`La modification a échoué : ${error.message}`);
    } else {
      setSuccess(
        nextStatus === 'depose'
          ? `Le chèque de ${cheque.payer_name} a été marqué comme déposé.`
          : `Le chèque de ${cheque.payer_name} a été marqué comme encaissé.`
      );

      await loadChecks();
    }

    setUpdatingId(null);
  }

  // Cette page suit exclusivement les chèques bancaires.
  // Les espèces et les ANCV sont encaissés directement et ne passent jamais par un dépôt bancaire.
  const validChecks = checks.filter(
    (item) => item.payment_method === 'cheque' && item.status !== 'annule'
  );
  const pending = validChecks.filter((item) => item.status === 'a_deposer');
  const deposited = validChecks.filter((item) => item.status === 'depose');
  const cashed = validChecks.filter((item) => item.status === 'encaisse');

  const pendingTotal = pending.reduce(
    (sum, item) => sum + Number(item.amount || 0),
    0
  );

  const depositedTotal = deposited.reduce(
    (sum, item) => sum + Number(item.amount || 0),
    0
  );

  function renderCheque(item: Cheque, mode: 'pending' | 'deposited' | 'cashed') {
    const isUpdating = updatingId === item.id;

    return (
      <div
        key={item.id}
        className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 p-5 border-b border-gray-100 last:border-0"
      >
        <div className="flex items-start gap-3 min-w-0">
          <div className="w-11 h-11 shrink-0 rounded-xl bg-[#EDF3EF] text-[#315C43] flex items-center justify-center">
            <Banknote size={21} strokeWidth={1.7} />
          </div>

          <div className="min-w-0">
            <p className="font-semibold text-sm text-gray-800">
              {item.payer_name}
            </p>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <span className="inline-flex rounded-full bg-blue-50 px-2.5 py-1 text-[11px] font-semibold text-blue-700">
                Chèque bancaire
              </span>
              <span className="text-xs text-gray-400">{item.category}</span>
              {item.cheque_number && (
                <span className="text-xs text-gray-400">N° {item.cheque_number}</span>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-3 mt-2 text-xs text-gray-400">
              <span className="flex items-center gap-1">
                <CalendarDays size={13} />
                Reçu le {formatDate(item.received_at)}
              </span>

              {mode !== 'pending' && item.deposited_at && (
                <span>
                  Déposé le {formatDate(item.deposited_at)}
                </span>
              )}

              {mode === 'cashed' && item.encashed_at && (
                <span>
                  Encaissé le {formatDate(item.encashed_at)}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center gap-3 lg:justify-end">
          <div className="sm:text-right">
            <p className="font-bold text-lg">{money(Number(item.amount))}</p>
            <span
              className={`inline-flex mt-1 text-[11px] font-medium px-2.5 py-1 rounded-full ${
                mode === 'pending'
                  ? 'bg-orange-50 text-orange-700'
                  : mode === 'deposited'
                    ? 'bg-blue-50 text-blue-700'
                    : 'bg-green-50 text-green-700'
              }`}
            >
              {mode === 'pending'
                ? 'À déposer'
                : mode === 'deposited'
                  ? 'Déposé'
                  : 'Encaissé'}
            </span>
          </div>

          {mode === 'pending' && (
            <button
              type="button"
              disabled={isUpdating}
              onClick={() => updateStatus(item, 'depose')}
              className="h-11 px-5 rounded-xl bg-[#244B38] hover:bg-[#193A2B] disabled:opacity-60 text-white text-sm font-semibold flex items-center justify-center gap-2 transition"
            >
              {isUpdating ? (
                <Loader2 size={17} className="animate-spin" />
              ) : (
                <Landmark size={17} />
              )}
              Déposer
            </button>
          )}

          {mode === 'deposited' && (
            <button
              type="button"
              disabled={isUpdating}
              onClick={() => updateStatus(item, 'encaisse')}
              className="h-11 px-5 rounded-xl bg-[#244B38] hover:bg-[#193A2B] disabled:opacity-60 text-white text-sm font-semibold flex items-center justify-center gap-2 transition"
            >
              {isUpdating ? (
                <Loader2 size={17} className="animate-spin" />
              ) : (
                <CheckCircle2 size={17} />
              )}
              Encaissé
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F6F7F6] text-[#25332B]">
      <main className="min-w-0">
        <header className="h-[76px] bg-white border-b border-[#ECEFEC] flex items-center justify-between px-5 md:px-9 lg:px-10">
          <div>
            <p className="text-xs text-gray-400">Nord Évasion 59 / Trésorerie</p>
            <p className="font-semibold text-sm mt-1">Suivi des dépôts</p>
          </div>

          <div className="w-10 h-10 rounded-xl bg-[#EDF3EF] text-[#315C43] flex items-center justify-center">
            <Landmark size={20} />
          </div>
        </header>

        <div className="max-w-[1250px] mx-auto px-5 md:px-9 py-8 md:py-10 pb-28 lg:pb-12">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-8">
            <div>
              <p className="text-xs font-bold uppercase tracking-[1.8px] text-[#527D61] mb-3">
                Gestion bancaire
              </p>
              <h1 className="text-3xl md:text-4xl font-semibold tracking-tight">
                Dépôts des chèques
              </h1>
              <p className="text-sm text-gray-500 mt-2">
                Suivez les remises à la banque et les encaissements.
              </p>
            </div>

            <button
              type="button"
              onClick={loadChecks}
              disabled={loading}
              className="h-11 px-4 bg-white border border-gray-200 rounded-xl flex items-center justify-center gap-2 text-sm font-semibold hover:bg-gray-50 transition"
            >
              <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
              Actualiser
            </button>
          </div>

          {error && (
            <div role="alert" className="mb-5 rounded-xl bg-red-50 border border-red-100 p-4 text-sm text-red-700">
              {error}
            </div>
          )}

          {success && (
            <div role="status" className="mb-5 rounded-xl bg-green-50 border border-green-100 p-4 text-sm text-green-800 flex items-center gap-2">
              <CheckCircle2 size={18} />
              {success}
            </div>
          )}

          <section className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
            <div className="bg-white border border-gray-100 rounded-2xl p-6">
              <div className="flex items-center justify-between mb-4">
                <p className="text-sm text-gray-500">À déposer</p>
                <Clock3 className="text-orange-600" size={21} />
              </div>
              <p className="text-2xl font-bold">{money(pendingTotal)}</p>
              <p className="text-xs text-gray-400 mt-2">
                {pending.length} chèque(s) en attente
              </p>
            </div>

            <div className="bg-white border border-gray-100 rounded-2xl p-6">
              <div className="flex items-center justify-between mb-4">
                <p className="text-sm text-gray-500">Déposés</p>
                <Landmark className="text-blue-600" size={21} />
              </div>
              <p className="text-2xl font-bold">{money(depositedTotal)}</p>
              <p className="text-xs text-gray-400 mt-2">
                {deposited.length} chèque(s) en attente d'encaissement
              </p>
            </div>

            <div className="bg-white border border-gray-100 rounded-2xl p-6">
              <div className="flex items-center justify-between mb-4">
                <p className="text-sm text-gray-500">Encaissés</p>
                <CheckCircle2 className="text-green-600" size={21} />
              </div>
              <p className="text-2xl font-bold">
                {money(cashed.reduce((sum, item) => sum + Number(item.amount || 0), 0))}
              </p>
              <p className="text-xs text-gray-400 mt-2">
                {cashed.length} chèque(s) encaissé(s)
              </p>
            </div>
          </section>

          <section className="bg-white border border-gray-100 rounded-2xl overflow-hidden mb-6">
            <div className="p-6 border-b border-gray-100 flex items-center justify-between">
              <div>
                <h2 className="font-semibold text-lg">Chèques à déposer</h2>
                <p className="text-xs text-gray-400 mt-1">
                  Cochez chaque remise une fois effectuée à la banque.
                </p>
              </div>
              <span className="text-sm font-semibold text-orange-700 bg-orange-50 px-3 py-1.5 rounded-full">
                {pending.length}
              </span>
            </div>

            {loading ? (
              <div className="p-10 text-center text-sm text-gray-400">
                Chargement des chèques...
              </div>
            ) : pending.length === 0 ? (
              <div className="p-10 text-center">
                <CheckCircle2 size={30} className="mx-auto text-green-600 mb-3" />
                <p className="font-semibold">Aucun chèque à déposer</p>
                <p className="text-sm text-gray-400 mt-1">
                  Tous les chèques reçus ont été traités.
                </p>
              </div>
            ) : (
              pending.map((item) => renderCheque(item, 'pending'))
            )}
          </section>

          <section className="bg-white border border-gray-100 rounded-2xl overflow-hidden mb-6">
            <div className="p-6 border-b border-gray-100 flex items-center justify-between">
              <div>
                <h2 className="font-semibold text-lg">Chèques déposés</h2>
                <p className="text-xs text-gray-400 mt-1">
                  Confirmez l'encaissement lorsque l'argent est crédité sur le compte.
                </p>
              </div>
              <span className="text-sm font-semibold text-blue-700 bg-blue-50 px-3 py-1.5 rounded-full">
                {deposited.length}
              </span>
            </div>

            {loading ? (
              <div className="p-10 text-center text-sm text-gray-400">
                Chargement...
              </div>
            ) : deposited.length === 0 ? (
              <div className="p-8 text-center text-sm text-gray-400">
                Aucun chèque en attente d'encaissement.
              </div>
            ) : (
              deposited.map((item) => renderCheque(item, 'deposited'))
            )}
          </section>

          <section className="bg-white border border-gray-100 rounded-2xl overflow-hidden">
            <div className="p-6 border-b border-gray-100 flex items-center justify-between">
              <div>
                <h2 className="font-semibold text-lg">Derniers chèques encaissés</h2>
                <p className="text-xs text-gray-400 mt-1">
                  Historique des encaissements confirmés.
                </p>
              </div>
              <span className="text-sm font-semibold text-green-700 bg-green-50 px-3 py-1.5 rounded-full">
                {cashed.length}
              </span>
            </div>

            {loading ? (
              <div className="p-8 text-center text-sm text-gray-400">Chargement...</div>
            ) : cashed.length === 0 ? (
              <div className="p-8 text-center text-sm text-gray-400">
                Aucun encaissement confirmé pour le moment.
              </div>
            ) : (
              cashed
                .slice()
                .sort((a, b) =>
                  (b.encashed_at || '').localeCompare(a.encashed_at || '')
                )
                .map((item) => renderCheque(item, 'cashed'))
            )}
          </section>

          <footer className="mt-8 pt-6 border-t border-gray-200 text-center text-xs text-gray-400">
            Nord Évasion 59 · Gestion de trésorerie
          </footer>
        </div>
      </main>
    </div>
  );
}
