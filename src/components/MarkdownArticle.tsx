import React from 'react';

function renderInline(text: string): React.ReactNode[] {
    const parts = text.split(/(`[^`]+`|\*\*[^*]+\*\*)/g).filter(Boolean);

    return parts.map((part, index) => {
        if (part.startsWith('`') && part.endsWith('`')) {
            return (
                <code key={index} className="rounded-sm border border-border bg-surface-2 px-1.5 py-0.5 font-mono text-[0.88em] text-ink">
                    {part.slice(1, -1)}
                </code>
            );
        }

        if (part.startsWith('**') && part.endsWith('**')) {
            return <strong key={index} className="font-semibold text-ink">{part.slice(2, -2)}</strong>;
        }

        return <React.Fragment key={index}>{part}</React.Fragment>;
    });
}

function parseTableRow(line: string) {
    return line
        .trim()
        .replace(/^\|/, '')
        .replace(/\|$/, '')
        .split('|')
        .map((cell) => cell.trim());
}

function isTableSeparator(line: string) {
    return /^\|\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?$/.test(line.trim());
}

const POLISH_MAP: Record<string, string> = { ą: 'a', ć: 'c', ę: 'e', ł: 'l', ń: 'n', ó: 'o', ś: 's', ź: 'z', ż: 'z' };

function slugify(text: string) {
    return text
        .toLowerCase()
        .replace(/[ąćęłńóśźż]/g, (ch) => POLISH_MAP[ch] ?? ch)
        .replace(/[`*]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '') || 'sekcja';
}

function stripInline(text: string) {
    return text.replace(/`([^`]+)`/g, '$1').replace(/\*\*([^*]+)\*\*/g, '$1');
}

/**
 * Artykuł w stylu redakcyjnym: nagłówki w Fraunces, spis treści z lewej (desktop) lub rozwijany (mobile),
 * tekst w kolumnie 68 znaków, tabele w kartach, kod w IBM Plex Mono.
 * `# ` renderuje się jako h2 (h1 jest w layoucie dashboardu), `## ` jako h3.
 * hideTitle: pomija pierwszy nagłówek `# `, gdy strona pokazuje tytuł dokumentu sama.
 */
