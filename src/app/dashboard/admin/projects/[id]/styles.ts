/** Wspólne klasy formularzy i tabel dla strony projektu (tokeny z globals.css, bez własnych kolorów). */

export const INPUT_CLASS =
    'h-10 w-full rounded-sm border border-border-strong bg-surface px-3 text-[15px] text-ink tnum placeholder:text-ink-3 focus:border-ink focus:outline-none focus:ring-[3px] focus:ring-ink/10';

/** Mały select w wierszu tabeli / linii akcji (32 px); szerokość dokłada miejsce użycia. */
export const SELECT_SM_CLASS =
    'h-8 min-w-0 rounded-sm border border-border-strong bg-surface px-2.5 text-[13px] text-ink focus:border-ink focus:outline-none focus:ring-[3px] focus:ring-ink/10';

export const LABEL_CLASS = 'mb-1.5 block text-[13px] font-semibold text-ink-2';

export const TH_CLASS = 'label-caps whitespace-nowrap px-4 py-3 text-left';

export const TD_CLASS = 'px-4 py-3.5 align-middle';

export const ROW_CLASS = 'border-t border-border transition-colors hover:bg-surface-2';
