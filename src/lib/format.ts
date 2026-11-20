const euros = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' });

/** 160420 -> "1 604,20 €" */
export function formatCents(cents: number): string {
	return euros.format(cents / 100);
}

/** "2024-03-09" -> "09/03/2024" */
export function formatDate(iso: string): string {
	return new Date(iso).toLocaleDateString('fr-FR', { timeZone: 'UTC' });
}