export default function MarkdownArticle({ markdown, hideTitle = false }: { markdown: string; hideTitle?: boolean }) {
    const lines = markdown.split(/\r?\n/);
    const blocks: React.ReactNode[] = [];
    const toc: { id: string; label: string }[] = [];
    const usedIds = new Set<string>();
    let skippedTitle = false;
    let i = 0;

    const uniqueId = (text: string) => {
        const base = slugify(text);
        let id = base;
        let n = 2;
        while (usedIds.has(id)) id = `${base}-${n++}`;
        usedIds.add(id);
        return id;
    };

    while (i < lines.length) {
        const line = lines[i];
        const trimmed = line.trim();

        if (!trimmed) {
            i += 1;
            continue;
        }

        if (trimmed.startsWith('```')) {
            const codeLines: string[] = [];
            i += 1;
            while (i < lines.length && !lines[i].trim().startsWith('```')) {
                codeLines.push(lines[i]);
                i += 1;
            }
            i += 1;
            blocks.push(
                <pre key={blocks.length} className="max-w-[68ch] overflow-x-auto rounded-md border border-border bg-surface-2 p-4 font-mono text-[13px] leading-relaxed text-ink">
                    <code>{codeLines.join('\n')}</code>
                </pre>
            );
            continue;
        }

        if (trimmed.startsWith('# ')) {
            if (hideTitle && !skippedTitle) {
                skippedTitle = true;
            } else {
                blocks.push(
                    <h2 key={blocks.length} className="font-display text-[32px] font-normal leading-tight tracking-[-0.01em] text-ink">
                        {renderInline(trimmed.slice(2))}
                    </h2>
                );
            }
            i += 1;
            continue;
        }

        if (trimmed.startsWith('## ')) {
            const headingText = trimmed.slice(3);
            const id = uniqueId(stripInline(headingText));
            toc.push({ id, label: stripInline(headingText) });
            blocks.push(
                <h3 key={blocks.length} id={id} className="scroll-mt-6 border-t border-border pt-8 font-display text-2xl font-medium leading-snug text-ink">
                    {renderInline(headingText)}
                </h3>
            );
            i += 1;
            continue;
        }

        if (trimmed.startsWith('|') && i + 1 < lines.length && isTableSeparator(lines[i + 1])) {
            const headers = parseTableRow(trimmed);
            const rows: string[][] = [];
            i += 2;
            while (i < lines.length && lines[i].trim().startsWith('|')) {
                rows.push(parseTableRow(lines[i]));
                i += 1;
            }

            blocks.push(
                <div key={blocks.length} className="overflow-x-auto rounded-md border border-border bg-surface shadow-hairline">
                    <table className="w-full min-w-[640px] text-left text-sm">
                        <thead className="border-b border-border bg-surface-2">
                            <tr>
                                {headers.map((header, index) => (
                                    <th key={index} className="px-4 py-3 text-left text-[13px] font-semibold text-ink-2">
                                        {renderInline(header)}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                            {rows.map((row, rowIndex) => (
                                <tr key={rowIndex}>
                                    {row.map((cell, cellIndex) => (
                                        <td key={cellIndex} className="px-4 py-3 align-top text-sm leading-relaxed text-ink-2">
                                            {renderInline(cell)}
                                        </td>
                                    ))}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            );
            continue;
        }

        if (trimmed.startsWith('- ')) {
            const items: string[] = [];
            while (i < lines.length && lines[i].trim().startsWith('- ')) {
                items.push(lines[i].trim().slice(2));
                i += 1;
            }
            blocks.push(
                <ul key={blocks.length} className="max-w-[68ch] space-y-2 pl-5 text-[15px] leading-relaxed text-ink-2">
                    {items.map((item, index) => (
                        <li key={index} className="list-disc marker:text-brass-ink">
                            {renderInline(item)}
                        </li>
                    ))}
                </ul>
            );
            continue;
        }

        if (/^\d+\.\s/.test(trimmed)) {
            const items: string[] = [];
            while (i < lines.length && /^\d+\.\s/.test(lines[i].trim())) {
                items.push(lines[i].trim().replace(/^\d+\.\s/, ''));
                i += 1;
            }
            blocks.push(
                <ol key={blocks.length} className="max-w-[68ch] space-y-2 pl-5 text-[15px] leading-relaxed text-ink-2">
                    {items.map((item, index) => (
                        <li key={index} className="list-decimal marker:font-semibold marker:text-brass-ink">
                            {renderInline(item)}
                        </li>
                    ))}
                </ol>
            );
            continue;
        }

        const paragraph: string[] = [];
        while (
            i < lines.length &&
            lines[i].trim() &&
            !lines[i].trim().startsWith('#') &&
            !lines[i].trim().startsWith('- ') &&
            !/^\d+\.\s/.test(lines[i].trim()) &&
            !lines[i].trim().startsWith('|') &&
            !lines[i].trim().startsWith('```')
        ) {
            paragraph.push(lines[i].trim());
            i += 1;
        }

        blocks.push(
            <p key={blocks.length} className="max-w-[68ch] text-[15px] leading-7 text-ink-2">
                {renderInline(paragraph.join(' '))}
            </p>
        );
    }

    const article = <article className="min-w-0 space-y-5">{blocks}</article>;

    if (toc.length < 2) return article;

    const tocLinks = (
        <ol className="space-y-0.5 text-sm">
            {toc.map((item, index) => (
                <li key={item.id}>
                    <a
                        href={`#${item.id}`}
                        className="flex gap-2 rounded-sm px-2 py-1.5 text-ink-2 hover:bg-ink/5 hover:text-ink"
                    >
                        <span className="tnum w-5 shrink-0 text-ink-2">{index + 1}.</span>
                        <span>{item.label}</span>
                    </a>
                </li>
            ))}
        </ol>
    );

    return (
        <div className="grid gap-6 lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-10">
            {/* Mobile: rozwijany spis treści */}
            <details className="rounded-md border border-border bg-surface-2 px-4 py-3 lg:hidden">
                <summary className="cursor-pointer text-sm font-semibold text-ink">Spis treści</summary>
                <div className="mt-3">{tocLinks}</div>
            </details>

            {/* Desktop: spis z lewej, przyklejony */}
            <nav aria-label="Spis treści" className="hidden self-start lg:sticky lg:top-6 lg:block">
                <p className="label-caps mb-2 px-2">Spis treści</p>
                {tocLinks}
            </nav>

            {article}
        </div>
    );
}
