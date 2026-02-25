import Link from 'next/link';
import { ArrowLeft, FileText } from 'lucide-react';

export const metadata = {
    title: 'Regulamin Programu Partnerskiego | WallDecor',
    description: 'Regulamin Programu Partnerskiego WallDecor dla Architektów i Projektantów Wnętrz',
};

const COMPANY_NAME = 'WallDecor Sp. z o.o.';
const COMPANY_ADDRESS = 'ul. Jagiellońska 52/90a, 03-463 Warszawa';
const COMPANY_NIP = '1133114602';
const COMPANY_KRS = '0001067815';
const EFFECTIVE_DATE = '1 stycznia 2026 r.';

function Section({ number, title, children }: { number: string; title: string; children: React.ReactNode }) {
    return (
        <section className="space-y-4">
            <h2 className="text-lg font-black text-stone-900 flex items-center gap-3">
                <span className="w-9 h-9 rounded-xl bg-brand-primary/10 flex items-center justify-center text-brand-primary text-sm font-black flex-shrink-0">
                    {number}
                </span>
                {title}
            </h2>
            <div className="ml-12 space-y-3 text-sm text-stone-600 leading-relaxed">
                {children}
            </div>
        </section>
    );
}

function P({ children }: { children: React.ReactNode }) {
    return <p>{children}</p>;
}

function Ol({ children }: { children: React.ReactNode }) {
    return <ol className="list-decimal list-inside space-y-2 marker:text-stone-400 marker:font-bold">{children}</ol>;
}

function Li({ children }: { children: React.ReactNode }) {
    return <li className="pl-1">{children}</li>;
}

