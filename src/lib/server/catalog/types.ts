/**
 * Public interface of the Catalog module: the one test seam.
 * Types only. Domain names follow CONTEXT.md. Prices are integer euro cents.
 */

export type Desire = 1 | 2 | 3;
export type AcquisitionKind = 'purchase' | 'gift';

// --- Reads: shared shapes ----------------------------------------------------

export interface Store {
	id: number;
	name: string;
}

export interface Artist {
	id: number;
	name: string;
}

/** What a Cover tile needs. `coverKey` is null when no Cover was found. */
export interface AlbumSummary {
	id: number;
	artist: string;
	title: string;
	releaseYear: number | null;
	coverKey: string | null;
	/** The Owner picked this Cover. */
	coverChosen: boolean;
	/** Changes whenever the Cover image changes. */
	coverVersion: number;
}

/** A candidate image for the Cover of an Album. */
export interface CoverCandidate {
	/** MusicBrainz id of the release or release group, or the Discogs image URL. */
	id: string;
	source: 'release' | 'release-group' | 'discogs';
	/** Preview image. */
	imageUrl: string;
	/** Only for release-group search hits. */
	artist?: string;
	title?: string;
	year?: number | null;
}

export interface UploadCoverInput {
	albumId: number;
	body: ArrayBuffer;
	contentType: string;
}

export interface PickCoverInput {
	albumId: number;
	candidateId: string;
	source: CoverCandidate['source'];
}

export type Acquisition =
	| { kind: 'purchase'; date: string; store: Store; priceCents: number }
	| { kind: 'gift'; date: string; giver: string | null };

export interface RecordView {
	id: number;
	album: AlbumSummary;
	variant: string | null;
	acquisition: Acquisition;
}

export interface PriceQuote {
	store: Store;
	priceCents: number;
}

export interface WishlistItemView {
	id: number;
	album: AlbumSummary;
	variant: string | null;
	desire: Desire;
	priceQuotes: PriceQuote[];
}

export interface CoverImage {
	body: ReadableStream;
	contentType: string;
}

// --- Lists -------------------------------------------------------------------

export type SortKey = 'artist' | 'album' | 'year';
export type RecordSortKey = SortKey | 'acquired';
/** `desire`: most wanted first, then Artist and Album. */
export type WishlistSortKey = SortKey | 'desire';

export interface ListFilters {
	/** One search over Artist and Album. */
	search?: string;
	/** Exact Artist name. */
	artist?: string;
}

export interface ListRecordsInput extends ListFilters {
	sort?: RecordSortKey;
}

export interface ListWishlistInput extends ListFilters {
	/** Several at once. Empty or missing = all. */
	desires?: Desire[];
	sort?: WishlistSortKey;
}

export interface CollectionTotals {
	recordCount: number;
	/** Sum of Purchase prices, in cents. */
	totalSpentCents: number;
}

export interface ListRecordsResult {
	records: RecordView[];
	totals: CollectionTotals;
}

export interface ListWishlistResult {
	items: WishlistItemView[];
	count: number;
}

// --- Records -----------------------------------------------------------------

export type AcquisitionInput =
	| { kind: 'purchase'; date: string; storeId: number; priceCents: number }
	| { kind: 'gift'; date: string; giver?: string | null };

export interface AddRecordInput {
	artist: string;
	album: string;
	variant?: string | null;
	acquisition: AcquisitionInput;
}

export interface EditRecordInput {
	id: number;
	artist: string;
	album: string;
	variant?: string | null;
	acquisition: AcquisitionInput;
}

// --- Wishlist ----------------------------------------------------------------

export interface PriceQuoteInput {
	storeId: number;
	priceCents: number;
}

export interface AddWishlistItemInput {
	artist: string;
	album: string;
	variant?: string | null;
	desire: Desire;
	priceQuotes?: PriceQuoteInput[];
	/** Set to true after the "Already owned" notice. */
	addAnyway?: boolean;
}

export type AddWishlistItemResult =
	{ status: 'added'; item: WishlistItemView } | { status: 'already-owned'; records: RecordView[] };

export interface GotItInput {
	wishlistItemId: number;
	acquisition: AcquisitionInput;
}

// --- Stores and Artists ------------------------------------------------------

export interface AddStoreInput {
	name: string;
}

// --- Owner login -------------------------------------------------------------

export type LoginResult = { ok: true; token: string } | { ok: false; error: 'wrong-password' };

// --- Import (once) -----------------------------------------------------------

/** Collection row from the sheet, already cleaned (Artiste, Album, Date, Acheté sur, Prix, Variant). */
export interface ImportCollectionRow {
	artist: string;
	album: string;
	variant?: string | null;
	/** ISO date. */
	date: string;
	/** "Cadeau" in the sheet becomes `{ kind: 'gift' }`. */
	acquisition:
		| { kind: 'gift'; giver?: string | null }
		| { kind: 'purchase'; store: string; priceCents: number };
}

/** Wishlist row from the sheet, already cleaned. Bold = Desire 3, normal = Desire 2. */
export interface ImportWishlistRow {
	artist: string;
	album: string;
	variant?: string | null;
	desire: Desire;
	priceQuotes: { store: string; priceCents: number }[];
}

