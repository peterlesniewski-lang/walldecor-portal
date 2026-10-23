import Image from 'next/image';
import { cx } from './cx';

/**
 * Logo WallDecor. Znak zostaje oryginalny: nie kolorujemy go, nie przerysowujemy, nie zastępujemy
 * napisem w Fraunces ani w żadnym innym foncie.
 *
 *   <Logo />                              // wersja ciemna na jasnym tle, wysokość 40 px
 *   <Logo height={32} />                  // pasek mobilny
 *   <Logo variant="light" />              // biała wersja, TYLKO na ciemnym tle (public/walldecor-logo.jpg)
 *
 * variant: 'dark' (public/walldecor-logo-dark.png, 1016x1026, przezroczyste tło) | 'light' (walldecor-logo.jpg, 1000x1010)
 * height: wysokość w px (domyślnie 40); szerokość wynika z proporcji pliku.
 */
export const LOGO_SOURCES = {
    dark: { src: '/walldecor-logo-dark.png', width: 1016, height: 1026 },
    light: { src: '/walldecor-logo.jpg', width: 1000, height: 1010 },
} as const;

interface LogoProps {
    variant?: 'dark' | 'light';
    height?: number;
    priority?: boolean;
    className?: string;
}

export function Logo({ variant = 'dark', height = 40, priority = false, className }: LogoProps) {
    const source = LOGO_SOURCES[variant];
    const width = Math.round((height * source.width) / source.height);
    return (
        <Image
            src={source.src}
            alt="WallDecor"
            width={width}
            height={height}
            priority={priority}
            className={cx('block shrink-0 object-contain', className)}
            style={{ height, width }}
        />
    );
}

export default Logo;