function Table({ rows }: { rows: [string, string, string][] }) {
    return (
        <div className="overflow-hidden rounded-2xl border border-black/5">
            <table className="w-full text-sm">
                <thead>
                    <tr className="bg-stone-50 border-b border-black/5">
                        <th className="px-5 py-3 text-left text-[10px] font-black text-stone-400 uppercase tracking-widest">Poziom</th>
                        <th className="px-5 py-3 text-left text-[10px] font-black text-stone-400 uppercase tracking-widest">Obrót skumulowany</th>
                        <th className="px-5 py-3 text-right text-[10px] font-black text-stone-400 uppercase tracking-widest">Stawka prowizji</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-black/5">
                    {rows.map(([tier, range, rate]) => (
                        <tr key={tier} className="hover:bg-stone-50/50 transition-colors">
                            <td className="px-5 py-3 font-black text-stone-900">{tier}</td>
                            <td className="px-5 py-3 text-stone-500">{range}</td>
                            <td className="px-5 py-3 text-right font-black text-brand-primary">{rate}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

export default function RegulaminPage() {
    return (
        <div className="min-h-screen bg-background">
            {/* Top bar */}
            <div className="border-b border-black/5 bg-white sticky top-0 z-10">
                <div className="max-w-3xl mx-auto px-6 py-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-7 h-7 rounded-lg gold-gradient flex items-center justify-center">
                            <div className="w-3.5 h-3.5 bg-black rounded-sm transform rotate-45" />
                        </div>
                        <span className="font-black text-stone-900 tracking-tight">
                            ANTY<span className="gold-text">GRAVITY</span>
                        </span>
                    </div>
                    <Link
                        href="/auth/signin"
                        className="flex items-center gap-2 text-xs font-bold text-stone-400 hover:text-stone-900 transition-colors"
                    >
                        <ArrowLeft size={14} />
                        Portal Partnera
                    </Link>
                </div>
            </div>

            <main className="max-w-3xl mx-auto px-6 py-16 space-y-12">

                {/* Header */}
                <div className="space-y-4">
                    <div className="flex items-center gap-3 text-brand-primary">
                        <FileText size={20} />
                        <span className="text-[10px] font-black uppercase tracking-widest">Dokument prawny</span>
                    </div>
                    <h1 className="text-4xl font-black text-stone-900 leading-tight tracking-tight">
                        Regulamin Programu<br />
                        <span className="gold-text">Partnerskiego WallDecor</span>
                    </h1>
                    <p className="text-stone-400 text-sm">
                        dla Architektów i Projektantów Wnętrz · Wersja 1.0 · obowiązuje od {EFFECTIVE_DATE}
                    </p>
                </div>

                <hr className="border-black/5" />

                {/* Sections */}
                <Section number="§1" title="Postanowienia ogólne">
                    <Ol>
                        <Li>
                            Program Partnerski WallDecor (dalej: „Program") jest prowadzony przez{' '}
                            <strong className="text-stone-900">{COMPANY_NAME}</strong> z siedzibą przy
                            {' '}{COMPANY_ADDRESS}, NIP: {COMPANY_NIP}, KRS: {COMPANY_KRS}, zwaną dalej
                            „Organizatorem".
                        </Li>
                        <Li>
                            Program skierowany jest do architektów wnętrz, projektantów oraz biur
                            projektowych prowadzących działalność gospodarczą na terenie Polski,
                            zwanych dalej „Partnerami".
                        </Li>
                        <Li>Uczestnictwo w Programie jest dobrowolne i bezpłatne.</Li>
                        <Li>
                            Przystąpienie do Programu następuje po zaakceptowaniu niniejszego
                            Regulaminu i aktywacji konta w Portalu Partnera.
                        </Li>
                    </Ol>
                </Section>

                <Section number="§2" title="Definicje">
                    <div className="space-y-3">
                        {[
                            ['Portal', 'Platforma internetowa służąca do rejestracji projektów i rozliczeń prowizji, dostępna dla Partnerów po zalogowaniu.'],
                            ['Projekt', 'Zlecenie realizowane przez Partnera, zgłoszone w Portalu i zaakceptowane przez WallDecor.'],
                            ['Wartość projektu', 'Suma wartości netto pozycji typu PRODUKT (wyposażenie, materiały). Usługi montażowe nie są wliczane do podstawy prowizji ani cashbacku.'],
                            ['Obrót skumulowany', 'Suma wartości netto wszystkich projektów o statusie ZAKOŃCZONY, naliczana od początku współpracy Partnera z WallDecor.'],
                        ].map(([term, def]) => (
                            <div key={term} className="flex gap-3">
                                <span className="font-black text-stone-900 min-w-[160px] flex-shrink-0">{term}</span>
                                <span>{def}</span>
                            </div>
                        ))}
                    </div>
                </Section>

                <Section number="§3" title="Poziomy partnerskie (Tiery)">
                    <P>
                        Poziom Partnera wyznaczany jest automatycznie na podstawie obrotu
                        skumulowanego i aktualizuje się po zakończeniu każdego projektu:
                    </P>
                    <Table rows={[
                        ['SILVER', '0 – 49 999 PLN', '7%'],
                        ['GOLD', '50 000 – 119 999 PLN', '10%'],
                        ['PLATINUM', '120 000 PLN i powyżej', '14%'],
                    ]} />
                    <P>
                        Organizator zastrzega sobie prawo do ręcznego przypisania poziomu
                        w uzasadnionych przypadkach, bez wpływu na stawki prowizji.
                    </P>
                </Section>

                <Section number="§4" title="System prowizji">
                    <Ol>
                        <Li>
                            Prowizja naliczana jest progresywnie według przedziałów obrotu
                            skumulowanego — każda złotówka nowego projektu rozliczana jest
                            według stawki obowiązującej w danym przedziale.
                        </Li>
                        <Li>
                            Przykład: Partner z obrotem 90 000 PLN realizuje projekt o wartości
                            40 000 PLN:
                            <div className="mt-2 ml-4 p-4 bg-stone-50 rounded-xl border border-black/5 space-y-1 font-mono text-xs text-stone-700">
                                <div>30 000 PLN × 10% =  3 000 PLN  <span className="text-stone-400">(do granicy PLATINUM)</span></div>
                                <div>10 000 PLN × 14% =  1 400 PLN  <span className="text-stone-400">(powyżej 120 000 PLN)</span></div>
                                <div className="pt-1 border-t border-black/5 font-black text-stone-900">Łącznie: 4 400 PLN</div>
                            </div>
                        </Li>
                        <Li>
                            Prowizja uzyskuje status <strong className="text-stone-900">ZAROBIONA</strong> po
                            zmianie statusu projektu na ZAKOŃCZONY. Do tego momentu jest oznaczona
                            jako szacunkowa (OCZEKUJĄCA).
                        </Li>
                        <Li>
                            Prowizja wypłacana jest na wniosek Partnera, po spełnieniu warunków
                            opisanych w §6.
                        </Li>
                    </Ol>
                </Section>

                <Section number="§5" title="Cashback">
                    <Ol>
                        <Li>
                            Za każdy projekt o statusie ZAKOŃCZONY Partner otrzymuje cashback
                            w wysokości <strong className="text-stone-900">2% wartości netto</strong> pozycji
                            PRODUKT, niezależnie od poziomu partnerskiego.
                        </Li>
                        <Li>
                            Środki cashback zapisywane są w Portfelu Partnera z datą ważności
                            <strong className="text-stone-900"> 12 miesięcy</strong> od dnia kredytowania.
                        </Li>
                        <Li>
                            Cashback przeznaczony jest wyłącznie na zakupy produktów WallDecor
                            i może być zrealizowany po złożeniu wniosku w Portalu.
                        </Li>
                        <Li>
                            Cashback nie podlega wypłacie w gotówce i nie jest wymienialny
                            na inne świadczenia.
                        </Li>
                        <Li>
                            Środki niewykorzystane po upływie okresu ważności przepadają
                            bez prawa do rekompensaty.
                        </Li>
                        <Li>
                            Rozliczenie cashbacku odbywa się metodą FIFO — najstarsze środki
                            są wykorzystywane w pierwszej kolejności.
                        </Li>
                    </Ol>
                </Section>

                <Section number="§6" title="Wypłaty prowizji">
                    <Ol>
                        <Li>
                            Minimalna kwota wniosku o wypłatę prowizji:{' '}
                            <strong className="text-stone-900">300 PLN</strong>.
                        </Li>
                        <Li>
                            Wniosek składany jest z poziomu Portalu (przycisk „Wypłata"
                            w panelu Partnera).
                        </Li>
                        <Li>
                            Do wniosku należy dołączyć fakturę VAT wystawioną na WallDecor
                            na kwotę zarobionej prowizji.
                        </Li>
                        <Li>
                            Organizator rozpatruje wniosek w terminie do{' '}
                            <strong className="text-stone-900">14 dni roboczych</strong> od daty złożenia
                            i dostarczenia kompletnej dokumentacji.
                        </Li>
                        <Li>
                            Wypłata następuje przelewem na rachunek bankowy wskazany przez Partnera
                            w ustawieniach Portalu.
                        </Li>
                        <Li>
                            Partnerzy będący czynnymi podatnikami VAT zobowiązani są do
                            zaznaczenia tego faktu w profilu oraz wystawienia faktury
                            z właściwą stawką VAT.
                        </Li>
                    </Ol>
                </Section>

                <Section number="§7" title="Rejestracja i statusy projektów">
                    <Ol>
                        <Li>
                            Każdy projekt należy zgłosić w Portalu przed lub w trakcie realizacji.
                            Projekty zgłoszone po zakończeniu nie będą rozpatrywane.
                        </Li>
                        <Li>
                            Projekt przechodzi przez następujące statusy:
                            <div className="mt-2 flex flex-wrap gap-2">
                                {['ZGŁOSZONY', '→', 'PRZYJĘTY', '→', 'W REALIZACJI', '→', 'ZAKOŃCZONY'].map((s, i) => (
                                    s === '→'
                                        ? <span key={i} className="text-stone-300 font-black self-center">→</span>
                                        : <span key={i} className="px-3 py-1 rounded-full bg-stone-100 text-stone-700 text-xs font-black">{s}</span>
                                ))}
                            </div>
                            <div className="mt-1 text-stone-400 text-xs">
                                lub: W REALIZACJI → NIEZREALIZOWANY (brak prowizji i cashbacku)
                            </div>
                        </Li>
                        <Li>
                            Prowizja i cashback naliczane są wyłącznie dla projektów
                            o statusie <strong className="text-stone-900">ZAKOŃCZONY</strong>.
                        </Li>
                        <Li>
                            Projekt ze statusem NIEZREALIZOWANY nie jest wliczany do obrotu
                            skumulowanego Partnera.
                        </Li>
                    </Ol>
                </Section>

                <Section number="§8" title="Ochrona danych osobowych">
                    <P>
                        Dane Partnerów przetwarzane są zgodnie z Polityką Prywatności WallDecor
                        oraz przepisami RODO (Rozporządzenie UE 2016/679). Administratorem
                        danych jest {COMPANY_NAME}, {COMPANY_ADDRESS},
                        NIP: {COMPANY_NIP}. Kontakt w sprawach danych osobowych:{' '}
                        <a href="mailto:partner@walldecor.pl" className="text-brand-primary font-bold hover:underline">
                            partner@walldecor.pl
                        </a>.
                    </P>
                </Section>

                <Section number="§9" title="Zmiany regulaminu">
                    <P>
                        Organizator zastrzega sobie prawo do zmiany Regulaminu z zachowaniem
                        14-dniowego okresu wyprzedzenia. O zmianach Partnerzy zostaną
                        poinformowani drogą mailową oraz poprzez komunikat w Portalu.
                        Dalsze korzystanie z Portalu po wejściu zmian w życie oznacza
                        ich akceptację.
                    </P>
                </Section>

                <Section number="§10" title="Postanowienia końcowe">
                    <Ol>
                        <Li>
                            W sprawach nieuregulowanych niniejszym Regulaminem stosuje się
                            przepisy Kodeksu cywilnego oraz inne właściwe przepisy prawa polskiego.
                        </Li>
                        <Li>
                            Wszelkie spory rozstrzygane będą przez sąd właściwy dla siedziby
                            Organizatora.
                        </Li>
                        <Li>Regulamin wchodzi w życie z dniem {EFFECTIVE_DATE}.</Li>
                    </Ol>
                </Section>

                <hr className="border-black/5" />

                {/* Footer */}
                <div className="flex flex-col sm:flex-row justify-between items-start gap-4 text-xs text-stone-400">
                    <div className="space-y-1">
                        <p className="font-black text-stone-500">{COMPANY_NAME}</p>
                        <p>{COMPANY_ADDRESS}</p>
                        <p>NIP: {COMPANY_NIP} · KRS: {COMPANY_KRS}</p>
                    </div>
                    <div className="space-y-1 sm:text-right">
                        <p>
                            <a href="mailto:partner@walldecor.pl" className="hover:text-stone-700 transition-colors">
                                partner@walldecor.pl
                            </a>
                        </p>
                        <p>Wersja 1.0 · {EFFECTIVE_DATE}</p>
                    </div>
                </div>
            </main>
        </div>
    );
}