export interface ImportRowsInput {
	collection: ImportCollectionRow[];
	wishlist: ImportWishlistRow[];
}

export interface ImportRowsResult {
	recordsImported: number;
	wishlistItemsImported: number;
}

/** Progress of the Album lookup (MusicBrainz, then Cover Art Archive into R2). */
export interface ImportProgress {
	total: number;
	done: number;
	/** Rerun only: the last Album id looked up. Pass it back as `after` for the next batch. */
	after?: number;
}

export interface LookupBatchInput {
	/** Albums to look up in this request. Keep small: subrequest limit and one MusicBrainz request per second. */
	size: number;
	/** Look up every Album again, not only the ones not looked up yet. Keeps Owner-chosen Covers. */
	rerun?: boolean;
	/** Also overwrite Owner-chosen Covers. Only valid with `rerun`. */
	replace?: boolean;
	/** Rerun only: continue after this Album id (the `after` of the previous batch). */
	after?: number;
}

export interface UnmatchedAlbum {
	albumId: number;
	artist: string;
	title: string;
}

export interface SaveYearsInput {
	years: { albumId: number; releaseYear: number }[];
}

// --- Cover quality check (Owner) ---------------------------------------------

export interface CoverCheckProgress {
	/** Albums whose Cover was not checked yet, or changed since it was checked. */
	pending: number;
	/** Checked Covers that fail, with the reason. */
	failing: number;
}

export interface FailingCover {
	albumId: number;
	artist: string;
	title: string;
	reason: string;
}

// --- Catalog -----------------------------------------------------------------

/**
 * Every rule and every D1 and R2 access lives behind this interface.
 * Write operations take the Owner token and fail with `UnauthorizedError` if it is invalid.
 */
export interface Catalog {
	// Reads (Viewer and Owner)
	listRecords(input?: ListRecordsInput): Promise<ListRecordsResult>;
	listWishlist(input?: ListWishlistInput): Promise<ListWishlistResult>;
	listStores(): Promise<Store[]>;
	listArtists(): Promise<Artist[]>;
	/** The Cover image of an Album, or null when it has none. */
	getCover(albumId: number): Promise<CoverImage | null>;

	// Owner login
	login(password: string): Promise<LoginResult>;
	verifyToken(token: string): Promise<boolean>;

	// Cover (Owner)
	/** Candidate images for the Cover of an Album: loaded on request. */
	listCoverCandidates(token: string, albumId: number): Promise<CoverCandidate[]>;
	/** Candidate images for text the Owner typed (release-group search). */
	searchCoverCandidates(token: string, query: string): Promise<CoverCandidate[]>;
	/** Copies the picked image over the Cover of the Album and marks it Owner-chosen. */
	pickCover(token: string, input: PickCoverInput): Promise<void>;
	/** Uses an uploaded JPEG, PNG or WebP image (under 2 MB) as the Cover of the Album. */
	uploadCover(token: string, input: UploadCoverInput): Promise<void>;
	/** Fetches an image from an http(s) address (same checks as an upload) and uses it as the Cover. */
	uploadCoverFromUrl(token: string, input: { albumId: number; url: string }): Promise<void>;

	// Cover quality (Owner)
	/** Checks the next `size` unchecked Covers (file size and pixel size from the image header). */
	checkCovers(token: string, input: { size: number }): Promise<CoverCheckProgress>;
	coverCheckProgress(token: string): Promise<CoverCheckProgress>;
	/** Albums whose current Cover failed its check. */
	listFailingCovers(token: string): Promise<FailingCover[]>;

	// Records (Owner)
	addRecord(token: string, input: AddRecordInput): Promise<RecordView>;
	editRecord(token: string, input: EditRecordInput): Promise<RecordView>;
	deleteRecord(token: string, id: number): Promise<void>;

	// Stores (Owner)
	addStore(token: string, input: AddStoreInput): Promise<Store>;

	// Wishlist (Owner)
	addWishlistItem(token: string, input: AddWishlistItemInput): Promise<AddWishlistItemResult>;
	gotIt(token: string, input: GotItInput): Promise<RecordView>;
	drop(token: string, wishlistItemId: number): Promise<void>;
	setDesire(token: string, wishlistItemIds: number[], desire: Desire): Promise<void>;

	// Import (Owner, once)
	importRows(token: string, input: ImportRowsInput): Promise<ImportRowsResult>;
	/** Looks up the next batch of Albums: those not looked up yet, or with `rerun` every Album after `after`. */
	lookupNext(token: string, input: LookupBatchInput): Promise<ImportProgress>;
	importProgress(token: string): Promise<ImportProgress>;
	listUnmatchedAlbums(token: string): Promise<UnmatchedAlbum[]>;
	saveYears(token: string, input: SaveYearsInput): Promise<void>;
}

/** Thrown by every Owner-only operation when the token is missing or invalid. */
export interface UnauthorizedError extends Error {
	name: 'UnauthorizedError';
}
