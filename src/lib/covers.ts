import type { AlbumSummary } from '#lib/server/catalog/types';

/** An album as the pages see it: the R2 key is replaced by a URL of the `/covers` route. */
export type PageAlbum = Omit<AlbumSummary, 'coverKey' | 'coverVersion' | 'coverChosen'> & {
	coverUrl: string | null;
};

export type WithCoverUrl<T extends { album: AlbumSummary }> = Omit<T, 'album'> & {
	album: PageAlbum;
};

export function withCoverUrls<T extends { album: AlbumSummary }>(views: T[]): WithCoverUrl<T>[] {
	return views.map((view) => {
		const { coverKey, coverVersion, ...rest } = view.album;
		const album: Omit<AlbumSummary, 'coverKey' | 'coverVersion' | 'coverChosen'> & {
			coverChosen?: boolean;
		} = rest;
		delete album.coverChosen;
		const coverUrl = coverKey ? `/covers/${album.id}?v=${coverVersion}` : null;
		return { ...view, album: { ...album, coverUrl } };
	});
}
