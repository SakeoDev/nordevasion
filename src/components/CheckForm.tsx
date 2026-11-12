import { useEffect, useState, type FormEvent } from 'react';
import {
  ReceiptText,
  Plus,
  FileText,
  UserRound,
  ArrowLeft,
  CheckCircle2,
  CreditCard,
  Users,
  Plane,
  Heart,
  MoreHorizontal,
  CalendarDays,
  Building2,
  Hash,
  MessageSquare,
  ChevronRight,
  Loader2,
  Banknote,
  Ticket,
} from 'lucide-react';
import { supabase } from '../lib/supabase';

const categories = [
  { name: 'Cotisations', description: 'Adhésions des membres', icon: Users },
  { name: 'Voyages et sorties', description: 'Participations aux activités', icon: Plane },
  { name: 'Dons', description: 'Dons et contributions', icon: Heart },
  { name: 'Autres règlements', description: 'Autres recettes associatives', icon: MoreHorizontal },
];

const paymentMethods = [
  {
    value: 'cheque',
    label: 'Chèque bancaire',
    description: 'À déposer à la banque',
    icon: CreditCard,
  },
  {
    value: 'especes',
    label: 'Espèces',
    description: 'Encaissé dès la saisie',
    icon: Banknote,
  },
  {
    value: 'ancv',
    label: 'Chèques-vacances ANCV',
    description: 'Encaissé dès la saisie',
    icon: Ticket,
  },
] as const;

type PaymentMethod = (typeof paymentMethods)[number]['value'];

function getToday() {
  const date = new Date();
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60000).toISOString().slice(0, 10);
}

const inputClass =
  'w-full h-[54px] px-4 bg-[#F8F9F8] border border-[#E9ECE9] rounded-xl text-[15px] text-[#26352D] outline-none transition-all placeholder:text-[#A0AAA3] focus:bg-white focus:border-[#527D61] focus:ring-4 focus:ring-[#527D61]/10';

