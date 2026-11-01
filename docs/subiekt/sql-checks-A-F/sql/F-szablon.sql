-- F. Status KSeF a paragony — SZABLON. Uzupełnij po wynikach A / A2 / A3 i zapisz jako F.sql w tym katalogu.
--    Jeśli A nie znalazło żadnej kolumny ani tabeli KSeF: nie twórz F.sql, w raporcie wpisz „brak KSeF w bazie”.
--
--    Wybierz JEDEN wariant, usuń drugi, zastąp pola <<...>> nazwami z wyników A/A3 i wartością „wysłana/przyjęta”
--    z rozkładu A2 (gdy status to numer KSeF / UPO, użyj warunku IS NOT NULL — wariant „b”).
--
--    Wynik: ile FS z 3 miesięcy jest w KSeF, ile z nich ma nabywcę bez NIP (faktury konsumenckie w KSeF?),
--    ile ma paragon w łańcuchu (anomalia wg decyzji 7a planu mostka).
SET NOCOUNT ON;

-- ===== Wariant 1: status KSeF jest kolumną w dok__Dokument (np. dok_<<KOLUMNA_KSEF>>) =====
SELECT COUNT(*) AS fs_w_ksef,
       SUM(CASE WHEN a.adrh_NIP IS NULL OR LTRIM(RTRIM(a.adrh_NIP)) = '' THEN 1 ELSE 0 END) AS bez_nip,
       SUM(CASE WHEN p.dok_Typ = 21 THEN 1 ELSE 0 END) AS z_paragonem
FROM dbo.dok__Dokument d
JOIN dbo.adrh__Historia a ON a.adrh_Id = d.dok_PlatnikAdreshId
LEFT JOIN dbo.dok__Dokument p ON p.dok_Id = d.dok_DoDokId
WHERE d.dok_Typ = 2 AND d.dok_DataWyst >= DATEADD(month, -3, GETDATE())
  AND d.<<KOLUMNA_KSEF>> = <<WARTOSC_WYSLANA>>;          -- 1a: konkretna wartość statusu
  -- AND d.<<KOLUMNA_KSEF>> IS NOT NULL;                 -- 1b: numer KSeF / UPO nadany = wysłana

-- ===== Wariant 2: status KSeF w osobnej tabeli (z A3), powiązanej z dok_Id =====
SELECT COUNT(*) AS fs_w_ksef,
       SUM(CASE WHEN a.adrh_NIP IS NULL OR LTRIM(RTRIM(a.adrh_NIP)) = '' THEN 1 ELSE 0 END) AS bez_nip,
       SUM(CASE WHEN p.dok_Typ = 21 THEN 1 ELSE 0 END) AS z_paragonem
FROM dbo.dok__Dokument d
JOIN dbo.adrh__Historia a ON a.adrh_Id = d.dok_PlatnikAdreshId
LEFT JOIN dbo.dok__Dokument p ON p.dok_Id = d.dok_DoDokId
JOIN dbo.<<TABELA_KSEF>> k ON k.<<KOLUMNA_DOK_ID>> = d.dok_Id
WHERE d.dok_Typ = 2 AND d.dok_DataWyst >= DATEADD(month, -3, GETDATE())
  AND k.<<KOLUMNA_STATUS>> = <<WARTOSC_WYSLANA>>;        -- 2a: konkretna wartość statusu
  -- AND k.<<KOLUMNA_NUMER_KSEF>> IS NOT NULL;           -- 2b: numer KSeF nadany = wysłana

-- F2 (do obu wariantów, po dopasowaniu warunku jak wyżej): rozkład statusu KSeF dla FS z 3 miesięcy
-- SELECT <<KOLUMNA_STATUS>> AS status, COUNT(*) AS ile FROM ... GROUP BY <<KOLUMNA_STATUS>> ORDER BY ile DESC;
