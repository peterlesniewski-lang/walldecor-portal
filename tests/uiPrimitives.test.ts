import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
    PROJECT_STATUS,
    COMMISSION_STATUS,
    PAYOUT_STATUS,
    CASHBACK_STATUS,
    getStatusEntry,
} from '../src/components/ui/statusMaps.ts';
import { formatPLN, formatSignedPLN, formatDate } from '../src/components/ui/format.ts';
import { resolveShellTitle } from '../src/lib/shellTitle.ts';

const TONES = ['neutral', 'accent', 'info', 'success', 'warning', 'danger'];

test('StatusPill ma polskie etykiety i tony dla statusów projektów', () => {
    assert.deepEqual(
        Object.entries(PROJECT_STATUS).map(([k, v]) => [k, v.label, v.tone]),
        [
            ['ZGŁOSZONY', 'Zgłoszony', 'neutral'],
            ['PRZYJĘTY', 'Przyjęty', 'accent'],
            ['W_REALIZACJI', 'W realizacji', 'info'],
            ['ZAKOŃCZONY', 'Zakończony', 'success'],
            ['NIEZREALIZOWANY', 'Niezrealizowany', 'danger'],
        ],
    );
});

test('StatusPill ma polskie etykiety i tony dla prowizji, wypłat i cashbacku', () => {
    assert.deepEqual(
        Object.entries(COMMISSION_STATUS).map(([k, v]) => [k, v.label, v.tone]),
        [
            ['PENDING', 'Planowana', 'warning'],
            ['EARNED', 'Zarobiona', 'accent'],
            ['IN_PAYMENT', 'W wypłacie', 'info'],
            ['PAID', 'Wypłacona', 'success'],
        ],
    );
    assert.deepEqual(
        Object.entries(PAYOUT_STATUS).map(([k, v]) => [k, v.label, v.tone]),
        [
            ['PENDING', 'Oczekuje', 'warning'],
            ['IN_PAYMENT', 'W płatności', 'info'],
            ['HOLD', 'Wstrzymana', 'warning'],
            ['APPROVED', 'Zatwierdzona', 'accent'],
            ['PAID', 'Wypłacona', 'success'],
            ['REJECTED', 'Odrzucona', 'danger'],
        ],
    );
    assert.equal(CASHBACK_STATUS.PENDING.label, 'Do decyzji');
    assert.equal(CASHBACK_STATUS.COMPLETED.label, 'Zrealizowany');
});

test('żadna etykieta statusu nie jest kodem z bazy i każdy ton jest znany', () => {
    for (const map of [PROJECT_STATUS, COMMISSION_STATUS, PAYOUT_STATUS, CASHBACK_STATUS]) {
        for (const [code, entry] of Object.entries(map)) {
            assert.notEqual(entry.label, code);
            assert.doesNotMatch(entry.label, /[A-Z]{2,}_?[A-Z]*/, `etykieta "${entry.label}" wygląda jak kod`);
            assert.ok(TONES.includes(entry.tone));
        }
    }
});

test('nieznany status nie ujawnia surowego kodu', () => {
    const entry = getStatusEntry('payout', 'COS_NOWEGO');
    assert.equal(entry.label, 'Nieznany status');
    assert.equal(entry.tone, 'neutral');
    assert.equal(getStatusEntry('project', null).label, 'Nieznany status');
});

test('formatPLN i formatDate trzymają format z design systemu', () => {
    assert.equal(formatPLN(5000).replace(/\s/g, ' '), '5 000 PLN');
    assert.equal(formatPLN('350,5').replace(/\s/g, ' '), '350,5 PLN');
    assert.equal(formatPLN(null), '—');
    assert.equal(formatDate('2026-06-10 12:00:00'), '10.06.2026');
    assert.equal(formatDate(new Date(2026, 5, 10)), '10.06.2026');
    assert.equal(formatDate('nie data'), '—');
});

test('formatSignedPLN pokazuje znak raz, także dla ujemnych kwot z bazy', () => {
    assert.equal(formatSignedPLN(240).replace(/\s/g, ' '), '+240 PLN');
    assert.equal(formatSignedPLN(-50).replace(/\s/g, ' '), '\u221250 PLN');
    assert.equal(formatSignedPLN(0).replace(/\s/g, ' '), '0 PLN');
    assert.doesNotMatch(formatSignedPLN(-50), /[−-]{2}|\+[−-]/);
    assert.equal(formatSignedPLN(null), '—');
});

test('tytuł nagłówka powłoki zależy od ścieżki i nie dubluje nagłówków stron', () => {
    assert.equal(resolveShellTitle('/dashboard/admin', true).title, 'Centrum operacyjne');
    assert.equal(resolveShellTitle('/dashboard/admin/architects', true).title, 'Architekci');
    assert.equal(resolveShellTitle('/dashboard/admin/architects/u_kamila', true).title, 'Profil partnera');
    assert.equal(resolveShellTitle('/dashboard/admin/projects/p_krupia', true).title, 'Projekt');
    assert.equal(resolveShellTitle('/dashboard/admin/settings', true).title, 'Ustawienia');
    assert.equal(resolveShellTitle('/dashboard/admin/settings/emails', true).title, 'Ustawienia');
    assert.equal(resolveShellTitle('/dashboard/admin/help', true).title, 'Pomoc');
    assert.equal(resolveShellTitle('/dashboard', false).title, 'Panel architekta');
    assert.equal(resolveShellTitle('/dashboard/projects', false).title, 'Projekty');
    assert.equal(resolveShellTitle('/dashboard/projects/p_mokotow', false).title, 'Projekt');
    assert.equal(resolveShellTitle('/dashboard/wallet', false).title, 'Portfel');
    assert.equal(resolveShellTitle('/dashboard/help', false).title, 'Pomoc');
});

test('Logo używa plików obrazów, a nie wordmarku we Fraunces', async () => {
    const source = await readFile(new URL('../src/components/ui/Logo.tsx', import.meta.url), 'utf8');
    // sprawdzamy kod bez komentarzy, bo komentarz opisuje zakaz
    const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    assert.match(code, /walldecor-logo-dark\.png/);
    assert.match(code, /walldecor-logo\.jpg/);
    assert.match(code, /<Image/);
    assert.doesNotMatch(code, /font-display|Fraunces|fontFamily/i);
});

test('layout nie ładuje fontów z Google i nie używa Intera', async () => {
    const layout = await readFile(new URL('../src/app/layout.tsx', import.meta.url), 'utf8');
    assert.doesNotMatch(layout, /next\/font\/google/);
    assert.doesNotMatch(layout, /\bInter\b/);
    assert.match(layout, /@fontsource-variable\/fraunces/);
    assert.match(layout, /@fontsource-variable\/hanken-grotesk/);
    assert.match(layout, /@fontsource\/ibm-plex-mono/);
});