export default function CheckForm() {
  const [payer, setPayer] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(getToday());
  const [category, setCategory] = useState('Cotisations');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cheque');
  const [number, setNumber] = useState('');
  const [bank, setBank] = useState('');
  const [comment, setComment] = useState('');

  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [successPaymentMethod, setSuccessPaymentMethod] = useState<PaymentMethod>('cheque');
  const [error, setError] = useState('');

  const [profileName, setProfileName] = useState('Chargement...');
  const [profileEmail, setProfileEmail] = useState('');
  const [profileInitials, setProfileInitials] = useState('JG');

  useEffect(() => {
    let active = true;

    async function loadProfile() {
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();

      if (authError || !user) {
        window.location.href = '/connexion';
        return;
      }

      let { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('first_name, last_name, role, association_name')
        .eq('id', user.id)
        .maybeSingle();

      if (!profile && !profileError) {
        const { error: insertError } = await supabase
          .from('profiles')
          .insert({
            id: user.id,
            first_name: 'Jean Pascal',
            last_name: 'Gosselin',
            role: 'Trésorier',
            association_name: 'Nord Évasion 59',
          });

        if (!insertError) {
          const result = await supabase
            .from('profiles')
            .select('first_name, last_name, role, association_name')
            .eq('id', user.id)
            .single();

          profile = result.data;
          profileError = result.error;
        }
      }

      if (!active) return;

      if (profileError || !profile) {
        setProfileName(user.email || 'Utilisateur');
        setProfileEmail(user.email || '');
        return;
      }

      const fullName = [profile.first_name, profile.last_name]
        .filter(Boolean)
        .join(' ');

      const initials = [profile.first_name, profile.last_name]
        .filter(Boolean)
        .map((part: string) => part.charAt(0).toUpperCase())
        .join('');

      setProfileName(fullName || user.email || 'Utilisateur');
      setProfileEmail(user.email || '');
      setProfileInitials(initials || 'U');
    }

    loadProfile();

    return () => {
      active = false;
    };
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setSuccess(false);

    const value = Number(amount.replace(',', '.'));

    if (!Number.isFinite(value) || value <= 0) {
      setError('Veuillez saisir un montant valide.');
      return;
    }

    if (!payer.trim()) {
      setError('Veuillez renseigner le nom et le prénom du payeur.');
      return;
    }

    setLoading(true);

    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        throw new Error('Votre session a expiré. Reconnectez-vous.');
      }

      const isDirectlyEncashed = paymentMethod === 'especes' || paymentMethod === 'ancv';
      const { error: insertError } = await supabase
        .from('cheques')
        .insert({
          payer_name: payer.trim(),
          amount: value,
          received_at: date,
          category,
          payment_method: paymentMethod,
          cheque_number: paymentMethod === 'cheque' ? number.trim() || null : null,
          bank_name: paymentMethod === 'cheque' ? bank.trim() || null : null,
          status: isDirectlyEncashed ? 'encaisse' : 'a_deposer',
          deposited_at: null,
          encashed_at: isDirectlyEncashed ? getToday() : null,
          comment: comment.trim() || null,
        });

      if (insertError) throw insertError;

      setSuccessPaymentMethod(paymentMethod);
      setSuccess(true);
      setPayer('');
      setAmount('');
      setDate(getToday());
      setCategory('Cotisations');
      setPaymentMethod('cheque');
      setNumber('');
      setBank('');
      setComment('');

      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Une erreur est survenue.'
      );
    } finally {
      setLoading(false);
    }
  }

  const directlyEncashed = paymentMethod === 'especes' || paymentMethod === 'ancv';

  return (
    <div className="min-h-screen bg-[#F6F7F6] text-[#25332B]">
      <main className="min-w-0">
        <header className="h-[76px] bg-white border-b border-[#ECEFEC] flex items-center justify-between px-5 md:px-9 lg:px-10">
          <div>
            <p className="text-xs text-gray-400">Nord Évasion 59 / Règlements</p>
            <p className="font-semibold text-sm mt-1">Nouvelle saisie</p>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden sm:block text-right">
              <p className="text-sm font-semibold">{profileName}</p>
              <p className="text-[11px] text-gray-400">{profileEmail}</p>
            </div>
            <div className="w-10 h-10 rounded-full bg-[#E9EEE9] flex items-center justify-center text-[#315C43] font-semibold text-sm">
              {profileInitials || <UserRound size={19} />}
            </div>
          </div>
        </header>

        <div className="max-w-[1100px] mx-auto px-5 md:px-9 py-8 md:py-10 pb-28 lg:pb-12">
          <a href="/" className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-[#315C43] transition mb-8">
            <ArrowLeft size={16} />
            Retour au tableau de bord
          </a>

          <div className="mb-9">
            <div className="flex items-center gap-2 text-[#527D61] text-xs font-bold uppercase tracking-[1.8px] mb-3">
              <Plus size={15} />
              Nouvelle opération
            </div>
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
              <div>
                <h1 className="text-[32px] md:text-[40px] font-semibold tracking-tight leading-tight">
                  Ajouter un règlement
                </h1>
                <p className="text-gray-500 mt-3 text-[15px]">
                  Enregistrez un nouveau règlement reçu par l'association.
                </p>
              </div>
              <div className="flex items-center gap-2 text-xs text-[#527D61] bg-[#EAF1EC] rounded-full px-4 py-2.5 w-fit">
                <CheckCircle2 size={15} />
                Enregistrement sécurisé
              </div>
            </div>
          </div>

          {success && (
            <div role="status" className="mb-6 flex items-center gap-3 bg-[#EAF4ED] border border-[#D2E8D8] rounded-2xl p-5 text-[#285C38]">
              <CheckCircle2 size={24} />
              <div>
                <p className="font-semibold">Règlement enregistré avec succès</p>
                <p className="text-sm mt-1">
                  {successPaymentMethod === 'cheque'
                    ? 'Le chèque bancaire a été ajouté à votre registre et reste à déposer.'
                    : successPaymentMethod === 'ancv'
                      ? 'Le règlement ANCV a été enregistré directement comme encaissé.'
                      : 'Le règlement en espèces a été enregistré directement comme encaissé.'}
                </p>
              </div>
            </div>
          )}

          {error && (
            <div role="alert" className="mb-6 bg-red-50 border border-red-100 rounded-xl p-4 text-sm text-red-700">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            <section className="bg-white border border-[#E9ECE9] rounded-2xl p-5 md:p-8">
              <div className="flex items-center gap-3 mb-7">
                <div className="w-10 h-10 bg-[#EDF3EF] rounded-xl flex items-center justify-center text-[#315C43]">
                  <ReceiptText size={20} />
                </div>
                <div>
                  <h2 className="font-semibold text-lg">Nature du règlement</h2>
                  <p className="text-xs text-gray-400 mt-1">
                    Dans quelle catégorie classer ce règlement ?
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {categories.map((item) => {
                  const Icon = item.icon;
                  const active = category === item.name;

                  return (
                    <button
                      key={item.name}
                      type="button"
                      onClick={() => setCategory(item.name)}
                      aria-pressed={active}
                      className={`relative flex items-center gap-4 p-4 min-h-[88px] text-left rounded-xl border-2 transition-all ${
                        active
                          ? 'border-[#477453] bg-[#F0F5F1]'
                          : 'border-[#EDF0ED] bg-white hover:border-[#C9D8CD]'
                      }`}
                    >
                      <div className={`w-12 h-12 shrink-0 rounded-xl flex items-center justify-center ${
                        active ? 'bg-[#315C43] text-white' : 'bg-[#F4F6F4] text-gray-500'
                      }`}>
                        <Icon size={22} strokeWidth={1.7} />
                      </div>
                      <div className="min-w-0">
                        <p className="font-semibold text-[14px]">{item.name}</p>
                        <p className="text-xs text-gray-400 mt-1">{item.description}</p>
                      </div>
                      {active && <CheckCircle2 size={19} className="ml-auto shrink-0 text-[#315C43]" />}
                    </button>
                  );
                })}
              </div>
            </section>

            <section className="bg-white border border-[#E9ECE9] rounded-2xl p-5 md:p-8">
              <div className="flex items-center gap-3 mb-7">
                <div className="w-10 h-10 bg-[#EDF3EF] rounded-xl flex items-center justify-center text-[#315C43]">
                  <CreditCard size={20} />
                </div>
                <div>
                  <h2 className="font-semibold text-lg">Moyen de paiement</h2>
                  <p className="text-xs text-gray-400 mt-1">
                    Sélectionnez le moyen utilisé par le payeur.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {paymentMethods.map((method) => {
                  const Icon = method.icon;
                  const active = paymentMethod === method.value;

                  const methodColors = {
                    cheque: active ? 'border-blue-600 bg-blue-50' : 'border-blue-100 bg-white hover:border-blue-300',
                    especes: active ? 'border-amber-500 bg-amber-50' : 'border-amber-100 bg-white hover:border-amber-300',
                    ancv: active ? 'border-violet-600 bg-violet-50' : 'border-violet-100 bg-white hover:border-violet-300',
                  };
                  const iconColors = {
                    cheque: active ? 'bg-blue-600 text-white' : 'bg-blue-50 text-blue-700',
                    especes: active ? 'bg-amber-500 text-white' : 'bg-amber-50 text-amber-700',
                    ancv: active ? 'bg-violet-600 text-white' : 'bg-violet-50 text-violet-700',
                  };
                  const checkColors = { cheque: 'text-blue-700', especes: 'text-amber-700', ancv: 'text-violet-700' };

                  return (
                    <button
                      key={method.value}
                      type="button"
                      onClick={() => setPaymentMethod(method.value)}
                      aria-pressed={active}
                      className={`relative flex items-center gap-3 p-4 min-h-[104px] text-left rounded-xl border-2 transition-all ${methodColors[method.value]}`}
                    >
                      <div className={`w-11 h-11 shrink-0 rounded-xl flex items-center justify-center ${iconColors[method.value]}`}>
                        <Icon size={21} />
                      </div>
                      <div className="min-w-0">
                        <p className="font-semibold text-sm">{method.label}</p>
                        <p className="mt-1 text-xs text-gray-500">{method.description}</p>
                      </div>
                      {active && <CheckCircle2 size={17} className={`ml-auto shrink-0 ${checkColors[method.value]}`} />}
                    </button>
                  );
                })}
              </div>

              <div className={`mt-4 rounded-xl border p-4 text-sm ${
                directlyEncashed
                  ? 'border-emerald-100 bg-emerald-50 text-emerald-800'
                  : 'border-amber-100 bg-amber-50 text-amber-800'
              }`}>
                {directlyEncashed ? (
                  <p className="flex items-start gap-2">
                    <CheckCircle2 size={17} className="mt-0.5 shrink-0" />
                    Ce règlement sera automatiquement marqué comme <strong>encaissé</strong> à la date du jour. Il ne figurera pas dans les dépôts bancaires de chèques.
                  </p>
                ) : (
                  <p className="flex items-start gap-2">
                    <CreditCard size={17} className="mt-0.5 shrink-0" />
                    Ce chèque sera enregistré avec le statut <strong>À déposer</strong>. Tu pourras ensuite suivre son dépôt et son encaissement.
                  </p>
                )}
              </div>
            </section>

            <section className="bg-white border border-[#E9ECE9] rounded-2xl p-5 md:p-8">
              <div className="flex items-center gap-3 mb-7">
                <div className="w-10 h-10 bg-[#EDF3EF] rounded-xl flex items-center justify-center text-[#315C43]">
                  <FileText size={20} />
                </div>
                <div>
                  <h2 className="font-semibold text-lg">Informations du règlement</h2>
                  <p className="text-xs text-gray-400 mt-1">
                    Renseignez les informations principales du règlement reçu.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-6">
                <div className="md:col-span-2">
                  <label htmlFor="payer" className="block text-sm font-semibold mb-2">
                    Nom et prénom du payeur <span className="text-red-500">*</span>
                  </label>
                  <input
                    id="payer"
                    className={inputClass}
                    value={payer}
                    onChange={(e) => setPayer(e.target.value)}
                    placeholder="Ex. : Jean Dupont"
                    required
                    maxLength={150}
                  />
                </div>

                <div>
                  <label htmlFor="amount" className="block text-sm font-semibold mb-2">
                    Montant reçu <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <input
                      id="amount"
                      type="number"
                      min="0.01"
                      step="0.01"
                      className={`${inputClass} pr-14 font-semibold text-lg`}
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      placeholder="0,00"
                      required
                    />
                    <span className="absolute right-5 top-1/2 -translate-y-1/2 text-gray-400 font-semibold">€</span>
                  </div>
                </div>

                <div>
                  <label htmlFor="date" className="block text-sm font-semibold mb-2">
                    Date de réception <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <CalendarDays size={17} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                    <input
                      id="date"
                      type="date"
                      className={`${inputClass} pl-11`}
                      value={date}
                      onChange={(e) => setDate(e.target.value)}
                      required
                    />
                  </div>
                </div>
              </div>
            </section>

            {paymentMethod === 'cheque' && (
              <section className="bg-white border border-[#E9ECE9] rounded-2xl p-5 md:p-8">
                <div className="flex items-center gap-3 mb-7">
                  <div className="w-10 h-10 bg-[#F3F3F1] rounded-xl flex items-center justify-center text-gray-600">
                    <Building2 size={20} />
                  </div>
                  <div>
                    <h2 className="font-semibold text-lg">Informations du chèque</h2>
                    <p className="text-xs text-gray-400 mt-1">
                      Facultatif · Ces champs concernent uniquement les chèques bancaires.
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label htmlFor="number" className="flex items-center gap-2 text-sm font-semibold mb-2">
                      <Hash size={15} className="text-gray-400" />
                      Numéro du chèque
                    </label>
                    <input
                      id="number"
                      className={inputClass}
                      value={number}
                      onChange={(e) => setNumber(e.target.value)}
                      placeholder="Numéro du chèque"
                      maxLength={50}
                    />
                  </div>

                  <div>
                    <label htmlFor="bank" className="flex items-center gap-2 text-sm font-semibold mb-2">
                      <Building2 size={15} className="text-gray-400" />
                      Banque émettrice
                    </label>
                    <input
                      id="bank"
                      className={inputClass}
                      value={bank}
                      onChange={(e) => setBank(e.target.value)}
                      placeholder="Ex. : Crédit Agricole"
                      maxLength={100}
                    />
                  </div>
                </div>
              </section>
            )}

            <section className="bg-white border border-[#E9ECE9] rounded-2xl p-5 md:p-8">
              <div className="flex items-center gap-3 mb-7">
                <div className="w-10 h-10 bg-[#F3F3F1] rounded-xl flex items-center justify-center text-gray-600">
                  <MessageSquare size={20} />
                </div>
                <div>
                  <h2 className="font-semibold text-lg">Commentaire</h2>
                  <p className="text-xs text-gray-400 mt-1">
                    Facultatif · Vous pouvez laisser ce champ vide.
                  </p>
                </div>
              </div>

              <label htmlFor="comment" className="sr-only">Commentaire</label>
              <textarea
                id="comment"
                className={`${inputClass} h-auto min-h-[110px] py-4 resize-y`}
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Ajouter une précision si nécessaire..."
                maxLength={1000}
              />
            </section>

            <div className="bg-white border border-[#E9ECE9] rounded-2xl p-5 md:px-8 md:py-6 flex flex-col sm:flex-row items-center justify-between gap-4">
              <div>
                <p className="text-sm font-semibold">Prêt à enregistrer ?</p>
                <p className="text-xs text-gray-400 mt-1">
                  {directlyEncashed
                    ? 'Le règlement sera directement comptabilisé comme encaissé.'
                    : 'Le chèque sera ajouté au registre avec le statut à déposer.'}
                </p>
              </div>

              <div className="flex flex-col-reverse sm:flex-row gap-3 w-full sm:w-auto">
                <a
                  href="/"
                  className="h-[54px] px-6 rounded-xl border border-gray-200 flex items-center justify-center text-sm font-semibold text-gray-600 hover:bg-gray-50 transition"
                >
                  Annuler
                </a>
                <button
                  type="submit"
                  disabled={loading}
                  className="h-[54px] px-7 rounded-xl bg-[#244B38] hover:bg-[#193A2B] disabled:opacity-60 text-white flex items-center justify-center gap-3 text-sm font-semibold shadow-sm transition"
                >
                  {loading ? (
                    <Loader2 size={18} className="animate-spin" />
                  ) : (
                    <CheckCircle2 size={18} />
                  )}
                  {loading ? 'Enregistrement...' : 'Enregistrer le règlement'}
                  {!loading && <ChevronRight size={17} />}
                </button>
              </div>
            </div>
          </form>

          <footer className="mt-9 pt-6 border-t border-gray-200 flex flex-col sm:flex-row justify-between gap-2 text-xs text-gray-400">
            <p>© 2026 Nord Évasion 59 · Gestion de trésorerie</p>
            <p>Application développée par SAEKO Studio</p>
          </footer>
        </div>
      </main>
    </div>
  );
}
