import type { Actions } from './$types';
import { db } from '$lib/database/db';
import {
	bookmarkSchema,
	bookmarksToTagsSchema,
	categorySchema,
	fileSchema,
	tagSchema,
	userSchema
} from '$lib/database/schema';
import { handlePBError, pb } from '$lib/pb';
import { Storage } from '$lib/storage/storage';
import { checkIfImageURL } from '$lib/utils/check-if-image-url';
import { createSlug } from '$lib/utils/create-slug';
import { prepareTags } from '$lib/utils/handle-tags-input';
import { file } from 'bun';
import { eq } from 'drizzle-orm';

import type { UserSettings } from '$lib/types/UserSettings.type';

const storeImage = async (url: string, title: string, ownerId: number) => {
	const storage = new Storage();

	if (url && checkIfImageURL(url)) {
		const arrayBuffer = await fetch(url).then((r) => r.arrayBuffer());
		const fileName = `${createSlug(title)}.${url.split('.').pop()}`;
		const imageFile = file(arrayBuffer);

		const [{ id }] = await storage.storeFile(imageFile, {
			ownerId,
			fileName
		});
		return id;
	}
};

export const actions = {
	addNewBookmark: async ({ locals, request }) => {
		const owner = locals.user?.id;

		if (!owner) {
			return {
				success: false,
				error: 'Unauthorized'
			};
		}
		const data = await request.formData();

		try {
			const url = data.get('url') as string;
			const domain = data.get('domain') as string;
			const title = data.get('title') as string;
			const description = data.get('description') as string;
			const author = data.get('author') as string;
			const contentText = data.get('content_text') as string;
			const contentHtml = data.get('content_html') as string;
			const contentType = data.get('content_type') as string;
			const contentPublishedDate = data.get('content_published_date') as string;
			const mainImageUrl = data.get('main_image_url') as string;
			const iconUrl = data.get('icon_url') as string;
			const note = data.get('note') as string;
			const importance = parseInt((data.get('importance') || '0') as string);
			const flagged = data.get('flagged') === 'on' ? new Date() : null;
			const category = JSON.parse(data.get('category') as string);
			const tags = data.get('tags') ? JSON.parse(data.get('tags') as string) : [];

			const tagIds = await prepareTags(db, tags, owner);

			const bookmarkData: typeof bookmarkSchema.$inferInsert = {
				ownerId: owner,
				url,
				author,
				categoryId: category?.value ? category.value : category,
				title,
				contentHtml,
				contentPublishedDate,
				contentText,
				contentType,
				description,
				domain,
				flagged,
				iconUrl,
				importance,
				mainImageUrl,
				note
			};

			const [bookmark] = await db.insert(bookmarkSchema).values(bookmarkData).returning();

			if (!bookmark.id) {
				return handlePBError(bookmark, pb, true);
			}

			await Promise.all(
				tagIds.map((tagId) =>
					db.insert(bookmarksToTagsSchema).values({
						bookmarkId: bookmark.id,
						tagId
					})
				)
			);

			const mainImageId = await storeImage(mainImageUrl, title, owner);
			const iconId = await storeImage(iconUrl, title, owner);

			if (mainImageId || iconId) {
				await db
					.update(bookmarkSchema)
					.set({
						mainImageId: mainImageId,
						iconId: iconId
					})
					.where(eq(bookmarkSchema.id, bookmark.id));
			}

			return {
				bookmark,
				success: true
			};
		} catch (e: any) {
			return handlePBError(e, pb, true);
		}
	},
	deleteBookmark: async ({ locals, request }) => {
		const owner = locals.user?.id;

		if (!owner) {
			return {
				success: false,
				error: 'Unauthorized'
			};
		}

		const data = await request.formData();
		const id = parseInt(data.get('id') as string, 10);

		await db.delete(bookmarkSchema).where(eq(bookmarkSchema.id, id));

		return {
			id,
			success: true
		};
	},
	updateBookmark: async ({ locals, request }) => {
		const owner = locals.user?.id;

		if (!owner) {
			return {
				success: false,
				error: 'Unauthorized'
			};
		}

		const data = await request.formData();

		const id = parseInt(data.get('id') as string, 10);
		const url = data.get('url') as string;
		const domain = data.get('domain') as string;
		const title = data.get('title') as string;
		const description = data.get('description') as string;
		const author = data.get('author') as string;
		const contentText = data.get('content_text') as string;
		const contentHtml = data.get('content_html') as string;
		const contentType = data.get('content_type') as string;
		const contentPublishedDate = data.get('content_published_date') as string;
		const mainImageUrl = data.get('main_image_url') as string;
		const iconUrl = data.get('icon_url') as string;
		const note = data.get('note') as string;
		const importance = parseInt((data.get('importance') || '0') as string);
		const flagged = data.get('flagged') === 'on' ? new Date() : null;
		const category = JSON.parse(data.get('category') as string);
		const tags = data.get('tags') ? JSON.parse(data.get('tags') as string) : [];

		const tagIds = await prepareTags(db, tags, owner);

		const bookmarkData = {
			author,
			category: category?.value ? category.value : category,
			tags: tagIds,
			contentHtml,
			contentPublishedDate,
			contentText,
			contentType,
			description,
			domain,
			flagged,
			iconUrl,
			importance,
			mainImageUrl,
			note,
			owner,
			title,
			url
		};

		const [bookmark] = await db
			.update(bookmarkSchema)
			.set(bookmarkData)
			.where(eq(bookmarkSchema.id, id))
			.returning();

		await Promise.all(
			tagIds.map((tagId) =>
				db.insert(bookmarksToTagsSchema).values({
					bookmarkId: bookmark.id,
					tagId
				})
			)
		);

		const mainImageId = await storeImage(mainImageUrl, title, owner);
		const iconId = await storeImage(iconUrl, title, owner);

		if (mainImageId || iconId) {
			await db
				.update(bookmarkSchema)
				.set({
					mainImageId: mainImageId,
					iconId: iconId
				})
				.where(eq(bookmarkSchema.id, bookmark.id));
		}

		return {
			bookmark,
			success: true
		};
	},
	updateFlagged: async ({ locals, request }) => {
		const owner = locals.user?.id;

		if (!owner) {
			return {
				success: false,
				error: 'Unauthorized'
			};
		}

		const data = await request.formData();
		const id = parseInt(data.get('id') as string, 10);
		const flagged = data.get('flagged') === 'on' ? new Date() : null;

		await db.update(bookmarkSchema).set({ flagged }).where(eq(bookmarkSchema.id, id));

		return {
			success: true
		};
	},
	updateImportance: async ({ locals, request }) => {
		const owner = locals.user?.id;

		if (!owner) {
			return {
				success: false,
				error: 'Unauthorized'
			};
		}

		const data = await request.formData();
		const id = parseInt(data.get('id') as string, 10);
		const importance = parseInt((data.get('importance') || '0') as string);

		await db.update(bookmarkSchema).set({ importance }).where(eq(bookmarkSchema.id, id));

		return {
			success: true
		};
	},

	updateRead: async ({ locals, request }) => {
		const owner = locals.user?.id;

		if (!owner) {
			return {
				success: false,
				error: 'Unauthorized'
			};
		}

		const data = await request.formData();
		const id = parseInt(data.get('id') as string, 10);
		const read = data.get('read') === 'on' ? new Date() : null;

		await db.update(bookmarkSchema).set({ read }).where(eq(bookmarkSchema.id, id));

		return {
			success: true
		};
	},

	updateIncreasedOpenedCount: async ({ locals, request }) => {
		const owner = locals.user?.id;

		if (!owner) {
			return {
				success: false,
				error: 'Unauthorized'
			};
		}

		const data = await request.formData();
		const id = parseInt(data.get('id') as string, 10);

		const [{ opened_times }] = await db
			.select({
				opened_times: bookmarkSchema.openedTimes
			})
			.from(bookmarkSchema)
			.where(eq(bookmarkSchema.id, id));

		await db.update(bookmarkSchema).set({
			openedTimes: opened_times ?? 0 + 1,
			openedLast: new Date()
		});

		return {
			success: true
		};
	},
	addNewCategory: async ({ locals, request }) => {
		const owner = locals.user?.id;

		if (!owner) {
			return {
				success: false,
				error: 'Unauthorized'
			};
		}
		const data = await request.formData();

		const name = data.get('name') as string;
		const description = data.get('description') as string;
		const icon = data.get('icon') as string;
		const color = data.get('color') as string;
		const parent = JSON.parse(data.get('parent') as string);
		const parentValue = parent?.value ? parent.value : parent;
		const archived = data.get('archived') === 'on' ? new Date() : null;
		const setPublic = data.get('public') === 'on' ? new Date() : null;

		const requestBody: categorySchema.$insertInput = {
			name,
			slug: createSlug(name),
			description,
			icon,
			color,
			parent: parentValue === 'null' ? null : parentValue,
			archived,
			public: setPublic,
			owner,
			initial: false,
			created: new Date(),
			updated: new Date()
		};

		const [{ id }] = await db.insert(categorySchema).values(requestBody).returning({
			id: categorySchema.id
		});

		return {
			id,
			success: true
		};
	},
	updateCategory: async ({ locals, request }) => {
		const owner = locals.user?.id;

		if (!owner) {
			return {
				success: false,
				error: 'Unauthorized'
			};
		}

		const data = await request.formData();

		const id = parseInt(data.get('id') as string, 10);
		const name = data.get('name') as string;
		const description = data.get('description') as string;
		const icon = data.get('icon') as string;
		const color = data.get('color') as string;
		const parent = JSON.parse(data.get('parent') as string);
		const parentValue = parent?.value ? parent.value : parent;
		const archived = data.get('archived') === 'on' ? new Date() : null;
		const setPublic = data.get('public') === 'on' ? new Date() : null;

		const requestBody: categorySchema.$insertInput = {
			name,
			slug: createSlug(name),
			description,
			icon,
			color,
			parent: parentValue === 'null' ? null : parentValue,
			archived,
			public: setPublic,
			updated: new Date()
		};

		await db.update(categorySchema).set(requestBody).where(eq(categorySchema.id, id));

		return {
			success: true
		};
	},
	deleteCategory: async ({ locals, request }) => {
		const owner = locals.user?.id;

		if (!owner) {
			return {
				success: false
			};
		}

		const data = await request.formData();
		const id = parseInt(data.get('id') as string, 10);

		await db.delete(categorySchema).where(eq(categorySchema.id, id));

		return {
			success: true
		};
	},
	changeTheme: async ({ locals, request }) => {
		const owner = locals.user?.id;

		if (!owner) {
			return {
				success: false
			};
		}

		const data = await request.formData();
		const theme = data.get('theme') as string;
		const existingSettings = await db
			.select({
				settings: userSchema.settings
			})
			.from(userSchema)
			.where(eq(userSchema.id, owner));

		try {
			await db
				.update(userSchema)
				.set({
					settings: {
						...(JSON.parse(existingSettings[0].settings as string) as UserSettings),
						theme
					}
				})
				.where(eq(userSchema.id, owner));

			return {
				success: true
			};
		} catch (e) {
			return {
				success: false
			};
		}
	}
} satisfies Actions;
