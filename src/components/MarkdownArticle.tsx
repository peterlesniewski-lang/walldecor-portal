import React from 'react';

function renderInline(text: string): React.ReactNode[] {
    const parts = text.split(/(`[^`]+`|\*\*[^*]+\*\*)/g).filter(Boolean);

    return parts.map((part, index) => {
        if (part.startsWith('`') && part.endsWith('`')) {
            return (
                <code key={index} className="rounded-md bg-black/5 px-1.5 py-0.5 text-[0.92em] font-bold text-stone-800">
                    {part.slice(1, -1)}
                </code>
            );
        }

        if (part.startsWith('**') && part.endsWith('**')) {
            return <strong key={index} className="font-black text-stone-900">{part.slice(2, -2)}</strong>;
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

export default function MarkdownArticle({ markdown }: { markdown: string }) {
    const lines = markdown.split(/\r?\n/);
    const blocks: React.ReactNode[] = [];
    let i = 0;

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
                <pre key={blocks.length} className="overflow-x-auto rounded-2xl border border-black/10 bg-stone-950 p-5 text-xs font-semibold leading-relaxed text-stone-100">
                    <code>{codeLines.join('\n')}</code>
                </pre>
            );
            continue;
        }

        if (trimmed.startsWith('# ')) {
            blocks.push(
                <h1 key={blocks.length} className="text-4xl font-black tracking-tight text-stone-950">
                    {renderInline(trimmed.slice(2))}
                </h1>
            );
            i += 1;
            continue;
        }

        if (trimmed.startsWith('## ')) {
            blocks.push(
                <h2 key={blocks.length} className="border-t border-black/10 pt-8 text-xl font-black tracking-tight text-stone-950">
                    {renderInline(trimmed.slice(3))}
                </h2>
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
                <div key={blocks.length} className="overflow-x-auto rounded-2xl border border-black/10 bg-white">
                    <table className="w-full min-w-[640px] text-left text-sm">
                        <thead className="bg-black/[0.03] text-[10px] font-black uppercase tracking-widest text-stone-500">
                            <tr>
                                {headers.map((header, index) => (
                                    <th key={index} className="border-b border-black/10 px-5 py-4">
                                        {renderInline(header)}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-black/5">
                            {rows.map((row, rowIndex) => (
                                <tr key={rowIndex}>
                                    {row.map((cell, cellIndex) => (
                                        <td key={cellIndex} className="px-5 py-4 align-top font-medium leading-relaxed text-stone-700">
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
                <ul key={blocks.length} className="space-y-2 pl-5 text-sm font-medium leading-relaxed text-stone-700">
                    {items.map((item, index) => (
                        <li key={index} className="list-disc marker:text-brand-primary">
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
                <ol key={blocks.length} className="space-y-2 pl-5 text-sm font-medium leading-relaxed text-stone-700">
                    {items.map((item, index) => (
                        <li key={index} className="list-decimal marker:font-black marker:text-brand-primary">
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
            <p key={blocks.length} className="text-sm font-medium leading-7 text-stone-700">
                {renderInline(paragraph.join(' '))}
            </p>
        );
    }

    return <article className="space-y-6">{blocks}</article>;
}
