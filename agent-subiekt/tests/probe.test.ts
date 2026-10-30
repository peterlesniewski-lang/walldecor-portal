import test from 'node:test';
import assert from 'node:assert/strict';
import { findMissingColumns } from '../src/probe.ts';
import { REQUIRED_COLUMNS } from '../src/queries.ts';

const present = (table: string, columns: string[]) => columns.map((COLUMN_NAME) => ({ TABLE_NAME: table, COLUMN_NAME }));

test('wszystkie wymagane kolumny obecne → brak braków', () => {
    const actual = Object.entries(REQUIRED_COLUMNS).flatMap(([table, columns]) => present(table, [...columns, 'inna_kolumna']));
    assert.deepEqual(findMissingColumns(REQUIRED_COLUMNS, actual), []);
});

test('brakująca kolumna → zgłoszona z podpowiedzią najbliższych nazw; brakująca tabela → zgłoszona', () => {
    const required = { adrh__Historia: ['adrh_Id', 'adrh_NazwaPelna', 'adrh_NIP'], nz__Finanse: ['nzf_Typ'] };
    const missing = findMissingColumns(required, present('adrh__Historia', ['adrh_Id', 'adrh_PelnaNazwa', 'adrh_Nip', 'adrh_Nazwa']));
    assert.deepEqual(missing.map((m) => [m.table, m.column]), [
        ['adrh__Historia', 'adrh_NazwaPelna'],
        ['nz__Finanse', null],
    ]);
    assert.ok(missing[0].suggestions.includes('adrh_Nazwa'), missing[0].suggestions.join());
    assert.deepEqual(findMissingColumns({ t: ['adrh_NIP'] }, present('t', ['adrh_Nip'])), [], 'porównanie bez wielkości liter (kolacja GT)');
});
