import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Logo } from '@/components/ui';

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
            <h2 className="flex items-center gap-3 font-display text-xl font-medium text-ink">
                <span className="tnum grid h-9 min-w-9 shrink-0 place-items-center rounded-sm bg-brass-soft px-2 font-sans text-sm font-semibold text-brass-ink">
                    {number}
                </span>
                {title}
            </h2>
            <div className="space-y-3 text-[15px] leading-relaxed text-ink-2 sm:ml-12">
                {children}
            </div>
        </section>
    );
}

function P({ children }: { children: React.ReactNode }) {
    return <p>{children}</p>;
}

function Ol({ children }: { children: React.ReactNode }) {
    return <ol className="list-decimal space-y-2.5 pl-5 marker:font-semibold marker:text-ink-2">{children}</ol>;
}

function Li({ children }: { children: React.ReactNode }) {
    return <li className="pl-1.5">{children}</li>;
}

function Table({ rows }: { rows: [string, string, string][] }) {
    return (
        <div className="overflow-x-auto rounded-md border border-border bg-surface shadow-hairline">
            <table className="w-full text-sm">
                <thead>
                    <tr className="border-b border-border bg-surface-2">
                        <th className="label-caps px-4 py-3 text-left sm:px-5">Poziom</th>
                        <th className="label-caps px-4 py-3 text-left sm:px-5">Obrót skumulowany</th>
                        <th className="label-caps px-4 py-3 text-right sm:px-5">Stawka prowizji</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-border">
                    {rows.map(([tier, range, rate]) => (
                        <tr key={tier}>
                            <td className="px-4 py-3 font-semibold text-ink sm:px-5">{tier}</td>
                            <td className="tnum px-4 py-3 text-ink-2 sm:px-5">{range}</td>
                            <td className="tnum px-4 py-3 text-right font-semibold text-brass-ink sm:px-5">{rate}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

export default function RegulaminPage() {
    return (
        <div className="min-h-screen bg-bg">
            {/* Top bar */}
            <div className="sticky top-0 z-10 border-b border-border bg-surface">
                <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3 sm:px-6">
                    <div className="flex items-center gap-3">
                        <Logo variant="dark" height={36} />
                        <span className="text-sm text-ink-2">Portal Architekta</span>
                    </div>
                    <Link
                        href="/auth/signin"
                        className="flex items-center gap-2 text-[13px] font-semibold text-brass-ink hover:underline"
                    >
                        <ArrowLeft size={14} aria-hidden="true" />
                        Portal Partnera
                    </Link>
                </div>
            </div>

            <main className="mx-auto max-w-3xl space-y-10 px-4 py-10 sm:space-y-12 sm:px-6 sm:py-16">

                {/* Header */}
                <div className="space-y-4">
                    <span className="label-caps">Dokument prawny</span>
                    <h1 className="font-display text-[32px] font-normal leading-tight tracking-[-0.01em] text-ink sm:text-[40px]">
                        Regulamin Programu Partnerskiego WallDecor
                    </h1>
                    <p className="text-sm text-ink-2">
                        dla Architektów i Projektantów Wnętrz · Wersja 1.1 · obowiązuje od {EFFECTIVE_DATE}
                    </p>
                </div>

                <hr className="border-border" />

                {/* Sections */}
                <Section number="§1" title="Postanowienia ogólne">
                    <Ol>
                        <Li>
                            Program Partnerski WallDecor (dalej: „Program") jest prowadzony przez{' '}
                            <strong className="font-semibold text-ink">{COMPANY_NAME}</strong> z siedzibą przy
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
                            <div key={term} className="flex flex-col gap-0.5 sm:flex-row sm:gap-3">
                                <span className="font-semibold text-ink sm:min-w-[160px] sm:shrink-0">{term}</span>
                                <span>{def}</span>
                            </div>
                        ))}
                    </div>
                </Section>

                <Section number="§3" title="Statusy partnerskie">
                    <P>
                        Status Partnera wyznaczany jest automatycznie na podstawie obrotu
                        skumulowanego i aktualizuje się po zakończeniu każdego projektu:
                    </P>
                    <Table rows={[
                        ['PARTNER', '0 – 29 999 PLN', '10%'],
                        ['PARTNER PLUS', '30 000 – 49 999 PLN', '12%'],
                        ['PARTNER PREMIUM', '50 000 PLN i powyżej', '15%'],
                    ]} />
                    <P>
                        Nowy status obowiązuje od kolejnego projektu — prowizje naliczone
                        wcześniej nie zmieniają się. Organizator zastrzega sobie prawo do
                        ręcznego przypisania statusu w uzasadnionych przypadkach.
                    </P>
                </Section>

                <Section number="§4" title="System prowizji">
                    <Ol>
                        <Li>
                            Prowizja naliczana jest od wartości netto pozycji PRODUKT projektu
                            według stawki wynikającej ze statusu partnerskiego obowiązującego
                            w chwili rozliczenia projektu.
                        </Li>
                        <Li>
                            Przykład: Partner z obrotem 35 000 PLN (status Partner Plus)
                            realizuje projekt o wartości 20 000 PLN:
                            <div className="mt-2 space-y-1 rounded-sm border border-border bg-surface-2 p-4 font-mono text-xs text-ink sm:ml-4">
                                <div>20 000 PLN × 12% = 2 400 PLN</div>
                                <div className="border-t border-border pt-1 font-medium text-ink">Po rozliczeniu obrót wynosi 55 000 PLN — kolejny projekt będzie liczony stawką 15% (Partner Premium).</div>
                            </div>
                        </Li>
                        <Li>
                            Prowizja uzyskuje status <strong className="font-semibold text-ink">ZAROBIONA</strong> po
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
                            w wysokości <strong className="font-semibold text-ink">2% wartości netto</strong> pozycji
                            PRODUKT, niezależnie od poziomu partnerskiego.
                        </Li>
                        <Li>
                            Środki cashback zapisywane są w Portfelu Partnera z datą ważności
                            <strong className="font-semibold text-ink"> 12 miesięcy</strong> od dnia kredytowania.
                        </Li>
                        <Li>
                            Cashback przeznaczony jest wyłącznie na zakupy produktów WallDecor
                            i może być zrealizowany po złożeniu wniosku w Portalu (realizacja w formie karty lub kodu rabatowego).
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
                            <strong className="font-semibold text-ink">100 PLN</strong>.
                        </Li>
                        <Li>
                            Wniosek składany jest z poziomu Portalu, w zakładce „Portfel",
                            i obejmuje pełną aktualnie dostępną kwotę prowizji.
                        </Li>
                        <Li>
                            Do wniosku należy dołączyć fakturę VAT wystawioną na WallDecor
                            na kwotę zarobionej prowizji w formie pliku PDF załączonego do wniosku.
                        </Li>
                        <Li>
                            Organizator rozpatruje wniosek w terminie do{' '}
                            <strong className="font-semibold text-ink">14 dni roboczych</strong> od daty złożenia
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
                                        ? <span key={i} className="self-center text-ink-2" aria-hidden="true">→</span>
                                        : <span key={i} className="rounded-pill border border-border bg-surface-2 px-3 py-1 text-xs font-semibold text-ink">{s}</span>
                                ))}
                            </div>
                            <div className="mt-2 text-[13px] text-ink-2">
                                Projekt może zostać oznaczony jako NIEZREALIZOWANY na każdym etapie przed zakończeniem (brak prowizji i cashbacku).
                            </div>
                        </Li>
                        <Li>
                            Prowizja i cashback naliczane są wyłącznie dla projektów
                            o statusie <strong className="font-semibold text-ink">ZAKOŃCZONY</strong>.
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
                        <a href="mailto:partner@walldecor.pl" className="font-semibold text-brass-ink hover:underline">
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

                <hr className="border-border" />

                {/* Footer */}
                <div className="flex flex-col items-start justify-between gap-4 text-[13px] text-ink-2 sm:flex-row">
                    <div className="space-y-1">
                        <p className="font-semibold text-ink">{COMPANY_NAME}</p>
                        <p>{COMPANY_ADDRESS}</p>
                        <p>NIP: {COMPANY_NIP} · KRS: {COMPANY_KRS}</p>
                    </div>
                    <div className="space-y-1 sm:text-right">
                        <p>
                            <a href="mailto:partner@walldecor.pl" className="hover:text-ink">
                                partner@walldecor.pl
                            </a>
                        </p>
                        <p>Wersja 1.1 · {EFFECTIVE_DATE}</p>
                    </div>
                </div>
            </main>
        </div>
    );
}
