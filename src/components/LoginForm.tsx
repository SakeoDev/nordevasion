
import { useState } from 'react';
import { supabase } from '../lib/supabase';

export default function LoginForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setLoading(true);

    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (error) {
      setError('Adresse e-mail ou mot de passe incorrect.');
      setLoading(false);
      return;
    }

    window.location.href = '/';
  }

  return (
    <main className="min-h-screen bg-[#f6f7f9] flex items-center justify-center p-5">
      <div className="w-full max-w-[440px]">

        <div className="text-center mb-9">
          <div className="w-16 h-16 bg-[#172b25] rounded-2xl flex items-center justify-center text-white text-3xl font-bold mx-auto mb-5">
            N
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">
            NORD ÉVASION 59
          </h1>
          <p className="text-sm text-gray-500 mt-2">
            Gestion de trésorerie
          </p>
        </div>

        <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-7 sm:p-9">

          <h2 className="text-2xl font-semibold text-gray-900">
            Bienvenue
          </h2>

          <p className="text-sm text-gray-500 mt-2 mb-8">
            Connectez-vous à votre espace trésorerie.
          </p>

          <form onSubmit={handleSubmit} className="space-y-6">

            <div>
              <label htmlFor="email" className="block text-sm font-semibold text-gray-700 mb-2">
                Adresse e-mail
              </label>
              <input
                id="email"
                type="email"
                autoComplete="username"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="votre@email.fr"
                className="w-full h-14 px-4 rounded-xl border border-gray-200 bg-white text-base outline-none focus:border-[#315c43] focus:ring-2 focus:ring-[#315c43]/10"
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-semibold text-gray-700 mb-2">
                Mot de passe
              </label>
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Votre mot de passe"
                className="w-full h-14 px-4 rounded-xl border border-gray-200 bg-white text-base outline-none focus:border-[#315c43] focus:ring-2 focus:ring-[#315c43]/10"
              />
            </div>

            {error && (
              <div role="alert" className="bg-red-50 border border-red-100 text-red-700 rounded-xl p-4 text-sm">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full h-14 bg-[#244b38] hover:bg-[#193a2b] disabled:opacity-60 text-white rounded-xl font-semibold transition"
            >
              {loading ? 'Connexion en cours...' : 'Se connecter'}
            </button>

          </form>

        </div>

        <p className="text-center text-xs text-gray-400 mt-7">
          Espace privé · Nord Évasion 59
        </p>

        <p className="text-center text-[11px] text-gray-400 mt-2">
          Application développée par SAEKO Studio
        </p>

      </div>
    </main>
  );
}
