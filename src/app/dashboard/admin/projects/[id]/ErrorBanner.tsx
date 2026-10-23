import { Banner, Button } from '@/components/ui';

/** Komunikat błędu akcji z możliwością zamknięcia (zastępuje dawny FeedbackBanner). */
export function ErrorBanner({ message, onDismiss }: { message: string; onDismiss: () => void }) {
    return (
        <Banner
            tone="danger"
            title={message}
            action={
                <Button size="sm" variant="ghost" onClick={onDismiss}>
                    Zamknij
                </Button>
            }
        />
    );
}

export default ErrorBanner;
