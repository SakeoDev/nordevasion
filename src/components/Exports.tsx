import { useEffect, useMemo, useState } from 'react';
import {
  FileText, Download, Landmark, CalendarDays,
  Loader2, RefreshCw, Printer, ReceiptText,
} from 'lucide-react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
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
  deposited_at: string | null;
  encashed_at: string | null;
  payment_method: 'cheque' | 'especes' | 'ancv' | null;
};

const months = [
  'Tous les mois', 'Janvier', 'Février', 'Mars', 'Avril',
  'Mai', 'Juin', 'Juillet', 'Août', 'Septembre',
  'Octobre', 'Novembre', 'Décembre',
];

const RED: [number, number, number] = [190, 35, 45];
const DARK: [number, number, number] = [28, 36, 48];
const MUTED: [number, number, number] = [105, 114, 125];
const LIGHT: [number, number, number] = [245, 247, 250];

// Formatage PDF explicite : séparateur de milliers « . » et décimales « , ».
// Évite les espaces insécables que certaines polices PDF peuvent afficher comme des « / ».
const money = (value: number) => {
  const safeValue = Number.isFinite(value) ? value : 0;
  const fixed = safeValue.toFixed(2).split('.');
  const integer = fixed[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${integer},${fixed[1]} €`;
};

const paymentMethodLabel = (method: Check['payment_method']) => {
  if (method === 'especes') return 'Espèces';
  if (method === 'ancv') return 'ANCV';
  return 'Chèque bancaire';
};

const safeFileBase = (value: string) =>
  value.trim().replace(/\.pdf$/i, '').replace(/[<>:"/\\|?*\x00-\x1F]/g, '-').replace(/\s+/g, '-').replace(/-+/g, '-').slice(0, 100) || 'nord-evasion';



const dateLabel = (value: string | null) => {
  if (!value) return '—';
  return new Date(`${value}T12:00:00`).toLocaleDateString('fr-FR');
};

const monthName = (value: string) =>
  value === 'Tous les mois' ? 'Tous les mois' : months[Number(value)] || value;

const isInPeriod = (date: string | null, year: string, month: string) => {
  if (!date) return false;
  if (year !== 'Toutes les années' && !date.startsWith(year)) return false;
  if (month !== 'Tous les mois' && date.slice(5, 7) !== month) return false;
  return true;
};

const statusLabel = (status: string) => {
  if (status === 'a_deposer') return 'À déposer';
  if (status === 'depose') return 'Déposé';
  if (status === 'encaisse') return 'Encaissé';
  if (status === 'annule') return 'Annulé';
  return status;
};

const sumChecks = (items: Check[]) =>
  items
    .filter((item) => item.status !== 'annule')
    .reduce((sum, item) => sum + Number(item.amount || 0), 0);

const groupByYear = (items: Check[], dateField: 'received_at' | 'deposited_at' | 'encashed_at') => {
  const groups = new Map<string, Check[]>();

  [...items]
    .filter((item) => item[dateField])
    .sort((a, b) => String(b[dateField]).localeCompare(String(a[dateField])))
    .forEach((item) => {
      const year = String(item[dateField]).slice(0, 4);
      if (!groups.has(year)) groups.set(year, []);
      groups.get(year)!.push(item);
    });

  return [...groups.entries()].sort(([a], [b]) => b.localeCompare(a));
};

function createPdf(title: string, period: string) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();

  // En-tête de document
  doc.setFillColor(...DARK);
  doc.rect(0, 0, pageWidth, 35, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(17);
  doc.text('NORD ÉVASION 59', 14, 15);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(215, 222, 232);
  doc.text('GESTION ASSOCIATIVE · DOCUMENT DE TRÉSORERIE', 14, 22);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(255, 255, 255);
  doc.text(title.toUpperCase(), pageWidth - 14, 15, { align: 'right' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(225, 230, 237);
  doc.text(`Période : ${period}`, pageWidth - 14, 23, { align: 'right' });

  // Date d'édition
  doc.setTextColor(MUTED[0], MUTED[1], MUTED[2]);
  doc.setFontSize(8);
  doc.text(
    `Document généré le ${new Date().toLocaleDateString('fr-FR')}`,
    14,
    42
  );

  return doc;
}

function addYearHeading(doc: jsPDF, year: string, y: number, subtitle?: string) {
  const pageWidth = doc.internal.pageSize.getWidth();

  doc.setFillColor(253, 241, 242);
  doc.roundedRect(14, y, pageWidth - 28, 10, 2, 2, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(...RED);
  doc.text(year, 19, y + 6.8);

  if (subtitle) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...MUTED);
    doc.text(subtitle, pageWidth - 19, y + 6.5, { align: 'right' });
  }
}

function addFooter(doc: jsPDF) {
  const pageCount = doc.getNumberOfPages();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  for (let page = 1; page <= pageCount; page++) {
    doc.setPage(page);
    doc.setDrawColor(225, 229, 235);
    doc.setLineWidth(0.3);
    doc.line(14, pageHeight - 12, pageWidth - 14, pageHeight - 12);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...MUTED);
    doc.text('NORD ÉVASION 59  ·  Document de gestion interne', 14, pageHeight - 7);
    doc.text(`Page ${page} / ${pageCount}`, pageWidth - 14, pageHeight - 7, {
      align: 'right',
    });
  }
}

function tableStyles() {
  return {
    theme: 'grid' as const,
    styles: {
      font: 'helvetica',
      fontSize: 8,
      cellPadding: 3,
      textColor: DARK,
      lineColor: [226, 230, 235] as [number, number, number],
      lineWidth: 0.15,
      valign: 'middle' as const,
    },
    headStyles: {
      fillColor: DARK,
      textColor: [255, 255, 255] as [number, number, number],
      fontStyle: 'bold' as const,
      fontSize: 8,
      cellPadding: 3.5,
    },
    alternateRowStyles: {
      fillColor: LIGHT,
    },
    footStyles: {
      fillColor: [253, 241, 242] as [number, number, number],
      textColor: DARK,
      fontStyle: 'bold' as const,
    },
    margin: { left: 14, right: 14, bottom: 17 },
  };
}

function addEmptyMessage(doc: jsPDF, y: number, message: string) {
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(9);
  doc.setTextColor(...MUTED);
  doc.text(message, 14, y);
}

export default function Exports() {
  const [checks, setChecks] = useState<Check[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  // Par défaut, afficher les données du mois et de l'année en cours.
  const currentDate = new Date();
  const [year, setYear] = useState(String(currentDate.getFullYear()));
  const [month, setMonth] = useState(String(currentDate.getMonth() + 1).padStart(2, '0'));
  const [generating, setGenerating] = useState('');
  const [fileName, setFileName] = useState('nord-evasion');

  async function loadChecks() {
    setLoading(true);
    setError('');

    const { data, error } = await supabase
      .from('cheques')
      .select(
        'id,payer_name,amount,received_at,category,cheque_number,bank_name,status,deposited_at,encashed_at,payment_method'
      )
      .order('received_at', { ascending: false });

    if (error) {
      setError('Impossible de récupérer les données pour les exports.');
      setChecks([]);
    } else {
      setChecks((data || []) as Check[]);
    }

    setLoading(false);
  }

  useEffect(() => {
    loadChecks();
  }, []);

  // Les années proposées tiennent compte des dates de réception, de dépôt et d'encaissement.
  const years = useMemo(() => {
    const allYears = checks.flatMap((item) =>
      [item.received_at, item.deposited_at, item.encashed_at]
        .filter(Boolean)
        .map((date) => String(date).slice(0, 4))
    );
    return [...new Set(allYears)].sort().reverse();
  }, [checks]);

  const receivedChecks = checks.filter((item) =>
    isInPeriod(item.received_at, year, month)
  );

  const depositedChecks = checks.filter(
    (item) => (item.payment_method === 'cheque' || !item.payment_method) && item.deposited_at && isInPeriod(item.deposited_at, year, month)
  );

  const encashedChecks = checks.filter(
    (item) =>
      item.status === 'encaisse' &&
      item.encashed_at &&
      isInPeriod(item.encashed_at, year, month)
  );

  const receivedTotal = sumChecks(receivedChecks);
  const depositedTotal = sumChecks(depositedChecks);
  const encashedTotal = encashedChecks.reduce(
    (sum, item) => sum + Number(item.amount || 0),
    0
  );

  const periodLabel = [
    monthName(month),
    year === 'Toutes les années' ? 'toutes années' : year,
  ].join(' · ');

  function downloadName(documentType: string) {
    const period = `${year === 'Toutes les années' ? 'toutes-annees' : year}-${month === 'Tous les mois' ? 'tous-mois' : month}`;
    return `${safeFileBase(fileName)}-${documentType}-${period}.pdf`;
  }

  function exportRegister() {
    setGenerating('register');
    setError('');

    try {
      const doc = createPdf('Registre des règlements', periodLabel);
      let y = 49;
      const groups = groupByYear(receivedChecks, 'received_at');

      if (groups.length === 0) {
        addEmptyMessage(doc, y + 8, 'Aucun règlement ne correspond à la période sélectionnée.');
      }

      groups.forEach(([groupYear, items]) => {
        if (y > 175) {
          doc.addPage();
          y = 20;
        }

        addYearHeading(
          doc,
          groupYear,
          y,
          `${items.length} règlement(s) · Total : ${money(sumChecks(items))}`
        );
        y += 13;

        autoTable(doc, {
          ...tableStyles(),
          startY: y,
          head: [[
            'Payeur', 'Date réception', 'Catégorie', 'Paiement', 'N° chèque',
            'Banque', 'Montant', 'Statut',
          ]],
          body: items.map((item) => [
            item.payer_name,
            dateLabel(item.received_at),
            item.category,
            paymentMethodLabel(item.payment_method),
            item.payment_method === 'cheque' || !item.payment_method ? (item.cheque_number || '—') : '—',
            item.payment_method === 'cheque' || !item.payment_method ? (item.bank_name || '—') : '—',
            money(Number(item.amount)),
            statusLabel(item.status),
          ]),
          foot: [[
            'TOTAL HORS ANNULATIONS', '', '', '', '',
            '', money(sumChecks(items)), '',
          ]],
          columnStyles: {
            0: { cellWidth: 48 },
            1: { cellWidth: 27 },
            2: { cellWidth: 34 },
            3: { cellWidth: 27 },
            4: { cellWidth: 20 },
            5: { cellWidth: 30 },
            6: { cellWidth: 27, halign: 'right' },
            7: { cellWidth: 25 },
          },
          didDrawPage: () => {
            // Le pied de page est ajouté après la génération complète.
          },
        });

        y = (doc as any).lastAutoTable.finalY + 10;
      });

      addFooter(doc);
      doc.save(downloadName('registre'));
    } catch (err) {
      console.error(err);
      setError('La création du registre PDF a échoué.');
    } finally {
      setGenerating('');
    }
  }

  function exportDeposits() {
    setGenerating('deposits');
    setError('');

    try {
      const doc = createPdf('Récapitulatif des dépôts bancaires', periodLabel);
      let y = 49;
      const groups = groupByYear(depositedChecks, 'deposited_at');

      if (groups.length === 0) {
        addEmptyMessage(doc, y + 8, 'Aucun dépôt ne correspond à la période sélectionnée.');
      }

      groups.forEach(([groupYear, items]) => {
        if (y > 175) {
          doc.addPage();
          y = 20;
        }

        addYearHeading(
          doc,
          groupYear,
          y,
          `${items.length} dépôt(s) · Total : ${money(sumChecks(items))}`
        );
        y += 13;

        autoTable(doc, {
          ...tableStyles(),
          startY: y,
          head: [[
            'Payeur', 'Date réception', 'Date dépôt', 'Paiement', 'N° chèque',
            'Banque', 'Montant', 'Statut',
          ]],
          body: items.map((item) => [
            item.payer_name,
            dateLabel(item.received_at),
            dateLabel(item.deposited_at),
            paymentMethodLabel(item.payment_method),
            item.cheque_number || '—',
            item.bank_name || '—',
            money(Number(item.amount)),
            statusLabel(item.status),
          ]),
          foot: [[
            'TOTAL DES DÉPÔTS HORS ANNULATIONS', '', '', '', '',
            '', money(sumChecks(items)), '',
          ]],
          columnStyles: {
            0: { cellWidth: 43 },
            1: { cellWidth: 25 },
            2: { cellWidth: 25 },
            3: { cellWidth: 27 },
            4: { cellWidth: 20 },
            5: { cellWidth: 30 },
            6: { cellWidth: 27, halign: 'right' },
            7: { cellWidth: 25 },
          },
        });

        y = (doc as any).lastAutoTable.finalY + 10;
      });

      addFooter(doc);
      doc.save(downloadName('depots'));
    } catch (err) {
      console.error(err);
      setError('La création du PDF des dépôts a échoué.');
    } finally {
      setGenerating('');
    }
  }

  function exportMonthlyReport() {
    setGenerating('monthly');
    setError('');

    try {
      const doc = createPdf('Bilan de trésorerie', periodLabel);
      let y = 49;

      const receivedGroups = groupByYear(receivedChecks, 'received_at');
      const depositedGroups = groupByYear(depositedChecks, 'deposited_at');
      const encashedGroups = groupByYear(encashedChecks, 'encashed_at');
      const allGroupYears = [...new Set([
        ...receivedGroups.map(([key]) => key),
        ...depositedGroups.map(([key]) => key),
        ...encashedGroups.map(([key]) => key),
      ])].sort().reverse();

      if (allGroupYears.length === 0) {
        addEmptyMessage(doc, y + 8, 'Aucune donnée ne correspond à la période sélectionnée.');
      }

      allGroupYears.forEach((groupYear) => {
        if (y > 160) {
          doc.addPage();
          y = 20;
        }

        const received = receivedGroups.find(([key]) => key === groupYear)?.[1] || [];
        const deposited = depositedGroups.find(([key]) => key === groupYear)?.[1] || [];
        const encashed = encashedGroups.find(([key]) => key === groupYear)?.[1] || [];

        addYearHeading(doc, groupYear, y, 'Synthèse annuelle de la période sélectionnée');
        y += 13;

        autoTable(doc, {
          ...tableStyles(),
          startY: y,
          head: [['Indicateur', 'Nombre', 'Montant']],
          body: [
            ['Règlements reçus', String(received.filter((item) => item.status !== 'annule').length), money(sumChecks(received))],
            ['Chèques déposés', String(deposited.filter((item) => item.status !== 'annule').length), money(sumChecks(deposited))],
            ['Chèques encaissés', String(encashed.length), money(encashed.reduce((sum, item) => sum + Number(item.amount || 0), 0))],
          ],
          columnStyles: {
            0: { cellWidth: 100 },
            1: { cellWidth: 35, halign: 'center' },
            2: { cellWidth: 45, halign: 'right' },
          },
        });

        y = (doc as any).lastAutoTable.finalY + 7;

        const categoryTotals = new Map<string, number>();
        received
          .filter((item) => item.status !== 'annule')
          .forEach((item) => {
            categoryTotals.set(
              item.category,
              (categoryTotals.get(item.category) || 0) + Number(item.amount || 0)
            );
          });

        autoTable(doc, {
          ...tableStyles(),
          startY: y,
          head: [['Répartition des règlements reçus par catégorie', 'Montant']],
          body: [...categoryTotals.entries()].map(([name, amount]) => [
            name,
            money(amount),
          ]),
          foot: [['TOTAL', money(sumChecks(received))]],
          columnStyles: {
            0: { cellWidth: 100 },
            1: { cellWidth: 45, halign: 'right' },
          },
        });

        y = (doc as any).lastAutoTable.finalY + 7;

        const paymentTotals = new Map<string, { count: number; amount: number }>();
        received.filter((item) => item.status !== 'annule').forEach((item) => {
          const label = paymentMethodLabel(item.payment_method);
          const current = paymentTotals.get(label) || { count: 0, amount: 0 };
          current.count += 1;
          current.amount += Number(item.amount || 0);
          paymentTotals.set(label, current);
        });

        autoTable(doc, {
          ...tableStyles(),
          startY: y,
          head: [['Répartition par moyen de paiement', 'Nombre', 'Montant']],
          body: [...paymentTotals.entries()].map(([label, value]) => [
            label, String(value.count), money(value.amount),
          ]),
          foot: [['TOTAL', String([...paymentTotals.values()].reduce((sum, item) => sum + item.count, 0)), money([...paymentTotals.values()].reduce((sum, item) => sum + item.amount, 0))]],
          columnStyles: {
            0: { cellWidth: 85 },
            1: { cellWidth: 30, halign: 'center' },
            2: { cellWidth: 45, halign: 'right' },
          },
        });

        y = (doc as any).lastAutoTable.finalY + 12;
      });

      // Note explicative en fin de document.
      if (y > 180) {
        doc.addPage();
        y = 22;
      }
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(8);
      doc.setTextColor(...MUTED);
      doc.text(
        'Les montants sont calculés à partir des dates de réception, de dépôt et d’encaissement enregistrées. Les règlements annulés sont exclus des totaux.',
        14,
        y,
        { maxWidth: 265 }
      );

      addFooter(doc);
      doc.save(downloadName('bilan-tresorerie'));
    } catch (err) {
      console.error(err);
      setError('La création du bilan PDF a échoué.');
    } finally {
      setGenerating('');
    }
  }

  const cards = [
    {
      id: 'register',
      title: 'Registre des règlements',
      description: 'Toutes les saisies avec les informations des payeurs, les dates, les montants et les statuts.',
      icon: ReceiptText,
      count: receivedChecks.length,
      total: receivedTotal,
      action: exportRegister,
      button: 'Télécharger le registre',
    },
    {
      id: 'deposits',
      title: 'Récapitulatif des dépôts',
      description: 'Les chèques déposés à la banque, avec leur date de dépôt et leur état d’encaissement.',
      icon: Landmark,
      count: depositedChecks.length,
      total: depositedTotal,
      action: exportDeposits,
      button: 'Télécharger les dépôts',
    },
    {
      id: 'monthly',
      title: 'Bilan de trésorerie',
      description: 'Une synthèse des règlements reçus, des dépôts effectués et des chèques encaissés.',
      icon: FileText,
      count: receivedChecks.length,
      total: receivedTotal,
      action: exportMonthlyReport,
      button: 'Télécharger le bilan',
    },
  ];

  return (
    <div className="min-h-screen bg-[#f6f7f9] px-4 py-7 text-[#171717] md:px-9 md:py-9">
      <div className="mx-auto max-w-[1200px]">
        <div className="mb-8">
          <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-500">
            <FileText size={14} /> Documents et comptabilité
          </div>
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Exports PDF</h1>
          <p className="mt-2 text-sm text-gray-500">
            Génère et conserve les documents de trésorerie de l’association.
          </p>
        </div>

        {error && (
          <div className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <section className="mb-7 rounded-2xl border border-gray-200 bg-white p-5 md:p-6">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="font-semibold">Période à exporter</h2>
              <p className="mt-1 text-xs text-gray-500">
                Tu peux choisir une année, un mois seul pour comparer plusieurs années, ou une période complète.
              </p>
            </div>
            <CalendarDays className="text-gray-400" size={21} />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label>
              <span className="mb-2 block text-xs font-semibold text-gray-500">Année</span>
              <select
                value={year}
                onChange={(e) => setYear(e.target.value)}
                className="h-12 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 text-sm outline-none focus:border-red-500"
              >
                <option value="Toutes les années">Toutes les années</option>
                {years.map((item) => (
                  <option key={item} value={item}>{item}</option>
                ))}
              </select>
            </label>

            <label>
              <span className="mb-2 block text-xs font-semibold text-gray-500">Mois</span>
              <select
                value={month}
                onChange={(e) => setMonth(e.target.value)}
                className="h-12 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 text-sm outline-none focus:border-red-500"
              >
                <option value="Tous les mois">Tous les mois</option>
                {months.slice(1).map((item, index) => (
                  <option key={item} value={String(index + 1).padStart(2, '0')}>
                    {item}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {year === 'Toutes les années' && month !== 'Tous les mois' && (
            <div className="mt-4 flex items-start gap-2 rounded-xl border border-red-100 bg-red-50 px-3 py-3 text-xs leading-relaxed text-red-800">
              <CalendarDays size={16} className="mt-0.5 shrink-0" />
              <p>
                Tous les mois de {monthName(month)} seront regroupés dans les résultats,
                avec une séparation distincte pour chaque année.
              </p>
            </div>
          )}
        </section>

        <section className="mb-7 rounded-2xl border border-gray-200 bg-white p-5 md:p-6">
          <label className="block">
            <span className="block text-sm font-semibold text-gray-800">Nom des fichiers PDF</span>
            <span className="mt-1 block text-xs text-gray-500">Ce nom sera repris pour les trois documents. Le type de document et la période seront ajoutés automatiquement.</span>
            <input
              type="text"
              value={fileName}
              onChange={(e) => setFileName(e.target.value)}
              maxLength={100}
              placeholder="Ex. Nord-Evasion-2026"
              className="mt-3 h-12 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 text-sm outline-none focus:border-red-500"
            />
            <span className="mt-2 block text-xs text-gray-400">Exemple : {safeFileBase(fileName)}-registre-{year}-{month}.pdf</span>
          </label>
          <p className="mt-3 text-xs leading-relaxed text-gray-500">
            Le navigateur gère le dossier de téléchargement. Pour choisir le dossier à chaque export, active « Demander où enregistrer chaque fichier » dans les paramètres de téléchargement de ton navigateur.
          </p>
        </section>

        {loading ? (
          <div className="flex items-center justify-center gap-3 rounded-2xl border border-gray-200 bg-white py-16 text-sm text-gray-500">
            <Loader2 className="animate-spin" size={20} /> Chargement des données...
          </div>
        ) : (
          <>
            <div className="mb-5 flex items-center justify-between">
              <div>
                <h2 className="font-semibold">Documents disponibles</h2>
                <p className="mt-1 text-xs text-gray-500">Période : {periodLabel}</p>
              </div>
              <button
                onClick={loadChecks}
                className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-50"
              >
                <RefreshCw size={14} /> Actualiser
              </button>
            </div>

            <div className="grid gap-5 lg:grid-cols-3">
              {cards.map((card) => {
                const Icon = card.icon;
                const isGenerating = generating === card.id;

                return (
                  <article
                    key={card.id}
                    className="flex flex-col rounded-2xl border border-gray-200 bg-white p-5 shadow-sm"
                  >
                    <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-xl bg-red-50 text-red-700">
                      <Icon size={23} />
                    </div>
                    <h3 className="text-base font-bold">{card.title}</h3>
                    <p className="mt-2 min-h-[60px] text-sm leading-relaxed text-gray-500">
                      {card.description}
                    </p>

                    <div className="my-5 rounded-xl bg-gray-50 p-4">
                      <p className="text-xs text-gray-500">Nombre de règlements</p>
                      <p className="mt-1 text-xl font-bold tabular-nums">{card.count}</p>
                      <div className="mt-3 border-t border-gray-200 pt-3">
                        <p className="text-xs text-gray-500">Montant total</p>
                        <p className="mt-1 text-lg font-bold tabular-nums">{money(card.total)}</p>
                      </div>
                    </div>

                    <button
                      onClick={card.action}
                      disabled={!!generating}
                      className="mt-auto flex h-12 items-center justify-center gap-2 rounded-xl bg-[#bd2330] px-4 text-sm font-semibold text-white transition hover:bg-[#a51d29] disabled:opacity-50"
                    >
                      {isGenerating ? (
                        <><Loader2 size={17} className="animate-spin" /> Génération...</>
                      ) : (
                        <><Download size={17} /> {card.button}</>
                      )}
                    </button>
                  </article>
                );
              })}
            </div>
          </>
        )}

        <div className="mt-7 flex items-start gap-3 rounded-xl border border-gray-200 bg-white p-4 text-sm text-gray-600">
          <Printer size={19} className="mt-0.5 shrink-0 text-gray-500" />
          <p>
            Les PDF sont générés directement depuis les données enregistrées. Chaque année est
            identifiée par un bandeau rouge, avec ses propres lignes et ses sous-totaux. Tu peux
            ensuite les ouvrir, les imprimer ou les archiver sur ton ordinateur.
          </p>
        </div>
      </div>
    </div>
  );
}
