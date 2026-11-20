import type { AlbumSummary } from '#lib/server/catalog/types';

/** An album as the pages see it: the R2 key is replaced by a URL of the `/covers` route. */
export type PageAlbum = Omit<AlbumSummary, 'coverKey'> & { coverUrl: string | null };

export type WithCoverUrl<T extends { album: AlbumSummary }> = Omit<T, 'album'> & {
	album: PageAlbum;
};

export function withCoverUrls<T extends { album: AlbumSummary }>(views: T[]): WithCoverUrl<T>[] {
	return views.map((view) => {
		const { coverKey, ...album } = view.album;
		return { ...view, album: { ...album, coverUrl: coverKey ? `/covers/${album.id}` : null } };
	});
}
